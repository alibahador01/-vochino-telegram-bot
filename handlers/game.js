const texts = require('../texts');
const { pool, getActiveBonus } = require('../db');
const { BONUS_WIN_PROBABILITY, BONUS_AMOUNT } = require('../constants');

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

module.exports = function registerGameHandlers(bot) {
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

  bot.action('game_play_dice', async (ctx) => {
    ctx.answerCbQuery();
    await playBonusGame(ctx, '🎲');
  });

  bot.action('game_play_basketball', async (ctx) => {
    ctx.answerCbQuery();
    await playBonusGame(ctx, '🏀');
  });
};
