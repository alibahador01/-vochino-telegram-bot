const { Telegraf, Markup } = require('telegraf');
const Database = require('better-sqlite3');
const express = require('express');

// Express Server for Render Health Check
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => { res.send('Bot is alive!'); });
app.listen(PORT, () => { console.log(`Web server is running on port ${PORT}`); });

// Initialize Bot & DB
const bot = new Telegraf(process.env.BOT_TOKEN);
const db = new Database('bot.db');

// Database Tables Initialization
db.exec(
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

db.exec(
  'CREATE TABLE IF NOT EXISTS cards (' +
  'id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
  'telegram_id TEXT, ' +
  'card_number TEXT, ' +
  'created_at TEXT' +
  ')'
);

db.exec(
  'CREATE TABLE IF NOT EXISTS wallet_requests (' +
  'id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
  'telegram_id TEXT, ' +
  'type TEXT, ' +
  'amount INTEGER, ' +
  'card_number TEXT, ' +
  'receipt_file_id TEXT, ' +
  'status TEXT, ' +
  'created_at TEXT' +
  ')'
);

db.exec(
  'CREATE TABLE IF NOT EXISTS required_channels (' +
  'id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
  'chat_id TEXT, ' +
  'invite_link TEXT, ' +
  'title TEXT, ' +
  'active INTEGER DEFAULT 1' +
  ')'
);

db.exec(
  'CREATE TABLE IF NOT EXISTS settings (' +
  'key TEXT PRIMARY KEY, ' +
  'value TEXT' +
  ')'
);

// Set default start reaction if not exists
const defaultReaction = db.prepare('SELECT value FROM settings WHERE key = ?').get('start_reaction');
if (!defaultReaction) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('start_reaction', '❤️');
}

// Default Required Channel
const existingChannel = db.prepare('SELECT * FROM required_channels WHERE chat_id = ?').get('-1003953090902');
if (!existingChannel) {
  db.prepare(
    'INSERT INTO required_channels (chat_id, invite_link, title, active) VALUES (?, ?, ?, 1)'
  ).run('-1003953090902', 'https://t.me/+G9og5Y6KfxEyNTRk', 'کانال اصلی');
}

const ADMIN_IDS = [8231962200];
const DAILY_LIMIT_TEXT = '2,000,000';
const MIN_WITHDRAW = 100000;

const DEPOSIT_CARDS = [
  { number: '6219861819068106', owner: 'علی بهادر' },
  { number: '5047061669481125', owner: 'علی بهادر' }
];

