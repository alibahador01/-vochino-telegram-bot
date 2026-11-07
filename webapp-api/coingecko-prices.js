'use strict';

const DEFAULT_SIMPLE_TTL_SECONDS = 300;
const DEFAULT_MAX_STALE_SECONDS = 1800;
const DEFAULT_CHART_TTL_SECONDS = 6 * 60 * 60;
const DEFAULT_CHART_MAX_STALE_SECONDS = 24 * 60 * 60;
const COINGECKO_DEMO_ROOT = 'https://api.coingecko.com/api/v3';
const COINGECKO_PRO_ROOT = 'https://pro-api.coingecko.com/api/v3';

let simpleCache = null;
let simpleInFlight = null;
const chartCache = new Map();
const chartInFlight = new Map();

const SHARED_CACHE_PREFIX = 'vochino:coingecko:';

function normalizeCacheRow(row) {
  if (!row) return null;
  let payload = row.payload;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch (_) { return null; }
  }
  const fetchedAt = new Date(row.fetched_at).getTime();
  if (!payload || !Number.isFinite(fetchedAt)) return null;
  return { payload, fetchedAt };
}

async function readSharedCache(client, cacheKey) {
  const result = await client.query(
    'SELECT payload, fetched_at FROM webapp_market_cache WHERE cache_key = $1 LIMIT 1',
    [cacheKey],
  );
  return normalizeCacheRow(result.rows[0]);
}

async function writeSharedCache(client, cacheKey, payload) {
  await client.query(
    `INSERT INTO webapp_market_cache (cache_key, payload, fetched_at, updated_at)
     VALUES ($1, $2::jsonb, NOW(), NOW())
     ON CONFLICT (cache_key) DO UPDATE
       SET payload = EXCLUDED.payload, fetched_at = EXCLUDED.fetched_at, updated_at = NOW()`,
    [cacheKey, JSON.stringify(payload)],
  );
}

async function acquireSharedCacheLock(pool, cacheKey) {
  if (!pool || typeof pool.connect !== 'function') return null;
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1)::bigint)', [`${SHARED_CACHE_PREFIX}${cacheKey}`]);
    return client;
  } catch (error) {
    client.release();
    throw error;
  }
}

async function releaseSharedCacheLock(client, cacheKey) {
  if (!client) return;
  try {
    await client.query('SELECT pg_advisory_unlock(hashtext($1)::bigint)', [`${SHARED_CACHE_PREFIX}${cacheKey}`]);
  } catch (error) {
    console.error('[coingecko] shared cache lock release failed:', error.message);
  } finally {
    client.release();
  }
}

function fresherCache(first, second) {
  if (!first) return second;
  if (!second) return first;
  return first.fetchedAt >= second.fetchedAt ? first : second;
}

