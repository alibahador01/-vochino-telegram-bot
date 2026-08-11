// handlers/misc.js
const texts = require('../texts');
const { sessions, showMainMenu } = require('../utils');
const { pool, getUser, getAllUsers } = require('../db');
const { ADMIN_IDS } = require('../constants');

function isAdmin(telegramId) {
  return ADMIN_IDS.includes(Number(telegramId));
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
  // دکمه‌های منوی اصلی (همه callbackها)
  // ============================================

  // ✨ خرید (منوی buy) – به handlers/buy.js واگذار می‌شود
  bot.action('menu_buy', async (ctx) => {
    ctx.answerCbQuery();
    // ریدایرکت به هندلر خرید
    return ctx.deleteMessage().then(() => ctx.answerCbQuery()).catch(() => {});
    // (در واقع بهتر است خود buy handlers مستقیماً callback را بگیرند، اما اینجا صرفاً برای هماهنگی)
  });

  // ✨ فروش (sell)
  bot.action('menu_sell', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    // ریدایرکت به هندلر فروش (از آنجا که buy و sell جدا هستند، اینجا صرفاً منو را نشان می‌دهیم)
    const { getSellProducts } = require('../db');
    const products = await getSellProducts(true);
    const t = texts.fa;
    if (products.length === 0) return ctx.reply(t.sellNoProducts);
    const buttons = products.map(p => [{ text: p.name, callback_data: 'sell_' + p.key }]);
    ctx.reply(t.sellMenuTitle, { reply_markup: { inline_keyboard: buttons } });
  });

  // 🧳 جیب (wallet)
  bot.action('menu_wallet', async (ctx) => {
    ctx.answerCbQuery();
    // به هندلر wallet ارجاع می‌دهیم (قبلاً در wallet.js)
    try { await ctx.deleteMessage(); } catch (e) {}
    // با صدا زدن همان handler که در wallet.js ثبت شده، چون اینجا require شده
    return require('./wallet').showWalletMenu(ctx); // یک تابع کمکی در wallet.js صادر می‌کنیم
  });

  // 💎 بونوس (bonus) – بازی‌ها
  bot.action('menu_bonus', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    // رفتن به منوی بازی (game handlers)
    const gameHandler = require('./game');
    // در game.js یک تابع کمکی برای شروع بازی‌ها تعریف کرده‌ایم
    return gameHandler.showBonusMenu(ctx);
  });

  // 🎁 ویژه ووچینو⁰۱ (special) – اینجا VPN و فیلترشکن
  bot.action('menu_special', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    // انتقال به بخش VPN (فایل handlers/vpn.js)
    const vpnHandler = require('./vpn');
    return vpnHandler.showVpnMenu(ctx);
  });

  // 🌐 وب‌سایت ووچینو⁰۱ – مستقیم لینک را باز کن
  bot.action('menu_website', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    const websiteUrl = process.env.WEBSITE_URL || 'https://vochino.com';
    ctx.reply(`🌐 وب‌سایت ووچینو⁰۱:\n${websiteUrl}`, {
      reply_markup: {
        inline_keyboard: [[{ text: '🚀 باز کردن وب‌سایت', url: websiteUrl }]]
      }
    });
  });

  // 📥 پشتیبانی (support) – تیکتینگ
  bot.action('menu_support', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
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

  // ============================================
  // تیکت جدید
  // ============================================
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
    if (tickets.rows.length === 0) return ctx.reply('📋 شما هیچ تیکتی ثبت نکرده‌اید.');
    let msg = '📋 **تیکت‌های شما**\n\n';
    tickets.rows.forEach((t, i) => {
      const s = t.status === 'open' ? '🟡 باز' : t.status === 'closed' ? '🟢 بسته' : '🔵 در حال بررسی';
      msg += `${i+1}. ${t.subject} | ${s}\n`;
    });
    ctx.reply(msg, { parse_mode: 'Markdown' });
  });

  // سوالات متداول
  bot.action('support_faq', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    ctx.reply(
      '❓ **سوالات متداول**\n\n' +
      '🔹 **حداقل مبلغ برداشت چقدره؟**\n' + require('../constants').MIN_WITHDRAW.toLocaleString('en-US') + ' تومان\n\n' +
      '🔹 **آیا واریزی از کارت دیگران قبوله؟**\nخیر، فقط از کارت ثبت‌شده خودتان.\n\n' +
      '🔹 **بونوس بازی چطور فعال می‌شه؟**\nبا اولین خرید موفق.\n\n' +
      '🔹 **چطور احراز هویت طلایی کنم؟**\nاز بخش جیب > افزایش سقف خرید.'
    );
  });

  // ============================================
  // پردازش متن‌های ورودی تیکت
  // ============================================
  bot.on('text', async (ctx, next) => {
    const session = sessions[ctx.from.id];
    if (!session) return next();

    if (session.flow === 'support_ticket' && session.step === 'waiting_subject') {
      const subject = ctx.message.text.trim();
      if (subject.length < 3) return ctx.reply('❌ موضوع باید حداقل ۳ کاراکتر باشد.');
      session.data.subject = subject;
      session.step = 'waiting_message';
      return ctx.reply('✅ موضوع ثبت شد.\n\nحالا **متن پیام** خود را بنویسید:');
    }

    if (session.flow === 'support_ticket' && session.step === 'waiting_message') {
      const message = ctx.message.text.trim();
      if (message.length < 5) return ctx.reply('❌ پیام باید حداقل ۵ کاراکتر باشد.');
      try {
        await pool.query(
          'INSERT INTO tickets (telegram_id, subject, message, status, created_at, updated_at) VALUES ($1, $2, $3, $4, NOW(), NOW())',
          [String(ctx.from.id), session.data.subject, message, 'open']
        );
        // اطلاع‌رسانی به ادمین‌ها
        for (const adminId of ADMIN_IDS) {
          try {
            await ctx.telegram.sendMessage(
              adminId,
              `📩 **تیکت جدید**\n👤 ${ctx.from.id}\n📌 ${session.data.subject}\n📝 ${message}`,
              { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
                [{ text: '💬 پاسخ', callback_data: `ticket_reply_${ctx.from.id}` }],
                [{ text: '❌ بستن', callback_data: `ticket_close_${ctx.from.id}` }]
              ]}}
            );
          } catch (e) {}
        }
        delete sessions[ctx.from.id];
        ctx.reply('✅ **پیام شما ارسال شد.**');
      } catch (err) {
        console.error(err);
        ctx.reply('❌ خطا در ارسال تیکت.');
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
    sessions[ctx.from.id] = { flow: 'admin_ticket_reply', step: 'waiting_message', data: { targetId } };
    ctx.reply(`✍️ پاسخ خود را برای \`${targetId}\` بنویسید:`, { parse_mode: 'Markdown' });
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
    if (!session || session.flow !== 'admin_ticket_reply' || session.step !== 'waiting_message') return next();
    const reply = ctx.message.text;
    const targetId = session.data.targetId;
    try {
      await ctx.telegram.sendMessage(targetId, `📩 **پاسخ پشتیبانی:**\n\n${reply}\n\n💛 ووچینو⁰¹`);
      await pool.query("UPDATE tickets SET status = 'in_progress', admin_response = $1, updated_at = NOW() WHERE telegram_id = $2 AND status = 'open'", [reply, targetId]);
      delete sessions[ctx.from.id];
      ctx.reply('✅ پاسخ ارسال شد.');
    } catch (err) {
      ctx.reply('❌ خطا.');
      delete sessions[ctx.from.id];
    }
    return;
  });
};
