// priceService.js
// اتصال به سرویس قیمت (هدف ۱ از بخش ۳ سند): https://price-service-bxfy.onrender.com/
// فیلدها طبق سند: ps_buy, ps_sell, premium_buy, premium_sell, u_buy, u_sell, tether_usd, utopia_usd
//
// نکته‌ی مهم طبق توضیح پروژه: این سرویس خودش فقط هر چند دقیقه آپدیت می‌شود، پس اینجا هم با
// کش ۶۰ ثانیه‌ای درخواست می‌زنیم تا نه به سرویس قیمت فشار بیاد نه به رندر خودمان — هیچ
// setInterval ای برای این کار وجود ندارد؛ فقط وقتی کاربر واقعاً صفحه‌ی Live Price را باز می‌کند
// یک fetch (حداکثر هر ۶۰ ثانیه یک‌بار) انجام می‌شود.

const { fetchWithTimeout } = require('./util/http');

const BASE_URL = 'https://price-service-bxfy.onrender.com';
const CACHE_TTL_MS = 60 * 1000;
const TIMEOUT_MS = 8000;

let cache = null; // { data, ts }

async function fetchFresh() {
  const res = await fetchWithTimeout(BASE_URL + '/', {}, TIMEOUT_MS);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const json = await res.json();
  // ⚠️ ساختار واقعی سرویس (طبق نمونه‌ی جدید) یک آبجکت تودرتوست، نه فیلدهای مستقیم روی ریشه:
  // { "ali1377": { ps_buy, ps_sell, ... } }
  // به‌جای قفل‌شدن روی اسم کلید بیرونی «ali1377» (که ممکنه فقط اسم اکانت/پروژه باشه و عوض بشه)،
  // همیشه اولین مقدار آبجکت بیرونی رو برمی‌داریم — تا اگه اسم کلید عوض شد چیزی نشکنه.
  if (json && typeof json === 'object' && !Array.isArray(json)) {
    const values = Object.values(json);
    if (values.length > 0 && values[0] && typeof values[0] === 'object') {
      return values[0];
    }
  }
  return json; // فال‌بک: اگه یه روز ساختار صاف/مستقیم شد، همینجوری هم کار می‌کنه
}

// خروجی: { ps_buy, ps_sell, premium_buy, premium_sell, u_buy, u_sell, tether_usd, utopia_usd, stale? }
async function getPrices() {
  if (cache && (Date.now() - cache.ts) < CACHE_TTL_MS) {
    return cache.data;
  }
  try {
    const data = await fetchFresh();
    cache = { data, ts: Date.now() };
    return data;
  } catch (e) {
    if (cache) return { ...cache.data, stale: true }; // فال‌بک به آخرین قیمت معتبر به‌جای خطا نشان‌دادن به کاربر
    console.log('❌ خطا در دریافت قیمت از price-service:', e.message);
    return null;
  }
}

async function checkHealth() {
  try {
    const res = await fetchWithTimeout(BASE_URL + '/health', {}, TIMEOUT_MS);
    const text = (await res.text()).trim();
    return res.ok && text === 'OK';
  } catch (e) {
    return false;
  }
}

// ==================== نوار درصد تزئینی (هدف ۲) ====================
// بدون هیچ تایمر/بک‌گراند جابی محاسبه می‌شود — فقط لحظه‌ای که پیام Live Price ساخته می‌شود.
// برای همین مصرف رندر عملاً صفر است: نه پیامی خودکار ادیت می‌شود، نه جابی در پس‌زمینه می‌چرخد.
// نوسان با یک موج سینوسی با دوره‌ی بلند (پیش‌فرض ۲۵ دقیقه) ساخته می‌شود، پس بین دو بار باز کردن
// منو با فاصله‌ی کم، عدد تقریباً ثابت می‌ماند؛ ولی در طول زمان به‌آرامی بین min و max بالا/پایین می‌شود.
function slowFluctuatingPercent(key, min = 20, max = 90, periodMs = 25 * 60 * 1000) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  const phase = (hash % 1000) / 1000 * Math.PI * 2;
  const t = Date.now() / periodMs;
  const wave = (Math.sin(t * Math.PI * 2 + phase) + 1) / 2; // بین ۰ و ۱
  return Math.round(min + wave * (max - min));
}

function renderBar(percent, filledChar, emptyChar, totalSegments) {
  const filled = Math.max(0, Math.min(totalSegments, Math.round((percent / 100) * totalSegments)));
  return filledChar.repeat(filled) + emptyChar.repeat(totalSegments - filled);
}

// ==================== نگاشت محصول ← فیلد price-service (مشکل ۳) ====================
// فقط محصولاتی که واقعاً روی price-service تعریف شدن اینجا هستن. هات ووچر عمداً نیست —
// نه price-service همچین فیلدی داره نه uWallet اندپوینت قیمت داره؛ برای هات ووچر همیشه
// باید قیمت دستی پنل استفاده بشه (fallback طبیعی، نه یک حالت خطا).
const BUY_FIELD_MAP = { voucher: 'u_buy', premium_voucher: 'premium_buy', ps_voucher: 'ps_buy' };
const SELL_FIELD_MAP = { uvoucher: 'u_sell', premiumvoucher: 'premium_sell', psvoucher: 'ps_sell' };

// خروجی: { success:false } اگه این محصول روی price-service نیست یا سرویس جواب نداد
// (caller باید خودش fallback به قیمت دستی بزنه)، وگرنه { success:true, price, stale? }
async function getLivePrice(type, productKey) {
  const map = type === 'sell' ? SELL_FIELD_MAP : BUY_FIELD_MAP;
  const field = map[productKey];
  if (!field) return { success: false };

  const prices = await getPrices();
  if (!prices || prices[field] === undefined || prices[field] === null || isNaN(Number(prices[field]))) {
    return { success: false };
  }
  return { success: true, price: Number(prices[field]), stale: !!prices.stale };
}

// آیا این محصولِ خرید «قیمت آنلاین» دارد؟ (یو ووچر، پریمیوم ووچر، پی‌اس ووچر)
// این تنها منبع حقیقت برای تشخیص است: حداقل خرید = ۱ واحد با قیمت آنلاین، و مقدار سفارش
// به uWallet = مبلغ ÷ قیمت واحد آنلاین. هات ووچر عمداً اینجا نیست (حداقل دستی از پنل).
function isOnlineBuyProduct(productKey) {
  return Object.prototype.hasOwnProperty.call(BUY_FIELD_MAP, productKey);
}

module.exports = { getPrices, checkHealth, slowFluctuatingPercent, renderBar, getLivePrice, isOnlineBuyProduct };
