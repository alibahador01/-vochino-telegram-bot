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
const {
  getAllCategories, getTextInfo, getTextsByCategory, searchTextsInCache,
  validatePlaceholders, refreshText, formatTextForDisplay
} = require('../textManager');
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
            [{ text: '🌐 مدیریت فیلترشکن (VPN)', callback_data: 'admin_vpn_panel' }],
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

  // پردازش متن‌های مدیریت متن (همینجا می‌ماند)
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
  // تنظیمات کلی (نرخ دلار، ایموجی و...)
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
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_set_rate', step: 'waiting_value', lang: 'fa' };
    ctx.reply('💵 نرخ جدید دلار (تومان) را وارد کنید:');
  });

  bot.action('admin_set_reaction', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
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

  // ============================================
  // تنظیمات بازی
  // ============================================
  bot.action('admin_game_settings', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}

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
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_set_win_rate', step: 'waiting_value', lang: 'fa' };
    ctx.reply('🎯 درصد برد جدید (۰ تا ۱۰۰) را وارد کنید:');
  });

  bot.action('admin_set_game_multiplier', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_set_game_multiplier', step: 'waiting_value', lang: 'fa' };
    ctx.reply('✖️ ضریب جدید بازی را وارد کنید:');
  });

  bot.action('admin_set_min_purchase', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_set_min_purchase', step: 'waiting_value', lang: 'fa' };
    ctx.reply('🛍 حداقل مبلغ خرید (تومان) برای فعال‌سازی بازی را وارد کنید:');
  });

  // ============================================
  // تنظیمات رفرال
  // ============================================
  bot.action('admin_referral_settings', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}

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
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_set_referral_bonus', step: 'waiting_value', lang: 'fa' };
    ctx.reply('🎁 مبلغ هدیه جدید برای دعوت‌کننده (تومان) را وارد کنید:');
  });

  bot.action('admin_set_referral_percent', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_set_referral_percent', step: 'waiting_value', lang: 'fa' };
    ctx.reply('💸 درصد سود کارمزد (عددی بین ۰ تا ۱۰۰) را وارد کنید:');
  });

  // ============================================
  // حداقل برداشت
  // ============================================
  bot.action('admin_min_withdraw', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    const current = await getSetting('min_withdraw', MIN_WITHDRAW.toString());
    ctx.reply(`💳 **حداقل مبلغ برداشت**\n\nمقدار فعلی: ${Number(current).toLocaleString()} تومان\n\nلطفاً مقدار جدید را وارد کنید:`, { parse_mode: 'Markdown' });
    sessions[ctx.from.id] = { flow: 'admin_set_min_withdraw', step: 'waiting_value', lang: 'fa' };
  });

  // ============================================
  // مدیریت کانال‌ها
  // ============================================
  bot.action('admin_channels', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}

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
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_add_channel', step: 'waiting_chat_id', lang: 'fa' };
    ctx.reply('➕ **افزودن کانال**\n\nلطفاً آیدی عددی کانال (با -) را وارد کنید:');
  });

  bot.action('admin_remove_channel', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_remove_channel', step: 'waiting_chat_id', lang: 'fa' };
    ctx.reply('❌ **حذف کانال**\n\nلطفاً آیدی عددی کانال را وارد کنید:');
  });

  bot.action('admin_toggle_channel', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_toggle_channel', step: 'waiting_chat_id', lang: 'fa' };
    ctx.reply('🔄 **تغییر وضعیت کانال**\n\nلطفاً آیدی عددی کانال را وارد کنید:');
  });

  // ============================================
  // مدیریت کوپن‌ها
  // ============================================
  bot.action('admin_coupons', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}

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
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_add_coupon', step: 'waiting_code', lang: 'fa', data: {} };
    ctx.reply('لطفاً کد کوپن را وارد کنید:');
  });

  bot.action('admin_disable_coupon', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_disable_coupon', step: 'waiting_code', lang: 'fa' };
    ctx.reply('لطفاً کد کوپن را وارد کنید:');
  });

  // ============================================
  // مدیریت محصولات خرید
  // ============================================
  bot.action('admin_products_buy', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}

    const products = await getProducts(false);
    let msg = '🛍 **مدیریت محصولات خرید**\n\n';
    if (products.length === 0) {
      msg += '❌ هیچ محصولی تعریف نشده.';
    } else {
      products.forEach(p => {
        msg += `🔹 ${p.name} (${p.key})\n   حداقل: ${Number(p.min_amount).toLocaleString()} ${p.price_type === 'usd' ? 'دلار' : 'تومان'}\n   کارمزد: ${p.commission_type === 'none' ? 'ندارد' : p.commission_value + (p.commission_type === 'percentage' ? '%' : ' تومان')}\n   وضعیت: ${p.active ? '✅ فعال' : '⛔ غیرفعال'}\n\n`;
      });
    }

    ctx.reply(msg, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '➕ افزودن محصول جدید', callback_data: 'admin_add_product_buy' }],
          [{ text: '⚙️ تنظیم کارمزد محصول', callback_data: 'admin_commission_product_buy' }],
          [{ text: '🔄 غیرفعال/فعال کردن', callback_data: 'admin_toggle_product_buy' }],
          [{ text: '📋 لیست کامل', callback_data: 'admin_list_products_buy' }],
          [{ text: '🔙 بازگشت', callback_data: 'menu_admin_panel' }]
        ]
      }
    });
  });

  bot.action('admin_add_product_buy', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_add_product_buy', step: 'waiting_name', lang: 'fa', data: {} };
    ctx.reply('➕ **افزودن محصول خرید**\n\nلطفاً **نام محصول** را وارد کنید:');
  });

  bot.action('admin_commission_product_buy', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    const products = await getProducts(false);
    const buttons = products.map(p => [{ text: p.name, callback_data: 'admin_comm_buy_' + p.key }]);
    buttons.push([{ text: '🔙 بازگشت', callback_data: 'admin_products_buy' }]);
    ctx.reply('⚙️ **تنظیم کارمزد محصول**\n\nمحصول مورد نظر را انتخاب کنید:', { reply_markup: { inline_keyboard: buttons } });
  });

  bot.action(/^admin_comm_buy_(.+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const key = ctx.match[1];
    const product = await getProductByKey(key);
    if (!product) return ctx.answerCbQuery('محصول یافت نشد');
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = {
      flow: 'admin_commission_product_buy',
      step: 'waiting_commission_type',
      lang: 'fa',
      data: { productKey: key, productName: product.name }
    };
    ctx.reply(`⚙️ **کارمزد برای ${product.name}**\n\nلطفاً نوع کارمزد را انتخاب کنید:`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📊 درصدی', callback_data: 'comm_type_percentage' }],
          [{ text: '💵 مبلغ ثابت', callback_data: 'comm_type_fixed' }],
          [{ text: '❌ بدون کارمزد', callback_data: 'comm_type_none' }]
        ]
      }
    });
  });

  bot.action('admin_toggle_product_buy', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_toggle_product_buy', step: 'waiting_key', lang: 'fa' };
    ctx.reply('🔄 **تغییر وضعیت محصول**\n\nلطفاً کلید محصول (product_key) را وارد کنید:');
  });

  bot.action('admin_list_products_buy', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    const res = await pool.query('SELECT * FROM products ORDER BY id ASC');
    if (res.rows.length === 0) return ctx.reply('📋 هیچ محصولی نیست.');
    let msg = '📋 **لیست خرید**\n\n';
    res.rows.forEach(p => msg += `🔹 ${p.name} (${p.key}) | حداقل: ${p.min_amount} ${p.price_type==='usd'?'دلار':'تومان'} | کارمزد: ${p.commission_type==='none'?'0':p.commission_value+(p.commission_type==='percentage'?'%':' تومان')} | ${p.active?'✅':'⛔️'}\n`);
    ctx.reply(msg, { parse_mode: 'Markdown' });
  });

  // ============================================
  // مدیریت محصولات فروش
  // ============================================
  bot.action('admin_products_sell', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}

    const products = await getSellProducts(false);
    let msg = '🎟 **مدیریت محصولات فروش**\n\n';
    if (products.length === 0) {
      msg += '❌ هیچ محصولی تعریف نشده.';
    } else {
      products.forEach(p => {
        msg += `🔹 ${p.name} (${p.key})\n   قیمت واحد: ${Number(p.unit_price).toLocaleString()} تومان\n   کارمزد: ${p.commission_type === 'none' ? 'ندارد' : p.commission_value + (p.commission_type === 'percentage' ? '%' : ' تومان')}\n   وضعیت: ${p.active ? '✅ فعال' : '⛔ غیرفعال'}\n\n`;
      });
    }

    ctx.reply(msg, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '➕ افزودن محصول فروش', callback_data: 'admin_add_product_sell' }],
          [{ text: '⚙️ تنظیم کارمزد فروش', callback_data: 'admin_commission_product_sell' }],
          [{ text: '🔄 غیرفعال/فعال کردن', callback_data: 'admin_toggle_product_sell' }],
          [{ text: '📋 لیست کامل', callback_data: 'admin_list_products_sell' }],
          [{ text: '🔙 بازگشت', callback_data: 'menu_admin_panel' }]
        ]
      }
    });
  });

  bot.action('admin_add_product_sell', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_add_product_sell', step: 'waiting_name', lang: 'fa', data: {} };
    ctx.reply('➕ **افزودن محصول فروش**\n\nلطفاً **نام محصول** را وارد کنید:');
  });

  bot.action('admin_commission_product_sell', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    const products = await getSellProducts(false);
    const buttons = products.map(p => [{ text: p.name, callback_data: 'admin_comm_sell_' + p.key }]);
    buttons.push([{ text: '🔙 بازگشت', callback_data: 'admin_products_sell' }]);
    ctx.reply('⚙️ **تنظیم کارمزد فروش**\n\nمحصول مورد نظر را انتخاب کنید:', { reply_markup: { inline_keyboard: buttons } });
  });

  bot.action(/^admin_comm_sell_(.+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const key = ctx.match[1];
    const product = await getSellProductByKey(key);
    if (!product) return ctx.answerCbQuery('محصول یافت نشد');
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = {
      flow: 'admin_commission_product_sell',
      step: 'waiting_commission_type',
      lang: 'fa',
      data: { productKey: key, productName: product.name }
    };
    ctx.reply(`⚙️ **کارمزد فروش برای ${product.name}**\n\nلطفاً نوع کارمزد را انتخاب کنید:`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📊 درصدی', callback_data: 'comm_sell_type_percentage' }],
          [{ text: '💵 مبلغ ثابت', callback_data: 'comm_sell_type_fixed' }],
          [{ text: '❌ بدون کارمزد', callback_data: 'comm_sell_type_none' }]
        ]
      }
    });
  });

  bot.action('admin_toggle_product_sell', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_toggle_product_sell', step: 'waiting_key', lang: 'fa' };
    ctx.reply('🔄 **تغییر وضعیت محصول فروش**\n\nلطفاً کلید محصول را وارد کنید:');
  });

  bot.action('admin_list_products_sell', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    const res = await pool.query('SELECT * FROM sell_products ORDER BY id ASC');
    if (res.rows.length === 0) return ctx.reply('📋 هیچ محصول فروشی نیست.');
    let msg = '📋 **لیست فروش**\n\n';
    res.rows.forEach(p => msg += `🔹 ${p.name} (${p.key}) | قیمت واحد: ${Number(p.unit_price).toLocaleString()} | کارمزد: ${p.commission_type==='none'?'0':p.commission_value+(p.commission_type==='percentage'?'%':' تومان')} | ${p.active?'✅':'⛔️'}\n`);
    ctx.reply(msg, { parse_mode: 'Markdown' });
  });

  // ============================================
  // مدیریت صرافی‌ها (API)
  // ============================================
  bot.action('admin_api_sources', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    const apis = await getAllApiSources(true);
    let msg = '🔗 **مدیریت صرافی‌ها**\n\n';
    if (apis.length === 0) msg += '❌ هیچ صرافی ثبت نشده.';
    else apis.forEach(a => msg += `🔹 ${a.name} (${a.type}) | اولویت: ${a.priority} | ${a.is_active ? '✅' : '⛔'}\n`);
    ctx.reply(msg, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '➕ افزودن صرافی', callback_data: 'admin_add_api_source' }],
          [{ text: '✏️ ویرایش', callback_data: 'admin_edit_api_source' }],
          [{ text: '❌ غیرفعال کردن', callback_data: 'admin_delete_api_source' }],
          [{ text: '🔙 بازگشت', callback_data: 'menu_admin_panel' }]
        ]
      }
    });
  });

  bot.action('admin_add_api_source', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_add_api_source', step: 'waiting_name', lang: 'fa', data: {} };
    ctx.reply('نام صرافی را وارد کنید:');
  });

  bot.action('admin_edit_api_source', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    const apis = await getAllApiSources(true);
    if (apis.length === 0) return ctx.reply('❌ صرافی‌ای وجود ندارد.');
    const buttons = apis.map(a => [{ text: a.name, callback_data: 'admin_edit_api_' + a.id }]);
    ctx.reply('صرافی مورد نظر را انتخاب کنید:', { reply_markup: { inline_keyboard: buttons } });
  });

  bot.action(/^admin_edit_api_(\d+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const apiId = ctx.match[1];
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_edit_api_source', step: 'waiting_field', lang: 'fa', data: { apiId } };
    ctx.reply('فیلد مورد نظر برای ویرایش (name, type, base_url, api_key, secret_key, priority):');
  });

  bot.action('admin_delete_api_source', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    const apis = await getAllApiSources(true);
    if (apis.length === 0) return ctx.reply('❌ صرافی‌ای وجود ندارد.');
    const buttons = apis.map(a => [{ text: a.name, callback_data: 'admin_delete_api_' + a.id }]);
    ctx.reply('صرافی مورد نظر برای غیرفعال‌سازی:', { reply_markup: { inline_keyboard: buttons } });
  });

  bot.action(/^admin_delete_api_(\d+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    await deleteApiSource(ctx.match[1]);
    ctx.answerCbQuery('✅ غیرفعال شد');
    try { await ctx.deleteMessage(); } catch (e) {}
    ctx.reply('✅ صرافی غیرفعال شد.');
  });

  // ============================================
  // مدیریت اتصالات محصولات به صرافی
  // ============================================
  bot.action('admin_product_links', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    const links = await getAllProductApiLinks();
    let msg = '📎 **اتصالات محصولات**\n\n';
    if (links.length === 0) msg += '❌ هیچ اتصالی وجود ندارد.';
    else links.forEach(l => msg += `🔹 ${l.product_type} - ${l.product_key} ← ${l.api_name} (اولویت: ${l.priority})\n`);
    ctx.reply(msg, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '➕ افزودن اتصال', callback_data: 'admin_add_product_link' }],
          [{ text: '🔄 تغییر اولویت', callback_data: 'admin_edit_product_link' }],
          [{ text: '❌ حذف اتصال', callback_data: 'admin_remove_product_link' }],
          [{ text: '🔙 بازگشت', callback_data: 'menu_admin_panel' }]
        ]
      }
    });
  });

  bot.action('admin_add_product_link', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_add_product_link', step: 'waiting_product_type', lang: 'fa', data: {} };
    ctx.reply('نوع محصول (buy یا sell) را وارد کنید:');
  });

  bot.action('admin_edit_product_link', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_edit_product_link', step: 'waiting_link_id', lang: 'fa' };
    ctx.reply('ID اتصال را وارد کنید:');
  });

  bot.action('admin_remove_product_link', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_remove_product_link', step: 'waiting_link_id', lang: 'fa' };
    ctx.reply('ID اتصال را وارد کنید:');
  });

  // ============================================
  // 🌐 پنل مدیریت فیلترشکن (VPN)
  // ============================================
  bot.action('admin_vpn_panel', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}

    const vpnEnabled = await getSetting('vpn_enabled', 'true') === 'true';
    const vpnVisible = await getSetting('vpn_visible', 'true') === 'true';
    const maxFreeAttempts = await getSetting('vpn_max_free_attempts', '1');
    const invitesForUnlock = await getSetting('vpn_invites_for_unlock', '2');
    const defaultVolume = await getSetting('vpn_default_volume_gb', '5');
    const defaultDays = await getSetting('vpn_default_days', '30');
    const healthInterval = await getSetting('vpn_health_interval', '300'); // ثانیه
    const failureThreshold = await getSetting('vpn_failure_threshold', '3');
    const cooldown = await getSetting('vpn_cooldown', '600'); // ثانیه

    let msg = '🌐 **مدیریت فیلترشکن**\n\n';
    msg += `✅ سرویس فعال: ${vpnEnabled ? 'بله' : 'خیر'}\n`;
    msg += `👁 نمایش در منو: ${vpnVisible ? 'بله' : 'خیر'}\n`;
    msg += `🔢 حداکثر دفعات رایگان: ${maxFreeAttempts}\n`;
    msg += `👥 دعوت لازم برای باز شدن بعدی: ${invitesForUnlock}\n`;
    msg += `📦 حجم پیش‌فرض: ${defaultVolume} گیگابایت\n`;
    msg += `📅 مدت پیش‌فرض: ${defaultDays} روز\n`;
    msg += `⏱ فاصله بررسی سلامت: ${healthInterval} ثانیه\n`;
    msg += `❌ آستانه شکست: ${failureThreshold} بار\n`;
    msg += `🔄 مدت خنک‌سازی: ${cooldown} ثانیه\n`;

    ctx.reply(msg, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ فعال/غیرفعال سرویس', callback_data: 'admin_vpn_toggle' }],
          [{ text: '👁 نمایش/مخفی در منو', callback_data: 'admin_vpn_toggle_visible' }],
          [{ text: '🔢 حداکثر دفعات رایگان', callback_data: 'admin_vpn_set_max_attempts' }],
          [{ text: '👥 دعوت لازم برای باز شدن', callback_data: 'admin_vpn_set_invites_unlock' }],
          [{ text: '📦 حجم پیش‌فرض', callback_data: 'admin_vpn_set_volume' }],
          [{ text: '📅 مدت پیش‌فرض', callback_data: 'admin_vpn_set_days' }],
          [{ text: '⏱ فاصله سلامت', callback_data: 'admin_vpn_health_interval' }],
          [{ text: '❌ آستانه شکست', callback_data: 'admin_vpn_failure_threshold' }],
          [{ text: '🔄 مدت خنک‌سازی', callback_data: 'admin_vpn_cooldown' }],
          [{ text: '🖥 مدیریت سرورها', callback_data: 'admin_vpn_servers' }],
          [{ text: '🔙 بازگشت', callback_data: 'menu_admin_panel' }]
        ]
      }
    });
  });

  // تنظیمات سریع VPN
  bot.action('admin_vpn_toggle', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    const cur = await getSetting('vpn_enabled', 'true') === 'true';
    await setSetting('vpn_enabled', cur ? 'false' : 'true');
    ctx.reply(`✅ سرویس VPN ${cur ? 'غیرفعال' : 'فعال'} شد.`);
  });
  bot.action('admin_vpn_toggle_visible', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    const cur = await getSetting('vpn_visible', 'true') === 'true';
    await setSetting('vpn_visible', cur ? 'false' : 'true');
    ctx.reply(`✅ نمایش در منو ${cur ? 'مخفی' : 'نمایان'} شد.`);
  });
  bot.action('admin_vpn_set_max_attempts', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_vpn_set_max_attempts', step: 'waiting_value', lang: 'fa' };
    ctx.reply('🔢 حداکثر دفعات رایگان (عدد) را وارد کنید:');
  });
  bot.action('admin_vpn_set_invites_unlock', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_vpn_set_invites_unlock', step: 'waiting_value', lang: 'fa' };
    ctx.reply('👥 تعداد دعوت لازم برای باز شدن مجدد را وارد کنید:');
  });
  bot.action('admin_vpn_set_volume', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_vpn_set_volume', step: 'waiting_value', lang: 'fa' };
    ctx.reply('📦 حجم پیش‌فرض (گیگابایت) را وارد کنید:');
  });
  bot.action('admin_vpn_set_days', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_vpn_set_days', step: 'waiting_value', lang: 'fa' };
    ctx.reply('📅 مدت پیش‌فرض (روز) را وارد کنید:');
  });
  bot.action('admin_vpn_health_interval', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_vpn_health_interval', step: 'waiting_value', lang: 'fa' };
    ctx.reply('⏱ فاصله بررسی سلامت (ثانیه) را وارد کنید:');
  });
  bot.action('admin_vpn_failure_threshold', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_vpn_failure_threshold', step: 'waiting_value', lang: 'fa' };
    ctx.reply('❌ تعداد شکست متوالی برای غیرفعال‌سازی را وارد کنید:');
  });
  bot.action('admin_vpn_cooldown', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_vpn_cooldown', step: 'waiting_value', lang: 'fa' };
    ctx.reply('🔄 مدت خنک‌سازی (ثانیه) را وارد کنید:');
  });

  // ============================================
  // مدیریت سرورهای VPN
  // ============================================
  bot.action('admin_vpn_servers', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}

    const servers = await pool.query('SELECT * FROM vpn_servers ORDER BY id');
    let msg = '🖥 **سرورهای VPN**\n\n';
    if (servers.rows.length === 0) msg += '❌ هیچ سروری ثبت نشده.';
    else {
      servers.rows.forEach(s => {
        msg += `🔹 ${s.name} (${s.host}:${s.port})\n   وضعیت: ${s.is_active ? '✅' : '⛔'} | سلامت: ${s.health_status || 'نامشخص'}\n\n`;
      });
    }
    ctx.reply(msg, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '➕ افزودن سرور', callback_data: 'admin_vpn_add_server' }],
          [{ text: '❌ حذف سرور', callback_data: 'admin_vpn_remove_server' }],
          [{ text: '🔄 فعال/غیرفعال کردن', callback_data: 'admin_vpn_toggle_server' }],
          [{ text: '🔙 بازگشت', callback_data: 'admin_vpn_panel' }]
        ]
      }
    });
  });

  bot.action('admin_vpn_add_server', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_vpn_add_server', step: 'waiting_name', lang: 'fa', data: {} };
    ctx.reply('➕ نام سرور را وارد کنید:');
  });

  bot.action('admin_vpn_remove_server', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    const servers = await pool.query('SELECT * FROM vpn_servers WHERE is_active = true');
    if (servers.rows.length === 0) return ctx.reply('❌ سروری وجود ندارد.');
    const buttons = servers.rows.map(s => [{ text: s.name, callback_data: 'admin_vpn_del_server_' + s.id }]);
    ctx.reply('سرور مورد نظر برای حذف:', { reply_markup: { inline_keyboard: buttons } });
  });

  bot.action('admin_vpn_toggle_server', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    const servers = await pool.query('SELECT * FROM vpn_servers');
    if (servers.rows.length === 0) return ctx.reply('❌ سروری وجود ندارد.');
    const buttons = servers.rows.map(s => [{ text: s.name, callback_data: 'admin_vpn_toggle_srv_' + s.id }]);
    ctx.reply('سرور مورد نظر برای تغییر وضعیت:', { reply_markup: { inline_keyboard: buttons } });
  });

  bot.action(/^admin_vpn_del_server_(\d+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const id = ctx.match[1];
    await pool.query('DELETE FROM vpn_servers WHERE id = $1', [id]);
    ctx.answerCbQuery('✅ حذف شد');
    ctx.reply('✅ سرور حذف شد.');
  });

  bot.action(/^admin_vpn_toggle_srv_(\d+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const id = ctx.match[1];
    const srv = await pool.query('SELECT * FROM vpn_servers WHERE id = $1', [id]);
    if (srv.rows.length === 0) return ctx.answerCbQuery('یافت نشد');
    const newStatus = !srv.rows[0].is_active;
    await pool.query('UPDATE vpn_servers SET is_active = $1 WHERE id = $2', [newStatus, id]);
    ctx.answerCbQuery(newStatus ? '✅ فعال شد' : '⛔ غیرفعال شد');
    ctx.reply(`✅ سرور ${newStatus ? 'فعال' : 'غیرفعال'} شد.`);
  });

  // ادامه در قسمت دوم (بخش‌های ارسال همگانی، سفارشات، پردازش‌های متنی و...)
