// handlers/registration.js
const texts = require('../texts');
const { sessions, showMainMenu } = require('../utils');
const { pool, getUser, createUser, updateUser, getSetting, checkMembership, getRequiredChannels } = require('../db');
const { ADMIN_IDS } = require('../constants');
const { checkAndGrantBonuses } = require('./bonusEngine');

module.exports = function registerRegistrationHandlers(bot) {

  // ============================================
  // استارت و ورود به ربات
  // ============================================
  bot.start(async (ctx) => {
    const userId = ctx.from.id;
    let user = await getUser(userId);
    const referrerId = ctx.startPayload || null;

    // اگر کاربر جدید است، با زبان null بساز تا صفحه انتخاب زبان بیاد
    if (!user) {
      await createUser(userId, null, null, null, null, referrerId); // زبان = null
      user = await getUser(userId);

      // اگر با لینک دعوت آمده، بونوس دعوت برای دعوت‌کننده
      if (referrerId) {
        try {
          await checkAndGrantBonuses(ctx, referrerId, 'referral');
        } catch (e) { console.log('خطا در بونوس دعوت:', e.message); }
      }
    }

    // اولویت اول: اگر زبان انتخاب نشده، صفحه انتخاب زبان
    if (!user || !user.language) {
      return ctx.reply(
        '🌐 زبان خود را انتخاب کنید / Please choose your language:\n\n' +
        '🇮🇷 فارسی | 🇬🇧 English | 🇹🇷 Türkçe',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🇮🇷 فارسی', callback_data: 'lang_fa' }, { text: '🇬🇧 English', callback_data: 'lang_en' }],
              [{ text: '🇹🇷 Türkçe', callback_data: 'lang_tr' }]
            ]
          }
        }
      );
    }

    // اگر زبان دارد ولی هنوز قوانین/عضویت کامل نشده (مثلاً phone یا full_name خالی) → قوانین
    if (user.language && (user.phone === null || user.full_name === null)) {
      return showRules(ctx, user.language);
    }

    // در غیر این صورت کاربر کامل شده و مستقیم به منوی اصلی
    showMainMenu(ctx);
  });

  // ============================================
  // انتخاب زبان
  // ============================================
  bot.action(/^lang_(fa|en|tr)$/, async (ctx) => {
    const lang = ctx.match[1];
    const userId = ctx.from.id;

    await pool.query('UPDATE users SET language = $1 WHERE telegram_id = $2', [lang, String(userId)]);
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    return showRules(ctx, lang);
  });

  // ============================================
  // نمایش قوانین و درخواست عضویت در کانال
  // ============================================
  async function showRules(ctx, lang) {
    const forceJoinEnabled = await getSetting('force_join_enabled', 'true');
    const channels = await getRequiredChannels();

    const rulesMessages = {
      fa: {
        rules: `👑 به صرافی ووچینو⁰¹ خوش آمدید
🎁 برای کاربران ووچینو⁰¹، یک هدیه ویژه با امکان دریافت مجدد در نظر گرفته‌ایم.
💳 خرید انواع ووچر در کمتر از ۳۰ ثانیه
🎁 بهره‌مندی از بونوس‌های ویژه کاربران
🔐 بدون احراز هویت تا سقف ۲ میلیون تومان در روز

👇 برای ورود، ابتدا در کانال عضو شوید.`,
        joinButton: '📢 عضویت در کانال',
        joinedButton: '✅ عضو شدم',
      },
      en: {
        rules: `👑 Welcome to Vochino⁰¹ Exchange
🎁 A special gift with recharge possibility for users.
💳 Buy all vouchers in under 30 seconds
🎁 Exclusive bonuses for users
🔐 No verification up to 2M Tomans per day

👇 Join the channel first to enter.`,
        joinButton: '📢 Join Channel',
        joinedButton: '✅ Joined',
      },
      tr: {
        rules: `👑 Vochino⁰¹ Borsasına Hoşgeldiniz
🎁 Özel hediye ve yeniden alım imkanı.
💳 30 saniyeden kısa sürede voucher alımı
🎁 Özel bonuslar
🔐 Günlük 2 milyon Toman'a kadar kimlik doğrulamasız

👇 Giriş için önce kanala katılın.`,
        joinButton: '📢 Kanala Katıl',
        joinedButton: '✅ Katıldım',
      }
    };

    const m = rulesMessages[lang] || rulesMessages.fa;

    if (forceJoinEnabled === 'true' && channels.length > 0) {
      const channel = channels[0];
      return ctx.reply(m.rules, {
        reply_markup: {
          inline_keyboard: [
            [{ text: m.joinButton, url: channel.invite_link }],
            [{ text: m.joinedButton, callback_data: 'check_join' }]
          ]
        }
      });
    }

    // اگر جوین اجباری غیرفعال باشد، مستقیم دکمه پذیرش قوانین
    return ctx.reply(m.rules, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ قوانین را می‌پذیرم', callback_data: 'accept_rules' }]
        ]
      }
    });
  }

  // ============================================
  // دکمه "عضو شدم" – بررسی عضویت
  // ============================================
  bot.action('check_join', async (ctx) => {
    const userId = ctx.from.id;
    const user = await getUser(userId);
    const lang = user?.language || 'fa';

    const isMember = await checkMembership(ctx);
    if (!isMember) {
      return ctx.answerCbQuery('❌ شما هنوز عضو کانال نشده‌اید!', { show_alert: true });
    }

    ctx.answerCbQuery('✅ عضویت تأیید شد');
    try { await ctx.deleteMessage(); } catch (e) {}

    const acceptTexts = {
      fa: '📜 لطفاً قوانین را مطالعه کرده و تأیید کنید:',
      en: '📜 Please read and accept the rules:',
      tr: '📜 Lütfen kuralları okuyup onaylayın:'
    };

    ctx.reply(acceptTexts[lang] + '\n\n' + (texts[lang]?.rulesText || texts.fa.rulesText), {
      reply_markup: {
        inline_keyboard: [
          [{ text: texts[lang]?.confirmRulesButton || texts.fa.confirmRulesButton, callback_data: 'accept_rules' }]
        ]
      }
    });
  });

  // ============================================
  // پذیرش قوانین → ورود به منوی اصلی (کاربر مهمان)
  // ============================================
  bot.action('accept_rules', async (ctx) => {
    const userId = ctx.from.id;
    const user = await getUser(userId);
    const lang = user?.language || 'fa';

    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    // بونوس ثبت‌نام (فقط در صورت فعال بودن تنظیمات)
    await checkAndGrantBonuses(ctx, userId, 'registration');

    // نمایش منوی اصلی
    showMainMenu(ctx);
  });

};
