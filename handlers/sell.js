// handlers/sell.js
const texts = require('../texts');
const { sessions, fillTemplate, generateTrackingCode } = require('../utils');
const { pool, getUser } = require('../db');

module.exports = function registerSellHandlers(bot) {

  bot.action('menu_sell', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    const t = texts.fa;
    const productsRes = await pool.query('SELECT * FROM sell_products WHERE active = 1 ORDER BY id ASC');

    if (productsRes.rows.length === 0) {
      ctx.reply(t.sellNoProducts);
      return;
    }

    const buttons = productsRes.rows.map(function (p) {
      return [{ text: p.name, callback_data: 'sell_' + p.key }];
    });

    ctx.reply(t.sellMenuTitle, { reply_markup: { inline_keyboard: buttons } });
  });

  bot.action('sell_cancel', async (ctx) => {
    ctx.answerCbQuery();
    delete sessions[ctx.from.id];
    try { await ctx.deleteMessage(); } catch (e) {}
    ctx.reply('فروش لغو شد.');
  });

  bot.action(/^sell_(.+)/, async (ctx) => {
    const key = ctx.match[1];
    ctx.answerCbQuery();
    const t = texts.fa;

    const productRes = await pool.query('SELECT * FROM sell_products WHERE key = $1 AND active = 1', [key]);
    const product = productRes.rows[0];
    if (!product) {
      try { await ctx.deleteMessage(); } catch (e) {}
      ctx.reply(t.sellNoProducts);
      return;
    }

    // نمایش اطلاعات محصول و درخواست کد ووچر
    let messageText = fillTemplate(t.sellAskCode, {
      product: product.name,
      price: Number(product.unit_price).toLocaleString(),
      sample: product.sample_code
    });

    // نمایش کارمزد
    if (product.commission_type === 'percentage') {
      messageText += '\n\n💰 کارمزد فروش: ' + product.commission_value + '%';
    } else if (product.commission_type === 'fixed') {
      messageText += '\n\n💰 کارمزد فروش: ' + Number(product.commission_value).toLocaleString() + ' تومان';
    } else {
      messageText += '\n\n💰 بدون کارمزد';
    }

    sessions[ctx.from.id] = {
      flow: 'sell',
      step: 'waiting_code',
      lang: 'fa',
      data: {
        productType: product.key,
        productLabel: product.name,
        unitPrice: Number(product.unit_price),
        commissionType: product.commission_type,
        commissionValue: Number(product.commission_value || 0)
      }
    };

    try {
      await ctx.editMessageText(messageText);
    } catch (e) {
      try { await ctx.deleteMessage(); } catch (err) {}
      ctx.reply(messageText);
    }
  });

  // دریافت کد ووچر از کاربر
  bot.on('text', async (ctx, next) => {
    const session = sessions[ctx.from.id];
    if (!session || session.flow !== 'sell' || session.step !== 'waiting_code') return next();

    const voucherCode = ctx.message.text.trim();
    if (voucherCode.length < 5) {
      return ctx.reply('❌ کد ووچر نامعتبر است. لطفاً یک کد صحیح وارد کنید.');
    }

    // ذخیره کد و ایجاد سفارش فروش
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
