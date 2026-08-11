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
-- جدول واسط جدید: اتصال محصولات به صرافی‌ها
-- ============================================
CREATE TABLE IF NOT EXISTS product_api_links (
    id SERIAL PRIMARY KEY,
    product_type TEXT CHECK (product_type IN ('buy', 'sell')) NOT NULL,
    product_key TEXT NOT NULL,
    api_source_id INTEGER REFERENCES api_sources(id),
    priority INTEGER DEFAULT 1,
    active INTEGER DEFAULT 1
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
    ('force_join_enabled', 'true'),
    ('disableBalanceGame', 'false'),
    ('disableBonusGame', 'false'),
    ('winRateBalance', '50'),
    ('winRateBonus', '50'),
    ('gameMultiplier', '2'),
    ('minPurchaseForGame', '0')
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- کانال پیش‌فرض
-- ============================================
INSERT INTO required_channels (chat_id, invite_link, title, active, force_join_enabled) 
VALUES ('-1003953090902', 'https://t.me/+DpU8DAaQei00YTFk', 'کانال اصلی', 1, 1)
ON CONFLICT (chat_id) DO NOTHING;

-- ============================================
-- محصولات خرید (شامل محصولات جدید مخفی)
-- ============================================

-- محصولات قدیمی و فعال
INSERT INTO products (key, name, min_amount, price_type, active, hidden, created_at) VALUES 
    ('voucher', '🎟 یوووچر', 1, 'usd', 1, 0, NOW()),
    ('hotvoucher', '🎟 هات ووچر', 50000, 'toman', 1, 0, NOW())
ON CONFLICT (key) DO NOTHING;

-- محصولات جدید (غیرفعال/مخفی)
INSERT INTO products (key, name, min_amount, price_type, active, hidden, created_at) VALUES 
    ('premium_voucher', '🎟 پرمیوم ووچر', 100000, 'toman', 0, 1, NOW()),
    ('ps_voucher', '🔵 پی‌اس ووچر', 185081, 'toman', 0, 1, NOW()),
    ('perfect_money', '💵 پرفکت مانی', 1, 'usd', 0, 1, NOW()),
    ('crypto_dollar', '💲 دلار (کریپتو)', 10, 'usd', 0, 1, NOW()),
    ('crypto_tron', '🪙 ترون (TRX)', 100, 'toman', 0, 1, NOW()),
    ('crypto_ton', '💎 تون (TON)', 100, 'toman', 0, 1, NOW()),
    ('telegram_stars', '⭐️ استارز تلگرام', 50, 'toman', 0, 1, NOW()),
    ('telegram_gift_stars', '🎁 گیفت استارزی', 100, 'toman', 0, 1, NOW()),
    ('telegram_gift_collection', '🎁 گیفت کلکسیونی', 100, 'toman', 0, 1, NOW()),
    ('telegram_premium', '💎 پرمیوم تلگرام', 50000, 'toman', 0, 1, NOW()),
    ('channel_boost', '🚀 بوست کانال', 100000, 'toman', 0, 1, NOW()),
    ('post_reaction', '❤️ ری‌اکشن پست', 500, 'toman', 0, 1, NOW()),
    ('post_view', '👁 بازدید پست', 500, 'toman', 0, 1, NOW()),
    ('virtual_number', '📱 شماره مجازی', 50000, 'toman', 0, 1, NOW())
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- محصولات فروش (شامل موارد جدید مخفی)
-- ============================================

-- محصولات فروش قدیمی و فعال
INSERT INTO sell_products (key, name, unit_price, sample_code, active, created_at) VALUES 
    ('uvoucher', '🎟 یوووچر', 173031, 'USD-7T3H-C2QG-P6YA-D4UW-XOIQ', 1, NOW()),
    ('premiumvoucher', '🎟 پرمیوم ووچر', 100000, 'PSVouchers-1_58-PSV-7-67brrac0xo2llpu738e33sftpdog', 1, NOW()),
    ('psvoucher', '🔵 پی‌اس ووچر', 100000, 'PS-4KF8-92AD-7QPW-XM2L', 1, NOW())
ON CONFLICT (key) DO NOTHING;

-- محصولات فروش جدید (غیرفعال)
INSERT INTO sell_products (key, name, unit_price, sample_code, active, created_at) VALUES 
    ('hotvoucher_sell', '🎟 هات ووچر', 50000, 'HOT-XXXX-XXXX', 0, NOW()),
    ('perfect_money_sell', '💵 پرفکت مانی', 60000, 'PM-XXXX', 0, NOW())
ON CONFLICT (key) DO NOTHING;
