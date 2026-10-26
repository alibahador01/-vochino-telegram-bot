// abanGateway.js
// کلاینت اختصاصی API «آبان گیت‌وی» (کارت‌به‌کارت با تأیید خودکار از روی پیامک بانک)، دقیقاً طبق
// همان صفحه‌ی «مستندات API» که برای این قابلیت فرستاده شد — بدون هیچ پارامتر یا ساختار فرضی.
// مثل uwallet.js، این فایل فقط «حرف‌زدن با آبان» را بلد است؛ منطق کیف‌پول/idempotency جای دیگری
// است (finalizeGatewayDeposit در db.js، وبهوک در index.js) — همان تفکیکی که برای uWallet هم رعایت شده.
//
// ⚠️ درباره‌ی وب‌هوک و امضا: صفحه‌ای که فرستادید («مستندات API») فقط API چهارگانه‌ی فاکتورها
// (ساخت/استعلام/تأیید/لغو) را مستند می‌کند؛ هیچ بخش «وب‌هوک»ی در فهرست همان صفحه نیست و شکل
// دقیق بدنه‌اش یا الگوریتم امضایش جایی گفته نشده. طبق قانونی که خودتان گذاشتید («هیچ حدسی نزن»)،
// اینجا هیچ هدر/الگوریتم امضای حدسی پیاده نشده — چون یک چک امضای غلط از نبودنش هم خطرناک‌تره
// (حس امنیت دروغین). در عوض از همان الگویی استفاده شده که بسته‌ی رسمی PHP آبان خودش توصیه
// می‌کند: «به بدنه‌ی وب‌هوک اعتماد نکن؛ وضعیت را از API بپرس». یعنی وب‌هوک فقط یک محرک است،
// و بلافاصله با توکن Bearer واقعی خودمان از endpoint یک‌بارمصرف verify تأیید می‌گیریم — امنیتش
// از هر امضای حدسی بالاتره، و idempotency یک‌بارمصرفش (۴۰۹ already_verified) هم رایگان میاد.
// اگر بعداً مستندات رسمی وب‌هوک (هدر امضا) هم در دسترس بود، می‌شود یک چک امضای اضافه روی همین
// پایه گذاشت — بدون اینکه چیزی از این مسیر فعلی خراب شود.

const { fetchWithTimeout } = require('./util/http');

const BASE_URL = 'https://abangateway.ir/api/v1';
const TIMEOUT_MS = 15000;

function apiKey() {
  return (process.env.ABAN_API_KEY || '').trim();
}

// ==================== ترجمه‌ی فارسی کدهای خطا (عیناً از جدول «کدهای خطا» مستندات) ====================
const ERROR_MESSAGES_FA = {
  not_yet_paid: 'هنوز واریزی برای این فاکتور تشخیص داده نشده',
  insufficient_fee_wallet: 'کیف پول کارمزد درگاه خالی است',
  sandbox_only: 'این عملیات فقط با توکن آزمایشی کار می‌کند',
  agent_disabled: 'کلید نماینده غیرفعال شده',
  agency_not_enabled: 'نمایندگی درگاه برای این فروشگاه فعال نیست',
  invoice_not_found: 'فاکتور یافت نشد',
  already_verified: 'این فاکتور قبلاً تأیید شده',
  invoice_not_payable: 'وضعیت فعلی فاکتور اجازه‌ی این عملیات را نمی‌دهد',
  no_card_registered: 'هیچ کارت فعالی روی حساب درگاه ثبت نشده',
  agent_has_no_card: 'کارت فعالی برای این نماینده نیست',
  cards_reserved_for_agents: 'همه کارت‌های فعال برای نماینده‌ها رزرو شده‌اند',
  invoice_expired: 'مهلت پرداخت این فاکتور تمام شده',
  invalid_request: 'بدنه‌ی درخواست ناقص یا نادرست است',
  amount_not_allowed: 'مبلغ خارج از محدوده‌ی مجاز درگاه است',
  unsafe_callback_url: 'آدرس بازگشت (callback_url) پذیرفته نشد',
  agent_not_found: 'نماینده‌ای با این کد یافت نشد',
  capacity_full: 'ظرفیت پرداخت روی کارت‌های درگاه پر است؛ کمی بعد دوباره امتحان کنید'
};

async function callAban(method, path, body) {
  const url = BASE_URL + path;
  try {
    const res = await fetchWithTimeout(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey()
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    }, TIMEOUT_MS);

    const rawText = await res.text();
    let data = null;
    try { data = rawText ? JSON.parse(rawText) : null; } catch (e) { /* پاسخ JSON نبود */ }

    if (!res.ok) {
      const code = data && data.error && data.error.code;
      const faMsg = (code && ERROR_MESSAGES_FA[code]) || (data && data.error && data.error.message) || rawText || ('خطای HTTP ' + res.status);
      return { success: false, httpStatus: res.status, errorCode: code || null, error: faMsg, raw: data };
    }
    return { success: true, httpStatus: res.status, data, raw: data };
  } catch (err) {
    return {
      success: false,
      httpStatus: null,
      errorCode: null,
      error: 'خطا در ارتباط با آبان گیت‌وی: ' + err.message + (err.name === 'AbortError' ? ' [timeout]' : '')
    };
  }
}

