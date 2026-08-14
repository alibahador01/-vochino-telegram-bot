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
    const { language } = user;

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

  bot.action('wallet_deposit', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    const user = await getUser(ctx.from.id);
    const { language } = user || {};
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
    const { language } = user || {};
    if (!user || !user.card_number) {
      return ctx.reply('❌ ابتدا باید شماره کارت خود را ثبت کنید. از منوی کیف پول گزینه «افزودن کارت جدید» را انتخاب کنید.');
    }

    sessions[ctx.from.id] = {
      flow: 'withdraw',
      step: 'waiting_amount',
      lang: language || 'fa'
    };
    
    return ctx.reply(`مبلغ برداشت خود را به تومان وارد کنید (حداقل ${MIN_WITHDRAW.toLocaleString('en-US')} تومان):`);
  });

  bot.action('wallet_gold_verify', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    const user = await getUser(ctx.from.id);
    const { language } = user || {};
    
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
      lang: language || 'fa'
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

  bot.action('wallet_history', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    return showTransactionHistory(ctx, null);
  });

  // ==================== تابع اصلی نمایش تاریخچه (جامع) ====================
  async function showTransactionHistory(ctx, filterType) {
    const userId = String(ctx.from.id);
    
    // ۱. گرفتن خریدها از جدول orders
    const ordersRes = await pool.query(
      `SELECT 'buy' as type, amount, status, tracking_code, created_at 
       FROM orders WHERE telegram_id = $1 
       ORDER BY created_at DESC LIMIT 20`,
      [userId]
    );
    
    // ۲. گرفتن فروش‌ها از جدول sell_orders
    const sellOrdersRes = await pool.query(
      `SELECT 'sell' as type, amount, status, tracking_code, created_at 
       FROM sell_orders WHERE telegram_id = $1 
       ORDER BY created_at DESC LIMIT 20`,
      [userId]
    );
    
    // ۳. گرفتن درخواست‌های کیف پول از wallet_requests
    const walletRes = await pool.query(
      `SELECT type, amount, status, tracking_code, created_at 
       FROM wallet_requests WHERE telegram_id = $1 
       ORDER BY created_at DESC LIMIT 20`,
      [userId]
    );
    
    // ۴. گرفتن تراکنش‌های تاییدشده از transaction_logs
    const logsRes = await getTransactionLogs(ctx.from.id, 20);
    
    // ترکیب همه منابع
    let allTransactions = [];
    
    // اضافه کردن خریدها
    ordersRes.rows.forEach(row => {
      allTransactions.push({
        type: 'buy',
        amount: Number(row.amount),
        status: row.status,
        tracking_code: row.tracking_code,
        created_at: row.created_at
      });
    });
    
    // اضافه کردن فروش‌ها
    sellOrdersRes.rows.forEach(row => {
      allTransactions.push({
        type: 'sell',
        amount: Number(row.amount),
        status: row.status,
        tracking_code: row.tracking_code,
        created_at: row.created_at
      });
    });
    
    // اضافه کردن درخواست‌های کیف پول
    walletRes.rows.forEach(row => {
      allTransactions.push({
        type: row.type, // 'deposit' یا 'withdraw'
        amount: Number(row.amount),
        status: row.status,
        tracking_code: row.tracking_code,
        created_at: row.created_at
      });
    });
    
    // اضافه کردن تراکنش‌های لاگ
    logsRes.forEach(row => {
      // جلوگیری از تکرار
      const alreadyExists = allTransactions.some(t => t.tracking_code === row.tracking_code);
      if (!alreadyExists) {
        allTransactions.push({
          type: row.type,
          amount: Number(row.amount),
          status: 'completed',
          tracking_code: row.tracking_code,
          created_at: row.created_at
        });
      }
    });
    
    // مرتب‌سازی بر اساس تاریخ (جدیدترین اول)
    allTransactions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    // فیلتر کردن اگر نیاز باشد
    let filtered = allTransactions;
    if (filterType) {
      filtered = allTransactions.filter(t => t.type === filterType);
    }
    
    if (filtered.length === 0) {
      return ctx.reply('📋 شما هنوز تراکنشی ندارید.');
    }
    
    // محدود کردن به ۱۰ تراکنش آخر
    const displayList = filtered.slice(0, 10);
    
    const emojis = {
      buy: '🟢 خرید',
      sell: '🟣 فروش',
      withdraw: '🔴 برداشت',
      deposit: '🟠 در حال انتظار',
      bonus: '🎁 بونوس',
      gift: '🎁 هدیه',
      refund: '♻️ بازگشت وجه',
      transfer: '🔄 انتقال'
    };
    
    const statusText = {
      pending: '🟠 در انتظار تایید',
      pending_delivery: '🟠 در انتظار تحویل',
      pending_review: '🟠 در انتظار بررسی',
      completed: '✅ تکمیل شده',
      approved: '✅ تایید شده',
      rejected: '❌ رد شده',
      cancelled: '❌ لغو شده'
    };
    
    let text = '📋 **گزارش تراکنش‌ها**\n\n';
    displayList.forEach(t => {
      const typeLabel = emojis[t.type] || t.type;
      const statusLabel = statusText[t.status] || t.status;
      text += `${typeLabel}: ${t.amount.toLocaleString('en-US')} تومان\n`;
      text += `   ${statusLabel}`;
      if (t.tracking_code) text += ` | کد: \`${t.tracking_code}\``;
      text += `\n   📅 ${new Date(t.created_at).toLocaleDateString('fa-IR')}\n\n`;
    });
    
    const filterButtons = [
      [{ text: '🟢 خرید', callback_data: 'wallet_history_filter_buy' },
       { text: '🟣 فروش', callback_data: 'wallet_history_filter_sell' }],
      [{ text: '🔴 برداشت', callback_data: 'wallet_history_filter_withdraw' },
       { text: '🔄 همه', callback_data: 'wallet_history' }],
      [{ text: '🔙 بازگشت', callback_data: 'menu_wallet' }]
    ];
    
    ctx.reply(text, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: filterButtons }
    });
  }

  bot.action('wallet_history_filter_buy', async ctx => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    return showTransactionHistory(ctx, 'buy');
  });

  bot.action('wallet_history_filter_sell', async ctx => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    return showTransactionHistory(ctx, 'sell');
  });

  bot.action('wallet_history_filter_withdraw', async ctx => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    return showTransactionHistory(ctx, 'withdraw');
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
        return ctx.reply(`❌ موجودی کیف پولت کافی نیست.\nمبلغ برداشت: ${amount.toLocaleString('en-US')} تومان\nموجودی فعلی: ${user.balance.toLocaleString('en-US')} تومان\n\nاول کیف پولت رو شارژ کن، بعد دوباره امتحان کن.`);
      }

      const trackCode = 'WD-' + Math.floor(Math.random() * 90000 + 10000);
      await pool.query(
        `INSERT INTO wallet_requests (telegram_id, type, amount, card_number, status, created_at, tracking_code)
         VALUES ($1, 'withdraw', $2, $3, 'pending', NOW(), $4)`,
        [String(ctx.from.id), amount, user.card_number, trackCode]
      );

      delete sessions[ctx.from.id];
      ctx.reply('درخواست برداشت شما ثبت شد ✅\nپس از بررسی توسط پشتیبانی، مبلغ به کارت شما واریز خواهد شد.\n\n📎 کد پیگیری: `' + trackCode + '`', { parse_mode: 'Markdown' });

      return ADMIN_IDS.forEach(id => ctx.telegram.sendMessage(id, `📤 درخواست برداشت\n👤 ${user.full_name} (${ctx.from.id})\n💰 ${amount.toLocaleString()} تومان\n💳 ${user.card_number}\n📎 کد: ${trackCode}`).catch(console.error));
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
        const trackCode = 'DP-' + Math.floor(Math.random() * 90000 + 10000);
        await pool.query(
          `INSERT INTO wallet_requests (telegram_id, type, amount, receipt_file_id, status, created_at, tracking_code)
           VALUES ($1, 'deposit', $2, $3, 'pending', NOW(), $4)`,
          [String(ctx.from.id), amount, fileId, trackCode]
        );

        delete sessions[ctx.from.id];
        ctx.reply('درخواست شارژ شما ثبت شد ✅\nپس از بررسی توسط پشتیبانی (معمولاً خیلی سریع)، موجودی شما به‌روزرسانی خواهد شد.\n\n📎 کد پیگیری: `' + trackCode + '`', { parse_mode: 'Markdown' });

        return ADMIN_IDS.forEach(id => ctx.telegram.sendPhoto(id, fileId, {
          caption: `📥 درخواست شارژ\n👤 ${ctx.from.id}\n💰 ${amount.toLocaleString()} تومان\n📎 کد: ${trackCode}`
        }).catch(console.error));
      }

      if (session.flow === 'gold_verify') {
        const user = await getUser(ctx.from.id);
        const fileId = ctx.message.photo.slice(-1)[0].file_id;

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
