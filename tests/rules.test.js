// tests/rules.test.js
const assert = require('assert');
const { resolveRules, paginate, RULES_DEFAULTS } = require('../i18n/rules');

module.exports = function run(t) {
  t('قوانین هر سه زبان بدون override پنل، از متن پیش‌فرض خودشان خوانده می‌شود', () => {
    const fa = resolveRules('fa', undefined);
    const en = resolveRules('en', undefined);
    const tr = resolveRules('tr', undefined);
    assert.strictEqual(fa.ok, true);
    assert.strictEqual(en.ok, true);
    assert.strictEqual(tr.ok, true);
    assert.ok(fa.text.length > 100 && en.text.length > 100 && tr.text.length > 100);
  });

  t('زبان نامعتبر خطای واضح می‌دهد', () => {
    assert.strictEqual(resolveRules('xx', undefined).ok, false);
  });

  t('نبود متن قوانین یک زبان، خطای پیکربندی واقعی است (نه پیام خالی و نه fallback فارسی)', () => {
    const brokenDefaults = { fa: 'متن فارسی', en: '', tr: 'metin' };
    const res = resolveRules('en', undefined, brokenDefaults);
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.reason, 'missing');
  });

  t('override پنل مدیریت برای یک زبان، آن زبان را عوض می‌کند و به فارسی برنمی‌گردد', () => {
    const fakeGetText = (key) => (key === 'rulesText_tr' ? 'METİN ÖZEL' : undefined);
    const res = resolveRules('tr', fakeGetText);
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.text, 'METİN ÖZEL');
  });

  t('تغییر متن فارسیِ مرجع، نسخه (version) قوانین را عوض می‌کند', () => {
    const v1 = resolveRules('fa', undefined).version;
    const fakeGetText = (key, def) => (key === 'rulesText' ? def + ' ویرایش جدید' : def);
    const v2 = resolveRules('fa', fakeGetText).version;
    assert.notStrictEqual(v1, v2);
  });

  t('صفحه‌بندی متن طولانی چیزی از متن اصلی حذف نمی‌کند', () => {
    const long = Array.from({ length: 40 }, (_, i) => `بند شماره ${i} با کمی متن اضافه برای طولانی‌تر شدن.`).join('\n\n');
    const pages = paginate(long, 400);
    assert.ok(pages.length > 1);
    assert.strictEqual(pages.join('\n\n'), long);
    for (const p of pages) assert.ok(p.length <= 400 + 1); // کمی تلورانس برای بندهای مرزی
  });

  t('متن کوتاه‌تر از حد مجاز، فقط یک صفحه می‌شود', () => {
    const pages = paginate('یک متن کوتاه.', 400);
    assert.strictEqual(pages.length, 1);
  });
};
