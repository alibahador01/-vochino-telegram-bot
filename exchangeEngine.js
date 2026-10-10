// exchangeEngine.js
// موتور اتصال به صرافی‌ها (API) + محاسبه و کسر خودکار کارمزد.
// طراحی: هر محصول (خرید/فروش، کاملاً مستقل) می‌تواند به هر تعداد صرافی وصل شود
// (جدول product_api_links) و به ترتیب "اولویت" فراخوانی می‌شود (فیل‌اوور خودکار).
// چون هیچ صرافی واقعی وصل نیست، این موتور به‌صورت پیش‌فرض در "حالت دستی" است
// و هیچ درخواست واقعی به بیرون نمی‌فرستد؛ فقط وقتی ادمین از پنل حالت را
// روی "خودکار" بگذارد و صرافی را با اطلاعات واقعی ثبت/فعال کند، اجرا می‌شود.

const {
  pool, getSetting, getApiChainForProduct,
  setOrderFulfillment, setSellOrderFulfillment,
  setSellOrderPendingUwallet, finalizeSellOrderUwallet,
  logTransaction
} = require('./db');
const uwallet = require('./uwallet');
const { isInvalidVoucherCodeError } = require('./uwallet');
const priceService = require('./priceService');
const { isOnlineBuyProduct } = require('./priceService');
const { checkAndGrantBonuses } = require('./handlers/bonusEngine');

// ==================== محاسبه کارمزد (منبع واحد، هم برای دستی هم API) ====================
function calculateCommission(commissionType, commissionValue, baseAmount) {
  const value = parseFloat(commissionValue) || 0;
  if (commissionType === 'percentage') {
    return Math.round(baseAmount * (value / 100));
  }
  if (commissionType === 'fixed') {
    return Math.round(value);
  }
  return 0;
}

// خرید: مبلغ نهایی‌ای که از کاربر کسر می‌شود = مبلغ + کارمزد (کارمزد سود ماست)
// تعداد واحد کوین از روی مبلغ تومانی و قیمت واحد آنلاین — گرد به پایین تا ۲ رقم اعشار.
// مثال: ۳۰۰,۰۰۰ تومان با قیمت واحد ۲۷۴,۵۱۹ → 1.09 واحد
function unitsFromAmount(amountToman, unitPrice) {
  const a = Number(amountToman), p = Number(unitPrice);
  if (!a || !p || p <= 0) return 0;
  return Math.floor((a / p) * 100) / 100;
}

function calculateBuyFinal(baseAmount, product) {
  const commission = calculateCommission(product.commission_type, product.commission_value, baseAmount);
  return { commission, finalAmount: baseAmount + commission };
}

// فروش: مبلغی که به کاربر پرداخت می‌شود = مبلغ پایه - کارمزد (کارمزد سود ماست)
function calculateSellPayout(baseAmount, product) {
  const commission = calculateCommission(product.commission_type, product.commission_value, baseAmount);
  const payout = Math.max(0, baseAmount - commission);
  return { commission, payout };
}

async function isAutoExecutionEnabled() {
  return (await getSetting('api_execution_mode', 'manual')) === 'auto';
}

// ==================== قیمت واحد محصول (دستی ← خودکار وقتی API وصل شد) ====================
// منطق: تا وقتی هیچ صرافی به این محصول وصل نیست یا حالت اجرا «دستی»ست،
// قیمتی که ادمین در پنل ثبت کرده (products.unit_price) همان چیزی‌ست که نمایش داده می‌شود.
// به محض این‌که ادمین صرافی را برای همین محصول (product_api_links) وصل/فعال کند
// و حالت اجرا را روی «خودکار» بگذارد، این تابع خودش سراغ صرافی می‌رود، آخرین
// قیمت را می‌گیرد و جایگزین قیمت دستی می‌کند — بدون این‌که لازم باشد کسی دست به کد بزند.
// اگر صرافی جواب ندهد/خطا بدهد، به‌صورت خودکار به قیمت دستی برمی‌گردد (fallback امن).
const PRICE_CACHE_TTL_MS = 60 * 1000; // برای جلوگیری از بمباران درخواست به صرافی سر هر پیام کاربر
const priceCache = new Map(); // key: `${productType}:${productKey}` -> { price, source, ts }

