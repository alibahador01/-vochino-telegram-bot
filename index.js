const { Telegraf, Markup } = require('telegraf');
const { Pool } = require('pg');
const express = require('express');
const https = require('https'); // اضافه شده برای سیستم بیدار نگه داشتن

// Express Server for Render Health Check
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => { res.send('Bot is alive and connected to Supabase!'); });
app.listen(PORT, () => { console.log(`Web server is running on port ${PORT}`); });

// ===== سیستم ضد خواب ربات (Keep-Awake) =====
// این کد هر 3 دقیقه یک‌بار به سرور سر می‌زنه تا رندر جرات نکنه ربات رو خاموش کنه! 😎
setInterval(() => {
  const url = 'https://vochino-telegram-bot.onrender.com'; 
  https.get(url, (res) => {
    console.log(`[Keep-Awake] Pinged! Status: ${res.statusCode} - ربات چهارچشمی بیداره 👁️`);
  }).on('error', (err) => {
    console.log(`[Keep-Awake] Error: ${err.message}`);
  });
}, 3 * 60 * 1000); // 3 دقیقه (3 * 60 ثانیه * 1000 میلی‌ثانیه)
// ============================================

// Initialize Bot & PostgreSQL (Supabase) Pool
const bot = new Telegraf(process.env.BOT_TOKEN);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const ADMIN_IDS = [8231962200];
const DAILY_LIMIT_TEXT = '2,000,000';
const MIN_WITHDRAW = 100000;
const HOT_VOUCHER_MIN = 50000; // حداقل خرید هات ووچر (تومان)
const DEFAULT_USD_RATE = 60000; // نرخ پیش‌فرض دلار (تومان) — با دستور /setrate از تلگرام قابل تغییره

// ===== تنظیمات بونوس و بازی (اینجا رو هر موقع خواستی تغییر بده) =====
const BONUS_THRESHOLD = 500000; // حداقل مجموع خرید برای فعال شدن بونوس
const BONUS_AMOUNT = 100000; // مبلغ جایزه در صورت برد (تومان)
const BONUS_WIN_PROBABILITY = 0.05; // شانس برد (0.05 یعنی ۵٪ ، تقریباً ۱ از ۲۰ نفر)
// =======================================================================

// لیست ایموجی‌های مجاز تلگرام برای ری‌اکشن روی پیام (Bot API فقط همین‌ها را قبول می‌کند)
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

// ✅ مرحله ۱ - تابع ساخت کد پیگیری (VOC-xxxxxx)
function generateTrackingCode() {
  const randomPart = Math.floor(100000 + Math.random() * 900000);
  return 'VOC-' + randomPart;
}

