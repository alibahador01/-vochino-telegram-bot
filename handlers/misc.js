// handlers/misc.js
const texts = require('../texts');
const { sessions, showMainMenu, reactToMessage } = require('../utils');
const { pool, getUser, getAllUsers } = require('../db');
const { ADMIN_IDS } = require('../constants');

function isAdmin(telegramId) {
  return ADMIN_IDS.includes(Number(telegramId));
}

module.exports = function registerMiscHandlers(bot) {

  bot.action('back_main_menu', async (ctx) => {
    ctx.answerCbQuery();
    delete sessions[ctx.from.id];
    // ری‌اکشن ساده (غیرشناور) روی پیامی که «بازگشت به منو» رویش زده شد
    if (ctx.callbackQuery && ctx.callbackQuery.message) {
      reactToMessage(ctx, ctx.chat.id, ctx.callbackQuery.message.message_id, false);
    }
    try { await ctx.deleteMessage(); } catch (e) {}
    showMainMenu(ctx);
  });

  bot.action('cancel_flow', async (ctx) => {
    ctx.answerCbQuery();
    delete sessions[ctx.from.id];
    if (ctx.callbackQuery && ctx.callbackQuery.message) {
      reactToMessage(ctx, ctx.chat.id, ctx.callbackQuery.message.message_id, false);
    }
    try { await ctx.deleteMessage(); } catch (e) {}
    showMainMenu(ctx);
  });

  bot.action('menu_buy', async (ctx) => {
    ctx.answerCbQuery();
    return ctx.deleteMessage().then(() => ctx.answerCbQuery()).catch(() => {});
  });

  bot.action('menu_sell', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    const { getSellProducts } = require('../db');
    const products = await getSellProducts(true);
    const t = texts.fa;
    if (products.length === 0) return ctx.reply(t.sellNoProducts);
    const buttons = products.map(p => [{ text: p.name, callback_data: 'sell_' + p.key }]);
    ctx.reply(t.sellMenuTitle, { reply_markup: { inline_keyboard: buttons } });
  });

  bot.action('menu_wallet', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    return require('./wallet').showWalletMenu(ctx);
  });

  bot.action('menu_bonus', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    const gameHandler = require('./game');
    return gameHandler.showBonusMenu(ctx);
  });

  // 🐽 هوچینو AI برتر⁰¹ — منوی اصلی هوچینو (ماژول مستقل)
bot.action('menu_hochino_main', async (ctx) => {
  ctx.answerCbQuery();
  try { await ctx.deleteMessage(); } catch (e) {}
  const text = [
    '🐽 <b>هوچینو AI برتر⁰¹</b>',
    '',
    'یکی از گزینه‌های زیر رو انتخاب کن:'
  ].join('\n');
  return ctx.reply(text, {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [{ text: '💬 گفتگو AI هوچینو⁰¹', callback_data: 'hochino_chat' }],
        [{ text: '⚽️ تحلیل AI هوچینو⁰¹', callback_data: 'hochino_analyze' }],
        [{ text: '📆 جدول AI هوچینو⁰¹',  callback_data: 'hochino_table' }]
      ]
    }
  });
});

  bot.action('menu_support', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    return require('./aiSupport').showSupportMenu(ctx);
  });
};

