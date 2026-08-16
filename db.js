// db.js
const { Pool } = require('pg');
const { DEFAULT_USD_RATE } = require('./constants');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ==================== کاربران ====================
async function getUser(telegramId) {
  const res = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [String(telegramId)]);
  return res.rows[0] || null;
}

async function getUserById(telegramId) {
  const res = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [String(telegramId)]);
  return res.rows[0] || null;
}

async function createUser(telegramId, phone, fullName, cardNumber, language = 'fa', referrerId = null) {
  const res = await pool.query(
    'INSERT INTO users (telegram_id, phone, full_name, card_number, language, referrer_id, registered_at) VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *',
    [String(telegramId), phone, fullName, cardNumber, language, referrerId]
  );
  return res.rows[0];
}

async function updateUser(telegramId, data) {
  const fields = Object.keys(data).map((key, i) => `${key} = $${i + 2}`);
  const values = Object.values(data);
  const res = await pool.query(
    `UPDATE users SET ${fields.join(', ')} WHERE telegram_id = $1 RETURNING *`,
    [String(telegramId), ...values]
  );
  return res.rows[0] || null;
}

async function getAllUsers(includeUnregistered = true) {
  let query = 'SELECT telegram_id, full_name, phone, balance, bonus_balance, registered_at, verification_status FROM users';
  if (!includeUnregistered) query += " WHERE full_name IS NOT NULL AND phone IS NOT NULL AND card_number IS NOT NULL";
  const res = await pool.query(query);
  return res.rows;
}

async function getReferrals(telegramId) {
  const res = await pool.query('SELECT COUNT(*)::int AS count FROM users WHERE referrer_id = $1', [String(telegramId)]);
  return Number(res.rows[0].count);
}

async function getUserStats() {
  const total = await pool.query('SELECT COUNT(*)::int AS count FROM users');
  const registered = await pool.query("SELECT COUNT(*)::int AS count FROM users WHERE full_name IS NOT NULL AND phone IS NOT NULL AND card_number IS NOT NULL");
  const balance = await pool.query('SELECT COALESCE(SUM(balance), 0) AS total FROM users');
  const bonus = await pool.query('SELECT COALESCE(SUM(bonus_balance), 0) AS total FROM users');
  return {
    totalUsers: Number(total.rows[0].count),
    registeredUsers: Number(registered.rows[0].count),
    totalBalance: Number(balance.rows[0].total),
    totalBonus: Number(bonus.rows[0].total)
  };
}

// ==================== کارت‌ها ====================
async function getUserCards(telegramId) {
  const user = await getUser(telegramId);
  const list = [];
  if (user && user.card_number) list.push({ card_number: user.card_number });
  const extraRes = await pool.query('SELECT * FROM cards WHERE telegram_id = $1', [String(telegramId)]);
  extraRes.rows.forEach(c => list.push({ card_number: c.card_number }));
  return list;
}

// ==================== کانال‌ها ====================
async function getRequiredChannels() {
  const res = await pool.query('SELECT * FROM required_channels WHERE active = 1');
  return res.rows;
}

async function addChannel(chatId, inviteLink, title) {
  const res = await pool.query(
    'INSERT INTO required_channels (chat_id, invite_link, title, active, force_join_enabled) VALUES ($1, $2, $3, 1, 1) RETURNING *',
    [chatId, inviteLink, title]
  );
  return res.rows[0];
}

async function updateChannel(chatId, data) {
  const fields = Object.keys(data).map((key, i) => `${key} = $${i + 2}`);
  const values = Object.values(data);
  const res = await pool.query(
    `UPDATE required_channels SET ${fields.join(', ')} WHERE chat_id = $1 RETURNING *`,
    [chatId, ...values]
  );
  return res.rows[0] || null;
}

async function deleteChannel(chatId) {
  await pool.query('DELETE FROM required_channels WHERE chat_id = $1', [chatId]);
}

async function checkMembership(ctx) {
  const forceJoinEnabled = await getSetting('force_join_enabled', 'true');
  if (forceJoinEnabled !== 'true') return true;
  const channels = await getRequiredChannels();
  if (channels.length === 0) return true;

  for (const channel of channels) {
    try {
      const member = await ctx.telegram.getChatMember(channel.chat_id, ctx.from.id);
      if (member.status === 'left' || member.status === 'kicked') {
        return false;
      }
    } catch (e) {
      console.log('⚠️ خطا در بررسی عضویت، به‌عنوان عضو تأیید شد: ' + e.message);
      return true;
    }
  }
  return true;
}

// ==================== تنظیمات ====================
async function getSetting(key, defaultValue = null) {
  const res = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
  return res.rows[0] ? res.rows[0].value : defaultValue;
}

async function setSetting(key, value) {
  await pool.query(
    'INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()',
    [key, value]
  );
}

async function getUsdRate() {
  return Number(await getSetting('usd_rate', DEFAULT_USD_RATE));
}

// ==================== محصولات خرید ====================
async function getProducts(activeOnly = true) {
  let query = 'SELECT * FROM products WHERE hidden = 0';
  if (activeOnly) query += ' AND active = 1';
  query += ' ORDER BY id ASC';
  const res = await pool.query(query);
  return res.rows;
}

async function getProductByKey(key) {
  const res = await pool.query('SELECT * FROM products WHERE key = $1', [key]);
  return res.rows[0] || null;
}