const texts = {
  fa: {
    chooseLanguage: 'زبان خود را انتخاب کنید / Please choose your language:',
    welcome: 'به خانواده‌ی ما خوش اومدی! 🌟\nاینجا با خیال راحت خرید و فروش کن، ما همیشه پشتتیم.',
    requestPhone: 'برای تکمیل ثبت‌نام، لطفاً شماره تلفن خود را با دکمه‌ی زیر ارسال کنید 👇',
    sharePhoneButton: '📱 ارسال شماره تلفن',
    requestName: 'لطفاً نام و نام خانوادگی خود را وارد کنید:',
    requestCard: 'لطفاً شماره کارت بانکی خود را وارد کنید (کارتی که برای واریز استفاده می‌کنید):',
    rulesText: 'قوانین و شرایط استفاده:\n\n(متن قوانین بعداً از پنل مدیریت تکمیل می‌شود)\n\nتوجه: واریزی فقط از کارتی که به نام شما ثبت شده معتبر است.',
    confirmRulesButton: '✅ قوانین را می‌پذیرم',
    registrationSuccess: '🎉 ثبت‌نام شما با موفقیت انجام شد!\nاز همین حالا می‌تونی با خیال راحت خرید کنی.\nسقف خرید روزانه‌ت: ' + DAILY_LIMIT_TEXT + ' تومان',
    welcomeBack: 'خوش برگشتی، خوشحالیم دوباره می‌بینیمت! 👋',

    mustJoinTitle: 'برای استفاده از ربات، ابتدا باید عضو کانال زیر شوید:',
    joinChannelButton: '📢 عضویت در کانال',
    checkMembershipButton: '✅ عضو شدم',
    stillNotMember: 'هنوز عضو کانال نشده‌اید. لطفاً ابتدا عضو شوید، سپس دوباره تلاش کنید.',
    walletTitle: '🎒 جیب',
    walletBalance: '💰 موجودی فعلی شما: ',
    walletIncrease: '➕ افزایش موجودی',
    walletWithdraw: '💳 برداشت موجودی',
    walletAddCard: '➕ افزودن کارت جدید',
    backButton: '🔙 بازگشت',
    depositMethodTitle: 'روش افزایش موجودی را انتخاب کنید:',
    depositCard2Card: '💳 کارت به کارت',
    depositTron: '🪙 ترون (تتر)',
    depositGateway: '🌐 درگاه پرداخت',
    comingSoon: 'به‌زودی 🙂',
    depositCardsTrust: '✅ پرداخت شما مستقیماً و بدون واسطه به حساب رسمی مجموعه واریز می‌شود.\n💚 هزاران کاربر با خیال راحت از این روش استفاده کرده‌اند.\n\nلطفاً مبلغ واریزی خود را به یکی از کارت‌های زیر واریز کنید:',
    depositAskAmount: 'مبلغ واریزی خود را به تومان وارد کنید:',
    depositAskReceipt: 'رسید (فیش) پرداخت خود را همینجا ارسال کنید 📎',
    depositSubmitted: 'درخواست شارژ شما ثبت شد ✅\nپس از بررسی توسط پشتیبانی (معمولاً خیلی سریع)، موجودی شما به‌روزرسانی خواهد شد.',
    withdrawAskAmount: 'مبلغ برداشت خود را به تومان وارد کنید (حداقل ' + MIN_WITHDRAW.toLocaleString('en-US') + ' تومان):',
    withdrawMinError: 'حداقل مبلغ برداشت ' + MIN_WITHDRAW.toLocaleString('en-US') + ' تومان است. لطفاً دوباره وارد کنید:',
    withdrawSelectCard: 'شماره کارت خود را انتخاب کنید:',
    withdrawSubmitted: 'درخواست برداشت شما ثبت شد ✅\nپس از بررسی توسط پشتیبانی، مبلغ به کارت شما واریز خواهد شد.',
    addCardAsk: 'شماره کارت جدید را وارد کنید (۱۶ رقم):',
    addCardInvalid: 'شماره کارت وارد شده معتبر نیست. لطفاً دوباره تلاش کنید:',
    addCardSuccess: 'کارت جدید با موفقیت ثبت شد ✅',
    addCardButton: '➕ افزودن کارت جدید',
    buyMenuTitle: '✨ کدوم محصول رو می‌خوای بخری؟',
    buyNoProducts: 'فعلاً هیچ محصولی برای فروش تعریف نشده.',
    buyAskAmountUsd: '💵 قیمت هر دلار: {rate} تومان\n💰 حداقل خرید: {minUsd} دلار (حدود {minToman} تومان)\n\nمبلغ خرید خود را به تومان وارد کنید:\nمثال: 200000',
    buyAskAmountToman: '💰 حداقل خرید: {min} تومان\n\nمبلغ خرید خود را به تومان وارد کنید:\nمثال: 200000',
    buyMinError: 'مبلغ واردشده کمتر از حداقل خرید ({min} تومان) است. لطفاً دوباره وارد کنید:',
    buyConfirmSummary: '📦 خلاصه‌ی سفارش:\n\nمحصول: {product}\nمبلغ: {amount} تومان\n\nبا تایید، این مبلغ از موجودی کیف پولت کسر می‌شه.',
    buyConfirmButton: '✅ تایید و خرید',
    buyCancelButton: '❌ انصراف',
    buySuccess: '🎉 خرید شما با موفقیت انجام شد!\n\n🆔 کد پیگیری: {trackingCode}\n📦 محصول: {product}\n💰 مبلغ: {amount} تومان\n\nموجودی جدید: {balance} تومان',
    buyInsufficientBalance: '❌ موجودی کیف پولت کافی نیست.\nمبلغ سفارش: {amount} تومان\nموجودی فعلی: {balance} تومان\n\nاول کیف پولت رو شارژ کن، بعد دوباره امتحان کن.',
    buyChargeWalletButton: '💳 شارژ کیف پول',
    buyCancelled: 'سفارش لغو شد.',
    profileTitle: '👤 پروفایل شما',
    invoicesTitle: '🧾 فاکتورهای من',
    invoicesEmpty: 'هنوز هیچ فاکتوری برای شما ثبت نشده.',
    supportTitle: '📞 پشتیبانی\n\nقبل از تماس، یه نگاه به سوالات متداول بنداز، شاید جوابت همونجا باشه 👇',
    supportFaqButton: '❓ سوالات متداول',
    supportContactButton: '💬 ارتباط با پشتیبانی',
    supportContactText: 'برای ارتباط مستقیم با پشتیبانی، پیام خودتون رو همینجا بنویسید تا در اسرع وقت جواب بگیرید.',
    faqText: '❓ سوالات متداول\n\n' +
      '🔹 چقدر طول می‌کشه شارژم تایید بشه؟\n' +
      'معمولاً چند دقیقه، حداکثر تا چند ساعت.\n\n' +
      '🔹 حداقل مبلغ برداشت چقدره؟\n' +
      MIN_WITHDRAW.toLocaleString('en-US') + ' تومان.\n\n' +
      '🔹 آیا واریزی از کارت دیگران قبوله؟\n' +
      'نه، فقط از کارتی که به نام خودتون ثبت شده.\n\n' +
      '🔹 بونوس بازی چطور فعال می‌شه؟\n' +
      'با رسیدن مجموع خریدت به ' + BONUS_THRESHOLD.toLocaleString('en-US') + ' تومان، یه بونوس بازی برات فعال می‌شه.',
    gameMenuTitle: '🎮 بازی و بونوس',
    gameNotEligible: '🔒 هنوز بونوس بازی برات فعال نشده.\n\n' +
      'با رسیدن مجموع خریدت به ' + BONUS_THRESHOLD.toLocaleString('en-US') + ' تومان، یه بونوس ' + BONUS_AMOUNT.toLocaleString('en-US') + ' تومنی می‌گیری که می‌تونی باهاش بازی کنی و ببری! 🎁',
    gameEligibleIntro: '🎁 تبریک! یه بونوس ' + BONUS_AMOUNT.toLocaleString('en-US') + ' تومنی داری.\n' +
      'یکی از بازی‌های زیر رو انتخاب کن و شانستو امتحان کن. اگه ببری، مبلغ مستقیم میاد تو موجودیت و می‌تونی همون لحظه برداشت بزنی 💸',
    gameAlreadyUsed: 'بونوس بازیت رو قبلاً استفاده کردی. با رسیدن به سقف خرید بعدی، دوباره یه بونوس جدید فعال می‌شه.',
    gameDiceButton: '🎲 بازی تاس',
    gameBasketballButton: '🏀 بازی بسکتبال',
    gamePlaying: '🎲 در حال بازی... منتظر بمون تا نتیجه مشخص بشه...',
    gameWin: '🎉🎉 تبریک، بردی!!\nمبلغ ' + BONUS_AMOUNT.toLocaleString('en-US') + ' تومان به موجودیت اضافه شد. می‌تونی همین الان برداشت بزنی 💸',
    gameLose: '😔 این بار نبردی، بونوست مصرف شد.\nنگران نباش، با خرید بعدیت دوباره شانس داری!'
  }
};

const mainMenuButtons = [
  { key: 'buy', text: '✨ خرید' },
  { key: 'sell', text: '✨ فروش' },
  { key: 'wallet', text: '🎒 جیب' },
  { key: 'profile', text: '🧢 پروفایل' },
  { key: 'game', text: '🎮 بازی بونوس' },
  { key: 'rules_education', text: '📚 قوانین و آموزش' },
  { key: 'support', text: '📥 پشتیبانی' }
];

function showMainMenu(ctx) {
  const rows = [];
  for (let i = 0; i < mainMenuButtons.length; i += 2) {
    const row = [];
    row.push({ text: mainMenuButtons[i].text, callback_data: 'menu_' + mainMenuButtons[i].key });
    if (mainMenuButtons[i + 1]) {
      row.push({ text: mainMenuButtons[i + 1].text, callback_data: 'menu_' + mainMenuButtons[i + 1].key });
    }
    rows.push(row);
  }
  ctx.reply('منوی اصلی 🏠', { reply_markup: { inline_keyboard: rows } });
}

const sessions = {};

async function getUser(telegramId) {
  const res = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [String(telegramId)]);
  return res.rows[0] || null;
}

async function getUserCards(telegramId) {
  const user = await getUser(telegramId);
  const extraRes = await pool.query('SELECT * FROM cards WHERE telegram_id = $1', [String(telegramId)]);
  const list = [];
  if (user && user.card_number) {
    list.push({ card_number: user.card_number });
  }
  extraRes.rows.forEach(function (c) { list.push({ card_number: c.card_number }); });
  return list;
}

async function checkMembership(ctx) {
  const channelsRes = await pool.query('SELECT * FROM required_channels WHERE active = 1');
  const channels = channelsRes.rows;
  if (channels.length === 0) return true;

  for (const channel of channels) {
    try {
      const member = await ctx.telegram.getChatMember(channel.chat_id, ctx.from.id);
      if (member.status === 'left' || member.status === 'kicked') {
        return false;
      }
    } catch (e) {
      console.log('خطا در بررسی عضویت: ' + e.message);
      return false;
    }
  }
  return true;
}

