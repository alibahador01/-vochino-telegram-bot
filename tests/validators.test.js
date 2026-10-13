// tests/validators.test.js
const assert = require('assert');
const v = require('../util/validators');

module.exports = function run(t) {
  t('کد ملی معتبر و شناخته‌شده پذیرفته می‌شود (۰۰۸۴۵۷۵۹۴۸)', () => {
    const r = v.validateNationalId('0084575948');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.value, '0084575948'); // صفر ابتدایی حفظ شود
  });

  t('کد ملی با طول اشتباه رد می‌شود', () => {
    assert.strictEqual(v.validateNationalId('123456789').ok, false);
    assert.strictEqual(v.validateNationalId('123456789').code, 'length');
    assert.strictEqual(v.validateNationalId('12345678901').code, 'length');
  });

  t('کد ملی ۱۰ رقمی با رقم کنترلی نامعتبر رد می‌شود', () => {
    // ۰۰۸۴۵۷۵۹۴۸ معتبر است (تست بالا)؛ فقط رقم آخر را خراب می‌کنیم تا رقم کنترلی دیگر جور درنیاید.
    const r = v.validateNationalId('0084575949');
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.code, 'checksum');
  });

  t('کد ملی با ارقام تکراری (۱۱۱۱۱۱۱۱۱۱) رد می‌شود', () => {
    assert.strictEqual(v.validateNationalId('1111111111').ok, false);
  });

  t('ارقام فارسی/عربی در کد ملی درست نرمال می‌شوند', () => {
    const fa = v.validateNationalId('۰۰۸۴۵۷۵۹۴۸');
    const ar = v.validateNationalId('٠٠٨٤٥٧٥٩٤٨');
    assert.strictEqual(fa.ok, true);
    assert.strictEqual(fa.value, '0084575948');
    assert.strictEqual(ar.ok, true);
    assert.strictEqual(ar.value, '0084575948');
  });

  t('حروف/کاراکتر غیرمجاز در کد ملی رد می‌شود', () => {
    assert.strictEqual(v.validateNationalId('008457594A').ok, false);
  });

  t('شماره کارت معتبر (الگوریتم Luhn) پذیرفته می‌شود', () => {
    const r = v.validateCardNumber('4111111111111111');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.value, '4111111111111111');
  });

  t('شماره کارت با رقم کنترلی نامعتبر رد می‌شود', () => {
    const r = v.validateCardNumber('4111111111111112');
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.code, 'checksum');
  });

  t('شماره کارت با طول اشتباه رد می‌شود', () => {
    assert.strictEqual(v.validateCardNumber('411111111111111').code, 'length');
    assert.strictEqual(v.validateCardNumber('41111111111111111').code, 'length');
  });

  t('فاصله/خط‌تیره در شماره کارت نادیده گرفته می‌شود', () => {
    const r = v.validateCardNumber('4111 1111 1111 1111');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.value, '4111111111111111');
  });

  t('ماسک‌کردن شماره کارت فقط ۴ رقم آخر را نشان می‌دهد', () => {
    assert.strictEqual(v.maskCardNumber('6037991234567890'), '•••• •••• •••• 7890');
  });

  t('نام معتبر فارسی/انگلیسی/ترکی پذیرفته می‌شود', () => {
    assert.strictEqual(v.validateFullName('Ali Rezaei').ok, true);
    assert.strictEqual(v.validateFullName('علی رضایی').ok, true);
    assert.strictEqual(v.validateFullName('Ahmet Yılmaz').ok, true); // ı/ş/ğ/ö/ü ترکی
  });

  t('نام تک‌کلمه‌ای، خالی یا دارای رقم رد می‌شود', () => {
    assert.strictEqual(v.validateFullName('Ali').ok, false);
    assert.strictEqual(v.validateFullName('   ').ok, false);
    assert.strictEqual(v.validateFullName('').ok, false);
    assert.strictEqual(v.validateFullName('Ali123 Rezaei').ok, false);
  });

  t('شماره تلفن از مخاطب تلگرام نرمال می‌شود', () => {
    const r = v.normalizePhone('+989121234567');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.value, '+989121234567');
  });

  t('لینک کانال تلگرام (عمومی/خصوصی/یوزرنیم) درست نرمال می‌شود', () => {
    assert.strictEqual(v.normalizeTelegramLink('https://t.me/+DpU8DAaQei00YTFk'), 'https://t.me/+DpU8DAaQei00YTFk');
    assert.strictEqual(v.normalizeTelegramLink('@somechannel'), 'https://t.me/somechannel');
  });

  t('لینک غیرتلگرامی یا خالی رد می‌شود (دکمه‌ی کانال نباید ساخته شود)', () => {
    assert.strictEqual(v.normalizeTelegramLink('https://example.com/x'), null);
    assert.strictEqual(v.normalizeTelegramLink(''), null);
    assert.strictEqual(v.normalizeTelegramLink(null), null);
  });
};
