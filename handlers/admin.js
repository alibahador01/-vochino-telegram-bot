const { pool, getUser } = require('../db');
const texts = require('../texts');

// ⚠️ آی‌دی عددی تلگرام خودت و ادمین‌ها رو داخل این لیست بگذار (مثلاً [123456789])
const ADMIN_IDS = [123456789]; 
const DEFAULT_USD_RATE = 60000;

function isAdmin(telegramId) {
  return ADMIN_IDS.indexOf(Number(telegramId)) !== -1;
}

function fillTemplate(template, values) {
  let result = template;
  Object.keys(values).forEach(function (key) {
    result = result.split('{' + key + '}').join(values[key]);
  });
  return result;
}

async function getUsdRate() {
  const res = await pool.query('SELECT value FROM settings WHERE key = $1', ['usd_rate']);
  return res.rows[0] ? Number(res.rows[0].value) : DEFAULT_USD_RATE;
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
    '/listproducts — دیدن همه‌ی محصولات خرید\n' +
    '/removeproduct کلید — غیرفعال کردن یه محصول خرید\n\n' +
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

function registerAdminCommands(bot, sessions) {
  bot.command('admin', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    await showAdminMenu(ctx);
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
      message += 'کد ووچر: ' + req.voucher_code + '\n';
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
    bot.telegram.sendMessage(
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
      bot.telegram.sendMessage(request.telegram_id, '✅ شارژ کیف پول شما تایید شد.' + codeText + '\nمبلغ ' + Number(request.amount).toLocaleString('en-US') + ' تومان به موجودی شما اضافه شد.');
    } else {
      await pool.query('UPDATE users SET balance = balance - $1 WHERE telegram_id = $2', [request.amount, request.telegram_id]);
      bot.telegram.sendMessage(request.telegram_id, '✅ درخواست برداشت شما تایید شد.' + codeText + '\nمبلغ ' + Number(request.amount).toLocaleString('en-US') + ' تومان به کارت شما واریز شد.');
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
    bot.telegram.sendMessage(request.telegram_id, '❌ درخواست شما رد شد.' + codeText + '\nدر صورت هرگونه سؤال با پشتیبانی در تماس باشید.');
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
}

module.exports = { registerAdminCommands, isAdmin, getUsdRate, ADMIN_IDS, DEFAULT_USD_RATE };
