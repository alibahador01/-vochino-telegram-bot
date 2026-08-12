// constants.js
const ADMIN_IDS = [8231962200];
const DAILY_LIMIT_TEXT = '2,000,000';
const MIN_WITHDRAW = 100000;
const DEFAULT_USD_RATE = 60000;

// آرایه‌ی ایموجی‌ها – بدون محدودیت (ادمین هر ایموجی استاندارد تلگرام را می‌تواند وارد کند)
const ALLOWED_REACTIONS = [];

const DEPOSIT_CARDS = [
  { number: '6219861819068106', owner: 'علی بهادر' },
  { number: '5047061669481125', owner: 'علی بهادر' }
];

// منوی اصلی جدید (چیدمان دقیق طبق سند)
const mainMenuButtons = [
  { key: 'buy',     text: '✨ خرید' },
  { key: 'sell',    text: '✨ فروش' },
  { key: 'wallet',  text: '🧳 جیب' },
  { key: 'bonus',   text: '💎 بونوس' },
  { key: 'special', text: '🎁 ویژه ووچینو⁰۱' },
  { key: 'website', text: '🌐 وب‌سایت ووچینو⁰۱' },
  { key: 'support', text: '📥 پشتیبانی' }
];

// دکمه‌ی پنل مدیریت (فقط برای ادمین‌ها نمایش داده می‌شود)
const ADMIN_BUTTON = { key: 'admin_panel', text: '👑 پنل مدیریت' };

const BROADCAST_SETTINGS = {
  BATCH_SIZE: 30,
  DELAY_BETWEEN_BATCHES: 2000,
  MAX_RETRY: 3
};

const DELIVERY_TYPES = {
  CODE: 'code',
  WALLET: 'wallet',
  TELEGRAM_ID: 'telegram_id'
};

const PRICE_TYPES = {
  USD: 'usd',
  TOMAN: 'toman',
  CRYPTO: 'crypto'
};

const GAME_TYPES = {
  DICE: 'dice',
  BASKETBALL: 'basketball',
  DARTS: 'darts',
  BOWLING: 'bowling',
  FOOTBALL: 'football',
  RPS: 'rock_paper_scissors',
  SPIN: 'spin'
};

module.exports = {
  ADMIN_IDS,
  DAILY_LIMIT_TEXT,
  MIN_WITHDRAW,
  DEFAULT_USD_RATE,
  ALLOWED_REACTIONS,
  DEPOSIT_CARDS,
  mainMenuButtons,
  ADMIN_BUTTON,
  BROADCAST_SETTINGS,
  DELIVERY_TYPES,
  PRICE_TYPES,
  GAME_TYPES
};
