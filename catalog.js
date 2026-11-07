'use strict';

/**
 * Canonical Vochino market catalogue.
 * Voucher keys continue to point to the live product tables used by the bot.
 * Crypto assets are quote-only at this stage and are guarded by the API.
 */
const ASSETS = Object.freeze([
  Object.freeze({
    id: 'uvoucher', name: 'یو ووچر', ticker: 'U VOUCHER',
    buyProductKey: 'voucher', sellProductKey: 'uvoucher',
    buyPriceField: 'u_buy', sellPriceField: 'u_sell',
  }),
  Object.freeze({
    id: 'premium', name: 'پریمیوم ووچر', ticker: 'PREMIUM',
    buyProductKey: 'premium_voucher', sellProductKey: 'premiumvoucher',
    buyPriceField: 'premium_buy', sellPriceField: 'premium_sell',
  }),
  Object.freeze({
    id: 'hot', name: 'هات ووچر', ticker: 'HOT',
    buyProductKey: 'hotvoucher', sellProductKey: 'hotvoucher_sell',
    buyPriceField: 'hot_buy', sellPriceField: 'hot_sell',
  }),
]);

const ASSET_BY_ID = new Map(ASSETS.map((asset) => [asset.id, asset]));
const ASSET_ID_BY_PRODUCT_KEY = new Map();
for (const asset of ASSETS) {
  if (asset.buyProductKey) ASSET_ID_BY_PRODUCT_KEY.set(asset.buyProductKey, asset.id);
  if (asset.sellProductKey) ASSET_ID_BY_PRODUCT_KEY.set(asset.sellProductKey, asset.id);
}

module.exports = { ASSETS, ASSET_BY_ID, ASSET_ID_BY_PRODUCT_KEY };
