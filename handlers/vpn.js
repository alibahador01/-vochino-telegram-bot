// handlers/vpn.js
const net = require('net');
const path = require('path');
const fs = require('fs');
const {
  pool,
  checkMembership,
  getSetting,
  getUser,
  getReferrals
} = require('../db');
const { ADMIN_IDS } = require('../constants');

// ======================= constants =======================

const DEFAULT_SUBSCRIBE_BUTTON_URL =
  'http://rebrand.ly/Vochino-Sports01';

const DEFAULT_BANNER_1_PATH = path.join(
  __dirname,
  '../assets/vochino01-banner-rose.jpg'
);

const DEFAULT_BANNER_2_PATH = path.join(
  __dirname,
  '../assets/vochino01-banner-qr.jpg'
);

// ======================= helpers =======================

async function ensureVpnSchema() {
  const alterQueries = [
    `ALTER TABLE vpn_servers ADD COLUMN IF NOT EXISTS config_text TEXT`,
    `ALTER TABLE vpn_servers ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 1`,
    `ALTER TABLE vpn_servers ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER DEFAULT 0`,
    `ALTER TABLE vpn_servers ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMP`,
    `ALTER TABLE vpn_servers ADD COLUMN IF NOT EXISTS cool_down_until TIMESTAMP`
  ];

  for (const sql of alterQueries) {
    try {
      await pool.query(sql);
    } catch (e) {
      console.log('خطا در افزودن ستون vpn_servers:', e.message);
    }
  }

  const subAlter = [
    `ALTER TABLE vpn_subscriptions ADD COLUMN IF NOT EXISTS data_used BIGINT DEFAULT 0`
  ];

  for (const sql of subAlter) {
    try {
      await pool.query(sql);
    } catch (e) {
      console.log('خطا در افزودن ستون vpn_subscriptions:', e.message);
    }
  }
}

function healthCheckServer(server) {
  return new Promise((resolve) => {
    if (!server.host || !server.port) {
      return resolve(false);
    }

    const socket = net.createConnection({
      host: server.host,
      port: server.port,
      timeout: 5000
    });

    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function getDefaultBanner1() {
  return process.env.VPN_BANNER_1 || DEFAULT_BANNER_1_PATH;
}

function getDefaultBanner2() {
  return process.env.VPN_BANNER_2 || DEFAULT_BANNER_2_PATH;
}

function resolvePhotoSource(value) {
  if (!value) return null;

  if (fs.existsSync(value)) {
    return { source: value };
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  if (
    !value.startsWith('/') &&
    !value.startsWith('./') &&
    !value.startsWith('../')
  ) {
    return value;
  }

  return null;
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);

  if (!Number.isFinite(value) || value <= 0) {
    return '۰ بایت';
  }

  const gb = value / (1024 * 1024 * 1024);

  if (gb >= 1) {
    return `${gb.toFixed(gb % 1 === 0 ? 0 : 2)} گیگابایت`;
  }

  const mb = value / (1024 * 1024);

  if (mb >= 1) {
    return `${mb.toFixed(mb % 1 === 0 ? 0 : 2)} مگابایت`;
  }

  return `${Math.round(value / 1024)} کیلوبایت`;
}

function buildSubscriptionUrl(userId) {
  const baseUrl = (process.env.BASE_URL || '')
    .trim()
    .replace(/\/$/, '');

  if (!baseUrl || baseUrl === 'https://yourdomain.com') {
    return `/sub/${userId}`;
  }

  return `${baseUrl}/sub/${userId}`;
}

function buildSubscriptionButtonUrl() {
  return (
    process.env.VOCHINO_SUBSCRIBE_BUTTON_URL ||
    DEFAULT_SUBSCRIBE_BUTTON_URL
  ).trim();
}

async function sendPreparedSubscription(
  ctx,
  userId,
  defaultDays,
  defaultVolumeGB,
  subUrl
) {
  const banner1 = resolvePhotoSource(getDefaultBanner1());
  const banner2 = resolvePhotoSource(getDefaultBanner2());

  const fixedSubscribeUrl = buildSubscriptionButtonUrl();

  const text =
    '╭━━━━ ❖ ━━━━╮\n' +
    '       👑 ووچینو⁰۱\n' +
    '╰━━━━ ❖ ━━━━╯\n' +
    '✨ اشتراک شما آماده‌ست\n' +
    '👇 دکمه زیر رو بزنید\n' +
    '🔗 دریافت لینک اشتراک\n\n' +
    `📅 زمان اشتراک: ${defaultDays} روزه\n` +
    `📦 حجم اشتراک: ${defaultVolumeGB} گیگ`;

  const firstKeyboard = {
    inline_keyboard: [
      [
        {
          text: 'دریافت لینک اشتراک',
          url: fixedSubscribeUrl
        }
      ]
    ]
  };

  if (banner1) {
    await ctx.replyWithPhoto(banner1, {
      disable_notification: false
    });
  }

  await ctx.reply(text, {
    reply_markup: firstKeyboard
  });

  if (banner2) {
    await ctx.replyWithPhoto(banner2, {
      caption:
        '🔗 لینک سابسکرایب اختصاصی شما\n\n' +
        `${subUrl}\n\n` +
        'برای مشاهده کانفیگ‌ها، حجم باقی‌مانده و مدیریت اشتراک، روی دکمه زیر بزنید.',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: 'ورود به پنل اشتراک',
              url: subUrl
            }
          ]
        ]
      }
    });
  } else {
    await ctx.reply(
      `🔗 لینک سابسکرایب اختصاصی شما:\n${subUrl}`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: 'ورود به پنل اشتراک',
                url: subUrl
              }
            ]
          ]
        }
      }
    );
  }
}

