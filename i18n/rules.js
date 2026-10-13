// i18n/rules.js
// منبع محتوای «قوانین و شرایط استفاده».
//  • فارسی = متن مرجع: bot_texts.rulesText (قابل ویرایش از پنل مدیریت) و در نبود آن defaultRules.js.
//  • انگلیسی/ترکی = bot_texts.rulesText_en / rulesText_tr (قابل ویرایش از پنل) و در نبود آن ترجمه‌های پیش‌فرض زیر
//    که بند‌به‌بند و وفادار به متن فارسی پیش‌فرض نوشته شده‌اند.
//  • هیچ‌وقت متن فارسی به‌جای انگلیسی/ترکی نمایش داده نمی‌شود (fallback پنهان وجود ندارد).
// نکته‌ی عملیاتی: اگر مدیر متن فارسی را از پنل تغییر داد، باید rulesText_en و rulesText_tr را هم همان‌جا به‌روز کند.

const crypto = require('crypto');
const { RULES_TEXT: RULES_FA } = require('../defaultRules');

const RULES_EN = `🜲 Vochino⁰¹ Terms

To protect the security of transactions and to make better use of the services, please read the following:

⫹⫺ Account information
Registration must be completed with the user's own real information. Using another person's name, national ID, phone number or account is not permitted.

⫹⫺ Identity verification
Identity verification is carried out to protect the security of transactions, prevent misuse and review unusual transactions.

◈ Silver verification: daily purchase limit of 2,000,000 Toman
◈ Gold verification: daily purchase limit of up to 10,000,000 Toman

Verification information and documents are confidential and will not be disclosed to unauthorized persons, except where required by law.

⫹⫺ Bank card
Payments must be made with a bank card that belongs to the user. Deposits from another person's card are not permitted.

In case of a mismatch, the order is put on hold and the matter is reviewed; if confirmed, a refund may take up to 72 business hours.

Repeating this violation may result in the account being restricted, and a refund for a repeated violation is not automatic or guaranteed.

⫹⫺ Buying and selling vouchers
Buying and selling vouchers is carried out automatically. In the event of a technical error or a problem with an order, support will review and follow up on the matter.

Submitting a fake, stolen, already used or third-party voucher is prohibited.

⫹⫺ Invitations and rewards
Creating multiple accounts, fake invitations, inviting yourself, using other people's accounts, or any manipulation of the system to obtain rewards is prohibited. Rewards obtained through violations may be cancelled.

⫹⫺ Transaction security
If unusual activity or activity contrary to these terms is observed, an order or an account may be temporarily restricted until the review is complete.

⫹⫺ Rates
Rates may change. The basis of a transaction is the rate and the details recorded at the time of final order confirmation.

By accepting these terms, the user confirms the accuracy of their information and agrees to comply with the rules above.

🜲 Vochino⁰¹ Fast, transparent and reliable voucher trading`;

const RULES_TR = `🜲 Vochino⁰¹ Kuralları

İşlemlerin güvenliğini korumak ve hizmetlerden daha iyi yararlanmak için lütfen aşağıdaki maddeleri okuyun:

⫹⫺ Hesap bilgileri
Kayıt, kullanıcının kendi gerçek bilgileriyle yapılmalıdır. Başka bir kişiye ait ad, ulusal kimlik numarası, telefon numarası veya hesabın kullanılması yasaktır.

⫹⫺ Kimlik doğrulama
Kimlik doğrulama; işlemlerin güvenliğini korumak, kötüye kullanımı önlemek ve olağandışı işlemleri incelemek amacıyla yapılır.

◈ Gümüş doğrulama: günlük alım limiti 2.000.000 Toman
◈ Altın doğrulama: günlük alım limiti 10.000.000 Toman'a kadar

Kimlik doğrulama bilgileri ve belgeleri gizlidir; yasal olarak gerekli durumlar dışında yetkisiz kişilerle paylaşılmaz.

⫹⫺ Banka kartı
Ödeme, kullanıcının kendisine ait banka kartıyla yapılmalıdır. Başka bir kişinin kartından yapılan yatırım kabul edilmez.

Uyuşmazlık halinde sipariş durdurulur ve konu incelenir; onaylanması durumunda para iadesi 72 iş saatine kadar sürebilir.

Bu durumun tekrarı hesabın kısıtlanmasına yol açabilir; tekrarlanan bir ihlalde para iadesi otomatik ve garantili değildir.

⫹⫺ Voucher alım ve satımı
Voucher alım ve satımı otomatik olarak gerçekleştirilir. Teknik bir hata veya siparişle ilgili bir sorun olması halinde destek ekibi konuyu inceler ve takip eder.

Sahte, çalıntı, daha önce kullanılmış veya başka bir kişiye ait voucher göndermek yasaktır.

⫹⫺ Davet ve ödüller
Birden fazla hesap oluşturmak, sahte davet, kendini davet etme, başkalarının hesaplarını kullanma veya ödül almak için sistemi manipüle etme yasaktır. İhlal sonucu elde edilen ödüller iptal edilebilir.

⫹⫺ İşlem güvenliği
Olağandışı veya kurallara aykırı bir faaliyet tespit edilirse sipariş veya hesap, inceleme tamamlanana kadar geçici olarak kısıtlanabilir.

⫹⫺ Kurlar
Kurlar değişebilir. İşlemin esası, siparişin nihai onayı sırasında kaydedilen kur ve bilgilerdir.

Bu koşulları kabul eden kullanıcı, bilgilerinin doğruluğunu ve yukarıdaki kurallara uyacağını kabul etmiş olur.

🜲 Vochino⁰¹ Hızlı, şeffaf ve güvenilir voucher alım satımı`;

