// handlers/bonusEngine.js
const { pool, getUser, getSetting } = require('../db');

async function logGift(telegramId, amount, afterBalance, description) {
  try {
    await pool.query(
      'INSERT INTO transaction_logs (telegram_id, type, amount, balance_before, balance_after, description, created_at) VALUES ($1,$2,$3,$4,$5,$6,NOW())',
      [String(telegramId), 'gift', amount, afterBalance - amount, afterBalance, description]
    );
  } catch (e) {}
}

async function checkAndGrantBonuses(ctx, userId, eventType) {
  const user = await getUser(userId);
  if (!user) return;

  if (eventType === 'registration') {
    const regActive = (await getSetting('bonus_registration_active', 'false')) === 'true';
    const regActivatedAt = await getSetting('bonus_registration_activated_at', null);
    const regGift = parseInt(await getSetting('bonus_registration_gift', '0'), 10);
    if (regActive && regGift > 0 && !user.reg_bonus_received) {
      if (regActivatedAt && user.registered_at) {
        const activatedDate = new Date(regActivatedAt);
        const userRegDate = new Date(user.registered_at);
        if (userRegDate >= activatedDate) {
          const upd = await pool.query(
            'UPDATE users SET balance = balance + $1, reg_bonus_received = true WHERE telegram_id = $2 AND reg_bonus_received = false RETURNING balance',
            [regGift, userId]
          );
          if (upd.rowCount > 0) {
            const after = Number(upd.rows[0].balance);
            await logGift(userId, regGift, after, 'هدیه‌ی خوش‌آمدگویی ثبت‌نام');
            try {
              ctx.telegram.sendMessage(
                userId,
                '🎉 به ووچینو⁰۱ خوش اومدی!\n\n' +
                `🎁 ${regGift.toLocaleString()} تومان هدیه‌ی خوش‌آمدگویی همین الان به کیف پولت اضافه شد.\n\n` +
                'همین حالا هم می‌تونی ازش برای خرید استفاده کنی ✨'
              );
            } catch (e) {}
          }
        }
      }
    }
  }

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
        const upd = await pool.query(
          'UPDATE users SET balance = balance + $1, first_purchase_bonus_received = true WHERE telegram_id = $2 AND first_purchase_bonus_received = false RETURNING balance',
          [buyGift, userId]
        );
        if (upd.rowCount > 0) {
          const after = Number(upd.rows[0].balance);
          await logGift(userId, buyGift, after, 'هدیه‌ی اولین خرید');
          try {
            ctx.telegram.sendMessage(
              userId,
              '🛍 هدیه‌ی اولین خرید\n\n' +
              `🎁 ${buyGift.toLocaleString()} تومان مستقیم به کیف پولت اضافه شد.\n\n` +
              'ممنون که ووچینو⁰۱ رو برای اولین خریدت انتخاب کردی 💙'
            );
          } catch (e) {}
        }
      }
    }
  }

  if (eventType === 'referral') {
    const refActive = (await getSetting('bonus_referral_active', 'false')) === 'true';
    const refThreshold = parseInt(await getSetting('bonus_referral_threshold', '1'), 10);
    const refGift = parseInt(await getSetting('bonus_referral_gift', '0'), 10);
    const refActivatedAt = await getSetting('bonus_referral_activated_at', null);
    if (refActive && refGift > 0 && refThreshold > 0) {
      let query = "SELECT COUNT(*)::int AS cnt FROM users WHERE referrer_id = $1 AND referral_counted = true";
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
        const upd = await pool.query(
          'UPDATE users SET balance = balance + $1, ref_bonus_count = $2 WHERE telegram_id = $3 AND ref_bonus_count = $4 RETURNING balance',
          [totalGift, receivedCount + eligibleBonuses, userId, receivedCount]
        );
        if (upd.rowCount > 0) {
          const after = Number(upd.rows[0].balance);
          await logGift(userId, totalGift, after, `هدیه‌ی دعوت دوستان (${eligibleBonuses}×)`);
          try {
            ctx.telegram.sendMessage(
              userId,
              '🎁 هدیه‌ی دعوت دوستان\n\n' +
              `به‌خاطر ${eligibleBonuses} دعوت موفق، ${totalGift.toLocaleString()} تومان مستقیم به کیف پولت اضافه شد.\n\n` +
              'همین الان هم قابل‌استفاده و قابل‌برداشته ✨\n' +
              'ممنون که ووچینو⁰۱ رو به دوستات معرفی می‌کنی 🙏'
            );
          } catch (e) {}
        }
      }
    }
  }
}

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

  const upd = await pool.query(
    'UPDATE users SET balance = balance + $1 WHERE telegram_id = $2 RETURNING balance',
    [commission, referrer.telegram_id]
  );
  const after = Number(upd.rows[0].balance);
  await logGift(referrer.telegram_id, commission, after, `سود مادام‌العمر از خرید کاربر دعوت‌شده (${percentValue}٪)`);
  try {
    await ctx.telegram.sendMessage(referrer.telegram_id,
      '♾️ سود دعوت شما\n\n' +
      `💰 ${commission.toLocaleString('en-US')} تومان (${percentValue}٪ از خرید یکی از دعوت‌شده‌هات) به کیف پولت اضافه شد.`
    );
  } catch (e) {}
}

module.exports = { checkAndGrantBonuses, checkAndGrantReferralCommission };
