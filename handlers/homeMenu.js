// handlers/homeMenu.js
const { sessions, showMainMenu, reactToMessage } = require('../utils');
const priceService = require('../priceService');
const { describeError, fetchWithTimeout } = require('../util/http');
const { getUser, getUsdRate } = require('../db');

const HOME_BTN_TEXT = '☰ 𝑯𝒐𝒎𝒆';
const LIVE_PRICE_BTN_TEXT = '💱 𝑳𝒊𝒗𝒆 𝑷𝒓𝒊𝒄𝒆';

const STICKERS = {
  START: 'CAACAgQAAxkBAAEjRAxqxhFnxb_VwVwz_0djHxKSSn28vgACPxwAAjnLMVLqDLGfkWn-HT0E',
  LIVE_PRICE: 'CAACAgQAAxkBAAEjRAxqxhFnxb_VwVwz_0djHxKSSn28vgACPxwAAjnLMVLqDLGfkWn-HT0E',
  HOME: 'CAACAgIAAxkBAAEjSKxqxpgW2yxDcPW2mmO0RtWriXRk_gACCScAApL5eEnHopTScSGNzz0E'
};

async function sendSticker(ctx, fileId, extra) {
  try {
    await ctx.replyWithSticker(fileId, extra);
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

async function ensurePersistentKeyboard(ctx) {
  try {
    await ctx.reply('🔘', { reply_markup: persistentKeyboard() });
  } catch (e) {}
}

function fmtPrice(n) {
  if (n === undefined || n === null || n === '' || isNaN(Number(n))) return '—';
  const num = Number(n);
  return Number.isInteger(num) || Math.abs(num) >= 1000 ? num.toLocaleString('en-US') : String(num);
}

const USD_TOMAN_SPREAD = 0.003;
const PCT_MIDPOINT = 55;

// 🔥 توابع چرخش ۳ رقم آخر (به صورت محلی اینجا نوشته شدن تا خطا ندن)
function cosmeticTrailingDigits(key, maxValue = 600, periodMs = 5 * 60 * 1000) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  const phase = (hash % 1000) / 1000 * Math.PI * 2;
  const t = Date.now() / periodMs;
  const wave = (Math.sin(t * Math.PI * 2 + phase) + 1) / 2;
  return Math.round(wave * maxValue);
}

function localDecoratePrice(realPrice, key) {
  const n = Number(realPrice);
  if (!isFinite(n) || isNaN(n)) return realPrice;
  const base = Math.floor(n / 1000) * 1000;
  return base + cosmeticTrailingDigits(key);
}
// 🔥 ----------------------------------------------------

function buildPriceLine(emoji, label, realPrice, priceKey, barChar, emptyChar, segments) {
  const pct = priceService.slowFluctuatingPercent(priceKey + '_pct');
  const bar = priceService.renderBar(pct, barChar, emptyChar, segments);
  const arrow = pct >= PCT_MIDPOINT ? '🔺' : '🔻';
  
  // اینجا از تابع محلی خودمون استفاده می‌کنیم
  const displayPrice = localDecoratePrice(realPrice, priceKey + '_digits');
  
  return `${emoji}${label}: ${fmtPrice(displayPrice)}\n${arrow} ${bar} ${pct}%`;
}

async function buildLivePriceText() {
  const prices = await priceService.getPrices(); 
  const p = prices || {};
  let usdRate = await getUsdRate(); 
  
  let u_buy = p.u_buy;
  let u_sell = p.u_sell;
  let premium_buy = p.premium_buy;
  let premium_sell = p.premium_sell;
  let hot_buy = p.hot_buy;
  let hot_sell = p.hot_sell;
  let baseTetherToman = usdRate; 
  let tetherUsd = Number(p.tether_usd);
  let utopiaUsd = Number(p.utopia_usd);

  try {
    // ⚠️ رفع باگ «ربات گاهی یک دقیقه‌ای ساکت می‌شود، بعد یهو همه‌چیز با هم می‌رسد»: این fetch قبلاً
    // بدون هیچ سقف زمانی بود (برخلاف همه‌ی fetchهای دیگر پروژه که از fetchWithTimeout استفاده
    // می‌کنند) — اگر همین price-service (یک سرویس رندر دیگر) کمی دیر جواب بدهد یا خوابیده باشد،
    // این fetch می‌توانست دقایقی معلق بماند، و چون Telegraf آپدیت‌ها را پشت‌سرهم (نه هم‌زمان)
    // پردازش می‌کند، همین یک درخواست کل صف ربات را قفل می‌کرد تا وقتی خودش تمام شود. الان حداکثر
    // ۸ ثانیه صبر می‌کند و بعد (مثل حالت خطا) بی‌صدا به قیمت‌های کش‌شده‌ی بالا برمی‌گردد.
    const res = await fetchWithTimeout('https://price-service-bxfy.onrender.com/', {}, 8000);
    if (res.ok) {
      const data = await res.json();
      if (data && data.ali1377) {
        if (data.ali1377.u_buy != null) u_buy = data.ali1377.u_buy;
        if (data.ali1377.u_sell != null) u_sell = data.ali1377.u_sell;
        if (data.ali1377.premium_buy != null) premium_buy = data.ali1377.premium_buy;
        if (data.ali1377.premium_sell != null) premium_sell = data.ali1377.premium_sell;
        if (data.ali1377.hot_buy != null) hot_buy = data.ali1377.hot_buy;
        if (data.ali1377.hot_sell != null) hot_sell = data.ali1377.hot_sell;
        if (data.ali1377.tether_usd != null) tetherUsd = Number(data.ali1377.tether_usd);
        if (data.ali1377.utopia_usd != null) utopiaUsd = Number(data.ali1377.utopia_usd);
      }
      if (data && data.meta && data.meta.poster && data.meta.poster.swapwallet_prices && data.meta.poster.swapwallet_prices["USDT/IRT"]) {
        baseTetherToman = Number(data.meta.poster.swapwallet_prices["USDT/IRT"]);
      }
    }
  } catch (e) {
    console.log('⚠️ خطا در دریافت از منبع مادر (رندر):', e.message);
  }

  const dollarBuyToman = isFinite(baseTetherToman) && baseTetherToman > 0 ? baseTetherToman * (1 + USD_TOMAN_SPREAD) : NaN;
  const dollarSellToman = isFinite(baseTetherToman) && baseTetherToman > 0 ? baseTetherToman * (1 - USD_TOMAN_SPREAD) : NaN;
  
  const utopiaBaseToman = isFinite(baseTetherToman) && isFinite(utopiaUsd) ? utopiaUsd * baseTetherToman : NaN;
  const utopiaBuyToman = isFinite(utopiaBaseToman) ? utopiaBaseToman * (1 + USD_TOMAN_SPREAD) : NaN;
  const utopiaSellToman = isFinite(utopiaBaseToman) ? utopiaBaseToman * (1 - USD_TOMAN_SPREAD) : NaN;

  // ⚠️ بازطراحی ظاهری (درخواست: شبیه کارت‌های تمیز یک کانال نمونه): تلگرام جدول/کارت واقعی
  // تو پیام متنی رندر نمی‌کند (آن نمونه یک رسید پرداخت بومی تلگرام بود، نه متن ساده)، پس همان
  // مکانیزم فعلی (نوار + درصد) عیناً حفظ شده و فقط هر جفت خرید/فروش داخل یک قاب ساده بسته‌بندی
  // شده تا مثل یک کارت جدا و تمیز دیده شود.
  function frameBlock(content) {
    return '┌─────────────────┐\n\n' + content + '\n\n└─────────────────┘';
  }

  const blocks = [
    frameBlock(
      buildPriceLine('🎫 ', '𝑩𝒖𝒚 𝑼-𝑽𝒐𝒖𝒄𝒉𝒆𝒓', u_buy, 'buy_u_voucher', '▰', '▱', 8) + '\n\n' +
      buildPriceLine('🎫 ', '𝑺𝒆𝒍𝒍 𝑼-𝑽𝒐𝒖𝒄𝒉𝒆𝒓', u_sell, 'sell_u_voucher', '▰', '▱', 8)
    ),

    frameBlock(
      buildPriceLine('🎫 ', '𝑩𝒖𝒚 𝑷𝒓 𝑽𝒐𝒖𝒄𝒉𝒆𝒓', premium_buy, 'buy_pr_voucher', '▰', '▱', 8) + '\n\n' +
      buildPriceLine('🎫 ', '𝑺𝒆𝒍𝒍 𝑷𝒓 𝑽𝒐𝒖𝒄𝒉𝒆𝒓', premium_sell, 'sell_pr_voucher', '▰', '▱', 8)
    ),

    frameBlock(
      buildPriceLine('🎫 ', '𝑩𝒖𝒚 𝑯𝒐𝒕 𝑽𝒐𝒖𝒄𝒉𝒆𝒓', hot_buy, 'buy_hot_voucher', '▰', '▱', 8) + '\n\n' +
      buildPriceLine('🎫 ', '𝑺𝒆𝒍𝒍 𝑯𝒐𝒕 𝑽𝒐𝒖𝒄𝒉𝒆𝒓', hot_sell, 'sell_hot_voucher', '▰', '▱', 8)
    ),

    frameBlock(
      buildPriceLine('💲', '𝑩𝒖𝒚 𝑫𝒐𝒍𝒍𝒂𝒓', dollarBuyToman, 'buy_dollar', '⬢', '⬡', 5) + '\n\n' +
      buildPriceLine('💲', '𝑺𝒆𝒍𝒍 𝑫𝒐𝒍𝒍𝒂𝒓', dollarSellToman, 'sell_dollar', '⬢', '⬡', 5)
    ),

    frameBlock(
      buildPriceLine('💲', '𝑩𝒖𝒚 𝑼𝒕𝒐𝒑𝒊𝒂', utopiaBuyToman, 'buy_utopia', '⬢', '⬡', 5) + '\n\n' +
      buildPriceLine('💲', '𝑺𝒆𝒍𝒍 𝑼𝒕𝒐𝒑𝒊𝒂', utopiaSellToman, 'sell_utopia', '⬢', '⬡', 5)
    )
  ];

  let text = '╭〰 ➫ 𝑽𝒐𝒄𝒉𝒊𝒏𝒐 ➫ 〰╮\n\n' + blocks.join('\n\n');

  if (!prices) {
    text += '\n\n⚠️ سرویس قیمت موقتاً در دسترس نیست — این لیست بدون قیمت لحظه‌ای است.';
  } else if (prices.stale) {
    text += '\n\n⚠️ آخرین قیمت معتبر نمایش داده شد (اتصال لحظه‌ای برقرار نشد).';
  }

  return text;
}

function registerHomeMenuHandlers(bot) {
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