const RULES_DEFAULTS = { fa: RULES_FA, en: RULES_EN, tr: RULES_TR };

// کلید رکورد در جدول bot_texts (قابل ویرایش از «مدیریت متن‌های ربات»)
const RULES_TEXT_KEYS = { fa: 'rulesText', en: 'rulesText_en', tr: 'rulesText_tr' };

// حد امن طول هر پیام (سقف تلگرام ۴۰۹۶ است)
const MAX_PAGE_LENGTH = 3500;

function sha12(text) {
  return crypto.createHash('sha256').update(String(text).replace(/\s+/g, ' ').trim(), 'utf8').digest('hex').slice(0, 12);
}

// نسخه‌ی قوانین = اثر انگشت متن فارسی مرجع؛ با تغییر متن مرجع، نسخه هم عوض می‌شود.
function getRulesVersion(getText, defaults = RULES_DEFAULTS) {
  const fa = readText('fa', getText, defaults);
  return fa ? 'v-' + sha12(fa) : null;
}

function readText(lang, getText, defaults) {
  let value = null;
  try {
    value = typeof getText === 'function' ? getText(RULES_TEXT_KEYS[lang], defaults[lang]) : defaults[lang];
  } catch (e) {
    value = defaults[lang];
  }
  if (typeof value !== 'string' || !value.trim()) value = defaults[lang];
  if (typeof value !== 'string' || !value.trim()) return null;
  return value;
}

// خروجی: { ok:true, text, version } یا { ok:false, reason:'missing' } (خطای پیکربندی واقعی)
function resolveRules(lang, getText, defaults = RULES_DEFAULTS) {
  if (!RULES_TEXT_KEYS[lang]) return { ok: false, reason: 'bad_lang' };
  const text = readText(lang, getText, defaults);
  if (!text) return { ok: false, reason: 'missing' };
  const version = getRulesVersion(getText, defaults);
  if (!version) return { ok: false, reason: 'missing' };
  return { ok: true, text, version };
}

// تقسیم متن طولانی به صفحه‌های مرتب، بدون بریدن وسط بند/خط (و هرگز حذف بخشی از متن)
function paginate(text, maxLen = MAX_PAGE_LENGTH) {
  const clean = String(text).replace(/\r\n/g, '\n').trim();
  if (clean.length <= maxLen) return [clean];

  const pieces = [];
  for (const para of clean.split(/\n{2,}/)) {
    if (para.length <= maxLen) {
      pieces.push(para);
      continue;
    }
    // بند خیلی طولانی: خط‌به‌خط، و در صورت نیاز تکه‌تکه با طول ثابت
    let buf = '';
    for (const line of para.split('\n')) {
      if (line.length > maxLen) {
        if (buf) { pieces.push(buf); buf = ''; }
        for (let i = 0; i < line.length; i += maxLen) pieces.push(line.slice(i, i + maxLen));
        continue;
      }
      if ((buf ? buf.length + 1 : 0) + line.length > maxLen) {
        pieces.push(buf);
        buf = line;
      } else {
        buf = buf ? buf + '\n' + line : line;
      }
    }
    if (buf) pieces.push(buf);
  }

  const pages = [];
  let current = '';
  for (const piece of pieces) {
    if (!current) { current = piece; continue; }
    if (current.length + 2 + piece.length <= maxLen) current += '\n\n' + piece;
    else { pages.push(current); current = piece; }
  }
  if (current) pages.push(current);
  return pages;
}

module.exports = {
  RULES_DEFAULTS,
  RULES_EN,
  RULES_TR,
  RULES_TEXT_KEYS,
  MAX_PAGE_LENGTH,
  resolveRules,
  getRulesVersion,
  paginate
};
