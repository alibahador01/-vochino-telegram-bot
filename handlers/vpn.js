// handlers/vpn.js
const net = require('net');
const path = require('path');
const Jimp = require('jimp');
const QRCode = require('qrcode');
const { pool, checkMembership, getSetting, setSetting, getUser, getReferrals } = require('../db');
const { ADMIN_IDS } = require('../constants');

const VPN_BANNER_PATH = path.join(__dirname, '..', 'assets', 'vpn_banner.jpg');
const VPN_SUBSCRIBE_URL = 'http://rebrand.ly/Vochino-Sports01';
const VPN_QR_BOX = { x0: 0.3076, y0: 0.3861, x1: 0.7158, y1: 0.6589 };

// ======================= ساخت بنر + بارکد واقعی وسط جای سفید =======================

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

// ======================= helpers =======================

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

  const subAlter = [
    `ALTER TABLE vpn_subscriptions ADD COLUMN IF NOT EXISTS data_used BIGINT DEFAULT 0`
  ];
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
    if (server.cool_down_until && new Date(server.cool_down_until) > now) {
      console.log(`⏳ سرور ${server.name} در حالت خنک‌سازی است`);
      continue;
    }

    const result = await healthCheckServer(server);
    let newFailures = server.consecutive_failures || 0;
    let newStatus = server.health_status;

    if (result.healthy) {
      newFailures = 0;
      newStatus = 'healthy';
    } else if (result.unstable) {
      newFailures += 0.5;
      newStatus = newFailures >= failureThreshold ? 'down' : 'unstable';
    } else {
      newFailures++;
      newStatus = newFailures >= failureThreshold ? 'down' : 'unstable';
    }

    await pool.query(
      `UPDATE vpn_servers SET health_status=$1, consecutive_failures=$2, last_checked_at=NOW(), avg_latency_ms=$3, is_active=$4 WHERE id=$5`,
      [newStatus, newFailures, result.latency || server.avg_latency_ms || 0, newStatus === 'down' ? false : server.is_active, server.id]
    );

    if (newStatus === 'down' && (!server.cool_down_until || new Date(server.cool_down_until) <= now)) {
      const coolUntil = new Date(Date.now() + cooldownSeconds * 1000).toISOString();
      await pool.query(
        `UPDATE vpn_servers SET is_active=false, cool_down_until=$1 WHERE id=$2`,
        [coolUntil, server.id]
      );

      if (server.priority === 1) {
        const backup = await pool.query(
          `SELECT * FROM vpn_servers
           WHERE id != $1 AND is_active = true
             AND (cool_down_until IS NULL OR cool_down_until < NOW())
             AND health_status != 'down'
           ORDER BY priority ASC, avg_latency_ms ASC, id ASC LIMIT 1`,
          [server.id]
        );

        if (backup.rows[0]) {
          await pool.query(`UPDATE vpn_servers SET priority=1 WHERE id=$1`, [backup.rows[0].id]);
          await pool.query(`UPDATE vpn_servers SET priority=2 WHERE id=$1`, [server.id]);
          console.log(`🔄 سوییچ خودکار: ${backup.rows[0].name} اکنون primary است`);

          try {
            await bot.telegram.sendMessage(
              ADMIN_IDS[0],
              `🔄 سوییچ خودکار VPN\nسرور اصلی (${server.name}) از دسترس خارج شد.\nسرور پشتیبان (${backup.rows[0].name}) فعال شد.`
            );
          } catch (e) {}
        } else {
          try {
            await bot.telegram.sendMessage(
              ADMIN_IDS[0],
              `⚠️ هشدار VPN\nسرور اصلی (${server.name}) قطع شد و هیچ سرور پشتیبان سالمی پیدا نشد. لطفاً یک سرور جدید اضافه کنید.`
            );
          } catch (e) {}
        }
      }
    }
  }
}

function startHealthCheckTimer(bot) {
  runHealthCheck(bot).catch(err => console.log('خطا در سلامت‌سنجی اولیه:', err.message));
  const intervalSeconds = 45;
  setInterval(() => {
    runHealthCheck(bot).catch(err => console.log('خطا در سلامت‌سنجی:', err.message));
  }, intervalSeconds * 1000);
}

