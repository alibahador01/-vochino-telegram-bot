// handlers/bonusEngine.js
const { pool, getUser, getSetting } = require('../db');

/**
 * بررسی و اعطای بونوس‌های سه‌گانه (ثبت‌نام، اولین خرید، دعوت)
 * @param {object} ctx - context تلگرام
 * @param {string} userId - telegram_id
 * @param {string} eventType - 'registration', 'purchase', 'referral'
 */
async function checkAndGrantBonuses(ctx, userId, eventType) {
  const user = await getUser(userId);
  if (!user) return;

  // --- بونوس ثبت‌نام ---
  if (eventType === 'registration') {
    const regActive = (await getSetting('bonus_registration_active', 'false')) === 'true';
    const regActivatedAt = await getSetting('bonus_registration_activated_at', null);
    const regGift = parseInt(await getSetting('bonus_registration_gift', '0'), 10);
    if (regActive && regGift > 0 && !user.reg_bonus_received) {
      if (regActivatedAt && user.registered_at) {
        const activatedDate = new Date(regActivatedAt);
        const userRegDate = new Date(user.registered_at);
        if (userRegDate >= activatedDate) {
          await pool.query('UPDATE users SET bonus_balance = bonus_balance + $1, reg_bonus_received = true WHERE telegram_id = $2', [regGift, userId]);
          try { ctx.telegram.sendMessage(userId, `🎁 بونوس ثبت‌نام: ${regGift.toLocaleString()} تومان به بونوس شما اضافه شد.`); } catch (e) {}
        }
      }
    }
  }

  // --- بونوس اولین خرید ---
  if (eventType === 'purchase') {
    const buyActive = (await getSetting('bonus_first_purchase_active', 'false')) === 'true';
    const buyMinAmount = parseInt(await getSetting('bonus_first_purchase_min_amount', '0'), 10);
    const buyGift = parseInt(await getSetting('bonus_first_purchase_gift', '0'), 10);
    const buyActivatedAt = await getSetting('bonus_first_purchase_activated_at', null);
    if (buyActive && buyGift > 0 && !user.first_purchase_bonus_received) {
      let query = "SELECT COALESCE(SUM(amount),0) AS total FROM orders WHERE telegram_id = $1 AND status = 'completed'";
      const params = [userId];
      if (buyActivatedAt) {
        query += ' AND created_at >= $2';
        params.push(buyActivatedAt);
      }
      const res = await pool.query(query, params);
      const total = Number(res.rows[0].total);
      if (total >= buyMinAmount && total > 0) {
        await pool.query('UPDATE users SET bonus_balance = bonus_balance + $1, first_purchase_bonus_received = true WHERE telegram_id = $2', [buyGift, userId]);
        try { ctx.telegram.sendMessage(userId, `🎁 بونوس اولین خرید: ${buyGift.toLocaleString()} تومان به بونوس شما اضافه شد.`); } catch (e) {}
      }
    }
  }

  // --- بونوس دعوت (ثبت‌نام دعوت‌شونده) ---
  if (eventType === 'referral') {
    const refActive = (await getSetting('bonus_referral_active', 'false')) === 'true';
    const refThreshold = parseInt(await getSetting('bonus_referral_threshold', '1'), 10);
    const refGift = parseInt(await getSetting('bonus_referral_gift', '0'), 10);
    const refActivatedAt = await getSetting('bonus_referral_activated_at', null);
    if (refActive && refGift > 0 && refThreshold > 0) {
      let query = "SELECT COUNT(*)::int AS cnt FROM users WHERE referrer_id = $1";
      const params = [userId];
      if (refActivatedAt) {
        query += ' AND registered_at >= $2';
        params.push(refActivatedAt);
      }
      const cntRes = await pool.query(query, params);
      const totalReferrals = cntRes.rows[0].cnt;

      const receivedCount = user.ref_bonus_count || 0;
      const eligibleBonuses = Math.floor(totalReferrals / refThreshold) - receivedCount;
      if (eligibleBonuses > 0) {
        const totalGift = eligibleBonuses * refGift;
        await pool.query('UPDATE users SET bonus_balance = bonus_balance + $1, ref_bonus_count = $2 WHERE telegram_id = $3', [totalGift, receivedCount + eligibleBonuses, userId]);
        try { ctx.telegram.sendMessage(userId, `🎁 بونوس دعوت (${eligibleBonuses}×): ${totalGift.toLocaleString()} تومان به بونوس شما اضافه شد.`); } catch (e) {}
      }
    }
  }
}

/**
 * طرح سود مادام‌العمر: به‌ازای هر خرید موفقِ کاربر دعوت‌شده، درصدی از مبلغ خرید
 * مستقیم و بلافاصله به موجودی اصلی (کیف پول) دعوت‌کننده واریز می‌شود.
 * فقط زمانی فعال است که bonus_referral_percent_active روشن باشد؛ مستقل از بونوس ثبت‌نامی دعوت است.
 * @param {object} ctx - context تلگرام
 * @param {string} buyerId - telegram_id خریدار (دعوت‌شونده)
 * @param {number} purchaseAmount - مبلغ خرید (پایه، بدون کارمزد خود سیستم)
 */
async function checkAndGrantReferralCommission(ctx, buyerId, purchaseAmount) {
  const percentActive = (await getSetting('bonus_referral_percent_active', 'false')) === 'true';
  const percentValue = parseFloat(await getSetting('bonus_referral_percent', '0'));
  if (!percentActive || !percentValue || percentValue <= 0) return;

  const buyer = await getUser(buyerId);
  if (!buyer || !buyer.referrer_id) return;

  const referrer = await getUser(buyer.referrer_id);
  if (!referrer) return;

  const commission = Math.round(Number(purchaseAmount) * (percentValue / 100));
  if (commission <= 0) return;

  await pool.query('UPDATE users SET balance = balance + $1 WHERE telegram_id = $2', [commission, referrer.telegram_id]);
  try {
    const { logTransaction } = require('../db');
    await logTransaction(referrer.telegram_id, 'bonus', commission, `سود مادام‌العمر از خرید کاربر دعوت‌شده (${percentValue}٪)`);
  } catch (e) {}
  try {
    await ctx.telegram.sendMessage(referrer.telegram_id,
      `♾️ سود دعوت شما\n\n💰 ${commission.toLocaleString('en-US')} تومان (${percentValue}٪ از خرید یکی از دعوت‌شده‌هایتان) به کیف پول شما اضافه شد.`
    );
  } catch (e) {}
}

module.exports = { checkAndGrantBonuses, checkAndGrantReferralCommission };
