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
  await pool.query('ALTER TABLE sell_orders ADD COLUMN IF NOT EXISTS product_type TEXT');

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
