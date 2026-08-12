// index.js
const { Telegraf, session } = require('telegraf');
const express = require('express');
const https = require('https');
const path = require('path');

const { pool, initDb, sendRatesToChannel } = require('./db');
const { ADMIN_IDS } = require('./constants');
const { loadTextsCache } = require('./textManager');
const AntiSleepBot = require('./AntiSleepBot');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// *** مسیر اصلی (باید حتماً 200 بده) ***
app.get('/', (req, res) => {
  res.send('Bot is alive and connected to Supabase!');
});

// مسیر سابسکرایب VPN
app.get('/sub/:userId', async (req, res) => {
  const userId = req.params.userId;
  try {
    const userRes = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [userId]);
    if (!userRes.rows[0]) return res.status(404).send('کاربر یافت نشد.');
    const user = userRes.rows[0];

    const subRes = await pool.query(
      "SELECT * FROM vpn_subscriptions WHERE user_id = $1 AND status = 'active' AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1",
      [userId]
    );
    const subscription = subRes.rows[0] || null;

    let daysLeft = 0, dataUsed = 0, dataLimit = 5 * 1024 * 1024 * 1024;
    if (subscription) {
      daysLeft = Math.max(0, Math.ceil((new Date(subscription.expires_at) - new Date()) / (1000 * 60 * 60 * 24)));
      dataUsed = subscription.data_used || 0;
      dataLimit = subscription.data_limit || dataLimit;
    }

    const baseUrl = process.env.BASE_URL || 'https://yourdomain.com';
    const totalUsers = (await pool.query('SELECT COUNT(*)::int AS c FROM users')).rows[0].c;
    const activeOrders = (await pool.query(
      "SELECT COUNT(*)::int AS c FROM orders WHERE status = 'completed' AND created_at >= CURRENT_DATE - INTERVAL '7 days'"
    )).rows[0].c;

    res.render('subscription', { user, subscription, daysLeft, dataUsed, dataLimit, baseUrl, totalUsers, activeOrders });
  } catch (err) {
    console.error(err);
    res.status(500).send('خطای سرور');
  }
});

// *** گوش دادن روی پورت ***
app.listen(PORT, () => {
  console.log(`Web server running on port ${PORT}`);
});

// ضدخواب
if (process.env.NODE_ENV !== 'development') {
  const antiSleep = new AntiSleepBot(process.env.APP_URL || 'https://your-app.onrender.com');
  antiSleep.startAll();
} else {
  setInterval(() => {
    https.get('https://vochino-telegram-bot.onrender.com', (res) => console.log('[Dev Ping] Status:', res.statusCode)).on('error', () => {});
  }, 14 * 60 * 1000);
}

const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use(session());

// هندلرها
require('./handlers/registration')(bot);
require('./handlers/wallet')(bot);
require('./handlers/buy')(bot);
require('./handlers/sell')(bot);
require('./handlers/game')(bot);
require('./handlers/admin')(bot);
require('./handlers/adminBonus')(bot);
require('./handlers/misc')(bot);
require('./handlers/profile')(bot);
require('./handlers/vpn')(bot);
require('./handlers/currencyFeed')(bot);

// مدیریت خطا
process.on('unhandledRejection', (err) => console.log('UNHANDLED REJECTION:', err.message));
process.on('uncaughtException', (err) => {
  console.log('UNCAUGHT EXCEPTION:', err.message);
  console.log(err.stack);
});

bot.catch((err, ctx) => {
  console.log('BOT ERROR:', err.message);
  try { ctx.reply('⚠️ خطای موقت. لطفاً دوباره تلاش کنید.'); } catch (e) {}
  try { ADMIN_IDS.forEach(id => ctx.telegram.sendMessage(id, `🧨 خطا:\n${err.message}\n👤 ${ctx.from?.id || '-'}`)); } catch (e) {}
});

async function init() {
  await initDb();
  const cacheLoaded = await loadTextsCache();
  if (!cacheLoaded) console.log('⚠️ کش متن‌ها بارگذاری نشد.');
  try { await sendRatesToChannel(bot); } catch (e) { console.log('خطا در ارسال نرخ:', e.message); }
  bot.launch();
  console.log('✅ ربات روشن شد');
}

init().catch(e => { console.log('INIT ERROR:', e.message); console.log(e.stack); });