// ======================= نمایش منوی VPN به کاربر =======================

async function showVpnMenu(ctx) {
  ctx.answerCbQuery();
  try { await ctx.deleteMessage(); } catch (e) {}

  const vpnEnabled = (await getSetting('vpn_enabled', 'true')) === 'true';
  if (!vpnEnabled) return ctx.reply('⚠️ سرویس فیلترشکن در حال حاضر غیرفعال است.');

  const userId = ctx.from.id;
  const user = await getUser(userId);
  if (!user) return ctx.reply('⛔ کاربر یافت نشد.');

  const isMember = await checkMembership(ctx);
  if (!isMember) return ctx.reply('⚠️ لطفاً ابتدا در کانال اجباری عضو شوید.');

  const activeSub = await pool.query(
    "SELECT * FROM vpn_subscriptions WHERE user_id = $1 AND status = 'active' AND expires_at > NOW()",
    [String(userId)]
  );

  if (activeSub.rows.length > 0) {
    const sub = activeSub.rows[0];
    const daysLeft = Math.ceil((new Date(sub.expires_at) - new Date()) / (1000 * 60 * 60 * 24));
    const dataUsed = sub.data_used || 0;
    const dataLimit = sub.data_limit || 5 * 1024 * 1024 * 1024;
    const subUrl = (process.env.BASE_URL || 'https://yourdomain.com') + '/sub/' + userId;

    return ctx.reply(
      `🌐 **سرویس VPN فعال شما**\n\n` +
      `📅 روزهای باقی‌مانده: ${daysLeft} روز\n` +
      `📊 مصرف داده: ${(dataUsed / (1024 * 1024)).toFixed(2)} مگابایت از ${(dataLimit / (1024 * 1024 * 1024)).toFixed(0)} گیگابایت\n` +
      `🔗 لینک اشتراک:\n\`${subUrl}\`\n\n` +
      `برای دریافت QR Code یا مدیریت، از دکمه‌های زیر استفاده کنید:`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📷 دریافت QR Code', callback_data: 'vpn_qr' }],
            [{ text: '🌐 استعلام حجم', callback_data: 'vpn_status' }],
            [{ text: '🔙 بازگشت', callback_data: 'back_main_menu' }]
          ]
        }
      }
    );
  }

  const maxFreeAttempts = parseInt(await getSetting('vpn_max_free_attempts', '1'), 10);
  const invitesForUnlock = parseInt(await getSetting('vpn_invites_for_unlock', '2'), 10);

  const usedAttemptsRes = await pool.query(
    "SELECT COUNT(*)::int AS cnt FROM vpn_subscriptions WHERE user_id = $1 AND status IN ('active','expired')",
    [String(userId)]
  );
  const usedAttempts = usedAttemptsRes.rows[0].cnt;

  if (usedAttempts >= maxFreeAttempts) {
    const referrals = await getReferrals(userId);
    const extraUnlocks = Math.max(0, usedAttempts - maxFreeAttempts + 1);
    const neededReferrals = extraUnlocks * invitesForUnlock;

    if (referrals < neededReferrals) {
      const remaining = neededReferrals - referrals;
      return ctx.reply(
        `⚠️ شما حداکثر ${maxFreeAttempts} بار سرویس رایگان دریافت کرده‌اید.\n\n` +
        `برای دریافت مجدد، باید ${remaining} نفر دیگر را دعوت کنید.\n` +
        `👥 دعوت‌های فعلی شما: ${referrals} نفر`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔗 دریافت لینک دعوت', callback_data: 'wallet_referral' }],
              [{ text: '🔙 بازگشت', callback_data: 'back_main_menu' }]
            ]
          }
        }
      );
    }
  }

  const defaultVolumeGB = parseInt(await getSetting('vpn_default_volume_gb', '5'), 10);
  const defaultDays = parseInt(await getSetting('vpn_default_days', '30'), 10);
  const dataLimit = defaultVolumeGB * 1024 * 1024 * 1024;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + defaultDays);
  const trackingCode = 'VPN-' + Math.floor(100000 + Math.random() * 900000);

  await pool.query(
    'INSERT INTO vpn_subscriptions (user_id, status, expires_at, data_limit, tracking_code, created_at) VALUES ($1, $2, $3, $4, $5, NOW())',
    [String(userId), 'active', expiresAt.toISOString(), dataLimit, trackingCode]
  );

  const subUrl = (process.env.BASE_URL || 'https://yourdomain.com') + '/sub/' + userId;

  try {
    const bannerWithQr = await buildBannerWithQR(subUrl);
    await ctx.replyWithPhoto({ source: bannerWithQr });
  } catch (e) {
    console.log('خطا در ساخت بارکد روی بنر:', e.message);
    try { await ctx.replyWithPhoto({ source: VPN_BANNER_PATH }); } catch (e2) {}
  }

  await ctx.reply(
    '╭━━━━ ❖ ━━━━╮\n' +
    '       👑 ووچینو⁰۱\n' +
    '╰━━━━ ❖ ━━━━╯\n' +
    '✨ اشتراک شما آماده‌ست\n' +
    '👇 دکمه زیر رو بزنید\n' +
    '🔗 دریافت لینک اشتراک\n\n' +
    `📅 زمان اشتراک: ${defaultDays} روزه\n` +
    `📦 حجم اشتراک: ${defaultVolumeGB} گیگ`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'دریافت لینک اشتراک', url: VPN_SUBSCRIBE_URL }]
        ]
      }
    }
  );

  ctx.reply(
    '🌐 **سرویس VPN شما فعال شد.**\n\nبرای مدیریت از دکمه‌های زیر استفاده کنید:',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📷 دریافت QR Code', callback_data: 'vpn_qr' }],
          [{ text: '🌐 استعلام حجم', callback_data: 'vpn_status' }],
          [{ text: '🔙 بازگشت', callback_data: 'back_main_menu' }]
        ]
      }
    }
  );
}

