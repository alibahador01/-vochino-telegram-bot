-- ============================================
-- جدول کاربران
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    telegram_id TEXT PRIMARY KEY,
    phone TEXT,
    full_name TEXT,
    card_number TEXT,
    language TEXT DEFAULT 'fa',
    balance INTEGER DEFAULT 0,
    bonus_balance INTEGER DEFAULT 0,
    registered_at TIMESTAMP DEFAULT NOW(),
    referrer_id TEXT,
    verification_status TEXT DEFAULT 'none',
    card_photo_id TEXT,
    national_card_photo_id TEXT,
    is_blocked BOOLEAN DEFAULT FALSE
);

-- ============================================
-- جدول کارت‌های بانکی
-- ============================================
CREATE TABLE IF NOT EXISTS cards (
    id SERIAL PRIMARY KEY,
    telegram_id TEXT REFERENCES users(telegram_id),
    card_number TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- جدول درخواست‌های کیف پول
-- ============================================
CREATE TABLE IF NOT EXISTS wallet_requests (
    id SERIAL PRIMARY KEY,
    telegram_id TEXT REFERENCES users(telegram_id),
    type TEXT CHECK (type IN ('deposit', 'withdraw', 'internal_transfer')),
    amount INTEGER,
    card_number TEXT,
    receipt_file_id TEXT,
    target_user_id TEXT,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW(),
    tracking_code TEXT UNIQUE
);

-- ============================================
-- جدول کانال‌های اجباری
-- ============================================
CREATE TABLE IF NOT EXISTS required_channels (
    id SERIAL PRIMARY KEY,
    chat_id TEXT UNIQUE,
    invite_link TEXT,
    title TEXT,
    active INTEGER DEFAULT 1,
    force_join_enabled INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- جدول تنظیمات
-- ============================================
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- جدول بونوس‌ها
-- ============================================
CREATE TABLE IF NOT EXISTS bonuses (
    id SERIAL PRIMARY KEY,
    telegram_id TEXT REFERENCES users(telegram_id),
    status TEXT CHECK (status IN ('available', 'in_progress', 'used_won', 'used_lost')),
    amount INTEGER,
    game_type TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- جدول سفارشات خرید
-- ============================================
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    telegram_id TEXT REFERENCES users(telegram_id),
    product_type TEXT,
    amount INTEGER,
    commission INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending_delivery',
    created_at TIMESTAMP DEFAULT NOW(),
    tracking_code TEXT UNIQUE,
    delivered_code TEXT,
    provider_tx_id TEXT,
    voucher_code TEXT
);

-- ============================================
-- جدول محصولات خرید
-- ============================================
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    key TEXT UNIQUE,
    name TEXT,
    min_amount NUMERIC,
    max_amount NUMERIC DEFAULT 0,
    price_type TEXT CHECK (price_type IN ('usd', 'toman', 'crypto')),
    commission_type TEXT DEFAULT 'none',
    commission_value NUMERIC DEFAULT 0,
    manual_delivery INTEGER DEFAULT 1,
    active INTEGER DEFAULT 1,
    hidden INTEGER DEFAULT 0,
    api_source_id INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- جدول محصولات فروش
-- ============================================
CREATE TABLE IF NOT EXISTS sell_products (
    id SERIAL PRIMARY KEY,
    key TEXT UNIQUE,
    name TEXT,
    unit_price NUMERIC,
    sample_code TEXT,
    commission_type TEXT DEFAULT 'none',
    commission_value NUMERIC DEFAULT 0,
    active INTEGER DEFAULT 1,
    api_source_id INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- جدول سفارشات فروش
-- ============================================
CREATE TABLE IF NOT EXISTS sell_orders (
    id SERIAL PRIMARY KEY,
    telegram_id TEXT REFERENCES users(telegram_id),
    product_type TEXT,
    voucher_code TEXT,
    amount INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending_review',
    created_at TIMESTAMP DEFAULT NOW(),
    tracking_code TEXT UNIQUE
);

-- ============================================
-- جدول منابع API (صرافی‌ها)
-- ============================================
CREATE TABLE IF NOT EXISTS api_sources (
    id SERIAL PRIMARY KEY,
    name TEXT,
    type TEXT CHECK (type IN ('voucher', 'crypto', 'star', 'gift', 'filter', 'multi')),
    base_url TEXT,
    api_key TEXT,
    secret_key TEXT,
    supports_products TEXT[],
    is_active INTEGER DEFAULT 1,
    is_multi INTEGER DEFAULT 0,
    priority INTEGER DEFAULT 1,
    ip_slot TEXT DEFAULT 'default',
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- جدول کدهای تخفیف و هدیه
-- ============================================
CREATE TABLE IF NOT EXISTS coupons (
    id SERIAL PRIMARY KEY,
    code TEXT UNIQUE,
    type TEXT CHECK (type IN ('discount', 'gift')),
    amount INTEGER,
    usage_limit INTEGER DEFAULT 1,
    used_count INTEGER DEFAULT 0,
    expires_at TIMESTAMP,
    active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- جدول تیکت‌های پشتیبانی
-- ============================================
CREATE TABLE IF NOT EXISTS tickets (
    id SERIAL PRIMARY KEY,
    telegram_id TEXT REFERENCES users(telegram_id),
    subject TEXT,
    message TEXT,
    status TEXT DEFAULT 'open',
    admin_response TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- جدول لاگ تراکنش‌ها
-- ============================================
CREATE TABLE IF NOT EXISTS transaction_logs (
    id SERIAL PRIMARY KEY,
    telegram_id TEXT REFERENCES users(telegram_id),
    type TEXT CHECK (type IN ('buy', 'sell', 'deposit', 'withdraw', 'transfer', 'bonus', 'gift', 'refund')),
    amount INTEGER,
    balance_before INTEGER,
    balance_after INTEGER,
    tracking_code TEXT,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- تنظیمات اولیه
-- ============================================
INSERT INTO settings (key, value) VALUES 
    ('usd_rate', '60000'),
    ('start_reaction', '🎉'),
    ('buy_margin', '10'),
    ('sell_margin', '10'),
    ('buy_mode', 'MANUAL'),
    ('sell_mode', 'MANUAL'),
    ('referral_bonus', '5000'),
    ('referral_enabled', 'true'),
    ('game_rtp', '50'),
    ('game_require_purchase', 'true'),
    ('force_join_enabled', 'true')
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- کانال پیش‌فرض
-- ============================================
INSERT INTO required_channels (chat_id, invite_link, title, active, force_join_enabled) 
VALUES ('-1003953090902', 'https://t.me/+DpU8DAaQei00YTFk', 'کانال اصلی', 1, 1)
ON CONFLICT (chat_id) DO NOTHING;

-- ============================================
-- محصولات پیش‌فرض خرید
-- ============================================
INSERT INTO products (key, name, min_amount, price_type, active, created_at) VALUES 
    ('voucher', '🎟 یوووچر', 1, 'usd', 1, NOW()),
    ('hotvoucher', '🎟 هات ووچر', 50000, 'toman', 1, NOW())
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- محصولات پیش‌فرض فروش
-- ============================================
INSERT INTO sell_products (key, name, unit_price, sample_code, active, created_at) VALUES 
    ('uvoucher', '🎟 یوووچر', 173031, 'USD-7T3H-C2QG-P6YA-D4UW-XOIQ', 1, NOW()),
    ('premiumvoucher', '🎟 پرمیوم ووچر', 100000, 'PSVouchers-1_58-PSV-7-67brrac0xo2llpu738e33sftpdog', 1, NOW()),
    ('psvoucher', '🎟 پی اس ووچر', 100000, 'PS-4KF8-92AD-7QPW-XM2L', 1, NOW())
ON CONFLICT (key) DO NOTHING;
