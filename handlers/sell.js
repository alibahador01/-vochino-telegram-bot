const { pool } = require('../db');

function generateTrackingCode() {
  return 'VOC-' + Math.floor(100000 + Math.random() * 900000);
}

function registerSellHandlers(bot, sessions) {
  // دکمه منوی اصلی برای فروش
  bot.hears(['🎟 فروش به ما', 'فروش ووچر', '/sell'], async (ctx) => {
    const res = await pool.query('SELECT * FROM sell_products WHERE active = 1 ORDER BY id ASC');
    const products = res.rows;

    if (products.length === 0) {
      return ctx.reply('در حال حاضر هیچ محصولی برای فروش فعال نیست.');
    }

    const inlineKeyboard = products.map((p) => [
      { text: p.name, callback_data: 'sell_prod_' + p.key }
    ]);

    ctx.reply('💎 لطفاً محصولی که قصد فروش آن را دارید انتخاب کنید:', {
      reply_markup: { inline_keyboard: inlineKeyboard }
    });
  });

  // انتخاب نوع ووچر توسط کاربر
  bot.action(/^sell_prod_(.+)$/, async (ctx) => {
    ctx.answerCbQuery();
    const productKey = ctx.match[1];

    const res = await pool.query('SELECT * FROM sell_products WHERE key = $1 AND active = 1', [productKey]);
    const product = res.rows[0];

    if (!product) {
      return ctx.reply('این محصول یافت نشد یا غیرفعال شده است.');
    }

    sessions[ctx.from.id] = {
      flow: 'sell_process',
      step: 'waiting_voucher_code',
      productKey: product.key,
      productName: product.name
    };

    const formattedPrice = Number(product.unit_price).toLocaleString('fa-IR');

    const msg = 
      '💸 فروش ' + product.name + '\n\n' +
      '♻️ قیمت واحد: ' + formattedPrice + ' تومان\n\n' +
      '🎫 نمونه کد صحیح:\n' +
      '`' + product.sample_code + '`\n' +
      '〰️〰️〰️〰️〰️〰️〰️〰️〰️〰️〰️〰️〰️〰️\n' +
      '▫️ لطفاً کد ووچر را وارد کنید:';

    try { await ctx.deleteMessage(); } catch (e) {}
    ctx.reply(msg, { parse_mode: 'Markdown' });
  });

  // دریافت کد ووچر متنی از کاربر
  bot.on('text', async (ctx, next) => {
    const session = sessions[ctx.from.id];
    if (!session || session.flow !== 'sell_process' || session.step !== 'waiting_voucher_code') {
      return next();
    }

    const voucherCode = ctx.message.text.trim();
    if (voucherCode.length < 5) {
      return ctx.reply('❌ کد وارد شده نامعتبر است. لطفاً کد ووچر صحیح را ارسال کنید:');
    }

    const trackingCode = generateTrackingCode();

    await pool.query(
      'INSERT INTO sell_orders (telegram_id, product_type, voucher_code, status, created_at, tracking_code) VALUES ($1, $2, $3, $4, $5, $6)',
      [String(ctx.from.id), session.productKey, voucherCode, 'pending_review', new Date().toISOString(), trackingCode]
    );

    delete sessions[ctx.from.id];

    ctx.reply(
      '✅ کد ووچر شما با موفقیت دریافت شد.\n\n' +
      '🆔 کد پیگیری: `' + trackingCode + '`\n\n' +
      '⏳ درخواست شما به بخش مالی ارسال گردید و پس از بررسی، مبلغ به کیف پول شما واریز خواهد شد.',
      { parse_mode: 'Markdown' }
    );
  });
}

module.exports = { registerSellHandlers };
