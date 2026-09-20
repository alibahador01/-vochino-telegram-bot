// support/rules.js
// «Business Knowledge» آزاده که ادمین از پنل اضافه می‌کنه (فایل knowledge/retrieval.js).
// «Business Rules» قوانین سخت و قطعی‌ان که نباید دست مدل/Retrieval باشن، وگرنه ممکنه یه
// روز به‌خاطر یه Knowledge نامرتبط رقیق بشن یا فراموش بشن. برای همین این‌جا به‌صورت کد
// قطعی پیاده شدن (بخش ۹ تا ۱۲ سند) و همیشه، مستقل از این‌که چی retrieve شده، به‌عنوان یه
// بلاک جداگانه و «غیرقابل‌مذاکره» به System Prompt اضافه می‌شن.

const BUSINESS_RULES = {
  wise_rejection:
    'قانون قطعی Wise Rejection: اگه انتقال Wise کاربر رد شده، اول محتمل‌ترین دلیل رایج (مغایرت نام) رو بررسی کن — ' +
    'نام صاحب کارت/حساب مبدأ باید دقیقاً با نام حساب Wise یکی باشه. اگه کاربر تأیید کرد که اسم‌ها یکیه و مشکل همچنان ' +
    'برقراره، حتماً و بدون تعارف باید `[NEED_SUPPORT]` بذاری (نیاز به بررسی انسانیه) — دیگه دلیل دیگه‌ای از خودت نساز.',
  wise_withdrawal:
    'قانون قطعی Wise Withdrawal: وقتی مشتری فقط می‌پرسه برداشتش کی می‌رسه، بگو «در حال بررسیه». اگه مشخصاً پرسید ' +
    'حداکثر چقدر طول می‌کشه، بگو «حداکثر تا ۲۴ ساعت» و توضیح بده این به‌خاطر فرآیند بررسی/امنیتیه. هرگز عدد یا بازه‌ی ' +
    'زمانی دیگه‌ای از خودت نساز.',
  sell:
    'قانون قطعی Sell: فروش معمولاً خیلی سریع و در یه بازه‌ی کوتاه انجام می‌شه. هرگز عدد دقیق دقیقه‌ای/ساعتی از خودت نساز.',
  buy_normal:
    'قانون قطعی Buy: زمان معمول تحویل خرید حدود ۵ تا ۱۰ دقیقه‌ست.',
  buy_overdue:
    'قانون قطعی Buy Overdue: کاربر گفته خریدش بیشتر از زمان معمول (۵ تا ۱۰ دقیقه) طول کشیده. اینجا مطلقاً حدس نزن و ' +
    'اطمینان دروغین نده (نگو «الان میاد» یا «چند لحظه دیگه»). حتماً `[NEED_SUPPORT]` بذار تا بررسی انسانی انجام بشه.'
};

// تشخیص موضوع از روی متن پیام — سبک و بدون فراخوانی اضافه‌ی AI.
function detectTopic(text) {
  const t = text || '';
  const hasWise = /(وایز|wise)/i.test(t);
  const hasReject = /(رد شد|رد شده|برگشت خورد|برگشت‌خورد|reject|ریجکت)/i.test(t);
  const arrivalQuery = /(کی میاد|کی می‌رسه|کی میرسه|چقدر طول می‌کشه|چقدر طول میکشه|هنوز نیومده|هنوز نرسیده|برداشت|withdraw)/i.test(t);
  const hasBuy = /(خرید|buy)/i.test(t);
  const hasSell = /(فروش|sell)/i.test(t);
  const overdue = /(دیر شده|طول کشیده|نیومده|نرسیده|ساعته|دقیقه‌ست|دقیقس|هنوز نیومد)/i.test(t);

  if (hasWise && hasReject) return 'wise_rejection';
  if (hasWise && arrivalQuery) return 'wise_withdrawal';
  if (hasBuy && overdue) return 'buy_overdue';
  if (hasBuy) return 'buy_normal';
  if (hasSell) return 'sell';
  return null;
}

function getBusinessRuleText(topic) {
  return BUSINESS_RULES[topic] || null;
}

function detectNameMatchConfirmation(text) {
  return /(یکیه|یکیه‌ن|درسته|مطابقت|همینه|هم‌نامن|دقیقاً یکیه|دقیقا یکیه)/i.test(text || '');
}

// وضعیت پشتیبانی رو در همون session.data نگه می‌داریم (حافظه‌ی محدود به همون گفتگوی فعال،
// دقیقاً هم‌راستا با idle/mute فعلی) — نیازی به جدول DB جدید نیست چون این وضعیت گذراست.
function evaluateSupportState(session, currentTopicDetected, cleanedText) {
  if (!session.data.supportState) {
    session.data.supportState = { topic: null, attempts: 0, forceEscalate: false };
  }
  const state = session.data.supportState;

  // اگه تو همین پیام موضوع جدیدی تشخیص داده نشد ولی یه موضوع باز از قبل هست (مثلاً پیام
  // بعدی فقط «اسم‌ها یکیه»)، همون موضوع قبلی رو ادامه بده — این دقیقاً «تشخیص وضعیت مکالمه»‌ی
  // بخش ۱۵ سنده که جلوی «شروع دوباره از صفر» رو می‌گیره.
  const topic = currentTopicDetected || state.topic;

  if (topic !== state.topic) {
    state.topic = topic;
    state.attempts = topic ? 1 : 0;
    state.forceEscalate = false;
  } else if (topic) {
    state.attempts += 1;
  }

  if (topic === 'wise_rejection' && detectNameMatchConfirmation(cleanedText)) {
    state.forceEscalate = true;
  }
  if (topic === 'buy_overdue') {
    state.forceEscalate = true;
  }
  if (topic && state.attempts >= 3) {
    // کاربر سه‌بار پشت‌سرهم روی همین موضوع پیگیریه و هنوز حل نشده
    state.forceEscalate = true;
  }

  return { topic, attempts: state.attempts, forceEscalate: state.forceEscalate };
}

async function hasOpenTicket(pool, telegramId) {
  const res = await pool.query(
    "SELECT * FROM ai_support_tickets WHERE telegram_id=$1 AND status IN ('open','answered') ORDER BY id DESC LIMIT 1",
    [String(telegramId)]
  );
  return res.rows[0] || null;
}

module.exports = { detectTopic, getBusinessRuleText, evaluateSupportState, hasOpenTicket, detectNameMatchConfirmation };
