// texts.js
// مدیریت متن‌های ربات — حالا از textManager (کش) می‌خواند
// تمام متن‌های هاردکدشده به این فایل منتقل شده‌اند

const { getText } = require('./textManager');
const { DAILY_LIMIT_TEXT, MIN_WITHDRAW, BONUS_THRESHOLD, BONUS_AMOUNT } = require('./constants');

/**
 * دریافت یک متن از کش با مقدار پیش‌فرض
 * @param {string} key 
 * @param {string} defaultValue 
 * @returns {string}
 */
function t(key, defaultValue = '') {
  return getText(key, defaultValue);
}

/**
 * شیء نهایی texts که همه‌جای پروژه استفاده می‌شود
 * هر کلید از کش خوانده می‌شود، اما اگر در کش نباشد، مقدار پیش‌فرض (قدیمی) استفاده می‌شود
 */
const texts = {
  fa: {
    // ==================== ثبت‌نام / خوش‌آمد ====================
    chooseLanguage: t('chooseLanguage', '🌐 زبان خود را انتخاب کنید / Please choose your language:\n\n🇮🇷 فارسی | 🇬🇧 English | 🇹🇷 Türkçe'),
    welcome: t('welcome', 'به خانواده‌ی ما خوش اومدی! 🌟\nاینجا با خیال راحت خرید و فروش کن، ما همیشه پشتتیم.'),
    requestPhone: t('requestPhone', 'برای تکمیل ثبت‌نام، لطفاً شماره تلفن خود را با دکمه‌ی زیر ارسال کنید 👇'),
    sharePhoneButton: t('sharePhoneButton', '📱 ارسال شماره تلفن'),
    requestName: t('requestName', 'لطفاً نام و نام خانوادگی خود را وارد کنید:'),
    requestCard: t('requestCard', 'لطفاً شماره کارت بانکی خود را وارد کنید (کارتی که برای واریز استفاده می‌کنید):'),
    rulesText: t('rulesText', 'قوانین و شرایط استفاده:\n\n(متن قوانین بعداً از پنل مدیریت تکمیل می‌شود)\n\nتوجه: واریزی فقط از کارتی که به نام شما ثبت شده معتبر است.'),
    confirmRulesButton: t('confirmRulesButton', '✅ قوانین را می‌پذیرم'),
    registrationSuccess: t('registrationSuccess', '🎉 ثبت‌نام شما با موفقیت انجام شد!\nاز همین حالا می‌تونی با خیال راحت خرید کنی.\nسقف خرید روزانه‌ت: ' + DAILY_LIMIT_TEXT + ' تومان'),
    welcomeBack: t('welcomeBack', 'خوش برگشتی، خوشحالیم دوباره می‌بینیمت! 👋'),

    // ==================== عضویت اجباری ====================
    mustJoinTitle: t('mustJoinTitle', 'برای استفاده از ربات، ابتدا باید عضو کانال زیر شوید:'),
    joinChannelButton: t('joinChannelButton', '📢 عضویت در کانال'),
    checkMembershipButton: t('checkMembershipButton', '✅ عضو شدم'),
    stillNotMember: t('stillNotMember', 'هنوز عضو کانال نشده‌اید. لطفاً ابتدا عضو شوید، سپس دوباره تلاش کنید.'),

    // ==================== جیب / کیف پول ====================
    walletTitle: t('walletTitle', '🎒 جیب'),
    walletBalance: t('walletBalance', '💰 موجودی فعلی شما: {balance} تومان'),
    walletIncrease: t('walletIncrease', '➕ افزایش موجودی'),
    walletWithdraw: t('walletWithdraw', '💳 برداشت موجودی'),
    walletAddCard: t('walletAddCard', '➕ افزودن کارت جدید'),
    backButton: t('backButton', '🔙 بازگشت'),
    depositMethodTitle: t('depositMethodTitle', 'روش افزایش موجودی را انتخاب کنید:'),
    depositCard2Card: t('depositCard2Card', '💳 کارت به کارت'),
    depositTron: t('depositTron', '🪙 ترون (تتر)'),
    depositGateway: t('depositGateway', '🌐 درگاه پرداخت'),
    comingSoon: t('comingSoon', 'به‌زودی 🙂'),
    depositCardsTrust: t('depositCardsTrust', '✅ پرداخت شما مستقیماً و بدون واسطه به حساب رسمی مجموعه واریز می‌شود.\n💚 هزاران کاربر با خیال راحت از این روش استفاده کرده‌اند.\n\nلطفاً مبلغ واریزی خود را به یکی از کارت‌های زیر واریز کنید:'),
    depositAskAmount: t('depositAskAmount', 'مبلغ واریزی خود را به تومان وارد کنید:'),
    depositAskReceipt: t('depositAskReceipt', 'رسید (فیش) پرداخت خود را همینجا ارسال کنید 📎'),
    depositSubmitted: t('depositSubmitted', 'درخواست شارژ شما ثبت شد ✅\nپس از بررسی توسط پشتیبانی (معمولاً خیلی سریع)، موجودی شما به‌روزرسانی خواهد شد.'),
    withdrawAskAmount: t('withdrawAskAmount', 'مبلغ برداشت خود را به تومان وارد کنید (حداقل ' + MIN_WITHDRAW.toLocaleString('en-US') + ' تومان):'),
    withdrawMinError: t('withdrawMinError', 'حداقل مبلغ برداشت ' + MIN_WITHDRAW.toLocaleString('en-US') + ' تومان است. لطفاً دوباره وارد کنید:'),
    withdrawSelectCard: t('withdrawSelectCard', 'شماره کارت خود را انتخاب کنید:'),
    withdrawSubmitted: t('withdrawSubmitted', 'درخواست برداشت شما ثبت شد ✅\nپس از بررسی توسط پشتیبانی، مبلغ به کارت شما واریز خواهد شد.'),
    addCardAsk: t('addCardAsk', 'شماره کارت جدید را وارد کنید (۱۶ رقم):'),
    addCardInvalid: t('addCardInvalid', 'شماره کارت وارد شده معتبر نیست. لطفاً دوباره تلاش کنید:'),
    addCardSuccess: t('addCardSuccess', 'کارت جدید با موفقیت ثبت شد ✅'),
    addCardButton: t('addCardButton', '➕ افزودن کارت جدید'),

    // ==================== خرید ====================
    buyMenuTitle: t('buyMenuTitle', '✨ کدوم محصول رو می‌خوای بخری؟'),
    buyNoProducts: t('buyNoProducts', 'فعلاً هیچ محصولی برای فروش تعریف نشده.'),
    buyAskAmountUsd: t('buyAskAmountUsd', '💵 قیمت هر دلار: {rate} تومان\n💰 حداقل خرید: {minUsd} دلار (حدود {minToman} تومان)\n\nمبلغ خرید خود را به تومان وارد کنید:\nمثال: 200000'),
    buyAskAmountToman: t('buyAskAmountToman', '💰 حداقل خرید: {min} تومان\n\nمبلغ خرید خود را به تومان وارد کنید:\nمثال: 200000'),
    buyMinError: t('buyMinError', 'مبلغ واردشده کمتر از حداقل خرید ({min} تومان) است. لطفاً دوباره وارد کنید:'),
    buyMaxError: t('buyMaxError', 'مبلغ واردشده بیشتر از حداکثر خرید ({max} تومان) است. لطفاً دوباره وارد کنید:'),
    buyConfirmSummary: t('buyConfirmSummary', '📦 خلاصه‌ی سفارش:\n\nمحصول: {product}\nمبلغ: {amount} تومان\n\nبا تایید، این مبلغ از موجودی کیف پولت کسر می‌شه.'),
    buyConfirmButton: t('buyConfirmButton', '✅ تایید و خرید'),
    buyCancelButton: t('buyCancelButton', '❌ انصراف'),
    buySuccess: t('buySuccess', '🎉 خرید شما با موفقیت انجام شد!\n\n🆔 کد پیگیری: {trackingCode}\n📦 محصول: {product}\n💰 مبلغ: {amount} تومان\n\nموجودی جدید: {balance} تومان'),
    buySuccessPending: t('buySuccessPending', '✅ سفارش شما ثبت شد!\n\n🆔 کد پیگیری: {trackingCode}\n📦 محصول: {product}\n💰 مبلغ: {amount} تومان\n💰 کارمزد: {commission} تومان\n\nموجودی جدید: {balance} تومان\n\n⏳ سفارش شما در انتظار تحویل است؛ به محض آماده شدن، کد/محتوا برایتان ارسال می‌شود.'),
    buyInsufficientBalance: t('buyInsufficientBalance', '❌ موجودی کیف پولت کافی نیست.\nمبلغ سفارش: {amount} تومان\nموجودی فعلی: {balance} تومان\n\nاول کیف پولت رو شارژ کن، بعد دوباره امتحان کن.'),
    buyChargeWalletButton: t('buyChargeWalletButton', '💳 شارژ کیف پول'),
    buyCancelled: t('buyCancelled', 'سفارش لغو شد.'),

    // ==================== فروش ====================
    sellMenuTitle: t('sellMenuTitle', '✨ کدوم محصول رو می‌خوای بفروشی؟'),
    sellNoProducts: t('sellNoProducts', 'فعلاً هیچ محصولی برای خرید از شما تعریف نشده.'),
    sellAskCode: t('sellAskCode', '💸 فروش {product}\n\n♻️ قیمت واحد: {price} تومان\n\n🎫 نمونه کد صحیح:\n{sample}\n〰️〰️〰️〰️〰️〰️〰️〰️〰️〰️〰️〰️〰️〰️\n▫️ لطفاً کد ووچر را وارد کنید:'),
    sellCodeReceived: t('sellCodeReceived', '✅ کد شما دریافت شد.\n🆔 کد پیگیری: {trackingCode}\n\n⏳ منتظر بخش مالی باشید، به محض بررسی نتیجه رو بهت اطلاع می‌دیم.'),
    sellApprovedUser: t('sellApprovedUser', '✅ فروش شما تایید شد.\n🆔 کد پیگیری: {trackingCode}\n💰 مبلغ {amount} تومان به کیف پولت اضافه شد.'),
    sellRejectedUser: t('sellRejectedUser', '❌ درخواست فروش شما رد شد.\n🆔 کد پیگیری: {trackingCode}\nدر صورت هرگونه سؤال با پشتیبانی در تماس باشید.'),
    sellAskFinalAmount: t('sellAskFinalAmount', '💰 مبلغ نهایی رو (بعد از کسر کارمزد) به تومان وارد کن، این مبلغ مستقیم به کیف پول کاربر اضافه می‌شه:'),

    // ==================== پروفایل ====================
    profileTitle: t('profileTitle', '👤 پروفایل شما'),
    invoicesTitle: t('invoicesTitle', '🧾 فاکتورهای من'),
    invoicesEmpty: t('invoicesEmpty', 'هنوز هیچ فاکتوری برای شما ثبت نشده.'),

    // ==================== پشتیبانی ====================
    supportTitle: t('supportTitle', '📞 پشتیبانی\n\nقبل از تماس، یه نگاه به سوالات متداول بنداز، شاید جوابت همونجا باشه 👇'),
    supportFaqButton: t('supportFaqButton', '❓ سوالات متداول'),
    supportContactButton: t('supportContactButton', '💬 ارتباط با پشتیبانی'),
    supportContactText: t('supportContactText', 'برای ارتباط مستقیم با پشتیبانی، پیام خودتون رو همینجا بنویسید تا در اسرع وقت جواب بگیرید.'),
    faqText: t('faqText', '❓ سوالات متداول\n\n' +
      '🔹 چقدر طول می‌کشه شارژم تایید بشه؟\n' +
      'معمولاً چند دقیقه، حداکثر تا چند ساعت.\n\n' +
      '🔹 حداقل مبلغ برداشت چقدره؟\n' +
      MIN_WITHDRAW.toLocaleString('en-US') + ' تومان.\n\n' +
      '🔹 آیا واریزی از کارت دیگران قبوله؟\n' +
      'نه، فقط از کارتی که به نام خودتون ثبت شده.\n\n' +
      '🔹 بونوس بازی چطور فعال می‌شه؟\n' +
      'با رسیدن مجموع خریدت به ' + BONUS_THRESHOLD.toLocaleString('en-US') + ' تومان، یه بونوس بازی برات فعال می‌شه.'),

    // ==================== بازی / بونوس ====================
    gameMenuTitle: t('gameMenuTitle', '🎮 بازی و بونوس'),
    gameNotEligible: t('gameNotEligible', '🔒 هنوز بونوس بازی برات فعال نشده.\n\n' +
      'با رسیدن مجموع خریدت به ' + BONUS_THRESHOLD.toLocaleString('en-US') + ' تومان، یه بونوس ' + BONUS_AMOUNT.toLocaleString('en-US') + ' تومنی می‌گیری که می‌تونی باهاش بازی کنی و ببری! 🎁'),
    gameEligibleIntro: t('gameEligibleIntro', '🎁 تبریک! یه بونوس ' + BONUS_AMOUNT.toLocaleString('en-US') + ' تومنی داری.\n' +
      'یکی از بازی‌های زیر رو انتخاب کن و شانستو امتحان کن. اگه ببری، مبلغ مستقیم میاد تو موجودیت و می‌تونی همون لحظه برداشت بزنی 💸'),
    gameAlreadyUsed: t('gameAlreadyUsed', 'بونوس بازیت رو قبلاً استفاده کردی. با رسیدن به سقف خرید بعدی، دوباره یه بونوس جدید فعال می‌شه.'),
    gameDiceButton: t('gameDiceButton', '🎲 بازی تاس'),
    gameBasketballButton: t('gameBasketballButton', '🏀 بازی بسکتبال'),
    gamePlaying: t('gamePlaying', '🎲 در حال بازی... منتظر بمون تا نتیجه مشخص بشه...'),
    gameWin: t('gameWin', '🎉🎉 تبریک، بردی!!\nمبلغ ' + BONUS_AMOUNT.toLocaleString('en-US') + ' تومان به موجودیت اضافه شد. می‌تونی همین الان برداشت بزنی 💸'),
    gameLose: t('gameLose', '😔 این بار نبردی، بونوست مصرف شد.\nنگران نباش، با خرید بعدیت دوباره شانس داری!'),

    // ==================== رفرال / معرفی ====================
    referralTitle: t('referralTitle', '👥 دعوت دوستان'),
    referralLink: t('referralLink', '🔗 لینک دعوت شما:\n{link}\n\n👥 تعداد دعوت: {count} نفر\n💰 پاداش هر دعوت: {bonus} تومان'),
  }
};

module.exports = texts;
