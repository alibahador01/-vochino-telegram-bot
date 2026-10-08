// handlers/homeMenu.js
// هدف ۲ و ۳ از بخش ۳ سند: یک Reply Keyboard دائمی پایین صفحه با دو دکمه (☰ Home | 💱 Live Price)
// + صفحه‌ی Live Price با نوار درصدهای کم‌مصرف (بدون هیچ تایمر/جاب پس‌زمینه‌ای — فقط وقتی کاربر
// واقعاً صفحه را باز می‌کند محاسبه می‌شود).
//
// مهم: این دو دکمه «Reply Keyboard» هستند (نه Inline)، پس روی هر پیام متنی عادی کار می‌کنند —
// چون bot.hears در تلگراف همان bot.on('text') با matching است، این هندلرها عمداً زودتر از
// هندلرهای session-محور (خرید/فروش/پنل ادمین) در index.js ثبت می‌شوند تا دکمه‌ی Home همیشه،
// حتی وسط یک فلوی نیمه‌کاره، کار کند (و آن سشن نیمه‌کاره را هم پاک می‌کند).

const { sessions, showMainMenu, reactToMessage } = require('../utils');
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

// ⚠️ اصلاح طبق فیدبک: صفحه‌ی Live Price باید یک پیام متنی ساده باشد، نه Inline Keyboard.
// فرمت و فونت‌ها دقیقاً همان چیزی‌اند که فرستاده شده؛ فقط بعد از هر Buy/Sell عدد واقعی (از
// price-service) با «:» اضافه شده — چون «کنارشون نمایش داده بشه» خواسته شده بود، نه جایگزین متن.
function fmtPrice(n) {
  if (n === undefined || n === null || n === '' || isNaN(Number(n))) return '—';
  const num = Number(n);
  // قیمت‌های بزرگ (تومانی) با جداکننده‌ی هزارگان، قیمت‌های کوچک (دلاری مثل تتر) همون‌جور که هست
  return Number.isInteger(num) || Math.abs(num) >= 1000 ? num.toLocaleString('en-US') : String(num);
}

async function buildLivePriceText() {
  const prices = await priceService.getPrices(); // ممکنه null باشه (سرویس در دسترس نیست) یا stale:true داشته باشه

  const uPct = priceService.slowFluctuatingPercent('u_voucher');
  const premiumPct = priceService.slowFluctuatingPercent('premium_voucher');
  const psPct = priceService.slowFluctuatingPercent('ps_voucher');
  const dollarPct = priceService.slowFluctuatingPercent('dollar');
  const utopiaPct = priceService.slowFluctuatingPercent('utopia');

  const uBar = priceService.renderBar(uPct, '▰', '▱', 8);
  const premiumBar = priceService.renderBar(premiumPct, '▰', '▱', 8);
  const psBar = priceService.renderBar(psPct, '▰', '▱', 8);
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

    `🔷️ 𝑩𝒖𝒚 𝑷𝑺 𝑽𝒐𝒖𝒄𝒉𝒆𝒓: ${fmtPrice(p.ps_buy)}\n` +
    `🔶️ 𝑺𝒆𝒍𝒍 𝑷𝑺 𝑽𝒐𝒖𝒄𝒉𝒆𝒓: ${fmtPrice(p.ps_sell)}\n` +
    `💱 ${psBar} ${psPct}%\n\n` +

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
    // همون ری‌اکشن شناور/بزرگی که روی پیام /start می‌ذاشتیم، الان روی خودِ پیام «☰ Home» هم هست
    if (ctx.message && ctx.message.message_id) {
      reactToMessage(ctx, ctx.chat.id, ctx.message.message_id, true);
    }
    return showMainMenu(ctx);
  });

  // 💱 Live Price — یک پیام متنی ساده (بدون هیچ دکمه‌ای)
  bot.hears(LIVE_PRICE_BTN_TEXT, async (ctx) => {
    delete sessions[ctx.from.id];
    const text = await buildLivePriceText();
    return ctx.reply(text);
  });
}

registerHomeMenuHandlers.persistentKeyboard = persistentKeyboard;
registerHomeMenuHandlers.ensurePersistentKeyboard = ensurePersistentKeyboard;
registerHomeMenuHandlers.HOME_BTN_TEXT = HOME_BTN_TEXT;
registerHomeMenuHandlers.LIVE_PRICE_BTN_TEXT = LIVE_PRICE_BTN_TEXT;

module.exports = registerHomeMenuHandlers;
