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

function newToken() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
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
    dice: '🎲 تاس',
    penalty: '🥅 پنالتی',
    dart: '🎯 دارت',
    bowling: '🎳 بولینگ',
    basketball: '🏀 بسکتبال',
    wheel: '🎡 گردونه شانس'
  }
};

const gameKeys = ['rock_paper_scissors', 'dice', 'penalty', 'dart', 'bowling', 'basketball', 'wheel'];
// بازی‌هایی که امکان نتیجه مساوی هم دارند
const tieCapableGames = ['rock_paper_scissors'];

// ----------------- تنظیمات انیمیشن sendDice -----------------
// نگاشت بازی‌ها به ایموجی متد sendDice تلگرام برای پخش انیمیشن زنده و واقعی
const DICE_EMOJI = { dice: '🎲', penalty: '⚽', dart: '🎯', bowling: '🎳', basketball: '🏀' };
const DICE_ANIMATION_DELAY_MS = 4000;
const REROLL_MAX_ATTEMPTS = 25;
const REROLL_DELAY_MS = 900;

// مقادیر واقعی sendDice تلگرام که معنی «برد بصری» آن بازی را دارند
const DART_BULLSEYE = [6];
const BOWLING_STRIKE = [6];
const FOOTBALL_GOAL = [4, 5];
const FOOTBALL_MISS = [1, 2, 3];
const BASKETBALL_SCORE = [4, 5];
const BASKETBALL_MISS = [1, 2, 3];
const DICE_UNDER_3 = [1, 2];
const DICE_3_OR_OVER = [3, 4, 5, 6];

// سطوح دقت دارت: هرچه دقت بالاتر انتخاب شود، احتمال برد بیشتر ولی جایزه کمتر می‌شود
const DART_TIERS = {
  40: { winRateMultiplier: 0.6, payoutMultiplier: 1.8, label: '۴۰٪ (سخت، جایزه بالا)' },
  60: { winRateMultiplier: 1.0, payoutMultiplier: 1.0, label: '۶۰٪ (متوسط)' },
  100: { winRateMultiplier: 1.5, payoutMultiplier: 0.6, label: '۱۰۰٪ (آسان، جایزه کمتر)' }
};

// سنگ‌کاغذقیچی
const RPS_EMOJI = { rock: '👊🏽', paper: '🤚🏽', scissors: '✌🏽' };
const RPS_LABEL = { rock: 'سنگ', paper: 'کاغذ', scissors: 'قیچی' };
const RPS_BEATS = { rock: 'scissors', scissors: 'paper', paper: 'rock' }; // کلید، مقدار را می‌برد

function rpsOpponentChoice(userChoice, outcome) {
  if (outcome === 'tie') return userChoice;
  if (outcome === 'win') return RPS_BEATS[userChoice];
  return Object.keys(RPS_BEATS).find(k => RPS_BEATS[k] === userChoice);
}

// گردونه شانس
const WHEEL_COLORS = {
  red: { emoji: '🔴', label: 'قرمز' },
  green: { emoji: '🟢', label: 'سبز' },
  blue: { emoji: '🔵', label: 'آبی' }
};

function wheelResultColor(userColor, outcome) {
  const others = Object.keys(WHEEL_COLORS).filter(c => c !== userColor);
  if (outcome === 'win') return userColor;
  return others[Math.floor(Math.random() * others.length)];
}

