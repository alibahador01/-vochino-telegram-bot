// handlers/adminBonus.js
const { sessions } = require('../utils');
const { pool, setSetting, getSetting } = require('../db');
const { ADMIN_IDS } = require('../constants');

function isAdmin(telegramId) {
  return ADMIN_IDS.includes(Number(telegramId));
}

module.exports = function registerAdminBonusHandlers(bot) {

  bot.action('admin_bonus_settings', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const buyBonusActive = (await getSetting('bonus_first_purchase_active', 'false')) === 'true';
    const buyMinAmount = await getSetting('bonus_first_purchase_min_amount', '0');
    const buyGift = await getSetting('bonus_first_purchase_gift', '0');
    const regBonusActive = (await getSetting('bonus_registration_active', 'false')) === 'true';
    const regGift = await getSetting('bonus_registration_gift', '0');
    const refBonusActive = (await getSetting('bonus_referral_active', 'false')) === 'true';
    const refThreshold = await getSetting('bonus_referral_threshold', '1');
    const refGift = await getSetting('bonus_referral_gift', '0');
    const refPercentActive = (await getSetting('bonus_referral_percent_active', 'false')) === 'true';
    const refPercent = await getSetting('bonus_referral_percent', '0');

    let msg = '🎁 **تنظیمات بونوس‌ها**\n\n';
    msg += `🛍 **بونوس اولین خرید**\n`;
    msg += `✅ فعال: ${buyBonusActive ? 'بله' : 'خیر'}\n`;
    msg += `📉 حداقل مبلغ خرید: ${Number(buyMinAmount).toLocaleString()} تومان\n`;
    msg += `🎁 مبلغ هدیه: ${Number(buyGift).toLocaleString()} تومان\n\n`;
    msg += `👤 **بونوس ثبت‌نام**\n`;
    msg += `✅ فعال: ${regBonusActive ? 'بله' : 'خیر'}\n`;
    msg += `🎁 مبلغ هدیه: ${Number(regGift).toLocaleString()} تومان\n\n`;
    msg += `👥 **بونوس دعوت (مبلغ ثابت)**\n`;
    msg += `✅ فعال: ${refBonusActive ? 'بله' : 'خیر'}\n`;
    msg += `🔢 هر ${refThreshold} دعوت\n`;
    msg += `🎁 مبلغ هدیه: ${Number(refGift).toLocaleString()} تومان\n\n`;
    msg += `♾️ **طرح سود مادام‌العمر (درصدی)**\n`;
    msg += `✅ فعال: ${refPercentActive ? 'بله' : 'خیر'}\n`;
    msg += `📈 درصد سود: ${refPercent}٪`;

    ctx.reply(msg, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🛍 بونوس خرید اول', callback_data: 'admin_bonus_set_buy' }],
          [{ text: '👤 بونوس ثبت‌نام', callback_data: 'admin_bonus_set_reg' }],
          [{ text: '👥 بونوس دعوت (مبلغ ثابت)', callback_data: 'admin_bonus_set_ref' }],
          [{ text: '♾️ سود مادام‌العمر (درصدی)', callback_data: 'admin_bonus_set_ref_percent' }],
          [{ text: '🔙 بازگشت', callback_data: 'menu_admin_panel' }]
        ]
      }
    });
  });

  // ----------------- بونوس اولین خرید -----------------
  bot.action('admin_bonus_set_buy', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_bonus_buy', step: 'choose', lang: 'fa' };
    ctx.reply('🛍 **بونوس اولین خرید**\n\nگزینه مورد نظر:', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 فعال/غیرفعال کردن', callback_data: 'bonus_buy_toggle' }],
          [{ text: '📉 حداقل مبلغ خرید', callback_data: 'bonus_buy_set_min' }],
          [{ text: '🎁 مبلغ هدیه', callback_data: 'bonus_buy_set_gift' }],
          [{ text: '🔙 برگشت', callback_data: 'admin_bonus_settings' }]
        ]
      }
    });
  });

  bot.action('bonus_buy_toggle', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const cur = (await getSetting('bonus_first_purchase_active', 'false')) === 'true';
    await setSetting('bonus_first_purchase_active', cur ? 'false' : 'true');
    if (!cur) {
      await setSetting('bonus_first_purchase_activated_at', new Date().toISOString());
    }
    ctx.answerCbQuery();
    ctx.reply(`✅ بونوس خرید اول ${cur ? 'غیرفعال' : 'فعال'} شد.`);
  });

  bot.action('bonus_buy_set_min', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_bonus_buy_min', step: 'waiting_value' };
    ctx.reply('📉 حداقل مبلغ خرید (تومان) را وارد کنید:');
  });

  bot.action('bonus_buy_set_gift', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_bonus_buy_gift', step: 'waiting_value' };
    ctx.reply('🎁 مبلغ هدیه (تومان) را وارد کنید:');
  });

  // ----------------- بونوس ثبت‌نام -----------------
  bot.action('admin_bonus_set_reg', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_bonus_reg', step: 'choose', lang: 'fa' };
    ctx.reply('👤 **بونوس ثبت‌نام**\n\nگزینه مورد نظر:', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 فعال/غیرفعال', callback_data: 'bonus_reg_toggle' }],
          [{ text: '🎁 مبلغ هدیه', callback_data: 'bonus_reg_set_gift' }],
          [{ text: '🔙 برگشت', callback_data: 'admin_bonus_settings' }]
        ]
      }
    });
  });

  bot.action('bonus_reg_toggle', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const cur = (await getSetting('bonus_registration_active', 'false')) === 'true';
    await setSetting('bonus_registration_active', cur ? 'false' : 'true');
    if (!cur) {
      await setSetting('bonus_registration_activated_at', new Date().toISOString());
    }
    ctx.answerCbQuery();
    ctx.reply(`✅ بونوس ثبت‌نام ${cur ? 'غیرفعال' : 'فعال'} شد.`);
  });

  bot.action('bonus_reg_set_gift', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_bonus_reg_gift', step: 'waiting_value' };
    ctx.reply('🎁 مبلغ هدیه (تومان) را وارد کنید:');
  });

  // ----------------- بونوس دعوت -----------------
  bot.action('admin_bonus_set_ref', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_bonus_ref', step: 'choose', lang: 'fa' };
    ctx.reply('👥 **بونوس دعوت**\n\nگزینه مورد نظر:', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 فعال/غیرفعال', callback_data: 'bonus_ref_toggle' }],
          [{ text: '🔢 تعداد دعوت لازم', callback_data: 'bonus_ref_set_threshold' }],
          [{ text: '🎁 مبلغ هدیه', callback_data: 'bonus_ref_set_gift' }],
          [{ text: '🔙 برگشت', callback_data: 'admin_bonus_settings' }]
        ]
      }
    });
  });

  bot.action('bonus_ref_toggle', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const cur = (await getSetting('bonus_referral_active', 'false')) === 'true';
    await setSetting('bonus_referral_active', cur ? 'false' : 'true');
    if (!cur) {
      await setSetting('bonus_referral_activated_at', new Date().toISOString());
    }
    ctx.answerCbQuery();
    ctx.reply(`✅ بونوس دعوت ${cur ? 'غیرفعال' : 'فعال'} شد.`);
  });

  bot.action('bonus_ref_set_threshold', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_bonus_ref_threshold', step: 'waiting_value' };
    ctx.reply('🔢 هر چند دعوت یک بونوس تعلق بگیرد؟ (عدد وارد کنید)');
  });

  bot.action('bonus_ref_set_gift', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_bonus_ref_gift', step: 'waiting_value' };
    ctx.reply('🎁 مبلغ هدیه (تومان) را وارد کنید:');
  });

  // ----------------- طرح سود مادام‌العمر (درصدی) -----------------
  bot.action('admin_bonus_set_ref_percent', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    const active = (await getSetting('bonus_referral_percent_active', 'false')) === 'true';
    const percent = await getSetting('bonus_referral_percent', '0');
    ctx.reply(
      `♾️ **طرح سود مادام‌العمر**\n\n✅ فعال: ${active ? 'بله' : 'خیر'}\n📈 درصد فعلی: ${percent}٪\n\n` +
      `ℹ️ با هر خرید موفقِ کاربر دعوت‌شده، این درصد از مبلغ خرید مستقیم به کیف پول (موجودی اصلی) دعوت‌کننده واریز می‌شود.`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 فعال/غیرفعال', callback_data: 'bonus_ref_percent_toggle' }],
            [{ text: '📈 تنظیم درصد سود', callback_data: 'bonus_ref_percent_set' }],
            [{ text: '🔙 برگشت', callback_data: 'admin_bonus_settings' }]
          ]
        }
      }
    );
  });

  bot.action('bonus_ref_percent_toggle', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const cur = (await getSetting('bonus_referral_percent_active', 'false')) === 'true';
    await setSetting('bonus_referral_percent_active', cur ? 'false' : 'true');
    ctx.answerCbQuery();
    ctx.reply(`✅ طرح سود مادام‌العمر ${cur ? 'غیرفعال' : 'فعال'} شد.`);
  });

  bot.action('bonus_ref_percent_set', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'admin_bonus_ref_percent', step: 'waiting_value' };
    ctx.reply('📈 درصد سود را وارد کنید (فقط عدد، مثلاً 5 برای ۵٪):');
  });

  // پردازش مقادیر
  bot.on('text', async (ctx, next) => {
    const session = sessions[ctx.from.id];
    if (!session) return next();

    if (session.flow === 'admin_bonus_buy_min' && session.step === 'waiting_value') {
      const val = parseInt(ctx.message.text.replace(/[^0-9]/g, ''));
      if (isNaN(val) || val < 0) return ctx.reply('❌ عدد نامعتبر.');
      await setSetting('bonus_first_purchase_min_amount', String(val));
      delete sessions[ctx.from.id];
      ctx.reply('✅ حداقل مبلغ خرید برای بونوس تنظیم شد.');
      return;
    }
    if (session.flow === 'admin_bonus_buy_gift' && session.step === 'waiting_value') {
      const val = parseInt(ctx.message.text.replace(/[^0-9]/g, ''));
      if (isNaN(val) || val <= 0) return ctx.reply('❌ عدد نامعتبر.');
      await setSetting('bonus_first_purchase_gift', String(val));
      delete sessions[ctx.from.id];
      ctx.reply('✅ مبلغ هدیه تنظیم شد.');
      return;
    }
    if (session.flow === 'admin_bonus_reg_gift' && session.step === 'waiting_value') {
      const val = parseInt(ctx.message.text.replace(/[^0-9]/g, ''));
      if (isNaN(val) || val <= 0) return ctx.reply('❌ عدد نامعتبر.');
      await setSetting('bonus_registration_gift', String(val));
      delete sessions[ctx.from.id];
      ctx.reply('✅ مبلغ هدیه تنظیم شد.');
      return;
    }
    if (session.flow === 'admin_bonus_ref_threshold' && session.step === 'waiting_value') {
      const val = parseInt(ctx.message.text.replace(/[^0-9]/g, ''));
      if (isNaN(val) || val <= 1) return ctx.reply('❌ حداقل ۲ وارد کنید.');
      await setSetting('bonus_referral_threshold', String(val));
      delete sessions[ctx.from.id];
      ctx.reply('✅ تعداد دعوت لازم تنظیم شد.');
      return;
    }
    if (session.flow === 'admin_bonus_ref_gift' && session.step === 'waiting_value') {
      const val = parseInt(ctx.message.text.replace(/[^0-9]/g, ''));
      if (isNaN(val) || val <= 0) return ctx.reply('❌ عدد نامعتبر.');
      await setSetting('bonus_referral_gift', String(val));
      delete sessions[ctx.from.id];
      ctx.reply('✅ مبلغ هدیه تنظیم شد.');
      return;
    }
    if (session.flow === 'admin_bonus_ref_percent' && session.step === 'waiting_value') {
      const val = parseFloat(ctx.message.text.replace(/[^0-9.]/g, ''));
      if (isNaN(val) || val <= 0 || val > 100) return ctx.reply('❌ عدد نامعتبر (بین ۰ تا ۱۰۰ وارد کنید).');
      await setSetting('bonus_referral_percent', String(val));
      delete sessions[ctx.from.id];
      ctx.reply('✅ درصد سود مادام‌العمر تنظیم شد.');
      return;
    }

    return next();
  });
};
