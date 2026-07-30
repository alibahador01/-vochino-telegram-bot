const { pool } = require('../db');
const texts = require('../texts');

const BONUS_THRESHOLD = 500000;
const BONUS_AMOUNT = 100000;
const BONUS_WIN_PROBABILITY = 0.05;

async function getUserTotalPurchases(telegramId) {
  const res = await pool.query(
    "SELECT COALESCE(SUM(amount), 0) AS total FROM orders WHERE telegram_id = $1 AND status = 'completed'",
    [String(telegramId)]
  );
  return Number(res.rows[0].total);
}

async function getActiveBonus(telegramId) {
  const res = await pool.query(
    "SELECT * FROM bonuses WHERE telegram_id = $1 AND status = 'available' ORDER BY id DESC LIMIT 1",
    [String(telegramId)]
  );
  return res.rows[0] || null;
}

async function grantBonusIfEligible(telegramId) {
  const total = await getUserTotalPurchases(telegramId);
  if (total < BONUS_THRESHOLD) return;
  const existing = await pool.query(
    'SELECT * FROM bonuses WHERE telegram_id = $1',
    [String(telegramId)]
  );
  if (existing.rows.length > 0) return;
  await pool.query(
    'INSERT INTO bonuses (telegram_id, status, amount, created_at) VALUES ($1, $2, $3, $4)',
    [String(telegramId), 'available', BONUS_AMOUNT, new Date().toISOString()]
  );
}

function registerGameHandlers(bot) {
  bot.action('menu_game', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    const t = texts.fa;
    const bonus = await getActiveBonus(ctx.from.id);
    if (!bonus) {
      const hasAnyBonus = await pool.query('SELECT * FROM bonuses WHERE telegram_id = $1', [String(ctx.from.id)]);
      if (hasAnyBonus.rows.length > 0) {
        ctx.reply(t.gameAlreadyUsed);
      } else {
        ctx.reply(t.gameNotEligible);
      }
      return;
    }
    ctx.reply(t.gameEligibleIntro, {
      reply_markup: {
        inline_keyboard: [
          [{ text: t.gameDiceButton, callback_data: 'game_play_dice' }],
          [{ text: t.gameBasketballButton, callback_data: 'game_play_basketball' }],
          [{ text: '🔙 بیخیال', callback_data: 'back_main_menu', style: 'danger' }]
        ]
      }
    });
  });

  async function playBonusGame(ctx, emoji) {
    const t = texts.fa;
    const bonus = await getActiveBonus(ctx.from.id);
    if (!bonus) {
      try { await ctx.deleteMessage(); } catch (e) {}
      ctx.reply(t.gameAlreadyUsed);
      return;
    }
    try { await ctx.deleteMessage(); } catch (e) {}
    await pool.query("UPDATE bonuses SET status = 'in_progress' WHERE id = $1", [bonus.id]);
    await ctx.reply(t.gamePlaying);
    await ctx.sendDice({ emoji: emoji }).catch(function () {});
    const won = Math.random() < BONUS_WIN_PROBABILITY;
    setTimeout(async function () {
      try {
        if (won) {
          await pool.query('UPDATE users SET balance = balance + $1 WHERE telegram_id = $2', [BONUS_AMOUNT, String(ctx.from.id)]);
          await pool.query("UPDATE bonuses SET status = 'used_won' WHERE id = $1", [bonus.id]);
          ctx.reply(t.gameWin);
        } else {
          await pool.query("UPDATE bonuses SET status = 'used_lost' WHERE id = $1", [bonus.id]);
          ctx.reply(t.gameLose);
        }
      } catch (e) {
        console.log('Game settlement error: ' + e.message);
      }
    }, 4000);
  }

  bot.action('game_play_dice', async (ctx) => {
    ctx.answerCbQuery();
    await playBonusGame(ctx, '🎲');
  });

  bot.action('game_play_basketball', async (ctx) => {
    ctx.answerCbQuery();
    await playBonusGame(ctx, '🏀');
  });
}

module.exports = { registerGameHandlers, grantBonusIfEligible };