async function fetchProviderPrice(apiSource, productType, productKey) {
  // uWallet هیچ اندپوینت قیمت لحظه‌ای ندارد (طبق تصمیم قطعی پروژه) — همیشه برمی‌گردیم به قیمت دستی پنل.
  if (apiSource && apiSource.type === 'uwallet') {
    return { success: false, error: 'uWallet قیمت لحظه‌ای ندارد؛ قیمت از پنل (دستی) خوانده می‌شود.' };
  }
  if (!apiSource || !apiSource.base_url) {
    return { success: false, error: 'صرافی بدون base_url است.' };
  }
  const endpointMap = {
    voucher: '/api/v1/voucher',
    crypto: '/api/v1/crypto',
    star: '/api/v1/stars',
    gift: '/api/v1/gift',
    filter: '/api/v1/vpn',
    multi: '/api/v1/order'
  };
  const path = endpointMap[apiSource.type] || '/api/v1/order';
  const url = apiSource.base_url.replace(/\/+$/, '') + path;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': apiSource.api_key || '',
        'X-API-SECRET': apiSource.secret_key || ''
      },
      body: JSON.stringify({ action: 'price', product: productKey, type: productType }),
      signal: AbortSignal.timeout(10000)
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.success === false) {
      return { success: false, error: (data && data.message) || `پاسخ نامعتبر از صرافی ${apiSource.name} (HTTP ${res.status})` };
    }
    const price = Number(data.price ?? data.unit_price ?? data.rate);
    if (!price || price <= 0) {
      return { success: false, error: `صرافی ${apiSource.name} قیمت معتبری برنگرداند.` };
    }
    return { success: true, price };
  } catch (err) {
    return { success: false, error: 'خطا در دریافت قیمت از صرافی ' + apiSource.name + ': ' + err.message };
  }
}

// خروجی: { price, source: 'api'|'manual'|'none', apiSourceName? }
// product باید شامل key و unit_price (قیمت دستی فعلی از پنل) باشد.
// type: 'buy' یا 'sell' — کاملاً مستقل از هم، چون ممکنه یه محصول فقط سمت خرید یا فقط سمت فروش به API وصل باشه
async function getEffectiveUnitPrice(product, type = 'buy') {
  const manualPrice = Number(product.unit_price || 0);

  // ⚠️ رفع مشکل «قیمت آنلاین نمایش داده نمی‌شه»: price-service یک منبع قیمت کاملاً مستقله —
  // نه به حالت اجرای خودکار سفارش‌ها (api_execution_mode) ربطی داره، نه به زنجیره‌ی api_sources.
  // قبلاً این تابع فقط دنبال قیمت از زنجیره‌ی صرافی‌های وصل‌شده می‌گشت؛ چون uWallet اصلاً اندپوینت
  // قیمت نداره (fetchProviderPrice برای type==='uwallet' همیشه fail برمی‌گردونه)، همیشه قیمت
  // دستی نشون داده می‌شد. الان قبل از هر چیز price-service امتحان می‌شه (برای U/Premium/PS
  // ووچر که روی اون سرویس تعریف شدن)؛ برای هات ووچر (که اصلاً روی price-service نیست) این
  // مرحله هیچ‌کاری نمی‌کنه و مستقیم می‌ره سراغ چیزی که از قبل بود (زنجیره‌ی API یا قیمت دستی).
  try {
    const live = await priceService.getLivePrice(type, product.key);
    if (live.success) {
      return { price: live.price, source: 'price-service' };
    }
  } catch (e) {
    console.log(`❌ خطا در دریافت قیمت زنده از price-service برای ${type}:${product.key}:`, e.message);
  }

  if (!(await isAutoExecutionEnabled())) {
    return { price: manualPrice, source: 'manual' };
  }

  const chain = await getApiChainForProduct(type, product.key);
  if (chain.length === 0) {
    return { price: manualPrice, source: 'manual' };
  }

  const cacheKey = `${type}:${product.key}`;
  const cached = priceCache.get(cacheKey);
  if (cached && (Date.now() - cached.ts) < PRICE_CACHE_TTL_MS) {
    return { price: cached.price, source: cached.source, apiSourceName: cached.apiSourceName };
  }

  const tableName = type === 'sell' ? 'sell_products' : 'products';
  for (const apiSource of chain) {
    const result = await fetchProviderPrice(apiSource, type, product.key);
    if (result.success) {
      priceCache.set(cacheKey, { price: result.price, source: 'api', apiSourceName: apiSource.name, ts: Date.now() });
      // برای دیده‌شدن در پنل ادمین که آخرین قیمت از کجا آمده (صرفاً اطلاع‌رسانی، تصمیم منطقی نیست)
      try { await pool.query(`UPDATE ${tableName} SET price_source = $1 WHERE key = $2`, ['api', product.key]); } catch (e) {}
      return { price: result.price, source: 'api', apiSourceName: apiSource.name };
    }
    console.log(`❌ دریافت قیمت از صرافی ${apiSource.name} برای ${type}:${product.key} شکست خورد: ${result.error}`);
  }

  // همه‌ی صرافی‌ها شکست خوردند → برگشت امن به قیمت دستی، بدون توقف کار ربات
  try { await pool.query(`UPDATE ${tableName} SET price_source = $1 WHERE key = $2`, ['manual', product.key]); } catch (e) {}
  return { price: manualPrice, source: 'manual' };
}

