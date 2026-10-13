// i18n/index.js
// سازوکار ترجمه‌ی مرکزی ربات. همه‌ی متن‌های مسیر ثبت‌نام/منوی اصلی از locales/<lang>.js خوانده می‌شوند.
// قواعد:
//  • هیچ fallback پنهانی به فارسی وجود ندارد؛ زبان نامعتبر → خطای واضح در لاگ و نمایش انگلیسی (نه فارسی).
//  • کلید ناموجود → لاگ خطا + نمایش خودِ کلید (تا تست‌ها و لاگ آن را آشکار کنند).
//  • شناسه‌های داخلی دکمه‌ها (callback_data) هیچ‌وقت وابسته به زبان نیستند.

const fa = require('./locales/fa');
const en = require('./locales/en');
const tr = require('./locales/tr');

const LOCALES = { fa, en, tr };
const SUPPORTED_LANGS = ['fa', 'en', 'tr'];

// زبان‌هایی که چیدمان راست‌به‌چپ دارند
const RTL_LANGS = ['fa'];

function isSupportedLang(lang) {
  return SUPPORTED_LANGS.includes(lang);
}

// null اگر زبان معتبر نباشد (تا فراخوان تصمیم بگیرد؛ معمولاً نمایش انتخاب زبان)
function normalizeLang(lang) {
  return isSupportedLang(lang) ? lang : null;
}

function fillVars(template, vars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) && vars[key] !== undefined && vars[key] !== null
      ? String(vars[key])
      : m
  );
}

// برای تست‌ها: شمارنده‌ی خطاهای ترجمه
const problems = [];

function t(lang, key, vars) {
  let useLang = lang;
  if (!isSupportedLang(useLang)) {
    problems.push({ type: 'bad_lang', lang, key });
    console.error('[i18n] زبان نامعتبر:', lang, '— کلید:', key);
    useLang = 'en';
  }
  const value = LOCALES[useLang][key];
  if (typeof value !== 'string') {
    problems.push({ type: 'missing_key', lang: useLang, key });
    console.error('[i18n] کلید ترجمه یافت نشد:', useLang, key);
    return '⟦' + key + '⟧';
  }
  return fillVars(value, vars);
}

// ==================== قالب‌بندی عدد ====================
const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

function groupThousands(n, sep) {
  const negative = Number(n) < 0;
  const digits = String(Math.abs(Math.trunc(Number(n) || 0)));
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  return (negative ? '-' : '') + grouped;
}

// fa: ارقام فارسی با جداکننده‌ی «,» — مثل ۲,۰۰۰,۰۰۰ | en: 2,000,000 | tr: 2.000.000
function formatNumber(n, lang) {
  if (lang === 'fa') {
    return groupThousands(n, ',').replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
  }
  if (lang === 'tr') return groupThousands(n, '.');
  return groupThousands(n, ',');
}

// برای متن‌های فارسی که شامل شماره/عدد لاتین (مثل +98912...) هستند، جهت نمایش را ثابت نگه می‌دارد
function ltr(text) {
  return '\u2066' + text + '\u2069';
}

function directionMark(lang) {
  return RTL_LANGS.includes(lang) ? '\u200F' : '\u200E';
}

module.exports = {
  t,
  LOCALES,
  SUPPORTED_LANGS,
  RTL_LANGS,
  isSupportedLang,
  normalizeLang,
  formatNumber,
  groupThousands,
  ltr,
  directionMark,
  fillVars,
  _problems: problems
};