async function addProduct(data) {
  const { key, name, min_amount, max_amount, price_type, commission_type, commission_value, manual_delivery, api_source_id } = data;
  const res = await pool.query(
    'INSERT INTO products (key, name, min_amount, max_amount, price_type, commission_type, commission_value, manual_delivery, api_source_id, active, hidden, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, 0, NOW()) RETURNING *',
    [key, name, min_amount, max_amount || 0, price_type, commission_type || 'none', commission_value || 0, manual_delivery !== undefined ? manual_delivery : 1, api_source_id || null]
  );
  return res.rows[0];
}

async function updateProduct(key, data) {
  const fields = Object.keys(data).map((f, i) => `${f} = $${i + 2}`);
  const values = Object.values(data);
  const res = await pool.query(
    `UPDATE products SET ${fields.join(', ')} WHERE key = $1 RETURNING *`,
    [key, ...values]
  );
  return res.rows[0] || null;
}

async function deleteProduct(key) {
  await pool.query('UPDATE products SET active = 0 WHERE key = $1', [key]);
}

// ==================== محصولات فروش ====================
async function getSellProducts(activeOnly = true) {
  let query = 'SELECT * FROM sell_products';
  if (activeOnly) query += ' WHERE active = 1';
  query += ' ORDER BY id ASC';
  const res = await pool.query(query);
  return res.rows;
}

async function getSellProductByKey(key) {
  const res = await pool.query('SELECT * FROM sell_products WHERE key = $1', [key]);
  return res.rows[0] || null;
}

async function addSellProduct(data) {
  const { key, name, unit_price, sample_code, commission_type, commission_value, api_source_id } = data;
  const res = await pool.query(
    'INSERT INTO sell_products (key, name, unit_price, sample_code, commission_type, commission_value, api_source_id, active, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, 1, NOW()) RETURNING *',
    [key, name, unit_price, sample_code, commission_type || 'none', commission_value || 0, api_source_id || null]
  );
  return res.rows[0];
}

async function updateSellProduct(key, data) {
  const fields = Object.keys(data).map((f, i) => `${f} = $${i + 2}`);
  const values = Object.values(data);
  const res = await pool.query(
    `UPDATE sell_products SET ${fields.join(', ')} WHERE key = $1 RETURNING *`,
    [key, ...values]
  );
  return res.rows[0] || null;
}

async function deleteSellProduct(key) {
  await pool.query('UPDATE sell_products SET active = 0 WHERE key = $1', [key]);
}

// ==================== کوپن‌ها ====================
async function getCoupon(code) {
  const res = await pool.query('SELECT * FROM coupons WHERE code = $1 AND active = 1 AND (expires_at IS NULL OR expires_at > NOW())', [code]);
  return res.rows[0] || null;
}

async function useCoupon(code) {
  const coupon = await getCoupon(code);
  if (!coupon) return null;
  if (coupon.used_count >= coupon.usage_limit) return null;
  await pool.query('UPDATE coupons SET used_count = used_count + 1 WHERE id = $1', [coupon.id]);
  return coupon;
}

async function addCoupon(data) {
  const { code, type, amount, usage_limit, expires_at } = data;
  const res = await pool.query(
    'INSERT INTO coupons (code, type, amount, usage_limit, expires_at, active, created_at) VALUES ($1, $2, $3, $4, $5, 1, NOW()) RETURNING *',
    [code, type, amount, usage_limit || 1, expires_at || null]
  );
  return res.rows[0];
}

async function deleteCoupon(code) {
  await pool.query('UPDATE coupons SET active = 0 WHERE code = $1', [code]);
}

// ==================== تیکت‌ها ====================
async function getTickets(telegramId = null) {
  let query = 'SELECT * FROM tickets';
  const params = [];
  if (telegramId) { query += ' WHERE telegram_id = $1'; params.push(String(telegramId)); }
  query += ' ORDER BY created_at DESC';
  const res = await pool.query(query, params);
  return res.rows;
}

async function addTicket(telegramId, subject, message) {
  const res = await pool.query(
    'INSERT INTO tickets (telegram_id, subject, message, status, created_at, updated_at) VALUES ($1, $2, $3, $4, NOW(), NOW()) RETURNING *',
    [String(telegramId), subject, message, 'open']
  );
  return res.rows[0];
}