// ==================== فراخوانی عمومی صرافی ====================
// این تابع فقط زمانی واقعاً به بیرون درخواست می‌زند که apiSource.base_url ست شده باشد
// و حالت اجرا "خودکار" باشد. ساختار درخواست/پاسخ بر اساس apiSource.type انتخاب می‌شود.
// خروجی همیشه یکسان است: { success, providerTxId, apiCost, raw, error }
async function callProviderApi(apiSource, action, payload) {
  // ==================== شاخه‌ی اختصاصی uWallet (قرارداد واقعی، نه قرارداد عمومی زیر) ====================
  if (apiSource && apiSource.type === 'uwallet') {
    const coin = payload.coinCode;
    if (!coin) {
      return { success: false, error: 'برای این محصول coin_code (کد کوین uWallet) در پنل تنظیم نشده است.' };
    }

    if (action === 'buy') {
      // ⚠️ رفع باگ ۱۰۰۲۹ (Minimum amount is not valid): طبق تست واقعی خودِ کاربر با curl،
      // uWallet مقدار «amount» کوین HotVoucher رو به ریال می‌خواد، نه تومان (۱ تومان = ۱۰ ریال؛
      // این با فرمت کد ووچرهای IRR-prefixed هم هم‌خونیه). {"amount":"20000"} رد شد (10029)،
      // {"amount":"200000"} رد نشد (رسید به 10022 که یعنی فقط موجودی کمه، نه مقدار نامعتبر).
      // این تبدیل فقط برای HotVoucher لازمه — UUSD (یو ووچر) از قبل درست کار می‌کنه و دست‌نخورده می‌مونه.
      const RIAL_PEGGED_COINS = ['HotVoucher'];
      let apiAmount;
      if (RIAL_PEGGED_COINS.includes(coin)) {
        apiAmount = Number(payload.amount) * 10;
      } else if (payload.isOnlinePriced) {
        // ⚠️ یو ووچر/پریمیوم/پی‌اس قیمت آنلاین دارن: کاربر مبلغ «تومان» وارد می‌کند، ولی uWallet
        // مقدار «واحد کوین» (مثلاً USD برای UUSD) می‌خواهد. پس مقدار = مبلغ ÷ قیمت واحد آنلاین،
        // با گرد کردن رو به پایین به ۲ رقم اعشار (تا هیچ‌وقت بیشتر از پولی که کاربر داده ساخته نشه).
        const units = unitsFromAmount(payload.amount, payload.unitPrice);
        if (!units || units < 0.01) {
          return { success: false, error: `مقدار محاسبه‌شده برای uWallet معتبر نیست (قیمت واحد آنلاین: ${payload.unitPrice || 0})` };
        }
        apiAmount = units.toFixed(2);
      } else {
        apiAmount = payload.amount;
      }

      // خرید کاربر از ما = ما از uWallet یک ووچر با موجودی‌مان می‌سازیم و کدش را تحویل می‌دهیم
      const r = await uwallet.createVoucher(apiSource, { coin, amount: apiAmount });
      // ⚠️ errorCode رو هم برمی‌گردونیم (نه فقط پیام) تا caller (tryAutoFulfillBuy) بتونه دقیقاً
      // تشخیص بده خطا از نوع «موجودی کافی نیست» (کد ۱۰۰۲۲ طبق مستندات uWallet) بوده یا نه
      if (!r.success) return { success: false, error: r.error, errorCode: r.errorCode };
      return {
        success: true,
        providerTxId: r.transactionId,
        apiCost: payload.amount,
        deliveredCode: r.code,
        deliveredHash: null,
        raw: r.raw
      };
    }

    if (action === 'sell') {
      // فروش کاربر به ما = ما کد ووچر مشتری را روی uWallet فعال (use) می‌کنیم
      const voucherCode = (payload.meta && payload.meta.voucherCode) || '';
      const r = await uwallet.useVoucher(apiSource, { coin, code: voucherCode });
      if (!r.success) return { success: false, error: r.error, errorCode: r.errorCode };

      // ⚠️ جداسازی دقیق کارمزد uWallet از کارمزد پنل: پاسخ همزمان POST /voucher/use فقط
      // receive برمی‌گردونه، نه fee یا amount (طبق مستندات رسمی uWallet). برای این‌که
      // api_cost واقعاً «کارمزدی که uWallet گرفته» باشه (نه صرفاً مبلغ خالص)، یک GET
      // /v1/transaction اضافه می‌زنیم تا fee دقیق رو بگیریم. این مبلغ فقط برای رهگیری/حسابداری
      // داخلی ماست؛ هیچ‌وقت روی مبلغ تومانی که به کاربر پرداخت می‌شه (calculateSellPayout، که
      // کاملاً بر مبنای قیمت دستی پنله) اثر نمی‌ذاره — دقیقاً طبق چیزی که خواسته شده بود.
      let providerFee;
      if (r.transactionId) {
        try {
          const txInfo = await uwallet.getTransactionStatus(apiSource, r.transactionId);
          if (txInfo.success && txInfo.fee !== undefined) providerFee = txInfo.fee;
        } catch (e) { /* اگه این تماس اضافه شکست بخوره، بی‌خطر به receive برمی‌گردیم، چیزی متوقف نمی‌شه */ }
      }

      return {
        success: true,
        status: r.status, // 'confirm' | 'pending' | 'reject'
        providerTxId: r.transactionId,
        // اگه fee دقیق گیر اومد همون؛ وگرنه receive (مبلغ خالص) به‌عنوان بهترین تخمین موجود
        apiCost: providerFee !== undefined ? providerFee : (r.receive !== undefined ? r.receive : 0),
        raw: r.raw
      };
    }

    return { success: false, error: 'عملیات نامعتبر برای uWallet: ' + action };
  }

  if (!apiSource || !apiSource.base_url) {
    return { success: false, error: 'صرافی بدون base_url — قابل فراخوانی نیست.' };
  }

  const endpointMap = {
    voucher: '/api/v1/voucher',
    crypto: '/api/v1/crypto',
    star: '/api/v1/stars',
    gift: '/api/v1/gift',
    filter: '/api/v1/vpn',
    multi: '/api/v1/order'
  };
  const path = endpointMap[apiSource.type] || '/api/v1/order';
  const url = apiSource.base_url.replace(/\/+$/, '') + path;

  const body = {
    action,           // 'buy' | 'sell'
    product: payload.productKey,
    amount: payload.amount,
    reference: payload.trackingCode,
    meta: payload.meta || {}
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': apiSource.api_key || '',
        'X-API-SECRET': apiSource.secret_key || ''
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000)
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data) {
      return { success: false, error: `پاسخ نامعتبر از صرافی ${apiSource.name} (HTTP ${res.status})` };
    }
    if (data.success === false) {
      return { success: false, error: data.message || `خطای اعلام‌شده توسط صرافی ${apiSource.name}` };
    }

    return {
      success: true,
      providerTxId: data.tx_id || data.transaction_id || null,
      apiCost: data.cost !== undefined ? Number(data.cost) : payload.amount,
      deliveredCode: data.code || data.voucher_code || null,
      deliveredHash: data.hash || data.voucher_hash || null,
      raw: data
    };
  } catch (err) {
    return { success: false, error: 'خطا در ارتباط با صرافی ' + apiSource.name + ': ' + err.message };
  }
}