const texts = {
  fa: {
    chooseLanguage: 'زبان خود را انتخاب کنید / Please choose your language:',
    welcome: 'به ربات خوش آمدید! 🌟',
    requestPhone: 'برای تکمیل ثبت‌نام، لطفاً شماره تلفن خود را با دکمه‌ی زیر ارسال کنید 👇',
    sharePhoneButton: '📱 ارسال شماره تلفن',
    requestName: 'لطفاً نام و نام خانوادگی خود را وارد کنید:',
    requestCard: 'لطفاً شماره کارت بانکی خود را وارد کنید (کارتی که برای واریز استفاده می‌کنید):',
    rulesText: 'قوانین و شرایط استفاده:\n\n(متن قوانین بعداً از پنل مدیریت تکمیل می‌شود)\n\nتوجه: واریزی فقط از کارتی که به نام شما ثبت شده معتبر است.',
    confirmRulesButton: '✅ قوانین را می‌پذیرم',
    registrationSuccess: 'ثبت‌نام شما با موفقیت انجام شد ✅\nسقف خرید روزانه شما: ' + DAILY_LIMIT_TEXT + ' تومان',
    welcomeBack: 'خوش برگشتید! 👋',

    mustJoinTitle: 'برای استفاده از ربات، ابتدا باید عضو کانال زیر شوید:',
    joinChannelButton: '📢 عضویت در کانال',
    checkMembershipButton: '✅ عضو شدم',
    stillNotMember: 'هنوز عضو کانال نشده‌اید. لطفاً ابتدا عضو شوید، سپس دوباره تلاش کنید.',

    walletTitle: '👛 کیف پول',
    walletBalance: 'موجودی فعلی شما: ',
    walletIncrease: '➕ افزایش موجودی',
    walletWithdraw: '💳 برداشت موجودی',
    walletAddCard: '➕ افزودن کارت جدید',
    backButton: '🔙 بازگشت',

    depositMethodTitle: 'روش افزایش موجودی را انتخاب کنید:',
    depositCard2Card: '💳 کارت به کارت',
    depositTron: '🪙 ترون (تتر)',
    depositGateway: '🌐 درگاه پرداخت',
    comingSoon: 'به‌زودی 🙂',

    depositCardsTrust: '✅ پرداخت شما مستقیماً به حساب رسمی مجموعه واریز می‌شود.\n💚 هزاران کاربر تاکنون از این روش استفاده کرده‌اند.\n\nلطفاً مبلغ واریزی خود را به یکی از کارت‌های زیر واریز کنید:',
    depositAskAmount: 'مبلغ واریزی خود را به تومان وارد کنید:',
    depositAskReceipt: 'رسید (فیش) پرداخت خود را همینجا ارسال کنید 📎',
    depositSubmitted: 'درخواست شارژ شما ثبت شد ✅\nپس از بررسی توسط پشتیبانی، موجودی شما به‌روزرسانی خواهد شد.',

    withdrawAskAmount: 'مبلغ برداشت خود را به تومان وارد کنید (حداقل ' + MIN_WITHDRAW.toLocaleString('en-US') + ' تومان):',
    withdrawMinError: 'حداقل مبلغ برداشت ' + MIN_WITHDRAW.toLocaleString('en-US') + ' تومان است. لطفاً دوباره وارد کنید:',
    withdrawSelectCard: 'شماره کارت خود را انتخاب کنید:',
    withdrawSubmitted: 'درخواست برداشت شما ثبت شد ✅\nپس از بررسی توسط پشتیبانی، مبلغ به کارت شما واریز خواهد شد.',

    addCardAsk: 'شماره کارت جدید را وارد کنید (۱۶ رقم):',
    addCardInvalid: 'شماره کارت وارد شده معتبر نیست. لطفاً دوباره تلاش کنید:',
    addCardSuccess: 'کارت جدید با موفقیت ثبت شد ✅',
    addCardButton: '➕ افزودن کارت جدید'
  }
};

