'use strict';

const ASSETS = Object.freeze([
  Object.freeze({
    id: 'utopia',
    name: 'یوتوپیا',
    ticker: 'UTOPIA',
    buyProductKey: 'utopia',
    sellProductKey: 'utopia',
    usdPriceField: 'utopia_usd',
    buyPriceField: null,
    sellPriceField: null,
  }),
  Object.freeze({
    id: 'uvoucher',
    name: 'یو ووچر',
    ticker: 'UUSD',
    buyProductKey: 'voucher',
    sellProductKey: 'uvoucher',
    usdPriceField: null,
    buyPriceField: 'u_buy',
    sellPriceField: 'u_sell',
  }),
  Object.freeze({
    id: 'premium',
    name: 'پریمیوم ووچر',
    ticker: 'PREMIUM',
    buyProductKey: 'premium_voucher',
    sellProductKey: 'premiumvoucher',
    usdPriceField: null,
    buyPriceField: 'premium_buy',
    sellPriceField: 'premium_sell',
  }),
  Object.freeze({
    id: 'hot',
    name: 'هات ووچر',
    ticker: 'HOT',
    buyProductKey: 'hotvoucher',
    sellProductKey: 'hotvoucher_sell',
    usdPriceField: null,
    buyPriceField: 'hot_buy',
    sellPriceField: 'hot_sell',
  }),
  Object.freeze({
    id: 'usdt',
    name: 'دلار / تتر',
    ticker: 'USDT',
    buyProductKey: 'crypto_dollar',
    sellProductKey: null,
    usdPriceField: 'tether_usd',
    buyPriceField: null,
    sellPriceField: null,
  }),
  Object.freeze({
    id: 'tron',
    name: 'ترون',
    ticker: 'TRX',
    buyProductKey: 'crypto_tron',
    sellProductKey: null,
    usdPriceField: null,
    buyPriceField: null,
    sellPriceField: null,
  }),
]);

const ASSET_BY_ID = new Map(ASSETS.map((asset) => [asset.id, asset]));

const ASSET_ID_BY_PRODUCT_KEY = new Map();
for (const asset of ASSETS) {
  if (asset.buyProductKey) ASSET_ID_BY_PRODUCT_KEY.set(asset.buyProductKey, asset.id);
  if (asset.sellProductKey) ASSET_ID_BY_PRODUCT_KEY.set(asset.sellProductKey, asset.id);
}

module.exports = { ASSETS, ASSET_BY_ID, ASSET_ID_BY_PRODUCT_KEY };
