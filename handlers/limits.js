// handlers/limits.js
// سقف مجموع خرید و فروش روزانه — منطق واحد، مستقل از UI، برای استفاده در مسیر ثبت‌نام و در هندلرهای خرید/فروش.
// منبع این منطق قبلاً داخل handlers/verification.js بود (تابع checkDailyLimit)؛ همان رفتار دقیق حفظ شده،
// فقط از فایل UI ثبت‌نام جدا شده تا هندلرهای خرید/فروش بدون وابستگی به فلوی ثبت‌نام به آن دسترسی داشته باشند
// (طبق قاعده‌ی پروژه: «برای کاری که قبلاً وجود دارد وضعیت یا منطق موازی نساز»).
const { getUser, getSetting, pool } = require('../db');

// همان تعریف پیشین پروژه برای سقف: مجموع خرید (orders: pending_delivery/completed) + فروش (sell_orders:
// pending_review/approved) در روز جاری، برای کاربر «نقره‌ای» یا «طلایی»؛ کاربر بدون احراز هیچ سقفی اینجا ندارد
// (سقف مهمان/بدون‌احراز در این محصول وجود ندارد چون اکنون ورود به منوی اصلی مستلزم تکمیل احراز نقره‌ای است).
async function checkDailyLimit(telegramId, extraAmount) {
  const user = await getUser(telegramId);
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
  if (used + Number(extraAmount) > limit) return { ok: false, limit, used, tier, remaining: Math.max(0, limit - used) };
  return { ok: true, limit, used, tier, remaining: Math.max(0, limit - used) };
}

module.exports = { checkDailyLimit };
