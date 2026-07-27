const { Telegraf, Markup } = require('telegraf');
const { Pool } = require('pg');
const express = require('express');
const https = require('https');

// Express Server for Render Health Check
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => { res.send('Bot is alive and connected to Supabase!'); });
app.listen(PORT, () => { console.log(`Web server is running on port ${PORT}`); });

// ===== سیستم ضد خواب ۴ لایه (بدون اجازه خواب!) 👁️⚡ =====
setInterval(() => {
  const url = 'https://vochino-telegram-bot.onrender.com';
  https.get(url, (res) => {
    console.log(`[Layer 1 - Web] Status: ${res.statusCode}`);
  }).on('error', (err) => {});
}, 2 * 60 * 1000);

setInterval(() => {
  const url = 'https://vochino-telegram-bot.onrender.com';
  https.get(url, (res) => {
    console.log(`[Layer 2 - Web] Status: ${res.statusCode}`);
  }).on('error', (err) => {});
}, 5 * 60 * 1000);

setInterval(async () => {
  try {
    await pool.query('SELECT 1');
    console.log(`[Layer 3 - DB] Supabase pinged!`);
  } catch (err) {}
}, 3 * 60 * 1000);

setInterval(async () => {
  try {
    await pool.query('SELECT 1');
    console.log(`[Layer 4 - DB] Supabase backup pinged!`);
  } catch (err) {}
}, 7 * 60 * 1000);
// ============================================================

const bot = new Telegraf(process.env.BOT_TOKEN);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const ADMIN_IDS = [8231962200];
const DAILY_LIMIT_TEXT = '2,000,000';
const MIN_WITHDRAW = 100000;
const DEFAULT_USD_RATE = 60000;

// ===== تنظیمات بونوس و بازی =====
const BONUS_THRESHOLD = 500000;
const BONUS_AMOUNT = 100000;
const BONUS_WIN_PROBABILITY = 0.05;
// ==================================

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

function generateTrackingCode() {
  const randomPart = Math.floor(100000 + Math.random() * 900000);
  return 'VOC-' + randomPart;
}

