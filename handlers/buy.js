// handlers/buy.js
const texts = require('../texts');
const { sessions, fillTemplate, generateTrackingCode, generateVoucherTrackingCode } = require('../utils');
const { pool, getUser, getUsdRate, getSetting } = require('../db');

module.exports = function registerBuyHandlers(bot) {

  bot.action('menu_buy', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    const t = texts.fa;
    const productsRes = await pool.query('SELECT * FROM products WHERE active = 1 ORDER BY id ASC');

    if (productsRes.rows.length === 0) return ctx.reply(t.buyNoProducts);
    const buttons = productsRes.rows.map(p => [{ text: p.name, callback_data: 'buy_' + p.key }]);
    ctx.reply(t.buyMenuTitle, { reply_markup: { inline_keyboard: buttons } });
  });

  bot.action('buy_cancel', async (ctx) => {
    ctx.answerCbQuery();
    delete sessions[ctx.from.id];
    try { await ctx.deleteMessage(); } catch (e) {}
    ctx.reply(texts.fa.buyCancelled);
  });

  bot.action('buy_confirm', async (ctx) => {
    ctx.answerCbQuery();
    const t = texts.fa;
    const session = sessions[ctx.from.id];

    if (!session || session.flow !== 'buy' || session.step !== 'waiting_confirm') {
      try { await ctx.deleteMessage(); } catch (e) {}
      return ctx.reply(t.buyCancelled);
    }

    const user = await getUser(ctx.from.id);
    const amount = session.data.amount;
    const productKey = session.data.productType;

    const productRes = await pool.query('SELECT * FROM products WHERE key = $1', [productKey]);
    if (productRes.rows.length === 0) {
      delete sessions[ctx.from.id];
      return ctx.reply('❌ محصول نامعتبر است.');
    }
    const product = productRes.rows[0];

    try { await ctx.deleteMessage(); } catch (e) {}

    let finalAmount = amount;
    let commissionAmount = 0;
    if (product.commission_type === 'percentage') {
      commissionAmount = Math.round(amount * (parseFloat(product.commission_value) / 100));
      finalAmount = amount + commissionAmount;
    } else if (product.commission_type === 'fixed') {
      commissionAmount = parseInt(product.commission_value, 10) || 0;
      finalAmount = amount + commissionAmount;
    }

    if (!user || Number(user.balance) < finalAmount) {
      delete sessions[ctx.from.id];
      return ctx.reply(fillTemplate(t.buyInsufficientBalance, {
        amount: finalAmount.toLocaleString('en-US'),
        balance: user ? Number(user.balance).toLocaleString('en-US') : '0'
      }), {
        reply_markup: { inline_keyboard: [[{ text: t.buyChargeWalletButton, callback_data: 'wallet_deposit' }]] }
      });
    }

    await pool.query('UPDATE users SET balance = balance - $1 WHERE telegram_id = $2', [finalAmount, String(ctx.from.id)]);

    const trackingCode = generateTrackingCode();
    const providerTxId = 'TX_' + Math.floor(10000000 + Math.random() * 90000000);
    const buyMode = await getSetting('buy_mode', 'MANUAL');
    let orderStatus = (buyMode === 'MANUAL' || product.manual_delivery) ? 'pending_delivery' : 'completed';

    await pool.query(
      'INSERT INTO orders (telegram_id, product_type, amount, commission, status, created_at, tracking_code, provider_tx_id) VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7)',
      [String(ctx.from.id), productKey, finalAmount, commissionAmount, orderStatus, trackingCode, providerTxId]
    );

    const newBalanceRes = await pool.query('SELECT balance FROM users WHERE telegram_id = $1', [String(ctx.from.id)]);
    const newBalance = newBalanceRes.rows[0].balance;

    // فراخوانی بونوس اولین خرید (با require در لحظه برای جلوگیری از خطای چرخه‌ای)
    try {
      const { checkAndGrantBonuses } = require('./game');
      await checkAndGrantBonuses(ctx, String(ctx.from.id), 'purchase');
    } catch (e) { console.log('خطا در بونوس خرید:', e.message); }

    const receiptText =
      '🧾 **رسید تراکنش موفق - ربات ووچینو⁰¹**\n\n' +
      'با تشکر، سفارش شما با موفقیت انجام شد!\n\n' +
      `📌 **نوع تراکنش:** خرید ${product.name}\n` +
      `💰 **مبلغ پرداختی:** ${finalAmount.toLocaleString('en-US')} تومان\n` +
      `🔢 **کد پیگیری:** ${trackingCode}\n` +
      `🏛 **کد مرجع شبکه (صرافی):** ${providerTxId}\n\n` +
      `⏱ **تاریخ و ساعت:** ${new Date().toLocaleString('fa-IR')}\n` +
      '----------------------------------\n' +
      '💡 کد ووچر را در جای امن نگهداری کنید.';

    delete sessions[ctx.from.id];

    if (orderStatus === 'pending_delivery') {
      ctx.reply(fillTemplate(t.buySuccessPending, {
        product: product.name,
        amount: finalAmount.toLocaleString('en-US'),
        commission: commissionAmount.toLocaleString('en-US'),
        balance: Number(newBalance).toLocaleString('en-US'),
        trackingCode: trackingCode
      }));
    } else {
      ctx.reply(fillTemplate(t.buySuccess, {
        product: product.name,
        amount: finalAmount.toLocaleString('en-US'),
        balance: Number(newBalance).toLocaleString('en-US'),
        trackingCode: trackingCode
      }));
    }
    ctx.reply(receiptText, { parse_mode: 'Markdown' });
  });

  bot.action(/^buy_(.+)/, async (ctx) => {
    const key = ctx.match[1];
    ctx.answerCbQuery();
    const t = texts.fa;

    const productRes = await pool.query('SELECT * FROM products WHERE key = $1 AND active = 1', [key]);
    const product = productRes.rows[0];
    if (!product) {
      try { await ctx.deleteMessage(); } catch (e) {}
      return ctx.reply(t.buyNoProducts);
    }

    const rate = await getUsdRate();
    let minToman, maxToman = 0;
    if (product.price_type === 'usd') {
      minToman = Math.round(Number(product.min_amount) * rate);
      if (Number(product.max_amount) > 0) maxToman = Math.round(Number(product.max_amount) * rate);
    } else {
      minToman = Number(product.min_amount);
      if (Number(product.max_amount) > 0) maxToman = Number(product.max_amount);
    }

    let messageText = product.price_type === 'usd'
      ? fillTemplate(t.buyAskAmountUsd, { rate: rate.toLocaleString('en-US'), minUsd: Number(product.min_amount).toLocaleString('en-US'), minToman: minToman.toLocaleString('en-US') })
      : fillTemplate(t.buyAskAmountToman, { min: minToman.toLocaleString('en-US') });

    if (maxToman > 0) messageText += '\n🔺 حداکثر خرید: ' + maxToman.toLocaleString('en-US') + ' تومان';
    if (product.commission_type === 'percentage') messageText += '\n\n💰 کارمزد: ' + product.commission_value + '%';
    else if (product.commission_type === 'fixed') messageText += '\n\n💰 کارمزد: ' + Number(product.commission_value).toLocaleString('en-US') + ' تومان';
    else messageText += '\n\n💰 بدون کارمزد';

    sessions[ctx.from.id] = {
      flow: 'buy',
      step: 'waiting_amount',
      lang: 'fa',
      data: {
        productType: product.key,
        productLabel: product.name,
        minAmount: minToman,
        maxAmount: maxToman,
        manualDelivery: product.manual_delivery,
        commissionType: product.commission_type,
        commissionValue: product.commission_value
      }
    };

    const extra = { reply_markup: { inline_keyboard: [[{ text: '🔙 بیخیال', callback_data: 'cancel_flow' }]] } };
    try {
      await ctx.editMessageText(messageText, extra);
      sessions[ctx.from.id].lastBotMsgId = ctx.callbackQuery.message.message_id;
    } catch (e) {
      try { await ctx.deleteMessage(); } catch (err) {}
      const sent = await ctx.reply(messageText, extra);
      sessions[ctx.from.id].lastBotMsgId = sent.message_id;
    }
  });

  bot.on('text', async (ctx, next) => {
    const session = sessions[ctx.from.id];
    if (!session || session.flow !== 'buy' || session.step !== 'waiting_amount') return next();

    const t = texts.fa;
    const amount = parseInt(ctx.message.text.replace(/[^0-9]/g, ''), 10);
    const minAmount = session.data.minAmount;
    const maxAmount = session.data.maxAmount;

    if (!amount || amount < minAmount) return ctx.reply(fillTemplate(t.buyMinError, { min: minAmount.toLocaleString('en-US') }));
    if (maxAmount > 0 && amount > maxAmount) return ctx.reply(fillTemplate(t.buyMaxError, { max: maxAmount.toLocaleString('en-US') }));

    session.data.amount = amount;
    session.step = 'waiting_confirm';

    let previewAmount = amount;
    const commType = session.data.commissionType;
    const commValue = parseFloat(session.data.commissionValue);
    if (commType === 'percentage') previewAmount = amount + Math.round(amount * (commValue / 100));
    else if (commType === 'fixed') previewAmount = amount + (parseInt(commValue, 10) || 0);

    const confirmText = fillTemplate(t.buyConfirmSummary, { product: session.data.productLabel, amount: previewAmount.toLocaleString('en-US') });
    const extra = { reply_markup: { inline_keyboard: [[{ text: t.buyConfirmButton, callback_data: 'buy_confirm' }, { text: t.buyCancelButton, callback_data: 'buy_cancel' }]] } };

    try {
      await ctx.editMessageText(confirmText, extra);
    } catch (e) {
      try { await ctx.deleteMessage(); } catch (err) {}
      const sent = await ctx.reply(confirmText, extra);
      session.lastBotMsgId = sent.message_id;
    }
  });
};
