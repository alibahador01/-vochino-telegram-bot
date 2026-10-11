// handlers/verification.js
// احراز هویت نقره‌ای — فقط هنگام اولین خرید/فروش فعال می‌شود، نه هنگام /start
const { sessions } = require('../utils');
const { pool, getUser, getSetting } = require('../db');
const R = require('./receipts');
const { persistentKeyboard } = require('./homeMenu');
const { checkAndGrantBonuses } = require('./bonusEngine');

const T = {
  fa: {
    intro: '🛡️ احراز هویت نقره‌ای\n\nبا چند مرحله‌ی ساده، حساب شما کامل و مطمئن می‌شود تا معاملاتتان راحت‌تر و با خیال آسوده‌تری پیش برود 🌿\nاطلاعاتی که وارد می‌کنید فقط برای همین بررسی استفاده می‌شود.\n\n👇 برای شروع، شماره تلفن خود را ارسال کنید.',
    sendPhoneBtn: '📱 ارسال شماره تلفن',
    stepPhone: '📱 مرحله ۱ از ۵\n\nلطفاً شماره تلفن خود را با دکمه‌ی زیر ارسال کنید.\n🌿 این مرحله فقط برای اطمینان از این است که حساب تلگرام متعلق به خودتان است.',
    invalidPhone: '🙏 برای ارسال شماره تلفن، لطفاً از دکمه‌ی «ارسال شماره تلفن» استفاده کنید.',
    stepName: '👤 مرحله ۲ از ۵\n\nلطفاً نام خود را وارد کنید.\n📌 نامی که وارد می‌کنید باید با نام صاحب کارت بانکی‌تان یکسان باشد.',
    stepLastName: '👤 مرحله ۳ از ۵\n\nلطفاً نام خانوادگی خود را وارد کنید.\n🌿 این اطلاعات برای تطبیق با حساب شما استفاده می‌شود.',
    stepNationalId: '🪪 مرحله ۴ از ۵\n\nلطفاً کد ملی ۱۰ رقمی خود را وارد کنید.\n📌 کد ملی باید متعلق به همان فردی باشد که این اطلاعات را ثبت می‌کند.',
    invalidNationalId: '🙏 کد ملی وارد شده معتبر نیست. لطفاً ۱۰ رقم کد ملی صحیح خود را دوباره وارد کنید:',
    stepCard: '💳 مرحله ۵ از ۵\n\nلطفاً شماره کارت بانکی متعلق به خودتان را وارد کنید.\n📌 کارت باید به نام همان کسی باشد که اطلاعاتش را ثبت کرده است.\n🌿 این مرحله هم برای امن‌تر شدن معاملات شماست.',
    invalidCard: '🙏 شماره کارت درست به نظر نمی‌رسد. لطفاً ۱۶ رقم شماره کارت را دوباره وارد کنید:',
    invalidName: '🙏 لطفاً حداقل ۲ حرف وارد کنید:',
    reviewTitle: '🔎 بررسی نهایی اطلاعات',
    confirmBtn: '🟢 تأیید اطلاعات',
    editBtn: '🔴 اصلاح اطلاعات',
    doneTitle: '🎉 احراز هویت نقره‌ای شما با موفقیت ثبت شد.\n✅ اطلاعات شما تأیید و ذخیره شد. از همراهی‌تان سپاسگزاریم.',
    continueBtn: '🛍 بازگشت به ادامه معامله',
    limitExceeded: (limit) => `🔒 سقف خرید روزانه‌ی شما با احراز نقره‌ای ${Number(limit).toLocaleString('en-US')} تومان است.\n👑 برای افزایش سقف، احراز هویت طلایی را انجام دهید.`,
    goldBtn: '👑 احراز هویت طلایی'
  },
  en: {
    intro: '🛡️ Silver Verification\n\nTo protect your transactions and prevent fraud or phishing, we need to verify the account owner.\nThis information is used only for identity and transaction security.\n\n👇 To begin, please share your phone number.',
    sendPhoneBtn: '📱 Share Phone Number',
    stepPhone: '📱 Step 1 of 5\n\nPlease share your phone number using the button below via Telegram.\n🛡️ This confirms your Telegram account belongs to the real account owner.',
    invalidPhone: '❌ Please use the "Share Phone Number" button only.',
    stepName: '👤 Step 2 of 5\n\nPlease enter your real first name.\n📌 The name must belong to the account and bank details owner.',
    stepLastName: '👤 Step 3 of 5\n\nPlease enter your real last name.\n🛡️ This is used to verify account ownership.',
    stepNationalId: '🪪 Step 4 of 5\n\nPlease enter your 10-digit national ID code.\n📌 It must belong to the same person submitting this information.',
    invalidNationalId: '❌ This national ID does not look valid. Please enter a valid 10-digit national ID:',
    stepCard: '💳 Step 5 of 5\n\nPlease enter your bank card number (must belong to you).\n📌 The card must belong to the same person as the identity info provided.\n🛡️ This reduces the risk of phishing, fraud, and suspicious transactions.',
    invalidCard: '❌ Invalid card number. Please enter a valid 16-digit card number:',
    invalidName: '❌ Please enter a valid value (min 2 characters):',
    reviewTitle: '🔎 Final Information Review',
    confirmBtn: '🟢 Confirm Information',
    editBtn: '🔴 Edit Information',
    doneTitle: '🛡️ Silver verification completed successfully.\n✅ Your information has been confirmed and saved.',
    continueBtn: '🛍 Return to Continue Transaction',
    limitExceeded: (limit) => `🔒 Your Silver verification daily limit is ${Number(limit).toLocaleString('en-US')} Toman.\nTo increase your limit, please complete Gold verification.`,
    goldBtn: '👑 Gold Verification'
  },
  tr: {
    intro: '🛡️ Gümüş Kimlik Doğrulama\n\nİşlemlerinizin güvenliği ve dolandırıcılığın önlenmesi için hesap sahibinin bilgileri doğrulanmalıdır.\nBu bilgiler yalnızca kimlik ve işlem güvenliği için kullanılır.\n\n👇 Başlamak için telefon numaranızı gönderin.',
    sendPhoneBtn: '📱 Telefon Numarasını Gönder',
    stepPhone: '📱 Adım 1/5\n\nLütfen aşağıdaki butonla Telegram üzerinden telefon numaranızı gönderin.\n🛡️ Bu, Telegram hesabınızın gerçek sahibine ait olduğunu doğrular.',
    invalidPhone: '❌ Lütfen yalnızca "Telefon Numarasını Gönder" butonunu kullanın.',
    stepName: '👤 Adım 2/5\n\nLütfen gerçek adınızı girin.\n📌 Girilen ad, hesap ve banka bilgileri sahibine ait olmalıdır.',
    stepLastName: '👤 Adım 3/5\n\nLütfen gerçek soyadınızı girin.\n🛡️ Bu bilgi hesap sahipliğini doğrulamak için kullanılır.',
    stepNationalId: '🪪 Adım 4/5\n\nLütfen 10 haneli kimlik numaranızı girin.\n📌 Bu, bilgileri giren kişiye ait olmalıdır.',
    invalidNationalId: '❌ Geçersiz kimlik numarası. Lütfen geçerli 10 haneli kimlik numaranızı tekrar girin:',
    stepCard: '💳 Adım 5/5\n\nLütfen kendinize ait banka kartı numarasını girin.\n📌 Kart numarası, kimlik bilgilerini giren kişiye ait olmalıdır.\n🛡️ Bu, dolandırıcılık riskini azaltmak için yapılır.',
    invalidCard: '❌ Geçersiz kart numarası. Lütfen 16 haneli geçerli bir kart numarası girin:',
    invalidName: '❌ Lütfen geçerli bir değer girin (en az 2 karakter):',
    reviewTitle: '🔎 Son Bilgi Kontrolü',
    confirmBtn: '🟢 Bilgileri Onayla',
    editBtn: '🔴 Bilgileri Düzelt',
    doneTitle: '🛡️ Gümüş kimlik doğrulama başarıyla tamamlandı.\n✅ Bilgileriniz onaylandı ve kaydedildi.',
    continueBtn: '🛍 İşleme Devam Et',
    limitExceeded: (limit) => `🔒 Gümüş doğrulama günlük limitiniz ${Number(limit).toLocaleString('en-US')} Toman.\nLimitinizi artırmak için Altın doğrulamayı tamamlayın.`,
    goldBtn: '👑 Altın Doğrulama'
  }
};

