'use strict';

const crypto = require('node:crypto');
const express = require('express');
const { normalizePhone } = require('../util/validators');
const { sha256, validatePassword, hashPassword, verifyPassword } = require('./password-crypto');
const PASSWORD_MIN_LENGTH = 10;
const PASSWORD_MAX_LENGTH = 128;
const DEFAULT_SESSION_TTL_SECONDS = 12 * 60 * 60;
const MAX_SESSION_TTL_SECONDS = 24 * 60 * 60;
const PASSWORD_MAX_FAILURES = 5;
const PASSWORD_LOCK_SECONDS = 15 * 60;

function getSessionToken(req) {
  const value = req.get('x-vochino-session') || '';
  return /^[A-Za-z0-9_-]{40,100}$/.test(value) ? value : null;
}

function normalizeMiniAppPhone(input) {
  const result = normalizePhone(input);
  if (!result.ok) return result;
  // Accept the common Iranian local form (09xxxxxxxxx) and canonicalize it to +989xxxxxxxxx.
  if (/^\+09\d{9}$/.test(result.value)) {
    return { ok: true, value: '+98' + result.value.slice(2) };
  }
  return result;
}

function getSessionTtlSeconds() {
  const raw = Number(process.env.WEBAPP_SESSION_TTL_SECONDS || DEFAULT_SESSION_TTL_SECONDS);
  if (!Number.isSafeInteger(raw) || raw < 300) return DEFAULT_SESSION_TTL_SECONDS;
  return Math.min(raw, MAX_SESSION_TTL_SECONDS);
}

async function issueSession(pool, telegramId) {
  await pool.query(
    `DELETE FROM webapp_auth_sessions
      WHERE (expires_at < NOW() - INTERVAL '30 days')
         OR (revoked_at IS NOT NULL AND revoked_at < NOW() - INTERVAL '30 days')`,
  );
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = sha256(token);
  const ttl = getSessionTtlSeconds();
  const inserted = await pool.query(
    `INSERT INTO webapp_auth_sessions (telegram_id, token_hash, created_at, expires_at)
     VALUES ($1, $2, NOW(), NOW() + ($3::int * INTERVAL '1 second'))
     RETURNING expires_at`,
    [String(telegramId), tokenHash, ttl],
  );
  return { session_token: token, expires_at: inserted.rows[0].expires_at, expires_in: ttl };
}

async function readSession(pool, telegramId, token) {
  if (!token) return null;
  const result = await pool.query(
    `UPDATE webapp_auth_sessions
        SET last_used_at = NOW()
      WHERE telegram_id = $1
        AND token_hash = $2
        AND revoked_at IS NULL
        AND expires_at > NOW()
      RETURNING id, telegram_id, expires_at`,
    [String(telegramId), sha256(token)],
  );
  return result.rows[0] || null;
}

function createRequireAppSession({ pool, ApiError, asyncRoute }) {
  return asyncRoute(async (req, _res, next) => {
    const token = getSessionToken(req);
    const session = await readSession(pool, req.telegram.id, token);
    if (!session) {
      throw new ApiError(401, 'APP_SESSION_REQUIRED', 'برای ادامه، ابتدا با رمز عبور خود وارد مینی‌آپ شوید.');
    }
    req.appSession = session;
    return next();
  });
}

function passwordFromBody(body) {
  const password = body && body.password;
  const confirmation = body && body.password_confirm;
  if (typeof password !== 'string' || typeof confirmation !== 'string' || password !== confirmation) {
    throw new Error('رمز عبور و تکرار آن یکسان نیستند.');
  }
  if (!validatePassword(password)) {
    throw new Error(`رمز عبور باید بین ${PASSWORD_MIN_LENGTH} تا ${PASSWORD_MAX_LENGTH} نویسه باشد.`);
  }
  return password;
}

