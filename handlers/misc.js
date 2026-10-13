// handlers/misc.js
const texts = require('../texts');
const { sessions, showMainMenu, getActiveMenuChannel, reactToMessage, backToMenuButton } = require('../utils');
const { pool, getUser, getAllUsers } = require('../db');
const { ADMIN_IDS } = require('../constants');
const i18n = require('../i18n');

function isAdmin(telegramId) {
  return ADMIN_IDS.includes(Number(telegramId));
}

// بازگشت به منو — آرام و بدون مزاحمت برای مشتری:
// • بدون استیکر و بدون ری‌اکشن شناور (فقط ری‌اکشن ساده/غیرشناور)
// • ری‌اکشن فقط روی پیام منوی تازه‌ارسال‌شده گذاشته می‌شود، نه روی پیامی که همین الان حذف شده
//   (روی پیام حذف‌شده، تلگرام «message to react not found» می‌دهد)
async function backToMenuQuietly(ctx) {
  const sent = await showMainMenu(ctx);
  if (sent && sent.message_id) {
    await reactToMessage(ctx, ctx.chat.id, sent.message_id, false);
  }
}

module.exports = function registerMiscHandlers(bot) {

  bot.action('back_main_menu', async (ctx) => {
    ctx.answerCbQuery();
    delete sessions[ctx.from.id];
    try { await ctx.deleteMessage(); } catch (e) {}
    await backToMenuQuietly(ctx);
  });

  bot.action('cancel_flow', async (ctx) => {
    ctx.answerCbQuery();
    delete sessions[ctx.from.id];
    try { await ctx.deleteMessage(); } catch (e) {}
    await backToMenuQuietly(ctx);
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

  // گزینه‌ی اختیاری «کانال و نرخ‌های آنلاین» — طبق مرحله‌ی پنجم سند: فقط وقتی در utils.showMainMenu
  // دکمه‌اش ساخته شده (یعنی کانال معتبری در پنل مدیریت تنظیم است) این هندلر هم واقعاً چیزی برای نمایش دارد؛
  // اگر بین باز شدن منو و کلیک کاربر، ادمین کانال را حذف/غیرفعال کرده باشد، پیام «تنظیم نشده» نشان داده می‌شود
  // (وضعیت لحظه‌ای از دیتابیس خوانده می‌شود، نه مقدار ثابت).
  bot.action('menu_channel', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    const user = await getUser(ctx.from.id);
    const lang = i18n.normalizeLang(user && user.language) || 'en';
    const channel = await getActiveMenuChannel();
    if (!channel) {
      return ctx.reply(i18n.t(lang, 'channel.not_configured'), {
        reply_markup: { inline_keyboard: [[backToMenuButton()]] }
      });
    }
    return ctx.reply(i18n.t(lang, 'channel.message'), {
      reply_markup: {
        inline_keyboard: [
          [{ text: i18n.t(lang, 'channel.open'), url: channel.invite_link }],
          [backToMenuButton()]
        ]
      }
    });
  });
};
