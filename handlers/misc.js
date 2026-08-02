const texts = require('../texts');
const { sessions, showMainMenu } = require('../utils');
const { pool, getUser } = require('../db');

module.exports = function registerMiscHandlers(bot) {
  bot.action('back_main_menu', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    showMainMenu(ctx);
  });

  bot.action('cancel_flow', async (ctx) => {
    ctx.answerCbQuery();
    delete sessions[ctx.from.id];
    try {
      await ctx.deleteMessage();
    } catch (e) {}
    showMainMenu(ctx);
  });

  bot.action('menu_referral', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    ctx.reply('به‌زودی 🙂');
  });

  bot.action('menu_profile', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    const t = texts.fa;
    const user = await getUser(ctx.from.id);
    if (!user) {
      ctx.reply('اطلاعاتی برای شما ثبت نشده.');
      return;
    }
    ctx.reply(
      t.profileTitle + '\n\n' +
      '👤 نام: ' + (user.full_name || '-') + '\n' +
      '📱 شماره تلفن: ' + (user.phone || '-') + '\n' +
      '💳 شماره کارت: ' + (user.card_number || '-') + '\n' +
      '💰 موجودی: ' + Number(user.balance).toLocaleString('en-US') + ' تومان',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 بازگشت به منوی اصلی', callback_data: 'back_main_menu', style: 'danger' }]
          ]
        }
      }
    );
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

  bot.action('menu_support', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    const t = texts.fa;
    ctx.reply(t.supportTitle, {
      reply_markup: {
        inline_keyboard: [
          [{ text: t.supportFaqButton, callback_data: 'support_faq', style: 'primary' }],
          [{ text: t.supportContactButton, callback_data: 'support_contact', style: 'primary' }]
        ]
      }
    });
  });

  bot.action('support_faq', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    ctx.reply(texts.fa.faqText);
  });

  bot.action('support_contact', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    ctx.reply(texts.fa.supportContactText);
  });

  bot.action('menu_rules_education', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    ctx.reply(texts.fa.rulesText + '\n\n📚 آموزش استفاده از ربات به‌زودی همینجا قرار می‌گیره.');
  });

  bot.action('menu_rules', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    ctx.reply(texts.fa.rulesText);
  });

  bot.action('menu_education', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    ctx.reply('📚 آموزش استفاده از ربات به‌زودی همینجا قرار می‌گیره.');
  });

  // این هندلر آخر ثبت می‌شه: هر دکمه‌ی menu_ که هیچ‌کدوم از هندلرهای بالا جوابش رو نداده باشه، اینجا می‌گیریمش
  bot.action(/^menu_.+/, async (ctx) => {
    const actionKey = ctx.match[0];
    const known = ['menu_wallet', 'menu_referral', 'menu_profile', 'menu_invoices', 'menu_support', 'menu_game', 'menu_rules', 'menu_education', 'menu_rules_education', 'menu_buy', 'menu_sell'];
    if (known.indexOf(actionKey) !== -1) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    ctx.reply('این بخش به‌زودی تکمیل می‌شود 🛠');
  });
};
