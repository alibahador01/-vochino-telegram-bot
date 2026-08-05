const texts = require('../texts');
const { sessions, fillTemplate } = require('../utils');
const { pool, getUser, getUsdRate, countAvailableCodes } = require('../db');
const { ADMIN_IDS, ALLOWED_REACTIONS } = require('../constants');

function isAdmin(telegramId) {
  return ADMIN_IDS.indexOf(Number(telegramId)) !== -1;
}

async function showAdminMenu(ctx) {
  const pendingRes = await pool.query("SELECT COUNT(*) AS c FROM wallet_requests WHERE status = 'pending'");
  const pendingCount = pendingRes.rows[0].c;
  const pendingSellRes = await pool.query("SELECT COUNT(*) AS c FROM sell_orders WHERE status = 'pending_review'");
  const pendingSellCount = pendingSellRes.rows[0].c;
  const settingRes = await pool.query('SELECT value FROM settings WHERE key = $1', ['start_reaction']);
  const currentReaction = settingRes.rows[0] ? settingRes.rows[0].value : '🔥';

  ctx.reply('👑 پنل مدیریت پیشرفته\n\n' +
    '🔹 درخواست‌های در انتظار کیف پول: ' + pendingCount + '\n' +
    '🔹 درخواست‌های فروش در انتظار: ' + pendingSellCount + '\n' +
    '🔹 ایموجی اکشن استارت فعلی: ' + currentReaction + '\n\n' +
    '💡 تغییر ایموجی استارت:\n/setreaction <ایموجی>\n\n' +
    '💵 تغییر نرخ دلار:\n/setrate <عدد>\n\n' +
    '📦 مدیریت محصولات خرید:\n' +
    '/addproduct کلید|نام|حداقل|usd یا toman\n' +
    '/addproductfull کلید|نام|حداقل|حداکثر|usd/toman|code/wallet/telegram_id|درصد_کارمزد|کارمزد_ثابت|auto_delivery(0/1)\n' +
    '/listproducts — دیدن همه‌ی محصولات خرید\n' +
    '/removeproduct کلید — غیرفعال کردن یه محصول خرید\n' +
    '/hideproduct کلید — مخفی کردن از منوی کاربر\n' +
    '/showproduct کلید — نمایش دوباره در منوی کاربر\n' +
    '/productinfo کلید — اطلاعات کامل محصول\n\n' +
    '🎟 مدیریت انبار کدها:\n' +
    '/addinventory محصول_کلید کد\n' +
    '/listinventory محصول_کلید\n' +
    '/removeinventory کد\n\n' +
    '🎟 مدیریت محصولات فروش:\n' +
    '/addsellproduct کلید|نام|قیمت واحد|نمونه کد\n' +
    '/listsellproducts — دیدن همه‌ی محصولات فروش\n' +
    '/removesellproduct کلید — غیرفعال کردن یه محصول فروش\n\n' +
    '🔎 جستجوی سفارش/شارژ/برداشت/فروش با کد پیگیری:\n' +
    '/find VOC-847392', {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '📥 درخواست‌های در انتظار کیف پول', callback_data: 'admin_pending' }],
        [{ text: '🎟 درخواست‌های فروش در انتظار', callback_data: 'admin_sell_pending' }]
      ]
    }
  });
}

