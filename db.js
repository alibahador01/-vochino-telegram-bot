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
  const user = await getUser(telegramId);
  const extraRes = await pool.query('SELECT * FROM cards WHERE telegram_id = $1', [String(telegramId)]);
  const list = [];
  if (user && user.card_number) {
    list.push({ card_number: user.card_number });
  }
  extraRes.rows.forEach(function (c) { list.push({ card_number: c.card_number }); });
  return list;
}

module.exports = {
  pool,
  getUser,
  getUserCards
};
