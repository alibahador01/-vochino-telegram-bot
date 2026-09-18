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

  // توجه: هندلرهای menu_buy / menu_sell / menu_wallet / menu_bonus از اینجا حذف شدند —
  // نسخه‌ی واقعی و درست هرکدام در فایل مربوط به همان بخش ثبت می‌شود
  // (به ترتیب: handlers/buy.js، handlers/sell.js، handlers/wallet.js، handlers/game.js)
  // و چون در index.js زودتر از این فایل require می‌شوند، نسخه‌های اینجا هیچ‌وقت واقعاً
  // اجرا نمی‌شدند؛ نگه‌داشتنشان فقط کد مرده و گمراه‌کننده بود (یکی از آن‌ها —
  // menu_wallet — حتی به یک تابع نادرست/ناموجود اشاره می‌کرد که در صورت اجرا خطا می‌داد).

  bot.action('menu_support', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    return require('./aiSupport').showSupportMenu(ctx);
  });
};
