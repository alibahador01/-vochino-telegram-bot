const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const https = require('https');
const { pool, getUser, getUserCards } = require('./db');
const texts = require('./texts');

// فایل‌های هاندلر
const { registerAdminCommands, ADMIN_IDS } = require('./handlers/admin');
const { registerGameHandlers } = require('./handlers/game');
const { registerWalletHandlers } = require('./handlers/wallet');
const { registerBuyHandlers } = require('./handlers/buy');
const { registerSellHandlers } = require('./handlers/sell');

// Express Server for Render Health Check
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => { res.send('Bot is alive and connected to Supabase!'); });
app.listen(PORT, () => { console.log(`Web server is running on port ${PORT}`); });

// ===== سیستم ضد خواب ۴ لایه 👁️⚡ =====
setInterval(() => {
  const url = 'https://vochino-telegram-bot.onrender.com';
  https.get(url, (res) => { console.log(`[Layer 1 - Web] Status: ${res.statusCode}`); }).on('error', (err) => {});
}, 2 * 60 * 1000);

setInterval(() => {
  const url = 'https://vochino-telegram-bot.onrender.com';
  https.get(url, (res) => { console.log(`[Layer 2 - Web] Status: ${res.statusCode}`); }).on('error', (err) => {});
}, 5 * 60 * 1000);

setInterval(async () => {
  try { await pool.query('SELECT 1'); console.log('[Layer 3 - DB] Supabase pinged!'); } catch (err) {}
}, 3 * 60 * 1000);

setInterval(async () => {
  try { await pool.query('SELECT 1'); console.log('[Layer 4 - DB] Supabase backup pinged!'); } catch (err) {}
}, 7 * 60 * 1000);
// ===================================

const bot = new Telegraf(process.env.BOT_TOKEN);
const MIN_WITHDRAW = 100000;
const DEPOSIT_CARDS = [
  { number: '6219861819068106', owner: 'علی بهادر' },
  { number: '5047061669481125', owner: 'علی بهادر' }
];

const sessions = {};

function isAdmin(id) {
  return ADMIN_IDS.indexOf(Number(id)) !== -1;
}

function generateTrackingCode() {
  const randomPart = Math.floor(100000 + Math.random() * 900000);
  return 'VOC-' + randomPart;
}

function fillTemplate(template, values) {
  let result = template;
  Object.keys(values).forEach(function (key) {
    result = result.split('{' + key + '}').join(values[key]);
  });
  return result;
}

async function sendTracked(ctx, session, text, extra) {
  if (session && session.lastBotMsgId) {
    try { await ctx.telegram.deleteMessage(ctx.chat.id, session.lastBotMsgId); } catch (e) {}
  }
  const sent = await ctx.reply(text, extra);
  if (session) session.lastBotMsgId = sent.message_id;
  return sent;
}

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

async function checkMembership(ctx) {
  const channelsRes = await pool.query('SELECT * FROM required_channels WHERE active = 1');
  const channels = channelsRes.rows;
  if (channels.length === 0) return true;
  for (const channel of channels) {
    try {
      const member = await ctx.telegram.getChatMember(channel.chat_id, ctx.from.id);
      if (member.status === 'left' || member.status === 'kicked') return false;
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

async function triggerStartReaction(ctx) {
  try {
    const settingRes = await pool.query('SELECT value FROM settings WHERE key = $1', ['start_reaction']);
    let emoji = settingRes.rows[0] ? settingRes.rows[0].value : '🎉';
    await ctx.telegram.setMessageReaction(ctx.chat.id, ctx.message.message_id, [{ type: 'emoji', emoji: emoji }], true);
  } catch (e) {
    console.log('REACTION ERROR: ' + e.message);
  }
}

// ثبت تمامی هاندلرها
registerAdminCommands(bot);
registerGameHandlers(bot);
registerWalletHandlers(bot);
registerBuyHandlers(bot, sessions);
registerSellHandlers(bot, sessions);

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
          [{ text: '🇮🇷 فارسی', callback_data: 'lang_fa' }, { text: '🇬🇧 English', callback_data: 'lang_en' }]
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
        [{ text: '🇮🇷 فارسی', callback_data: 'lang_fa' }, { text: '🇬🇧 English', callback_data: 'lang_en' }]
      ]
    }
  });
});