async function showJoinPrompt(ctx) {
  const t = texts.fa;
  const channelsRes = await pool.query('SELECT * FROM required_channels WHERE active = 1');
  const channels = channelsRes.rows;

  const buttons = channels.map(function (c) {
    return [{ text: t.joinChannelButton, url: c.invite_link }];
  });
  buttons.push([{ text: t.checkMembershipButton, callback_data: 'check_membership' }]);

  ctx.reply(t.mustJoinTitle, { reply_markup: { inline_keyboard: buttons } });
}

bot.command('setreaction', async (ctx) => {
  if (ADMIN_IDS.indexOf(Number(ctx.from.id)) === -1) return;
  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    const currentRes = await pool.query('SELECT value FROM settings WHERE key = $1', ['start_reaction']);
    const current = currentRes.rows[0] ? currentRes.rows[0].value : '🔥';
    ctx.reply('❌ لطفاً ایموجی مورد نظر را بعد از دستور وارد کنید.\nایموجی فعلی ربات: ' + current + '\n\nمثال:\n/setreaction 🔥', { parse_mode: 'Markdown' });
    return;
  }
  const newEmoji = args[1];

  if (ALLOWED_REACTIONS.indexOf(newEmoji) === -1) {
    ctx.reply(
      '⚠️ این ایموجی جزو ری‌اکشن‌های مجاز تلگرام نیست.\n' +
      'چند نمونه‌ی مجاز:\n🎉 🔥 🤩 💯 🏆 ❤ 👏'
    );
    return;
  }

  try {
    await ctx.telegram.setMessageReaction(ctx.chat.id, ctx.message.message_id, [{ type: 'emoji', emoji: newEmoji }], true);
  } catch (e) {
    ctx.reply('⚠️ خطای واقعی: ' + e.message);
    return;
  }

  await pool.query(
    'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
    ['start_reaction', newEmoji]
  );
  ctx.reply('✅ اکشن استارت با موفقیت به (' + newEmoji + ') تغییر یافت!');
});

bot.command('setrate', async (ctx) => {
  if (ADMIN_IDS.indexOf(Number(ctx.from.id)) === -1) return;
  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    const currentRate = await getUsdRate();
    ctx.reply('❌ لطفاً نرخ جدید را وارد کنید.\nنرخ فعلی: ' + currentRate.toLocaleString('en-US') + ' تومان\n\nمثال:\n/setrate 65000', { parse_mode: 'Markdown' });
    return;
  }
  const newRate = parseInt(args[1].replace(/[^0-9]/g, ''), 10);
  if (!newRate || newRate <= 0) {
    ctx.reply('⚠️ عدد واردشده معتبر نیست.');
    return;
  }
  await pool.query(
    'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
    ['usd_rate', String(newRate)]
  );
  ctx.reply('✅ نرخ دلار با موفقیت به ' + newRate.toLocaleString('en-US') + ' تومان تغییر یافت!');
});

bot.command('addproduct', async (ctx) => {
  if (ADMIN_IDS.indexOf(Number(ctx.from.id)) === -1) return;
  const raw = ctx.message.text.replace(/^\/addproduct(@\w+)?\s*/, '');
  const parts = raw.split('|').map(function (p) { return p.trim(); });

  if (parts.length !== 4) {
    ctx.reply(
      '❌ فرمت درست نیست.\n\n' +
      'فرمت صحیح:\n/addproduct کلید|نام نمایشی|حداقل مبلغ|نوع'
    );
    return;
  }

  const [key, name, minAmountRaw, priceType] = parts;
  const minAmount = Number(minAmountRaw.replace(/[^0-9.]/g, ''));

  if (!key || !name || !minAmount || (priceType !== 'usd' && priceType !== 'toman')) {
    ctx.reply('❌ مقادیر نامعتبر است.');
    return;
  }

  await pool.query(
    'INSERT INTO products (key, name, min_amount, price_type, active, created_at) VALUES ($1, $2, $3, $4, 1, $5) ' +
    'ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, min_amount = EXCLUDED.min_amount, price_type = EXCLUDED.price_type, active = 1',
    [key, name, minAmount, priceType, new Date().toISOString()]
  );

  ctx.reply('✅ محصول «' + name + '» با موفقیت اضافه/ویرایش شد.');
});

bot.command('listproducts', async (ctx) => {
  if (ADMIN_IDS.indexOf(Number(ctx.from.id)) === -1) return;
  const res = await pool.query('SELECT * FROM products ORDER BY id ASC');

  if (res.rows.length === 0) {
    ctx.reply('هنوز هیچ محصولی تعریف نشده.');
    return;
  }

  let message = '📦 لیست محصولات:\n\n';
  res.rows.forEach(function (p) {
    const statusLabel = p.active ? '✅ فعال' : '⛔️ غیرفعال';
    const priceLabel = p.price_type === 'usd' ? Number(p.min_amount) + ' دلار' : Number(p.min_amount).toLocaleString('en-US') + ' تومان';
    message += 'کلید: ' + p.key + '\nنام: ' + p.name + '\nحداقل خرید: ' + priceLabel + '\nوضعیت: ' + statusLabel + '\n\n';
  });

  ctx.reply(message, { parse_mode: 'Markdown' });
});

bot.command('removeproduct', async (ctx) => {
  if (ADMIN_IDS.indexOf(Number(ctx.from.id)) === -1) return;
  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    ctx.reply('❌ کلید محصول رو وارد کنید.');
    return;
  }
  const key = args[1].trim();
  const res = await pool.query("UPDATE products SET active = 0 WHERE key = $1 RETURNING name", [key]);

  if (res.rows.length === 0) {
    ctx.reply('محصولی با این کلید پیدا نشد.');
    return;
  }

  ctx.reply('✅ محصول «' + res.rows[0].name + '» غیرفعال شد.');
});

bot.command('find', async (ctx) => {
  if (ADMIN_IDS.indexOf(Number(ctx.from.id)) === -1) return;
  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    ctx.reply('❌ کد پیگیری رو بعد از دستور بنویس.\nمثال:\n/find VOC-847392');
    return;
  }
  const code = args[1].trim().toUpperCase();

  const orderRes = await pool.query('SELECT * FROM orders WHERE tracking_code = $1', [code]);
  const walletRes = await pool.query('SELECT * FROM wallet_requests WHERE tracking_code = $1', [code]);

  if (orderRes.rows.length === 0 && walletRes.rows.length === 0) {
    ctx.reply('❌ هیچ رکوردی با این کد پیگیری پیدا نشد.');
    return;
  }

  if (orderRes.rows.length > 0) {
    const o = orderRes.rows[0];
    const user = await getUser(o.telegram_id);
    ctx.reply(
      '📦 سفارش خرید\n\n🆔 کد پیگیری: ' + o.tracking_code +
      '\n👤 نام: ' + (user ? user.full_name : 'نامشخص') +
      '\n📱 شماره: ' + (user ? user.phone : '-') +
      '\n📦 محصول: ' + o.product_type +
      '\n💰 مبلغ: ' + Number(o.amount).toLocaleString('en-US') + ' تومان' +
      '\n📌 وضعیت: ' + o.status +
      '\n📅 تاریخ: ' + o.created_at
    );
  }

  if (walletRes.rows.length > 0) {
    const w = walletRes.rows[0];
    const user = await getUser(w.telegram_id);
    const typeLabel = w.type === 'deposit' ? '➕ شارژ کیف پول' : '💳 برداشت موجودی';
    ctx.reply(
      typeLabel + '\n\n🆔 کد پیگیری: ' + w.tracking_code +
      '\n👤 نام: ' + (user ? user.full_name : 'نامشخص') +
      '\n📱 شماره: ' + (user ? user.phone : '-') +
      '\n💰 مبلغ: ' + Number(w.amount).toLocaleString('en-US') + ' تومان' +
      '\n📌 وضعیت: ' + w.status +
      '\n📅 تاریخ: ' + w.created_at
    );
  }
});