async function runHealthCheck(bot) {
  await ensureVpnSchema();

  const { rows: servers } = await pool.query(
    'SELECT * FROM vpn_servers ORDER BY priority ASC'
  );

  const now = new Date();

  const failureThreshold = parseInt(
    await getSetting('vpn_failure_threshold', '3'),
    10
  );

  const cooldownSeconds = parseInt(
    await getSetting('vpn_cooldown', '86400'),
    10
  );

  for (const server of servers) {
    if (
      server.cool_down_until &&
      new Date(server.cool_down_until) > now
    ) {
      console.log(
        `⏳ سرور ${server.name} در حالت خنک‌سازی است`
      );
      continue;
    }

    const healthy = await healthCheckServer(server);

    let newFailures = server.consecutive_failures || 0;
    let newStatus = server.health_status;

    if (healthy) {
      newFailures = 0;
      newStatus = 'healthy';
    } else {
      newFailures++;
      newStatus =
        newFailures >= failureThreshold
          ? 'down'
          : 'unstable';
    }

    await pool.query(
      `UPDATE vpn_servers
       SET health_status=$1,
           consecutive_failures=$2,
           last_checked_at=NOW(),
           is_active=$3
       WHERE id=$4`,
      [
        newStatus,
        newFailures,
        newStatus === 'down'
          ? false
          : server.is_active,
        server.id
      ]
    );

    if (
      newStatus === 'down' &&
      server.priority === 1 &&
      (
        !server.cool_down_until ||
        new Date(server.cool_down_until) <= now
      )
    ) {
      const coolUntil = new Date(
        Date.now() + cooldownSeconds * 1000
      ).toISOString();

      await pool.query(
        `UPDATE vpn_servers
         SET is_active=false,
             cool_down_until=$1
         WHERE id=$2`,
        [coolUntil, server.id]
      );

      const backup = await pool.query(
        `SELECT *
         FROM vpn_servers
         WHERE priority=2
           AND is_active=true
           AND (
             cool_down_until IS NULL
             OR cool_down_until < NOW()
           )
         ORDER BY id
         LIMIT 1`
      );

      if (backup.rows[0]) {
        await pool.query(
          `UPDATE vpn_servers
           SET priority=1
           WHERE id=$1`,
          [backup.rows[0].id]
        );

        await pool.query(
          `UPDATE vpn_servers
           SET priority=2
           WHERE id=$1`,
          [server.id]
        );

        console.log(
          `🔄 سوییچ خودکار: ${backup.rows[0].name} اکنون primary است`
        );

        try {
          await bot.telegram.sendMessage(
            ADMIN_IDS[0],
            `🔄 سوییچ خودکار VPN\n` +
            `سرور اصلی (${server.name}) از دسترس خارج شد.\n` +
            `سرور پشتیبان (${backup.rows[0].name}) فعال شد.`
          );
        } catch (e) {
          console.log(
            'خطا در ارسال اعلان سوییچ به ادمین:',
            e.message
          );
        }
      }
    }
  }
}

