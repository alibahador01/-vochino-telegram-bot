// handlers/registration.js
// مسیر یکپارچه‌ی ورود کاربر: انتخاب زبان ← نمایش قوانین ← پذیرش قوانین ← شماره همراه ← نام و نام خانوادگی ←
// کد ملی ← شماره کارت بانکی ← بررسی (۳ مرحله، حدود ۱۵ ثانیه) ← نتیجه ← ورود به منوی اصلی.
//
// ⚠️ تصمیم معماری کلیدی (رفع ریشه‌ای باگ‌های سند): این فلو هیچ وضعیتی را در حافظه‌ی پردازه (آبجکت
// `sessions` در utils.js) نگه نمی‌دارد. تمام مرحله‌ها و داده‌های موقت روی خودِ ردیف کاربر در دیتابیس
// ذخیره می‌شوند (ستون‌های registration_step و registration_data، به‌علاوه‌ی language/rules_accepted_at/
// rules_version). این یعنی: اگر ربات وسط ثبت‌نام کاربر Restart شود، یا کاربر /start را وسط فرایند دوباره
// بزند، یا دکمه را دوبار بزند، چیزی گم یا دوبار ثبت نمی‌شود — دقیقاً چیزی که پیش‌تر (با session حافظه‌ای در
// verification.js) تضمین نمی‌شد.
//
// احراز هویت «نقره‌ای» این پروژه، طبق تعریف خودِ پروژه (دقیقاً همان منطق قبلی wallet.js/verification.js که
// حفظ شده)، یعنی «اعتبارسنجی فرمت + رقم کنترلی» اطلاعات کاربر، نه تطبیق مستندات با یک سرویس استعلام خارجی —
// فقط سطح «طلایی» (در wallet.js، بدون تغییر) نیازمند مدرک و تأیید دستی ادمین است. به همین دلیل نمایش
// «تأیید شد» بلافاصله پس از ورود موفق اطلاعات، دقیقاً مطابق سیاست موجود پروژه است و ادعای جدیدی اضافه نمی‌کند.

const i18n = require('../i18n');
const { resolveRules, paginate } = require('../i18n/rules');
const {
  validateFullName, validateNationalId, validateCardNumber, maskCardNumber, normalizePhone
} = require('../util/validators');
const { showMainMenu, reactToMessage } = require('../utils');
const { ensurePersistentKeyboard, sendSticker, STICKERS, persistentKeyboard } = require('./homeMenu');
const { pool, getUser, createUser, getSetting } = require('../db');
const { checkAndGrantBonuses } = require('./bonusEngine');
const { classifyUserState, pickBackStepForMissingFields } = require('./registrationState');

const LANGUAGE_PICKER_TEXT =
  '🌐 زبان خود را انتخاب کنید / Please choose your language / Lütfen dilinizi seçin';

const LANGUAGE_BUTTONS = {
  reply_markup: {
    inline_keyboard: [
      [{ text: '🇮🇷 فارسی', callback_data: 'lang_fa' }, { text: '🇬🇧 English', callback_data: 'lang_en' }],
      [{ text: '🇹🇷 Türkçe', callback_data: 'lang_tr' }]
    ]
  }
};

// آدرس bot_texts.rulesText[/_en/_tr] واقعاً به تنظیمات پنل مدیریت وصل است (نه کپی مجزا) —
// textManager از قبل این مقدارها را کش کرده؛ اینجا فقط از همان کش می‌خوانیم.
const { getText } = require('../textManager');

async function sendLanguagePicker(ctx) {
  return ctx.reply(LANGUAGE_PICKER_TEXT, LANGUAGE_BUTTONS);
}

