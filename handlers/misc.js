const texts = require('../texts');
const { sessions, showMainMenu } = require('../utils');
const { pool, getUser } = require('../db');
const { ADMIN_IDS } = require('../constants');

function isAdmin(telegramId) {
  return ADMIN_IDS.indexOf(Number(telegramId)) !== -1;
}

module.exports = function registerMiscHandlers(bot) {
  bot.action('back_main_menu', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    showMainMenu(ctx);
  });

  bot.action('cancel_flow', async (ctx) => {
    ctx.answerCbQuery();
    delete sessions[ctx.from.id];
    try {
      await ctx.deleteMessage();
    } catch (e) {}
    showMainMenu(ctx);
  });

  bot.action('menu_referral', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    ctx.reply('به‌زودی 🙂');
  });

  bot.action('menu_profile', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    const t = texts.fa;
    const user = await getUser(ctx.from.id);
    if (!user) {
      ctx.reply('اطلاعاتی برای شما ثبت نشده.');
      return;
    }
    ctx.reply(
      t.profileTitle + '\n\n' +
      '👤 نام: ' + (user.full_name || '-') + '\n' +
      '📱 شماره تلفن: ' + (user.phone || '-') + '\n' +
      '💳 شماره کارت: ' + (user.card_number || '-') + '\n' +
      '💰 موجودی: ' + Number(user.balance).toLocaleString('en-US') + ' تومان',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 بازگشت به منوی اصلی', callback_data: 'back_main_menu', style: 'danger' }]
          ]
        }
      }
    );
  });

  bot.action('menu_invoices', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    const t = texts.fa;
    const walletRes = await pool.query(
      'SELECT id, type, amount, status, created_at FROM wallet_requests WHERE telegram_id = $1',
      [String(ctx.from.id)]
    );
    const ordersRes = await pool.query(
      'SELECT o.id, o.product_type, o.amount, o.status, o.created_at, p.name AS product_name ' +
      'FROM orders o LEFT JOIN products p ON p.key = o.product_type ' +
      'WHERE o.telegram_id = $1',
      [String(ctx.from.id)]
    );
    const sellRes = await pool.query(
      'SELECT s.id, s.product_type, s.amount, s.status, s.created_at, sp.name AS product_name ' +
      'FROM sell_orders s LEFT JOIN sell_products sp ON sp.key = s.product_type ' +
      'WHERE s.telegram_id = $1',
      [String(ctx.from.id)]
    );

    const combined = [];
    walletRes.rows.forEach(function (r) {
      combined.push({
        label: r.type === 'deposit' ? '➕ شارژ' : '💳 برداشت',
        amount: r.amount,
        status: r.status,
        created_at: r.created_at
      });
    });
    ordersRes.rows.forEach(function (r) {
      const productLabel = '🛒 خرید ' + (r.product_name || r.product_type);
      combined.push({
        label: productLabel,
        amount: r.amount,
        status: r.status,
        created_at: r.created_at
      });
    });
    sellRes.rows.forEach(function (r) {
      const productLabel = '🎟 فروش ' + (r.product_name || r.product_type);
      combined.push({
        label: productLabel,
        amount: r.amount,
        status: r.status,
        created_at: r.created_at
      });
    });

    combined.sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
    const latest = combined.slice(0, 10);

    if (latest.length === 0) {
      ctx.reply(t.invoicesTitle + '\n\n' + t.invoicesEmpty);
      return;
    }

    let message = t.invoicesTitle + '\n\n';
    latest.forEach(function (r) {
      const statusLabel = r.status === 'pending' || r.status === 'pending_review' ? '⏳ در انتظار' : (r.status === 'approved' || r.status === 'completed' ? '✅ انجام‌شده' : '❌ رد شده');
      const amountLabel = r.amount ? (Number(r.amount).toLocaleString('en-US') + ' تومان') : 'در انتظار تعیین مبلغ';
      message += r.label + ' | ' + amountLabel + ' | ' + statusLabel + '\n';
    });
    ctx.reply(message);
  });

  bot.action('menu_support', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    const t = texts.fa;
    ctx.reply(t.supportTitle, {
      reply_markup: {
        inline_keyboard: [
          [{ text: t.supportFaqButton, callback_data: 'support_faq', style: 'primary' }],
          [{ text: t.supportContactButton, callback_data: 'support_contact', style: 'primary' }]
        ]
      }
    });
  });

  bot.action('support_faq', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    ctx.reply(texts.fa.faqText);
  });

  bot.action('support_contact', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    ctx.reply(texts.fa.supportContactText);
  });

  bot.action('menu_rules_education', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    ctx.reply(texts.fa.rulesText + '\n\n📚 آموزش استفاده از ربات به‌زودی همینجا قرار می‌گیره.');
  });

  bot.action('menu_rules', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    ctx.reply(texts.fa.rulesText);
  });

  bot.action('menu_education', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    ctx.reply('📚 آموزش استفاده از ربات به‌زودی همینجا قرار می‌گیره.');
  });

  // ===== دکمه‌ی پنل مدیریت (فقط برای ادمین) =====
  bot.action('menu_admin_panel', async (ctx) => {
    ctx.answerCbQuery();
    if (!isAdmin(ctx.from.id)) {
      ctx.reply('⛔️ شما دسترسی به این بخش ندارید.');
      return;
    }
    try { await ctx.deleteMessage(); } catch (e) {}
    
    // گرفتن تعداد درخواست‌های در انتظار
    const pendingWallet = await pool.query("SELECT COUNT(*) AS c FROM wallet_requests WHERE status = 'pending'");
    const pendingSell = await pool.query("SELECT COUNT(*) AS c FROM sell_orders WHERE status = 'pending_review'");
    const pendingBuy = await pool.query("SELECT COUNT(*) AS c FROM orders WHERE status = 'pending_delivery'");
    
    ctx.reply(
      '👑 **پنل مدیریت ووچینو**\n\n' +
      '📥 **درخواست‌های در انتظار:**\n' +
      '   🔹 کیف پول: ' + pendingWallet.rows[0].c + '\n' +
      '   🔹 فروش: ' + pendingSell.rows[0].c + '\n' +
      '   🔹 خرید: ' + pendingBuy.rows[0].c + '\n\n' +
      '👇 لطفاً یکی از گزینه‌های زیر را انتخاب کنید:',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📋 سفارشات خرید', callback_data: 'admin_buy_pending' }],
            [{ text: '🎟 سفارشات فروش', callback_data: 'admin_sell_pending' }],
            [{ text: '💰 درخواست‌های کیف پول', callback_data: 'admin_pending' }],
            [{ text: '🛍 مدیریت محصولات خرید', callback_data: 'admin_products_buy' }],
            [{ text: '🎟 مدیریت محصولات فروش', callback_data: 'admin_products_sell' }],
            [{ text: '📢 ارسال همگانی', callback_data: 'admin_broadcast' }],
            [{ text: '🕵️ ارسال مخفی به یک نفر', callback_data: 'admin_fake_broadcast' }],
            [{ text: '🎁 هدیه به کاربران', callback_data: 'admin_gift' }],
            [{ text: '⚙️ تنظیمات کلی', callback_data: 'admin_settings' }],
            [{ text: '📊 آمار کاربران', callback_data: 'admin_stats' }],
            [{ text: '🔎 جستجوی کد پیگیری', callback_data: 'admin_find' }],
            [{ text: '👤 اطلاعات یک کاربر', callback_data: 'admin_userinfo' }],
            [{ text: '🔙 بازگشت به منوی اصلی', callback_data: 'back_main_menu' }]
          ]
        }
      }
    );
  });

  // ===== دکمه‌های جدید پنل =====
  
  bot.action('admin_settings', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    
    const rate = await pool.query('SELECT value FROM settings WHERE key = $1', ['usd_rate']);
    const reaction = await pool.query('SELECT value FROM settings WHERE key = $1', ['start_reaction']);
    
    ctx.reply(
      '⚙️ **تنظیمات کلی**\n\n' +
      '💰 نرخ دلار: ' + (rate.rows[0] ? Number(rate.rows[0].value).toLocaleString('en-US') : '60,000') + ' تومان\n' +
      '🎭 ایموجی استارت: ' + (reaction.rows[0] ? reaction.rows[0].value : '🎉') + '\n\n' +
      'برای تغییر هر کدام، گزینه مورد نظر را انتخاب کنید:',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '💵 تغییر نرخ دلار', callback_data: 'admin_set_rate' }],
            [{ text: '🎭 تغییر ایموجی استارت', callback_data: 'admin_set_reaction' }],
            [{ text: '📝 ویرایش متن‌های ربات', callback_data: 'admin_edit_texts' }],
            [{ text: '🔙 بازگشت به پنل مدیریت', callback_data: 'menu_admin_panel' }]
          ]
        }
      }
    );
  });

  bot.action('admin_set_rate', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    
    sessions[ctx.from.id] = {
      flow: 'admin_set_rate',
      step: 'waiting_value',
      lang: 'fa'
    };
    
    ctx.reply('💵 **تغییر نرخ دلار**\n\nلطفاً نرخ جدید را به تومان وارد کنید:\nمثال: `65000`', {
      parse_mode: 'Markdown'
    });
  });

  bot.action('admin_set_reaction', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    
    sessions[ctx.from.id] = {
      flow: 'admin_set_reaction',
      step: 'waiting_value',
      lang: 'fa'
    };
    
    ctx.reply('🎭 **تغییر ایموجی استارت**\n\nلطفاً ایموجی مورد نظر را وارد کنید:\nمثال: `🔥` یا `🎉`', {
      parse_mode: 'Markdown'
    });
  });

  bot.action('admin_find', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    
    sessions[ctx.from.id] = {
      flow: 'admin_find',
      step: 'waiting_code',
      lang: 'fa'
    };
    
    ctx.reply('🔎 **جستجوی کد پیگیری**\n\nلطفاً کد پیگیری را وارد کنید:\nمثال: `VOC-847392`', {
      parse_mode: 'Markdown'
    });
  });

  bot.action('admin_userinfo', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    
    sessions[ctx.from.id] = {
      flow: 'admin_userinfo',
      step: 'waiting_id',
      lang: 'fa'
    };
    
    ctx.reply('👤 **اطلاعات یک کاربر**\n\nلطفاً آیدی عددی کاربر را وارد کنید:\nمثال: `8231962200`', {
      parse_mode: 'Markdown'
    });
  });

  bot.action('admin_edit_texts', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    
    ctx.reply('📝 **ویرایش متن‌های ربات**\n\nاین بخش به‌زودی تکمیل می‌شود.\nدر حال حاضر می‌توانید از فایل `texts.js` برای ویرایش استفاده کنید.', {
      parse_mode: 'Markdown'
    });
  });

  bot.action(/^menu_.+/, async (ctx) => {
    const actionKey = ctx.match[0];
    const known = ['menu_wallet', 'menu_referral', 'menu_profile', 'menu_invoices', 'menu_support', 'menu_game', 'menu_rules', 'menu_education', 'menu_rules_education', 'menu_buy', 'menu_sell', 'menu_admin_panel'];
    if (known.indexOf(actionKey) !== -1) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    ctx.reply('این بخش به‌زودی تکمیل می‌شود 🛠');
  });

  // ===== هندلرهای متنی برای تنظیمات و جستجو =====
  bot.on('text', async (ctx, next) => {
    const session = sessions[ctx.from.id];
    if (!session) return next();
    
    if (!isAdmin(ctx.from.id)) {
      delete sessions[ctx.from.id];
      return next();
    }

    // تغییر نرخ دلار
    if (session.flow === 'admin_set_rate' && session.step === 'waiting_value') {
      const value = parseInt(ctx.message.text.replace(/[^0-9]/g, ''), 10);
      if (!value || value <= 0) {
        ctx.reply('❌ لطفاً یک عدد معتبر وارد کنید.');
        return;
      }
      await pool.query(
        'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
        ['usd_rate', String(value)]
      );
      delete sessions[ctx.from.id];
      ctx.reply('✅ نرخ دلار با موفقیت به ' + value.toLocaleString('en-US') + ' تومان تغییر یافت!');
      return;
    }

    // تغییر ایموجی استارت
    if (session.flow === 'admin_set_reaction' && session.step === 'waiting_value') {
      const emoji = ctx.message.text.trim();
      if (ALLOWED_REACTIONS.indexOf(emoji) === -1) {
        ctx.reply('❌ این ایموجی مجاز نیست. لطفاً یکی از ایموجی‌های مجاز را انتخاب کنید.');
        return;
      }
      await pool.query(
        'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
        ['start_reaction', emoji]
      );
      delete sessions[ctx.from.id];
      ctx.reply('✅ ایموجی استارت با موفقیت به ' + emoji + ' تغییر یافت!');
      return;
    }

    // جستجوی کد پیگیری
    if (session.flow === 'admin_find' && session.step === 'waiting_code') {
      const code = ctx.message.text.trim().toUpperCase();
      
      const orderRes = await pool.query('SELECT * FROM orders WHERE tracking_code = $1', [code]);
      const walletRes = await pool.query('SELECT * FROM wallet_requests WHERE tracking_code = $1', [code]);
      const sellRes = await pool.query('SELECT * FROM sell_orders WHERE tracking_code = $1', [code]);

      if (orderRes.rows.length === 0 && walletRes.rows.length === 0 && sellRes.rows.length === 0) {
        ctx.reply('❌ هیچ رکوردی با این کد پیگیری پیدا نشد.');
        delete sessions[ctx.from.id];
        return;
      }

      if (orderRes.rows.length > 0) {
        const o = orderRes.rows[0];
        const user = await getUser(o.telegram_id);
        ctx.reply(
          '📦 سفارش خرید\n\n🆔 کد پیگیری: ' + o.tracking_code +
          '\n👤 نام: ' + (user ? user.full_name : 'نامشخص') +
          '\n📱 شماره: ' + (user ? user.phone : '-') +
          '\n📦 محصول: ' + o.product_type +
          '\n💰 مبلغ: ' + Number(o.amount).toLocaleString('en-US') + ' تومان' +
          '\n📌 وضعیت: ' + o.status +
          '\n📅 تاریخ: ' + o.created_at
        );
      }

      if (walletRes.rows.length > 0) {
        const w = walletRes.rows[0];
        const user = await getUser(w.telegram_id);
        ctx.reply(
          '💰 درخواست کیف پول\n\n🆔 کد پیگیری: ' + w.tracking_code +
          '\n👤 نام: ' + (user ? user.full_name : 'نامشخص') +
          '\n📱 شماره: ' + (user ? user.phone : '-') +
          '\n💰 مبلغ: ' + Number(w.amount).toLocaleString('en-US') + ' تومان' +
          '\n📌 وضعیت: ' + w.status +
          '\n📅 تاریخ: ' + w.created_at
        );
      }

      if (sellRes.rows.length > 0) {
        const s = sellRes.rows[0];
        const user = await getUser(s.telegram_id);
        ctx.reply(
          '🎟 سفارش فروش\n\n🆔 کد پیگیری: ' + s.tracking_code +
          '\n👤 نام: ' + (user ? user.full_name : 'نامشخص') +
          '\n📱 شماره: ' + (user ? user.phone : '-') +
          '\n📦 محصول: ' + s.product_type +
          '\n💰 مبلغ: ' + (s.amount ? Number(s.amount).toLocaleString('en-US') + ' تومان' : 'هنوز تعیین نشده') +
          '\n📌 وضعیت: ' + s.status +
          '\n📅 تاریخ: ' + s.created_at
        );
      }

      delete sessions[ctx.from.id];
      return;
    }

    // اطلاعات یک کاربر
    if (session.flow === 'admin_userinfo' && session.step === 'waiting_id') {
      const targetUserId = ctx.message.text.trim();
      const user = await getUserById(targetUserId);
      
      if (!user) {
        ctx.reply('❌ کاربری با آیدی ' + targetUserId + ' پیدا نشد.');
        delete sessions[ctx.from.id];
        return;
      }
      
      const isFullyRegistered = user.full_name && user.phone && user.card_number;
      
      let infoText = 
        '👤 **اطلاعات کاربر**\n\n' +
        '🆔 **آیدی:** ' + user.telegram_id + '\n' +
        '👤 **نام:** ' + (user.full_name || '❌ ثبت‌نام ناقص') + '\n' +
        '📱 **شماره:** ' + (user.phone || '❌ ثبت نشده') + '\n' +
        '💳 **کارت:** ' + (user.card_number || '❌ ثبت نشده') + '\n' +
        '💰 **موجودی:** ' + Number(user.balance).toLocaleString('en-US') + ' تومان\n' +
        '📅 **تاریخ ثبت:** ' + (user.registered_at || 'نامشخص') + '\n' +
        '📌 **وضعیت ثبت‌نام:** ' + (isFullyRegistered ? '✅ کامل' : '⚠️ ناقص') + '\n';
      
      ctx.reply(infoText, { parse_mode: 'Markdown' });
      delete sessions[ctx.from.id];
      return;
    }

    return next();
  });
};
