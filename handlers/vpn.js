// handlers/vpn.js
const net = require('net');
const path = require('path');
const Jimp = require('jimp');
const QRCode = require('qrcode');
const { pool, checkMembership, getSetting, setSetting, getUser, getReferrals } = require('../db');
const { ADMIN_IDS } = require('../constants');

const VPN_BANNER_PATH = path.join(__dirname, '..', 'assets', 'vpn_banner1.jpg');
const VPN_QR_BOX = { x0: 0.3076, y0: 0.3861, x1: 0.7158, y1: 0.6589 };
const VPN_DASHBOARD_BASE = 'https://alibahador01.github.io/VochinoSports01';
const RENEW_THRESHOLD_BYTES = 1 * 1024 * 1024 * 1024;

async function buildBannerWithQR(qrText) {
  const img = await Jimp.read(VPN_BANNER_PATH);
  const w = img.bitmap.width, h = img.bitmap.height;
  const bx0 = Math.round(VPN_QR_BOX.x0 * w), by0 = Math.round(VPN_QR_BOX.y0 * h);
  const bx1 = Math.round(VPN_QR_BOX.x1 * w), by1 = Math.round(VPN_QR_BOX.y1 * h);
  const boxW = bx1 - bx0, boxH = by1 - by0;
  const qrSize = Math.min(boxW, boxH);
  const qrBuffer = await QRCode.toBuffer(qrText, { margin: 1, width: qrSize });
  const qrImg = await Jimp.read(qrBuffer);
  const offsetX = bx0 + Math.round((boxW - qrSize) / 2);
  const offsetY = by0 + Math.round((boxH - qrSize) / 2);
  img.composite(qrImg, offsetX, offsetY);
  return img.getBufferAsync(Jimp.MIME_JPEG);
}

function getFeedUrl(userId) {
  return (process.env.BASE_URL || 'https://yourdomain.com') + '/sub/' + userId;
}

async function getDashboardUrl(userId) {
  const base = await getSetting('vpn_dashboard_url', VPN_DASHBOARD_BASE);
  return base + '?user_id=' + userId;
}

async function ensureVpnSchema() {
  const alterQueries = [
    `ALTER TABLE vpn_servers ADD COLUMN IF NOT EXISTS config_text TEXT`,
    `ALTER TABLE vpn_servers ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 1`,
    `ALTER TABLE vpn_servers ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER DEFAULT 0`,
    `ALTER TABLE vpn_servers ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMP`,
    `ALTER TABLE vpn_servers ADD COLUMN IF NOT EXISTS cool_down_until TIMESTAMP`,
    `ALTER TABLE vpn_servers ADD COLUMN IF NOT EXISTS avg_latency_ms INTEGER DEFAULT 0`
  ];
  for (const sql of alterQueries) {
    try { await pool.query(sql); } catch (e) {
      console.log('خطا در افزودن ستون vpn_servers:', e.message);
    }
  }
  const subAlter = [`ALTER TABLE vpn_subscriptions ADD COLUMN IF NOT EXISTS data_used BIGINT DEFAULT 0`];
  for (const sql of subAlter) {
    try { await pool.query(sql); } catch (e) {}
  }
}

function pingServer(server, timeoutMs) {
  return new Promise((resolve) => {
    if (!server.host || !server.port) return resolve({ ok: false, latency: null });
    const start = Date.now();
    const socket = net.createConnection({ host: server.host, port: server.port, timeout: timeoutMs });
    socket.on('connect', () => {
      const latency = Date.now() - start;
      socket.destroy();
      resolve({ ok: true, latency });
    });
    socket.on('timeout', () => { socket.destroy(); resolve({ ok: false, latency: null }); });
    socket.on('error', () => { socket.destroy(); resolve({ ok: false, latency: null }); });
  });
}

async function healthCheckServer(server) {
  const LATENCY_UNSTABLE_MS = 2500;
  let attempt = await pingServer(server, 4000);
  if (!attempt.ok) {
    await new Promise(r => setTimeout(r, 600));
    attempt = await pingServer(server, 4000);
  }
  if (!attempt.ok) return { healthy: false, unstable: false, latency: null };
  if (attempt.latency > LATENCY_UNSTABLE_MS) return { healthy: false, unstable: true, latency: attempt.latency };
  return { healthy: true, unstable: false, latency: attempt.latency };
}

