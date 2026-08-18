// handlers/verification.js
// احراز هویت نقره‌ای — فقط هنگام اولین خرید/فروش فعال می‌شود، نه هنگام /start
const { sessions } = require('../utils');
const { pool, getUser, getSetting } = require('../db');
const R = require('./receipts');

const T = {
  fa: {
    intro: '🛡️ احراز هویت نقره‌ای\n\nبرای حفظ امنیت معاملات و جلوگیری از سوءاستفاده و فیشینگ، لازم است اطلاعات مالک حساب بررسی شود.\nاین اطلاعات فقط برای بررسی هویت و امنیت معاملات شما دریافت می‌شود.\n\n👇 برای شروع، شماره تلفن خود را ارسال کنید.',
    sendPhoneBtn: '📱 ارسال شماره تلفن',
    stepPhone: '📱 مرحله ۱ از ۴\n\nلطفاً شماره تلفن خود را با دکمه زیر از طریق تلگرام ارسال کنید.\n🛡️ این مرحله برای اطمینان از ارتباط حساب تلگرام با مالک واقعی حساب انجام می‌شود.',
    invalidPhone: '❌ لطفاً فقط از دکمه «ارسال شماره تلفن» استفاده کنید.',
    stepName: '👤 مرحله ۲ از ۴\n\nلطفاً نام واقعی خود را وارد کنید.\n📌 نام واردشده باید متعلق به صاحب حساب و اطلاعات بانکی شما باشد.',
    stepLastName: '👤 مرحله ۳ از ۴\n\nلطفاً نام خانوادگی واقعی خود را وارد کنید.\n🛡️ اطلاعات واردشده در مرحله تأیید برای بررسی مالکیت حساب استفاده می‌شود.',
    stepCard: '💳 مرحله ۴ از ۴\n\nلطفاً شماره کارت بانکی متعلق به خودتان را وارد کنید.\n📌 شماره کارت باید متعلق به همان شخصی باشد که اطلاعات هویتی خود را ثبت کرده است.\n🛡️ این بررسی برای کاهش ریسک فیشینگ، سوءاستفاده و تراکنش‌های مشکوک انجام می‌شود.',
    invalidCard: '❌ شماره کارت نامعتبر است. لطفاً ۱۶ رقم شماره کارت را صحیح وارد کنید:',
    invalidName: '❌ لطفاً یک مقدار معتبر (حداقل ۲ حرف) وارد کنید:',
    reviewTitle: '🔎 بررسی نهایی اطلاعات',
    confirmBtn: '🟢 تأیید اطلاعات',
    editBtn: '🔴 اصلاح اطلاعات',
    doneTitle: '🛡️ احراز هویت نقره‌ای با موفقیت ثبت شد.\n✅ اطلاعات شما تأیید و ثبت گردید.',
    continueBtn: '🛍 بازگشت به ادامه معامله',
    limitExceeded: (limit) => `🔒 سقف احراز هویت نقره‌ای شما ${Number(limit).toLocaleString('en-US')} تومان در روز است.\nبرای افزایش سقف معاملات، احراز هویت طلایی را انجام دهید.`,
    goldBtn: '👑 احراز هویت طلایی'
  },
  en: {
    intro: '🛡️ Silver Verification\n\nTo protect your transactions and prevent fraud or phishing, we need to verify the account owner.\nThis information is used only for identity and transaction security.\n\n👇 To begin, please share your phone number.',
    sendPhoneBtn: '📱 Share Phone Number',
    stepPhone: '📱 Step 1 of 4\n\nPlease share your phone number using the button below via Telegram.\n🛡️ This confirms your Telegram account belongs to the real account owner.',
    invalidPhone: '❌ Please use the "Share Phone Number" button only.',
    stepName: '👤 Step 2 of 4\n\nPlease enter your real first name.\n📌 The name must belong to the account and bank details owner.',
    stepLastName: '👤 Step 3 of 4\n\nPlease enter your real last name.\n🛡️ This is used to verify account ownership.',
    stepCard: '💳 Step 4 of 4\n\nPlease enter your bank card number (must belong to you).\n📌 The card must belong to the same person as the identity info provided.\n🛡️ This reduces the risk of phishing, fraud, and suspicious transactions.',
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
    stepPhone: '📱 Adım 1/4\n\nLütfen aşağıdaki butonla Telegram üzerinden telefon numaranızı gönderin.\n🛡️ Bu, Telegram hesabınızın gerçek sahibine ait olduğunu doğrular.',
    invalidPhone: '❌ Lütfen yalnızca "Telefon Numarasını Gönder" butonunu kullanın.',
    stepName: '👤 Adım 2/4\n\nLütfen gerçek adınızı girin.\n📌 Girilen ad, hesap ve banka bilgileri sahibine ait olmalıdır.',
    stepLastName: '👤 Adım 3/4\n\nLütfen gerçek soyadınızı girin.\n🛡️ Bu bilgi hesap sahipliğini doğrulamak için kullanılır.',
    stepCard: '💳 Adım 4/4\n\nLütfen kendinize ait banka kartı numarasını girin.\n📌 Kart numarası, kimlik bilgilerini giren kişiye ait olmalıdır.\n🛡️ Bu, dolandırıcılık riskini azaltmak için yapılır.',
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
  if (!user || user.verification_status !== 'silver') return { ok: true };
  const limit = Number(await getSetting('silver_daily_limit', '2000000'));

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
  if (used + Number(extraAmount) > limit) return { ok: false, limit, used };
  return { ok: true, limit, used };
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
    await ctx.reply(t(lang).stepName, { reply_markup: { remove_keyboard: true } });
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
        `${t(lang).reviewTitle}\n\n👤 ${session.data.firstName}\n👤 ${session.data.lastName}\n💳 ${maskedCard}\n📱 ${maskPhone()}`,
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
    session.data.firstName = null; session.data.lastName = null; session.data.card = null; session.data.phone = null;
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
      'UPDATE users SET phone=$1, full_name=$2, card_number=$3, verification_status=$4 WHERE telegram_id=$5',
      [session.data.phone, fullName, session.data.card, 'silver', String(ctx.from.id)]
    );

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