// ==================== قوانین ====================
async function sendRulesStep(ctx, lang) {
  const resolved = resolveRules(lang, getText);
  if (!resolved.ok) {
    // خطای پیکربندی واقعی: متن قوانین برای این زبان در bot_texts/defaultRules موجود نیست.
    console.error('[registration] متن قوانین برای زبان', lang, 'در دسترس نیست — پیکربندی را در پنل مدیریت بررسی کنید.');
    return ctx.reply(i18n.t(lang, 'rules.unavailable'), {
      reply_markup: { inline_keyboard: [[{ text: '🌐', callback_data: 'onboard_lang_menu' }]] }
    });
  }
  const pages = paginate(resolved.text);
  for (let i = 0; i < pages.length - 1; i++) {
    const prefix = pages.length > 1 ? i18n.t(lang, 'rules.page_label', { current: i + 1, total: pages.length }) + '\n\n' : '';
    await ctx.reply(prefix + pages[i]);
  }
  const lastPrefix = pages.length > 1 ? i18n.t(lang, 'rules.page_label', { current: pages.length, total: pages.length }) + '\n\n' : '';
  await ctx.reply(i18n.t(lang, 'rules.intro') + '\n\n' + lastPrefix + pages[pages.length - 1], {
    reply_markup: {
      inline_keyboard: [
        [{ text: i18n.t(lang, 'rules.accept'), callback_data: 'rules_accept' }],
        [{ text: i18n.t(lang, 'rules.decline'), callback_data: 'rules_decline' }],
        [{ text: i18n.t(lang, 'rules.change_language'), callback_data: 'onboard_lang_menu' }]
      ]
    }
  });
}

// ==================== شماره همراه ====================
async function sendPhoneStep(ctx, lang) {
  return ctx.reply(i18n.t(lang, 'phone.request'), {
    reply_markup: {
      keyboard: [[{ text: i18n.t(lang, 'phone.button'), request_contact: true }]],
      resize_keyboard: true,
      one_time_keyboard: true
    }
  });
}

async function sendNameStep(ctx, lang) {
  return ctx.reply(i18n.t(lang, 'name.request'), { reply_markup: { remove_keyboard: true } });
}

async function sendNationalIdStep(ctx, lang) {
  return ctx.reply(i18n.t(lang, 'nid.request'));
}

async function sendCardStep(ctx, lang) {
  return ctx.reply(i18n.t(lang, 'card.request'));
}

// ==================== بررسی (۳ مرحله، یک پیام ویرایش‌شونده) ====================
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runProcessingAndFinalize(ctx, user, { animate }) {
  const lang = i18n.normalizeLang(user.language) || 'en';
  let chatId, msgId;
  try {
    const sent = await ctx.reply(i18n.t(lang, 'review.step1'));
    chatId = sent.chat.id;
    msgId = sent.message_id;
  } catch (e) {
    console.error('[registration] ارسال پیام بررسی ناموفق بود:', e.message);
  }

  const editTo = async (text) => {
    if (!msgId) return;
    try { await ctx.telegram.editMessageText(chatId, msgId, null, text); }
    catch (e) { /* محدودیت تلگرام (مثلاً متن یکسان یا پیام خیلی قدیمی) — مسیر ثبت‌نام را خراب نمی‌کند */ }
  };

  if (animate) {
    await wait(5000);
    await editTo(i18n.t(lang, 'review.step2'));
    await wait(5000);
    await editTo(i18n.t(lang, 'review.step3'));
    await wait(5000);
  }

  await finalizeRegistration(ctx, user, lang, editTo);
}

