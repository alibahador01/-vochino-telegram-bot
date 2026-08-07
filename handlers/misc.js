const texts = require('../texts');
const { sessions, showMainMenu, sendBroadcast, sendBroadcastWithPhoto, sendMessageToUser } = require('../utils');
const { pool, getUser, getUserById, getAllUsers } = require('../db');
const { ADMIN_IDS, ALLOWED_REACTIONS } = require('../constants');

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

  // ===== دکمه‌ی پنل مدیریت =====
  bot.action('menu_admin_panel', async (ctx) => {
    ctx.answerCbQuery();
    if (!isAdmin(ctx.from.id)) {
      ctx.reply('⛔️ شما دسترسی به این بخش ندارید.');
      return;
    }
    try { await ctx.deleteMessage(); } catch (e) {}
    
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

  // ===== تنظیمات کلی =====
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
            [{ text: '💰 تنظیمات سود (کارمزد)', callback_data: 'admin_margin_settings' }],
            [{ text: '📝 ویرایش متن‌های ربات', callback_data: 'admin_edit_texts' }],
            [{ text: '🔙 بازگشت به پنل مدیریت', callback_data: 'menu_admin_panel' }]
          ]
        }
      }
    );
  });

  bot.action('admin_margin_settings', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    
    const buyMargin = await pool.query("SELECT value FROM settings WHERE key = 'buy_margin'");
    const sellMargin = await pool.query("SELECT value FROM settings WHERE key = 'sell_margin'");
    const buyMode = await pool.query("SELECT value FROM settings WHERE key = 'buy_mode'");
    const sellMode = await pool.query("SELECT value FROM settings WHERE key = 'sell_mode'");
    
    ctx.reply(
      '💰 **تنظیمات سود (کارمزد)**\n\n' +
      '🛒 **خرید:**\n' +
      '   درصد سود: ' + (buyMargin.rows[0] ? buyMargin.rows[0].value : '10') + '%\n' +
      '   حالت: ' + (buyMode.rows[0] ? buyMode.rows[0].value : 'MANUAL') + '\n\n' +
      '🎟 **فروش:**\n' +
      '   درصد سود: ' + (sellMargin.rows[0] ? sellMargin.rows[0].value : '10') + '%\n' +
      '   حالت: ' + (sellMode.rows[0] ? sellMode.rows[0].value : 'MANUAL') + '\n\n' +
      'برای تغییر هر کدام، گزینه مورد نظر را انتخاب کنید:',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🛒 تغییر سود خرید', callback_data: 'admin_set_buy_margin' }],
            [{ text: '🎟 تغییر سود فروش', callback_data: 'admin_set_sell_margin' }],
            [{ text: '🔄 تغییر حالت خرید (MANUAL/AUTO)', callback_data: 'admin_set_buy_mode' }],
            [{ text: '🔄 تغییر حالت فروش (MANUAL/AUTO)', callback_data: 'admin_set_sell_mode' }],
            [{ text: '🔙 بازگشت به تنظیمات', callback_data: 'admin_settings' }]
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

  bot.action('admin_set_buy_margin', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    
    sessions[ctx.from.id] = {
      flow: 'admin_set_buy_margin',
      step: 'waiting_value',
      lang: 'fa'
    };
    
    ctx.reply('🛒 **تغییر سود خرید**\n\nلطفاً درصد سود جدید را وارد کنید (مثلاً `10` برای ۱۰٪):', {
      parse_mode: 'Markdown'
    });
  });

  bot.action('admin_set_sell_margin', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    
    sessions[ctx.from.id] = {
      flow: 'admin_set_sell_margin',
      step: 'waiting_value',
      lang: 'fa'
    };
    
    ctx.reply('🎟 **تغییر سود فروش**\n\nلطفاً درصد سود جدید را وارد کنید (مثلاً `10` برای ۱۰٪):', {
      parse_mode: 'Markdown'
    });
  });

  bot.action('admin_set_buy_mode', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    
    ctx.reply(
      '🔄 **تغییر حالت خرید**\n\n' +
      'حالت فعلی: ' + (await pool.query("SELECT value FROM settings WHERE key = 'buy_mode'")).rows[0]?.value || 'MANUAL' + '\n\n' +
      'لطفاً حالت مورد نظر را انتخاب کنید:',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ AUTO (خودکار)', callback_data: 'admin_set_buy_mode_auto' }],
            [{ text: '🛠 MANUAL (دستی)', callback_data: 'admin_set_buy_mode_manual' }]
          ]
        }
      }
    );
  });

  bot.action('admin_set_sell_mode', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    
    ctx.reply(
      '🔄 **تغییر حالت فروش**\n\n' +
      'حالت فعلی: ' + (await pool.query("SELECT value FROM settings WHERE key = 'sell_mode'")).rows[0]?.value || 'MANUAL' + '\n\n' +
      'لطفاً حالت مورد نظر را انتخاب کنید:',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ AUTO (خودکار)', callback_data: 'admin_set_sell_mode_auto' }],
            [{ text: '🛠 MANUAL (دستی)', callback_data: 'admin_set_sell_mode_manual' }]
          ]
        }
      }
    );
  });

  bot.action('admin_set_buy_mode_auto', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    await pool.query("INSERT INTO settings (key, value) VALUES ('buy_mode', 'AUTO') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value");
    ctx.reply('✅ حالت خرید به **AUTO (خودکار)** تغییر یافت.');
  });

  bot.action('admin_set_buy_mode_manual', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    await pool.query("INSERT INTO settings (key, value) VALUES ('buy_mode', 'MANUAL') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value");
    ctx.reply('✅ حالت خرید به **MANUAL (دستی)** تغییر یافت.');
  });

  bot.action('admin_set_sell_mode_auto', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    await pool.query("INSERT INTO settings (key, value) VALUES ('sell_mode', 'AUTO') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value");
    ctx.reply('✅ حالت فروش به **AUTO (خودکار)** تغییر یافت.');
  });

  bot.action('admin_set_sell_mode_manual', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    await pool.query("INSERT INTO settings (key, value) VALUES ('sell_mode', 'MANUAL') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value");
    ctx.reply('✅ حالت فروش به **MANUAL (دستی)** تغییر یافت.');
  });

  // ===== ارسال همگانی با عکس و متن =====
  bot.action('admin_broadcast', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    
    sessions[ctx.from.id] = {
      flow: 'admin_broadcast',
      step: 'waiting_photo_or_text',
      lang: 'fa',
      data: {}
    };
    
    ctx.reply(
      '📢 **ارسال همگانی**\n\n' +
      'لطفاً **متن پیام** را ارسال کنید.\n' +
      'اگر می‌خواهید همراه با عکس باشد، اول **عکس** را ارسال کنید و سپس متن را بنویسید.\n\n' +
      '⚠️ این پیام به **همه کاربران** (حتی ثبت‌نام نشده‌ها) ارسال می‌شود.',
      { parse_mode: 'Markdown' }
    );
  });

  // ===== ارسال مخفی به یک نفر با عکس و متن =====
  bot.action('admin_fake_broadcast', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    
    sessions[ctx.from.id] = {
      flow: 'admin_fake_broadcast',
      step: 'waiting_user_id',
      lang: 'fa',
      data: {}
    };
    
    ctx.reply(
      '🕵️ **ارسال مخفی به یک نفر**\n\n' +
      'لطفاً آیدی عددی کاربر مورد نظر را وارد کنید:\nمثال: `8231962200`\n\n' +
      'سپس می‌توانید **متن** یا **عکس + متن** ارسال کنید.',
      { parse_mode: 'Markdown' }
    );
  });

  // ===== هدیه به کاربران =====
  bot.action('admin_gift', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    
    sessions[ctx.from.id] = {
      flow: 'admin_gift',
      step: 'waiting_user_ids',
      lang: 'fa'
    };
    
    ctx.reply('🎁 **هدیه به کاربران**\n\nلطفاً آیدی‌های کاربران را با `-` جدا کنید:\nمثال: `8231962200-8231962201-8231962202`\n\nیا برای هدیه به یک نفر فقط آیدی را وارد کنید.', {
      parse_mode: 'Markdown'
    });
  });

  // ===== اطلاعات یک کاربر =====
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

  // ===== جستجوی کد پیگیری =====
  bot.action('admin_find', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    
    sessions[ctx.from.id] = {
      flow: 'admin_find',
      step: 'waiting_code',
      lang: 'fa'
    };
    
    ctx.reply('🔎 **جستجوی کد پیگیری**\n\nلطفاً کد پیگیری را وارد کنید:\nمثال: `VOC-847392` یا `#VCH_1024`', {
      parse_mode: 'Markdown'
    });
  });

  bot.action('admin_stats', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    
    const totalUsers = await pool.query('SELECT COUNT(*) AS c FROM users');
    const registeredUsers = await pool.query("SELECT COUNT(*) AS c FROM users WHERE full_name IS NOT NULL AND phone IS NOT NULL AND card_number IS NOT NULL");
    const totalBalance = await pool.query('SELECT COALESCE(SUM(balance), 0) AS total FROM users');
    const todayOrders = await pool.query("SELECT COUNT(*) AS c FROM orders WHERE created_at::date >= CURRENT_DATE");
    const todaySells = await pool.query("SELECT COUNT(*) AS c FROM sell_orders WHERE created_at::date >= CURRENT_DATE");
    
    ctx.reply(
      '📊 **آمار کاربران ووچینو**\n\n' +
      '👥 **کل کاربران:** ' + totalUsers.rows[0].c + '\n' +
      '✅ **ثبت‌نام کامل:** ' + registeredUsers.rows[0].c + '\n' +
      '💰 **مجموع موجودی:** ' + Number(totalBalance.rows[0].total).toLocaleString('en-US') + ' تومان\n' +
      '🛒 **سفارشات امروز:** ' + todayOrders.rows[0].c + '\n' +
      '🎟 **فروش امروز:** ' + todaySells.rows[0].c,
      { parse_mode: 'Markdown' }
    );
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

  // ===== هندلرهای متنی =====
  bot.on('text', async (ctx, next) => {
    const session = sessions[ctx.from.id];
    if (!session) return next();
    
    if (!isAdmin(ctx.from.id)) {
      delete sessions[ctx.from.id];
      return next();
    }

    // ===== ارسال همگانی (متن) =====
    if (session.flow === 'admin_broadcast' && session.step === 'waiting_photo_or_text') {
      const text = ctx.message.text;
      
      if (session.data.photo) {
        // ارسال با عکس
        const allUsers = await getAllUsers(true);
        if (allUsers.length === 0) {
          delete sessions[ctx.from.id];
          ctx.reply('❌ هیچ کاربری برای ارسال پیدا نشد.');
          return;
        }
        
        const msg = await ctx.reply('📢 در حال ارسال پیام همگانی با عکس...\n👥 تعداد کاربران: ' + allUsers.length);
        const userIds = allUsers.map(u => u.telegram_id);
        const results = await sendBroadcastWithPhoto(bot, userIds, session.data.photo, text, { parse_mode: 'HTML' });
        
        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;
        
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          msg.message_id,
          null,
          '✅ ارسال همگانی با عکس انجام شد!\n\n✅ موفق: ' + successCount + '\n❌ ناموفق: ' + failCount
        );
      } else {
        // ارسال بدون عکس
        const allUsers = await getAllUsers(true);
        if (allUsers.length === 0) {
          delete sessions[ctx.from.id];
          ctx.reply('❌ هیچ کاربری برای ارسال پیدا نشد.');
          return;
        }
        
        const msg = await ctx.reply('📢 در حال ارسال پیام همگانی...\n👥 تعداد کاربران: ' + allUsers.length);
        const userIds = allUsers.map(u => u.telegram_id);
        const results = await sendBroadcast(bot, userIds, text, { parse_mode: 'HTML' });
        
        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;
        
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          msg.message_id,
          null,
          '✅ ارسال همگانی انجام شد!\n\n✅ موفق: ' + successCount + '\n❌ ناموفق: ' + failCount
        );
      }
      
      delete sessions[ctx.from.id];
      return;
    }

    // ===== ارسال مخفی (متن) =====
    if (session.flow === 'admin_fake_broadcast' && session.step === 'waiting_user_id') {
      const targetUserId = ctx.message.text.trim();
      const user = await getUserById(targetUserId);
      
      if (!user) {
        ctx.reply('❌ کاربری با آیدی ' + targetUserId + ' پیدا نشد. لطفاً دوباره وارد کنید:');
        return;
      }
      
      session.data = { targetUserId: targetUserId };
      session.step = 'waiting_photo_or_text';
      ctx.reply('✅ کاربر پیدا شد: ' + (user.full_name || 'نامشخص') + '\n\n📝 حالا متن پیام را بنویس (کاربر فکر میکند همگانی بوده!)، یا اگر عکس داری اول عکس را بفرست.');
      return;
    }

    if (session.flow === 'admin_fake_broadcast' && session.step === 'waiting_photo_or_text') {
      const text = ctx.message.text;
      const targetUserId = session.data.targetUserId;
      
      if (session.data.photo) {
        const result = await sendBroadcastWithPhoto(bot, [targetUserId], session.data.photo, text, { parse_mode: 'HTML' }, true);
        if (result[0].success) {
          ctx.reply('✅ پیام مخفی با عکس ارسال شد!\n🆔 آیدی: ' + targetUserId);
        } else {
          ctx.reply('❌ ارسال پیام ناموفق بود.\nخطا: ' + result[0].error);
        }
      } else {
        const result = await sendBroadcast(bot, [targetUserId], text, { parse_mode: 'HTML' }, true);
        if (result[0].success) {
          ctx.reply('✅ پیام مخفی ارسال شد!\n🆔 آیدی: ' + targetUserId);
        } else {
          ctx.reply('❌ ارسال پیام ناموفق بود.\nخطا: ' + result[0].error);
        }
      }
      
      delete sessions[ctx.from.id];
      return;
    }

    // ===== هدیه =====
    if (session.flow === 'admin_gift' && session.step === 'waiting_user_ids') {
      const ids = ctx.message.text.split('-').map(id => id.trim());
      const validUsers = [];
      
      for (const id of ids) {
        const user = await getUserById(id);
        if (user) {
          validUsers.push(id);
        }
      }
      
      if (validUsers.length === 0) {
        ctx.reply('❌ هیچ کاربر معتبری پیدا نشد. لطفاً دوباره آیدی‌ها را با `-` جدا کنید:');
        return;
      }
      
      session.data = { userIds: validUsers };
      session.step = 'waiting_amount';
      ctx.reply(
        '✅ ' + validUsers.length + ' کاربر معتبر پیدا شد:\n' +
        validUsers.map(id => '• ' + id).join('\n') + '\n\n' +
        '💰 مبلغ هدیه به **هر کاربر** را به تومان وارد کنید:'
      );
      return;
    }

    if (session.flow === 'admin_gift' && session.step === 'waiting_amount') {
      const amount = parseInt(ctx.message.text.replace(/[^0-9]/g, ''), 10);
      
      if (!amount || amount <= 0) {
        ctx.reply('❌ لطفاً یک عدد معتبر (بزرگتر از ۰) وارد کنید:');
        return;
      }
      
      const userIds = session.data.userIds;
      let successCount = 0;
      
      for (const id of userIds) {
        try {
          await pool.query('UPDATE users SET balance = balance + $1 WHERE telegram_id = $2', [amount, id]);
          successCount++;
        } catch (e) {
          console.log('خطا در هدیه به ' + id + ': ' + e.message);
        }
      }
      
      ctx.reply(
        '✅ **هدیه با موفقیت انجام شد!**\n\n' +
        '👥 تعداد کاربران: ' + userIds.length + '\n' +
        '✅ موفق: ' + successCount + '\n' +
        '💰 مبلغ هر هدیه: ' + Number(amount).toLocaleString('en-US') + ' تومان\n' +
        '💸 مجموع: ' + Number(amount * successCount).toLocaleString('en-US') + ' تومان'
      );
      
      delete sessions[ctx.from.id];
      return;
    }

    // ===== اطلاعات یک کاربر =====
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

    // ===== جستجوی کد پیگیری =====
    if (session.flow === 'admin_find' && session.step === 'waiting_code') {
      const code = ctx.message.text.trim().toUpperCase();
      
      const orderRes = await pool.query('SELECT * FROM orders WHERE tracking_code = $1 OR tracking_code = $2', [code, code]);
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

    // ===== تغییر نرخ دلار =====
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

    // ===== تغییر ایموجی استارت =====
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

    // ===== تغییر سود خرید =====
    if (session.flow === 'admin_set_buy_margin' && session.step === 'waiting_value') {
      const value = parseInt(ctx.message.text.replace(/[^0-9]/g, ''), 10);
      if (isNaN(value) || value < 0) {
        ctx.reply('❌ لطفاً یک عدد معتبر (بزرگتر یا مساوی ۰) وارد کنید.');
        return;
      }
      await pool.query("INSERT INTO settings (key, value) VALUES ('buy_margin', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [String(value)]);
      delete sessions[ctx.from.id];
      ctx.reply('✅ سود خرید با موفقیت به ' + value + '% تغییر یافت.');
      return;
    }

    // ===== تغییر سود فروش =====
    if (session.flow === 'admin_set_sell_margin' && session.step === 'waiting_value') {
      const value = parseInt(ctx.message.text.replace(/[^0-9]/g, ''), 10);
      if (isNaN(value) || value < 0) {
        ctx.reply('❌ لطفاً یک عدد معتبر (بزرگتر یا مساوی ۰) وارد کنید.');
        return;
      }
      await pool.query("INSERT INTO settings (key, value) VALUES ('sell_margin', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [String(value)]);
      delete sessions[ctx.from.id];
      ctx.reply('✅ سود فروش با موفقیت به ' + value + '% تغییر یافت.');
      return;
    }

    return next();
  });

  // ===== هندلر عکس برای ارسال همگانی و مخفی =====
  bot.on('photo', async (ctx, next) => {
    const session = sessions[ctx.from.id];
    if (!session) return next();
    
    if (!isAdmin(ctx.from.id)) {
      delete sessions[ctx.from.id];
      return next();
    }

    // ارسال همگانی با عکس
    if (session.flow === 'admin_broadcast' && session.step === 'waiting_photo_or_text') {
      const photos = ctx.message.photo;
      const fileId = photos[photos.length - 1].file_id;
      session.data.photo = fileId;
      ctx.reply('✅ عکس دریافت شد. حالا **متن پیام** را بنویسید:');
      return;
    }

    // ارسال مخفی با عکس
    if (session.flow === 'admin_fake_broadcast' && session.step === 'waiting_photo_or_text') {
      const photos = ctx.message.photo;
      const fileId = photos[photos.length - 1].file_id;
      session.data.photo = fileId;
      ctx.reply('✅ عکس دریافت شد. حالا **متن پیام** را بنویسید:');
      return;
    }

    return next();
  });
};
