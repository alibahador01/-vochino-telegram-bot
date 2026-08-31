// handlers/admin.js
const texts = require('../texts');
const { sessions, fillTemplate, sendBroadcast, sendBroadcastWithPhoto, sendMessageToUser } = require('../utils');
const {
  pool, getUser, getUserById, getAllUsers, getUsdRate, getSetting, setSetting,
  getAllApiSources, getApiSourceById, addApiSource, updateApiSource, deleteApiSource,
  getProductApiLinks, getAllProductApiLinks, addProductApiLink, updateProductApiLink, removeProductApiLink,
  getAllBotTexts, searchBotTexts, updateBotText, getBotTextCategories,
  getProducts, getSellProducts, getProductByKey, getSellProductByKey, updateProduct, updateSellProduct,
  addCoupon, deleteCoupon, addChannel, updateChannel, deleteChannel, getRequiredChannels,
  getTransactionLogs, logTransaction, getUserStats,
  resetAllAiConversations, setAiConfig, getAiConfig
} = require('../db');
const {
  getAllCategories, getTextInfo, getTextsByCategory, searchTextsInCache,
  validatePlaceholders, refreshText, formatTextForDisplay
} = require('../textManager');
const { ADMIN_IDS, MIN_WITHDRAW, AI_THEMES, AI_DEFAULT_THEME } = require('../constants');
const { calculateSellPayout, isAutoExecutionEnabled } = require('../exchangeEngine');

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
    const pendingBonusWd = await pool.query("SELECT COUNT(*)::int AS c FROM bonus_withdrawals WHERE status = 'pending'");

    ctx.reply(
      '👑 **پنل مدیریت ووچینو**\n\n' +
      '📥 **درخواست‌های در انتظار:**\n' +
      '   🔹 کیف پول: ' + pendingWallet.rows[0].c + '\n' +
      '   🔹 فروش: ' + pendingSell.rows[0].c + '\n' +
      '   🔹 خرید: ' + pendingBuy.rows[0].c + '\n' +
      '   🔹 برداشت بونوس: ' + pendingBonusWd.rows[0].c + '\n\n' +
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
            [{ text: '🐽 مدیریت هوشینو⁰¹', callback_data: 'admin_omni_panel' }],
            [{ text: '👥 تنظیمات رفرال', callback_data: 'admin_referral_settings' }],
            [{ text: '💳 حداقل برداشت', callback_data: 'admin_min_withdraw' }],
            [{ text: '🌐 مدیریت فیلترشکن (VPN)', callback_data: 'admin_vpn_panel' }],
            [{ text: '🎁 مدیریت بونوس‌ها', callback_data: 'admin_bonus_settings' }],
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
        [{ text: '🎨 مدیریت تم دکمه‌ها', callback_data: 'admin_theme_manager' }],
        [{ text: '❤️ مدیریت ایموجی‌های ری‌اکشن', callback_data: 'admin_reaction_manager' }],
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
// مدیریت تم دکمه‌ها و ایموجی ری‌اکشن (جدید)
// ============================================
bot.action('admin_theme_manager', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  ctx.answerCbQuery();
  try { await ctx.deleteMessage(); } catch (e) {}

  const currentTheme = await getSetting('ai_theme', AI_DEFAULT_THEME);
  let msg = '🎨 **مدیریت تم دکمه‌های هوشینو⁰¹**\n\n';
  msg += `تم فعلی: ${AI_THEMES.find(t => t.key === currentTheme)?.emoji} ${AI_THEMES.find(t => t.key === currentTheme)?.label || currentTheme}\n\n`;
  msg += 'یک تم را انتخاب کنید:';

  const buttons = AI_THEMES.map(theme => [{
    text: `${theme.emoji} ${theme.label}${theme.key === currentTheme ? ' ✅' : ''}`,
    callback_data: 'admin_set_theme_' + theme.key
  }]);
  buttons.push([{ text: '🔙 بازگشت', callback_data: 'admin_settings' }]);

  ctx.reply(msg, { reply_markup: { inline_keyboard: buttons } });
});

