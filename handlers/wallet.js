const texts = require('../texts');
const { sessions, sendTracked } = require('../utils');
const { pool, getUser, getUserCards } = require('../db');
const { MIN_WITHDRAW, DEPOSIT_CARDS } = require('../constants');
const { generateTrackingCode } = require('../utils');

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

module.exports = function registerWalletHandlers(bot) {
  bot.action('menu_wallet', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    await showWalletMenu(ctx);
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
      cardsMessage += '`' + c.number + '`' + '\n' + c.owner + '\n\n';
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

    try { await ctx.telegram.deleteMessage(ctx.chat.id, session.lastBotMsgId); } catch (e) {}
    delete sessions[ctx.from.id];
    ctx.reply(t.depositSubmitted + '\n\n🆔 کد پیگیری: ' + trackingCode);
  });

  bot.on('text', async (ctx, next) => {
    const session = sessions[ctx.from.id];
    if (!session) return next();

    const t = texts[session.lang] || texts.fa;

    if (session.flow === 'deposit' && session.step === 'waiting_amount') {
      session.data.amount = ctx.message.text;
      session.step = 'waiting_receipt';
      await sendTracked(ctx, session, t.depositAskReceipt);
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
      await sendTracked(ctx, session, t.withdrawSelectCard, { reply_markup: { inline_keyboard: buttons } });
      return;
    }

    if (session.flow === 'addcard' && session.step === 'waiting_card') {
      const cardNumber = ctx.message.text.replace(/[^0-9]/g, '');

      if (cardNumber.length !== 16) {
        await sendTracked(ctx, session, t.addCardInvalid);
        return;
      }
      await pool.query(
        'INSERT INTO cards (telegram_id, card_number, created_at) VALUES ($1, $2, $3)',
        [String(ctx.from.id), cardNumber, new Date().toISOString()]
      );
      try { await ctx.telegram.deleteMessage(ctx.chat.id, session.lastBotMsgId); } catch (e) {}
      delete sessions[ctx.from.id];
      ctx.reply(t.addCardSuccess);
      return;
    }

    return next();
  });
};
