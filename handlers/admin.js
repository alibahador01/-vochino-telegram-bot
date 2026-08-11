// handlers/admin.js
const texts = require('../texts');
const { sessions, fillTemplate, sendBroadcast, sendBroadcastWithPhoto, sendMessageToUser } = require('../utils');
const { pool, getUser, getUserById, getAllUsers, getUsdRate, getSetting, setSetting,
  getAllApiSources, getApiSourceById, addApiSource, updateApiSource, deleteApiSource,
  getProductApiLinks, getAllProductApiLinks, addProductApiLink, updateProductApiLink, removeProductApiLink,
  getAllBotTexts, searchBotTexts, updateBotText, getBotTextCategories
} = require('../db');
const { getAllCategories, getTextInfo, getTextsByCategory, searchTextsInCache, validatePlaceholders, refreshText, formatTextForDisplay } = require('../textManager');
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
            [{ text: '🔙 بازگشت به منوی اصلی', callback_data: 'back_main_menu' }]
          ]
        }
      }
    );
  });

  // ============================================
  // مدیریت متن‌های ربات (جدید)
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

    const buttons = categories.map(cat => {
      return [{ text: cat, callback_data: 'admin_texts_category_' + cat }];
    });
    buttons.push([{ text: '🔍 جستجوی متن', callback_data: 'admin_texts_search' }]);
    buttons.push([{ text: '🔙 بازگشت به پنل مدیریت', callback_data: 'menu_admin_panel' }]);

    ctx.reply(message, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } });
  });

  // نمایش متن‌های یک دسته
  bot.action(/^admin_texts_category_(.+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const category = ctx.match[1];
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const textsList = getTextsByCategory(category);
    if (textsList.length === 0) {
      ctx.reply('❌ هیچ متنی در این دسته یافت نشد.');
      return;
    }

    let message = `📝 **متون دسته: ${category}**\n\n`;
    const buttons = [];

    textsList.forEach((t, i) => {
      message += `${i + 1}. \`${t.key}\`\n`;
      // نمایش خلاصه (حداکثر ۶۰ کاراکتر)
      const shortValue = t.value.length > 60 ? t.value.substring(0, 60) + '...' : t.value;
      message += `   ${shortValue}\n\n`;
      buttons.push([{ text: `✏️ ${t.key}`, callback_data: 'admin_texts_edit_' + t.key }]);
    });

    buttons.push([{ text: '🔙 بازگشت به دسته‌بندی‌ها', callback_data: 'admin_bot_texts' }]);

    ctx.reply(message, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } });
  });

  // جستجوی متن
  bot.action('admin_texts_search', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    sessions[ctx.from.id] = {
      flow: 'admin_texts_search',
      step: 'waiting_search_term',
      lang: 'fa'
    };

    ctx.reply('🔍 **جستجوی متن**\n\nلطفاً کلیدواژه مورد نظر را وارد کنید:');
  });

  // ویرایش یک متن
  bot.action(/^admin_texts_edit_(.+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const key = ctx.match[1];
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const textInfo = getTextInfo(key);
    if (!textInfo) {
      ctx.reply('❌ متن مورد نظر یافت نشد.');
      return;
    }

    // نمایش متن فعلی با placeholder های علامت‌گذاری‌شده
    const displayText = formatTextForDisplay(textInfo.value);
    let message = `✏️ **ویرایش متن**\n\n`;
    message += `🔑 **کلید:** \`${key}\`\n`;
    message += `📂 **دسته:** ${textInfo.category}\n\n`;
    message += `📝 **متن فعلی:**\n${displayText}\n\n`;
    
    if (textInfo.placeholders.length > 0) {
      message += `🔒 **Placeholder های ثابت (نباید حذف شوند):**\n`;
      textInfo.placeholders.forEach(p => {
        message += `• {${p}}\n`;
      });
      message += `\n⚠️ این مقادیر به‌صورت خودکار جایگزین می‌شوند.`;
    }

    message += `\n\n✍️ **متن جدید کامل را (همراه با placeholder ها) ارسال کنید:**`;

    sessions[ctx.from.id] = {
      flow: 'admin_texts_edit',
      step: 'waiting_new_text',
      lang: 'fa',
      data: {
        key: key,
        oldValue: textInfo.value
      }
    };

    ctx.reply(message, { parse_mode: 'Markdown' });
  });

  // پردازش متن‌های ورودی ادمین (بخش مدیریت متن‌ها)
  bot.on('text', async (ctx, next) => {
    if (!isAdmin(ctx.from.id)) return next();
    const session = sessions[ctx.from.id];
    if (!session) return next();

    // ==================== مدیریت متن‌ها ====================
    
    // جستجوی متن
    if (session.flow === 'admin_texts_search' && session.step === 'waiting_search_term') {
      const term = ctx.message.text.trim();
      if (term.length < 2) {
        return ctx.reply('❌ حداقل ۲ کاراکتر وارد کنید.');
      }

      const results = searchTextsInCache(term);
      if (results.length === 0) {
        ctx.reply('❌ هیچ متنی با این کلیدواژه یافت نشد.');
        delete sessions[ctx.from.id];
        return;
      }

      let message = `🔍 **نتایج جستجو برای "${term}"**\n\n`;
      const buttons = [];

      results.forEach((r, i) => {
        message += `${i + 1}. \`${r.key}\` [${r.category}]\n`;
        const short = r.value.length > 50 ? r.value.substring(0, 50) + '...' : r.value;
        message += `   ${short}\n\n`;
        buttons.push([{ text: `✏️ ${r.key}`, callback_data: 'admin_texts_edit_' + r.key }]);
      });

      buttons.push([{ text: '🔙 بازگشت', callback_data: 'admin_bot_texts' }]);
      delete sessions[ctx.from.id];
      ctx.reply(message, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } });
      return;
    }

    // ویرایش متن - دریافت متن جدید
    if (session.flow === 'admin_texts_edit' && session.step === 'waiting_new_text') {
      const newText = ctx.message.text.trim();
      const { key, oldValue } = session.data;

      // بررسی صحت placeholder ها
      const validation = validatePlaceholders(oldValue, newText);
      if (!validation.valid) {
        let errorMsg = '❌ **خطا: placeholder های زیر در متن جدید وجود ندارند:**\n';
        validation.missing.forEach(p => {
          errorMsg += `• 🔒{${p}}\n`;
        });
        errorMsg += '\n⚠️ لطفاً متن را با حفظ این placeholder ها دوباره ارسال کنید.';
        return ctx.reply(errorMsg, { parse_mode: 'Markdown' });
      }

      if (validation.extra.length > 0) {
        let warnMsg = '⚠️ **هشدار: placeholder های جدیدی اضافه کردید:**\n';
        validation.extra.forEach(p => {
          warnMsg += `• {${p}}\n`;
        });
        warnMsg += '\nاگر مطمئن هستید، دوباره همان متن را ارسال کنید.';
        return ctx.reply(warnMsg);
      }

      // ذخیره متن
      const result = await refreshText(key, newText);
      if (result.success) {
        delete sessions[ctx.from.id];
        ctx.reply(`✅ **متن با موفقیت به‌روز شد!**\n\n🔑 کلید: \`${key}\`\n📝 متن جدید:\n${newText}`, { parse_mode: 'Markdown' });
      } else {
        ctx.reply('❌ خطا در ذخیره متن: ' + result.error);
      }
      return;
    }

    // ==================== سایر بخش‌های admin (بدون تغییر) ====================
    return next();
  });

  // ... (بقیه کدهای admin.js از اینجا به بعد دقیقاً مانند قبل هستند)
  // تمام بخش‌های مدیریت کانال، کوپن، محصولات، صرافی‌ها، اتصالات، 
  // ارسال همگانی/مخفی، هدیه، تنظیمات، سفارشات، تأیید/رد، آمار، جستجو
  // بدون هیچ تغییری باید اینجا باشند

  // ⚠️ به دلیل طولانی‌شدن فایل، ادامه کد در پیام بعدی ارسال می‌شود
  // لطفاً بخش دوم را دریافت کرده و به انتهای همین فایل اضافه کن
};
  // ============================================
  // ادامه پردازش متن‌های ورودی ادمین
  // ============================================
  bot.on('text', async (ctx, next) => {
    if (!isAdmin(ctx.from.id)) return next();
    const session = sessions[ctx.from.id];
    if (!session) return next();

    // ---------- افزودن کانال ----------
    if (session.flow === 'admin_add_channel') {
      if (session.step === 'waiting_chat_id') {
        const chatId = ctx.message.text.trim();
        if (!chatId.startsWith('-')) return ctx.reply('❌ آیدی کانال باید با `-` شروع شود.');
        session.chatId = chatId;
        session.step = 'waiting_invite_link';
        return ctx.reply('✅ آیدی ثبت شد.\nلطفاً **لینک دعوت** را وارد کنید:');
      }
      else if (session.step === 'waiting_invite_link') {
        const inviteLink = ctx.message.text.trim();
        const chatId = session.chatId;
        try {
          await pool.query(
            `INSERT INTO required_channels (chat_id, invite_link, title, active, force_join_enabled)
             VALUES ($1,$2,$3,1,1) ON CONFLICT (chat_id) DO UPDATE SET invite_link=$2, active=1`,
            [chatId, inviteLink, 'کانال ' + chatId]
          );
          delete sessions[ctx.from.id];
          ctx.reply('✅ کانال اضافه شد.');
        } catch (err) { ctx.reply('❌ خطا: ' + err.message); }
        return;
      }
    }

    // ---------- تنظیم نرخ دلار ----------
    if (session.flow === 'admin_set_rate' && session.step === 'waiting_value') {
      const value = parseInt(ctx.message.text.replace(/[^0-9]/g, ''));
      if (!value || value <= 0) return ctx.reply('❌ عدد معتبر وارد کنید.');
      await setSetting('usd_rate', String(value));
      delete sessions[ctx.from.id];
      ctx.reply('✅ نرخ دلار به ' + value.toLocaleString() + ' تومان تغییر یافت.');
      return;
    }

    // ---------- تنظیم ایموجی ----------
    if (session.flow === 'admin_set_reaction' && session.step === 'waiting_value') {
      const emoji = ctx.message.text.trim();
      if (!emoji) return ctx.reply('❌ ایموجی نامعتبر.');
      await setSetting('start_reaction', emoji);
      delete sessions[ctx.from.id];
      ctx.reply('✅ ایموجی به ' + emoji + ' تغییر یافت.');
      return;
    }

    // ---------- ارسال همگانی ----------
    if (session.flow === 'admin_broadcast') {
      if (session.step === 'waiting_text') {
        const text = ctx.message.text;
        const allUsers = await getAllUsers(true);
        if (allUsers.length === 0) { delete sessions[ctx.from.id]; return ctx.reply('❌ کاربری نیست.'); }
        const msg = await ctx.reply('📢 در حال ارسال...');
        const results = await sendBroadcast(bot, allUsers.map(u => u.telegram_id), text, { parse_mode: 'HTML' });
        const ok = results.filter(r => r.success).length;
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `✅ ارسال شد.\nموفق: ${ok}\nناموفق: ${results.length - ok}`);
        delete sessions[ctx.from.id]; return;
      }
      if (session.step === 'waiting_caption' && session.data.photo) {
        const caption = ctx.message.text;
        const allUsers = await getAllUsers(true);
        const msg = await ctx.reply('📢 در حال ارسال با عکس...');
        const results = await sendBroadcastWithPhoto(bot, allUsers.map(u => u.telegram_id), session.data.photo, caption, { parse_mode: 'HTML' });
        const ok = results.filter(r => r.success).length;
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `✅ ارسال شد.\nموفق: ${ok}`);
        delete sessions[ctx.from.id]; return;
      }
    }

    // ---------- ارسال مخفی ----------
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
        const result = await sendBroadcast(bot, [session.targetId], text, { parse_mode: 'HTML' }, true);
        if (result[0].success) ctx.reply('✅ ارسال شد.'); else ctx.reply('❌ خطا: ' + result[0].error);
        delete sessions[ctx.from.id]; return;
      }
      if (session.step === 'waiting_caption' && session.data.photo) {
        const caption = ctx.message.text;
        const result = await sendBroadcastWithPhoto(bot, [session.targetId], session.data.photo, caption, { parse_mode: 'HTML' }, true);
        if (result[0].success) ctx.reply('✅ ارسال شد.'); else ctx.reply('❌ خطا.');
        delete sessions[ctx.from.id]; return;
      }
    }

    // ---------- افزودن کوپن ----------
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

    // ---------- غیرفعال کردن کوپن ----------
    if (session.flow === 'admin_disable_coupon' && session.step === 'waiting_code') {
      const code = ctx.message.text.trim().toUpperCase();
      const res = await pool.query('UPDATE coupons SET active = 0 WHERE code = $1 RETURNING code', [code]);
      if (res.rows.length === 0) return ctx.reply('❌ یافت نشد.');
      delete sessions[ctx.from.id];
      ctx.reply(`✅ ${code} غیرفعال شد.`);
      return;
    }

    // ---------- افزودن محصول خرید گام‌به‌گام ----------
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
            `INSERT INTO products (key, name, min_amount, price_type, active, created_at)
             VALUES ($1,$2,$3,$4,1,NOW()) ON CONFLICT (key) DO UPDATE SET name=$2, min_amount=$3, price_type=$4, active=1`,
            [key, finalName, minAmount, priceType]
          );
          delete sessions[ctx.from.id];
          ctx.reply('✅ محصول اضافه شد.');
        } catch (err) { ctx.reply('❌ خطا: ' + err.message); }
        return;
      }
    }

    // ---------- افزودن محصول فروش ----------
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
            `INSERT INTO sell_products (key, name, unit_price, sample_code, active, created_at)
             VALUES ($1,$2,$3,$4,1,NOW()) ON CONFLICT (key) DO UPDATE SET name=$2, unit_price=$3, sample_code=$4, active=1`,
            [key, name, unitPrice, sampleCode]
          );
          delete sessions[ctx.from.id];
          ctx.reply('✅ محصول فروش اضافه شد.');
        } catch (err) { ctx.reply('❌ خطا: ' + err.message); }
        return;
      }
    }

    // ---------- کارمزد محصولات ----------
    if (session.flow === 'admin_commission_product_buy' && session.step === 'waiting_value') {
      const val = parseFloat(ctx.message.text.replace(/[^0-9.]/g, ''));
      if (isNaN(val) || val < 0) return ctx.reply('❌ عدد معتبر وارد کنید.');
      await pool.query('UPDATE products SET commission_type=$1, commission_value=$2 WHERE key=$3', [session.data.commType, val, session.data.productKey]);
      delete sessions[ctx.from.id];
      ctx.reply('✅ کارمزد تنظیم شد.');
      return;
    }
    if (session.flow === 'admin_commission_product_sell' && session.step === 'waiting_value') {
      const val = parseFloat(ctx.message.text.replace(/[^0-9.]/g, ''));
      if (isNaN(val) || val < 0) return ctx.reply('❌ عدد معتبر وارد کنید.');
      await pool.query('UPDATE sell_products SET commission_type=$1, commission_value=$2 WHERE key=$3', [session.data.commType, val, session.data.productKey]);
      delete sessions[ctx.from.id];
      ctx.reply('✅ کارمزد تنظیم شد.');
      return;
    }

    // ---------- هدیه ----------
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
        const userIds = session.userIds;
        let success = 0;
        for (const id of userIds) {
          try {
            await pool.query('UPDATE users SET balance = balance + $1 WHERE telegram_id = $2', [amount, id]);
            success++;
            const user = await getUserById(id);
            if (user) {
              const giftMsg = '✨ یه سورپرایز کوچیک...\n🎁 هدیه ' + amount.toLocaleString() + ' تومانی به کیف پولت اضافه شد.\nاز طرف مدیریت ووچینو⁰¹🎗';
              await sendMessageToUser(bot, id, giftMsg);
            }
          } catch (e) {}
        }
        delete sessions[ctx.from.id];
        ctx.reply(`✅ هدیه به ${success} نفر ارسال شد.`);
        return;
      }
    }

    // ---------- افزودن صرافی ----------
    if (session.flow === 'admin_add_api_source') {
      if (session.step === 'waiting_name') {
        session.data.name = ctx.message.text.trim();
        session.step = 'waiting_type';
        return ctx.reply('نوع صرافی (voucher, crypto, star, gift, filter, multi):');
      }
      if (session.step === 'waiting_type') {
        session.data.type = ctx.message.text.trim();
        session.step = 'waiting_base_url';
        return ctx.reply('آدرس base_url:');
      }
      if (session.step === 'waiting_base_url') {
        session.data.base_url = ctx.message.text.trim();
        session.step = 'waiting_api_key';
        return ctx.reply('API Key:');
      }
      if (session.step === 'waiting_api_key') {
        session.data.api_key = ctx.message.text.trim();
        session.step = 'waiting_secret_key';
        return ctx.reply('Secret Key:');
      }
      if (session.step === 'waiting_secret_key') {
        session.data.secret_key = ctx.message.text.trim();
        session.step = 'waiting_priority';
        return ctx.reply('اولویت (عدد):');
      }
      if (session.step === 'waiting_priority') {
        const priority = parseInt(ctx.message.text.trim()) || 1;
        session.data.priority = priority;
        try {
          await addApiSource(session.data);
          delete sessions[ctx.from.id];
          ctx.reply('✅ صرافی اضافه شد.');
        } catch (err) { ctx.reply('❌ خطا: ' + err.message); }
        return;
      }
    }

    // ---------- ویرایش صرافی ----------
    if (session.flow === 'admin_edit_api_source') {
      if (session.step === 'waiting_field') {
        const field = ctx.message.text.trim().toLowerCase();
        if (!['name','type','base_url','api_key','secret_key','priority'].includes(field)) {
          return ctx.reply('❌ فیلد نامعتبر.');
        }
        session.editField = field;
        session.step = 'waiting_value';
        return ctx.reply(`مقدار جدید برای ${field}:`);
      }
      if (session.step === 'waiting_value') {
        const value = ctx.message.text.trim();
        const data = {};
        data[session.editField] = session.editField === 'priority' ? parseInt(value) || 1 : value;
        try {
          await updateApiSource(session.data.apiId, data);
          delete sessions[ctx.from.id];
          ctx.reply('✅ ویرایش شد.');
        } catch (err) { ctx.reply('❌ خطا: ' + err.message); }
        return;
      }
    }

    // ---------- اتصال محصول ----------
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

    // ---------- تغییر اولویت اتصال ----------
    if (session.flow === 'admin_edit_product_link' && session.step === 'waiting_link_id') {
      const linkId = parseInt(ctx.message.text.trim());
      if (isNaN(linkId)) return ctx.reply('❌ ID نامعتبر.');
      session.linkId = linkId;
      session.step = 'waiting_priority';
      return ctx.reply('اولویت جدید را وارد کنید:');
    }
    if (session.flow === 'admin_edit_product_link' && session.step === 'waiting_priority') {
      const newPriority = parseInt(ctx.message.text.trim());
      if (isNaN(newPriority)) return ctx.reply('❌ عدد معتبر وارد کنید.');
      try {
        await updateProductApiLink(session.linkId, { priority: newPriority });
        delete sessions[ctx.from.id];
        ctx.reply('✅ اولویت تغییر کرد.');
      } catch (err) { ctx.reply('❌ خطا.'); }
      return;
    }

    // ---------- حذف اتصال ----------
    if (session.flow === 'admin_remove_product_link' && session.step === 'waiting_link_id') {
      const linkId = parseInt(ctx.message.text.trim());
      if (isNaN(linkId)) return ctx.reply('❌ ID نامعتبر.');
      try {
        await removeProductApiLink(linkId);
        delete sessions[ctx.from.id];
        ctx.reply('✅ اتصال حذف شد.');
      } catch (err) { ctx.reply('❌ خطا.'); }
      return;
    }

    // ---------- تحویل کد ----------
    if (session.flow === 'admin_deliver_code' && session.step === 'waiting_code') {
      const deliveredCode = ctx.message.text.trim();
      const { orderId, telegramId, trackingCode } = session.data;
      await pool.query("UPDATE orders SET status='completed', delivered_code=$1 WHERE id=$2", [deliveredCode, orderId]);
      ctx.telegram.sendMessage(telegramId, `🎉 سفارش تحویل داده شد!\n🆔 ${trackingCode}\n📦 کد:\n${deliveredCode}`);
      delete sessions[ctx.from.id]; ctx.reply('✅ تحویل شد.'); return;
    }

    // ---------- رد با توضیح (کیف پول) ----------
    if (session.flow === 'admin_reject_reason' && session.step === 'waiting_reason') {
      const reason = ctx.message.text;
      const requestId = session.data.requestId;
      const req = (await pool.query('SELECT * FROM wallet_requests WHERE id=$1', [requestId])).rows[0];
      if (!req || req.status !== 'pending') { delete sessions[ctx.from.id]; return ctx.reply('قبلاً بررسی شده.'); }
      await pool.query("UPDATE wallet_requests SET status='rejected' WHERE id=$1", [requestId]);
      ctx.telegram.sendMessage(req.telegram_id, `❌ درخواست رد شد.\n📝 دلیل: ${reason}`);
      delete sessions[ctx.from.id]; ctx.reply('✅ رد شد.'); return;
    }

    // ---------- رد با توضیح (فروش) ----------
    if (session.flow === 'admin_sell_reject_reason' && session.step === 'waiting_reason') {
      const reason = ctx.message.text;
      const requestId = session.data.requestId;
      await pool.query("UPDATE sell_orders SET status='rejected' WHERE id=$1", [requestId]);
      const req = (await pool.query('SELECT * FROM sell_orders WHERE id=$1', [requestId])).rows[0];
      ctx.telegram.sendMessage(req.telegram_id, `❌ فروش رد شد.\n🆔 ${req.tracking_code}\n📝 ${reason}`);
      delete sessions[ctx.from.id]; ctx.reply('✅ رد شد.'); return;
    }

    // ---------- فروش - ورود مبلغ ----------
    if (session.flow === 'admin_sell_amount' && session.step === 'waiting_amount') {
      const amount = parseInt(ctx.message.text.replace(/[^0-9]/g, ''));
      if (!amount || amount <= 0) return ctx.reply('⚠️ مبلغ نامعتبر.');
      const requestId = session.data.requestId;
      const req = (await pool.query('SELECT * FROM sell_orders WHERE id=$1', [requestId])).rows[0];
      await pool.query('UPDATE users SET balance = balance + $1 WHERE telegram_id = $2', [amount, req.telegram_id]);
      await pool.query("UPDATE sell_orders SET status='approved', amount=$1 WHERE id=$2", [amount, requestId]);
      ctx.telegram.sendMessage(req.telegram_id, `✅ فروش تأیید شد.\n💰 ${amount.toLocaleString()} تومان به کیف پول اضافه شد.`);
      delete sessions[ctx.from.id]; ctx.reply('✅ تأیید شد.'); return;
    }

    // ---------- جستجوی کد پیگیری ----------
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
      delete sessions[ctx.from.id]; return;
    }

    // ---------- اطلاعات کاربر ----------
    if (session.flow === 'admin_userinfo' && session.step === 'waiting_id') {
      const targetId = ctx.message.text.trim();
      const user = await getUserById(targetId);
      if (!user) { ctx.reply('❌ کاربر یافت نشد.'); delete sessions[ctx.from.id]; return; }
      ctx.reply(`👤 **اطلاعات**\n🆔 ${user.telegram_id}\n👤 ${user.full_name||'-'}\n💰 ${Number(user.balance).toLocaleString()} تومان`);
      delete sessions[ctx.from.id]; return;
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
      session.step = 'waiting_caption';
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
    s.step = 'waiting_text'; ctx.answerCbQuery(); ctx.reply('📝 متن را ارسال کنید:');
  });
  bot.action('fake_with_photo', async (ctx) => {
    const s = sessions[ctx.from.id]; if (!s || s.flow !== 'admin_fake_broadcast') return;
    s.step = 'waiting_photo'; ctx.answerCbQuery(); ctx.reply('🖼 عکس را ارسال کنید:');
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
    const s = sessions[ctx.from.id];
    if (!s || s.flow !== 'admin_add_product_link') return;
    const apiId = ctx.match[1];
    const priority = 1;
    try {
      await addProductApiLink(s.data.productType, s.data.productKey, apiId, priority);
      delete sessions[ctx.from.id];
      ctx.answerCbQuery(); ctx.reply('✅ اتصال برقرار شد.');
    } catch (err) { ctx.reply('❌ خطا.'); }
  });

  // لیست محصولات
  bot.action('admin_list_products_buy', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    const res = await pool.query('SELECT * FROM products ORDER BY id ASC');
    if (res.rows.length === 0) return ctx.reply('📋 هیچ محصولی نیست.');
    let msg = '📋 **لیست خرید**\n\n';
    res.rows.forEach(p => msg += `🔹 ${p.name} (${p.key}) | حداقل: ${p.min_amount} ${p.price_type==='usd'?'دلار':'تومان'} | کارمزد: ${p.commission_type==='none'?'0':p.commission_value+(p.commission_type==='percentage'?'%':' تومان')} | ${p.active?'✅':'⛔️'}\n`);
    ctx.reply(msg, { parse_mode: 'Markdown' });
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
  // سفارشات خرید/فروش/کیف پول
  // ============================================
  bot.action('admin_buy_pending', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    const pending = (await pool.query("SELECT * FROM orders WHERE status='pending_delivery' ORDER BY id ASC")).rows;
    if (pending.length === 0) { ctx.reply('✅ سفارش خریدی در انتظار نیست.'); return; }
    for (const o of pending) {
      const u = await getUser(o.telegram_id);
      const p = (await pool.query('SELECT name FROM products WHERE key=$1', [o.product_type])).rows[0]?.name || o.product_type;
      let msg = `📦 خرید ${p}\n👤 ${u?.full_name||'---'}\n💰 ${Number(o.amount).toLocaleString()} تومان\n🆔 ${o.tracking_code}`;
      ctx.reply(msg, { reply_markup: { inline_keyboard: [[{ text: '📤 تحویل', callback_data: 'admin_deliver_'+o.id }], [{ text: '✅ تکمیل دستی', callback_data: 'admin_buy_complete_'+o.id }, { text: '❌ لغو', callback_data: 'admin_buy_cancel_'+o.id }]] } });
    }
  });
  bot.action('admin_sell_pending', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    const pending = (await pool.query("SELECT * FROM sell_orders WHERE status='pending_review' ORDER BY id ASC")).rows;
    if (pending.length === 0) { ctx.reply('✅ درخواست فروشی در انتظار نیست.'); return; }
    for (const s of pending) {
      const u = await getUser(s.telegram_id);
      const p = (await pool.query('SELECT name FROM sell_products WHERE key=$1', [s.product_type])).rows[0]?.name || s.product_type;
      let msg = `🎟 فروش ${p}\n👤 ${u?.full_name||'---'}\n🎫 ${s.voucher_code}\n🆔 ${s.tracking_code}`;
      ctx.reply(msg, { reply_markup: { inline_keyboard: [[{ text: '✅ تایید', callback_data: 'admin_sell_approve_'+s.id }], [{ text: '❌ رد', callback_data: 'admin_sell_reject_'+s.id }, { text: '✉️ رد با دلیل', callback_data: 'admin_sell_reject_reason_'+s.id }]] } });
    }
  });
  bot.action('admin_pending', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    const pending = (await pool.query("SELECT * FROM wallet_requests WHERE status='pending' ORDER BY id ASC")).rows;
    if (pending.length === 0) { ctx.reply('✅ درخواست کیف پولی نیست.'); return; }
    for (const w of pending) {
      const u = await getUser(w.telegram_id);
      let msg = `💰 ${w.type==='deposit'?'واریز':'برداشت'}\n👤 ${u?.full_name||'---'}\n💰 ${Number(w.amount).toLocaleString()} تومان`;
      if (w.type==='withdraw') msg += `\n💳 ${w.card_number}`;
      const btns = [[{ text: '✅ تایید', callback_data: 'admin_approve_'+w.id }, { text: '❌ رد', callback_data: 'admin_reject_'+w.id }], [{ text: '✉️ رد با دلیل', callback_data: 'admin_reject_reason_'+w.id }]];
      if (w.receipt_file_id) ctx.replyWithPhoto(w.receipt_file_id, { caption: msg, reply_markup: { inline_keyboard: btns } });
      else ctx.reply(msg, { reply_markup: { inline_keyboard: btns } });
    }
  });

  // تأیید/رد
  bot.action(/^admin_deliver_(\d+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const orderId = ctx.match[1];
    ctx.answerCbQuery();
    sessions[ctx.from.id] = { flow: 'admin_deliver_code', step: 'waiting_code', data: { orderId, telegramId: (await pool.query('SELECT * FROM orders WHERE id=$1', [orderId])).rows[0]?.telegram_id, trackingCode: (await pool.query('SELECT * FROM orders WHERE id=$1', [orderId])).rows[0]?.tracking_code } };
    ctx.reply('کد تحویل را وارد کنید:');
  });
  bot.action(/^admin_buy_complete_(\d+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const orderId = ctx.match[1];
    await pool.query("UPDATE orders SET status='completed' WHERE id=$1", [orderId]);
    ctx.answerCbQuery(); ctx.reply('✅ تکمیل شد.');
  });
  bot.action(/^admin_buy_cancel_(\d+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const orderId = ctx.match[1];
    const o = (await pool.query('SELECT * FROM orders WHERE id=$1', [orderId])).rows[0];
    if (!o) return;
    const refund = Number(o.amount) + Number(o.commission||0);
    await pool.query('UPDATE users SET balance = balance + $1 WHERE telegram_id = $2', [refund, o.telegram_id]);
    await pool.query("UPDATE orders SET status='cancelled' WHERE id=$1", [orderId]);
    ctx.telegram.sendMessage(o.telegram_id, `❌ سفارش لغو شد. ${refund.toLocaleString()} تومان بازگشت.`);
    ctx.answerCbQuery(); ctx.reply('✅ لغو شد.');
  });
  bot.action(/^admin_sell_approve_(\d+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const requestId = ctx.match[1];
    ctx.answerCbQuery();
    sessions[ctx.from.id] = { flow: 'admin_sell_amount', step: 'waiting_amount', data: { requestId } };
    ctx.reply('مبلغ نهایی فروش (تومان) را وارد کنید:');
  });
  bot.action(/^admin_sell_reject_(\d+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const requestId = ctx.match[1];
    await pool.query("UPDATE sell_orders SET status='rejected' WHERE id=$1", [requestId]);
    ctx.answerCbQuery(); ctx.reply('❌ رد شد.');
  });
  bot.action(/^admin_sell_reject_reason_(\d+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const requestId = ctx.match[1];
    ctx.answerCbQuery();
    sessions[ctx.from.id] = { flow: 'admin_sell_reject_reason', step: 'waiting_reason', data: { requestId } };
    ctx.reply('دلیل رد را بنویسید:');
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
    ctx.answerCbQuery(); ctx.reply('✅ تأیید شد.');
  });
  bot.action(/^admin_reject_(\d+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const reqId = ctx.match[1];
    await pool.query("UPDATE wallet_requests SET status='rejected' WHERE id=$1", [reqId]);
    const req = (await pool.query('SELECT * FROM wallet_requests WHERE id=$1', [reqId])).rows[0];
    ctx.telegram.sendMessage(req.telegram_id, `❌ درخواست رد شد.`);
    ctx.answerCbQuery(); ctx.reply('❌ رد شد.');
  });
  bot.action(/^admin_reject_reason_(\d+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const reqId = ctx.match[1];
    ctx.answerCbQuery();
    sessions[ctx.from.id] = { flow: 'admin_reject_reason', step: 'waiting_reason', data: { requestId: reqId } };
    ctx.reply('دلیل رد را بنویسید:');
  });

  // ============================================
  // آمار کاربران
  // ============================================
  bot.action('admin_stats', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
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
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_find', step: 'waiting_code', lang: 'fa' };
    ctx.reply('🔎 **جستجوی کد پیگیری**\n\nلطفاً کد پیگیری را وارد کنید:\nمثال: `VOC-847392` یا `#VCH_1024`', { parse_mode: 'Markdown' });
  });

  // ============================================
  // اطلاعات یک کاربر
  // ============================================
  bot.action('admin_userinfo', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_userinfo', step: 'waiting_id', lang: 'fa' };
    ctx.reply('👤 **اطلاعات یک کاربر**\n\nلطفاً آیدی عددی کاربر را وارد کنید:\nمثال: `8231962200`', { parse_mode: 'Markdown' });
  });

};