async function runHealthCheck(bot) {
  await ensureVpnSchema();
  const { rows: servers } = await pool.query('SELECT * FROM vpn_servers ORDER BY priority ASC');
  const now = new Date();
  const failureThreshold = parseInt(await getSetting('vpn_failure_threshold', '2'), 10);
  const cooldownSeconds = parseInt(await getSetting('vpn_cooldown', '86400'), 10);

  for (const server of servers) {
    if (server.cool_down_until && new Date(server.cool_down_until) > now) continue;
    const result = await healthCheckServer(server);
    let newFailures = server.consecutive_failures || 0;
    let newStatus = server.health_status;

    if (result.healthy) { newFailures = 0; newStatus = 'healthy'; }
    else if (result.unstable) { newFailures += 0.5; newStatus = newFailures >= failureThreshold ? 'down' : 'unstable'; }
    else { newFailures++; newStatus = newFailures >= failureThreshold ? 'down' : 'unstable'; }

    await pool.query(
      `UPDATE vpn_servers SET health_status=$1, consecutive_failures=$2, last_checked_at=NOW(), avg_latency_ms=$3, is_active=$4 WHERE id=$5`,
      [newStatus, newFailures, result.latency || server.avg_latency_ms || 0, newStatus === 'down' ? false : server.is_active, server.id]
    );

    if (newStatus === 'down' && (!server.cool_down_until || new Date(server.cool_down_until) <= now)) {
      const coolUntil = new Date(Date.now() + cooldownSeconds * 1000).toISOString();
      await pool.query(`UPDATE vpn_servers SET is_active=false, cool_down_until=$1 WHERE id=$2`, [coolUntil, server.id]);
      if (server.priority === 1) {
        const backup = await pool.query(
          `SELECT * FROM vpn_servers WHERE id != $1 AND is_active = true AND (cool_down_until IS NULL OR cool_down_until < NOW()) AND health_status != 'down' ORDER BY priority ASC, avg_latency_ms ASC, id ASC LIMIT 1`,
          [server.id]
        );
        if (backup.rows[0]) {
          await pool.query(`UPDATE vpn_servers SET priority=1 WHERE id=$1`, [backup.rows[0].id]);
          await pool.query(`UPDATE vpn_servers SET priority=2 WHERE id=$1`, [server.id]);
          try { await bot.telegram.sendMessage(ADMIN_IDS[0], `🔄 سوییچ خودکار VPN\nسرور اصلی (${server.name}) از دسترس خارج شد.\nسرور پشتیبان (${backup.rows[0].name}) فعال شد.`); } catch (e) {}
        } else {
          try { await bot.telegram.sendMessage(ADMIN_IDS[0], `⚠️ هشدار VPN\nسرور اصلی (${server.name}) قطع شد و هیچ سرور پشتیبان سالمی پیدا نشد.`); } catch (e) {}
        }
      }
    }
  }
}

function startHealthCheckTimer(bot) {
  runHealthCheck(bot).catch(err => console.log('خطا در سلامت‌سنجی اولیه:', err.message));
  setInterval(() => runHealthCheck(bot).catch(err => console.log('خطا در سلامت‌سنجی:', err.message)), 45000);
}

async function getLatestSub(userId) {
  const res = await pool.query("SELECT * FROM vpn_subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1", [String(userId)]);
  return res.rows[0] || null;
}

function canGetNewSub(sub) {
  if (!sub) return true;
  if (sub.status !== 'active') return true;
  if (new Date(sub.expires_at) <= new Date()) return true;
  const used = Number(sub.data_used || 0);
  const limit = Number(sub.data_limit || 0);
  if (limit > 0 && (limit - used) <= RENEW_THRESHOLD_BYTES) return true;
  return false;
}

