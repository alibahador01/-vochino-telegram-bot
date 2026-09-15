// exchangeEngine.js
// موتور اتصال به صرافی‌ها (API) + محاسبه و کسر خودکار کارمزد.
// طراحی: هر محصول (خرید/فروش، کاملاً مستقل) می‌تواند به هر تعداد صرافی وصل شود
// (جدول product_api_links) و به ترتیب "اولویت" فراخوانی می‌شود (فیل‌اوور خودکار).
// چون هیچ صرافی واقعی وصل نیست، این موتور به‌صورت پیش‌فرض در "حالت دستی" است
// و هیچ درخواست واقعی به بیرون نمی‌فرستد؛ فقط وقتی ادمین از پنل حالت را
// روی "خودکار" بگذارد و صرافی را با اطلاعات واقعی ثبت/فعال کند، اجرا می‌شود.

const { pool, getSetting, getApiChainForProduct, setOrderFulfillment, setSellOrderFulfillment, logTransaction } = require('./db');

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
async function tryAutoFulfillBuy({ orderId, telegramId, productKey, amount, trackingCode }, bot) {
  if (!(await isAutoExecutionEnabled())) return { executed: false, reason: 'manual_mode' };

  const chain = await getApiChainForProduct('buy', productKey);
  if (chain.length === 0) return { executed: false, reason: 'no_api_link' };

  for (const apiSource of chain) {
    const result = await callProviderApi(apiSource, 'buy', { productKey, amount, trackingCode });
    if (result.success) {
      await setOrderFulfillment(orderId, {
        status: 'completed',
        apiSourceId: apiSource.id,
        apiCost: result.apiCost,
        providerTxId: result.providerTxId,
        deliveredCode: result.deliveredCode,
        deliveredHash: result.deliveredHash,
        fulfillmentMode: 'auto'
      });
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
      }
      return { executed: true, apiSource, result };
    }
    console.log(`❌ صرافی ${apiSource.name} برای سفارش ${trackingCode} شکست خورد: ${result.error}`);
  }

  return { executed: false, reason: 'all_providers_failed' };
}

// ==================== اجرای خودکار سفارش فروش ====================
async function tryAutoFulfillSell({ sellOrderId, telegramId, productKey, amount, product, trackingCode, voucherCode }, bot) {
  if (!(await isAutoExecutionEnabled())) return { executed: false, reason: 'manual_mode' };

  const chain = await getApiChainForProduct('sell', productKey);
  if (chain.length === 0) return { executed: false, reason: 'no_api_link' };

  const { commission, payout } = calculateSellPayout(amount, product);

  for (const apiSource of chain) {
    const result = await callProviderApi(apiSource, 'sell', { productKey, amount, trackingCode, meta: { voucherCode } });
    if (result.success) {
      await setSellOrderFulfillment(sellOrderId, {
        status: 'approved',
        amount: payout,
        commission,
        apiSourceId: apiSource.id,
        apiCost: result.apiCost,
        fulfillmentMode: 'auto'
      });
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
    console.log(`❌ صرافی ${apiSource.name} برای فروش ${trackingCode} شکست خورد: ${result.error}`);
  }

  return { executed: false, reason: 'all_providers_failed' };
}

module.exports = {
  calculateCommission,
  calculateBuyFinal,
  calculateSellPayout,
  isAutoExecutionEnabled,
  callProviderApi,
  fetchProviderPrice,
  getEffectiveUnitPrice,
  tryAutoFulfillBuy,
  tryAutoFulfillSell
};
