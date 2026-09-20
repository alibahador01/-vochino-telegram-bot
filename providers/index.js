// providers/index.js
// انتخاب Provider (با کش)، Fallback در صورت شکست، و فراخوانی واقعی Gemini/Groq.
// قانون کلی: برای هر درخواست معمولی فقط یک Provider صدا زده می‌شه؛ Provider دوم فقط
// وقتی امتحان می‌شه که اولی Timeout بخوره یا خطا بده (نه هم‌زمان با اولی).
const { pool, getSetting } = require('../db');
const { callGeminiOnce } = require('./gemini');
const { callGroqOnce, transcribeVoiceGroq } = require('./groq');

const CACHE_TTL_MS = 5 * 60 * 1000; // شبکه ایمنی؛ با ویرایش از پنل، کش بلافاصله invalidate می‌شه

const cache = { providers: null, loadedAt: 0 };

function invalidateProvidersCache() { cache.providers = null; }

async function getAllProvidersCached() {
  if (cache.providers !== null && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache.providers;
  const res = await pool.query('SELECT * FROM ai_providers ORDER BY id DESC');
  cache.providers = res.rows;
  cache.loadedAt = Date.now();
  return cache.providers;
}

function providerFromRow(row) {
  if (!row) return null;
  return { id: row.id, apiKey: row.api_key, model: row.model_name, label: row.label, type: row.provider_type || 'gemini' };
}

function pickProviderByType(rows, type) {
  const ofType = rows.filter(r => r.provider_type === type);
  if (ofType.length === 0) return null;
  const active = ofType.find(r => r.is_active);
  return providerFromRow(active || ofType[0]); // rows از قبل بر اساس id DESC مرتبن
}

async function getActiveProviderCached() {
  const rows = await getAllProvidersCached();
  if (rows.length > 0) {
    const active = rows.find(r => r.is_active);
    if (active) return providerFromRow(active);
  }
  // سازگاری با نسخه قبلی: اگه هنوز از پنل جدید مدلی ثبت نشده، از کلید قدیمی استفاده کن
  const legacyKey = await getSetting('gemini_api_key', '');
  if (legacyKey) return { apiKey: legacyKey, model: 'gemini-3.7-flash', label: 'پیش‌فرض', type: 'gemini', id: null };
  return null;
}

function pickFallbackProvider(rows, excludeId, failedType) {
  const others = rows.filter(r => r.id !== excludeId);
  if (others.length === 0) return null;
  const diffType = others.find(r => r.provider_type !== failedType);
  return providerFromRow(diffType || others[0]);
}

async function findGroqKeyForAudio() {
  const rows = await getAllProvidersCached();
  const p = pickProviderByType(rows, 'groq');
  return p?.apiKey || null;
}

async function runProviderChat({ tierCfg, systemPrompt, historyMsgs, userText, imagePart }) {
  const rows = await getAllProvidersCached();

  let primary;
  let candidateRows;
  if (imagePart) {
    // برای عکس، مستقل از این‌که فعلاً کدوم مدل «فعاله»، دنبال هر مدل Gemini ثبت‌شده‌ای می‌گردیم
    // (چون Groq فعلاً عکس رو پشتیبانی نمی‌کنه)
    candidateRows = rows.filter(r => r.provider_type === 'gemini');
    primary = pickProviderByType(rows, 'gemini');
  } else {
    primary = await getActiveProviderCached();
    candidateRows = rows;
  }

  if (!primary) {
    const text = imagePart
      ? '⚠️ فعلاً برای خوندن عکس نیاز به یه مدل Gemini ثبت‌شده‌ست (نیازی نیست فعالش کنی، فقط باید ثبت شده باشه). از پنل ادمین یه مدل Gemini اضافه کن.'
      : '⚠️ هوچینو AI دستیار فعلاً تنظیم نشده. لطفاً از گزینه «ارتباط با مدیریت» استفاده کنید.';
    return { ok: false, text, providerLabel: null, usedFallback: false };
  }

  async function attempt(provider) {
    try {
      if (provider.type === 'groq') return await callGroqOnce(provider, systemPrompt, historyMsgs, userText, tierCfg, tierCfg.timeoutMs);
      return await callGeminiOnce(provider, systemPrompt, historyMsgs, userText, imagePart, tierCfg, tierCfg.timeoutMs);
    } catch (e) {
      console.log('AI provider error (' + provider.label + '):', e.name === 'AbortError' ? 'timeout' : e.message);
      return { ok: false, text: null };
    }
  }

  let result = await attempt(primary);
  let usedFallback = false;
  let finalProvider = primary;

  if (!result.ok) {
    const fallback = pickFallbackProvider(candidateRows, primary.id ?? -1, primary.type);
    if (fallback) {
      usedFallback = true;
      finalProvider = fallback;
      result = await attempt(fallback);
    }
  }

  if (!result.ok) {
    return {
      ok: false,
      text: '⚠️ در حال حاضر امکان پاسخ‌گویی نیست، کمی بعد دوباره امتحان کنید یا از گزینه ارتباط با مدیریت استفاده کنید.',
      providerLabel: finalProvider?.label,
      usedFallback
    };
  }
  return { ok: true, text: result.text, providerLabel: finalProvider.label, model: finalProvider.model, usedFallback };
}

module.exports = {
  getAllProvidersCached,
  invalidateProvidersCache,
  getActiveProviderCached,
  pickProviderByType,
  findGroqKeyForAudio,
  runProviderChat,
  transcribeVoiceGroq
};
