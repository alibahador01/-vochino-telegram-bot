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

module.exports = { fetchWithTimeout };
