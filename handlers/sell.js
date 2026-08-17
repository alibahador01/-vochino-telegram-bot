// handlers/sell.js
const texts = require('../texts');
const { sessions, fillTemplate } = require('../utils');
const { pool, getSellProducts, getSellProductByKey, getAllAdmins } = require('../db');
const { ADMIN_IDS } = require('../constants');
const { tryAutoFulfillSell } = require('../exchangeEngine');
const R = require('./receipts');

module.exports = function registerSellHandlers(bot) {

  async function adminIdsList() {
    const ids = ADMIN_IDS.map(x => Number(x));
    try {
      const admins = await getAllAdmins();
      admins.forEach(a => { if (!ids.includes(Number(a.telegram_id))) ids.push(Number(a.telegram_id)); });
    } catch (e) {}
    return ids;
  }

  async function showSellList(ctx) {
    const products = await getSellProducts(true);
    if (products.length === 0) {
      return ctx.reply('❌ در حال حاضر هیچ محصول فروشی فعال نیست.', {
        reply_markup: { inline_keyboard: [[{ text: '🔴 بازگشت', callback_data: 'back_main_menu' }]] }
      });
    }
    const buttons = products.map(p => [{ text: p.name, callback_data: 'sell_pick_' + p.key }]);
    buttons.push([{ text: '🔴 بازگشت', callback_data: 'back_main_menu' }]);
    return ctx.reply(R.HEADER + '♨️ محصولی که می‌خواهید بفروشید را انتخاب کنید:', {
      reply_markup: { inline_keyboard: buttons }
    });
  }

  bot.action('menu_sell', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    return showSellList(ctx);
  });

  bot.action(/^sell_pick_(.+)$/, async (ctx) => {
    const key = ctx.match[1];
    ctx.answerCbQuery();
    const product = await getSellProductByKey(key);
    if (!product || !product.active) return ctx.reply('❌ این محصول فروش در دسترس نیست.');

    sessions[ctx.from.id] = {
      flow: 'sell',
      step: 'waiting_code',
      data: {
        productType: key,
        productName: product.name,
        unitPrice: Number(product.unit_price || 0)
      }
    };

    // کد نمونه برای مشتری فقط به‌صورت متن ثابت (غیرقابل کپی) نمایش داده می‌شود
    let msg = `🎟 کد ووچر ${product.name} خود را وارد کنید تا بررسی شود:`;
    if (product.sample_code) {
      msg += `\n\n📎 نمونه فرمت قابل قبول (ثابت):\n${product.sample_code}`;
    }
    // بدون parse_mode تا کد نمونه قابل کپی نباشد؛ لیست محصولات هم حذف نمی‌شود
    return ctx.reply(msg);
  });

  bot.on('text', async (ctx, next) => {
    const session = sessions[ctx.from.id];
    if (!session || session.flow !== 'sell' || session.step !== 'waiting_code') return next();

    const voucherCode = ctx.message.text.trim();
    if (voucherCode.length < 5) {
      return ctx.reply('❌ کد ووچر نامعتبر است. لطفاً یک کد صحیح وارد کنید.');
    }

    const trackingCode = 'VOC-' + Math.floor(1000000 + Math.random() * 9000000);
    const estimatedAmount = Number(session.data.unitPrice || 0);
    const productKey = session.data.productType;

    try {
      const ins = await pool.query(
        'INSERT INTO sell_orders (telegram_id, product_type, voucher_code, amount, status, created_at, tracking_code) VALUES ($1, $2, $3, $4, $5, NOW(), $6) RETURNING id',
        [String(ctx.from.id), productKey, voucherCode, estimatedAmount, 'pending_review', trackingCode]
      );
      const orderId = ins.rows[0].id;

      delete sessions[ctx.from.id];

      ctx.reply(
        `✅ کد ووچر شما ثبت شد و در صف بررسی قرار گرفت.\n\n` +
        `🛍 محصول: ${session.data.productName}\n` +
        `📍 کد پیگیری: \`${trackingCode}\`\n\n` +
        `⏳ پس از بررسی توسط پشتیبانی، نتیجه و فاکتور برای شما ارسال می‌شود.`,
        { parse_mode: 'Markdown' }
      );

      // تلاش برای تأیید و تسویه خودکار از طریق صرافی متصل — فقط اگر حالت API «خودکار» باشد؛
      // در غیر این صورت (پیش‌فرض فعلی) درخواست دقیقاً مثل قبل برای بررسی دستی ادمین می‌ماند.
      let autoResult = { executed: false };
      try {
        const product = await getSellProductByKey(productKey);
        autoResult = await tryAutoFulfillSell(
          { sellOrderId: orderId, telegramId: ctx.from.id, productKey, amount: estimatedAmount, product, trackingCode, voucherCode },
          bot
        );
      } catch (e) { console.error('خطا در اجرای خودکار سفارش فروش:', e.message); }

      if (autoResult.executed) return; // کاربر و لاگ قبلاً داخل exchangeEngine مطلع شدند

      // برای ادمین: یک پیام واحد با کد ووچر مشتری و دکمه‌های تأیید/رد
      const ids = await adminIdsList();
      for (const id of ids) {
        try {
          await ctx.telegram.sendMessage(id,
            `♨️ سفارش فروش جدید\n` +
            `👤 کاربر: ${ctx.from.id}\n` +
            `🛍 محصول: ${session.data.productName}\n` +
            `🎟 کد ووچر مشتری (قابل کپی):\n\`${voucherCode}\`\n` +
            `📍 کد پیگیری: ${trackingCode}`,
            {
              parse_mode: 'Markdown',
              reply_markup: { inline_keyboard: [[{ text: '💰 بررسی و تأیید', callback_data: `admin_sell_approve_${orderId}` }, { text: '❌ رد', callback_data: `admin_sell_reject_${orderId}` }]] }
            }
          );
        } catch (e) { console.error('خطا در اطلاع فروش به ادمین:', e.message); }
      }
    } catch (err) {
      console.error('خطا در ثبت سفارش فروش:', err);
      ctx.reply('❌ خطایی رخ داد. لطفاً دوباره تلاش کنید.');
      delete sessions[ctx.from.id];
    }
  });
};
