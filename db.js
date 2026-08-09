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

async function getUserCards(telegramId) {
  const user = await getUser(telegramId);
  const extraRes = await pool.query('SELECT * FROM cards WHERE telegram_id = $1', [String(telegramId)]);
  const list = [];
  if (user && user.card_number) {
    list.push({ card_number: user.card_number });
  }
  extraRes.rows.forEach(c => list.push({ card_number: c.card_number }));
  return list;
}

async function getRequiredChannels() {
  const res = await pool.query('SELECT * FROM required_channels WHERE active = 1');
  return res.rows;
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

async function addChannel(chatId, inviteLink, title) {
  const res = await pool.query(
    'INSERT INTO required_channels (chat_id, invite_link, title, active, force_join_enabled) VALUES ($1, $2, $3, 1, 1) RETURNING *',
    [chatId, inviteLink, title]
  );
  return res.rows[0];
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
  
  const existing = await pool.query('SELECT * FROM bonuses WHERE telegram_id = $1', [String(telegramId)]);
  if (existing.rows.length > 0) return;
  
  await pool.query(
    'INSERT INTO bonuses (telegram_id, status, amount, created_at) VALUES ($1, $2, $3, NOW())',
    [String(telegramId), 'available', BONUS_AMOUNT]
  );
}

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
  const rate = await getSetting('usd_rate', DEFAULT_USD_RATE);
  return Number(rate);
}

async function getApiSources() {
  const res = await pool.query('SELECT * FROM api_sources WHERE is_active = 1 ORDER BY priority ASC');
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
  const fields = Object.keys(data).map((key, i) => `${key} = $${i + 2}`);
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

async function getProducts(activeOnly = true) {
  let query = 'SELECT * FROM products WHERE hidden = 0';
  if (activeOnly) {
    query += ' AND active = 1';
  }
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
  const fields = Object.keys(data).map((field, i) => `${field} = $${i + 2}`);
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

async function getSellProducts(activeOnly = true) {
  let query = 'SELECT * FROM sell_products';
  if (activeOnly) {
    query += ' WHERE active = 1';
  }
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
  const fields = Object.keys(data).map((field, i) => `${field} = $${i + 2}`);
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

async function getAllUsers(includeUnregistered = true) {
  let query = 'SELECT telegram_id, full_name, phone, balance, bonus_balance, registered_at, verification_status FROM users';
  if (!includeUnregistered) {
    query += " WHERE full_name IS NOT NULL AND phone IS NOT NULL AND card_number IS NOT NULL";
  }
  const res = await pool.query(query);
  return res.rows;
}

async function getReferrals(telegramId) {
  const res = await pool.query('SELECT COUNT(*) AS count FROM users WHERE referrer_id = $1', [String(telegramId)]);
  return Number(res.rows[0].count);
}

async function getUserStats() {
  const total = await pool.query('SELECT COUNT(*) AS count FROM users');
  const registered = await pool.query("SELECT COUNT(*) AS count FROM users WHERE full_name IS NOT NULL AND phone IS NOT NULL AND card_number IS NOT NULL");
  const balance = await pool.query('SELECT COALESCE(SUM(balance), 0) AS total FROM users');
  const bonus = await pool.query('SELECT COALESCE(SUM(bonus_balance), 0) AS total FROM users');
  return {
    totalUsers: Number(total.rows[0].count),
    registeredUsers: Number(registered.rows[0].count),
    totalBalance: Number(balance.rows[0].total),
    totalBonus: Number(bonus.rows[0].total)
  };
}

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

async function getTickets(telegramId = null) {
  let query = 'SELECT * FROM tickets';
  const params = [];
  if (telegramId) {
    query += ' WHERE telegram_id = $1';
    params.push(String(telegramId));
  }
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
  const fields = Object.keys(data).map((field, i) => `${field} = $${i + 2}`);
  const values = Object.values(data);
  const res = await pool.query(
    `UPDATE tickets SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id, ...values]
  );
  return res.rows[0] || null;
}

async function logTransaction(telegramId, type, amount, description = '') {
  const user = await getUser(telegramId);
  const balanceBefore = user ? Number(user.balance) : 0;
  
  const res = await pool.query(
    'INSERT INTO transaction_logs (telegram_id, type, amount, balance_before, balance_after, description, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *',
    [String(telegramId), type, amount, balanceBefore, balanceBefore + amount, description]
  );
  return res.rows[0];
}

async function getTransactionLogs(telegramId, limit = 10) {
  const res = await pool.query(
    'SELECT * FROM transaction_logs WHERE telegram_id = $1 ORDER BY created_at DESC LIMIT $2',
    [String(telegramId), limit]
  );
  return res.rows;
}

async function sendRatesToChannel(bot) {
  const channels = await getRequiredChannels();
  if (channels.length === 0) return;
  
  const products = await getProducts(true);
  const rate = await getUsdRate();
  
  let message = '📊 **نرخ‌های امروز ووچینو⁰¹**\n\n';
  message += '💰 **نرخ دلار:** ' + Number(rate).toLocaleString('en-US') + ' تومان\n\n';
  message += '🛍 **محصولات قابل خرید:**\n';
  
  for (const product of products) {
    const price = product.price_type === 'usd' 
      ? Number(product.min_amount) * rate 
      : Number(product.min_amount);
    message += '• ' + product.name + ': ' + Number(price).toLocaleString('en-US') + ' تومان\n';
  }
  
  message += '\n🔄 **محصولات قابل فروش:**\n';
  const sellProducts = await getSellProducts(true);
  for (const product of sellProducts) {
    message += '• ' + product.name + ': ' + Number(product.unit_price).toLocaleString('en-US') + ' تومان\n';
  }
  
  message += '\n📌 برای خرید و فروش به ربات مراجعه کنید: @Vochino01_bot';
  
  for (const channel of channels) {
    try {
      await bot.telegram.sendMessage(channel.chat_id, message, { parse_mode: 'Markdown' });
    } catch (e) {
      console.log('خطا در ارسال نرخ به کانال: ' + e.message);
    }
  }
}

async function initDb() {
  console.log('✅ دیتابیس با موفقیت مقداردهی اولیه شد');
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
  updateChannel,
  addChannel,
  deleteChannel,
  checkMembership,
  
  getUserTotalPurchases,
  getActiveBonus,
  grantBonusIfEligible,
  
  getSetting,
  setSetting,
  getUsdRate,
  
  getApiSources,
  getApiSourceById,
  addApiSource,
  updateApiSource,
  deleteApiSource,
  
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
  
  logTransaction,
  getTransactionLogs,
  
  sendRatesToChannel,
  
  initDb
};
