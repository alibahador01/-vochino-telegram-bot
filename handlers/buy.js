const texts = require('../texts');
const { sessions, sendTracked, fillTemplate, generateTrackingCode } = require('../utils');
const { pool, getUser, getUsdRate, grantBonusIfEligible } = require('../db');
const { BONUS_THRESHOLD, BONUS_AMOUNT } = require('../constants');

module.exports = function registerBuyHandlers(bot) {
  bot.action('menu_buy', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
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

  bot.action('buy_cancel', async (ctx) => {
    ctx.answerCbQuery();
    delete sessions[ctx.from.id];
    try { await ctx.deleteMessage(); } catch (e) {}
    ctx.reply(texts.fa.buyCancelled);
  });

  bot.action(/^buy_(.+)/, async (ctx) => {
    const key = ctx.match[1];
    ctx.answerCbQuery();
    const t = texts.fa;

    const productRes = await pool.query('SELECT * FROM products WHERE key = $1 AND active = 1', [key]);
    const product = productRes.rows[0];
    if (!product) {
      try { await ctx.deleteMessage(); } catch (e) {}
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

    const session = {
      flow: 'buy',
      step: 'waiting_amount',
      lang: 'fa',
      data: { productType: product.key, productLabel: product.name, minAmount: minToman }
    };
    sessions[ctx.from.id] = session;

    const extra = { reply_markup: { inline_keyboard: [[{ text: '🔙 بیخیال', callback_data: 'cancel_flow', style: 'danger' }]] } };

    try {
      await ctx.editMessageText(messageText, extra);
      session.lastBotMsgId = ctx.callbackQuery.message.message_id;
    } catch (e) {
      try { await ctx.deleteMessage(); } catch (err) {}
      const sent = await ctx.reply(messageText, extra);
      session.lastBotMsgId = sent.message_id;
    }
  });

  bot.action('buy_confirm', async (ctx) => {
    ctx.answerCbQuery();
    const t = texts.fa;
    const session = sessions[ctx.from.id];
    if (!session || session.flow !== 'buy' || session.step !== 'waiting_confirm') {
      try { await ctx.deleteMessage(); } catch (e) {}
      ctx.reply(t.buyCancelled);
      return;
    }

    const user = await getUser(ctx.from.id);
    const amount = session.data.amount;

    try { await ctx.deleteMessage(); } catch (e) {}

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

    await grantBonusIfEligible(ctx.from.id, BONUS_THRESHOLD, BONUS_AMOUNT);
  });

  // این هندلر فقط مرحله‌ی وارد کردن مبلغ خرید رو می‌گیره، بقیه رو با next() رد می‌کنه
  bot.on('text', async (ctx, next) => {
    const session = sessions[ctx.from.id];
    if (!session || session.flow !== 'buy' || session.step !== 'waiting_amount') return next();

    const t = texts.fa;
    const amount = parseInt(ctx.message.text.replace(/[^0-9]/g, ''), 10);
    const minAmount = session.data.minAmount;

    if (!amount || amount < minAmount) {
      ctx.reply(fillTemplate(t.buyMinError, { min: minAmount.toLocaleString('en-US') }));
      return;
    }
    session.data.amount = amount;
    session.step = 'waiting_confirm';
    await sendTracked(ctx, session, fillTemplate(t.buyConfirmSummary, {
      product: session.data.productLabel,
      amount: amount.toLocaleString('en-US')
    }), {
      reply_markup: {
        inline_keyboard: [
          [{ text: t.buyConfirmButton, callback_data: 'buy_confirm', style: 'success' }],
          [{ text: t.buyCancelButton, callback_data: 'buy_cancel', style: 'danger' }]
        ]
      }
    });
  });
};
