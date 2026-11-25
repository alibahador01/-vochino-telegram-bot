// handlers/orderAdmin.js
// مدیریت سفارشات خرید و فروش توسط ادمین (تحویل خرید با کد+هش، تأیید/رد فروش با کارمزد خودکار)
const { sessions } = require('../utils');
const { pool, getUser, getSellProductByKey } = require('../db');
const { ADMIN_IDS } = require('../constants');
const { calculateSellPayout } = require('../exchangeEngine');
const { checkAndGrantBonuses, checkAndGrantReferralCommission } = require('./bonusEngine');
const R = require('./receipts');

function isAdmin(telegramId) {
  return ADMIN_IDS.includes(Number(telegramId));
}

// ⚠️ رفع باگ خطرناک «واریز اشتباه به کیف پول کاربر» (مثال واقعی: کاربر ووچر ۳۰٬۰۰۰ تومانی
// فروخت ولی به‌جای آن ۳۰۰٬۰۰۰ تومان — دقیقاً ۱۰ برابر — به کیف پولش واریز شد): قبلاً ادمین
// مبلغ پایه را کاملاً از صفر و آزاد تایپ می‌کرد و همان عدد، بدون هیچ مقایسه‌ای با مبلغ
// تخمینیِ سیستم (همان قیمت واحدی که موقع ثبت سفارش فروش برای همین محصول محاسبه شده بود)،
// مستقیم به موجودی کاربر اضافه می‌شد. یک صفر اضافه (دقیقاً فرقِ تومان/ریال) یا هر خطای
// تایپی دیگر بلافاصله و بدون برگشت پول واقعی را از کیف‌پول داخلی ما خارج می‌کرد.
// الان: اگر عدد واردشده با مبلغ تخمینی سیستم بیش از این ضریب فرق داشته باشد، واریز فوری
// انجام نمی‌شود — ادمین باید یک‌بار صریح با دکمه تایید کند. ضریب ۳ یعنی مثلاً ۱۰ برابر یا
// حتی ۲ برابر هم قطعاً گیر می‌افتد، ولی نوسان عادی/دستی قیمت (مثلاً ۱.۵ برابر) مزاحم کار روزمره نمی‌شود.
const SELL_AMOUNT_SANITY_RATIO = 3;

// ⚠️ دو حالتی که ادمین اجازه‌ی «تایید دستی و واریز» دارد: 'pending_review' سفارش‌های تازه‌ی
// معمولی، و 'needs_manual_amount' سفارش‌هایی که uWallet خودکار confirm کرده ولی مبلغ واقعی‌شون
// (receive) قابل‌اتکا نیومد (db.js → revertSellOrderToManualReview). عمداً 'needs_manual_amount'
// در SELL_REJECTABLE_STATUSES نیست — کد این سفارش‌ها قبلاً واقعاً روی uWallet مصرف شده، پس
// دکمه‌ی «رد» برایشان هرگز نباید کار کند (حتی اگر به اشتباه نمایش داده شود).
const SELL_APPROVABLE_STATUSES = ['pending_review', 'needs_manual_amount'];

