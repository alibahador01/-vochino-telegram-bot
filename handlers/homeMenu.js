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
const { getUser, getUsdRate } = require('../db');

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

// اسپرد خرید/فروش دلار و یوتوپیا هنگام تبدیل به تومان (طبق سند: ±۰.۳٪)
const USD_TOMAN_SPREAD = 0.003;
// میانه‌ی بازه‌ی slowFluctuatingPercent پیش‌فرض (min=20,max=90) — برای تعیین جهت پیکان 🔺/🔻
const PCT_MIDPOINT = 55;

// یک خط «Buy/Sell + نوار درصد» می‌سازد. priceKey برای هم نوسان درصد و هم چرخش تزئینیِ سه‌رقم آخر
// به‌کار می‌رود (با پسوند متفاوت، تا کاملاً هم‌فاز نباشند و طبیعی‌تر دیده شوند).
// ⚠️ decoratePrice فقط روی عدد نمایشی اثر می‌گذارد؛ قیمت واقعیِ خرید/فروش در buy.js/sell.js
// همیشه از price-service/getEffectiveUnitPrice خوانده می‌شود، نه از اینجا.
function buildPriceLine(emoji, label, realPrice, priceKey, barChar, emptyChar, segments) {
  const pct = priceService.slowFluctuatingPercent(priceKey + '_pct');
  const bar = priceService.renderBar(pct, barChar, emptyChar, segments);
  const arrow = pct >= PCT_MIDPOINT ? '🔺' : '🔻';
  const displayPrice = priceService.decoratePrice(realPrice, priceKey + '_digits');
  return `${emoji}${label}: ${fmtPrice(displayPrice)}\n${arrow} ${bar} ${pct}%`;
}

