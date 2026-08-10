// handlers/mainMenu.js
const { Markup } = require('telegraf');
const User = require('../models/User');

// متون سه زبانه برای پروفایل مهمان
const guestProfileMessages = {
  fa: (userId) => `🧢 پروفایل: \`${userId}\`
👤 نام و نام خانوادگی: ناشناس🤔
📱 شماره تلفن: فعلا مهمان❤️
💳 شماره کارت: فعلا مهمان❤️
💰 موجودی: ۰ تومان🥺
🪎 موجودی بونوس: فعلا مهمان❤️
🎗 سطح احراز: فعلا مهمان
👥 افراد دعوت: ۰ نفر

💳 کیف پول من | Vochino⁰¹💎
✨ موجودی قابل استفاده شما: ۰ تومان
✨ از اینجا کیف پول خود را مدیریت کنید.`,
  en: (userId) => `🧢 Profile: \`${userId}\`
👤 Name: Anonymous🤔
📱 Phone: Guest❤️
💳 Card: Guest❤️
💰 Balance: 0 Toman🥺
🪎 Bonus Balance: Guest❤️
🎗 Verification: Guest
👥 Invites: 0

💳 My Wallet | Vochino⁰¹💎
✨ Available: 0 Toman
✨ Manage your wallet here.`,
  tr: (userId) => `🧢 Profil: \`${userId}\`
👤 İsim: Anonim🤔
📱 Telefon: Misafir❤️
💳 Kart: Misafir❤️
💰 Bakiye: 0 Tümen🥺
🪎 Bonus: Misafir❤️
🎗 Doğrulama: Misafir
👥 Davet: 0

💳 Cüzdanım | Vochino⁰¹💎
✨ Kullanılabilir: 0 Tümen
✨ Cüzdanınızı yönetin.`
};

// متون سه زبانه برای پروفایل کاربر ثبت‌نام‌شده
const userProfileMessages = {
  fa: (user) => {
    const levelEmoji = user.verificationLevel === 'gold' ? '🥇 طلایی' : (user.verificationLevel === 'silver' ? '🥈 نقره‌ای' : 'مهمان');
    return `🧢 پروفایل: \`${user.telegramId}\`
👤 نام: ${user.name || '---'}
📱 شماره: ${user.phone || '---'}
💳 کارت: ${user.cardNumber || '---'}
💰 موجودی: ${user.balance.toLocaleString()} تومان
🪎 بونوس: ${user.bonusBalance.toLocaleString()} تومان
🎗 سطح احراز: ${levelEmoji}
👥 افراد دعوت: ${user.inviteCount || 0} نفر

💳 کیف پول من | Vochino⁰¹💎
✨ موجودی قابل استفاده شما: ${(user.balance + user.bonusBalance).toLocaleString()} تومان
✨ از اینجا کیف پول خود را مدیریت کنید.`;
  },
  en: (user) => {
    const levelEmoji = user.verificationLevel === 'gold' ? '🥇 Gold' : (user.verificationLevel === 'silver' ? '🥈 Silver' : 'Guest');
    return `🧢 Profile: \`${user.telegramId}\`
👤 Name: ${user.name || '---'}
📱 Phone: ${user.phone || '---'}
💳 Card: ${user.cardNumber || '---'}
💰 Balance: ${user.balance.toLocaleString()} Toman
🪎 Bonus: ${user.bonusBalance.toLocaleString()} Toman
🎗 Verification: ${levelEmoji}
👥 Invites: ${user.inviteCount || 0}

💳 My Wallet | Vochino⁰¹💎
✨ Available: ${(user.balance + user.bonusBalance).toLocaleString()} Toman
✨ Manage your wallet here.`;
  },
  tr: (user) => {
    const levelEmoji = user.verificationLevel === 'gold' ? '🥇 Altın' : (user.verificationLevel === 'silver' ? '🥈 Gümüş' : 'Misafir');
    return `🧢 Profil: \`${user.telegramId}\`
👤 İsim: ${user.name || '---'}
📱 Telefon: ${user.phone || '---'}
💳 Kart: ${user.cardNumber || '---'}
💰 Bakiye: ${user.balance.toLocaleString()} Tümen
🪎 Bonus: ${user.bonusBalance.toLocaleString()} Tümen
🎗 Doğrulama: ${levelEmoji}
👥 Davet: ${user.inviteCount || 0}

💳 Cüzdanım | Vochino⁰¹💎
✨ Kullanılabilir: ${(user.balance + user.bonusBalance).toLocaleString()} Tümen
✨ Cüzdanınızı yönetin.`;
  }
};

// دکمه‌های اصلی (سه زبانه)
const mainMenuButtons = {
  fa: {
    wallet: '🎒 جیب',
    games: '🎮 بازی',
    support: '🛟 پشتیبانی',
    gift: '🎁 هدیه ووچینو⁰¹'
  },
  en: {
    wallet: '🎒 Wallet',
    games: '🎮 Games',
    support: '🛟 Support',
    gift: '🎁 Vochino⁰¹ Gift'
  },
  tr: {
    wallet: '🎒 Cüzdan',
    games: '🎮 Oyunlar',
    support: '🛟 Destek',
    gift: '🎁 Vochino⁰¹ Hediyesi'
  }
};

// نمایش منوی اصلی
const showMainMenu = async (ctx) => {
  try {
    const userId = ctx.from.id;
    const user = await User.findOne({ telegramId: userId });
    const lang = user ? user.language : 'fa';
    const buttons = mainMenuButtons[lang];

    let profileText;
    // اگر کاربر موجود نباشد یا هیچ اطلاعاتی وارد نکرده باشد (مهمان)
    if (!user || (!user.name && !user.phone && !user.cardNumber && !user.balance && !user.bonusBalance)) {
      profileText = guestProfileMessages[lang](userId);
    } else {
      profileText = userProfileMessages[lang](user);
    }

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback(buttons.wallet, 'wallet'), Markup.button.callback(buttons.games, 'games_menu')],
      [Markup.button.callback(buttons.support, 'support'), Markup.button.callback(buttons.gift, 'gift')]
    ]);

    // اگر ctx.editMessageText وجود دارد (مثلاً از callback)، پیام را ویرایش کن، در غیر این صورت پیام جدید بفرست
    if (ctx.callbackQuery && ctx.callbackQuery.message) {
      await ctx.editMessageText(profileText, { ...keyboard, parse_mode: 'Markdown' });
    } else {
      await ctx.reply(profileText, { ...keyboard, parse_mode: 'Markdown' });
    }
  } catch (error) {
    console.error('Error in showMainMenu:', error);
    // در صورت خطا، یک پیام ساده برگردان
    await ctx.reply('⚠️ خطایی رخ داد. لطفاً /start را بزنید.');
  }
};

// میدلور برای رهگیری step=main_menu
const middleware = async (ctx, next) => {
  if (ctx.session && ctx.session.step === 'main_menu') {
    // اگر کاربر پیامی متنی بفرستد، منوی اصلی را مجدداً نشان بده
    if (ctx.message && ctx.message.text) {
      return showMainMenu(ctx);
    }
  }
  return next();
};

// بازگشت به منوی اصلی
const backToMain = async (ctx) => {
  ctx.session.step = 'main_menu';
  await showMainMenu(ctx);
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
  }
};

module.exports = {
  middleware,
  showMainMenu,
  backToMain
};
