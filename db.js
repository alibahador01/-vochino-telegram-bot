const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function getUser(telegramId) {
  const res = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [String(telegramId)]);
  return res.rows[0] || null;
}

async function getUserCards(telegramId) {
  const res = await pool.query('SELECT * FROM cards WHERE telegram_id = $1 ORDER BY id DESC', [String(telegramId)]);
  return res.rows;
}

async function initDb(HOT_VOUCHER_MIN = 100000, DEFAULT_USD_RATE = 60000) {
  // جدول کاربران
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

  // جدول کارت‌های بانکی
  await pool.query(
    'CREATE TABLE IF NOT EXISTS cards (' +
    'id SERIAL PRIMARY KEY, ' +
    'telegram_id TEXT, ' +
    'card_number TEXT, ' +
    'created_at TEXT' +
    ')'
  );

  // جدول درخواست‌های کیف پول
  await pool.query(
    'CREATE TABLE IF NOT EXISTS wallet_requests (' +
    'id SERIAL PRIMARY KEY, ' +
    'telegram_id TEXT, ' +
    'type TEXT, ' +
    'amount INTEGER, ' +
    'card_number TEXT, ' +
    'receipt_file_id TEXT, ' +
    'status TEXT, ' +
    'created_at TEXT, ' +
    'tracking_code TEXT' +
    ')'
  );

  // جدول کانال‌های اجباری
  await pool.query(
    'CREATE TABLE IF NOT EXISTS required_channels (' +
    'id SERIAL PRIMARY KEY, ' +
    'chat_id TEXT, ' +
    'invite_link TEXT, ' +
    'title TEXT, ' +
    'active INTEGER DEFAULT 1' +
    ')'
  );

  // جدول تنظیمات
  await pool.query(
    'CREATE TABLE IF NOT EXISTS settings (' +
    'key TEXT PRIMARY KEY, ' +
    'value TEXT' +
    ')'
  );

  // جدول سفارشات خرید
  await pool.query(
    'CREATE TABLE IF NOT EXISTS orders (' +
    'id SERIAL PRIMARY KEY, ' +
    'telegram_id TEXT, ' +
    'product_type TEXT, ' +
    'amount INTEGER, ' +
    'status TEXT, ' +
    'created_at TEXT, ' +
    'tracking_code TEXT' +
    ')'
  );

  // جدول محصولات خرید
  await pool.query(
    'CREATE TABLE IF NOT EXISTS products (' +
    'id SERIAL PRIMARY KEY, ' +
    'key TEXT UNIQUE, ' +
    'name TEXT, ' +
    'min_amount NUMERIC, ' +
    'price_type TEXT, ' +
    'active INTEGER DEFAULT 1, ' +
    'created_at TEXT' +
    ')'
  );

  // جدول محصولات فروش
  await pool.query(
    'CREATE TABLE IF NOT EXISTS sell_products (' +
    'id SERIAL PRIMARY KEY, ' +
    'key TEXT UNIQUE, ' +
    'name TEXT, ' +
    'unit_price NUMERIC, ' +
    'sample_code TEXT, ' +
    'api_provider TEXT DEFAULT \'manual\', ' +
    'active INTEGER DEFAULT 1, ' +
    'created_at TEXT' +
    ')'
  );

  // جدول سفارشات فروش به ما
  await pool.query(
    'CREATE TABLE IF NOT EXISTS sell_orders (' +
    'id SERIAL PRIMARY KEY, ' +
    'telegram_id TEXT, ' +
    'product_type TEXT, ' +
    'voucher_code TEXT, ' +
    'amount INTEGER DEFAULT 0, ' +
    'status TEXT, ' +
    'created_at TEXT, ' +
    'tracking_code TEXT' +
    ')'
  );

  // ثبت داده‌های اولیه محصولات خرید
  const productsCountRes = await pool.query('SELECT COUNT(*) AS c FROM products');
  if (Number(productsCountRes.rows[0].c) === 0) {
    const now = new Date().toISOString();
    await pool.query(
      'INSERT INTO products (key, name, min_amount, price_type, active, created_at) VALUES ' +
      '($1, $2, $3, $4, 1, $5), ($6, $7, $8, $9, 1, $10)',
      ['voucher', '🎟 یوووچر', 1, 'usd', now, 'hotvoucher', '🎟 هات ووچر', HOT_VOUCHER_MIN, 'toman', now]
    );
  }

  // ثبت داده‌های اولیه محصولات فروش
  const sellProductsCountRes = await pool.query('SELECT COUNT(*) AS c FROM sell_products');
  if (Number(sellProductsCountRes.rows[0].c) === 0) {
    const now = new Date().toISOString();
    await pool.query(
      'INSERT INTO sell_products (key, name, unit_price, sample_code, active, created_at) VALUES ' +
      '($1, $2, $3, $4, 1, $5), ($6, $7, $8, $9, 1, $10), ($11, $12, $13, $14, 1, $15)',
      [
        'uvoucher', '🎟 یوووچر', 173031, 'USD-7T3H-C2QG-P6YA-D4UW-XOIQ', now,
        'premiumvoucher', '🎟 پرمیوم ووچر', 100000, 'PSVouchers-1_58-PSV-7-67brrac0xo2llpu738e33sftpdog', now,
        'psvoucher', '🎟 پی اس ووچر', 100000, 'PS-4KF8-92AD-7QPW-XM2L', now
      ]
    );
  }

  // تنظیمات اولیه
  const usdRateRes = await pool.query('SELECT value FROM settings WHERE key = $1', ['usd_rate']);
  if (usdRateRes.rows.length === 0) {
    await pool.query('INSERT INTO settings (key, value) VALUES ($1, $2)', ['usd_rate', String(DEFAULT_USD_RATE)]);
  }
}

module.exports = { pool, getUser, getUserCards, initDb };
