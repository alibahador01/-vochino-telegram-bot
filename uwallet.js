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

// پاسخ خطای uWallet مستندسازی نشده (نمونه‌ی دقیق JSON خطا در مستندات نیست)، پس این تابع
// به‌صورت تدافعی چند شکل محتمل را پوشش می‌دهد تا هرجور که برگردد، باز هم قابل‌فهم بماند.
function translateError(data, httpStatus, rawText) {
  const code = Number(
    (data && (data.code ?? data.error_code ?? data.errorCode)) ?? NaN
  );
  if (!isNaN(code) && ERROR_CODES_FA[code]) {
    return { code, message: `${ERROR_CODES_FA[code]} (کد ${code})` };
  }
  const msg = (data && (data.message || data.error)) || rawText || `خطای HTTP ${httpStatus}`;
  return { code: isNaN(code) ? null : code, message: msg };
}

function baseUrlOf(apiSource) {
  return ((apiSource && apiSource.base_url) || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

function tokenOf(apiSource) {
  return (apiSource && apiSource.api_key) || '';
}

async function callUwallet(apiSource, method, path, body) {
  const url = baseUrlOf(apiSource) + path;
  try {
    const res = await fetchWithTimeout(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': tokenOf(apiSource)
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    }, TIMEOUT_MS);

    const rawText = await res.text();
    let data = null;
    try { data = rawText ? JSON.parse(rawText) : null; } catch (e) { /* پاسخ JSON نبود */ }

    if (!res.ok) {
      const err = translateError(data, res.status, rawText);
      return { success: false, error: err.message, errorCode: err.code, raw: data };
    }
    return { success: true, data, raw: data };
  } catch (err) {
    return { success: false, error: 'خطا در ارتباط با uWallet: ' + err.message, errorCode: null };
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

module.exports = {
  ERROR_CODES_FA,
  translateError,
  createVoucher,
  useVoucher,
  getTransactionStatus
};
