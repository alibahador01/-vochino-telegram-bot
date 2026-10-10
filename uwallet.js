// uwallet.js
// کلاینت اختصاصی API واقعی uWallet (مطابق مستندات رسمی‌شان، نه قرارداد عمومی exchangeEngine).
// این فایل فقط «حرف زدن با uWallet» را بلد است؛ هیچ منطق سفارش/کیف‌پولی اینجا نیست —
// آن منطق در exchangeEngine.js (برای فراخوانی) و exchangePolling.js / index.js (برای پیگیری) است.
//
// همه‌ی توابع این فایل یک «apiSource» از جدول api_sources (type='uwallet') می‌گیرند که شامل
// base_url و api_key (= TOKEN) است. اگر ادمین base_url را خالی گذاشته باشد، آدرس پیش‌فرض رسمی
// uWallet استفاده می‌شود.

const { fetchWithTimeout } = require('./util/http');

const DEFAULT_BASE_URL = 'https://api.uwallet.biz';
const TIMEOUT_MS = 15000;

// ==================== ترجمه‌ی فارسی کدهای خطای uWallet (صفحه ۷ مستندات) ====================
const ERROR_CODES_FA = {
  10001: 'ایمیل تکراری است',
  10002: 'ایمیل معتبر نیست',
  10009: 'کد نامعتبر است',
  10010: 'کد اشتباه است',
  10018: 'مبلغ نامعتبر است',
  10019: 'کوین موردنظر وجود ندارد',
  10020: 'کوین نامعتبر است',
  10022: 'موجودی کافی نیست',
  10024: 'گیرنده نامعتبر است',
  10028: 'این کد قبلاً ساخته شده است',
  10029: 'حداقل مبلغ رعایت نشده است',
  10030: 'حداکثر مبلغ رعایت نشده است',
  10035: 'ارز نامعتبر است',
  10039: 'ارز مطابقت ندارد',
  10041: 'این پرداخت قبلاً انجام شده است',
  10042: 'آدرس خالی است',
  10045: 'شناسه‌ی یکتا تکراری است',
  10046: 'فلگ نامعتبر است',
  10047: 'شناسه‌ی کاربری نامعتبر است',
  10048: 'شناسه‌ی یکتا نامعتبر است',
  10049: 'این کد قبلاً استفاده شده است',
  10050: 'این کد در حال پردازش است'
};

// پاسخ خطای uWallet مستندسازی نشده (نمونه‌ی دقیق JSON خطا در مستندات نیست — فقط جدول کد←معنی
// هست، نه شکل دقیق بدنه‌ی خطا)، پس این تابع به‌صورت تدافعی چند شکل محتمل را پوشش می‌دهد.
function translateError(data, httpStatus, rawText) {
  let code = Number(
    (data && (data.code ?? data.error_code ?? data.errorCode)) ?? NaN
  );
  // ⚠️ یافته‌ی مهم (مبتنی بر رفتار تأییدشده‌ی uWallet، نه حدس تصادفی): خودِ تست curl ادمین نشون
  // داد پاسخ موفق uWallet به‌شکل {"message":200,"data":[]} هست — یعنی uWallet عادت داره کد رو مستقیم
  // تو فیلد «message» بذاره، نه یه فیلد اختصاصی مثل code/error_code. این شکل برای خطاها مستند
  // نشده، ولی چون این همون الگوییه که خودشون برای موفقیت استفاده می‌کنن، به‌عنوان حالت دوم
  // (fallback) امتحانش می‌کنیم: اگه فیلدهای اختصاصی بالا چیزی نداشتن ولی message یه عدد بود و
  // دقیقاً برابر با کد HTTP نبود (یعنی صرفاً تکرار status نیست)، همون رو به‌عنوان کد خطای واقعی
  // در نظر می‌گیریم. rawText همیشه تو لاگ کامل می‌مونه (پایین‌تر) تا اگه این فرض یه روز اشتباه
  // از آب دراومد، با یک پیام خطای واقعی بشه این تابع رو اصلاح کرد — نه با حدسِ دوباره.
  if (isNaN(code) && data && typeof data.message === 'number' && data.message !== httpStatus) {
    code = data.message;
  }
  if (!isNaN(code) && ERROR_CODES_FA[code]) {
    return { code, message: `${ERROR_CODES_FA[code]} (کد ${code})` };
  }
  // نکته‌ی مهم از تست واقعی: پاسخ موفق uWallet به‌شکل {"message":200,"data":[]} هست — یعنی
  // فیلد «message» خودش گاهی فقط همون کد HTTP خامه، نه یه توضیح متنی. برای همین اگه message
  // عدد بود و با httpStatus یکی بود، به‌جاش دنبال data.error یا بدنه‌ی خام می‌گردیم تا چیز
  // تکراری/بی‌فایده («401») به‌عنوان «توضیح» نشون داده نشه.
  const rawMsg = data && data.message;
  const msgLooksLikeStatusCode = typeof rawMsg === 'number' && rawMsg === httpStatus;
  const msg = (!msgLooksLikeStatusCode && rawMsg) || (data && data.error) || rawText || `خطای HTTP ${httpStatus}`;
  return { code: isNaN(code) ? null : code, message: msg };
}