async function updateTicket(id, data) {
  const fields = Object.keys(data).map((f, i) => `${f} = $${i + 2}`);
  const values = Object.values(data);
  const res = await pool.query(
    `UPDATE tickets SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id, ...values]
  );
  return res.rows[0] || null;
}

// ==================== لاگ تراکنش‌ها ====================
async function logTransaction(telegramId, type, amount, description = '') {
  const user = await getUser(telegramId);
  const balanceBefore = user ? Number(user.balance) : 0;
  await pool.query(
    'INSERT INTO transaction_logs (telegram_id, type, amount, balance_before, balance_after, description, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW())',
    [String(telegramId), type, amount, balanceBefore, balanceBefore + amount, description]
  );
}

async function getTransactionLogs(telegramId, limit = 10) {
  const res = await pool.query(
    'SELECT * FROM transaction_logs WHERE telegram_id = $1 ORDER BY created_at DESC LIMIT $2',
    [String(telegramId), limit]
  );
  return res.rows;
}

// ==================== API / صرافی‌ها ====================
async function getApiSources() {
  const res = await pool.query('SELECT * FROM api_sources WHERE is_active = 1 ORDER BY priority ASC');
  return res.rows;
}

async function getAllApiSources(includeInactive = false) {
  let query = 'SELECT * FROM api_sources';
  if (!includeInactive) query += ' WHERE is_active = 1';
  query += ' ORDER BY priority ASC';
  const res = await pool.query(query);
  return res.rows;
}

async function getApiSourceById(id) {
  const res = await pool.query('SELECT * FROM api_sources WHERE id = $1', [id]);
  return res.rows[0] || null;
}

async function addApiSource(data) {
  const { name, type, base_url, api_key, secret_key, supports_products, is_multi, priority, ip_slot } = data;
  const res = await pool.query(
    'INSERT INTO api_sources (name, type, base_url, api_key, secret_key, supports_products, is_multi, priority, ip_slot, is_active, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, NOW()) RETURNING *',
    [name, type, base_url, api_key, secret_key, supports_products, is_multi || false, priority || 1, ip_slot || 'default']
  );
  return res.rows[0];
}

async function updateApiSource(id, data) {
  const fields = Object.keys(data).map((f, i) => `${f} = $${i + 2}`);
  const values = Object.values(data);
  const res = await pool.query(
    `UPDATE api_sources SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
    [id, ...values]
  );
  return res.rows[0] || null;
}

async function deleteApiSource(id) {
  await pool.query('UPDATE api_sources SET is_active = 0 WHERE id = $1', [id]);
}

// ==================== product_api_links ====================
async function getProductApiLinks(productType, productKey) {
  const res = await pool.query(
    'SELECT pal.*, apis.name AS api_name, apis.type AS api_type FROM product_api_links pal JOIN api_sources apis ON pal.api_source_id = apis.id WHERE pal.product_type = $1 AND pal.product_key = $2 AND pal.active = 1 ORDER BY pal.priority ASC',
    [productType, productKey]
  );
  return res.rows;
}

async function getAllProductApiLinks(productType = null) {
  let query = 'SELECT pal.*, apis.name AS api_name, apis.type AS api_type FROM product_api_links pal JOIN api_sources apis ON pal.api_source_id = apis.id WHERE pal.active = 1';
  const params = [];
  if (productType) { query += ' AND pal.product_type = $1'; params.push(productType); }
  query += ' ORDER BY pal.product_type, pal.product_key, pal.priority ASC';
  const res = await pool.query(query, params);
  return res.rows;
}

async function addProductApiLink(productType, productKey, apiSourceId, priority = 1) {
  const existing = await pool.query(
    'SELECT id FROM product_api_links WHERE product_type = $1 AND product_key = $2 AND api_source_id = $3',
    [productType, productKey, apiSourceId]
  );
  if (existing.rows.length > 0) {
    await pool.query('UPDATE product_api_links SET active = 1, priority = $4 WHERE id = $5', [priority, existing.rows[0].id]);
    return (await pool.query('SELECT * FROM product_api_links WHERE id = $1', [existing.rows[0].id])).rows[0];
  }
  const res = await pool.query(
    'INSERT INTO product_api_links (product_type, product_key, api_source_id, priority, active) VALUES ($1, $2, $3, $4, 1) RETURNING *',
    [productType, productKey, apiSourceId, priority]
  );
  return res.rows[0];
}

