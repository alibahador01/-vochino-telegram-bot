const { pool } = require('./db');

const ADMIN_ID = process.env.ADMIN_ID;

function registerSellHandlers(bot, sessions) {
  // ۱. کلیک روی دکمه «🎟 فروش به ما»
  bot.hears('🎟 فروش به ما', async (ctx) => {
    try {
      const res = await pool.query('SELECT * FROM sell_products WHERE active = 1');
      const products = res.rows;

      if (products.length === 0) {
        return ctx.reply('در حال حاضر محصولی برای خرید فعال نیست.');
      }

      const buttons = products.map(p => [{ text: p.name, callback_data: `sell_prod_${p.key}` }]);
      buttons.push([{ text: '🔙 بیخیال', callback_data: 'cancel_sell' }]);

      ctx.reply('✨ کدوم محصول رو می‌خوای بفروشی؟', {
        reply_markup: { inline_keyboard: buttons }
      });
    } catch (err) {
      console.error('Error fetching sell products:', err);
      ctx.reply('خطایی رخ داد. لطفاً دوباره تلاش کنید.');
    }
  });

  // ۲. انتخاب محصول فروش
  bot.action(/^sell_prod_(.+)$/, async (ctx) => {
    ctx.answerCbQuery();
    const productKey = ctx.match[1];

    try {
      const res = await pool.query('SELECT * FROM sell_products WHERE key = $1', [productKey]);
      const product = res.rows[0];

      if (!product) {
        return ctx.reply('محصول یافت نشد.');
      }

      sessions[ctx.from.id] = {
        step: 'awaiting_voucher_code',
        productKey: product.key,
        productName: product.name
      };

      const priceStr = Number(product.unit_price).toLocaleString('fa-IR');
      const sample = product.sample_code || '---';

      let msg = `💸 *فروش ${product.name}*\n\n`;
      msg += `♻️ *قیمت واحد:* ${priceStr} تومان\n\n`;
      msg += `🎫 *نمونه کد صحیح:*\n\`${sample}\`\n`;
      msg += `〰️〰️〰️〰️〰️〰️〰️〰️〰️〰️〰️〰️〰️〰️\n`;
      msg += `▫️ *لطفاً کد ووچر را وارد کنید:*`;

      ctx.replyWithMarkdown(msg, {
        reply_markup: {
          inline_keyboard: [[{ text: '🔙 بیخیال', callback_data: 'cancel_sell' }]]
        }
      });
    } catch (err) {
      console.error('Error selecting sell product:', err);
    }
  });

  // ۳. انصراف از فروش
  bot.action('cancel_sell', (ctx) => {
    ctx.answerCbQuery();
    delete sessions[ctx.from.id];
    ctx.reply('عملیات فروش لغو شد.');
  });

  // ۴. دریافت کد ووچر از کاربر و ارسال اعلان به ادمین
  bot.on('text', async (ctx, next) => {
    const session = sessions[ctx.from.id];

    if (!session || session.step !== 'awaiting_voucher_code') {
      return next();
    }

    const text = ctx.message.text.trim();

    if (text.startsWith('/') || ['🎟 خرید ووچر', '🎟 فروش به ما', '👛 کیف پول', '📊 تراکنش‌ها', '📞 پشتیبانی', '❓ راهنما'].includes(text)) {
      delete sessions[ctx.from.id];
      return next();
    }

    const voucherCode = text;
    const trackingCode = 'SELL-' + Math.floor(100000 + Math.random() * 900000);
    const now = new Date().toISOString();

    try {
      const insertRes = await pool.query(
        'INSERT INTO sell_orders (telegram_id, product_type, voucher_code, status, created_at, tracking_code) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [String(ctx.from.id), session.productKey, voucherCode, 'pending', now, trackingCode]
      );

      const orderId = insertRes.rows[0].id;
      delete sessions[ctx.from.id];

      let userMsg = `✅ *کد ووچر شما با موفقیت دریافت شد!*\n\n`;
      userMsg += `📦 *محصول:* ${session.productName}\n`;
      userMsg += `🎫 *کد:* \`${voucherCode}\`\n`;
      userMsg += `🔢 *کد پیگیری:* \`${trackingCode}\`\n\n`;
      userMsg += `⏳ کد شما برای بخش مالی ارسال شد. پس از بررسی، مبلغ به کیف پول شما اضافه خواهد شد.`;

      await ctx.replyWithMarkdown(userMsg);

      if (ADMIN_ID) {
        let adminMsg = `📥 *درخواست فروش جدید (کد #${orderId})*\n\n`;
        adminMsg += `👤 *کاربر:* [${ctx.from.first_name}](tg://user?id=${ctx.from.id}) (\`${ctx.from.id}\`)\n`;
        adminMsg += `📦 *محصول:* ${session.productName}\n`;
        adminMsg += `🎫 *کد ووچر:* \`${voucherCode}\`\n`;
        adminMsg += `🔢 *کد پیگیری:* \`${trackingCode}\`\n`;

        await bot.telegram.sendMessage(ADMIN_ID, adminMsg, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ تایید و شارژ', callback_data: `approve_sell_${orderId}` },
                { text: '❌ رد درخواست', callback_data: `reject_sell_${orderId}` }
              ]
            ]
          }
        });
      }

    } catch (err) {
      console.error('Error saving sell order:', err);
      ctx.reply('❌ در ثبت درخواست خطایی رخ داد. لطفاً مجدداً تلاش کنید.');
    }
  });
}

module.exports = { registerSellHandlers };
