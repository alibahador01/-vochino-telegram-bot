'use strict';

const express = require('express');
const crypto = require('node:crypto');

const { pool, getUsdRate, getAllAdmins } = require('../db');
const { ADMIN_IDS } = require('../constants');
const priceService = require('../priceService');
const {
  calculateBuyFinal,
  calculateSellPayout,
  getEffectiveUnitPrice,
  tryAutoFulfillBuy,
  tryAutoFulfillSell,
} = require('../exchangeEngine');
const { isOnlineBuyProduct } = priceService;
const { validateVoucherCodeFormat } = require('../uwallet');
const { ASSETS, ASSET_BY_ID, ASSET_ID_BY_PRODUCT_KEY } = require('./catalog');
const { createTelegramAuthMiddleware } = require('./telegram-auth');

const MAX_POSTGRES_INTEGER = 2_147_483_647;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

class ApiError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function asyncRoute(handler) {
  return function wrappedRoute(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function asFiniteNumber(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positiveNumber(value) {
  const number = asFiniteNumber(value, null);
  return number !== null && number > 0 ? number : null;
}

function dbFlag(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function normalizeCardNumber(value) {
  return String(value || '').replace(/\D/g, '');
}

function maskCardNumber(value) {
  const digits = normalizeCardNumber(value);
  if (!digits) return null;
  const lastFour = digits.slice(-4);
  return `•••• •••• •••• ${lastFour}`;
}

function makeTrackingCode() {
  return `VOC-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function parsePositiveInteger(value, fallback, maximum) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, maximum);
}

function createWindowRateLimiter({ windowMs, max, keyGenerator }) {
  const buckets = new Map();

  return function rateLimit(req, res, next) {
    const now = Date.now();
    const key = keyGenerator(req);
    let bucket = buckets.get(key);

    if (!bucket || now - bucket.startedAt >= windowMs) {
      bucket = { startedAt: now, count: 0 };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - bucket.count)));

    if (bucket.count > max) {
      const retryAfter = Math.max(1, Math.ceil((windowMs - (now - bucket.startedAt)) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'تعداد درخواست‌ها بیش از حد مجاز است؛ کمی بعد دوباره تلاش کنید.' },
      });
    }

    // Bound the in-process map during long-running deployments.
    if (buckets.size > 10_000) {
      for (const [bucketKey, entry] of buckets) {
        if (now - entry.startedAt >= windowMs) buckets.delete(bucketKey);
        if (buckets.size <= 8_000) break;
      }
    }
    return next();
  };
}

function createCorsMiddleware() {
  const allowedOrigins = new Set(
    String(process.env.WEBAPP_ORIGINS || process.env.WEBAPP_ORIGIN || '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );

  return function corsMiddleware(req, res, next) {
    const origin = req.get('origin');
    res.setHeader('Vary', 'Origin');

    if (origin) {
      if (!allowedOrigins.has(origin)) {
        return res.status(403).json({
          error: { code: 'ORIGIN_NOT_ALLOWED', message: 'مبدأ درخواست مجاز نیست.' },
        });
      }
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Idempotency-Key');
      res.setHeader('Access-Control-Max-Age', '600');
    }

    if (req.method === 'OPTIONS') return res.status(204).end();
    return next();
  };
}

function createSecurityHeaders() {
  return function securityHeaders(_req, res, next) {
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    return next();
  };
}

async function loadUserByTelegramId(telegramId) {
  const result = await pool.query(
    `SELECT telegram_id, full_name, phone, language, balance, bonus_balance,
            registered_at, verification_status, registration_step, is_blocked
       FROM users
      WHERE telegram_id = $1
      LIMIT 1`,
    [String(telegramId)],
  );
  return result.rows[0] || null;
}

function createRequireUserMiddleware() {
  return asyncRoute(async (req, _res, next) => {
    const user = await loadUserByTelegramId(req.telegram.id);
    if (!user) {
      throw new ApiError(
        404,
        'BOT_REGISTRATION_REQUIRED',
        'ابتدا ربات Vochino را در تلگرام /start کنید تا حساب شما در سامانه ساخته شود.',
      );
    }
    if (dbFlag(user.is_blocked)) {
      throw new ApiError(403, 'USER_BLOCKED', 'دسترسی این حساب به خدمات ووچینو مسدود است.');
    }
    req.dbUser = user;
    return next();
  });
}

function requireCompletedRegistration(req) {
  if (!req.dbUser || req.dbUser.registration_step !== 'completed') {
    throw new ApiError(
      403,
      'REGISTRATION_REQUIRED',
      'برای انجام معامله، ابتدا مراحل ثبت‌نام و احراز هویت ربات را کامل کنید.',
    );
  }
}

async function readProductRows() {
  const buyKeys = ASSETS.map((asset) => asset.buyProductKey).filter(Boolean);
  const sellKeys = ASSETS.map((asset) => asset.sellProductKey).filter(Boolean);
  const [buyResult, sellResult] = await Promise.all([
    pool.query('SELECT * FROM products WHERE key = ANY($1::text[])', [buyKeys]),
    pool.query('SELECT * FROM sell_products WHERE key = ANY($1::text[])', [sellKeys]),
  ]);

  return {
    buyProducts: new Map(buyResult.rows.map((row) => [row.key, row])),
    sellProducts: new Map(sellResult.rows.map((row) => [row.key, row])),
  };
}

function selectLiveOrManualPrice(liveValue, manualValue, isStale = false) {
  // A stale provider cache must never be silently treated as a current executable quote.
  if (!isStale) {
    const live = positiveNumber(liveValue);
    if (live !== null) return { price: live, source: 'price-service' };
  }

  const manual = positiveNumber(manualValue);
  if (manual !== null) {
    return {
      price: manual,
      source: isStale ? 'database-manual-stale-feed-fallback' : 'database-manual',
    };
  }

  return { price: null, source: 'unavailable' };
}

async function resolveMarketPrice(asset, side, product, prices, usdRate) {
  if (asset.usdPriceField && side === 'buy') {
    const dollars = prices && !prices.stale
      ? positiveNumber(prices[asset.usdPriceField])
      : null;
    if (dollars !== null && usdRate > 0) {
      return {
        price: dollars * usdRate,
        source: 'price-service+usd-rate',
      };
    }

    // Never use an arbitrarily old cached USD reference for a new trade.
    return selectLiveOrManualPrice(null, product && product.unit_price, Boolean(prices && prices.stale));
  }

  const priceField = side === 'buy' ? asset.buyPriceField : asset.sellPriceField;
  if (priceField) {
    return selectLiveOrManualPrice(
      prices && prices[priceField],
      product && product.unit_price,
      Boolean(prices && prices.stale),
    );
  }

  if (product) {
    // For assets without a field in price-service (for example TRX), reuse the bot's
    // effective quote resolver so configured provider links and manual prices behave alike.
    const effective = await getEffectiveUnitPrice(product, side);
    const price = positiveNumber(effective && effective.price);
    if (price !== null) {
      return { price, source: effective.source || 'database-manual' };
    }

    if (side === 'buy' && product.price_type === 'usd' && usdRate > 0) {
      return { price: usdRate, source: 'settings-usd-rate' };
    }
  }

  return { price: null, source: 'unavailable' };
}

function resolveMinimumBuyToman(product, asset, quotePrice, usdRate) {
  if (!product) return null;
  const minimum = Math.max(0, asFiniteNumber(product.min_amount, 0));
  if (isOnlineBuyProduct(product.key)) return quotePrice;
  if (product.price_type === 'usd') return minimum * usdRate;
  return minimum;
}

async function getMarketPayload() {
  const [{ buyProducts, sellProducts }, prices, usdRateRaw] = await Promise.all([
    readProductRows(),
    priceService.getPrices(),
    getUsdRate(),
  ]);
  const usdRate = positiveNumber(usdRateRaw) || 0;

  const assets = await Promise.all(ASSETS.map(async (asset) => {
    const buyProduct = asset.buyProductKey ? buyProducts.get(asset.buyProductKey) : null;
    const sellProduct = asset.sellProductKey ? sellProducts.get(asset.sellProductKey) : null;

    const [buyQuote, sellQuote] = await Promise.all([
      resolveMarketPrice(asset, 'buy', buyProduct, prices, usdRate),
      resolveMarketPrice(asset, 'sell', sellProduct, prices, usdRate),
    ]);

    const buyEnabled = Boolean(
      buyProduct && dbFlag(buyProduct.active) && !dbFlag(buyProduct.hidden) && buyQuote.price !== null,
    );
    const sellEnabled = Boolean(
      sellProduct && dbFlag(sellProduct.active) && sellQuote.price !== null,
    );

    return {
      id: asset.id,
      name: asset.name,
      ticker: asset.ticker,
      buy: {
        enabled: buyEnabled,
        product_key: asset.buyProductKey,
        price_toman: buyQuote.price,
        price_source: buyQuote.source,
        min_amount_toman: resolveMinimumBuyToman(buyProduct, asset, buyQuote.price, usdRate),
        max_amount_toman: buyProduct && asFiniteNumber(buyProduct.max_amount, 0) > 0
          ? (buyProduct.price_type === 'usd'
            ? Number(buyProduct.max_amount) * usdRate
            : Number(buyProduct.max_amount))
          : null,
        unavailable_reason: buyEnabled ? null : (!buyProduct
          ? 'محصول خرید هنوز در دیتابیس تعریف نشده است.'
          : (!dbFlag(buyProduct.active) || dbFlag(buyProduct.hidden)
            ? 'خرید این محصول در پنل ربات غیرفعال است.'
            : 'نرخ معتبر خرید برای این محصول موجود نیست.')),
      },
      sell: {
        enabled: sellEnabled,
        product_key: asset.sellProductKey,
        price_toman: sellQuote.price,
        price_source: sellQuote.source,
        min_amount_toman: sellProduct ? asFiniteNumber(sellProduct.min_amount, 0) : null,
        unavailable_reason: sellEnabled ? null : (!sellProduct
          ? 'مسیر فروش این دارایی در ربات تعریف نشده است.'
          : (!dbFlag(sellProduct.active)
            ? 'فروش این محصول در پنل ربات غیرفعال است.'
            : 'نرخ معتبر فروش برای این محصول موجود نیست.')),
      },
    };
  }));

  return {
    currency: 'TOMAN',
    generated_at: new Date().toISOString(),
    price_service_available: Boolean(prices),
    price_service_stale: Boolean(prices && prices.stale),
    usd_rate_toman: usdRate || null,
    assets,
  };
}

async function assertDailyLimit(client, user, requestedAmount) {
  if (!['silver', 'gold'].includes(user.verification_status)) return;

  const settingKey = user.verification_status === 'gold' ? 'gold_daily_limit' : 'silver_daily_limit';
  const settingResult = await client.query('SELECT value FROM settings WHERE key = $1 LIMIT 1', [settingKey]);
  const fallbackLimit = user.verification_status === 'gold' ? 10_000_000 : 2_000_000;
  const limit = Math.max(0, asFiniteNumber(settingResult.rows[0] && settingResult.rows[0].value, fallbackLimit));

  const totals = await client.query(
    `SELECT
       (SELECT COALESCE(SUM(amount), 0) FROM orders
         WHERE telegram_id = $1
           AND status IN ('pending_delivery', 'completed')
           AND created_at >= CURRENT_DATE) AS buy_total,
       (SELECT COALESCE(SUM(amount), 0) FROM sell_orders
         WHERE telegram_id = $1
           AND status IN ('pending_review', 'approved', 'pending_uwallet')
           AND created_at >= CURRENT_DATE) AS sell_total`,
    [String(user.telegram_id)],
  );
  const used = asFiniteNumber(totals.rows[0].buy_total, 0) + asFiniteNumber(totals.rows[0].sell_total, 0);

  if (used + requestedAmount > limit) {
    throw new ApiError(422, 'DAILY_LIMIT_EXCEEDED', 'سقف معامله روزانه شما تکمیل شده است.', {
      limit_toman: limit,
      used_toman: used,
      remaining_toman: Math.max(0, limit - used),
    });
  }
}

async function reserveIdempotency(client, telegramId, idempotencyKey, requestHash) {
  await client.query(
    `INSERT INTO webapp_idempotency (telegram_id, idempotency_key, request_hash)
     VALUES ($1, $2, $3)
     ON CONFLICT (telegram_id, idempotency_key) DO NOTHING`,
    [String(telegramId), idempotencyKey, requestHash],
  );

  const result = await client.query(
    `SELECT request_hash, response_json
       FROM webapp_idempotency
      WHERE telegram_id = $1 AND idempotency_key = $2
      FOR UPDATE`,
    [String(telegramId), idempotencyKey],
  );
  const row = result.rows[0];

  if (!row) throw new ApiError(500, 'IDEMPOTENCY_STORAGE_ERROR', 'ذخیره‌سازی امن درخواست انجام نشد.');
  if (row.request_hash !== requestHash) {
    throw new ApiError(409, 'IDEMPOTENCY_KEY_REUSED', 'این کلید درخواست قبلاً برای اطلاعات متفاوتی استفاده شده است.');
  }
  return row.response_json || null;
}

async function storeIdempotentResponse(client, telegramId, idempotencyKey, response) {
  await client.query(
    `UPDATE webapp_idempotency
        SET response_json = $3::jsonb
      WHERE telegram_id = $1 AND idempotency_key = $2`,
    [String(telegramId), idempotencyKey, JSON.stringify(response)],
  );
}

function validateTradeRequest(body, idempotencyKey) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, 'INVALID_BODY', 'بدنه درخواست معتبر نیست.');
  }

  if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 128) {
    throw new ApiError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'هدر Idempotency-Key الزامی است و باید ۸ تا ۱۲۸ نویسه باشد.');
  }

  const side = body.side;
  if (side !== 'buy' && side !== 'sell') {
    throw new ApiError(400, 'INVALID_TRADE_SIDE', 'side باید buy یا sell باشد.');
  }

  const assetId = String(body.asset || '').trim();
  const asset = ASSET_BY_ID.get(assetId);
  if (!asset) throw new ApiError(404, 'ASSET_NOT_FOUND', 'دارایی در فهرست بازار ووچینو وجود ندارد.');

  if (side === 'buy') {
    const amount = Number(body.amount_toman);
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_POSTGRES_INTEGER) {
      throw new ApiError(400, 'INVALID_AMOUNT', 'amount_toman باید یک عدد صحیح مثبت و در محدوده مجاز باشد.');
    }
    const requestHash = sha256(JSON.stringify({ side, assetId, amount }));
    return { side, asset, assetId, amount, requestHash };
  }

  const voucherCode = typeof body.voucher_code === 'string' ? body.voucher_code.trim() : '';
  if (voucherCode.length < 5 || voucherCode.length > 200) {
    throw new ApiError(400, 'INVALID_VOUCHER_CODE', 'کد ووچر واردشده معتبر نیست.');
  }
  const requestHash = sha256(JSON.stringify({ side, assetId, voucherCodeHash: sha256(voucherCode) }));
  return { side, asset, assetId, voucherCode, requestHash };
}

async function fetchBuyProduct(productKey) {
  const result = await pool.query(
    `SELECT * FROM products
      WHERE key = $1 AND active = 1 AND hidden = 0
      LIMIT 1`,
    [productKey],
  );
  return result.rows[0] || null;
}

async function fetchSellProduct(productKey) {
  const result = await pool.query(
    `SELECT * FROM sell_products
      WHERE key = $1 AND active = 1
      LIMIT 1`,
    [productKey],
  );
  return result.rows[0] || null;
}

async function calculateBuyQuote(asset, product) {
  let unitPrice = null;
  let priceSource = 'unavailable';
  let feedPrices = null;

  if (asset.usdPriceField || asset.buyPriceField) {
    const [prices, usdRateRaw] = await Promise.all([priceService.getPrices(), getUsdRate()]);
    feedPrices = prices;
    const usdRate = positiveNumber(usdRateRaw) || 0;

    if (asset.usdPriceField) {
      const dollars = prices && !prices.stale
        ? positiveNumber(prices[asset.usdPriceField])
        : null;
      if (dollars !== null && usdRate > 0) {
        unitPrice = dollars * usdRate;
        priceSource = 'price-service+usd-rate';
      }
    } else if (asset.buyPriceField && prices && !prices.stale) {
      unitPrice = positiveNumber(prices[asset.buyPriceField]);
      if (unitPrice !== null) priceSource = 'price-service';
    }

    // If the provider cache is stale, use only the admin's manual database quote.
    // Do not fall through to getEffectiveUnitPrice for mapped fields: it reuses that cache.
    if (unitPrice === null && prices && prices.stale) {
      unitPrice = positiveNumber(product.unit_price);
      if (unitPrice !== null) priceSource = 'database-manual-stale-feed-fallback';
    }
  }

  const staleMappedQuote = Boolean(asset.buyPriceField && feedPrices && feedPrices.stale);
  if (unitPrice === null && !staleMappedQuote) {
    const liveQuote = await getEffectiveUnitPrice(product, 'buy');
    unitPrice = positiveNumber(liveQuote.price);
    priceSource = liveQuote.source || 'database-manual';
  }

  if (unitPrice === null && !asset.usdPriceField && product.price_type === 'usd') {
    const usdRate = positiveNumber(await getUsdRate());
    if (usdRate !== null) {
      unitPrice = usdRate;
      priceSource = 'settings-usd-rate';
    }
  }

  if (unitPrice === null) {
    throw new ApiError(409, 'BUY_PRICE_UNAVAILABLE', 'نرخ خرید این دارایی در حال حاضر قابل تأیید نیست.');
  }

  return { unitPrice, priceSource };
}

async function getLockedUser(client, telegramId) {
  const result = await client.query(
    `SELECT telegram_id, balance, bonus_balance, verification_status,
            registration_step, is_blocked
       FROM users
      WHERE telegram_id = $1
      FOR UPDATE`,
    [String(telegramId)],
  );
  const user = result.rows[0];
  if (!user) throw new ApiError(404, 'USER_NOT_FOUND', 'حساب کاربری در دیتابیس ربات پیدا نشد.');
  if (dbFlag(user.is_blocked)) throw new ApiError(403, 'USER_BLOCKED', 'دسترسی این حساب به خدمات ووچینو مسدود است.');
  if (user.registration_step !== 'completed') {
    throw new ApiError(403, 'REGISTRATION_REQUIRED', 'برای انجام معامله، ابتدا ثبت‌نام ربات را کامل کنید.');
  }
  return user;
}

async function getAdminTelegramIds() {
  const ids = new Set(ADMIN_IDS.map((id) => String(id)));
  try {
    const admins = await getAllAdmins();
    for (const admin of admins) {
      if (admin && admin.telegram_id) ids.add(String(admin.telegram_id));
    }
  } catch (error) {
    console.error('[webapp-api] failed to load dynamic admin list', error.message);
  }
  return [...ids];
}

async function notifyAdmins(bot, text, inlineKeyboard) {
  if (!bot || !bot.telegram || typeof bot.telegram.sendMessage !== 'function') {
    console.error('[webapp-api] bot instance missing; manual order cannot notify admins');
    return;
  }

  const adminIds = await getAdminTelegramIds();
  await Promise.all(adminIds.map(async (adminId) => {
    try {
      await bot.telegram.sendMessage(adminId, text, {
        ...(inlineKeyboard ? { reply_markup: { inline_keyboard: inlineKeyboard } } : {}),
      });
    } catch (error) {
      console.error('[webapp-api] admin notification failed', {
        adminId,
        error: error && error.message ? error.message : 'unknown error',
      });
    }
  }));
}

async function createBuyOrder({ telegramId, asset, amount, idempotencyKey, requestHash, bot }) {
  const product = await fetchBuyProduct(asset.buyProductKey);
  if (!product) {
    throw new ApiError(409, 'ASSET_NOT_BUYABLE', 'خرید این دارایی در پنل ربات فعال نشده است.');
  }

  const { unitPrice, priceSource } = await calculateBuyQuote(asset, product);
  const usdRate = positiveNumber(await getUsdRate()) || 0;
  let minAmount = Math.max(0, asFiniteNumber(product.min_amount, 0));
  if (isOnlineBuyProduct(product.key)) minAmount = unitPrice;
  else if (product.price_type === 'usd') minAmount *= usdRate;

  let maxAmount = Math.max(0, asFiniteNumber(product.max_amount, 0));
  if (maxAmount > 0 && product.price_type === 'usd') maxAmount *= usdRate;

  if (amount < minAmount) {
    throw new ApiError(422, 'MINIMUM_AMOUNT_NOT_MET', 'مبلغ سفارش از حداقل خرید کمتر است.', {
      min_amount_toman: Math.ceil(minAmount),
    });
  }
  if (maxAmount > 0 && amount > maxAmount) {
    throw new ApiError(422, 'MAXIMUM_AMOUNT_EXCEEDED', 'مبلغ سفارش از حداکثر خرید بیشتر است.', {
      max_amount_toman: Math.floor(maxAmount),
    });
  }

  const { commission, finalAmount } = calculateBuyFinal(amount, product);
  if (!Number.isSafeInteger(finalAmount) || finalAmount <= 0 || finalAmount > MAX_POSTGRES_INTEGER) {
    throw new ApiError(422, 'ORDER_AMOUNT_OUT_OF_RANGE', 'مبلغ نهایی سفارش خارج از محدوده مجاز است.');
  }
  if (!Number.isSafeInteger(commission) || commission < 0) {
    throw new ApiError(422, 'INVALID_COMMISSION', 'کارمزد تنظیم‌شده محصول معتبر نیست.');
  }

  const client = await pool.connect();
  let response;
  let createdOrderId;
  let trackingCode;
  let committed = false;

  try {
    await client.query('BEGIN');
    const replay = await reserveIdempotency(client, telegramId, idempotencyKey, requestHash);
    if (replay) {
      await client.query('COMMIT');
      committed = true;
      return { ...replay, replayed: true };
    }

    const user = await getLockedUser(client, telegramId);
    await assertDailyLimit(client, user, amount);

    const balanceBefore = asFiniteNumber(user.balance, 0);
    const debit = await client.query(
      `UPDATE users
          SET balance = balance - $1
        WHERE telegram_id = $2 AND balance >= $1
        RETURNING balance`,
      [finalAmount, String(telegramId)],
    );
    if (!debit.rows[0]) {
      throw new ApiError(422, 'INSUFFICIENT_BALANCE', 'موجودی کیف پول برای این سفارش کافی نیست.', {
        required_toman: finalAmount,
        available_toman: balanceBefore,
      });
    }

    trackingCode = makeTrackingCode();
    const orderResult = await client.query(
      `INSERT INTO orders
         (telegram_id, product_type, amount, commission, status, created_at, tracking_code, fulfillment_mode)
       VALUES ($1, $2, $3, $4, 'pending_delivery', NOW(), $5, 'manual')
       RETURNING id, status, created_at, tracking_code`,
      [String(telegramId), asset.buyProductKey, finalAmount, commission, trackingCode],
    );
    createdOrderId = orderResult.rows[0].id;

    const balanceAfter = asFiniteNumber(debit.rows[0].balance, 0);
    await client.query(
      `INSERT INTO transaction_logs
         (telegram_id, type, amount, balance_before, balance_after, tracking_code, description, created_at)
       VALUES ($1, 'buy', $2, $3, $4, $5, $6, NOW())`,
      [String(telegramId), -finalAmount, balanceBefore, balanceAfter, trackingCode, `خرید مینی‌اپ ${asset.id}؛ کارمزد ${commission} تومان`],
    );

    response = {
      success: true,
      side: 'buy',
      asset: asset.id,
      order_id: createdOrderId,
      tracking_code: trackingCode,
      status: 'pending_delivery',
      amount_toman: amount,
      commission_toman: commission,
      total_toman: finalAmount,
      unit_price_toman: unitPrice,
      price_source: priceSource,
      balance_toman: balanceAfter,
    };
    await storeIdempotentResponse(client, telegramId, idempotencyKey, response);
    await client.query('COMMIT');
    committed = true;
  } catch (error) {
    if (!committed) {
      try { await client.query('ROLLBACK'); } catch (_rollbackError) {}
    }
    throw error;
  } finally {
    client.release();
  }

  // Existing exchangeEngine owns provider execution and status transitions.
  // It is deliberately called after the DB transaction commits; a provider timeout
  // must not roll back a debited balance and a durable order.
  try {
    await tryAutoFulfillBuy({
      orderId: createdOrderId,
      telegramId,
      productKey: asset.buyProductKey,
      amount,
      trackingCode,
      product,
    }, bot);
  } catch (error) {
    console.error('[webapp-api] auto buy fulfillment failed', {
      trackingCode,
      error: error && error.message ? error.message : 'unknown error',
    });
  }

  const orderStateBeforeNotify = await pool.query(
    'SELECT status FROM orders WHERE id = $1 AND telegram_id = $2 LIMIT 1',
    [createdOrderId, String(telegramId)],
  );
  if (orderStateBeforeNotify.rows[0] && orderStateBeforeNotify.rows[0].status !== 'completed') {
    const customer = await loadUserByTelegramId(telegramId);
    const notice = `🛒 سفارش خرید جدید از Mini App\n` +
      `👤 شناسه کاربر: ${telegramId}\n` +
      `👤 نام: ${(customer && customer.full_name) || 'ثبت نشده'}\n` +
      `🛍 محصول: ${product.name}\n` +
      `💰 مبلغ پایه: ${amount.toLocaleString('en-US')} تومان\n` +
      `💳 کارمزد: ${commission.toLocaleString('en-US')} تومان\n` +
      `💵 مبلغ نهایی: ${finalAmount.toLocaleString('en-US')} تومان\n` +
      `📍 کد پیگیری: ${trackingCode}`;
    await notifyAdmins(bot, notice, [[
      { text: '🎟 تحویل ووچر', callback_data: `admin_deliver_${createdOrderId}` },
      { text: '❌ رد سفارش', callback_data: `admin_buy_cancel_${createdOrderId}` },
    ]]);
  }

  const finalOrder = await pool.query(
    `SELECT status, delivered_code
       FROM orders
      WHERE id = $1 AND telegram_id = $2
      LIMIT 1`,
    [createdOrderId, String(telegramId)],
  );
  if (finalOrder.rows[0]) {
    response.status = finalOrder.rows[0].status;
    if (response.status === 'completed' && finalOrder.rows[0].delivered_code) {
      response.delivered_code = finalOrder.rows[0].delivered_code;
    }
    await pool.query(
      `UPDATE webapp_idempotency
          SET response_json = $3::jsonb
        WHERE telegram_id = $1 AND idempotency_key = $2`,
      [String(telegramId), idempotencyKey, JSON.stringify(response)],
    );
  }
  return { ...response, replayed: false };
}

async function createSellOrder({ telegramId, asset, voucherCode, idempotencyKey, requestHash, bot }) {
  const product = await fetchSellProduct(asset.sellProductKey);
  if (!product) {
    throw new ApiError(409, 'ASSET_NOT_SELLABLE', 'فروش این دارایی در پنل ربات فعال نشده است.');
  }

  const formatCheck = validateVoucherCodeFormat(voucherCode, product.sample_code);
  if (!formatCheck.valid) {
    throw new ApiError(422, 'VOUCHER_FORMAT_INVALID', 'فرمت کد ووچر با الگوی محصول مطابقت ندارد.', {
      reason: formatCheck.reason,
    });
  }

  let quote;
  if (asset.sellPriceField) {
    const prices = await priceService.getPrices();
    if (prices && prices.stale) {
      const manual = positiveNumber(product.unit_price);
      quote = { price: manual, source: 'database-manual-stale-feed-fallback' };
    } else {
      const live = positiveNumber(prices && prices[asset.sellPriceField]);
      quote = live !== null
        ? { price: live, source: 'price-service' }
        : await getEffectiveUnitPrice(product, 'sell');
    }
  } else {
    quote = await getEffectiveUnitPrice(product, 'sell');
  }
  const unitPrice = positiveNumber(quote && quote.price);
  if (unitPrice === null) {
    throw new ApiError(409, 'SELL_PRICE_UNAVAILABLE', 'نرخ فروش این محصول در حال حاضر قابل تأیید نیست.');
  }
  const minimumSellPrice = Math.max(0, asFiniteNumber(product.min_amount, 0));
  if (minimumSellPrice > 0 && unitPrice < minimumSellPrice) {
    throw new ApiError(409, 'SELL_MINIMUM_NOT_MET', 'قیمت واحد این محصول از حداقل تعیین‌شده در پنل کمتر است.');
  }

  const estimatedBaseAmount = Math.round(unitPrice);
  const { commission, payout } = calculateSellPayout(estimatedBaseAmount, product);
  if (estimatedBaseAmount <= 0 || estimatedBaseAmount > MAX_POSTGRES_INTEGER || commission < 0 || payout < 0) {
    throw new ApiError(422, 'SELL_AMOUNT_OUT_OF_RANGE', 'مبلغ محاسبه‌شده فروش خارج از محدوده مجاز است.');
  }

  const client = await pool.connect();
  let response;
  let createdOrderId;
  let trackingCode;
  let committed = false;

  try {
    await client.query('BEGIN');
    const replay = await reserveIdempotency(client, telegramId, idempotencyKey, requestHash);
    if (replay) {
      await client.query('COMMIT');
      committed = true;
      return { ...replay, replayed: true };
    }

    const user = await getLockedUser(client, telegramId);
    await assertDailyLimit(client, user, estimatedBaseAmount);

    // Serialize attempts to sell the same voucher code across all API instances.
    const normalizedCode = voucherCode.toLowerCase();
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [normalizedCode]);
    const duplicate = await client.query(
      `SELECT id
         FROM sell_orders
        WHERE lower(btrim(voucher_code)) = $1
          AND status NOT IN ('rejected', 'cancelled')
        LIMIT 1`,
      [normalizedCode],
    );
    if (duplicate.rows.length > 0) {
      throw new ApiError(409, 'VOUCHER_ALREADY_SUBMITTED', 'این کد ووچر قبلاً برای فروش ثبت شده است.');
    }

    trackingCode = makeTrackingCode();
    const orderResult = await client.query(
      `INSERT INTO sell_orders
         (telegram_id, product_type, voucher_code, amount, commission, status, created_at, tracking_code, fulfillment_mode)
       VALUES ($1, $2, $3, $4, $5, 'pending_review', NOW(), $6, 'manual')
       RETURNING id, status, created_at, tracking_code`,
      [String(telegramId), asset.sellProductKey, voucherCode, estimatedBaseAmount, commission, trackingCode],
    );
    createdOrderId = orderResult.rows[0].id;

    response = {
      success: true,
      side: 'sell',
      asset: asset.id,
      order_id: createdOrderId,
      tracking_code: trackingCode,
      status: 'pending_review',
      estimated_amount_toman: estimatedBaseAmount,
      commission_toman: commission,
      estimated_payout_toman: payout,
      unit_price_toman: unitPrice,
      price_source: quote.source || 'database-manual',
      wallet_credit_toman: 0,
    };
    await storeIdempotentResponse(client, telegramId, idempotencyKey, response);
    await client.query('COMMIT');
    committed = true;
  } catch (error) {
    if (!committed) {
      try { await client.query('ROLLBACK'); } catch (_rollbackError) {}
    }
    throw error;
  } finally {
    client.release();
  }

  try {
    await tryAutoFulfillSell({
      sellOrderId: createdOrderId,
      telegramId,
      productKey: asset.sellProductKey,
      amount: estimatedBaseAmount,
      product,
      trackingCode,
      voucherCode,
    }, bot);
  } catch (error) {
    console.error('[webapp-api] auto sell fulfillment failed', {
      trackingCode,
      error: error && error.message ? error.message : 'unknown error',
    });
  }

  const orderStateBeforeNotify = await pool.query(
    'SELECT status FROM sell_orders WHERE id = $1 AND telegram_id = $2 LIMIT 1',
    [createdOrderId, String(telegramId)],
  );
  if (orderStateBeforeNotify.rows[0] && orderStateBeforeNotify.rows[0].status === 'pending_review') {
    const customer = await loadUserByTelegramId(telegramId);
    const notice = `♨️ سفارش فروش جدید از Mini App\n` +
      `👤 کاربر: ${telegramId}\n` +
      `👤 نام: ${(customer && customer.full_name) || 'ثبت نشده'}\n` +
      `🛍 محصول: ${product.name}\n` +
      `💰 مبلغ تخمینی: ${estimatedBaseAmount.toLocaleString('en-US')} تومان\n` +
      `🎟 کد ووچر مشتری:\n${voucherCode}\n` +
      `📍 کد پیگیری: ${trackingCode}`;
    await notifyAdmins(bot, notice, [[
      { text: '💰 بررسی و تأیید', callback_data: `admin_sell_approve_${createdOrderId}` },
      { text: '❌ رد', callback_data: `admin_sell_reject_${createdOrderId}` },
    ]]);
  }

  const finalOrder = await pool.query(
    `SELECT status, amount, commission
       FROM sell_orders
      WHERE id = $1 AND telegram_id = $2
      LIMIT 1`,
    [createdOrderId, String(telegramId)],
  );
  if (finalOrder.rows[0]) {
    response.status = finalOrder.rows[0].status;
    response.final_amount_toman = asFiniteNumber(finalOrder.rows[0].amount, estimatedBaseAmount);
    response.final_commission_toman = asFiniteNumber(finalOrder.rows[0].commission, commission);
    response.wallet_credit_toman = response.status === 'approved'
      ? Math.max(0, response.final_amount_toman)
      : 0;
    await pool.query(
      `UPDATE webapp_idempotency
          SET response_json = $3::jsonb
        WHERE telegram_id = $1 AND idempotency_key = $2`,
      [String(telegramId), idempotencyKey, JSON.stringify(response)],
    );
  }
  return { ...response, replayed: false };
}

function createWebAppApiRouter(options = {}) {
  const router = express.Router();
  const authenticate = createTelegramAuthMiddleware(options.telegramAuth || {});
  const requireUser = createRequireUserMiddleware();
  const perIpLimit = createWindowRateLimiter({
    windowMs: 60_000,
    max: parsePositiveInteger(process.env.WEBAPP_API_RATE_LIMIT_PER_IP, 120, 1000),
    keyGenerator: (req) => req.ip || req.socket.remoteAddress || 'unknown',
  });
  const tradeLimit = createWindowRateLimiter({
    windowMs: 60_000,
    max: parsePositiveInteger(process.env.WEBAPP_TRADE_RATE_LIMIT_PER_USER, 8, 100),
    keyGenerator: (req) => `trade:${req.telegram ? req.telegram.id : (req.ip || 'unknown')}`,
  });

  router.use((req, res, next) => {
    req.requestId = crypto.randomUUID();
    res.setHeader('X-Request-ID', req.requestId);
    return next();
  });
  router.use(createSecurityHeaders());
  router.use(createCorsMiddleware());
  router.use(perIpLimit);

  router.get('/user', authenticate, requireUser, asyncRoute(async (req, res) => {
    const referralsResult = await pool.query(
      'SELECT COUNT(*)::int AS count FROM users WHERE referrer_id = $1',
      [String(req.telegram.id)],
    );
    const telegramName = [req.telegram.first_name, req.telegram.last_name].filter(Boolean).join(' ').trim();

    return res.json({
      user: {
        telegram_id: req.dbUser.telegram_id,
        username: req.telegram.username,
        first_name: req.telegram.first_name,
        last_name: req.telegram.last_name,
        display_name: req.dbUser.full_name || telegramName || req.telegram.username || 'کاربر ووچینو',
        language: req.dbUser.language || req.telegram.language_code || 'fa',
        balance_toman: asFiniteNumber(req.dbUser.balance, 0),
        bonus_balance_toman: asFiniteNumber(req.dbUser.bonus_balance, 0),
        verification_status: req.dbUser.verification_status || 'none',
        registration_completed: req.dbUser.registration_step === 'completed',
        registration_step: req.dbUser.registration_step || null,
        registered_at: req.dbUser.registered_at,
        referrals_count: Number(referralsResult.rows[0].count || 0),
        can_trade: req.dbUser.registration_step === 'completed' && !dbFlag(req.dbUser.is_blocked),
      },
    });
  }));

  router.get('/market', authenticate, asyncRoute(async (_req, res) => {
    const market = await getMarketPayload();
    return res.json({ market });
  }));

  router.get('/cards', authenticate, requireUser, asyncRoute(async (req, res) => {
    const [extraCards, userResult] = await Promise.all([
      pool.query(
        `SELECT id, card_number, created_at
           FROM cards
          WHERE telegram_id = $1
          ORDER BY created_at DESC, id DESC`,
        [String(req.telegram.id)],
      ),
      pool.query('SELECT card_number FROM users WHERE telegram_id = $1 LIMIT 1', [String(req.telegram.id)]),
    ]);

    const cards = [];
    const seen = new Set();
    const profileCard = userResult.rows[0] && userResult.rows[0].card_number;
    if (profileCard) {
      const digits = normalizeCardNumber(profileCard);
      if (digits) {
        seen.add(digits);
        cards.push({ id: 'profile', masked_number: maskCardNumber(digits), source: 'profile' });
      }
    }

    for (const card of extraCards.rows) {
      const digits = normalizeCardNumber(card.card_number);
      if (!digits || seen.has(digits)) continue;
      seen.add(digits);
      cards.push({
        id: String(card.id),
        masked_number: maskCardNumber(digits),
        source: 'saved_card',
        created_at: card.created_at,
      });
    }

    return res.json({ cards });
  }));

  router.get('/transactions', authenticate, requireUser, asyncRoute(async (req, res) => {
    const limit = parsePositiveInteger(req.query.limit, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const offsetRaw = Number(req.query.offset || 0);
    const offset = Number.isSafeInteger(offsetRaw) && offsetRaw >= 0 ? Math.min(offsetRaw, 50_000) : 0;

    const result = await pool.query(
      `WITH activity AS (
         SELECT
           'buy'::text AS kind,
           o.id::text AS reference_id,
           o.product_type::text AS product_key,
           COALESCE(p.name, o.product_type)::text AS title,
           ABS(COALESCE(o.amount, 0))::numeric AS amount_toman,
           ABS(COALESCE(o.commission, 0))::numeric AS fee_toman,
           'out'::text AS direction,
           o.status::text AS status,
           o.tracking_code::text AS tracking_code,
           o.created_at AS created_at
         FROM orders o
         LEFT JOIN products p ON p.key = o.product_type
         WHERE o.telegram_id = $1

         UNION ALL

         SELECT
           'sell'::text AS kind,
           s.id::text AS reference_id,
           s.product_type::text AS product_key,
           COALESCE(sp.name, s.product_type)::text AS title,
           ABS(COALESCE(s.amount, 0))::numeric AS amount_toman,
           ABS(COALESCE(s.commission, 0))::numeric AS fee_toman,
           'in'::text AS direction,
           s.status::text AS status,
           s.tracking_code::text AS tracking_code,
           s.created_at AS created_at
         FROM sell_orders s
         LEFT JOIN sell_products sp ON sp.key = s.product_type
         WHERE s.telegram_id = $1

         UNION ALL

         SELECT
           wr.type::text AS kind,
           wr.id::text AS reference_id,
           NULL::text AS product_key,
           CASE wr.type
             WHEN 'deposit' THEN 'افزایش موجودی'
             WHEN 'withdraw' THEN 'برداشت موجودی'
             WHEN 'internal_transfer' THEN 'انتقال داخلی'
             ELSE 'درخواست کیف پول'
           END::text AS title,
           ABS(COALESCE(wr.amount, 0))::numeric AS amount_toman,
           ABS(COALESCE(wr.commission, 0))::numeric AS fee_toman,
           CASE WHEN wr.type IN ('withdraw', 'internal_transfer') THEN 'out' ELSE 'in' END::text AS direction,
           wr.status::text AS status,
           wr.tracking_code::text AS tracking_code,
           wr.created_at AS created_at
         FROM wallet_requests wr
         WHERE wr.telegram_id = $1

         UNION ALL

         SELECT
           tl.type::text AS kind,
           tl.id::text AS reference_id,
           NULL::text AS product_key,
           COALESCE(NULLIF(tl.description, ''), tl.type)::text AS title,
           ABS(COALESCE(tl.amount, 0))::numeric AS amount_toman,
           0::numeric AS fee_toman,
           CASE WHEN COALESCE(tl.amount, 0) < 0 THEN 'out' ELSE 'in' END::text AS direction,
           'completed'::text AS status,
           tl.tracking_code::text AS tracking_code,
           tl.created_at AS created_at
         FROM transaction_logs tl
         WHERE tl.telegram_id = $1
           AND tl.type NOT IN ('buy', 'sell', 'deposit', 'withdraw')
           AND NOT EXISTS (
             SELECT 1 FROM wallet_requests wr2
              WHERE wr2.telegram_id = tl.telegram_id
                AND wr2.tracking_code = tl.tracking_code
                AND tl.tracking_code IS NOT NULL
           )
       )
       SELECT kind, reference_id, product_key, title, amount_toman, fee_toman, direction,
              status, tracking_code, created_at
         FROM activity
        ORDER BY created_at DESC NULLS LAST, reference_id DESC
        LIMIT $2 OFFSET $3`,
      [String(req.telegram.id), limit, offset],
    );

    const transactions = result.rows.map((row) => {
      const amount = asFiniteNumber(row.amount_toman, 0);
      const kind = row.kind;
      return {
        kind,
        reference_id: row.reference_id,
        asset: row.product_key ? (ASSET_ID_BY_PRODUCT_KEY.get(row.product_key) || row.product_key) : null,
        title: row.title,
        amount_toman: Math.abs(amount),
        fee_toman: asFiniteNumber(row.fee_toman, 0),
        direction: row.direction,
        status: row.status,
        tracking_code: row.tracking_code,
        created_at: row.created_at,
      };
    });

    return res.json({
      transactions,
      pagination: {
        limit,
        offset,
        next_offset: transactions.length === limit ? offset + limit : null,
        has_more: transactions.length === limit,
      },
    });
  }));

  router.post(
    '/trade',
    express.json({ limit: '16kb', strict: true, type: 'application/json' }),
    authenticate,
    requireUser,
    tradeLimit,
    asyncRoute(async (req, res) => {
      requireCompletedRegistration(req);
      const idempotencyKey = String(req.get('Idempotency-Key') || '').trim();
      const trade = validateTradeRequest(req.body, idempotencyKey);

      const payload = trade.side === 'buy'
        ? await createBuyOrder({
          telegramId: req.telegram.id,
          asset: trade.asset,
          amount: trade.amount,
          idempotencyKey,
          requestHash: trade.requestHash,
          bot: options.bot,
        })
        : await createSellOrder({
          telegramId: req.telegram.id,
          asset: trade.asset,
          voucherCode: trade.voucherCode,
          idempotencyKey,
          requestHash: trade.requestHash,
          bot: options.bot,
        });

      return res.status(payload.replayed ? 200 : 201).json({ trade: payload });
    }),
  );

  router.use((error, req, res, _next) => {
    if (res.headersSent) return;

    if (error instanceof ApiError) {
      return res.status(error.status).json({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      });
    }

    if (error && (error.type === 'entity.parse.failed' || error.status === 400)) {
      return res.status(400).json({
        error: { code: 'INVALID_JSON', message: 'فرمت JSON درخواست معتبر نیست.' },
      });
    }

    if (error && error.code === '23505') {
      return res.status(409).json({
        error: { code: 'DUPLICATE_REQUEST', message: 'درخواست تکراری است؛ سوابق سفارش را بررسی کنید.' },
      });
    }

    console.error('[webapp-api] request failed', {
      requestId: req.requestId || null,
      path: req.path,
      error: error && error.message ? error.message : 'unknown error',
    });
    return res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'خطای داخلی سرور رخ داد. دوباره تلاش کنید.' },
    });
  });

  return router;
}

module.exports = createWebAppApiRouter;
module.exports.createWebAppApiRouter = createWebAppApiRouter;
module.exports.getMarketPayload = getMarketPayload;
module.exports.validateTradeRequest = validateTradeRequest;