bot.action(/^admin_set_theme_(.+)/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const themeKey = ctx.match[1];
  await setSetting('ai_theme', themeKey);
  ctx.answerCbQuery('✅ تم تغییر کرد');
  ctx.reply('✅ تم دکمه‌ها به‌روز شد.');
});

bot.action('admin_reaction_manager', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  ctx.answerCbQuery();
  try { await ctx.deleteMessage(); } catch (e) {}

  // لیست ایموجی‌های مجاز برای ری‌اکشن شناور
  const allowedEmojis = ['❤️', '🔥', '🎉', '👏', '💯', '🤩', '⚡', '🏆', '💀', '🐆', '🦋', '⚘', '⭐', '🌧'];
  const currentReaction = await getSetting('start_reaction', '🎉');

  let msg = '❤️ **مدیریت ایموجی ری‌اکشن شناور**\n\n';
  msg += `ایموجی فعلی: ${currentReaction}\n\n`;
  msg += 'یک ایموجی را برای واکنش روی پیام /start انتخاب کنید:';

  const buttons = [];
  for (const emoji of allowedEmojis) {
    buttons.push([{ text: `${emoji} ${emoji === currentReaction ? ' ✅' : ''}`, callback_data: 'admin_set_reaction_emoji_' + emoji }]);
  }
  buttons.push([{ text: '🔙 بازگشت', callback_data: 'admin_settings' }]);

  ctx.reply(msg, { reply_markup: { inline_keyboard: buttons } });
});

bot.action(/^admin_set_reaction_emoji_(.+)/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const emoji = ctx.match[1];
  await setSetting('start_reaction', emoji);
  ctx.answerCbQuery('✅ ایموجی تغییر کرد');
  ctx.reply('✅ ایموجی ری‌اکشن به‌روز شد.');
});

// ============================================
// مدیریت هوشینو⁰¹ (جدید)
// ============================================
bot.action('admin_omni_panel', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  ctx.answerCbQuery();
  try { await ctx.deleteMessage(); } catch (e) {}

  const generalKey = await getAiConfig('gemini_general_key', '');
  const sportsKey = await getAiConfig('gemini_sports_key', '');
  const fixturesKey = await getAiConfig('gemini_fixtures_key', '');
  const supportKey = await getAiConfig('gemini_support_key', '');
  const tavilyKey = await getSetting('tavily_api_key', '');
  const groqKey = await getSetting('groq_api_key', '');

  let msg = '🐽 **مدیریت هوشینو⁰¹**\n\n';
  msg += `🔑 Gemini عمومی: ${generalKey ? '✅ تنظیم شده' : '❌ تنظیم نشده'}\n`;
  msg += `⚽ Gemini تحلیل ورزشی: ${sportsKey ? '✅ تنظیم شده' : '❌ تنظیم نشده'}\n`;
  msg += `📅 Gemini جدول: ${fixturesKey ? '✅ تنظیم شده' : '❌ تنظیم نشده'}\n`;
  msg += `🧠 Gemini پشتیبانی: ${supportKey ? '✅ تنظیم شده' : '❌ تنظیم نشده'}\n`;
  msg += `🌐 Tavily (جستجو): ${tavilyKey ? '✅ تنظیم شده' : '❌ تنظیم نشده'}\n`;
  msg += `🎙 Groq (ویس): ${groqKey ? '✅ تنظیم شده' : '❌ تنظیم نشده'}\n\n`;
  msg += 'برای تنظیم هر کلید، گزینه مربوطه را انتخاب کنید.';

  ctx.reply(msg, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔑 تنظیم کلید Gemini عمومی', callback_data: 'admin_omni_set_general' }],
        [{ text: '⚽ تنظیم کلید Gemini ورزشی', callback_data: 'admin_omni_set_sports' }],
        [{ text: '📅 تنظیم کلید Gemini جدول', callback_data: 'admin_omni_set_fixtures' }],
        [{ text: '🧠 تنظیم کلید Gemini پشتیبانی', callback_data: 'admin_omni_set_support' }],
        [{ text: '🌐 تنظیم کلید Tavily', callback_data: 'admin_omni_set_tavily' }],
        [{ text: '🎙 تنظیم کلید Groq', callback_data: 'admin_omni_set_groq' }],
        [{ text: '🧹 پاک‌سازی کلی گفتگوها', callback_data: 'admin_omni_flush' }],
        [{ text: '🔙 بازگشت', callback_data: 'menu_admin_panel' }]
      ]
    }
  });
});

