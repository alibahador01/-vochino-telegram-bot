// handlers/homeMenu.js
// یک Reply Keyboard دائمی پایین صفحه با دو دکمه (☰ Home | 💱 Live Price)
// + صفحه‌ی Live Price به‌صورت پیام متنی ساده (بدون هیچ تایمر/جاب پس‌زمینه‌ای —
//   فقط وقتی کاربر واقعاً صفحه را باز می‌کند محاسبه می‌شود).
//
// مهم: این دو دکمه «Reply Keyboard» هستند (نه Inline)، پس روی هر پیام متنی عادی کار می‌کنند —
// این هندلرها عمداً زودتر از هندلرهای session-محور در index.js ثبت می‌شوند تا دکمه‌ی Home
// همیشه، حتی وسط یک فلوی نیمه‌کاره، کار کند (و آن سشن نیمه‌کاره را هم پاک می‌کند).

const { sessions, showMainMenu, reactToMessage } = require('../utils');
const priceService = require('../priceService');
const { describeError } = require('../util/http');

const HOME_BTN_TEXT = '☰ 𝑯𝒐𝒎𝒆';
const LIVE_PRICE_BTN_TEXT = '💱 𝑳𝒊𝒗𝒆 𝑷𝒓𝒊𝒄𝒆';

// استیکرها (file_id تلگرام). استیکر /start و Live Price یکی‌اند، استیکر Home جداست.
const STICKERS = {
  START: 'CAACAgQAAxkBAAEjRAxqxhFnxb_VwVwz_0djHxKSSn28vgACPxwAAjnLMVLqDLGfkWn-HT0E',
  LIVE_PRICE: 'CAACAgQAAxkBAAEjRAxqxhFnxb_VwVwz_0djHxKSSn28vgACPxwAAjnLMVLqDLGfkWn-HT0E',
  HOME: 'CAACAgIAAxkBAAEjSKxqxpgW2yxDcPW2mmO0RtWriXRk_gACCScAApL5eEnHopTScSGNzz0E'
};

// ارسال استیکر با خطایابی؛ اگر استیکر فرستاده نشد (مثلاً file_id نامعتبر)، جریان اصلی
// (منو / قیمت‌ها) نباید متوقف شود — فقط خطا لاگ می‌شود.
async function sendSticker(ctx, fileId) {
  try {
    await ctx.replyWithSticker(fileId);
  } catch (e) {
    console.log('❌ خطا در ارسال استیکر:', describeError(e));
  }
}

function persistentKeyboard() {
  return {
    keyboard: [[{ text: HOME_BTN_TEXT }, { text: LIVE_PRICE_BTN_TEXT }]],
    resize_keyboard: true
  };
}

// این پیام را هرجا که منوی اصلی نشان داده می‌شود صدا بزنید تا کیبورد پایین صفحه
// (اگر توسط یک کیبورد موقت دیگر—مثل درخواست شماره تلفن—بازنویسی شده) برگردد.
async function ensurePersistentKeyboard(ctx) {
  try {
    await ctx.reply('🔘', { reply_markup: persistentKeyboard() });
  } catch (e) {}
}

// فرمت قیمت: اعداد بزرگ با جداکننده‌ی هزارگان، اعداد کوچک (مثل تتر) همان‌طور که هستند
function fmtPrice(n) {
  if (n === undefined || n === null || n === '' || isNaN(Number(n))) return '—';
  const num = Number(n);
  return Number.isInteger(num) || Math.abs(num) >= 1000 ? num.toLocaleString('en-US') : String(num);
}