function t(lang) { return T[lang] || T.fa; }

function maskPhone() { return '••••••••••••'; }

/**
 * اعتبارسنجی کد ملی ایران با الگوریتم رسمی رقم کنترلی (checksum)، نه فقط «۱۰ رقم بودن».
 * جلوی کدهای ملی ساختگی/تصادفی (که فقط ۱۰ رقمن ولی رقم کنترلی‌شون غلطه) رو می‌گیره.
 */
function isValidIranianNationalId(code) {
  if (!/^\d{10}$/.test(code)) return false;
  // کدهایی مثل ۰۰۰۰۰۰۰۰۰۰ یا ۱۱۱۱۱۱۱۱۱۱ از نظر فرمول ریاضی معتبر درمیان ولی عملاً جعلی‌ان
  if (/^(\d)\1{9}$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const checkDigit = digits[9];
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += digits[i] * (10 - i);
  const remainder = sum % 11;
  return (remainder < 2 && checkDigit === remainder) || (remainder >= 2 && checkDigit === 11 - remainder);
}

async function startVerification(ctx, resumeAction, resumeKey) {
  const user = await getUser(ctx.from.id);
  const lang = (user && user.language) || 'fa';
  sessions[ctx.from.id] = {
    flow: 'verify_silver',
    step: 'waiting_phone',
    data: { resumeAction, resumeKey, lang }
  };
  await ctx.reply(t(lang).intro);
  return ctx.reply(t(lang).stepPhone, {
    reply_markup: {
      keyboard: [[{ text: t(lang).sendPhoneBtn, request_contact: true }]],
      resize_keyboard: true,
      one_time_keyboard: true
    }
  });
}

async function checkDailyLimit(telegramId, extraAmount) {
  const user = await getUser(telegramId);
  // ⚠️ رفع باگ: قبلاً این تابع فقط برای verification_status === 'silver' سقف روزانه چک می‌کرد و
  // برای کاربر «طلایی» بدون هیچ محدودیتی return {ok:true} می‌داد — یعنی سقف ۱۰ میلیون تومانی
  // طلایی هیچ‌جا واقعاً اعمال نمی‌شد (فقط بعد از تأیید احراز به‌عنوان یک متن اطلاع‌رسانی نشون داده
  // می‌شد). الان هم نقره‌ای و هم طلایی سقف روزانه‌ی خودشون رو واقعاً دارن.
  if (!user || (user.verification_status !== 'silver' && user.verification_status !== 'gold')) {
    return { ok: true };
  }
  const limit = user.verification_status === 'gold'
    ? Number(await getSetting('gold_daily_limit', '10000000'))
    : Number(await getSetting('silver_daily_limit', '2000000'));

  const buyRes = await pool.query(
    `SELECT COALESCE(SUM(amount),0)::bigint AS s FROM orders
     WHERE telegram_id=$1 AND status IN ('pending_delivery','completed') AND created_at::date = NOW()::date`,
    [String(telegramId)]
  );
  const sellRes = await pool.query(
    `SELECT COALESCE(SUM(amount),0)::bigint AS s FROM sell_orders
     WHERE telegram_id=$1 AND status IN ('pending_review','approved') AND created_at::date = NOW()::date`,
    [String(telegramId)]
  );
  const used = Number(buyRes.rows[0].s) + Number(sellRes.rows[0].s);
  const tier = user.verification_status;
  if (used + Number(extraAmount) > limit) return { ok: false, limit, used, tier };
  return { ok: true, limit, used, tier };
}

module.exports = function registerVerificationHandlers(bot) {

  bot.on('contact', async (ctx, next) => {
    const session = sessions[ctx.from.id];
    if (!session || session.flow !== 'verify_silver' || session.step !== 'waiting_phone') return next();
    const lang = session.data.lang;
    if (ctx.message.contact.user_id !== ctx.from.id) {
      return ctx.reply(t(lang).invalidPhone);
    }
    session.data.phone = ctx.message.contact.phone_number;
    session.step = 'waiting_name';
    // ⚠️ فیکس مشکل ۴: قبلاً اینجا remove_keyboard بود که کیبورد دائمی Home/Live Price رو کامل
    // حذف می‌کرد و دیگه هیچ‌وقت خودش برنمی‌گشت (تا /start بعدی). الان به‌جاش همون کیبورد دائمی
    // دوباره ست می‌شه — هم کیبورد موقت «ارسال شماره تلفن» جمع می‌شه، هم Home/Live Price برمی‌گرده.
    await ctx.reply(t(lang).stepName, { reply_markup: persistentKeyboard() });
  });

  bot.on('text', async (ctx, next) => {
    const session = sessions[ctx.from.id];
    if (!session || session.flow !== 'verify_silver') return next();
    const lang = session.data.lang;
    const val = ctx.message.text.trim();

    if (session.step === 'waiting_phone') {
      return ctx.reply(t(lang).invalidPhone);
    }

    if (session.step === 'waiting_name') {
      if (val.length < 2) return ctx.reply(t(lang).invalidName);
      session.data.firstName = val;
      session.step = 'waiting_lastname';
      return ctx.reply(t(lang).stepLastName);
    }

    if (session.step === 'waiting_lastname') {
      if (val.length < 2) return ctx.reply(t(lang).invalidName);
      session.data.lastName = val;
      session.step = 'waiting_national_id';
      return ctx.reply(t(lang).stepNationalId);
    }

    if (session.step === 'waiting_national_id') {
      const digits = val.replace(/[\s-]/g, '');
      if (!isValidIranianNationalId(digits)) return ctx.reply(t(lang).invalidNationalId);
      session.data.nationalId = digits;
      session.step = 'waiting_card';
      return ctx.reply(t(lang).stepCard);
    }

    if (session.step === 'waiting_card') {
      const digits = val.replace(/[\s-]/g, '');
      if (!/^\d{16}$/.test(digits)) return ctx.reply(t(lang).invalidCard);
      session.data.card = digits;
      session.step = 'review';
      const maskedCard = R.maskCard(digits);
      return ctx.reply(
        `${t(lang).reviewTitle}\n\n👤 ${session.data.firstName}\n👤 ${session.data.lastName}\n🪪 ${session.data.nationalId}\n💳 ${maskedCard}\n📱 ${maskPhone()}`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: t(lang).confirmBtn, callback_data: 'verify_confirm' }],
              [{ text: t(lang).editBtn, callback_data: 'verify_edit' }]
            ]
          }
        }
      );
    }

    return next();
  });

  bot.action('verify_edit', async (ctx) => {
    const session = sessions[ctx.from.id];
    if (!session || session.flow !== 'verify_silver') return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    const lang = session.data.lang;
    session.step = 'waiting_phone';
    session.data.firstName = null; session.data.lastName = null; session.data.nationalId = null; session.data.card = null; session.data.phone = null;
    return ctx.reply(t(lang).stepPhone, {
      reply_markup: {
        keyboard: [[{ text: t(lang).sendPhoneBtn, request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    });
  });

  bot.action('verify_confirm', async (ctx) => {
    const session = sessions[ctx.from.id];
    if (!session || session.flow !== 'verify_silver' || session.step !== 'review') return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    const lang = session.data.lang;
    const fullName = `${session.data.firstName} ${session.data.lastName}`;

    await pool.query(
      'UPDATE users SET phone=$1, full_name=$2, national_id=$3, card_number=$4, verification_status=$5 WHERE telegram_id=$6',
      [session.data.phone, fullName, session.data.nationalId, session.data.card, 'silver', String(ctx.from.id)]
    );

    // ⚠️ رفع حفره‌ی سوءاستفاده در دعوت دوستان: طبق تصمیم کسب‌وکاری، بونوس دعوت دیگه با صرفِ /start
    // زدنِ دعوت‌شونده اعطا نمی‌شه (قبلاً اینجا بود، باعث می‌شد با ساخت اکانت‌های الکی تلگرام بشه
    // سیستم رو دور زد) — فقط وقتی دعوت‌شونده واقعاً احراز هویت نقره‌ای رو کامل کنه حساب می‌شه.
    // شرط «AND referral_counted = false» داخل خودِ UPDATE اتمیکه، یعنی حتی اگه این تابع برای یک
    // کاربر دوبار صدا زده بشه (مثلاً دوبار کلیک تأیید)، فقط یک‌بار به دعوت‌کننده بونوس می‌ده.
    try {
      const refClaim = await pool.query(
        'UPDATE users SET referral_counted = true WHERE telegram_id = $1 AND referrer_id IS NOT NULL AND referral_counted = false RETURNING referrer_id',
        [String(ctx.from.id)]
      );
      if (refClaim.rows.length > 0) {
        const referrerId = refClaim.rows[0].referrer_id;
        await checkAndGrantBonuses(ctx, referrerId, 'referral');
      }
    } catch (e) { console.log('خطا در احتساب دعوت بعد از احراز نقره‌ای:', e.message); }

    const limit = await getSetting('silver_daily_limit', '2000000');
    const { resumeAction, resumeKey } = session.data;
    delete sessions[ctx.from.id];

    const resumeCallback = resumeAction === 'sell' ? `sell_pick_${resumeKey}` : `buy_pick_${resumeKey}`;
    await ctx.reply(
      `${t(lang).doneTitle}\n\n💎 سقف معاملات روزانه شما: ${Number(limit).toLocaleString('en-US')} تومان`,
      { reply_markup: { inline_keyboard: [[{ text: t(lang).continueBtn, callback_data: resumeCallback }]] } }
    );
  });

};

module.exports.startVerification = startVerification;
module.exports.checkDailyLimit = checkDailyLimit;
module.exports.T = T;
