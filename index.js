const { Telegraf } = require('telegraf');
const express = require('express');
const https = require('https');

const { pool, initDb, sendRatesToChannel } = require('./db');
const { ADMIN_IDS } = require('./constants');

// ===== Express Server =====
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Bot is 100% Active & Anti-Sleep Engine Running!');
});

app.listen(PORT, () => {
  console.log('Web server is running on port ' + PORT);
});

// =======================================================
// 🛡️ سیستم ضدخواب نردبانی و پشتیبان (اصلاً امکان خواب ندارد)
// =======================================================

const RENDER_URL = 'https://vochino-telegram-bot.onrender.com';

// تابع ارسال پینگ با ثبت زمان برای جلوگیری از کندی
function pingServer(label) {
  const startTime = Date.now();
  https.get(RENDER_URL, (res) => {
    const duration = Date.now() - startTime;
    console.log(`[Anti-Sleep | ${label}] Status: ${res.statusCode} (${duration}ms)`);
  }).on('error', (err) => {
    console.log(`[Anti-Sleep | ${label} Error]: ${err.message}`);
  });
}

// ۱. لایه ضربان فوق سریع (۳۰ ثانیه) - بیدارباش لحظه‌ای
setInterval(() => {
  pingServer('1) 30-Sec Fast Pulse');
}, 30 * 1000);

// ۲. لایه نردبانی ۱ (۶۰ ثانیه / ۱ دقیقه) - پشتیبان اول
setInterval(() => {
  pingServer('2) 1-Min Backup');
}, 60 * 1000);

// ۳. لایه نردبانی ۲ (۱۲۰ ثانیه / ۲ دقیقه) - پشتیبان دوم
setInterval(() => {
  pingServer('3) 2-Min Backup');
}, 120 * 1000);

// ۴. لایه نردبانی ۳ (۲۰۰ ثانیه / ۳.۳ دقیقه) - پشتیبان سوم
setInterval(() => {
  pingServer('4) 200-Sec Backup');
}, 200 * 1000);

// ۵. لایه پشتیبان ۴ (۳ دقیقه)
setInterval(() => {
  pingServer('5) 3-Min Backup');
}, 3 * 60 * 1000);

// ۶. لایه پشتیبان ۵ (۴ دقیقه)
setInterval(() => {
  pingServer('6) 4-Min Backup');
}, 4 * 60 * 1000);

// ۷. لایه چتر نجات نهایی (۵ دقیقه)
setInterval(() => {
  pingServer('7) 5-Min Safety Net');
}, 5 * 60 * 1000);

// ۸. لایه پینگ اختصاصی دیتابیس Supabase (هر ۲ دقیقه) - جلوگیری از قطع اتصال دیتابیس
setInterval(async () => {
  try {
    await pool.query('SELECT 1');
    console.log('[Anti-Sleep | Supabase DB]: Active');
  } catch (err) {
    console.log('[Anti-Sleep | Supabase DB Error]: ' + err.message);
  }
}, 2 * 60 * 1000);

// =======================================================

// ===== ربات =====
const bot = new Telegraf(process.env.BOT_TOKEN);

// ===== هندلرها =====
require('./handlers/registration')(bot);
require('./handlers/wallet')(bot);
require('./handlers/buy')(bot);
require('./handlers/sell')(bot);
require('./handlers/game')(bot);
require('./handlers/admin')(bot);
require('./handlers/misc')(bot);

// هندلرهای جدید
require('./handlers/profile')(bot);       // برای پروفایل و احراز هویت
require('./handlers/vpn')(bot);           // برای سرویس فیلترشکن رایگان
require('./handlers/currencyFeed')(bot);  // برای مدیریت نرخ ارز

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
  
  try {
    // ارسال نرخ اولیه به کانال (در صورت فعال بودن)
    const isFeedActive = await pool.query(`SELECT value FROM settings WHERE key = 'currency_feed_active'`);
    if (isFeedActive.rows.length > 0 && isFeedActive.rows[0].value === 'true') {
        await sendRatesToChannel(bot);
    }
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