function registerPasswordAuthRoutes(router, { pool, authenticate, ApiError, asyncRoute, loadUserByTelegramId }) {
  const jsonBody = express.json({ limit: '8kb', strict: true, type: 'application/json' });

  router.get('/auth/status', authenticate, asyncRoute(async (req, res) => {
    const user = await loadUserByTelegramId(req.telegram.id);
    const session = await readSession(pool, req.telegram.id, getSessionToken(req));
    const botUsernameRaw = String(process.env.WEBAPP_BOT_USERNAME || 'Vochino01_bot').replace(/^@/, '');
    const botUsername = /^[A-Za-z0-9_]{5,32}$/.test(botUsernameRaw) ? botUsernameRaw : 'Vochino01_bot';
    const registrationCompleted = Boolean(user && user.registration_step === 'completed');
    const isVerified = Boolean(user && ['silver', 'gold'].includes(user.verification_status));
    const isBlocked = Boolean(user && (user.is_blocked === true || user.is_blocked === 1 || user.is_blocked === '1'));
    const sessionActive = Boolean(session && !isBlocked);

    return res.json({
      auth: {
        telegram_authenticated: true,
        account_exists: Boolean(user),
        password_configured: Boolean(user && user.password_hash),
        session_active: sessionActive,
        registration_completed: registrationCompleted,
        registration_step: user ? (user.registration_step || null) : null,
        is_blocked: isBlocked,
        can_trade: sessionActive && registrationCompleted && isVerified,
      },
      user: sessionActive ? {
        telegram_id: user.telegram_id,
        display_name: user.full_name || [req.telegram.first_name, req.telegram.last_name].filter(Boolean).join(' ') || req.telegram.username || 'کاربر ووچینو',
        language: user.language || req.telegram.language_code || 'fa',
        verification_status: user.verification_status || 'none',
        registration_completed: registrationCompleted,
        registration_step: user.registration_step || null,
        is_blocked: isBlocked,
      } : null,
      bot: { username: botUsername, url: `https://t.me/${botUsername}` },
    });
  }));

  // New or incomplete bot users set a Mini App password here. The submitted phone is a
  // pending value only; the bot still verifies ownership through Telegram's Contact button.
  router.post('/auth/register', jsonBody, authenticate, asyncRoute(async (req, res) => {
    const phoneResult = normalizeMiniAppPhone(req.body && req.body.phone);
    if (!phoneResult.ok) throw new ApiError(422, 'INVALID_PHONE', 'شماره تلفن معتبر وارد کنید.');

    let password;
    try { password = passwordFromBody(req.body); }
    catch (error) { throw new ApiError(422, 'PASSWORD_INVALID', error.message); }
    const passwordHash = await hashPassword(password);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query('SELECT * FROM users WHERE telegram_id = $1 FOR UPDATE', [String(req.telegram.id)]);
      const user = found.rows[0];

      if (user && (user.is_blocked === true || user.is_blocked === 1 || user.is_blocked === '1')) {
        throw new ApiError(403, 'USER_BLOCKED', 'دسترسی این حساب توسط مدیریت محدود شده است.');
      }
      if (user && user.password_hash) {
        throw new ApiError(409, 'PASSWORD_ALREADY_SET', 'برای این حساب قبلاً رمز عبور تعریف شده است؛ از فرم ورود استفاده کنید.');
      }
      if (user && user.registration_step === 'completed') {
        throw new ApiError(409, 'PASSWORD_SETUP_REQUIRED', 'حساب شما قبلاً در ربات تکمیل شده است؛ از گزینه تنظیم رمز اولیه استفاده کنید.');
      }

      if (!user) {
        const startParam = String(req.telegramStartParam || '').trim();
        let referrerId = null;
        if (/^\d{1,20}$/.test(startParam) && startParam !== String(req.telegram.id)) {
          const referrer = await client.query('SELECT telegram_id FROM users WHERE telegram_id = $1 LIMIT 1', [startParam]);
          if (referrer.rows[0]) referrerId = String(referrer.rows[0].telegram_id);
        }
        await client.query(
          `INSERT INTO users
             (telegram_id, language, balance, bonus_balance, verification_status, referrer_id,
              registration_step, registration_data, password_hash, password_set_at,
              webapp_pending_phone, password_failed_attempts, registered_at)
           VALUES ($1, NULL, 0, 0, 'none', $2, NULL, '{}'::jsonb, $3, NOW(), $4, 0, NOW())`,
          [String(req.telegram.id), referrerId, passwordHash, phoneResult.value],
        );
      } else {
        if (!user.referrer_id && user.registration_step !== 'completed') {
          const startParam = String(req.telegramStartParam || '').trim();
          if (/^\d{1,20}$/.test(startParam) && startParam !== String(req.telegram.id)) {
            const referrer = await client.query('SELECT telegram_id FROM users WHERE telegram_id = $1 LIMIT 1', [startParam]);
            if (referrer.rows[0]) {
              await client.query('UPDATE users SET referrer_id = $2 WHERE telegram_id = $1 AND referrer_id IS NULL', [String(req.telegram.id), String(referrer.rows[0].telegram_id)]);
            }
          }
        }
        const registrationData = user.registration_data && typeof user.registration_data === 'object'
          ? user.registration_data : {};
        const verifiedPhoneRaw = registrationData.phone || user.phone || null;
        const verifiedPhone = verifiedPhoneRaw ? normalizeMiniAppPhone(verifiedPhoneRaw) : null;
        if (verifiedPhoneRaw && (!verifiedPhone.ok || verifiedPhone.value !== phoneResult.value)) {
          throw new ApiError(409, 'PHONE_ALREADY_VERIFIED', 'شماره این حساب قبلاً در ربات تأیید شده است و با شماره واردشده یکسان نیست.');
        }
        await client.query(
          `UPDATE users
              SET password_hash = $2,
                  password_set_at = NOW(),
                  password_failed_attempts = 0,
                  password_locked_until = NULL,
                  webapp_pending_phone = $3
            WHERE telegram_id = $1`,
          [String(req.telegram.id), passwordHash, verifiedPhoneRaw ? null : phoneResult.value],
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (error instanceof ApiError) throw error;
      throw error;
    } finally {
      client.release();
    }

    const session = await issueSession(pool, req.telegram.id);
    return res.status(201).json({ ok: true, ...session, next_step: 'complete_bot_registration' });
  }));

  // Existing silver/gold bot users can add a password without changing their verified data.
  router.post('/auth/password/setup', jsonBody, authenticate, asyncRoute(async (req, res) => {
    let password;
    try { password = passwordFromBody(req.body); }
    catch (error) { throw new ApiError(422, 'PASSWORD_INVALID', error.message); }
    const passwordHash = await hashPassword(password);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query('SELECT * FROM users WHERE telegram_id = $1 FOR UPDATE', [String(req.telegram.id)]);
      const user = found.rows[0];
      if (!user) throw new ApiError(404, 'ACCOUNT_NOT_FOUND', 'ابتدا در ربات ووچینو /start را اجرا کنید.');
      if (user.is_blocked === true || user.is_blocked === 1 || user.is_blocked === '1') {
        throw new ApiError(403, 'USER_BLOCKED', 'دسترسی این حساب توسط مدیریت محدود شده است.');
      }
      if (user.registration_step !== 'completed' || !['silver', 'gold'].includes(user.verification_status)) {
        throw new ApiError(409, 'BOT_REGISTRATION_INCOMPLETE', 'ابتدا ثبت‌نام و احراز نقره‌ای را از طریق ربات تکمیل کنید.');
      }
      if (user.password_hash) throw new ApiError(409, 'PASSWORD_ALREADY_SET', 'برای این حساب رمز عبور وجود دارد؛ وارد شوید.');
      await client.query(
        `UPDATE users SET password_hash = $2, password_set_at = NOW(),
              password_failed_attempts = 0, password_locked_until = NULL
          WHERE telegram_id = $1`,
        [String(req.telegram.id), passwordHash],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }

    const session = await issueSession(pool, req.telegram.id);
    return res.status(201).json({ ok: true, ...session });
  }));

  router.post('/auth/password/login', jsonBody, authenticate, asyncRoute(async (req, res) => {
    const password = req.body && req.body.password;
    if (typeof password !== 'string' || !password || Buffer.byteLength(password, 'utf8') > 512) {
      throw new ApiError(422, 'PASSWORD_INVALID', 'رمز عبور را وارد کنید.');
    }

    const found = await pool.query(
      `SELECT password_hash, password_locked_until, password_failed_attempts, is_blocked
         FROM users WHERE telegram_id = $1 LIMIT 1`,
      [String(req.telegram.id)],
    );
    if (!found.rows[0]) throw new ApiError(404, 'ACCOUNT_NOT_FOUND', 'حسابی برای این شناسه یافت نشد؛ ابتدا ثبت‌نام کنید.');
    const user = found.rows[0];
    if (user.is_blocked === true || user.is_blocked === 1 || user.is_blocked === '1') {
      throw new ApiError(403, 'USER_BLOCKED', 'دسترسی این حساب به خدمات ووچینو مسدود است.');
    }
    if (!user.password_hash) throw new ApiError(409, 'PASSWORD_SETUP_REQUIRED', 'برای حساب شما هنوز رمز عبور تعریف نشده است.');
    if (user.password_locked_until && new Date(user.password_locked_until).getTime() > Date.now()) {
      const retryAfter = Math.max(1, Math.ceil((new Date(user.password_locked_until).getTime() - Date.now()) / 1000));
      throw new ApiError(429, 'PASSWORD_TEMPORARILY_LOCKED', 'به علت چند تلاش ناموفق، ورود موقتاً محدود شده است.', { retry_after_seconds: retryAfter });
    }

    const matches = await verifyPassword(password, user.password_hash);
    if (!matches) {
      await pool.query(
        `UPDATE users
            SET password_failed_attempts = LEAST(COALESCE(password_failed_attempts, 0) + 1, $2),
                password_locked_until = CASE
                  WHEN COALESCE(password_failed_attempts, 0) + 1 >= $2
                  THEN NOW() + ($3::int * INTERVAL '1 second')
                  ELSE password_locked_until
                END
          WHERE telegram_id = $1`,
        [String(req.telegram.id), PASSWORD_MAX_FAILURES, PASSWORD_LOCK_SECONDS],
      );
      throw new ApiError(401, 'PASSWORD_INCORRECT', 'رمز عبور صحیح نیست.');
    }

    await pool.query(
      `UPDATE users SET password_failed_attempts = 0, password_locked_until = NULL WHERE telegram_id = $1`,
      [String(req.telegram.id)],
    );
    const session = await issueSession(pool, req.telegram.id);
    return res.json({ ok: true, ...session });
  }));

  router.post('/auth/password/change', jsonBody, authenticate, asyncRoute(async (req, res) => {
    const token = req.get('x-vochino-session') || '';
    const session = await readSession(pool, req.telegram.id, token);
    if (!session) throw new ApiError(401, 'APP_SESSION_REQUIRED', 'برای تغییر رمز ابتدا وارد شوید.');

    const oldPassword = req.body && req.body.old_password;
    let newPassword;
    try { newPassword = passwordFromBody(req.body); }
    catch (error) { throw new ApiError(422, 'PASSWORD_INVALID', error.message); }
    if (typeof oldPassword !== 'string' || !oldPassword || Buffer.byteLength(oldPassword, 'utf8') > 512) {
      throw new ApiError(422, 'OLD_PASSWORD_REQUIRED', 'رمز فعلی را وارد کنید.');
    }

    const nextHash = await hashPassword(newPassword);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query(
        'SELECT password_hash, is_blocked FROM users WHERE telegram_id = $1 FOR UPDATE',
        [String(req.telegram.id)],
      );
      const user = found.rows[0];
      if (!user || !user.password_hash || !(await verifyPassword(oldPassword, user.password_hash))) {
        throw new ApiError(401, 'OLD_PASSWORD_INCORRECT', 'رمز فعلی صحیح نیست.');
      }
      if (user.is_blocked === true || user.is_blocked === 1 || user.is_blocked === '1') {
        throw new ApiError(403, 'USER_BLOCKED', 'دسترسی این حساب توسط مدیریت محدود شده است.');
      }
      await client.query(
        `UPDATE users SET password_hash = $2, password_set_at = NOW(),
              password_failed_attempts = 0, password_locked_until = NULL
          WHERE telegram_id = $1`,
        [String(req.telegram.id), nextHash],
      );
      await client.query(
        `UPDATE webapp_auth_sessions SET revoked_at = NOW()
          WHERE telegram_id = $1 AND revoked_at IS NULL`,
        [String(req.telegram.id)],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }

    const nextSession = await issueSession(pool, req.telegram.id);
    return res.json({ ok: true, ...nextSession });
  }));

  router.post('/auth/logout', jsonBody, authenticate, asyncRoute(async (req, res) => {
    const token = getSessionToken(req);
    if (token) {
      await pool.query(
        `UPDATE webapp_auth_sessions SET revoked_at = NOW()
          WHERE telegram_id = $1 AND token_hash = $2 AND revoked_at IS NULL`,
        [String(req.telegram.id), sha256(token)],
      );
    }
    return res.json({ ok: true });
  }));
}

module.exports = {
  registerPasswordAuthRoutes,
  createRequireAppSession,
  hashPassword,
  verifyPassword,
  readSession,
  getSessionToken,
};
