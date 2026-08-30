// textDefaults.js
module.exports = [
  // ثبت‌نام
  { key: 'chooseLanguage', category: 'register', value: '🌐 زبان خود را انتخاب کنید / Please choose your language:\n\n🇮🇷 فارسی | 🇬🇧 English | 🇹🇷 Türkçe' },
  { key: 'rulesText', category: 'register', value: 'قوانین و شرایط استفاده:\n\n(متن قوانین بعداً از پنل مدیریت تکمیل می‌شود)\n\nتوجه: واریزی فقط از کارتی که به نام شما ثبت شده معتبر است.' },
  { key: 'confirmRulesButton', category: 'register', value: '✅ قوانین را می‌پذیرم' },
  { key: 'registrationSuccess', category: 'register', value: '🎉 ثبت‌نام شما با موفقیت انجام شد!\nاز همین حالا می‌تونی با خیال راحت خرید کنی.\nسقف خرید روزانه‌ت: {daily_limit} تومان' },
  { key: 'welcomeBack', category: 'register', value: 'خوش برگشتی، خوشحالیم دوباره می‌بینیمت! 👋' },

  // عضویت اجباری
  { key: 'mustJoinTitle', category: 'force_join', value: 'برای استفاده از ربات، ابتدا باید عضو کانال زیر شوید:' },
  { key: 'joinChannelButton', category: 'force_join', value: '📢 عضویت در کانال' },
  { key: 'checkMembershipButton', category: 'force_join', value: '✅ عضو شدم' },
  { key: 'stillNotMember', category: 'force_join', value: 'هنوز عضو کانال نشده‌اید. لطفاً ابتدا عضو شوید، سپس دوباره تلاش کنید.' },

  // جیب
  { key: 'walletTitle', category: 'wallet', value: '🎒 جیب' },
  { key: 'walletBalance', category: 'wallet', value: '💰 موجودی فعلی شما: {balance} تومان' },
  { key: 'walletIncrease', category: 'wallet', value: '➕ افزایش موجودی' },
  { key: 'walletWithdraw', category: 'wallet', value: '💳 برداشت موجودی' },
  { key: 'walletAddCard', category: 'wallet', value: '➕ افزودن کارت جدید' },
  { key: 'backButton', category: 'wallet', value: '🔙 بازگشت' },
  { key: 'depositMethodTitle', category: 'wallet', value: 'روش افزایش موجودی را انتخاب کنید:' },
  { key: 'depositCard2Card', category: 'wallet', value: '💳 کارت به کارت' },
  { key: 'depositTron', category: 'wallet', value: '🪙 ترون (تتر)' },
  { key: 'depositGateway', category: 'wallet', value: '🌐 درگاه پرداخت' },
  { key: 'comingSoon', category: 'wallet', value: 'به‌زودی 🙂' },

  // خطاها
  { key: 'errorGeneral', category: 'errors', value: '⚠️ خطایی رخ داد. لطفاً دوباره تلاش کنید.' },
  { key: 'errorBalance', category: 'errors', value: '❌ موجودی کیف پولت کافی نیست.\nمبلغ سفارش: {amount} تومان\nموجودی فعلی: {balance} تومان' },

  // خرید
  { key: 'buyMenuTitle', category: 'buy', value: '✨ کدوم محصول رو می‌خوای بخری؟' },
  { key: 'buySuccess', category: 'buy', value: '🎉 خرید شما با موفقیت انجام شد!\n\n🆔 کد پیگیری: {trackingCode}\n📦 محصول: {product}\n💰 مبلغ: {amount} تومان\n\nموجودی جدید: {balance} تومان' },
  { key: 'buyInsufficientBalance', category: 'buy', value: '❌ موجودی کیف پولت کافی نیست.\nمبلغ سفارش: {amount} تومان\nموجودی فعلی: {balance} تومان\n\nاول کیف پولت رو شارژ کن، بعد دوباره امتحان کن.' },

  // فروش
  { key: 'sellMenuTitle', category: 'sell', value: '✨ کدوم محصول رو می‌خوای بفروشی؟' },
  { key: 'sellApprovedUser', category: 'sell', value: '✅ فروش شما تایید شد.\n🆔 کد پیگیری: {trackingCode}\n💰 مبلغ {amount} تومان به کیف پولت اضافه شد.' },

  // بازی
  { key: 'gameMenuTitle', category: 'game', value: '🎮 بازی و بونوس' },
  { key: 'gameWin', category: 'game', value: '🎉🎉 تبریک، بردی!!\nمبلغ {amount} تومان به موجودیت اضافه شد.' },
  { key: 'gameLose', category: 'game', value: '😔 این بار نبردی. نگران نباش، شانس دوباره هست!' },

  // رفرال
  { key: 'referralTitle', category: 'referral', value: '👥 دعوت دوستان' },
  { key: 'referralLink', category: 'referral', value: '🔗 لینک دعوت شما:\n{link}\n\n👥 تعداد دعوت: {count} نفر\n💰 پاداش هر دعوت: {bonus} تومان' },

  // ==================== 🧠 هوشینو⁰¹ (Omni-Assistant) ====================
  { key: 'omniMenuTitle', category: 'omni', value: '🧠 هوشینو⁰¹ برتر\n\nیکی از گزینه‌های زیر را انتخاب کنید:' },
  { key: 'omniGeneralButton', category: 'omni', value: '🐽 گفتگوی AI هوشینو⁰¹' },
  { key: 'omniSportsButton', category: 'omni', value: '⚽ تحلیل AI هوشینو⁰¹' },
  { key: 'omniFixturesButton', category: 'omni', value: '📅 جدول امروز هوشینو⁰¹' },
  { key: 'omniBackButton', category: 'omni', value: '🔙 بازگشت به منوی اصلی' },
  { key: 'omniResetButton', category: 'omni', value: '🔄 شروع گفتگوی جدید' },
  { key: 'omniProcessing', category: 'omni', value: '🤖 در حال پردازش...' },
  { key: 'omniError', category: 'omni', value: '⚠️ خطا در پردازش درخواست. لطفاً دوباره تلاش کنید.' },
  { key: 'omniGeneralPrompt', category: 'omni', value: '💬 سلام! من هوشینو⁰¹ هستم.\nسوالت رو بپرس یا عکس/ویس بفرست.' },
  { key: 'omniSportsPrompt', category: 'omni', value: '⚽ تحلیلگر ورزشی هوشینو⁰¹ در خدمت شماست.\nمسابقه یا تیم مورد نظرت رو بگو.' },
  { key: 'omniFixturesPrompt', category: 'omni', value: '📅 جدول امروز مسابقات رو می‌خوای؟ بگو کدوم لیگ؟' },
  { key: 'omniResetSuccess', category: 'omni', value: '🔄 گفتگو از نو شروع شد.' },
  { key: 'omniNoApiKey', category: 'omni', value: '⚠️ کلید API هوش مصنوعی تنظیم نشده است.' },
  { key: 'omniAdminFlushed', category: 'omni', value: '🧹 تمام گفتگوهای کاربران پاک شد.' }
];
