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
  getTransactionLogs, logTransaction, getUserStats
} = require('../db');
const {
  getAllCategories, getTextInfo, getTextsByCategory, searchTextsInCache,
  validatePlaceholders, refreshText, formatTextForDisplay
} = require('../textManager');
const { ADMIN_IDS, MIN_WITHDRAW } = require('../constants');
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
    const gameMinBet = await getSetting('game_min_bet', '10000');
    const bonusMinWithdraw = await getSetting('bonus_min_withdraw', '200000');
    const pendingBonusWithdrawals = await pool.query("SELECT COUNT(*)::int AS c FROM bonus_withdrawals WHERE status = 'pending'");

    let msg = '🎮 **تنظیمات بازی**\n\n';
    msg += `✅ بازی فعال: ${gameEnabled ? 'بله' : 'خیر'}\n`;
    msg += `💰 حداقل مبلغ شروع بازی: ${Number(gameMinBet).toLocaleString()} تومان\n`;
    msg += `🎯 درصد برد بونوس: ${winRateBonus}%\n`;
    msg += `✖️ ضریب بازی: ${gameMultiplier}\n`;
    msg += `🛍 حداقل خرید برای فعال‌سازی: ${Number(minPurchase).toLocaleString()} تومان\n`;
    msg += `🎁 حداقل برداشت بونوس به کیف پول: ${Number(bonusMinWithdraw).toLocaleString()} تومان\n`;
    if (pendingBonusWithdrawals.rows[0].c > 0) {
      msg += `\n📥 درخواست‌های برداشت بونوس در انتظار: ${pendingBonusWithdrawals.rows[0].c}\n`;
    }

    ctx.reply(msg, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ فعال/غیرفعال کردن بازی', callback_data: 'admin_toggle_game' }],
          [{ text: '💰 حداقل مبلغ شروع بازی', callback_data: 'admin_set_game_min_bet' }],
          [{ text: '🎯 تغییر درصد برد بونوس', callback_data: 'admin_set_win_rate' }],
          [{ text: '✖️ تغییر ضریب بازی', callback_data: 'admin_set_game_multiplier' }],
          [{ text: '🛍 حداقل خرید برای بازی', callback_data: 'admin_set_min_purchase' }],
          [{ text: '🎁 حداقل برداشت بونوس', callback_data: 'admin_set_bonus_min_withdraw' }],
          [{ text: '📥 درخواست‌های برداشت بونوس', callback_data: 'admin_bonus_withdrawals' }],
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

  bot.action('admin_set_game_min_bet', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_set_game_min_bet', step: 'waiting_value', lang: 'fa' };
    ctx.reply('💰 حداقل مبلغ شروع بازی (تومان) را وارد کنید:');
  });

  bot.action('admin_set_bonus_min_withdraw', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_set_bonus_min_withdraw', step: 'waiting_value', lang: 'fa' };
    ctx.reply('🎁 حداقل مبلغ برداشت بونوس به کیف پول (تومان) را وارد کنید:');
  });

  // ============================================
  // درخواست‌های برداشت بونوس
  // ============================================
  bot.action('admin_bonus_withdrawals', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    const pending = (await pool.query("SELECT * FROM bonus_withdrawals WHERE status='pending' ORDER BY id ASC")).rows;
    if (pending.length === 0) return ctx.reply('✅ درخواست برداشت بونوسی در انتظار نیست.', {
      reply_markup: { inline_keyboard: [[{ text: '🔙 بازگشت', callback_data: 'admin_game_settings' }]] }
    });
    for (const w of pending) {
      const u = await getUser(w.telegram_id);
      const msg = `🧩 درخواست برداشت بونوس\n👤 ${u?.full_name || '---'} (${w.telegram_id})\n💰 مبلغ: ${Number(w.amount).toLocaleString()} تومان\n💎 موجودی بونوس فعلی: ${Number(u?.bonus_balance || 0).toLocaleString()} تومان`;
      const btns = [[
        { text: '✅ تایید', callback_data: 'admin_bonus_wd_approve_' + w.id },
        { text: '❌ رد', callback_data: 'admin_bonus_wd_reject_' + w.id }
      ]];
      ctx.reply(msg, { reply_markup: { inline_keyboard: btns } });
    }
  });

  bot.action(/^admin_bonus_wd_approve_(\d+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const reqId = ctx.match[1];
    const upd = await pool.query("UPDATE bonus_withdrawals SET status='approved', processed_at=NOW() WHERE id=$1 AND status='pending' RETURNING *", [reqId]);
    if (upd.rows.length === 0) { ctx.answerCbQuery('⛔ قبلاً پردازش شده'); return; }
    const req = upd.rows[0];
    const user = await getUser(req.telegram_id);
    if (!user || Number(user.bonus_balance) < req.amount) {
      await pool.query("UPDATE bonus_withdrawals SET status='rejected' WHERE id=$1", [req.id]);
      ctx.telegram.sendMessage(req.telegram_id, `❌ درخواست برداشت بونوس شما به دلیل موجودی ناکافی رد شد.`).catch(() => {});
      ctx.answerCbQuery('❌ موجودی کافی نیست');
      return ctx.reply('❌ موجودی بونوس کاربر کافی نبود؛ درخواست رد شد.');
    }
    await pool.query('UPDATE users SET bonus_balance = bonus_balance - $1, balance = balance + $1 WHERE telegram_id = $2', [req.amount, req.telegram_id]);
    try {
      await pool.query(
        'INSERT INTO transaction_logs (telegram_id, type, amount, balance_before, balance_after, description, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW())',
        [req.telegram_id, 'transfer', req.amount, Number(user.balance), Number(user.balance) + req.amount, 'انتقال بونوس به کیف پول']
      );
    } catch (e) {}
    ctx.telegram.sendMessage(req.telegram_id, `✅ درخواست برداشت بونوس شما تأیید شد.\n💰 ${Number(req.amount).toLocaleString()} تومان به کیف پول شما منتقل شد.`).catch(() => {});
    ctx.answerCbQuery('✅ تأیید شد');
    ctx.reply('✅ تأیید شد و مبلغ به کیف پول کاربر منتقل شد.');
  });

  bot.action(/^admin_bonus_wd_reject_(\d+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const reqId = ctx.match[1];
    const upd = await pool.query("UPDATE bonus_withdrawals SET status='rejected', processed_at=NOW() WHERE id=$1 AND status='pending' RETURNING *", [reqId]);
    if (upd.rows.length === 0) { ctx.answerCbQuery('⛔ قبلاً پردازش شده'); return; }
    const req = upd.rows[0];
    ctx.telegram.sendMessage(req.telegram_id, `❌ درخواست برداشت بونوس شما رد شد.`).catch(() => {});
    ctx.answerCbQuery('❌ رد شد');
    ctx.reply('❌ رد شد.');
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
    const autoMode = await isAutoExecutionEnabled();
    let msg = '🔗 **مدیریت صرافی‌ها**\n\n';
    msg += `⚙️ حالت اجرای سفارشات: ${autoMode ? '🟢 خودکار (API واقعی فراخوانی می‌شود)' : '🔴 دستی (فقط تحویل توسط ادمین — پیش‌فرض ایمن)'}\n\n`;
    if (apis.length === 0) msg += '❌ هیچ صرافی ثبت نشده.';
    else apis.forEach(a => msg += `🔹 ${a.name} (${a.type}) | اولویت: ${a.priority} | ${a.is_active ? '✅' : '⛔'}\n`);
    ctx.reply(msg, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: autoMode ? '🔴 غیرفعال کردن اجرای خودکار' : '🟢 فعال کردن اجرای خودکار', callback_data: 'admin_toggle_api_exec_mode' }],
          [{ text: '➕ افزودن صرافی', callback_data: 'admin_add_api_source' }],
          [{ text: '✏️ ویرایش', callback_data: 'admin_edit_api_source' }],
          [{ text: '❌ غیرفعال کردن', callback_data: 'admin_delete_api_source' }],
          [{ text: '🔙 بازگشت', callback_data: 'menu_admin_panel' }]
        ]
      }
    });
  });

  bot.action('admin_toggle_api_exec_mode', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const cur = await isAutoExecutionEnabled();
    await setSetting('api_execution_mode', cur ? 'manual' : 'auto');
    ctx.answerCbQuery(cur ? '🔴 حالت دستی فعال شد' : '🟢 حالت خودکار فعال شد');
    ctx.reply(cur
      ? '✅ اجرای خودکار API غیرفعال شد. همه سفارش‌ها دستی پردازش می‌شوند.'
      : '⚠️ اجرای خودکار API فعال شد. از این پس با هر سفارش، سیستم صرافی‌های متصل را به ترتیب اولویت فراخوانی می‌کند.'
    );
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
    const healthInterval = await getSetting('vpn_health_interval', '300');
    const failureThreshold = await getSetting('vpn_failure_threshold', '3');
    const cooldown = await getSetting('vpn_cooldown', '600');

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
    // ============================================
  // ارسال همگانی (اصلاح‌شده)
  // ============================================
  bot.action('admin_broadcast', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_broadcast', step: 'waiting_media', lang: 'fa', data: {} };
    ctx.reply('📢 **ارسال همگانی**\n\nآیا پیام شامل عکس می‌شود؟', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🖼 بله، عکس دارد', callback_data: 'broadcast_photo_yes' }],
          [{ text: '📝 خیر، فقط متن', callback_data: 'broadcast_photo_no' }]
        ]
      }
    });
  });

  bot.action('broadcast_photo_yes', async (ctx) => {
    const s = sessions[ctx.from.id]; if (!s || s.flow !== 'admin_broadcast') return;
    s.step = 'waiting_photo';
    s.data.hasPhoto = true;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    ctx.reply('🖼 لطفاً عکس را ارسال کنید:');
  });

  bot.action('broadcast_photo_no', async (ctx) => {
    const s = sessions[ctx.from.id]; if (!s || s.flow !== 'admin_broadcast') return;
    s.step = 'waiting_text';
    s.data.hasPhoto = false;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    ctx.reply('📝 لطفاً متن پیام را وارد کنید:');
  });

  // ============================================
  // ارسال مخفی (اصلاح‌شده)
  // ============================================
  bot.action('admin_fake_broadcast', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_fake_broadcast', step: 'waiting_user_id', lang: 'fa', data: {} };
    ctx.reply('🕵️ **ارسال مخفی**\n\nلطفاً آیدی عددی کاربر را وارد کنید:');
  });

  // ============================================
  // هدیه به کاربران (اصلاح‌شده با پیام)
  // ============================================
  bot.action('admin_gift', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_gift', step: 'waiting_user_ids', lang: 'fa', data: {} };
    ctx.reply('🎁 **هدیه به کاربران**\n\nلطفاً آیدی کاربر(ها) را وارد کنید (با خط تیره جدا کنید، مثال:\n`123456-789012`)\n\n⚠️ می‌توانید چند کاربر را همزمان هدیه دهید.');
  });

  async function sendGiftToUsers(ctx, target) {
    const session = sessions[ctx.from.id];
    if (!session || session.flow !== 'admin_gift' || session.step !== 'waiting_target') return;
    const amount = session.data.amount;
    const userIds = session.userIds;
    const column = target === 'bonus' ? 'bonus_balance' : 'balance';
    const targetLabel = target === 'bonus' ? 'موجودی بونوس' : 'کیف پول';
    let success = 0;
    for (const id of userIds) {
      try {
        await pool.query(`UPDATE users SET ${column} = ${column} + $1 WHERE telegram_id = $2`, [amount, id]);
        success++;
        const user = await getUserById(id);
        if (user) {
          const giftMsg =
            '✨ یه سورپرایز کوچک برای شما...\n\n' +
            `🎁 هدیه با موفقیت به ${targetLabel} اضافه شد.\n(${amount.toLocaleString()} تومان)\n\n` +
            '🎗این هدیه از طرف مدیریت ووچینو⁰۱\nبه پاس همراهی شما تقدیم شد.\n\n' +
            'گاهی برای شروع یک همراهی خوب،\nلازم نیست حرف زیادی بزنیم،،،\nکافیه یک قدم کوچیک برداریم💎\n\n' +
            '👑امیدواریم وقتی نوبت خرید ووچر رسید،\nووچینو⁰۱ یکی از اولین انتخاب‌های شما باشد.\n\n' +
            '🩵راستی رفیق جان\nامیدوارم امروز شروعِ شانسای خوبت باشه🤲\nپرسود باشید همیشه...💸';
          await sendMessageToUser(bot, id, giftMsg);
        }
      } catch (e) { console.log(e); }
    }
    delete sessions[ctx.from.id];
    ctx.reply(`✅ هدیه (${targetLabel}) به ${success} نفر ارسال شد.`);
  }

  bot.action('gift_target_balance', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    return sendGiftToUsers(ctx, 'balance');
  });

  bot.action('gift_target_bonus', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    return sendGiftToUsers(ctx, 'bonus');
  });

  // ============================================
  // سفارشات خرید در انتظار
  // ============================================
  bot.action('admin_buy_pending', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    const pending = (await pool.query("SELECT * FROM orders WHERE status='pending_delivery' ORDER BY id ASC")).rows;
    if (pending.length === 0) return ctx.reply('✅ سفارش خریدی در انتظار نیست.');
    for (const o of pending) {
      const u = await getUser(o.telegram_id);
      const p = (await pool.query('SELECT name FROM products WHERE key=$1', [o.product_type])).rows[0]?.name || o.product_type;
      let msg = `📦 خرید ${p}\n👤 ${u?.full_name||'---'}\n💰 ${Number(o.amount).toLocaleString()} تومان\n🆔 ${o.tracking_code}`;
      ctx.reply(msg, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📤 تحویل', callback_data: 'admin_deliver_' + o.id }],
            [{ text: '✅ تکمیل دستی', callback_data: 'admin_buy_complete_' + o.id }, { text: '❌ لغو', callback_data: 'admin_buy_cancel_' + o.id }]
          ]
        }
      });
    }
  });

  bot.action(/^admin_deliver_(\d+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const orderId = ctx.match[1]; ctx.answerCbQuery();
    const order = (await pool.query('SELECT * FROM orders WHERE id=$1', [orderId])).rows[0];
    if (!order) return ctx.reply('سفارش یافت نشد.');
    sessions[ctx.from.id] = { flow: 'admin_deliver_code', step: 'waiting_code', data: { orderId, telegramId: order.telegram_id, trackingCode: order.tracking_code } };
    ctx.reply('کد تحویل را وارد کنید:');
  });

  bot.action(/^admin_buy_complete_(\d+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const orderId = ctx.match[1];
    await pool.query("UPDATE orders SET status='completed' WHERE id=$1", [orderId]);
    ctx.answerCbQuery('✅ تکمیل شد'); ctx.reply('✅ سفارش تکمیل شد.');
  });

  bot.action(/^admin_buy_cancel_(\d+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const orderId = ctx.match[1];
    const o = (await pool.query('SELECT * FROM orders WHERE id=$1', [orderId])).rows[0];
    if (!o) return;
    const refund = Number(o.amount) + Number(o.commission || 0);
    await pool.query('UPDATE users SET balance = balance + $1 WHERE telegram_id = $2', [refund, o.telegram_id]);
    await pool.query("UPDATE orders SET status='cancelled' WHERE id=$1", [orderId]);
    ctx.telegram.sendMessage(o.telegram_id, `❌ سفارش لغو شد. ${refund.toLocaleString()} تومان بازگشت.`);
    ctx.answerCbQuery('✅ لغو شد'); ctx.reply('✅ سفارش لغو شد.');
  });

  // ============================================
  // سفارشات فروش در انتظار
  // ============================================
  bot.action('admin_sell_pending', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    const pending = (await pool.query("SELECT * FROM sell_orders WHERE status='pending_review' ORDER BY id ASC")).rows;
    if (pending.length === 0) return ctx.reply('✅ درخواست فروشی در انتظار نیست.');
    for (const s of pending) {
      const u = await getUser(s.telegram_id);
      const p = (await pool.query('SELECT name FROM sell_products WHERE key=$1', [s.product_type])).rows[0]?.name || s.product_type;
      let msg = `🎟 فروش ${p}\n👤 ${u?.full_name||'---'}\n🎫 ${s.voucher_code}\n🆔 ${s.tracking_code}`;
      ctx.reply(msg, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ تایید', callback_data: 'admin_sell_approve_' + s.id }],
            [{ text: '❌ رد', callback_data: 'admin_sell_reject_' + s.id }, { text: '✉️ رد با دلیل', callback_data: 'admin_sell_reject_reason_' + s.id }]
          ]
        }
      });
    }
  });

  bot.action(/^admin_sell_approve_(\d+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const requestId = ctx.match[1]; ctx.answerCbQuery();
    sessions[ctx.from.id] = { flow: 'admin_sell_amount', step: 'waiting_amount', data: { requestId } };
    ctx.reply('💰 مبلغ پایه (ارزش واقعی/تأیید‌شده ووچر به تومان) را وارد کنید — کارمزد تنظیم‌شده در پنل به‌صورت خودکار از آن کسر و مبلغ نهایی به کاربر واریز می‌شود:');
  });

  bot.action(/^admin_sell_reject_(\d+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    await pool.query("UPDATE sell_orders SET status='rejected' WHERE id=$1", [ctx.match[1]]);
    ctx.answerCbQuery('❌ رد شد'); ctx.reply('❌ رد شد.');
  });

  bot.action(/^admin_sell_reject_reason_(\d+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const requestId = ctx.match[1]; ctx.answerCbQuery();
    sessions[ctx.from.id] = { flow: 'admin_sell_reject_reason', step: 'waiting_reason', data: { requestId } };
    ctx.reply('دلیل رد را بنویسید:');
  });

  // ============================================
  // درخواست‌های کیف پول
  // ============================================
  bot.action('admin_pending', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    const pending = (await pool.query("SELECT * FROM wallet_requests WHERE status='pending' ORDER BY id ASC")).rows;
    if (pending.length === 0) return ctx.reply('✅ درخواست کیف پولی نیست.');
    for (const w of pending) {
      const u = await getUser(w.telegram_id);
      let msg = `💰 ${w.type==='deposit'?'واریز':'برداشت'}\n👤 ${u?.full_name||'---'}\n💰 ${Number(w.amount).toLocaleString()} تومان`;
      if (w.type==='withdraw') msg += `\n💳 ${w.card_number}`;
      const btns = [
        [{ text: '✅ تایید', callback_data: 'admin_approve_' + w.id }, { text: '❌ رد', callback_data: 'admin_reject_' + w.id }],
        [{ text: '✉️ رد با دلیل', callback_data: 'admin_reject_reason_' + w.id }]
      ];
      if (w.receipt_file_id) ctx.replyWithPhoto(w.receipt_file_id, { caption: msg, reply_markup: { inline_keyboard: btns } });
      else ctx.reply(msg, { reply_markup: { inline_keyboard: btns } });
    }
  });

  bot.action(/^admin_approve_(\d+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const reqId = ctx.match[1];
    const req = (await pool.query('SELECT * FROM wallet_requests WHERE id=$1', [reqId])).rows[0];
    if (!req || req.status !== 'pending') return;
    if (req.type === 'deposit') {
      await pool.query('UPDATE users SET balance = balance + $1 WHERE telegram_id = $2', [req.amount, req.telegram_id]);
      ctx.telegram.sendMessage(req.telegram_id, `✅ شارژ ${Number(req.amount).toLocaleString()} تومان تأیید شد.`);
    } else {
      await pool.query('UPDATE users SET balance = balance - $1 WHERE telegram_id = $2', [req.amount, req.telegram_id]);
      ctx.telegram.sendMessage(req.telegram_id, `✅ برداشت ${Number(req.amount).toLocaleString()} تومان انجام شد.`);
    }
    await pool.query("UPDATE wallet_requests SET status='approved' WHERE id=$1", [reqId]);
    ctx.answerCbQuery('✅ تأیید شد'); ctx.reply('✅ تأیید شد.');
  });

  bot.action(/^admin_reject_(\d+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const reqId = ctx.match[1];
    await pool.query("UPDATE wallet_requests SET status='rejected' WHERE id=$1", [reqId]);
    const req = (await pool.query('SELECT * FROM wallet_requests WHERE id=$1', [reqId])).rows[0];
    ctx.telegram.sendMessage(req.telegram_id, `❌ درخواست رد شد.`);
    ctx.answerCbQuery('❌ رد شد'); ctx.reply('❌ رد شد.');
  });

  bot.action(/^admin_reject_reason_(\d+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const reqId = ctx.match[1]; ctx.answerCbQuery();
    sessions[ctx.from.id] = { flow: 'admin_reject_reason', step: 'waiting_reason', data: { requestId: reqId } };
    ctx.reply('دلیل رد را بنویسید:');
  });

  // ============================================
  // آمار کاربران
  // ============================================
  bot.action('admin_stats', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    const stats = await getUserStats();
    ctx.reply(
      '📊 **آمار کاربران ووچینو**\n\n' +
      `👥 کل: ${stats.totalUsers}\n` +
      `✅ ثبت‌نام کامل: ${stats.registeredUsers}\n` +
      `💰 مجموع موجودی: ${stats.totalBalance.toLocaleString()} تومان\n` +
      `🎁 مجموع بونوس: ${stats.totalBonus.toLocaleString()} تومان`,
      { parse_mode: 'Markdown' }
    );
  });

  // ============================================
  // جستجوی کد پیگیری
  // ============================================
  bot.action('admin_find', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_find', step: 'waiting_code', lang: 'fa' };
    ctx.reply('🔎 کد پیگیری را وارد کنید:');
  });

  // ============================================
  // اطلاعات یک کاربر
  // ============================================
  bot.action('admin_userinfo', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_userinfo', step: 'waiting_id', lang: 'fa' };
    ctx.reply('👤 آیدی کاربر را وارد کنید:');
  });

  // ============================================
  // پردازش‌های متنی ادمین (باقی session ها)
  // ============================================
  bot.on('text', async (ctx, next) => {
    if (!isAdmin(ctx.from.id)) return next();
    const session = sessions[ctx.from.id];
    if (!session) return next();

    // افزودن کانال
    if (session.flow === 'admin_add_channel') {
      if (session.step === 'waiting_chat_id') {
        const chatId = ctx.message.text.trim();
        if (!chatId.startsWith('-')) return ctx.reply('❌ آیدی کانال باید با - شروع شود.');
        session.chatId = chatId;
        session.step = 'waiting_invite_link';
        return ctx.reply('✅ آیدی ثبت شد.\nلینک دعوت را وارد کنید:');
      } else if (session.step === 'waiting_invite_link') {
        try {
          await addChannel(session.chatId, ctx.message.text.trim(), 'کانال ' + session.chatId);
          delete sessions[ctx.from.id];
          ctx.reply('✅ کانال اضافه شد.');
        } catch (err) { ctx.reply('❌ خطا: ' + err.message); }
        return;
      }
    }

    // حذف کانال
    if (session.flow === 'admin_remove_channel' && session.step === 'waiting_chat_id') {
      await deleteChannel(ctx.message.text.trim());
      delete sessions[ctx.from.id];
      ctx.reply('✅ کانال حذف شد.');
      return;
    }

    // تغییر وضعیت کانال
    if (session.flow === 'admin_toggle_channel' && session.step === 'waiting_chat_id') {
      const chatId = ctx.message.text.trim();
      const ch = (await pool.query('SELECT * FROM required_channels WHERE chat_id=$1', [chatId])).rows[0];
      if (!ch) return ctx.reply('❌ کانال یافت نشد.');
      await updateChannel(chatId, { active: ch.active ? 0 : 1 });
      delete sessions[ctx.from.id];
      ctx.reply(`✅ کانال ${ch.active ? 'غیرفعال' : 'فعال'} شد.`);
      return;
    }

    // افزودن محصول خرید گام‌به‌گام
    if (session.flow === 'admin_add_product_buy') {
      if (session.step === 'waiting_name') {
        session.data.name = ctx.message.text.trim();
        session.step = 'waiting_price_type';
        return ctx.reply('نوع قیمت:', { reply_markup: { inline_keyboard: [[{ text: '💵 دلار', callback_data: 'buy_price_usd' }], [{ text: '💰 تومان', callback_data: 'buy_price_toman' }]] } });
      }
      if (session.step === 'waiting_min_amount') {
        const val = parseFloat(ctx.message.text.replace(/[^0-9.]/g, ''));
        if (isNaN(val) || val <= 0) return ctx.reply('❌ نامعتبر.');
        session.data.minAmount = val;
        session.step = 'waiting_sticker';
        return ctx.reply('استیکر/ایموجی محصول را ارسال کنید:');
      }
      if (session.step === 'waiting_sticker') {
        const sticker = ctx.message.text.trim();
        const { name, priceType, minAmount } = session.data;
        const key = name.replace(/\s+/g, '_').toLowerCase();
        const finalName = sticker + ' ' + name;
        try {
          await pool.query(
            'INSERT INTO products (key, name, min_amount, price_type, active, created_at) VALUES ($1,$2,$3,$4,1,NOW()) ON CONFLICT (key) DO UPDATE SET name=$2, min_amount=$3, price_type=$4, active=1',
            [key, finalName, minAmount, priceType]
          );
          delete sessions[ctx.from.id];
          ctx.reply('✅ محصول اضافه شد.');
        } catch (err) { ctx.reply('❌ خطا: ' + err.message); }
        return;
      }
    }

    // تنظیم کارمزد خرید
    if (session.flow === 'admin_commission_product_buy') {
      if (session.step === 'waiting_commission_type') return next();
      if (session.step === 'waiting_value') {
        const val = parseFloat(ctx.message.text.replace(/[^0-9.]/g, ''));
        if (isNaN(val) || val < 0) return ctx.reply('❌ عدد معتبر وارد کنید.');
        await pool.query('UPDATE products SET commission_type=$1, commission_value=$2 WHERE key=$3', [session.data.commType, val, session.data.productKey]);
        delete sessions[ctx.from.id];
        ctx.reply('✅ کارمزد تنظیم شد.');
        return;
      }
    }

    // افزودن محصول فروش
    if (session.flow === 'admin_add_product_sell') {
      if (session.step === 'waiting_name') {
        session.data.name = ctx.message.text.trim();
        session.step = 'waiting_unit_price';
        return ctx.reply('💰 قیمت واحد را وارد کنید:');
      }
      if (session.step === 'waiting_unit_price') {
        const price = parseFloat(ctx.message.text.replace(/[^0-9.]/g, ''));
        if (isNaN(price) || price <= 0) return ctx.reply('❌ نامعتبر.');
        session.data.unitPrice = price;
        session.step = 'waiting_sample_code';
        return ctx.reply('🎫 نمونه کد را وارد کنید:');
      }
      if (session.step === 'waiting_sample_code') {
        const sampleCode = ctx.message.text.trim();
        const { name, unitPrice } = session.data;
        const key = name.replace(/\s+/g, '_').toLowerCase();
        try {
          await pool.query(
            'INSERT INTO sell_products (key, name, unit_price, sample_code, active, created_at) VALUES ($1,$2,$3,$4,1,NOW()) ON CONFLICT (key) DO UPDATE SET name=$2, unit_price=$3, sample_code=$4, active=1',
            [key, name, unitPrice, sampleCode]
          );
          delete sessions[ctx.from.id];
          ctx.reply('✅ محصول فروش اضافه شد.');
        } catch (err) { ctx.reply('❌ خطا: ' + err.message); }
        return;
      }
    }

    // تنظیم کارمزد فروش
    if (session.flow === 'admin_commission_product_sell') {
      if (session.step === 'waiting_commission_type') return next();
      if (session.step === 'waiting_value') {
        const val = parseFloat(ctx.message.text.replace(/[^0-9.]/g, ''));
        if (isNaN(val) || val < 0) return ctx.reply('❌ عدد معتبر وارد کنید.');
        await pool.query('UPDATE sell_products SET commission_type=$1, commission_value=$2 WHERE key=$3', [session.data.commType, val, session.data.productKey]);
        delete sessions[ctx.from.id];
        ctx.reply('✅ کارمزد تنظیم شد.');
        return;
      }
    }

    // تغییر وضعیت محصول خرید/فروش
    if (session.flow === 'admin_toggle_product_buy' && session.step === 'waiting_key') {
      const key = ctx.message.text.trim();
      const p = await getProductByKey(key);
      if (!p) return ctx.reply('❌ محصول یافت نشد.');
      await updateProduct(key, { active: p.active ? 0 : 1 });
      delete sessions[ctx.from.id];
      ctx.reply(`✅ محصول ${p.active ? 'غیرفعال' : 'فعال'} شد.`);
      return;
    }
    if (session.flow === 'admin_toggle_product_sell' && session.step === 'waiting_key') {
      const key = ctx.message.text.trim();
      const p = await getSellProductByKey(key);
      if (!p) return ctx.reply('❌ محصول یافت نشد.');
      await updateSellProduct(key, { active: p.active ? 0 : 1 });
      delete sessions[ctx.from.id];
      ctx.reply(`✅ محصول فروش ${p.active ? 'غیرفعال' : 'فعال'} شد.`);
      return;
    }

    // افزودن صرافی
    if (session.flow === 'admin_add_api_source') {
      if (session.step === 'waiting_name') { session.data.name = ctx.message.text; session.step = 'waiting_type'; return ctx.reply('نوع صرافی (voucher, crypto, ...):'); }
      if (session.step === 'waiting_type') { session.data.type = ctx.message.text; session.step = 'waiting_base_url'; return ctx.reply('base_url:'); }
      if (session.step === 'waiting_base_url') { session.data.base_url = ctx.message.text; session.step = 'waiting_api_key'; return ctx.reply('API Key:'); }
      if (session.step === 'waiting_api_key') { session.data.api_key = ctx.message.text; session.step = 'waiting_secret_key'; return ctx.reply('Secret Key:'); }
      if (session.step === 'waiting_secret_key') { session.data.secret_key = ctx.message.text; session.step = 'waiting_priority'; return ctx.reply('اولویت (عدد):'); }
      if (session.step === 'waiting_priority') {
        const priority = parseInt(ctx.message.text) || 1;
        session.data.priority = priority;
        try {
          await addApiSource(session.data);
          delete sessions[ctx.from.id];
          ctx.reply('✅ صرافی اضافه شد.');
        } catch (err) { ctx.reply('❌ خطا: ' + err.message); }
        return;
      }
    }

    // ویرایش صرافی
    if (session.flow === 'admin_edit_api_source') {
      if (session.step === 'waiting_field') {
        const field = ctx.message.text.trim().toLowerCase();
        if (!['name','type','base_url','api_key','secret_key','priority'].includes(field)) return ctx.reply('❌ فیلد نامعتبر.');
        session.editField = field;
        session.step = 'waiting_value';
        return ctx.reply(`مقدار جدید برای ${field}:`);
      }
      if (session.step === 'waiting_value') {
        const value = session.editField === 'priority' ? parseInt(ctx.message.text) || 1 : ctx.message.text;
        try {
          await updateApiSource(session.data.apiId, { [session.editField]: value });
          delete sessions[ctx.from.id];
          ctx.reply('✅ ویرایش شد.');
        } catch (err) { ctx.reply('❌ خطا: ' + err.message); }
        return;
      }
    }

    // اتصال محصول
    if (session.flow === 'admin_add_product_link') {
      if (session.step === 'waiting_product_type') {
        const type = ctx.message.text.trim();
        if (!['buy','sell'].includes(type)) return ctx.reply('❌ فقط buy یا sell.');
        session.data.productType = type;
        session.step = 'waiting_product_key';
        return ctx.reply('کلید محصول (product_key) را وارد کنید:');
      }
      if (session.step === 'waiting_product_key') {
        session.data.productKey = ctx.message.text.trim();
        const apis = await getAllApiSources(true);
        if (apis.length === 0) { delete sessions[ctx.from.id]; return ctx.reply('❌ هیچ صرافی وجود ندارد.'); }
        const buttons = apis.map(a => [{ text: a.name, callback_data: `admin_link_api_${a.id}` }]);
        session.step = 'waiting_api_choice';
        return ctx.reply('صرافی را انتخاب کنید:', { reply_markup: { inline_keyboard: buttons } });
      }
      return next();
    }

    // تغییر اولویت اتصال
    if (session.flow === 'admin_edit_product_link') {
      if (session.step === 'waiting_link_id') {
        const linkId = parseInt(ctx.message.text);
        if (isNaN(linkId)) return ctx.reply('❌ ID نامعتبر.');
        session.linkId = linkId;
        session.step = 'waiting_priority';
        return ctx.reply('اولویت جدید را وارد کنید:');
      }
      if (session.step === 'waiting_priority') {
        const newPriority = parseInt(ctx.message.text);
        if (isNaN(newPriority)) return ctx.reply('❌ عدد معتبر وارد کنید.');
        await updateProductApiLink(session.linkId, { priority: newPriority });
        delete sessions[ctx.from.id];
        ctx.reply('✅ اولویت تغییر کرد.');
        return;
      }
    }

    // حذف اتصال
    if (session.flow === 'admin_remove_product_link' && session.step === 'waiting_link_id') {
      const linkId = parseInt(ctx.message.text);
      if (isNaN(linkId)) return ctx.reply('❌ ID نامعتبر.');
      await removeProductApiLink(linkId);
      delete sessions[ctx.from.id];
      ctx.reply('✅ اتصال حذف شد.');
      return;
    }

    // ارسال همگانی: دریافت متن
    if (session.flow === 'admin_broadcast' && session.step === 'waiting_text') {
      session.data.text = ctx.message.text;
      const allUsers = await getAllUsers(true);
      if (allUsers.length === 0) { delete sessions[ctx.from.id]; return ctx.reply('❌ کاربری نیست.'); }
      const msg = await ctx.reply('📢 در حال ارسال...');
      const results = session.data.hasPhoto
        ? await sendBroadcastWithPhoto(bot, allUsers.map(u => u.telegram_id), session.data.photo, session.data.text, { parse_mode: 'HTML' })
        : await sendBroadcast(bot, allUsers.map(u => u.telegram_id), session.data.text, { parse_mode: 'HTML' });
      const ok = results.filter(r => r.success).length;
      await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `✅ ارسال شد.\nموفق: ${ok}\nناموفق: ${results.length - ok}`);
      delete sessions[ctx.from.id];
      return;
    }

    // ارسال مخفی: آیدی و سپس متن
    if (session.flow === 'admin_fake_broadcast') {
      if (session.step === 'waiting_user_id') {
        const targetId = ctx.message.text.trim();
        const user = await getUserById(targetId);
        if (!user) return ctx.reply('❌ کاربر پیدا نشد.');
        session.targetId = targetId;
        session.step = 'waiting_media_choice';
        return ctx.reply('نوع پیام:', { reply_markup: { inline_keyboard: [[{ text: '📝 فقط متن', callback_data: 'fake_text_only' }], [{ text: '🖼 عکس', callback_data: 'fake_with_photo' }]] } });
      }
      if (session.step === 'waiting_text') {
        const text = ctx.message.text;
        const result = session.data.hasPhoto
          ? await sendBroadcastWithPhoto(bot, [session.targetId], session.data.photo, text, { parse_mode: 'HTML' }, true)
          : await sendBroadcast(bot, [session.targetId], text, { parse_mode: 'HTML' }, true);
        if (result[0].success) ctx.reply('✅ ارسال شد.'); else ctx.reply('❌ خطا.');
        delete sessions[ctx.from.id];
        return;
      }
    }

    // هدیه: دریافت آیدی‌ها و مبلغ
    if (session.flow === 'admin_gift') {
      if (session.step === 'waiting_user_ids') {
        const ids = ctx.message.text.split('-').map(s => s.trim()).filter(Boolean);
        const valid = [];
        for (let id of ids) { if (await getUserById(id)) valid.push(id); }
        if (valid.length === 0) return ctx.reply('❌ کاربر معتبری نیست.');
        session.userIds = valid;
        session.step = 'waiting_amount';
        return ctx.reply(`✅ ${valid.length} کاربر معتبر.\n💰 مبلغ هدیه به هر کاربر را وارد کنید:`);
      }
      if (session.step === 'waiting_amount') {
        const amount = parseInt(ctx.message.text.replace(/[^0-9]/g, ''));
        if (!amount || amount <= 0) return ctx.reply('❌ مبلغ نامعتبر.');
        session.data.amount = amount;
        session.step = 'waiting_target';
        return ctx.reply('🎯 هدیه به کدام موجودی واریز شود؟', {
          reply_markup: {
            inline_keyboard: [
              [{ text: '💰 موجودی اصلی (کیف پول)', callback_data: 'gift_target_balance' }],
              [{ text: '🎁 موجودی بونوس', callback_data: 'gift_target_bonus' }]
            ]
          }
        });
      }
    }

    // کوپن
    if (session.flow === 'admin_add_coupon') {
      if (session.step === 'waiting_code') {
        const code = ctx.message.text.trim().toUpperCase();
        if (code.length < 3) return ctx.reply('❌ حداقل ۳ کاراکتر.');
        session.data.code = code; session.step = 'waiting_type';
        return ctx.reply('نوع:', { reply_markup: { inline_keyboard: [[{ text: '🎁 هدیه', callback_data: 'coupon_type_gift' }], [{ text: '💰 تخفیف', callback_data: 'coupon_type_discount' }]] } });
      }
      if (session.step === 'waiting_amount') {
        const amount = parseInt(ctx.message.text.replace(/[^0-9]/g, ''));
        if (!amount || amount <= 0) return ctx.reply('❌ مبلغ نامعتبر.');
        session.data.amount = amount; session.step = 'waiting_limit';
        return ctx.reply('سقف استفاده را وارد کنید:');
      }
      if (session.step === 'waiting_limit') {
        const limit = parseInt(ctx.message.text.replace(/[^0-9]/g, '')) || 1;
        session.data.usage_limit = limit; session.step = 'waiting_expiry';
        return ctx.reply('تاریخ انقضا (YYYY-MM-DD) یا 0:');
      }
      if (session.step === 'waiting_expiry') {
        const input = ctx.message.text.trim();
        let expiresAt = null;
        if (input !== '0') {
          const d = new Date(input);
          if (isNaN(d.getTime())) return ctx.reply('❌ تاریخ نامعتبر.');
          expiresAt = d.toISOString();
        }
        const { code, type, amount, usage_limit } = session.data;
        await pool.query(
          'INSERT INTO coupons (code, type, amount, usage_limit, expires_at, active, created_at) VALUES ($1,$2,$3,$4,$5,1,NOW())',
          [code, type, amount, usage_limit, expiresAt]
        );
        delete sessions[ctx.from.id];
        ctx.reply(`✅ کوپن **${code}** ایجاد شد.`);
        return;
      }
    }
    if (session.flow === 'admin_disable_coupon' && session.step === 'waiting_code') {
      const code = ctx.message.text.trim().toUpperCase();
      const res = await pool.query('UPDATE coupons SET active = 0 WHERE code = $1 RETURNING code', [code]);
      if (res.rows.length === 0) return ctx.reply('❌ یافت نشد.');
      delete sessions[ctx.from.id];
      ctx.reply(`✅ ${code} غیرفعال شد.`);
      return;
    }

    // تحویل کد
    if (session.flow === 'admin_deliver_code' && session.step === 'waiting_code') {
      const deliveredCode = ctx.message.text.trim();
      const { orderId, telegramId, trackingCode } = session.data;
      await pool.query("UPDATE orders SET status='completed', delivered_code=$1 WHERE id=$2", [deliveredCode, orderId]);
      ctx.telegram.sendMessage(telegramId, `🎉 سفارش تحویل داده شد!\n🆔 ${trackingCode}\n📦 کد:\n${deliveredCode}`);
      delete sessions[ctx.from.id];
      ctx.reply('✅ تحویل شد.');
      return;
    }

    // رد با دلیل (کیف پول)
    if (session.flow === 'admin_reject_reason' && session.step === 'waiting_reason') {
      const reason = ctx.message.text;
      const requestId = session.data.requestId;
      const req = (await pool.query('SELECT * FROM wallet_requests WHERE id=$1', [requestId])).rows[0];
      if (!req || req.status !== 'pending') { delete sessions[ctx.from.id]; return ctx.reply('قبلاً بررسی شده.'); }
      await pool.query("UPDATE wallet_requests SET status='rejected' WHERE id=$1", [requestId]);
      ctx.telegram.sendMessage(req.telegram_id, `❌ درخواست رد شد.\n📝 دلیل: ${reason}`);
      delete sessions[ctx.from.id];
      ctx.reply('✅ رد شد.');
      return;
    }

    // رد با دلیل (فروش)
    if (session.flow === 'admin_sell_reject_reason' && session.step === 'waiting_reason') {
      const reason = ctx.message.text;
      const requestId = session.data.requestId;
      await pool.query("UPDATE sell_orders SET status='rejected' WHERE id=$1", [requestId]);
      const req = (await pool.query('SELECT * FROM sell_orders WHERE id=$1', [requestId])).rows[0];
      ctx.telegram.sendMessage(req.telegram_id, `❌ فروش رد شد.\n🆔 ${req.tracking_code}\n📝 ${reason}`);
      delete sessions[ctx.from.id];
      ctx.reply('✅ رد شد.');
      return;
    }

    // فروش - ورود مبلغ پایه و کسر خودکار کارمزد
    if (session.flow === 'admin_sell_amount' && session.step === 'waiting_amount') {
      const baseAmount = parseInt(ctx.message.text.replace(/[^0-9]/g, ''));
      if (!baseAmount || baseAmount <= 0) return ctx.reply('⚠️ مبلغ نامعتبر.');
      const requestId = session.data.requestId;
      const req = (await pool.query('SELECT * FROM sell_orders WHERE id=$1', [requestId])).rows[0];
      if (!req || req.status !== 'pending_review') { delete sessions[ctx.from.id]; return ctx.reply('❌ این درخواست قبلاً بررسی شده.'); }
      const sellProduct = await getSellProductByKey(req.product_type);
      const { commission, payout } = calculateSellPayout(baseAmount, sellProduct || { commission_type: 'none', commission_value: 0 });
      await pool.query('UPDATE users SET balance = balance + $1 WHERE telegram_id = $2', [payout, req.telegram_id]);
      await pool.query("UPDATE sell_orders SET status='approved', amount=$1, commission=$2, fulfillment_mode='manual' WHERE id=$3", [payout, commission, requestId]);
      ctx.telegram.sendMessage(req.telegram_id,
        `✅ فروش تأیید شد.\n💰 مبلغ پایه: ${baseAmount.toLocaleString()} تومان\n💳 کارمزد: ${commission.toLocaleString()} تومان\n💵 واریز به کیف پول: ${payout.toLocaleString()} تومان`
      );
      delete sessions[ctx.from.id];
      ctx.reply(`✅ تأیید شد.\nپایه: ${baseAmount.toLocaleString()} | کارمزد: ${commission.toLocaleString()} | واریزی: ${payout.toLocaleString()}`);
      return;
    }

    // تنظیمات (نرخ دلار، ایموجی، بازی، رفرال، برداشت، VPN)
    if (session.flow === 'admin_set_rate' && session.step === 'waiting_value') {
      const value = parseInt(ctx.message.text.replace(/[^0-9]/g, ''));
      if (!value || value <= 0) return ctx.reply('❌ عدد معتبر وارد کنید.');
      await setSetting('usd_rate', String(value));
      delete sessions[ctx.from.id];
      ctx.reply('✅ نرخ دلار به ' + value.toLocaleString() + ' تومان تغییر یافت.');
      return;
    }
    if (session.flow === 'admin_set_reaction' && session.step === 'waiting_value') {
      const emoji = ctx.message.text.trim();
      if (!emoji) return ctx.reply('❌ ایموجی نامعتبر.');
      await setSetting('start_reaction', emoji);
      delete sessions[ctx.from.id];
      ctx.reply('✅ ایموجی به ' + emoji + ' تغییر یافت.');
      return;
    }
    if (session.flow === 'admin_set_win_rate' && session.step === 'waiting_value') {
      const val = parseInt(ctx.message.text);
      if (isNaN(val) || val < 0 || val > 100) return ctx.reply('❌ عدد بین ۰ تا ۱۰۰ وارد کنید.');
      await setSetting('winRateBonus', String(val));
      delete sessions[ctx.from.id];
      ctx.reply('✅ درصد برد بونوس تنظیم شد.');
      return;
    }
    if (session.flow === 'admin_set_game_multiplier' && session.step === 'waiting_value') {
      const val = parseFloat(ctx.message.text);
      if (isNaN(val) || val <= 0) return ctx.reply('❌ عدد مثبت وارد کنید.');
      await setSetting('gameMultiplier', String(val));
      delete sessions[ctx.from.id];
      ctx.reply('✅ ضریب بازی تنظیم شد.');
      return;
    }
    if (session.flow === 'admin_set_min_purchase' && session.step === 'waiting_value') {
      const val = parseInt(ctx.message.text);
      if (isNaN(val) || val < 0) return ctx.reply('❌ عدد نامعتبر.');
      await setSetting('minPurchaseForGame', String(val));
      delete sessions[ctx.from.id];
      ctx.reply('✅ حداقل خرید برای بازی تنظیم شد.');
      return;
    }
    if (session.flow === 'admin_set_game_min_bet' && session.step === 'waiting_value') {
      const val = parseInt(ctx.message.text.replace(/[^0-9]/g, ''));
      if (isNaN(val) || val < 0) return ctx.reply('❌ عدد نامعتبر.');
      await setSetting('game_min_bet', String(val));
      delete sessions[ctx.from.id];
      ctx.reply('✅ حداقل مبلغ شروع بازی تنظیم شد.');
      return;
    }
    if (session.flow === 'admin_set_bonus_min_withdraw' && session.step === 'waiting_value') {
      const val = parseInt(ctx.message.text.replace(/[^0-9]/g, ''));
      if (isNaN(val) || val < 0) return ctx.reply('❌ عدد نامعتبر.');
      await setSetting('bonus_min_withdraw', String(val));
      delete sessions[ctx.from.id];
      ctx.reply('✅ حداقل برداشت بونوس تنظیم شد.');
      return;
    }
    if (session.flow === 'admin_set_referral_bonus' && session.step === 'waiting_value') {
      const val = parseInt(ctx.message.text);
      if (isNaN(val) || val < 0) return ctx.reply('❌ عدد نامعتبر.');
      await setSetting('referral_bonus', String(val));
      delete sessions[ctx.from.id];
      ctx.reply('✅ مبلغ هدیه دعوت‌کننده تنظیم شد.');
      return;
    }
    if (session.flow === 'admin_set_referral_percent' && session.step === 'waiting_value') {
      const val = parseFloat(ctx.message.text);
      if (isNaN(val) || val < 0 || val > 100) return ctx.reply('❌ بین ۰ تا ۱۰۰ وارد کنید.');
      await setSetting('referral_commission_percent', String(val));
      delete sessions[ctx.from.id];
      ctx.reply('✅ درصد سود کارمزد تنظیم شد.');
      return;
    }
    if (session.flow === 'admin_set_min_withdraw' && session.step === 'waiting_value') {
      const val = parseInt(ctx.message.text);
      if (isNaN(val) || val < 0) return ctx.reply('❌ عدد نامعتبر.');
      await setSetting('min_withdraw', String(val));
      delete sessions[ctx.from.id];
      ctx.reply('✅ حداقل برداشت تنظیم شد.');
      return;
    }

    // تنظیمات VPN
    if (session.flow === 'admin_vpn_set_max_attempts' && session.step === 'waiting_value') {
      const val = parseInt(ctx.message.text);
      if (isNaN(val) || val < 0) return ctx.reply('❌ عدد نامعتبر.');
      await setSetting('vpn_max_free_attempts', String(val));
      delete sessions[ctx.from.id];
      ctx.reply('✅ حداکثر دفعات رایگان تنظیم شد.');
      return;
    }
    if (session.flow === 'admin_vpn_set_invites_unlock' && session.step === 'waiting_value') {
      const val = parseInt(ctx.message.text);
      if (isNaN(val) || val < 0) return ctx.reply('❌ عدد نامعتبر.');
      await setSetting('vpn_invites_for_unlock', String(val));
      delete sessions[ctx.from.id];
      ctx.reply('✅ تعداد دعوت برای باز شدن تنظیم شد.');
      return;
    }
    if (session.flow === 'admin_vpn_set_volume' && session.step === 'waiting_value') {
      const val = parseInt(ctx.message.text);
      if (isNaN(val) || val <= 0) return ctx.reply('❌ عدد نامعتبر.');
      await setSetting('vpn_default_volume_gb', String(val));
      delete sessions[ctx.from.id];
      ctx.reply('✅ حجم پیش‌فرض تنظیم شد.');
      return;
    }
    if (session.flow === 'admin_vpn_set_days' && session.step === 'waiting_value') {
      const val = parseInt(ctx.message.text);
      if (isNaN(val) || val <= 0) return ctx.reply('❌ عدد نامعتبر.');
      await setSetting('vpn_default_days', String(val));
      delete sessions[ctx.from.id];
      ctx.reply('✅ مدت پیش‌فرض تنظیم شد.');
      return;
    }
    if (session.flow === 'admin_vpn_health_interval' && session.step === 'waiting_value') {
      const val = parseInt(ctx.message.text);
      if (isNaN(val) || val <= 0) return ctx.reply('❌ عدد نامعتبر.');
      await setSetting('vpn_health_interval', String(val));
      delete sessions[ctx.from.id];
      ctx.reply('✅ فاصله سلامت تنظیم شد.');
      return;
    }
    if (session.flow === 'admin_vpn_failure_threshold' && session.step === 'waiting_value') {
      const val = parseInt(ctx.message.text);
      if (isNaN(val) || val <= 0) return ctx.reply('❌ عدد نامعتبر.');
      await setSetting('vpn_failure_threshold', String(val));
      delete sessions[ctx.from.id];
      ctx.reply('✅ آستانه شکست تنظیم شد.');
      return;
    }
    if (session.flow === 'admin_vpn_cooldown' && session.step === 'waiting_value') {
      const val = parseInt(ctx.message.text);
      if (isNaN(val) || val <= 0) return ctx.reply('❌ عدد نامعتبر.');
      await setSetting('vpn_cooldown', String(val));
      delete sessions[ctx.from.id];
      ctx.reply('✅ مدت خنک‌سازی تنظیم شد.');
      return;
    }

    // افزودن سرور VPN
    if (session.flow === 'admin_vpn_add_server') {
      if (session.step === 'waiting_name') {
        session.data.name = ctx.message.text.trim();
        session.step = 'waiting_host';
        return ctx.reply('🔗 آدرس سرور (host) را وارد کنید:');
      }
      if (session.step === 'waiting_host') {
        session.data.host = ctx.message.text.trim();
        session.step = 'waiting_port';
        return ctx.reply('🔌 پورت را وارد کنید:');
      }
      if (session.step === 'waiting_port') {
        const port = parseInt(ctx.message.text);
        if (isNaN(port)) return ctx.reply('❌ پورت نامعتبر.');
        session.data.port = port;
        session.step = 'waiting_protocol';
        return ctx.reply('پروتکل (vless, vmess, trojan, ...) را وارد کنید:');
      }
      if (session.step === 'waiting_protocol') {
        session.data.protocol = ctx.message.text.trim();
        try {
          await pool.query(
            'INSERT INTO vpn_servers (name, host, port, protocol, is_active, health_status, created_at) VALUES ($1,$2,$3,$4,true,\'unknown\',NOW())',
            [session.data.name, session.data.host, session.data.port, session.data.protocol]
          );
          delete sessions[ctx.from.id];
          ctx.reply('✅ سرور اضافه شد.');
        } catch (err) { ctx.reply('❌ خطا: ' + err.message); }
        return;
      }
    }

    // جستجوی کد پیگیری
    if (session.flow === 'admin_find' && session.step === 'waiting_code') {
      const code = ctx.message.text.trim().toUpperCase();
      const orderRes = await pool.query('SELECT * FROM orders WHERE tracking_code=$1', [code]);
      const walletRes = await pool.query('SELECT * FROM wallet_requests WHERE tracking_code=$1', [code]);
      const sellRes = await pool.query('SELECT * FROM sell_orders WHERE tracking_code=$1', [code]);
      if (orderRes.rows.length === 0 && walletRes.rows.length === 0 && sellRes.rows.length === 0) {
        ctx.reply('❌ یافت نشد.');
      } else {
        if (orderRes.rows.length > 0) { const o = orderRes.rows[0]; ctx.reply(`📦 خرید ${o.product_type} | ${Number(o.amount).toLocaleString()} تومان | ${o.status}`); }
        if (walletRes.rows.length > 0) { const w = walletRes.rows[0]; ctx.reply(`💰 کیف پول | ${Number(w.amount).toLocaleString()} تومان | ${w.status}`); }
        if (sellRes.rows.length > 0) { const s = sellRes.rows[0]; ctx.reply(`🎟 فروش ${s.product_type} | ${s.amount ? Number(s.amount).toLocaleString()+' تومان' : 'نامشخص'} | ${s.status}`); }
      }
      delete sessions[ctx.from.id];
      return;
    }

    // اطلاعات کاربر
    if (session.flow === 'admin_userinfo' && session.step === 'waiting_id') {
      const targetId = ctx.message.text.trim();
      const user = await getUserById(targetId);
      if (!user) { ctx.reply('❌ کاربر یافت نشد.'); delete sessions[ctx.from.id]; return; }
      ctx.reply(`👤 **اطلاعات**\n🆔 ${user.telegram_id}\n👤 ${user.full_name||'-'}\n💰 ${Number(user.balance).toLocaleString()} تومان`);
      delete sessions[ctx.from.id];
      return;
    }

    return next();
  });

  // ============================================
  // پردازش عکس (همگانی/مخفی)
  // ============================================
  bot.on('photo', async (ctx, next) => {
    if (!isAdmin(ctx.from.id)) return next();
    const session = sessions[ctx.from.id];
    if (!session) return next();
    if ((session.flow === 'admin_broadcast' || session.flow === 'admin_fake_broadcast') && session.step === 'waiting_photo') {
      const fileId = ctx.message.photo.slice(-1)[0].file_id;
      session.data.photo = fileId;
      session.step = 'waiting_text';
      ctx.reply('✅ عکس دریافت شد. حالا متن (کپشن) را ارسال کنید:');
      return;
    }
    return next();
  });

  // ============================================
  // Callback های اضافی
  // ============================================
  bot.action('coupon_type_gift', async (ctx) => {
    const s = sessions[ctx.from.id]; if (!s || s.flow !== 'admin_add_coupon') return;
    s.data.type = 'gift'; s.step = 'waiting_amount'; ctx.answerCbQuery(); ctx.reply('مبلغ هدیه را وارد کنید:');
  });
  bot.action('coupon_type_discount', async (ctx) => {
    const s = sessions[ctx.from.id]; if (!s || s.flow !== 'admin_add_coupon') return;
    s.data.type = 'discount'; s.step = 'waiting_amount'; ctx.answerCbQuery(); ctx.reply('مبلغ تخفیف را وارد کنید:');
  });
  bot.action('fake_text_only', async (ctx) => {
    const s = sessions[ctx.from.id]; if (!s || s.flow !== 'admin_fake_broadcast') return;
    s.step = 'waiting_text'; s.data.hasPhoto = false; ctx.answerCbQuery(); ctx.reply('📝 متن را ارسال کنید:');
  });
  bot.action('fake_with_photo', async (ctx) => {
    const s = sessions[ctx.from.id]; if (!s || s.flow !== 'admin_fake_broadcast') return;
    s.step = 'waiting_photo'; s.data.hasPhoto = true; ctx.answerCbQuery(); ctx.reply('🖼 عکس را ارسال کنید:');
  });
  bot.action('buy_price_usd', async (ctx) => {
    const s = sessions[ctx.from.id]; if (!s || s.flow !== 'admin_add_product_buy') return;
    s.data.priceType = 'usd'; s.step = 'waiting_min_amount'; ctx.answerCbQuery(); ctx.reply('حداقل مبلغ (دلار):');
  });
  bot.action('buy_price_toman', async (ctx) => {
    const s = sessions[ctx.from.id]; if (!s || s.flow !== 'admin_add_product_buy') return;
    s.data.priceType = 'toman'; s.step = 'waiting_min_amount'; ctx.answerCbQuery(); ctx.reply('حداقل مبلغ (تومان):');
  });
  bot.action(/^admin_link_api_(\d+)/, async (ctx) => {
    const s = sessions[ctx.from.id]; if (!s || s.flow !== 'admin_add_product_link') return;
    const apiId = ctx.match[1];
    try {
      await addProductApiLink(s.data.productType, s.data.productKey, apiId, 1);
      delete sessions[ctx.from.id];
      ctx.answerCbQuery(); ctx.reply('✅ اتصال برقرار شد.');
    } catch (err) { ctx.reply('❌ خطا.'); }
  });
  bot.action(/^comm_type_(.+)/, async (ctx) => {
    const s = sessions[ctx.from.id]; if (!s || s.flow !== 'admin_commission_product_buy') return;
    const type = ctx.match[1];
    s.data.commType = type;
    if (type === 'none') {
      await pool.query('UPDATE products SET commission_type=$1, commission_value=0 WHERE key=$2', ['none', s.data.productKey]);
      delete sessions[ctx.from.id];
      ctx.answerCbQuery(); ctx.reply('✅ کارمزد حذف شد.');
    } else {
      s.step = 'waiting_value';
      ctx.answerCbQuery(); ctx.reply('مقدار کارمزد را وارد کنید:');
    }
  });
  bot.action(/^comm_sell_type_(.+)/, async (ctx) => {
    const s = sessions[ctx.from.id]; if (!s || s.flow !== 'admin_commission_product_sell') return;
    const type = ctx.match[1];
    s.data.commType = type;
    if (type === 'none') {
      await pool.query('UPDATE sell_products SET commission_type=$1, commission_value=0 WHERE key=$2', ['none', s.data.productKey]);
      delete sessions[ctx.from.id];
      ctx.answerCbQuery(); ctx.reply('✅ کارمزد حذف شد.');
    } else {
      s.step = 'waiting_value';
      ctx.answerCbQuery(); ctx.reply('مقدار کارمزد را وارد کنید:');
    }
  });

}; // پایان تابع registerAdminHandlers