async function buildLivePriceText() {
  // ۱. مقادیر پیش‌فرض (فال‌بک) از سرویس داخلی
  const prices = await priceService.getPrices(); 
  const p = prices || {};
  let usdRate = await getUsdRate(); 
  
  let u_buy = p.u_buy;
  let u_sell = p.u_sell;
  let premium_buy = p.premium_buy;
  let premium_sell = p.premium_sell;
  let baseTetherToman = usdRate; 
  let tetherUsd = Number(p.tether_usd);
  let utopiaUsd = Number(p.utopia_usd);

  try {
    // ۲. اتصال به منبع مادر (لینک رندر)
    const res = await fetch('https://price-service-bxfy.onrender.com/');
    if (res.ok) {
      const data = await res.json();
      
      // قیمت ووچرها از منبع مادر
      if (data && data.ali1377) {
        if (data.ali1377.u_buy != null) u_buy = data.ali1377.u_buy;
        if (data.ali1377.u_sell != null) u_sell = data.ali1377.u_sell;
        if (data.ali1377.premium_buy != null) premium_buy = data.ali1377.premium_buy;
        if (data.ali1377.premium_sell != null) premium_sell = data.ali1377.premium_sell;
        
        if (data.ali1377.tether_usd != null) tetherUsd = Number(data.ali1377.tether_usd);
        if (data.ali1377.utopia_usd != null) utopiaUsd = Number(data.ali1377.utopia_usd);
      }
      // قیمت پایه تتر به تومان از منبع مادر
      if (data && data.meta && data.meta.poster && data.meta.poster.swapwallet_prices && data.meta.poster.swapwallet_prices["USDT/IRT"]) {
        baseTetherToman = Number(data.meta.poster.swapwallet_prices["USDT/IRT"]);
      }
    }
  } catch (e) {
    console.log('⚠️ خطا در دریافت از منبع مادر (رندر):', e.message);
  }

  // ۳. محاسبه قیمت دلار و یوتوپیا
  const dollarBuyToman = isFinite(baseTetherToman) && baseTetherToman > 0 ? baseTetherToman * (1 + USD_TOMAN_SPREAD) : NaN;
  const dollarSellToman = isFinite(baseTetherToman) && baseTetherToman > 0 ? baseTetherToman * (1 - USD_TOMAN_SPREAD) : NaN;
  
  const utopiaBaseToman = isFinite(baseTetherToman) && isFinite(utopiaUsd) ? utopiaUsd * baseTetherToman : NaN;
  const utopiaBuyToman = isFinite(utopiaBaseToman) ? utopiaBaseToman * (1 + USD_TOMAN_SPREAD) : NaN;
  const utopiaSellToman = isFinite(utopiaBaseToman) ? utopiaBaseToman * (1 - USD_TOMAN_SPREAD) : NaN;

  const SEP = '〰️〰️〰️〰️〰️〰️〰️〰️〰️〰️〰️〰️〰️〰️';

  // ۴. ساخت پیام
  const blocks = [
    buildPriceLine('🎫 ', '𝑩𝒖𝒚 𝑼-𝑽𝒐𝒖𝒄𝒉𝒆𝒓', u_buy, 'buy_u_voucher', '▰', '▱', 8) + '\n\n' +
      buildPriceLine('🎫 ', '𝑺𝒆𝒍𝒍 𝑼-𝑽𝒐𝒖𝒄𝒉𝒆𝒓', u_sell, 'sell_u_voucher', '▰', '▱', 8),

    buildPriceLine('🎫 ', '𝑩𝒖𝒚 𝑷𝒓 𝑽𝒐𝒖𝒄𝒉𝒆𝒓', premium_buy, 'buy_pr_voucher', '▰', '▱', 8) + '\n\n' +
      buildPriceLine('🎫 ', '𝑺𝒆𝒍𝒍 𝑷𝒓 𝑽𝒐𝒖𝒄𝒉𝒆𝒓', premium_sell, 'sell_pr_voucher', '▰', '▱', 8),

    buildPriceLine('💲', '𝑩𝒖𝒚 𝑫𝒐𝒍𝒍𝒂𝒓', dollarBuyToman, 'buy_dollar', '⬢', '⬡', 5) + '\n\n' +
      buildPriceLine('💲', '𝑺𝒆𝒍𝒍 𝑫𝒐𝒍𝒍𝒂𝒓', dollarSellToman, 'sell_dollar', '⬢', '⬡', 5),

    buildPriceLine('💲', '𝑩𝒖𝒚 𝑼𝒕𝒐𝒑𝒊𝒂', utopiaBuyToman, 'buy_utopia', '⬢', '⬡', 5) + '\n\n' +
      buildPriceLine('💲', '𝑺𝒆𝒍𝒍 𝑼𝒕𝒐𝒑𝒊𝒂', utopiaSellToman, 'sell_utopia', '⬢', '⬡', 5)
  ];

  let text = '╭〰 ➫ 𝑽𝒐𝒄𝒉𝒊𝒏𝒐 ➫ 〰╮\n\n' + blocks.join('\n' + SEP + '\n\n');

  if (!prices) {
    text += '\n\n⚠️ سرویس قیمت موقتاً در دسترس نیست — این لیست بدون قیمت لحظه‌ای است.';
  } else if (prices.stale) {
    text += '\n\n⚠️ آخرین قیمت معتبر نمایش داده شد (اتصال لحظه‌ای برقرار نشد).';
  }

  return text;
}

function registerHomeMenuHandlers(bot) {
  // ☰ Home — از هرجای ربات، بدون نیاز به /start، کاربر را به منوی اصلی برمی‌گرداند
  bot.hears(HOME_BTN_TEXT, async (ctx) => {
    delete sessions[ctx.from.id];

    const user = await getUser(ctx.from.id);
    if (!user || user.registration_step !== 'completed') {
      const { renderCurrentState } = require('./registration');
      return user ? renderCurrentState(ctx, user) : null;
    }

    await sendSticker(ctx, STICKERS.HOME);

    const sent = await showMainMenu(ctx);
    if (sent && sent.message_id) {
      await reactToMessage(ctx, ctx.chat.id, sent.message_id, true);
    }
  });

  // 💱 Live Price — استیکر، سپس پیام متنی ساده قیمت‌ها
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