function startHealthCheckTimer(bot) {
  runHealthCheck(bot).catch((err) =>
    console.log(
      'خطا در سلامت‌سنجی اولیه:',
      err.message
    )
  );

  const intervalSeconds = parseInt(
    process.env.VPN_HEALTH_CHECK_INTERVAL_SECONDS ||
      '180',
    10
  );

  setInterval(() => {
    runHealthCheck(bot).catch((err) =>
      console.log(
        'خطا در سلامت‌سنجی:',
        err.message
      )
    );
  }, intervalSeconds * 1000);
}

// ======================= نمایش منوی VPN به کاربر =======================

async function showVpnMenu(ctx) {
  await ctx.answerCbQuery().catch(() => {});

  try {
    await ctx.deleteMessage();
  } catch (e) {}

  const vpnEnabled =
    (await getSetting('vpn_enabled', 'true')) ===
    'true';

  if (!vpnEnabled) {
    return ctx.reply(
      '⚠️ سرویس فیلترشکن در حال حاضر غیرفعال است.'
    );
  }

  const userId = ctx.from.id;

  const user = await getUser(userId);

  if (!user) {
    return ctx.reply('⛔ کاربر یافت نشد.');
  }

  const isMember = await checkMembership(ctx);

  if (!isMember) {
    return ctx.reply(
      '⚠️ لطفاً ابتدا در کانال اجباری عضو شوید.'
    );
  }

  const activeSub = await pool.query(
    `SELECT *
     FROM vpn_subscriptions
     WHERE user_id = $1
       AND status = 'active'
       AND expires_at > NOW()
     ORDER BY created_at DESC
     LIMIT 1`,
    [String(userId)]
  );

  if (activeSub.rows.length > 0) {
    const sub = activeSub.rows[0];

    const daysLeft = Math.max(
      0,
      Math.ceil(
        (
          new Date(sub.expires_at) -
          new Date()
        ) /
        (1000 * 60 * 60 * 24)
      )
    );

    const dataUsed = Number(
      sub.data_used || 0
    );

    const dataLimit = Number(
      sub.data_limit ||
        5 * 1024 * 1024 * 1024
    );

    const subUrl =
      buildSubscriptionUrl(userId);

    return ctx.reply(
      `🌐 **سرویس VPN فعال شما**\n\n` +
      `📅 روزهای باقی‌مانده: ${daysLeft} روز\n` +
      `📊 مصرف داده: ${formatBytes(dataUsed)} از ${formatBytes(dataLimit)}\n` +
      `🔗 لینک سابسکرایب:\n\`${subUrl}\``,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: 'دریافت لینک اشتراک',
                url:
                  buildSubscriptionButtonUrl()
              }
            ],
            [
              {
                text: 'ورود به پنل اشتراک',
                url: subUrl
              }
            ],
            [
              {
                text: 'استعلام حجم',
                callback_data: 'vpn_status'
              }
            ],
            [
              {
                text: 'بازگشت',
                callback_data: 'back_main_menu'
              }
            ]
          ]
        }
      }
    );
  }

  const maxFreeAttempts = parseInt(
    await getSetting(
      'vpn_max_free_attempts',
      '1'
    ),
    10
  );

  const invitesForUnlock = parseInt(
    await getSetting(
      'vpn_invites_for_unlock',
      '2'
    ),
    10
  );

  const usedAttemptsRes =
    await pool.query(
      `SELECT COUNT(*)::int AS cnt
       FROM vpn_subscriptions
       WHERE user_id = $1
         AND status IN ('active','expired')`,
      [String(userId)]
    );

  const usedAttempts =
    usedAttemptsRes.rows[0].cnt;

  if (usedAttempts >= maxFreeAttempts) {
    const referrals =
      await getReferrals(userId);

    const extraUnlocks = Math.max(
      0,
      usedAttempts -
        maxFreeAttempts +
        1
    );

    const neededReferrals =
      extraUnlocks *
      invitesForUnlock;

    if (referrals < neededReferrals) {
      const remaining =
        neededReferrals -
        referrals;

      return ctx.reply(
        `⚠️ شما حداکثر ${maxFreeAttempts} بار سرویس رایگان دریافت کرده‌اید.\n\n` +
        `برای دریافت مجدد، باید ${remaining} نفر دیگر را دعوت کنید.\n` +
        `👥 دعوت‌های فعلی شما: ${referrals} نفر`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: 'دریافت لینک دعوت',
                  callback_data:
                    'wallet_referral'
                }
              ],
              [
                {
                  text: 'بازگشت',
                  callback_data:
                    'back_main_menu'
                }
              ]
            ]
          }
        }
      );
    }
  }

  const defaultVolumeGB =
    parseInt(
      await getSetting(
        'vpn_default_volume_gb',
        '5'
      ),
      10
    );

  const defaultDays =
    parseInt(
      await getSetting(
        'vpn_default_days',
        '30'
      ),
      10
    );

  const dataLimit =
    defaultVolumeGB *
    1024 *
    1024 *
    1024;

  const expiresAt =
    new Date();

  expiresAt.setDate(
    expiresAt.getDate() +
      defaultDays
  );

  const trackingCode =
    'VPN-' +
    Math.floor(
      100000 +
      Math.random() *
        900000
    );

  await pool.query(
    `INSERT INTO vpn_subscriptions
      (
        user_id,
        status,
        expires_at,
        data_limit,
        tracking_code,
        created_at
      )
     VALUES
      ($1, $2, $3, $4, $5, NOW())`,
    [
      String(userId),
      'active',
      expiresAt.toISOString(),
      dataLimit,
      trackingCode
    ]
  );

  const subUrl =
    buildSubscriptionUrl(userId);

  await sendPreparedSubscription(
    ctx,
    userId,
    defaultDays,
    defaultVolumeGB,
    subUrl
  );
}

