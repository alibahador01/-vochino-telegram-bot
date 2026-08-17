// handlers/game.js
const { Markup } = require('telegraf');
const { sessions } = require('../utils');
const { pool, getUser, getSetting } = require('../db');
const { ADMIN_IDS } = require('../constants');

const GAME_HEADER = '╭─ ✦ ─╮\n👑 ووچینو⁰¹\n╰─ ✦ ─╯\n\n';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function faNum(n) {
  return Number(n || 0).toLocaleString('en-US');
}

// نگاشت بازی‌ها به ایموجی متد sendDice تلگرام
const DICE_EMOJI = {
  dice: '🎲',
  dart: '🎯',
  bowling: '🎳',
  penalty: '⚽',
  wheel: '🎰'
};
const DICE_ANIMATION_DELAY_MS = 4000;

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

// ======================== منطق بازی‌های تعاملی ========================

// -- سنگ کاغذ قیچی --
async function playRockPaperScissors(ctx, betAmount, userId) {
  const choices = ['✊ سنگ', '✋ کاغذ', '✌️ قیچی'];
  const buttons = choices.map(c => [{ text: c, callback_data: `game_rps_${c[0]}_${betAmount}` }]);
  await ctx.reply(
    GAME_HEADER +
    `👊 سنگ کاغذ قیچی\n\n` +
    `💰 مبلغ بازی: ${faNum(betAmount)} تومان\n` +
    `👇 یکی را انتخاب کنید:`,
    { reply_markup: { inline_keyboard: [buttons] } }
  );
}

// -- تاس (حدس بالا/پایین) --
async function playDice(ctx, betAmount, userId) {
  const buttons = [
    [{ text: '🔽 پایین (۱ تا ۳)', callback_data: `game_dice_low_${betAmount}` }],
    [{ text: '🔼 بالا (۴ تا ۶)', callback_data: `game_dice_high_${betAmount}` }]
  ];
  await ctx.reply(
    GAME_HEADER +
    `🎲 تاس\n\n` +
    `💰 مبلغ بازی: ${faNum(betAmount)} تومان\n` +
    `👇 حدس بزنید عدد تاس بالا می‌آید یا پایین:`,
    { reply_markup: { inline_keyboard: buttons } }
  );
}

// -- پنالتی (انتخاب جهت) --
async function playPenalty(ctx, betAmount, userId) {
  const buttons = [
    [{ text: '⬅️ چپ', callback_data: `game_penalty_left_${betAmount}` }],
    [{ text: '➡️ راست', callback_data: `game_penalty_right_${betAmount}` }],
    [{ text: '⬆️ وسط', callback_data: `game_penalty_mid_${betAmount}` }]
  ];
  await ctx.reply(
    GAME_HEADER +
    `🥅 پنالتی\n\n` +
    `💰 مبلغ بازی: ${faNum(betAmount)} تومان\n` +
    `👇 جهت شوت را انتخاب کنید:`,
    { reply_markup: { inline_keyboard: [buttons] } }
  );
}

// -- بولینگ (انتخاب قدرت) --
async function playBowling(ctx, betAmount, userId) {
  const buttons = [
    [{ text: '💪 سبک', callback_data: `game_bowling_light_${betAmount}` }],
    [{ text: '💪💪 متوسط', callback_data: `game_bowling_medium_${betAmount}` }],
    [{ text: '💪💪💪 سنگین', callback_data: `game_bowling_heavy_${betAmount}` }]
  ];
  await ctx.reply(
    GAME_HEADER +
    `🎳 بولینگ\n\n` +
    `💰 مبلغ بازی: ${faNum(betAmount)} تومان\n` +
    `👇 قدرت پرتاب را انتخاب کنید:`,
    { reply_markup: { inline_keyboard: [buttons] } }
  );
}

// -- دارت (انتخاب منطقه) --
async function playDart(ctx, betAmount, userId) {
  const buttons = [
    [{ text: '🎯 ۲۰', callback_data: `game_dart_20_${betAmount}` }],
    [{ text: '🎯 ۵۰', callback_data: `game_dart_50_${betAmount}` }],
    [{ text: '🎯 ۱۰۰', callback_data: `game_dart_100_${betAmount}` }]
  ];
  await ctx.reply(
    GAME_HEADER +
    `🎯 دارت\n\n` +
    `💰 مبلغ بازی: ${faNum(betAmount)} تومان\n` +
    `👇 منطقه مورد نظر را انتخاب کنید:`,
    { reply_markup: { inline_keyboard: [buttons] } }
  );
}

