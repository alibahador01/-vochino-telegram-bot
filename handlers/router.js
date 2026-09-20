// ai/router.js
// لایه‌ی Understanding (بخش ۲ سند، Layer A): از روی متنِ همین پیام (بدون فراخوانی اضافه‌ی
// AI — چون خودش باعث Latency و هزینه‌ی اضافه می‌شه) intent/topic/complexity/mode و
// needs* رو تعیین می‌کنه. تشخیص A💙R هم همین‌جاست چون بخشی از فهم خودِ پیامه.
const rules = require('../support/rules');

const TIER_CONFIG = {
  simple:  { maxOutputTokens: 500,  groqMaxTokens: 500,  thinkingLevel: 'minimal', timeoutMs: 15000 },
  normal:  { maxOutputTokens: 1400, groqMaxTokens: 1400, thinkingLevel: 'low',     timeoutMs: 25000 },
  complex: { maxOutputTokens: 2600, groqMaxTokens: 2600, thinkingLevel: 'medium',  timeoutMs: 35000 },
  premium: { maxOutputTokens: 3800, groqMaxTokens: 3800, thinkingLevel: 'high',    timeoutMs: 45000 }
};

const COMPLEX_KEYWORDS = [
  'کد', 'کدنویسی', 'برنامه‌نویس', 'ربات ساز', 'دیتابیس', 'api', 'معماری', 'طراحی سیستم',
  'اسکریپت', 'الگوریتم', 'مقاله', 'تحلیل کامل', 'مقایسه', 'html', 'css', 'javascript',
  'python', 'sql', 'json', 'ترجمه متن', 'متن تبلیغاتی', 'کپشن حرفه‌ای', 'وب‌سایت', 'اپلیکیشن'
];

const WEB_SEARCH_KEYWORDS = [
  'اخبار', 'امروز چند', 'قیمت دلار', 'قیمت لحظه‌ای', 'آخرین اخبار', 'جدیدترین', 'نرخ امروز',
  'الان چنده', 'قیمت الان', 'تازه‌ترین', 'رکورد جدید'
];

const CASUAL_REGEX = /^(سلام|سلامم*|درود|خوبی\??|خوبید\??|چطوری\??|چطورید\??|hi|hello|hey|ممنون|مرسی|متشکرم|خدافظ|بای|خداحافظ)\W*$/i;

const AR_TRIGGER_REGEX = /A\s*💙\s*R/i;

// A💙R صرفاً یه Trigger سمت کد برای انتخاب بالاترین Tier کیفیته، نه Authentication. عمداً
// حتی به مدل هم گفته نمی‌شه این Trigger فعال شده، تا هیچ سطحی از این مکانیزم قابل
// سوءاستفاده برای دور زدن قوانین امنیتی/کسب‌وکاری نباشه (بخش ۷ سند).
function detectPremiumTrigger(text) {
  if (!text) return { isPremium: false, cleanedText: text };
  if (AR_TRIGGER_REGEX.test(text)) {
    return { isPremium: true, cleanedText: text.replace(AR_TRIGGER_REGEX, '').trim() };
  }
  return { isPremium: false, cleanedText: text };
}

function classifyComplexity(text) {
  const clean = (text || '').trim();
  if (!clean) return 'simple';
  const lower = clean.toLowerCase();
  const wordCount = clean.split(/\s+/).filter(Boolean).length;
  const hasComplexKeyword = COMPLEX_KEYWORDS.some(k => lower.includes(k));
  if (hasComplexKeyword || wordCount > 40 || clean.length > 220) return 'complex';
  if (wordCount <= 6 && clean.length <= 40) return 'simple';
  return 'normal';
}

function isCasual(text) {
  const clean = (text || '').trim();
  return clean.length > 0 && clean.length <= 25 && CASUAL_REGEX.test(clean);
}

function needsWebSearchHeuristic(text) {
  const lower = (text || '').toLowerCase();
  return WEB_SEARCH_KEYWORDS.some(k => lower.includes(k));
}

// فرکانس تکرار روی همون موضوع رو Router نمی‌دونه (اون تو session state ذخیره‌ست)، پس
// attempts از بیرون پاس داده می‌شه؛ این تابع فقط نشونه‌های متنیِ همین پیام رو می‌بینه.
function detectFrustrationHint(text, attempts) {
  const t = text || '';
  const repetitionMarkers = /(دوباره|بازم|چندمین بار|هنوز حل نشده|بازهم|هنوزم|چرا حل نمیشه|چند بار گفتم)/i.test(t);
  const exclamationHeavy = (t.match(/!/g) || []).length >= 2;
  if ((attempts || 0) >= 3) return 'frustrated';
  if (repetitionMarkers || exclamationHeavy) return 'frustrated';
  return 'calm';
}

/**
 * route() خروجی Understanding رو برمی‌گردونه. attempts (تعداد پیگیری‌های قبلی روی همین
 * موضوع) از session state میاد و اینجا فقط برای تعیین sentiment استفاده می‌شه؛ خودِ
 * state‌گذاری (topic/forceEscalate) در support/rules.js انجام می‌شه، نه اینجا — چون اون
 * بخشِ Decision (Layer B)ه، نه Understanding (Layer A).
 */
function route(rawText, { hasImage = false, hasVoice = false, attempts = 0, topicOverride } = {}) {
  const { isPremium, cleanedText } = detectPremiumTrigger(rawText);
  // topicOverride از Layer B (support/rules.js) میاد: وقتی پیام فعلی به‌تنهایی موضوعی
  // نداره ولی یه موضوعِ باز از نوبت‌های قبلیِ همین گفتگو تو session state هست (مثلاً
  // پیام بعدی فقط «اسم‌ها یکیه»)، همون موضوع قبلی رو ادامه می‌ده تا هم Mode درست (deep)
  // انتخاب بشه هم قانون قطعی مرتبط دوباره به Prompt اضافه بشه — دقیقاً «تشخیص وضعیت
  // مکالمه»ی بخش ۱۵ سند، نه شروع دوباره از صفر.
  const topic = topicOverride !== undefined ? topicOverride : rules.detectTopic(cleanedText);
  const casual = !hasImage && !hasVoice && !topic && isCasual(cleanedText);

  const complexity = isPremium ? 'premium' : (casual ? 'simple' : classifyComplexity(cleanedText));
  const mode = (!hasImage && !hasVoice && !topic && complexity === 'simple') ? 'fast' : 'deep';

  return {
    intent: topic || (casual ? 'casual' : 'general'),
    topic,
    complexity,
    isPremium,
    cleanedText,
    mode,
    sentiment: detectFrustrationHint(cleanedText, attempts),
    needsVision: hasImage,
    needsVoiceProcessing: hasVoice,
    needsKnowledge: mode === 'deep',
    needsWebSearch: needsWebSearchHeuristic(cleanedText),
    needsUserContext: true,
    needsAdmin: false, // تصمیم نهایی ESCALATE با support/rules.js‌ه، نه Router
    confidence: topic ? 0.8 : (casual ? 0.95 : 0.6),
    tierConfig: TIER_CONFIG[complexity]
  };
}

module.exports = { route, detectPremiumTrigger, classifyComplexity, TIER_CONFIG };
