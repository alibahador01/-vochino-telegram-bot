const texts = require('../texts');
const { sessions, fillTemplate, sendBroadcast } = require('../utils');
const { pool, getUser, getUsdRate, getAllUsers, getUserById } = require('../db');
const { ADMIN_IDS, ALLOWED_REACTIONS } = require('../constants');

function isAdmin(telegramId) {
  return ADMIN_IDS.indexOf(Number(telegramId)) !== -1;
}

async function showAdminMenu(ctx) {
  const pendingRes = await pool.query("SELECT COUNT(*) AS c FROM wallet_requests WHERE status = 'pending'");
  const pendingCount = pendingRes.rows[0].c;

  const pendingSellRes = await pool.query("SELECT COUNT(*) AS c FROM sell_orders WHERE status = 'pending_review'");
  const pendingSellCount = pendingSellRes.rows[0].c;

  const pendingBuyRes = await pool.query("SELECT COUNT(*) AS c FROM orders WHERE status = 'pending_delivery'");
  const pendingBuyCount = pendingBuyRes.rows[0].c;

  const settingRes = await pool.query('SELECT value FROM settings WHERE key = $1', ['start_reaction']);
  const currentReaction = settingRes.rows[0] ? settingRes.rows[0].value : '🔥';

  ctx.reply('👑 پنل مدیریت پیشرفته\n\n' +
    '🔹 درخواست‌های در انتظار کیف پول: ' + pendingCount + '\n' +
    '🔹 درخواست‌های فروش در انتظار: ' + pendingSellCount + '\n' +
    '🔹 سفارش‌های خرید در انتظار تحویل: ' + pendingBuyCount + '\n' +
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
    '/find VOC-847392\n\n' +
    '📢 ارسال همگانی:\n' +
    '/broadcast متن پیام\n\n' +
    '🕵️ ارسال مخفی به یک نفر:\n' +
    '/fakebroadcast آیدی متن پیام\n\n' +
    '👤 نمایش اطلاعات کاربر:\n' +
    '/userinfo آیدی', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📥 درخواست‌های در انتظار کیف پول', callback_data: 'admin_pending' }],
        [{ text: '🎟 درخواست‌های فروش در انتظار', callback_data: 'admin_sell_pending' }],
        [{ text: '📦 سفارش‌های خرید در انتظار تحویل', callback_data: 'admin_buy_pending' }]
      ]
    }
  });
}

