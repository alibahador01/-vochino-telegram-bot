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

// sanitizeForTelegram — رفع ریشه‌ای باگ «400: Bad Request: text must be encoded in UTF-8»:
// این خطا وقتی رخ می‌ده که رشته‌ای که به تلگرام فرستاده می‌شه شامل یک surrogate یتیم باشه —
// یعنی نصفه‌ی اول یا دوم یک کاراکتر ۴بایتی (مثل ایموجی‌های خارج از BMP، مثلاً 🜲 که تو متن
// قوانین جدید استفاده شده) بدون نصفه‌ی جفتش. این می‌تونه از چند جا بیاد: یک substring/slice
// که دقیقاً وسط یک جفت surrogate بریده (نقطه‌ی مشکوک قبلی)، یا یک مقدار خراب که از دیتابیس
// برگشته (مثلاً به‌خاطر انکودینگ نادرست کانکشن/کالم)، یا حتی یک پیست عجیب از خود ادمین.
// هر منبعی که باشه، این تابع surrogate های یتیم رو بی‌صدا حذف می‌کنه (بدون جایگزین) تا رشته‌ی
// نهایی همیشه UTF-16 معتبر باشه و هیچ‌وقت انکود UTF-8 تلگرام شکست نخوره.
function sanitizeForTelegram(text) {
  if (text === undefined || text === null) return '';
  const str = String(text);
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code >= 0xD800 && code <= 0xDBFF) {
      // high surrogate — فقط وقتی معتبره که بلافاصله یک low surrogate بعدش باشه
      const next = str.charCodeAt(i + 1);
      if (next >= 0xDC00 && next <= 0xDFFF) {
        out += str[i] + str[i + 1];
        i++; // جفت کامل مصرف شد
      }
      // وگرنه یتیمه → بی‌صدا حذف می‌شه (نه خطا، نه کرش)
    } else if (code >= 0xDC00 && code <= 0xDFFF) {
      // low surrogate یتیم (بدون high surrogate قبلش) → حذف می‌شه
      continue;
    } else {
      out += str[i];
    }
  }
  return out;
}

// truncateSafe — جایگزین امن substring برای پیش‌نمایش متن‌ها: هیچ‌وقت وسط یک جفت surrogate
// (ایموجی ۴بایتی) برش نمی‌زنه. اگه نقطه‌ی maxLen دقیقاً وسط یک جفت بیفته، یک کاراکتر عقب‌تر
// می‌کشه تا جفت کامل بمونه (و بعد از این، sanitizeForTelegram هم هست که یتیم‌های احتمالی رو پاک کنه).
function truncateSafe(text, maxLen) {
  if (text === undefined || text === null) return '';
  const str = String(text);
  if (str.length <= maxLen) return str;
  let cut = maxLen;
  const code = str.charCodeAt(cut - 1);
  if (code >= 0xD800 && code <= 0xDBFF) cut -= 1; // آخرین کاراکتر نصفه‌ی اول یه جفته → یکی عقب‌تر
  return str.substring(0, cut);
}

// escapeMarkdown — رفع ریشه‌ای باگ «can't parse entities»: وقتی یه مقدار دیتابیسی/تایپ‌شده
// توسط ادمین (اسم محصول، coin_code، اسم صرافی، کد کوپن، عنوان کانال، ...) مستقیم تو یه پیام با
// parse_mode:'Markdown' بره، اگه زوج‌فرد کاراکترهای خاص مارک‌داون (_ * ` [) بهم بخوره، کل
// ارسال پیام با خطای تلگرام شکست می‌خوره — و چون بیشتر همچین ارسال‌هایی await نمی‌شدن، این
// خطا به‌جای bot.catch، مستقیم می‌رفت رو UNHANDLED REJECTION و اصلاً به ادمین نشون داده نمی‌شد
// (دکمه «بی‌صدا» می‌موند). این تابع این ۴ کاراکتر خاص رو با بک‌اسلش escape می‌کنه — و چون
// تنها نقطه‌ی مشترکیه که تقریباً همه‌ی متن‌های آزاد/دیتابیسی ازش رد می‌شن، اول sanitizeForTelegram
// رو هم روش صدا می‌زنه؛ یعنی با همین یک تغییر، همه‌ی جاهایی که از escapeMarkdown استفاده می‌کنن
// (admin.js، sell.js) خودکار در برابر باگ UTF-8 هم ایمن می‌شن.
function escapeMarkdown(text) {
  const clean = sanitizeForTelegram(text);
  return clean.replace(/([_*`[])/g, '\\$1');
}

module.exports = { fetchWithTimeout, describeError, splitMessage, escapeMarkdown, sanitizeForTelegram, truncateSafe };
