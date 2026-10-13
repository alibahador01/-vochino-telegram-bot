// handlers/registrationState.js
// منطق خالص «الان دقیقاً کجای مسیر ثبت‌نام هستیم». عمداً هیچ وابستگی‌ای به db.js/utils.js/telegraf ندارد
// (فقط i18n، که خودش هم خالص است) تا بدون نیاز به دیتابیس یا توکن تلگرام قابل تست باشد —
// نگاه کن به tests/registration-state.test.js. registration.js همین فایل را برای تصمیم‌گیری صدا می‌زند؛
// اینجا فقط «چه چیزی باید نشان داده شود» تعیین می‌شود، نه خودِ ارسال پیام.
const i18n = require('../i18n');

const KNOWN_STEPS = ['phone', 'name', 'national_id', 'card'];

// ورودی: ردیف کاربر از دیتابیس (یا هر آبجکتی با همان شکل). خروجی: توصیف خالص وضعیت.
function classifyUserState(user) {
  if (!user || !user.language) return { kind: 'no_language' };

  const lang = i18n.normalizeLang(user.language);
  if (!lang) return { kind: 'bad_language', rawLanguage: user.language };

  const step = user.registration_step;
  if (!step || step === 'rules') return { kind: 'rules', lang };
  if (step === 'processing') return { kind: 'processing', lang };
  if (step === 'completed') return { kind: 'completed', lang };
  if (KNOWN_STEPS.includes(step)) return { kind: 'step', lang, step };

  return { kind: 'unknown_step', lang, step };
}

// نگاشت فیلدهای مفقود (هنگام نهایی‌سازی) به اولین مرحله‌ای که باید دوباره از کاربر پرسیده شود.
// ترتیب اولویت دقیقاً همان ترتیب واقعی مسیر است (شماره ← نام ← کد ملی ← کارت).
function pickBackStepForMissingFields(missing) {
  if (missing.includes('phone')) return 'phone';
  if (missing.includes('full_name')) return 'name';
  if (missing.includes('national_id')) return 'national_id';
  return 'card';
}

module.exports = { KNOWN_STEPS, classifyUserState, pickBackStepForMissingFields };