// Clean main menu without extra hardcoded items
const mainMenuButtons = [
  { key: 'buy', text: '🛒 خرید' },
  { key: 'sell', text: '💸 فروش' },
  { key: 'wallet', text: '👛 کیف پول' },
  { key: 'orders', text: '📦 سفارش‌های من' },
  { key: 'account', text: '👤 حساب کاربری' },
  { key: 'referral', text: '🎁 زیرمجموعه' },
  { key: 'support', text: '📞 پشتیبانی' },
  { key: 'rules', text: '📖 قوانین' },
  { key: 'education', text: '📚 آموزش' }
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

function getUser(telegramId) {
  return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(String(telegramId));
}

function getUserCards(telegramId) {
  const user = getUser(telegramId);
  const extraCards = db.prepare('SELECT * FROM cards WHERE telegram_id = ?').all(String(telegramId));
  const list = [];
  if (user && user.card_number) {
    list.push({ card_number: user.card_number });
  }
  extraCards.forEach(function (c) { list.push({ card_number: c.card_number }); });
  return list;
}

async function checkMembership(ctx) {
  const channels = db.prepare('SELECT * FROM required_channels WHERE active = 1').all();
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

function showJoinPrompt(ctx) {
  const t = texts.fa;
  const channels = db.prepare('SELECT * FROM required_channels WHERE active = 1').all();

  const buttons = channels.map(function (c) {
    return [{ text: t.joinChannelButton, url: c.invite_link }];
  });
  buttons.push([{ text: t.checkMembershipButton, callback_data: 'check_membership' }]);

  ctx.reply(t.mustJoinTitle, { reply_markup: { inline_keyboard: buttons } });
}

// Set reaction command for admin
bot.command('setreaction', (ctx) => {
  if (ADMIN_IDS.indexOf(Number(ctx.from.id)) === -1) return;
  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    const current = db.prepare('SELECT value FROM settings WHERE key = ?').get('start_reaction').value;
    ctx.reply('❌ لطفاً ایموجی مورد نظر را بعد از دستور وارد کنید.\nایموجی فعلی ربات: ' + current + '\n\nمثال:\n`/setreaction ❤️`', { parse_mode: 'Markdown' });
    return;
  }
  const newEmoji = args[1];
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('start_reaction', newEmoji);
  ctx.reply('✅ اکشن استارت با موفقیت به (' + newEmoji + ') تغییر یافت!');
});

// Safe reaction trigger on start
async function triggerStartReaction(ctx) {
  try {
    const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get('start_reaction');
    const emoji = setting ? setting.value : '❤️';
    await ctx.setReaction(emoji);
  } catch (e) {
    console.log('Reaction note: unable to set reaction automatically (requires chat admin rights or proper bot scope).');
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
  const existingUser = getUser(ctx.from.id);
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
    showJoinPrompt(ctx);
    return;
  }

  const existingUser = getUser(ctx.from.id);
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

function showWalletMenu(ctx) {
  const t = texts.fa;
  const user = getUser(ctx.from.id);
  const balance = user ? user.balance : 0;

  ctx.reply(t.walletTitle + '\n\n' + t.walletBalance + balance.toLocaleString('en-US') + ' تومان', {
    reply_markup: {
      inline_keyboard: [
        [{ text: t.walletIncrease, callback_data: 'wallet_deposit' }],
        [{ text: t.walletWithdraw, callback_data: 'wallet_withdraw' }],
        [{ text: t.walletAddCard, callback_data: 'wallet_addcard' }]
      ]
    }
  });
}

bot.action('menu_wallet', (ctx) => {
  ctx.answerCbQuery();
  showWalletMenu(ctx);
});

bot.action('menu_referral', (ctx) => {
  ctx.answerCbQuery();
  ctx.reply('به‌زودی 🙂');
});

bot.action(/^menu_.+/, (ctx) => {
  const actionKey = ctx.match[0];
  if (actionKey === 'menu_wallet' || actionKey === 'menu_referral') return;
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

bot.action(/^withdraw_card_/, (ctx) => {
  ctx.answerCbQuery();
  const cardNumber = ctx.match[0].replace('withdraw_card_', '');
  const session = sessions[ctx.from.id];
  const amount = session && session.data ? session.data.amount : null;

  db.prepare(
    'INSERT INTO wallet_requests (telegram_id, type, amount, card_number, status, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(String(ctx.from.id), 'withdraw', amount, cardNumber, 'pending', new Date().toISOString());

  delete sessions[ctx.from.id];
  ctx.reply(texts.fa.withdrawSubmitted);
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

bot.on('text', (ctx, next) => {
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

      db.prepare(
        'INSERT OR REPLACE INTO users (telegram_id, phone, full_name, card_number, language, balance, registered_at) VALUES (?, ?, ?, ?, ?, 0, ?)'
      ).run(String(ctx.from.id), session.data.phone, session.data.fullName, session.data.cardNumber, session.lang, new Date().toISOString());

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

  if (session.flow === 'withdraw' && session.step === 'waiting_amount') {
    const amount = parseInt(ctx.message.text.replace(/[^0-9]/g, ''), 10);

    if (!amount || amount < MIN_WITHDRAW) {
      ctx.reply(t.withdrawMinError);
      return;
    }

    session.data.amount = amount;

    const cards = getUserCards(ctx.from.id);
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

    db.prepare(
      'INSERT INTO cards (telegram_id, card_number, created_at) VALUES (?, ?, ?)'
    ).run(String(ctx.from.id), cardNumber, new Date().toISOString());

    delete sessions[ctx.from.id];
    ctx.reply(t.addCardSuccess);
    return;
  }
});

bot.on('photo', (ctx) => {
  const session = sessions[ctx.from.id];
  if (!session || session.flow !== 'deposit' || session.step !== 'waiting_receipt') return;

  const t = texts.fa;
  const photos = ctx.message.photo;
  const fileId = photos[photos.length - 1].file_id;

  db.prepare(
    'INSERT INTO wallet_requests (telegram_id, type, amount, receipt_file_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(String(ctx.from.id), 'deposit', session.data.amount, fileId, 'pending', new Date().toISOString());

  delete sessions[ctx.from.id];
  ctx.reply(t.depositSubmitted);
});

function isAdmin(telegramId) {
  return ADMIN_IDS.indexOf(Number(telegramId)) !== -1;
}

function showAdminMenu(ctx) {
  const pendingCount = db.prepare('SELECT COUNT(*) AS c FROM wallet_requests WHERE status = ?').get('pending').c;
  const currentReaction = db.prepare('SELECT value FROM settings WHERE key = ?').get('start_reaction').value;

  ctx.reply('👑 پنل مدیریت پیشرفته\n\n' +
    '🔹 درخواست‌های در انتظار: ' + pendingCount + '\n' +
    '🔹 ایموجی اکشن استارت فعلی: ' + currentReaction + '\n\n' +
    '💡 برای تغییر ایموجی استارت کافیست بفرستید:\n`/setreaction <ایموجی>`', {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '📥 درخواست‌های در انتظار کیف پول', callback_data: 'admin_pending' }]
      ]
    }
  });
}

bot.command('admin', (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  showAdminMenu(ctx);
});

bot.action('admin_pending', (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  ctx.answerCbQuery();

  const pendingRequests = db.prepare('SELECT * FROM wallet_requests WHERE status = ? ORDER BY id ASC').all('pending');

  if (pendingRequests.length === 0) {
    ctx.reply('در حال حاضر هیچ درخواست در انتظاری وجود ندارد ✅');
    return;
  }

  pendingRequests.forEach(function (req) {
    const user = getUser(req.telegram_id);
    const userName = user ? user.full_name : 'نامشخص';
    const typeLabel = req.type === 'deposit' ? '➕ افزایش موجودی' : '💳 برداشت موجودی';

    let message = typeLabel + '\n';
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
      ctx.replyWithPhoto(req.receipt_file_id, {
        caption: message,
        reply_markup: { inline_keyboard: buttons }
      });
    } else {
      ctx.reply(message, { reply_markup: { inline_keyboard: buttons } });
    }
  });
});

bot.action(/^admin_approve_/, (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  ctx.answerCbQuery();

  const requestId = ctx.match[0].replace('admin_approve_', '');
  const request = db.prepare('SELECT * FROM wallet_requests WHERE id = ?').get(requestId);

  if (!request || request.status !== 'pending') {
    ctx.reply('این درخواست قبلاً بررسی شده است.');
    return;
  }

  if (request.type === 'deposit') {
    db.prepare('UPDATE users SET balance = balance + ? WHERE telegram_id = ?').run(request.amount, request.telegram_id);
    bot.telegram.sendMessage(request.telegram_id, '✅ شارژ کیف پول شما تایید شد.\nمبلغ ' + Number(request.amount).toLocaleString('en-US') + ' تومان به موجودی شما اضافه شد.');
  } else {
    db.prepare('UPDATE users SET balance = balance - ? WHERE telegram_id = ?').run(request.amount, request.telegram_id);
    bot.telegram.sendMessage(request.telegram_id, '✅ درخواست برداشت شما تایید شد.\nمبلغ ' + Number(request.amount).toLocaleString('en-US') + ' تومان به کارت شما واریز شد.');
  }

  db.prepare('UPDATE wallet_requests SET status = ? WHERE id = ?').run('approved', requestId);

  ctx.reply('درخواست شماره ' + requestId + ' تایید شد ✅');
});

bot.action(/^admin_reject_/, (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  ctx.answerCbQuery();

  const requestId = ctx.match[0].replace('admin_reject_', '');
  const request = db.prepare('SELECT * FROM wallet_requests WHERE id = ?').get(requestId);

  if (!request || request.status !== 'pending') {
    ctx.reply('این درخواست قبلاً بررسی شده است.');
    return;
  }

  db.prepare('UPDATE wallet_requests SET status = ? WHERE id = ?').run('rejected', requestId);

  bot.telegram.sendMessage(request.telegram_id, '❌ درخواست شما رد شد.\nدر صورت هرگونه سؤال با پشتیبانی در تماس باشید.');

  ctx.reply('درخواست شماره ' + requestId + ' رد شد ❌');
});

// Launch Bot
bot.launch();
console.log('ربات با موفقیت روشن شد');
