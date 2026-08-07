const texts = require('../texts');
const { sessions, sendTracked, fillTemplate, generateTrackingCode, generateVoucherTrackingCode } = require('../utils');
const { pool, getUser, getUsdRate, grantBonusIfEligible } = require('../db');
const { BONUS_THRESHOLD, BONUS_AMOUNT } = require('../constants');
const PricingEngine = require('../pricingEngine');

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

    const marginRes = await pool.query("SELECT value FROM settings WHERE key = 'buy_margin'");
    const marginPercentage = marginRes.rows[0] ? Number(marginRes.rows[0].value) : 10;
    
    const modeRes = await pool.query("SELECT value FROM settings WHERE key = 'buy_mode'");
    const mode = modeRes.rows[0] ? modeRes.rows[0].value : 'MANUAL';

    const pricingResult = PricingEngine.calculate({
      actionType: 'BUY',
      baseAmount: amount,
      marginPercentage: marginPercentage,
      minAmount: session.data.minAmount || 0,
      mode: mode
    });

    if (!pricingResult.success) {
      ctx.reply('⚠️ خطا در محاسبه مبلغ. لطفاً دوباره تلاش کنید.');
      delete sessions[ctx.from.id];
      return;
    }

    const finalAmount = pricingResult.finalAmount;
    const marginAmount = pricingResult.marginAmount;

    if (!user || Number(user.balance) < finalAmount) {
      delete sessions[ctx.from.id];
      ctx.reply(fillTemplate(t.buyInsufficientBalance, {
        amount: finalAmount.toLocaleString('en-US'),
        balance: user ? Number(user.balance).toLocaleString('en-US') : '0'
      }), {
        reply_markup: { inline_keyboard: [[{ text: t.buyChargeWalletButton, callback_data: 'wallet_deposit' }]] }
      });
      return;
    }

    await pool.query('UPDATE users SET balance = balance - $1 WHERE telegram_id = $2', [finalAmount, String(ctx.from.id)]);

    const trackingCode = generateTrackingCode();
    const voucherTrackingCode = generateVoucherTrackingCode();
    
    // کد مرجع ساختگی از صرافی (در آینده از API واقعی میاد)
    const providerTxId = 'TX_' + Math.floor(10000000 + Math.random() * 90000000);

    let orderStatus;
    if (mode === 'MANUAL' || session.data.manualDelivery === 1) {
      orderStatus = 'pending_delivery';
    } else {
      orderStatus = 'completed';
    }

    await pool.query(
      'INSERT INTO orders (telegram_id, product_type, amount, commission, status, created_at, tracking_code, provider_tx_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [String(ctx.from.id), session.data.productType, finalAmount, marginAmount, orderStatus, new Date().toISOString(), trackingCode, providerTxId]
    );

    const newBalanceRes = await pool.query('SELECT balance FROM users WHERE telegram_id = $1', [String(ctx.from.id)]);
    const newBalance = newBalanceRes.rows[0].balance;

    // محاسبه مقدار ووچر بر اساس نرخ دلار
    const rate = await getUsdRate();
    const voucherAmount = (finalAmount / rate).toFixed(2);

    // کد ووچر ساختگی (در آینده از API واقعی میاد)
    const voucherCode = 'VCH-' + Math.random().toString(36).substring(2, 10).toUpperCase();

    // ===== رسید نهایی =====
    const receiptText = 
      '🧾 **رسید تراکنش موفق - ربات ووچینو⁰¹**\n\n' +
      'با تشکر، سفارش شما با موفقیت انجام شد!\n\n' +
      '📌 **نوع تراکنش:** خرید ووچر دلار\n' +
      '💰 **مبلغ پرداختی:** ' + finalAmount.toLocaleString('en-US') + ' تومان\n' +
      '💵 **مقدار ووچر:** ' + voucherAmount + ' دلار\n\n' +
      '🔢 **کد پیگیری ووچینو:** #VCH_' + voucherTrackingCode + '\n' +
      '🏛 **کد مرجع شبکه (صرافی):** ' + providerTxId + '\n\n' +
      '🎟 **کد ووچر شما:**\n`' + voucherCode + '`\n\n' +
      '⏱ **تاریخ و ساعت:** ' + new Date().toLocaleString('fa-IR') + '\n' +
      '----------------------------------\n' +
      '💡 کد ووچر را در جای امن نگهداری کنید.';

    delete sessions[ctx.from.id];

    if (orderStatus === 'pending_delivery') {
      ctx.reply(fillTemplate(t.buySuccessPending, {
        product: session.data.productLabel,
        amount: finalAmount.toLocaleString('en-US'),
        commission: marginAmount.toLocaleString('en-US'),
        balance: Number(newBalance).toLocaleString('en-US'),
        trackingCode: trackingCode
      }));
      // رسید رو هم جدا میفرستیم
      ctx.reply(receiptText, { parse_mode: 'Markdown' });
    } else {
      ctx.reply(fillTemplate(t.buySuccess, {
        product: session.data.productLabel,
        amount: finalAmount.toLocaleString('en-US'),
        balance: Number(newBalance).toLocaleString('en-US'),
        trackingCode: trackingCode
      }));
      ctx.reply(receiptText, { parse_mode: 'Markdown' });
    }

    await grantBonusIfEligible(ctx.from.id, BONUS_THRESHOLD, BONUS_AMOUNT);
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
    let maxToman = 0;
    let messageText;

    const rate = await getUsdRate();

    if (product.price_type === 'usd') {
      minToman = Math.round(Number(product.min_amount) * rate);
      if (Number(product.max_amount) > 0) {
        maxToman = Math.round(Number(product.max_amount) * rate);
      }
      let maxText = '';
      if (maxToman > 0) {
        maxText = '\n🔺 حداکثر خرید: ' + maxToman.toLocaleString('en-US') + ' تومان';
      }
      messageText = fillTemplate(t.buyAskAmountUsd, {
        rate: rate.toLocaleString('en-US'),
        minUsd: Number(product.min_amount).toLocaleString('en-US'),
        minToman: minToman.toLocaleString('en-US')
      }) + maxText;
    } else {
      minToman = Number(product.min_amount);
      if (Number(product.max_amount) > 0) {
        maxToman = Number(product.max_amount);
      }
      let maxText = '';
      if (maxToman > 0) {
        maxText = '\n🔺 حداکثر خرید: ' + maxToman.toLocaleString('en-US') + ' تومان';
      }
      messageText = fillTemplate(t.buyAskAmountToman, { min: minToman.toLocaleString('en-US') }) + maxText;
    }

    // دریافت درصد سود از دیتابیس برای نمایش
    const marginRes = await pool.query("SELECT value FROM settings WHERE key = 'buy_margin'");
    const marginPercentage = marginRes.rows[0] ? Number(marginRes.rows[0].value) : 10;
    messageText += '\n\n💰 کارمزد (سود ما): ' + marginPercentage + '%';

    const session = {
      flow: 'buy',
      step: 'waiting_amount',
      lang: 'fa',
      data: {
        productType: product.key,
        productLabel: product.name,
        minAmount: minToman,
        maxAmount: maxToman,
        manualDelivery: product.manual_delivery
      }
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

  bot.on('text', async (ctx, next) => {
    const session = sessions[ctx.from.id];
    if (!session || session.flow !== 'buy' || session.step !== 'waiting_amount') return next();

    const t = texts.fa;
    const amount = parseInt(ctx.message.text.replace(/[^0-9]/g, ''), 10);
    const minAmount = session.data.minAmount;
    const maxAmount = session.data.maxAmount;

    if (!amount || amount < minAmount) {
      ctx.reply(fillTemplate(t.buyMinError, { min: minAmount.toLocaleString('en-US') }));
      return;
    }

    if (maxAmount > 0 && amount > maxAmount) {
      ctx.reply(fillTemplate(t.buyMaxError, { max: maxAmount.toLocaleString('en-US') }));
      return;
    }

    session.data.amount = amount;
    session.step = 'waiting_confirm';

    const marginRes = await pool.query("SELECT value FROM settings WHERE key = 'buy_margin'");
    const marginPercentage = marginRes.rows[0] ? Number(marginRes.rows[0].value) : 10;

    const pricingResult = PricingEngine.calculate({
      actionType: 'BUY',
      baseAmount: amount,
      marginPercentage: marginPercentage,
      minAmount: minAmount,
      mode: 'MANUAL'
    });

    const finalAmount = pricingResult.finalAmount;
    const marginAmount = pricingResult.marginAmount;

    let summaryText = fillTemplate(t.buyConfirmSummary, {
      product: session.data.productLabel,
      amount: amount.toLocaleString('en-US')
    });

    summaryText += '\n💰 کارمزد (سود ما): ' + marginAmount.toLocaleString('en-US') + ' تومان';
    summaryText += '\n💳 مبلغ قابل پرداخت: ' + finalAmount.toLocaleString('en-US') + ' تومان';

    await sendTracked(ctx, session, summaryText, {
      reply_markup: {
        inline_keyboard: [
          [{ text: t.buyConfirmButton, callback_data: 'buy_confirm', style: 'success' }],
          [{ text: t.buyCancelButton, callback_data: 'buy_cancel', style: 'danger' }]
        ]
      }
    });
  });
};
