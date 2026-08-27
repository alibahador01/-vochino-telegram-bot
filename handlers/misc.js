// handlers/misc.js
const texts = require('../texts');
const { sessions, showMainMenu } = require('../utils');
const { pool, getUser, getAllUsers } = require('../db');
const { ADMIN_IDS } = require('../constants');

function isAdmin(telegramId) {
  return ADMIN_IDS.includes(Number(telegramId));
}

module.exports = function registerMiscHandlers(bot) {

  bot.action('back_main_menu', async (ctx) => {
    ctx.answerCbQuery();
    delete sessions[ctx.from.id];
    try { await ctx.deleteMessage(); } catch (e) {}
    showMainMenu(ctx);
  });

  bot.action('cancel_flow', async (ctx) => {
    ctx.answerCbQuery();
    delete sessions[ctx.from.id];
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

  // 🌐 وب‌سایت ووچینو⁰۱ – مستقیم لینک را باز کن
  bot.action('menu_website', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    const websiteUrl = process.env.WEBSITE_URL || 'https://vochino.com';
    ctx.reply(`🌐 وب‌سایت ووچینو⁰۱:\n${websiteUrl}`, {
      reply_markup: {
        inline_keyboard: [[{ text: '🚀 باز کردن وب‌سایت', url: websiteUrl }]]
      }
    });
  });

  bot.action('menu_support', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    return require('./aiSupport').showSupportMenu(ctx);
  });
};