// ⚠️ .trim() اینجا هم (نه فقط موقع ذخیره تو admin.js): اگه یه توکن/base_url قبلاً با فاصله یا
// خط جدید اضافه تو دیتابیس ذخیره شده، نیازی به حذف و دوباره‌ثبت صرافی نیست — همینجا خودش پاک می‌شه.
function baseUrlOf(apiSource) {
  return ((apiSource && apiSource.base_url) || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
}

function tokenOf(apiSource) {
  return ((apiSource && apiSource.api_key) || '').trim();
}

async function callUwallet(apiSource, method, path, body) {
  const url = baseUrlOf(apiSource) + path;
  try {
    const res = await fetchWithTimeout(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        // دقیقاً طبق مستندات uWallet: «authorization: TOKEN» — حروف کوچک، بدون Bearer.
        // (HTTP headers استاندارد case-insensitive ان، ولی برای مطابقت ۱۰۰٪ با چیزی که خودشون
        // گفتن، همینجوری تحت‌اللفظی می‌فرستیم تا هیچ شکی نمونه)
        'authorization': tokenOf(apiSource)
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    }, TIMEOUT_MS);

    const rawText = await res.text();
    let data = null;
    try { data = rawText ? JSON.parse(rawText) : null; } catch (e) { /* پاسخ JSON نبود */ }

    if (!res.ok) {
      const err = translateError(data, res.status, rawText);
      // ⚠️ رفع باگ «فقط کد 401 لاگ می‌شه»: قبلاً اینجا فقط err.message (که بعضی‌وقتا همون عدد
      // خام data.message بود، نه توضیح) برمی‌گشت. الان همیشه وضعیت HTTP + بدنه‌ی خام پاسخ uWallet
      // هم تو پیام خطا هست، صرف‌نظر از این‌که تونستیم کد خطا رو ترجمه کنیم یا نه.
      const fullMessage = `HTTP ${res.status} — ${err.message} | بدنه پاسخ uWallet: ${rawText || '(خالی)'}`;
      return { success: false, error: fullMessage, errorCode: err.code, httpStatus: res.status, raw: data };
    }
    return { success: true, data, raw: data };
  } catch (err) {
    // خطای سطح شبکه (نه HTTP) — کد خطای Node (مثل ECONNREFUSED/ENOTFOUND/ETIMEDOUT) هم اضافه می‌شه
    return {
      success: false,
      error: 'خطا در ارتباط با uWallet: ' + err.message + (err.code ? ' [کد: ' + err.code + ']' : ''),
      errorCode: null
    };
  }
}

// ==================== ساخت ووچر (سمت خرید ما: از موجودی uWallet یک کد ووچر می‌سازیم) ====================
// ورودی: coin (مثلاً UUSD یا HotVoucher)، amount (مقدار به واحد همان کوین، به‌صورت رشته طبق نمونه‌ی مستندات)
// خروجی: { success, transactionId, code, error, errorCode }
async function createVoucher(apiSource, { coin, amount }) {
  const result = await callUwallet(apiSource, 'POST', '/v1/voucher', {
    coin,
    amount: String(amount)
  });
  if (!result.success) return result;
  const data = result.data || {};
  if (!data.code || !data.transactionId) {
    return { success: false, error: 'پاسخ ساخت ووچر از uWallet ناقص بود (بدون code یا transactionId).', raw: data };
  }
  return { success: true, transactionId: data.transactionId, code: data.code, raw: data };
}

// ==================== فعال‌سازی ووچر (سمت فروش ما: کد ووچر مشتری را روی uWallet فعال می‌کنیم) ====================
// خروجی: { success, status: 'confirm'|'pending'|'reject', transactionId, receive, batchId, error, errorCode }
async function useVoucher(apiSource, { coin, code }) {
  const result = await callUwallet(apiSource, 'POST', '/v1/voucher/use', { coin, code });
  if (!result.success) return result;
  const data = result.data || {};
  if (!data.transactionId || !data.status) {
    return { success: false, error: 'پاسخ فعال‌سازی ووچر از uWallet ناقص بود (بدون status یا transactionId).', raw: data };
  }
  return {
    success: true,
    status: data.status, // 'confirm' | 'reject' | 'pending' (طبق مستندات، هرچیز غیر از 'reject' که فوری نیست را باید پول کرد)
    transactionId: data.transactionId,
    receive: data.receive !== undefined ? Number(data.receive) : undefined,
    batchId: data.batchId,
    raw: data
  };
}

