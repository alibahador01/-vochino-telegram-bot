const { pool, getUser } = require('../db');

const ADMIN_IDS = [8231962200];
const ALLOWED_REACTIONS = [
  '👍', '👎', '❤', '🔥', '🥰', '👏', '😁', '🤔', '🤯', '😱',
  '🤬', '😢', '🎉', '🤩', '🤮', '💩', '🙏', '👌', '🕊', '🤡',
  '🥱', '🥴', '😍', '🐳', '❤‍🔥', '🌚', '🌭', '💯', '🤣', '⚡',
  '🍌', '🏆', '💔', '🤨', '😐', '🍓', '🍾', '💋', '🖕', '😈',
  '😴', '😭', '🤓', '👻', '👨‍💻', '👀', '🎃', '🙈', '😇', '😨',
  '🤝', '✍', '🤗', '🫡', '🎅', '🎄', '☃', '💅', '🤪', '🗿',
  '🆒', '💘', '🙉', '🦄', '😘', '💊', '🙊', '😎', '👾', '🤷‍♂',
  '🤷', '🤷‍♀', '😡'
];

async function getUsdRate() {
  const res = await pool.query('SELECT value FROM settings WHERE key = $1', ['usd_rate']);
  return res.rows[0] ? Number(res.rows[0].value) : 60000;
}

function registerAdminCommands(bot) {
  bot.command('setreaction', async (ctx) => {
    if (ADMIN_IDS.indexOf(Number(ctx.from.id)) === -1) return;
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
    if (ADMIN_IDS.indexOf(Number(ctx.from.id)) === -1) return;
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
    if (ADMIN_IDS.indexOf(Number(ctx.from.id)) === -1) return;
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
    if (ADMIN_IDS.indexOf(Number(ctx.from.id)) === -1) return;
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
    ctx.reply(message, { parse_mode: 'Markdown' });
  });

  bot.command('removeproduct', async (ctx) => {
    if (ADMIN_IDS.indexOf(Number(ctx.from.id)) === -1) return;
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
    if (ADMIN_IDS.indexOf(Number(ctx.from.id)) === -1) return;
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
    if (ADMIN_IDS.indexOf(Number(ctx.from.id)) === -1) return;
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
    if (ADMIN_IDS.indexOf(Number(ctx.from.id)) === -1) return;
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
    if (ADMIN_IDS.indexOf(Number(ctx.from.id)) === -1) return;
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
        '\n💰 مبلغ: ' + Number(o.amount).toLocaleString('en-US') + ' تومان' +
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
}

module.exports = { registerAdminCommands, ADMIN_IDS, ALLOWED_REACTIONS, getUsdRate };
