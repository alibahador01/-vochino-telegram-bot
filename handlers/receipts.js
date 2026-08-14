// handlers/receipts.js
// قالب‌های نهایی رسیدها — طبق سند حیاتی (بدون هیچ مقدار هاردکد/جعلی)
// هر سازنده سه وضعیت را پشتیبانی می‌کند: 'success' | 'pending' | 'failed'

const HEADER =
  '╭━━━━━━━ ❖ ━━━━━━━\n' +
  '👑 ووچینو⁰¹\n' +
  '╰━━━━━━━ ❖ ━━━━━━━╯\n';

const SEP_MONEY = '💲➖💲💲➖💲💲➖💲';
const SEP_LINE = '━━━━━━━━━━━━━━━━';

function faNum(n) {
  return Number(n || 0).toLocaleString('en-US');
}

function maskCard(card) {
  if (!card) return 'ثبت نشده';
  const s = String(card).replace(/\s/g, '');
  if (s.length < 4) return '•••• •••• •••• ' + s;
  return '•••• •••• •••• ' + s.slice(-4);
}

function formatDateTime(d) {
  try {
    return new Date(d).toLocaleString('fa-IR', { dateStyle: 'medium', timeStyle: 'short' });
  } catch (e) {
    return new Date(d).toLocaleString();
  }
}

// ---------- رسید خرید ----------
function buildBuyReceipt(o) {
  const name = o.productName || '';
  if (o.status === 'success') {
    let msg =
      HEADER +
      `فاکتور خرید 📋\n` +
      `🛍️ نوع تراکنش: ${name}\n` +
      `💰 مبلغ سفارش: ${faNum(o.base)} تومان\n` +
      `💳 کارمزد: ${faNum(o.commission)} تومان\n` +
      `💵 مبلغ نهایی: ${faNum(o.paid)} تومان\n` +
      `🟢 وضعیت: موفق | پرداخت و صدور انجام شد\n` +
      SEP_MONEY + '\n' +
      `🔖 کد پیگیری سفارش: ${o.tracking}\n` +
      `💳 کارت پرداخت: ${maskCard(o.card)}\n` +
      SEP_LINE + '\n';
    if (o.voucherCode || o.voucherHash) {
      msg += '🎟️ اطلاعات ووچر 💎\n';
      if (o.voucherCode) msg += `💎 کد ووچر: ${o.voucherCode}\n`;
      if (o.voucherHash) msg += `🔐 هش ووچر: ${o.voucherHash}\n`;
      msg += SEP_LINE + '\n';
    }
    msg +=
      `🕐 تاریخ و ساعت: ${formatDateTime(o.createdAt)}\n` +
      `✨ سفارش شما با موفقیت ثبت و پردازش شد.\n` +
      `📌 اطلاعات ووچر را در محل امن نگهداری کنید.`;
    return msg;
  }
  if (o.status === 'pending') {
    return (
      HEADER +
      `فاکتور خرید 📋\n` +
      `🛍️ نوع تراکنش: ${name}\n` +
      `💰 مبلغ سفارش: ${faNum(o.base)} تومان\n` +
      `💳 کارمزد: ${faNum(o.commission)} تومان\n` +
      `💵 مبلغ نهایی: ${faNum(o.paid)} تومان\n` +
      `🟠 وضعیت: در انتظار | در حال پردازش و صدور\n` +
      `🔖 کد پیگیری سفارش: ${o.tracking}\n` +
      `💳 کارت پرداخت: ${maskCard(o.card)}\n` +
      SEP_LINE + '\n' +
      `🕐 تاریخ و ساعت: ${formatDateTime(o.createdAt)}\n` +
      `⏳ پس از بررسی و صدور، اطلاعات ووچر برای شما ارسال می‌شود.`
    );
  }
  return (
    HEADER +
    `فاکتور خرید 📋\n` +
    `🛍️ نوع تراکنش: ${name}\n` +
    `💰 مبلغ سفارش: ${faNum(o.base)} تومان\n` +
    `💳 کارمزد: ${faNum(o.commission)} تومان\n` +
    `🔴 وضعیت: ناموفق | خرید و صدور انجام نشد\n` +
    `🔖 کد پیگیری سفارش: ${o.tracking}\n` +
    SEP_LINE + '\n' +
    `❌ دلیل عدم انجام: ${o.reason || 'اطلاعات سفارش مورد تأیید قرار نگرفت.'}\n` +
    SEP_LINE + '\n' +
    `🕐 تاریخ و ساعت: ${formatDateTime(o.createdAt)}\n` +
    `⚠️ سفارش شما انجام نشد و ووچری صادر نگردید.`
  );
}