async function triggerStartReaction(ctx) {
  try {
    const settingRes = await pool.query('SELECT value FROM settings WHERE key = $1', ['start_reaction']);
    let emoji = settingRes.rows[0] ? settingRes.rows[0].value : '🎉';
    if (ALLOWED_REACTIONS.indexOf(emoji) === -1) { emoji = '🎉'; }
    await ctx.telegram.setMessageReaction(ctx.chat.id, ctx.message.message_id, [{ type: 'emoji', emoji: emoji }], true);
  } catch (e) {
    console.log('REACTION ERROR: ' + e.message);
  }
}

bot.action('check_membership', async (ctx) => {
  ctx.answerCbQuery();
  const isMember = await checkMembership(ctx);

  if (!isMember) {
    ctx.reply(texts.fa.stillNotMember);
    return;
  }

  ctx.deleteMessage().catch(function () {});
  const existingUser = await getUser(ctx.from.id);
  if (existingUser) {
    const lang = existingUser.language || 'fa';
    ctx.reply(texts[lang].welcomeBack);
    showMainMenu(ctx);
  } else {
    ctx.reply(texts.fa.chooseLanguage, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🇮🇷 فارسی', callback_data: 'lang_fa' },
            { text: '🇬🇧 English', callback_data: 'lang_en' }
          ]
        ]
      }
    });
  }
});

bot.start(async (ctx) => {
  triggerStartReaction(ctx);

  const isMember = await checkMembership(ctx);
  if (!isMember) {
    await showJoinPrompt(ctx);
    return;
  }

  const existingUser = await getUser(ctx.from.id);
  if (existingUser) {
    const lang = existingUser.language || 'fa';
    ctx.reply(texts[lang].welcomeBack);
    showMainMenu(ctx);
    return;
  }

  ctx.reply(texts.fa.chooseLanguage, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🇮🇷 فارسی', callback_data: 'lang_fa' },
          { text: '🇬🇧 English', callback_data: 'lang_en' }
        ]
      ]
    }
  });
});

function handleLanguageChoice(ctx, lang) {
  sessions[ctx.from.id] = { flow: 'registration', step: 'waiting_phone', lang: lang, data: {} };
  const t = texts[lang] || texts.fa;
  ctx.editMessageText(t.welcome);

  ctx.reply(
    t.requestPhone,
    Markup.keyboard([
      Markup.button.contactRequest(t.sharePhoneButton)
    ]).resize().oneTime()
  );
}

bot.action('lang_fa', (ctx) => handleLanguageChoice(ctx, 'fa'));
bot.action('lang_en', (ctx) => handleLanguageChoice(ctx, 'fa'));

bot.on('contact', (ctx) => {
  const session = sessions[ctx.from.id];
  if (!session || session.flow !== 'registration') return;

  session.data.phone = ctx.message.contact.phone_number;
  session.step = 'waiting_name';

  const t = texts[session.lang] || texts.fa;
  ctx.reply(t.requestName, { reply_markup: { remove_keyboard: true } });
});

async function showWalletMenu(ctx) {
  const t = texts.fa;
  const user = await getUser(ctx.from.id);
  const balance = user ? user.balance : 0;

  ctx.reply(t.walletTitle + '\n\n' + t.walletBalance + Number(balance).toLocaleString('en-US') + ' تومان', {
    reply_markup: {
      inline_keyboard: [
        [{ text: t.walletIncrease, callback_data: 'wallet_deposit' }],
        [{ text: t.walletWithdraw, callback_data: 'wallet_withdraw' }],
        [{ text: t.walletAddCard, callback_data: 'wallet_addcard' }],
        [{ text: '🧾 گزارش تراکنش‌ها', callback_data: 'menu_invoices' }]
      ]
    }
  });
}

bot.action('menu_wallet', async (ctx) => {
  ctx.answerCbQuery();
  await showWalletMenu(ctx);
});

bot.action('menu_referral', (ctx) => {
  ctx.answerCbQuery();
  ctx.reply('به‌زودی 🙂');
});

bot.action('menu_profile', async (ctx) => {
  ctx.answerCbQuery();
  const t = texts.fa;
  const user = await getUser(ctx.from.id);
  if (!user) {
    ctx.reply('اطلاعاتی برای شما ثبت نشده.');
    return;
  }
  ctx.reply(
    t.profileTitle + '\n\n' +
    '👤 نام: ' + (user.full_name || '-') + '\n' +
    '📱 شماره تلفن: ' + (user.phone || '-') + '\n' +
    '💳 شماره کارت: ' + (user.card_number || '-') + '\n' +
    '💰 موجودی: ' + Number(user.balance).toLocaleString('en-US') + ' تومان'
  );
});

bot.action('menu_invoices', async (ctx) => {
  ctx.answerCbQuery();
  const t = texts.fa;
  const walletRes = await pool.query(
    'SELECT id, type, amount, status, created_at FROM wallet_requests WHERE telegram_id = $1',
    [String(ctx.from.id)]
  );
  const ordersRes = await pool.query(
    'SELECT o.id, o.product_type, o.amount, o.status, o.created_at, p.name AS product_name ' +
    'FROM orders o LEFT JOIN products p ON p.key = o.product_type ' +
    'WHERE o.telegram_id = $1',
    [String(ctx.from.id)]
  );

  const combined = [];
  walletRes.rows.forEach(function (r) {
    combined.push({
      label: r.type === 'deposit' ? '➕ شارژ' : '💳 برداشت',
      amount: r.amount,
      status: r.status,
      created_at: r.created_at
    });
  });
  ordersRes.rows.forEach(function (r) {
    const productLabel = '🛒 خرید ' + (r.product_name || r.product_type);
    combined.push({
      label: productLabel,
      amount: r.amount,
      status: r.status,
      created_at: r.created_at
    });
  });

  combined.sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
  const latest = combined.slice(0, 10);

  if (latest.length === 0) {
    ctx.reply(t.invoicesTitle + '\n\n' + t.invoicesEmpty);
    return;
  }

  let message = t.invoicesTitle + '\n\n';
  latest.forEach(function (r) {
    const statusLabel = r.status === 'pending' ? '⏳ در انتظار' : (r.status === 'approved' || r.status === 'completed' ? '✅ انجام‌شده' : '❌ رد شده');
    message += r.label + ' | ' + Number(r.amount).toLocaleString('en-US') + ' تومان | ' + statusLabel + '\n';
  });
  ctx.reply(message);
});