module.exports = function registerAdminHandlers(bot) {
  bot.command('admin', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    await showAdminMenu(ctx);
  });

  bot.command('setreaction', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
      const currentRes = await pool.query('SELECT value FROM settings WHERE key = $1', ['start_reaction']);
      const current = currentRes.rows[0] ? currentRes.rows[0].value : '🔥';
      ctx.reply('❌ لطفاً ایموجی مورد نظر را بعد از دستور وارد کنید.\nایموجی فعلی ربات: ' + current + '\n\nمثال:\n/setreaction 🔥', { parse_mode: 'Markdown' });
      return;
    }
    const newEmoji = args[1];

    if (ALLOWED_REACTIONS.indexOf(newEmoji) === -1) {
      ctx.reply(
        '⚠️ این ایموجی جزو ری‌اکشن‌های مجاز تلگرام نیست.\n' +
        'چند نمونه‌ی مجاز:\n🎉 🔥 🤩 💯 🏆 ❤ 👏'
      );
      return;
    }

    try {
      await ctx.telegram.setMessageReaction(ctx.chat.id, ctx.message.message_id, [{ type: 'emoji', emoji: newEmoji }], true);
    } catch (e) {
      ctx.reply('⚠️ خطای واقعی: ' + e.message);
      return;
    }

    await pool.query(
      'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
      ['start_reaction', newEmoji]
    );
    ctx.reply('✅ اکشن استارت با موفقیت به (' + newEmoji + ') تغییر یافت!');
  });

  bot.command('setrate', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
      const currentRate = await getUsdRate();
      ctx.reply('❌ لطفاً نرخ جدید را وارد کنید.\nنرخ فعلی: ' + currentRate.toLocaleString('en-US') + ' تومان\n\nمثال:\n/setrate 65000', { parse_mode: 'Markdown' });
      return;
    }
    const newRate = parseInt(args[1].replace(/[^0-9]/g, ''), 10);
    if (!newRate || newRate <= 0) {
      ctx.reply('⚠️ عدد واردشده معتبر نیست.');
      return;
    }
    await pool.query(
      'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
      ['usd_rate', String(newRate)]
    );
    ctx.reply('✅ نرخ دلار با موفقیت به ' + newRate.toLocaleString('en-US') + ' تومان تغییر یافت!');
  });

  bot.command('addproduct', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const raw = ctx.message.text.replace(/^\/addproduct(@\w+)?\s*/, '');
    const parts = raw.split('|').map(function (p) { return p.trim(); });

    if (parts.length !== 4) {
      ctx.reply(
        '❌ فرمت درست نیست.\n\n' +
        'فرمت صحیح:\n/addproduct کلید|نام نمایشی|حداقل مبلغ|نوع'
      );
      return;
    }

    const [key, name, minAmountRaw, priceType] = parts;
    const minAmount = Number(minAmountRaw.replace(/[^0-9.]/g, ''));

    if (!key || !name || !minAmount || (priceType !== 'usd' && priceType !== 'toman')) {
      ctx.reply('❌ مقادیر نامعتبر است.');
      return;
    }

    await pool.query(
      'INSERT INTO products (key, name, min_amount, price_type, active, created_at) VALUES ($1, $2, $3, $4, 1, $5) ' +
      'ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, min_amount = EXCLUDED.min_amount, price_type = EXCLUDED.price_type, active = 1',
      [key, name, minAmount, priceType, new Date().toISOString()]
    );

    ctx.reply('✅ محصول «' + name + '» با موفقیت اضافه/ویرایش شد.');
  });

  bot.command('listproducts', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const res = await pool.query('SELECT * FROM products ORDER BY id ASC');

    if (res.rows.length === 0) {
      ctx.reply('هنوز هیچ محصولی تعریف نشده.');
      return;
    }

    let message = '📦 لیست محصولات خرید:\n\n';
    res.rows.forEach(function (p) {
      const statusLabel = p.active ? '✅ فعال' : '⛔️ غیرفعال';
      const hiddenLabel = p.is_hidden ? '🔒 مخفی' : '🔓 نمایان';
      const priceLabel = p.price_type === 'usd' ? Number(p.min_amount) + ' دلار' : Number(p.min_amount).toLocaleString('en-US') + ' تومان';
      message += 'کلید: ' + p.key + '\nنام: ' + p.name + '\nحداقل خرید: ' + priceLabel + '\nوضعیت: ' + statusLabel + ' | ' + hiddenLabel + '\n\n';
    });

    ctx.reply(message, { parse_mode: 'Markdown' });
  });

  bot.command('removeproduct', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
      ctx.reply('❌ کلید محصول رو وارد کنید.');
      return;
    }
    const key = args[1].trim();
    const res = await pool.query("UPDATE products SET active = 0 WHERE key = $1 RETURNING name", [key]);

    if (res.rows.length === 0) {
      ctx.reply('محصولی با این کلید پیدا نشد.');
      return;
    }

    ctx.reply('✅ محصول «' + res.rows[0].name + '» غیرفعال شد.');
  });

  bot.command('addsellproduct', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const raw = ctx.message.text.replace(/^\/addsellproduct(@\w+)?\s*/, '');
    const parts = raw.split('|').map(function (p) { return p.trim(); });

    if (parts.length !== 4) {
      ctx.reply(
        '❌ فرمت درست نیست.\n\n' +
        'فرمت صحیح:\n/addsellproduct کلید|نام نمایشی|قیمت واحد|نمونه کد\n\n' +
        'مثال:\n/addsellproduct uvoucher|🎟 یوووچر|173031|USD-7T3H-C2QG-P6YA-D4UW-XOIQ'
      );
      return;
    }

    const [key, name, priceRaw, sampleCode] = parts;
    const price = Number(priceRaw.replace(/[^0-9.]/g, ''));

    if (!key || !name || !price || !sampleCode) {
      ctx.reply('❌ مقادیر نامعتبر است.');
      return;
    }

    await pool.query(
      'INSERT INTO sell_products (key, name, unit_price, sample_code, active, created_at) VALUES ($1, $2, $3, $4, 1, $5) ' +
      'ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, unit_price = EXCLUDED.unit_price, sample_code = EXCLUDED.sample_code, active = 1',
      [key, name, price, sampleCode, new Date().toISOString()]
    );

    ctx.reply('✅ محصول فروش «' + name + '» با موفقیت اضافه/ویرایش شد.');
  });

  bot.command('listsellproducts', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const res = await pool.query('SELECT * FROM sell_products ORDER BY id ASC');

    if (res.rows.length === 0) {
      ctx.reply('هنوز هیچ محصول فروشی تعریف نشده.');
      return;
    }

    let message = '📦 لیست محصولات فروش:\n\n';
    res.rows.forEach(function (p) {
      const statusLabel = p.active ? '✅ فعال' : '⛔️ غیرفعال';
      message += 'کلید: ' + p.key + '\nنام: ' + p.name + '\nقیمت واحد: ' + Number(p.unit_price).toLocaleString('en-US') + ' تومان\nنمونه کد: ' + p.sample_code + '\nوضعیت: ' + statusLabel + '\n\n';
    });

    ctx.reply(message, { parse_mode: 'Markdown' });
  });

  bot.command('removesellproduct', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
      ctx.reply('❌ کلید محصول رو وارد کنید.');
      return;
    }
    const key = args[1].trim();
    const res = await pool.query("UPDATE sell_products SET active = 0 WHERE key = $1 RETURNING name", [key]);

    if (res.rows.length === 0) {
      ctx.reply('محصولی با این کلید پیدا نشد.');
      return;
    }

    ctx.reply('✅ محصول فروش «' + res.rows[0].name + '» غیرفعال شد.');
  });

  bot.command('find', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
      ctx.reply('❌ کد پیگیری رو بعد از دستور بنویس.\nمثال:\n/find VOC-847392');
      return;
    }
    const code = args[1].trim().toUpperCase();

    const orderRes = await pool.query('SELECT * FROM orders WHERE tracking_code = $1', [code]);
    const walletRes = await pool.query('SELECT * FROM wallet_requests WHERE tracking_code = $1', [code]);
    const sellRes = await pool.query('SELECT * FROM sell_orders WHERE tracking_code = $1', [code]);

    if (orderRes.rows.length === 0 && walletRes.rows.length === 0 && sellRes.rows.length === 0) {
      ctx.reply('❌ هیچ رکوردی با این کد پیگیری پیدا نشد.');
      return;
    }

    if (orderRes.rows.length > 0) {
      const o = orderRes.rows[0];
      const user = await getUser(o.telegram_id);
      ctx.reply(
        '📦 سفارش خرید\n\n🆔 کد پیگیری: ' + o.tracking_code +
        '\n👤 نام: ' + (user ? user.full_name : 'نامشخص') +
        '\n📱 شماره: ' + (user ? user.phone : '-') +
        '\n📦 محصول: ' + o.product_type +
        '\n💰 مبلغ پایه: ' + Number(o.amount).toLocaleString('en-US') + ' تومان' +
        '\n💳 کارمزد: ' + Number(o.fee_amount || 0).toLocaleString('en-US') + ' تومان' +
        '\n🔹 مجموع: ' + Number(o.total_amount || o.amount).toLocaleString('en-US') + ' تومان' +
        '\n📌 وضعیت: ' + o.status +
        '\n📅 تاریخ: ' + o.created_at
      );
    }

    if (walletRes.rows.length > 0) {
      const w = walletRes.rows[0];
      const user = await getUser(w.telegram_id);
      const typeLabel = w.type === 'deposit' ? '➕ شارژ کیف پول' : '💳 برداشت موجودی';
      ctx.reply(
        typeLabel + '\n\n🆔 کد پیگیری: ' + w.tracking_code +
        '\n👤 نام: ' + (user ? user.full_name : 'نامشخص') +
        '\n📱 شماره: ' + (user ? user.phone : '-') +
        '\n💰 مبلغ: ' + Number(w.amount).toLocaleString('en-US') + ' تومان' +
        '\n📌 وضعیت: ' + w.status +
        '\n📅 تاریخ: ' + w.created_at
      );
    }

    if (sellRes.rows.length > 0) {
      const s = sellRes.rows[0];
      const user = await getUser(s.telegram_id);
      ctx.reply(
        '🎟 سفارش فروش\n\n🆔 کد پیگیری: ' + s.tracking_code +
        '\n👤 نام: ' + (user ? user.full_name : 'نامشخص') +
        '\n📱 شماره: ' + (user ? user.phone : '-') +
        '\n📦 محصول: ' + s.product_type +
        '\n🎫 کد ووچر: ' + s.voucher_code +
        '\n💰 مبلغ: ' + (s.amount ? Number(s.amount).toLocaleString('en-US') + ' تومان' : 'هنوز تعیین نشده') +
        '\n📌 وضعیت: ' + s.status +
        '\n📅 تاریخ: ' + s.created_at
      );
    }
  });

  bot.action('admin_pending', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const pendingRes = await pool.query("SELECT * FROM wallet_requests WHERE status = 'pending' ORDER BY id ASC");
    const pendingRequests = pendingRes.rows;

    if (pendingRequests.length === 0) {
      ctx.reply('در حال حاضر هیچ درخواست در انتظاری وجود ندارد ✅');
      return;
    }

    for (const req of pendingRequests) {
      const user = await getUser(req.telegram_id);
      const userName = user ? user.full_name : 'نامشخص';
      const typeLabel = req.type === 'deposit' ? '➕ افزایش موجودی' : '💳 برداشت موجودی';

      let message = typeLabel + '\n';
      message += '🆔 کد پیگیری: ' + (req.tracking_code || '-') + '\n';
      message += 'کاربر: ' + userName + ' (' + req.telegram_id + ')\n';
      message += 'مبلغ: ' + Number(req.amount).toLocaleString('en-US') + ' تومان\n';
      if (req.type === 'withdraw') {
        message += 'شماره کارت مقصد: ' + req.card_number + '\n';
      }
      const buttons = [
        [
          { text: '✅ تایید', callback_data: 'admin_approve_' + req.id, style: 'success' },
          { text: '❌ رد', callback_data: 'admin_reject_' + req.id, style: 'danger' }
        ],
        [
          { text: '✉️ رد با توضیح', callback_data: 'admin_reject_reason_' + req.id, style: 'primary' }
        ]
      ];
      if (req.type === 'deposit' && req.receipt_file_id) {
        await ctx.replyWithPhoto(req.receipt_file_id, { caption: message, reply_markup: { inline_keyboard: buttons } });
      } else {
        await ctx.reply(message, { reply_markup: { inline_keyboard: buttons } });
      }
    }
  });

  bot.action('admin_sell_pending', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const pendingRes = await pool.query("SELECT * FROM sell_orders WHERE status = 'pending_review' ORDER BY id ASC");
    const pendingRequests = pendingRes.rows;

    if (pendingRequests.length === 0) {
      ctx.reply('در حال حاضر هیچ درخواست فروشی در انتظار نیست ✅');
      return;
    }

    for (const req of pendingRequests) {
      const user = await getUser(req.telegram_id);
      const userName = user ? user.full_name : 'نامشخص';
      const productRes = await pool.query('SELECT name FROM sell_products WHERE key = $1', [req.product_type]);
      const productName = productRes.rows[0] ? productRes.rows[0].name : req.product_type;

      let message = '🎟 درخواست فروش\n';
      message += '🆔 کد پیگیری: ' + req.tracking_code + '\n';
      message += 'کاربر: ' + userName + ' (' + req.telegram_id + ')\n';
      message += 'محصول: ' + productName + '\n';
      message += 'کد ووچر: `' + req.voucher_code + '`\n';

      const buttons = [
        [
          { text: '✅ تایید و وارد کردن مبلغ', callback_data: 'admin_sell_approve_' + req.id, style: 'success' }
        ],
        [
          { text: '❌ رد', callback_data: 'admin_sell_reject_' + req.id, style: 'danger' },
          { text: '✉️ رد با توضیح', callback_data: 'admin_sell_reject_reason_' + req.id, style: 'primary' }
        ]
      ];

      await ctx.reply(message, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } });
    }
  });

  bot.action(/^admin_sell_approve_(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const requestId = ctx.match[1];
    const reqRes = await pool.query('SELECT * FROM sell_orders WHERE id = $1', [requestId]);
    const request = reqRes.rows[0];

    if (!request || request.status !== 'pending_review') {
      ctx.reply('این درخواست قبلاً بررسی شده است.');
      return;
    }

    sessions[ctx.from.id] = {
      flow: 'admin_sell_amount',
      step: 'waiting_amount',
      lang: 'fa',
      data: { requestId: requestId }
    };

    ctx.reply(texts.fa.sellAskFinalAmount);
  });

  bot.action(/^admin_sell_reject_(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const requestId = ctx.match[1];
    const reqRes = await pool.query('SELECT * FROM sell_orders WHERE id = $1', [requestId]);
    const request = reqRes.rows[0];

    if (!request || request.status !== 'pending_review') {
      ctx.reply('این درخواست قبلاً بررسی شده است.');
      return;
    }

    await pool.query("UPDATE sell_orders SET status = 'rejected' WHERE id = $1", [requestId]);

    ctx.telegram.sendMessage(
      request.telegram_id,
      fillTemplate(texts.fa.sellRejectedUser, { trackingCode: request.tracking_code })
    );

    ctx.reply('درخواست فروش شماره ' + requestId + ' رد شد ❌');
  });

  bot.action(/^admin_sell_reject_reason_(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const requestId = ctx.match[1];
    const reqRes = await pool.query('SELECT * FROM sell_orders WHERE id = $1', [requestId]);
    const request = reqRes.rows[0];

    if (!request || request.status !== 'pending_review') {
      ctx.reply('این درخواست قبلاً بررسی شده است.');
      return;
    }

    sessions[ctx.from.id] = {
      flow: 'admin_sell_reject_reason',
      step: 'waiting_reason',
      lang: 'fa',
      data: { requestId: requestId }
    };

    ctx.reply('✍️ لطفاً دلیل رد این درخواست فروش رو بنویس (همین متن مستقیم برای کاربر ارسال می‌شه):');
  });

  bot.action(/^admin_approve_(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const requestId = ctx.match[1];
    const reqRes = await pool.query('SELECT * FROM wallet_requests WHERE id = $1', [requestId]);
    const request = reqRes.rows[0];

    if (!request || request.status !== 'pending') {
      ctx.reply('این درخواست قبلاً بررسی شده است.');
      return;
    }

    const codeText = request.tracking_code ? ('\n🆔 کد پیگیری: ' + request.tracking_code) : '';

    if (request.type === 'deposit') {
      await pool.query('UPDATE users SET balance = balance + $1 WHERE telegram_id = $2', [request.amount, request.telegram_id]);
      ctx.telegram.sendMessage(request.telegram_id, '✅ شارژ کیف پول شما تایید شد.' + codeText + '\nمبلغ ' + Number(request.amount).toLocaleString('en-US') + ' تومان به موجودی شما اضافه شد.');
    } else {
      await pool.query('UPDATE users SET balance = balance - $1 WHERE telegram_id = $2', [request.amount, request.telegram_id]);
      ctx.telegram.sendMessage(request.telegram_id, '✅ درخواست برداشت شما تایید شد.' + codeText + '\nمبلغ ' + Number(request.amount).toLocaleString('en-US') + ' تومان به کارت شما واریز شد.');
    }

    await pool.query("UPDATE wallet_requests SET status = 'approved' WHERE id = $1", [requestId]);

    ctx.reply('درخواست شماره ' + requestId + ' تایید شد ✅');
  });

  bot.action(/^admin_reject_(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const requestId = ctx.match[1];
    const reqRes = await pool.query('SELECT * FROM wallet_requests WHERE id = $1', [requestId]);
    const request = reqRes.rows[0];

    if (!request || request.status !== 'pending') {
      ctx.reply('این درخواست قبلاً بررسی شده است.');
      return;
    }

    await pool.query("UPDATE wallet_requests SET status = 'rejected' WHERE id = $1", [requestId]);

    const codeText = request.tracking_code ? ('\n🆔 کد پیگیری: ' + request.tracking_code) : '';
    ctx.telegram.sendMessage(request.telegram_id, '❌ درخواست شما رد شد.' + codeText + '\nدر صورت هرگونه سؤال با پشتیبانی در تماس باشید.');

    ctx.reply('درخواست شماره ' + requestId + ' رد شد ❌');
  });

  bot.action(/^admin_reject_reason_(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const requestId = ctx.match[1];
    const reqRes = await pool.query('SELECT * FROM wallet_requests WHERE id = $1', [requestId]);
    const request = reqRes.rows[0];

    if (!request || request.status !== 'pending') {
      ctx.reply('این درخواست قبلاً بررسی شده است.');
      return;
    }

    sessions[ctx.from.id] = {
      flow: 'admin_reject_reason',
      step: 'waiting_reason',
      lang: 'fa',
      data: { requestId: requestId }
    };

    ctx.reply('✍️ لطفاً دلیل رد این درخواست رو بنویس (همین متن مستقیم برای کاربر ارسال می‌شه):');
  });

  // ===== دستورات جدید ادمین برای مدیریت حرفه‌ای محصولات =====

  bot.command('addproductfull', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const raw = ctx.message.text.replace(/^\/addproductfull(@\w+)?\s*/, '');
    const parts = raw.split('|').map(function (p) { return p.trim(); });

    if (parts.length !== 9) {
      ctx.reply(
        '❌ فرمت درست نیست.\n\n' +
        'فرمت صحیح:\n' +
        '/addproductfull کلید|نام|حداقل|حداکثر|usd/toman|code/wallet/telegram_id|درصد_کارمزد|کارمزد_ثابت|auto_delivery(0/1)\n\n' +
        'مثال:\n' +
        '/addproductfull voucher|🎟 یوووچر|1|100|usd|code|2|0|0\n\n' +
        'برای حداکثر نامحدود از - استفاده کن:\n' +
        '/addproductfull hotvoucher|🎟 هات ووچر|50000|-|toman|code|0|0|0'
      );
      return;
    }

    const [key, name, minRaw, maxRaw, priceType, deliveryType, feePercentRaw, feeFixedRaw, autoDeliveryRaw] = parts;
    const minAmount = Number(minRaw.replace(/[^0-9.]/g, ''));
    const maxAmount = (maxRaw && maxRaw !== '-') ? Number(maxRaw.replace(/[^0-9.]/g, '')) : null;
    const feePercent = Number(feePercentRaw.replace(/[^0-9.]/g, '')) || 0;
    const feeFixed = Number(feeFixedRaw.replace(/[^0-9.]/g, '')) || 0;
    const autoDelivery = Number(autoDeliveryRaw) === 1 ? 1 : 0;

    if (!key || !name || !minAmount || !priceType) {
      ctx.reply('❌ مقادیر نامعتبر است.');
      return;
    }

    const validDeliveryTypes = ['code', 'wallet', 'telegram_id'];
    if (!validDeliveryTypes.includes(deliveryType)) {
      ctx.reply('❌ نوع تحویل باید یکی از اینها باشد: code, wallet, telegram_id');
      return;
    }

    await pool.query(
      'INSERT INTO products (key, name, min_amount, max_amount, price_type, delivery_type, fee_percent, fee_fixed, auto_delivery, active, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, $10) ' +
      'ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, min_amount = EXCLUDED.min_amount, max_amount = EXCLUDED.max_amount, price_type = EXCLUDED.price_type, delivery_type = EXCLUDED.delivery_type, fee_percent = EXCLUDED.fee_percent, fee_fixed = EXCLUDED.fee_fixed, auto_delivery = EXCLUDED.auto_delivery, active = 1',
      [key, name, minAmount, maxAmount, priceType, deliveryType, feePercent, feeFixed, autoDelivery, new Date().toISOString()]
    );

    ctx.reply('✅ محصول «' + name + '» با موفقیت اضافه شد.');
  });

  bot.command('addinventory', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const args = ctx.message.text.split(' ');
    if (args.length < 3) {
      ctx.reply('❌ فرمت: /addinventory محصول_کلید کد\nمثال: /addinventory voucher USD-1234-5678');
      return;
    }
    const productKey = args[1];
    const code = args.slice(2).join(' ');

    try {
      await pool.query(
        'INSERT INTO product_inventory (product_key, code, created_at) VALUES ($1, $2, $3)',
        [productKey, code, new Date().toISOString()]
      );
      
      const countRes = await pool.query(
        'SELECT COUNT(*) AS count FROM product_inventory WHERE product_key = $1 AND is_used = 0',
        [productKey]
      );
      const count = Number(countRes.rows[0].count);
      
      ctx.reply('✅ کد با موفقیت به انبار محصول «' + productKey + '» اضافه شد.\n📦 موجودی فعلی: ' + count + ' عدد');
    } catch (e) {
      if (e.code === '23505') {
        ctx.reply('⚠️ این کد قبلاً در انبار ثبت شده است.');
      } else {
        ctx.reply('❌ خطا: ' + e.message);
      }
    }
  });

  bot.command('listinventory', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
      ctx.reply('❌ کلید محصول رو وارد کنید.\nمثال: /listinventory voucher');
      return;
    }
    const productKey = args[1];
    const res = await pool.query(
      'SELECT * FROM product_inventory WHERE product_key = $1 ORDER BY id DESC LIMIT 50',
      [productKey]
    );

    if (res.rows.length === 0) {
      ctx.reply('هیچ کدی برای محصول «' + productKey + '» در انبار موجود نیست.');
      return;
    }

    let message = '📦 انبار کدهای «' + productKey + '»:\n\n';
    const available = res.rows.filter(function (item) { return item.is_used === 0; });
    const used = res.rows.filter(function (item) { return item.is_used === 1; });
    
    message += '✅ موجود: ' + available.length + ' عدد\n';
    message += '❌ استفاده شده: ' + used.length + ' عدد\n\n';
    
    if (available.length > 0) {
      message += '🟢 نمونه کدهای موجود:\n';
      available.slice(0, 10).forEach(function (item) {
        message += '`' + item.code + '`\n';
      });
      if (available.length > 10) {
        message += '... و ' + (available.length - 10) + ' عدد دیگر';
      }
    }
    
    ctx.reply(message, { parse_mode: 'Markdown' });
  });

  bot.command('removeinventory', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
      ctx.reply('❌ کد رو وارد کنید.\nمثال: /removeinventory USD-1234-5678');
      return;
    }
    const code = args.slice(1).join(' ');
    
    const res = await pool.query(
      'DELETE FROM product_inventory WHERE code = $1 AND is_used = 0 RETURNING id',
      [code]
    );
    
    if (res.rows.length === 0) {
      ctx.reply('⚠️ کد پیدا نشد یا قبلاً استفاده شده است.');
    } else {
      ctx.reply('✅ کد با موفقیت از انبار حذف شد.');
    }
  });

  bot.command('hideproduct', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
      ctx.reply('❌ کلید محصول رو وارد کنید.\nمثال: /hideproduct voucher');
      return;
    }
    const key = args[1].trim();
    await pool.query('UPDATE products SET is_hidden = 1 WHERE key = $1', [key]);
    ctx.reply('✅ محصول «' + key + '» از منوی کاربر مخفی شد.');
  });

  bot.command('showproduct', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
      ctx.reply('❌ کلید محصول رو وارد کنید.\nمثال: /showproduct voucher');
      return;
    }
    const key = args[1].trim();
    await pool.query('UPDATE products SET is_hidden = 0 WHERE key = $1', [key]);
    ctx.reply('✅ محصول «' + key + '» دوباره در منوی کاربر نمایش داده می‌شود.');
  });

  bot.command('productinfo', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
      ctx.reply('❌ کلید محصول رو وارد کنید.\nمثال: /productinfo voucher');
      return;
    }
    const key = args[1].trim();
    const res = await pool.query('SELECT * FROM products WHERE key = $1', [key]);
    
    if (res.rows.length === 0) {
      ctx.reply('محصولی با این کلید پیدا نشد.');
      return;
    }
    
    const p = res.rows[0];
    const deliveryLabels = {
      'code': '🎟 کد/متنی',
      'wallet': '🏦 آدرس کیف پول',
      'telegram_id': '📱 آیدی تلگرام'
    };
    
    let message = '📋 اطلاعات محصول:\n\n';
    message += '🔑 کلید: ' + p.key + '\n';
    message += '📛 نام: ' + p.name + '\n';
    message += '💰 حداقل: ' + Number(p.min_amount).toLocaleString('en-US') + (p.price_type === 'usd' ? ' دلار' : ' تومان') + '\n';
    message += '📈 حداکثر: ' + (p.max_amount ? Number(p.max_amount).toLocaleString('en-US') + (p.price_type === 'usd' ? ' دلار' : ' تومان') : 'نامحدود') + '\n';
    message += '💵 قیمت‌گذاری: ' + (p.price_type === 'usd' ? 'بر اساس دلار' : 'تومانی ثابت') + '\n';
    message += '📬 روش تحویل: ' + (deliveryLabels[p.delivery_type] || p.delivery_type) + '\n';
    message += '💳 کارمزد درصدی: ' + p.fee_percent + '%\n';
    message += '💳 کارمزد ثابت: ' + Number(p.fee_fixed).toLocaleString('en-US') + ' تومان\n';
    message += '🤖 تحویل خودکار: ' + (p.auto_delivery === 1 ? '✅ فعال' : '❌ غیرفعال') + '\n';
    message += '👁 وضعیت نمایش: ' + (p.is_hidden === 1 ? '🔒 مخفی' : '🔓 نمایان') + '\n';
    message += '⚡ وضعیت: ' + (p.active === 1 ? '✅ فعال' : '⛔ غیرفعال');
    
    if (p.auto_delivery === 1) {
      const count = await countAvailableCodes(p.key);
      message += '\n📦 موجودی انبار: ' + count + ' عدد';
    }
    
    ctx.reply(message);
  });

  // ===== هندلرهای متنی ادمین =====
  bot.on('text', async (ctx, next) => {
    const session = sessions[ctx.from.id];
    if (!session) return next();

    if (session.flow === 'admin_reject_reason' && session.step === 'waiting_reason') {
      if (!isAdmin(ctx.from.id)) return next();

      const reasonText = ctx.message.text;
      const requestId = session.data.requestId;

      const reqRes = await pool.query('SELECT * FROM wallet_requests WHERE id = $1', [requestId]);
      const request = reqRes.rows[0];

      if (!request || request.status !== 'pending') {
        delete sessions[ctx.from.id];
        ctx.reply('این درخواست قبلاً بررسی شده است.');
        return;
      }

      await pool.query("UPDATE wallet_requests SET status = 'rejected' WHERE id = $1", [requestId]);

      const codeText = request.tracking_code ? ('\n🆔 کد پیگیری: ' + request.tracking_code) : '';
      ctx.telegram.sendMessage(
        request.telegram_id,
        '❌ درخواست شما رد شد.' + codeText + '\n📝 دلیل:\n' + reasonText
      );

      delete sessions[ctx.from.id];
      ctx.reply('درخواست شماره ' + requestId + ' با توضیح رد شد ✅');
      return;
    }

    if (session.flow === 'admin_sell_reject_reason' && session.step === 'waiting_reason') {
      if (!isAdmin(ctx.from.id)) return next();

      const reasonText = ctx.message.text;
      const requestId = session.data.requestId;

      const reqRes = await pool.query('SELECT * FROM sell_orders WHERE id = $1', [requestId]);
      const request = reqRes.rows[0];

      if (!request || request.status !== 'pending_review') {
        delete sessions[ctx.from.id];
        ctx.reply('این درخواست قبلاً بررسی شده است.');
        return;
      }

      await pool.query("UPDATE sell_orders SET status = 'rejected' WHERE id = $1", [requestId]);

      ctx.telegram.sendMessage(
        request.telegram_id,
        '❌ درخواست فروش شما رد شد.\n🆔 کد پیگیری: ' + request.tracking_code + '\n📝 دلیل:\n' + reasonText
      );

      delete sessions[ctx.from.id];
      ctx.reply('درخواست فروش شماره ' + requestId + ' با توضیح رد شد ✅');
      return;
    }

    if (session.flow === 'admin_sell_amount' && session.step === 'waiting_amount') {
      if (!isAdmin(ctx.from.id)) return next();

      const amount = parseInt(ctx.message.text.replace(/[^0-9]/g, ''), 10);
      const requestId = session.data.requestId;

      if (!amount || amount <= 0) {
        ctx.reply('⚠️ عدد واردشده معتبر نیست. دوباره مبلغ رو بفرست:');
        return;
      }

      const reqRes = await pool.query('SELECT * FROM sell_orders WHERE id = $1', [requestId]);
      const request = reqRes.rows[0];

      if (!request || request.status !== 'pending_review') {
        delete sessions[ctx.from.id];
        ctx.reply('این درخواست قبلاً بررسی شده است.');
        return;
      }

      await pool.query('UPDATE users SET balance = balance + $1 WHERE telegram_id = $2', [amount, request.telegram_id]);
      await pool.query("UPDATE sell_orders SET status = 'approved', amount = $1 WHERE id = $2", [amount, requestId]);

      ctx.telegram.sendMessage(
        request.telegram_id,
        fillTemplate(texts.fa.sellApprovedUser, {
          trackingCode: request.tracking_code,
          amount: amount.toLocaleString('en-US')
        })
      );

      delete sessions[ctx.from.id];
      ctx.reply('✅ فروش تایید شد و ' + amount.toLocaleString('en-US') + ' تومان به کیف پول کاربر اضافه شد.');
      return;
    }

    return next();
  });
};