// ---------- رسید فروش ----------
function buildSellReceipt(o) {
  const name = o.productName || '';
  if (o.status === 'success') {
    return (
      HEADER +
      `فاکتور فروش 📋\n` +
      `🛍️ نوع تراکنش: ${name}\n` +
      `💰 مبلغ فروش: ${faNum(o.amount)} تومان\n` +
      `💳 کارمزد: ${faNum(o.commission)} تومان\n` +
      `💵 مبلغ دریافتی: ${faNum(o.received)} تومان\n` +
      `🟢 وضعیت: موفق | فروش و واریز انجام شد\n` +
      SEP_MONEY + '\n' +
      `🔖 کد پیگیری سفارش: ${o.tracking}\n` +
      `💳 کارت بانکی: ${maskCard(o.card)}\n` +
      SEP_LINE + '\n' +
      `💰 مبلغ ${faNum(o.received)} تومان با موفقیت به کیف پول ووچینو⁰¹ شما اضافه شد.\n` +
      `📍 موجودی جدید: ${faNum(o.newBalance)} تومان\n` +
      SEP_LINE + '\n' +
      `🕐 تاریخ و ساعت: ${formatDateTime(o.createdAt)}\n` +
      `✨ فروش شما با موفقیت بررسی و پردازش شد.\n` +
      `🤝 ممنون که ووچینو⁰¹ را انتخاب کردید.`
    );
  }
  if (o.status === 'pending') {
    return (
      HEADER +
      `فاکتور فروش 📋\n` +
      `🛍️ نوع تراکنش: ${name}\n` +
      `💰 مبلغ فروش: ${faNum(o.amount)} تومان\n` +
      `💳 کارمزد: ${faNum(o.commission)} تومان\n` +
      `🟠 وضعیت: در انتظار | در حال بررسی\n` +
      `🔖 کد پیگیری سفارش: ${o.tracking}\n` +
      SEP_LINE + '\n' +
      `⏳ پس از تأیید توسط پشتیبانی، مبلغ به کیف پول شما اضافه می‌شود.\n` +
      SEP_LINE + '\n' +
      `🕐 تاریخ و ساعت: ${formatDateTime(o.createdAt)}`
    );
  }
  return (
    HEADER +
    `فاکتور فروش 📋\n` +
    `🛍️ نوع تراکنش: ${name}\n` +
    `💰 مبلغ فروش: ${faNum(o.amount)} تومان\n` +
    `💳 کارمزد: ${faNum(o.commission)} تومان\n` +
    `🔴 وضعیت: ناموفق | فروش و واریز انجام نشد\n` +
    `🔖 کد پیگیری سفارش: ${o.tracking}\n` +
    SEP_LINE + '\n' +
    `❌ دلیل عدم انجام: ${o.reason || 'اطلاعات سفارش مورد تأیید قرار نگرفت.'}\n` +
    SEP_LINE + '\n' +
    `🕐 تاریخ و ساعت: ${formatDateTime(o.createdAt)}\n` +
    `⚠️ فروش شما تکمیل نشد و مبلغی بابت این سفارش به کیف پول شما اضافه نشد.`
  );
}