async function updateProductApiLink(id, data) {
  const fields = Object.keys(data).map((f, i) => `${f} = $${i + 2}`);
  const values = Object.values(data);
  const res = await pool.query(
    `UPDATE product_api_links SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
    [id, ...values]
  );
  return res.rows[0] || null;
}

async function removeProductApiLink(id) {
  await pool.query('UPDATE product_api_links SET active = 0 WHERE id = $1', [id]);
}

async function getActiveApiForProduct(productType, productKey) {
  const res = await pool.query(
    `SELECT pal.*, apis.* FROM product_api_links pal JOIN api_sources apis ON pal.api_source_id = apis.id 
     WHERE pal.product_type = $1 AND pal.product_key = $2 AND pal.active = 1 AND apis.is_active = 1 
     ORDER BY pal.priority ASC LIMIT 1`,
    [productType, productKey]
  );
  return res.rows[0] || null;
}

// ==================== VPN ====================
async function getVpnSubscription(userId) {
  const res = await pool.query(
    "SELECT * FROM vpn_subscriptions WHERE user_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1",
    [String(userId)]
  );
  return res.rows[0] || null;
}

async function createVpnSubscription(userId, days = 30, dataLimit = 5 * 1024 * 1024 * 1024) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);
  const trackingCode = 'VPN-' + Math.floor(100000 + Math.random() * 900000);
  const res = await pool.query(
    'INSERT INTO vpn_subscriptions (user_id, status, expires_at, data_limit, tracking_code, created_at) VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *',
    [String(userId), 'active', expiresAt.toISOString(), dataLimit, trackingCode]
  );
  return res.rows[0];
}

// ==================== bot_texts ====================
async function getAllBotTexts(category = null) {
  let query = 'SELECT * FROM bot_texts';
  const params = [];
  if (category) { query += ' WHERE category = $1'; params.push(category); }
  query += ' ORDER BY category, key ASC';
  const res = await pool.query(query, params);
  return res.rows;
}

async function getBotTextByKey(key) {
  const res = await pool.query('SELECT * FROM bot_texts WHERE key = $1', [key]);
  return res.rows[0] || null;
}

async function searchBotTexts(searchTerm) {
  const res = await pool.query(
    "SELECT * FROM bot_texts WHERE key ILIKE $1 OR value ILIKE $1 ORDER BY category, key ASC",
    [`%${searchTerm}%`]
  );
  return res.rows;
}

async function updateBotText(key, value) {
  const res = await pool.query(
    'UPDATE bot_texts SET value = $2, updated_at = NOW() WHERE key = $1 RETURNING *',
    [key, value]
  );
  return res.rows[0] || null;
}

async function getBotTextCategories() {
  const res = await pool.query('SELECT DISTINCT category FROM bot_texts ORDER BY category ASC');
  return res.rows.map(r => r.category);
}

// ==================== ادمین‌ها ====================
async function getAllAdmins() {
  const res = await pool.query('SELECT * FROM admins WHERE is_active = TRUE ORDER BY created_at DESC');
  return res.rows;
}

async function getAdmin(telegramId) {
  const res = await pool.query('SELECT * FROM admins WHERE telegram_id = $1 AND is_active = TRUE', [String(telegramId)]);
  return res.rows[0] || null;
}

async function addAdmin(telegramId, level = 1, name = '') {
  const res = await pool.query(
    'INSERT INTO admins (telegram_id, level, name, is_active, created_at) VALUES ($1, $2, $3, TRUE, NOW()) ON CONFLICT (telegram_id) DO UPDATE SET level = EXCLUDED.level, name = EXCLUDED.name, is_active = TRUE RETURNING *',
    [String(telegramId), level, name]
  );
  return res.rows[0];
}

async function removeAdmin(telegramId) {
  await pool.query('UPDATE admins SET is_active = FALSE WHERE telegram_id = $1', [String(telegramId)]);
}

async function updateAdminLevel(telegramId, level) {
  const res = await pool.query(
    'UPDATE admins SET level = $2 WHERE telegram_id = $1 RETURNING *',
    [String(telegramId), level]
  );
  return res.rows[0] || null;
}

// ==================== هوش مصنوعی (Gemini) ====================
async function getAiConfig(key, defaultValue = null) {
  const res = await pool.query('SELECT value FROM ai_config WHERE key = $1', [key]);
  return res.rows[0] ? res.rows[0].value : defaultValue;
}

async function setAiConfig(key, value) {
  await pool.query(
    'INSERT INTO ai_config (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()',
    [key, value]
  );
}

async function getAllAiConfig() {
  const res = await pool.query('SELECT * FROM ai_config ORDER BY key ASC');
  const config = {};
  for (const row of res.rows) {
    config[row.key] = row.value;
  }
  return config;
}

// ==================== ارسال نرخ به کانال ====================
async function sendRatesToChannel(bot) {
  const channels = await getRequiredChannels();
  if (channels.length === 0) return;
  const products = await getProducts(true);
  const rate = await getUsdRate();
  const sellProducts = await getSellProducts(true);
  const usdRate = Number(rate).toLocaleString('en-US');

  let message = `📊 **نرخ‌های امروز ووچینو⁰¹**\n\n💰 **نرخ دلار:** ${usdRate.toLocaleString('en-US')} تومان\n\n🛍 **محصولات قابل خرید:**\n`;
  for (const p of products) {
    const price = p.price_type === 'usd' ? Number(p.min_amount) * rate : Number(p.min_amount);
    message += `• ${p.name}: ${price.toLocaleString('en-US')} تومان\n`;
  }

  message += '\n🔄 **محصولات قابل فروش:**\n';
  for (const p of sellProducts) {
    message += `• ${p.name}: ${Number(p.unit_price).toLocaleString('en-US')} تومان\n`;
  }

  message += `\n📌 @Vochino01_bot`;
  for (const ch of channels) {
    try { await bot.telegram.sendMessage(ch.chat_id, message, { parse_mode: 'Markdown' }); } catch (e) {}
  }
}

// ==================== مقداردهی اولیه ====================
async function initDb() {
  const tables = [
    `CREATE TABLE IF NOT EXISTS users (
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
      is_blocked BOOLEAN DEFAULT FALSE,
      reg_bonus_received BOOLEAN DEFAULT FALSE,
      first_purchase_bonus_received BOOLEAN DEFAULT FALSE,
      ref_bonus_count INTEGER DEFAULT 0,
      bonus_gift_received BOOLEAN DEFAULT FALSE,
      onboarding_completed BOOLEAN DEFAULT FALSE
    );`,
    `CREATE TABLE IF NOT EXISTS cards (
      id SERIAL PRIMARY KEY,
      telegram_id TEXT REFERENCES users(telegram_id),
      card_number TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );`,
    `CREATE TABLE IF NOT EXISTS wallet_requests (
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
    );`,
    `CREATE TABLE IF NOT EXISTS required_channels (
      id SERIAL PRIMARY KEY,
      chat_id TEXT UNIQUE,
      invite_link TEXT,
      title TEXT,
      active INTEGER DEFAULT 1,
      force_join_enabled INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT NOW()
    );`,
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TIMESTAMP DEFAULT NOW()
    );`,
    `CREATE TABLE IF NOT EXISTS bonuses (
      id SERIAL PRIMARY KEY,
      telegram_id TEXT REFERENCES users(telegram_id),
      status TEXT CHECK (status IN ('available', 'in_progress', 'used_won', 'used_lost')),
      amount INTEGER,
      game_type TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );`,
    `CREATE TABLE IF NOT EXISTS orders (
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
    );`,
    `CREATE TABLE IF NOT EXISTS products (
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
    );`,
    `CREATE TABLE IF NOT EXISTS sell_products (
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
    );`,
    `CREATE TABLE IF NOT EXISTS sell_orders (
      id SERIAL PRIMARY KEY,
      telegram_id TEXT REFERENCES users(telegram_id),
      product_type TEXT,
      voucher_code TEXT,
      amount INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending_review',
      created_at TIMESTAMP DEFAULT NOW(),
      tracking_code TEXT UNIQUE
    );`,
    `CREATE TABLE IF NOT EXISTS api_sources (
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
    );`,
    `CREATE TABLE IF NOT EXISTS product_api_links (
      id SERIAL PRIMARY KEY,
      product_type TEXT CHECK (product_type IN ('buy', 'sell')) NOT NULL,
      product_key TEXT NOT NULL,
      api_source_id INTEGER REFERENCES api_sources(id),
      priority INTEGER DEFAULT 1,
      active INTEGER DEFAULT 1
    );`,
    `CREATE TABLE IF NOT EXISTS coupons (
      id SERIAL PRIMARY KEY,
      code TEXT UNIQUE,
      type TEXT CHECK (type IN ('discount', 'gift')),
      amount INTEGER,
      usage_limit INTEGER DEFAULT 1,
      used_count INTEGER DEFAULT 0,
      expires_at TIMESTAMP,
      active INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT NOW()
    );`,
    `CREATE TABLE IF NOT EXISTS tickets (
      id SERIAL PRIMARY KEY,
      telegram_id TEXT REFERENCES users(telegram_id),
      subject TEXT,
      message TEXT,
      status TEXT DEFAULT 'open',
      admin_response TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );`,
    `CREATE TABLE IF NOT EXISTS transaction_logs (
      id SERIAL PRIMARY KEY,
      telegram_id TEXT REFERENCES users(telegram_id),
      type TEXT CHECK (type IN ('buy', 'sell', 'deposit', 'withdraw', 'transfer', 'bonus', 'gift', 'refund')),
      amount INTEGER,
      balance_before INTEGER,
      balance_after INTEGER,
      tracking_code TEXT,
      description TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );`,
    `CREATE TABLE IF NOT EXISTS vpn_servers (
      id SERIAL PRIMARY KEY,
      name TEXT,
      host TEXT,
      port INTEGER,
      protocol TEXT,
      ip_slot TEXT DEFAULT 'default',
      created_at TIMESTAMP DEFAULT NOW(),
      config_text TEXT,
      priority INTEGER DEFAULT 1,
      consecutive_failures INTEGER DEFAULT 0,
      last_checked_at TIMESTAMP,
      cool_down_until TIMESTAMP,
      is_active BOOLEAN DEFAULT TRUE,
      health_status TEXT DEFAULT 'unknown'
    );`,
    `CREATE TABLE IF NOT EXISTS vpn_subscriptions (
      id SERIAL PRIMARY KEY,
      user_id TEXT REFERENCES users(telegram_id),
      status TEXT DEFAULT 'active',
      expires_at TIMESTAMP,
      data_limit BIGINT DEFAULT 5368709120,
      data_used BIGINT DEFAULT 0,
      tracking_code TEXT UNIQUE,
      created_at TIMESTAMP DEFAULT NOW()
    );`,
    // ==================== جداول جدید اضافه شده ====================
    `CREATE TABLE IF NOT EXISTS bot_texts (
      key TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      value TEXT NOT NULL,
      description TEXT DEFAULT '',
      updated_at TIMESTAMP DEFAULT NOW()
    );`,
    `CREATE TABLE IF NOT EXISTS admins (
      id SERIAL PRIMARY KEY,
      telegram_id TEXT UNIQUE NOT NULL,
      level INTEGER DEFAULT 1,
      name TEXT DEFAULT '',
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW()
    );`,
    `CREATE TABLE IF NOT EXISTS ai_config (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TIMESTAMP DEFAULT NOW()
    );`
  ];

  for (const sql of tables) {
    try { await pool.query(sql); } catch (e) { console.log('خطا در ایجاد جدول:', e.message); }
  }

  // ==================== اصلاح ستون‌های missing ====================
  const alterQueries = [
    // users
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS card_number TEXT',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS language TEXT DEFAULT \'fa\'',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS balance INTEGER DEFAULT 0',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS bonus_balance INTEGER DEFAULT 0',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS registered_at TIMESTAMP DEFAULT NOW()',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS referrer_id TEXT',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT \'none\'',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS card_photo_id TEXT',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS national_card_photo_id TEXT',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS reg_bonus_received BOOLEAN DEFAULT FALSE',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS first_purchase_bonus_received BOOLEAN DEFAULT FALSE',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS ref_bonus_count INTEGER DEFAULT 0',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS bonus_gift_received BOOLEAN DEFAULT FALSE',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE',

    // settings
    'ALTER TABLE settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()',

    // required_channels
    'ALTER TABLE required_channels ADD COLUMN IF NOT EXISTS force_join_enabled INTEGER DEFAULT 1',

    // products
    'ALTER TABLE products ADD COLUMN IF NOT EXISTS max_amount NUMERIC DEFAULT 0',
    'ALTER TABLE products ADD COLUMN IF NOT EXISTS price_type TEXT DEFAULT \'toman\'',
    'ALTER TABLE products ADD COLUMN IF NOT EXISTS commission_type TEXT DEFAULT \'none\'',
    'ALTER TABLE products ADD COLUMN IF NOT EXISTS commission_value NUMERIC DEFAULT 0',
    'ALTER TABLE products ADD COLUMN IF NOT EXISTS manual_delivery INTEGER DEFAULT 1',
    'ALTER TABLE products ADD COLUMN IF NOT EXISTS active INTEGER DEFAULT 1',
    'ALTER TABLE products ADD COLUMN IF NOT EXISTS hidden INTEGER DEFAULT 0',
    'ALTER TABLE products ADD COLUMN IF NOT EXISTS api_source_id INTEGER',

    // sell_products
    'ALTER TABLE sell_products ADD COLUMN IF NOT EXISTS sample_code TEXT',
    'ALTER TABLE sell_products ADD COLUMN IF NOT EXISTS commission_type TEXT DEFAULT \'none\'',
    'ALTER TABLE sell_products ADD COLUMN IF NOT EXISTS commission_value NUMERIC DEFAULT 0',
    'ALTER TABLE sell_products ADD COLUMN IF NOT EXISTS active INTEGER DEFAULT 1',
    'ALTER TABLE sell_products ADD COLUMN IF NOT EXISTS api_source_id INTEGER',

    // orders
    'ALTER TABLE orders ADD COLUMN IF NOT EXISTS commission INTEGER DEFAULT 0',
    'ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_code TEXT',
    'ALTER TABLE orders ADD COLUMN IF NOT EXISTS provider_tx_id TEXT',
    'ALTER TABLE orders ADD COLUMN IF NOT EXISTS voucher_code TEXT',

    // sell_orders
    'ALTER TABLE sell_orders ADD COLUMN IF NOT EXISTS amount INTEGER DEFAULT 0',
    'ALTER TABLE sell_orders ADD COLUMN IF NOT EXISTS tracking_code TEXT',
    'ALTER TABLE sell_orders ADD COLUMN IF NOT EXISTS commission INTEGER DEFAULT 0',
    'ALTER TABLE sell_orders ADD COLUMN IF NOT EXISTS reject_reason TEXT',

    // orders (تکمیلی)
    'ALTER TABLE orders ADD COLUMN IF NOT EXISTS reject_reason TEXT',

    // wallet_requests
    'ALTER TABLE wallet_requests ADD COLUMN IF NOT EXISTS card_number TEXT',
    'ALTER TABLE wallet_requests ADD COLUMN IF NOT EXISTS receipt_file_id TEXT',
    'ALTER TABLE wallet_requests ADD COLUMN IF NOT EXISTS target_user_id TEXT',
    'ALTER TABLE wallet_requests ADD COLUMN IF NOT EXISTS tracking_code TEXT',
    'ALTER TABLE wallet_requests ADD COLUMN IF NOT EXISTS reject_reason TEXT',

    // api_sources
    'ALTER TABLE api_sources ADD COLUMN IF NOT EXISTS supports_products TEXT[]',
    'ALTER TABLE api_sources ADD COLUMN IF NOT EXISTS is_active INTEGER DEFAULT 1',
    'ALTER TABLE api_sources ADD COLUMN IF NOT EXISTS is_multi INTEGER DEFAULT 0',
    'ALTER TABLE api_sources ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 1',
    'ALTER TABLE api_sources ADD COLUMN IF NOT EXISTS ip_slot TEXT DEFAULT \'default\'',

    // tickets
    'ALTER TABLE tickets ADD COLUMN IF NOT EXISTS admin_response TEXT',
    'ALTER TABLE tickets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()',

    // transaction_logs
    'ALTER TABLE transaction_logs ADD COLUMN IF NOT EXISTS balance_before INTEGER',
    'ALTER TABLE transaction_logs ADD COLUMN IF NOT EXISTS balance_after INTEGER',
    'ALTER TABLE transaction_logs ADD COLUMN IF NOT EXISTS tracking_code TEXT',
    'ALTER TABLE transaction_logs ADD COLUMN IF NOT EXISTS description TEXT',

    // vpn_servers
    'ALTER TABLE vpn_servers ADD COLUMN IF NOT EXISTS port INTEGER',
    'ALTER TABLE vpn_servers ADD COLUMN IF NOT EXISTS protocol TEXT',
    'ALTER TABLE vpn_servers ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE',
    'ALTER TABLE vpn_servers ADD COLUMN IF NOT EXISTS health_status TEXT DEFAULT \'unknown\'',
    'ALTER TABLE vpn_servers ADD COLUMN IF NOT EXISTS config_text TEXT',
    'ALTER TABLE vpn_servers ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 1',
    'ALTER TABLE vpn_servers ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER DEFAULT 0',
    'ALTER TABLE vpn_servers ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMP',
    'ALTER TABLE vpn_servers ADD COLUMN IF NOT EXISTS cool_down_until TIMESTAMP',

    // vpn_subscriptions
    'ALTER TABLE vpn_subscriptions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT \'active\'',
    'ALTER TABLE vpn_subscriptions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP',
    'ALTER TABLE vpn_subscriptions ADD COLUMN IF NOT EXISTS data_limit BIGINT DEFAULT 5368709120',
    'ALTER TABLE vpn_subscriptions ADD COLUMN IF NOT EXISTS data_used BIGINT DEFAULT 0',
    'ALTER TABLE vpn_subscriptions ADD COLUMN IF NOT EXISTS tracking_code TEXT UNIQUE',

    // bot_texts (جدید)
    'ALTER TABLE bot_texts ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT \'general\'',
    'ALTER TABLE bot_texts ADD COLUMN IF NOT EXISTS value TEXT NOT NULL DEFAULT \'\'',
    'ALTER TABLE bot_texts ADD COLUMN IF NOT EXISTS description TEXT DEFAULT \'\'',
    'ALTER TABLE bot_texts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()',

    // admins (جدید)
    'ALTER TABLE admins ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1',
    'ALTER TABLE admins ADD COLUMN IF NOT EXISTS name TEXT DEFAULT \'\'',
    'ALTER TABLE admins ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE',

    // ai_config (جدید)
    'ALTER TABLE ai_config ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()'
  ];

  for (const sql of alterQueries) {
    try { await pool.query(sql); } catch (e) { console.log('خطا در افزودن ستون:', e.message); }
  }

  // --- تنظیمات پیش‌فرض ---
  try {
    await pool.query(`
      INSERT INTO settings (key, value, updated_at) VALUES 
        ('usd_rate', '60000', NOW()),
        ('start_reaction', '🎉', NOW()),
        ('buy_margin', '10', NOW()),
        ('sell_margin', '10', NOW()),
        ('buy_mode', 'MANUAL', NOW()),
        ('sell_mode', 'MANUAL', NOW()),
        ('referral_bonus', '5000', NOW()),
        ('referral_enabled', 'true', NOW()),
        ('game_rtp', '50', NOW()),
        ('game_require_purchase', 'true', NOW()),
        ('force_join_enabled', 'true', NOW()),
        ('disableBalanceGame', 'false', NOW()),
        ('disableBonusGame', 'false', NOW()),
        ('winRateBalance', '50', NOW()),
        ('winRateBonus', '50', NOW()),
        ('gameMultiplier', '2', NOW()),
        ('minPurchaseForGame', '0', NOW()),
        ('min_withdraw', '100000', NOW()),
        ('vpn_enabled', 'true', NOW()),
        ('vpn_visible', 'true', NOW()),
        ('vpn_max_free_attempts', '1', NOW()),
        ('vpn_invites_for_unlock', '2', NOW()),
        ('vpn_default_volume_gb', '5', NOW()),
        ('vpn_default_days', '30', NOW()),
        ('vpn_health_interval', '300', NOW()),
        ('vpn_failure_threshold', '3', NOW()),
        ('vpn_cooldown', '600', NOW()),
        ('bonus_first_purchase_active', 'false', NOW()),
        ('bonus_first_purchase_min_amount', '0', NOW()),
        ('bonus_first_purchase_gift', '0', NOW()),
        ('bonus_first_purchase_activated_at', NULL, NOW()),
        ('bonus_registration_active', 'false', NOW()),
        ('bonus_registration_gift', '0', NOW()),
        ('bonus_registration_activated_at', NULL, NOW()),
        ('bonus_referral_active', 'false', NOW()),
        ('bonus_referral_threshold', '1', NOW()),
        ('bonus_referral_gift', '0', NOW()),
        ('bonus_referral_activated_at', NULL, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `);
  } catch (e) { console.log('خطا در تنظیمات پیش‌فرض:', e.message); }

  // --- کانال پیش‌فرض ---
  try {
    const existingChannel = await pool.query('SELECT chat_id FROM required_channels WHERE chat_id = $1', ['-1003953090902']);
    if (existingChannel.rows.length === 0) {
      await pool.query(
        `INSERT INTO required_channels (chat_id, invite_link, title, active, force_join_enabled) 
         VALUES ('-1003953090902', 'https://t.me/+DpU8DAaQei00YTFk', 'کانال اصلی', 1, 1)`
      );
    }
  } catch (e) { console.log('خطا در کانال پیش‌فرض:', e.message); }

  // --- محصولات پیش‌فرض ---
  const buyProducts = [
    { key: 'voucher', name: '🎟 یوووچر', min_amount: 1, price_type: 'usd', active: 1, hidden: 0 },
    { key: 'hotvoucher', name: '🎟 هات ووچر', min_amount: 50000, price_type: 'toman', active: 1, hidden: 0 },
    { key: 'premium_voucher', name: '🎟 پرمیوم ووچر', min_amount: 100000, price_type: 'toman', active: 0, hidden: 1 },
    { key: 'ps_voucher', name: '🔵 پی‌اس ووچر', min_amount: 185081, price_type: 'toman', active: 0, hidden: 1 },
    { key: 'perfect_money', name: '💵 پرفکت مانی', min_amount: 1, price_type: 'usd', active: 0, hidden: 1 },
    { key: 'crypto_dollar', name: '💲 دلار (کریپتو)', min_amount: 10, price_type: 'usd', active: 0, hidden: 1 },
    { key: 'crypto_tron', name: '🪙 ترون (TRX)', min_amount: 100, price_type: 'toman', active: 0, hidden: 1 },
    { key: 'crypto_ton', name: '💎 تون (TON)', min_amount: 100, price_type: 'toman', active: 0, hidden: 1 },
    { key: 'telegram_stars', name: '⭐️ استارز تلگرام', min_amount: 50, price_type: 'toman', active: 0, hidden: 1 },
    { key: 'telegram_gift_stars', name: '🎁 گیفت استارزی', min_amount: 100, price_type: 'toman', active: 0, hidden: 1 },
    { key: 'telegram_gift_collection', name: '🎁 گیفت کلکسیونی', min_amount: 100, price_type: 'toman', active: 0, hidden: 1 },
    { key: 'telegram_premium', name: '💎 پرمیوم تلگرام', min_amount: 50000, price_type: 'toman', active: 0, hidden: 1 },
    { key: 'channel_boost', name: '🚀 بوست کانال', min_amount: 100000, price_type: 'toman', active: 0, hidden: 1 },
    { key: 'post_reaction', name: '❤️ ری‌اکشن پست', min_amount: 500, price_type: 'toman', active: 0, hidden: 1 },
    { key: 'post_view', name: '👁 بازدید پست', min_amount: 500, price_type: 'toman', active: 0, hidden: 1 },
    { key: 'virtual_number', name: '📱 شماره مجازی', min_amount: 50000, price_type: 'toman', active: 0, hidden: 1 }
  ];

  for (const p of buyProducts) {
    try {
      await pool.query(
        'INSERT INTO products (key, name, min_amount, price_type, active, hidden, created_at) VALUES ($1,$2,$3,$4,$5,$6,NOW()) ON CONFLICT (key) DO NOTHING',
        [p.key, p.name, p.min_amount, p.price_type, p.active, p.hidden]
      );
    } catch (e) {}
  }

  const sellProducts = [
    { key: 'uvoucher', name: '🎟 یوووچر', unit_price: 173031, sample_code: 'USD-7T3H-C2QG-P6YA-D4UW-XOIQ', active: 1 },
    { key: 'premiumvoucher', name: '🎟 پرمیوم ووچر', unit_price: 100000, sample_code: 'PSVouchers-1_58-PSV-7-67brrac0xo2llpu738e33sftpdog', active: 1 },
    { key: 'psvoucher', name: '🔵 پی‌اس ووچر', unit_price: 100000, sample_code: 'PS-4KF8-92AD-7QPW-XM2L', active: 1 },
    { key: 'hotvoucher_sell', name: '🎟 هات ووچر', unit_price: 50000, sample_code: 'HOT-XXXX-XXXX', active: 0 },
    { key: 'perfect_money_sell', name: '💵 پرفکت مانی', unit_price: 60000, sample_code: 'PM-XXXX', active: 0 }
  ];

  for (const p of sellProducts) {
    try {
      await pool.query(
        'INSERT INTO sell_products (key, name, unit_price, sample_code, active, created_at) VALUES ($1,$2,$3,$4,$5,NOW()) ON CONFLICT (key) DO NOTHING',
        [p.key, p.name, p.unit_price, p.sample_code, p.active]
      );
    } catch (e) {}
  }

  // --- متون پیش‌فرض bot_texts ---
  try {
    const cnt = await pool.query('SELECT COUNT(*)::int AS c FROM bot_texts');
    if (cnt.rows[0].c === 0) {
      const defaults = require('./textDefaults');
      for (const t of defaults) {
        await pool.query(
          'INSERT INTO bot_texts (key, category, value, description) VALUES ($1, $2, $3, $4) ON CONFLICT (key) DO NOTHING',
          [t.key, t.category, t.value, t.description || '']
        );
      }
      console.log('✅ متون پیش‌فرض bot_texts درج شد');
    }
  } catch (e) { console.log('خطا در درج متون پیش‌فرض:', e.message); }

  console.log('✅ دیتابیس اولیه‌سازی شد');
}

