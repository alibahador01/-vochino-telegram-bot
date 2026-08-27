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
    const userRes = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [userId]);
    if (!userRes.rows[0]) return res.status(404).send('کاربر یافت نشد.');

    const subRes = await pool.query(
      "SELECT * FROM vpn_subscriptions WHERE user_id = $1 AND status = 'active' AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1",
      [userId]
    );
    if (subRes.rows.length === 0) return res.status(403).send('اشتراک فعالی یافت نشد.');

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

// ==================== API واقعی برای داشبورد سایت ====================
app.get('/api/dashboard/:userId', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const userId = req.params.userId;
  try {
    const userRes = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [userId]);
    if (!userRes.rows[0]) return res.status(404).json({ error: 'user not found' });
    const u = userRes.rows[0];

    const subRes = await pool.query(
      "SELECT * FROM vpn_subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
      [userId]
    );
    const sub = subRes.rows[0] || null;

    const serversRes = await pool.query(
      `SELECT * FROM vpn_servers WHERE is_active = true ORDER BY priority ASC`
    );

    const guessProtocol = (text) => {
      if (!text) return '';
      if (text.startsWith('vless://')) return 'VLESS';
      if (text.startsWith('vmess://')) return 'V2Ray';
      if (text.startsWith('trojan://')) return 'Trojan';
      if (text.startsWith('ss://')) return 'Shadowsocks';
      return 'Config';
    };

    const configs = serversRes.rows
      .filter(s => s.config_text && s.config_text.trim().length > 0)
      .map(s => ({
        country: s.name || 'Server',
        city: '',
        flag: '🌐',
        protocol: guessProtocol(s.config_text.trim()),
        url: s.config_text.trim(),
        status: s.health_status === 'healthy' ? 'online' : 'offline'
      }));

    let subscription = { remainingDays: 0, totalDays: 0, expireDate: '—', status: 'none' };
    let traffic = { used: '0 GB', total: '0 GB', remaining: '0 GB', percentage: 0 };

    if (sub) {
      const now = new Date();
      const expires = new Date(sub.expires_at);
      const created = new Date(sub.created_at);
      const remainingDays = Math.max(0, Math.ceil((expires - now) / (1000 * 60 * 60 * 24)));
      const totalDays = Math.max(1, Math.ceil((expires - created) / (1000 * 60 * 60 * 24)));
      subscription = {
        remainingDays,
        totalDays,
        expireDate: expires.toISOString().slice(0, 10),
        status: sub.status
      };
      const dataUsed = Number(sub.data_used || 0);
      const dataLimit = Number(sub.data_limit || 0);
      const percentage = dataLimit > 0 ? Math.round((dataUsed / dataLimit) * 100) : 0;
      traffic = {
        used: (dataUsed / (1024 * 1024 * 1024)).toFixed(2) + ' GB',
        total: (dataLimit / (1024 * 1024 * 1024)).toFixed(0) + ' GB',
        remaining: Math.max(0, (dataLimit - dataUsed) / (1024 * 1024 * 1024)).toFixed(2) + ' GB',
        percentage
      };
    }

    res.json({
      user: { username: u.full_name || u.username || userId, id: userId, hash: '', avatar: null },
      subscription,
      traffic,
      configs
    });
  } catch (err) {
    console.error('خطا در API داشبورد:', err);
    res.status(500).json({ error: 'server error' });
  }
});

app.get('*', (req, res) => res.send('Vochino Bot Active'));

app.listen(PORT, () => {
  console.log(`Web server running on port ${PORT}`);
});

// ضدخواب
if (process.env.NODE_ENV !== 'development') {
  const antiSleep = new AntiSleepBot(process.env.RENDER_EXTERNAL_URL || process.env.APP_URL || 'https://vochino-telegram-bot.onrender.com');
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
require('./handlers/verification')(bot);
require('./handlers/wallet')(bot);
require('./handlers/buy')(bot);
require('./handlers/sell')(bot);
require('./handlers/game')(bot);
// ⚠️ orderAdmin باید قبل از admin ثبت شود
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
