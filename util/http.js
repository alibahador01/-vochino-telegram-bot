// util/http.js
// یک ابزار مشترک برای همه‌ی فراخوانی‌های بیرونی (Gemini، Groq، Tavily، دانلود فایل تلگرام)
// تا هیچ fetch‌ای در کل پروژه بدون سقف زمانی نمونه.
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// describeError — برای لاگ‌کردن کامل خطا، نه فقط err.message (که بعضی وقت‌ها خالی/ناقص می‌مونه).
// خروجی: رشته‌ای شامل message + کد خطای Postgres (اگر بود) + detail + در نبود همه‌چیز، JSON خام خطا.
function describeError(err) {
  if (!err) return '(خطای نامشخص: مقدار خطا null/undefined بود)';
  const parts = [];
  if (err.message) parts.push(err.message);
  if (err.code) parts.push('کد: ' + err.code); // کد خطای Postgres مثل 22P02 برای invalid input syntax
  if (err.detail) parts.push('جزئیات: ' + err.detail);
  if (parts.length > 0) return parts.join(' | ');
  // اگر هیچ‌کدوم از فیلدهای بالا چیزی نداشت (دقیقاً همون حالتی که بعد از ':' چیزی چاپ نمی‌شد)
  try { return JSON.stringify(err); } catch (e) { return String(err); }
}

// splitMessage — تلگرام سقف ۴۰۹۶ کاراکتر برای هر پیام متنی داره؛ رد شدن از این سقف خطای
// «400: Bad Request: message is too long» می‌ده. این تابع یه متن طولانی رو، ترجیحاً سر خط‌ها
// (نه وسط یه کلمه)، به چند تکه زیر سقف می‌شکنه تا با چند sendMessage پشت‌سرهم فرستاده بشه.
function splitMessage(text, maxLen = 3500) {
  if (text.length <= maxLen) return [text];
  const chunks = [];
  let rest = text;
  while (rest.length > maxLen) {
    let cut = rest.lastIndexOf('\n', maxLen);
    if (cut <= 0) cut = maxLen; // اگه خط جدیدی تو این بازه نبود، مجبوریم وسط متن ببریم
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n+/, '');
  }
  if (rest) chunks.push(rest);
  return chunks;
}

// escapeMarkdown — رفع ریشه‌ای باگ «can't parse entities»: وقتی یه مقدار دیتابیسی/تایپ‌شده
// توسط ادمین (اسم محصول، coin_code، اسم صرافی، کد کوپن، عنوان کانال، ...) مستقیم تو یه پیام با
// parse_mode:'Markdown' بره، اگه زوج‌فرد کاراکترهای خاص مارک‌داون (_ * ` [) بهم بخوره، کل
// ارسال پیام با خطای تلگرام شکست می‌خوره — و چون بیشتر همچین ارسال‌هایی await نمی‌شدن، این
// خطا به‌جای bot.catch، مستقیم می‌رفت رو UNHANDLED REJECTION و اصلاً به ادمین نشون داده نمی‌شد
// (دکمه «بی‌صدا» می‌موند). این تابع این ۴ کاراکتر خاص رو با بک‌اسلش escape می‌کنه.
function escapeMarkdown(text) {
  if (text === undefined || text === null) return '';
  return String(text).replace(/([_*`[])/g, '\\$1');
}

module.exports = { fetchWithTimeout, describeError, splitMessage, escapeMarkdown };
