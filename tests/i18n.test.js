// tests/i18n.test.js
const assert = require('assert');
const i18n = require('../i18n');
const fa = require('../i18n/locales/fa');
const en = require('../i18n/locales/en');
const tr = require('../i18n/locales/tr');

module.exports = function run(t) {
  t('هیچ کلید ترجمه‌ای بین fa/en/tr جا نمانده (پوشش کامل هر سه زبان)', () => {
    const faKeys = Object.keys(fa).sort();
    const enKeys = Object.keys(en).sort();
    const trKeys = Object.keys(tr).sort();
    assert.deepStrictEqual(enKeys, faKeys, 'کلیدهای en با fa یکی نیست');
    assert.deepStrictEqual(trKeys, faKeys, 'کلیدهای tr با fa یکی نیست');
  });

  t('جایگزینی متغیر {var} در متن کار می‌کند', () => {
    const out = i18n.t('en', 'result.silver', {
      full_name: 'Ali', phone: '+98912', masked_card: '**** 1234', limit: '2,000,000'
    });
    assert.ok(out.includes('Ali'));
    assert.ok(out.includes('+98912'));
    assert.ok(!out.includes('{full_name}'));
  });

  t('کلید ناموجود، متن فارسی را به‌جای آن نشان نمی‌دهد (بدون fallback پنهان)', () => {
    const out = i18n.t('tr', 'this.key.does.not.exist');
    assert.ok(!out.includes('قوانین') && !/[\u0600-\u06FF]/.test(out), 'نباید متن فارسی برگردد');
  });

  t('زبان نامعتبر به انگلیسی برمی‌گردد، نه فارسی', () => {
    const out = i18n.t('xx', 'menu.buy');
    assert.strictEqual(out, en['menu.buy']);
    assert.notStrictEqual(out, fa['menu.buy']);
  });

  t('قالب‌بندی عدد سقف روزانه در هر زبان درست است', () => {
    assert.strictEqual(i18n.formatNumber(2000000, 'en'), '2,000,000');
    assert.strictEqual(i18n.formatNumber(2000000, 'tr'), '2.000.000');
    assert.strictEqual(i18n.formatNumber(2000000, 'fa'), '۲,۰۰۰,۰۰۰');
  });
};
