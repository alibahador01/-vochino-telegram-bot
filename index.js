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

// مسیرهای سلامت
app.get('/', (req, res) => res.send('Bot is alive and connected to Supabase!'));
app.get('/health', (req, res) => res.send('OK'));
app.get('/ping', (req, res) => res.send('PONG'));
app.get('/keep-alive', (req, res) => res.send('ALIVE'));
app.get('/api/status', (req, res) => res.json({ status: 'ok' }));

// ==================== مسیر سابسکرایب VPN ====================
app.get('/sub/:userId', async (req, res) => {
  const userId = req.params.userId;
  try {
    // بررسی کاربر
    const userRes = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [userId]);
    if (!userRes.rows[0]) return res.status(404).send('کاربر یافت نشد.');

    // بررسی اشتراک فعال
    const subRes = await pool.query(
      "SELECT * FROM vpn_subscriptions WHERE user_id = $1 AND status = 'active' AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1",
      [userId]
    );
    if (subRes.rows.length === 0) return res.status(403).send('اشتراک فعالی یافت نشد.');

    // گرفتن سرورهای فعال و سالم
    const serversRes = await pool.query(
      `SELECT * FROM vpn_servers 
       WHERE is_active = true AND health_status = 'healthy' 
         AND (cool_down_until IS NULL OR cool_down_until < NOW())
       ORDER BY priority ASC`
    );

    if (serversRes.rows.length === 0) return res.status(503).send('سروری در دسترس نیست.');

    const configLines = [];
    for (const server of serversRes.rows) {
      if (server.config_text && server.config_text.trim().length > 0) {
        configLines.push(server.config_text.trim());
      }
    }

    if (configLines.length === 0) {
      return res.status(500).send('کانفیگ سرورها تنظیم نشده است.');
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(configLines.join('\n'));
  } catch (err) {
    console.error('خطا در تولید سابسکرایب:', err);
    res.status(500).send('خطای سرور');
  }
});

// Catch-all
app.get('*', (req, res) => res.send('Vochino Bot Active'));

app.listen(PORT, () => {
  console.log(`Web server running on port ${PORT}`);
});

// ضدخواب
if (process.env.NODE_ENV !== 'development') {
  const antiSleep = new AntiSleepBot(process.env.APP_URL || 'https://vochino-telegram-bot.onrender.com');
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
// ⚠️ orderAdmin باید قبل از admin ثبت شود تا جریان‌های اصلاح‌شده فعال شوند
require('./handlers/orderAdmin')(bot);
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