function boundedInteger(raw, fallback, min, max) {
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function getCoinIds() {
  const configuredUusd = String(process.env.COINGECKO_UUSD_ID || '').trim().toLowerCase();
  const validUusd = /^[a-z0-9-]{2,80}$/.test(configuredUusd) ? configuredUusd : null;
  return Object.freeze({ usdt: 'tether', tron: 'tron', uusd: validUusd });
}

function getApiConfig() {
  const key = String(process.env.COINGECKO_API_KEY || '').trim();
  const plan = String(process.env.COINGECKO_API_PLAN || 'demo').trim().toLowerCase() === 'pro' ? 'pro' : 'demo';
  return {
    key,
    plan,
    root: plan === 'pro' ? COINGECKO_PRO_ROOT : COINGECKO_DEMO_ROOT,
    header: plan === 'pro' ? 'x-cg-pro-api-key' : 'x-cg-demo-api-key',
  };
}

function getCacheTtls() {
  return {
    simple: boundedInteger(process.env.COINGECKO_CACHE_TTL_SECONDS, DEFAULT_SIMPLE_TTL_SECONDS, 60, 1800) * 1000,
    maxSimpleStale: boundedInteger(process.env.COINGECKO_MAX_STALE_SECONDS, DEFAULT_MAX_STALE_SECONDS, 0, 1800) * 1000,
    chart: boundedInteger(process.env.COINGECKO_CHART_CACHE_SECONDS, DEFAULT_CHART_TTL_SECONDS, 1800, 86400) * 1000,
    maxChartStale: boundedInteger(process.env.COINGECKO_CHART_MAX_STALE_SECONDS, DEFAULT_CHART_MAX_STALE_SECONDS, 0, 86400) * 1000,
  };
}

async function fetchJson(url, config) {
  if (typeof fetch !== 'function') throw new Error('Node.js 18 یا بالاتر برای fetch موردنیاز است.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json', [config.header]: config.key },
      signal: controller.signal,
    });
    if (!response.ok) {
      const error = new Error(`CoinGecko HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function validUsdPrice(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function shapeSimplePayload(raw, coinIds, fetchedAt) {
  const coins = {};
  for (const [assetId, coinId] of Object.entries(coinIds)) {
    if (!coinId) {
      coins[assetId] = null;
      continue;
    }
    const record = raw && raw[coinId];
    const usd = record && validUsdPrice(record.usd);
    coins[assetId] = usd ? {
      coin_id: coinId,
      usd,
      last_updated_at: Number.isFinite(Number(record.last_updated_at)) ? Number(record.last_updated_at) : null,
    } : null;
  }
  return {
    configured: true,
    available: Boolean(coins.usdt || coins.tron || coins.uusd),
    fetched_at: new Date(fetchedAt).toISOString(),
    stale: false,
    source: 'coingecko',
    ids: coinIds,
    coins,
  };
}

async function getSimplePrices({ forceRefresh = false, pool = null } = {}) {
  const config = getApiConfig();
  const coinIds = getCoinIds();
  const ttls = getCacheTtls();
  const now = Date.now();

  if (!config.key) {
    return {
      configured: false,
      available: false,
      stale: false,
      source: 'coingecko',
      ids: coinIds,
      fetched_at: null,
      coins: { usdt: null, tron: null, uusd: null },
      unavailable_reason: 'کلید COINGECKO_API_KEY در Environment بک‌اند تنظیم نشده است.',
    };
  }

  if (!forceRefresh && simpleCache && now - simpleCache.fetchedAt < ttls.simple) {
    return { ...simpleCache.payload, stale: false, cache_age_seconds: Math.floor((now - simpleCache.fetchedAt) / 1000) };
  }
  if (simpleInFlight) return simpleInFlight;

  simpleInFlight = (async () => {
    const cacheKey = `simple:usd:${Object.values(coinIds).filter(Boolean).sort().join(',')}`;
    let lockClient = null;
    let bestCache = simpleCache;
    let lockKeyAcquired = false;

    try {
      if (pool && typeof pool.connect === 'function') {
        try {
          lockClient = await acquireSharedCacheLock(pool, cacheKey);
          lockKeyAcquired = Boolean(lockClient);
          if (lockClient) {
            const shared = await readSharedCache(lockClient, cacheKey);
            bestCache = fresherCache(bestCache, shared);
            if (!forceRefresh && bestCache && Date.now() - bestCache.fetchedAt < ttls.simple) {
              simpleCache = bestCache;
              return { ...bestCache.payload, stale: false, cache_age_seconds: Math.floor((Date.now() - bestCache.fetchedAt) / 1000) };
            }
          }
        } catch (cacheError) {
          console.error('[coingecko] shared simple cache unavailable; using process cache:', cacheError.message);
          if (lockClient) {
            if (lockKeyAcquired) await releaseSharedCacheLock(lockClient, cacheKey);
            else lockClient.release();
          }
          lockClient = null;
          lockKeyAcquired = false;
        }
      }

      const ids = Object.values(coinIds).filter(Boolean);
      if (!ids.length) throw new Error('هیچ شناسه CoinGecko برای دریافت نرخ پیکربندی نشده است.');
      const url = new URL(`${config.root}/simple/price`);
      url.searchParams.set('ids', ids.join(','));
      url.searchParams.set('vs_currencies', 'usd');
      url.searchParams.set('include_last_updated_at', 'true');
      url.searchParams.set('precision', 'full');

      const raw = await fetchJson(url.toString(), config);
      const fetchedAt = Date.now();
      const payload = shapeSimplePayload(raw, coinIds, fetchedAt);
      // USDT and TRX are required for the digital-asset board. A 200 response with
      // an empty/partial body must not overwrite a previously good cache snapshot.
      if (!payload.coins.usdt || !payload.coins.tron) {
        throw new Error('CoinGecko response did not contain valid USDT and TRX prices.');
      }
      simpleCache = { fetchedAt, payload };
      if (lockClient) {
        try {
          await writeSharedCache(lockClient, cacheKey, payload);
        } catch (cacheError) {
          console.error('[coingecko] could not persist shared simple cache:', cacheError.message);
        }
      }
      return { ...payload, cache_age_seconds: 0 };
    } catch (error) {
      const nowOnError = Date.now();
      bestCache = fresherCache(bestCache, simpleCache);
      const age = bestCache ? nowOnError - bestCache.fetchedAt : Number.POSITIVE_INFINITY;
      if (bestCache && age <= ttls.maxSimpleStale) {
        return {
          ...bestCache.payload,
          stale: true,
          cache_age_seconds: Math.floor(age / 1000),
          unavailable_reason: 'ارتباط زنده با CoinGecko برقرار نشد؛ آخرین نرخ کش‌شده نمایش داده می‌شود.',
        };
      }
      return {
        configured: true,
        available: false,
        stale: false,
        source: 'coingecko',
        ids: coinIds,
        fetched_at: null,
        coins: { usdt: null, tron: null, uusd: null },
        unavailable_reason: error && error.status
          ? `سرویس CoinGecko پاسخ ${error.status} برگرداند.`
          : 'در حال حاضر دریافت نرخ از CoinGecko ممکن نیست.',
      };
    } finally {
      if (lockClient) await releaseSharedCacheLock(lockClient, cacheKey);
      simpleInFlight = null;
    }
  })();

  return simpleInFlight;
}

async function getMarketChart(assetId, { forceRefresh = false, pool = null } = {}) {
  const config = getApiConfig();
  const ids = getCoinIds();
  const coinId = ids[assetId];
  if (!['usdt', 'tron', 'uusd'].includes(assetId) || !coinId) {
    return { available: false, stale: false, asset: assetId, points: [], unavailable_reason: 'تاریخچه واقعی این دارایی در CoinGecko پیکربندی نشده است.' };
  }
  if (!config.key) {
    return { available: false, stale: false, asset: assetId, points: [], unavailable_reason: 'کلید CoinGecko تنظیم نشده است.' };
  }

  const ttls = getCacheTtls();
  const now = Date.now();
  const cached = chartCache.get(coinId) || null;
  if (!forceRefresh && cached && now - cached.fetchedAt < ttls.chart) {
    return { ...cached.payload, stale: false, cache_age_seconds: Math.floor((now - cached.fetchedAt) / 1000) };
  }
  if (chartInFlight.has(coinId)) return chartInFlight.get(coinId);

  const promise = (async () => {
    const cacheKey = `chart:usd:1d:${coinId}`;
    let lockClient = null;
    let bestCache = cached;
    let lockKeyAcquired = false;
    try {
      if (pool && typeof pool.connect === 'function') {
        try {
          lockClient = await acquireSharedCacheLock(pool, cacheKey);
          lockKeyAcquired = Boolean(lockClient);
          if (lockClient) {
            const shared = await readSharedCache(lockClient, cacheKey);
            bestCache = fresherCache(bestCache, shared);
            if (!forceRefresh && bestCache && Date.now() - bestCache.fetchedAt < ttls.chart) {
              chartCache.set(coinId, bestCache);
              return { ...bestCache.payload, stale: false, cache_age_seconds: Math.floor((Date.now() - bestCache.fetchedAt) / 1000) };
            }
          }
        } catch (cacheError) {
          console.error('[coingecko] shared chart cache unavailable; using process cache:', cacheError.message);
          if (lockClient) {
            if (lockKeyAcquired) await releaseSharedCacheLock(lockClient, cacheKey);
            else lockClient.release();
          }
          lockClient = null;
          lockKeyAcquired = false;
        }
      }

      const url = new URL(`${config.root}/coins/${encodeURIComponent(coinId)}/market_chart`);
      url.searchParams.set('vs_currency', 'usd');
      url.searchParams.set('days', '1');
      const raw = await fetchJson(url.toString(), config);
      const points = Array.isArray(raw && raw.prices)
        ? raw.prices
          .filter((point) => Array.isArray(point) && point.length >= 2)
          .map(([timestamp, price]) => ({ timestamp: Number(timestamp), price_usd: validUsdPrice(price) }))
          .filter((point) => Number.isFinite(point.timestamp) && point.price_usd !== null)
        : [];
      const payload = {
        available: points.length >= 2,
        stale: false,
        asset: assetId,
        coin_id: coinId,
        source: 'coingecko-market-chart',
        fetched_at: new Date().toISOString(),
        points,
        unavailable_reason: points.length >= 2 ? null : 'CoinGecko برای این دارایی داده تاریخی کافی برنگرداند.',
      };
      const fresh = { fetchedAt: Date.now(), payload };
      chartCache.set(coinId, fresh);
      if (lockClient) {
        try {
          await writeSharedCache(lockClient, cacheKey, payload);
        } catch (cacheError) {
          console.error('[coingecko] could not persist shared chart cache:', cacheError.message);
        }
      }
      return { ...payload, cache_age_seconds: 0 };
    } catch (error) {
      bestCache = fresherCache(bestCache, chartCache.get(coinId) || null);
      const age = bestCache ? Date.now() - bestCache.fetchedAt : Number.POSITIVE_INFINITY;
      if (bestCache && age <= ttls.maxChartStale) {
        return {
          ...bestCache.payload,
          stale: true,
          cache_age_seconds: Math.floor(age / 1000),
          unavailable_reason: 'تاریخچه تازه دریافت نشد؛ آخرین نمودار ذخیره‌شده نمایش داده می‌شود.',
        };
      }
      return { available: false, stale: false, asset: assetId, points: [], unavailable_reason: error && error.status ? `دریافت نمودار از CoinGecko با خطای ${error.status} روبه‌رو شد.` : 'دریافت تاریخچه قیمت از CoinGecko ممکن نیست.' };
    } finally {
      if (lockClient) await releaseSharedCacheLock(lockClient, cacheKey);
      chartInFlight.delete(coinId);
    }
  })();
  chartInFlight.set(coinId, promise);
  return promise;
}

module.exports = { getCoinIds, getSimplePrices, getMarketChart };