bot.action('menu_support', (ctx) => {
  ctx.answerCbQuery();
  const t = texts.fa;
  ctx.reply(t.supportTitle, {
    reply_markup: {
      inline_keyboard: [
        [{ text: t.supportFaqButton, callback_data: 'support_faq' }],
        [{ text: t.supportContactButton, callback_data: 'support_contact' }]
      ]
    }
  });
});

bot.action('support_faq', (ctx) => {
  ctx.answerCbQuery();
  ctx.reply(texts.fa.faqText);
});

bot.action('support_contact', (ctx) => {
  ctx.answerCbQuery();
  ctx.reply(texts.fa.supportContactText);
});

async function getUserTotalPurchases(telegramId) {
  const res = await pool.query(
    "SELECT COALESCE(SUM(amount), 0) AS total FROM orders WHERE telegram_id = $1 AND status = 'completed'",
    [String(telegramId)]
  );
  return Number(res.rows[0].total);
}

async function getActiveBonus(telegramId) {
  const res = await pool.query(
    "SELECT * FROM bonuses WHERE telegram_id = $1 AND status = 'available' ORDER BY id DESC LIMIT 1",
    [String(telegramId)]
  );
  return res.rows[0] || null;
}

async function grantBonusIfEligible(telegramId) {
  const total = await getUserTotalPurchases(telegramId);
  if (total < BONUS_THRESHOLD) return;

  const existing = await pool.query(
    'SELECT * FROM bonuses WHERE telegram_id = $1',
    [String(telegramId)]
  );
  if (existing.rows.length > 0) return; 

  await pool.query(
    'INSERT INTO bonuses (telegram_id, status, amount, created_at) VALUES ($1, $2, $3, $4)',
    [String(telegramId), 'available', BONUS_AMOUNT, new Date().toISOString()]
  );
}

async function getUsdRate() {
  const res = await pool.query('SELECT value FROM settings WHERE key = $1', ['usd_rate']);
  return res.rows[0] ? Number(res.rows[0].value) : DEFAULT_USD_RATE;
}

function fillTemplate(template, values) {
  let result = template;
  Object.keys(values).forEach(function (key) {
    result = result.split('{' + key + '}').join(values[key]);
  });
  return result;
}

bot.action('menu_game', async (ctx) => {
  ctx.answerCbQuery();
  const t = texts.fa;
  const bonus = await getActiveBonus(ctx.from.id);

  if (!bonus) {
    const hasAnyBonus = await pool.query('SELECT * FROM bonuses WHERE telegram_id = $1', [String(ctx.from.id)]);
    if (hasAnyBonus.rows.length > 0) {
      ctx.reply(t.gameAlreadyUsed);
    } else {
      ctx.reply(t.gameNotEligible);
    }
    return;
  }

  ctx.reply(t.gameEligibleIntro, {
    reply_markup: {
      inline_keyboard: [
        [{ text: t.gameDiceButton, callback_data: 'game_play_dice' }],
        [{ text: t.gameBasketballButton, callback_data: 'game_play_basketball' }]
      ]
    }
  });
});

async function playBonusGame(ctx, emoji) {
  const t = texts.fa;
  const bonus = await getActiveBonus(ctx.from.id);
  if (!bonus) {
    ctx.reply(t.gameAlreadyUsed);
    return;
  }

  await pool.query("UPDATE bonuses SET status = 'in_progress' WHERE id = $1", [bonus.id]);
  await ctx.reply(t.gamePlaying);
  await ctx.sendDice({ emoji: emoji }).catch(function () {});

  const won = Math.random() < BONUS_WIN_PROBABILITY;

  setTimeout(async function () {
    try {
      if (won) {
        await pool.query('UPDATE users SET balance = balance + $1 WHERE telegram_id = $2', [BONUS_AMOUNT, String(ctx.from.id)]);
        await pool.query("UPDATE bonuses SET status = 'used_won' WHERE id = $1", [bonus.id]);
        ctx.reply(t.gameWin);
      } else {
        await pool.query("UPDATE bonuses SET status = 'used_lost' WHERE id = $1", [bonus.id]);
        ctx.reply(t.gameLose);
      }
    } catch (e) {
      console.log('Game settlement error: ' + e.message);
    }
  }, 4000);
}

bot.action('game_play_dice', async (ctx) => {
  ctx.answerCbQuery();
  await playBonusGame(ctx, '🎲');
});

bot.action('game_play_basketball', async (ctx) => {
  ctx.answerCbQuery();
  await playBonusGame(ctx, '🏀');
});

bot.action('menu_buy', async (ctx) => {
  ctx.answerCbQuery();
  const t = texts.fa;
  const productsRes = await pool.query('SELECT * FROM products WHERE active = 1 ORDER BY id ASC');

  if (productsRes.rows.length === 0) {
    ctx.reply(t.buyNoProducts);
    return;
  }

  const buttons = productsRes.rows.map(function (p) {
    return [{ text: p.name, callback_data: 'buy_' + p.key }];
  });

  ctx.reply(t.buyMenuTitle, { reply_markup: { inline_keyboard: buttons } });
});

bot.action('buy_cancel', (ctx) => {
  ctx.answerCbQuery();
  delete sessions[ctx.from.id];
  ctx.reply(texts.fa.buyCancelled);
});

bot.action('buy_confirm', async (ctx) => {
  ctx.answerCbQuery();
  const t = texts.fa;
  const session = sessions[ctx.from.id];
  if (!session || session.flow !== 'buy' || session.step !== 'waiting_confirm') {
    ctx.reply(t.buyCancelled);
    return;
  }

  const user = await getUser(ctx.from.id);
  const amount = session.data.amount;

  if (!user || Number(user.balance) < amount) {
    delete sessions[ctx.from.id];
    ctx.reply(fillTemplate(t.buyInsufficientBalance, {
      amount: amount.toLocaleString('en-US'),
      balance: user ? Number(user.balance).toLocaleString('en-US') : '0'
    }), {
      reply_markup: { inline_keyboard: [[{ text: t.buyChargeWalletButton, callback_data: 'wallet_deposit' }]] }
    });
    return;
  }

  await pool.query('UPDATE users SET balance = balance - $1 WHERE telegram_id = $2', [amount, String(ctx.from.id)]);

  const trackingCode = generateTrackingCode();
  await pool.query(
    'INSERT INTO orders (telegram_id, product_type, amount, status, created_at, tracking_code) VALUES ($1, $2, $3, $4, $5, $6)',
    [String(ctx.from.id), session.data.productType, amount, 'completed', new Date().toISOString(), trackingCode]
  );

  const newBalanceRes = await pool.query('SELECT balance FROM users WHERE telegram_id = $1', [String(ctx.from.id)]);
  const newBalance = newBalanceRes.rows[0].balance;

  delete sessions[ctx.from.id];

  ctx.reply(fillTemplate(t.buySuccess, {
    product: session.data.productLabel,
    amount: amount.toLocaleString('en-US'),
    balance: Number(newBalance).toLocaleString('en-US'),
    trackingCode: trackingCode
  }));

  await grantBonusIfEligible(ctx.from.id);
});

