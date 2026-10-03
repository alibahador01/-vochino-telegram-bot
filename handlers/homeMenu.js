// handlers/homeMenu.js
// هدف ۲ و ۳ از بخش ۳ سند: یک Reply Keyboard دائمی پایین صفحه با دو دکمه (☰ Home | 💱 Live Price)
// + صفحه‌ی Live Price با نوار درصدهای کم‌مصرف (بدون هیچ تایمر/جاب پس‌زمینه‌ای — فقط وقتی کاربر
// واقعاً صفحه را باز می‌کند محاسبه می‌شود).
//
// مهم: این دو دکمه «Reply Keyboard» هستند (نه Inline)، پس روی هر پیام متنی عادی کار می‌کنند —
// چون bot.hears در تلگراف همان bot.on('text') با matching است، این هندلرها عمداً زودتر از
// هندلرهای session-محور (خرید/فروش/پنل ادمین) در index.js ثبت می‌شوند تا دکمه‌ی Home همیشه،
// حتی وسط یک فلوی نیمه‌کاره، کار کند (و آن سشن نیمه‌کاره را هم پاک می‌کند).

const { sessions, showMainMenu } = require('../utils');
const priceService = require('../priceService');

const HOME_BTN_TEXT = '☰ 𝑯𝒐𝒎𝒆';
const LIVE_PRICE_BTN_TEXT = '💱 𝑳𝒊𝒗𝒆 𝑷𝒓𝒊𝒄𝒆';

function persistentKeyboard() {
  return {
    keyboard: [[{ text: HOME_BTN_TEXT }, { text: LIVE_PRICE_BTN_TEXT }]],
    resize_keyboard: true
  };
}

// این پیام را هرجا که منوی اصلی نشان داده می‌شود (بعد از /start یا بعد از تکمیل ثبت‌نام) صدا بزنید
// تا کیبورد پایین صفحه (اگر توسط یک کیبورد موقت دیگر—مثل درخواست شماره تلفن—بازنویسی شده) برگردد.
async function ensurePersistentKeyboard(ctx) {
  try {
    await ctx.reply('🔘', { reply_markup: persistentKeyboard() });
  } catch (e) {}
}

async function buildLivePriceMessage() {
  const prices = await priceService.getPrices();

  const uPct = priceService.slowFluctuatingPercent('u_voucher');
  const premiumPct = priceService.slowFluctuatingPercent('premium_voucher');
  const psPct = priceService.slowFluctuatingPercent('ps_voucher');
  const dollarPct = priceService.slowFluctuatingPercent('dollar');

  const text =
    '💱 𝑼𝒕𝒐𝒑𝒊𝒂 — 𝑳𝒊𝒗𝒆 𝑷𝒓𝒊𝒄𝒆' + (prices && prices.stale ? ' ⚠️' : '') + '\n\n' +
    'برای خرید/فروش روی دکمه‌ی محصول بزنید؛ برای دیدن قیمت دقیق روی نوار درصد بزنید.';

  const keyboard = [
    [
      { text: '🔷️ 𝑩𝒖𝒚 𝑼-𝑽𝒐𝒖𝒄𝒉𝒆𝒓', callback_data: 'buy_pick_voucher' },
      { text: '🔶️ 𝑺𝒆𝒍𝒍 𝑼-𝑽𝒐𝒖𝒄𝒉𝒆𝒓', callback_data: 'sell_pick_uvoucher' }
    ],
    [{ text: `💱 ${priceService.renderBar(uPct, '▰', '▱', 8)} ${uPct}%`, callback_data: 'liveprice_info_u' }],

    [
      { text: '🔷️ 𝑩𝒖𝒚 𝑷𝒓𝒆𝒎𝒊𝒖𝒎 𝑽𝒐𝒖𝒄𝒉𝒆𝒓', callback_data: 'buy_pick_premium_voucher' },
      { text: '🔶️ 𝑺𝒆𝒍𝒍 𝑷𝒓𝒆𝒎𝒊𝒖𝒎 𝑽𝒐𝒖𝒄𝒉𝒆𝒓', callback_data: 'sell_pick_premiumvoucher' }
    ],
    [{ text: `💱 ${priceService.renderBar(premiumPct, '▰', '▱', 8)} ${premiumPct}%`, callback_data: 'liveprice_info_premium' }],

    [
      { text: '🔷️ 𝑩𝒖𝒚 𝑷𝑺 𝑽𝒐𝒖𝒄𝒉𝒆𝒓', callback_data: 'buy_pick_ps_voucher' },
      { text: '🔶️ 𝑺𝒆𝒍𝒍 𝑷𝑺 𝑽𝒐𝒖𝒄𝒉𝒆𝒓', callback_data: 'sell_pick_psvoucher' }
    ],
    [{ text: `💱 ${priceService.renderBar(psPct, '▰', '▱', 8)} ${psPct}%`, callback_data: 'liveprice_info_ps' }],

    [{ text: '💱 𝑫𝒐𝒍𝒍𝒂𝒓', callback_data: 'liveprice_info_dollar' }],
    [{ text: `${priceService.renderBar(dollarPct, '⬢', '⬡', 5)} ${dollarPct}%`, callback_data: 'liveprice_info_dollar' }]
  ];

  return { text, keyboard };
}

function registerHomeMenuHandlers(bot) {
  // ☰ Home — از هرجای ربات، بدون نیاز به /start، کاربر را به منوی اصلی برمی‌گرداند
  bot.hears(HOME_BTN_TEXT, async (ctx) => {
    delete sessions[ctx.from.id];
    return showMainMenu(ctx);
  });

  // 💱 Live Price — صفحه‌ی قیمت‌ها
  bot.hears(LIVE_PRICE_BTN_TEXT, async (ctx) => {
    delete sessions[ctx.from.id];
    const { text, keyboard } = await buildLivePriceMessage();
    return ctx.reply(text, { reply_markup: { inline_keyboard: keyboard } });
  });

  // تپ روی نوار درصد → قیمت دقیق لحظه‌ای (از price-service) به‌صورت پاپ‌آپ
  bot.action(/^liveprice_info_(u|premium|ps|dollar)$/, async (ctx) => {
    const key = ctx.match[1];
    const prices = await priceService.getPrices();
    if (!prices) {
      return ctx.answerCbQuery('⚠️ سرویس قیمت موقتاً در دسترس نیست.', { show_alert: true });
    }
    const map = {
      u: `💱 U-Voucher\nخرید: ${prices.u_buy ?? '—'}\nفروش: ${prices.u_sell ?? '—'}`,
      premium: `💱 Premium Voucher\nخرید: ${prices.premium_buy ?? '—'}\nفروش: ${prices.premium_sell ?? '—'}`,
      ps: `💱 PS Voucher\nخرید: ${prices.ps_buy ?? '—'}\nفروش: ${prices.ps_sell ?? '—'}`,
      dollar: `💱 Dollar (Tether)\n${prices.tether_usd ?? '—'}`
    };
    return ctx.answerCbQuery(map[key], { show_alert: true });
  });
}

registerHomeMenuHandlers.persistentKeyboard = persistentKeyboard;
registerHomeMenuHandlers.ensurePersistentKeyboard = ensurePersistentKeyboard;
registerHomeMenuHandlers.HOME_BTN_TEXT = HOME_BTN_TEXT;
registerHomeMenuHandlers.LIVE_PRICE_BTN_TEXT = LIVE_PRICE_BTN_TEXT;

module.exports = registerHomeMenuHandlers;
