// handlers/start.js
const { Markup } = require('telegraf');
const User = require('../models/User');
const Settings = require('../models/Settings');
const { generateReferralCode } = require('../utils');

const welcomeMessages = {
  fa: {
    rules: `👑 به صرافی ووچینو⁰¹ خوش آمدید
🎁 برای کاربران ووچینو⁰¹، یک هدیه ویژه با امکان دریافت مجدد در نظر گرفته‌ایم.
💳 خرید انواع ووچر در کمتر از ۳۰ ثانیه
🎁 بهره‌مندی از بونوس‌های ویژه کاربران
🔐 بدون احراز هویت تا سقف ۲ میلیون تومان در روز

👇 برای ورود، ابتدا در کانال عضو شوید.`,
    joinButton: 'عضویت اجباری',
    joinedButton: 'عضو شدم'
  },
  en: {
    rules: `👑 Welcome to Vochino⁰¹ Exchange
🎁 A special gift with recharge possibility for users.
💳 Buy all vouchers in under 30 seconds
🎁 Exclusive bonuses for users
🔐 No verification up to 2M Tomans per day

👇 Join the channel first to enter.`,
    joinButton: 'Mandatory Join',
    joinedButton: 'Joined'
  },
  tr: {
    rules: `👑 Vochino⁰¹ Borsasına Hoşgeldiniz
🎁 Özel hediye ve yeniden alım imkanı.
💳 30 saniyeden kısa sürede voucher alımı
🎁 Özel bonuslar
🔐 Günlük 2 milyon Toman'a kadar kimlik doğrulamasız

👇 Giriş için önce kanala katılın.`,
    joinButton: 'Zorunlu Katılım',
    joinedButton: 'Katıldım'
  }
};

// تابع کمکی برای گرفتن تنظیمات کانال از دیتابیس
async function getChannelSettings() {
  const linkSetting = await Settings.findOne({ key: 'channelInviteLink' });
  const usernameSetting = await Settings.findOne({ key: 'channelUsername' });
  return {
    inviteLink: linkSetting ? linkSetting.value : 'https://t.me/your_channel',
    username: usernameSetting ? usernameSetting.value : '@your_channel'
  };
}

const start = async (ctx) => {
  const userId = ctx.from.id;
  let user = await User.findOne({ telegramId: userId });

  if (!user) {
    const refCode = generateReferralCode();
    user = new User({
      telegramId: userId,
      referralCode: refCode
    });

    if (ctx.startPayload) {
      const inviter = await User.findOne({ referralCode: ctx.startPayload });
      if (inviter) {
        user.invitedBy = inviter.telegramId;
      }
    }
    await user.save();
  }

  if (user.language && user.onboardingCompleted) {
    return ctx.reply('شما قبلاً ثبت‌نام کرده‌اید. به منوی اصلی بروید.');
  }

  if (!user.language) {
    return ctx.reply(
      '🌐 لطفاً زبان خود را انتخاب کنید:',
      Markup.inlineKeyboard([
        [
          Markup.button.callback('🇮🇷 فارسی', 'lang_fa'),
          Markup.button.callback('🇬🇧 English', 'lang_en')
        ],
        [Markup.button.callback('🇹🇷 Türkçe', 'lang_tr')]
      ])
    );
  }

  if (user.language && !user.onboardingCompleted) {
    const lang = user.language;
    const m = welcomeMessages[lang];
    const { inviteLink } = await getChannelSettings();

    await ctx.reply(
      m.rules,
      Markup.inlineKeyboard([
        [Markup.button.url(m.joinButton, inviteLink)],
        [Markup.button.callback(m.joinedButton, 'check_join')]
      ])
    );
  }
};

const languageAction = async (ctx) => {
  const lang = ctx.match[0].split('_')[1];
  const userId = ctx.from.id;

  await User.updateOne({ telegramId: userId }, { language: lang });

  const m = welcomeMessages[lang];
  const { inviteLink } = await getChannelSettings();

  await ctx.editMessageText(
    m.rules,
    Markup.inlineKeyboard([
      [Markup.button.url(m.joinButton, inviteLink)],
      [Markup.button.callback(m.joinedButton, 'check_join')]
    ])
  );
};

const checkJoinAction = async (ctx) => {
  const userId = ctx.from.id;
  const user = await User.findOne({ telegramId: userId });
  const lang = user.language || 'fa';
  const { username } = await getChannelSettings();

  try {
    const chatMember = await ctx.telegram.getChatMember(username, userId);
    const isJoined = ['member', 'administrator', 'creator'].includes(chatMember.status);

    if (!isJoined) {
      return ctx.answerCbQuery('❌ شما هنوز عضو کانال نشده‌اید!', { show_alert: true });
    }

    await User.updateOne(
      { telegramId: userId },
      { onboardingCompleted: true }
    );

    await ctx.answerCbQuery('✅ ورود موفقیت‌آمیز');
    await ctx.deleteMessage();
    ctx.session.step = 'main_menu';
    await ctx.reply('🎉 خوش آمدید! اکنون می‌توانید از ربات استفاده کنید.');

  } catch (error) {
    console.error('Error checking membership:', error);
    await ctx.answerCbQuery('⚠️ خطا در بررسی عضویت. لطفاً دوباره تلاش کنید.', { show_alert: true });
  }
};

const memberJoinedAction = checkJoinAction;

const acceptRulesAction = async (ctx) => {
  const userId = ctx.from.id;
  await User.updateOne({ telegramId: userId }, { onboardingCompleted: true });
  await ctx.answerCbQuery('✅ پذیرفته شد');
  ctx.session.step = 'main_menu';
  await ctx.reply('🎉 خوش آمدید!');
};

module.exports = {
  start,
  languageAction,
  checkJoinAction,
  memberJoinedAction,
  acceptRulesAction
};