module.exports = function registerOrderAdminHandlers(bot) {

  // منطق مشترک نهایی‌سازی تایید دستی فروش (هم از مسیر مستقیم بدون‌تناقض، هم از مسیر
  // تاییدِ دوباره بعد از هشدار مغایرت صدا زده می‌شود) — تا دو نسخه‌ی جدا از همین منطق حیاتی
  // (که مستقیماً موجودی واقعی کاربر را تغییر می‌دهد) در فایل نباشد.
  async function finalizeManualSellApproval(ctx, requestId, baseAmount) {
    const reqCheck = (await pool.query('SELECT * FROM sell_orders WHERE id=$1', [requestId])).rows[0];
    if (!reqCheck || !SELL_APPROVABLE_STATUSES.includes(reqCheck.status)) {
      return ctx.reply('❌ این درخواست قبلاً بررسی شده.');
    }

    const sellProduct = await getSellProductByKey(reqCheck.product_type);
    const { commission, payout } = calculateSellPayout(baseAmount, sellProduct || { commission_type: 'none', commission_value: 0 });

    const upd = await pool.query(
      "UPDATE sell_orders SET status='approved', amount=$1, commission=$2, fulfillment_mode='manual' WHERE id=$3 AND status = ANY($4) RETURNING *",
      [payout, commission, requestId, SELL_APPROVABLE_STATUSES]
    );
    if (upd.rows.length === 0) return ctx.reply('❌ این درخواست قبلاً بررسی شده (احتمالاً توسط یک ادمین دیگر).');
    const req = upd.rows[0];

    await pool.query('UPDATE users SET balance = balance + $1 WHERE telegram_id = $2', [payout, req.telegram_id]);

    const p = (await pool.query('SELECT name FROM sell_products WHERE key=$1', [req.product_type])).rows[0]?.name || req.product_type;
    const u = await getUser(req.telegram_id);

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
  }

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
    // ⚠️ رفع باگ ریس‌کاندیشن «بازگشت دوباره‌ی پول»: قبلاً وضعیت سفارش با یک SELECT جدا چک
    // می‌شد و بعد با یک UPDATE کاملاً جدا کنسل می‌شد. اگه دو ادمین (یا یک ادمین با دابل‌تپ)
    // تقریباً هم‌زمان روی «رد سفارش» بزنن، هر دو می‌تونستن status='pending_delivery' رو ببینن
    // و هر دو مبلغ رو به کاربر برگردونن — یعنی کاربر دو برابر پول سفارشش رو پس می‌گرفت.
    // الان خود UPDATE وضعیت اول و اتمیک انجام می‌شه (WHERE status='pending_delivery')؛ فقط
    // دقیقاً یکی از دو تلاش هم‌زمان rowCount=1 می‌گیره و اجازه‌ی بازگشت پول پیدا می‌کنه.
    const upd = await pool.query(
      "UPDATE orders SET status='cancelled' WHERE id=$1 AND status='pending_delivery' RETURNING *",
      [orderId]
    );
    if (upd.rows.length === 0) return ctx.reply('⚠️ این سفارش یافت نشد یا قبلاً تعیین تکلیف شده.');
    const o = upd.rows[0];
    const refund = Number(o.amount) || 0;
    await pool.query('UPDATE users SET balance = balance + $1 WHERE telegram_id = $2', [refund, o.telegram_id]);
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
    const pending = (await pool.query("SELECT * FROM sell_orders WHERE status = ANY($1) ORDER BY id ASC", [SELL_APPROVABLE_STATUSES])).rows;
    if (pending.length === 0) return ctx.reply('✅ درخواست فروشی در انتظار نیست.');
    for (const s of pending) {
      const u = await getUser(s.telegram_id);
      const p = (await pool.query('SELECT name FROM sell_products WHERE key=$1', [s.product_type])).rows[0]?.name || s.product_type;
      // ⚠️ برای سفارش‌هایی که uWallet خودکار confirm کرده ولی مبلغ واقعی (receive) نامشخص مونده
      // (status='needs_manual_amount')، کد ووچر از قبل واقعاً مصرف شده — دکمه‌ی «رد» اصلاً نشون
      // داده نمی‌شه (رد کردنش یعنی دروغ گفتن به کاربر که کدش نامعتبره).
      const isUnpriced = s.status === 'needs_manual_amount';
      const warn = isUnpriced
        ? `🚨 این کد از قبل روی uWallet مصرف/تأیید شده — مبلغ واقعی نامشخص است. فقط «تایید» بزن.\n\n`
        : '';
      let msg = warn + `🎟 فروش ${p}\n👤 ${u?.full_name || '---'}\n📱 ${u?.phone || '---'}\n💳 ${u?.card_number || '---'}\n🎫 کد ووچر مشتری (قابل کپی):\n\`${s.voucher_code}\`\n🆔 ${s.tracking_code}`;
      const buttons = isUnpriced
        ? [[{ text: '✅ تایید', callback_data: 'admin_sell_approve_' + s.id }]]
        : [
            [{ text: '✅ تایید', callback_data: 'admin_sell_approve_' + s.id }],
            [{ text: '❌ رد', callback_data: 'admin_sell_reject_' + s.id }, { text: '✉️ رد با دلیل', callback_data: 'admin_sell_reject_reason_' + s.id }]
          ];
      ctx.reply(msg, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons }
      });
    }
  });

  bot.action(/^admin_sell_approve_(\d+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const requestId = ctx.match[1];
    const req = (await pool.query('SELECT * FROM sell_orders WHERE id=$1', [requestId])).rows[0];
    if (!req) { ctx.answerCbQuery('⚠️ یافت نشد', { show_alert: true }); return; }
    if (!SELL_APPROVABLE_STATUSES.includes(req.status)) { ctx.answerCbQuery('⚠️ قبلاً بررسی شده', { show_alert: true }); try { await ctx.deleteMessage(); } catch (e) {} return; }
    ctx.answerCbQuery();
    const expectedAmount = Number(req.amount || 0);
    sessions[ctx.from.id] = { flow: 'admin_sell_amount', step: 'waiting_amount', data: { requestId, expectedAmount } };
    ctx.reply(
      '💰 مبلغ پایه (ارزش واقعی/تأیید‌شده ووچر به تومان) را وارد کنید — کارمزد تنظیم‌شده در پنل به‌صورت خودکار از آن کسر و مبلغ نهایی به کاربر واریز می‌شود:\n\n' +
      `ℹ️ مبلغ تخمینی سیستم برای این محصول: ${expectedAmount.toLocaleString('en-US')} تومان\n` +
      '⚠️ اگر عددی که وارد می‌کنید خیلی با این مبلغ فرق داشته باشد (مثلاً یک صفر اضافه/کم)، قبل از واریز نهایی یک‌بار از شما تاییدیه گرفته می‌شود.'
    );
  });

  // تایید صریح واریز وقتی مبلغ واردشده با مبلغ تخمینی سیستم مغایرت زیاد داشت
  bot.action(/^admin_sell_confirm_(\d+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const requestId = ctx.match[1];
    ctx.answerCbQuery();
    const session = sessions[ctx.from.id];
    if (!session || session.flow !== 'admin_sell_amount' || session.step !== 'confirm_mismatch' ||
        String(session.data.requestId) !== String(requestId) || session.data.pendingBaseAmount === undefined) {
      return ctx.reply('⚠️ این تاییدیه منقضی شده یا یافت نشد. لطفاً دوباره از لیست «فروش‌های در انتظار» شروع کنید.');
    }
    const baseAmount = session.data.pendingBaseAmount;
    delete sessions[ctx.from.id];
    try { await ctx.deleteMessage(); } catch (e) {}
    await finalizeManualSellApproval(ctx, requestId, baseAmount);
  });

  // لغو تاییدیه‌ی مغایرت — ادمین مبلغ درست را دوباره به‌عنوان پیام جدید می‌فرستد
  bot.action(/^admin_sell_amount_cancel_(\d+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const requestId = ctx.match[1];
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    const session = sessions[ctx.from.id];
    const expectedAmount = (session && session.data && String(session.data.requestId) === String(requestId))
      ? session.data.expectedAmount : undefined;
    sessions[ctx.from.id] = { flow: 'admin_sell_amount', step: 'waiting_amount', data: { requestId, expectedAmount } };
    ctx.reply('✏️ باشه، مبلغ درست را دوباره وارد کنید:');
  });

  bot.action(/^admin_sell_reject_(\d+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const requestId = ctx.match[1];
    // ⚠️ اتمیک: شرط status='pending_review' داخل خودِ UPDATE، نه یک SELECT جدا قبلش — جلوگیری از
    // اینکه با دابل‌تپ یا دو ادمین هم‌زمان، پیام «رد شد» دوبار برای کاربر ارسال بشه.
    const upd = await pool.query(
      "UPDATE sell_orders SET status='rejected' WHERE id=$1 AND status='pending_review' RETURNING *",
      [requestId]
    );
    if (upd.rows.length === 0) { ctx.answerCbQuery('⚠️ یافت نشد یا قبلاً بررسی شده', { show_alert: true }); try { await ctx.deleteMessage(); } catch (e) {} return; }
    const req = upd.rows[0];
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

      // ⚠️ اتمیک: شرط status='pending_delivery' داخل خودِ UPDATE — جلوگیری از تحویل دوباره/ارسال
      // دوباره‌ی کد ووچر برای یک سفارش اگه دو ادمین هم‌زمان مراحل تحویل رو طی کنن.
      const upd = await pool.query(
        "UPDATE orders SET status='completed', delivered_code=$1, delivered_hash=$2 WHERE id=$3 AND status='pending_delivery' RETURNING *",
        [voucherCode, voucherHash, orderId]
      );
      if (upd.rows.length === 0) return ctx.reply('⚠️ این سفارش یافت نشد یا قبلاً تعیین تکلیف شده.');
      const order = upd.rows[0];

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
      // ⚠️ رفع باگ: بونوس «اولین خرید» تا الان هیچ‌جا بعد از تکمیل سفارش خرید صدا زده نمی‌شد —
      // یعنی حتی اگه ادمین از پنل فعالش می‌کرد، هیچ مشتری‌ای هیچ‌وقت این بونوس رو نمی‌گرفت.
      // اینجا دقیقاً بعد از تکمیل واقعی سفارش (status='completed') صدا زده می‌شه.
      try { await checkAndGrantBonuses(ctx, order.telegram_id, 'purchase'); } catch (e) {}
      // ⚠️ رفع باگ: «طرح سود مادام‌العمر» (checkAndGrantReferralCommission) هیچ‌جا صدا زده نمی‌شد —
      // برای تحویل دستی هم لازمه، نه فقط مسیر خودکار. base یعنی مبلغ پایه‌ی خرید قبل از کارمزد.
      try { await checkAndGrantReferralCommission(ctx, order.telegram_id, base); } catch (e) {}
      return;
    }

    // رد با دلیل (فروش)
    if (session.flow === 'admin_sell_reject_reason' && session.step === 'waiting_reason') {
      const reason = ctx.message.text.trim();
      const requestId = session.data.requestId;
      delete sessions[ctx.from.id];
      // ⚠️ اتمیک: شرط status='pending_review' داخل خودِ UPDATE
      const upd = await pool.query(
        "UPDATE sell_orders SET status='rejected' WHERE id=$1 AND status='pending_review' RETURNING *",
        [requestId]
      );
      if (upd.rows.length === 0) return ctx.reply('⚠️ این درخواست یافت نشد یا قبلاً بررسی شده.');
      const req = upd.rows[0];
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
    // ⚠️ step === 'confirm_mismatch' هم همین‌جا پردازش می‌شود: اگر ادمین به‌جای زدن دکمه‌ی
    // «لغو»، مستقیم عدد تازه را به‌عنوان پیام جدید بفرستد (رفتار طبیعی‌تر برای خیلی‌ها)، باید
    // دوباره مثل یک ورودی تازه چک شود — نه این‌که بی‌صدا نادیده گرفته شود یا هندلر دیگری آن را بردارد.
    if (session.flow === 'admin_sell_amount' && (session.step === 'waiting_amount' || session.step === 'confirm_mismatch')) {
      const baseAmount = parseInt(ctx.message.text.replace(/[^0-9]/g, ''), 10);
      if (!baseAmount || baseAmount <= 0) return ctx.reply('⚠️ مبلغ نامعتبر. دوباره وارد کنید:');
      const requestId = session.data.requestId;
      const reqCheck = (await pool.query('SELECT * FROM sell_orders WHERE id=$1', [requestId])).rows[0];
      if (!reqCheck || !SELL_APPROVABLE_STATUSES.includes(reqCheck.status)) { delete sessions[ctx.from.id]; return ctx.reply('❌ این درخواست قبلاً بررسی شده.'); }

      // ⚠️ رفع باگ خطرناک (بالای فایل توضیح داده شده): قبل از هر واریز واقعی، عدد واردشده با
      // مبلغ تخمینی سیستم (expectedAmount — همان قیمت واحدی که موقع ثبت این سفارش فروش محاسبه
      // شده بود) مقایسه می‌شود. اگر نسبت این دو عدد غیرعادی بود (مثلاً ۱۰ برابر — دقیقاً نمونه‌ی
      // واقعی اشتباه تومان/ریال)، به‌جای واریز فوری، یک هشدار صریح با دکمه‌ی تایید نشان داده
      // می‌شود — این‌جوری یک تایپوی عددی هرگز خودش‌به‌خود به کیف پول کاربر واریز نمی‌شود.
      const expected = Number(session.data.expectedAmount || 0);
      const ratio = expected > 0 ? (baseAmount / expected) : null;
      const isSuspicious = ratio !== null && (ratio >= SELL_AMOUNT_SANITY_RATIO || ratio <= (1 / SELL_AMOUNT_SANITY_RATIO));
      if (isSuspicious) {
        session.step = 'confirm_mismatch';
        session.data.pendingBaseAmount = baseAmount;
        return ctx.reply(
          `⚠️ هشدار مغایرت مبلغ!\n\n` +
          `مبلغی که وارد کردید: ${baseAmount.toLocaleString('en-US')} تومان\n` +
          `مبلغ تخمینی سیستم: ${expected.toLocaleString('en-US')} تومان\n` +
          `نسبت: حدود ${ratio.toFixed(1)} برابر\n\n` +
          `این دقیقاً همان حالتی‌ست که یک صفر اضافه/کم (یا اشتباه تومان/ریال) باعث واریز اشتباه به کیف‌پول کاربر می‌شود. ` +
          `اگر عدد واردشده را مطمئن تایید می‌کنید، دکمه‌ی زیر را بزنید؛ در غیر این صورت «لغو» را بزنید و عدد درست را دوباره بفرستید.`,
          {
            reply_markup: {
              inline_keyboard: [[
                { text: '✅ تایید همین مبلغ و واریز', callback_data: `admin_sell_confirm_${requestId}` },
                { text: '✏️ لغو، دوباره وارد می‌کنم', callback_data: `admin_sell_amount_cancel_${requestId}` }
              ]]
            }
          }
        );
      }

      delete sessions[ctx.from.id];
      await finalizeManualSellApproval(ctx, requestId, baseAmount);
      return;
    }

    return next();
  });
};
