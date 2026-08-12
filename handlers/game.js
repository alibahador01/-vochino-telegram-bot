// handlers/game.js
const { Markup } = require('telegraf');
const { sessions } = require('../utils');
const { pool, getUser, getSetting } = require('../db');
const { checkAndGrantBonuses } = require('./bonusEngine');

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

async function showBonusMenu(ctx) {
  const userId = ctx.from.id;
  const user = await getUser(userId);

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
      try { ctx.telegram.sendMessage(userId, `🎁 هدیه اولین خرید: ${giftAmount.toLocaleString()} تومان به بونوس شما اضافه شد.`); } catch (e) {}
    } else {
      await pool.query('UPDATE users SET bonus_gift_received = true WHERE telegram_id = $1', [String(userId)]);
    }
  }

  const buttons = gameKeys.map(key => [{ text: gameMessages.gameNames[key], callback_data: 'game_select_' + key }]);
  buttons.push([{ text: gameMessages.back, callback_data: 'back_main_menu' }]);
  ctx.reply(gameMessages.chooseGame, Markup.inlineKeyboard(buttons));
}

function registerGameHandlers(bot) {
  bot.action('menu_bonus', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    return showBonusMenu(ctx);
  });

  bot.action(/^game_select_(.+)/, async (ctx) => {
    const gameKey = ctx.match[1];
    const userId = ctx.from.id;
    const user = await getUser(userId);
    if (!user) return ctx.answerCbQuery('⛔ کاربر یافت نشد');

    const gameDisabled = (await getSetting('disableBonusGame', 'false')) === 'true';
    if (gameDisabled) { ctx.answerCbQuery(); return ctx.reply(gameMessages.disabled); }

    const betAmount = 1000;
    const bonusBalance = Number(user.bonus_balance || 0);
    if (bonusBalance < betAmount) {
      ctx.answerCbQuery('❌ موجودی بونوس کافی نیست');
      return ctx.reply(gameMessages.insufficientBonus);
    }

    const winRate = parseInt(await getSetting('winRateBonus', '50'), 10);
    const multiplier = parseFloat(await getSetting('gameMultiplier', '2'));
    const won = Math.random() * 100 < winRate;

    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    if (won) {
      const gain = betAmount * multiplier;
      await pool.query('UPDATE users SET bonus_balance = bonus_balance + $1 WHERE telegram_id = $2', [gain - betAmount, String(userId)]);
      await ctx.reply(gameMessages.win(gain));
    } else {
      await pool.query('UPDATE users SET bonus_balance = bonus_balance - $1 WHERE telegram_id = $2', [betAmount, String(userId)]);
      await ctx.reply(gameMessages.lose);
    }

    setTimeout(() => showBonusMenu(ctx).catch(console.error), 2000);
  });
}

module.exports = registerGameHandlers;
module.exports.showBonusMenu = showBonusMenu;
