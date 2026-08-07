const texts = require('../texts');
const { sessions, fillTemplate, sendBroadcast } = require('../utils');
const { pool, getUser, getUsdRate, getAllUsers, getUserById } = require('../db');
const { ADMIN_IDS, ALLOWED_REACTIONS } = require('../constants');

function isAdmin(telegramId) {
  return ADMIN_IDS.indexOf(Number(telegramId)) !== -1;
}

module.exports = function registerAdminHandlers(bot) {

  // ===== مدیریت محصولات خرید =====
  bot.action('admin_products_buy', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    
    ctx.reply('📦 **مدیریت محصولات خرید**\n\nلطفاً یکی از گزینه‌های زیر را انتخاب کنید:', {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '➕ افزودن محصول جدید', callback_data: 'admin_add_product_buy' }],
          [{ text: '📋 لیست محصولات', callback_data: 'admin_list_products_buy' }],
          [{ text: '❌ غیرفعال کردن محصول', callback_data: 'admin_remove_product_buy' }],
          [{ text: '🔙 بازگشت به پنل مدیریت', callback_data: 'menu_admin_panel' }]
        ]
      }
    });
  });

  bot.action('admin_add_product_buy', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    
    sessions[ctx.from.id] = {
      flow: 'admin_add_product_buy',
      step: 'waiting_details',
      lang: 'fa'
    };
    
    ctx.reply(
      '➕ **افزودن محصول جدید**\n\n' +
      'لطفاً مشخصات محصول را با فرمت زیر وارد کنید:\n\n' +
      '`کلید|نام نمایشی|حداقل مبلغ|نوع`\n\n' +
      '📌 نوع: `usd` یا `toman`\n\n' +
      'مثال:\n`voucher|🎟 یوووچر|1|usd`',
      { parse_mode: 'Markdown' }
    );
  });

  bot.action('admin_list_products_buy', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    
    const res = await pool.query('SELECT * FROM products ORDER BY id ASC');
    
    if (res.rows.length === 0) {
      ctx.reply('📋 هیچ محصولی تعریف نشده است.');
      return;
    }
    
    let message = '📋 **لیست محصولات خرید**\n\n';
    res.rows.forEach(function (p) {
      const status = p.active ? '✅ فعال' : '⛔️ غیرفعال';
      const price = p.price_type === 'usd' ? Number(p.min_amount) + ' دلار' : Number(p.min_amount).toLocaleString('en-US') + ' تومان';
      message += '🔹 **' + p.name + '**\n';
      message += '   کلید: `' + p.key + '`\n';
      message += '   حداقل: ' + price + '\n';
      message += '   وضعیت: ' + status + '\n\n';
    });
    
    ctx.reply(message, { parse_mode: 'Markdown' });
  });

  bot.action('admin_remove_product_buy', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    
    sessions[ctx.from.id] = {
      flow: 'admin_remove_product_buy',
      step: 'waiting_key',
      lang: 'fa'
    };
    
    ctx.reply('❌ **غیرفعال کردن محصول**\n\nلطفاً کلید محصول مورد نظر را وارد کنید:\nمثال: `voucher`', {
      parse_mode: 'Markdown'
    });
  });

  // ===== مدیریت محصولات فروش =====
  bot.action('admin_products_sell', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    
    ctx.reply('🎟 **مدیریت محصولات فروش**\n\nلطفاً یکی از گزینه‌های زیر را انتخاب کنید:', {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '➕ افزودن محصول جدید', callback_data: 'admin_add_product_sell' }],
          [{ text: '📋 لیست محصولات', callback_data: 'admin_list_products_sell' }],
          [{ text: '❌ غیرفعال کردن محصول', callback_data: 'admin_remove_product_sell' }],
          [{ text: '🔙 بازگشت به پنل مدیریت', callback_data: 'menu_admin_panel' }]
        ]
      }
    });
  });

  bot.action('admin_add_product_sell', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    
    sessions[ctx.from.id] = {
      flow: 'admin_add_product_sell',
      step: 'waiting_details',
      lang: 'fa'
    };
    
    ctx.reply(
      '➕ **افزودن محصول فروش جدید**\n\n' +
      'لطفاً مشخصات محصول را با فرمت زیر وارد کنید:\n\n' +
      '`کلید|نام نمایشی|قیمت واحد|نمونه کد`\n\n' +
      'مثال:\n`uvoucher|🎟 یوووچر|173031|USD-7T3H-C2QG-P6YA-D4UW-XOIQ`',
      { parse_mode: 'Markdown' }
    );
  });

  bot.action('admin_list_products_sell', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    
    const res = await pool.query('SELECT * FROM sell_products ORDER BY id ASC');
    
    if (res.rows.length === 0) {
      ctx.reply('📋 هیچ محصول فروشی تعریف نشده است.');
      return;
    }
    
    let message = '📋 **لیست محصولات فروش**\n\n';
    res.rows.forEach(function (p) {
      const status = p.active ? '✅ فعال' : '⛔️ غیرفعال';
      message += '🔹 **' + p.name + '**\n';
      message += '   کلید: `' + p.key + '`\n';
      message += '   قیمت: ' + Number(p.unit_price).toLocaleString('en-US') + ' تومان\n';
      message += '   نمونه کد: `' + p.sample_code + '`\n';
      message += '   وضعیت: ' + status + '\n\n';
    });
    
    ctx.reply(message, { parse_mode: 'Markdown' });
  });

  bot.action('admin_remove_product_sell', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    
    sessions[ctx.from.id] = {
      flow: 'admin_remove_product_sell',
      step: 'waiting_key',
      lang: 'fa'
    };
    
    ctx.reply('❌ **غیرفعال کردن محصول فروش**\n\nلطفاً کلید محصول مورد نظر را وارد کنید:\nمثال: `uvoucher`', {
      parse_mode: 'Markdown'
    });
  });

  // ===== مدیریت درخواست‌ها =====
  
  bot.action('admin_buy_pending', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const pendingRes = await pool.query("SELECT * FROM orders WHERE status = 'pending_delivery' ORDER BY id ASC");
    const pendingRequests = pendingRes.rows;

    if (pendingRequests.length === 0) {
      ctx.reply('✅ هیچ سفارش خریدی در انتظار تحویل نیست.');
      return;
    }

    for (const req of pendingRequests) {
      const user = await getUser(req.telegram_id);
      const userName = user ? user.full_name : 'نامشخص';
      const productRes = await pool.query('SELECT name FROM products WHERE key = $1', [req.product_type]);
      const productName = productRes.rows[0] ? productRes.rows[0].name : req.product_type;

      let message = '📦 **سفارش خرید در انتظار تحویل**\n\n';
      message += '🆔 کد پیگیری: `' + req.tracking_code + '`\n';
      message += '👤 کاربر: ' + userName + ' (`' + req.telegram_id + '`)\n';
      message += '📦 محصول: ' + productName + '\n';
      message += '💰 مبلغ: ' + Number(req.amount).toLocaleString('en-US') + ' تومان\n';
      message += '💰 کارمزد: ' + Number(req.commission || 0).toLocaleString('en-US') + ' تومان\n';
      message += '📅 تاریخ: ' + req.created_at + '\n\n';
      message += '⚠️ کد/متن تحویل را با دکمه زیر وارد کنید:';

      const buttons = [
        [{ text: '📤 ارسال کد تحویل', callback_data: 'admin_deliver_' + req.id }],
        [
          { text: '✅ تکمیل دستی', callback_data: 'admin_buy_complete_' + req.id },
          { text: '❌ لغو و بازگشت وجه', callback_data: 'admin_buy_cancel_' + req.id }
        ]
      ];

      await ctx.reply(message, { reply_markup: { inline_keyboard: buttons }, parse_mode: 'Markdown' });
    }
  });

  bot.action('admin_sell_pending', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const pendingRes = await pool.query("SELECT * FROM sell_orders WHERE status = 'pending_review' ORDER BY id ASC");
    const pendingRequests = pendingRes.rows;

    if (pendingRequests.length === 0) {
      ctx.reply('✅ هیچ درخواست فروشی در انتظار نیست.');
      return;
    }

    for (const req of pendingRequests) {
      const user = await getUser(req.telegram_id);
      const userName = user ? user.full_name : 'نامشخص';
      const productRes = await pool.query('SELECT name FROM sell_products WHERE key = $1', [req.product_type]);
      const productName = productRes.rows[0] ? productRes.rows[0].name : req.product_type;

      let message = '🎟 **درخواست فروش**\n\n';
      message += '🆔 کد پیگیری: `' + req.tracking_code + '`\n';
      message += '👤 کاربر: ' + userName + ' (`' + req.telegram_id + '`)\n';
      message += '📦 محصول: ' + productName + '\n';
      message += '🎫 کد ووچر: `' + req.voucher_code + '`\n';

      const buttons = [
        [{ text: '✅ تایید و وارد کردن مبلغ', callback_data: 'admin_sell_approve_' + req.id }],
        [
          { text: '❌ رد', callback_data: 'admin_sell_reject_' + req.id },
          { text: '✉️ رد با توضیح', callback_data: 'admin_sell_reject_reason_' + req.id }
        ]
      ];

      await ctx.reply(message, { reply_markup: { inline_keyboard: buttons }, parse_mode: 'Markdown' });
    }
  });

  bot.action('admin_pending', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const pendingRes = await pool.query("SELECT * FROM wallet_requests WHERE status = 'pending' ORDER BY id ASC");
    const pendingRequests = pendingRes.rows;

    if (pendingRequests.length === 0) {
      ctx.reply('✅ هیچ درخواست کیف پولی در انتظار نیست.');
      return;
    }

    for (const req of pendingRequests) {
      const user = await getUser(req.telegram_id);
      const userName = user ? user.full_name : 'نامشخص';
      const typeLabel = req.type === 'deposit' ? '➕ افزایش موجودی' : '💳 برداشت موجودی';

      let message = '💰 **' + typeLabel + '**\n\n';
      message += '🆔 کد پیگیری: `' + (req.tracking_code || '-') + '`\n';
      message += '👤 کاربر: ' + userName + ' (`' + req.telegram_id + '`)\n';
      message += '💰 مبلغ: ' + Number(req.amount).toLocaleString('en-US') + ' تومان\n';
      if (req.type === 'withdraw') {
        message += '💳 شماره کارت مقصد: `' + req.card_number + '`\n';
      }

      const buttons = [
        [
          { text: '✅ تایید', callback_data: 'admin_approve_' + req.id },
          { text: '❌ رد', callback_data: 'admin_reject_' + req.id }
        ],
        [{ text: '✉️ رد با توضیح', callback_data: 'admin_reject_reason_' + req.id }]
      ];

      if (req.type === 'deposit' && req.receipt_file_id) {
        await ctx.replyWithPhoto(req.receipt_file_id, { caption: message, reply_markup: { inline_keyboard: buttons }, parse_mode: 'Markdown' });
      } else {
        await ctx.reply(message, { reply_markup: { inline_keyboard: buttons }, parse_mode: 'Markdown' });
      }
    }
  });

  // ===== ارسال همگانی، مخفی و هدیه (توی misc.js هست) =====

  // ===== آمار کاربران =====
  bot.action('admin_stats', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    
    const totalUsers = await pool.query('SELECT COUNT(*) AS c FROM users');
    const registeredUsers = await pool.query("SELECT COUNT(*) AS c FROM users WHERE full_name IS NOT NULL AND phone IS NOT NULL AND card_number IS NOT NULL");
    const totalBalance = await pool.query('SELECT COALESCE(SUM(balance), 0) AS total FROM users');
    const todayOrders = await pool.query("SELECT COUNT(*) AS c FROM orders WHERE created_at::date >= CURRENT_DATE");
    const todaySells = await pool.query("SELECT COUNT(*) AS c FROM sell_orders WHERE created_at::date >= CURRENT_DATE");
    
    ctx.reply(
      '📊 **آمار کاربران ووچینو**\n\n' +
      '👥 **کل کاربران:** ' + totalUsers.rows[0].c + '\n' +
      '✅ **ثبت‌نام کامل:** ' + registeredUsers.rows[0].c + '\n' +
      '💰 **مجموع موجودی:** ' + Number(totalBalance.rows[0].total).toLocaleString('en-US') + ' تومان\n' +
      '🛒 **سفارشات امروز:** ' + todayOrders.rows[0].c + '\n' +
      '🎟 **فروش امروز:** ' + todaySells.rows[0].c,
      { parse_mode: 'Markdown' }
    );
  });

  // ===== دکمه‌های تایید/رد و تحویل =====
  
  bot.action(/^admin_deliver_([0-9]+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const orderId = ctx.match[1];
    const orderRes = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
    const order = orderRes.rows[0];

    if (!order || order.status !== 'pending_delivery') {
      ctx.reply('این سفارش قبلاً تحویل داده شده یا وجود ندارد.');
      return;
    }

    sessions[ctx.from.id] = {
      flow: 'admin_deliver_code',
      step: 'waiting_code',
      lang: 'fa',
      data: { orderId: orderId, telegramId: order.telegram_id, trackingCode: order.tracking_code }
    };

    ctx.reply('✍️ کد/متن تحویل را بنویسید (مستقیم برای کاربر ارسال می‌شود):');
  });

  bot.action(/^admin_buy_complete_([0-9]+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const orderId = ctx.match[1];
    const orderRes = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
    const order = orderRes.rows[0];

    if (!order || order.status !== 'pending_delivery') {
      ctx.reply('این سفارش قبلاً بررسی شده است.');
      return;
    }

    await pool.query("UPDATE orders SET status = 'completed' WHERE id = $1", [orderId]);
    ctx.telegram.sendMessage(
      order.telegram_id,
      '✅ سفارش خرید شما تکمیل شد.\n🆔 کد پیگیری: ' + order.tracking_code + '\n\nدر صورت هرگونه سؤال با پشتیبانی در تماس باشید.'
    );
    ctx.reply('✅ سفارش شماره ' + orderId + ' تکمیل شد.');
  });

  bot.action(/^admin_buy_cancel_([0-9]+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const orderId = ctx.match[1];
    const orderRes = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
    const order = orderRes.rows[0];

    if (!order || order.status !== 'pending_delivery') {
      ctx.reply('این سفارش قبلاً بررسی شده است.');
      return;
    }

    const totalRefund = Number(order.amount) + Number(order.commission || 0);
    await pool.query('UPDATE users SET balance = balance + $1 WHERE telegram_id = $2', [totalRefund, order.telegram_id]);
    await pool.query("UPDATE orders SET status = 'cancelled' WHERE id = $1", [orderId]);

    ctx.telegram.sendMessage(
      order.telegram_id,
      '❌ سفارش خرید شما لغو شد.\n🆔 کد پیگیری: ' + order.tracking_code + '\n💰 مبلغ ' + totalRefund.toLocaleString('en-US') + ' تومان به کیف پول شما بازگشت داده شد.'
    );
    ctx.reply('❌ سفارش شماره ' + orderId + ' لغو شد و مبلغ به کاربر بازگشت داده شد.');
  });

  bot.action(/^admin_sell_approve_([0-9]+)$/, async (ctx) => {
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

  bot.action(/^admin_sell_reject_([0-9]+)$/, async (ctx) => {
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
    ctx.reply('❌ درخواست فروش شماره ' + requestId + ' رد شد.');
  });

  bot.action(/^admin_sell_reject_reason_([0-9]+)$/, async (ctx) => {
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

    ctx.reply('✍️ لطفاً دلیل رد این درخواست فروش را بنویسید (همین متن مستقیم برای کاربر ارسال می‌شود):');
  });

  bot.action(/^admin_approve_([0-9]+)$/, async (ctx) => {
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
    ctx.reply('✅ درخواست شماره ' + requestId + ' تایید شد.');
  });

  bot.action(/^admin_reject_([0-9]+)$/, async (ctx) => {
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
    ctx.reply('❌ درخواست شماره ' + requestId + ' رد شد.');
  });

  bot.action(/^admin_reject_reason_([0-9]+)$/, async (ctx) => {
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

    ctx.reply('✍️ لطفاً دلیل رد این درخواست را بنویسید (همین متن مستقیم برای کاربر ارسال می‌شود):');
  });

  // ===== هندلرهای متنی =====
  bot.on('text', async (ctx, next) => {
    const session = sessions[ctx.from.id];
    if (!session) return next();
    
    if (!isAdmin(ctx.from.id)) {
      delete sessions[ctx.from.id];
      return next();
    }

    // افزودن محصول خرید
    if (session.flow === 'admin_add_product_buy' && session.step === 'waiting_details') {
      const parts = ctx.message.text.split('|').map(p => p.trim());
      if (parts.length !== 4) {
        ctx.reply('❌ فرمت صحیح نیست. لطفاً به صورت `کلید|نام|حداقل|نوع` وارد کنید.');
        return;
      }
      const [key, name, minAmount, priceType] = parts;
      if (!key || !name || !minAmount || (priceType !== 'usd' && priceType !== 'toman')) {
        ctx.reply('❌ مقادیر نامعتبر است. لطفاً دوباره تلاش کنید.');
        return;
      }
      await pool.query(
        'INSERT INTO products (key, name, min_amount, price_type, active, created_at) VALUES ($1, $2, $3, $4, 1, $5) ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, min_amount = EXCLUDED.min_amount, price_type = EXCLUDED.price_type, active = 1',
        [key, name, parseFloat(minAmount), priceType, new Date().toISOString()]
      );
      delete sessions[ctx.from.id];
      ctx.reply('✅ محصول «' + name + '» با موفقیت اضافه/ویرایش و فعال شد.');
      return;
    }

    // غیرفعال کردن محصول خرید
    if (session.flow === 'admin_remove_product_buy' && session.step === 'waiting_key') {
      const key = ctx.message.text.trim();
      const res = await pool.query("UPDATE products SET active = 0 WHERE key = $1 RETURNING name", [key]);
      if (res.rows.length === 0) {
        ctx.reply('❌ محصولی با این کلید پیدا نشد.');
        delete sessions[ctx.from.id];
        return;
      }
      delete sessions[ctx.from.id];
      ctx.reply('✅ محصول «' + res.rows[0].name + '» غیرفعال شد.');
      return;
    }

    // افزودن محصول فروش
    if (session.flow === 'admin_add_product_sell' && session.step === 'waiting_details') {
      const parts = ctx.message.text.split('|').map(p => p.trim());
      if (parts.length !== 4) {
        ctx.reply('❌ فرمت صحیح نیست. لطفاً به صورت `کلید|نام|قیمت|نمونه کد` وارد کنید.');
        return;
      }
      const [key, name, price, sampleCode] = parts;
      if (!key || !name || !price || !sampleCode) {
        ctx.reply('❌ مقادیر نامعتبر است. لطفاً دوباره تلاش کنید.');
        return;
      }
      await pool.query(
        'INSERT INTO sell_products (key, name, unit_price, sample_code, active, created_at) VALUES ($1, $2, $3, $4, 1, $5) ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, unit_price = EXCLUDED.unit_price, sample_code = EXCLUDED.sample_code, active = 1',
        [key, name, parseFloat(price), sampleCode, new Date().toISOString()]
      );
      delete sessions[ctx.from.id];
      ctx.reply('✅ محصول فروش «' + name + '» با موفقیت اضافه/ویرایش و فعال شد.');
      return;
    }

    // غیرفعال کردن محصول فروش
    if (session.flow === 'admin_remove_product_sell' && session.step === 'waiting_key') {
      const key = ctx.message.text.trim();
      const res = await pool.query("UPDATE sell_products SET active = 0 WHERE key = $1 RETURNING name", [key]);
      if (res.rows.length === 0) {
        ctx.reply('❌ محصولی با این کلید پیدا نشد.');
        delete sessions[ctx.from.id];
        return;
      }
      delete sessions[ctx.from.id];
      ctx.reply('✅ محصول فروش «' + res.rows[0].name + '» غیرفعال شد.');
      return;
    }

    // تحویل کد
    if (session.flow === 'admin_deliver_code' && session.step === 'waiting_code') {
      const deliveredCode = ctx.message.text.trim();
      const orderId = session.data.orderId;
      const orderRes = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
      const order = orderRes.rows[0];
      if (!order || order.status !== 'pending_delivery') {
        delete sessions[ctx.from.id];
        ctx.reply('این سفارش قبلاً تحویل داده شده است.');
        return;
      }
      await pool.query("UPDATE orders SET status = 'completed', delivered_code = $1 WHERE id = $2", [deliveredCode, orderId]);
      ctx.telegram.sendMessage(
        session.data.telegramId,
        '🎉 سفارش خرید شما تحویل داده شد!\n\n🆔 کد پیگیری: ' + session.data.trackingCode + '\n\n📦 کد/محتوای سفارش:\n' + deliveredCode + '\n\nبا تشکر از اعتماد شما 🙏'
      );
      delete sessions[ctx.from.id];
      ctx.reply('✅ کد تحویل برای کاربر ارسال شد و سفارش تکمیل شد.');
      return;
    }

    // رد با توضیح (کیف پول)
    if (session.flow === 'admin_reject_reason' && session.step === 'waiting_reason') {
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
      ctx.telegram.sendMessage(request.telegram_id, '❌ درخواست شما رد شد.' + codeText + '\n📝 دلیل:\n' + reasonText);
      delete sessions[ctx.from.id];
      ctx.reply('✅ درخواست شماره ' + requestId + ' با توضیح رد شد.');
      return;
    }

    // رد با توضیح (فروش)
    if (session.flow === 'admin_sell_reject_reason' && session.step === 'waiting_reason') {
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
      ctx.telegram.sendMessage(request.telegram_id, '❌ درخواست فروش شما رد شد.\n🆔 کد پیگیری: ' + request.tracking_code + '\n📝 دلیل:\n' + reasonText);
      delete sessions[ctx.from.id];
      ctx.reply('✅ درخواست فروش شماره ' + requestId + ' با توضیح رد شد.');
      return;
    }

    // تایید فروش - وارد کردن مبلغ
    if (session.flow === 'admin_sell_amount' && session.step === 'waiting_amount') {
      const amount = parseInt(ctx.message.text.replace(/[^0-9]/g, ''), 10);
      const requestId = session.data.requestId;
      if (!amount || amount <= 0) {
        ctx.reply('⚠️ عدد واردشده معتبر نیست. دوباره مبلغ را وارد کنید:');
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