// ==================== پیگیری وضعیت یک تراکنش (برای پندینگ‌ها، هر ۳۰ ثانیه) ====================
// خروجی: { success, status, receive, error }
async function getTransactionStatus(apiSource, transactionId) {
  const result = await callUwallet(
    apiSource,
    'GET',
    '/v1/transaction?id=' + encodeURIComponent(transactionId)
  );
  if (!result.success) return result;
  // طبق مستندات، GET /v1/transaction آرایه برمی‌گرداند؛ وقتی با id فیلتر می‌شود انتظار یک آیتم داریم
  const data = result.data;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !row.status) {
    return { success: false, error: 'تراکنش با این شناسه روی uWallet پیدا نشد.' };
  }
  return {
    success: true,
    status: row.status, // 'confirm' | 'reject' | در حال بررسی
    receive: row.receive !== undefined ? Number(row.receive) : undefined,
    fee: row.fee !== undefined ? Number(row.fee) : undefined,
    raw: row
  };
}

// ==================== موجودی کیف‌پول (ابزار تشخیصی برای پیدا کردن اسم واقعی کوین‌ها) ====================
// GET /v1/wallet — آرایه‌ای از {coin, amount, free, blocked} برای هر کوینی که حساب uWallet واقعاً
// توش موجودی/رکورد داره. وقتی پشتیبانی uWallet جواب نمی‌ده، این تنها راه رسمی و بدون‌حدسه که
// می‌تونی خودت از API خودشون بپرسی «دقیقاً اسم کوین‌هایی که تو حسابم تعریف شدن چیه». توجه: اگه
// حساب هیچ‌وقت تو یه کوین خاص (مثل Hot Voucher) تراکنش نداشته باشه، ممکنه اصلاً تو این لیست نباشه
// — یعنی خالی‌بودن لیست لزوماً یعنی «کوین غلطه» نیست، می‌تونه یعنی «هنوز هیچ موجودی‌ای توش نساختی».
async function getWalletBalances(apiSource) {
  const result = await callUwallet(apiSource, 'GET', '/v1/wallet');
  if (!result.success) return result;
  const rows = Array.isArray(result.data) ? result.data : [];
  return { success: true, balances: rows, raw: result.data };
}

// ==================== کدهای خطایی که «قطعاً مشکل از کد ووچر کاربره» (نه از ما/uWallet) ====================
// 10009=Code is not valid, 10028=Code already exists, 10049=Code already used — هر سه دقیقاً
// یعنی خودِ کدی که کاربر فرستاده یا فرمتش غلطه یا قبلاً مصرف/ساخته شده. این‌ها با چیزهایی مثل
// موجودی کم (10022) یا قطعی شبکه فرق دارن: نیازی به بررسی دستی ادمین ندارن، باید فوری و واضح
// به خودِ کاربر گفته بشه. فقط همین سه کد اینجان — هر کد دیگه‌ای (ناشناخته یا غیرمستند) محتاطانه
// هنوز می‌ره سمت فال‌بک بررسی دستی قبلی، نه این مسیر جدید.
const INVALID_CODE_ERROR_CODES = [10009, 10028, 10049];
function isInvalidVoucherCodeError(errorCode) {
  return INVALID_CODE_ERROR_CODES.includes(Number(errorCode));
}

// ==================== اعتبارسنجی فرمت کد ووچر قبل از فرستادن به API (رفع درخواست: صرفه‌جویی در
// یک فراخوانی بی‌فایده‌ی API + پیام فوری به کاربر به‌جای این‌که اول صف بررسی بشه بعد رد شود) ====================
// ⚠️ به‌جای قفل‌کردن فرمت رو «IRR + ۶۴ هگز» برای همه‌ی محصولات (که فقط برای Hot Voucher با تست
// واقعی تأیید شده، نه برای بقیه)، این تابع فرمت مورد انتظار رو مستقیم از روی sample_code همون
// محصول (که ادمین خودش از پنل تنظیم کرده) می‌سازه — یعنی فقط چیزی رو چک می‌کنه که واقعاً
// می‌دونیم، نه فرضی که برای یه محصول دیگه تأیید نشده.
function validateVoucherCodeFormat(code, sampleCode) {
  if (!sampleCode) return { valid: true }; // بدون نمونه برای مقایسه، فرمتی رد نمی‌کنیم
  const trimmed = (code || '').trim();
  if (trimmed.length !== sampleCode.length) {
    return { valid: false, reason: `طول کد باید دقیقاً ${sampleCode.length} کاراکتر باشد (کد واردشده ${trimmed.length} کاراکتر است).` };
  }
  const prefixMatch = sampleCode.match(/^[A-Za-z]+/);
  if (prefixMatch && !trimmed.startsWith(prefixMatch[0])) {
    return { valid: false, reason: `کد باید با «${prefixMatch[0]}» شروع شود.` };
  }
  return { valid: true };
}

module.exports = {
  ERROR_CODES_FA,
  translateError,
  createVoucher,
  useVoucher,
  getTransactionStatus,
  getWalletBalances,
  isInvalidVoucherCodeError,
  validateVoucherCodeFormat
};
