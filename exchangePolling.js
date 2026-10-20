// exchangePolling.js
// جاب پولینگ ۳۰ ثانیه‌ای uWallet — طبق مستندات رسمی‌شان: وقتی /v1/voucher/use وضعیت
// 'pending' برمی‌گرداند، باید هر ۳۰ ثانیه GET /v1/transaction?id=... چک شود تا به
// 'confirm' یا 'reject' برسد. این فایل دقیقاً همان کار را برای همه‌ی سفارش‌های فروشِ
// «در انتظار uWallet» (status='pending_uwallet') انجام می‌دهد.
//
// نکته‌ی مهم: وبهوک (/webhook/uwallet در index.js) هم می‌تواند همین تراکنش را زودتر نهایی کند.
// برای همین نهایی‌سازی همیشه از finalizeSellOrderUwallet (اتمیک، با قفل ردیف) انجام می‌شود —
// هرکدام از این دو مسیر که زودتر برسد، همان یک‌بار موجودی کاربر را شارژ می‌کند و مسیر دوم
// چیزی جز {applied:false} نمی‌بیند. این همان رفع باگ «شارژ دوباره‌ی کیف‌پول» است.

const { getPendingUwalletSellOrders, getApiSourceById, getSellProductByKey, finalizeSellOrderUwallet, logTransaction } = require('./db');
const { calculateSellPayout } = require('./exchangeEngine');
const uwallet = require('./uwallet');
const { describeError } = require('./util/http');

// ⚠️ رفع باگ مصرف غیرضروری Neon: قبلاً این جاب با setInterval ثابتِ ۳۰ ثانیه، برای همیشه (۲۴/۷)
// دیتابیس را کوئری می‌کرد — حتی وقتی صف سفارش‌های pending_uwallet کاملاً خالی بود (دقیقاً حالتِ
// این پروژه با ۱۲ کاربر و صفر معامله). چون Neon کامپیوت را فقط بعد از ~۵ دقیقه بی‌کاری واقعی به
// خواب می‌برد (scale to zero)، یک کوئری هر ۳۰ ثانیه یعنی کامپیوت هرگز نمی‌خوابد — دقیقاً علت
// مصرف ۸۵٪ کوئوتای ماهانه بدون هیچ کاربر واقعی.
// راه‌حل: بک‌آف تطبیقی. وقتی صف خالی است، فاصله‌ی چک بعدی بلند می‌شود (IDLE_INTERVAL_MS) تا بین
// دو چک، کامپیوت واقعاً بی‌کار بماند و Neon بتواند به خواب برود؛ به محض این‌که سفارش جدیدی وارد
// pending_uwallet شود (از exchangeEngine.js با wake())، فوراً به حالت تند (ACTIVE_INTERVAL_MS)
// برمی‌گردد تا تجربه‌ی کاربر واقعی کندتر نشود. وبهوک /webhook/uwallet همچنان مسیر اصلیِ سریع است؛
// این فقط یک پشتیبان است، پس کند شدنش در حالت بی‌کار هیچ معامله‌ی واقعی را عقب نمی‌اندازد.
const ACTIVE_INTERVAL_MS = 30 * 1000;       // وقتی واقعاً سفارش در انتظار uWallet داریم
const IDLE_INTERVAL_MS = 10 * 60 * 1000;    // وقتی صف خالی است — دیگر هر ۳۰ ثانیه دلیلی ندارد
const WAKE_DELAY_MS = 5 * 1000;             // بلافاصله بعد از ورود یک سفارش جدید به صف
let pollTimer = null;
let isPolling = false; // جلوگیری از هم‌پوشانی دو دور پولینگ اگر یک دور طول بکشد
let startedBot = null;

async function finalizeOne(order, status, providerCost, bot) {
  const product = await getSellProductByKey(order.product_type);
  const { commission, payout } = calculateSellPayout(Number(order.amount || 0), product || {});
  const outcome = status === 'confirm' ? 'approved' : 'rejected';

  const fin = await finalizeSellOrderUwallet(order.id, {
    outcome,
    payout,
    commission,
    apiCost: providerCost !== undefined ? providerCost : 0
  });

  // applied=false یعنی وبهوک (یا یک دور پولینگ دیگر) زودتر همین سفارش را نهایی کرده — کاری نکن
  if (!fin.applied) return;

  try {
    await logTransaction(
      order.telegram_id,
      outcome === 'approved' ? 'sell' : 'refund',
      outcome === 'approved' ? payout : 0,
      `فروش نهایی‌شده با پولینگ uWallet (${order.tracking_code})`
    );
  } catch (e) {}

  if (bot) {
    try {
      const msg = outcome === 'approved'
        ? `✅ فروش شما تأیید شد.\n💰 ${payout.toLocaleString('en-US')} تومان به کیف پول اضافه شد.\n🆔 ${order.tracking_code}`
        : `❌ فروش شما رد شد (کد نامعتبر یا قبلاً استفاده‌شده).\n🆔 ${order.tracking_code}`;
      await bot.telegram.sendMessage(order.telegram_id, msg);
    } catch (e) {}
  }
}

