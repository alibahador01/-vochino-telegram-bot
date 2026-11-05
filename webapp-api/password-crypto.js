'use strict';

const crypto = require('node:crypto');

const PASSWORD_MIN_LENGTH = 10;
const PASSWORD_MAX_LENGTH = 128;
const SCRYPT = Object.freeze({ N: 1 << 14, r: 8, p: 1, keyLength: 64, maxmem: 64 * 1024 * 1024 });

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function scrypt(password, salt, keyLength, options) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keyLength, options, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

function validatePassword(value) {
  if (typeof value !== 'string') return false;
  const length = Array.from(value).length;
  return length >= PASSWORD_MIN_LENGTH && length <= PASSWORD_MAX_LENGTH && Buffer.byteLength(value, 'utf8') <= 512;
}

async function hashPassword(password) {
  if (!validatePassword(password)) {
    const error = new Error(`رمز عبور باید بین ${PASSWORD_MIN_LENGTH} تا ${PASSWORD_MAX_LENGTH} نویسه باشد.`);
    error.code = 'PASSWORD_POLICY';
    throw error;
  }
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt, SCRYPT.keyLength, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: SCRYPT.maxmem,
  });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || typeof encoded !== 'string') return false;
  const parts = encoded.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (N !== SCRYPT.N || r !== SCRYPT.r || p !== SCRYPT.p) return false;
  if (!/^[a-f0-9]{32}$/i.test(parts[4]) || !/^[a-f0-9]{128}$/i.test(parts[5])) return false;
  const salt = Buffer.from(parts[4], 'hex');
  const expected = Buffer.from(parts[5], 'hex');
  const actual = await scrypt(password, salt, expected.length, {
    N, r, p, maxmem: SCRYPT.maxmem,
  });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

module.exports = { sha256, validatePassword, hashPassword, verifyPassword };
