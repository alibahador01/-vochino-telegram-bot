// constants.js
const ADMIN_IDS = [8231962200];
const SUPER_ADMIN_ID = 8231962200; // مالک اصلی ربات
const DAILY_LIMIT_TEXT = '2,000,000';
const MIN_WITHDRAW = 100000;
const DEFAULT_USD_RATE = 60000;

const ALLOWED_REACTIONS = [];

const DEPOSIT_CARDS = [
  { number: '6219861819068106', owner: 'علی بهادر' },
  { number: '5047061669481125', owner: 'علی بهادر' }
];

const mainMenuButtons = [
  { key: 'buy',     text: '✨ خرید ✨' },
  { key: 'sell',    text: '✨ فروش ✨' },
  { key: 'wallet',  text: '🧳 کیف پول' },
  { key: 'bonus',   text: '🧩 بونوس' },
  { key: 'special', text: '🎁 ویژه ووچینو⁰¹' },
  { key: 'website', text: '🌐 وب‌سایت ووچینو⁰¹' },
  { key: 'support', text: '🎧 پشتیبانی آنلاین' }
];

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

const ADMIN_LEVELS = {
  SUPPORT: 1,
  MANAGER: 3
};

const AI_THEMES = [
  { key: 'blue',    style: 'primary', emoji: '🔵', label: 'آبی' },
  { key: 'green',   style: 'success', emoji: '🟢', label: 'سبز' },
  { key: 'red',     style: 'danger',  emoji: '🔴', label: 'قرمز' },
  { key: 'default', style: null,      emoji: '🔘', label: 'اصلی (بدون رنگ)' }
];

const AI_DEFAULT_THEME = 'default';

const GEMINI_API_CONFIG = {
  SYSTEM_INSTRUCTION: 'به عنوان یک مشاور صرافی، پاسخ‌های خود را به‌صورت خلاصه و کوتاه بده تا کاربران راحت شوند.',
  USER_SUPPORT_BUTTON_TEXT: '📞 ارتباط با اپراتور',
  SUPPORT_OPERATOR_TELEGRAM_ID: process.env.SUPPORT_OPERATOR_TELEGRAM_ID,
  SUPPORT_MENU_BUTTONS: [
    { key: 'ai_support',    text: '🤖 پشتیبانی هوشمند' },
    { key: 'team_support',  text: '👤 پشتیبانی مجموعه' },
    { key: 'back_main',     text: '🔙 بازگشت' }
  ]
};

module.exports = {
  ADMIN_IDS,
  SUPER_ADMIN_ID,
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
  GAME_TYPES,
  ADMIN_LEVELS,
  AI_THEMES,
  AI_DEFAULT_THEME,
  GEMINI_API_CONFIG
};