// پرتاب sendDice با تلاش مجدد تا رسیدن به مقداری هم‌خوان با نتیجه‌ی از‌پیش‌تعیین‌شده
// (خود پرتاب و انیمیشن آن کاملاً واقعی و زنده‌ی تلگرام است؛ فقط تا زمانی که مقدار
// نمایش‌داده‌شده با برد/باخت اعلامی هم‌خوان نباشد، دوباره پرتاب می‌شود)
async function rollDiceMatching(ctx, emoji, isMatch) {
  let lastValue = null;
  for (let attempt = 1; attempt <= REROLL_MAX_ATTEMPTS; attempt++) {
    const sentAt = Date.now();
    let msg;
    try { msg = await ctx.replyWithDice({ emoji }); } catch (e) { return null; }
    const value = msg && msg.dice ? msg.dice.value : null;
    lastValue = value;
    const isFinal = isMatch(value) || attempt === REROLL_MAX_ATTEMPTS;
    if (isFinal) {
      const elapsed = Date.now() - sentAt;
      if (elapsed < DICE_ANIMATION_DELAY_MS) await sleep(DICE_ANIMATION_DELAY_MS - elapsed);
      return value;
    }
    const elapsed = Date.now() - sentAt;
    if (elapsed < REROLL_DELAY_MS) await sleep(REROLL_DELAY_MS - elapsed);
    try { await ctx.telegram.deleteMessage(msg.chat.id, msg.message_id); } catch (e) {}
  }
  return lastValue;
}

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

// محاسبه‌ی نتیجه‌ی برد/باخت/مساوی بر اساس درصد برد تنظیم‌شده در پنل ادمین
// (یا درصد سفارشی، مثلاً برای سطح دقت انتخابی در بازی دارت)
async function rollOutcome(gameKey, winRateOverride) {
  const baseWinRate = parseInt(await getSetting('winRateBonus', '50'), 10);
  const winRate = winRateOverride !== undefined && winRateOverride !== null
    ? winRateOverride
    : baseWinRate;
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
  return outcome;
}

// کسر مبلغ بازی از موجودی بونوس + پیشرفت شرط گردش بونوس دعوت
// (بونوس دعوت تا زمانی که این مبلغ در بازی‌ها به گردش درنیاید، قابل برداشت نیست)
async function reserveBet(userId, betAmount) {
  await pool.query(
    'UPDATE users SET bonus_balance = bonus_balance - $1, referral_wagering_remaining = GREATEST(referral_wagering_remaining - $1, 0) WHERE telegram_id = $2',
    [betAmount, String(userId)]
  );
}

// نهایی‌سازی نتیجه‌ی بازی: اعمال برد/باخت روی موجودی، ثبت لاگ و ارسال پیام نتیجه
async function finishGame(ctx, { userId, gameKey, betAmount, bonusBalanceBefore, outcome, extraLines, multiplierFactor }) {
  const baseMultiplier = parseFloat(await getSetting('gameMultiplier', '2'));
  const multiplier = Math.round(baseMultiplier * (multiplierFactor || 1) * 100) / 100;

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

  const extra = extraLines ? extraLines + '\n' : '';

  if (outcome === 'win') {
    await ctx.reply(
      GAME_HEADER +
      `🏆 نتیجه دور\n` +
      extra +
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
      extra +
      `این دور مساوی شد.\n` +
      `💰 مبلغ بازی: ${faNum(betAmount)} تومان\n` +
      `💎 موجودی بونوس: ${faNum(newBalance)} تومان\n` +
      `🔄 مبلغ این دور طبق قوانین بازی محاسبه و ثبت شد.`
    );
  } else {
    await ctx.reply(
      GAME_HEADER +
      `♨️ نتیجه دور\n` +
      extra +
      `😔 این دور برنده نشدی.\n` +
      `🍀 شانس دوباره همیشه هست.\n` +
      `💰 مبلغ بازی: ${faNum(betAmount)} تومان\n` +
      `💎 موجودی بونوس: ${faNum(newBalance)} تومان\n` +
      `📌 نتیجه این دور با موفقیت ثبت شد.`
    );
  }

  setTimeout(() => showBonusMenu(ctx).catch(() => {}), 2000);
}

