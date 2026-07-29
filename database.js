const Database = require('better-sqlite3');
const path = require('path');

// اتصال امن به دیتابیس
const dbPath = process.env.NODE_ENV === 'production' ? '/opt/render/project/data/vochino.db' : path.join(__dirname, 'vochino.db');
const db = new Database('vochino.db');

// ایجاد جدول‌ها با ایمنی کامل برای جلوگیری از ارور
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT UNIQUE,
    username TEXT,
    balance REAL DEFAULT 0,
    is_blocked INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT,
    card_number TEXT,
    card_holder TEXT
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    sample_code TEXT,
    help_text TEXT,
    is_active INTEGER DEFAULT 1,
    buy_price REAL DEFAULT 0,
    sell_price REAL DEFAULT 0,
    fixed_fee REAL DEFAULT 0,
    percent_fee REAL DEFAULT 0,
    min_amount REAL DEFAULT 0,
    max_amount REAL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_code TEXT UNIQUE,
    telegram_id TEXT,
    product_id INTEGER,
    order_type TEXT,
    amount REAL,
    final_amount REAL,
    submitted_code TEXT,
    status TEXT DEFAULT 'pending',
    admin_note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS code_blacklist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

console.log('Database initialized successfully.');
module.exports = db;
