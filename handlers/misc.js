// handlers/misc.js
const texts = require('../texts');
const { sessions, showMainMenu } = require('../utils');
const { pool, getUser, getUserById, getAllUsers } = require('../db');
const { ADMIN_IDS } = require('../constants');

function isAdmin(telegramId) {
  return ADMIN_IDS.indexOf(Number(telegramId)) !== -1;
}

module.exports = function registerMiscHandlers(bot) {

  // ============================================
  // بازگشت به منوی اصلی
  // ============================================
  bot.action('back_main_menu', async (ctx) => {
    ctx.answerCbQuery();
    delete sessions[ctx.from.id];
    try { await ctx.deleteMessage(); } catch (e) {}
    showMainMenu(ctx);
  });

  // ============================================
  // لغو عملیات جاری
  // ============================================
  bot.action('cancel_flow', async (ctx) => {
    ctx.answerCbQuery();
    delete sessions[ctx.from.id];
    try { await ctx.deleteMessage(); } catch (e) {}
    showMainMenu(ctx);
  });

  // ============================================
  // پروفایل کاربر
  // ============================================
  bot.action('menu_profile', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const user = await getUser(ctx.from.id);
    if (!user) {
      ctx.reply('⚠️ اطلاعاتی برای شما ثبت نشده است. لطفاً /start را بزنید.');
      return;
    }

    const lang = user.language || 'fa';
    const level = user.verification_status === 'gold' ? '🥇 طلایی' : (user.verification_status === 'silver' ? '🥈 نقره‌ای' : '⚪ مهمان');
    const inviteCount = await pool.query('SELECT COUNT(*)::int AS count FROM users WHERE referrer_id = $1', [String(ctx.from.id)]);

    const profileTexts = {
      fa: `👤 **پروفایل کاربر**\n\n🆔 آیدی: \`${user.telegram_id}\`\n👤 نام: ${user.full_name || 'ثبت نشده'}\n📱 تلفن: ${user.phone || 'ثبت نشده'}\n💳 کارت: ${user.card_number || 'ثبت نشده'}\n💰 موجودی: ${Number(user.balance).toLocaleString()} تومان\n🎁 بونوس: ${Number(user.bonus_balance || 0).toLocaleString()} تومان\n🎖 سطح احراز: ${level}\n👥 دعوت: ${inviteCount.rows[0].count} نفر\n📅 ثبت‌نام: ${user.registered_at ? new Date(user.registered_at).toLocaleDateString('fa-IR') : 'نامشخص'}`,
      en: `👤 **Profile**\n\n🆔 ID: \`${user.telegram_id}\`\n👤 Name: ${user.full_name || 'N/A'}\n📱 Phone: ${user.phone || 'N/A'}\n💳 Card: ${user.card_number || 'N/A'}\n💰 Balance: ${Number(user.balance).toLocaleString()} Toman\n🎁 Bonus: ${Number(user.bonus_balance || 0).toLocaleString()} Toman\n🎖 Verification: ${level}\n👥 Invites: ${inviteCount.rows[0].count}\n📅 Registered: ${user.registered_at ? new Date(user.registered_at).toLocaleDateString('en-US') : 'N/A'}`,
      tr: `👤 **Profil**\n\n🆔 ID: \`${user.telegram_id}\`\n👤 İsim: ${user.full_name || 'Yok'}\n📱 Telefon: ${user.phone || 'Yok'}\n💳 Kart: ${user.card_number || 'Yok'}\n💰 Bakiye: ${Number(user.balance).toLocaleString()} Tümen\n🎁 Bonus: ${Number(user.bonus_balance || 0).toLocaleString()} Tümen\n🎖 Doğrulama: ${level}\n👥 Davet: ${inviteCount.rows[0].count}\n📅 Kayıt: ${user.registered_at ? new Date(user.registered_at).toLocaleDateString('tr-TR') : 'Yok'}`
    };

    ctx.reply(profileTexts[lang] || profileTexts.fa, { parse_mode: 'Markdown' });
  });

  // ============================================
  // پشتیبانی (تیکتینگ)
  // ============================================
  bot.action('menu_support', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const t = texts.fa;
    ctx.reply('📞 **پشتیبانی ووچینو⁰¹**\n\nلطفاً گزینه مورد نظر را انتخاب کنید:', {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '💬 ارسال پیام به پشتیبانی', callback_data: 'support_new_ticket' }],
          [{ text: '📋 پیام‌های قبلی', callback_data: 'support_my_tickets' }],
          [{ text: '❓ سوالات متداول', callback_data: 'support_faq' }],
          [{ text: '🔙 بازگشت', callback_data: 'back_main_menu' }]
        ]
      }
    });
  });

  // ارسال تیکت جدید
  bot.action('support_new_ticket', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    sessions[ctx.from.id] = {
      flow: 'support_ticket',
      step: 'waiting_subject',
      lang: 'fa',
      data: {}
    };

    ctx.reply('📝 **تیکت جدید**\n\nلطفاً **موضوع** پیام خود را بنویسید:');
  });

  // مشاهده تیکت‌های قبلی
  bot.action('support_my_tickets', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const tickets = await pool.query(
      'SELECT * FROM tickets WHERE telegram_id = $1 ORDER BY created_at DESC LIMIT 10',
      [String(ctx.from.id)]
    );

    if (tickets.rows.length === 0) {
      ctx.reply('📋 شما هیچ تیکتی ثبت نکرده‌اید.');
      return;
    }

    let message = '📋 **تیکت‌های شما**\n\n';
    tickets.rows.forEach((t, i) => {
      const statusEmoji = t.status === 'open' ? '🟡 باز' : t.status === 'closed' ? '🟢 بسته' : '🔵 در حال بررسی';
      message += `${i + 1}. ${t.subject}\n   وضعیت: ${statusEmoji}\n   تاریخ: ${new Date(t.created_at).toLocaleDateString('fa-IR')}\n\n`;
    });

    ctx.reply(message, { parse_mode: 'Markdown' });
  });

  // سوالات متداول
  bot.action('support_faq', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    ctx.reply(
      '❓ **سوالات متداول**\n\n' +
      '🔹 **چقدر طول می‌کشه شارژم تایید بشه؟**\nمعمولاً چند دقیقه، حداکثر تا چند ساعت.\n\n' +
      '🔹 **حداقل مبلغ برداشت چقدره؟**\n۱۰۰,۰۰۰ تومان.\n\n' +
      '🔹 **آیا واریزی از کارت دیگران قبوله؟**\nخیر، فقط از کارتی که به نام خودتون ثبت شده.\n\n' +
      '🔹 **بونوس بازی چطور فعال می‌شه؟**\nبا اولین خرید موفق، بخش بازی‌ها برای شما فعال می‌شود.\n\n' +
      '🔹 **چطور احراز هویت طلایی کنم؟**\nاز بخش جیب > افزایش سقف خرید، عکس کارت ملی و بانکی را ارسال کنید.',
      { parse_mode: 'Markdown' }
    );
  });

  // ============================================
  // قوانین و آموزش
  // ============================================
  bot.action('menu_rules_education', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    ctx.reply(
      '📚 **قوانین و آموزش**\n\n' +
      '📜 **قوانین:**\n' +
      '• واریزی فقط از کارت ثبت‌شده به نام کاربر معتبر است.\n' +
      '• هرگونه تخلف منجر به مسدودی حساب می‌شود.\n' +
      '• مسئولیت صحت اطلاعات بر عهده کاربر است.\n\n' +
      '🎓 **آموزش:**\n' +
      '• برای خرید: از منوی اصلی گزینه خرید را بزنید.\n' +
      '• برای فروش: کد ووچر خود را وارد کنید.\n' +
      '• برای شارژ: از بخش جیب اقدام کنید.\n\n' +
      '📞 در صورت نیاز، با پشتیبانی تماس بگیرید.'
    );
  });

  // ============================================
  // پردازش متن‌های ورودی (تیکت پشتیبانی)
  // ============================================
  bot.on('text', async (ctx, next) => {
    const session = sessions[ctx.from.id];
    if (!session) return next();

    // ---------- تیکت پشتیبانی: موضوع ----------
    if (session.flow === 'support_ticket' && session.step === 'waiting_subject') {
      const subject = ctx.message.text.trim();
      if (subject.length < 3) {
        return ctx.reply('❌ موضوع باید حداقل ۳ کاراکتر باشد. لطفاً دوباره بنویسید:');
      }
      session.data.subject = subject;
      session.step = 'waiting_message';
      return ctx.reply('✅ موضوع ثبت شد.\n\nحالا لطفاً **متن پیام** خود را بنویسید:');
    }

    // ---------- تیکت پشتیبانی: متن ----------
    if (session.flow === 'support_ticket' && session.step === 'waiting_message') {
      const message = ctx.message.text.trim();
      if (message.length < 5) {
        return ctx.reply('❌ پیام باید حداقل ۵ کاراکتر باشد. لطفاً دوباره بنویسید:');
      }

      try {
        // ذخیره تیکت در دیتابیس
        await pool.query(
          'INSERT INTO tickets (telegram_id, subject, message, status, created_at, updated_at) VALUES ($1, $2, $3, $4, NOW(), NOW())',
          [String(ctx.from.id), session.data.subject, message, 'open']
        );

        // ارسال به ادمین‌ها
        const admins = ADMIN_IDS;
        for (const adminId of admins) {
          try {
            await ctx.telegram.sendMessage(
              adminId,
              `📩 **تیکت پشتیبانی جدید**\n\n👤 کاربر: \`${ctx.from.id}\`\n📌 موضوع: ${session.data.subject}\n📝 پیام:\n${message}`,
              {
                parse_mode: 'Markdown',
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '💬 پاسخ', callback_data: `ticket_reply_${ctx.from.id}` }],
                    [{ text: '❌ بستن', callback_data: `ticket_close_${ctx.from.id}` }]
                  ]
                }
              }
            );
          } catch (e) {
            console.log(`خطا در ارسال تیکت به ادمین ${adminId}:`, e.message);
          }
        }

        delete sessions[ctx.from.id];
        ctx.reply('✅ **پیام شما با موفقیت ارسال شد.**\n\nپشتیبانی در اسرع وقت پاسخ خواهد داد. 🙏');
      } catch (err) {
        console.error('خطا در ثبت تیکت:', err);
        ctx.reply('❌ خطایی رخ داد. لطفاً دوباره تلاش کنید.');
        delete sessions[ctx.from.id];
      }
      return;
    }

    return next();
  });

  // ============================================
  // پاسخ ادمین به تیکت
  // ============================================
  bot.action(/^ticket_reply_(.+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('⛔ دسترسی محدود');
    const targetId = ctx.match[1];
    ctx.answerCbQuery();
    sessions[ctx.from.id] = {
      flow: 'admin_ticket_reply',
      step: 'waiting_message',
      data: { targetId }
    };
    ctx.reply(`✍️ پاسخ خود را برای کاربر \`${targetId}\` بنویسید:`, { parse_mode: 'Markdown' });
  });

  bot.action(/^ticket_close_(.+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('⛔ دسترسی محدود');
    const targetId = ctx.match[1];
    await pool.query("UPDATE tickets SET status = 'closed', updated_at = NOW() WHERE telegram_id = $1 AND status = 'open'", [targetId]);
    ctx.answerCbQuery('✅ بسته شد');
    ctx.reply('✅ تیکت بسته شد.');
  });

  // پردازش پاسخ ادمین
  bot.on('text', async (ctx, next) => {
    const session = sessions[ctx.from.id];
    if (!session) return next();

    if (session.flow === 'admin_ticket_reply' && session.step === 'waiting_message') {
      const reply = ctx.message.text;
      const targetId = session.data.targetId;

      try {
        await ctx.telegram.sendMessage(
          targetId,
          `📩 **پاسخ پشتیبانی:**\n\n${reply}\n\n💛 ووچینو⁰¹ - پشتیبانی`,
          { parse_mode: 'Markdown' }
        );

        // به‌روزرسانی تیکت
        await pool.query(
          "UPDATE tickets SET status = 'in_progress', admin_response = $1, updated_at = NOW() WHERE telegram_id = $2 AND status = 'open'",
          [reply, targetId]
        );

        delete sessions[ctx.from.id];
        ctx.reply('✅ پاسخ شما ارسال شد.');
      } catch (err) {
        ctx.reply('❌ خطا در ارسال پاسخ.');
        delete sessions[ctx.from.id];
      }
      return;
    }

    return next();
  });

};
