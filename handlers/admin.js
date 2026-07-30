const { pool } = require('../db'); // اصلاح آدرس دیتابیس

function registerAdminCommands(bot, sessions) {
  
  // ۱. کلیک ادمین روی تایید سفارش فروش
  bot.action(/^approve_sell_(\d+)$/, async (ctx) => {
    ctx.answerCbQuery();
    const orderId = ctx.match[1];

    try {
      const res = await pool.query('SELECT * FROM sell_orders WHERE id = $1', [orderId]);
      const order = res.rows[0];

      if (!order) {
        return ctx.reply('درخواست یافت نشد.');
      }

      if (order.status !== 'pending') {
        return ctx.reply(`این درخواست قبلاً تعیین تکلیف شده است (وضعیت: ${order.status}).`);
      }

      sessions[ctx.from.id] = {
        step: 'awaiting_admin_charge_amount',
        orderId: order.id,
        userTelegramId: order.telegram_id,
        trackingCode: order.tracking_code
      };

      ctx.reply(`💵 لطفاً مبلغ خالص شارژ (به تومان) را برای کاربر وارد کنید:\nکد پیگیری: ${order.tracking_code}`);

    } catch (err) {
      console.error('Error approving sell order:', err);
    }
  });

  // ۲. کلیک ادمین روی رد سفارش فروش
  bot.action(/^reject_sell_(\d+)$/, async (ctx) => {
    ctx.answerCbQuery();
    const orderId = ctx.match[1];

    try {
      const res = await pool.query('SELECT * FROM sell_orders WHERE id = $1', [orderId]);
      const order = res.rows[0];

      if (!order || order.status !== 'pending') {
        return ctx.reply('درخواست یافت نشد یا قبلاً بررسی شده است.');
      }

      await pool.query('UPDATE sell_orders SET status = $1 WHERE id = $2', ['rejected', orderId]);

      try {
        await bot.telegram.sendMessage(
          order.telegram_id,
          `❌ *درخواست فروش شما رد شد.*\n\n🔢 کد پیگیری: \`${order.tracking_code}\`\nلطفاً از صحت کد ووچر خود مطمئن شوید یا با پشتیبانی تماس بگیرید.`,
          { parse_mode: 'Markdown' }
        );
      } catch (e) {}

      ctx.reply(`❌ درخواست #${orderId} رد شد و به کاربر اطلاع داده شد.`);

    } catch (err) {
      console.error('Error rejecting sell order:', err);
    }
  });

  // ۳. دریافت مبلغ خالص شارژ از ادمین و اعمال آن در کیف پول کاربر
  bot.on('text', async (ctx, next) => {
    const session = sessions[ctx.from.id];

    if (!session || session.step !== 'awaiting_admin_charge_amount') {
      return next();
    }

    const amountInput = parseInt(ctx.message.text.trim());

    if (isNaN(amountInput) || amountInput <= 0) {
      return ctx.reply('لطفاً یک عدد معتبر به تومان وارد کنید:');
    }

    try {
      await pool.query('UPDATE sell_orders SET status = $1, amount = $2 WHERE id = $3', ['approved', amountInput, session.orderId]);
      await pool.query('UPDATE users SET balance = balance + $1 WHERE telegram_id = $2', [amountInput, session.userTelegramId]);

      delete sessions[ctx.from.id];
      const formattedAmount = amountInput.toLocaleString('fa-IR');

      ctx.reply(`✅ سفارش #${session.orderId} تایید شد و مبلغ ${formattedAmount} تومان به کیف پول کاربر اضافه گردید.`);

      try {
        await bot.telegram.sendMessage(
          session.userTelegramId,
          `🎉 *فروش ووچر تایید شد!*\n\n💰 مبلغ *${formattedAmount} تومان* به کیف پول شما اضافه شد.\n🔢 کد پیگیری: \`${session.trackingCode}\``,
          { parse_mode: 'Markdown' }
        );
      } catch (e) {}

    } catch (err) {
      console.error('Error applying admin charge:', err);
      ctx.reply('خطایی در شارژ کیف پول کاربر رخ داد.');
    }
  });
}

module.exports = { registerAdminCommands };