// خط توضیحی بولینگ بر اساس نتیجه (فقط جنبه‌ی نمایشی و روایی دارد)
function bowlingFlavorLine(outcome) {
  if (outcome === 'win') return '🎳 استرایک! تمام ۱۰ پین افتاد.';
  const pins = 2 + Math.floor(Math.random() * 6); // بین ۲ تا ۷ پین برای باخت
  return `🎳 فقط ${pins} پین افتاد.`;
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

  // اعتبارسنجی مشترک قبل از اجرای هر دور بازی
  async function validateRound(ctx, userId, betAmount) {
    const gameDisabled = (await getSetting('disableBonusGame', 'false')) === 'true';
    if (gameDisabled) { await ctx.reply(gameMessages.disabled); return null; }
    const user = await getUser(userId);
    if (!user) { await ctx.reply('⛔ کاربر یافت نشد.'); return null; }
    const bonusBalanceBefore = Number(user.bonus_balance || 0);
    if (bonusBalanceBefore < betAmount) { await ctx.reply(gameMessages.insufficientBonus); return null; }
    return { user, bonusBalanceBefore };
  }

  // ----------------- بولینگ: اجرای مستقیم پس از تایید -----------------
  bot.action(/^game_play_bowling_(.+)/, async (ctx) => {
    const userId = ctx.from.id;
    const session = sessions[userId];
    const token = ctx.match[1];
    if (!session || session.flow !== 'game_confirm_bowling' || String(session.data.token) !== token) {
      return ctx.answerCbQuery('⛔ این درخواست دیگر معتبر نیست.');
    }
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const { betAmount } = session.data;
    delete sessions[userId];

    const check = await validateRound(ctx, userId, betAmount);
    if (!check) return;

    await reserveBet(userId, betAmount);
    const outcome = await rollOutcome('bowling');
    const isMatch = (v) => (outcome === 'win' ? BOWLING_STRIKE.includes(v) : !BOWLING_STRIKE.includes(v));
    await rollDiceMatching(ctx, DICE_EMOJI.bowling, isMatch);

    await finishGame(ctx, {
      userId, gameKey: 'bowling', betAmount, bonusBalanceBefore: check.bonusBalanceBefore, outcome,
      extraLines: bowlingFlavorLine(outcome)
    });
  });

  // ----------------- تاس: انتخاب زیر ۳ یا ۳-به-بالا سپس اجرا -----------------
  bot.action(/^dice_pick_(under|over)_(.+)/, async (ctx) => {
    const userId = ctx.from.id;
    const choice = ctx.match[1];
    const token = ctx.match[2];
    const session = sessions[userId];
    if (!session || session.flow !== 'game_confirm_dice' || String(session.data.token) !== token) {
      return ctx.answerCbQuery('⛔ این درخواست دیگر معتبر نیست.');
    }
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const { betAmount } = session.data;
    delete sessions[userId];

    const check = await validateRound(ctx, userId, betAmount);
    if (!check) return;

    await reserveBet(userId, betAmount);
    const outcome = await rollOutcome('dice');
    const chosenSet = choice === 'under' ? DICE_UNDER_3 : DICE_3_OR_OVER;
    const isMatch = (v) => (outcome === 'win' ? chosenSet.includes(v) : !chosenSet.includes(v));
    await rollDiceMatching(ctx, DICE_EMOJI.dice, isMatch);

    await finishGame(ctx, {
      userId, gameKey: 'dice', betAmount, bonusBalanceBefore: check.bonusBalanceBefore, outcome,
      extraLines: `🎲 پیش‌بینی شما: ${choice === 'under' ? 'زیر ۳ (۱ یا ۲)' : '۳ یا بیشتر (۳،۴،۵،۶)'}`
    });
  });

  // ----------------- پنالتی: انتخاب گل/بیرون سپس اجرا -----------------
  bot.action(/^penalty_pick_(goal|miss)_(.+)/, async (ctx) => {
    const userId = ctx.from.id;
    const choice = ctx.match[1];
    const token = ctx.match[2];
    const session = sessions[userId];
    if (!session || session.flow !== 'game_confirm_penalty' || String(session.data.token) !== token) {
      return ctx.answerCbQuery('⛔ این درخواست دیگر معتبر نیست.');
    }
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const { betAmount } = session.data;
    delete sessions[userId];

    const check = await validateRound(ctx, userId, betAmount);
    if (!check) return;

    await reserveBet(userId, betAmount);
    const outcome = await rollOutcome('penalty');
    const shouldShowGoal = (choice === 'goal') === (outcome === 'win');
    const targetSet = shouldShowGoal ? FOOTBALL_GOAL : FOOTBALL_MISS;
    await rollDiceMatching(ctx, DICE_EMOJI.penalty, (v) => targetSet.includes(v));

    await finishGame(ctx, {
      userId, gameKey: 'penalty', betAmount, bonusBalanceBefore: check.bonusBalanceBefore, outcome,
      extraLines: `🎯 پیش‌بینی شما: ${choice === 'goal' ? 'گل می‌شود' : 'بیرون می‌رود'}`
    });
  });

  // ----------------- بسکتبال: انتخاب تو-سبد/بیرون سپس اجرا -----------------
  bot.action(/^basketball_pick_(in|out)_(.+)/, async (ctx) => {
    const userId = ctx.from.id;
    const choice = ctx.match[1];
    const token = ctx.match[2];
    const session = sessions[userId];
    if (!session || session.flow !== 'game_confirm_basketball' || String(session.data.token) !== token) {
      return ctx.answerCbQuery('⛔ این درخواست دیگر معتبر نیست.');
    }
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const { betAmount } = session.data;
    delete sessions[userId];

    const check = await validateRound(ctx, userId, betAmount);
    if (!check) return;

    await reserveBet(userId, betAmount);
    const outcome = await rollOutcome('basketball');
    const shouldShowIn = (choice === 'in') === (outcome === 'win');
    const targetSet = shouldShowIn ? BASKETBALL_SCORE : BASKETBALL_MISS;
    await rollDiceMatching(ctx, DICE_EMOJI.basketball, (v) => targetSet.includes(v));

    await finishGame(ctx, {
      userId, gameKey: 'basketball', betAmount, bonusBalanceBefore: check.bonusBalanceBefore, outcome,
      extraLines: `🏀 پیش‌بینی شما: ${choice === 'in' ? 'توی سبد می‌رود' : 'توی سبد نمی‌رود'}`
    });
  });

  // ----------------- دارت: انتخاب درصد دقت سپس اجرا -----------------
  bot.action(/^dart_pick_(40|60|100)_(.+)/, async (ctx) => {
    const userId = ctx.from.id;
    const accuracy = ctx.match[1];
    const token = ctx.match[2];
    const session = sessions[userId];
    if (!session || session.flow !== 'game_confirm_dart' || String(session.data.token) !== token) {
      return ctx.answerCbQuery('⛔ این درخواست دیگر معتبر نیست.');
    }
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const { betAmount } = session.data;
    delete sessions[userId];

    const check = await validateRound(ctx, userId, betAmount);
    if (!check) return;

    await reserveBet(userId, betAmount);
    const tier = DART_TIERS[accuracy];
    const baseWinRate = parseInt(await getSetting('winRateBonus', '50'), 10);
    const effectiveWinRate = Math.min(95, Math.max(5, Math.round(baseWinRate * tier.winRateMultiplier)));
    const outcome = await rollOutcome('dart', effectiveWinRate);
    const isMatch = (v) => (outcome === 'win' ? DART_BULLSEYE.includes(v) : !DART_BULLSEYE.includes(v));
    await rollDiceMatching(ctx, DICE_EMOJI.dart, isMatch);

    await finishGame(ctx, {
      userId, gameKey: 'dart', betAmount, bonusBalanceBefore: check.bonusBalanceBefore, outcome,
      extraLines: `🎯 دقت انتخابی: ${tier.label}`,
      multiplierFactor: tier.payoutMultiplier
    });
  });

  // ----------------- گردونه شانس: انتخاب رنگ سپس اجرا -----------------
  bot.action(/^wheel_pick_(red|green|blue)_(.+)/, async (ctx) => {
    const userId = ctx.from.id;
    const userColor = ctx.match[1];
    const token = ctx.match[2];
    const session = sessions[userId];
    if (!session || session.flow !== 'game_confirm_wheel' || String(session.data.token) !== token) {
      return ctx.answerCbQuery('⛔ این درخواست دیگر معتبر نیست.');
    }
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const { betAmount } = session.data;
    delete sessions[userId];

    const check = await validateRound(ctx, userId, betAmount);
    if (!check) return;

    await reserveBet(userId, betAmount);
    const outcome = await rollOutcome('wheel');
    const resultColor = wheelResultColor(userColor, outcome);

    // انیمیشن زنده‌ی چرخش گردونه با ویرایش پیام
    const colorSeq = ['red', 'green', 'blue', 'red', 'green', 'blue', 'red', 'green'];
    const baseText = GAME_HEADER +
      `${gameMessages.gameNames.wheel}\n\n` +
      `🎮 رنگ انتخابی شما: ${WHEEL_COLORS[userColor].emoji} ${WHEEL_COLORS[userColor].label}\n` +
      `🎡 گردونه در حال چرخش...\n\n`;
    const animMsg = await ctx.reply(baseText + WHEEL_COLORS[colorSeq[0]].emoji);
    for (let i = 1; i < colorSeq.length; i++) {
      await sleep(400);
      try {
        await ctx.telegram.editMessageText(animMsg.chat.id, animMsg.message_id, undefined, baseText + WHEEL_COLORS[colorSeq[i]].emoji);
      } catch (e) {}
    }
    await sleep(500);
    try {
      await ctx.telegram.editMessageText(
        animMsg.chat.id, animMsg.message_id, undefined,
        GAME_HEADER +
        `${gameMessages.gameNames.wheel}\n\n` +
        `🎮 رنگ انتخابی شما: ${WHEEL_COLORS[userColor].emoji} ${WHEEL_COLORS[userColor].label}\n` +
        `🎡 نتیجه گردونه: ${WHEEL_COLORS[resultColor].emoji} ${WHEEL_COLORS[resultColor].label}`
      );
    } catch (e) {}

    await finishGame(ctx, {
      userId, gameKey: 'wheel', betAmount, bonusBalanceBefore: check.bonusBalanceBefore, outcome,
      extraLines: `🎡 رنگ شما: ${WHEEL_COLORS[userColor].emoji} ${WHEEL_COLORS[userColor].label}   |   نتیجه: ${WHEEL_COLORS[resultColor].emoji} ${WHEEL_COLORS[resultColor].label}`
    });
  });

  // ----------------- سنگ‌کاغذقیچی: انتخاب کاربر سپس اجرا -----------------
  bot.action(/^rps_pick_(rock|paper|scissors)_(.+)/, async (ctx) => {
    const userId = ctx.from.id;
    const userChoice = ctx.match[1];
    const token = ctx.match[2];
    const session = sessions[userId];
    if (!session || session.flow !== 'game_confirm_rps' || String(session.data.token) !== token) {
      return ctx.answerCbQuery('⛔ این درخواست دیگر معتبر نیست.');
    }
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const { betAmount } = session.data;
    delete sessions[userId];

    const check = await validateRound(ctx, userId, betAmount);
    if (!check) return;

    await reserveBet(userId, betAmount);
    const outcome = await rollOutcome('rock_paper_scissors');
    const opponentChoice = rpsOpponentChoice(userChoice, outcome);

    // انیمیشن زنده‌ی انتخاب حریف با ویرایش پیام
    const frames = [RPS_EMOJI.rock, RPS_EMOJI.paper, RPS_EMOJI.scissors];
    const baseText = GAME_HEADER +
      `${gameMessages.gameNames.rock_paper_scissors}\n\n` +
      `🎮 شما: ${RPS_EMOJI[userChoice]} ${RPS_LABEL[userChoice]}\n` +
      `🤖 حریف در حال انتخاب...\n\n`;
    const animMsg = await ctx.reply(baseText + frames[0]);
    for (let i = 1; i <= 5; i++) {
      await sleep(500);
      try {
        await ctx.telegram.editMessageText(animMsg.chat.id, animMsg.message_id, undefined, baseText + frames[i % frames.length]);
      } catch (e) {}
    }
    await sleep(400);
    try {
      await ctx.telegram.editMessageText(
        animMsg.chat.id, animMsg.message_id, undefined,
        GAME_HEADER +
        `${gameMessages.gameNames.rock_paper_scissors}\n\n` +
        `🎮 شما: ${RPS_EMOJI[userChoice]} ${RPS_LABEL[userChoice]}\n` +
        `🤖 حریف: ${RPS_EMOJI[opponentChoice]} ${RPS_LABEL[opponentChoice]}`
      );
    } catch (e) {}

    await finishGame(ctx, {
      userId, gameKey: 'rock_paper_scissors', betAmount, bonusBalanceBefore: check.bonusBalanceBefore, outcome,
      extraLines: `🎮 شما: ${RPS_EMOJI[userChoice]} ${RPS_LABEL[userChoice]}   |   🤖 حریف: ${RPS_EMOJI[opponentChoice]} ${RPS_LABEL[opponentChoice]}`
    });
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
    const bonusBalance = Number(user.bonus_balance || 0);
    const lockedWager = Number(user.referral_wagering_remaining || 0);
    const withdrawable = Math.max(bonusBalance - lockedWager, 0);

    sessions[userId] = { flow: 'bonus_withdraw', step: 'waiting_amount' };

    let msg =
      GAME_HEADER +
      `🎁 برداشت بونوس\n` +
      `💰 مبلغ بونوس موردنظر را وارد کنید:\n` +
      `📌 حداقل برداشت: ${faNum(minWithdraw)} تومان\n` +
      `✅ موجودی قابل برداشت: ${faNum(withdrawable)} تومان\n` +
      `📝 توجه: هر درخواست برداشت پس از ثبت، باید توسط ادمین به‌صورت دستی تأیید شود.`;
    if (lockedWager > 0) {
      msg += `\n🔒 مبلغ قفل‌شده (نیازمند شرط گردش در بازی‌ها): ${faNum(lockedWager)} تومان`;
    }
    return ctx.reply(msg);
  });

  // ----------------- پردازش ورودی‌های متنی -----------------
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

      const gameKey = session.data.gameKey;
      const multiplier = parseFloat(await getSetting('gameMultiplier', '2'));
      const token = newToken();
      const introText =
        GAME_HEADER +
        `🎮 ${gameMessages.gameNames[gameKey]}\n` +
        `💰 مبلغ بازی: ${faNum(val)} تومان\n` +
        `🎯 ضریب پایه: ${multiplier}×\n\n`;

      // تاس: انتخاب زیر ۳ یا ۳ به بالا
      if (gameKey === 'dice') {
        sessions[userId] = { flow: 'game_confirm_dice', step: 'confirm', data: { betAmount: val, token } };
        return ctx.reply(introText + 'پیش‌بینی شما چیست؟', {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔽 زیر ۳ (۱ یا ۲)', callback_data: 'dice_pick_under_' + token }],
              [{ text: '🔼 ۳ یا بیشتر (۳،۴،۵،۶)', callback_data: 'dice_pick_over_' + token }],
              [{ text: '❌ انصراف', callback_data: 'game_cancel' }]
            ]
          }
        });
      }

      // پنالتی: انتخاب گل یا بیرون
      if (gameKey === 'penalty') {
        sessions[userId] = { flow: 'game_confirm_penalty', step: 'confirm', data: { betAmount: val, token } };
        return ctx.reply(introText + 'پیش‌بینی شما چیست؟', {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🥅 گل می‌شود', callback_data: 'penalty_pick_goal_' + token }],
              [{ text: '🚫 بیرون می‌رود', callback_data: 'penalty_pick_miss_' + token }],
              [{ text: '❌ انصراف', callback_data: 'game_cancel' }]
            ]
          }
        });
      }

      // بسکتبال: انتخاب تو-سبد یا بیرون
      if (gameKey === 'basketball') {
        sessions[userId] = { flow: 'game_confirm_basketball', step: 'confirm', data: { betAmount: val, token } };
        return ctx.reply(introText + 'پیش‌بینی شما چیست؟', {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🏀 توی سبد می‌رود', callback_data: 'basketball_pick_in_' + token }],
              [{ text: '🚫 توی سبد نمی‌رود', callback_data: 'basketball_pick_out_' + token }],
              [{ text: '❌ انصراف', callback_data: 'game_cancel' }]
            ]
          }
        });
      }

      // دارت: انتخاب درصد دقت
      if (gameKey === 'dart') {
        sessions[userId] = { flow: 'game_confirm_dart', step: 'confirm', data: { betAmount: val, token } };
        return ctx.reply(introText + 'میزان دقت هدف‌گیری خود را انتخاب کنید:', {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🎯 ' + DART_TIERS[40].label, callback_data: 'dart_pick_40_' + token }],
              [{ text: '🎯 ' + DART_TIERS[60].label, callback_data: 'dart_pick_60_' + token }],
              [{ text: '🎯 ' + DART_TIERS[100].label, callback_data: 'dart_pick_100_' + token }],
              [{ text: '❌ انصراف', callback_data: 'game_cancel' }]
            ]
          }
        });
      }

      // گردونه شانس: انتخاب رنگ
      if (gameKey === 'wheel') {
        sessions[userId] = { flow: 'game_confirm_wheel', step: 'confirm', data: { betAmount: val, token } };
        return ctx.reply(introText + 'یک رنگ را برای جایزه انتخاب کنید:', {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🔴 قرمز', callback_data: 'wheel_pick_red_' + token },
                { text: '🟢 سبز', callback_data: 'wheel_pick_green_' + token },
                { text: '🔵 آبی', callback_data: 'wheel_pick_blue_' + token }
              ],
              [{ text: '❌ انصراف', callback_data: 'game_cancel' }]
            ]
          }
        });
      }

      // سنگ‌کاغذقیچی: انتخاب دست کاربر
      if (gameKey === 'rock_paper_scissors') {
        sessions[userId] = { flow: 'game_confirm_rps', step: 'confirm', data: { betAmount: val, token } };
        return ctx.reply(introText + 'یکی را انتخاب کن:', {
          reply_markup: {
            inline_keyboard: [
              [
                { text: RPS_EMOJI.rock + ' سنگ', callback_data: 'rps_pick_rock_' + token },
                { text: RPS_EMOJI.paper + ' کاغذ', callback_data: 'rps_pick_paper_' + token },
                { text: RPS_EMOJI.scissors + ' قیچی', callback_data: 'rps_pick_scissors_' + token }
              ],
              [{ text: '❌ انصراف', callback_data: 'game_cancel' }]
            ]
          }
        });
      }

      // بولینگ: دکمه شروع بازی (بدون انتخاب اضافه)
      sessions[userId] = { flow: 'game_confirm_bowling', step: 'confirm', data: { betAmount: val, token } };
      return ctx.reply(introText + 'برای شروع بازی دکمه زیر را بزنید:', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🎳 پرتاب توپ', callback_data: 'game_play_bowling_' + token }],
            [{ text: '❌ انصراف', callback_data: 'game_cancel' }]
          ]
        }
      });
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

      // درخواست ثبت می‌شود و در وضعیت «در انتظار» می‌ماند تا ادمین شخصاً بررسی و تأیید کند
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
        `💳 مبلغ پس از تأیید شخصی ادمین به کیف پول شما منتقل می‌شود.\n` +
        `📍 وضعیت: ⏳ در انتظار تأیید ادمین`
      );
    }

    return next();
  });
}

module.exports = registerGameHandlers;
module.exports.showBonusMenu = showBonusMenu;