async function buildLivePriceText() {
  const prices = await priceService.getPrices(); // ممکنه null باشه یا stale:true داشته باشه

  const uPct = priceService.slowFluctuatingPercent('u_voucher');
  const premiumPct = priceService.slowFluctuatingPercent('premium_voucher');
  const dollarPct = priceService.slowFluctuatingPercent('dollar');
  const utopiaPct = priceService.slowFluctuatingPercent('utopia');

  const uBar = priceService.renderBar(uPct, '▰', '▱', 8);
  const premiumBar = priceService.renderBar(premiumPct, '▰', '▱', 8);
  const dollarBar = priceService.renderBar(dollarPct, '⬢', '⬡', 5);
  const utopiaBar = priceService.renderBar(utopiaPct, '⬢', '⬡', 5);

  const p = prices || {};

  let text =
    `🔷️ 𝑩𝒖𝒚 𝑼-𝑽𝒐𝒖𝒄𝒉𝒆𝒓: ${fmtPrice(p.u_buy)}\n` +
    `🔶️ 𝑺𝒆𝒍𝒍 𝑼-𝑽𝒐𝒖𝒄𝒉𝒆𝒓: ${fmtPrice(p.u_sell)}\n` +
    `💱 ${uBar} ${uPct}%\n\n` +

    `🔷️ 𝑩𝒖𝒚 𝑷𝒓𝒆𝒎𝒊𝒖𝒎 𝑽𝒐𝒖𝒄𝒉𝒆𝒓: ${fmtPrice(p.premium_buy)}\n` +
    `🔶️ 𝑺𝒆𝒍𝒍 𝑷𝒓𝒆𝒎𝒊𝒖𝒎 𝑽𝒐𝒖𝒄𝒉𝒆𝒓: ${fmtPrice(p.premium_sell)}\n` +
    `💱 ${premiumBar} ${premiumPct}%\n\n` +

    `💱 𝑫𝒐𝒍𝒍𝒂𝒓: ${fmtPrice(p.tether_usd)}\n` +
    `${dollarBar} ${dollarPct}%\n\n` +

    `✨ 𝑼𝒕𝒐𝒑𝒊𝒂: ${fmtPrice(p.utopia_usd)}\n` +
    `${utopiaBar} ${utopiaPct}%`;

  if (!prices) {
    text = '⚠️ سرویس قیمت موقتاً در دسترس نیست — این لیست بدون قیمت لحظه‌ای است.\n\n' + text;
  } else if (prices.stale) {
    text += '\n\n⚠️ آخرین قیمت معتبر نمایش داده شد (اتصال لحظه‌ای برقرار نشد).';
  }

  return text;
}

function registerHomeMenuHandlers(bot) {
  // ☰ Home — از هرجای ربات، بدون نیاز به /start، کاربر را به منوی اصلی برمی‌گرداند
  bot.hears(HOME_BTN_TEXT, async (ctx) => {
    delete sessions[ctx.from.id];

    // استیکر Home قبل از باز شدن منو
    await sendSticker(ctx, STICKERS.HOME);

    // منو را می‌فرستیم. showMainMenu همان پیام ارسال‌شده‌ی تلگرام را برمی‌گرداند،
    // پس message_id همین پیام منو است و قطعاً وجود دارد.
    // ⚠️ ری‌اکشن قبلی حذف شد: قبلاً روی پیام «☰ Home» کاربر گذاشته می‌شد که گاهی
    // «message to react not found» می‌داد. حالا ری‌اکشن شناور روی خود پیام منو می‌نشیند
    // (همان رفتار /start: is_big=true، ایموجی از تنظیم start_reaction در پنل ادمین).
    const sent = await showMainMenu(ctx);
    if (sent && sent.message_id) {
      await reactToMessage(ctx, ctx.chat.id, sent.message_id, true);
    }
  });

  // 💱 Live Price — استیکر، سپس پیام متنی ساده قیمت‌ها (بدون هیچ دکمه‌ای)
  bot.hears(LIVE_PRICE_BTN_TEXT, async (ctx) => {
    delete sessions[ctx.from.id];
    await sendSticker(ctx, STICKERS.LIVE_PRICE);
    const text = await buildLivePriceText();
    return ctx.reply(text);
  });
}

registerHomeMenuHandlers.persistentKeyboard = persistentKeyboard;
registerHomeMenuHandlers.ensurePersistentKeyboard = ensurePersistentKeyboard;
registerHomeMenuHandlers.sendSticker = sendSticker;
registerHomeMenuHandlers.STICKERS = STICKERS;
registerHomeMenuHandlers.HOME_BTN_TEXT = HOME_BTN_TEXT;
registerHomeMenuHandlers.LIVE_PRICE_BTN_TEXT = LIVE_PRICE_BTN_TEXT;

module.exports = registerHomeMenuHandlers;
