const texts = require('../texts');
const { sessions, fillTemplate, sendBroadcast, sendBroadcastWithPhoto, sendMessageToUser } = require('../utils');
const { pool, getUser, getUserById, getAllUsers, getUsdRate, getSetting, setSetting } = require('../db');
const { ADMIN_IDS, ALLOWED_REACTIONS } = require('../constants');

function isAdmin(telegramId) {
  return ADMIN_IDS.indexOf(Number(telegramId)) !== -1;
}

module.exports = function registerAdminHandlers(bot) {

  // ============================================
  // پنل اصلی ادمین
  // ============================================
  bot.action('menu_admin_panel', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
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
            [{ text: '🏛 مدیریت کانال‌های اجباری', callback_data: 'admin_channels' }],
            [{ text: '🎟 مدیریت کوپن‌های تخفیف', callback_data: 'admin_coupons' }],
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

  // ============================================
  // مدیریت کانال‌های اجباری (Force Join)
  // ============================================
  bot.action('admin_channels', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const channels = await pool.query('SELECT * FROM required_channels ORDER BY id ASC');
    const forceJoinEnabled = await getSetting('force_join_enabled', 'true');

    let message = '🏛 **مدیریت کانال‌های اجباری**\n\n';
    message += '🔹 وضعیت جوین اجباری: ' + (forceJoinEnabled === 'true' ? '✅ فعال' : '❌ غیرفعال') + '\n\n';
    message += '📋 **لیست کانال‌ها:**\n';

    if (channels.rows.length === 0) {
      message += 'هیچ کانالی تعریف نشده است.\n';
    } else {
      channels.rows.forEach((ch, i) => {
        message += (i + 1) + '. ' + ch.title + '\n';
        message += '   آیدی: `' + ch.chat_id + '`\n';
        message += '   لینک: ' + ch.invite_link + '\n';
        message += '   وضعیت: ' + (ch.active ? '✅ فعال' : '❌ غیرفعال') + '\n\n';
      });
    }

    ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '➕ افزودن کانال جدید', callback_data: 'admin_add_channel' }],
          [{ text: '🔄 تغییر وضعیت جوین اجباری', callback_data: 'admin_toggle_force_join' }],
          [{ text: '❌ حذف کانال', callback_data: 'admin_remove_channel' }],
          [{ text: '🔙 بازگشت به پنل مدیریت', callback_data: 'menu_admin_panel' }]
        ]
      }
    });
  });

  bot.action('admin_add_channel', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    sessions[ctx.from.id] = {
      flow: 'admin_add_channel',
      step: 'waiting_chat_id',
      lang: 'fa'
    };

    ctx.reply(
      '➕ **افزودن کانال جدید**\n\n' +
      'لطفاً **آیدی عددی کانال** را وارد کنید:\n' +
      'مثال: `-1001234567890`\n\n' +
      '⚠️ ربات باید در کانال ادمین باشد.',
      { parse_mode: 'Markdown' }
    );
  });

  bot.action('admin_toggle_force_join', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();

    const current = await getSetting('force_join_enabled', 'true');
    const newValue = current === 'true' ? 'false' : 'true';
    await setSetting('force_join_enabled', newValue);

    ctx.reply('✅ وضعیت جوین اجباری به **' + (newValue === 'true' ? 'فعال' : 'غیرفعال') + '** تغییر یافت.');
  });

  bot.action('admin_remove_channel', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const channels = await pool.query('SELECT * FROM required_channels WHERE active = 1 ORDER BY id ASC');
    if (channels.rows.length === 0) {
      ctx.reply('❌ هیچ کانال فعالی برای حذف وجود ندارد.');
      return;
    }

    let message = '❌ **حذف کانال**\n\nلطفاً کانال مورد نظر را انتخاب کنید:\n';
    const buttons = [];
    channels.rows.forEach((ch) => {
      message += '• ' + ch.title + ' (`' + ch.chat_id + '`)\n';
      buttons.push([{ text: '❌ حذف ' + ch.title, callback_data: 'admin_delete_channel_' + ch.chat_id }]);
    });

    buttons.push([{ text: '🔙 بازگشت', callback_data: 'admin_channels' }]);

    ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons }
    });
  });

  bot.action(/^admin_delete_channel_(.+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    const chatId = ctx.match[1];
    await pool.query('UPDATE required_channels SET active = 0 WHERE chat_id = $1', [chatId]);
    ctx.reply('✅ کانال با موفقیت حذف شد.');
  });

  // ============================================
  // مدیریت کوپن‌های تخفیف
  // ============================================
  bot.action('admin_coupons', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const coupons = await pool.query('SELECT * FROM coupons WHERE active = 1 ORDER BY id DESC LIMIT 20');

    let message = '🎟 **مدیریت کوپن‌های تخفیف و هدیه**\n\n';
    if (coupons.rows.length === 0) {
      message += 'هیچ کوپن فعالی وجود ندارد.\n';
    } else {
      coupons.rows.forEach((c) => {
        message += '🔹 **' + c.code + '**\n';
        message += '   نوع: ' + (c.type === 'discount' ? 'تخفیف' : 'هدیه') + '\n';
        message += '   مبلغ: ' + Number(c.amount).toLocaleString('en-US') + ' تومان\n';
        message += '   استفاده شده: ' + c.used_count + '/' + c.usage_limit + '\n';
        if (c.expires_at) {
          message += '   انقضا: ' + new Date(c.expires_at).toLocaleDateString('fa-IR') + '\n';
        }
        message += '\n';
      });
    }

    ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '➕ افزودن کوپن جدید', callback_data: 'admin_add_coupon' }],
          [{ text: '❌ غیرفعال کردن کوپن', callback_data: 'admin_disable_coupon' }],
          [{ text: '🔙 بازگشت به پنل مدیریت', callback_data: 'menu_admin_panel' }]
        ]
      }
    });
  });

  bot.action('admin_add_coupon', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    sessions[ctx.from.id] = {
      flow: 'admin_add_coupon',
      step: 'waiting_code',
      lang: 'fa',
      data: {}
    };

    ctx.reply(
      '➕ **افزودن کوپن جدید**\n\n' +
      'لطفاً **کد کوپن** را وارد کنید:\n' +
      'مثال: `VOCHINO2026`',
      { parse_mode: 'Markdown' }
    );
  });

  bot.action('admin_disable_coupon', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    sessions[ctx.from.id] = {
      flow: 'admin_disable_coupon',
      step: 'waiting_code',
      lang: 'fa'
    };

    ctx.reply('❌ **غیرفعال کردن کوپن**\n\nلطفاً کد کوپن را وارد کنید:', { parse_mode: 'Markdown' });
  });

  // ============================================
  // ارسال همگانی با عکس و متن
  // ============================================
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

  // ============================================
  // ارسال مخفی به یک نفر با عکس و متن
  // ============================================
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

  // ============================================
  // هدیه به کاربران با پیام تبریک خودکار
  // ============================================
  bot.action('admin_gift', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    sessions[ctx.from.id] = {
      flow: 'admin_gift',
      step: 'waiting_user_ids',
      lang: 'fa'
    };

    ctx.reply(
      '🎁 **هدیه به کاربران**\n\n' +
      'لطفاً آیدی‌های کاربران را با `-` جدا کنید:\n' +
      'مثال: `8231962200-8231962201-8231962202`\n\n' +
      'یا برای هدیه به یک نفر فقط آیدی را وارد کنید.',
      { parse_mode: 'Markdown' }
    );
  });

  // ============================================
  // مدیریت محصولات خرید
  // ============================================
  bot.action('admin_products_buy', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    ctx.reply('📦 **مدیریت محصولات خرید**\n\nلطفاً یکی از گزینه‌های زیر را انتخاب کنید:', {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '➕ افزودن محصول جدید', callback_data: 'admin_add_product_buy' }],
          [{ text: '📋 لیست محصولات', callback_data: 'admin_list_products_buy' }],
          [{ text: '❌ غیرفعال کردن محصول', callback_data: 'admin_remove_product_buy' }],
          [{ text: '💰 تنظیم کارمزد محصول', callback_data: 'admin_commission_product_buy' }],
          [{ text: '🔙 بازگشت به پنل مدیریت', callback_data: 'menu_admin_panel' }]
        ]
      }
    });
  });

  bot.action('admin_list_products_buy', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const res = await pool.query('SELECT * FROM products ORDER BY id ASC');

    if (res.rows.length === 0) {
      ctx.reply('📋 هیچ محصولی تعریف نشده است.');
      return;
    }

    let message = '📋 **لیست محصولات خرید**\n\n';
    res.rows.forEach(function (p) {
      const status = p.active ? '✅ فعال' : '⛔️ غیرفعال';
      const price = p.price_type === 'usd' ? Number(p.min_amount) + ' دلار' : Number(p.min_amount).toLocaleString('en-US') + ' تومان';
      const commission = p.commission_type === 'percentage' ? p.commission_value + '%' : (p.commission_type === 'fixed' ? Number(p.commission_value).toLocaleString('en-US') + ' تومان' : 'بدون کارمزد');
      message += '🔹 **' + p.name + '**\n';
      message += '   کلید: `' + p.key + '`\n';
      message += '   حداقل: ' + price + '\n';
      message += '   کارمزد: ' + commission + '\n';
      message += '   وضعیت: ' + status + '\n\n';
    });

    ctx.reply(message, { parse_mode: 'Markdown' });
  });

  // ============================================
  // مدیریت محصولات فروش
  // ============================================
  bot.action('admin_products_sell', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    ctx.reply('🎟 **مدیریت محصولات فروش**\n\nلطفاً یکی از گزینه‌های زیر را انتخاب کنید:', {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '➕ افزودن محصول جدید', callback_data: 'admin_add_product_sell' }],
          [{ text: '📋 لیست محصولات', callback_data: 'admin_list_products_sell' }],
          [{ text: '❌ غیرفعال کردن محصول', callback_data: 'admin_remove_product_sell' }],
          [{ text: '💰 تنظیم کارمزد محصول', callback_data: 'admin_commission_product_sell' }],
          [{ text: '🔙 بازگشت به پنل مدیریت', callback_data: 'menu_admin_panel' }]
        ]
      }
    });
  });

  bot.action('admin_list_products_sell', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const res = await pool.query('SELECT * FROM sell_products ORDER BY id ASC');

    if (res.rows.length === 0) {
      ctx.reply('📋 هیچ محصول فروشی تعریف نشده است.');
      return;
    }

    let message = '📋 **لیست محصولات فروش**\n\n';
    res.rows.forEach(function (p) {
      const status = p.active ? '✅ فعال' : '⛔️ غیرفعال';
      const commission = p.commission_type === 'percentage' ? p.commission_value + '%' : (p.commission_type === 'fixed' ? Number(p.commission_value).toLocaleString('en-US') + ' تومان' : 'بدون کارمزد');
      message += '🔹 **' + p.name + '**\n';
      message += '   کلید: `' + p.key + '`\n';
      message += '   قیمت واحد: ' + Number(p.unit_price).toLocaleString('en-US') + ' تومان\n';
      message += '   کارمزد: ' + commission + '\n';
      message += '   وضعیت: ' + status + '\n\n';
    });

    ctx.reply(message, { parse_mode: 'Markdown' });
  });

  // ============================================
  // تنظیمات کلی
  // ============================================
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
            [{ text: '🔙 بازگشت به پنل مدیریت', callback_data: 'menu_admin_panel' }]
          ]
        }
      }
    );
  });

  // ============================================
  // آمار کاربران
  // ============================================
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

  // ============================================
  // جستجوی کد پیگیری
  // ============================================
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

  // ============================================
  // اطلاعات یک کاربر
  // ============================================
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

  // ============================================
  // دکمه‌های افزودن محصولات (خرید و فروش)
  // ============================================
  bot.action('admin_add_product_buy', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    sessions[ctx.from.id] = {
      flow: 'admin_add_product_buy',
      step: 'waiting_details',
      lang: 'fa'
    };

    ctx.reply(
      '➕ **افزودن محصول جدید**\n\n' +
      'لطفاً مشخصات محصول را با فرمت زیر وارد کنید:\n\n' +
      '`کلید|نام نمایشی|حداقل مبلغ|نوع`\n\n' +
      '📌 نوع: `usd` یا `toman`\n\n' +
      'مثال:\n`voucher|🎟 یوووچر|1|usd`',
      { parse_mode: 'Markdown' }
    );
  });

  bot.action('admin_remove_product_buy', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    sessions[ctx.from.id] = {
      flow: 'admin_remove_product_buy',
      step: 'waiting_key',
      lang: 'fa'
    };

    ctx.reply('❌ **غیرفعال کردن محصول**\n\nلطفاً کلید محصول مورد نظر را وارد کنید:\nمثال: `voucher`', {
      parse_mode: 'Markdown'
    });
  });

  bot.action('admin_add_product_sell', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    sessions[ctx.from.id] = {
      flow: 'admin_add_product_sell',
      step: 'waiting_details',
      lang: 'fa'
    };

    ctx.reply(
      '➕ **افزودن محصول فروش جدید**\n\n' +
      'لطفاً مشخصات محصول را با فرمت زیر وارد کنید:\n\n' +
      '`کلید|نام نمایشی|قیمت واحد|نمونه کد`\n\n' +
      'مثال:\n`uvoucher|🎟 یوووچر|173031|USD-7T3H-C2QG-P6YA-D4UW-XOIQ`',
      { parse_mode: 'Markdown' }
    );
  });

  bot.action('admin_remove_product_sell', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    sessions[ctx.from.id] = {
      flow: 'admin_remove_product_sell',
      step: 'waiting_key',
      lang: 'fa'
    };

    ctx.reply('❌ **غیرفعال کردن محصول فروش**\n\nلطفاً کلید محصول مورد نظر را وارد کنید:\nمثال: `uvoucher`', {
      parse_mode: 'Markdown'
    });
  });

  // ============================================
  // دکمه‌های تنظیم سود
  // ============================================
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

  // ============================================
  // مدیریت درخواست‌های کیف پول، خرید و فروش
  // ============================================
  bot.action('admin_buy_pending', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const pendingRes = await pool.query("SELECT * FROM orders WHERE status = 'pending_delivery' ORDER BY id ASC");
    const pendingRequests = pendingRes.rows;

    if (pendingRequests.length === 0) {
      ctx.reply('✅ هیچ سفارش خریدی در انتظار تحویل نیست.');
      return;
    }

    for (const req of pendingRequests) {
      const user = await getUser(req.telegram_id);
      const userName = user ? user.full_name : 'نامشخص';
      const productRes = await pool.query('SELECT name FROM products WHERE key = $1', [req.product_type]);
      const productName = productRes.rows[0] ? productRes.rows[0].name : req.product_type;

      let message = '📦 **سفارش خرید در انتظار تحویل**\n\n';
      message += '🆔 کد پیگیری: `' + req.tracking_code + '`\n';
      message += '👤 کاربر: ' + userName + ' (`' + req.telegram_id + '`)\n';
      message += '📦 محصول: ' + productName + '\n';
      message += '💰 مبلغ: ' + Number(req.amount).toLocaleString('en-US') + ' تومان\n';
      message += '💰 کارمزد: ' + Number(req.commission || 0).toLocaleString('en-US') + ' تومان\n';
      message += '📅 تاریخ: ' + req.created_at + '\n\n';
      message += '⚠️ کد/متن تحویل را با دکمه زیر وارد کنید:';

      const buttons = [
        [{ text: '📤 ارسال کد تحویل', callback_data: 'admin_deliver_' + req.id }],
        [
          { text: '✅ تکمیل دستی', callback_data: 'admin_buy_complete_' + req.id },
          { text: '❌ لغو و بازگشت وجه', callback_data: 'admin_buy_cancel_' + req.id }
        ]
      ];

      await ctx.reply(message, { reply_markup: { inline_keyboard: buttons }, parse_mode: 'Markdown' });
    }
  });

  bot.action('admin_sell_pending', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const pendingRes = await pool.query("SELECT * FROM sell_orders WHERE status = 'pending_review' ORDER BY id ASC");
    const pendingRequests = pendingRes.rows;

    if (pendingRequests.length === 0) {
      ctx.reply('✅ هیچ درخواست فروشی در انتظار نیست.');
      return;
    }

    for (const req of pendingRequests) {
      const user = await getUser(req.telegram_id);
      const userName = user ? user.full_name : 'نامشخص';
      const productRes = await pool.query('SELECT name FROM sell_products WHERE key = $1', [req.product_type]);
      const productName = productRes.rows[0] ? productRes.rows[0].name : req.product_type;

      let message = '🎟 **درخواست فروش**\n\n';
      message += '🆔 کد پیگیری: `' + req.tracking_code + '`\n';
      message += '👤 کاربر: ' + userName + ' (`' + req.telegram_id + '`)\n';
      message += '📦 محصول: ' + productName + '\n';
      message += '🎫 کد ووچر: `' + req.voucher_code + '`\n';

      const buttons = [
        [{ text: '✅ تایید و وارد کردن مبلغ', callback_data: 'admin_sell_approve_' + req.id }],
        [
          { text: '❌ رد', callback_data: 'admin_sell_reject_' + req.id },
          { text: '✉️ رد با توضیح', callback_data: 'admin_sell_reject_reason_' + req.id }
        ]
      ];

      await ctx.reply(message, { reply_markup: { inline_keyboard: buttons }, parse_mode: 'Markdown' });
    }
  });

  bot.action('admin_pending', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const pendingRes = await pool.query("SELECT * FROM wallet_requests WHERE status = 'pending' ORDER BY id ASC");
    const pendingRequests = pendingRes.rows;

    if (pendingRequests.length === 0) {
      ctx.reply('✅ هیچ درخواست کیف پولی در انتظار نیست.');
      return;
    }

    for (const req of pendingRequests) {
      const user = await getUser(req.telegram_id);
      const userName = user ? user.full_name : 'نامشخص';
      const typeLabel = req.type === 'deposit' ? '➕ افزایش موجودی' : '💳 برداشت موجودی';

      let message = '💰 **' + typeLabel + '**\n\n';
      message += '🆔 کد پیگیری: `' + (req.tracking_code || '-') + '`\n';
      message += '👤 کاربر: ' + userName + ' (`' + req.telegram_id + '`)\n';
      message += '💰 مبلغ: ' + Number(req.amount).toLocaleString('en-US') + ' تومان\n';
      if (req.type === 'withdraw') {
        message += '💳 شماره کارت مقصد: `' + req.card_number + '`\n';
      }

      const buttons = [
        [
          { text: '✅ تایید', callback_data: 'admin_approve_' + req.id },
          { text: '❌ رد', callback_data: 'admin_reject_' + req.id }
        ],
        [{ text: '✉️ رد با توضیح', callback_data: 'admin_reject_reason_' + req.id }]
      ];

      if (req.type === 'deposit' && req.receipt_file_id) {
        await ctx.replyWithPhoto(req.receipt_file_id, { caption: message, reply_markup: { inline_keyboard: buttons }, parse_mode: 'Markdown' });
      } else {
        await ctx.reply(message, { reply_markup: { inline_keyboard: buttons }, parse_mode: 'Markdown' });
      }
    }
  });

  // ============================================
  // دکمه‌های تایید/رد و تحویل
  // ============================================
  bot.action(/^admin_deliver_([0-9]+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const orderId = ctx.match[1];
    const orderRes = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
    const order = orderRes.rows[0];

    if (!order || order.status !== 'pending_delivery') {
      ctx.reply('این سفارش قبلاً تحویل داده شده یا وجود ندارد.');
      return;
    }

    sessions[ctx.from.id] = {
      flow: 'admin_deliver_code',
      step: 'waiting_code',
      lang: 'fa',
      data: { orderId: orderId, telegramId: order.telegram_id, trackingCode: order.tracking_code }
    };

    ctx.reply('✍️ کد/متن تحویل را بنویسید (مستقیم برای کاربر ارسال می‌شود):');
  });

  bot.action(/^admin_buy_complete_([0-9]+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const orderId = ctx.match[1];
    const orderRes = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
    const order = orderRes.rows[0];

    if (!order || order.status !== 'pending_delivery') {
      ctx.reply('این سفارش قبلاً بررسی شده است.');
      return;
    }

    await pool.query("UPDATE orders SET status = 'completed' WHERE id = $1", [orderId]);
    ctx.telegram.sendMessage(
      order.telegram_id,
      '✅ سفارش خرید شما تکمیل شد.\n🆔 کد پیگیری: ' + order.tracking_code + '\n\nدر صورت هرگونه سؤال با پشتیبانی در تماس باشید.'
    );
    ctx.reply('✅ سفارش شماره ' + orderId + ' تکمیل شد.');
  });

  bot.action(/^admin_buy_cancel_([0-9]+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const orderId = ctx.match[1];
    const orderRes = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
    const order = orderRes.rows[0];

    if (!order || order.status !== 'pending_delivery') {
      ctx.reply('این سفارش قبلاً بررسی شده است.');
      return;
    }

    const totalRefund = Number(order.amount) + Number(order.commission || 0);
    await pool.query('UPDATE users SET balance = balance + $1 WHERE telegram_id = $2', [totalRefund, order.telegram_id]);
    await pool.query("UPDATE orders SET status = 'cancelled' WHERE id = $1", [orderId]);

    ctx.telegram.sendMessage(
      order.telegram_id,
      '❌ سفارش خرید شما لغو شد.\n🆔 کد پیگیری: ' + order.tracking_code + '\n💰 مبلغ ' + totalRefund.toLocaleString('en-US') + ' تومان به کیف پول شما بازگشت داده شد.'
    );
    ctx.reply('❌ سفارش شماره ' + orderId + ' لغو شد و مبلغ به کاربر بازگشت داده شد.');
  });

  bot.action(/^admin_sell_approve_([0-9]+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const requestId = ctx.match[1];
    const reqRes = await pool.query('SELECT * FROM sell_orders WHERE id = $1', [requestId]);
    const request = reqRes.rows[0];

    if (!request || request.status !== 'pending_review') {
      ctx.reply('این درخواست قبلاً بررسی شده است.');
      return;
    }

    sessions[ctx.from.id] = {
      flow: 'admin_sell_amount',
      step: 'waiting_amount',
      lang: 'fa',
      data: { requestId: requestId }
    };

    ctx.reply(texts.fa.sellAskFinalAmount);
  });

  bot.action(/^admin_sell_reject_([0-9]+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const requestId = ctx.match[1];
    const reqRes = await pool.query('SELECT * FROM sell_orders WHERE id = $1', [requestId]);
    const request = reqRes.rows[0];

    if (!request || request.status !== 'pending_review') {
      ctx.reply('این درخواست قبلاً بررسی شده است.');
      return;
    }

    await pool.query("UPDATE sell_orders SET status = 'rejected' WHERE id = $1", [requestId]);
    ctx.telegram.sendMessage(
      request.telegram_id,
      fillTemplate(texts.fa.sellRejectedUser, { trackingCode: request.tracking_code })
    );
    ctx.reply('❌ درخواست فروش شماره ' + requestId + ' رد شد.');
  });

  bot.action(/^admin_sell_reject_reason_([0-9]+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const requestId = ctx.match[1];
    const reqRes = await pool.query('SELECT * FROM sell_orders WHERE id = $1', [requestId]);
    const request = reqRes.rows[0];

    if (!request || request.status !== 'pending_review') {
      ctx.reply('این درخواست قبلاً بررسی شده است.');
      return;
    }

    sessions[ctx.from.id] = {
      flow: 'admin_sell_reject_reason',
      step: 'waiting_reason',
      lang: 'fa',
      data: { requestId: requestId }
    };

    ctx.reply('✍️ لطفاً دلیل رد این درخواست فروش را بنویسید (همین متن مستقیم برای کاربر ارسال می‌شود):');
  });

  bot.action(/^admin_approve_([0-9]+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const requestId = ctx.match[1];
    const reqRes = await pool.query('SELECT * FROM wallet_requests WHERE id = $1', [requestId]);
    const request = reqRes.rows[0];

    if (!request || request.status !== 'pending') {
      ctx.reply('این درخواست قبلاً بررسی شده است.');
      return;
    }

    const codeText = request.tracking_code ? ('\n🆔 کد پیگیری: ' + request.tracking_code) : '';

    if (request.type === 'deposit') {
      await pool.query('UPDATE users SET balance = balance + $1 WHERE telegram_id = $2', [request.amount, request.telegram_id]);
      ctx.telegram.sendMessage(request.telegram_id, '✅ شارژ کیف پول شما تایید شد.' + codeText + '\nمبلغ ' + Number(request.amount).toLocaleString('en-US') + ' تومان به موجودی شما اضافه شد.');
    } else {
      await pool.query('UPDATE users SET balance = balance - $1 WHERE telegram_id = $2', [request.amount, request.telegram_id]);
      ctx.telegram.sendMessage(request.telegram_id, '✅ درخواست برداشت شما تایید شد.' + codeText + '\nمبلغ ' + Number(request.amount).toLocaleString('en-US') + ' تومان به کارت شما واریز شد.');
    }

    await pool.query("UPDATE wallet_requests SET status = 'approved' WHERE id = $1", [requestId]);
    ctx.reply('✅ درخواست شماره ' + requestId + ' تایید شد.');
  });

  bot.action(/^admin_reject_([0-9]+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const requestId = ctx.match[1];
    const reqRes = await pool.query('SELECT * FROM wallet_requests WHERE id = $1', [requestId]);
    const request = reqRes.rows[0];

    if (!request || request.status !== 'pending') {
      ctx.reply('این درخواست قبلاً بررسی شده است.');
      return;
    }

    await pool.query("UPDATE wallet_requests SET status = 'rejected' WHERE id = $1", [requestId]);
    const codeText = request.tracking_code ? ('\n🆔 کد پیگیری: ' + request.tracking_code) : '';
    ctx.telegram.sendMessage(request.telegram_id, '❌ درخواست شما رد شد.' + codeText + '\nدر صورت هرگونه سؤال با پشتیبانی در تماس باشید.');
    ctx.reply('❌ درخواست شماره ' + requestId + ' رد شد.');
  });

  bot.action(/^admin_reject_reason_([0-9]+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const requestId = ctx.match[1];
    const reqRes = await pool.query('SELECT * FROM wallet_requests WHERE id = $1', [requestId]);
    const request = reqRes.rows[0];

    if (!request || request.status !== 'pending') {
      ctx.reply('این درخواست قبلاً بررسی شده است.');
      return;
    }

    sessions[ctx.from.id] = {
      flow: 'admin_reject_reason',
      step: 'waiting_reason',
      lang: 'fa',
      data: { requestId: requestId }
    };

    ctx.reply('✍️ لطفاً دلیل رد این درخواست را بنویسید (همین متن مستقیم برای کاربر ارسال می‌شود):');
  });

  // ============================================
  // هندلرهای متنی
  // ============================================
  bot.on('text', async (ctx, next) => {
    const session = sessions[ctx.from.id];
    if (!session) return next();

    if (!isAdmin(ctx.from.id)) {
      delete sessions[ctx.from.id];
      return next();
    }

    // ===== افزودن کانال =====
    if (session.flow === 'admin_add_channel' && session.step === 'waiting_chat_id') {
      const chatId = ctx.message.text.trim();
      if (!chatId.startsWith('-100') && !chatId.startsWith('-')) {
        ctx.reply('❌ آیدی کانال باید با `-100` یا `-` شروع شود. لطفاً دوباره وارد کنید.');
        return;
      }

      session.data = { chatId: chatId };
      session.step = 'waiting_invite_link';
      ctx.reply('✅ آیدی کانال ثبت شد.\n\nلطفاً **لینک دعوت** کانال را وارد کنید:\nمثال: `https://t.me/+DpU8DAaQei00YTFk`');
      return;
    }

    if (session.flow === 'admin_add_channel' && session.step === 'waiting_invite_link') {
      const inviteLink = ctx.message.text.trim();
      const chatId = session.data.chatId;

      await pool.query(
        'INSERT INTO required_channels (chat_id, invite_link, title, active, force_join_enabled) VALUES ($1, $2, $3, 1, 1) ON CONFLICT (chat_id) DO UPDATE SET invite_link = EXCLUDED.invite_link, active = 1',
        [chatId, inviteLink, 'کانال ' + chatId]
      );

      delete sessions[ctx.from.id];
      ctx.reply('✅ کانال با موفقیت اضافه شد.');
      return;
    }

    // ===== افزودن کوپن =====
    if (session.flow === 'admin_add_coupon' && session.step === 'waiting_code') {
      const code = ctx.message.text.trim().toUpperCase();
      if (code.length < 3) {
        ctx.reply('❌ کد کوپن باید حداقل ۳ کاراکتر باشد. لطفاً دوباره وارد کنید.');
        return;
      }

      session.data = { code: code };
      session.step = 'waiting_type';
      ctx.reply(
        '✅ کد کوپن ثبت شد.\n\n' +
        'لطفاً **نوع کوپن** را انتخاب کنید:',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🎁 هدیه', callback_data: 'coupon_type_gift' }],
              [{ text: '💰 تخفیف', callback_data: 'coupon_type_discount' }]
            ]
          }
        }
      );
      return;
    }

    // ===== غیرفعال کردن کوپن =====
    if (session.flow === 'admin_disable_coupon' && session.step === 'waiting_code') {
      const code = ctx.message.text.trim().toUpperCase();
      const res = await pool.query('UPDATE coupons SET active = 0 WHERE code = $1 RETURNING code', [code]);

      if (res.rows.length === 0) {
        ctx.reply('❌ کوپنی با این کد پیدا نشد.');
        return;
      }

      delete sessions[ctx.from.id];
      ctx.reply('✅ کوپن `' + code + '` با موفقیت غیرفعال شد.');
      return;
    }

    // ===== تنظیمات و تغییرات =====
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

    // ===== ارسال همگانی و مخفی =====
    if (session.flow === 'admin_broadcast' && session.step === 'waiting_photo_or_text') {
      const text = ctx.message.text;

      if (session.data.photo) {
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

    // ===== هدیه به کاربران با پیام تبریک =====
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

          // ارسال پیام تبریک به کاربر
          const user = await getUserById(id);
          if (user) {
            const giftMessage =
              '🎁 **تبریک! شما یک هدیه دریافت کردید!**\n\n' +
              '💰 مبلغ: ' + Number(amount).toLocaleString('en-US') + ' تومان\n' +
              '📌 به موجودی کیف پول شما اضافه شد.\n\n' +
              '🙏 از اینکه همراه ووچینو هستید، سپاسگزاریم.';
            await sendMessageToUser(bot, id, giftMessage, { parse_mode: 'Markdown' });
          }
        } catch (e) {
          console.log('خطا در هدیه به ' + id + ': ' + e.message);
        }
      }

      ctx.reply(
        '✅ **هدیه با موفقیت انجام شد!**\n\n' +
        '👥 تعداد کاربران: ' + userIds.length + '\n' +
        '✅ موفق: ' + successCount + '\n' +
        '💰 مبلغ هر هدیه: ' + Number(amount).toLocaleString('en-US') + ' تومان\n' +
        '💸 مجموع: ' + Number(amount * successCount).toLocaleString('en-US') + ' تومان\n\n' +
        '📨 پیام تبریک برای تمام کاربران ارسال شد.'
      );

      delete sessions[ctx.from.id];
      return;
    }

    // ===== افزودن محصول خرید =====
    if (session.flow === 'admin_add_product_buy' && session.step === 'waiting_details') {
      const parts = ctx.message.text.split('|').map(p => p.trim());
      if (parts.length !== 4) {
        ctx.reply('❌ فرمت صحیح نیست. لطفاً به صورت `کلید|نام|حداقل|نوع` وارد کنید.');
        return;
      }
      const [key, name, minAmount, priceType] = parts;
      if (!key || !name || !minAmount || (priceType !== 'usd' && priceType !== 'toman')) {
        ctx.reply('❌ مقادیر نامعتبر است. لطفاً دوباره تلاش کنید.');
        return;
      }
      await pool.query(
        'INSERT INTO products (key, name, min_amount, price_type, active, created_at) VALUES ($1, $2, $3, $4, 1, NOW()) ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, min_amount = EXCLUDED.min_amount, price_type = EXCLUDED.price_type, active = 1',
        [key, name, parseFloat(minAmount), priceType]
      );
      delete sessions[ctx.from.id];
      ctx.reply('✅ محصول «' + name + '» با موفقیت اضافه/ویرایش و فعال شد.');
      return;
    }

    if (session.flow === 'admin_remove_product_buy' && session.step === 'waiting_key') {
      const key = ctx.message.text.trim();
      const res = await pool.query("UPDATE products SET active = 0 WHERE key = $1 RETURNING name", [key]);
      if (res.rows.length === 0) {
        ctx.reply('❌ محصولی با این کلید پیدا نشد.');
        delete sessions[ctx.from.id];
        return;
      }
      delete sessions[ctx.from.id];
      ctx.reply('✅ محصول «' + res.rows[0].name + '» غیرفعال شد.');
      return;
    }

    // ===== افزودن محصول فروش =====
    if (session.flow === 'admin_add_product_sell' && session.step === 'waiting_details') {
      const parts = ctx.message.text.split('|').map(p => p.trim());
      if (parts.length !== 4) {
        ctx.reply('❌ فرمت صحیح نیست. لطفاً به صورت `کلید|نام|قیمت|نمونه کد` وارد کنید.');
        return;
      }
      const [key, name, price, sampleCode] = parts;
      if (!key || !name || !price || !sampleCode) {
        ctx.reply('❌ مقادیر نامعتبر است. لطفاً دوباره تلاش کنید.');
        return;
      }
      await pool.query(
        'INSERT INTO sell_products (key, name, unit_price, sample_code, active, created_at) VALUES ($1, $2, $3, $4, 1, NOW()) ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, unit_price = EXCLUDED.unit_price, sample_code = EXCLUDED.sample_code, active = 1',
        [key, name, parseFloat(price), sampleCode]
      );
      delete sessions[ctx.from.id];
      ctx.reply('✅ محصول فروش «' + name + '» با موفقیت اضافه/ویرایش و فعال شد.');
      return;
    }

    if (session.flow === 'admin_remove_product_sell' && session.step === 'waiting_key') {
      const key = ctx.message.text.trim();
      const res = await pool.query("UPDATE sell_products SET active = 0 WHERE key = $1 RETURNING name", [key]);
      if (res.rows.length === 0) {
        ctx.reply('❌ محصولی با این کلید پیدا نشد.');
        delete sessions[ctx.from.id];
        return;
      }
      delete sessions[ctx.from.id];
      ctx.reply('✅ محصول فروش «' + res.rows[0].name + '» غیرفعال شد.');
      return;
    }

    // ===== تحویل کد =====
    if (session.flow === 'admin_deliver_code' && session.step === 'waiting_code') {
      const deliveredCode = ctx.message.text.trim();
      const orderId = session.data.orderId;
      const orderRes = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
      const order = orderRes.rows[0];
      if (!order || order.status !== 'pending_delivery') {
        delete sessions[ctx.from.id];
        ctx.reply('این سفارش قبلاً تحویل داده شده است.');
        return;
      }
      await pool.query("UPDATE orders SET status = 'completed', delivered_code = $1 WHERE id = $2", [deliveredCode, orderId]);
      ctx.telegram.sendMessage(
        session.data.telegramId,
        '🎉 سفارش خرید شما تحویل داده شد!\n\n🆔 کد پیگیری: ' + session.data.trackingCode + '\n\n📦 کد/محتوای سفارش:\n' + deliveredCode + '\n\nبا تشکر از اعتماد شما 🙏'
      );
      delete sessions[ctx.from.id];
      ctx.reply('✅ کد تحویل برای کاربر ارسال شد و سفارش تکمیل شد.');
      return;
    }

    // ===== رد با توضیح =====
    if (session.flow === 'admin_reject_reason' && session.step === 'waiting_reason') {
      const reasonText = ctx.message.text;
      const requestId = session.data.requestId;
      const reqRes = await pool.query('SELECT * FROM wallet_requests WHERE id = $1', [requestId]);
      const request = reqRes.rows[0];
      if (!request || request.status !== 'pending') {
        delete sessions[ctx.from.id];
        ctx.reply('این درخواست قبلاً بررسی شده است.');
        return;
      }
      await pool.query("UPDATE wallet_requests SET status = 'rejected' WHERE id = $1", [requestId]);
      const codeText = request.tracking_code ? ('\n🆔 کد پیگیری: ' + request.tracking_code) : '';
      ctx.telegram.sendMessage(request.telegram_id, '❌ درخواست شما رد شد.' + codeText + '\n📝 دلیل:\n' + reasonText);
      delete sessions[ctx.from.id];
      ctx.reply('✅ درخواست شماره ' + requestId + ' با توضیح رد شد.');
      return;
    }

    if (session.flow === 'admin_sell_reject_reason' && session.step === 'waiting_reason') {
      const reasonText = ctx.message.text;
      const requestId = session.data.requestId;
      const reqRes = await pool.query('SELECT * FROM sell_orders WHERE id = $1', [requestId]);
      const request = reqRes.rows[0];
      if (!request || request.status !== 'pending_review') {
        delete sessions[ctx.from.id];
        ctx.reply('این درخواست قبلاً بررسی شده است.');
        return;
      }
      await pool.query("UPDATE sell_orders SET status = 'rejected' WHERE id = $1", [requestId]);
      ctx.telegram.sendMessage(request.telegram_id, '❌ درخواست فروش شما رد شد.\n🆔 کد پیگیری: ' + request.tracking_code + '\n📝 دلیل:\n' + reasonText);
      delete sessions[ctx.from.id];
      ctx.reply('✅ درخواست فروش شماره ' + requestId + ' با توضیح رد شد.');
      return;
    }

    if (session.flow === 'admin_sell_amount' && session.step === 'waiting_amount') {
      const amount = parseInt(ctx.message.text.replace(/[^0-9]/g, ''), 10);
      const requestId = session.data.requestId;
      if (!amount || amount <= 0) {
        ctx.reply('⚠️ عدد واردشده معتبر نیست. دوباره مبلغ را وارد کنید:');
        return;
      }
      const reqRes = await pool.query('SELECT * FROM sell_orders WHERE id = $1', [requestId]);
      const request = reqRes.rows[0];
      if (!request || request.status !== 'pending_review') {
        delete sessions[ctx.from.id];
        ctx.reply('این درخواست قبلاً بررسی شده است.');
        return;
      }
      await pool.query('UPDATE users SET balance = balance + $1 WHERE telegram_id = $2', [amount, request.telegram_id]);
      await pool.query("UPDATE sell_orders SET status = 'approved', amount = $1 WHERE id = $2", [amount, requestId]);
      ctx.telegram.sendMessage(
        request.telegram_id,
        fillTemplate(texts.fa.sellApprovedUser, {
          trackingCode: request.tracking_code,
          amount: amount.toLocaleString('en-US')
        })
      );
      delete sessions[ctx.from.id];
      ctx.reply('✅ فروش تایید شد و ' + amount.toLocaleString('en-US') + ' تومان به کیف پول کاربر اضافه شد.');
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

    return next();
  });

  // ============================================
  // هندلر عکس برای ارسال همگانی و مخفی
  // ============================================
  bot.on('photo', async (ctx, next) => {
    const session = sessions[ctx.from.id];
    if (!session) return next();

    if (!isAdmin(ctx.from.id)) {
      delete sessions[ctx.from.id];
      return next();
    }

    if (session.flow === 'admin_broadcast' && session.step === 'waiting_photo_or_text') {
      const photos = ctx.message.photo;
      const fileId = photos[photos.length - 1].file_id;
      session.data.photo = fileId;
      ctx.reply('✅ عکس دریافت شد. حالا **متن پیام** را بنویسید:');
      return;
    }

    if (session.flow === 'admin_fake_broadcast' && session.step === 'waiting_photo_or_text') {
      const photos = ctx.message.photo;
      const fileId = photos[photos.length - 1].file_id;
      session.data.photo = fileId;
      ctx.reply('✅ عکس دریافت شد. حالا **متن پیام** را بنویسید:');
      return;
    }

    return next();
  });

  // ============================================
  // هندلرهای Callback برای کوپن‌ها
  // ============================================
  bot.action('coupon_type_gift', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    const session = sessions[ctx.from.id];
    if (!session || session.flow !== 'admin_add_coupon') return;

    session.data.type = 'gift';
    session.step = 'waiting_amount';
    ctx.reply('🎁 **هدیه**\n\nمبلغ هدیه را به تومان وارد کنید:\nمثال: `50000`');
  });

  bot.action('coupon_type_discount', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    const session = sessions[ctx.from.id];
    if (!session || session.flow !== 'admin_add_coupon') return;

    session.data.type = 'discount';
    session.step = 'waiting_amount';
    ctx.reply('💰 **تخفیف**\n\nمبلغ تخفیف را به تومان وارد کنید:\nمثال: `20000`');
  });

  // ============================================
  // ادامه مراحل افزودن کوپن (بعد از انتخاب مبلغ و محدودیت)
  // ============================================
  // ادامه در هندلر text (بعد از waiting_amount)
  // اضافه کردن بخش ادامه در هندلر text
  // این بخش رو به انتهای هندلر text اضافه کنید (قبل از return next())

  // اضافه کردن ادامه مراحل کوپن در هندلر text
  // ============================================
  // ادامه مراحل کوپن (بعد از waiting_amount)
  // ============================================
  // این بخش رو به هندلر text اضافه کنید:

  // بعد از بخش هدیه و قبل از return next()
  // === ادامه کوپن ===
  if (session.flow === 'admin_add_coupon' && session.step === 'waiting_amount') {
    const amount = parseInt(ctx.message.text.replace(/[^0-9]/g, ''), 10);
    if (!amount || amount <= 0) {
      ctx.reply('❌ لطفاً یک عدد معتبر (بزرگتر از ۰) وارد کنید.');
      return;
    }

    session.data.amount = amount;
    session.step = 'waiting_limit';
    ctx.reply(
      '✅ مبلغ ثبت شد.\n\n' +
      'لطفاً **سقف تعداد استفاده** را وارد کنید (پیش‌فرض: ۱):\n' +
      'مثال: `10` یا `1`'
    );
    return;
  }

  if (session.flow === 'admin_add_coupon' && session.step === 'waiting_limit') {
    const limit = parseInt(ctx.message.text.replace(/[^0-9]/g, ''), 10);
    const usageLimit = (limit && limit > 0) ? limit : 1;

    session.data.usage_limit = usageLimit;
    session.step = 'waiting_expiry';
    ctx.reply(
      '✅ سقف استفاده ثبت شد.\n\n' +
      'لطفاً **تاریخ انقضا** را وارد کنید (یا `0` برای بدون انقضا):\n' +
      'فرمت: `YYYY-MM-DD`\n' +
      'مثال: `2026-12-31` یا `0`'
    );
    return;
  }

  if (session.flow === 'admin_add_coupon' && session.step === 'waiting_expiry') {
    let expiresAt = null;
    const input = ctx.message.text.trim();

    if (input !== '0') {
      const date = new Date(input);
      if (isNaN(date.getTime())) {
        ctx.reply('❌ تاریخ نامعتبر است. لطفاً به فرمت `YYYY-MM-DD` وارد کنید یا `0` برای بدون انقضا:');
        return;
      }
      expiresAt = date.toISOString();
    }

    const { code, type, amount, usage_limit } = session.data;

    await pool.query(
      'INSERT INTO coupons (code, type, amount, usage_limit, expires_at, active, created_at) VALUES ($1, $2, $3, $4, $5, 1, NOW())',
      [code, type, amount, usage_limit, expiresAt]
    );

    delete sessions[ctx.from.id];
    ctx.reply(
      '✅ **کوپن با موفقیت ایجاد شد!**\n\n' +
      '🔹 کد: `' + code + '`\n' +
      '🔹 نوع: ' + (type === 'discount' ? 'تخفیف' : 'هدیه') + '\n' +
      '🔹 مبلغ: ' + Number(amount).toLocaleString('en-US') + ' تومان\n' +
      '🔹 سقف استفاده: ' + usage_limit + '\n' +
      '🔹 انقضا: ' + (expiresAt ? new Date(expiresAt).toLocaleDateString('fa-IR') : 'بدون انقضا'),
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // ============================================
  // ادامه مراحل کارمزد محصولات
  // ============================================
  if (session.flow === 'admin_commission_product_buy' && session.step === 'waiting_details') {
    const parts = ctx.message.text.split('|').map(p => p.trim());
    if (parts.length !== 3) {
      ctx.reply('❌ فرمت صحیح نیست. لطفاً به صورت `کلید|نوع|مقدار` وارد کنید.');
      return;
    }
    const [key, type, value] = parts;
    if (!key || !type || !value) {
      ctx.reply('❌ مقادیر نامعتبر است. لطفاً دوباره تلاش کنید.');
      return;
    }
    if (type !== 'none' && type !== 'percentage' && type !== 'fixed') {
      ctx.reply('❌ نوع کارمزد باید `none`، `percentage` یا `fixed` باشد.');
      return;
    }
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue < 0) {
      ctx.reply('❌ مقدار کارمزد باید عددی مثبت باشد.');
      return;
    }
    const res = await pool.query('UPDATE products SET commission_type = $1, commission_value = $2 WHERE key = $3 RETURNING name', [type, numValue, key]);
    if (res.rows.length === 0) {
      ctx.reply('❌ محصولی با این کلید پیدا نشد.');
      delete sessions[ctx.from.id];
      return;
    }
    delete sessions[ctx.from.id];
    ctx.reply('✅ کارمزد محصول «' + res.rows[0].name + '» با موفقیت تنظیم شد.');
    return;
  }

  if (session.flow === 'admin_commission_product_sell' && session.step === 'waiting_details') {
    const parts = ctx.message.text.split('|').map(p => p.trim());
    if (parts.length !== 3) {
      ctx.reply('❌ فرمت صحیح نیست. لطفاً به صورت `کلید|نوع|مقدار` وارد کنید.');
      return;
    }
    const [key, type, value] = parts;
    if (!key || !type || !value) {
      ctx.reply('❌ مقادیر نامعتبر است. لطفاً دوباره تلاش کنید.');
      return;
    }
    if (type !== 'none' && type !== 'percentage' && type !== 'fixed') {
      ctx.reply('❌ نوع کارمزد باید `none`، `percentage` یا `fixed` باشد.');
      return;
    }
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue < 0) {
      ctx.reply('❌ مقدار کارمزد باید عددی مثبت باشد.');
      return;
    }
    const res = await pool.query('UPDATE sell_products SET commission_type = $1, commission_value = $2 WHERE key = $3 RETURNING name', [type, numValue, key]);
    if (res.rows.length === 0) {
      ctx.reply('❌ محصولی با این کلید پیدا نشد.');
      delete sessions[ctx.from.id];
      return;
    }
    delete sessions[ctx.from.id];
    ctx.reply('✅ کارمزد محصول فروش «' + res.rows[0].name + '» با موفقیت تنظیم شد.');
    return;
  }

  // ============================================
  // دکمه تنظیم کارمزد محصولات (فراخوانی)
  // ============================================
  bot.action('admin_commission_product_buy', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const res = await pool.query('SELECT key, name FROM products WHERE active = 1 ORDER BY id ASC');
    if (res.rows.length === 0) {
      ctx.reply('❌ هیچ محصول فعالی برای تنظیم کارمزد وجود ندارد.');
      return;
    }

    let message = '💰 **تنظیم کارمزد محصولات خرید**\n\n';
    message += 'برای تنظیم کارمزد هر محصول، کلید آن را به همراه نوع و مقدار وارد کنید:\n\n';
    message += 'فرمت: `کلید|نوع|مقدار`\n\n';
    message += 'نوع: `percentage` (درصدی) یا `fixed` (ثابت)\n\n';
    message += 'مثال‌ها:\n';
    message += '`voucher|percentage|10` → ۱۰٪ کارمزد\n';
    message += '`hotvoucher|fixed|5000` → ۵۰۰۰ تومان کارمزد ثابت\n';
    message += '`voucher|none|0` → بدون کارمزد\n\n';
    message += '📋 لیست محصولات فعال:\n';
    res.rows.forEach(p => {
      message += '• `' + p.key + '` → ' + p.name + '\n';
    });

    sessions[ctx.from.id] = {
      flow: 'admin_commission_product_buy',
      step: 'waiting_details',
      lang: 'fa'
    };

    ctx.reply(message, { parse_mode: 'Markdown' });
  });

  bot.action('admin_commission_product_sell', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const res = await pool.query('SELECT key, name FROM sell_products WHERE active = 1 ORDER BY id ASC');
    if (res.rows.length === 0) {
      ctx.reply('❌ هیچ محصول فروش فعالی برای تنظیم کارمزد وجود ندارد.');
      return;
    }

    let message = '💰 **تنظیم کارمزد محصولات فروش**\n\n';
    message += 'برای تنظیم کارمزد هر محصول، کلید آن را به همراه نوع و مقدار وارد کنید:\n\n';
    message += 'فرمت: `کلید|نوع|مقدار`\n\n';
    message += 'نوع: `percentage` (درصدی) یا `fixed` (ثابت)\n\n';
    message += 'مثال‌ها:\n';
    message += '`uvoucher|percentage|5` → ۵٪ کارمزد\n';
    message += '`psvoucher|fixed|3000` → ۳۰۰۰ تومان کارمزد ثابت\n';
    message += '`uvoucher|none|0` → بدون کارمزد\n\n';
    message += '📋 لیست محصولات فعال:\n';
    res.rows.forEach(p => {
      message += '• `' + p.key + '` → ' + p.name + '\n';
    });

    sessions[ctx.from.id] = {
      flow: 'admin_commission_product_sell',
      step: 'waiting_details',
      lang: 'fa'
    };

    ctx.reply(message, { parse_mode: 'Markdown' });
  });
};
