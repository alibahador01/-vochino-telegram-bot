const texts = require('../texts');
const { sessions, sendTracked, fillTemplate, generateTrackingCode } = require('../utils');
const { pool, getUser, getUsdRate, grantBonusIfEligible, getInventoryCode, markCodeAsUsed, countAvailableCodes } = require('../db');
const { BONUS_THRESHOLD, BONUS_AMOUNT } = require('../constants');

module.exports = function registerBuyHandlers(bot) {

  // ===== منوی اصلی خرید =====
  bot.action('menu_buy', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    const t = texts.fa;
    const productsRes = await pool.query(
      'SELECT * FROM products WHERE active = 1 AND is_hidden = 0 ORDER BY id ASC'
    );

    if (productsRes.rows.length === 0) {
      ctx.reply(t.buyNoProducts);
      return;
    }

    const buttons = [];
    for (const p of productsRes.rows) {
      let label = p.name;
      if (p.auto_delivery === 1) {
        const count = await countAvailableCodes(p.key);
        label += ' (' + count + ' عدد موجود)';
      }
      buttons.push([{ text: label, callback_data: 'buy_' + p.key }]);
    }

    ctx.reply(t.buyMenuTitle, { reply_markup: { inline_keyboard: buttons } });
  });

  // ===== انتخاب یک محصول خاص =====
  bot.action(/^buy_(.+)/, async (ctx) => {
    const key = ctx.match[1];
    ctx.answerCbQuery();
    const t = texts.fa;

    const productRes = await pool.query(
      'SELECT * FROM products WHERE key = $1 AND active = 1 AND is_hidden = 0',
      [key]
    );
    const product = productRes.rows[0];
    if (!product) {
      try { await ctx.deleteMessage(); } catch (e) {}
      ctx.reply(t.buyNoProducts);
      return;
    }

    let minToman, maxToman;
    let messageText = '📦 ' + product.name + '\n\n';

    if (product.price_type === 'usd') {
      const rate = await getUsdRate();
      minToman = Math.round(Number(product.min_amount) * rate);
      maxToman = product.max_amount ? Math.round(Number(product.max_amount) * rate) : null;
      
      messageText += '💵 نرخ هر دلار: ' + rate.toLocaleString('en-US') + ' تومان\n';
      messageText += '💰 حداقل خرید: ' + minToman.toLocaleString('en-US') + ' تومان\n';
      if (maxToman) {
        messageText += '📈 حداکثر خرید: ' + maxToman.toLocaleString('en-US') + ' تومان\n';
      }
      messageText += '\nمبلغ خرید خود را به تومان وارد کنید:';
    } else {
      minToman = Number(product.min_amount);
      maxToman = product.max_amount ? Number(product.max_amount) : null;
      
      messageText += '💰 حداقل خرید: ' + minToman.toLocaleString('en-US') + ' تومان\n';
      if (maxToman) {
        messageText += '📈 حداکثر خرید: ' + maxToman.toLocaleString('en-US') + ' تومان\n';
      }
      messageText += '\nمبلغ خرید خود را به تومان وارد کنید:';
    }

    const feePercent = Number(product.fee_percent) || 0;
    const feeFixed = Number(product.fee_fixed) || 0;
    if (feePercent > 0 || feeFixed > 0) {
      messageText += '\n\n💳 کارمزد: ';
      if (feePercent > 0) messageText += feePercent + '% ';
      if (feeFixed > 0) messageText += '+' + feeFixed.toLocaleString('en-US') + ' تومان';
    }

    const deliveryLabels = {
      'code': '🎟 ارسال کد',
      'wallet': '🏦 واریز به کیف پول',
      'telegram_id': '📱 ارسال به آیدی تلگرام'
    };
    messageText += '\n\n📬 روش تحویل: ' + (deliveryLabels[product.delivery_type] || product.delivery_type);

    const session = {
      flow: 'buy',
      step: 'waiting_amount',
      lang: 'fa',
      data: {
        productKey: product.key,
        productLabel: product.name,
        minAmount: minToman,
        maxAmount: maxToman,
        feePercent: feePercent,
        feeFixed: feeFixed,
        deliveryType: product.delivery_type || 'code',
        autoDelivery: product.auto_delivery || 0,
        priceType: product.price_type
      }
    };
    sessions[ctx.from.id] = session;

    const extra = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 بیخیال', callback_data: 'cancel_flow', style: 'danger' }]
        ]
      }
    };

    try {
      await ctx.editMessageText(messageText, extra);
      session.lastBotMsgId = ctx.callbackQuery.message.message_id;
    } catch (e) {
      try { await ctx.deleteMessage(); } catch (err) {}
      const sent = await ctx.reply(messageText, extra);
      session.lastBotMsgId = sent.message_id;
    }
  });

  // ===== لغو خرید =====
  bot.action('buy_cancel', async (ctx) => {
    ctx.answerCbQuery();
    delete sessions[ctx.from.id];
    try { await ctx.deleteMessage(); } catch (e) {}
    ctx.reply(texts.fa.buyCancelled);
  });

  // ===== تایید نهایی خرید =====
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
    const feePercent = session.data.feePercent || 0;
    const feeFixed = session.data.feeFixed || 0;
    
    const feeAmount = Math.round((amount * feePercent / 100) + feeFixed);
    const totalAmount = amount + feeAmount;

    try { await ctx.deleteMessage(); } catch (e) {}

    if (!user || Number(user.balance) < totalAmount) {
      delete sessions[ctx.from.id];
      ctx.reply(fillTemplate(t.buyInsufficientBalance, {
        amount: totalAmount.toLocaleString('en-US'),
        balance: user ? Number(user.balance).toLocaleString('en-US') : '0'
      }), {
        reply_markup: { inline_keyboard: [[{ text: t.buyChargeWalletButton, callback_data: 'wallet_deposit' }]] }
      });
      return;
    }

    await pool.query('UPDATE users SET balance = balance - $1 WHERE telegram_id = $2', [totalAmount, String(ctx.from.id)]);

    const trackingCode = generateTrackingCode();
    let deliveredCode = null;
    let orderStatus = 'completed';
    
    if (session.data.autoDelivery === 1) {
      const inventoryItem = await getInventoryCode(session.data.productKey);
      if (inventoryItem) {
        deliveredCode = inventoryItem.code;
        await markCodeAsUsed(inventoryItem.id, ctx.from.id);
        orderStatus = 'completed';
      } else {
        orderStatus = 'waiting_for_code';
      }
    }

    await pool.query(
      'INSERT INTO orders (telegram_id, product_type, amount, fee_amount, total_amount, status, created_at, tracking_code, delivery_type, delivered_code) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
      [String(ctx.from.id), session.data.productKey, amount, feeAmount, totalAmount, orderStatus, new Date().toISOString(), trackingCode, session.data.deliveryType, deliveredCode]
    );

    const newBalanceRes = await pool.query('SELECT balance FROM users WHERE telegram_id = $1', [String(ctx.from.id)]);
    const newBalance = newBalanceRes.rows[0].balance;

    if (orderStatus === 'waiting_for_code') {
      delete sessions[ctx.from.id];
      ctx.reply(
        '⚠️ کد محصول مورد نظر در انبار موجود نیست.\n' +
        '🆔 کد پیگیری: ' + trackingCode + '\n' +
        '💰 مبلغ کسر شده: ' + totalAmount.toLocaleString('en-US') + ' تومان\n' +
        '⏳ لطفاً صبر کنید، به محض موجود شدن کد برای شما ارسال می‌شود.'
      );
      await grantBonusIfEligible(ctx.from.id, BONUS_THRESHOLD, BONUS_AMOUNT);
      return;
    }

    delete sessions[ctx.from.id];

    let successMessage = fillTemplate(t.buySuccess, {
      product: session.data.productLabel,
      amount: totalAmount.toLocaleString('en-US'),
      balance: Number(newBalance).toLocaleString('en-US'),
      trackingCode: trackingCode
    });

    if (deliveredCode) {
      successMessage += '\n\n🎟 کد محصول شما:\n`' + deliveredCode + '`';
    }

    ctx.reply(successMessage, { parse_mode: 'Markdown' });

    await grantBonusIfEligible(ctx.from.id, BONUS_THRESHOLD, BONUS_AMOUNT);
  });

  // ===== دریافت مبلغ از کاربر =====
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

    if (maxAmount && amount > maxAmount) {
      ctx.reply('⚠️ مبلغ وارد شده از حد مجاز (' + maxAmount.toLocaleString('en-US') + ' تومان) بیشتر است. لطفاً دوباره وارد کنید:');
      return;
    }

    const feePercent = session.data.feePercent || 0;
    const feeFixed = session.data.feeFixed || 0;
    const feeAmount = Math.round((amount * feePercent / 100) + feeFixed);
    const totalAmount = amount + feeAmount;

    session.data.amount = amount;
    session.data.feeAmount = feeAmount;
    session.data.totalAmount = totalAmount;
    session.step = 'waiting_confirm';

    let summary = '📦 خلاصه‌ی سفارش:\n\n';
    summary += '🛒 محصول: ' + session.data.productLabel + '\n';
    summary += '💰 مبلغ پایه: ' + amount.toLocaleString('en-US') + ' تومان\n';
    if (feeAmount > 0) {
      summary += '💳 کارمزد: ' + feeAmount.toLocaleString('en-US') + ' تومان\n';
    }
    summary += '🔹 مجموع قابل پرداخت: ' + totalAmount.toLocaleString('en-US') + ' تومان\n\n';
    summary += 'با تایید، این مبلغ از موجودی کیف پولت کسر می‌شه.';

    await sendTracked(ctx, session, summary, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ تایید و خرید', callback_data: 'buy_confirm', style: 'success' }],
          [{ text: '❌ انصراف', callback_data: 'buy_cancel', style: 'danger' }]
        ]
      }
    });
  });
};
