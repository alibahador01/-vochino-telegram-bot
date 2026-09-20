// knowledge/retrieval.js
// این ماژول فقط «Business Knowledge» آزاد (متن‌های دلخواه ادمین در ai_support_knowledge
// و ai_support_notes) رو مدیریت می‌کنه. قوانین سخت و قطعی کسب‌وکاری (Wise/خرید/فروش) اینجا
// نیستن — اونا به‌صورت Rule قطعی در support/rules.js پیاده شدن تا هیچ‌وقت با Retrieval
// اشتباه/رقیق نشن (نگاه کن به بخش ۹ تا ۱۲ سند).
//
// Retrieval فعلی کلمه‌کلیدی سادست (بدون فراخوانی اضافه‌ی AI و بدون embedding) — برای حجم
// فعلی دانش (چند ده مورد) کافیه. ارتقا به Hybrid Retrieval واقعی (pgvector + embedding)
// نیاز به دو پیش‌نیاز داره که از بیرون این فایل تأمین می‌شن: ۱) فعال بودن extension
// `vector` روی همون دیتابیس Postgres (که از این محیط قابل تأیید نیست)، ۲) یک فراخوانی
// embedding روی هر پیام کاربر (Latency/هزینه‌ی اضافه). چون این دو مورد قابل تأیید/توجیه
// در همین مرحله نبودن، اینجا فقط عمداً طوری export شده که جایگزینی بعدی (fillContext از
// طریق embedding) بدون دست‌زدن به بقیه‌ی پروژه ممکن باشه.
const { pool } = require('../db');

const CACHE_TTL_MS = 5 * 60 * 1000;
const RETRIEVAL_MAX_ITEMS = 6;
const RETRIEVAL_MAX_CHARS = 3000;

const cache = {
  knowledge: null, knowledgeLoadedAt: 0,
  notes: null, notesLoadedAt: 0
};

function invalidateKnowledgeCache() { cache.knowledge = null; }
function invalidateNotesCache() { cache.notes = null; }

async function getKnowledgeRowsCached() {
  if (cache.knowledge !== null && Date.now() - cache.knowledgeLoadedAt < CACHE_TTL_MS) return cache.knowledge;
  const res = await pool.query('SELECT title, content FROM ai_support_knowledge WHERE active = TRUE ORDER BY id ASC');
  cache.knowledge = res.rows;
  cache.knowledgeLoadedAt = Date.now();
  return cache.knowledge;
}

async function getNoteRowsCached() {
  if (cache.notes !== null && Date.now() - cache.notesLoadedAt < CACHE_TTL_MS) return cache.notes;
  const res = await pool.query('SELECT content FROM ai_support_notes WHERE active = TRUE ORDER BY id ASC');
  cache.notes = res.rows;
  cache.notesLoadedAt = Date.now();
  return cache.notes;
}

function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2);
}

async function selectRelevantContext(userText) {
  const [knowledgeRows, noteRows] = await Promise.all([getKnowledgeRowsCached(), getNoteRowsCached()]);
  const chunks = [];
  for (const r of knowledgeRows) chunks.push({ display: `### ${r.title}\n${r.content}`, raw: r.title + ' ' + r.content });
  for (const r of noteRows) chunks.push({ display: r.content, raw: r.content });
  if (chunks.length === 0) return '';

  const qTokens = tokenize(userText);
  if (qTokens.length === 0) return '';
  const qSet = new Set(qTokens);

  const scored = chunks
    .map(c => {
      const cTokens = new Set(tokenize(c.raw));
      let hits = 0;
      for (const t of qSet) if (cTokens.has(t)) hits++;
      return { ...c, score: hits };
    })
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score);

  const picked = [];
  let total = 0;
  for (const c of scored) {
    if (picked.length >= RETRIEVAL_MAX_ITEMS) break;
    if (total + c.display.length > RETRIEVAL_MAX_CHARS) continue;
    picked.push(c.display);
    total += c.display.length;
  }
  return picked.join('\n\n');
}

module.exports = { getKnowledgeRowsCached, getNoteRowsCached, invalidateKnowledgeCache, invalidateNotesCache, selectRelevantContext };
