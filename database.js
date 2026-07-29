const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'vochino.db'));

// ایجاد جدول‌ها به صورت کاملاً داینامیک و پویا
db.exec(`
  -- کاربران
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT UNIQUE,
    username TEXT,
    balance REAL DEFAULT 0,
    is_blocked INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- کارت‌های بانکی کاربران
  CREATE TABLE IF NOT EXISTS user_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT,
    card_number TEXT,
    card_holder TEXT
  );

  -- محصولات داینامیک (خرید و فروش - بدون هاردکد نام محصولات)
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- 'buy' یا 'sell'
    description TEXT,
    sample_code TEXT,
    help_text TEXT,
    is_active INTEGER DEFAULT 1,
    -- نرخ‌ها و محدودیت‌ها
    buy_price REAL DEFAULT 0,
    sell_price REAL DEFAULT 0,
    fixed_fee REAL DEFAULT 0,
    percent_fee REAL DEFAULT 0,
    min_amount REAL DEFAULT 0,
    max_amount REAL DEFAULT 0
  );

  -- اتصال محصولات به APIهای صرافی (پشتیبانی از چند API با اولویت)
  CREATE TABLE IF NOT EXISTS product_apis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER,
    api_name TEXT,
    api_url TEXT,
    api_key TEXT,
    priority INTEGER DEFAULT 1,
    is_active INTEGER DEFAULT 1,
    FOREIGN KEY(product_id) REFERENCES products(id)
  );

  -- سفارشات (خرید و فروش)
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_code TEXT UNIQUE,
    telegram_id TEXT,
    product_id INTEGER,
    order_type TEXT, -- 'buy' یا 'sell'
    amount REAL,
    final_amount REAL,
    submitted_code TEXT,
    status TEXT DEFAULT 'pending', -- pending, approved, rejected
    admin_note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(product_id) REFERENCES products(id)
  );

  -- لیست سیاه کدها و ووچرهای تکراری/استفاده شده
  CREATE TABLE IF NOT EXISTS code_blacklist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- تراکنش‌های مالی کیف پول
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT,
    amount REAL,
    type TEXT, -- 'deposit', 'withdraw', 'purchase', 'sale'
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

console.log('Database tables initialized successfully (Dynamic & Modular).');
module.exports = db;