// خروجی: تعداد سفارش‌های واقعاً pending که این دور دیده (برای تصمیم‌گیری بک‌آف در scheduleNext).
// اگر دور قبلی هنوز در حال اجراست، صفر برمی‌گرداند (نه خالی‌بودن واقعی صف) تا بک‌آف اشتباه نشود.
async function pollOnce(bot) {
  if (isPolling) return 0; // دور قبلی هنوز تمام نشده — این دور را رد کن تا دوبل اجرا نشود
  isPolling = true;
  let pendingCount = 0;
  try {
    const pendingOrders = await getPendingUwalletSellOrders();
    pendingCount = pendingOrders.length;
    for (const order of pendingOrders) {
      try {
        const apiSource = await getApiSourceById(order.api_source_id);
        if (!apiSource) continue;

        const statusRes = await uwallet.getTransactionStatus(apiSource, order.provider_tx_id);
        if (!statusRes.success) {
          // خطای موقت یا هنوز چیزی برنگشته — دور بعدی دوباره امتحان می‌شود، سفارش دست‌نخورده می‌ماند
          continue;
        }
        if (statusRes.status === 'confirm' || statusRes.status === 'reject') {
          // کارمزد دقیق uWallet (fee) رو ترجیح می‌دیم؛ اگه نبود receive به‌عنوان بهترین تخمین
          const cost = statusRes.fee !== undefined ? statusRes.fee : statusRes.receive;
          await finalizeOne(order, statusRes.status, cost, bot);
        }
        // هر وضعیت دیگری یعنی هنوز pending — کاری نکن، دور بعدی (۳۰ ثانیه دیگر) دوباره چک می‌شود
      } catch (e) {
        console.log(`❌ خطا در پولینگ سفارش فروش #${order.id}:`, describeError(e));
      }
    }
  } catch (e) {
    // ⚠️ رفع باگ لاگ خالی: قبلاً اینجا e.message چاپ می‌شد که گاهی خالی بود؛ الان با describeError
    // کد خطای Postgres و detail هم چاپ می‌شه (مثلاً اگر ستون/جدول وجود نداشته باشه، اینجا دقیقاً
    // «relation ... does not exist» یا «column ... does not exist» رو می‌بینی، نه یک خط خالی).
    console.log('❌ خطا در گرفتن لیست سفارش‌های pending_uwallet:', describeError(e));
  } finally {
    isPolling = false;
  }
  return pendingCount;
}

// برنامه‌ریزی دور بعدی با setTimeout (نه setInterval ثابت) تا فاصله‌ی چک بعدی بتواند بر اساس
// نتیجه‌ی همین دور (صف خالی/پر) تغییر کند.
function scheduleNext(bot, delayMs) {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = setTimeout(async () => {
    let pendingCount = 0;
    try {
      pendingCount = await pollOnce(bot);
    } catch (e) {
      console.log('❌ خطای کلی پولینگ uWallet:', describeError(e));
    }
    scheduleNext(bot, pendingCount > 0 ? ACTIVE_INTERVAL_MS : IDLE_INTERVAL_MS);
  }, delayMs);
}

function start(bot) {
  if (pollTimer) return; // قبلاً استارت شده
  startedBot = bot;
  scheduleNext(bot, ACTIVE_INTERVAL_MS);
  console.log('⏱️ پولینگ تطبیقی uWallet فعال شد (فعال: هر 30 ثانیه، بی‌کار: هر 10 دقیقه).');
}

// صدا زده می‌شود دقیقاً وقتی یک سفارش فروش تازه وارد pending_uwallet می‌شود (از exchangeEngine.js) —
// به‌جای صبر تا ۱۰ دقیقه‌ی بعدیِ حالت بی‌کار، چند ثانیه دیگر دوباره چک می‌کند.
function wake() {
  if (!startedBot) return; // هنوز start() صدا زده نشده
  scheduleNext(startedBot, WAKE_DELAY_MS);
}

function stop() {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  startedBot = null;
}

module.exports = { start, stop, pollOnce, wake };
