// handlers/wallet.js
const texts = require('../texts');
const { sessions, showMainMenu, fillTemplate, generateTrackingCode } = require('../utils');
const { pool, getUser, updateUser, getUserCards, getTransactionLogs, logTransaction } = require('../db');
const { MIN_WITHDRAW, ADMIN_IDS } = require('../constants');

module.exports = function registerWalletHandlers(bot) {

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

  function maskCard(card) {
    if (!card) return 'ثبت نشده';
    const s = String(card).replace(/\s/g, '');
    return '•••• ' + s.slice(-4);
  }

  function formatDateTime(d) {
    try {
      return new Date(d).toLocaleString('fa-IR', { dateStyle: 'medium', timeStyle: 'short' });
    } catch (e) {
      return new Date(d).toLocaleString();
    }
  }

  // دریافت همه تراکنش‌های کاربر از ۳ جدول + مرتب‌سازی
  async function fetchUserTransactions(userId) {
    const list = [];

    try {
      const ordersRes = await pool.query(
        `SELECT o.id, 'buy' AS kind, o.product_type, p.name AS product_name, o.amount, o.commission, o.status, o.tracking_code, o.created_at
         FROM orders o LEFT JOIN products p ON o.product_type = p.key
         WHERE o.telegram_id = $1`,
        [userId]
      );
      ordersRes.rows.forEach(r => list.push({
        kind: 'buy', id: r.id, productName: r.product_name || r.product_type,
        amount: Number(r.amount || 0), commission: Number(r.commission || 0),
        status: r.status, tracking_code: r.tracking_code, created_at: r.created_at
      }));
    } catch (e) { console.log('خطا در خواندن orders:', e.message); }

    try {
      const sellRes = await pool.query(
        `SELECT s.id, 'sell' AS kind, s.product_type, sp.name AS product_name, s.amount, s.commission, s.status, s.tracking_code, s.created_at
         FROM sell_orders s LEFT JOIN sell_products sp ON s.product_type = sp.key
         WHERE s.telegram_id = $1`,
        [userId]
      );
      sellRes.rows.forEach(r => list.push({
        kind: 'sell', id: r.id, productName: r.product_name || r.product_type,
        amount: Number(r.amount || 0), commission: Number(r.commission || 0),
        status: r.status, tracking_code: r.tracking_code, created_at: r.created_at
      }));
    } catch (e) { console.log('خطا در خواندن sell_orders:', e.message); }

    try {
      const walletRes = await pool.query(
        `SELECT id, type, amount, status, tracking_code, created_at, card_number
         FROM wallet_requests WHERE telegram_id = $1`,
        [userId]
      );
      walletRes.rows.forEach(r => list.push({
        kind: r.type, id: r.id, productName: null,
        amount: Number(r.amount || 0), commission: 0,
        status: r.status, tracking_code: r.tracking_code, created_at: r.created_at, card_number: r.card_number
      }));
    } catch (e) { console.log('خطا در خواندن wallet_requests:', e.message); }

    list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return list;
  }

  // ساخت متن دکمه هر تراکنش
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

    if (list.length === 0) {
      return ctx.reply('📋 شما هنوز تراکنشی ندارید.');
    }

    const recent = list.slice(0, 10);
    const buttons = recent.map(t => [{ text: buttonLabel(t), callback_data: `tx_detail:${t.kind}:${t.id}` }]);
    buttons.push([{ text: '🔙 بازگشت', callback_data: 'menu_wallet' }]);

    ctx.reply('🧾 **گزارش تراکنش‌های شما**\n\nبرای مشاهده جزئیات، روی هر تراکنش بزنید:', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons }
    });
  }

  // ==================== جزئیات هر تراکنش (با بررسی مالکیت) ====================
  bot.action(/^tx_detail:(\w+):(\d+)$/, async (ctx) => {
    ctx.answerCbQuery();
    const kind = ctx.match[1];
    const id = parseInt(ctx.match[2], 10);
    const userId = String(ctx.from.id);

    // ---------- خرید ----------
    if (kind === 'buy') {
      const res = await pool.query(
        `SELECT o.*, p.name AS product_name FROM orders o LEFT JOIN products p ON o.product_type = p.key
         WHERE o.id = $1 AND o.telegram_id = $2`,
        [id, userId]
      );
      if (res.rows.length === 0) return ctx.reply('⚠️ تراکنش یافت نشد یا متعلق به شما نیست.');
      const t = res.rows[0];
      const st = statusInfo(t.status);
      const paid = Number(t.amount || 0);
      const commission = Number(t.commission || 0);
      const base = paid - commission;

      if (st.label === 'رد شده') {
        return ctx.reply(
          `📋 جزئیات سفارش\n\n` +
          `♨️ نوع سفارش: خرید ${t.product_name || t.product_type || ''}\n` +
          `💰 مبلغ سفارش: ${base.toLocaleString('en-US')} تومان\n` +
          `💵 کارمزد: ${commission.toLocaleString('en-US')} تومان\n\n` +
          `⏳ وضعیت سفارش: 🔴 رد شده\n\n` +
          `📍 شماره سفارش: ${t.tracking_code}\n\n` +
          `❌ دلیل رد سفارش:\nاطلاعات سفارش مورد تأیید قرار نگرفت.\n\n` +
          `🕐 تاریخ و ساعت: ${formatDateTime(t.created_at)}`
        );
      }

      let msg =
        `📋 مشخصات خرید شما\n\n` +
        `🛒 نوع سفارش: خرید ${t.product_name || t.product_type || ''}\n` +
        `💰 مبلغ خرید: ${base.toLocaleString('en-US')} تومان\n` +
        `💵 کارمزد: ${commission.toLocaleString('en-US')} تومان\n` +
        `💳 مبلغ پرداختی: ${paid.toLocaleString('en-US')} تومان\n\n` +
        `⏳ وضعیت سفارش: ${st.emoji} ${st.label}\n\n` +
        `📍 پیگیری سفارش: ${t.tracking_code}\n`;

      if (t.delivered_code || t.voucher_code) {
        msg += `\n🎟️ کد ووچر:\n${t.delivered_code || t.voucher_code}\n`;
      }
      if (t.provider_tx_id) {
        msg += `\n🔐 هش ووچر:\n${t.provider_tx_id}\n`;
      }

      msg += `\n🕐 تاریخ و ساعت: ${formatDateTime(t.created_at)}\n\n━━━━━━━━━━━━━━━━\n💎 ووچینو⁰¹ | رسید خرید`;
      return ctx.reply(msg);
    }

    // ---------- فروش ----------
    if (kind === 'sell') {
      const res = await pool.query(
        `SELECT s.*, sp.name AS product_name FROM sell_orders s LEFT JOIN sell_products sp ON s.product_type = sp.key
         WHERE s.id = $1 AND s.telegram_id = $2`,
        [id, userId]
      );
      if (res.rows.length === 0) return ctx.reply('⚠️ تراکنش یافت نشد یا متعلق به شما نیست.');
      const t = res.rows[0];
      const st = statusInfo(t.status);
      const amount = Number(t.amount || 0);
      const commission = Number(t.commission || 0);
      const received = amount - commission;
      const user = await getUser(userId);

      if (st.label === 'رد شده') {
        return ctx.reply(
          `📋 جزئیات سفارش\n\n` +
          `♨️ نوع سفارش: فروش ${t.product_name || t.product_type || ''}\n` +
          `💰 مبلغ سفارش: ${amount.toLocaleString('en-US')} تومان\n` +
          `💵 کارمزد: ${commission.toLocaleString('en-US')} تومان\n\n` +
          `⏳ وضعیت سفارش: 🔴 رد شده\n\n` +
          `📍 شماره سفارش: ${t.tracking_code}\n\n` +
          `❌ دلیل رد سفارش:\nاطلاعات سفارش مورد تأیید قرار نگرفت.\n\n` +
          `🕐 تاریخ و ساعت: ${formatDateTime(t.created_at)}`
        );
      }

      const msg =
        `📋 مشخصات فروش شما\n\n` +
        `♨️ نوع فروش: ${t.product_name || t.product_type || ''}\n` +
        `💰 مبلغ فروش: ${amount.toLocaleString('en-US')} تومان\n` +
        `💵 کارمزد: ${commission.toLocaleString('en-US')} تومان\n` +
        `💳 مبلغ دریافتی: ${received.toLocaleString('en-US')} تومان\n\n` +
        `⏳ وضعیت فروش: ${st.emoji} ${st.label}\n\n` +
        `📍 پیگیری سفارش: ${t.tracking_code}\n` +
        `🔥 کارت بانکی: ${maskCard(user ? user.card_number : null)}\n\n` +
        `🕐 تاریخ و ساعت: ${formatDateTime(t.created_at)}`;
      return ctx.reply(msg);
    }

    // ---------- برداشت / شارژ ----------
    if (kind === 'withdraw' || kind === 'deposit') {
      const res = await pool.query(
        `SELECT * FROM wallet_requests WHERE id = $1 AND telegram_id = $2`,
        [id, userId]
      );
      if (res.rows.length === 0) return ctx.reply('⚠️ تراکنش یافت نشد یا متعلق به شما نیست.');
      const t = res.rows[0];
      const st = statusInfo(t.status);
      const amount = Number(t.amount || 0);

      if (st.label === 'رد شده') {
        return ctx.reply(
          `📋 جزئیات سفارش\n\n` +
          `♨️ نوع سفارش: ${t.type === 'withdraw' ? 'برداشت موجودی' : 'شارژ موجودی'}\n` +
          `💰 مبلغ سفارش: ${amount.toLocaleString('en-US')} تومان\n` +
          `💵 کارمزد: 0 تومان\n\n` +
          `⏳ وضعیت سفارش: 🔴 رد شده\n\n` +
          `📍 شماره سفارش: ${t.tracking_code}\n\n` +
          `❌ دلیل رد سفارش:\nاطلاعات سفارش مورد تأیید قرار نگرفت.\n\n` +
          `🕐 تاریخ و ساعت: ${formatDateTime(t.created_at)}`
        );
      }

      if (t.type === 'withdraw') {
        const msg =
          `📋 مشخصات برداشت شما\n\n` +
          `💸 نوع عملیات: برداشت موجودی\n` +
          `💰 مبلغ برداشت: ${amount.toLocaleString('en-US')} تومان\n` +
          `💵 کارمزد برداشت: 0 تومان\n` +
          `💳 مبلغ واریزی: ${amount.toLocaleString('en-US')} تومان\n\n` +
          `⏳ وضعیت برداشت: ${st.emoji} ${st.label}\n\n` +
          `📍 شماره سفارش: ${t.tracking_code}\n` +
          `🔥 کارت بانکی: ${maskCard(t.card_number)}\n\n` +
          `🕐 تاریخ و ساعت: ${formatDateTime(t.created_at)}`;
        return ctx.reply(msg);
      }

      const msg =
        `📋 مشخصات شارژ شما\n\n` +
        `💰 مبلغ شارژ: ${amount.toLocaleString('en-US')} تومان\n\n` +
        `⏳ وضعیت شارژ: ${st.emoji} ${st.label}\n\n` +
        `📍 شماره سفارش: ${t.tracking_code}\n\n` +
        `🕐 تاریخ و ساعت: ${formatDateTime(t.created_at)}`;
      return ctx.reply(msg);
    }

    return ctx.reply('⚠️ نوع تراکنش ناشناخته است.');
  });

  // ==================== بقیه بخش‌های کیف پول ====================

  bot.action('wallet_deposit', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    return ctx.reply('روش افزایش موجودی را انتخاب کنید:', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '💳 کارت به کارت', callback_data: 'deposit_card' }],
          [{ text: '🪙 ترون (تتر)', callback_data: 'deposit_crypto' }],
          [{ text: '🌐 درگاه پرداخت', callback_data: 'deposit_gateway' }],
          [{ text: '🔙 بازگشت', callback_data: 'menu_wallet' }]
        ]
      }
    });
  });

  bot.action('deposit_card', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    const cards = require('../constants').DEPOSIT_CARDS;
    let msg = '✅ پرداخت شما مستقیماً و بدون واسطه به حساب رسمی مجموعه واریز می‌شود.\n💚 هزاران کاربر با خیال راحت از این روش استفاده کرده‌اند.\n\nلطفاً مبلغ واریزی خود را به یکی از کارت‌های زیر واریز کنید:\n';
    cards.forEach(c => {
      msg += `💳 ${c.number} (${c.owner})\n`;
    });

    const user = await getUser(ctx.from.id);
    sessions[ctx.from.id] = {
      flow: 'deposit_card',
      step: 'waiting_amount',
      lang: (user && user.language) || 'fa'
    };

    return ctx.reply(msg, { parse_mode: 'Markdown' })
      .then(sent => {
        sessions[ctx.from.id].lastBotMsgId = sent.message_id;
        return ctx.reply('مبلغ واریزی خود را به تومان وارد کنید:');
      })
      .catch(console.error);
  });

  bot.action('deposit_crypto', async (ctx) => {
    ctx.answerCbQuery();
    return ctx.reply('🪙 بخش ارز دیجیتال به‌زودی فعال می‌شود.');
  });

  bot.action('deposit_gateway', async (ctx) => {
    ctx.answerCbQuery();
    return ctx.reply('🌐 درگاه پرداخت به‌زودی فعال می‌شود.');
  });

  bot.action('wallet_withdraw', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    const user = await getUser(ctx.from.id);
    if (!user || !user.card_number) {
      return ctx.reply('❌ ابتدا باید شماره کارت خود را ثبت کنید. از منوی کیف پول گزینه «افزودن کارت جدید» را انتخاب کنید.');
    }

    sessions[ctx.from.id] = {
      flow: 'withdraw',
      step: 'waiting_amount',
      lang: (user && user.language) || 'fa'
    };

    return ctx.reply(`مبلغ برداشت خود را به تومان وارد کنید (حداقل ${MIN_WITHDRAW.toLocaleString('en-US')} تومان):`);
  });

  bot.action('wallet_gold_verify', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const msg =
      `💎 احراز هویت طلایی | Vochino⁰¹\n` +
      `🔐 یک قدم تا سقف خرید بالاتر\n` +
      `کافیست یک تصویر واضح و شفاف از\n` +
      `🪪 کارت ملی در کنار 💳 کارت بانکی\n` +
      `ارسال نمایید.\n` +
      `✅ پس از بررسی توسط پشتیبانی و تأیید مدارک، درخواست افزایش سقف خرید شما انجام خواهد شد.\n\n` +
      `💛 Vochino⁰¹ | تجربه‌ای متفاوت`;

    sessions[ctx.from.id] = {
      flow: 'gold_verify',
      step: 'waiting_photo',
      lang: 'fa'
    };

    return ctx.reply(msg, { parse_mode: 'Markdown' });
  });

  bot.action('wallet_add_card', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    const user = await getUser(ctx.from.id);
    sessions[ctx.from.id] = {
      flow: 'add_card',
      step: 'waiting_number',
      lang: (user && user.language) || 'fa'
    };

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
      { parse_mode: 'Markdown' }
    );
  });

  bot.on('text', async (ctx, next) => {
    const session = sessions[ctx.from.id];
    if (!session) return next();

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

      return ADMIN_IDS.forEach(id => ctx.telegram.sendMessage(id, `📤 درخواست برداشت\n👤 ${user.full_name} (${ctx.from.id})\n💰 ${amount.toLocaleString()} تومان\n💳 ${user.card_number}\n📍 کد: ${trackCode}`).catch(console.error));
    }

    if (session.flow === 'add_card' && session.step === 'waiting_number') {
      let card = ctx.message.text.replace(/\s/g, '');
      if (!/^\d{16}$/.test(card)) {
        return ctx.reply('❌ شماره کارت نامعتبر. ۱۶ رقم وارد کنید:');
      }

      await pool.query('UPDATE users SET card_number = $1 WHERE telegram_id = $2', [card, String(ctx.from.id)]);
      try {
        await pool.query('INSERT INTO cards (telegram_id, card_number) VALUES ($1, $2)', [String(ctx.from.id), card]);
      } catch (e) {}

      delete sessions[ctx.from.id];
      ctx.reply('کارت جدید با موفقیت ثبت شد ✅');
      return;
    }

    return next();
  });

  bot.on('photo', async (ctx, next) => {
    const session = sessions[ctx.from.id];
    if (!session) return next();

    if ((session.flow === 'deposit_card' || session.flow === 'gold_verify') && session.step === 'waiting_photo') {
      const fileId = ctx.message.photo.slice(-1)[0].file_id;
      if (session.flow === 'deposit_card') {
        const amount = session.amount;
        const trackCode = 'VOC-' + Math.floor(1000000 + Math.random() * 9000000);
        await pool.query(
          `INSERT INTO wallet_requests (telegram_id, type, amount, receipt_file_id, status, created_at, tracking_code)
           VALUES ($1, 'deposit', $2, $3, 'pending', NOW(), $4)`,
          [String(ctx.from.id), amount, fileId, trackCode]
        );

        delete sessions[ctx.from.id];
        ctx.reply(`درخواست شارژ شما ثبت شد ✅\nپس از بررسی توسط پشتیبانی (معمولاً خیلی سریع)، موجودی شما به‌روزرسانی خواهد شد.\n\n📍 کد پیگیری: \`${trackCode}\``, { parse_mode: 'Markdown' });

        return ADMIN_IDS.forEach(id => ctx.telegram.sendPhoto(id, fileId, {
          caption: `📥 درخواست شارژ\n👤 ${ctx.from.id}\n💰 ${amount.toLocaleString()} تومان\n📍 کد: ${trackCode}`
        }).catch(console.error));
      }

      if (session.flow === 'gold_verify') {
        const user = await getUser(ctx.from.id);

        for (const adminId of ADMIN_IDS) {
          try {
            ctx.telegram.sendPhoto(
              adminId,
              fileId,
              {
                caption: `📸 مدارک احراز طلایی\n👤 ${user.full_name || '---'}\n🆔 \`${user.telegram_id}\`\n📱 ${user.phone || '---'}\n💳 ${user.card_number || '---'}`,
                parse_mode: 'Markdown'
              }
            ).catch(console.error);
          } catch (e) {
            console.error(e);
          }
        }

        delete sessions[ctx.from.id];
        ctx.reply('✅ مدارک شما ارسال شد. پس از بررسی نتیجه اطلاع داده خواهد شد.');
        return;
      }

      return next();
    }
  });
};
