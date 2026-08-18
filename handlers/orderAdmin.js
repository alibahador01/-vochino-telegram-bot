// handlers/orderAdmin.js
// مدیریت سفارشات خرید و فروش توسط ادمین (تحویل خرید با کد+هش، تأیید/رد فروش با کارمزد خودکار)
const { sessions } = require('../utils');
const { pool, getUser, getSellProductByKey } = require('../db');
const { ADMIN_IDS } = require('../constants');
const { calculateSellPayout } = require('../exchangeEngine');
const R = require('./receipts');

function isAdmin(telegramId) {
  return ADMIN_IDS.includes(Number(telegramId));
}

module.exports = function registerOrderAdminHandlers(bot) {

  // ==================== سفارش‌های خرید در انتظار ====================
  bot.action('admin_buy_pending', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    const pending = (await pool.query("SELECT * FROM orders WHERE status='pending_delivery' ORDER BY id ASC")).rows;
    if (pending.length === 0) return ctx.reply('✅ سفارش خریدی در انتظار نیست.');
    for (const o of pending) {
      const u = await getUser(o.telegram_id);
      const p = (await pool.query('SELECT name FROM products WHERE key=$1', [o.product_type])).rows[0]?.name || o.product_type;
      let msg = `📦 خرید ${p}\n👤 ${u?.full_name || '---'}\n📱 ${u?.phone || '---'}\n💳 ${u?.card_number || '---'}\n💰 ${Number(o.amount).toLocaleString()} تومان\n🆔 ${o.tracking_code}`;
      ctx.reply(msg, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🎟 تحویل ووچر', callback_data: 'admin_deliver_' + o.id }],
            [{ text: '❌ رد سفارش', callback_data: 'admin_buy_cancel_' + o.id }]
          ]
        }
      });
    }
  });

  bot.action(/^admin_deliver_(\d+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const orderId = ctx.match[1]; ctx.answerCbQuery();
    const order = (await pool.query('SELECT * FROM orders WHERE id=$1', [orderId])).rows[0];
    if (!order) return ctx.reply('⚠️ سفارش یافت نشد.');
    if (order.status !== 'pending_delivery') return ctx.reply('⚠️ این سفارش قبلاً تعیین تکلیف شده.');
    sessions[ctx.from.id] = { flow: 'admin_deliver_code', step: 'waiting_code', data: { orderId } };
    ctx.reply('🎟 کد ووچر را وارد کنید:');
  });

  bot.action(/^admin_buy_cancel_(\d+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const orderId = ctx.match[1]; ctx.answerCbQuery();
    const o = (await pool.query('SELECT * FROM orders WHERE id=$1', [orderId])).rows[0];
    if (!o) return ctx.reply('⚠️ سفارش یافت نشد.');
    if (o.status !== 'pending_delivery') return ctx.reply('⚠️ این سفارش قبلاً تعیین تکلیف شده.');
    const refund = Number(o.amount) || 0;
    await pool.query('UPDATE users SET balance = balance + $1 WHERE telegram_id = $2', [refund, o.telegram_id]);
    await pool.query("UPDATE orders SET status='cancelled' WHERE id=$1", [orderId]);
    const p = (await pool.query('SELECT name FROM products WHERE key=$1', [o.product_type])).rows[0]?.name || o.product_type;
    const u = await getUser(o.telegram_id);
    try {
      await ctx.telegram.sendMessage(o.telegram_id, R.buildBuyReceipt({
        productName: p, base: Number(o.amount) - Number(o.commission || 0), commission: Number(o.commission || 0),
        status: 'failed', tracking: o.tracking_code, createdAt: new Date(), reason: 'سفارش توسط پشتیبانی رد شد و مبلغ به کیف پول بازگشت.'
      }));
    } catch (e) {}
    ctx.reply('✅ سفارش لغو شد و مبلغ بازگشت.');
  });

  // ==================== سفارش‌های فروش در انتظار ====================
  bot.action('admin_sell_pending', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    const pending = (await pool.query("SELECT * FROM sell_orders WHERE status='pending_review' ORDER BY id ASC")).rows;
    if (pending.length === 0) return ctx.reply('✅ درخواست فروشی در انتظار نیست.');
    for (const s of pending) {
      const u = await getUser(s.telegram_id);
      const p = (await pool.query('SELECT name FROM sell_products WHERE key=$1', [s.product_type])).rows[0]?.name || s.product_type;
      let msg = `🎟 فروش ${p}\n👤 ${u?.full_name || '---'}\n📱 ${u?.phone || '---'}\n💳 ${u?.card_number || '---'}\n🎫 کد ووچر مشتری (قابل کپی):\n\`${s.voucher_code}\`\n🆔 ${s.tracking_code}`;
      ctx.reply(msg, {
        parse_mode: 'Markdown',
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
    const requestId = ctx.match[1];
    const req = (await pool.query('SELECT * FROM sell_orders WHERE id=$1', [requestId])).rows[0];
    if (!req) { ctx.answerCbQuery('⚠️ یافت نشد', { show_alert: true }); return; }
    if (req.status !== 'pending_review') { ctx.answerCbQuery('⚠️ قبلاً بررسی شده', { show_alert: true }); try { await ctx.deleteMessage(); } catch (e) {} return; }
    ctx.answerCbQuery();
    sessions[ctx.from.id] = { flow: 'admin_sell_amount', step: 'waiting_amount', data: { requestId } };
    ctx.reply('💰 مبلغ پایه (ارزش واقعی/تأیید‌شده ووچر به تومان) را وارد کنید — کارمزد تنظیم‌شده در پنل به‌صورت خودکار از آن کسر و مبلغ نهایی به کاربر واریز می‌شود:');
  });

  bot.action(/^admin_sell_reject_(\d+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const requestId = ctx.match[1];
    const req = (await pool.query('SELECT * FROM sell_orders WHERE id=$1', [requestId])).rows[0];
    if (!req) { ctx.answerCbQuery('⚠️ یافت نشد', { show_alert: true }); return; }
    if (req.status !== 'pending_review') { ctx.answerCbQuery('⚠️ قبلاً بررسی شده', { show_alert: true }); try { await ctx.deleteMessage(); } catch (e) {} return; }
    await pool.query("UPDATE sell_orders SET status='rejected' WHERE id=$1", [requestId]);
    const p = (await pool.query('SELECT name FROM sell_products WHERE key=$1', [req.product_type])).rows[0]?.name || req.product_type;
    try {
      await ctx.telegram.sendMessage(req.telegram_id, R.buildSellReceipt({
        productName: p, amount: Number(req.amount || 0), commission: 0,
        status: 'failed', tracking: req.tracking_code, createdAt: new Date(), reason: 'کد ووچر توسط پشتیبانی تأیید نشد.'
      }));
    } catch (e) {}
    ctx.answerCbQuery('❌ رد شد'); ctx.reply('✅ رد شد.');
  });

  bot.action(/^admin_sell_reject_reason_(\d+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const requestId = ctx.match[1];
    const req = (await pool.query('SELECT * FROM sell_orders WHERE id=$1', [requestId])).rows[0];
    if (!req) { ctx.answerCbQuery('⚠️ یافت نشد', { show_alert: true }); return; }
    if (req.status !== 'pending_review') { ctx.answerCbQuery('⚠️ قبلاً بررسی شده', { show_alert: true }); try { await ctx.deleteMessage(); } catch (e) {} return; }
    ctx.answerCbQuery();
    sessions[ctx.from.id] = { flow: 'admin_sell_reject_reason', step: 'waiting_reason', data: { requestId } };
    ctx.reply('✍️ دلیل رد را بنویسید:');
  });

  // ==================== ورودی‌های متنی ====================
  bot.on('text', async (ctx, next) => {
    const session = sessions[ctx.from.id];
    if (!session) return next();

    // مرحله ۱: کد ووچر خرید
    if (session.flow === 'admin_deliver_code' && session.step === 'waiting_code') {
      session.data.voucherCode = ctx.message.text.trim();
      session.step = 'waiting_hash';
      return ctx.reply('🔐 هش ووچر را وارد کنید (اگر ندارد، یک خط تیره - بفرستید):');
    }

    // مرحله ۲: هش ووچر خرید → تحویل نهایی
    if (session.flow === 'admin_deliver_code' && session.step === 'waiting_hash') {
      const hashRaw = ctx.message.text.trim();
      const voucherHash = (hashRaw === '-' || hashRaw === '—') ? null : hashRaw;
      const { orderId, voucherCode } = session.data;
      delete sessions[ctx.from.id];

      const order = (await pool.query('SELECT * FROM orders WHERE id=$1', [orderId])).rows[0];
      if (!order) return ctx.reply('⚠️ سفارش یافت نشد.');
      if (order.status !== 'pending_delivery') return ctx.reply('⚠️ این سفارش قبلاً تعیین تکلیف شده.');

      await pool.query(
        "UPDATE orders SET status='completed', delivered_code=$1, delivered_hash=$2 WHERE id=$3",
        [voucherCode, voucherHash, orderId]
      );

      const p = (await pool.query('SELECT name FROM products WHERE key=$1', [order.product_type])).rows[0]?.name || order.product_type;
      const u = await getUser(order.telegram_id);
      const base = Number(order.amount) - Number(order.commission || 0);

      try {
        await ctx.telegram.sendMessage(order.telegram_id, R.buildBuyReceipt({
          productName: p,
          base, commission: Number(order.commission || 0), paid: Number(order.amount),
          status: 'success', tracking: order.tracking_code,
          card: u ? u.card_number : null,
          voucherCode, voucherHash,
          createdAt: new Date()
        }), { parse_mode: 'Markdown' });
        ctx.reply('✅ ووچر با موفقیت تحویل داده شد و برای مشتری ارسال شد.');
      } catch (e) {
        ctx.reply('⚠️ سفارش تکمیل شد اما ارسال پیام به کاربر ناموفق بود: ' + e.message);
      }
      return;
    }

    // رد با دلیل (فروش)
    if (session.flow === 'admin_sell_reject_reason' && session.step === 'waiting_reason') {
      const reason = ctx.message.text.trim();
      const requestId = session.data.requestId;
      delete sessions[ctx.from.id];
      const req = (await pool.query('SELECT * FROM sell_orders WHERE id=$1', [requestId])).rows[0];
      if (!req) return ctx.reply('⚠️ درخواست یافت نشد.');
      if (req.status !== 'pending_review') return ctx.reply('⚠️ این درخواست قبلاً بررسی شده.');
      await pool.query("UPDATE sell_orders SET status='rejected' WHERE id=$1", [requestId]);
      const p = (await pool.query('SELECT name FROM sell_products WHERE key=$1', [req.product_type])).rows[0]?.name || req.product_type;
      try {
        await ctx.telegram.sendMessage(req.telegram_id, R.buildSellReceipt({
          productName: p, amount: Number(req.amount || 0), commission: 0,
          status: 'failed', tracking: req.tracking_code, createdAt: new Date(), reason
        }));
      } catch (e) {}
      ctx.reply('✅ رد شد و پیام دلیل برای کاربر ارسال شد.');
      return;
    }

    // فروش - ورود مبلغ پایه و کسر خودکار کارمزد
    if (session.flow === 'admin_sell_amount' && session.step === 'waiting_amount') {
      const baseAmount = parseInt(ctx.message.text.replace(/[^0-9]/g, ''), 10);
      if (!baseAmount || baseAmount <= 0) return ctx.reply('⚠️ مبلغ نامعتبر. دوباره وارد کنید:');
      const requestId = session.data.requestId;
      const req = (await pool.query('SELECT * FROM sell_orders WHERE id=$1', [requestId])).rows[0];
      if (!req || req.status !== 'pending_review') { delete sessions[ctx.from.id]; return ctx.reply('❌ این درخواست قبلاً بررسی شده.'); }

      const sellProduct = await getSellProductByKey(req.product_type);
      const { commission, payout } = calculateSellPayout(baseAmount, sellProduct || { commission_type: 'none', commission_value: 0 });

      await pool.query('UPDATE users SET balance = balance + $1 WHERE telegram_id = $2', [payout, req.telegram_id]);
      await pool.query("UPDATE sell_orders SET status='approved', amount=$1, commission=$2, fulfillment_mode='manual' WHERE id=$3", [payout, commission, requestId]);

      const p = (await pool.query('SELECT name FROM sell_products WHERE key=$1', [req.product_type])).rows[0]?.name || req.product_type;
      const u = await getUser(req.telegram_id);
      delete sessions[ctx.from.id];

      try {
        await ctx.telegram.sendMessage(req.telegram_id, R.buildSellReceipt({
          productName: p, amount: baseAmount, commission, received: payout,
          status: 'success', tracking: req.tracking_code,
          card: u ? u.card_number : null,
          newBalance: u ? Number(u.balance) : payout,
          createdAt: new Date()
        }));
        ctx.reply(`✅ تأیید شد و پیام برای کاربر ارسال شد.\nپایه: ${baseAmount.toLocaleString()} | کارمزد: ${commission.toLocaleString()} | واریزی: ${payout.toLocaleString()}`);
      } catch (e) {
        ctx.reply('⚠️ فروش تأیید شد اما ارسال پیام به کاربر ناموفق بود: ' + e.message);
      }
      return;
    }

    return next();
  });
};
