// handlers/sell.js
const texts = require('../texts');
const { sessions, fillTemplate, generateTrackingCode } = require('../utils');
const { pool, getUser } = require('../db');

module.exports = function registerSellHandlers(bot) {

  // ============================================
  // نمایش منوی محصولات فروش
  // ============================================
  bot.action('menu_sell', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    const t = texts.fa;
    const productsRes = await pool.query('SELECT * FROM sell_products WHERE active = 1 ORDER BY id ASC');

    if (productsRes.rows.length === 0) {
      return ctx.reply(t.sellNoProducts);
    }

    const buttons = productsRes.rows.map(p => [{ text: p.name, callback_data: 'sell_' + p.key }]);
    ctx.reply(t.sellMenuTitle, { reply_markup: { inline_keyboard: buttons } });
  });

  // ============================================
  // لغو فروش
  // ============================================
  bot.action('sell_cancel', async (ctx) => {
    ctx.answerCbQuery();
    delete sessions[ctx.from.id];
    try { await ctx.deleteMessage(); } catch (e) {}
    ctx.reply('فروش لغو شد.');
  });

  // ============================================
  // انتخاب محصول و درخواست کد ووچر
  // ============================================
  bot.action(/^sell_(.+)/, async (ctx) => {
    const key = ctx.match[1];
    ctx.answerCbQuery();
    const t = texts.fa;

    const productRes = await pool.query('SELECT * FROM sell_products WHERE key = $1 AND active = 1', [key]);
    const product = productRes.rows[0];
    if (!product) {
      try { await ctx.deleteMessage(); } catch (e) {}
      return ctx.reply(t.sellNoProducts);
    }

    // محاسبه مبلغ قابل پرداخت به کاربر پس از کسر کارمزد
    const unitPrice = Number(product.unit_price);
    let commissionText = '';
    let netAmount = unitPrice;

    if (product.commission_type === 'percentage') {
      const commissionAmount = Math.round(unitPrice * (Number(product.commission_value) / 100));
      netAmount = unitPrice - commissionAmount;
      commissionText = `💰 کارمزد فروش: ${product.commission_value}% (${commissionAmount.toLocaleString()} تومان)`;
    } else if (product.commission_type === 'fixed') {
      const commissionAmount = Number(product.commission_value);
      netAmount = unitPrice - commissionAmount;
      commissionText = `💰 کارمزد فروش: ${commissionAmount.toLocaleString()} تومان`;
    } else {
      commissionText = '💰 بدون کارمزد';
    }

    // ساخت پیام راهنما
    let messageText = fillTemplate(t.sellAskCode, {
      product: product.name,
      price: unitPrice.toLocaleString(),
      sample: product.sample_code
    });

    messageText += '\n' + commissionText;
    messageText += `\n💵 **مبلغ دریافتی شما (پس از کسر کارمزد): ${netAmount.toLocaleString()} تومان**`;

    sessions[ctx.from.id] = {
      flow: 'sell',
      step: 'waiting_code',
      lang: 'fa',
      data: {
        productType: product.key,
        productLabel: product.name,
        unitPrice: unitPrice,
        netAmount: netAmount,
        commissionType: product.commission_type,
        commissionValue: Number(product.commission_value || 0)
      }
    };

    try {
      await ctx.editMessageText(messageText, { parse_mode: 'Markdown' });
    } catch (e) {
      try { await ctx.deleteMessage(); } catch (err) {}
      ctx.reply(messageText, { parse_mode: 'Markdown' });
    }
  });

  // ============================================
  // دریافت کد ووچر از کاربر و ثبت سفارش فروش
  // ============================================
  bot.on('text', async (ctx, next) => {
    const session = sessions[ctx.from.id];
    if (!session || session.flow !== 'sell' || session.step !== 'waiting_code') return next();

    const voucherCode = ctx.message.text.trim();
    if (voucherCode.length < 5) {
      return ctx.reply('❌ کد ووچر نامعتبر است. لطفاً یک کد صحیح وارد کنید.');
    }

    const trackingCode = generateTrackingCode();

    try {
      await pool.query(
        'INSERT INTO sell_orders (telegram_id, product_type, voucher_code, status, created_at, tracking_code) VALUES ($1, $2, $3, $4, NOW(), $5)',
        [String(ctx.from.id), session.data.productType, voucherCode, 'pending_review', trackingCode]
      );

      delete sessions[ctx.from.id];

      ctx.reply(
        fillTemplate(texts.fa.sellCodeReceived, {
          trackingCode: trackingCode
        })
      );
    } catch (err) {
      console.error('خطا در ثبت سفارش فروش:', err);
      ctx.reply('❌ خطایی رخ داد. لطفاً دوباره تلاش کنید.');
      delete sessions[ctx.from.id];
    }
  });
};
