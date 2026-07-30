const { pool, getUser } = require('../db');
const texts = require('../texts');

async function showWalletMenu(ctx) {
  const t = texts.fa;
  const user = await getUser(ctx.from.id);
  const balance = user ? user.balance : 0;
  ctx.reply(t.walletTitle + '\n\n' + t.walletBalance + Number(balance).toLocaleString('en-US') + ' تومان', {
    reply_markup: {
      inline_keyboard: [
        [{ text: t.walletIncrease, callback_data: 'wallet_deposit' }],
        [{ text: t.walletWithdraw, callback_data: 'wallet_withdraw' }],
        [{ text: t.walletAddCard, callback_data: 'wallet_addcard' }],
        [{ text: '🧾 گزارش تراکنش‌ها', callback_data: 'menu_invoices' }]
      ]
    }
  });
}

function registerWalletHandlers(bot) {
  bot.action('menu_wallet', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    await showWalletMenu(ctx);
  });

  bot.action('menu_invoices', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    const t = texts.fa;
    const walletRes = await pool.query(
      'SELECT id, type, amount, status, created_at FROM wallet_requests WHERE telegram_id = $1',
      [String(ctx.from.id)]
    );
    const ordersRes = await pool.query(
      'SELECT o.id, o.product_type, o.amount, o.status, o.created_at, p.name AS product_name ' +
      'FROM orders o LEFT JOIN products p ON p.key = o.product_type ' +
      'WHERE o.telegram_id = $1',
      [String(ctx.from.id)]
    );
    const sellRes = await pool.query(
      'SELECT s.id, s.product_type, s.amount, s.status, s.created_at, sp.name AS product_name ' +
      'FROM sell_orders s LEFT JOIN sell_products sp ON sp.key = s.product_type ' +
      'WHERE s.telegram_id = $1',
      [String(ctx.from.id)]
    );
    const combined = [];
    walletRes.rows.forEach(function (r) {
      combined.push({
        label: r.type === 'deposit' ? '➕ شارژ' : '💳 برداشت',
        amount: r.amount,
        status: r.status,
        created_at: r.created_at
      });
    });
    ordersRes.rows.forEach(function (r) {
      const productLabel = '🛒 خرید ' + (r.product_name || r.product_type);
      combined.push({
        label: productLabel,
        amount: r.amount,
        status: r.status,
        created_at: r.created_at
      });
    });
    sellRes.rows.forEach(function (r) {
      const productLabel = '🎟 فروش ' + (r.product_name || r.product_type);
      combined.push({
        label: productLabel,
        amount: r.amount,
        status: r.status,
        created_at: r.created_at
      });
    });
    combined.sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
    const latest = combined.slice(0, 10);
    if (latest.length === 0) {
      ctx.reply(t.invoicesTitle + '\n\n' + t.invoicesEmpty);
      return;
    }
    let message = t.invoicesTitle + '\n\n';
    latest.forEach(function (r) {
      const statusLabel = r.status === 'pending' || r.status === 'pending_review' ? '⏳ در انتظار' : (r.status === 'approved' || r.status === 'completed' ? '✅ انجام‌شده' : '❌ رد شده');
      const amountLabel = r.amount ? (Number(r.amount).toLocaleString('en-US') + ' تومان') : 'در انتظار تعیین مبلغ';
      message += r.label + ' | ' + amountLabel + ' | ' + statusLabel + '\n';
    });
    ctx.reply(message);
  });
}

module.exports = { registerWalletHandlers, showWalletMenu };
