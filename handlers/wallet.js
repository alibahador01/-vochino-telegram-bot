// handlers/wallet.js
const texts = require('../texts');
const { sessions } = require('../utils');
const { pool, getUser, updateUser, getUserCards, getTransactionLogs } = require('../db');
const { MIN_WITHDRAW } = require('../constants');

module.exports = function registerWalletHandlers(bot) {

  // ============================================
  // نمایش منوی «🎒 جیب» (کیف پول)
  // ============================================
  bot.action('menu_wallet', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const user = await getUser(ctx.from.id);
    const t = texts.fa; // فعلاً فارسی؛ در نسخه‌های بعدی چندزبانه می‌شود

    // محاسبه‌ی موجودی و اطلاعات
    const balance = user ? Number(user.balance) : 0;
    const bonusBalance = user ? Number(user.bonus_balance) : 0;
    const totalBalance = balance + bonusBalance;
    const name = user?.full_name || 'ناشناس';
    const phone = user?.phone || 'ثبت نشده';
    const card = user?.card_number || 'ثبت نشده';
    const level = user?.verification_status === 'gold' ? '🥇 طلایی' : (user?.verification_status === 'silver' ? '🥈 نقره‌ای' : 'مهمان');
    const inviteCount = user ? (await pool.query('SELECT COUNT(*)::int AS count FROM users WHERE referrer_id = $1', [String(ctx.from.id)])).rows[0].count : 0;
    const userId = ctx.from.id;

    const profileText =
      `🧢 پروفایل: \`${userId}\`\n` +
      `👤 نام: ${name}\n` +
      `📱 تلفن: ${phone}\n` +
      `💳 کارت: ${card}\n` +
      `💰 موجودی اصلی: ${balance.toLocaleString()} تومان\n` +
      `🪄 موجودی بونوس: ${bonusBalance.toLocaleString()} تومان\n` +
      `🎖 سطح احراز: ${level}\n` +
      `👥 افراد دعوت: ${inviteCount} نفر\n\n` +
      `💳 کیف پول من | Vochino⁰¹💎\n` +
      `✨ موجودی قابل استفاده: ${totalBalance.toLocaleString()} تومان`;

    const keyboard = [
      [{ text: '🧳 افزایش موجودی', callback_data: 'wallet_deposit' }],
      [{ text: '💸 برداشت موجودی', callback_data: 'wallet_withdraw' }],
      [{ text: '🪪 افزایش سقف خرید (احراز طلایی)', callback_data: 'wallet_gold_verify' }],
      [{ text: '💳 افزودن کارت جدید', callback_data: 'wallet_add_card' }],
      [{ text: '♻️ گزارش تراکنش‌ها', callback_data: 'wallet_history' }],
      [{ text: '🪄 کسب درآمد (دعوت)', callback_data: 'wallet_referral' }],
      [{ text: '🔴 بازگشت', callback_data: 'back_main_menu' }]
    ];

    ctx.reply(profileText, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    });
  });

  // ============================================
  // افزایش موجودی (شارژ)
  // ============================================
  bot.action('wallet_deposit', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const t = texts.fa;
    // نمایش روش‌های واریز
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
    const t = texts.fa;
    const cards = require('../constants').DEPOSIT_CARDS;
    let msg = t.depositCardsTrust + '\n\n';
    cards.forEach(c => {
      msg += `💳 ${c.number} (${c.owner})\n`;
    });
    ctx.reply(msg);
    // مرحله واریز را در session ذخیره می‌کنیم
    sessions[ctx.from.id] = {
      flow: 'deposit_card',
      step: 'waiting_amount',
      lang: 'fa'
    };
    ctx.reply(t.depositAskAmount);
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
  // برداشت موجودی
  // ============================================
  bot.action('wallet_withdraw', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const user = await getUser(ctx.from.id);
    if (!user || !user.card_number) {
      return ctx.reply('❌ ابتدا باید شماره کارت خود را ثبت کنید. از منوی جیب گزینه افزودن کارت را انتخاب کنید.');
    }

    sessions[ctx.from.id] = {
      flow: 'withdraw',
      step: 'waiting_amount',
      lang: 'fa'
    };

    ctx.reply(texts.fa.withdrawAskAmount);
  });

  // ============================================
  // احراز هویت طلایی (افزایش سقف خرید)
  // ============================================
  bot.action('wallet_gold_verify', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const user = await getUser(ctx.from.id);
    if (!user) return;

    const msg =
      `👤 کاربر گرامی: ${user.full_name || 'کاربر'}\n` +
      `💎 احراز هویت طلایی | Vochino⁰¹\n` +
      `🔐 یک قدم تا سقف خرید بالاتر\n` +
      `کافیست یک تصویر واضح و شفاف از 🪪 کارت ملی در کنار 💳 کارت بانکی ارسال نمایید.\n` +
      `✅ پس از بررسی توسط پشتیبانی و تأیید مدارک، درخواست افزایش سقف خرید شما انجام خواهد شد.\n` +
      `💛 Vochino⁰¹ | تجربه‌ای متفاوت`;

    // ست کردن session برای دریافت عکس
    sessions[ctx.from.id] = {
      flow: 'gold_verify',
      step: 'waiting_photo',
      lang: 'fa'
    };

    ctx.reply(msg);
  });

  // دریافت عکس برای احراز طلایی
  bot.on('photo', async (ctx, next) => {
    const session = sessions[ctx.from.id];
    if (!session || session.flow !== 'gold_verify' || session.step !== 'waiting_photo') return next();

    const user = await getUser(ctx.from.id);
    const fileId = ctx.message.photo.slice(-1)[0].file_id;

    // ارسال به تمام ادمین‌ها
    const ADMIN_IDS = require('../constants').ADMIN_IDS;
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
    ctx.reply('✅ مدارک شما ارسال شد. پس از بررسی نتیجه به شما اطلاع داده می‌شود.');
  });

  // دکمه‌های تأیید/رد ادمین برای احراز طلایی (در admin.js هم می‌تواند باشد، ولی اینجا می‌گذاریم)
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

  // ============================================
  // افزودن کارت جدید
  // ============================================
  bot.action('wallet_add_card', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    sessions[ctx.from.id] = {
      flow: 'add_card',
      step: 'waiting_number',
      lang: 'fa'
    };

    ctx.reply(texts.fa.addCardAsk);
  });

  // ============================================
  // گزارش تراکنش‌ها (۱۰ تراکنش اخیر)
  // ============================================
  bot.action('wallet_history', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const logs = await getTransactionLogs(ctx.from.id, 10);
    if (logs.length === 0) {
      return ctx.reply('📋 شما هنوز تراکنشی ندارید.');
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

    let text = '📋 **گزارش ۱۰ تراکنش اخیر**\n\n';
    logs.forEach(l => {
      const typeLabel = emojis[l.type] || l.type;
      text += `${typeLabel} | ${Number(l.amount).toLocaleString()} تومان\n`;
      text += `📎 کد پیگیری: ${l.tracking_code || '---'}\n`;
      text += `📅 ${new Date(l.created_at).toLocaleDateString('fa-IR')}\n\n`;
    });

    ctx.reply(text, { parse_mode: 'Markdown' });
  });

  // ============================================
  // کسب درآمد (لینک دعوت)
  // ============================================
  bot.action('wallet_referral', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const user = await getUser(ctx.from.id);
    if (!user) return;
    const refLink = `https://t.me/${ctx.botInfo.username}?start=${user.telegram_id}`;
    const inviteCount = (await pool.query('SELECT COUNT(*)::int AS count FROM users WHERE referrer_id = $1', [String(ctx.from.id)])).rows[0].count;

    ctx.reply(
      `🔗 لینک دعوت شما:\n${refLink}\n\n` +
      `👥 تعداد دعوت: ${inviteCount} نفر\n` +
      `💰 پاداش هر دعوت: طبق قوانین به موجودی شما اضافه می‌شود.`
    );
  });

  // ============================================
  // پردازش متن‌های ورودی (شارژ، برداشت، افزودن کارت)
  // ============================================
  bot.on('text', async (ctx, next) => {
    const session = sessions[ctx.from.id];
    if (!session) return next();

    // ---------- شارژ کارت به کارت ----------
    if (session.flow === 'deposit_card' && session.step === 'waiting_amount') {
      const amount = parseInt(ctx.message.text.replace(/[^0-9]/g, ''));
      if (!amount || amount <= 0) {
        return ctx.reply('❌ مبلغ نامعتبر. یک عدد وارد کنید:');
      }
      session.amount = amount;
      session.step = 'waiting_receipt';
      return ctx.reply(texts.fa.depositAskReceipt);
    }

    if (session.flow === 'deposit_card' && session.step === 'waiting_receipt') {
      // کاربر باید عکس رسید بفرستد؛ اما اینجا متن آمده
      return ctx.reply('📎 لطفاً تصویر رسید را ارسال کنید.');
    }

    // ---------- برداشت ----------
    if (session.flow === 'withdraw' && session.step === 'waiting_amount') {
      const amount = parseInt(ctx.message.text.replace(/[^0-9]/g, ''));
      const min = MIN_WITHDRAW;
      if (!amount || amount < min) {
        return ctx.reply(texts.fa.withdrawMinError);
      }
      const user = await getUser(ctx.from.id);
      if (amount > Number(user.balance)) {
        return ctx.reply('❌ موجودی شما کافی نیست.');
      }

      // ثبت درخواست در wallet_requests
      const trackCode = 'WD-' + Math.floor(Math.random() * 90000 + 10000);
      await pool.query(
        `INSERT INTO wallet_requests (telegram_id, type, amount, card_number, status, created_at, tracking_code)
         VALUES ($1, 'withdraw', $2, $3, 'pending', NOW(), $4)`,
        [String(ctx.from.id), amount, user.card_number, trackCode]
      );

      delete sessions[ctx.from.id];
      return ctx.reply(texts.fa.withdrawSubmitted + `\n🆔 کد پیگیری: ${trackCode}`);
    }

    // ---------- افزودن کارت ----------
    if (session.flow === 'add_card' && session.step === 'waiting_number') {
      let card = ctx.message.text.replace(/\s/g, '');
      if (!/^\d{16}$/.test(card)) {
        return ctx.reply(texts.fa.addCardInvalid);
      }

      // ذخیره شماره کارت در users و جدول cards
      await pool.query('UPDATE users SET card_number = $1 WHERE telegram_id = $2', [card, String(ctx.from.id)]);
      try {
        await pool.query('INSERT INTO cards (telegram_id, card_number) VALUES ($1, $2)', [String(ctx.from.id), card]);
      } catch (e) {}

      delete sessions[ctx.from.id];
      return ctx.reply(texts.fa.addCardSuccess);
    }

    return next();
  });

  // ============================================
  // دریافت عکس رسید برای شارژ
  // ============================================
  bot.on('photo', async (ctx, next) => {
    const session = sessions[ctx.from.id];
    if (!session || session.flow !== 'deposit_card' || session.step !== 'waiting_receipt') return next();

    const fileId = ctx.message.photo.slice(-1)[0].file_id;
    const amount = session.amount;

    // ثبت درخواست شارژ
    const trackCode = 'DP-' + Math.floor(Math.random() * 90000 + 10000);
    await pool.query(
      `INSERT INTO wallet_requests (telegram_id, type, amount, receipt_file_id, status, created_at, tracking_code)
       VALUES ($1, 'deposit', $2, $3, 'pending', NOW(), $4)`,
      [String(ctx.from.id), amount, fileId, trackCode]
    );

    delete sessions[ctx.from.id];
    ctx.reply(texts.fa.depositSubmitted + `\n🆔 کد پیگیری: ${trackCode}`);
  });
};
