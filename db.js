const { Pool } = require('pg');
const { DEFAULT_USD_RATE, HOT_VOUCHER_MIN } = require('./constants');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function getUser(telegramId) {
  const res = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [String(telegramId)]);
  return res.rows[0] || null;
}

async function getUserCards(telegramId) {
  const user = await getUser(telegramId);
  const extraRes = await pool.query('SELECT * FROM cards WHERE telegram_id = $1', [String(telegramId)]);
  const list = [];
  if (user && user.card_number) {
    list.push({ card_number: user.card_number });
  }
  extraRes.rows.forEach(function (c) { list.push({ card_number: c.card_number }); });
  return list;
}

async function checkMembership(ctx) {
  const channelsRes = await pool.query('SELECT * FROM required_channels WHERE active = 1');
  const channels = channelsRes.rows;
  if (channels.length === 0) return true;
  for (const channel of channels) {
    try {
      const member = await ctx.telegram.getChatMember(channel.chat_id, ctx.from.id);
      if (member.status === 'left' || member.status === 'kicked') {
        return false;
      }
    } catch (e) {
      console.log('خطا در بررسی عضویت: ' + e.message);
      return false;
    }
  }
  return true;
}

async function getUserTotalPurchases(telegramId) {
  const res = await pool.query(
    "SELECT COALESCE(SUM(amount), 0) AS total FROM orders WHERE telegram_id = $1 AND status IN ('completed', 'pending_delivery')",
    [String(telegramId)]
  );
  return Number(res.rows[0].total);
}

async function getActiveBonus(telegramId) {
  const res = await pool.query(
    "SELECT * FROM bonuses WHERE telegram_id = $1 AND status = 'available' ORDER BY id DESC LIMIT 1",
    [String(telegramId)]
  );
  return res.rows[0] || null;
}

async function grantBonusIfEligible(telegramId, BONUS_THRESHOLD, BONUS_AMOUNT) {
  const total = await getUserTotalPurchases(telegramId);
  if (total < BONUS_THRESHOLD) return;
  const existing = await pool.query(
    'SELECT * FROM bonuses WHERE telegram_id = $1',
    [String(telegramId)]
  );
  if (existing.rows.length > 0) return;
  await pool.query(
    'INSERT INTO bonuses (telegram_id, status, amount, created_at) VALUES ($1, $2, $3, $4)',
    [String(telegramId), 'available', BONUS_AMOUNT, new Date().toISOString()]
  );
}

async function getUsdRate() {
  const res = await pool.query('SELECT value FROM settings WHERE key = $1', ['usd_rate']);
  return res.rows[0] ? Number(res.rows[0].value) : DEFAULT_USD_RATE;
}

// ===== توابع جدید برای ارسال همگانی و نمایش اطلاعات =====

async function getAllUsers(includeUnregistered = true) {
  let query = 'SELECT telegram_id, full_name, phone, balance, registered_at FROM users';
  if (!includeUnregistered) {
    query += " WHERE full_name IS NOT NULL AND phone IS NOT NULL AND card_number IS NOT NULL";
  }
  const res = await pool.query(query);
  return res.rows;
}

async function getUserById(telegramId) {
  const res = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [String(telegramId)]);
  return res.rows[0] || null;
}

async function isUserBlocked(telegramId) {
  const res = await pool.query('SELECT * FROM users WHERE telegram_id = $1 AND status = $2', [String(telegramId), 'blocked']);
  return res.rows.length > 0;
}

