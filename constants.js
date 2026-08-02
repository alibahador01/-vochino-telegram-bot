const ADMIN_IDS = [8231962200];
const DAILY_LIMIT_TEXT = '2,000,000';
const MIN_WITHDRAW = 100000;
const HOT_VOUCHER_MIN = 50000;
const DEFAULT_USD_RATE = 60000;

const BONUS_THRESHOLD = 500000;
const BONUS_AMOUNT = 100000;
const BONUS_WIN_PROBABILITY = 0.05;

const ALLOWED_REACTIONS = [
  '👍', '👎', '❤', '🔥', '🥰', '👏', '😁', '🤔', '🤯', '😱',
  '🤬', '😢', '🎉', '🤩', '🤮', '💩', '🙏', '👌', '🕊', '🤡',
  '🥱', '🥴', '😍', '🐳', '❤‍🔥', '🌚', '🌭', '💯', '🤣', '⚡',
  '🍌', '🏆', '💔', '🤨', '😐', '🍓', '🍾', '💋', '🖕', '😈',
  '😴', '😭', '🤓', '👻', '👨‍💻', '👀', '🎃', '🙈', '😇', '😨',
  '🤝', '✍', '🤗', '🫡', '🎅', '🎄', '☃', '💅', '🤪', '🗿',
  '🆒', '💘', '🙉', '🦄', '😘', '💊', '🙊', '😎', '👾', '🤷‍♂',
  '🤷', '🤷‍♀', '😡'
];

const DEPOSIT_CARDS = [
  { number: '6219861819068106', owner: 'علی بهادر' },
  { number: '5047061669481125', owner: 'علی بهادر' }
];

const mainMenuButtons = [
  { key: 'buy', text: '✨ خرید' },
  { key: 'sell', text: '✨ فروش' },
  { key: 'wallet', text: '🎒 جیب' },
  { key: 'profile', text: '🧢 پروفایل' },
  { key: 'rules_education', text: '📚 قوانین و آموزش' },
  { key: 'game', text: '🎮 بازی بونوس' },
  { key: 'support', text: '📥 پشتیبانی' }
];

module.exports = {
  ADMIN_IDS,
  DAILY_LIMIT_TEXT,
  MIN_WITHDRAW,
  HOT_VOUCHER_MIN,
  DEFAULT_USD_RATE,
  BONUS_THRESHOLD,
  BONUS_AMOUNT,
  BONUS_WIN_PROBABILITY,
  ALLOWED_REACTIONS,
  DEPOSIT_CARDS,
  mainMenuButtons
};
