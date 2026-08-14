// handlers/buy.js
const texts = require('../texts');
const { sessions, showMainMenu, fillTemplate, generateTrackingCode } = require('../utils');
const { pool, getUser, getSetting, getProducts, getProductByKey } = require('../db');
const { ADMIN_IDS, ADMIN_LEVELS } = require('../constants');
const R = require('./receipts');

module.exports = function registerBuyHandlers(bot) {

  async function showBuyList(ctx) {
    const products = await getProducts(true);
    if (products.length === 0) {
      return ctx.reply('❌ در حال حاضر هیچ محصول فعالی وجود ندارد.', {
        reply_markup: { inline_keyboard: [[{ text: '🔴 بازگشت', callback_data: 'back_main_menu' }]] }
      });
    }
    const buttons = products.map(p => [{ text: p.name, callback_data: 'buy_pick_' + p.key }]);
    buttons.push([{ text: '🔴 بازگشت', callback_data: 'back_main_menu' }]);
    return ctx.reply('🛍 محصول مورد نظر خود را انتخاب کنید:', {
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
    return showBuyList(ctx);
  });

  bot.action(/^buy_pick_(.+)$/, async (ctx) => {
    const key = ctx.match[1];
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    const product = await getProductByKey(key);
    if (!product || !product.active) return ctx.reply('❌ این محصول در دسترس نیست.');

    sessions[ctx.from.id] = {
      flow: 'buy',
      step: 'waiting_amount',
      data: {
        productType: key,
        productName: product.name,
        minAmount: Number(product.min_amount || 0),
        maxAmount: Number(product.max_amount || 0)
      }
    };

    return ctx.reply(
      `💵 مبلغ خرید ${product.name} را به تومان وارد کنید:\n(حداقل ${Number(product.min_amount || 0).toLocaleString('en-US')} تومان)`,
      { reply_markup: { inline_keyboard: [[{ text: '🔴 بازگشت', callback_data: 'buy_back' }]] } }
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

    const product = await getProductByKey(session.data.productType);
    let commission = 0;
    if (product) {
      if (product.commission_type === 'percentage') commission = Math.round(amount * (parseFloat(product.commission_value) / 100));
      else if (product.commission_type === 'fixed') commission = parseInt(product.commission_value, 10) || 0;
    }
    const finalAmount = amount + commission;

    session.data.amount = amount;
    session.data.commission = commission;
    session.data.finalAmount = finalAmount;
    session.step = 'waiting_confirm';

    try { await ctx.deleteMessage(); } catch (e) {}
    return ctx.reply(
      `📋 پیش‌فاکتور خرید\n` +
      `🛍 محصول: ${session.data.productName}\n` +
      `💰 مبلغ: ${amount.toLocaleString('en-US')} تومان\n` +
      `💳 کارمزد: ${commission.toLocaleString('en-US')} تومان\n` +
      `💵 قابل پرداخت: ${finalAmount.toLocaleString('en-US')} تومان\n\n` +
      `آیا تأیید می‌کنید؟`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ تأیید خرید', callback_data: 'buy_confirm' }],
            [{ text: '🔴 بازگشت', callback_data: 'buy_back' }]
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
        { reply_markup: { inline_keyboard: [[{ text: '🧳 شارژ کیف پول', callback_data: 'wallet_deposit' }], [{ text: '🔴 بازگشت', callback_data: 'buy_back' }]] } }
      );
    }

    await pool.query('UPDATE users SET balance = balance - $1 WHERE telegram_id = $2', [finalAmount, String(ctx.from.id)]);

    const trackingCode = 'VOC-' + Math.floor(1000000 + Math.random() * 9000000);
    const orderStatus = 'pending_delivery';

    await pool.query(
      'INSERT INTO orders (telegram_id, product_type, amount, commission, status, created_at, tracking_code) VALUES ($1, $2, $3, $4, $5, NOW(), $6)',
      [String(ctx.from.id), productKey, finalAmount, commission, orderStatus, trackingCode]
    );

    delete sessions[ctx.from.id];

    return ctx.reply(
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
  });
};