async function initDb() {
  await pool.query(
    'CREATE TABLE IF NOT EXISTS users (' +
    'telegram_id TEXT PRIMARY KEY, ' +
    'phone TEXT, ' +
    'full_name TEXT, ' +
    'card_number TEXT, ' +
    'language TEXT, ' +
    'balance INTEGER DEFAULT 0, ' +
    'registered_at TEXT' +
    ')'
  );

  await pool.query(
    'CREATE TABLE IF NOT EXISTS cards (' +
    'id SERIAL PRIMARY KEY, ' +
    'telegram_id TEXT, ' +
    'card_number TEXT, ' +
    'created_at TEXT' +
    ')'
  );

  await pool.query(
    'CREATE TABLE IF NOT EXISTS wallet_requests (' +
    'id SERIAL PRIMARY KEY, ' +
    'telegram_id TEXT, ' +
    'type TEXT, ' +
    'amount INTEGER, ' +
    'card_number TEXT, ' +
    'receipt_file_id TEXT, ' +
    'status TEXT, ' +
    'created_at TEXT' +
    ')'
  );

  await pool.query(
    'CREATE TABLE IF NOT EXISTS required_channels (' +
    'id SERIAL PRIMARY KEY, ' +
    'chat_id TEXT, ' +
    'invite_link TEXT, ' +
    'title TEXT, ' +
    'active INTEGER DEFAULT 1' +
    ')'
  );

  await pool.query(
    'CREATE TABLE IF NOT EXISTS settings (' +
    'key TEXT PRIMARY KEY, ' +
    'value TEXT' +
    ')'
  );

  await pool.query(
    'CREATE TABLE IF NOT EXISTS bonuses (' +
    'id SERIAL PRIMARY KEY, ' +
    'telegram_id TEXT, ' +
    'status TEXT, ' +
    'amount INTEGER, ' +
    'created_at TEXT' +
    ')'
  );

  await pool.query(
    'CREATE TABLE IF NOT EXISTS orders (' +
    'id SERIAL PRIMARY KEY, ' +
    'telegram_id TEXT, ' +
    'product_type TEXT, ' +
    'amount INTEGER, ' +
    'commission INTEGER DEFAULT 0, ' +
    'status TEXT, ' +
    'created_at TEXT, ' +
    'tracking_code TEXT, ' +
    'delivered_code TEXT' +
    ')'
  );

  await pool.query(
    'CREATE TABLE IF NOT EXISTS products (' +
    'id SERIAL PRIMARY KEY, ' +
    'key TEXT UNIQUE, ' +
    'name TEXT, ' +
    'min_amount NUMERIC, ' +
    'max_amount NUMERIC DEFAULT 0, ' +
    'price_type TEXT, ' +
    'commission_type TEXT DEFAULT \'none\', ' +
    'commission_value NUMERIC DEFAULT 0, ' +
    'manual_delivery INTEGER DEFAULT 1, ' +
    'active INTEGER DEFAULT 1, ' +
    'created_at TEXT' +
    ')'
  );

  await pool.query(
    'CREATE TABLE IF NOT EXISTS sell_products (' +
    'id SERIAL PRIMARY KEY, ' +
    'key TEXT UNIQUE, ' +
    'name TEXT, ' +
    'unit_price NUMERIC, ' +
    'sample_code TEXT, ' +
    'active INTEGER DEFAULT 1, ' +
    'created_at TEXT' +
    ')'
  );

  await pool.query(
    'CREATE TABLE IF NOT EXISTS sell_orders (' +
    'id SERIAL PRIMARY KEY, ' +
    'telegram_id TEXT, ' +
    'product_type TEXT, ' +
    'voucher_code TEXT, ' +
    'amount INTEGER, ' +
    'status TEXT, ' +
    'created_at TEXT, ' +
    'tracking_code TEXT' +
    ')'
  );

  await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_code TEXT');
  await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS commission INTEGER DEFAULT 0');
  await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_code TEXT');
  await pool.query('ALTER TABLE wallet_requests ADD COLUMN IF NOT EXISTS tracking_code TEXT');

  await pool.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS max_amount NUMERIC DEFAULT 0');
  await pool.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS commission_type TEXT DEFAULT \'none\'');
  await pool.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS commission_value NUMERIC DEFAULT 0');
  await pool.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS manual_delivery INTEGER DEFAULT 1');

  const productsCountRes = await pool.query('SELECT COUNT(*) AS c FROM products');
  if (Number(productsCountRes.rows[0].c) === 0) {
    await pool.query(
      'INSERT INTO products (key, name, min_amount, price_type, active, created_at) VALUES ' +
      '($1, $2, $3, $4, 1, $5), ($6, $7, $8, $9, 1, $5)',
      ['voucher', '🎟 یوووچر', 1, 'usd', new Date().toISOString(), 'hotvoucher', '🎟 هات ووچر', HOT_VOUCHER_MIN, 'toman']
    );
  }

  const sellProductsCountRes = await pool.query('SELECT COUNT(*) AS c FROM sell_products');
  if (Number(sellProductsCountRes.rows[0].c) === 0) {
    await pool.query(
      'INSERT INTO sell_products (key, name, unit_price, sample_code, active, created_at) VALUES ' +
      '($1, $2, $3, $4, 1, $5), ($6, $7, $8, $9, 1, $5), ($10, $11, $12, $13, 1, $5)',
      [
        'uvoucher', '🎟 یوووچر', 173031, 'USD-7T3H-C2QG-P6YA-D4UW-XOIQ', new Date().toISOString(),
        'premiumvoucher', '🎟 پرمیوم ووچر', 100000, 'PSVouchers-1_58-PSV-7-67brrac0xo2llpu738e33sftpdog',
        'psvoucher', '🎟 پی اس ووچر', 100000, 'PS-4KF8-92AD-7QPW-XM2L'
      ]
    );
  }

  const defaultReactionRes = await pool.query('SELECT value FROM settings WHERE key = $1', ['start_reaction']);
  if (defaultReactionRes.rows.length === 0) {
    await pool.query('INSERT INTO settings (key, value) VALUES ($1, $2)', ['start_reaction', '🎉']);
  }

  const usdRateRes = await pool.query('SELECT value FROM settings WHERE key = $1', ['usd_rate']);
  if (usdRateRes.rows.length === 0) {
    await pool.query('INSERT INTO settings (key, value) VALUES ($1, $2)', ['usd_rate', String(DEFAULT_USD_RATE)]);
  }

  const existingChannelRes = await pool.query('SELECT * FROM required_channels WHERE chat_id = $1', ['-1003953090902']);
  if (existingChannelRes.rows.length === 0) {
    await pool.query(
      'INSERT INTO required_channels (chat_id, invite_link, title, active) VALUES ($1, $2, $3, 1)',
      ['-1003953090902', 'https://t.me/+DpU8DAaQei00YTFk', 'کانال اصلی']
    );
  } else {
    await pool.query(
      'UPDATE required_channels SET invite_link = $1 WHERE chat_id = $2',
      ['https://t.me/+DpU8DAaQei00YTFk', '-1003953090902']
    );
  }
}

module.exports = {
  pool,
  getUser,
  getUserCards,
  checkMembership,
  getUserTotalPurchases,
  getActiveBonus,
  grantBonusIfEligible,
  getUsdRate,
  getAllUsers,
  getUserById,
  isUserBlocked,
  initDb
};
