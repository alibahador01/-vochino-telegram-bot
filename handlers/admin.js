// ===== دستورات جدید ادمین برای مدیریت حرفه‌ای محصولات =====

// اضافه کردن محصول کامل با تمام ویژگی‌ها
bot.command('addproductfull', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const raw = ctx.message.text.replace(/^\/addproductfull(@\w+)?\s*/, '');
  const parts = raw.split('|').map(function (p) { return p.trim(); });

  // کلید|نام|حداقل|حداکثر|قیمت_براساس(usd/toman)|نوع_تحویل(code/wallet/telegram_id)|درصد_کارمزد|کارمزد_ثابت|auto_delivery(0/1)
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

  // اعتبارسنجی نوع تحویل
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

// اضافه کردن کد به انبار
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
    
    // شمارش موجودی جدید
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

// دیدن کدهای انبار
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
  
  // نمایش ۱۰ تا از موجودها
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

// حذف کد از انبار (برای مواقعی که کد خراب یا مشکل داره)
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

// مخفی کردن یک محصول (از منوی کاربر ناپدید می‌شه ولی تو دیتابیس می‌مونه)
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

// نمایش مجدد یک محصول مخفی
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

// نمایش اطلاعات کامل یک محصول
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
  
  // اگه تحویل خودکار فعال باشه، تعداد موجودی رو نشون بده
  if (p.auto_delivery === 1) {
    const count = await countAvailableCodes(p.key);
    message += '\n📦 موجودی انبار: ' + count + ' عدد';
  }
  
  ctx.reply(message);
});