// هندلرهای تنظیم کلیدها
bot.action('admin_omni_set_general', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  ctx.answerCbQuery();
  try { await ctx.deleteMessage(); } catch (e) {}
  sessions[ctx.from.id] = { flow: 'admin_omni_set_key', step: 'waiting_value', data: { key: 'gemini_general_key' } };
  ctx.reply('🔑 کلید Gemini عمومی را وارد کنید:');
});

bot.action('admin_omni_set_sports', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  ctx.answerCbQuery();
  try { await ctx.deleteMessage(); } catch (e) {}
  sessions[ctx.from.id] = { flow: 'admin_omni_set_key', step: 'waiting_value', data: { key: 'gemini_sports_key' } };
  ctx.reply('⚽ کلید Gemini ورزشی را وارد کنید:');
});

bot.action('admin_omni_set_fixtures', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  ctx.answerCbQuery();
  try { await ctx.deleteMessage(); } catch (e) {}
  sessions[ctx.from.id] = { flow: 'admin_omni_set_key', step: 'waiting_value', data: { key: 'gemini_fixtures_key' } };
  ctx.reply('📅 کلید Gemini جدول را وارد کنید:');
});

bot.action('admin_omni_set_support', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  ctx.answerCbQuery();
  try { await ctx.deleteMessage(); } catch (e) {}
  sessions[ctx.from.id] = { flow: 'admin_omni_set_key', step: 'waiting_value', data: { key: 'gemini_support_key' } };
  ctx.reply('🧠 کلید Gemini پشتیبانی را وارد کنید:');
});

bot.action('admin_omni_set_tavily', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  ctx.answerCbQuery();
  try { await ctx.deleteMessage(); } catch (e) {}
  sessions[ctx.from.id] = { flow: 'admin_omni_set_setting', step: 'waiting_value', data: { settingKey: 'tavily_api_key' } };
  ctx.reply('🌐 کلید Tavily را وارد کنید:');
});

bot.action('admin_omni_set_groq', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  ctx.answerCbQuery();
  try { await ctx.deleteMessage(); } catch (e) {}
  sessions[ctx.from.id] = { flow: 'admin_omni_set_setting', step: 'waiting_value', data: { settingKey: 'groq_api_key' } };
  ctx.reply('🎙 کلید Groq را وارد کنید:');
});

bot.action('admin_omni_flush', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  ctx.answerCbQuery();
  await resetAllAiConversations();
  ctx.reply('🧹 تمام گفتگوهای هوشینو⁰¹ پاک شد.');
});

// پردازش ورودی متنی برای تنظیم کلیدهای هوشینو و دیگر session های ادمین
bot.on('text', async (ctx, next) => {
  if (!isAdmin(ctx.from.id)) return next();
  const session = sessions[ctx.from.id];
  if (!session) return next();

  // تنظیم کلید هوشینو (در ai_config)
  if (session.flow === 'admin_omni_set_key' && session.step === 'waiting_value') {
    const key = session.data.key;
    const value = ctx.message.text.trim();
    if (value.length < 5) return ctx.reply('❌ کلید نامعتبر است.');
    await setAiConfig(key, value);
    delete sessions[ctx.from.id];
    ctx.reply('✅ کلید ذخیره شد.');
    return;
  }

  // تنظیم تنظیمات عمومی (در settings)
  if (session.flow === 'admin_omni_set_setting' && session.step === 'waiting_value') {
    const settingKey = session.data.settingKey;
    const value = ctx.message.text.trim();
    if (value.length < 3) return ctx.reply('❌ مقدار نامعتبر است.');
    await setSetting(settingKey, value);
    delete sessions[ctx.from.id];
    ctx.reply('✅ مقدار ذخیره شد.');
    return;
  }

  // سایر session های موجود را ادامه دهید
  return next();
});

// ============================================
// ادامه تنظیمات بازی (بقیه کدهای اصلی)
// ============================================
// (بقیه کدهای admin.js بدون تغییر در ادامه می‌آید)
