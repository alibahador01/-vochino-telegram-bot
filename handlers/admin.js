const { pool, getUser } = require('../db');

const ADMIN_IDS = [123456789]; // ⚠️ آی‌دی عددی تلگرام خودت رو بگذار
const DEFAULT_USD_RATE = 60000;

function isAdmin(telegramId) {
  return ADMIN_IDS.indexOf(Number(telegramId)) !== -1;
}

async function showAdminMenu(ctx) {
  const pendingRes = await pool.query("SELECT COUNT(*) AS c FROM wallet_requests WHERE status = 'pending'");
  const pendingCount = pendingRes.rows[0].c;
  const pendingSellRes = await pool.query("SELECT COUNT(*) AS c FROM sell_orders WHERE status = 'pending_review'");
  const pendingSellCount = pendingSellRes.rows[0].c;
  
  ctx.reply('👑 پنل مدیریت پیشرفته\n\n' +
    '🔹 درخواست‌های کیف پول (شارژ/برداشت): ' + pendingCount + '\n' +
    '🔹 درخواست‌های فروش در انتظار: ' + pendingSellCount + '\n\n' +
    '📦 مدیریت محصولات فروش:\n' +
    '/addsellproduct کلید|نام|قیمت واحد|نمونه کد\n' +
    '/listsellproducts — دیدن محصولات فروش\n' +
    '/removesellproduct کلید — غیرفعال کردن ووچر فروش\n\n' +
    '🔎 جستجو با کد پیگیری:\n/find VOC-847392', {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '📥 درخواست‌های کیف پول', callback_data: 'admin_pending' }],
        [{ text: '🎟 درخواست‌های فروش در انتظار (' + pendingSellCount + ')', callback_data: 'admin_sell_pending' }]
      ]
    }
  });
}

