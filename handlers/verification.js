// util/validators.js
// اعتبارسنجی ورودی‌های ثبت‌نام — توابع خالص (بدون دیتابیس و بدون تلگرام) تا کاملاً قابل تست باشند.
// هیچ‌کدام از این توابع مقدار حساس (کد ملی/کارت) را لاگ نمی‌کنند و در پیام خطا برنمی‌گردانند.

// ارقام فارسی (۰-۹ : U+06F0..U+06F9) و عربی-هندی (٠-٩ : U+0660..U+0669) → ASCII
function normalizeDigits(input) {
  return String(input === undefined || input === null ? '' : input)
    .replace(/[\u06F0-\u06F9]/g, (c) => String(c.charCodeAt(0) - 0x06F0))
    .replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x0660));
}

// نویسه‌های نامرئی که هنگام کپی/پیست از پیام‌رسان‌ها وارد متن می‌شوند (ZWNJ/ZWJ/علامت‌های جهت و ...)
const INVISIBLE_RE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF\u00A0]/g;

// فقط رقم‌ها را نگه می‌دارد؛ فاصله و خط‌تیره (و نویسه‌های نامرئی) مجاز و حذف می‌شوند،
// ولی هر نویسه‌ی دیگری (حرف، نقطه، ...) باعث رد شدن ورودی می‌شود (null).
function extractDigitsStrict(input) {
  const cleaned = normalizeDigits(input)
    .replace(INVISIBLE_RE, '')
    .replace(/[\s\-‐‑‒–—]/g, '');
  if (!/^\d+$/.test(cleaned)) return null;
  return cleaned;
}

// ==================== کد ملی ====================
// خروجی: { ok, code?: 'length'|'format'|'checksum', value? }
// 'length'  → رشته‌ی ارقام ۱۰ رقمی نیست (طول اشتباه یا کاراکتر غیرمجاز)
// 'checksum'→ ۱۰ رقم است ولی تکراری/رقم کنترلی نامعتبر
function validateNationalId(input) {
  const digits = extractDigitsStrict(input);
  if (digits === null || digits.length !== 10) return { ok: false, code: 'length' };
  // کدهایی مثل ۰۰۰۰۰۰۰۰۰۰ یا ۱۱۱۱۱۱۱۱۱۱ از نظر فرمول معتبرند ولی آشکارا جعلی‌اند
  if (/^(\d)\1{9}$/.test(digits)) return { ok: false, code: 'checksum' };
  const d = digits.split('').map(Number);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += d[i] * (10 - i);
  const r = sum % 11;
  const valid = (r < 2 && d[9] === r) || (r >= 2 && d[9] === 11 - r);
  if (!valid) return { ok: false, code: 'checksum' };
  return { ok: true, value: digits }; // همیشه رشته (صفر ابتدایی حفظ می‌شود)
}

// ==================== شماره کارت ====================
function luhnCheck(digits) {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

// خروجی: { ok, code?: 'length'|'checksum', value? }
function validateCardNumber(input) {
  const digits = extractDigitsStrict(input);
  if (digits === null || digits.length !== 16) return { ok: false, code: 'length' };
  if (/^(\d)\1{15}$/.test(digits)) return { ok: false, code: 'checksum' };
  if (!luhnCheck(digits)) return { ok: false, code: 'checksum' };
  return { ok: true, value: digits };
}

function maskCardNumber(card) {
  const s = String(card || '');
  if (s.length < 4) return '••••';
  return '•••• •••• •••• ' + s.slice(-4);
}

// ==================== نام و نام خانوادگی ====================
// فقط «آشکارا نامعتبر» رد می‌شود: خالی/فقط فاصله، رقم، ایموجی/نشانه‌های غیرحرفی، یک کلمه‌ی تنها.
// هر الفبای یونیکد (فارسی، لاتین، ترکی با ç ğ ı ö ş ü İ و ...) پذیرفته می‌شود؛ محدودیت «فقط فارسی» وجود ندارد.
const NAME_ALLOWED_RE = /^[\p{L}\p{M}\u200C'’.\-\s]+$/u;

function normalizeName(input) {
  return String(input === undefined || input === null ? '' : input)
    .replace(/[\u200B\u200D\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF\u00A0]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// خروجی: { ok, value? }
function validateFullName(input) {
  const value = normalizeName(input);
  if (value.length < 3 || value.length > 80) return { ok: false };
  if (!NAME_ALLOWED_RE.test(value)) return { ok: false };
  const parts = value.split(' ').filter(Boolean);
  // «نام و نام خانوادگی کامل» → حداقل دو بخش که هرکدام دست‌کم دو حرف دارد
  const meaningful = parts.filter((p) => (p.match(/[\p{L}]/gu) || []).length >= 2);
  if (meaningful.length < 2) return { ok: false };
  return { ok: true, value };
}

// ==================== شماره همراه ====================
// فقط برای قالب‌بندی شماره‌ای که خودِ تلگرام در contact می‌دهد. خروجی: { ok, value? } با قالب +<digits>
function normalizePhone(input) {
  const digits = normalizeDigits(input).replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return { ok: false };
  return { ok: true, value: '+' + digits };
}

// ==================== لینک کانال/گروه تلگرام ====================
// فقط لینک‌های واقعی تلگرام پذیرفته می‌شود؛ @username هم به لینک t.me تبدیل می‌شود. در غیر این‌صورت null.
function normalizeTelegramLink(input) {
  const raw = String(input === undefined || input === null ? '' : input).trim();
  if (!raw) return null;
  const at = raw.match(/^@([A-Za-z][A-Za-z0-9_]{3,31})$/);
  if (at) return 'https://t.me/' + at[1];
  let url;
  try {
    url = new URL(raw);
  } catch (e) {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase();
  if (host !== 't.me' && host !== 'telegram.me' && host !== 'www.t.me') return null;
  const path = url.pathname.replace(/^\/+/, '');
  if (!path) return null;
  return 'https://t.me/' + path + (url.search || '');
}

module.exports = {
  normalizeDigits,
  extractDigitsStrict,
  validateNationalId,
  luhnCheck,
  validateCardNumber,
  maskCardNumber,
  normalizeName,
  validateFullName,
  normalizePhone,
  normalizeTelegramLink
};
