'use strict';

const CRYPTO_ASSETS = Object.freeze([
  Object.freeze({ id: 'usdt', name: 'تتر', ticker: 'USDT', coinKey: 'usdt', spread: 0.003 }),
  Object.freeze({ id: 'tron', name: 'ترون', ticker: 'TRX', coinKey: 'tron', spread: 0.012 }),
  Object.freeze({ id: 'uusd', name: 'یوتوپیا USD', ticker: 'UUSD', coinKey: 'uusd', spread: 0.007 }),
]);

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function roundToToman(value, mode) {
  if (!Number.isFinite(value) || value <= 0) return null;
  return mode === 'buy' ? Math.ceil(value) : Math.floor(value);
}

function buildCryptoQuotes(priceSnapshot, usdRateToman) {
  const usdRate = positiveNumber(usdRateToman);
  return CRYPTO_ASSETS.map((asset) => {
    const price = priceSnapshot && priceSnapshot.coins ? priceSnapshot.coins[asset.coinKey] : null;
    const usd = price ? positiveNumber(price.usd) : null;
    const midToman = usd !== null && usdRate !== null ? usd * usdRate : null;
    const buyPrice = midToman === null ? null : roundToToman(midToman * (1 + asset.spread), 'buy');
    const sellPrice = midToman === null ? null : roundToToman(midToman * (1 - asset.spread), 'sell');
    const configured = Boolean(priceSnapshot && priceSnapshot.configured);
    const unavailableReason = !configured
      ? 'اتصال CoinGecko در بک‌اند پیکربندی نشده است.'
      : (!usdRate ? 'نرخ تتر تومانی در تنظیمات دیتابیس موجود یا معتبر نیست.'
        : (!usd ? asset.id === 'uusd'
          ? 'شناسه رسمی این دارایی در COINGECKO_UUSD_ID تنظیم نشده یا CoinGecko برای آن قیمت ندارد.'
          : 'قیمت معتبر این دارایی از CoinGecko دریافت نشد.'
          : null));

    return {
      id: asset.id,
      name: asset.name,
      ticker: asset.ticker,
      asset_type: 'crypto',
      execution_mode: 'preview_only',
      mock_execution: true,
      execution_enabled: false,
      spread_percent: asset.spread * 100,
      source: 'coingecko',
      is_stale: Boolean(priceSnapshot && priceSnapshot.stale),
      fetched_at: priceSnapshot ? priceSnapshot.fetched_at : null,
      buy: {
        enabled: Boolean(buyPrice),
        price_toman: buyPrice,
        mid_price_toman: midToman,
        price_source: 'coingecko-usd-x-db-usd_rate-with-spread',
        min_amount_toman: null,
        max_amount_toman: null,
        unavailable_reason: unavailableReason,
      },
      sell: {
        enabled: Boolean(sellPrice),
        price_toman: sellPrice,
        mid_price_toman: midToman,
        price_source: 'coingecko-usd-x-db-usd_rate-with-spread',
        min_amount_toman: null,
        max_amount_toman: null,
        unavailable_reason: unavailableReason,
      },
    };
  });
}

module.exports = { CRYPTO_ASSETS, buildCryptoQuotes };
