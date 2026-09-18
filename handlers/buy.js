// handlers/buy.js
const texts = require('../texts');
const { sessions, showMainMenu, fillTemplate, generateTrackingCode, backToMenuButton } = require('../utils');
const { pool, getUser, getSetting, getProducts, getProductByKey, getAllAdmins, getUsdRate } = require('../db');
const { ADMIN_IDS, ADMIN_LEVELS } = require('../constants');
const { calculateBuyFinal, tryAutoFulfillBuy, getEffectiveUnitPrice } = require('../exchangeEngine');
const { startVerification, checkDailyLimit } = require('./verification');
const R = require('./receipts');

module.exports = function registerBuyHandlers(bot) {

  async function adminIdsList() {
    const ids = ADMIN_IDS.map(x => Number(x));
    try {
      const admins = await getAllAdmins();
      admins.forEach(a => { if (!ids.includes(Number(a.telegram_id))) ids.push(Number(a.telegram_id)); });
    } catch (e) {}
    return ids;
  }

  async function showBuyList(ctx) {
    const products = await getProducts(true);
    if (products.length === 0) {
      return ctx.reply('❌ در حال حاضر هیچ محصول فعالی وجود ندارد.', {
        reply_markup: { inline_keyboard: [[backToMenuButton()]] }
      });
    }
    const buttons = products.map(p => [{ text: p.name, callback_data: 'buy_pick_' + p.key }]);
    buttons.push([backToMenuButton()]);
    return ctx.reply(R.HEADER + '🛍 محصول مورد نظر خود را انتخاب کنید:', {
      reply_markup: { inline_keyboard: buttons }
    });
  }

  bot.action('menu_buy', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    return showBuyList(ctx);
  });

  bot.action('buy_back', async (ctx) => {
    ctx.answerCbQuery();
    delete sessions[ctx.from.id];
    try { await ctx.deleteMessage(); } catch (e) {}
    return showMainMenu(ctx);
  });

  bot.action(/^buy_pick_(.+)$/, async (ctx) => {
    const key = ctx.match[1];
    ctx.answerCbQuery();
    const product = await getProductByKey(key);
    if (!product || !product.active) return ctx.reply('❌ این محصول در دسترس نیست.');
    const user = await getUser(ctx.from.id);
    if (!user || !user.verification_status || user.verification_status === 'none') {
      return startVerification(ctx, 'buy', key);
  }

    // حداقل خرید ممکن است در پنل به دلار ثبت شده باشد (price_type='usd')؛ چون کاربر همیشه
    // مبلغ را به تومان وارد می‌کند، اینجا یک‌بار به تومان تبدیل می‌شود تا مقایسه‌ی بعدی درست باشد
    // (قبلاً این تبدیل انجام نمی‌شد و برای محصولات دلاری عملاً هیچ حداقلی اعمال نمی‌شد).
    const usdRate = await getUsdRate();
    const minAmountToman = product.price_type === 'usd'
      ? Number(product.min_amount || 0) * usdRate
      : Number(product.min_amount || 0);

    sessions[ctx.from.id] = {
      flow: 'buy',
      step: 'waiting_amount',
      data: {
        productType: key,
        productName: product.name,
        minAmount: minAmountToman,
        maxAmount: Number(product.max_amount || 0)
      }
    };

    // حداقل خرید همیشه به خود مشتری «به همون واحدی که ادمین از پنل تنظیم کرده» نشان داده می‌شود
    // (مثلاً «۱ دلار») — بدون هیچ تبدیل زنده به تومان، چون آن تبدیل با تغییر نرخ دلار عوض می‌شد
    // و باعث می‌شد انگار خود «حداقل خرید» با نرخ دلار جابه‌جا می‌شود؛ در حالی که حداقل خرید یک
    // عدد ثابت و مستقل است که خود ادمین از «تنظیمات کلی» تنظیم می‌کند.
    const minLabel = product.price_type === 'usd'
      ? `${Number(product.min_amount || 0).toLocaleString('en-US')} دلار`
      : `${minAmountToman.toLocaleString('en-US')} تومان`;

    // خط «قیمت واحد» فقط برای محصولاتی نمایش داده می‌شود که hide_price نخورده‌اند (مثلاً هات ووچر ندارد)
    let priceLine = '';
    if (!Number(product.hide_price)) {
      const { price } = await getEffectiveUnitPrice(product);
      priceLine = price > 0
        ? `💵 قیمت واحد: ${price.toLocaleString('en-US')} تومان\n\n`
        : `💵 قیمت واحد: هنوز از پنل تنظیم نشده\n\n`;
    }

    // لیست محصولات حذف نمی‌شود؛ فقط سوال مبلغ پرسیده می‌شود (بدون دکمه بازگشت)
    return ctx.reply(
      `✨ Vochino⁰¹\n` +
      `💠 خرید ${product.name}\n\n` +
      priceLine +
      `❗️ حداقل خرید: ${minLabel}\n\n` +
      `📥 لطفاً مبلغ خرید را به تومان وارد کنید:`
    );
  });

  bot.on('text', async (ctx, next) => {
    const session = sessions[ctx.from.id];
    if (!session || session.flow !== 'buy' || session.step !== 'waiting_amount') return next();

    const amount = parseInt(ctx.message.text.replace(/[^0-9]/g, ''), 10);
    const minAmount = session.data.minAmount;
    const maxAmount = session.data.maxAmount;

    if (!amount || amount < minAmount) {
      return ctx.reply(`❌ حداقل مبلغ خرید ${minAmount.toLocaleString('en-US')} تومان است. دوباره وارد کنید:`);
    }
    if (maxAmount > 0 && amount > maxAmount) {
      return ctx.reply(`❌ حداکثر مبلغ خرید ${maxAmount.toLocaleString('en-US')} تومان است. دوباره وارد کنید:`);
    }
    const limitCheck = await checkDailyLimit(ctx.from.id, amount);
    if (!limitCheck.ok) {
      delete sessions[ctx.from.id];
      return ctx.reply(
        `🔒 سقف احراز هویت نقره‌ای شما ${Number(limitCheck.limit).toLocaleString('en-US')} تومان در روز است.\nبرای افزایش سقف معاملات، احراز هویت طلایی را انجام دهید.`,
        { reply_markup: { inline_keyboard: [[{ text: '👑 احراز هویت طلایی', callback_data: 'profile_verification' }]] } }
      );
      }
    const product = await getProductByKey(session.data.productType);
    let commission = 0, finalAmount = amount;
    if (product) {
      const calc = calculateBuyFinal(amount, product);
      commission = calc.commission;
      finalAmount = calc.finalAmount;
    }

    session.data.amount = amount;
    session.data.commission = commission;
    session.data.finalAmount = finalAmount;
    session.step = 'waiting_confirm';

    return ctx.reply(
      R.HEADER +
      `📋 پیش‌فاکتور خرید\n` +
      `🛍 محصول: ${session.data.productName}\n` +
      `💰 مبلغ: ${amount.toLocaleString('en-US')} تومان\n` +
      `💳 کارمزد: ${commission.toLocaleString('en-US')} تومان\n` +
      `💵 قابل پرداخت: ${finalAmount.toLocaleString('en-US')} تومان\n\n` +
      `آیا تأیید می‌کنید؟`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ تأیید خرید', callback_data: 'buy_confirm' }, { text: '🔴 بازگشت', callback_data: 'buy_back' }]
          ]
        }
      }
    );
  });

  bot.action('buy_confirm', async (ctx) => {
    ctx.answerCbQuery();
    const session = sessions[ctx.from.id];

    if (!session || session.flow !== 'buy' || session.step !== 'waiting_confirm') {
      try { await ctx.deleteMessage(); } catch (e) {}
      return ctx.reply('⚠️ این پیش‌فاکتور منقضی شده است.');
    }

    const user = await getUser(ctx.from.id);
    const amount = session.data.amount;
    const commission = session.data.commission || 0;
    const finalAmount = session.data.finalAmount;
    const productKey = session.data.productType;

    const productRes = await pool.query('SELECT * FROM products WHERE key = $1', [productKey]);
    if (productRes.rows.length === 0) {
      delete sessions[ctx.from.id];
      return ctx.reply('❌ محصول نامعتبر است.');
    }
    const product = productRes.rows[0];

    try { await ctx.deleteMessage(); } catch (e) {}

    if (!user || Number(user.balance) < finalAmount) {
      delete sessions[ctx.from.id];
      return ctx.reply(
        `❌ موجودی کیف پول شما کافی نیست.\nمبلغ لازم: ${finalAmount.toLocaleString('en-US')} تومان\nموجودی فعلی: ${user ? Number(user.balance).toLocaleString('en-US') : '0'} تومان`,
        { reply_markup: { inline_keyboard: [[{ text: '🧳 شارژ کیف پول', callback_data: 'wallet_deposit' }], [backToMenuButton()]] } }
      );
    }

    await pool.query('UPDATE users SET balance = balance - $1 WHERE telegram_id = $2', [finalAmount, String(ctx.from.id)]);

    const trackingCode = 'VOC-' + Math.floor(1000000 + Math.random() * 9000000);
    // هیچ کد/هش جعلی ساخته نمی‌شود؛ تحویل توسط ادمین یا API واقعی انجام می‌شود
    const orderStatus = 'pending_delivery';

    const orderIns = await pool.query(
      'INSERT INTO orders (telegram_id, product_type, amount, commission, status, created_at, tracking_code) VALUES ($1, $2, $3, $4, $5, NOW(), $6) RETURNING id',
      [String(ctx.from.id), productKey, finalAmount, commission, orderStatus, trackingCode]
    );
    const orderId = orderIns.rows[0].id;

    delete sessions[ctx.from.id];

    ctx.reply(
      R.HEADER +
      `فاکتور خرید 📋\n` +
      `🛍️ نوع تراکنش: ${product.name}\n` +
      `💰 مبلغ سفارش: ${amount.toLocaleString('en-US')} تومان\n` +
      `💳 کارمزد: ${commission.toLocaleString('en-US')} تومان\n` +
      `💵 مبلغ نهایی: ${finalAmount.toLocaleString('en-US')} تومان\n` +
      `🟠 وضعیت: در انتظار | در حال پردازش و صدور\n` +
      `🔖 کد پیگیری سفارش: ${trackingCode}\n` +
      R.SEP_LINE + '\n' +
      `🕐 تاریخ و ساعت: ${R.formatDateTime(new Date())}\n` +
      `⏳ پس از بررسی و صدور، اطلاعات ووچر برای شما ارسال می‌شود.`
    );

    // تلاش برای اجرای خودکار از طریق صرافی متصل — فقط اگر ادمین حالت API را «خودکار» کرده باشد؛
    // در غیر این صورت (پیش‌فرض فعلی) هیچ کاری نمی‌کند و سفارش دقیقاً مثل قبل دستی می‌ماند.
    let autoResult = { executed: false };
    try {
      autoResult = await tryAutoFulfillBuy({ orderId, telegramId: ctx.from.id, productKey, amount, trackingCode }, bot);
    } catch (e) { console.error('خطا در اجرای خودکار سفارش خرید:', e.message); }

    if (autoResult.executed) return; // کاربر و لاگ قبلاً داخل exchangeEngine مطلع شدند

    // اطلاع فوری به ادمین‌ها با اطلاعات کامل مشتری، همراه دکمه تحویل مستقیم
    const custUser = await getUser(ctx.from.id);
    const ids = await adminIdsList();
    for (const id of ids) {
      try {
        await ctx.telegram.sendMessage(id,
          `🛒 سفارش خرید جدید\n` +
          `👤 آیدی مشتری: ${ctx.from.id}\n` +
          `👤 نام: ${custUser ? (custUser.full_name || 'ثبت نشده') : 'ثبت نشده'}\n` +
          `📱 تلفن: ${custUser ? (custUser.phone || 'ثبت نشده') : 'ثبت نشده'}\n` +
          `💳 کارت: ${custUser ? (custUser.card_number || 'ثبت نشده') : 'ثبت نشده'}\n` +
          `🛍 محصول: ${product.name}\n` +
          `💵 مبلغ نهایی: ${finalAmount.toLocaleString('en-US')} تومان\n` +
          `📍 کد پیگیری: ${trackingCode}`,
          { reply_markup: { inline_keyboard: [[{ text: '🎟 تحویل ووچر', callback_data: `admin_deliver_${orderId}` }, { text: '❌ رد سفارش', callback_data: `admin_buy_cancel_${orderId}` }]] } }
        );
      } catch (e) { console.error('خطا در اطلاع خرید به ادمین:', e.message); }
    }
  });
};
