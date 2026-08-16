// handlers/wallet.js
const texts = require('../texts');
const { sessions, showMainMenu, fillTemplate, generateTrackingCode } = require('../utils');
const { pool, getUser, updateUser, getUserCards, getTransactionLogs, logTransaction, getAdmin, getAllAdmins } = require('../db');
const { MIN_WITHDRAW, ADMIN_IDS } = require('../constants');
const R = require('./receipts');

module.exports = function registerWalletHandlers(bot) {

  // migration خودکار (بدون دستور دستی): ستون دلیل رد برای درخواست‌های کیف پول
  pool.query('ALTER TABLE wallet_requests ADD COLUMN IF NOT EXISTS reject_reason TEXT').catch(() => {});

  async function adminIdsList() {
    const ids = ADMIN_IDS.map(x => Number(x));
    try {
      const admins = await getAllAdmins();
      admins.forEach(a => { if (!ids.includes(Number(a.telegram_id))) ids.push(Number(a.telegram_id)); });
    } catch (e) {}
    return ids;
  }

  async function isAdminUser(id) {
    if (ADMIN_IDS.includes(Number(id))) return true;
    try { const a = await getAdmin(id); return !!a; } catch (e) { return false; }
  }

  bot.action('menu_wallet', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    return showWalletPage(ctx);
  });

  async function showWalletPage(ctx) {
    const user = await getUser(ctx.from.id);
    if (!user) {
      return ctx.reply('⚠️ اطلاعات کاربری شما یافت نشد. /start را بزنید.');
    }

    const balance = Number(user.balance);
    const bonusBalance = Number(user.bonus_balance || 0);
    const name = user.full_name || 'ثبت نشده';
    const phone = user.phone || 'ثبت نشده';
    const card = user.card_number || 'ثبت نشده';
    const level = user.verification_status === 'gold' ? '🥇 طلایی' : (user.verification_status === 'silver' ? '🥈 نقره‌ای' : '⚪ مهمان');
    const inviteRes = await pool.query('SELECT COUNT(*)::int AS count FROM users WHERE referrer_id = $1', [String(ctx.from.id)]);
    const inviteCount = inviteRes.rows[0].count;

    const profileText =
      R.HEADER +
      `🧢 پروفایل: \`${user.telegram_id}\`\n` +
      `👤 نام و نام خانوادگی: ${name}\n` +
      `📱 شماره تلفن: ${phone}\n` +
      `💳 شماره کارت: ${card}\n` +
      `💰 موجودی: ${balance.toLocaleString('en-US')} تومان\n` +
      `🪎 موجودی بونوس: ${bonusBalance.toLocaleString('en-US')} تومان\n` +
      `🎗 سطح احراز: ${level}\n` +
      `👥 افراد دعوت‌شده: ${inviteCount} نفر`;

    const keyboard = [
      [{ text: '🧳 افزایش موجودی', callback_data: 'wallet_deposit' }],
      [{ text: '💸 برداشت موجودی', callback_data: 'wallet_withdraw' }],
      [{ text: '🪪 افزایش سقف خرید', callback_data: 'wallet_gold_verify' }],
      [{ text: '💳 افزودن کارت جدید', callback_data: 'wallet_add_card' }],
      [{ text: '♻️ گزارش تراکنش‌ها', callback_data: 'wallet_history' }],
      [{ text: '🪎 کسب درآمد', callback_data: 'wallet_referral' }],
      [{ text: '🔴 بازگشت', callback_data: 'back_main_menu' }]
    ];

    ctx.reply(profileText, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    });
  }

  // ==================== توابع کمکی گزارش تراکنش‌ها ====================
  function statusInfo(status) {
    if (['completed', 'approved', 'delivered', 'paid'].includes(status)) return { emoji: '🟢', label: 'موفق' };
    if (['rejected', 'cancelled', 'failed'].includes(status)) return { emoji: '🔴', label: 'رد شده' };
    return { emoji: '🟠', label: 'در انتظار' };
  }

  async function fetchUserTransactions(userId) {
    const list = [];
    try {
      const ordersRes = await pool.query(
        `SELECT o.id, 'buy' AS kind, o.product_type, p.name AS product_name, o.amount, o.commission, o.status, o.tracking_code, o.created_at
         FROM orders o LEFT JOIN products p ON o.product_type = p.key
         WHERE o.telegram_id = $1`, [userId]);
      ordersRes.rows.forEach(r => list.push({ kind: 'buy', id: r.id, productName: r.product_name || r.product_type, amount: Number(r.amount || 0), commission: Number(r.commission || 0), status: r.status, tracking_code: r.tracking_code, created_at: r.created_at }));
    } catch (e) { console.log('خطا در خواندن orders:', e.message); }

    try {
      const sellRes = await pool.query(
        `SELECT s.id, 'sell' AS kind, s.product_type, sp.name AS product_name, s.amount, s.commission, s.status, s.tracking_code, s.created_at
         FROM sell_orders s LEFT JOIN sell_products sp ON s.product_type = sp.key
         WHERE s.telegram_id = $1`, [userId]);
      sellRes.rows.forEach(r => list.push({ kind: 'sell', id: r.id, productName: r.product_name || r.product_type, amount: Number(r.amount || 0), commission: Number(r.commission || 0), status: r.status, tracking_code: r.tracking_code, created_at: r.created_at }));
    } catch (e) { console.log('خطا در خواندن sell_orders:', e.message); }

    try {
      const walletRes = await pool.query(
        `SELECT id, type, amount, status, tracking_code, created_at, card_number
         FROM wallet_requests WHERE telegram_id = $1`, [userId]);
      walletRes.rows.forEach(r => list.push({ kind: r.type, id: r.id, productName: null, amount: Number(r.amount || 0), commission: 0, status: r.status, tracking_code: r.tracking_code, created_at: r.created_at, card_number: r.card_number }));
    } catch (e) { console.log('خطا در خواندن wallet_requests:', e.message); }

    list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return list;
  }

  function buttonLabel(t) {
    const st = statusInfo(t.status);
    const amount = t.amount.toLocaleString('en-US');
    let firstLine;
    if (st.label === 'رد شده') firstLine = '🔴 سفارش رد شده';
    else if (t.kind === 'buy') firstLine = `🟢 خرید ${t.productName || ''}`.trim();
    else if (t.kind === 'sell') firstLine = `🔵 فروش ${t.productName || ''}`.trim();
    else if (t.kind === 'withdraw') firstLine = '🟠 برداشت موجودی';
    else if (t.kind === 'deposit') firstLine = '🟡 شارژ موجودی';
    else firstLine = `⚪️ ${t.kind}`;
    return `${firstLine}\n💰 ${amount} تومان\n📍 ${t.tracking_code || '-'}`;
  }

  bot.action('wallet_history', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    return showTransactionHistory(ctx);
  });

  async function showTransactionHistory(ctx) {
    const userId = String(ctx.from.id);
    const list = await fetchUserTransactions(userId);
    if (list.length === 0) return ctx.reply('📋 شما هنوز تراکنشی ندارید.');

    const recent = list.slice(0, 10);
    const buttons = recent.map(t => [{ text: buttonLabel(t), callback_data: `tx_detail:${t.kind}:${t.id}` }]);
    buttons.push([{ text: '🔴 بازگشت', callback_data: 'menu_wallet' }]);

    ctx.reply('🧾 **گزارش تراکنش‌های شما**\n\nبرای مشاهده جزئیات، روی هر تراکنش بزنید:', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons }
    });
  }

  // ==================== جزئیات تراکنش (با بررسی مالکیت) ====================
  bot.action(/^tx_detail:(\w+):(\d+)$/, async (ctx) => {
    ctx.answerCbQuery();
    const kind = ctx.match[1];
    const id = parseInt(ctx.match[2], 10);
    const userId = String(ctx.from.id);

    if (kind === 'buy') {
      const res = await pool.query(
        `SELECT o.*, p.name AS product_name FROM orders o LEFT JOIN products p ON o.product_type = p.key
         WHERE o.id = $1 AND o.telegram_id = $2`, [id, userId]);
      if (res.rows.length === 0) return ctx.reply('⚠️ تراکنش یافت نشد یا متعلق به شما نیست.');
      const t = res.rows[0];
      const user = await getUser(userId);
      const paid = Number(t.amount || 0);
      const commission = Number(t.commission || 0);
      const st = statusInfo(t.status);
      const state = st.label === 'موفق' ? 'success' : (st.label === 'رد شده' ? 'failed' : 'pending');
      return ctx.reply(R.buildBuyReceipt({
        productName: t.product_name || t.product_type,
        base: paid - commission, commission, paid,
        status: state, tracking: t.tracking_code,
        card: user ? user.card_number : null,
        voucherCode: t.delivered_code || t.voucher_code,
        voucherHash: t.provider_tx_id,
        createdAt: t.created_at,
        reason: t.reject_reason
      }));
    }

    if (kind === 'sell') {
      const res = await pool.query(
        `SELECT s.*, sp.name AS product_name FROM sell_orders s LEFT JOIN sell_products sp ON s.product_type = sp.key
         WHERE s.id = $1 AND s.telegram_id = $2`, [id, userId]);
      if (res.rows.length === 0) return ctx.reply('⚠️ تراکنش یافت نشد یا متعلق به شما نیست.');
      const t = res.rows[0];
      const user = await getUser(userId);
      const amount = Number(t.amount || 0);
      const commission = Number(t.commission || 0);
      const st = statusInfo(t.status);
      const state = st.label === 'موفق' ? 'success' : (st.label === 'رد شده' ? 'failed' : 'pending');
      return ctx.reply(R.buildSellReceipt({
        productName: t.product_name || t.product_type,
        amount, commission, received: amount - commission,
        status: state, tracking: t.tracking_code,
        card: user ? user.card_number : null,
        newBalance: user ? user.balance : 0,
        createdAt: t.created_at,
        reason: t.reject_reason
      }));
    }

    if (kind === 'withdraw' || kind === 'deposit') {
      const res = await pool.query(`SELECT * FROM wallet_requests WHERE id = $1 AND telegram_id = $2`, [id, userId]);
      if (res.rows.length === 0) return ctx.reply('⚠️ تراکنش یافت نشد یا متعلق به شما نیست.');
      const t = res.rows[0];
      const amount = Number(t.amount || 0);
      const st = statusInfo(t.status);
      const user = await getUser(userId);
      const state = st.label === 'موفق' ? 'success' : (st.label === 'رد شده' ? 'failed' : 'pending');

      if (t.type === 'withdraw') {
        return ctx.reply(R.buildWithdrawReceipt({
          amount, commission: 0, net: amount,
          status: state, tracking: t.tracking_code,
          card: t.card_number, newBalance: user ? user.balance : 0,
          createdAt: t.created_at, reason: t.reject_reason
        }));
      }
      return ctx.reply(R.buildDepositReceipt({
        amount, status: state, tracking: t.tracking_code,
        newBalance: user ? user.balance : 0,
        createdAt: t.created_at, reason: t.reject_reason
      }));
    }

    return ctx.reply('⚠️ نوع تراکنش ناشناخته است.');
  });

  // ==================== افزایش موجودی ====================
  bot.action('wallet_deposit', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    return ctx.reply(R.HEADER + 'روش افزایش موجودی را انتخاب کنید:', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '💳 کارت به کارت', callback_data: 'deposit_card' }],
          [{ text: '🪙 ترون (تتر)', callback_data: 'deposit_crypto' }],
          [{ text: '🌐 درگاه پرداخت', callback_data: 'deposit_gateway' }],
          [{ text: '🔴 بازگشت', callback_data: 'menu_wallet' }]
        ]
      }
    });
  });

  bot.action('deposit_card', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    const cards = require('../constants').DEPOSIT_CARDS;
    let msg = R.HEADER + '💳 کارت به کارت\n\n✅ پرداخت شما مستقیماً و بدون واسطه به حساب رسمی مجموعه واریز می‌شود.\n💚 هزاران کاربر با خیال راحت از این روش استفاده کرده‌اند.\n\nلطفاً مبلغ واریزی خود را به یکی از کارت‌های زیر واریز کنید:\n';
    cards.forEach(c => { msg += `💳 ${c.number} (${c.owner})\n`; });

    const user = await getUser(ctx.from.id);
    sessions[ctx.from.id] = { flow: 'deposit_card', step: 'waiting_amount', lang: (user && user.language) || 'fa' };

    return ctx.reply(msg, { parse_mode: 'Markdown' })
      .then(() => {
        return ctx.reply('مبلغ واریزی خود را به تومان وارد کنید:');
      })
      .catch(console.error);
  });

  bot.action('deposit_crypto', async (ctx) => {
    ctx.answerCbQuery();
    return ctx.reply('🪙 بخش ارز دیجیتال به‌زودی فعال می‌شود.', {
      reply_markup: { inline_keyboard: [[{ text: '🔴 بازگشت', callback_data: 'wallet_deposit' }]] }
    });
  });

  bot.action('deposit_gateway', async (ctx) => {
    ctx.answerCbQuery();
    return ctx.reply('🌐 درگاه پرداخت به‌زودی فعال می‌شود.', {
      reply_markup: { inline_keyboard: [[{ text: '🔴 بازگشت', callback_data: 'wallet_deposit' }]] }
    });
  });

  bot.action('wallet_cancel', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    delete sessions[ctx.from.id];
    return showWalletPage(ctx);
  });

  // ==================== برداشت ====================
  bot.action('wallet_withdraw', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    const user = await getUser(ctx.from.id);
    if (!user || !user.card_number) {
      return ctx.reply('❌ ابتدا باید شماره کارت خود را ثبت کنید. از منوی کیف پول گزینه «افزودن کارت جدید» را انتخاب کنید.');
    }
    sessions[ctx.from.id] = { flow: 'withdraw', step: 'waiting_amount', lang: (user && user.language) || 'fa' };
    return ctx.reply(`مبلغ برداشت خود را به تومان وارد کنید (حداقل ${MIN_WITHDRAW.toLocaleString('en-US')} تومان):`);
  });

  // ==================== احراز طلایی / کارت جدید / رفرال ====================
  bot.action('wallet_gold_verify', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    const msg =
      R.HEADER +
      `💎 احراز هویت طلایی | Vochino⁰¹\n` +
      `🔐 یک قدم تا سقف خرید بالاتر\n` +
      `کافیست یک تصویر واضح و شفاف از\n` +
      `🪪 کارت ملی در کنار 💳 کارت بانکی\n` +
      `ارسال نمایید.\n` +
      `✅ پس از بررسی توسط پشتیبانی و تأیید مدارک، درخواست افزایش سقف خرید شما انجام خواهد شد.\n\n` +
      `💛 Vochino⁰¹ | تجربه‌ای متفاوت`;
    sessions[ctx.from.id] = { flow: 'gold_verify', step: 'waiting_photo', lang: 'fa' };
    return ctx.reply(msg, { parse_mode: 'Markdown' });
  });

  bot.action('wallet_add_card', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    const user = await getUser(ctx.from.id);
    sessions[ctx.from.id] = { flow: 'add_card', step: 'waiting_number', lang: (user && user.language) || 'fa' };
    return ctx.reply('شماره کارت جدید را وارد کنید (۱۶ رقم):');
  });

  bot.action('wallet_referral', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    const user = await getUser(ctx.from.id);
    if (!user) return;
    const refLink = `https://t.me/${ctx.botInfo.username}?start=${user.telegram_id}`;
    const inviteRes = await pool.query('SELECT COUNT(*)::int AS count FROM users WHERE referrer_id = $1', [String(ctx.from.id)]);
    const count = inviteRes.rows[0].count;
    return ctx.reply(
      `🔗 لینک دعوت شما:\n${refLink}\n\n👥 تعداد دعوت: ${count} نفر\n💰 پاداش هر دعوت: طبق قوانین به موجودی شما اضافه می‌شود.`,
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔴 بازگشت', callback_data: 'menu_wallet' }]] } }
    );
  });

  // ==================== تأیید/رد واریز از روی رسید ارسالی ادمین ====================
  bot.action(/^dep_ok:(\d+)$/, async (ctx) => {
    if (!(await isAdminUser(ctx.from.id))) return ctx.answerCbQuery('⛔ دسترسی ندارید', { show_alert: true });
    ctx.answerCbQuery();
    const id = parseInt(ctx.match[1], 10);
    const res = await pool.query('SELECT * FROM wallet_requests WHERE id = $1', [id]);
    if (res.rows.length === 0) return ctx.reply('⚠️ درخواست یافت نشد.');
    const req = res.rows[0];
    if (req.status !== 'pending') return ctx.reply('⚠️ این درخواست قبلاً بررسی شده است.');

    await pool.query(`UPDATE wallet_requests SET status = 'approved' WHERE id = $1`, [id]);
    await pool.query('UPDATE users SET balance = balance + $1 WHERE telegram_id = $2', [Number(req.amount), req.telegram_id]);
    try { await logTransaction(req.telegram_id, 'deposit', Number(req.amount), 'شارژ کیف پول'); } catch (e) {}

    const userAfter = await getUser(req.telegram_id);
    try {
      await ctx.telegram.sendMessage(req.telegram_id, R.buildDepositReceipt({
        amount: Number(req.amount), status: 'success', tracking: req.tracking_code,
        newBalance: userAfter ? userAfter.balance : 0, createdAt: new Date()
      }));
    } catch (e) {}
    try { await ctx.deleteMessage(); } catch (e) {}
    return ctx.reply(`✅ واریز ${Number(req.amount).toLocaleString('en-US')} تومانی تأیید و رسید برای کاربر ارسال شد.`);
  });

  bot.action(/^dep_no:(\d+)$/, async (ctx) => {
    if (!(await isAdminUser(ctx.from.id))) return ctx.answerCbQuery('⛔ دسترسی ندارید', { show_alert: true });
    ctx.answerCbQuery();
    const id = parseInt(ctx.match[1], 10);
    try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'dep_reject', step: 'waiting_reason', data: { id } };
    return ctx.reply('❌ دلیل رد این واریز را بنویسید (همین متن برای کاربر ارسال می‌شود):');
  });

  // ==================== ورودی‌های متنی ====================
  bot.on('text', async (ctx, next) => {
    const session = sessions[ctx.from.id];
    if (!session) return next();

    if (session.flow === 'dep_reject' && session.step === 'waiting_reason') {
      const reason = ctx.message.text.trim();
      const id = session.data.id;
      delete sessions[ctx.from.id];
      const res = await pool.query('SELECT * FROM wallet_requests WHERE id = $1', [id]);
      if (res.rows.length === 0) return ctx.reply('⚠️ درخواست یافت نشد.');
      const req = res.rows[0];
      if (req.status !== 'pending') return ctx.reply('⚠️ این درخواست قبلاً بررسی شده است.');

      await pool.query('UPDATE wallet_requests SET status = $1, reject_reason = $2 WHERE id = $3', ['rejected', reason, id]);
      try {
        await ctx.telegram.sendMessage(req.telegram_id, R.buildDepositReceipt({
          amount: Number(req.amount), status: 'failed', tracking: req.tracking_code, createdAt: new Date(), reason
        }));
      } catch (e) {}
      return ctx.reply('❌ درخواست رد شد و رسید ناموفق برای کاربر ارسال شد.');
    }

    if (session.flow === 'deposit_card' && session.step === 'waiting_amount') {
      const amount = parseInt(ctx.message.text.replace(/[^0-9]/g, ''));
      if (!amount || amount <= 0) {
        return ctx.reply('❌ مبلغ نامعتبر. یک عدد وارد کنید:');
      }
      session.amount = amount;
      session.step = 'waiting_receipt';
      return ctx.reply('📎 حالا رسید (فیش) پرداخت خود را همینجا ارسال کنید 📎');
    }

    if (session.flow === 'withdraw' && session.step === 'waiting_amount') {
      const amount = parseInt(ctx.message.text.replace(/[^0-9]/g, ''), 10);
      const min = MIN_WITHDRAW;
      if (!amount || amount < min) {
        return ctx.reply(`حداقل مبلغ برداشت ${min.toLocaleString('en-US')} تومان است. لطفاً دوباره وارد کنید:`);
      }
      const user = await getUser(ctx.from.id);
      if (amount > Number(user.balance)) {
        return ctx.reply(`❌ موجودی کیف پولت کافی نیست.\nمبلغ برداشت: ${amount.toLocaleString('en-US')} تومان\nموجودی فعلی: ${Number(user.balance).toLocaleString('en-US')} تومان\n\nاول کیف پولت رو شارژ کن، بعد دوباره امتحان کن.`);
      }

      const trackCode = 'VOC-' + Math.floor(1000000 + Math.random() * 9000000);
      await pool.query(
        `INSERT INTO wallet_requests (telegram_id, type, amount, card_number, status, created_at, tracking_code)
         VALUES ($1, 'withdraw', $2, $3, 'pending', NOW(), $4)`,
        [String(ctx.from.id), amount, user.card_number, trackCode]
      );

      delete sessions[ctx.from.id];
      ctx.reply(`درخواست برداشت شما ثبت شد ✅\nپس از بررسی توسط پشتیبانی، مبلغ به کارت شما واریز خواهد شد.\n\n📍 کد پیگیری: \`${trackCode}\``, { parse_mode: 'Markdown' });

      const ids = await adminIdsList();
      return ids.forEach(id => ctx.telegram.sendMessage(id, `📤 درخواست برداشت\n👤 ${user.full_name} (${ctx.from.id})\n📱 ${user.phone || '---'}\n💳 ${user.card_number}\n💰 ${amount.toLocaleString()} تومان\n📍 کد: ${trackCode}`).catch(console.error));
    }

    if (session.flow === 'add_card' && session.step === 'waiting_number') {
      let card = ctx.message.text.replace(/\s/g, '');
      if (!/^\d{16}$/.test(card)) {
        return ctx.reply('❌ شماره کارت نامعتبر. ۱۶ رقم وارد کنید:');
      }
      await pool.query('UPDATE users SET card_number = $1 WHERE telegram_id = $2', [card, String(ctx.from.id)]);
      try { await pool.query('INSERT INTO cards (telegram_id, card_number) VALUES ($1, $2)', [String(ctx.from.id), card]); } catch (e) {}
      delete sessions[ctx.from.id];
      ctx.reply('کارت جدید با موفقیت ثبت شد ✅');
      return;
    }

    return next();
  });

  // ==================== دریافت عکس رسید / مدارک ====================
  bot.on('photo', async (ctx, next) => {
    const session = sessions[ctx.from.id];
    if (!session) return next();

    if ((session.flow === 'deposit_card' || session.flow === 'gold_verify') && session.step === 'waiting_photo') {
      const fileId = ctx.message.photo.slice(-1)[0].file_id;

      if (session.flow === 'deposit_card') {
        const amount = session.amount;
        const user = await getUser(ctx.from.id);
        const trackCode = 'VOC-' + Math.floor(1000000 + Math.random() * 9000000);
        const ins = await pool.query(
          `INSERT INTO wallet_requests (telegram_id, type, amount, receipt_file_id, status, created_at, tracking_code)
           VALUES ($1, 'deposit', $2, $3, 'pending', NOW(), $4) RETURNING id`,
          [String(ctx.from.id), amount, fileId, trackCode]
        );
        const reqId = ins.rows[0].id;

        delete sessions[ctx.from.id];

        // پیام تأیید دریافت رسید برای مشتری (طبق طرح تأییدشده)
        ctx.reply(
          R.HEADER +
          `📋 تأیید دریافت رسید\n\n` +
          `💰 مبلغ شارژ: ${amount.toLocaleString('en-US')} تومان\n` +
          `👤 نام و نام خانوادگی: ${user ? (user.full_name || 'ثبت نشده') : 'ثبت نشده'}\n` +
          `💳 شماره کارت: ${user ? (user.card_number || 'ثبت نشده') : 'ثبت نشده'}\n` +
          `🔖 کد پیگیری: ${trackCode}\n\n` +
          `✅ رسید شما ثبت و به واحد مالی ارسال شد.\n` +
          `⏳ پس از بررسی، نتیجه در همین ربات اعلام می‌شود.`,
          { parse_mode: 'Markdown' }
        );

        // ارسال رسید به همه ادمین‌ها همراه دکمه‌های تأیید/ردِ همین درخواست
        const ids = await adminIdsList();
        const caption =
          `📥 رسید واریز جدید\n` +
          `👤 کاربر: ${ctx.from.id}\n` +
          `👤 نام: ${user ? (user.full_name || '---') : '---'}\n` +
          `📱 تلفن: ${user ? (user.phone || '---') : '---'}\n` +
          `💳 کارت: ${user ? (user.card_number || '---') : '---'}\n` +
          `🔖 کد سفارش: ${trackCode}\n` +
          `💰 مبلغ: ${amount.toLocaleString('en-US')} تومان\n` +
          `🧾 نوع تراکنش: واریز کارت‌به‌کارت\n` +
          `🕐 ${R.formatDateTime(new Date())}`;
        for (const id of ids) {
          try {
            await ctx.telegram.sendPhoto(id, fileId, {
              caption,
              reply_markup: {
                inline_keyboard: [
                  [{ text: '✅ تأیید واریز', callback_data: `dep_ok:${reqId}` }],
                  [{ text: '❌ رد واریز', callback_data: `dep_no:${reqId}` }]
                ]
              }
            });
          } catch (e) { console.error('خطا در ارسال رسید به ادمین:', e.message); }
        }
        return;
      }

      if (session.flow === 'gold_verify') {
        const user = await getUser(ctx.from.id);
        const ids = await adminIdsList();
        for (const adminId of ids) {
          try {
            ctx.telegram.sendPhoto(adminId, fileId, {
              caption: `📸 مدارک احراز طلایی\n👤 ${user.full_name || '---'}\n🆔 \`${user.telegram_id}\`\n📱 ${user.phone || '---'}\n💳 ${user.card_number || '---'}`,
              parse_mode: 'Markdown'
            }).catch(console.error);
          } catch (e) { console.error(e); }
        }
        delete sessions[ctx.from.id];
        ctx.reply('✅ مدارک شما ارسال شد. پس از بررسی نتیجه اطلاع داده خواهد شد.');
        return;
      }

      return next();
    }
    return next();
  });
};