async function safeDelete(ctx) {
  try {
    await ctx.deleteMessage();
  } catch (e) {}
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
    depositCardsTrust: '✅ پرداخت شما مستقیماً و بدون واسطه به حساب رسمی مجموعه واریز می‌شود.\n💚 هزاران کاربر با خیال راحت از این روش استفاده کرده‌اند.\n\nلطفاً مبلغ واریزی خود را به یکی از کارت‌های زیر واریز کنید:',
    depositAskAmount: 'مبلغ واریزی خود را به تومان وارد کنید:',
    depositAskReceipt: 'رسید (فیش) پرداخت خود را همینجا ارسال کنید 📎',
    depositSubmitted: 'درخواست شارژ شما ثبت شد ✅\nپس از بررسی توسط پشتیبانی، موجودی شما به‌روزرسانی خواهد شد.',
    sellMenuTitle: '✨ کدوم ووچر رو می‌خوای به ما بفروشی؟',
    sellNoProducts: 'فعلاً هیچ ووچری برای خرید از شما تعریف نشده.',
    sellAskCode: '💸 فروش {product}\n\n♻️ قیمت خرید واحد: بر اساس نرخ روز\n🎫 نمونه کد صحیح:\nUSD-7T3H-C2QG-P6YA-D4UW-XOIQ\n\n▫️ لطفا کد ووچر خود را ارسال کنید:',
    sellSubmitted: '✅ کد ووچر شما با موفقیت دریافت و ثبت شد!\n\n🆔 کد پیگیری: {trackingCode}\n📦 محصول: {product}\n\nمنتظر بررسی بخش مالی باشید. پس از تایید، مبلغ به کیف پول شما واریز خواهد شد 💸'
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

bot.start(async (ctx) => {
  const isMember = await checkMembership(ctx);
  if (!isMember) {
    await showJoinPrompt(ctx);
    return;
  }

  const existingUser = await getUser(ctx.from.id);
  if (existingUser) {
    ctx.reply(texts[existingUser.language || 'fa'].welcomeBack);
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

bot.action('lang_fa', (ctx) => handleLanguageChoice(ctx, 'fa'));
bot.action('lang_en', (ctx) => handleLanguageChoice(ctx, 'fa'));

function handleLanguageChoice(ctx, lang) {
  sessions[ctx.from.id] = { flow: 'registration', step: 'waiting_phone', lang: lang, data: {} };
  const t = texts[lang] || texts.fa;
  try { ctx.editMessageText(t.welcome); } catch (e) { ctx.reply(t.welcome); }
  ctx.reply(t.requestPhone, Markup.keyboard([Markup.button.contactRequest(t.sharePhoneButton)]).resize().oneTime());
}

bot.on('contact', (ctx) => {
  const session = sessions[ctx.from.id];
  if (!session || session.flow !== 'registration') return;
  session.data.phone = ctx.message.contact.phone_number;
  session.step = 'waiting_name';
  ctx.reply(texts[session.lang].requestName, { reply_markup: { remove_keyboard: true } });
});

bot.action('back_main_menu', async (ctx) => {
  ctx.answerCbQuery();
  await safeDelete(ctx);
  showMainMenu(ctx);
});

bot.action('cancel_flow', async (ctx) => {
  ctx.answerCbQuery();
  delete sessions[ctx.from.id];
  await safeDelete(ctx);
  showMainMenu(ctx);
});

// ===== بخش فروش کاربر به ربات (Sell Voucher) =====
bot.action('menu_sell', async (ctx) => {
  ctx.answerCbQuery();
  await safeDelete(ctx);
  const t = texts.fa;

  // لیست ووچرهایی که کاربر می‌تواند به ما بفروشد
  const productsRes = await pool.query('SELECT * FROM products WHERE active = 1 ORDER BY id ASC');
  if (productsRes.rows.length === 0) {
    ctx.reply(t.sellNoProducts);
    return;
  }

  const buttons = productsRes.rows.map(function (p) {
    return [{ text: '🎟 ' + p.name, callback_data: 'sell_' + p.key }];
  });
  buttons.push([{ text: '🔙 بازگشت', callback_data: 'back_main_menu' }]);

  ctx.reply(t.sellMenuTitle, { reply_markup: { inline_keyboard: buttons } });
});

bot.action(/^sell_(.+)/, async (ctx) => {
  const key = ctx.match[1];
  ctx.answerCbQuery();
  const t = texts.fa;

  const productRes = await pool.query('SELECT * FROM products WHERE key = $1 AND active = 1', [key]);
  const product = productRes.rows[0];
  if (!product) {
    await safeDelete(ctx);
    ctx.reply(t.sellNoProducts);
    return;
  }

  sessions[ctx.from.id] = {
    flow: 'sell',
    step: 'waiting_code',
    data: { productType: product.key, productLabel: product.name }
  };

  const messageText = fillTemplate(t.sellAskCode, { product: product.name });
  try {
    await ctx.editMessageText(messageText, {
      reply_markup: { inline_keyboard: [[{ text: '🔙 انصراف', callback_data: 'cancel_flow' }]] }
    });
  } catch (e) {
    await safeDelete(ctx);
    const sent = await ctx.reply(messageText, {
      reply_markup: { inline_keyboard: [[{ text: '🔙 انصراف', callback_data: 'cancel_flow' }]] }
    });
    sessions[ctx.from.id].lastBotMsgId = sent.message_id;
  }
});

// مدیریت متن‌ها و فیش‌ها
bot.on('text', async (ctx, next) => {
  const session = sessions[ctx.from.id];
  if (!session) return next();

  const t = texts[session.lang] || texts.fa;

  if (session.lastBotMsgId) {
    try { await ctx.telegram.deleteMessage(ctx.chat.id, session.lastBotMsgId); } catch (e) {}
    session.lastBotMsgId = null;
  }

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
        'INSERT INTO users (telegram_id, phone, full_name, card_number, language, balance, registered_at) VALUES ($1, $2, $3, $4, $5, 0, $6) ON CONFLICT (telegram_id) DO UPDATE SET phone = EXCLUDED.phone, full_name = EXCLUDED.full_name, card_number = EXCLUDED.card_number',
        [String(ctx.from.id), session.data.phone, session.data.fullName, session.data.cardNumber, session.lang, new Date().toISOString()]
      );
      ctx.reply(t.registrationSuccess).then(() => {
        ctx.reply(t.rulesText, { reply_markup: { inline_keyboard: [[{ text: t.confirmRulesButton, callback_data: 'confirm_rules' }]] } });
      });
      return;
    }
  }

  // ثبت کد ووچر ارسالی کاربر برای فروش به ما
  if (session.flow === 'sell' && session.step === 'waiting_code') {
    const voucherCode = ctx.message.text.trim();
    const trackingCode = generateTrackingCode();

    // ذخیره درخواست فروش در دیتابیس
    await pool.query(
      'INSERT INTO orders (telegram_id, product_type, amount, status, created_at, tracking_code, description) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [String(ctx.from.id), 'SELL_' + session.data.productType, 0, 'pending', new Date().toISOString(), trackingCode, voucherCode]
    );

    delete sessions[ctx.from.id];

    ctx.reply(fillTemplate(texts.fa.sellSubmitted, {
      product: session.data.productLabel,
      trackingCode: trackingCode
    }));
    return;
  }
});

// مدیریت ارسال عکس فیش واریزی
bot.on('photo', async (ctx) => {
  const session = sessions[ctx.from.id];
  if (!session || session.flow !== 'deposit' || session.step !== 'waiting_receipt') return;

  if (session.lastBotMsgId) {
    try { await ctx.telegram.deleteMessage(ctx.chat.id, session.lastBotMsgId); } catch (e) {}
  }

  const photos = ctx.message.photo;
  const fileId = photos[photos.length - 1].file_id;
  const trackingCode = generateTrackingCode();

  await pool.query(
    'INSERT INTO wallet_requests (telegram_id, type, amount, status, created_at, tracking_code, receipt_photo) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [String(ctx.from.id), 'deposit', Number(session.data.amount), 'pending', new Date().toISOString(), trackingCode, fileId]
  );

  delete sessions[ctx.from.id];
  ctx.reply(texts.fa.depositSubmitted + '\n\n🆔 کد پیگیری: ' + trackingCode);
});

bot.action('confirm_rules', async (ctx) => {
  await safeDelete(ctx);
  delete sessions[ctx.from.id];
  showMainMenu(ctx);
});

function fillTemplate(template, data) {
  let result = template;
  for (const key in data) {
    result = result.replace(new RegExp('\\{' + key + '\\}', 'g'), data[key]);
  }
  return result;
}