function glassKeyboard(defaultDays, defaultVolumeGB, trackingCode) {
  return {
    inline_keyboard: [
      [
        { text: `⏳ زمان اشتراک: ${defaultDays} روز`, callback_data: 'vpn_noop' },
        { text: `🌐 حجم سرویس: ${defaultVolumeGB} گیگ`, callback_data: 'vpn_noop' }
      ],
      [
        { text: '📷 دریافت QR Code', callback_data: 'vpn_qr:' + trackingCode },
        { text: '📥 دریافت کانفیگ‌ها', callback_data: 'vpn_get_link:' + trackingCode }
      ],
      [{ text: '📚 آموزش نصب', callback_data: 'vpn_guide' }]
    ]
  };
}

async function sendSpecialOffer(ctx) {
  ctx.answerCbQuery();
  try { await ctx.deleteMessage(); } catch (e) {}

  const vpnEnabled = (await getSetting('vpn_enabled', 'true')) === 'true';
  if (!vpnEnabled) return ctx.reply('⚠️ سرویس فیلترشکن در حال حاضر غیرفعال است.');

  const userId = ctx.from.id;
  const user = await getUser(userId);
  if (!user) return ctx.reply('⛔ کاربر یافت نشد.');

  const isMember = await checkMembership(ctx);
  if (!isMember) return ctx.reply('⚠️ لطفاً ابتدا در کانال اجباری عضو شوید.');

  const existingSub = await getLatestSub(userId);

  if (!canGetNewSub(existingSub)) {
    const dataLimit = Number(existingSub.data_limit || 0);
    const dataUsed = Number(existingSub.data_used || 0);
    const remainingGB = ((dataLimit - dataUsed) / (1024 * 1024 * 1024)).toFixed(2);
    return ctx.reply(
      `⚠️ شما هنوز حجم فعال دارید، لطفاً آن را مصرف کنید.\n\n📊 حجم باقی‌مانده: ${remainingGB} گیگ\n🔖 کد پیگیری: \`${existingSub.tracking_code}\``,
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '📥 دریافت کانفیگ‌ها', callback_data: 'vpn_get_link:' + existingSub.tracking_code }]] } }
    );
  }

  const defaultVolumeGB = parseInt(await getSetting('vpn_default_volume_gb', '5'), 10);
  const defaultDays = parseInt(await getSetting('vpn_default_days', '30'), 10);
  const dataLimit = defaultVolumeGB * 1024 * 1024 * 1024;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + defaultDays);
  const trackingCode = 'VPN-' + Math.floor(100000 + Math.random() * 900000);

  await pool.query(
    'INSERT INTO vpn_subscriptions (user_id, status, expires_at, data_limit, data_used, tracking_code, created_at) VALUES ($1, $2, $3, $4, 0, $5, NOW())',
    [String(userId), 'active', expiresAt.toISOString(), dataLimit, trackingCode]
  );

  const waitMsg = await ctx.reply('⏳ در حال آماده‌سازی اشتراک اختصاصی شما...');
  await new Promise(r => setTimeout(r, 900));
  try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}

  const feedUrl = getFeedUrl(userId);
  const caption =
    '╭─── ✧ ویژه ووچینو⁰¹ ✧ ───╮\n\n' +
    `🌐 اشتراک ${defaultVolumeGB} گیگ | اعتبار ${defaultDays} روز\n\n` +
    'با رسیدن مصرف به ۱ گیگ، امکان دریافت اشتراک رایگان مجدد برای شما فعال می‌شود.\n\n' +
    `🔖 کد پیگیری: ${trackingCode}`;

  const keyboard = glassKeyboard(defaultDays, defaultVolumeGB, trackingCode);

  try {
    const bannerWithQr = await buildBannerWithQR(feedUrl);
    await ctx.replyWithPhoto({ source: bannerWithQr }, { caption, reply_markup: keyboard });
  } catch (e) {
    console.log('خطا در ساخت بارکد روی بنر:', e.message);
    await ctx.reply(caption, { reply_markup: keyboard });
  }
}

async function sendSubscriptionLink(ctx, trackingCode) {
  ctx.answerCbQuery();
  const userId = ctx.from.id;
  const res = await pool.query("SELECT * FROM vpn_subscriptions WHERE tracking_code = $1 AND user_id = $2", [trackingCode, String(userId)]);
  const sub = res.rows[0];
  if (!sub) return ctx.reply('⚠️ اشتراک یافت نشد.');

  const dashboardUrl = await getDashboardUrl(userId);
  await ctx.reply(
    `🔗 لینک اشتراک اختصاصی شما آماده است.\nبرای دیدن کانفیگ‌ها و کپی کردنشون رو دکمه زیر بزن:\n\n🔖 کد پیگیری: \`${trackingCode}\``,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🌐 باز کردن داشبورد اشتراک', web_app: { url: dashboardUrl } }]] } }
  );
}