function handleLanguageChoice(ctx, lang) {
  sessions[ctx.from.id] = { flow: 'registration', step: 'waiting_phone', lang: lang, data: {} };
  const t = texts[lang] || texts.fa;
  try { ctx.editMessageText(t.welcome); } catch (e) { ctx.reply(t.welcome); }
  ctx.reply(t.requestPhone, Markup.keyboard([Markup.button.contactRequest(t.sharePhoneButton)]).resize().oneTime());
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

bot.action('menu_referral', async (ctx) => { ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {} ctx.reply('به‌زودی 🙂'); });

bot.action('menu_profile', async (ctx) => {
  ctx.answerCbQuery();
  try { await ctx.deleteMessage(); } catch (e) {}
  const t = texts.fa;
  const user = await getUser(ctx.from.id);
  if (!user) { ctx.reply('اطلاعاتی برای شما ثبت نشده.'); return; }
  ctx.reply(
    t.profileTitle + '\n\n' +
    '👤 نام: ' + (user.full_name || '-') + '\n' +
    '📱 شماره تلفن: ' + (user.phone || '-') + '\n' +
    '💳 شماره کارت: ' + (user.card_number || '-') + '\n' +
    '💰 موجودی: ' + Number(user.balance).toLocaleString('en-US') + ' تومان',
    { reply_markup: { inline_keyboard: [[{ text: '🔙 بازگشت به منوی اصلی', callback_data: 'back_main_menu', style: 'danger' }]] } }
  );
});

bot.action('back_main_menu', async (ctx) => { ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {} showMainMenu(ctx); });
bot.action('cancel_flow', async (ctx) => { ctx.answerCbQuery(); delete sessions[ctx.from.id]; try { await ctx.deleteMessage(); } catch (e) {} showMainMenu(ctx); });

bot.action('menu_support', async (ctx) => {
  ctx.answerCbQuery();
  try { await ctx.deleteMessage(); } catch (e) {}
  const t = texts.fa;
  ctx.reply(t.supportTitle, {
    reply_markup: {
      inline_keyboard: [
        [{ text: t.supportFaqButton, callback_data: 'support_faq', style: 'primary' }],
        [{ text: t.supportContactButton, callback_data: 'support_contact', style: 'primary' }]
      ]
    }
  });
});

bot.action('support_faq', async (ctx) => { ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {} ctx.reply(texts.fa.faqText); });
bot.action('support_contact', async (ctx) => { ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {} ctx.reply(texts.fa.supportContactText); });

bot.action('menu_rules_education', async (ctx) => { ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {} ctx.reply(texts.fa.rulesText + '\n\n📚 آموزش استفاده از ربات به‌زودی همینجا قرار می‌گیره.'); });
bot.action('menu_rules', async (ctx) => { ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {} ctx.reply(texts.fa.rulesText); });
bot.action('menu_education', async (ctx) => { ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {} ctx.reply('📚 آموزش استفاده از ربات به‌زودی همینجا قرار می‌گیره.'); });

bot.action(/^menu_.+/, async (ctx) => {
  const actionKey = ctx.match[0];
  const known = ['menu_wallet', 'menu_referral', 'menu_profile', 'menu_invoices', 'menu_support', 'menu_game', 'menu_rules', 'menu_education', 'menu_rules_education', 'menu_buy', 'menu_sell'];
  if (known.indexOf(actionKey) !== -1) return;
  ctx.answerCbQuery();
  try { await ctx.deleteMessage(); } catch (e) {}
  ctx.reply('این بخش به‌زودی تکمیل می‌شود 🛠');
});

bot.action('wallet_deposit', async (ctx) => {
  ctx.answerCbQuery();
  try { await ctx.deleteMessage(); } catch (e) {}
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

bot.action('deposit_tron', async (ctx) => { ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {} ctx.reply(texts.fa.comingSoon); });
bot.action('deposit_gateway', async (ctx) => { ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {} ctx.reply(texts.fa.comingSoon); });

bot.action('deposit_card2card', async (ctx) => {
  ctx.answerCbQuery();
  try { await ctx.deleteMessage(); } catch (e) {}
  const t = texts.fa;
  let cardsMessage = t.depositCardsTrust + '\n\n';
  DEPOSIT_CARDS.forEach(function (c) {
    cardsMessage += '' + c.number + '' + '\n' + c.owner + '\n\n';
  });
  const session = { flow: 'deposit', step: 'waiting_amount', lang: 'fa', data: {} };
  sessions[ctx.from.id] = session;
  ctx.reply(cardsMessage, { parse_mode: 'Markdown' }).then(async function (cardsMsg) {
    const sent = await ctx.reply(t.depositAskAmount, {
      reply_markup: { inline_keyboard: [[{ text: '🔙 بیخیال', callback_data: 'cancel_flow', style: 'danger' }]] }
    });
    session.lastBotMsgId = sent.message_id;
  });
});

bot.action('wallet_withdraw', async (ctx) => {
  ctx.answerCbQuery();
  try { await ctx.deleteMessage(); } catch (e) {}
  const session = { flow: 'withdraw', step: 'waiting_amount', lang: 'fa', data: {} };
  sessions[ctx.from.id] = session;
  const sent = await ctx.reply(texts.fa.withdrawAskAmount, {
    reply_markup: { inline_keyboard: [[{ text: '🔙 بیخیال', callback_data: 'cancel_flow', style: 'danger' }]] }
  });
  session.lastBotMsgId = sent.message_id;
});

bot.action(/^withdraw_card_(.+)$/, async (ctx) => {
  ctx.answerCbQuery();
  try { await ctx.deleteMessage(); } catch (e) {}
  const cardNumber = ctx.match[1];
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

bot.action('wallet_addcard', async (ctx) => {
  ctx.answerCbQuery();
  try { await ctx.deleteMessage(); } catch (e) {}
  const session = { flow: 'addcard', step: 'waiting_card', lang: 'fa', data: {} };
  sessions[ctx.from.id] = session;
  const sent = await ctx.reply(texts.fa.addCardAsk);
  session.lastBotMsgId = sent.message_id;
});

bot.action('confirm_rules', async (ctx) => {
  try { await ctx.deleteMessage(); } catch (e) {}
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
        'INSERT INTO users (telegram_id, phone, full_name, card_number, language, balance, registered_at) VALUES ($1, $2, $3, $4, $5, 0, $6) ON CONFLICT (telegram_id) DO UPDATE SET phone = EXCLUDED.phone, full_name = EXCLUDED.full_name, card_number = EXCLUDED.card_number, language = EXCLUDED.language',
        [String(ctx.from.id), session.data.phone, session.data.fullName, session.data.cardNumber, session.lang, new Date().toISOString()]
      );
      ctx.reply(t.registrationSuccess).then(function () {
        ctx.reply(t.rulesText, { reply_markup: { inline_keyboard: [[{ text: t.confirmRulesButton, callback_data: 'confirm_rules' }]] } });
      });
      return;
    }
  }

  if (session.flow === 'deposit' && session.step === 'waiting_amount') {
    session.data.amount = ctx.message.text;
    session.step = 'waiting_receipt';
    await sendTracked(ctx, session, t.depositAskReceipt);
    return;
  }

  if (session.flow === 'buy' && session.step === 'waiting_amount') {
    const amount = parseInt(ctx.message.text.replace(/[^0-9]/g, ''), 10);
    const minAmount = session.data.minAmount;
    if (!amount || amount < minAmount) { ctx.reply(fillTemplate(t.buyMinError, { min: minAmount.toLocaleString('en-US') })); return; }
    session.data.amount = amount;
    session.step = 'waiting_confirm';
    await sendTracked(ctx, session, fillTemplate(t.buyConfirmSummary, { product: session.data.productLabel, amount: amount.toLocaleString('en-US') }), {
      reply_markup: {
        inline_keyboard: [
          [{ text: t.buyConfirmButton, callback_data: 'buy_confirm', style: 'success' }],
          [{ text: t.buyCancelButton, callback_data: 'buy_cancel', style: 'danger' }]
        ]
      }
    });
    return;
  }

  if (session.flow === 'sell' && session.step === 'waiting_code') {
    const voucherCode = ctx.message.text.trim();
    const trackingCode = generateTrackingCode();
    await pool.query(
      'INSERT INTO sell_orders (telegram_id, product_type, voucher_code, status, created_at, tracking_code) VALUES ($1, $2, $3, $4, $5, $6)',
      [String(ctx.from.id), session.data.productType, voucherCode, 'pending_review', new Date().toISOString(), trackingCode]
    );
    try { await ctx.telegram.deleteMessage(ctx.chat.id, session.lastBotMsgId); } catch (e) {}
    delete sessions[ctx.from.id];
    ctx.reply(fillTemplate(t.sellCodeReceived, { trackingCode: trackingCode }));
    return;
  }

  if (session.flow === 'withdraw' && session.step === 'waiting_amount') {
    const amount = parseInt(ctx.message.text.replace(/[^0-9]/g, ''), 10);
    if (!amount || amount < MIN_WITHDRAW) { ctx.reply(t.withdrawMinError); return; }
    session.data.amount = amount;
    const cards = await getUserCards(ctx.from.id);
    const buttons = cards.map(function (c) { return [{ text: c.card_number, callback_data: 'withdraw_card_' + c.card_number }]; });
    buttons.push([{ text: t.addCardButton, callback_data: 'wallet_addcard' }]);
    await sendTracked(ctx, session, t.withdrawSelectCard, { reply_markup: { inline_keyboard: buttons } });
    return;
  }

  if (session.flow === 'admin_reject_reason' && session.step === 'waiting_reason') {
    if (!isAdmin(ctx.from.id)) return;
    const reasonText = ctx.message.text;
    const requestId = session.data.requestId;
    const reqRes = await pool.query('SELECT * FROM wallet_requests WHERE id = $1', [requestId]);
    const request = reqRes.rows[0];
    if (!request || request.status !== 'pending') { delete sessions[ctx.from.id]; ctx.reply('این درخواست قبلاً بررسی شده است.'); return; }
    await pool.query("UPDATE wallet_requests SET status = 'rejected' WHERE id = $1", [requestId]);
    const codeText = request.tracking_code ? ('\n🆔 کد پیگیری: ' + request.tracking_code) : '';
    bot.telegram.sendMessage(request.telegram_id, '❌ درخواست شما رد شد.' + codeText + '\n📝 دلیل:\n' + reasonText);
    delete sessions[ctx.from.id];
    ctx.reply('درخواست شماره ' + requestId + ' با توضیح رد شد ✅');
    return;
  }

  if (session.flow === 'admin_sell_reject_reason' && session.step === 'waiting_reason') {
    if (!isAdmin(ctx.from.id)) return;
    const reasonText = ctx.message.text;
    const requestId = session.data.requestId;
    const reqRes = await pool.query('SELECT * FROM sell_orders WHERE id = $1', [requestId]);
    const request = reqRes.rows[0];
    if (!request || request.status !== 'pending_review') { delete sessions[ctx.from.id]; ctx.reply('این درخواست قبلاً بررسی شده است.'); return; }
    await pool.query("UPDATE sell_orders SET status = 'rejected' WHERE id = $1", [requestId]);
    bot.telegram.sendMessage(request.telegram_id, '❌ درخواست فروش شما رد شد.\n🆔 کد پیگیری: ' + request.tracking_code + '\n📝 دلیل:\n' + reasonText);
    delete sessions[ctx.from.id];
    ctx.reply('درخواست فروش شماره ' + requestId + ' با توضیح رد شد ✅');
    return;
  }

  if (session.flow === 'admin_sell_amount' && session.step === 'waiting_amount') {
    if (!isAdmin(ctx.from.id)) return;
    const amount = parseInt(ctx.message.text.replace(/[^0-9]/g, ''), 10);
    const requestId = session.data.requestId;
    if (!amount || amount <= 0) { ctx.reply('⚠️ عدد واردشده معتبر نیست. دوباره مبلغ رو بفرست:'); return; }
    const reqRes = await pool.query('SELECT * FROM sell_orders WHERE id = $1', [requestId]);
    const request = reqRes.rows[0];
    if (!request || request.status !== 'pending_review') { delete sessions[ctx.from.id]; ctx.reply('این درخواست قبلاً بررسی شده است.'); return; }
    await pool.query('UPDATE users SET balance = balance + $1 WHERE telegram_id = $2', [amount, request.telegram_id]);
    await pool.query("UPDATE sell_orders SET status = 'approved', amount = $1 WHERE id = $2", [amount, requestId]);
    bot.telegram.sendMessage(request.telegram_id, fillTemplate(t.sellApprovedUser, { trackingCode: request.tracking_code, amount: amount.toLocaleString('en-US') }));
    delete sessions[ctx.from.id];
    ctx.reply('✅ فروش تایید شد و ' + amount.toLocaleString('en-US') + ' تومان به کیف پول کاربر اضافه شد.');
    return;
  }

  if (session.flow === 'addcard' && session.step === 'waiting_card') {
    const cardNumber = ctx.message.text.replace(/[^0-9]/g, '');
    if (cardNumber.length !== 16) { await sendTracked(ctx, session, t.addCardInvalid); return; }
    await pool.query('INSERT INTO cards (telegram_id, card_number, created_at) VALUES ($1, $2, $3)', [String(ctx.from.id), cardNumber, new Date().toISOString()]);
    try { await ctx.telegram.deleteMessage(ctx.chat.id, session.lastBotMsgId); } catch (e) {}
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

bot.launch();
