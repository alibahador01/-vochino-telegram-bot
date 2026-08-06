const texts = require('../texts');
const { sessions, fillTemplate, generateTrackingCode } = require('../utils');
const { pool } = require('../db');

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

    const messageText = fillTemplate(t.sellAskCode, {
      product: product.name,
      price: Number(product.unit_price).toLocaleString('en-US'),
      sample: product.sample_code
    });

    const session = {
      flow: 'sell',
      step: 'waiting_code',
      lang: 'fa',
      data: { productType: product.key, productLabel: product.name }
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
    if (!session || session.flow !== 'sell' || session.step !== 'waiting_code') return next();

    const t = texts.fa;
    const voucherCode = ctx.message.text.trim();
    const trackingCode = generateTrackingCode();

    await pool.query(
      'INSERT INTO sell_orders (telegram_id, product_type, voucher_code, status, created_at, tracking_code) VALUES ($1, $2, $3, $4, $5, $6)',
      [String(ctx.from.id), session.data.productType, voucherCode, 'pending_review', new Date().toISOString(), trackingCode]
    );

    try { await ctx.telegram.deleteMessage(ctx.chat.id, session.lastBotMsgId); } catch (e) {}
    delete sessions[ctx.from.id];

    ctx.reply(fillTemplate(t.sellCodeReceived, { trackingCode: trackingCode }));
  });
};
