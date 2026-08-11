// handlers/admin.js
const texts = require('../texts');
const { sessions, fillTemplate, sendBroadcast, sendBroadcastWithPhoto, sendMessageToUser } = require('../utils');
const {
  pool, getUser, getUserById, getAllUsers, getUsdRate, getSetting, setSetting,
  getAllApiSources, getApiSourceById, addApiSource, updateApiSource, deleteApiSource,
  getProductApiLinks, getAllProductApiLinks, addProductApiLink, updateProductApiLink, removeProductApiLink,
  getAllBotTexts, searchBotTexts, updateBotText, getBotTextCategories,
  getProducts, getSellProducts, getProductByKey, getSellProductByKey,
  addCoupon, deleteCoupon, addChannel, updateChannel, deleteChannel, getRequiredChannels,
  getTransactionLogs, logTransaction, getUserStats
} = require('../db');
const { getAllCategories, getTextInfo, getTextsByCategory, searchTextsInCache, validatePlaceholders, refreshText, formatTextForDisplay } = require('../textManager');
const { ADMIN_IDS, MIN_WITHDRAW } = require('../constants');

function isAdmin(telegramId) {
  return ADMIN_IDS.includes(Number(telegramId));
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
            [{ text: '🔗 مدیریت صرافی‌ها (API)', callback_data: 'admin_api_sources' }],
            [{ text: '📎 اتصال محصولات به صرافی', callback_data: 'admin_product_links' }],
            [{ text: '📝 مدیریت متن‌های ربات', callback_data: 'admin_bot_texts' }],
            [{ text: '📢 ارسال همگانی', callback_data: 'admin_broadcast' }],
            [{ text: '🕵️ ارسال مخفی به یک نفر', callback_data: 'admin_fake_broadcast' }],
            [{ text: '🎁 هدیه به کاربران', callback_data: 'admin_gift' }],
            [{ text: '🏛 مدیریت کانال‌های اجباری', callback_data: 'admin_channels' }],
            [{ text: '🎟 مدیریت کوپن‌های تخفیف', callback_data: 'admin_coupons' }],
            [{ text: '⚙️ تنظیمات کلی', callback_data: 'admin_settings' }],
            [{ text: '📊 آمار کاربران', callback_data: 'admin_stats' }],
            [{ text: '🔎 جستجوی کد پیگیری', callback_data: 'admin_find' }],
            [{ text: '👤 اطلاعات یک کاربر', callback_data: 'admin_userinfo' }],
            [{ text: '🎮 تنظیمات بازی', callback_data: 'admin_game_settings' }],
            [{ text: '👥 تنظیمات رفرال', callback_data: 'admin_referral_settings' }],
            [{ text: '💳 حداقل برداشت', callback_data: 'admin_min_withdraw' }],
            [{ text: '🔙 بازگشت به منوی اصلی', callback_data: 'back_main_menu' }]
          ]
        }
      }
    );
  });

  // ============================================
  // مدیریت متن‌های ربات
  // ============================================
  bot.action('admin_bot_texts', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const categories = getAllCategories();
    let message = '📝 **مدیریت متن‌های ربات**\n\n';
    message += '🗂 **دسته‌بندی‌ها:**\n';
    categories.forEach(cat => {
      const count = getTextsByCategory(cat).length;
      message += `• ${cat} (${count} متن)\n`;
    });
    message += '\nیک دسته را انتخاب کنید یا متن خود را جستجو کنید:';

    const buttons = categories.map(cat => [{ text: cat, callback_data: 'admin_texts_category_' + cat }]);
    buttons.push([{ text: '🔍 جستجوی متن', callback_data: 'admin_texts_search' }]);
    buttons.push([{ text: '🔙 بازگشت به پنل مدیریت', callback_data: 'menu_admin_panel' }]);

    ctx.reply(message, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } });
  });

  bot.action(/^admin_texts_category_(.+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const category = ctx.match[1];
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const textsList = getTextsByCategory(category);
    if (textsList.length === 0) return ctx.reply('❌ هیچ متنی در این دسته یافت نشد.');

    let message = `📝 **متون دسته: ${category}**\n\n`;
    const buttons = [];
    textsList.forEach((t, i) => {
      message += `${i + 1}. \`${t.key}\`\n   ${t.value.length > 60 ? t.value.substring(0, 60) + '...' : t.value}\n\n`;
      buttons.push([{ text: `✏️ ${t.key}`, callback_data: 'admin_texts_edit_' + t.key }]);
    });
    buttons.push([{ text: '🔙 بازگشت به دسته‌بندی‌ها', callback_data: 'admin_bot_texts' }]);
    ctx.reply(message, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } });
  });

  bot.action('admin_texts_search', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_texts_search', step: 'waiting_search_term', lang: 'fa' };
    ctx.reply('🔍 **جستجوی متن**\n\nلطفاً کلیدواژه مورد نظر را وارد کنید:');
  });

  bot.action(/^admin_texts_edit_(.+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const key = ctx.match[1];
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const textInfo = getTextInfo(key);
    if (!textInfo) return ctx.reply('❌ متن مورد نظر یافت نشد.');

    const displayText = formatTextForDisplay(textInfo.value);
    let message = `✏️ **ویرایش متن**\n\n🔑 **کلید:** \`${key}\`\n📂 **دسته:** ${textInfo.category}\n\n📝 **متن فعلی:**\n${displayText}\n\n`;
    if (textInfo.placeholders.length > 0) {
      message += `🔒 **Placeholder های ثابت (نباید حذف شوند):**\n`;
      textInfo.placeholders.forEach(p => { message += `• {${p}}\n`; });
      message += `\n⚠️ این مقادیر به‌صورت خودکار جایگزین می‌شوند.`;
    }
    message += `\n\n✍️ **متن جدید کامل را (همراه با placeholder ها) ارسال کنید:**`;

    sessions[ctx.from.id] = {
      flow: 'admin_texts_edit',
      step: 'waiting_new_text',
      lang: 'fa',
      data: { key, oldValue: textInfo.value }
    };
    ctx.reply(message, { parse_mode: 'Markdown' });
  });

  // پردازش متن‌های مدیریت متن
  bot.on('text', async (ctx, next) => {
    if (!isAdmin(ctx.from.id)) return next();
    const session = sessions[ctx.from.id];
    if (!session) return next();

    if (session.flow === 'admin_texts_search' && session.step === 'waiting_search_term') {
      const term = ctx.message.text.trim();
      if (term.length < 2) return ctx.reply('❌ حداقل ۲ کاراکتر وارد کنید.');
      const results = searchTextsInCache(term);
      if (results.length === 0) {
        ctx.reply('❌ هیچ متنی یافت نشد.');
        delete sessions[ctx.from.id];
        return;
      }
      let message = `🔍 **نتایج جستجو برای "${term}"**\n\n`;
      const buttons = [];
      results.forEach((r, i) => {
        message += `${i + 1}. \`${r.key}\` [${r.category}]\n   ${r.value.substring(0, 50)}...\n\n`;
        buttons.push([{ text: `✏️ ${r.key}`, callback_data: 'admin_texts_edit_' + r.key }]);
      });
      buttons.push([{ text: '🔙 بازگشت', callback_data: 'admin_bot_texts' }]);
      delete sessions[ctx.from.id];
      ctx.reply(message, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } });
      return;
    }

    if (session.flow === 'admin_texts_edit' && session.step === 'waiting_new_text') {
      const newText = ctx.message.text.trim();
      const { key, oldValue } = session.data;
      const validation = validatePlaceholders(oldValue, newText);
      if (!validation.valid) {
        let errorMsg = '❌ **خطا: placeholder های زیر در متن جدید وجود ندارند:**\n';
        validation.missing.forEach(p => { errorMsg += `• 🔒{${p}}\n`; });
        errorMsg += '\n⚠️ لطفاً متن را با حفظ این placeholder ها دوباره ارسال کنید.';
        return ctx.reply(errorMsg, { parse_mode: 'Markdown' });
      }
      const result = await refreshText(key, newText);
      if (result.success) {
        delete sessions[ctx.from.id];
        ctx.reply(`✅ **متن به‌روز شد!**\n\n🔑 کلید: \`${key}\`\n📝 متن جدید:\n${newText}`, { parse_mode: 'Markdown' });
      } else {
        ctx.reply('❌ خطا در ذخیره متن: ' + result.error);
      }
      return;
    }

    return next();
  });

  // ============================================
  // تنظیمات کلی
  // ============================================
  bot.action('admin_settings', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const usdRate = await getUsdRate();
    const reaction = await getSetting('start_reaction', '🎉');
    const buyMode = await getSetting('buy_mode', 'MANUAL');
    const sellMode = await getSetting('sell_mode', 'MANUAL');

    let msg = '⚙️ **تنظیمات کلی**\n\n';
    msg += `💵 نرخ دلار: ${usdRate.toLocaleString()} تومان\n`;
    msg += `🎉 ایموجی شروع: ${reaction}\n`;
    msg += `🛒 حالت خرید: ${buyMode}\n`;
    msg += `💰 حالت فروش: ${sellMode}\n`;

    ctx.reply(msg, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '💵 تغییر نرخ دلار', callback_data: 'admin_set_rate' }],
          [{ text: '🎉 تغییر ایموجی', callback_data: 'admin_set_reaction' }],
          [{ text: '🛒 حالت خرید', callback_data: 'admin_buy_mode' }],
          [{ text: '💰 حالت فروش', callback_data: 'admin_sell_mode' }],
          [{ text: '🔙 بازگشت', callback_data: 'menu_admin_panel' }]
        ]
      }
    });
  });

  bot.action('admin_set_rate', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_set_rate', step: 'waiting_value', lang: 'fa' };
    ctx.reply('💵 نرخ جدید دلار (تومان) را وارد کنید:');
  });

  bot.action('admin_set_reaction', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_set_reaction', step: 'waiting_value', lang: 'fa' };
    ctx.reply('🎉 ایموجی جدید را ارسال کنید:');
  });

  bot.action('admin_buy_mode', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    const current = await getSetting('buy_mode', 'MANUAL');
    const newMode = current === 'MANUAL' ? 'AUTO' : 'MANUAL';
    await setSetting('buy_mode', newMode);
    ctx.reply(`✅ حالت خرید به ${newMode} تغییر یافت.`);
  });

  bot.action('admin_sell_mode', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    const current = await getSetting('sell_mode', 'MANUAL');
    const newMode = current === 'MANUAL' ? 'AUTO' : 'MANUAL';
    await setSetting('sell_mode', newMode);
    ctx.reply(`✅ حالت فروش به ${newMode} تغییر یافت.`);
  });

  // تنظیمات بازی
  bot.action('admin_game_settings', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const winRateBonus = await getSetting('winRateBonus', '50');
    const gameMultiplier = await getSetting('gameMultiplier', '2');
    const minPurchase = await getSetting('minPurchaseForGame', '0');
    const gameEnabled = await getSetting('disableBonusGame', 'false') === 'false';

    let msg = '🎮 **تنظیمات بازی**\n\n';
    msg += `✅ بازی فعال: ${gameEnabled ? 'بله' : 'خیر'}\n`;
    msg += `🎯 درصد برد بونوس: ${winRateBonus}%\n`;
    msg += `✖️ ضریب بازی: ${gameMultiplier}\n`;
    msg += `🛍 حداقل خرید برای فعال‌سازی: ${Number(minPurchase).toLocaleString()} تومان\n`;

    ctx.reply(msg, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ فعال/غیرفعال کردن بازی', callback_data: 'admin_toggle_game' }],
          [{ text: '🎯 تغییر درصد برد بونوس', callback_data: 'admin_set_win_rate' }],
          [{ text: '✖️ تغییر ضریب بازی', callback_data: 'admin_set_game_multiplier' }],
          [{ text: '🛍 حداقل خرید برای بازی', callback_data: 'admin_set_min_purchase' }],
          [{ text: '🔙 بازگشت', callback_data: 'menu_admin_panel' }]
        ]
      }
    });
  });

  bot.action('admin_toggle_game', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    const current = await getSetting('disableBonusGame', 'false') === 'true';
    await setSetting('disableBonusGame', current ? 'false' : 'true');
    ctx.reply(`✅ بازی‌ها ${current ? 'فعال' : 'غیرفعال'} شدند.`);
  });

  bot.action('admin_set_win_rate', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_set_win_rate', step: 'waiting_value', lang: 'fa' };
    ctx.reply('🎯 درصد برد جدید (۰ تا ۱۰۰) را وارد کنید:');
  });

  bot.action('admin_set_game_multiplier', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_set_game_multiplier', step: 'waiting_value', lang: 'fa' };
    ctx.reply('✖️ ضریب جدید بازی را وارد کنید:');
  });

  bot.action('admin_set_min_purchase', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_set_min_purchase', step: 'waiting_value', lang: 'fa' };
    ctx.reply('🛍 حداقل مبلغ خرید (تومان) برای فعال‌سازی بازی را وارد کنید:');
  });

  // تنظیمات رفرال
  bot.action('admin_referral_settings', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const referralEnabled = await getSetting('referral_enabled', 'true') === 'true';
    const referralBonus = await getSetting('referral_bonus', '5000');
    const referralPercent = await getSetting('referral_commission_percent', '0');

    let msg = '👥 **تنظیمات رفرال**\n\n';
    msg += `✅ فعال: ${referralEnabled ? 'بله' : 'خیر'}\n`;
    msg += `🎁 هدیه دعوت‌کننده: ${Number(referralBonus).toLocaleString()} تومان\n`;
    msg += `💸 درصد سود کارمزد به دعوت‌کننده: ${referralPercent}%\n`;

    ctx.reply(msg, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ فعال/غیرفعال کردن', callback_data: 'admin_toggle_referral' }],
          [{ text: '🎁 تغییر مبلغ هدیه', callback_data: 'admin_set_referral_bonus' }],
          [{ text: '💸 درصد سود کارمزد', callback_data: 'admin_set_referral_percent' }],
          [{ text: '🔙 بازگشت', callback_data: 'menu_admin_panel' }]
        ]
      }
    });
  });

  bot.action('admin_toggle_referral', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    const current = await getSetting('referral_enabled', 'true') === 'true';
    await setSetting('referral_enabled', current ? 'false' : 'true');
    ctx.reply(`✅ دعوت کاربران ${current ? 'غیرفعال' : 'فعال'} شد.`);
  });

  bot.action('admin_set_referral_bonus', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_set_referral_bonus', step: 'waiting_value', lang: 'fa' };
    ctx.reply('🎁 مبلغ هدیه جدید برای دعوت‌کننده (تومان) را وارد کنید:');
  });

  bot.action('admin_set_referral_percent', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_set_referral_percent', step: 'waiting_value', lang: 'fa' };
    ctx.reply('💸 درصد سود کارمزد (عددی بین ۰ تا ۱۰۰) را وارد کنید:');
  });

  // حداقل برداشت
  bot.action('admin_min_withdraw', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    const current = await getSetting('min_withdraw', MIN_WITHDRAW.toString());
    ctx.reply(`💳 **حداقل مبلغ برداشت**\n\nمقدار فعلی: ${Number(current).toLocaleString()} تومان\n\nلطفاً مقدار جدید را وارد کنید:`, { parse_mode: 'Markdown' });
    sessions[ctx.from.id] = { flow: 'admin_set_min_withdraw', step: 'waiting_value', lang: 'fa' };
  });

  // ============================================
  // مدیریت کانال‌ها
  // ============================================
  bot.action('admin_channels', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const channels = await getRequiredChannels();
    let msg = '🏛 **مدیریت کانال‌های اجباری**\n\n';
    if (channels.length === 0) {
      msg += '❌ هیچ کانالی ثبت نشده.';
    } else {
      channels.forEach(ch => {
        msg += `📢 ${ch.title}\n   آیدی: \`${ch.chat_id}\`\n   وضعیت: ${ch.active ? '✅ فعال' : '⛔ غیرفعال'}\n\n`;
      });
    }

    ctx.reply(msg, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '➕ افزودن کانال', callback_data: 'admin_add_channel' }],
          [{ text: '❌ حذف کانال', callback_data: 'admin_remove_channel' }],
          [{ text: '🔄 غیرفعال/فعال کردن', callback_data: 'admin_toggle_channel' }],
          [{ text: '🔙 بازگشت', callback_data: 'menu_admin_panel' }]
        ]
      }
    });
  });

  bot.action('admin_add_channel', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_add_channel', step: 'waiting_chat_id', lang: 'fa' };
    ctx.reply('➕ **افزودن کانال**\n\nلطفاً آیدی عددی کانال (با -) را وارد کنید:');
  });

  bot.action('admin_remove_channel', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_remove_channel', step: 'waiting_chat_id', lang: 'fa' };
    ctx.reply('❌ **حذف کانال**\n\nلطفاً آیدی عددی کانال را وارد کنید:');
  });

  bot.action('admin_toggle_channel', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_toggle_channel', step: 'waiting_chat_id', lang: 'fa' };
    ctx.reply('🔄 **تغییر وضعیت کانال**\n\nلطفاً آیدی عددی کانال را وارد کنید:');
  });

  // ============================================
  // مدیریت کوپن‌ها
  // ============================================
  bot.action('admin_coupons', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const coupons = await pool.query('SELECT * FROM coupons WHERE active = 1 ORDER BY id DESC LIMIT 10');
    let msg = '🎟 **مدیریت کوپن‌ها**\n\n';
    if (coupons.rows.length === 0) {
      msg += '❌ هیچ کوپن فعالی وجود ندارد.';
    } else {
      coupons.rows.forEach(c => {
        msg += `• ${c.code} | ${c.type === 'gift' ? '🎁 هدیه' : '💰 تخفیف'} | ${Number(c.amount).toLocaleString()} تومان | ${c.used_count}/${c.usage_limit}\n`;
      });
    }

    ctx.reply(msg, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '➕ افزودن کوپن', callback_data: 'admin_add_coupon' }],
          [{ text: '❌ غیرفعال کردن', callback_data: 'admin_disable_coupon' }],
          [{ text: '🔙 بازگشت', callback_data: 'menu_admin_panel' }]
        ]
      }
    });
  });

  bot.action('admin_add_coupon', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_add_coupon', step: 'waiting_code', lang: 'fa', data: {} };
    ctx.reply('لطفاً کد کوپن را وارد کنید:');
  });

  bot.action('admin_disable_coupon', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_disable_coupon', step: 'waiting_code', lang: 'fa' };
    ctx.reply('لطفاً کد کوپن را وارد کنید:');
  });

  // اینجا پایان بخش اول است. بخش دوم شامل مدیریت محصولات، API، ارسال همگانی/مخفی، هدیه، سفارشات و پردازش‌های متنی خواهد بود.
};
