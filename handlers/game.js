// handlers/game.js
const { Markup } = require('telegraf');
const { sessions } = require('../utils');
const { pool, getUser, getSetting } = require('../db');

// متون بازی‌ها
const gameMessages = {
  noPurchase: '🎮 برای استفاده از بازی‌ها، ابتدا باید حداقل یک خرید موفق انجام دهید.',
  disabled: '⚠️ بخش بازی‌ها در حال حاضر غیرفعال است.',
  chooseGame: '🎮 یک بازی انتخاب کنید:',
  back: '🔙 بازگشت',
  bonusPlay: '🎁 بازی با بونوس',
  insufficientBonus: '❌ موجودی بونوس شما کافی نیست.',
  win: (gain) => `🎉 برنده شدی! ${gain.toLocaleString()} تومان به بونوس شما اضافه شد.`,
  lose: '😞 باختی! شانس بعدی منتظرته.',
  gameNames: {
    rock_paper_scissors: '👊 سنگ کاغذ قیچی',
    wheel: '🎡 چرخ و فلک',
    penalty: '🥅 پنالتی',
    bowling: '🎳 بولینگ',
    dice: '🎲 تاس',
    dart: '🎯 دارت'
  }
};

const gameKeys = ['rock_paper_scissors', 'wheel', 'penalty', 'bowling', 'dice', 'dart'];

/**
 * بررسی و اعطای بونوس‌های سه‌گانه (ثبت‌نام، اولین خرید، دعوت)
 * این تابع باید از جاهای مختلف فراخوانی شود.
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

  // --- بونوس دعوت (تکرارشونده) ---
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

// ============================================
// نمایش منوی بونوس (بازی‌ها)
// ============================================
async function showBonusMenu(ctx) {
  const userId = ctx.from.id;
  const user = await getUser(userId);

  // بررسی غیرفعال بودن کل بخش
  const gameDisabled = (await getSetting('disableBonusGame', 'false')) === 'true';
  if (gameDisabled) {
    return ctx.reply(gameMessages.disabled);
  }

  // بررسی وجود حداقل یک خرید موفق (یا شرط minPurchaseForGame)
  const minPurchase = parseInt(await getSetting('minPurchaseForGame', '0'), 10);
  let canPlay = false;
  if (minPurchase === 0) {
    const purchaseRes = await pool.query(
      "SELECT COUNT(*)::int AS cnt FROM orders WHERE telegram_id = $1 AND status = 'completed'",
      [String(userId)]
    );
    canPlay = purchaseRes.rows[0].cnt > 0;
  } else {
    const totalRes = await pool.query(
      "SELECT COALESCE(SUM(amount),0) AS total FROM orders WHERE telegram_id = $1 AND status = 'completed'",
      [String(userId)]
    );
    canPlay = Number(totalRes.rows[0].total) >= minPurchase;
  }

  if (!canPlay) {
    return ctx.reply(gameMessages.noPurchase);
  }

  // --- فعال‌سازی هدیه اولین خرید (اگر هنوز دریافت نشده) ---
  const giftReceived = user.bonus_gift_received;
  if (!giftReceived) {
    const giftAmount = parseInt(await getSetting('game_bonus_gift', '0'), 10);
    if (giftAmount > 0) {
      await pool.query(
        'UPDATE users SET bonus_balance = bonus_balance + $1, bonus_gift_received = true WHERE telegram_id = $2',
        [giftAmount, String(userId)]
      );
      try { ctx.telegram.sendMessage(userId, `🎁 هدیه اولین خرید: ${giftAmount.toLocaleString()} تومان به بونوس شما اضافه شد.`); } catch (e) {}
    } else {
      await pool.query('UPDATE users SET bonus_gift_received = true WHERE telegram_id = $1', [String(userId)]);
    }
  }

  // نمایش دکمه‌های بازی
  const buttons = gameKeys.map(key => {
    const name = gameMessages.gameNames[key] || key;
    return [{ text: name, callback_data: 'game_select_' + key }];
  });
  buttons.push([{ text: gameMessages.back, callback_data: 'back_main_menu' }]);

  ctx.reply(gameMessages.chooseGame, Markup.inlineKeyboard(buttons));
}

// ============================================
// ثبت هندلرهای بازی
// ============================================
module.exports = function registerGameHandlers(bot) {

  // دکمه منوی اصلی (menu_bonus)
  bot.action('menu_bonus', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    return showBonusMenu(ctx);
  });

  // انتخاب یک بازی
  bot.action(/^game_select_(.+)/, async (ctx) => {
    const gameKey = ctx.match[1];
    const userId = ctx.from.id;
    const user = await getUser(userId);

    if (!user) return ctx.answerCbQuery('⛔ کاربر یافت نشد');

    const gameDisabled = (await getSetting('disableBonusGame', 'false')) === 'true';
    if (gameDisabled) {
      ctx.answerCbQuery();
      return ctx.reply(gameMessages.disabled);
    }

    const betAmount = 1000; // مبلغ ثابت شرط
    const bonusBalance = Number(user.bonus_balance || 0);
    if (bonusBalance < betAmount) {
      ctx.answerCbQuery('❌ موجودی بونوس کافی نیست');
      return ctx.reply(gameMessages.insufficientBonus);
    }

    // درصد برد و ضریب
    const winRate = parseInt(await getSetting('winRateBonus', '50'), 10);
    const multiplier = parseFloat(await getSetting('gameMultiplier', '2'));

    // نتیجه بازی
    const won = Math.random() * 100 < winRate;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    if (won) {
      const gain = betAmount * multiplier;
      // خالص: بونوس جدید = بونوس قبلی - شرط + جایزه
      await pool.query(
        'UPDATE users SET bonus_balance = bonus_balance + $1 WHERE telegram_id = $2',
        [gain - betAmount, String(userId)]
      );
      await ctx.reply(gameMessages.win(gain));
    } else {
      await pool.query(
        'UPDATE users SET bonus_balance = bonus_balance - $1 WHERE telegram_id = $2',
        [betAmount, String(userId)]
      );
      await ctx.reply(gameMessages.lose);
    }

    // بازگشت خودکار به منوی بازی بعد از ۲ ثانیه
    setTimeout(() => showBonusMenu(ctx).catch(console.error), 2000);
  });

  // در اختیار قرار دادن توابع به دیگر ماژول‌ها
  module.exports.showBonusMenu = showBonusMenu;
  module.exports.checkAndGrantBonuses = checkAndGrantBonuses;
};
