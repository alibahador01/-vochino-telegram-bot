const { Telegraf } = require('telegraf');
const express = require('express');
const https = require('https');

const { pool, initDb } = require('./db');

// Express Server for Render Health Check
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => { res.send('Bot is alive and connected to Supabase!'); });
app.listen(PORT, () => { console.log(`Web server is running on port ${PORT}`); });

// ===== سیستم ضد خواب ۴ لایه (بدون اجازه خواب!) 👁️⚡ =====

setInterval(() => {
  const url = 'https://vochino-telegram-bot.onrender.com';
  https.get(url, (res) => {
    console.log(`[Layer 1 - Web] Status: ${res.statusCode}`);
  }).on('error', (err) => {});
}, 2 * 60 * 1000);

setInterval(() => {
  const url = 'https://vochino-telegram-bot.onrender.com';
  https.get(url, (res) => {
    console.log(`[Layer 2 - Web] Status: ${res.statusCode}`);
  }).on('error', (err) => {});
}, 5 * 60 * 1000);

setInterval(async () => {
  try {
    await pool.query('SELECT 1');
    console.log(`[Layer 3 - DB] Supabase pinged!`);
  } catch (err) {}
}, 3 * 60 * 1000);

setInterval(async () => {
  try {
    await pool.query('SELECT 1');
    console.log(`[Layer 4 - DB] Supabase backup pinged!`);
  } catch (err) {}
}, 7 * 60 * 1000);
// ============================================================

const bot = new Telegraf(process.env.BOT_TOKEN);

// وصل کردن همه‌ی هندلرها به ربات (هر فایل، بخش خودش رو ثبت می‌کنه)
require('./handlers/registration')(bot);
require('./handlers/wallet')(bot);
require('./handlers/buy')(bot);
require('./handlers/sell')(bot);
require('./handlers/game')(bot);
require('./handlers/admin')(bot);
require('./handlers/misc')(bot);

// ✅ لایه‌ی محافظتی: جلوگیری از کرش کل برنامه به خاطر خطاهای خارج از هندلرهای تلگرام
process.on('unhandledRejection', (err) => {
  console.log('UNHANDLED REJECTION: ' + (err && err.message ? err.message : err));
});
process.on('uncaughtException', (err) => {
  console.log('UNCAUGHT EXCEPTION: ' + err.message);
  console.log(err.stack);
});

// ✅ محافظ کلی خطا - بدون این، هر خطای کوچیک تو یه هندلر می‌تونست کل ربات رو کرش کنه
bot.catch((err, ctx) => {
  console.log('BOT ERROR: ' + err.message);
  console.log(err.stack);
  try {
    ctx.reply('⚠️ یه خطای موقت رخ داد، لطفاً دوباره تلاش کن. اگه ادامه داشت به پشتیبانی خبر بده.');
  } catch (e) {}
});

async function init() {
  await initDb();
  bot.launch();
  console.log('ربات با موفقیت به Supabase متصل و روشن شد');
}

init().catch(function (e) {
  console.log('INIT ERROR: ' + e.message);
  console.log('INIT ERROR STACK: ' + e.stack);
});
