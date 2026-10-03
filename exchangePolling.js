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

const POLL_INTERVAL_MS = 30 * 1000;
let pollTimer = null;
let isPolling = false; // جلوگیری از هم‌پوشانی دو دور پولینگ اگر یک دور طول بکشد

async function finalizeOne(order, status, receive, bot) {
  const product = await getSellProductByKey(order.product_type);
  const { commission, payout } = calculateSellPayout(Number(order.amount || 0), product || {});
  const outcome = status === 'confirm' ? 'approved' : 'rejected';

  const fin = await finalizeSellOrderUwallet(order.id, {
    outcome,
    payout,
    commission,
    apiCost: receive !== undefined ? receive : 0
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

async function pollOnce(bot) {
  if (isPolling) return; // دور قبلی هنوز تمام نشده — این دور را رد کن تا دوبل اجرا نشود
  isPolling = true;
  try {
    const pendingOrders = await getPendingUwalletSellOrders();
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
          await finalizeOne(order, statusRes.status, statusRes.receive, bot);
        }
        // هر وضعیت دیگری یعنی هنوز pending — کاری نکن، دور بعدی (۳۰ ثانیه دیگر) دوباره چک می‌شود
      } catch (e) {
        console.log(`❌ خطا در پولینگ سفارش فروش #${order.id}:`, e.message);
      }
    }
  } catch (e) {
    console.log('❌ خطا در گرفتن لیست سفارش‌های pending_uwallet:', e.message);
  } finally {
    isPolling = false;
  }
}

function start(bot) {
  if (pollTimer) return; // قبلاً استارت شده
  pollTimer = setInterval(() => {
    pollOnce(bot).catch(e => console.log('❌ خطای کلی پولینگ uWallet:', e.message));
  }, POLL_INTERVAL_MS);
  console.log('⏱️ پولینگ uWallet هر 30 ثانیه فعال شد.');
}

function stop() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

module.exports = { start, stop, pollOnce };
