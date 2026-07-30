const { pool } = require('../db');
const texts = require('../texts');

function fillTemplate(template, values) {
  let result = template;
  Object.keys(values).forEach(function (key) {
    result = result.split('{' + key + '}').join(values[key]);
  });
  return result;
}

function registerSellHandlers(bot, sessions) {
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
}

module.exports = { registerSellHandlers };