// ---------- رسید برداشت ----------
function buildWithdrawReceipt(o) {
  if (o.status === 'success') {
    return (
      HEADER +
      `فاکتور برداشت 📋\n` +
      `💸 نوع تراکنش: برداشت موجودی\n` +
      `💰 مبلغ برداشت: ${faNum(o.amount)} تومان\n` +
      `💳 کارمزد برداشت: ${faNum(o.commission)} تومان\n` +
      `💵 مبلغ واریزی: ${faNum(o.net)} تومان\n` +
      `🟢 وضعیت: موفق | مبلغ با موفقیت واریز شد\n` +
      SEP_MONEY + '\n' +
      `🔖 کد پیگیری سفارش: ${o.tracking}\n` +
      `💳 کارت بانکی: ${maskCard(o.card)}\n` +
      SEP_LINE + '\n' +
      `💰 مبلغ ${faNum(o.net)} تومان با موفقیت به حساب بانکی شما واریز شد.\n` +
      `📍 موجودی جدید کیف پول: ${faNum(o.newBalance)} تومان\n` +
      SEP_LINE + '\n' +
      `🕐 تاریخ و ساعت: ${formatDateTime(o.createdAt)}\n` +
      `✨ درخواست برداشت شما با موفقیت پردازش شد.\n` +
      `🤝 ممنون که ووچینو⁰¹ را انتخاب کردید.`
    );
  }
  if (o.status === 'pending') {
    return (
      HEADER +
      `فاکتور برداشت 📋\n` +
      `💸 نوع تراکنش: برداشت موجودی\n` +
      `💰 مبلغ برداشت: ${faNum(o.amount)} تومان\n` +
      `💳 کارمزد برداشت: ${faNum(o.commission)} تومان\n` +
      `🟠 وضعیت: در انتظار | در حال بررسی\n` +
      `🔖 کد پیگیری سفارش: ${o.tracking}\n` +
      `💳 کارت بانکی: ${maskCard(o.card)}\n` +
      SEP_LINE + '\n' +
      `⏳ پس از تأیید، مبلغ به کارت بانکی شما واریز می‌شود.\n` +
      SEP_LINE + '\n' +
      `🕐 تاریخ و ساعت: ${formatDateTime(o.createdAt)}`
    );
  }
  return (
    HEADER +
    `فاکتور برداشت 📋\n` +
    `💸 نوع تراکنش: برداشت موجودی\n` +
    `💰 مبلغ برداشت: ${faNum(o.amount)} تومان\n` +
    `💳 کارمزد برداشت: ${faNum(o.commission)} تومان\n` +
    `🔴 وضعیت: ناموفق | برداشت و واریز انجام نشد\n` +
    `🔖 کد پیگیری سفارش: ${o.tracking}\n` +
    SEP_LINE + '\n' +
    `❌ دلیل عدم انجام: ${o.reason || 'اطلاعات درخواست مورد تأیید قرار نگرفت.'}\n` +
    SEP_LINE + '\n' +
    `🕐 تاریخ و ساعت: ${formatDateTime(o.createdAt)}\n` +
    `⚠️ درخواست برداشت شما انجام نشد.`
  );
}

// ---------- رسید شارژ (واریز) ----------
function buildDepositReceipt(o) {
  if (o.status === 'success') {
    return (
      HEADER +
      `فاکتور شارژ 📋\n` +
      `💰 مبلغ شارژ: ${faNum(o.amount)} تومان\n` +
      `🟢 وضعیت: موفق | مبلغ به کیف پول اضافه شد\n` +
      SEP_MONEY + '\n' +
      `🔖 کد پیگیری سفارش: ${o.tracking}\n` +
      SEP_LINE + '\n' +
      `💰 مبلغ ${faNum(o.amount)} تومان با موفقیت به کیف پول ووچینو⁰¹ شما اضافه شد.\n` +
      `📍 موجودی جدید: ${faNum(o.newBalance)} تومان\n` +
      SEP_LINE + '\n' +
      `🕐 تاریخ و ساعت: ${formatDateTime(o.createdAt)}\n` +
      `✨ درخواست شارژ شما با موفقیت پردازش شد.\n` +
      `🤝 ممنون که ووچینو⁰¹ را انتخاب کردید.`
    );
  }
  if (o.status === 'pending') {
    return (
      HEADER +
      `فاکتور شارژ 📋\n` +
      `💰 مبلغ شارژ: ${faNum(o.amount)} تومان\n` +
      `🟠 وضعیت: در انتظار | در حال بررسی رسید\n` +
      `🔖 کد پیگیری سفارش: ${o.tracking}\n` +
      SEP_LINE + '\n' +
      `⏳ پس از تأیید رسید توسط پشتیبانی، مبلغ به کیف پول اضافه می‌شود.\n` +
      SEP_LINE + '\n' +
      `🕐 تاریخ و ساعت: ${formatDateTime(o.createdAt)}`
    );
  }
  return (
    HEADER +
    `فاکتور شارژ 📋\n` +
    `💰 مبلغ شارژ: ${faNum(o.amount)} تومان\n` +
    `🔴 وضعیت: ناموفق | واریز انجام نشد\n` +
    `🔖 کد پیگیری سفارش: ${o.tracking}\n` +
    SEP_LINE + '\n' +
    `❌ دلیل عدم انجام: ${o.reason || 'اطلاعات واریز مورد تأیید قرار نگرفت.'}\n` +
    SEP_LINE + '\n' +
    `🕐 تاریخ و ساعت: ${formatDateTime(o.createdAt)}\n` +
    `⚠️ درخواست شارژ شما انجام نشد و مبلغی اضافه نگردید.`
  );
}

module.exports = {
  HEADER,
  SEP_MONEY,
  SEP_LINE,
  faNum,
  maskCard,
  formatDateTime,
  buildBuyReceipt,
  buildSellReceipt,
  buildWithdrawReceipt,
  buildDepositReceipt
};
