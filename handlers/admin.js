// handlers/admin.js
const texts = require('../texts');
const { sessions, fillTemplate, sendBroadcast, sendBroadcastWithPhoto, sendMessageToUser } = require('../utils');
const { pool, getUser, getUserById, getAllUsers, getUsdRate, getSetting, setSetting } = require('../db');
const { ADMIN_IDS } = require('../constants');

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

    const pendingWallet = await pool.query("SELECT COUNT(*)::int AS c FROM wallet_requests WHERE status = 'pending'");
    const pendingSell = await pool.query("SELECT COUNT(*)::int AS c FROM sell_orders WHERE status = 'pending_review'");
    const pendingBuy = await pool.query("SELECT COUNT(*)::int AS c FROM orders WHERE status = 'pending_delivery'");

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
    ctx.reply(message, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } });
  });

  bot.action(/^admin_delete_channel_(.+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    const chatId = ctx.match[1];
    await pool.query('UPDATE required_channels SET active = 0 WHERE chat_id = $1', [chatId]);
    ctx.reply('✅ کانال با موفقیت حذف شد.');
  });

  // ============================================
  // مدیریت کوپن‌های تخفیف (مرحله‌ای)
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
        message += '   مبلغ: ' + Number(c.amount).toLocaleString() + ' تومان\n';
        message += '   استفاده شده: ' + c.used_count + '/' + c.usage_limit + '\n';
        if (c.expires_at) message += '   انقضا: ' + new Date(c.expires_at).toLocaleDateString('fa-IR') + '\n';
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

    ctx.reply('➕ **افزودن کوپن جدید**\n\nلطفاً **کد کوپن** را وارد کنید:\nمثال: `VOCHINO2026`', { parse_mode: 'Markdown' });
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
  // ارسال همگانی (متن یا عکس+متن)
  // ============================================
  bot.action('admin_broadcast', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    sessions[ctx.from.id] = {
      flow: 'admin_broadcast',
      step: 'waiting_media_choice',
      lang: 'fa',
      data: {}
    };

    ctx.reply(
      '📢 **ارسال همگانی**\n\n' +
      'آیا می‌خواهید پیام **فقط متن** باشد یا **همراه با عکس**؟',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📝 فقط متن', callback_data: 'broadcast_text_only' }],
            [{ text: '🖼 همراه با عکس', callback_data: 'broadcast_with_photo' }]
          ]
        }
      }
    );
  });

  bot.action('broadcast_text_only', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    sessions[ctx.from.id].step = 'waiting_text';
    ctx.reply('📝 لطفاً **متن پیام** را ارسال کنید:');
  });

  bot.action('broadcast_with_photo', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    sessions[ctx.from.id].step = 'waiting_photo';
    ctx.reply('🖼 لطفاً **عکس** را ارسال کنید، سپس از شما متن (کپشن) خواسته خواهد شد.');
  });

  // ============================================
  // ارسال مخفی به یک نفر (متن یا عکس+متن)
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
      'لطفاً **آیدی عددی کاربر** را وارد کنید:\nمثال: `8231962200`',
      { parse_mode: 'Markdown' }
    );
  });

  // ============================================
  // هدیه به کاربران با پیام تبریک اختصاصی
  // ============================================
  bot.action('admin_gift', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    sessions[ctx.from.id] = {
      flow: 'admin_gift',
      step: 'waiting_user_ids',
      lang: 'fa',
      data: {}
    };

    ctx.reply(
      '🎁 **هدیه به کاربران**\n\n' +
      'لطفاً آیدی‌های کاربران را با `-` جدا کنید:\n' +
      'مثال: `8231962200-8231962201`\n\n' +
      'یا برای یک نفر فقط آیدی را وارد کنید.',
      { parse_mode: 'Markdown' }
    );
  });

  // ============================================
  // مدیریت محصولات خرید (گام‌به‌گام)
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

  // افزودن محصول خرید گام‌به‌گام
  bot.action('admin_add_product_buy', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    sessions[ctx.from.id] = {
      flow: 'admin_add_product_buy',
      step: 'waiting_name',
      lang: 'fa',
      data: {}
    };

    ctx.reply('➕ **افزودن محصول خرید جدید**\n\nلطفاً **نام نمایشی محصول** را وارد کنید:\nمثال: `🎟 یوووچر`');
  });

  // غیرفعال کردن محصول خرید
  bot.action('admin_remove_product_buy', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const prods = await pool.query('SELECT key, name FROM products WHERE active = 1 ORDER BY id ASC');
    if (prods.rows.length === 0) {
      ctx.reply('❌ هیچ محصول فعالی برای غیرفعال کردن وجود ندارد.');
      return;
    }

    const buttons = prods.rows.map(p => [{ text: p.name, callback_data: `admin_remove_buy_${p.key}` }]);
    buttons.push([{ text: '🔙 بازگشت', callback_data: 'admin_products_buy' }]);

    ctx.reply('❌ **غیرفعال کردن محصول**\n\nمحصول مورد نظر را انتخاب کنید:', {
      reply_markup: { inline_keyboard: buttons }
    });
  });

  bot.action(/^admin_remove_buy_(.+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const key = ctx.match[1];
    await pool.query('UPDATE products SET active = 0 WHERE key = $1', [key]);
    ctx.answerCbQuery('✅ غیرفعال شد');
    ctx.reply('✅ محصول غیرفعال شد.');
  });

  // تنظیم کارمزد برای محصول خرید (گام‌به‌گام)
  bot.action('admin_commission_product_buy', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const prods = await pool.query('SELECT key, name FROM products WHERE active = 1 ORDER BY id ASC');
    if (prods.rows.length === 0) {
      ctx.reply('❌ هیچ محصول فعالی وجود ندارد.');
      return;
    }

    const buttons = prods.rows.map(p => [{ text: p.name, callback_data: `admin_comm_buy_choose_${p.key}` }]);
    buttons.push([{ text: '🔙 بازگشت', callback_data: 'admin_products_buy' }]);

    ctx.reply('💰 **تنظیم کارمزد محصول خرید**\n\nمحصول را انتخاب کنید:', {
      reply_markup: { inline_keyboard: buttons }
    });
  });

  bot.action(/^admin_comm_buy_choose_(.+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const key = ctx.match[1];
    ctx.answerCbQuery();

    sessions[ctx.from.id] = {
      flow: 'admin_commission_product_buy',
      step: 'waiting_type',
      lang: 'fa',
      data: { productKey: key }
    };

    ctx.reply(
      `محصول انتخاب شد.\n\n` +
      `نوع کارمزد را انتخاب کنید:`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📊 درصدی (مثلاً ۱۰٪)', callback_data: 'comm_buy_type_percentage' }],
            [{ text: '💵 ثابت (تومان)', callback_data: 'comm_buy_type_fixed' }],
            [{ text: '❌ بدون کارمزد', callback_data: 'comm_buy_type_none' }]
          ]
        }
      }
    );
  });

  // ادامه تنظیم کارمزد خرید
  bot.action('comm_buy_type_percentage', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const s = sessions[ctx.from.id];
    if (!s || s.flow !== 'admin_commission_product_buy') return;
    s.data.commType = 'percentage';
    s.step = 'waiting_value';
    ctx.answerCbQuery();
    ctx.reply('📊 لطفاً **درصد کارمزد** را وارد کنید (مثلاً ۱۰):');
  });

  bot.action('comm_buy_type_fixed', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const s = sessions[ctx.from.id];
    if (!s || s.flow !== 'admin_commission_product_buy') return;
    s.data.commType = 'fixed';
    s.step = 'waiting_value';
    ctx.answerCbQuery();
    ctx.reply('💵 لطفاً **مبلغ ثابت کارمزد** (تومان) را وارد کنید:');
  });

  bot.action('comm_buy_type_none', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const s = sessions[ctx.from.id];
    if (!s || s.flow !== 'admin_commission_product_buy') return;
    const key = s.data.productKey;
    await pool.query('UPDATE products SET commission_type = $1, commission_value = 0 WHERE key = $2', ['none', key]);
    delete sessions[ctx.from.id];
    ctx.answerCbQuery();
    ctx.reply('✅ کارمزد محصول **بدون کارمزد** تنظیم شد.');
  });

  // ============================================
  // مدیریت محصولات فروش (گام‌به‌گام)
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

  bot.action('admin_add_product_sell', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    sessions[ctx.from.id] = {
      flow: 'admin_add_product_sell',
      step: 'waiting_name',
      lang: 'fa',
      data: {}
    };

    ctx.reply('➕ **افزودن محصول فروش جدید**\n\nلطفاً **نام نمایشی محصول** را وارد کنید:\nمثال: `🎟 یوووچر`');
  });

  bot.action('admin_remove_product_sell', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const prods = await pool.query('SELECT key, name FROM sell_products WHERE active = 1 ORDER BY id ASC');
    if (prods.rows.length === 0) {
      ctx.reply('❌ هیچ محصول فروش فعالی برای غیرفعال کردن وجود ندارد.');
      return;
    }

    const buttons = prods.rows.map(p => [{ text: p.name, callback_data: `admin_remove_sell_${p.key}` }]);
    buttons.push([{ text: '🔙 بازگشت', callback_data: 'admin_products_sell' }]);

    ctx.reply('❌ **غیرفعال کردن محصول فروش**\n\nمحصول مورد نظر را انتخاب کنید:', {
      reply_markup: { inline_keyboard: buttons }
    });
  });

  bot.action(/^admin_remove_sell_(.+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const key = ctx.match[1];
    await pool.query('UPDATE sell_products SET active = 0 WHERE key = $1', [key]);
    ctx.answerCbQuery('✅ غیرفعال شد');
    ctx.reply('✅ محصول فروش غیرفعال شد.');
  });

  bot.action('admin_commission_product_sell', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const prods = await pool.query('SELECT key, name FROM sell_products WHERE active = 1 ORDER BY id ASC');
    if (prods.rows.length === 0) {
      ctx.reply('❌ هیچ محصول فروش فعالی وجود ندارد.');
      return;
    }

    const buttons = prods.rows.map(p => [{ text: p.name, callback_data: `admin_comm_sell_choose_${p.key}` }]);
    buttons.push([{ text: '🔙 بازگشت', callback_data: 'admin_products_sell' }]);

    ctx.reply('💰 **تنظیم کارمزد محصول فروش**\n\nمحصول را انتخاب کنید:', {
      reply_markup: { inline_keyboard: buttons }
    });
  });

  bot.action(/^admin_comm_sell_choose_(.+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const key = ctx.match[1];
    ctx.answerCbQuery();

    sessions[ctx.from.id] = {
      flow: 'admin_commission_product_sell',
      step: 'waiting_type',
      lang: 'fa',
      data: { productKey: key }
    };

    ctx.reply('محصول انتخاب شد.\n\nنوع کارمزد را انتخاب کنید:', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📊 درصدی', callback_data: 'comm_sell_type_percentage' }],
          [{ text: '💵 ثابت', callback_data: 'comm_sell_type_fixed' }],
          [{ text: '❌ بدون کارمزد', callback_data: 'comm_sell_type_none' }]
        ]
      }
    });
  });

  bot.action('comm_sell_type_percentage', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const s = sessions[ctx.from.id];
    if (!s || s.flow !== 'admin_commission_product_sell') return;
    s.data.commType = 'percentage';
    s.step = 'waiting_value';
    ctx.answerCbQuery();
    ctx.reply('📊 لطفاً **درصد کارمزد** را وارد کنید (مثلاً ۵):');
  });

  bot.action('comm_sell_type_fixed', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const s = sessions[ctx.from.id];
    if (!s || s.flow !== 'admin_commission_product_sell') return;
    s.data.commType = 'fixed';
    s.step = 'waiting_value';
    ctx.answerCbQuery();
    ctx.reply('💵 لطفاً **مبلغ ثابت کارمزد** (تومان) را وارد کنید:');
  });

  bot.action('comm_sell_type_none', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const s = sessions[ctx.from.id];
    if (!s || s.flow !== 'admin_commission_product_sell') return;
    const key = s.data.productKey;
    await pool.query('UPDATE sell_products SET commission_type = $1, commission_value = 0 WHERE key = $2', ['none', key]);
    delete sessions[ctx.from.id];
    ctx.answerCbQuery();
    ctx.reply('✅ کارمزد محصول فروش **بدون کارمزد** تنظیم شد.');
  });

  // ============================================
  // تنظیمات کلی (نرخ دلار، ایموجی)
  // ============================================
  bot.action('admin_settings', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const rateRes = await pool.query("SELECT value FROM settings WHERE key = 'usd_rate'");
    const reactRes = await pool.query("SELECT value FROM settings WHERE key = 'start_reaction'");
    const rate = rateRes.rows[0] ? Number(rateRes.rows[0].value).toLocaleString() : '60,000';
    const reaction = reactRes.rows[0] ? reactRes.rows[0].value : '🎉';

    ctx.reply(
      '⚙️ **تنظیمات کلی**\n\n' +
      '💰 نرخ دلار: ' + rate + ' تومان\n' +
      '🎭 ایموجی استارت: ' + reaction + '\n\n' +
      'برای تغییر هر کدام، گزینه مورد نظر را انتخاب کنید:',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '💵 تغییر نرخ دلار', callback_data: 'admin_set_rate' }],
            [{ text: '🎭 تغییر ایموجی استارت', callback_data: 'admin_set_reaction' }],
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
    sessions[ctx.from.id] = { flow: 'admin_set_rate', step: 'waiting_value', lang: 'fa' };
    ctx.reply('💵 **تغییر نرخ دلار**\n\nلطفاً نرخ جدید را به تومان وارد کنید:\nمثال: `65000`', { parse_mode: 'Markdown' });
  });

  bot.action('admin_set_reaction', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_set_reaction', step: 'waiting_value', lang: 'fa' };
    ctx.reply('🎭 **تغییر ایموجی استارت**\n\nلطفاً ایموجی مورد نظر را ارسال کنید:\nمثال: `🔥` یا `🎉`', { parse_mode: 'Markdown' });
  });

  // ============================================
  // پردازش متن‌های ورودی ادمین (گام‌های مختلف)
  // ============================================
  bot.on('text', async (ctx, next) => {
    if (!isAdmin(ctx.from.id)) return next();
    const session = sessions[ctx.from.id];
    if (!session) return next();

    // ---------- افزودن کانال ----------
    if (session.flow === 'admin_add_channel') {
      if (session.step === 'waiting_chat_id') {
        const chatId = ctx.message.text.trim();
        if (!chatId.startsWith('-')) {
          return ctx.reply('❌ آیدی کانال باید با `-` شروع شود. دوباره وارد کنید:');
        }
        session.chatId = chatId;
        session.step = 'waiting_invite_link';
        return ctx.reply('✅ آیدی کانال ثبت شد.\n\nلطفاً **لینک دعوت** کانال را وارد کنید:');
      }
      else if (session.step === 'waiting_invite_link') {
        const inviteLink = ctx.message.text.trim();
        const chatId = session.chatId;
        try {
          await pool.query(
            `INSERT INTO required_channels (chat_id, invite_link, title, active, force_join_enabled)
             VALUES ($1, $2, $3, 1, 1)
             ON CONFLICT (chat_id) DO UPDATE SET invite_link = EXCLUDED.invite_link, active = 1`,
            [chatId, inviteLink, 'کانال ' + chatId]
          );
          delete sessions[ctx.from.id];
          ctx.reply('✅ کانال با موفقیت اضافه شد.');
        } catch (err) {
          ctx.reply('❌ خطا در ذخیره کانال: ' + err.message);
        }
        return;
      }
    }

    // ---------- تنظیم نرخ دلار ----------
    if (session.flow === 'admin_set_rate' && session.step === 'waiting_value') {
      const value = parseInt(ctx.message.text.replace(/[^0-9]/g, ''), 10);
      if (!value || value <= 0) {
        return ctx.reply('❌ لطفاً یک عدد معتبر وارد کنید.');
      }
      await setSetting('usd_rate', String(value));
      delete sessions[ctx.from.id];
      ctx.reply('✅ نرخ دلار با موفقیت به ' + value.toLocaleString() + ' تومان تغییر یافت.');
      return;
    }

    // ---------- تنظیم ایموجی (پذیرش هر کاراکتر/ایموجی) ----------
    if (session.flow === 'admin_set_reaction' && session.step === 'waiting_value') {
      const emoji = ctx.message.text.trim();
      if (emoji.length === 0) {
        return ctx.reply('❌ ایموجی نامعتبر.');
      }
      await setSetting('start_reaction', emoji);
      delete sessions[ctx.from.id];
      ctx.reply('✅ ایموجی استارت با موفقیت به ' + emoji + ' تغییر یافت.');
      return;
    }

    // ---------- ارسال همگانی (متن) ----------
    if (session.flow === 'admin_broadcast' && session.step === 'waiting_text') {
      const text = ctx.message.text;
      const allUsers = await getAllUsers(true);
      const userIds = allUsers.map(u => u.telegram_id);
      if (userIds.length === 0) {
        delete sessions[ctx.from.id];
        return ctx.reply('❌ هیچ کاربری یافت نشد.');
      }
      const msg = await ctx.reply('📢 در حال ارسال همگانی...');
      const results = await sendBroadcast(bot, userIds, text, { parse_mode: 'HTML' });
      const ok = results.filter(r => r.success).length;
      const fail = results.filter(r => !r.success).length;
      await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null,
        `✅ ارسال همگانی انجام شد!\n✅ موفق: ${ok}\n❌ ناموفق: ${fail}`
      );
      delete sessions[ctx.from.id];
      return;
    }

    // ---------- ارسال همگانی (کپشن برای عکس) ----------
    if (session.flow === 'admin_broadcast' && session.step === 'waiting_caption' && session.data.photo) {
      const caption = ctx.message.text;
      const allUsers = await getAllUsers(true);
      const userIds = allUsers.map(u => u.telegram_id);
      const msg = await ctx.reply('📢 در حال ارسال همگانی با عکس...');
      const results = await sendBroadcastWithPhoto(bot, userIds, session.data.photo, caption, { parse_mode: 'HTML' });
      const ok = results.filter(r => r.success).length;
      const fail = results.filter(r => !r.success).length;
      await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null,
        `✅ ارسال همگانی با عکس انجام شد!\n✅ موفق: ${ok}\n❌ ناموفق: ${fail}`
      );
      delete sessions[ctx.from.id];
      return;
    }

    // ---------- ارسال مخفی (ورود آیدی و سپس نوع) ----------
    if (session.flow === 'admin_fake_broadcast') {
      if (session.step === 'waiting_user_id') {
        const targetId = ctx.message.text.trim();
        const user = await getUserById(targetId);
        if (!user) return ctx.reply('❌ کاربر پیدا نشد. دوباره وارد کنید:');
        session.targetId = targetId;
        session.step = 'waiting_media_choice';
        return ctx.reply('✅ کاربر: ' + (user.full_name || targetId) + '\n\nنوع پیام را انتخاب کنید:', {
          reply_markup: {
            inline_keyboard: [
              [{ text: '📝 فقط متن', callback_data: 'fake_text_only' }],
              [{ text: '🖼 همراه با عکس', callback_data: 'fake_with_photo' }]
            ]
          }
        });
      }

      if (session.step === 'waiting_text') {
        const text = ctx.message.text;
        const result = await sendBroadcast(bot, [session.targetId], text, { parse_mode: 'HTML' }, true);
        if (result[0].success) {
          ctx.reply('✅ پیام مخفی ارسال شد.');
        } else {
          ctx.reply('❌ خطا در ارسال: ' + result[0].error);
        }
        delete sessions[ctx.from.id];
        return;
      }

      if (session.step === 'waiting_caption' && session.data.photo) {
        const caption = ctx.message.text;
        const result = await sendBroadcastWithPhoto(bot, [session.targetId], session.data.photo, caption, { parse_mode: 'HTML' }, true);
        if (result[0].success) {
          ctx.reply('✅ پیام مخفی با عکس ارسال شد.');
        } else {
          ctx.reply('❌ خطا: ' + result[0].error);
        }
        delete sessions[ctx.from.id];
        return;
      }
    }

    // ---------- افزودن کوپن ----------
    if (session.flow === 'admin_add_coupon') {
      if (session.step === 'waiting_code') {
        const code = ctx.message.text.trim().toUpperCase();
        if (code.length < 3) return ctx.reply('❌ کد باید حداقل ۳ کاراکتر باشد.');
        session.data.code = code;
        session.step = 'waiting_type';
        return ctx.reply('نوع کوپن را انتخاب کنید:', {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🎁 هدیه', callback_data: 'coupon_type_gift' }],
              [{ text: '💰 تخفیف', callback_data: 'coupon_type_discount' }]
            ]
          }
        });
      }
      if (session.step === 'waiting_amount') {
        const amount = parseInt(ctx.message.text.replace(/[^0-9]/g, ''));
        if (!amount || amount <= 0) return ctx.reply('❌ مبلغ نامعتبر.');
        session.data.amount = amount;
        session.step = 'waiting_limit';
        return ctx.reply('✅ مبلغ ثبت شد.\n\nسقف تعداد استفاده را وارد کنید (پیش‌فرض ۱):');
      }
      if (session.step === 'waiting_limit') {
        const limit = parseInt(ctx.message.text.replace(/[^0-9]/g, '')) || 1;
        session.data.usage_limit = limit;
        session.step = 'waiting_expiry';
        return ctx.reply('✅ سقف استفاده ثبت شد.\n\nتاریخ انقضا را وارد کنید (YYYY-MM-DD) یا `0` برای بدون انقضا:');
      }
      if (session.step === 'waiting_expiry') {
        const input = ctx.message.text.trim();
        let expiresAt = null;
        if (input !== '0') {
          const d = new Date(input);
          if (isNaN(d.getTime())) return ctx.reply('❌ تاریخ نامعتبر. دوباره وارد کنید:');
          expiresAt = d.toISOString();
        }
        const { code, type, amount, usage_limit } = session.data;
        await pool.query(
          'INSERT INTO coupons (code, type, amount, usage_limit, expires_at, active, created_at) VALUES ($1,$2,$3,$4,$5,1,NOW())',
          [code, type, amount, usage_limit, expiresAt]
        );
        delete sessions[ctx.from.id];
        ctx.reply(`✅ کوپن **${code}** با موفقیت ایجاد شد.`);
        return;
      }
    }

    // ---------- غیرفعال کردن کوپن ----------
    if (session.flow === 'admin_disable_coupon' && session.step === 'waiting_code') {
      const code = ctx.message.text.trim().toUpperCase();
      const res = await pool.query('UPDATE coupons SET active = 0 WHERE code = $1 RETURNING code', [code]);
      if (res.rows.length === 0) return ctx.reply('❌ کوپن یافت نشد.');
      delete sessions[ctx.from.id];
      ctx.reply(`✅ کوپن **${code}** غیرفعال شد.`);
      return;
    }

    // ---------- افزودن محصول خرید گام‌به‌گام ----------
    if (session.flow === 'admin_add_product_buy') {
      if (session.step === 'waiting_name') {
        session.data.name = ctx.message.text.trim();
        session.step = 'waiting_price_type';
        return ctx.reply('نوع قیمت را انتخاب کنید:', {
          reply_markup: { inline_keyboard: [[{ text: '💵 دلار (USD)', callback_data: 'buy_price_usd' }], [{ text: '💰 تومان', callback_data: 'buy_price_toman' }]] }
        });
      }
      if (session.step === 'waiting_min_amount') {
        const val = parseFloat(ctx.message.text.replace(/[^0-9.]/g, ''));
        if (isNaN(val) || val <= 0) return ctx.reply('❌ مقدار نامعتبر.');
        session.data.minAmount = val;
        session.step = 'waiting_sticker';
        return ctx.reply('🎨 لطفاً **استیکر (ایموجی/نماد)** محصول را ارسال کنید (مثلاً 🎟):');
      }
      if (session.step === 'waiting_sticker') {
        const sticker = ctx.message.text.trim();
        const { name, priceType, minAmount } = session.data;
        const key = name.replace(/\s+/g, '_').toLowerCase();
        const finalName = sticker + ' ' + name;
        try {
          await pool.query(
            `INSERT INTO products (key, name, min_amount, price_type, active, created_at)
             VALUES ($1,$2,$3,$4,1,NOW())
             ON CONFLICT (key) DO UPDATE SET name = $2, min_amount = $3, price_type = $4, active = 1`,
            [key, finalName, minAmount, priceType]
          );
          delete sessions[ctx.from.id];
          ctx.reply('✅ محصول با موفقیت اضافه شد.');
        } catch (err) {
          ctx.reply('❌ خطا: ' + err.message);
        }
        return;
      }
    }

    // ---------- افزودن محصول فروش گام‌به‌گام ----------
    if (session.flow === 'admin_add_product_sell') {
      if (session.step === 'waiting_name') {
        session.data.name = ctx.message.text.trim();
        session.step = 'waiting_unit_price';
        return ctx.reply('💰 لطفاً **قیمت واحد** (تومان) را وارد کنید:');
      }
      if (session.step === 'waiting_unit_price') {
        const price = parseFloat(ctx.message.text.replace(/[^0-9.]/g, ''));
        if (isNaN(price) || price <= 0) return ctx.reply('❌ قیمت نامعتبر.');
        session.data.unitPrice = price;
        session.step = 'waiting_sample_code';
        return ctx.reply('🎫 لطفاً **نمونه کد صحیح** (برای نمایش به کاربر) را وارد کنید:');
      }
      if (session.step === 'waiting_sample_code') {
        const sampleCode = ctx.message.text.trim();
        const { name, unitPrice } = session.data;
        const key = name.replace(/\s+/g, '_').toLowerCase();
        try {
          await pool.query(
            `INSERT INTO sell_products (key, name, unit_price, sample_code, active, created_at)
             VALUES ($1,$2,$3,$4,1,NOW())
             ON CONFLICT (key) DO UPDATE SET name = $2, unit_price = $3, sample_code = $4, active = 1`,
            [key, name, unitPrice, sampleCode]
          );
          delete sessions[ctx.from.id];
          ctx.reply('✅ محصول فروش اضافه شد.');
        } catch (err) {
          ctx.reply('❌ خطا: ' + err.message);
        }
        return;
      }
    }

    // ---------- کارمزد محصول (دریافت مقدار) ----------
    if (session.flow === 'admin_commission_product_buy' && session.step === 'waiting_value') {
      const val = parseFloat(ctx.message.text.replace(/[^0-9.]/g, ''));
      if (isNaN(val) || val < 0) return ctx.reply('❌ عدد معتبر وارد کنید.');
      const { productKey, commType } = session.data;
      await pool.query('UPDATE products SET commission_type = $1, commission_value = $2 WHERE key = $3', [commType, val, productKey]);
      delete sessions[ctx.from.id];
      ctx.reply('✅ کارمزد محصول خرید تنظیم شد.');
      return;
    }

    if (session.flow === 'admin_commission_product_sell' && session.step === 'waiting_value') {
      const val = parseFloat(ctx.message.text.replace(/[^0-9.]/g, ''));
      if (isNaN(val) || val < 0) return ctx.reply('❌ عدد معتبر وارد کنید.');
      const { productKey, commType } = session.data;
      await pool.query('UPDATE sell_products SET commission_type = $1, commission_value = $2 WHERE key = $3', [commType, val, productKey]);
      delete sessions[ctx.from.id];
      ctx.reply('✅ کارمزد محصول فروش تنظیم شد.');
      return;
    }

    // ---------- هدیه (ورود آیدی‌ها) ----------
    if (session.flow === 'admin_gift' && session.step === 'waiting_user_ids') {
      const ids = ctx.message.text.split('-').map(s => s.trim()).filter(Boolean);
      const valid = [];
      for (let id of ids) {
        const user = await getUserById(id);
        if (user) valid.push(id);
      }
      if (valid.length === 0) return ctx.reply('❌ هیچ کاربر معتبری پیدا نشد.');
      session.userIds = valid;
      session.step = 'waiting_amount';
      return ctx.reply(`✅ ${valid.length} کاربر معتبر.\n\n💰 مبلغ هدیه به هر کاربر را به تومان وارد کنید:`);
    }
    if (session.flow === 'admin_gift' && session.step === 'waiting_amount') {
      const amount = parseInt(ctx.message.text.replace(/[^0-9]/g, ''));
      if (!amount || amount <= 0) return ctx.reply('❌ مبلغ نامعتبر.');
      const userIds = session.userIds;
      let success = 0;
      for (const id of userIds) {
        try {
          await pool.query('UPDATE users SET balance = balance + $1 WHERE telegram_id = $2', [amount, id]);
          success++;
          const user = await getUserById(id);
          if (user) {
            const giftMessage =
              '✨ یک سورپرایز کوچک برای شما...\n' +
              `🎁 هدیه با موفقیت به کیف پولتان اضافه شد. (${amount.toLocaleString()} تومان)\n` +
              '🎗این هدیه از طرف مدیریت ووچینو⁰¹ به پاس همراهی شما تقدیم شد.\n' +
              'گاهی برای شروع یک همراهی خوب، لازم نیست حرف زیادی بزنیم،،، کافیه یک قدم کوچیک برداریم💎\n' +
              '👑امیدواریم وقتی نوبت خرید ووچر رسید، ووچینو⁰¹ یکی از اولین انتخاب‌های شما باشد.\n' +
              '🩵راستی رفیق جان امیدوارم امروز شروعِ شانسای خوبت باشه🤲\n' +
              'پرسود باشید همیشه...💸';
            await sendMessageToUser(bot, id, giftMessage);
          }
        } catch (e) { console.log(e.message); }
      }
      delete sessions[ctx.from.id];
      ctx.reply(`✅ هدیه به ${success} نفر ارسال شد.\n💰 مجموع: ${(amount * success).toLocaleString()} تومان`);
      return;
    }

    // ============================================
    // تحویل کد و سایر موارد (بخش دوم)
    // ============================================
    // تحویل کد
    if (session.flow === 'admin_deliver_code' && session.step === 'waiting_code') {
      const deliveredCode = ctx.message.text.trim();
      const { orderId, telegramId, trackingCode } = session.data;
      const orderRes = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
      const order = orderRes.rows[0];
      if (!order || order.status !== 'pending_delivery') {
        delete sessions[ctx.from.id];
        ctx.reply('این سفارش قبلاً تحویل داده شده است.');
        return;
      }
      await pool.query("UPDATE orders SET status = 'completed', delivered_code = $1 WHERE id = $2", [deliveredCode, orderId]);
      ctx.telegram.sendMessage(telegramId,
        '🎉 سفارش خرید شما تحویل داده شد!\n\n🆔 کد پیگیری: ' + trackingCode + '\n\n📦 کد/محتوای سفارش:\n' + deliveredCode + '\n\nبا تشکر از اعتماد شما 🙏'
      );
      delete sessions[ctx.from.id];
      ctx.reply('✅ کد تحویل برای کاربر ارسال شد و سفارش تکمیل شد.');
      return;
    }

    // رد با توضیح (کیف پول)
    if (session.flow === 'admin_reject_reason' && session.step === 'waiting_reason') {
      const reason = ctx.message.text;
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
      ctx.telegram.sendMessage(request.telegram_id, '❌ درخواست شما رد شد.' + codeText + '\n📝 دلیل:\n' + reason);
      delete sessions[ctx.from.id];
      ctx.reply('✅ درخواست شماره ' + requestId + ' با توضیح رد شد.');
      return;
    }

    // رد با توضیح (فروش)
    if (session.flow === 'admin_sell_reject_reason' && session.step === 'waiting_reason') {
      const reason = ctx.message.text;
      const requestId = session.data.requestId;
      const reqRes = await pool.query('SELECT * FROM sell_orders WHERE id = $1', [requestId]);
      const request = reqRes.rows[0];
      if (!request || request.status !== 'pending_review') {
        delete sessions[ctx.from.id];
        ctx.reply('این درخواست قبلاً بررسی شده است.');
        return;
      }
      await pool.query("UPDATE sell_orders SET status = 'rejected' WHERE id = $1", [requestId]);
      ctx.telegram.sendMessage(request.telegram_id, '❌ درخواست فروش شما رد شد.\n🆔 کد پیگیری: ' + request.tracking_code + '\n📝 دلیل:\n' + reason);
      delete sessions[ctx.from.id];
      ctx.reply('✅ درخواست فروش شماره ' + requestId + ' با توضیح رد شد.');
      return;
    }

    // وارد کردن مبلغ فروش
    if (session.flow === 'admin_sell_amount' && session.step === 'waiting_amount') {
      const amount = parseInt(ctx.message.text.replace(/[^0-9]/g, ''));
      const requestId = session.data.requestId;
      if (!amount || amount <= 0) return ctx.reply('⚠️ عدد واردشده معتبر نیست. دوباره مبلغ را وارد کنید:');
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
          amount: amount.toLocaleString()
        })
      );
      delete sessions[ctx.from.id];
      ctx.reply('✅ فروش تایید شد و ' + amount.toLocaleString() + ' تومان به کیف پول کاربر اضافه شد.');
      return;
    }

    // ---------- جستجوی کد پیگیری ----------
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
        ctx.reply('📦 سفارش خرید\n\n🆔 کد پیگیری: ' + o.tracking_code + '\n👤 نام: ' + (user ? user.full_name : 'نامشخص') + '\n📱 شماره: ' + (user ? user.phone : '-') + '\n📦 محصول: ' + o.product_type + '\n💰 مبلغ: ' + Number(o.amount).toLocaleString() + ' تومان\n📌 وضعیت: ' + o.status + '\n📅 تاریخ: ' + o.created_at);
      }
      if (walletRes.rows.length > 0) {
        const w = walletRes.rows[0];
        const user = await getUser(w.telegram_id);
        ctx.reply('💰 درخواست کیف پول\n\n🆔 کد پیگیری: ' + w.tracking_code + '\n👤 نام: ' + (user ? user.full_name : 'نامشخص') + '\n📱 شماره: ' + (user ? user.phone : '-') + '\n💰 مبلغ: ' + Number(w.amount).toLocaleString() + ' تومان\n📌 وضعیت: ' + w.status + '\n📅 تاریخ: ' + w.created_at);
      }
      if (sellRes.rows.length > 0) {
        const s = sellRes.rows[0];
        const user = await getUser(s.telegram_id);
        ctx.reply('🎟 سفارش فروش\n\n🆔 کد پیگیری: ' + s.tracking_code + '\n👤 نام: ' + (user ? user.full_name : 'نامشخص') + '\n📱 شماره: ' + (user ? user.phone : '-') + '\n📦 محصول: ' + s.product_type + '\n💰 مبلغ: ' + (s.amount ? Number(s.amount).toLocaleString() + ' تومان' : 'هنوز تعیین نشده') + '\n📌 وضعیت: ' + s.status + '\n📅 تاریخ: ' + s.created_at);
      }
      delete sessions[ctx.from.id];
      return;
    }

    // ---------- اطلاعات یک کاربر ----------
    if (session.flow === 'admin_userinfo' && session.step === 'waiting_id') {
      const targetId = ctx.message.text.trim();
      const user = await getUserById(targetId);
      if (!user) {
        ctx.reply('❌ کاربری با آیدی ' + targetId + ' پیدا نشد.');
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
        '💰 **موجودی:** ' + Number(user.balance).toLocaleString() + ' تومان\n' +
        '📅 **تاریخ ثبت:** ' + (user.registered_at || 'نامشخص') + '\n' +
        '📌 **وضعیت ثبت‌نام:** ' + (isFullyRegistered ? '✅ کامل' : '⚠️ ناقص') + '\n';
      ctx.reply(infoText, { parse_mode: 'Markdown' });
      delete sessions[ctx.from.id];
      return;
    }

    return next();
  });

  // ============================================
  // پردازش عکس (برای ارسال همگانی/مخفی)
  // ============================================
  bot.on('photo', async (ctx, next) => {
    if (!isAdmin(ctx.from.id)) return next();
    const session = sessions[ctx.from.id];
    if (!session) return next();

    // همگانی با عکس
    if (session.flow === 'admin_broadcast' && session.step === 'waiting_photo') {
      const fileId = ctx.message.photo.slice(-1)[0].file_id;
      session.data.photo = fileId;
      session.step = 'waiting_caption';
      ctx.reply('✅ عکس دریافت شد. حالا **متن (کپشن)** را ارسال کنید:');
      return;
    }

    // مخفی با عکس
    if (session.flow === 'admin_fake_broadcast' && session.step === 'waiting_photo') {
      const fileId = ctx.message.photo.slice(-1)[0].file_id;
      session.data.photo = fileId;
      session.step = 'waiting_caption';
      ctx.reply('✅ عکس دریافت شد. حالا **متن (کپشن)** را ارسال کنید:');
      return;
    }

    return next();
  });

  // ============================================
  // هندلرهای callback اضافی
  // ============================================
  bot.action('coupon_type_gift', async (ctx) => {
    const s = sessions[ctx.from.id];
    if (!s || s.flow !== 'admin_add_coupon') return;
    s.data.type = 'gift';
    s.step = 'waiting_amount';
    ctx.answerCbQuery();
    ctx.reply('🎁 **هدیه**\n\nمبلغ هدیه را به تومان وارد کنید:');
  });
  bot.action('coupon_type_discount', async (ctx) => {
    const s = sessions[ctx.from.id];
    if (!s || s.flow !== 'admin_add_coupon') return;
    s.data.type = 'discount';
    s.step = 'waiting_amount';
    ctx.answerCbQuery();
    ctx.reply('💰 **تخفیف**\n\nمبلغ تخفیف را به تومان وارد کنید:');
  });

  bot.action('fake_text_only', async (ctx) => {
    const s = sessions[ctx.from.id];
    if (!s || s.flow !== 'admin_fake_broadcast') return;
    s.step = 'waiting_text';
    ctx.answerCbQuery();
    ctx.reply('📝 متن پیام را ارسال کنید:');
  });
  bot.action('fake_with_photo', async (ctx) => {
    const s = sessions[ctx.from.id];
    if (!s || s.flow !== 'admin_fake_broadcast') return;
    s.step = 'waiting_photo';
    ctx.answerCbQuery();
    ctx.reply('🖼 عکس را ارسال کنید:');
  });

  bot.action('buy_price_usd', async (ctx) => {
    const s = sessions[ctx.from.id];
    if (!s || s.flow !== 'admin_add_product_buy') return;
    s.data.priceType = 'usd';
    s.step = 'waiting_min_amount';
    ctx.answerCbQuery();
    ctx.reply('💵 حداقل مبلغ خرید (به دلار) را وارد کنید:');
  });
  bot.action('buy_price_toman', async (ctx) => {
    const s = sessions[ctx.from.id];
    if (!s || s.flow !== 'admin_add_product_buy') return;
    s.data.priceType = 'toman';
    s.step = 'waiting_min_amount';
    ctx.answerCbQuery();
    ctx.reply('💰 حداقل مبلغ خرید (به تومان) را وارد کنید:');
  });

  // لیست محصولات خرید
  bot.action('admin_list_products_buy', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    const res = await pool.query('SELECT * FROM products ORDER BY id ASC');
    if (res.rows.length === 0) return ctx.reply('📋 هیچ محصولی وجود ندارد.');
    let msg = '📋 **لیست محصولات خرید**\n\n';
    res.rows.forEach(p => {
      msg += `🔹 ${p.name} (${p.key})\n   حداقل: ${p.min_amount} ${p.price_type === 'usd' ? 'دلار' : 'تومان'}\n   کارمزد: ${p.commission_type === 'none' ? 'بدون کارمزد' : p.commission_value + (p.commission_type === 'percentage' ? '%' : ' تومان')}\n   وضعیت: ${p.active ? '✅ فعال' : '⛔️ غیرفعال'}\n\n`;
    });
    ctx.reply(msg, { parse_mode: 'Markdown' });
  });

  // لیست محصولات فروش
  bot.action('admin_list_products_sell', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    const res = await pool.query('SELECT * FROM sell_products ORDER BY id ASC');
    if (res.rows.length === 0) return ctx.reply('📋 هیچ محصول فروشی وجود ندارد.');
    let msg = '📋 **لیست محصولات فروش**\n\n';
    res.rows.forEach(p => {
      msg += `🔹 ${p.name} (${p.key})\n   قیمت واحد: ${Number(p.unit_price).toLocaleString()} تومان\n   کارمزد: ${p.commission_type === 'none' ? 'بدون کارمزد' : p.commission_value + (p.commission_type === 'percentage' ? '%' : ' تومان')}\n   وضعیت: ${p.active ? '✅ فعال' : '⛔️ غیرفعال'}\n\n`;
    });
    ctx.reply(msg, { parse_mode: 'Markdown' });
  });

  // ============================================
  // سفارشات خرید در انتظار
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
      message += '💰 مبلغ: ' + Number(req.amount).toLocaleString() + ' تومان\n';
      message += '💰 کارمزد: ' + Number(req.commission || 0).toLocaleString() + ' تومان\n';
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

  // ============================================
  // سفارشات فروش در انتظار
  // ============================================
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

  // ============================================
  // درخواست‌های کیف پول در انتظار
  // ============================================
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
      message += '💰 مبلغ: ' + Number(req.amount).toLocaleString() + ' تومان\n';
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
      '❌ سفارش خرید شما لغو شد.\n🆔 کد پیگیری: ' + order.tracking_code + '\n💰 مبلغ ' + totalRefund.toLocaleString() + ' تومان به کیف پول شما بازگشت داده شد.'
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
      ctx.telegram.sendMessage(request.telegram_id, '✅ شارژ کیف پول شما تایید شد.' + codeText + '\nمبلغ ' + Number(request.amount).toLocaleString() + ' تومان به موجودی شما اضافه شد.');
    } else {
      await pool.query('UPDATE users SET balance = balance - $1 WHERE telegram_id = $2', [request.amount, request.telegram_id]);
      ctx.telegram.sendMessage(request.telegram_id, '✅ درخواست برداشت شما تایید شد.' + codeText + '\nمبلغ ' + Number(request.amount).toLocaleString() + ' تومان به کارت شما واریز شد.');
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
  // آمار کاربران
  // ============================================
  bot.action('admin_stats', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const totalUsers = await pool.query('SELECT COUNT(*)::int AS c FROM users');
    const registeredUsers = await pool.query("SELECT COUNT(*)::int AS c FROM users WHERE full_name IS NOT NULL AND phone IS NOT NULL AND card_number IS NOT NULL");
    const totalBalance = await pool.query('SELECT COALESCE(SUM(balance), 0) AS total FROM users');
    const todayOrders = await pool.query("SELECT COUNT(*)::int AS c FROM orders WHERE created_at::date >= CURRENT_DATE");
    const todaySells = await pool.query("SELECT COUNT(*)::int AS c FROM sell_orders WHERE created_at::date >= CURRENT_DATE");

    ctx.reply(
      '📊 **آمار کاربران ووچینو**\n\n' +
      '👥 **کل کاربران:** ' + totalUsers.rows[0].c + '\n' +
      '✅ **ثبت‌نام کامل:** ' + registeredUsers.rows[0].c + '\n' +
      '💰 **مجموع موجودی:** ' + Number(totalBalance.rows[0].total).toLocaleString() + ' تومان\n' +
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

    ctx.reply('🔎 **جستجوی کد پیگیری**\n\nلطفاً کد پیگیری را وارد کنید:\nمثال: `VOC-847392` یا `#VCH_1024`', { parse_mode: 'Markdown' });
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

    ctx.reply('👤 **اطلاعات یک کاربر**\n\nلطفاً آیدی عددی کاربر را وارد کنید:\nمثال: `8231962200`', { parse_mode: 'Markdown' });
  });

};
