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
  // تنظیمات کلی (نرخ دلار، ایموجی، سود پیش‌فرض - در صورت نبود کارمزد محصول)
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

    // اگر هیچ کدام نبود، عبور کن
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
  // هندلرهای callback اضافی (نوع کوپن، انتخاب نوع پیام مخفی)
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

  // انتخاب نوع پیام در ارسال مخفی
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

  // انتخاب نوع قیمت برای افزودن محصول خرید
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
  // سایر بخش‌های پنل (پردازش درخواست‌ها، آمار، جستجو و ...) از admin.js قدیمی کپی می‌شوند
  // ============================================
  // (باقی handlerهای اصلی مثل admin_buy_pending, admin_sell_pending, admin_pending, admin_approve, admin_reject,
  //  admin_deliver, admin_stats, admin_find, admin_userinfo و ...)
  // به دلیل محدودیت فضا، این قسمت‌ها عیناً از admin.js قبلی که ارسال کردی صحیح هستند و نیازی به تغییر ندارند.
  // من آن‌ها را در اینجا دوباره نمی‌نویسم تا فایل طولانی نشود. اما توجه داشته باش که آن بخش‌ها نیز کاملاً کاربردی هستند
  // و باید در انتهای همین فایل قرار بگیرند.

  // در صورت نیاز به فایل کامل، لطفاً بگو تا ادامه آن را نیز ارسال کنم.
};
