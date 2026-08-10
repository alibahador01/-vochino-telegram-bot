// handlers/registration.js
const texts = require('../texts');
const { sessions } = require('../utils');
const { pool, getUser, createUser, updateUser, getSetting, checkMembership, getRequiredChannels } = require('../db');
const { ADMIN_IDS } = require('../constants');

module.exports = function registerRegistrationHandlers(bot) {

  // ============================================
  // استارت و ورود به ربات (سه‌زبانه)
  // ============================================
  bot.start(async (ctx) => {
    const userId = ctx.from.id;
    let user = await getUser(userId);

    // اگر کاربر جدید است، ایجاد کاربر خام
    if (!user) {
      const referrerId = ctx.startPayload || null;
      await createUser(userId, null, null, null, 'fa', referrerId);
      user = await getUser(userId);
    }

    // اگر کاربر زبان انتخاب نکرده، صفحه انتخاب زبان
    if (!user || !user.language) {
      return ctx.reply(
        '🌐 زبان خود را انتخاب کنید / Please choose your language:\n\n' +
        '🇮🇷 فارسی | 🇬🇧 English | 🇹🇷 Türkçe',
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🇮🇷 فارسی', callback_data: 'lang_fa' },
                { text: '🇬🇧 English', callback_data: 'lang_en' }
              ],
              [
                { text: '🇹🇷 Türkçe', callback_data: 'lang_tr' }
              ]
            ]
          }
        }
      );
    }

    // اگر زبان دارد ولی هنوز قوانین را نپذیرفته یا جوین را انجام نداده
    // کاربر جدید: نمایش قوانین و دکمه عضویت
    // (می‌توانی یک فیلد onboarding_completed در users داشته باشی؛ در حال حاضر با چک زبان پیش می‌رویم)
    if (user.language && user.phone === null && user.full_name === null) {
      // کاربر تازه زبان را انتخاب کرده و هنوز ثبت‌نام نکرده
      return showRules(ctx, user.language);
    }

    // در غیر این صورت کاربر بازگشته و می‌تواند مستقیماً به منوی اصلی برود
    const { showMainMenu } = require('../utils');
    return showMainMenu(ctx);
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
        rules: `👑 به صرافی ووچینو⁰¹ خوش آمدید\n🎁 برای کاربران ووچینو⁰¹، یک هدیه ویژه با امکان دریافت مجدد در نظر گرفته‌ایم.\n💳 خرید انواع ووچر در کمتر از ۳۰ ثانیه\n🎁 بهره‌مندی از بونوس‌های ویژه کاربران\n🔐 بدون احراز هویت تا سقف ۲ میلیون تومان در روز\n\n👇 برای ورود، ابتدا در کانال عضو شوید.`,
        joinButton: '📢 عضویت در کانال',
        joinedButton: '✅ عضو شدم',
      },
      en: {
        rules: `👑 Welcome to Vochino⁰¹ Exchange\n🎁 A special gift with recharge possibility for users.\n💳 Buy all vouchers in under 30 seconds\n🎁 Exclusive bonuses for users\n🔐 No verification up to 2M Tomans per day\n\n👇 Join the channel first to enter.`,
        joinButton: '📢 Join Channel',
        joinedButton: '✅ Joined',
      },
      tr: {
        rules: `👑 Vochino⁰¹ Borsasına Hoşgeldiniz\n🎁 Özel hediye ve yeniden alım imkanı.\n💳 30 saniyeden kısa sürede voucher alımı\n🎁 Özel bonuslar\n🔐 Günlük 2 milyon Toman'a kadar kimlik doğrulamasız\n\n👇 Giriş için önce kanala katılın.`,
        joinButton: '📢 Kanala Katıl',
        joinedButton: '✅ Katıldım',
      }
    };

    const m = rulesMessages[lang] || rulesMessages.fa;

    // اگر جوین اجباری فعال است و حداقل یک کانال وجود دارد، دکمه‌ها را نشان بده
    if (forceJoinEnabled === 'true' && channels.length > 0) {
      const channel = channels[0]; // ساده‌سازی: اولین کانال را نشان بده (می‌توانی همه را بررسی کنی)
      return ctx.reply(m.rules, {
        reply_markup: {
          inline_keyboard: [
            [{ text: m.joinButton, url: channel.invite_link }],
            [{ text: m.joinedButton, callback_data: 'check_join' }]
          ]
        }
      });
    }

    // اگر جوین اجباری غیرفعال باشد، مستقیم قوانین را نشان بده و دکمه پذیرش
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

    // کاربر عضو شده، حالا باید قوانین را بپذیرد
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
  // پذیرش قوانین → ثبت‌نام سریع (ورود روان)
  // ============================================
  bot.action('accept_rules', async (ctx) => {
    const userId = ctx.from.id;
    const user = await getUser(userId);
    const lang = user?.language || 'fa';

    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    // کاربر را به عنوان "ورود کرده" علامت‌گذاری می‌کنیم، بدون درخواست مدارک.
    // در اینجا ما فعلاً شماره تلفن و غیره را نمی‌گیریم؛ کاربر می‌تواند مستقیماً از منو استفاده کند.
    // اگر کاربر هنوز نام و شماره ندارد، یک فیلد مخصوص "onboarding_completed" در db موجود نیست،
    // بنابراین ما از یک قرارداد استفاده می‌کنیم: اگر phone خالی باشد، کاربر "مهمان" است و می‌تواند بعداً تکمیل کند.
    // برای این کار، در صورت نیاز، رکورد کاربر را به‌روز می‌کنیم تا حداقل زبان تنظیم باشد.
    if (!user.phone) {
      await pool.query("UPDATE users SET language = $1 WHERE telegram_id = $2", [lang, String(userId)]);
    }

    // نمایش منوی اصلی
    const { showMainMenu } = require('../utils');
    return showMainMenu(ctx);
  });

};
