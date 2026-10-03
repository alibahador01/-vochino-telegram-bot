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
  return res.json();
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

module.exports = { getPrices, checkHealth, slowFluctuatingPercent, renderBar };
