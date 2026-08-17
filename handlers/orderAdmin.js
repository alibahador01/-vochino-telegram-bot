// handlers/orderAdmin.js
// مدیریت سفارشات خرید و فروش توسط ادمین (تحویل خرید، تأیید/رد فروش و واریز به کیف پول)
const { sessions } = require('../utils');
const { pool, getUser, getSellProductByKey } = require('../db');
const { ADMIN_IDS } = require('../constants');
const { calculateSellPayout } = require('../exchangeEngine');

function isAdmin(telegramId) {
  return ADMIN_IDS.includes(Number(telegramId));
}

module.exports = function registerOrderAdminHandlers(bot) {

  bot.action('admin_buy_pending', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    const pending = (await pool.query("SELECT * FROM orders WHERE status='pending_delivery' ORDER BY id ASC")).rows;
    if (pending.length === 0) return ctx.reply('✅ سفارش خریدی در انتظار نیست.');
    for (const o of pending) {
      const u = await getUser(o.telegram_id);
      const p = (await pool.query('SELECT name FROM products WHERE key=$1', [o.product_type])).rows[0]?.name || o.product_type;
      let msg = `📦 خرید ${p}\n👤 ${u?.full_name||'---'}\n💰 ${Number(o.amount).toLocaleString()} تومان\n🆔 ${o.tracking_code}`;
      ctx.reply(msg, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📤 تحویل', callback_data: 'admin_deliver_' + o.id }],
            [{ text: '✅ تکمیل دستی', callback_data: 'admin_buy_complete_' + o.id }, { text: '❌ لغو', callback_data: 'admin_buy_cancel_' + o.id }]
          ]
        }
      });
    }
  });

  bot.action(/^admin_deliver_(\d+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const orderId = ctx.match[1]; ctx.answerCbQuery();
    const order = (await pool.query('SELECT * FROM orders WHERE id=$1', [orderId])).rows[0];
    if (!order) return ctx.reply('سفارش یافت نشد.');
    sessions[ctx.from.id] = { flow: 'admin_deliver_code', step: 'waiting_code', data: { orderId, telegramId: order.telegram_id, trackingCode: order.tracking_code } };
    ctx.reply('کد تحویل را وارد کنید:');
  });

  bot.action(/^admin_buy_complete_(\d+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const orderId = ctx.match[1];
    await pool.query("UPDATE orders SET status='completed' WHERE id=$1", [orderId]);
    ctx.answerCbQuery('✅ تکمیل شد'); ctx.reply('✅ سفارش تکمیل شد.');
  });

  bot.action(/^admin_buy_cancel_(\d+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const orderId = ctx.match[1];
    const o = (await pool.query('SELECT * FROM orders WHERE id=$1', [orderId])).rows[0];
    if (!o) return;
    const refund = Number(o.amount) + Number(o.commission || 0);
    await pool.query('UPDATE users SET balance = balance + $1 WHERE telegram_id = $2', [refund, o.telegram_id]);
    await pool.query("UPDATE orders SET status='cancelled' WHERE id=$1", [orderId]);
    ctx.telegram.sendMessage(o.telegram_id, `❌ سفارش لغو شد. ${refund.toLocaleString()} تومان بازگشت.`);
    ctx.answerCbQuery('✅ لغو شد'); ctx.reply('✅ سفارش لغو شد.');
  });

  bot.action('admin_sell_pending', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    const pending = (await pool.query("SELECT * FROM sell_orders WHERE status='pending_review' ORDER BY id ASC")).rows;
    if (pending.length === 0) return ctx.reply('✅ درخواست فروشی در انتظار نیست.');
    for (const s of pending) {
      const u = await getUser(s.telegram_id);
      const p = (await pool.query('SELECT name FROM sell_products WHERE key=$1', [s.product_type])).rows[0]?.name || s.product_type;
      let msg = `🎟 فروش ${p}\n👤 ${u?.full_name||'---'}\n🎫 ${s.voucher_code}\n🆔 ${s.tracking_code}`;
      ctx.reply(msg, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ تایید', callback_data: 'admin_sell_approve_' + s.id }],
            [{ text: '❌ رد', callback_data: 'admin_sell_reject_' + s.id }, { text: '✉️ رد با دلیل', callback_data: 'admin_sell_reject_reason_' + s.id }]
          ]
        }
      });
    }
  });

  bot.action(/^admin_sell_approve_(\d+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const requestId = ctx.match[1]; ctx.answerCbQuery();
    sessions[ctx.from.id] = { flow: 'admin_sell_amount', step: 'waiting_amount', data: { requestId } };
    ctx.reply('💰 مبلغ پایه (ارزش واقعی/تأیید‌شده ووچر به تومان) را وارد کنید — کارمزد تنظیم‌شده در پنل به‌صورت خودکار از آن کسر و مبلغ نهایی به کاربر واریز می‌شود:');
  });

  bot.action(/^admin_sell_reject_(\d+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    await pool.query("UPDATE sell_orders SET status='rejected' WHERE id=$1", [ctx.match[1]]);
    ctx.answerCbQuery('❌ رد شد'); ctx.reply('❌ رد شد.');
  });

  bot.action(/^admin_sell_reject_reason_(\d+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const requestId = ctx.match[1]; ctx.answerCbQuery();
    sessions[ctx.from.id] = { flow: 'admin_sell_reject_reason', step: 'waiting_reason', data: { requestId } };
    ctx.reply('دلیل رد را بنویسید:');
  });

  bot.on('text', async (ctx, next) => {
    const session = sessions[ctx.from.id];
    if (!session) return next();

    if (session.flow === 'admin_deliver_code' && session.step === 'waiting_code') {
      const deliveredCode = ctx.message.text.trim();
      const { orderId, telegramId, trackingCode } = session.data;
      await pool.query("UPDATE orders SET status='completed', delivered_code=$1 WHERE id=$2", [deliveredCode, orderId]);
      ctx.telegram.sendMessage(telegramId, `🎉 سفارش تحویل داده شد!\n🆔 ${trackingCode}\n📦 کد:\n${deliveredCode}`);
      delete sessions[ctx.from.id];
      ctx.reply('✅ تحویل شد.');
      return;
    }

    if (session.flow === 'admin_sell_reject_reason' && session.step === 'waiting_reason') {
      const reason = ctx.message.text;
      const requestId = session.data.requestId;
      await pool.query("UPDATE sell_orders SET status='rejected' WHERE id=$1", [requestId]);
      const req = (await pool.query('SELECT * FROM sell_orders WHERE id=$1', [requestId])).rows[0];
      ctx.telegram.sendMessage(req.telegram_id, `❌ فروش رد شد.\n🆔 ${req.tracking_code}\n📝 ${reason}`);
      delete sessions[ctx.from.id];
      ctx.reply('✅ رد شد.');
      return;
    }

    if (session.flow === 'admin_sell_amount' && session.step === 'waiting_amount') {
      const baseAmount = parseInt(ctx.message.text.replace(/[^0-9]/g, ''));
      if (!baseAmount || baseAmount <= 0) return ctx.reply('⚠️ مبلغ نامعتبر.');
      const requestId = session.data.requestId;
      const req = (await pool.query('SELECT * FROM sell_orders WHERE id=$1', [requestId])).rows[0];
      if (!req || req.status !== 'pending_review') { delete sessions[ctx.from.id]; return ctx.reply('❌ این درخواست قبلاً بررسی شده.'); }
      const sellProduct = await getSellProductByKey(req.product_type);
      const { commission, payout } = calculateSellPayout(baseAmount, sellProduct || { commission_type: 'none', commission_value: 0 });
      await pool.query('UPDATE users SET balance = balance + $1 WHERE telegram_id = $2', [payout, req.telegram_id]);
      await pool.query("UPDATE sell_orders SET status='approved', amount=$1, commission=$2, fulfillment_mode='manual' WHERE id=$3", [payout, commission, requestId]);
      ctx.telegram.sendMessage(req.telegram_id,
        `✅ فروش تأیید شد.\n💰 مبلغ پایه: ${baseAmount.toLocaleString()} تومان\n💳 کارمزد: ${commission.toLocaleString()} تومان\n💵 واریز به کیف پول: ${payout.toLocaleString()} تومان`
      );
      delete sessions[ctx.from.id];
      ctx.reply(`✅ تأیید شد.\nپایه: ${baseAmount.toLocaleString()} | کارمزد: ${commission.toLocaleString()} | واریزی: ${payout.toLocaleString()}`);
      return;
    }

    return next();
  });
};
