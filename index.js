const { Telegraf } = require('telegraf');
const express = require('express');
const https = require('https');
const AntiSleepBot = require('./antiSleep');

const { pool, initDb, sendRatesToChannel } = require('./db');
const { ADMIN_IDS } = require('./constants');

const app = express();
const PORT = process.env.PORT || 3000;

const antiSleep = new AntiSleepBot(process.env.APP_URL || `https://vochino-telegram-bot.onrender.com`);

app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'alive', 
        message: "نمیتونی منو بخوابونی! 😎",
        wakeCount: antiSleep.wakeCount,
        uptime: process.uptime()
    });
});

app.get('/ping', (req, res) => {
    res.status(200).send('pong 🏓');
});

app.get('/wake-up', (req, res) => {
    antiSleep.emergencyWakeUp();
    res.status(200).json({ message: 'بیدار شدم! 🚨' });
});

app.get('/keep-alive', (req, res) => {
    antiSleep.internalActivity();
    res.status(200).json({ message: 'هنوز زندم! 💪' });
});

app.get('/api/status', (req, res) => {
    res.status(200).json({
        status: 'running',
        wakeCount: antiSleep.wakeCount,
        memory: process.memoryUsage(),
        uptime: process.uptime()
    });
});

app.get('/', (req, res) => {
    res.send(`
        <h1>🤖 ربات ضد خواب فعاله!</h1>
        <p>تعداد دفعات بیداری: ${antiSleep.wakeCount}</p>
        <p>حتی Render هم نمی‌تونه منو بخوابونه! 😂</p>
    `);
});

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

const bot = new Telegraf(process.env.BOT_TOKEN);

require('./handlers/registration')(bot);
require('./handlers/wallet')(bot);
require('./handlers/buy')(bot);
require('./handlers/sell')(bot);
require('./handlers/game')(bot);
require('./handlers/admin')(bot);
require('./handlers/misc')(bot);
require('./handlers/profile')(bot);
require('./handlers/vpn')(bot);
require('./handlers/currencyFeed')(bot);

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

async function init() {
  await initDb();
  
  try {
    const isFeedActive = await pool.query(`SELECT value FROM settings WHERE key = 'currency_feed_active'`);
    if (isFeedActive.rows.length > 0 && isFeedActive.rows[0].value === 'true') {
        await sendRatesToChannel(bot);
    }
  } catch (e) {
    console.log('خطا در ارسال نرخ: ' + e.message);
  }
  
  bot.launch();
  console.log('✅ ربات با موفقیت به Supabase متصل و روشن شد');
  
  antiSleep.startAll();
  console.log('🛡️ سیستم ضد خواب با موفقیت فعال شد');
}

init().catch(function (e) {
  console.log('INIT ERROR: ' + e.message);
  console.log('INIT ERROR STACK: ' + e.stack);
});

app.listen(PORT, () => {
  console.log('🌐 Web server running on port ' + PORT);
});