// ==================== اجرای خودکار سفارش خرید ====================
// فراخوانی می‌شود بعد از ثبت سفارش در orders. اگر حالت دستی باشد یا اتصالی
// وجود نداشته باشد، کاری انجام نمی‌دهد و سفارش دقیقاً مثل قبل در انتظار تحویل دستی می‌ماند.
// ⚠️ نکته‌ی حیاتی (باگی که قبلاً وجود داشت و رفع شد): پارامتر amount باید «مبلغ پایه»
// باشد — یعنی همان چیزی که کاربر وارد کرده، بدون کارمزد. اگر اینجا finalAmount
// (مبلغ پایه + کارمزد) پاس داده شود، کارمزد/سود ما هم به صرافی داده می‌شود و
// عملاً سودی از این تراکنش نمی‌ماند. کارمزد فقط باید داخل خودمان (تفاوت بین چیزی
// که از کاربر گرفتیم و چیزی که به صرافی دادیم) باقی بماند، هرگز به payload صرافی اضافه نشود.
// ⚠️ رفع باگ حیاتی: این تابع الان «product» کامل را هم می‌گیرد (نه فقط productKey)،
// چون برای صرافی‌هایی مثل uWallet لازم است coin_code محصول (مثلاً UUSD/HotVoucher) را بدانیم —
// چیزی که فقط از روی productKey قابل استخراج نیست و باید از ردیف محصول خوانده شود.
async function tryAutoFulfillBuy({ orderId, telegramId, productKey, amount, trackingCode, product }, bot) {
  // 🔎 لاگ‌های واضح طبق درخواست: از همین خط مشخصه آیا اصلاً صرافی فراخوانی می‌شه یا نه، و چرا نه
  if (!(await isAutoExecutionEnabled())) {
    console.log(`ℹ️ [خرید خودکار] حالت اجرا روی «دستی»ست (تنظیمات پنل) — هیچ صرافی‌ای فراخوانی نمی‌شود. سفارش ${trackingCode} دستی می‌ماند.`);
    return { executed: false, reason: 'manual_mode' };
  }

  const chain = await getApiChainForProduct('buy', productKey);
  if (chain.length === 0) {
    console.log(`ℹ️ [خرید خودکار] هیچ صرافی‌ای به محصول «${productKey}» وصل نیست (product_api_links خالیه) — سفارش ${trackingCode} دستی می‌ماند.`);
    return { executed: false, reason: 'no_api_link' };
  }

  console.log(`🔄 [خرید خودکار] ${chain.length} صرافی برای «${productKey}» پیدا شد: ${chain.map(a => `${a.name}(${a.type})`).join(', ')} — سفارش ${trackingCode}`);

  // محصولات با قیمت آنلاین (یو/پریمیوم/پی‌اس ووچر): مقدار واحد کوین باید با قیمت واحد آنلاین
  // محاسبه شود، نه مبلغ تومانی خام. قیمت واحد همین لحظه خوانده می‌شود (price-service، با فال‌بک دستی).
  const isOnlinePriced = isOnlineBuyProduct(productKey);
  let onlineUnitPrice = 0;
  if (isOnlinePriced && product) {
    const { price } = await getEffectiveUnitPrice(product, 'buy');
    onlineUnitPrice = Number(price) || 0;
    if (onlineUnitPrice <= 0) {
      console.log(`⚠️ [خرید خودکار] قیمت واحد آنلاین برای «${productKey}» معتبر نیست — سفارش ${trackingCode} دستی می‌ماند.`);
      return { executed: false, reason: 'no_unit_price' };
    }
  }

  let uwalletLowBalance = false;
  let lastError = null;

  for (const apiSource of chain) {
    console.log(`🔄 [خرید خودکار] در حال فراخوانی ${apiSource.name} (نوع: ${apiSource.type}, coin_code: ${product && product.coin_code || '—'}) برای سفارش ${trackingCode}...`);
    const result = await callProviderApi(apiSource, 'buy', {
      productKey,
      amount,
      trackingCode,
      coinCode: product && product.coin_code,
      isOnlinePriced,
      unitPrice: onlineUnitPrice
    });
    if (result.success) {
      console.log(`✅ [خرید خودکار] ${apiSource.name} موفق شد — سفارش ${trackingCode}`);
      const updated = await setOrderFulfillment(orderId, {
        status: 'completed',
        apiSourceId: apiSource.id,
        apiCost: result.apiCost,
        providerTxId: result.providerTxId,
        deliveredCode: result.deliveredCode,
        deliveredHash: result.deliveredHash,
        fulfillmentMode: 'auto'
      });
      // updated === null یعنی این سفارش قبلاً completed شده بود (مثلاً فراخوانی تکراری) — دیگر پیام/لاگ تکراری نده
      if (!updated) return { executed: true, apiSource, result, duplicate: true };

      try {
        await logTransaction(telegramId, 'buy', 0, `خرید خودکار API (${trackingCode}) — صرافی: ${apiSource.name}`);
      } catch (e) {}
      if (bot) {
        try {
          await bot.telegram.sendMessage(telegramId,
            `🎉 سفارش شما به‌صورت خودکار انجام شد!\n🆔 ${trackingCode}` +
            (result.deliveredCode ? `\n📦 کد ووچر:\n${result.deliveredCode}` : '') +
            (result.deliveredHash ? `\n🔐 هش ووچر:\n${result.deliveredHash}` : '')
          );
        } catch (e) {}
        // ⚠️ همون رفع باگ «بونوس اولین خرید هیچ‌وقت صدا زده نمی‌شد» — برای مسیر خودکار (API) هم لازمه،
        // نه فقط تحویل دستی. checkAndGrantBonuses فقط از ctx.telegram.sendMessage استفاده می‌کنه،
        // پس همین { telegram: bot.telegram } جای ctx کاملاً کافیه.
        try { await checkAndGrantBonuses({ telegram: bot.telegram }, telegramId, 'purchase'); } catch (e) {}
      }
      return { executed: true, apiSource, result };
    }

    lastError = result.error;
    console.log(`❌ [خرید خودکار] ${apiSource.name} شکست خورد برای سفارش ${trackingCode}: ${result.error}${result.errorCode ? ' (کد ' + result.errorCode + ')' : ''}`);

    // کد ۱۰۰۲۲ طبق مستندات رسمی uWallet یعنی دقیقاً «Low balance» — موجودی کیف‌پول ما نزد uWallet کافی نیست
    if (apiSource.type === 'uwallet' && result.errorCode === 10022) {
      uwalletLowBalance = true;
    }
  }

  console.log(`⚠️ [خرید خودکار] همه‌ی صرافی‌های متصل شکست خوردند — سفارش ${trackingCode} دستی می‌ماند. آخرین خطا: ${lastError}`);
  return { executed: false, reason: 'all_providers_failed', uwalletLowBalance, lastError };
}

