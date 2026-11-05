'use strict';

const crypto = require('node:crypto');

class TelegramAuthError extends Error {
  constructor(message, code = 'TELEGRAM_AUTH_INVALID') {
    super(message);
    this.name = 'TelegramAuthError';
    this.code = code;
    this.status = 401;
  }
}

/**
 * Validates Telegram Mini App initData with the bot-token HMAC procedure.
 * Do not replace this with initDataUnsafe or a client-supplied telegram_id.
 */
function validateTelegramInitData(rawInitData, botToken, options = {}) {
  const maxAgeSeconds = options.maxAgeSeconds === undefined
    ? 86400
    : Number(options.maxAgeSeconds);
  const futureToleranceSeconds = options.futureToleranceSeconds === undefined
    ? 30
    : Number(options.futureToleranceSeconds);
  const nowSeconds = options.nowSeconds === undefined
    ? Math.floor(Date.now() / 1000)
    : Number(options.nowSeconds);

  if (typeof rawInitData !== 'string' || rawInitData.length === 0 || rawInitData.length > 16_384) {
    throw new TelegramAuthError('Telegram initData is missing or malformed.');
  }
  if (typeof botToken !== 'string' || botToken.trim().length < 20) {
    throw new Error('BOT_TOKEN is not configured correctly.');
  }

  const params = new URLSearchParams(rawInitData);
  const entries = [];
  const seenKeys = new Set();

  for (const [key, value] of params.entries()) {
    if (seenKeys.has(key)) {
      throw new TelegramAuthError('Duplicate fields in Telegram initData.');
    }
    seenKeys.add(key);
    entries.push([key, value]);
  }

  const receivedHash = params.get('hash');
  if (!receivedHash || !/^[a-fA-F0-9]{64}$/.test(receivedHash)) {
    throw new TelegramAuthError('Telegram initData hash is missing or malformed.');
  }

  // Telegram's bot-token validation excludes hash; if `signature` is present,
  // it remains part of this HMAC data-check-string.
  const dataCheckString = entries
    .filter(([key]) => key !== 'hash')
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();
  const calculatedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest();
  const expectedHash = Buffer.from(receivedHash, 'hex');

  if (expectedHash.length !== calculatedHash.length || !crypto.timingSafeEqual(expectedHash, calculatedHash)) {
    throw new TelegramAuthError('Telegram initData signature verification failed.');
  }

  const authDateRaw = params.get('auth_date');
  if (!authDateRaw || !/^\d+$/.test(authDateRaw)) {
    throw new TelegramAuthError('Telegram auth_date is missing or invalid.');
  }

  const authDate = Number(authDateRaw);
  if (!Number.isSafeInteger(authDate) || authDate <= 0) {
    throw new TelegramAuthError('Telegram auth_date is invalid.');
  }
  if (authDate > nowSeconds + futureToleranceSeconds) {
    throw new TelegramAuthError('Telegram initData timestamp is in the future.');
  }
  if (maxAgeSeconds > 0 && nowSeconds - authDate > maxAgeSeconds) {
    throw new TelegramAuthError('Telegram initData has expired.', 'TELEGRAM_AUTH_EXPIRED');
  }

  let user;
  try {
    user = JSON.parse(params.get('user') || 'null');
  } catch (_error) {
    throw new TelegramAuthError('Telegram user payload is malformed.');
  }
  if (!user || !Number.isSafeInteger(Number(user.id)) || Number(user.id) <= 0) {
    throw new TelegramAuthError('Telegram user identity is missing or invalid.');
  }

  return {
    user: {
      id: String(user.id),
      first_name: typeof user.first_name === 'string' ? user.first_name : '',
      last_name: typeof user.last_name === 'string' ? user.last_name : '',
      username: typeof user.username === 'string' ? user.username : null,
      language_code: typeof user.language_code === 'string' ? user.language_code : null,
      is_premium: Boolean(user.is_premium),
    },
    authDate,
    queryId: params.get('query_id') || null,
    startParam: params.get('start_param') || null,
  };
}

function createTelegramAuthMiddleware(options = {}) {
  const botToken = options.botToken || process.env.BOT_TOKEN;
  const rawMaxAge = options.maxAgeSeconds === undefined
    ? (process.env.TELEGRAM_INIT_DATA_MAX_AGE_SECONDS || '86400')
    : options.maxAgeSeconds;
  const maxAgeSeconds = Number(rawMaxAge);
  if (!Number.isFinite(maxAgeSeconds) || maxAgeSeconds < 0) {
    throw new Error('TELEGRAM_INIT_DATA_MAX_AGE_SECONDS must be a non-negative number.');
  }
  if (typeof botToken !== 'string' || botToken.trim().length < 20) {
    throw new Error('BOT_TOKEN is required to enable the authenticated Mini App API.');
  }

  return function telegramAuthMiddleware(req, res, next) {
    const authorization = req.get('authorization') || '';
    const match = authorization.match(/^tma\s+(.+)$/i);
    if (!match) {
      return res.status(401).json({
        error: { code: 'TELEGRAM_AUTH_REQUIRED', message: 'Telegram Mini App authentication is required.' },
      });
    }

    try {
      const validated = validateTelegramInitData(match[1], botToken, { maxAgeSeconds });
      req.telegram = validated.user;
      req.telegramAuthDate = validated.authDate;
      req.telegramQueryId = validated.queryId;
      req.telegramStartParam = validated.startParam;
      return next();
    } catch (error) {
      if (error instanceof TelegramAuthError) {
        return res.status(error.status).json({
          error: { code: error.code, message: error.message },
        });
      }
      return next(error);
    }
  };
}

module.exports = {
  TelegramAuthError,
  validateTelegramInitData,
  createTelegramAuthMiddleware,
};
