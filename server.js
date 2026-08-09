const express = require('express');
const path = require('path');
const { pool } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/sub/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const user = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [userId]);

    if (!user.rows[0]) {
      return res.status(404).send('کاربر یافت نشد.');
    }

    const vpnService = await pool.query(
      'SELECT * FROM vpn_subscriptions WHERE user_id = $1 AND status = $2 ORDER BY created_at DESC LIMIT 1',
      [userId, 'active']
    );

    let subscriptionData = null;
    let daysLeft = 0;
    let dataUsed = 0;
    let dataLimit = 5 * 1024 * 1024 * 1024;

    if (vpnService.rows[0]) {
      const sub = vpnService.rows[0];
      const now = new Date();
      const expiry = new Date(sub.expires_at);
      daysLeft = Math.max(0, Math.ceil((expiry - now) / (1000 * 60 * 60 * 24)));
      dataUsed = sub.data_used || 0;
      subscriptionData = sub;
    }

    const totalUsers = await pool.query('SELECT COUNT(*) AS count FROM users');
    const activeOrders = await pool.query("SELECT COUNT(*) AS count FROM orders WHERE status = 'completed' AND created_at > NOW() - INTERVAL '7 days'");

    res.render('subscription', {
      user: user.rows[0],
      subscription: subscriptionData,
      daysLeft: daysLeft,
      dataUsed: dataUsed,
      dataLimit: dataLimit,
      totalUsers: totalUsers.rows[0].count,
      activeOrders: activeOrders.rows[0].count,
      baseUrl: process.env.BASE_URL || 'https://yourdomain.com'
    });
  } catch (error) {
    console.error('Error in /sub/:userId:', error);
    res.status(500).send('خطای داخلی سرور');
  }
});

app.get('/api/vpn/status/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const result = await pool.query(
      'SELECT * FROM vpn_subscriptions WHERE user_id = $1 AND status = $2 ORDER BY created_at DESC LIMIT 1',
      [userId, 'active']
    );

    if (!result.rows[0]) {
      return res.json({ success: false, message: 'سرویس فعالی یافت نشد.' });
    }

    const sub = result.rows[0];
    const now = new Date();
    const expiry = new Date(sub.expires_at);
    const daysLeft = Math.max(0, Math.ceil((expiry - now) / (1000 * 60 * 60 * 24)));
    const dataUsed = sub.data_used || 0;
    const dataLimit = 5 * 1024 * 1024 * 1024;

    res.json({
      success: true,
      daysLeft: daysLeft,
      dataUsed: dataUsed,
      dataLimit: dataLimit,
      isActive: daysLeft > 0 && dataUsed < dataLimit,
      subscription: sub
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/vpn/update', async (req, res) => {
  try {
    const { userId, dataUsed } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId required' });
    }

    await pool.query(
      'UPDATE vpn_subscriptions SET data_used = $1 WHERE user_id = $2 AND status = $3',
      [dataUsed || 0, userId, 'active']
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log('🌐 Web server running on port ' + PORT);
  console.log('📌 Subscription page: ' + (process.env.BASE_URL || 'http://localhost:' + PORT) + '/sub/{USER_ID}');
});

module.exports = app;