bot.action(/^buy_(.+)/, async (ctx) => {
  const key = ctx.match[1];

  ctx.answerCbQuery();
  const t = texts.fa;

  const productRes = await pool.query('SELECT * FROM products WHERE key = $1 AND active = 1', [key]);
  const product = productRes.rows[0];
  if (!product) {
    ctx.reply(t.buyNoProducts);
    return;
  }

  let minToman;
  let messageText;

  if (product.price_type === 'usd') {
    const rate = await getUsdRate();
    minToman = Math.round(Number(product.min_amount) * rate);
    messageText = fillTemplate(t.buyAskAmountUsd, {
      rate: rate.toLocaleString('en-US'),
      minUsd: Number(product.min_amount).toLocaleString('en-US'),
      minToman: minToman.toLocaleString('en-US')
    });
  } else {
    minToman = Number(product.min_amount);
    messageText = fillTemplate(t.buyAskAmountToman, { min: minToman.toLocaleString('en-US') });
  }

  sessions[ctx.from.id] = {
    flow: 'buy',
    step: 'waiting_amount',
    lang: 'fa',
    data: { productType: product.key, productLabel: product.name, minAmount: minToman }
  };

  ctx.reply(messageText);
});

bot.action('menu_rules_education', (ctx) => {
  ctx.answerCbQuery();
  ctx.reply(texts.fa.rulesText + '\n\n📚 آموزش استفاده از ربات به‌زودی همینجا قرار می‌گیره.');
});

bot.action('menu_rules', (ctx) => {
  ctx.answerCbQuery();
  ctx.reply(texts.fa.rulesText);
});

bot.action('menu_education', (ctx) => {
  ctx.answerCbQuery();
  ctx.reply('📚 آموزش استفاده از ربات به‌زودی همینجا قرار می‌گیره.');
});

bot.action(/^menu_.+/, (ctx) => {
  const actionKey = ctx.match[0];
  const known = ['menu_wallet', 'menu_referral', 'menu_profile', 'menu_invoices', 'menu_support', 'menu_game', 'menu_rules', 'menu_education', 'menu_rules_education', 'menu_buy'];
  if (known.indexOf(actionKey) !== -1) return;
  ctx.answerCbQuery();
  ctx.reply('این بخش به‌زودی تکمیل می‌شود 🛠');
});

bot.action('wallet_deposit', (ctx) => {
  ctx.answerCbQuery();
  const t = texts.fa;
  ctx.reply(t.depositMethodTitle, {
    reply_markup: {
      inline_keyboard: [
        [{ text: t.depositCard2Card, callback_data: 'deposit_card2card' }],
        [{ text: t.depositTron, callback_data: 'deposit_tron' }],
        [{ text: t.depositGateway, callback_data: 'deposit_gateway' }]
      ]
    }
  });
});

bot.action('deposit_tron', (ctx) => { ctx.answerCbQuery(); ctx.reply(texts.fa.comingSoon); });
bot.action('deposit_gateway', (ctx) => { ctx.answerCbQuery(); ctx.reply(texts.fa.comingSoon); });

bot.action('deposit_card2card', (ctx) => {
  ctx.answerCbQuery();
  const t = texts.fa;

  let cardsMessage = t.depositCardsTrust + '\n\n';
  DEPOSIT_CARDS.forEach(function (c) {
    cardsMessage += '`' + c.number + '`' + '\n' + c.owner + '\n\n';
  });

  ctx.reply(cardsMessage, { parse_mode: 'Markdown' }).then(function () {
    sessions[ctx.from.id] = { flow: 'deposit', step: 'waiting_amount', lang: 'fa', data: {} };
    ctx.reply(t.depositAskAmount);
  });
});

bot.action('wallet_withdraw', (ctx) => {
  ctx.answerCbQuery();
  sessions[ctx.from.id] = { flow: 'withdraw', step: 'waiting_amount', lang: 'fa', data: {} };
  ctx.reply(texts.fa.withdrawAskAmount);
});

bot.action(/^withdraw_card_/, async (ctx) => {
  ctx.answerCbQuery();
  const cardNumber = ctx.match[0].replace('withdraw_card_', '');
  const session = sessions[ctx.from.id];
  const amount = session && session.data ? session.data.amount : null;

  const trackingCode = generateTrackingCode();
  await pool.query(
    'INSERT INTO wallet_requests (telegram_id, type, amount, card_number, status, created_at, tracking_code) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [String(ctx.from.id), 'withdraw', amount, cardNumber, 'pending', new Date().toISOString(), trackingCode]
  );

  delete sessions[ctx.from.id];
  ctx.reply(texts.fa.withdrawSubmitted + '\n\n🆔 کد پیگیری: ' + trackingCode);
});

bot.action('wallet_addcard', (ctx) => {
  ctx.answerCbQuery();
  sessions[ctx.from.id] = { flow: 'addcard', step: 'waiting_card', lang: 'fa', data: {} };
  ctx.reply(texts.fa.addCardAsk);
});

bot.action('confirm_rules', (ctx) => {
  ctx.deleteMessage().catch(function () {});
  delete sessions[ctx.from.id];
  showMainMenu(ctx);
});