async function finalizeRegistration(ctx, user, lang, editTo) {
  const data = user.registration_data || {};
  const missing = ['phone', 'full_name', 'national_id', 'card'].filter((f) => !data[f]);
  if (missing.length > 0) {
    // نباید اتفاق بیفتد (هر مرحله فقط با داده‌ی معتبر پیش می‌رود) — اگر افتاد، به‌جای تأیید جعلی،
    // کاربر را به اولین مرحله‌ی ناقص برمی‌گردانیم و داده‌ی موجود را پاک نمی‌کنیم.
    console.error('[registration] اطلاعات ناقص هنگام نهایی‌سازی برای کاربر', ctx.from.id, '— فیلدهای مفقود:', missing);
    const backStep = pickBackStepForMissingFields(missing);
    await pool.query('UPDATE users SET registration_step = $2 WHERE telegram_id = $1', [String(ctx.from.id), backStep]);
    if (editTo) await editTo(i18n.t(lang, 'result.data_problem'));
    else await ctx.reply(i18n.t(lang, 'result.data_problem'));
    return sendStepPrompt(ctx, lang, backStep);
  }

  const finalUpd = await pool.query(
    `UPDATE users
        SET phone = $2, full_name = $3, national_id = $4, card_number = $5,
            verification_status = 'silver', registration_step = 'completed',
            registration_completed_at = NOW(), registration_data = '{}'::jsonb
      WHERE telegram_id = $1 AND registration_step = 'processing'
      RETURNING *`,
    [String(ctx.from.id), data.phone, data.full_name, data.national_id, data.card]
  );

  let finalUser;
  if (finalUpd.rows.length === 0) {
    // یا قبلاً (مثلاً به‌خاطر ری‌استارت هم‌زمان ربات) نهایی شده، یا وضعیت به‌طرز غیرمنتظره‌ای تغییر کرده.
    const fresh = await getUser(ctx.from.id);
    if (fresh && fresh.registration_step === 'completed') {
      await showMainMenu(ctx);
      await ensurePersistentKeyboard(ctx);
      return;
    }
    console.error('[registration] نهایی‌سازی دوباره برای کاربر', ctx.from.id, 'با وضعیت غیرمنتظره:', fresh && fresh.registration_step);
    if (editTo) await editTo(i18n.t(lang, 'result.error'));
    return;
  }
  finalUser = finalUpd.rows[0];

  try { await checkAndGrantBonuses(ctx, ctx.from.id, 'registration'); } catch (e) {}

  // بونوس دعوت: فقط وقتی دعوت‌شونده واقعاً سطح نقره‌ای را همین الان کامل کرده (منطق قبلی پروژه، بدون تغییر)
  try {
    const refClaim = await pool.query(
      'UPDATE users SET referral_counted = true WHERE telegram_id = $1 AND referrer_id IS NOT NULL AND referral_counted = false RETURNING referrer_id',
      [String(ctx.from.id)]
    );
    if (refClaim.rows.length > 0) {
      await checkAndGrantBonuses(ctx, refClaim.rows[0].referrer_id, 'referral');
    }
  } catch (e) { console.log('خطا در احتساب دعوت بعد از احراز نقره‌ای:', e.message); }

  const limit = await getSetting('silver_daily_limit', '2000000');
  const resultText = i18n.t(lang, 'result.silver', {
    full_name: finalUser.full_name,
    phone: finalUser.phone,
    masked_card: maskCardNumber(finalUser.card_number),
    limit: i18n.formatNumber(limit, lang)
  });

  if (editTo) await editTo(resultText);
  else await ctx.reply(resultText);

  await showMainMenu(ctx);
  await ensurePersistentKeyboard(ctx);
}

// ==================== ارسال پیام متناسب با هر مرحله ====================
async function sendStepPrompt(ctx, lang, step) {
  if (step === 'phone') return sendPhoneStep(ctx, lang);
  if (step === 'name') return sendNameStep(ctx, lang);
  if (step === 'national_id') return sendNationalIdStep(ctx, lang);
  if (step === 'card') return sendCardStep(ctx, lang);
  return null;
}

// نمایش «همین الان دقیقاً کجای مسیر هستی» — هم از /start، هم بعد از تغییر زبان، هم از دکمه‌ی Home،
// هم از دروازه‌ی دسترسی خرید/فروش صدا زده می‌شود؛ هیچ داده‌ای پاک نمی‌کند.
async function renderCurrentState(ctx, user) {
  const state = classifyUserState(user);

  if (state.kind === 'no_language') return sendLanguagePicker(ctx);
  if (state.kind === 'bad_language') {
    // زبان ذخیره‌شده دیگر پشتیبانی نمی‌شود (داده‌ی خراب/قدیمی) — دوباره از کاربر می‌پرسیم
    console.error('[registration] زبان ذخیره‌شده‌ی نامعتبر برای کاربر', ctx.from.id, ':', state.rawLanguage);
    return sendLanguagePicker(ctx);
  }
  if (state.kind === 'rules') return sendRulesStep(ctx, state.lang);
  if (state.kind === 'processing') return runProcessingAndFinalize(ctx, user, { animate: false });
  if (state.kind === 'completed') {
    await showMainMenu(ctx);
    return ensurePersistentKeyboard(ctx);
  }
  if (state.kind === 'step') return sendStepPrompt(ctx, state.lang, state.step);

  // unknown_step (داده‌ی خراب) — امن‌ترین کار: بازگشت به ابتدای مسیر بدون پاک کردن دیتای واقعی کاربر
  console.error('[registration] registration_step نامعتبر برای کاربر', ctx.from.id, ':', state.step);
  return sendRulesStep(ctx, state.lang);
}

