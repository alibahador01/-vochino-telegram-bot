// index.js
const { Telegraf, session } = require('telegraf');
const express = require('express');
const https = require('https');

const { pool, initDb, sendRatesToChannel } = require('./db');
const { ADMIN_IDS } = require('./constants');
const { loadTextsCache } = require('./textManager');

// ===== Express Server =====
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => { res.send('Bot is alive and connected to Supabase!'); });
app.listen(PORT, () => { console.log('Web server is running on port ' + PORT); });

// ===== سیستم ضدخواب =====
setInterval(() => {
  const url = 'https://vochino-telegram-bot.onrender.com';
  https.get(url, (res) => {
    console.log('[Layer 1 - Web] Status: ' + res.statusCode);
  }).on('error', (err) => {});
}, 2 * 60 * 1000);

setInterval(async () => {
  try {
    await pool.query('SELECT 1');
    console.log('[Layer 2 - DB] Supabase pinged!');
  } catch (err) {}
}, 3 * 60 * 1000);

// ===== ربات =====
const bot = new Telegraf(process.env.BOT_TOKEN);

// ===== میدلور session =====
bot.use(session());

// ===== هندلرهای اصلی =====
require('./handlers/registration')(bot);
require('./handlers/wallet')(bot);
require('./handlers/buy')(bot);
require('./handlers/sell')(bot);
require('./handlers/game')(bot);
require('./handlers/admin')(bot);
require('./handlers/misc')(bot);

// ===== مدیریت خطا =====
process.on('unhandledRejection', (err) => {
  console.log('UNHANDLED REJECTION: ' + (err && err.message ? err.message : err));
});
process.on('uncaughtException', (err) => {
  console.log('UNCAUGHT EXCEPTION: ' + err.message);
  console.log(err.stack);
});

bot.catch((err, ctx) => {
  console.log('BOT ERROR: ' + err.message);
  console.log(err.stack);
  try {
    ctx.reply('⚠️ یه خطای موقت رخ داد، لطفاً دوباره تلاش کن.');
  } catch (e) {}
  try {
    const adminId = ADMIN_IDS[0];
    ctx.telegram.sendMessage(adminId, '🧨 گزارش خطای واقعی ربات:\n' + err.message + '\n\n👤 کاربر: ' + (ctx.from ? ctx.from.id : '-'));
  } catch (e) {}
});

// ===== شروع =====
async function init() {
  await initDb();
  
  // لود کش متن‌ها
  const cacheLoaded = await loadTextsCache();
  if (!cacheLoaded) {
    console.log('⚠️ کش متن‌ها بارگذاری نشد، از مقادیر پیش‌فرض استفاده می‌شود');
  }
  
  try {
    await sendRatesToChannel(bot);
  } catch (e) {
    console.log('خطا در ارسال نرخ: ' + e.message);
  }
  
  bot.launch();
  console.log('✅ ربات با موفقیت به Supabase متصل و روشن شد');
}

init().catch(function (e) {
  console.log('INIT ERROR: ' + e.message);
  console.log('INIT ERROR STACK: ' + e.stack);
});
