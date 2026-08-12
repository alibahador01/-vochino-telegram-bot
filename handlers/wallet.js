// handlers/wallet.js
const texts = require('../texts');
const { sessions, showMainMenu } = require('../utils');
const { pool, getUser, updateUser, getUserCards, getTransactionLogs, logTransaction } = require('../db');
const { MIN_WITHDRAW, ADMIN_IDS } = require('../constants');

module.exports = function registerWalletHandlers(bot) {

  // ============================================
  // 📍 منوی اصلی «جیب» (wallet)
  // ============================================
  bot.action('menu_wallet', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    await showWalletPage(ctx);
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
      `🧢 پروفایل: \`${ctx.from.id}\`\n` +
      `👤 نام: ${name}\n` +
      `📱 تلفن: ${phone}\n` +
      `💳 کارت: ${card}\n` +
      `💰 موجودی: ${balance.toLocaleString()} تومان\n` +
      `🪄 بونوس: ${bonusBalance.toLocaleString()} تومان\n` +
      `🎖 سطح احراز: ${level}\n` +
      `👥 دعوت‌شده: ${inviteCount} نفر`;

    const keyboard = [
      [{ text: '🧳 افزایش موجودی', callback_data: 'wallet_deposit' }],
      [{ text: '💸 برداشت موجودی', callback_data: 'wallet_withdraw' }],
      [{ text: '🪪 افزایش سقف خرید', callback_data: 'wallet_gold_verify' }],
      [{ text: '💳 افزودن کارت جدید', callback_data: 'wallet_add_card' }],
      [{ text: '♻️ گزارش تراکنش‌ها', callback_data: 'wallet_history' }],
      [{ text: '🪄 کسب درآمد', callback_data: 'wallet_referral' }],
      [{ text: '🔴 بازگشت', callback_data: 'back_main_menu' }]
    ];

    ctx.reply(profileText, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    });
  }

  // ============================================
  // 💰 افزایش موجودی (شارژ)
  // ============================================
  bot.action('wallet_deposit', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    const t = texts.fa;
    ctx.reply(t.depositMethodTitle, {
      reply_markup: {
        inline_keyboard: [
          [{ text: t.depositCard2Card, callback_data: 'deposit_card' }],
          [{ text: t.depositTron, callback_data: 'deposit_crypto' }],
          [{ text: t.depositGateway, callback_data: 'deposit_gateway' }],
          [{ text: t.backButton, callback_data: 'menu_wallet' }]
        ]
      }
    });
  });

  bot.action('deposit_card', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    const cards = require('../constants').DEPOSIT_CARDS;
    let msg = '✅ پرداخت شما مستقیماً به حساب رسمی واریز می‌شود.\n💚 هزاران کاربر با خیال راحت از این روش استفاده کرده‌اند.\n\nلطفاً مبلغ واریزی خود را به یکی از کارت‌های زیر واریز کنید:\n\n';
    cards.forEach(c => {
      msg += `💳 ${c.number} (${c.owner})\n`;
    });

    sessions[ctx.from.id] = {
      flow: 'deposit_card',
      step: 'waiting_amount',
      lang: 'fa'
    };
    ctx.reply(msg);
    ctx.reply('📝 حالا مبلغ واریزی را به تومان وارد کنید:');
  });

  bot.action('deposit_crypto', async (ctx) => {
    ctx.answerCbQuery();
    ctx.reply('🪙 بخش ارز دیجیتال به‌زودی فعال می‌شود.');
  });

  bot.action('deposit_gateway', async (ctx) => {
    ctx.answerCbQuery();
    ctx.reply('🌐 درگاه پرداخت به‌زودی فعال می‌شود.');
  });

  // ============================================
  // 💸 برداشت موجودی
  // ============================================
  bot.action('wallet_withdraw', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    const user = await getUser(ctx.from.id);
    if (!user || !user.card_number) {
      return ctx.reply('❌ ابتدا باید شماره کارت خود را ثبت کنید. از منوی جیب گزینه «افزودن کارت جدید» را انتخاب کنید.');
    }

    sessions[ctx.from.id] = {
      flow: 'withdraw',
      step: 'waiting_amount',
      lang: 'fa'
    };
    ctx.reply('💸 مبلغ برداشت را به تومان وارد کنید (حداقل ' + MIN_WITHDRAW.toLocaleString() + ' تومان):');
  });

  // ============================================
  // 🛡️ افزایش سقف خرید (احراز طلایی)
  // ============================================
  bot.action('wallet_gold_verify', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const user = await getUser(ctx.from.id);
    if (!user) return;

    const msg =
      `👤 کاربر گرامی: ${user.full_name || 'کاربر'}\n\n` +
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

    ctx.reply(msg);
  });

  // ============================================
  // 💳 افزودن کارت جدید
  // ============================================
  bot.action('wallet_add_card', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    sessions[ctx.from.id] = {
      flow: 'add_card',
      step: 'waiting_number',
      lang: 'fa'
    };

    ctx.reply('💳 لطفاً شماره کارت ۱۶ رقمی را وارد کنید:');
  });

  // ============================================
  // ♻️ گزارش تراکنش‌ها
  // ============================================
  bot.action('wallet_history', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    await showTransactionHistory(ctx, null);
  });

  async function showTransactionHistory(ctx, filterType) {
    const logs = await getTransactionLogs(ctx.from.id, 10);
    if (logs.length === 0) {
      return ctx.reply('📋 شما هنوز تراکنشی ندارید.');
    }

    const filtered = filterType ? logs.filter(l => l.type === filterType) : logs;
    if (filtered.length === 0) {
      return ctx.reply('📋 تراکنشی با این فیلتر یافت نشد.');
    }

    const emojis = {
      buy: '🟢 خرید',
      sell: '🟣 فروش',
      withdraw: '🔴 برداشت',
      deposit: '🟢 واریز',
      bonus: '🎁 بونوس',
      gift: '🎁 هدیه',
      refund: '🔄 بازگشت'
    };

    let text = '📋 **گزارش تراکنش‌ها**\n\n';
    filtered.forEach(l => {
      const typeLabel = emojis[l.type] || l.type;
      text += `${typeLabel} | ${Number(l.amount).toLocaleString()} تومان\n`;
      if (l.tracking_code) text += `📎 کد: ${l.tracking_code}\n`;
      text += `📅 ${new Date(l.created_at).toLocaleDateString('fa-IR')}\n\n`;
    });

    const filterButtons = [
      [{ text: '🟢 خرید', callback_data: 'wallet_history_filter_buy' },
       { text: '🟣 فروش', callback_data: 'wallet_history_filter_sell' }],
      [{ text: '🔴 برداشت', callback_data: 'wallet_history_filter_withdraw' }],
      [{ text: '🔄 همه', callback_data: 'wallet_history' },
       { text: '🔙 بازگشت', callback_data: 'menu_wallet' }]
    ];

    ctx.reply(text, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: filterButtons }
    });
  }

  bot.action('wallet_history_filter_buy', async ctx => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    await showTransactionHistory(ctx, 'buy');
  });
  bot.action('wallet_history_filter_sell', async ctx => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    await showTransactionHistory(ctx, 'sell');
  });
  bot.action('wallet_history_filter_withdraw', async ctx => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    await showTransactionHistory(ctx, 'withdraw');
  });

  // ============================================
  // 🪄 کسب درآمد (لینک دعوت)
  // ============================================
  bot.action('wallet_referral', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const user = await getUser(ctx.from.id);
    if (!user) return;
    const refLink = `https://t.me/${ctx.botInfo.username}?start=${user.telegram_id}`;
    const inviteRes = await pool.query('SELECT COUNT(*)::int AS count FROM users WHERE referrer_id = $1', [String(ctx.from.id)]);
    const count = inviteRes.rows[0].count;

    ctx.reply(
      `🔗 لینک دعوت شما:\n${refLink}\n\n` +
      `👥 تعداد دعوت: ${count} نفر\n` +
      `💰 پاداش هر دعوت: طبق قوانین به موجودی شما اضافه می‌شود.`
    );
  });

  // ============================================
  // 📩 پردازش متن‌های ورودی (مبالغ، شماره کارت، ...)
  // ============================================
  bot.on('text', async (ctx, next) => {
    const session = sessions[ctx.from.id];
    if (!session) return next();

    // ---- شارژ: دریافت مبلغ ----
    if (session.flow === 'deposit_card' && session.step === 'waiting_amount') {
      const amount = parseInt(ctx.message.text.replace(/[^0-9]/g, ''));
      if (!amount || amount <= 0) {
        return ctx.reply('❌ مبلغ نامعتبر. یک عدد وارد کنید:');
      }
      session.amount = amount;
      session.step = 'waiting_receipt';
      return ctx.reply('📎 حالا رسید (فیش) پرداخت را ارسال کنید:');
    }

    // ---- برداشت: دریافت مبلغ ----
    if (session.flow === 'withdraw' && session.step === 'waiting_amount') {
      const amount = parseInt(ctx.message.text.replace(/[^0-9]/g, ''));
      const min = MIN_WITHDRAW;
      if (!amount || amount < min) {
        return ctx.reply('❌ حداقل مبلغ برداشت ' + min.toLocaleString() + ' تومان است.');
      }
      const user = await getUser(ctx.from.id);
      if (amount > Number(user.balance)) {
        return ctx.reply('❌ موجودی شما کافی نیست.');
      }

      // ایجاد درخواست برداشت
      const trackCode = 'WD-' + Math.floor(Math.random() * 90000 + 10000);
      await pool.query(
        `INSERT INTO wallet_requests (telegram_id, type, amount, card_number, status, created_at, tracking_code)
         VALUES ($1, 'withdraw', $2, $3, 'pending', NOW(), $4)`,
        [String(ctx.from.id), amount, user.card_number, trackCode]
      );

      delete sessions[ctx.from.id];
      ctx.reply('✅ درخواست برداشت شما ثبت شد.\n🆔 کد پیگیری: ' + trackCode);
      // اطلاع به ادمین
      for (const adminId of ADMIN_IDS) {
        try {
          ctx.telegram.sendMessage(adminId, `📤 درخواست برداشت\n👤 ${user.full_name} (${ctx.from.id})\n💰 ${amount.toLocaleString()} تومان\n💳 ${user.card_number}`);
        } catch (e) {}
      }
      return;
    }

    // ---- افزودن کارت ----
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
      ctx.reply('✅ کارت جدید ثبت شد.');
      return;
    }

    return next();
  });

  // ============================================
  // 📎 دریافت عکس (رسید شارژ یا احراز طلایی)
  // ============================================
  bot.on('photo', async (ctx, next) => {
    const session = sessions[ctx.from.id];
    if (!session) return next();

    // ---- رسید شارژ ----
    if (session.flow === 'deposit_card' && session.step === 'waiting_receipt') {
      const fileId = ctx.message.photo.slice(-1)[0].file_id;
      const amount = session.amount;

      const trackCode = 'DP-' + Math.floor(Math.random() * 90000 + 10000);
      await pool.query(
        `INSERT INTO wallet_requests (telegram_id, type, amount, receipt_file_id, status, created_at, tracking_code)
         VALUES ($1, 'deposit', $2, $3, 'pending', NOW(), $4)`,
        [String(ctx.from.id), amount, fileId, trackCode]
      );

      delete sessions[ctx.from.id];
      ctx.reply('✅ درخواست شارژ شما ثبت شد.\n🆔 کد پیگیری: ' + trackCode);
      // اطلاع به ادمین
      for (const adminId of ADMIN_IDS) {
        try {
          await ctx.telegram.sendPhoto(adminId, fileId, {
            caption: `📥 درخواست شارژ\n👤 ${ctx.from.id}\n💰 ${amount.toLocaleString()} تومان`
          });
        } catch (e) {}
      }
      return;
    }

    // ---- احراز طلایی ----
    if (session.flow === 'gold_verify' && session.step === 'waiting_photo') {
      const user = await getUser(ctx.from.id);
      const fileId = ctx.message.photo.slice(-1)[0].file_id;

      // ارسال به تمام ادمین‌ها
      for (const adminId of ADMIN_IDS) {
        try {
          await ctx.telegram.sendPhoto(adminId, fileId, {
            caption: `📸 مدارک احراز طلایی\n👤 ${user.full_name || '---'}\n🆔 \`${user.telegram_id}\`\n📱 ${user.phone || '---'}\n💳 ${user.card_number || '---'}`,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '✅ تأیید', callback_data: `admin_gold_approve_${user.telegram_id}` },
                  { text: '❌ رد', callback_data: `admin_gold_reject_${user.telegram_id}` }
                ]
              ]
            }
          });
        } catch (e) {}
      }

      delete sessions[ctx.from.id];
      ctx.reply('✅ مدارک شما ارسال شد. پس از بررسی نتیجه اطلاع داده می‌شود.');
      return;
    }

    return next();
  });

  // ============================================
  // ⚙️ تأیید/رد احراز طلایی توسط ادمین
  // ============================================
  bot.action(/^admin_gold_approve_(.+)/, async (ctx) => {
    const targetId = ctx.match[1];
    await pool.query("UPDATE users SET verification_status = 'gold' WHERE telegram_id = $1", [targetId]);
    ctx.answerCbQuery('✅ تأیید شد');
    try { await ctx.deleteMessage(); } catch (e) {}
    ctx.telegram.sendMessage(targetId, '🎉 احراز هویت طلایی شما تأیید شد!');
  });

  bot.action(/^admin_gold_reject_(.+)/, async (ctx) => {
    const targetId = ctx.match[1];
    ctx.answerCbQuery('❌ رد شد');
    try { await ctx.deleteMessage(); } catch (e) {}
    ctx.telegram.sendMessage(targetId, '❌ متأسفانه درخواست احراز طلایی شما رد شد. لطفاً دوباره تلاش کنید.');
  });

};
