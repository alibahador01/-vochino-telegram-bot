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

module.exports = { fetchWithTimeout, describeError };