// ======================= رجیستر هندلرها =======================

function registerVPNHandlers(bot) {
  ensureVpnSchema()
    .then(() =>
      startHealthCheckTimer(bot)
    )
    .catch(console.error);

  bot.action(
    'menu_special',
    async (ctx) => {
      await showVpnMenu(ctx);
    }
  );

  bot.action(
    'vpn_qr',
    async (ctx) => {
      await ctx
        .answerCbQuery()
        .catch(() => {});

      const subUrl =
        buildSubscriptionUrl(
          ctx.from.id
        );

      await ctx.reply(
        `🔗 لینک سابسکرایب شما:\n${subUrl}`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: 'ورود به پنل اشتراک',
                  url: subUrl
                }
              ]
            ]
          }
        }
      );
    }
  );

  bot.action(
    'vpn_status',
    async (ctx) => {
      await ctx
        .answerCbQuery()
        .catch(() => {});

      const service =
        await pool.query(
          `SELECT *
           FROM vpn_subscriptions
           WHERE user_id = $1
             AND status = 'active'
           ORDER BY created_at DESC
           LIMIT 1`,
          [String(ctx.from.id)]
        );

      if (!service.rows[0]) {
        return ctx.reply(
          '❌ سرویس فعالی یافت نشد.'
        );
      }

      const sub =
        service.rows[0];

      const daysLeft =
        Math.max(
          0,
          Math.ceil(
            (
              new Date(
                sub.expires_at
              ) -
              new Date()
            ) /
            (1000 * 60 * 60 * 24)
          )
        );

      const dataUsed =
        Number(
          sub.data_used || 0
        );

      const dataLimit =
        Number(
          sub.data_limit ||
            5 *
              1024 *
              1024 *
              1024
        );

      await ctx.reply(
        `🌐 **وضعیت سرویس VPN**\n\n` +
        `📅 روزهای باقی‌مانده: ${daysLeft} روز\n` +
        `📊 حجم مصرفی: ${formatBytes(dataUsed)}\n` +
        `📊 حجم کل: ${formatBytes(dataLimit)}\n` +
        `🆔 کد پیگیری: \`${sub.tracking_code}\``,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: 'ورود به پنل اشتراک',
                  url:
                    buildSubscriptionUrl(
                      ctx.from.id
                    )
                }
              ]
            ]
          }
        }
      );
    }
  );
}

module.exports =
  registerVPNHandlers;

module.exports.showVpnMenu =
  showVpnMenu;