// -- چرخ و فلک (انتخاب رنگ) --
async function playWheel(ctx, betAmount, userId) {
  const buttons = [
    [{ text: '🔴 قرمز', callback_data: `game_wheel_red_${betAmount}` }],
    [{ text: '⚫ مشکی', callback_data: `game_wheel_black_${betAmount}` }],
    [{ text: '🟢 سبز', callback_data: `game_wheel_green_${betAmount}` }]
  ];
  await ctx.reply(
    GAME_HEADER +
    `🎡 چرخ و فلک\n\n` +
    `💰 مبلغ بازی: ${faNum(betAmount)} تومان\n` +
    `👇 رنگ مورد نظر را انتخاب کنید:`,
    { reply_markup: { inline_keyboard: [buttons] } }
  );
}

// ======================== اجرای بازی پس از انتخاب کاربر ========================

async function executeGame(ctx, gameKey, userChoice, betAmount, userId) {
  // کسر مبلغ از بونوس و کاهش شرط گردش (قبل از بازی)
  const user = await getUser(userId);
  if (!user) return ctx.reply('⛔ کاربر یافت نشد.');
  if (Number(user.bonus_balance) < betAmount) {
    return ctx.reply(gameMessages.insufficientBonus);
  }
  await pool.query(
    'UPDATE users SET bonus_balance = bonus_balance - $1, referral_wagering_remaining = GREATEST(referral_wagering_remaining - $1, 0) WHERE telegram_id = $2',
    [betAmount, String(userId)]
  );

  // انیمیشن بازی (sendDice برای بازی‌های دارای ایموجی)
  const emoji = DICE_EMOJI[gameKey];
  if (emoji && gameKey !== 'rock_paper_scissors') {
    try { await ctx.replyWithDice({ emoji }); } catch (e) {}
    await sleep(DICE_ANIMATION_DELAY_MS);
  } else if (gameKey === 'rock_paper_scissors') {
    // انیمیشن متنی سنگ کاغذ قیچی
    const rpsFrames = ['✊ سنگ', '✋ کاغذ', '✌️ قیچی'];
    const animMsg = await ctx.reply(
      GAME_HEADER + `👊 سنگ کاغذ قیچی\n\n🎮 در حال بازی...\n\n${rpsFrames[0]}`
    );
    for (let i = 1; i <= 4; i++) {
      await sleep(600);
      try {
        await ctx.telegram.editMessageText(
          animMsg.chat.id,
          animMsg.message_id,
          undefined,
          GAME_HEADER + `👊 سنگ کاغذ قیچی\n\n🎮 در حال بازی...\n\n${rpsFrames[i % rpsFrames.length]}`
        );
      } catch (e) {}
    }
    await sleep(400);
  }

  // تعیین نتیجه بر اساس درصد برد و انتخاب کاربر
  const winRate = parseInt(await getSetting('winRateBonus', '50'), 10);
  const multiplier = parseFloat(await getSetting('gameMultiplier', '2'));
  const roll = Math.random() * 100;

  let outcome = roll < winRate ? 'win' : 'lose';
  // در برخی بازی‌ها ممکن است مساوی هم داشته باشیم (مثلاً سنگ کاغذ قیچی)
  // اما برای سادگی، فعلاً فقط برد/باخت با درصد برد تعیین می‌شود.
  // (می‌توانید برای هر بازی منطق خاص خود را بنویسید)

  let gain = 0;
  if (outcome === 'win') {
    gain = Math.round(betAmount * multiplier);
    await pool.query('UPDATE users SET bonus_balance = bonus_balance + $1 WHERE telegram_id = $2', [gain, String(userId)]);
  }

  const finalUser = await getUser(userId);
  const newBalance = Number(finalUser.bonus_balance || 0);

  try {
    await pool.query(
      'INSERT INTO transaction_logs (telegram_id, type, amount, balance_before, balance_after, description, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW())',
      [String(userId), 'bonus', outcome === 'win' ? gain : -betAmount, Number(user.bonus_balance || 0), newBalance, `بازی ${gameMessages.gameNames[gameKey]} (${outcome})`]
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
      `💎 موجودی بونوس: ${faNum(newBalance)} تومان`
    );
  } else {
    await ctx.reply(
      GAME_HEADER +
      `♨️ نتیجه دور\n` +
      `😔 این دور برنده نشدی.\n` +
      `🍀 شانس دوباره همیشه هست.\n` +
      `💰 مبلغ بازی: ${faNum(betAmount)} تومان\n` +
      `💎 موجودی بونوس: ${faNum(newBalance)} تومان`
    );
  }

  setTimeout(() => showBonusMenu(ctx).catch(() => {}), 2000);
}