// ======================= رجیستر هندلرها =======================

function registerVPNHandlers(bot) {
  ensureVpnSchema().then(() => startHealthCheckTimer(bot)).catch(console.error);

  bot.action('menu_special', async (ctx) => {
    await showVpnMenu(ctx);
  });

  bot.action('vpn_qr', async (ctx) => {
    ctx.answerCbQuery();
    const subUrl = (process.env.BASE_URL || 'https://yourdomain.com') + '/sub/' + ctx.from.id;
    try {
      const bannerWithQr = await buildBannerWithQR(subUrl);
      await ctx.replyWithPhoto({ source: bannerWithQr });
    } catch (e) {
      ctx.reply(`🔗 لینک سابسکرایب شما:\n\`${subUrl}\``, { parse_mode: 'Markdown' });
    }
  });

  bot.action('vpn_status', async (ctx) => {
    ctx.answerCbQuery();
    const service = await pool.query(
      "SELECT * FROM vpn_subscriptions WHERE user_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1",
      [String(ctx.from.id)]
    );
    if (!service.rows[0]) return ctx.reply('❌ سرویس فعالی یافت نشد.');

    const sub = service.rows[0];
    const daysLeft = Math.max(0, Math.ceil((new Date(sub.expires_at) - new Date()) / (1000 * 60 * 60 * 24)));
    const dataUsed = sub.data_used || 0;
    const dataLimit = sub.data_limit || 5 * 1024 * 1024 * 1024;

    ctx.reply(
      `🌐 **وضعیت سرویس VPN**\n\n` +
      `📅 روزهای باقی‌مانده: ${daysLeft} روز\n` +
      `📊 حجم مصرفی: ${(dataUsed / (1024 * 1024)).toFixed(2)} مگابایت\n` +
      `📊 حجم کل: ${(dataLimit / (1024 * 1024 * 1024)).toFixed(0)} گیگابایت\n` +
      `🆔 کد پیگیری: \`${sub.tracking_code}\``,
      { parse_mode: 'Markdown' }
    );
  });
}

module.exports = registerVPNHandlers;
module.exports.showVpnMenu = registerVPNHandlers.showVpnMenu = showVpnMenu;
