// handlers/orderAdmin.js
// جریان‌های اصلاح‌شده پنل ادمین:
// - بررسی واریز/برداشت با اطلاعات کامل مشتری
// - تحویل ووچر (کد + هش + پیام دلخواه)
// - تأیید/رد فروش با کدهای قابل کپی
// - احراز هویت در لیست درخواست‌ها
const { sessions } = require('../utils');
const { pool, getUser, getAllAdmins, getAdmin, logTransaction } = require('../db');
const { ADMIN_IDS } = require('../constants');
const R = require('./receipts');
const { checkAndGrantBonuses } = require('./bonusEngine');

module.exports = function registerOrderAdminHandlers(bot) {

  // migration خودکار داخل کد (بدون دستور دستی)
  pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS reject_reason TEXT').catch(() => {});
  pool.query('ALTER TABLE sell_orders ADD COLUMN IF NOT EXISTS reject_reason TEXT').catch(() => {});
  pool.query('ALTER TABLE wallet_requests ADD COLUMN IF NOT EXISTS reject_reason TEXT').catch(() => {});

  async function isAdminUser(id) {
    if (ADMIN_IDS.includes(Number(id))) return true;
    try { const a = await getAdmin(id); return !!a; } catch (e) { return false; }
  }

  const backPanel = { reply_markup: { inline_keyboard: [[{ text: '🔴 بازگشت', callback_data: 'menu_admin_panel' }]] } };

  // ==================== درخواست‌های کیف پول (واریز/برداشت) ====================
  bot.action('admin_pending', async (ctx) => {
    if (!(await isAdminUser(ctx.from.id))) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    const res = await pool.query(`SELECT * FROM wallet_requests WHERE status = 'pending' ORDER BY created_at DESC LIMIT 10`);
    if (res.rows.length === 0) {
      return ctx.reply('✅ هیچ درخواست کیف پول در انتظاری وجود ندارد.', backPanel);
    }
    const buttons = res.rows.map(r => [{
      text: `${r.type === 'deposit' ? '📥 واریز' : '📤 برداشت'} | 💰 ${Number(r.amount).toLocaleString('en-US')} | 👤 ${r.telegram_id}\n📍 ${r.tracking_code}`,
      callback_data: `wr_open:${r.id}`
    }]);
    buttons.push([{ text: '🔴 بازگشت', callback_data: 'menu_admin_panel' }]);
    ctx.reply('💰 **درخواست‌های در انتظار کیف پول:**', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } });
  });

  bot.action(/^wr_open:(\d+)$/, async (ctx) => {
    if (!(await isAdminUser(ctx.from.id))) return;
    ctx.answerCbQuery();
    const id = parseInt(ctx.match[1], 10);
    const res = await pool.query('SELECT * FROM wallet_requests WHERE id = $1', [id]);
    if (res.rows.length === 0) return ctx.reply('⚠️ درخواست یافت نشد.');
    const r = res.rows[0];
    if (r.status !== 'pending') return ctx.reply('⚠️ این درخواست قبلاً بررسی شده است.');

    const user = await getUser(r.telegram_id);
    const caption =
      `🧾 جزئیات درخواست کیف پول\n\n` +
      `👤 آیدی: ${r.telegram_id}\n` +
      `👤 نام و نام خانوادگی: ${user ? (user.full_name || 'ثبت نشده') : 'ثبت نشده'}\n` +
      `📱 شماره تلفن: ${user ? (user.phone || 'ثبت نشده') : 'ثبت نشده'}\n` +
      `💳 شماره کارت: ${r.card_number || (user ? user.card_number : '---')}\n` +
      `🧾 نوع: ${r.type === 'deposit' ? 'واریز (شارژ)' : 'برداشت'}\n` +
      `💰 مبلغ: ${Number(r.amount).toLocaleString('en-US')} تومان\n` +
      `📍 کد پیگیری: ${r.tracking_code}\n` +
      `🕐 ${R.formatDateTime(r.created_at)}`;
    const kb = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ تأیید', callback_data: `wrok:${id}` }, { text: '❌ رد', callback_data: `wrno:${id}` }]
        ]
      }
    };
    if (r.receipt_file_id) {
      return ctx.telegram.sendPhoto(ctx.from.id, r.receipt_file_id, { caption, reply_markup: kb.reply_markup }).catch(() => ctx.reply(caption, kb));
    }
    return ctx.reply(caption, kb);
  });

  bot.action(/^wrok:(\d+)$/, async (ctx) => {
    if (!(await isAdminUser(ctx.from.id))) return ctx.answerCbQuery('⛔', { show_alert: true });
    ctx.answerCbQuery();
    const id = parseInt(ctx.match[1], 10);
    const res = await pool.query('SELECT * FROM wallet_requests WHERE id = $1', [id]);
    if (res.rows.length === 0) return ctx.reply('⚠️ درخواست یافت نشد.');
    const r = res.rows[0];
    if (r.status !== 'pending') return ctx.reply('⚠️ این درخواست قبلاً بررسی شده است.');
    const user = await getUser(r.telegram_id);

    if (r.type === 'deposit') {
      await pool.query(`UPDATE wallet_requests SET status = 'approved' WHERE id = $1`, [id]);
      await pool.query('UPDATE users SET balance = balance + $1 WHERE telegram_id = $2', [Number(r.amount), r.telegram_id]);
      try { await logTransaction(r.telegram_id, 'deposit', Number(r.amount), 'شارژ کیف پول'); } catch (e) {}
      const after = await getUser(r.telegram_id);
      try {
        await ctx.telegram.sendMessage(r.telegram_id, R.buildDepositReceipt({ amount: Number(r.amount), status: 'success', tracking: r.tracking_code, newBalance: after ? after.balance : 0, createdAt: new Date() }));
      } catch (e) {}
      try { await ctx.deleteMessage(); } catch (e) {}
      return ctx.reply('✅ واریز تأیید شد و رسید برای کاربر ارسال شد.');
    }

    // برداشت
    if (!user || Number(user.balance) < Number(r.amount)) {
      await pool.query(`UPDATE wallet_requests SET status = 'rejected', reject_reason = $1 WHERE id = $2`, ['موجودی کیف پول کافی نیست.', id]);
      try {
        await ctx.telegram.sendMessage(r.telegram_id, R.buildWithdrawReceipt({ amount: Number(r.amount), commission: 0, status: 'failed', tracking: r.tracking_code, createdAt: new Date(), reason: 'موجودی کیف پول کافی نیست.' }));
      } catch (e) {}
      try { await ctx.deleteMessage(); } catch (e) {}
      return ctx.reply('❌ موجودی کاربر کافی نبود؛ درخواست به‌صورت خودکار رد شد.');
    }
    await pool.query(`UPDATE wallet_requests SET status = 'approved' WHERE id = $1`, [id]);
    await pool.query('UPDATE users SET balance = balance - $1 WHERE telegram_id = $2', [Number(r.amount), r.telegram_id]);
    try { await logTransaction(r.telegram_id, 'withdraw', -Number(r.amount), 'برداشت از کیف پول'); } catch (e) {}
    const after = await getUser(r.telegram_id);
    try {
      await ctx.telegram.sendMessage(r.telegram_id, R.buildWithdrawReceipt({ amount: Number(r.amount), commission: 0, net: Number(r.amount), status: 'success', tracking: r.tracking_code, card: r.card_number, newBalance: after ? after.balance : 0, createdAt: new Date() }));
    } catch (e) {}
    try { await ctx.deleteMessage(); } catch (e) {}
    return ctx.reply('✅ برداشت تأیید شد، مبلغ از کیف کاربر کم شد و رسید ارسال شد. حالا به کارت کاربر واریز کن.');
  });

  bot.action(/^wrno:(\d+)$/, async (ctx) => {
    if (!(await isAdminUser(ctx.from.id))) return ctx.answerCbQuery('⛔', { show_alert: true });
    ctx.answerCbQuery();
    const id = parseInt(ctx.match[1], 10);
    try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'wr_reject', step: 'waiting_reason', data: { id } };
    return ctx.reply('❌ دلیل رد این درخواست را بنویسید (همین متن در رسید کاربر نمایش داده می‌شود):');
  });

  // ==================== سفارش‌های خرید (تحویل ووچر: کد + هش + پیام دلخواه) ====================
  bot.action('admin_buy_pending', async (ctx) => {
    if (!(await isAdminUser(ctx.from.id))) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    const res = await pool.query(
      `SELECT o.id, o.amount, o.tracking_code, o.created_at, p.name AS product_name,
              u.full_name, u.phone, u.card_number
       FROM orders o
       LEFT JOIN products p ON o.product_type = p.key
       LEFT JOIN users u ON o.telegram_id = u.telegram_id
       WHERE o.status IN ('pending_delivery', 'pending') ORDER BY o.created_at DESC LIMIT 10`);
    if (res.rows.length === 0) return ctx.reply('✅ هیچ سفارش خرید در انتظاری وجود ندارد.', backPanel);
    const buttons = res.rows.map(r => [{
      text: `🛍 ${r.product_name || r.product_type}\n💰 ${Number(r.amount).toLocaleString('en-US')} | 👤 ${r.full_name || r.telegram_id}\n📍 ${r.tracking_code}`,
      callback_data: `buyopen:${r.id}`
    }]);
    buttons.push([{ text: '🔴 بازگشت', callback_data: 'menu_admin_panel' }]);
    ctx.reply('🛒 **سفارش‌های خرید در انتظار تحویل:**', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } });
  });

  bot.action(/^buyopen:(\d+)$/, async (ctx) => {
    if (!(await isAdminUser(ctx.from.id))) return;
    ctx.answerCbQuery();
    const id = parseInt(ctx.match[1], 10);
    const res = await pool.query(
      `SELECT o.*, p.name AS product_name, u.full_name, u.phone, u.card_number
       FROM orders o
       LEFT JOIN products p ON o.product_type = p.key
       LEFT JOIN users u ON o.telegram_id = u.telegram_id
       WHERE o.id = $1`, [id]);
    if (res.rows.length === 0) return ctx.reply('⚠️ سفارش یافت نشد.');
    const o = res.rows[0];
    if (!['pending_delivery', 'pending'].includes(o.status)) return ctx.reply('⚠️ این سفارش قبلاً تعیین تکلیف شده.');
    const msg =
      `🛒 جزئیات سفارش خرید\n\n` +
      `👤 آیدی مشتری: ${o.telegram_id}\n` +
      `👤 نام و نام خانوادگی: ${o.full_name || 'ثبت نشده'}\n` +
      `📱 شماره تلفن: ${o.phone || 'ثبت نشده'}\n` +
      `💳 شماره کارت: ${o.card_number || 'ثبت نشده'}\n` +
      `🛍 محصول: ${o.product_name || o.product_type}\n` +
      `💰 مبلغ پرداختی: ${Number(o.amount).toLocaleString('en-US')} تومان\n` +
      `💳 کارمزد: ${Number(o.commission || 0).toLocaleString('en-US')} تومان\n` +
      `📍 کد پیگیری: ${o.tracking_code}\n` +
      `🕐 ${R.formatDateTime(o.created_at)}`;
    ctx.reply(msg, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🎟 تحویل ووچر', callback_data: `buydel:${id}` }, { text: '❌ رد سفارش', callback_data: `buyno:${id}` }]
        ]
      }
    });
  });

  bot.action(/^buydel:(\d+)$/, async (ctx) => {
    if (!(await isAdminUser(ctx.from.id))) return;
    ctx.answerCbQuery();
    const id = parseInt(ctx.match[1], 10);
    try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'buy_deliver', step: 'waiting_code', data: { id } };
    return ctx.reply('🎟 کد ووچر را برای این سفارش وارد کنید:');
  });

  bot.action(/^buyno:(\d+)$/, async (ctx) => {
    if (!(await isAdminUser(ctx.from.id))) return;
    ctx.answerCbQuery();
    const id = parseInt(ctx.match[1], 10);
    try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'buy_reject', step: 'waiting_reason', data: { id } };
    return ctx.reply('❌ دلیل رد این سفارش خرید را بنویسید (برای کاربر ارسال می‌شود و مبلغ به‌صورت خودکار بازگشت وجه می‌شود):');
  });

  // ==================== سفارش‌های فروش ====================
  bot.action('admin_sell_pending', async (ctx) => {
    if (!(await isAdminUser(ctx.from.id))) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    const res = await pool.query(
      `SELECT s.id, s.amount, s.voucher_code, s.tracking_code, s.created_at, sp.name AS product_name,
              u.full_name, u.phone, u.card_number
       FROM sell_orders s
       LEFT JOIN sell_products sp ON s.product_type = sp.key
       LEFT JOIN users u ON s.telegram_id = u.telegram_id
       WHERE s.status = 'pending_review' ORDER BY s.created_at DESC LIMIT 10`);
    if (res.rows.length === 0) return ctx.reply('✅ هیچ سفارش فروش در انتظاری وجود ندارد.', backPanel);
    for (const r of res.rows) {
      await ctx.reply(
        `♨️ ${r.product_name || r.product_type}\n👤 ${r.full_name || r.telegram_id}\n🎟 کد: \`${r.voucher_code}\`\n📍 ${r.tracking_code}`,
        { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '✅ تأیید و واریز', callback_data: `selok:${r.id}` }, { text: '❌ رد', callback_data: `selno:${r.id}` }]] } }
      );
    }
  });

  // تأیید مستقیم فروش با یک تپ: مبلغ و کارمزد به‌صورت خودکار از روی تنظیمات محصول محاسبه می‌شود
  bot.action(/^selok:(\d+)$/, async (ctx) => {
    if (!(await isAdminUser(ctx.from.id))) return ctx.answerCbQuery('⛔', { show_alert: true });
    ctx.answerCbQuery();
    const id = parseInt(ctx.match[1], 10);
    const res = await pool.query(
      `SELECT s.*, sp.name AS product_name, sp.commission_type, sp.commission_value FROM sell_orders s LEFT JOIN sell_products sp ON s.product_type = sp.key WHERE s.id = $1`, [id]);
    if (res.rows.length === 0) return ctx.reply('⚠️ سفارش یافت نشد.');
    const s = res.rows[0];
    if (s.status !== 'pending_review') { try { await ctx.deleteMessage(); } catch (e) {} return ctx.reply('⚠️ این سفارش قبلاً تعیین تکلیف شده.'); }

    const amount = Number(s.amount || 0);
    let commission = 0;
    if (s.commission_type === 'percentage') commission = Math.round(amount * (parseFloat(s.commission_value) / 100));
    else if (s.commission_type === 'fixed') commission = parseInt(s.commission_value, 10) || 0;
    const received = amount - commission;

    await pool.query('UPDATE sell_orders SET amount = $1, commission = $2, status = $3 WHERE id = $4', [amount, commission, 'completed', id]);
    await pool.query('UPDATE users SET balance = balance + $1 WHERE telegram_id = $2', [received, s.telegram_id]);
    try { await logTransaction(s.telegram_id, 'sell', received, `فروش ${s.product_name || s.product_type}`); } catch (e) {}

    const user = await getUser(s.telegram_id);
    try {
      await ctx.telegram.sendMessage(s.telegram_id, R.buildSellReceipt({
        productName: s.product_name || s.product_type,
        amount, commission, received,
        status: 'success', tracking: s.tracking_code,
        card: user ? user.card_number : null,
        newBalance: user ? user.balance : 0,
        createdAt: new Date()
      }));
    } catch (e) {}

    try { await ctx.deleteMessage(); } catch (e) {}
    return ctx.reply(`✅ فروش تأیید شد، ${received.toLocaleString('en-US')} تومان به کیف کاربر اضافه شد و رسید ارسال شد.`);
  });

  bot.action(/^selno:(\d+)$/, async (ctx) => {
    if (!(await isAdminUser(ctx.from.id))) return ctx.answerCbQuery('⛔', { show_alert: true });
    ctx.answerCbQuery();
    const id = parseInt(ctx.match[1], 10);
    try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'sell_reject', step: 'waiting_reason', data: { id } };
    return ctx.reply('❌ دلیل رد این سفارش فروش را بنویسید (برای کاربر ارسال می‌شود):');
  });

  // لغو امن جریان‌های ادمین
  bot.action('admin_cancel_flow', async (ctx) => {
    if (!(await isAdminUser(ctx.from.id))) return;
    ctx.answerCbQuery();
    delete sessions[ctx.from.id];
    try { await ctx.deleteMessage(); } catch (e) {}
    return ctx.reply('↩️ جریان لغو شد.', backPanel);
  });

  // ==================== ورودی‌های متنی ادمین ====================
  bot.on('text', async (ctx, next) => {
    const session = sessions[ctx.from.id];
    if (!session) return next();
    if (!(await isAdminUser(ctx.from.id))) return next();

    // دلیل رد درخواست کیف پول
    if (session.flow === 'wr_reject' && session.step === 'waiting_reason') {
      const reason = ctx.message.text.trim();
      const id = session.data.id;
      delete sessions[ctx.from.id];
      const res = await pool.query('SELECT * FROM wallet_requests WHERE id = $1', [id]);
      if (res.rows.length === 0 || res.rows[0].status !== 'pending') return ctx.reply('⚠️ درخواست یافت نشد یا قبلاً بررسی شده.');
      const r = res.rows[0];
      await pool.query('UPDATE wallet_requests SET status = $1, reject_reason = $2 WHERE id = $3', ['rejected', reason, id]);
      try {
        if (r.type === 'deposit') {
          await ctx.telegram.sendMessage(r.telegram_id, R.buildDepositReceipt({ amount: Number(r.amount), status: 'failed', tracking: r.tracking_code, createdAt: new Date(), reason }));
        } else {
          await ctx.telegram.sendMessage(r.telegram_id, R.buildWithdrawReceipt({ amount: Number(r.amount), commission: 0, status: 'failed', tracking: r.tracking_code, createdAt: new Date(), reason }));
        }
      } catch (e) {}
      return ctx.reply('❌ درخواست رد شد و رسید ناموفق برای کاربر ارسال شد.');
    }

    // کد ووچر تحویل خرید
    if (session.flow === 'buy_deliver' && session.step === 'waiting_code') {
      const code = ctx.message.text.trim();
      if (code.length < 3) return ctx.reply('❌ کد نامعتبر است.');
      session.data.code = code;
      session.step = 'waiting_hash';
      return ctx.reply('🔐 حالا هش ووچر را وارد کنید.\n(اگر این محصول هش ندارد، عدد 0 را بفرستید تا خالی ذخیره شود):');
    }

    // هش ووچر + پیام دلخواه
    if (session.flow === 'buy_deliver' && session.step === 'waiting_hash') {
      const rawHash = ctx.message.text.trim();
      const hash = (rawHash === '0' || rawHash === 'ندارد' || rawHash === '-') ? null : rawHash;
      session.data.hash = hash;
      session.step = 'waiting_message';
      return ctx.reply('💬 آیا پیام دلخواهی برای مشتری دارید؟\nاگر بله، پیام را بنویسید.\nاگر نه، عدد 0 را بفرستید.');
    }

    // پیام دلخواه + نهایی‌سازی تحویل خرید
    if (session.flow === 'buy_deliver' && session.step === 'waiting_message') {
      const rawMsg = ctx.message.text.trim();
      const customMsg = (rawMsg === '0' || rawMsg === 'ندارد' || rawMsg === '-') ? null : rawMsg;
      const id = session.data.id;
      const code = session.data.code;
      const hash = session.data.hash;
      delete sessions[ctx.from.id];

      const res = await pool.query(
        `SELECT o.*, p.name AS product_name FROM orders o LEFT JOIN products p ON o.product_type = p.key WHERE o.id = $1`, [id]);
      if (res.rows.length === 0) return ctx.reply('⚠️ سفارش یافت نشد.');
      const o = res.rows[0];
      if (!['pending_delivery', 'pending'].includes(o.status)) return ctx.reply('⚠️ این سفارش قبلاً تحویل شده.');

      await pool.query(
        `UPDATE orders SET delivered_code = $1, provider_tx_id = $2, voucher_code = $1, status = 'completed' WHERE id = $3`,
        [code, hash, id]);
      try { await logTransaction(o.telegram_id, 'buy', -Number(o.amount), `خرید ${o.product_name || o.product_type}`); } catch (e) {}
      try { await checkAndGrantBonuses(ctx, o.telegram_id, 'purchase'); } catch (e) {}

      const user = await getUser(o.telegram_id);
      const paid = Number(o.amount || 0);
      const commission = Number(o.commission || 0);

      // ساخت رسید خرید موفق
      let receiptMsg = R.buildBuyReceipt({
        productName: o.product_name || o.product_type,
        base: paid - commission, commission, paid,
        status: 'success', tracking: o.tracking_code,
        card: user ? user.card_number : null,
        voucherCode: code, voucherHash: hash,
        createdAt: new Date()
      });

      // اضافه کردن پیام دلخواه ادمین در انتهای رسید
      if (customMsg) {
        receiptMsg += '\n\n💬 پیام پشتیبانی:\n' + customMsg;
      }

      try {
        await ctx.telegram.sendMessage(o.telegram_id, receiptMsg);
      } catch (e) {}
      return ctx.reply('✅ سفارش تکمیل شد و رسید خرید برای کاربر ارسال شد.');
    }

    // دلیل رد خرید + بازگشت وجه
    if (session.flow === 'buy_reject' && session.step === 'waiting_reason') {
      const reason = ctx.message.text.trim();
      const id = session.data.id;
      delete sessions[ctx.from.id];
      const res = await pool.query(
        `SELECT o.*, p.name AS product_name FROM orders o LEFT JOIN products p ON o.product_type = p.key WHERE o.id = $1`, [id]);
      if (res.rows.length === 0) return ctx.reply('⚠️ سفارش یافت نشد.');
      const o = res.rows[0];
      if (!['pending_delivery', 'pending'].includes(o.status)) return ctx.reply('⚠️ این سفارش قبلاً تعیین تکلیف شده.');

      await pool.query('UPDATE orders SET status = $1, reject_reason = $2 WHERE id = $3', ['rejected', reason, id]);
      await pool.query('UPDATE users SET balance = balance + $1 WHERE telegram_id = $2', [Number(o.amount), o.telegram_id]);
      try { await logTransaction(o.telegram_id, 'refund', Number(o.amount), 'بازگشت وجه سفارش ' + o.tracking_code); } catch (e) {}
      const paid = Number(o.amount || 0);
      const commission = Number(o.commission || 0);
      try {
        await ctx.telegram.sendMessage(o.telegram_id, R.buildBuyReceipt({
          productName: o.product_name || o.product_type,
          base: paid - commission, commission,
          status: 'failed', tracking: o.tracking_code, createdAt: new Date(), reason
        }));
      } catch (e) {}
      return ctx.reply('❌ سفارش رد شد، مبلغ به‌صورت خودکار به کیف کاربر برگشت و رسید ناموفق ارسال شد.');
    }

    // دلیل رد فروش
    if (session.flow === 'sell_reject' && session.step === 'waiting_reason') {
      const reason = ctx.message.text.trim();
      const id = session.data.id;
      delete sessions[ctx.from.id];
      const res = await pool.query(
        `SELECT s.*, sp.name AS product_name FROM sell_orders s LEFT JOIN sell_products sp ON s.product_type = sp.key WHERE s.id = $1`, [id]);
      if (res.rows.length === 0) return ctx.reply('⚠️ سفارش یافت نشد.');
      const s = res.rows[0];
      if (s.status !== 'pending_review') return ctx.reply('⚠️ این سفارش قبلاً تعیین تکلیف شده.');
      await pool.query('UPDATE sell_orders SET status = $1, reject_reason = $2 WHERE id = $3', ['rejected', reason, id]);
      try {
        await ctx.telegram.sendMessage(s.telegram_id, R.buildSellReceipt({
          productName: s.product_name || s.product_type,
          amount: Number(s.amount || 0), commission: Number(s.commission || 0),
          status: 'failed', tracking: s.tracking_code, createdAt: new Date(), reason
        }));
      } catch (e) {}
      return ctx.reply('❌ فروش رد شد و رسید ناموفق برای کاربر ارسال شد.');
    }

    return next();
  });
};