// ======================== نمایش منوی اصلی بازی‌ها ========================

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
  const buttons = [
    [{ text: gameMessages.gameNames.dice, callback_data: 'game_select_dice' }],
    [{ text: gameMessages.gameNames.dart, callback_data: 'game_select_dart' }],
    [{ text: gameMessages.gameNames.bowling, callback_data: 'game_select_bowling' }],
    [{ text: gameMessages.gameNames.penalty, callback_data: 'game_select_penalty' }],
    [{ text: gameMessages.gameNames.wheel, callback_data: 'game_select_wheel' }],
    [{ text: gameMessages.gameNames.rock_paper_scissors, callback_data: 'game_select_rock_paper_scissors' }]
  ];
  buttons.push([{ text: gameMessages.withdrawBonus, callback_data: 'bonus_withdraw_start' }]);
  buttons.push([{ text: gameMessages.back, callback_data: 'back_main_menu' }]);

  ctx.reply(
    gameMessages.chooseGame + `\n\n💎 موجودی بونوس شما: ${faNum(freshUser.bonus_balance)} تومان`,
    Markup.inlineKeyboard(buttons)
  );
}

// ======================== رجیستر هندلرها ========================

function registerGameHandlers(bot) {

  bot.action('menu_bonus', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    return showBonusMenu(ctx);
  });

  // انتخاب بازی
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

  // پردازش مبلغ بازی
  bot.on('text', async (ctx, next) => {
    const userId = ctx.from.id;
    const session = sessions[userId];
    if (!session || session.flow !== 'game_bet' || session.step !== 'waiting_amount') return next();

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

    const gameKey = session.data.gameKey;
    delete sessions[userId];

    // هدایت به بازی تعاملی
    switch (gameKey) {
      case 'rock_paper_scissors': return playRockPaperScissors(ctx, val, userId);
      case 'dice': return playDice(ctx, val, userId);
      case 'penalty': return playPenalty(ctx, val, userId);
      case 'bowling': return playBowling(ctx, val, userId);
      case 'dart': return playDart(ctx, val, userId);
      case 'wheel': return playWheel(ctx, val, userId);
      default: return ctx.reply('❌ بازی ناشناخته');
    }
  });

  // پردازش انتخاب کاربر در بازی‌ها
  bot.action(/^game_(rps|dice|penalty|bowling|dart|wheel)_(.+)_(\d+)$/, async (ctx) => {
    const gameKey = ctx.match[1];
    const userChoice = ctx.match[2];
    const betAmount = parseInt(ctx.match[3], 10);
    const userId = ctx.from.id;

    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    // نقشه‌سازی gameKey به نام کامل
    const gameMap = {
      rps: 'rock_paper_scissors',
      dice: 'dice',
      penalty: 'penalty',
      bowling: 'bowling',
      dart: 'dart',
      wheel: 'wheel'
    };
    const fullGameKey = gameMap[gameKey] || gameKey;

    await executeGame(ctx, fullGameKey, userChoice, betAmount, userId);
  });

  // ======================== برداشت بونوس (با بررسی قفل) ========================

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
    const bonusBalance = Number(user.bonus_balance || 0);
    const lockedWager = Number(user.referral_wagering_remaining || 0);
    const withdrawable = Math.max(bonusBalance - lockedWager, 0);

    sessions[userId] = { flow: 'bonus_withdraw', step: 'waiting_amount' };

    let msg =
      GAME_HEADER +
      `🎁 برداشت بونوس\n` +
      `💰 مبلغ بونوس موردنظر را وارد کنید:\n` +
      `📌 حداقل برداشت: ${faNum(minWithdraw)} تومان\n` +
      `✅ موجودی قابل برداشت: ${faNum(withdrawable)} تومان`;
    if (lockedWager > 0) {
      msg += `\n🔒 مبلغ قفل‌شده (نیازمند شرط گردش در بازی‌ها): ${faNum(lockedWager)} تومان`;
    }
    return ctx.reply(msg);
  });

  bot.on('text', async (ctx, next) => {
    const userId = ctx.from.id;
    const session = sessions[userId];
    if (!session || session.flow !== 'bonus_withdraw' || session.step !== 'waiting_amount') return next();

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
    const lockedWager = Number(user.referral_wagering_remaining || 0);
    const withdrawable = Math.max(bonusBalance - lockedWager, 0);

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

    if (val > withdrawable) {
      delete sessions[userId];
      return ctx.reply(
        GAME_HEADER +
        `⚠️ امکان برداشت وجود ندارد.\n` +
        `💰 مبلغ واردشده: ${faNum(val)} تومان\n` +
        `✅ موجودی قابل برداشت: ${faNum(withdrawable)} تومان\n` +
        `🔒 مبلغ قفل‌شده (نیازمند شرط گردش): ${faNum(lockedWager)} تومان\n` +
        `📌 بخشی از بونوس شما از دعوت دوستان است و باید ابتدا در بخش «🎮 بازی‌ها» چرخانده شود.`
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
  });
}

module.exports = registerGameHandlers;
module.exports.showBonusMenu = showBonusMenu;