// دروازه‌ی دسترسی عمومی: هر هندلر دیگری (خرید/فروش/...) که نیاز به «ثبت‌نام کامل» دارد این را صدا می‌زند.
// خروجی {ok:true,user} یعنی کاربر کاملاً ثبت‌نام کرده؛ {ok:false} یعنی پیام هدایت already ارسال شده.
async function requireCompletedRegistration(ctx) {
  const user = await getUser(ctx.from.id);
  if (user && user.registration_step === 'completed') return { ok: true, user };

  const lang = (user && i18n.normalizeLang(user.language)) || 'en';
  try { await ctx.reply(i18n.t(lang, 'access.registration_required')); } catch (e) {}
  if (user) await renderCurrentState(ctx, user);
  else await sendLanguagePicker(ctx);
  return { ok: false, user };
}

module.exports = function registerRegistrationHandlers(bot) {

  bot.start(async (ctx) => {
    const userId = ctx.from.id;
    let user = await getUser(userId);
    let referrerId = ctx.startPayload || null;

    // رفع باگ امنیتی/سوءاستفاده: جلوگیری از «خوددعوتی» (منطق قبلی پروژه، بدون تغییر)
    if (referrerId && String(referrerId) === String(userId)) {
      referrerId = null;
    }

    if (!user) {
      await createUser(userId, null, null, null, null, referrerId);
      user = await getUser(userId);
    }

    if (user.registration_step === 'completed') {
      if (ctx.message && ctx.message.message_id) {
        reactToMessage(ctx, ctx.chat.id, ctx.message.message_id, true);
      }
      // ⚠️ رفع درخواست: قبلاً هر بار /start یک پیام تنهای «🔘» هم اضافه می‌آمد (ensurePersistentKeyboard)،
      // فقط برای چسباندن کیبورد پایین (Home/Live Price). حالا همان کیبورد به همین استیکر START
      // (که در هر صورت همیشه فرستاده می‌شود) چسبانده می‌شود — بدون هیچ پیام اضافه‌ای.
      await sendSticker(ctx, STICKERS.START, { reply_markup: persistentKeyboard() });
      return showMainMenu(ctx);
    }

    return renderCurrentState(ctx, user);
  });

  // انتخاب/تغییر زبان — یک هندلر برای هر دو حالت: اولین انتخاب (کاربر تازه) و تغییر زبان وسط مسیر.
  // اطلاعات ثبت‌نام و مرحله‌ی فعلی هرگز با تغییر زبان پاک نمی‌شوند؛ فقط خودِ زبان عوض و همان مرحله
  // دوباره (این‌بار به زبان جدید) نمایش داده می‌شود.
  bot.action(/^lang_(fa|en|tr)$/, async (ctx) => {
    const lang = ctx.match[1];
    const userId = ctx.from.id;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const before = await getUser(userId);
    const isFirstPick = !before || !before.language;
    const fields = isFirstPick ? ['language = $1', "registration_step = 'rules'"] : ['language = $1'];
    const upd = await pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE telegram_id = $2 RETURNING *`,
      [lang, String(userId)]
    );
    const user = upd.rows[0] || await getUser(userId);
    return renderCurrentState(ctx, user);
  });

  // دکمه‌ی «🌐» برای تغییر زبان از وسط هر مرحله‌ای (رفع نیاز: تغییر زبان بدون پاک شدن داده)
  bot.action('onboard_lang_menu', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    return sendLanguagePicker(ctx);
  });

  bot.action('rules_accept', async (ctx) => {
    const userId = ctx.from.id;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const user = await getUser(userId);
    const lang = user && i18n.normalizeLang(user.language);
    if (!lang) return sendLanguagePicker(ctx);

    const resolved = resolveRules(lang, getText);
    if (!resolved.ok) return sendRulesStep(ctx, lang); // دوباره خطای پیکربندی را نشان بده

    await pool.query(
      `UPDATE users SET rules_accepted_at = NOW(), rules_version = $2, registration_step = 'phone'
        WHERE telegram_id = $1`,
      [String(userId), resolved.version]
    );
    return sendPhoneStep(ctx, lang);
  });

  bot.action('rules_decline', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    const user = await getUser(ctx.from.id);
    const lang = (user && i18n.normalizeLang(user.language)) || 'en';
    return ctx.reply(i18n.t(lang, 'rules.declined'), {
      reply_markup: { inline_keyboard: [[{ text: i18n.t(lang, 'rules.show_again'), callback_data: 'rules_show_again' }]] }
    });
  });

  bot.action('rules_show_again', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    const user = await getUser(ctx.from.id);
    const lang = (user && i18n.normalizeLang(user.language)) || null;
    if (!lang) return sendLanguagePicker(ctx);
    return sendRulesStep(ctx, lang);
  });

  // ==================== شماره همراه (فقط از طریق دکمه‌ی رسمی تلگرام) ====================
  bot.on('contact', async (ctx, next) => {
    const user = await getUser(ctx.from.id);
    if (!user || user.registration_step !== 'phone') return next();
    const lang = i18n.normalizeLang(user.language) || 'en';

    if (ctx.message.contact.user_id !== ctx.from.id) {
      return ctx.reply(i18n.t(lang, 'phone.invalid_owner'));
    }
    const phoneCheck = normalizePhone(ctx.message.contact.phone_number);
    if (!phoneCheck.ok) {
      return ctx.reply(i18n.t(lang, 'phone.invalid_owner'));
    }

    await pool.query(
      `UPDATE users SET registration_data = registration_data || $2::jsonb, registration_step = 'name'
        WHERE telegram_id = $1 AND registration_step = 'phone'`,
      [String(ctx.from.id), JSON.stringify({ phone: phoneCheck.value })]
    );
    return sendNameStep(ctx, lang);
  });

  // ==================== ورودی‌های متنی مسیر ثبت‌نام ====================
  bot.on('text', async (ctx, next) => {
    const user = await getUser(ctx.from.id);
    if (!user) return next();

    const raw = ctx.message.text || '';
    if (raw.startsWith('/')) return next(); // دستورها (مثل /start) جای دیگری پردازش می‌شوند

    if (!user.language) return next(); // هنوز زبانی انتخاب نشده؛ فقط با دکمه قابل انتخاب است

    const lang = i18n.normalizeLang(user.language);
    if (!lang) return next();

    const step = user.registration_step;

    if (!step || step === 'rules') { return sendRulesStep(ctx, lang); }

    if (step === 'phone') { return ctx.reply(i18n.t(lang, 'phone.use_button')); }

    if (step === 'name') {
      const res = validateFullName(raw);
      if (!res.ok) return ctx.reply(i18n.t(lang, 'name.invalid'));
      await pool.query(
        `UPDATE users SET registration_data = registration_data || $2::jsonb, registration_step = 'national_id'
          WHERE telegram_id = $1 AND registration_step = 'name'`,
        [String(ctx.from.id), JSON.stringify({ full_name: res.value })]
      );
      return sendNationalIdStep(ctx, lang);
    }

    if (step === 'national_id') {
      const res = validateNationalId(raw);
      if (!res.ok) return ctx.reply(i18n.t(lang, res.code === 'length' ? 'nid.error_length' : 'nid.error_check'));
      await pool.query(
        `UPDATE users SET registration_data = registration_data || $2::jsonb, registration_step = 'card'
          WHERE telegram_id = $1 AND registration_step = 'national_id'`,
        [String(ctx.from.id), JSON.stringify({ national_id: res.value })]
      );
      return sendCardStep(ctx, lang);
    }

    if (step === 'card') {
      const res = validateCardNumber(raw);
      if (!res.ok) return ctx.reply(i18n.t(lang, res.code === 'length' ? 'card.error_length' : 'card.error_check'));
      const upd = await pool.query(
        `UPDATE users SET registration_data = registration_data || $2::jsonb, registration_step = 'processing'
          WHERE telegram_id = $1 AND registration_step = 'card' RETURNING *`,
        [String(ctx.from.id), JSON.stringify({ card: res.value })]
      );
      if (upd.rows.length === 0) {
        const fresh = await getUser(ctx.from.id);
        return renderCurrentState(ctx, fresh);
      }
      return runProcessingAndFinalize(ctx, upd.rows[0], { animate: true });
    }

    if (step === 'processing') {
      return ctx.reply(i18n.t(lang, 'review.running'));
    }

    return next(); // registration_step === 'completed' → بقیه‌ی پیام‌های متنی مال فلوهای دیگرند
  });

};

module.exports.requireCompletedRegistration = requireCompletedRegistration;
module.exports.renderCurrentState = renderCurrentState;