// ==================== ساخت فاکتور ====================
// amountToman: مبلغ به تومان همان‌طور که کاربر در ربات وارد می‌کند. مستندات صریح است: «ورودی API
// همیشه ریال است، تومان هیچ‌وقت پذیرفته نمی‌شود» — تبدیل ×۱۰ فقط همین‌جا انجام می‌شود تا این
// قانون یک‌جا رعایت شود، نه در هر جایی که این تابع صدا زده می‌شود.
async function createInvoice({ amountToman, orderId, callbackUrl, description, metadata, expiryMinutes }) {
  const amountRial = Math.round(Number(amountToman) * 10);
  if (!amountRial || amountRial <= 0) {
    return { success: false, error: 'مبلغ نامعتبر است.' };
  }
  const body = { amount_rial: amountRial };
  if (orderId) body.order_id = String(orderId).slice(0, 128);
  if (callbackUrl) body.callback_url = callbackUrl;
  if (description) body.description = String(description).slice(0, 1000);
  if (metadata) body.metadata = metadata;
  if (expiryMinutes) body.expiry_minutes = Math.min(1440, Math.max(1, Math.round(expiryMinutes)));

  const result = await callAban('POST', '/invoices', body);
  if (!result.success) return result;
  const d = result.data || {};
  if (!d.invoice_id || !d.payment_url || d.payable_rial === undefined) {
    return { success: false, error: 'پاسخ ساخت فاکتور از آبان گیت‌وی ناقص بود.', raw: d };
  }
  return {
    success: true,
    invoiceId: d.invoice_id,
    status: d.status,
    amountRial: Number(d.amount_rial),
    payableRial: Number(d.payable_rial),
    // ⚠️ مبلغی که باید به کاربر نشان داد و در دکمه بگذاریم همین است، نه amount_rial/amountToman
    // ورودی — طبق مستندات، همین چند-ریال اضافه است که فاکتور را از روی پیامک بانک شناسایی می‌کند.
    payableToman: Math.round(Number(d.payable_rial) / 10),
    paymentUrl: d.payment_url,
    cardNumber: d.card_number,
    expiresAt: d.expires_at,
    isTest: !!d.is_test,
    raw: d
  };
}

// ==================== استعلام وضعیت (هر چند بار لازم باشد) ====================
async function getInvoiceStatus(invoiceId) {
  const result = await callAban('GET', '/invoices/' + encodeURIComponent(invoiceId));
  if (!result.success) return result;
  const d = result.data || {};
  return { success: true, status: d.status, amountRial: Number(d.amount_rial || 0), paidAt: d.paid_at || null, raw: d };
}

// ==================== تأیید — یک‌بار و فقط یک‌بار ====================
// طبق مستندات: اولین فراخوانی موفق verified:true می‌دهد؛ هر فراخوانی بعدی ۴۰۹/already_verified
// می‌دهد — این خودش idempotency سمت آبان است (مستقل از گارد محلی‌مان در db.js).
async function verifyInvoice(invoiceId) {
  const result = await callAban('POST', '/invoices/' + encodeURIComponent(invoiceId) + '/verify', {});
  if (result.success) {
    const d = result.data || {};
    return { success: true, verified: !!d.verified, orderId: d.order_id, amountRial: Number(d.amount_rial || 0), paidAt: d.paid_at, raw: d };
  }
  // ۴۰۹/already_verified یک حالت عادیِ انتظارمی‌رود است (نه خطای واقعی) — جدا مشخصش می‌کنیم تا
  // صدازننده بدون پارس‌کردن errorCode مستقیم بتواند چکش کند (دقیقاً سناریوی ریکاوری بعد از کرش).
  if (result.httpStatus === 409 && result.errorCode === 'already_verified') {
    return { success: false, alreadyVerified: true, error: result.error, errorCode: result.errorCode, httpStatus: 409 };
  }
  return result;
}

// ==================== لغو فاکتور پرداخت‌نشده ====================
async function cancelInvoice(invoiceId) {
  return callAban('POST', '/invoices/' + encodeURIComponent(invoiceId) + '/cancel', {});
}

// ==================== شبیه‌سازی پرداخت — فقط با توکن ag_test_ (ابزار تست خودتان) ====================
async function simulatePayment(invoiceId) {
  return callAban('POST', '/invoices/' + encodeURIComponent(invoiceId) + '/simulate-payment', {});
}

module.exports = {
  ERROR_MESSAGES_FA,
  createInvoice,
  getInvoiceStatus,
  verifyInvoice,
  cancelInvoice,
  simulatePayment
};