bot.on('text', async (ctx, next) => {
  const session = sessions[ctx.from.id];
  if (!session) return next();

  const t = texts[session.lang] || texts.fa;

  if (session.flow === 'registration') {
    if (session.step === 'waiting_name') {
      session.data.fullName = ctx.message.text;
      session.step = 'waiting_card';
      ctx.reply(t.requestCard);
      return;
    }

    if (session.step === 'waiting_card') {
      session.data.cardNumber = ctx.message.text;
      await pool.query(
        'INSERT INTO users (telegram_id, phone, full_name, card_number, language, balance, registered_at) ' +
        'VALUES ($1, $2, $3, $4, $5, 0, $6) ' +
        'ON CONFLICT (telegram_id) DO UPDATE SET phone = EXCLUDED.phone, full_name = EXCLUDED.full_name, ' +
        'card_number = EXCLUDED.card_number, language = EXCLUDED.language',
        [String(ctx.from.id), session.data.phone, session.data.fullName, session.data.cardNumber, session.lang, new Date().toISOString()]
      );
      ctx.reply(t.registrationSuccess).then(function () {
        ctx.reply(t.rulesText, {
          reply_markup: {
            inline_keyboard: [
              [{ text: t.confirmRulesButton, callback_data: 'confirm_rules' }]
            ]
          }
        });
      });
      return;
    }
  }

  if (session.flow === 'deposit' && session.step === 'waiting_amount') {
    session.data.amount = ctx.message.text;
    session.step = 'waiting_receipt';
    ctx.reply(t.depositAskReceipt);
    return;
  }

  if (session.flow === 'buy' && session.step === 'waiting_amount') {
    const amount = parseInt(ctx.message.text.replace(/[^0-9]/g, ''), 10);
    const minAmount = session.data.minAmount;

    if (!amount || amount < minAmount) {
      ctx.reply(fillTemplate(t.buyMinError, { min: minAmount.toLocaleString('en-US') }));
      return;
    }
    session.data.amount = amount;
    session.step = 'waiting_confirm';
    ctx.reply(fillTemplate(t.buyConfirmSummary, {
      product: session.data.productLabel,
      amount: amount.toLocaleString('en-US')
    }), {
      reply_markup: {
        inline_keyboard: [
          [{ text: t.buyConfirmButton, callback_data: 'buy_confirm' }],
          [{ text: t.buyCancelButton, callback_data: 'buy_cancel' }]
        ]
      }
    });
    return;
  }

  if (session.flow === 'withdraw' && session.step === 'waiting_amount') {
    const amount = parseInt(ctx.message.text.replace(/[^0-9]/g, ''), 10);

    if (!amount || amount < MIN_WITHDRAW) {
      ctx.reply(t.withdrawMinError);
      return;
    }
    session.data.amount = amount;
    const cards = await getUserCards(ctx.from.id);
    const buttons = cards.map(function (c) {
      return [{ text: c.card_number, callback_data: 'withdraw_card_' + c.card_number }];
    });
    buttons.push([{ text: t.addCardButton, callback_data: 'wallet_addcard' }]);
    ctx.reply(t.withdrawSelectCard, { reply_markup: { inline_keyboard: buttons } });
    return;
  }

  if (session.flow === 'addcard' && session.step === 'waiting_card') {
    const cardNumber = ctx.message.text.replace(/[^0-9]/g, '');

    if (cardNumber.length !== 16) {
      ctx.reply(t.addCardInvalid);
      return;
    }
    await pool.query(
      'INSERT INTO cards (telegram_id, card_number, created_at) VALUES ($1, $2, $3)',
      [String(ctx.from.id), cardNumber, new Date().toISOString()]
    );
    delete sessions[ctx.from.id];
    ctx.reply(t.addCardSuccess);
    return;
  }
});

bot.on('photo', async (ctx) => {
  const session = sessions[ctx.from.id];
  if (!session || session.flow !== 'deposit' || session.step !== 'waiting_receipt') return;

  const t = texts.fa;
  const photos = ctx.message.photo;
  const fileId = photos[photos.length - 1].file_id;

  const trackingCode = generateTrackingCode();
  await pool.query(
    'INSERT INTO wallet_requests (telegram_id, type, amount, receipt_file_id, status, created_at, tracking_code) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [String(ctx.from.id), 'deposit', session.data.amount, fileId, 'pending', new Date().toISOString(), trackingCode]
  );

  delete sessions[ctx.from.id];
  ctx.reply(t.depositSubmitted + '\n\n🆔 کد پیگیری: ' + trackingCode);
});

function isAdmin(telegramId) {
  return ADMIN_IDS.indexOf(Number(telegramId)) !== -1;
}

async function showAdminMenu(ctx) {
  const pendingRes = await pool.query("SELECT COUNT(*) AS c FROM wallet_requests WHERE status = 'pending'");
  const pendingCount = pendingRes.rows[0].c;
  const settingRes = await pool.query('SELECT value FROM settings WHERE key = $1', ['start_reaction']);
  const currentReaction = settingRes.rows[0] ? settingRes.rows[0].value : '🔥';

  ctx.reply('👑 پنل مدیریت پیشرفته\n\n' +
    '🔹 درخواست‌های در انتظار: ' + pendingCount + '\n' +
    '🔹 ایموجی اکشن استارت فعلی: ' + currentReaction + '\n\n' +
    '💡 تغییر ایموجی استارت:\n/setreaction <ایموجی>\n\n' +
    '💵 تغییر نرخ دلار:\n/setrate <عدد>\n\n' +
    '📦 مدیریت محصولات خرید:\n' +
    '/addproduct کلید|نام|حداقل|usd یا toman\n' +
    '/listproducts — دیدن همه‌ی محصولات\n' +
    '/removeproduct کلید — غیرفعال کردن یه محصول\n\n' +
    '🔎 جستجوی سفارش/شارژ/برداشت با کد پیگیری:\n' +
    '/find VOC-847392', {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '📥 درخواست‌های در انتظار کیف پول', callback_data: 'admin_pending' }]
      ]
    }
  });
}

bot.command('admin', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  await showAdminMenu(ctx);
});

bot.action('admin_pending', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  ctx.answerCbQuery();

  const pendingRes = await pool.query("SELECT * FROM wallet_requests WHERE status = 'pending' ORDER BY id ASC");
  const pendingRequests = pendingRes.rows;

  if (pendingRequests.length === 0) {
    ctx.reply('در حال حاضر هیچ درخواست در انتظاری وجود ندارد ✅');
    return;
  }

  for (const req of pendingRequests) {
    const user = await getUser(req.telegram_id);
    const userName = user ? user.full_name : 'نامشخص';
    const typeLabel = req.type === 'deposit' ? '➕ افزایش موجودی' : '💳 برداشت موجودی';

    let message = typeLabel + '\n';
    message += '🆔 کد پیگیری: ' + (req.tracking_code || '-') + '\n';
    message += 'کاربر: ' + userName + ' (' + req.telegram_id + ')\n';
    message += 'مبلغ: ' + Number(req.amount).toLocaleString('en-US') + ' تومان\n';
    if (req.type === 'withdraw') {
      message += 'شماره کارت مقصد: ' + req.card_number + '\n';
    }
    const buttons = [
      [
        { text: '✅ تایید', callback_data: 'admin_approve_' + req.id },
        { text: '❌ رد', callback_data: 'admin_reject_' + req.id }
      ]
    ];
    if (req.type === 'deposit' && req.receipt_file_id) {
      await ctx.replyWithPhoto(req.receipt_file_id, { caption: message, reply_markup: { inline_keyboard: buttons } });
    } else {
      await ctx.reply(message, { reply_markup: { inline_keyboard: buttons } });
    }
  }
});

