// handlers/vpn.js
const texts = require('../texts');
const { sessions, generateTrackingCode } = require('../utils');
const { pool, checkMembership, getSetting, getUser, getReferrals } = require('../db');

// تابع کمکی برای اضافه‌کردن ستون‌های لازم به vpn_servers (بدون نیاز به تغییر دستی دیتابیس)
async function ensureVpnSchema() {
  const alterQueries = [
    `ALTER TABLE vpn_servers ADD COLUMN IF NOT EXISTS config_text TEXT`,
    `ALTER TABLE vpn_servers ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 1`,
    `ALTER TABLE vpn_servers ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER DEFAULT 0`,
    `ALTER TABLE vpn_servers ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMP`,
    `ALTER TABLE vpn_servers ADD COLUMN IF NOT EXISTS cool_down_until TIMESTAMP`
  ];
  for (const sql of alterQueries) {
    try { await pool.query(sql); } catch (e) {
      console.log('خطا در افزودن ستون vpn_servers:', e.message);
    }
  }
}

// تست سلامت یک سرور (تلاش برای برقراری اتصال TCP ساده)
async function healthCheckServer(server) {
  const net = require('net');
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: server.host, port: server.port, timeout: 5000 });
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      resolve(false);
    });
  });
}

// اجرای تست سلامت برای همه سرورها و اعمال سوییچ خودکار
async function runHealthCheck(bot) {
  await ensureVpnSchema();
  const { rows: servers } = await pool.query('SELECT * FROM vpn_servers');
  const now = new Date();

  for (const server of servers) {
    // اگر سرور در حالت خنک‌سازی است، بررسی نمی‌کنیم
    if (server.cool_down_until && new Date(server.cool_down_until) > now) {
      console.log(`⏳ سرور ${server.name} در حالت خنک‌سازی است`);
      continue;
    }

    const isHealthy = await healthCheckServer(server);
    let newFailures = server.consecutive_failures || 0;
    let newStatus = server.health_status;

    if (isHealthy) {
      newFailures = 0;
      newStatus = 'healthy';
    } else {
      newFailures++;
      newStatus = newFailures >= 3 ? 'down' : 'unstable';
    }

    // به‌روزرسانی سرور
    await pool.query(
      `UPDATE vpn_servers SET health_status=$1, consecutive_failures=$2, last_checked_at=NOW(), is_active=$3 WHERE id=$4`,
      [newStatus, newFailures, newStatus === 'down' ? false : server.is_active, server.id]
    );

    // اگر سرور down شد و priority=1، سوییچ به backup
    if (newStatus === 'down' && server.priority === 1) {
      // غیرفعال‌کردن primary
      await pool.query(`UPDATE vpn_servers SET is_active=false, cool_down_until=NOW() + INTERVAL '24 hours' WHERE id=$1`, [server.id]);
      // فعال‌کردن backup
      const backup = await pool.query(
        `SELECT * FROM vpn_servers WHERE priority=2 AND is_active=true AND (cool_down_until IS NULL OR cool_down_until < NOW()) ORDER BY id LIMIT 1`
      );
      if (backup.rows[0]) {
        await pool.query(`UPDATE vpn_servers SET is_active=true, priority=1 WHERE id=$1`, [backup.rows[0].id]);
        // دموت primary قبلی به priority=2
        await pool.query(`UPDATE vpn_servers SET priority=2 WHERE id=$1`, [server.id]);
        console.log(`🔄 سوییچ خودکار: ${backup.rows[0].name} اکنون primary است`);
        // اطلاع به ادمین
        try {
          await bot.telegram.sendMessage(
            process.env.ADMIN_CHAT_ID || (require('../constants').ADMIN_IDS[0]),
            `🔄 سوییچ خودکار VPN\nسرور اصلی (${server.name}) از دسترس خارج شد.\nسرور پشتیبان (${backup.rows[0].name}) فعال شد.`
          );
        } catch (e) {}
      }
    }
  }
}

// شروع تایمر سلامت (هر ۳ دقیقه)
function startHealthCheckTimer(bot) {
  runHealthCheck(bot); // اجرای اولیه
  setInterval(() => {
    runHealthCheck(bot).catch(err => console.log('خطا در سلامت‌سنجی:', err.message));
  }, 3 * 60 * 1000);
}

// ==================== نمایش منوی VPN برای کاربر ====================
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

    ctx.reply(
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
    return;
  }

  // دریافت سرویس رایگان
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

  // ایجاد سرویس جدید
  const defaultVolume = parseInt(await getSetting('vpn_default_volume_gb', '5'), 10);
  const defaultDays = parseInt(await getSetting('vpn_default_days', '30'), 10);
  const dataLimit = defaultVolume * 1024 * 1024 * 1024;

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + defaultDays);
  const trackingCode = 'VPN-' + Math.floor(100000 + Math.random() * 900000);

  await pool.query(
    'INSERT INTO vpn_subscriptions (user_id, status, expires_at, data_limit, tracking_code, created_at) VALUES ($1, $2, $3, $4, $5, NOW())',
    [String(userId), 'active', expiresAt.toISOString(), dataLimit, trackingCode]
  );

  const subUrl = (process.env.BASE_URL || 'https://yourdomain.com') + '/sub/' + userId;

  ctx.reply(
    `🎉 **تبریک! سرویس VPN رایگان شما فعال شد.**\n\n` +
    `👤 نام کاربری: ${ctx.from.first_name || 'کاربر'}\n` +
    `🆔 آیدی: ${userId}\n` +
    `🔗 **لینک سابسکرایب:**\n\`${subUrl}\`\n\n` +
    `📅 مدت اعتبار: ${defaultDays} روز\n` +
    `📊 حجم: ${defaultVolume} گیگابایت\n\n` +
    `✅ لینک را کپی کنید یا از دکمه‌های مدیریت استفاده کنید.`,
    { parse_mode: 'Markdown' }
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

// هندلرهای تلگرام
module.exports = function registerVPNHandlers(bot) {
  // اجرای اولیه schema و سلامت‌سنجی
  ensureVpnSchema().then(() => startHealthCheckTimer(bot)).catch(console.error);

  bot.action('menu_special', async (ctx) => {
    await showVpnMenu(ctx);
  });

  bot.action('vpn_qr', async (ctx) => {
    ctx.answerCbQuery();
    const subUrl = (process.env.BASE_URL || 'https://yourdomain.com') + '/sub/' + ctx.from.id;
    ctx.reply(`🔗 لینک سابسکرایب شما:\n\`${subUrl}\`\n\nبرای دریافت QR Code از لینک‌های زیر استفاده کنید:`, { parse_mode: 'Markdown' });
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

  module.exports.showVpnMenu = showVpnMenu;
};
