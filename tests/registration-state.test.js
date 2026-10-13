// tests/registration-state.test.js
// این فایل دقیقاً «منطق تصمیم‌گیری» پشت سناریوهای الزامی سند را تست می‌کند — بدون دیتابیس/تلگرام،
// چون classifyUserState هیچ I/O ندارد (نگاه کن به handlers/registrationState.js).
const assert = require('assert');
const { classifyUserState, pickBackStepForMissingFields } = require('../handlers/registrationState');

module.exports = function run(t) {
  t('کاربر تازه (بدون زبان) → انتخاب زبان', () => {
    assert.strictEqual(classifyUserState(null).kind, 'no_language');
    assert.strictEqual(classifyUserState({ language: null }).kind, 'no_language');
  });

  t('زبان انتخاب‌شده ولی قوانین هنوز پذیرفته نشده → نمایش قوانین', () => {
    assert.strictEqual(classifyUserState({ language: 'fa', registration_step: null }).kind, 'rules');
    assert.strictEqual(classifyUserState({ language: 'en', registration_step: 'rules' }).kind, 'rules');
  });

  t('هر مرحله‌ی شناخته‌شده (شماره/نام/کدملی/کارت) درست تشخیص داده می‌شود', () => {
    for (const step of ['phone', 'name', 'national_id', 'card']) {
      const s = classifyUserState({ language: 'fa', registration_step: step });
      assert.strictEqual(s.kind, 'step');
      assert.strictEqual(s.step, step);
    }
  });

  t('کاربر وسط «بررسی» (processing) → ادامه‌ی بررسی، نه نمایش دوباره‌ی مراحل قبلی', () => {
    assert.strictEqual(classifyUserState({ language: 'tr', registration_step: 'processing' }).kind, 'processing');
  });

  t('کاربر تکمیل‌شده → مستقیم منوی اصلی (سناریوی الزامی سند)', () => {
    assert.strictEqual(classifyUserState({ language: 'fa', registration_step: 'completed' }).kind, 'completed');
  });

  t('ری‌استارت وسط ثبت‌نام: فقط از روی ستون‌های دیتابیس (بدون session حافظه‌ای) مرحله‌ی درست تشخیص داده می‌شود', () => {
    // شبیه‌سازی: کاربر در مرحله‌ی کد ملی بود، ربات ری‌استارت شد، آبجکت session حافظه‌ای از بین رفت —
    // ولی چون classifyUserState فقط از ردیف دیتابیس می‌خواند، دقیقاً همان مرحله برمی‌گردد.
    const userRowAfterRestart = { language: 'fa', registration_step: 'national_id', registration_data: { phone: '+98912', full_name: 'Ali Rezaei' } };
    const s = classifyUserState(userRowAfterRestart);
    assert.strictEqual(s.kind, 'step');
    assert.strictEqual(s.step, 'national_id');
  });

  t('زبان ذخیره‌شده‌ی نامعتبر/قدیمی → دوباره انتخاب زبان (نه خطا، نه قفل‌شدن)', () => {
    const s = classifyUserState({ language: 'de', registration_step: 'completed' });
    assert.strictEqual(s.kind, 'bad_language');
  });

  t('registration_step خراب/ناشناخته → بازگشت امن به قوانین (unknown_step)', () => {
    const s = classifyUserState({ language: 'fa', registration_step: 'totally_unexpected' });
    assert.strictEqual(s.kind, 'unknown_step');
  });

  t('نهایی‌سازی با داده‌ی ناقص، به اولین فیلد مفقود (به ترتیب واقعی مسیر) برمی‌گردد', () => {
    assert.strictEqual(pickBackStepForMissingFields(['phone', 'card']), 'phone');
    assert.strictEqual(pickBackStepForMissingFields(['full_name']), 'name');
    assert.strictEqual(pickBackStepForMissingFields(['national_id']), 'national_id');
    assert.strictEqual(pickBackStepForMissingFields(['card']), 'card');
  });
};