bot.action(/^admin_approve_/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  ctx.answerCbQuery();

  const requestId = ctx.match[0].replace('admin_approve_', '');
  const reqRes = await pool.query('SELECT * FROM wallet_requests WHERE id = $1', [requestId]);
  const request = reqRes.rows[0];

  if (!request || request.status !== 'pending') {
    ctx.reply('این درخواست قبلاً بررسی شده است.');
    return;
  }

  const codeText = request.tracking_code ? ('\n🆔 کد پیگیری: ' + request.tracking_code) : '';

  if (request.type === 'deposit') {
    await pool.query('UPDATE users SET balance = balance + $1 WHERE telegram_id = $2', [request.amount, request.telegram_id]);
    bot.telegram.sendMessage(request.telegram_id, '✅ شارژ کیف پول شما تایید شد.' + codeText + '\nمبلغ ' + Number(request.amount).toLocaleString('en-US') + ' تومان به موجودی شما اضافه شد.');
  } else {
    await pool.query('UPDATE users SET balance = balance - $1 WHERE telegram_id = $2', [request.amount, request.telegram_id]);
    bot.telegram.sendMessage(request.telegram_id, '✅ درخواست برداشت شما تایید شد.' + codeText + '\nمبلغ ' + Number(request.amount).toLocaleString('en-US') + ' تومان به کارت شما واریز شد.');
  }

  await pool.query("UPDATE wallet_requests SET status = 'approved' WHERE id = $1", [requestId]);

  ctx.reply('درخواست شماره ' + requestId + ' تایید شد ✅');
});

bot.action(/^admin_reject_/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  ctx.answerCbQuery();

  const requestId = ctx.match[0].replace('admin_reject_', '');
  const reqRes = await pool.query('SELECT * FROM wallet_requests WHERE id = $1', [requestId]);
  const request = reqRes.rows[0];

  if (!request || request.status !== 'pending') {
    ctx.reply('این درخواست قبلاً بررسی شده است.');
    return;
  }

  await pool.query("UPDATE wallet_requests SET status = 'rejected' WHERE id = $1", [requestId]);

  const codeText = request.tracking_code ? ('\n🆔 کد پیگیری: ' + request.tracking_code) : '';
  bot.telegram.sendMessage(request.telegram_id, '❌ درخواست شما رد شد.' + codeText + '\nدر صورت هرگونه سؤال با پشتیبانی در تماس باشید.');

  ctx.reply('درخواست شماره ' + requestId + ' رد شد ❌');
});

async function init() {
  await pool.query(
    'CREATE TABLE IF NOT EXISTS users (' +
    'telegram_id TEXT PRIMARY KEY, ' +
    'phone TEXT, ' +
    'full_name TEXT, ' +
    'card_number TEXT, ' +
    'language TEXT, ' +
    'balance INTEGER DEFAULT 0, ' +
    'registered_at TEXT' +
    ')'
  );

  await pool.query(
    'CREATE TABLE IF NOT EXISTS cards (' +
    'id SERIAL PRIMARY KEY, ' +
    'telegram_id TEXT, ' +
    'card_number TEXT, ' +
    'created_at TEXT' +
    ')'
  );

  await pool.query(
    'CREATE TABLE IF NOT EXISTS wallet_requests (' +
    'id SERIAL PRIMARY KEY, ' +
    'telegram_id TEXT, ' +
    'type TEXT, ' +
    'amount INTEGER, ' +
    'card_number TEXT, ' +
    'receipt_file_id TEXT, ' +
    'status TEXT, ' +
    'created_at TEXT' +
    ')'
  );

  await pool.query(
    'CREATE TABLE IF NOT EXISTS required_channels (' +
    'id SERIAL PRIMARY KEY, ' +
    'chat_id TEXT, ' +
    'invite_link TEXT, ' +
    'title TEXT, ' +
    'active INTEGER DEFAULT 1' +
    ')'
  );

  await pool.query(
    'CREATE TABLE IF NOT EXISTS settings (' +
    'key TEXT PRIMARY KEY, ' +
    'value TEXT' +
    ')'
  );

  await pool.query(
    'CREATE TABLE IF NOT EXISTS bonuses (' +
    'id SERIAL PRIMARY KEY, ' +
    'telegram_id TEXT, ' +
    'status TEXT, ' +
    'amount INTEGER, ' +
    'created_at TEXT' +
    ')'
  );

  await pool.query(
    'CREATE TABLE IF NOT EXISTS orders (' +
    'id SERIAL PRIMARY KEY, ' +
    'telegram_id TEXT, ' +
    'product_type TEXT, ' +
    'amount INTEGER, ' +
    'status TEXT, ' +
    'created_at TEXT' +
    ')'
  );

  await pool.query(
    'CREATE TABLE IF NOT EXISTS products (' +
    'id SERIAL PRIMARY KEY, ' +
    'key TEXT UNIQUE, ' +
    'name TEXT, ' +
    'min_amount NUMERIC, ' +
    'price_type TEXT, ' + 
    'active INTEGER DEFAULT 1, ' +
    'created_at TEXT' +
    ')'
  );

  await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_code TEXT');
  await pool.query('ALTER TABLE wallet_requests ADD COLUMN IF NOT EXISTS tracking_code TEXT');

  const productsCountRes = await pool.query('SELECT COUNT(*) AS c FROM products');
  if (Number(productsCountRes.rows[0].c) === 0) {
    await pool.query(
      'INSERT INTO products (key, name, min_amount, price_type, active, created_at) VALUES ' +
      '($1, $2, $3, $4, 1, $5), ($6, $7, $8, $9, 1, $5)',
      ['voucher', '🎟 یوووچر', 1, 'usd', new Date().toISOString(), 'hotvoucher', '🎟 هات ووچر', HOT_VOUCHER_MIN, 'toman']
    );
  }

  const defaultReactionRes = await pool.query('SELECT value FROM settings WHERE key = $1', ['start_reaction']);
  if (defaultReactionRes.rows.length === 0) {
    await pool.query('INSERT INTO settings (key, value) VALUES ($1, $2)', ['start_reaction', '🎉']);
  }

  const usdRateRes = await pool.query('SELECT value FROM settings WHERE key = $1', ['usd_rate']);
  if (usdRateRes.rows.length === 0) {
    await pool.query('INSERT INTO settings (key, value) VALUES ($1, $2)', ['usd_rate', String(DEFAULT_USD_RATE)]);
  }

  const existingChannelRes = await pool.query('SELECT * FROM required_channels WHERE chat_id = $1', ['-1003953090902']);
  if (existingChannelRes.rows.length === 0) {
    await pool.query(
      'INSERT INTO required_channels (chat_id, invite_link, title, active) VALUES ($1, $2, $3, 1)',
      ['-1003953090902', 'https://t.me/+G9og5Y6KfxEyNTRk', 'کانال اصلی']
    );
  }

  bot.launch();
  console.log('ربات با موفقیت به Supabase متصل و روشن شد');
}

init().catch(function (e) {
  console.log('INIT ERROR: ' + e.message);
  console.log('INIT ERROR STACK: ' + e.stack);
});