module.exports = function registerAdminHandlers(bot) {

  bot.command('admin', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    await showAdminMenu(ctx);
  });

  // ===== بخش جدید: ارسال همگانی و مخفی =====

  bot.command('broadcast', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    const messageText = ctx.message.text.replace(/^\/broadcast(@\w+)?\s*/, '');
    
    if (!messageText || messageText.trim().length === 0) {
      ctx.reply(
        '❌ لطفاً متن پیام رو بعد از دستور بنویس.\n\n' +
        '📝 مثال:\n' +
        '/broadcast سلام به همه کاربران عزیز! 🎉\n\n' +
        '⚠️ این پیام به همه کاربران (حتی اونایی که ثبت‌نام نکردن) ارسال میشه.'
      );
      return;
    }
    
    const allUsers = await getAllUsers(true);
    
    if (allUsers.length === 0) {
      ctx.reply('❌ هیچ کاربری برای ارسال پیدا نشد.');
      return;
    }
    
    const msg = await ctx.reply(
      `📢 در حال ارسال پیام همگانی...\n\n` +
      `👥 تعداد کاربران: ${allUsers.length}\n` +
      `📝 متن پیام:\n${messageText}\n\n` +
      `⏳ لطفاً صبر کنید...`
    );
    
    const userIds = allUsers.map(u => u.telegram_id);
    const results = await sendBroadcast(bot, userIds, messageText, { parse_mode: 'HTML' });
    
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      msg.message_id,
      null,
      `✅ ارسال همگانی انجام شد!\n\n` +
      `✅ موفق: ${successCount}\n` +
      `❌ ناموفق: ${failCount}\n` +
      `👥 مجموع: ${results.length}`
    );
  });

  bot.command('fakebroadcast', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    const args = ctx.message.text.split(' ');
    if (args.length < 3) {
      ctx.reply(
        '❌ فرمت درست نیست.\n\n' +
        '📝 مثال:\n' +
        '/fakebroadcast 8231962200 سلام این یه پیام همگانیه! 🎉\n\n' +
        '⚠️ کاربر فکر میکنه این پیام به همه رفته ولی فقط خودش میبینه!'
      );
      return;
    }
    
    const targetUserId = args[1];
    const messageText = args.slice(2).join(' ');
    
    if (!messageText || messageText.trim().length === 0) {
      ctx.reply('❌ لطفاً متن پیام رو وارد کن.');
      return;
    }
    
    const user = await getUserById(targetUserId);
    if (!user) {
      ctx.reply(`❌ کاربری با آیدی ${targetUserId} پیدا نشد.`);
      return;
    }
    
    ctx.reply(
      `🕵️‍♂️ ارسال مخفی به کاربر:\n\n` +
      `👤 کاربر: ${user.full_name || 'نامشخص'} (${targetUserId})\n` +
      `📝 متن پیام:\n${messageText}\n\n` +
      `⏳ در حال ارسال...`
    );
    
    const result = await sendBroadcast(bot, [targetUserId], messageText, { parse_mode: 'HTML' }, true);
    
    if (result[0].success) {
      ctx.reply(
        `✅ پیام مخفی ارسال شد!\n\n` +
        `👤 کاربر: ${user.full_name || 'نامشخص'}\n` +
        `🆔 آیدی: ${targetUserId}\n` +
        `📝 متن: ${messageText}\n\n` +
        `🔮 کاربر فکر میکنه این پیام همگانی بوده! 😎`
      );
    } else {
      ctx.reply(`❌ ارسال پیام به کاربر ${targetUserId} ناموفق بود.\nخطا: ${result[0].error}`);
    }
  });

  bot.command('userinfo', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
      ctx.reply(
        '❌ لطفاً آیدی کاربر رو وارد کن.\n\n' +
        '📝 مثال:\n' +
        '/userinfo 8231962200'
      );
      return;
    }
    
    const targetUserId = args[1];
    const user = await getUserById(targetUserId);
    
    if (!user) {
      ctx.reply(`❌ کاربری با آیدی ${targetUserId} پیدا نشد.`);
      return;
    }
    
    const isFullyRegistered = user.full_name && user.phone && user.card_number;
    
    let infoText = 
      `👤 **اطلاعات کاربر**\n\n` +
      `🆔 **آیدی:** ${user.telegram_id}\n` +
      `👤 **نام:** ${user.full_name || '❌ ثبت‌نام ناقص'}\n` +
      `📱 **شماره:** ${user.phone || '❌ ثبت نشده'}\n` +
      `💳 **کارت:** ${user.card_number || '❌ ثبت نشده'}\n` +
      `💰 **موجودی:** ${Number(user.balance).toLocaleString('en-US')} تومان\n` +
      `📅 **تاریخ ثبت:** ${user.registered_at || 'نامشخص'}\n` +
      `📌 **وضعیت ثبت‌نام:** ${isFullyRegistered ? '✅ کامل' : '⚠️ ناقص'}\n`;
    
    const ordersRes = await pool.query(
      'SELECT * FROM orders WHERE telegram_id = $1 ORDER BY id DESC LIMIT 5',
      [targetUserId]
    );
    
    if (ordersRes.rows.length > 0) {
      infoText += `\n📦 **آخرین سفارشات:**\n`;
      ordersRes.rows.forEach(order => {
        infoText += `• ${order.product_type} - ${Number(order.amount).toLocaleString('en-US')} تومان (${order.status})\n`;
      });
    }
    
    ctx.reply(infoText, { parse_mode: 'Markdown' });
  });

  bot.command('adminhelp', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    ctx.reply(
      `📚 **راهنمای دستورات ادمین**\n\n` +
      `📢 **ارسال همگانی:**\n` +
      `/broadcast متن پیام\n` +
      `ارسال به همه کاربران (حتی ثبت‌نام نشده‌ها)\n\n` +
      
      `🕵️ **ارسال مخفی به یک نفر:**\n` +
      `/fakebroadcast آیدی متن پیام\n` +
      `کاربر فکر میکنه همگانی بوده! 😎\n\n` +
      
      `👤 **نمایش اطلاعات کاربر:**\n` +
      `/userinfo آیدی\n` +
      `نمایش کامل اطلاعات کاربر\n\n` +
      
      `👑 **پنل مدیریت:**\n` +
      `/admin\n` +
      `ورود به پنل مدیریت\n\n` +
      
      `💰 **تغییر نرخ دلار:**\n` +
      `/setrate عدد\n\n` +
      
      `📦 **مدیریت محصولات:**\n` +
      `/addproduct کلید|نام|حداقل|نوع\n` +
      `/listproducts\n` +
      `/removeproduct کلید`,
      { parse_mode: 'Markdown' }
    );
  });

  // ===== بقیه دستورات ادمین (تغییر نکرده) =====

  bot.command('setreaction', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
      const currentRes = await pool.query('SELECT value FROM settings WHERE key = $1', ['start_reaction']);
      const current = currentRes.rows[0] ? currentRes.rows[0].value : '🔥';
      ctx.reply('❌ لطفاً ایموجی مورد نظر را بعد از دستور وارد کنید.\nایموجی فعلی ربات: ' + current + '\n\nمثال:\n/setreaction 🔥');
      return;
    }
    const newEmoji = args[1];
    if (ALLOWED_REACTIONS.indexOf(newEmoji) === -1) {
      ctx.reply(
        '⚠️ این ایموجی جزو ری‌اکشن‌های مجاز تلگرام نیست.\n' +
        'چند نمونه‌ی مجاز:\n🎉 🔥 🤩 💯  ❤ 👏'
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
      ctx.reply('❌ لطفاً نرخ جدید را وارد کنید.\nنرخ فعلی: ' + currentRate.toLocaleString('en-US') + ' تومان\n\nمثال:\n/setrate 65000');
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
        'فرمت صحیح:\n/addproduct کلید|نام نمایشی|حداقل مبلغ|نوع\n\n' +
        'مثال:\n/addproduct voucher|🎟 یوووچر|1|usd'
      );
      return;
    }

    const key = parts[0];
    const name = parts[1];
    const minAmount = Number(parts[2].replace(/[^0-9.]/g, ''));
    const priceType = parts[3];

    if (!key || !name || !minAmount || (priceType !== 'usd' && priceType !== 'toman')) {
      ctx.reply('❌ مقادیر نامعتبر است.');
      return;
    }

    await pool.query(
      'INSERT INTO products (key, name, min_amount, price_type, active, created_at) VALUES ($1, $2, $3, $4, 1, $5) ' +
      'ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, min_amount = EXCLUDED.min_amount, price_type = EXCLUDED.price_type, active = 1',
      [key, name, minAmount, priceType, new Date().toISOString()]
    );

    ctx.reply('✅ محصول «' + name + '» با موفقیت اضافه/ویرایش و فعال شد.');
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
      const priceLabel = p.price_type === 'usd' ? Number(p.min_amount) + ' دلار' : Number(p.min_amount).toLocaleString('en-US') + ' تومان';
      message += 'کلید: ' + p.key + '\nنام: ' + p.name + '\nحداقل خرید: ' + priceLabel + '\nوضعیت: ' + statusLabel + '\n\n';
    });

    ctx.reply(message);
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

    const key = parts[0];
    const name = parts[1];
    const price = Number(parts[2].replace(/[^0-9.]/g, ''));
    const sampleCode = parts[3];

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

    ctx.reply(message);
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
      const statusLabel = o.status === 'pending_delivery' ? '⏳ در انتظار تحویل' : (o.status === 'completed' ? '✅ تکمیل شده' : o.status);
      ctx.reply(
        '📦 سفارش خرید\n\n🆔 کد پیگیری: ' + o.tracking_code +
        '\n👤 نام: ' + (user ? user.full_name : 'نامشخص') +
        '\n📱 شماره: ' + (user ? user.phone : '-') +
        '\n📦 محصول: ' + o.product_type +
        '\n💰 مبلغ: ' + Number(o.amount).toLocaleString('en-US') + ' تومان' +
        '\n💰 کارمزد: ' + Number(o.commission || 0).toLocaleString('en-US') + ' تومان' +
        '\n📌 وضعیت: ' + statusLabel +
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

  // ===== پنل مدیریت درخواست‌ها (تغییر نکرده) =====

  bot.action('admin_buy_pending', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const pendingRes = await pool.query("SELECT * FROM orders WHERE status = 'pending_delivery' ORDER BY id ASC");
    const pendingRequests = pendingRes.rows;

    if (pendingRequests.length === 0) {
      ctx.reply('در حال حاضر هیچ سفارش خریدی در انتظار تحویل نیست ✅');
      return;
    }

    for (const req of pendingRequests) {
      const user = await getUser(req.telegram_id);
      const userName = user ? user.full_name : 'نامشخص';
      const productRes = await pool.query('SELECT name FROM products WHERE key = $1', [req.product_type]);
      const productName = productRes.rows[0] ? productRes.rows[0].name : req.product_type;

      let message = '📦 سفارش خرید در انتظار تحویل\n';
      message += '🆔 کد پیگیری: ' + req.tracking_code + '\n';
      message += '👤 کاربر: ' + userName + ' (' + req.telegram_id + ')\n';
      message += '📦 محصول: ' + productName + '\n';
      message += '💰 مبلغ: ' + Number(req.amount).toLocaleString('en-US') + ' تومان\n';
      message += '💰 کارمزد: ' + Number(req.commission || 0).toLocaleString('en-US') + ' تومان\n';
      message += '📅 تاریخ: ' + req.created_at + '\n\n';
      message += '⚠️ کد/متن تحویل رو با دکمه‌ی زیر وارد کن:';

      const buttons = [
        [{ text: '📤 ارسال کد تحویل', callback_data: 'admin_deliver_' + req.id }],
        [
          { text: '✅ تکمیل دستی', callback_data: 'admin_buy_complete_' + req.id },
          { text: '❌ لغو و بازگشت وجه', callback_data: 'admin_buy_cancel_' + req.id }
        ]
      ];

      await ctx.reply(message, { reply_markup: { inline_keyboard: buttons } });
    }
  });

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

    ctx.reply('✍️ کد/متن تحویل رو بنویس (مستقیم برای کاربر ارسال می‌شه):');
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
    ctx.reply('سفارش شماره ' + orderId + ' تکمیل شد ✅');
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
    ctx.reply('سفارش شماره ' + orderId + ' لغو شد و مبلغ به کاربر بازگشت داده شد ❌');
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
          { text: '✅ تایید', callback_data: 'admin_approve_' + req.id },
          { text: '❌ رد', callback_data: 'admin_reject_' + req.id }
        ],
        [
          { text: '✉️ رد با توضیح', callback_data: 'admin_reject_reason_' + req.id }
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
          { text: '✅ تایید و وارد کردن مبلغ', callback_data: 'admin_sell_approve_' + req.id }
        ],
        [
          { text: '❌ رد', callback_data: 'admin_sell_reject_' + req.id },
          { text: '✉️ رد با توضیح', callback_data: 'admin_sell_reject_reason_' + req.id }
        ]
      ];

      await ctx.reply(message, { reply_markup: { inline_keyboard: buttons } });
    }
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
    ctx.reply('درخواست فروش شماره ' + requestId + ' رد شد ❌');
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

    ctx.reply('✍️ لطفاً دلیل رد این درخواست فروش رو بنویس (همین متن مستقیم برای کاربر ارسال می‌شه):');
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
    ctx.reply('درخواست شماره ' + requestId + ' تایید شد ✅');
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
    ctx.reply('درخواست شماره ' + requestId + ' رد شد ❌');
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

    ctx.reply('✍️ لطفاً دلیل رد این درخواست رو بنویس (همین متن مستقیم برای کاربر ارسال می‌شه):');
  });

  // هندلر متن برای مراحل ادمین
  bot.on('text', async (ctx, next) => {
    const session = sessions[ctx.from.id];
    if (!session) return next();

    if (session.flow === 'admin_deliver_code' && session.step === 'waiting_code') {
      if (!isAdmin(ctx.from.id)) return next();

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