function registerAdminCommands(bot, sessions) {
  bot.command('admin', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    await showAdminMenu(ctx);
  });

  // مشاهده درخواست‌های فروش
  bot.action('admin_sell_pending', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const pendingRes = await pool.query("SELECT * FROM sell_orders WHERE status = 'pending_review' ORDER BY id ASC");
    const pendingRequests = pendingRes.rows;

    if (pendingRequests.length === 0) {
      return ctx.reply('در حال حاضر هیچ درخواست فروشی در انتظار نیست ✅');
    }

    for (const req of pendingRequests) {
      const user = await getUser(req.telegram_id);
      const userName = user ? user.full_name : 'نامشخص';
      const productRes = await pool.query('SELECT name FROM sell_products WHERE key = $1', [req.product_type]);
      const productName = productRes.rows[0] ? productRes.rows[0].name : req.product_type;

      let message = '🎟 درخواست فروش جدید\n\n';
      message += '🆔 کد پیگیری: `' + req.tracking_code + '`\n';
      message += '👤 کاربر: ' + userName + ' (' + req.telegram_id + ')\n';
      message += '📦 محصول: ' + productName + '\n';
      message += '🔑 کد ووچر: `' + req.voucher_code + '`\n';

      const buttons = [
        [{ text: '✅ تایید و وارد کردن مبلغ واریزی', callback_data: 'admin_sell_approve_' + req.id }],
        [
          { text: '❌ رد درخواست', callback_data: 'admin_sell_reject_' + req.id },
          { text: '✉️ رد با توضیح', callback_data: 'admin_sell_reject_reason_' + req.id }
        ]
      ];

      await ctx.reply(message, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } });
    }
  });

  // کلیک ادمین روی تایید ووچر فروش
  bot.action(/^admin_sell_approve_(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    const requestId = ctx.match[1];

    sessions[ctx.from.id] = {
      flow: 'admin_sell_approve_flow',
      step: 'waiting_amount',
      requestId: requestId
    };

    ctx.reply('💰 لطفاً مبلغ نهایی واریزی به کیف پول کاربر را به تومان وارد کنید:\n(مثلاً: 245000)');
  });

  // کلیک ادمین روی رد با دلیل
  bot.action(/^admin_sell_reject_reason_(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    const requestId = ctx.match[1];

    sessions[ctx.from.id] = {
      flow: 'admin_sell_reject_flow',
      step: 'waiting_reason',
      requestId: requestId
    };

    ctx.reply('✍️ لطفاً دلیل رد این درخواست فروش را بنویسید (مستقیماً برای کاربر ارسال می‌شود):');
  });

  // رد سریع
  bot.action(/^admin_sell_reject_(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    const requestId = ctx.match[1];

    const reqRes = await pool.query('SELECT * FROM sell_orders WHERE id = $1', [requestId]);
    const request = reqRes.rows[0];

    if (!request || request.status !== 'pending_review') {
      return ctx.reply('این درخواست قبلاً بررسی شده است.');
    }

    await pool.query("UPDATE sell_orders SET status = 'rejected' WHERE id = $1", [requestId]);

    try {
      await bot.telegram.sendMessage(
        request.telegram_id,
        '❌ درخواست فروش شما با کد پیگیری ' + request.tracking_code + ' رد شد.'
      );
    } catch (e) {}

    ctx.reply('درخواست شماره ' + requestId + ' رد شد ❌');
  });

  // گرفتن ورودهای متنی ادمین (مبلغ تایید یا دلیل رد)
  bot.on('text', async (ctx, next) => {
    const session = sessions[ctx.from.id];
    if (!session) return next();

    // هندل واریز مبلغ نهایی و شارژ کیف پول کاربر
    if (session.flow === 'admin_sell_approve_flow' && session.step === 'waiting_amount') {
      const amount = parseInt(ctx.message.text.trim(), 10);
      if (isNaN(amount) || amount <= 0) {
        return ctx.reply('❌ لطفاً یک عدد معتبر به تومان وارد کنید:');
      }

      const reqRes = await pool.query('SELECT * FROM sell_orders WHERE id = $1', [session.requestId]);
      const request = reqRes.rows[0];

      if (!request || request.status !== 'pending_review') {
        delete sessions[ctx.from.id];
        return ctx.reply('این درخواست قبلاً بررسی شده یا نامعتبر است.');
      }

      // ۱. به‌روزرسانی سفارش فروش
      await pool.query("UPDATE sell_orders SET status = 'approved', amount = $1 WHERE id = $2", [amount, session.requestId]);

      // ۲. شارژ خودکار کیف پول کاربر
      await pool.query('UPDATE users SET balance = balance + $1 WHERE telegram_id = $2', [amount, request.telegram_id]);

      delete sessions[ctx.from.id];

      // ۳. اطلاع رسانی به کاربر
      try {
        await bot.telegram.sendMessage(
          request.telegram_id,
          '✅ درخواست فروش شما تایید شد!\n\n' +
          '🆔 کد پیگیری: `' + request.tracking_code + '`\n' +
          '💵 مبلغ `' + amount.toLocaleString('fa-IR') + ' تومان` به کیف پول شما اضافه شد.',
          { parse_mode: 'Markdown' }
        );
      } catch (e) {}

      return ctx.reply('✅ مبلغ ' + amount.toLocaleString('fa-IR') + ' تومان با موفقیت به کیف پول کاربر اضافه شد و سفارش تایید گردید.');
    }

    // هندل دلیل رد
    if (session.flow === 'admin_sell_reject_flow' && session.step === 'waiting_reason') {
      const reason = ctx.message.text.trim();
      const reqRes = await pool.query('SELECT * FROM sell_orders WHERE id = $1', [session.requestId]);
      const request = reqRes.rows[0];

      if (!request || request.status !== 'pending_review') {
        delete sessions[ctx.from.id];
        return ctx.reply('این درخواست قبلاً بررسی شده است.');
      }

      await pool.query("UPDATE sell_orders SET status = 'rejected' WHERE id = $1", [session.requestId]);
      delete sessions[ctx.from.id];

      try {
        await bot.telegram.sendMessage(
          request.telegram_id,
          '❌ درخواست فروش شما با کد پیگیری ' + request.tracking_code + ' رد شد.\n\n دلیل رد: ' + reason
        );
      } catch (e) {}

      return ctx.reply('درخواست با موفقیت رد شد و علت برای کاربر ارسال گردید ❌');
    }

    return next();
  });
}

module.exports = { registerAdminCommands, isAdmin };