module.exports = {
  pool,
  getUser,
  getUserById,
  createUser,
  updateUser,
  getAllUsers,
  getReferrals,
  getUserStats,
  getUserCards,
  getRequiredChannels,
  addChannel,
  updateChannel,
  deleteChannel,
  checkMembership,
  getSetting,
  setSetting,
  getUsdRate,
  getProducts,
  getProductByKey,
  addProduct,
  updateProduct,
  deleteProduct,
  getSellProducts,
  getSellProductByKey,
  addSellProduct,
  updateSellProduct,
  deleteSellProduct,
  getCoupon,
  useCoupon,
  addCoupon,
  deleteCoupon,
  getTickets,
  addTicket,
  updateTicket,
  initDb,
  logTransaction,
  getTransactionLogs,
  getApiSources,
  getAllApiSources,
  getApiSourceById,
  addApiSource,
  updateApiSource,
  deleteApiSource,
  getProductApiLinks,
  getAllProductApiLinks,
  addProductApiLink,
  updateProductApiLink,
  removeProductApiLink,
  getActiveApiForProduct,
  getVpnSubscription,
  createVpnSubscription,
  getAllBotTexts,
  getBotTextByKey,
  searchBotTexts,
  updateBotText,
  getBotTextCategories,
  sendRatesToChannel,
  // توابع جدید اضافه شده
  getAllAdmins,
  getAdmin,
  addAdmin,
  removeAdmin,
  updateAdminLevel,
  getAiConfig,
  setAiConfig,
  getAllAiConfig
};