async function sendComingSoon(ctx) {
  ctx.answerCbQuery();
  try { await ctx.deleteMessage(); } catch (e) {}
  const text =
    '╭─ ✦ 👑 Vochino⁰¹ ✦ ─╮\n' +
    '         🛡️ ویژه ووچینو⁰¹\n' +
    '╰─ ✦ ────────── ✦ ─╯\n\n' +
    'سرویس اشتراک رایگان ووچینو⁰¹\n' +
    'در حال آماده‌سازی نهایی است.\n\n' +
    '⚡ پس از فعال‌سازی، می‌توانید\n' +
    'اشتراک ۵ گیگ یک‌ماهه خود را دریافت کنید.\n\n' +
    '💎 کیفیت و اعتبار، قبل از سرعت.';
  await ctx.reply(text);
}

function registerVPNHandlers(bot) {
  ensureVpnSchema().then(() => startHealthCheckTimer(bot)).catch(console.error);

  // موقتاً «آماده‌سازی» نشان داده می‌شود؛ sendSpecialOffer دست‌نخورده و کامل زیر همین فایل باقی می‌ماند
  // تا وقتی سرور VPN فعال شد، فقط همین خط زیر به sendSpecialOffer برگردانده شود.
  bot.action('menu_special', sendComingSoon);
  bot.action(/^vpn_get_link:(.+)$/, async (ctx) => { await sendSubscriptionLink(ctx, ctx.match[1]); });
  bot.action('vpn_noop', async (ctx) => { ctx.answerCbQuery(); });

  bot.action(/^vpn_qr:(.+)$/, async (ctx) => {
    ctx.answerCbQuery();
    const feedUrl = getFeedUrl(ctx.from.id);
    try {
      const bannerWithQr = await buildBannerWithQR(feedUrl);
      await ctx.replyWithPhoto({ source: bannerWithQr });
    } catch (e) {
      ctx.reply(`🔗 لینک سابسکرایب شما:\n\`${feedUrl}\``, { parse_mode: 'Markdown' });
    }
  });

  bot.action('vpn_guide', async (ctx) => {
    ctx.answerCbQuery();
    ctx.reply(
      '📚 آموزش نصب:\n\n' +
      '۱. یکی از اپلیکیشن‌های V2rayNG (اندروید) / Happ (iOS) / Streisand را نصب کنید\n' +
      '۲. از «دریافت کانفیگ‌ها» وارد داشبورد شوید و کانفیگ موردنظر را کپی کنید\n' +
      '۳. داخل اپلیکیشن، از گزینه Import/Add from Clipboard استفاده کنید\n' +
      '۴. روی دکمه اتصال بزنید'
    );
  });

  bot.action('vpn_status', async (ctx) => {
    ctx.answerCbQuery();
    const sub = await getLatestSub(ctx.from.id);
    if (!sub || sub.status !== 'active') return ctx.reply('❌ سرویس فعالی یافت نشد.');
    const daysLeft = Math.max(0, Math.ceil((new Date(sub.expires_at) - new Date()) / (1000 * 60 * 60 * 24)));
    const dataUsed = sub.data_used || 0;
    const dataLimit = sub.data_limit || 5 * 1024 * 1024 * 1024;
    ctx.reply(
      `🌐 **وضعیت سرویس VPN**\n\n📅 روزهای باقی‌مانده: ${daysLeft} روز\n📊 حجم مصرفی: ${(dataUsed / (1024 * 1024)).toFixed(2)} مگابایت\n📊 حجم کل: ${(dataLimit / (1024 * 1024 * 1024)).toFixed(0)} گیگابایت\n🆔 کد پیگیری: \`${sub.tracking_code}\``,
      { parse_mode: 'Markdown' }
    );
  });
}

module.exports = registerVPNHandlers;
module.exports.showVpnMenu = registerVPNHandlers.showVpnMenu = sendSpecialOffer;
