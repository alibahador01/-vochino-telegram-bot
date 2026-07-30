const { Telegraf } = require('telegraf');
const { initDb } = require('./db');
const { registerAdminCommands } = require('./handlers/admin');
const { registerSellHandlers } = require('./handlers/sell');

const bot = new Telegraf(process.env.BOT_TOKEN);
const sessions = {};

async function startBot() {
  try {
    console.log('⚡ در حال اتصال به پایگاه داده...');
    await initDb();
    console.log('✅ پایگاه داده با موفقیت متصل و آماده شد.');

    // ثبت دستورات و هندلرها
    registerAdminCommands(bot, sessions);
    registerSellHandlers(bot, sessions);

    // مدیریت خطاهای غیرمنتظره جهت جلوگیری از کرش سرور
    bot.catch((err, ctx) => {
      console.error(`❌ خطا در عملکرد ${ctx.updateType}:`, err);
    });

    console.log('🚀 در حال روشن کردن ربات...');
    await bot.launch();
    console.log('🤖 ربات با موفقیت آنلاین شد!');
  } catch (error) {
    console.error('❌ خطا در راه اندازی ربات:', error);
  }
}

startBot();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
