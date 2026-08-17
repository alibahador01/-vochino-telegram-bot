// handlers/game.js
const { Markup } = require('telegraf');
const { sessions } = require('../utils');
const { pool, getUser, getSetting } = require('../db');
const { ADMIN_IDS } = require('../constants');

const GAME_HEADER = '╭─ ✦ ─╮\n👑 ووچینو⁰¹\n╰─ ✦ ─╯\n\n';

function faNum(n) {
  return Number(n || 0).toLocaleString('en-US');
}

const gameMessages = {
  noPurchase: '🎮 برای استفاده از بازی‌ها، ابتدا باید حداقل یک خرید موفق انجام دهید.',
  disabled: '⚠️ بخش بازی‌ها در حال حاضر غیرفعال است.',
  chooseGame: '🎮 یک بازی انتخاب کنید:',
  back: '🔙 بازگشت',
  withdrawBonus: '🧩 برداشت بونوس',
  insufficientBonus: '❌ موجودی بونوس شما کافی نیست.',
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
// بازی‌هایی که امکان نتیجه مساوی هم دارند
const tieCapableGames = ['rock_paper_scissors'];

async function showBonusMenu(ctx) {
  const userId = ctx.from.id;
  const user = await getUser(userId);
  if (!user) return;

  const gameDisabled = (await getSetting('disableBonusGame', 'false')) === 'true';
  if (gameDisabled) return ctx.reply(gameMessages.disabled);

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

  if (!canPlay) return ctx.reply(gameMessages.noPurchase);

  // هدیه اولین خرید
  const giftReceived = user.bonus_gift_received;
  if (!giftReceived) {
    const giftAmount = parseInt(await getSetting('game_bonus_gift', '0'), 10);
    if (giftAmount > 0) {
      await pool.query(
        'UPDATE users SET bonus_balance = bonus_balance + $1, bonus_gift_received = true WHERE telegram_id = $2',
        [giftAmount, String(userId)]
      );
      try { ctx.telegram.sendMessage(userId, `🎁 هدیه اولین خرید: ${faNum(giftAmount)} تومان به بونوس شما اضافه شد.`); } catch (e) {}
    } else {
      await pool.query('UPDATE users SET bonus_gift_received = true WHERE telegram_id = $1', [String(userId)]);
    }
  }

  const freshUser = await getUser(userId);
  const buttons = gameKeys.map(key => [{ text: gameMessages.gameNames[key], callback_data: 'game_select_' + key }]);
  buttons.push([{ text: gameMessages.withdrawBonus, callback_data: 'bonus_withdraw_start' }]);
  buttons.push([{ text: gameMessages.back, callback_data: 'back_main_menu' }]);
  ctx.reply(
    gameMessages.chooseGame + `\n\n💎 موجودی بونوس شما: ${faNum(freshUser.bonus_balance)} تومان`,
    Markup.inlineKeyboard(buttons)
  );
}

function registerGameHandlers(bot) {
  bot.action('menu_bonus', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    return showBonusMenu(ctx);
  });

  // ----------------- انتخاب بازی: درخواست مبلغ بازی -----------------
  bot.action(/^game_select_(.+)/, async (ctx) => {
    const gameKey = ctx.match[1];
    if (!gameMessages.gameNames[gameKey]) return ctx.answerCbQuery();
    const userId = ctx.from.id;
    const user = await getUser(userId);
    if (!user) return ctx.answerCbQuery('⛔ کاربر یافت نشد');

    const gameDisabled = (await getSetting('disableBonusGame', 'false')) === 'true';
    if (gameDisabled) { ctx.answerCbQuery(); return ctx.reply(gameMessages.disabled); }

    const minBet = parseInt(await getSetting('game_min_bet', '10000'), 10);
    const bonusBalance = Number(user.bonus_balance || 0);

    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    if (bonusBalance < minBet) {
      return ctx.reply(
        GAME_HEADER +
        `❌ موجودی بونوس شما کافی نیست.\n` +
        `💎 موجودی بونوس شما: ${faNum(bonusBalance)} تومان\n` +
        `📌 حداقل مبلغ شروع بازی: ${faNum(minBet)} تومان`
      );
    }

    sessions[userId] = { flow: 'game_bet', step: 'waiting_amount', data: { gameKey } };
    return ctx.reply(
      GAME_HEADER +
      `🎮 ${gameMessages.gameNames[gameKey]}\n` +
      `💰 مبلغ بازی خود را وارد کنید:\n` +
      `📌 حداقل مبلغ شروع بازی: ${faNum(minBet)} تومان\n` +
      `💎 موجودی بونوس شما: ${faNum(bonusBalance)} تومان`
    );
  });

  // ----------------- انصراف از بازی -----------------
  bot.action('game_cancel', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    delete sessions[ctx.from.id];
    return showBonusMenu(ctx);
  });

  // ----------------- اجرای واقعی بازی پس از تایید -----------------
  bot.action(/^game_play_(.+)/, async (ctx) => {
    const userId = ctx.from.id;
    const session = sessions[userId];
    const token = ctx.match[1];
    if (!session || session.flow !== 'game_confirm' || String(session.data.token) !== token) {
      return ctx.answerCbQuery('⛔ این درخواست دیگر معتبر نیست.');
    }
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const { gameKey, betAmount } = session.data;
    delete sessions[userId];

    const gameDisabled = (await getSetting('disableBonusGame', 'false')) === 'true';
    if (gameDisabled) return ctx.reply(gameMessages.disabled);

    const user = await getUser(userId);
    if (!user) return ctx.reply('⛔ کاربر یافت نشد.');
    const bonusBalanceBefore = Number(user.bonus_balance || 0);
    if (bonusBalanceBefore < betAmount) {
      return ctx.reply(gameMessages.insufficientBonus);
    }

    // رزرو مبلغ بازی از موجودی بونوس (بازی ابتدا کسر می‌شود)
    await pool.query('UPDATE users SET bonus_balance = bonus_balance - $1 WHERE telegram_id = $2', [betAmount, String(userId)]);

    const winRate = parseInt(await getSetting('winRateBonus', '50'), 10);
    const multiplier = parseFloat(await getSetting('gameMultiplier', '2'));
    const roll = Math.random() * 100;

    let outcome;
    if (tieCapableGames.includes(gameKey)) {
      const tieRate = Math.max(0, (100 - winRate) / 2);
      if (roll < winRate) outcome = 'win';
      else if (roll < winRate + tieRate) outcome = 'tie';
      else outcome = 'lose';
    } else {
      outcome = roll < winRate ? 'win' : 'lose';
    }

    let gain = 0;
    if (outcome === 'win') {
      gain = Math.round(betAmount * multiplier);
      await pool.query('UPDATE users SET bonus_balance = bonus_balance + $1 WHERE telegram_id = $2', [gain, String(userId)]);
    } else if (outcome === 'tie') {
      // مبلغ بازی به‌طور کامل بازگردانده می‌شود
      await pool.query('UPDATE users SET bonus_balance = bonus_balance + $1 WHERE telegram_id = $2', [betAmount, String(userId)]);
    }

    const finalUser = await getUser(userId);
    const newBalance = Number(finalUser.bonus_balance || 0);

    try {
      const logAmount = outcome === 'win' ? gain : (outcome === 'tie' ? 0 : -betAmount);
      await pool.query(
        'INSERT INTO transaction_logs (telegram_id, type, amount, balance_before, balance_after, description, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW())',
        [String(userId), 'bonus', logAmount, bonusBalanceBefore, newBalance, `بازی ${gameMessages.gameNames[gameKey]} (${outcome})`]
      );
    } catch (e) {}

    if (outcome === 'win') {
      await ctx.reply(
        GAME_HEADER +
        `🏆 نتیجه دور\n` +
        `🎉 تبریک! این دور برنده شدی.\n` +
        `💰 مبلغ بازی: ${faNum(betAmount)} تومان\n` +
        `🎯 ضریب: ${multiplier}×\n` +
        `🎁 مبلغ برد: ${faNum(gain)} تومان\n` +
        `💎 موجودی بونوس: ${faNum(newBalance)} تومان\n` +
        `📌 مبلغ برد به موجودی بونوس شما اضافه شد.`
      );
    } else if (outcome === 'tie') {
      await ctx.reply(
        GAME_HEADER +
        `🤝 نتیجه دور\n` +
        `این دور مساوی شد.\n` +
        `💰 مبلغ بازی: ${faNum(betAmount)} تومان\n` +
        `💎 موجودی بونوس: ${faNum(newBalance)} تومان\n` +
        `🔄 مبلغ این دور طبق قوانین بازی محاسبه و ثبت شد.`
      );
    } else {
      await ctx.reply(
        GAME_HEADER +
        `♨️ نتیجه دور\n` +
        `😔 این دور برنده نشدی.\n` +
        `🍀 شانس دوباره همیشه هست.\n` +
        `💰 مبلغ بازی: ${faNum(betAmount)} تومان\n` +
        `💎 موجودی بونوس: ${faNum(newBalance)} تومان\n` +
        `📌 نتیجه این دور با موفقیت ثبت شد.`
      );
    }

    setTimeout(() => showBonusMenu(ctx).catch(() => {}), 2000);
  });

  // ----------------- برداشت بونوس به کیف پول -----------------
  bot.action('bonus_withdraw_start', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    const userId = ctx.from.id;
    const user = await getUser(userId);
    if (!user) return ctx.reply('⛔ کاربر یافت نشد.');

    const pendingReq = await pool.query(
      "SELECT id FROM bonus_withdrawals WHERE telegram_id = $1 AND status = 'pending'",
      [String(userId)]
    );
    if (pendingReq.rows.length > 0) {
      return ctx.reply(GAME_HEADER + '🟡 شما یک درخواست برداشت بونوس در انتظار بررسی دارید.');
    }

    const minWithdraw = parseInt(await getSetting('bonus_min_withdraw', '200000'), 10);
    sessions[userId] = { flow: 'bonus_withdraw', step: 'waiting_amount' };
    return ctx.reply(
      GAME_HEADER +
      `🎁 برداشت بونوس\n` +
      `💰 مبلغ بونوس موردنظر را وارد کنید:\n` +
      `📌 حداقل برداشت: ${faNum(minWithdraw)} تومان`
    );
  });

  // ----------------- پردازش ورودی‌های متنی (مبلغ بازی / مبلغ برداشت) -----------------
  bot.on('text', async (ctx, next) => {
    const userId = ctx.from.id;
    const session = sessions[userId];
    if (!session) return next();

    // مبلغ بازی
    if (session.flow === 'game_bet' && session.step === 'waiting_amount') {
      const val = parseInt(ctx.message.text.replace(/[^0-9]/g, ''), 10);
      if (isNaN(val) || val <= 0) return ctx.reply('❌ مبلغ نامعتبر است. دوباره وارد کنید:');

      const minBet = parseInt(await getSetting('game_min_bet', '10000'), 10);
      if (val < minBet) {
        return ctx.reply(`❌ مبلغ بازی نباید کمتر از ${faNum(minBet)} تومان باشد. دوباره وارد کنید:`);
      }

      const user = await getUser(userId);
      const bonusBalance = Number(user.bonus_balance || 0);
      if (val > bonusBalance) {
        return ctx.reply(`❌ موجودی بونوس شما کافی نیست.\n💎 موجودی بونوس شما: ${faNum(bonusBalance)} تومان\nمبلغ کمتری وارد کنید:`);
      }

      const token = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const gameKey = session.data.gameKey;
      sessions[userId] = { flow: 'game_confirm', step: 'confirm', data: { gameKey, betAmount: val, token } };

      const multiplier = parseFloat(await getSetting('gameMultiplier', '2'));
      return ctx.reply(
        GAME_HEADER +
        `🎮 ${gameMessages.gameNames[gameKey]}\n` +
        `💰 مبلغ بازی: ${faNum(val)} تومان\n` +
        `🎯 ضریب: ${multiplier}×\n\n` +
        `برای شروع بازی دکمه زیر را بزنید:`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🎮 شروع بازی', callback_data: 'game_play_' + token }],
              [{ text: '❌ انصراف', callback_data: 'game_cancel' }]
            ]
          }
        }
      );
    }

    // مبلغ برداشت بونوس
    if (session.flow === 'bonus_withdraw' && session.step === 'waiting_amount') {
      const val = parseInt(ctx.message.text.replace(/[^0-9]/g, ''), 10);
      if (isNaN(val) || val <= 0) return ctx.reply('❌ مبلغ نامعتبر است. دوباره وارد کنید:');

      const minWithdraw = parseInt(await getSetting('bonus_min_withdraw', '200000'), 10);
      if (val < minWithdraw) {
        delete sessions[userId];
        return ctx.reply(
          GAME_HEADER +
          `⚠️ امکان برداشت وجود ندارد.\n` +
          `💰 مبلغ واردشده: ${faNum(val)} تومان\n` +
          `📌 حداقل برداشت بونوس: ${faNum(minWithdraw)} تومان\n` +
          `🎁 موجودی بونوس شما هنوز به حداقل برداشت نرسیده است.`
        );
      }

      const user = await getUser(userId);
      const bonusBalance = Number(user.bonus_balance || 0);
      if (val > bonusBalance) {
        delete sessions[userId];
        return ctx.reply(
          GAME_HEADER +
          `⚠️ امکان برداشت وجود ندارد.\n` +
          `💰 مبلغ واردشده: ${faNum(val)} تومان\n` +
          `💎 موجودی بونوس شما: ${faNum(bonusBalance)} تومان\n` +
          `🎁 موجودی بونوس شما کمتر از مبلغ درخواستی است.`
        );
      }

      await pool.query(
        "INSERT INTO bonus_withdrawals (telegram_id, amount, status, created_at) VALUES ($1, $2, 'pending', NOW())",
        [String(userId), val]
      );
      delete sessions[userId];

      try {
        for (const adminId of ADMIN_IDS) {
          ctx.telegram.sendMessage(
            adminId,
            `🧩 درخواست برداشت بونوس جدید\n👤 ${user.full_name || userId}\n💰 ${faNum(val)} تومان\n\nاز «🎮 تنظیمات بازی ← 📥 درخواست‌های برداشت بونوس» بررسی کنید.`
          ).catch(() => {});
        }
      } catch (e) {}

      return ctx.reply(
        GAME_HEADER +
        `✅ درخواست برداشت بونوس ثبت شد.\n` +
        `🎁 مبلغ بونوس: ${faNum(val)} تومان\n` +
        `💳 مبلغ پس از تأیید به کیف پول شما منتقل می‌شود.\n` +
        `📍 وضعیت: ⏳ در انتظار پردازش`
      );
    }

    return next();
  });
}

module.exports = registerGameHandlers;
module.exports.showBonusMenu = showBonusMenu;