// ==================== اجرای خودکار سفارش فروش ====================
async function tryAutoFulfillSell({ sellOrderId, telegramId, productKey, amount, product, trackingCode, voucherCode }, bot) {
  if (!(await isAutoExecutionEnabled())) {
    console.log(`ℹ️ [فروش خودکار] حالت اجرا روی «دستی»ست (تنظیمات پنل) — سفارش فروش ${trackingCode} دستی می‌ماند.`);
    return { executed: false, reason: 'manual_mode' };
  }

  const chain = await getApiChainForProduct('sell', productKey);
  if (chain.length === 0) {
    console.log(`ℹ️ [فروش خودکار] هیچ صرافی‌ای به محصول «${productKey}» وصل نیست — سفارش فروش ${trackingCode} دستی می‌ماند.`);
    return { executed: false, reason: 'no_api_link' };
  }

  console.log(`🔄 [فروش خودکار] ${chain.length} صرافی برای «${productKey}» پیدا شد: ${chain.map(a => `${a.name}(${a.type})`).join(', ')} — سفارش فروش ${trackingCode}`);

  // کارمزد و مبلغ قابل‌پرداخت همیشه بر اساس «قیمت واحد دستی پنل» محاسبه می‌شود، نه عددی که
  // صرافی برمی‌گرداند — طبق تصمیم قطعی پروژه (uWallet قیمت لحظه‌ای ندارد).
  const { commission, payout } = calculateSellPayout(amount, product);

  let uwalletLowBalance = false;
  let lastError = null;

  for (const apiSource of chain) {
    console.log(`🔄 [فروش خودکار] در حال فراخوانی ${apiSource.name} (نوع: ${apiSource.type}, coin_code: ${product && product.coin_code || '—'}) برای سفارش فروش ${trackingCode}...`);
    const result = await callProviderApi(apiSource, 'sell', {
      productKey,
      amount,
      trackingCode,
      coinCode: product && product.coin_code,
      meta: { voucherCode }
    });

    if (!result.success) {
      console.log(`❌ [فروش خودکار] ${apiSource.name} شکست خورد برای فروش ${trackingCode}: ${result.error}${result.errorCode ? ' (کد ' + result.errorCode + ')' : ''}`);
      lastError = result.error;

      // ⚠️ رفع درخواست: کد ووچر نامعتبر/قبلاً استفاده‌شده (۱۰۰۰۹/۱۰۰۲۸/۱۰۰۴۹) مشکل از خودِ
      // کاربره، نه چیزی که با بررسی دستی ادمین حل بشه. این‌جا فوری و قطعی رد می‌کنیم، یک پیام
      // واضح به خودِ کاربر می‌دیم، و دیگه نه ادمین رو با یه سفارش «نیاز به بررسی» مزاحم می‌کنیم
      // نه صرافی بعدی تو زنجیره رو امتحان می‌کنیم (چون کد قطعاً غلطه، صرافی دیگه فرقی نمی‌کنه).
      if (apiSource.type === 'uwallet' && isInvalidVoucherCodeError(result.errorCode)) {
        const fin = await finalizeSellOrderUwallet(sellOrderId, { outcome: 'rejected', payout: 0, commission: 0, apiCost: 0 });
        if (!fin.applied) return { executed: true, apiSource, result, duplicate: true };
        if (bot) {
          try {
            await bot.telegram.sendMessage(telegramId,
              `❌ کد ووچر نامعتبر است یا قبلاً استفاده شده است.\n` +
              `📝 دلیل دقیق: ${uwallet.ERROR_CODES_FA[result.errorCode] || 'کد نامعتبر'}\n` +
              `🆔 ${trackingCode}\n\n` +
              `لطفاً از صحت کد ووچر مطمئن شوید و در صورت نیاز با پشتیبانی تماس بگیرید.`
            );
          } catch (e) {}
        }
        return { executed: true, apiSource, result, invalidCode: true, outcome: 'rejected' };
      }

      // کد ۱۰۰۲۲ («Low balance») طبق مستندات رسمی uWallet — یعنی موجودی کیف‌پول ما نزد uWallet
      // کافی نیست؛ مشکل از ماست نه از کاربر، پس باید مثل خرید به ادمین اطلاع واضح داده بشه.
      if (apiSource.type === 'uwallet' && Number(result.errorCode) === 10022) {
        uwalletLowBalance = true;
      }
      continue;
    }
    console.log(`✅ [فروش خودکار] ${apiSource.name} پاسخ داد — وضعیت: ${result.status || 'نامشخص'} — سفارش فروش ${trackingCode}`);

    // ==================== شاخه‌ی uWallet: ممکن است confirm / pending / reject باشد ====================
    if (apiSource.type === 'uwallet') {
      if (result.status === 'pending') {
        // هنوز نهایی نشده — نه رد قطعی و نه تأیید فوری. فقط شناسه‌ی تراکنش را ذخیره می‌کنیم
        // تا exchangePolling.js (هر ۳۰ ثانیه) و وبهوک /webhook/uwallet بعداً آن را نهایی کنند.
        // ⚠️ موجودی کاربر اینجا اصلاً شارژ نمی‌شود — فقط وقتی نتیجه‌ی قطعی برسد.
        await setSellOrderPendingUwallet(sellOrderId, { providerTxId: result.providerTxId, apiSourceId: apiSource.id });
        if (bot) {
          try {
            await bot.telegram.sendMessage(telegramId,
              `⏳ فروش شما در صف بررسی uWallet قرار گرفت و به‌زودی نهایی می‌شود.\n🆔 ${trackingCode}`
            );
          } catch (e) {}
        }
        return { executed: true, apiSource, result, pending: true };
      }

      // confirm یا reject — نهایی‌سازی اتمیک (جلوگیری از شارژ دوباره اگر وبهوک هم‌زمان برسد)
      const outcome = result.status === 'confirm' ? 'approved' : 'rejected';
      const fin = await finalizeSellOrderUwallet(sellOrderId, {
        outcome,
        payout,
        commission,
        apiCost: result.apiCost
      });
      if (!fin.applied) return { executed: true, apiSource, result, duplicate: true };

      try {
        await logTransaction(
          telegramId,
          outcome === 'approved' ? 'sell' : 'refund',
          outcome === 'approved' ? payout : 0,
          `فروش ${outcome === 'approved' ? 'تأیید' : 'رد'} شده توسط uWallet (${trackingCode})`
        );
      } catch (e) {}

      if (bot) {
        try {
          const msg = outcome === 'approved'
            ? `✅ فروش شما به‌صورت خودکار تأیید شد.\n💰 ${payout.toLocaleString('en-US')} تومان به کیف پول اضافه شد.\n🆔 ${trackingCode}`
            : `❌ فروش شما رد شد (کد نامعتبر یا قبلاً استفاده‌شده).\n🆔 ${trackingCode}`;
          await bot.telegram.sendMessage(telegramId, msg);
        } catch (e) {}
      }
      return { executed: true, apiSource, result, payout: outcome === 'approved' ? payout : 0, commission, outcome };
    }

    // ==================== شاخه‌ی عمومی (صرافی‌های غیر uWallet) ====================
    // ⚠️ همون گارد idempotency که شاخه‌ی uWallet بالاتر داره (fin.applied): اگه این سفارش از قبل
    // پردازش شده بود (نتیجه‌ی null)، دیگه کیف‌پول کاربر دوباره شارژ نمی‌شه.
    const fulfilled = await setSellOrderFulfillment(sellOrderId, {
      status: 'approved',
      amount: payout,
      commission,
      apiSourceId: apiSource.id,
      apiCost: result.apiCost,
      fulfillmentMode: 'auto'
    });
    if (!fulfilled) return { executed: true, apiSource, result, duplicate: true };
    await pool.query('UPDATE users SET balance = balance + $1 WHERE telegram_id = $2', [payout, String(telegramId)]);
    try {
      await logTransaction(telegramId, 'sell', payout, `فروش خودکار API (${trackingCode}) — صرافی: ${apiSource.name} — کارمزد: ${commission}`);
    } catch (e) {}
    if (bot) {
      try {
        await bot.telegram.sendMessage(telegramId,
          `✅ فروش شما به‌صورت خودکار تأیید شد.\n💰 ${payout.toLocaleString('en-US')} تومان به کیف پول اضافه شد.\n🆔 ${trackingCode}`
        );
      } catch (e) {}
    }
    return { executed: true, apiSource, result, payout, commission };
  }

  console.log(`⚠️ [فروش خودکار] همه‌ی صرافی‌های متصل شکست خوردند — سفارش فروش ${trackingCode} دستی می‌ماند. آخرین خطا: ${lastError}`);
  return { executed: false, reason: 'all_providers_failed', uwalletLowBalance, lastError };
}

module.exports = {
  calculateCommission,
  calculateBuyFinal,
  calculateSellPayout,
  unitsFromAmount,
  isAutoExecutionEnabled,
  callProviderApi,
  fetchProviderPrice,
  getEffectiveUnitPrice,
  tryAutoFulfillBuy,
  tryAutoFulfillSell
};
