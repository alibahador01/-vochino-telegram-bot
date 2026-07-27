const { Telegraf, Markup } = require('telegraf');
const { Pool } = require('pg');
const express = require('express');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => { res.send('Bot is alive and connected to Supabase!'); });
app.listen(PORT, () => { console.log(`Web server is running on port ${PORT}`); });

setInterval(() => {
  const url = 'https://vochino-telegram-bot.onrender.com';
  https.get(url, (res) => { console.log(`[Layer 1 - Web] Status: ${res.statusCode}`); }).on('error', (err) => {});
}, 2 * 60 * 1000);

setInterval(() => {
  const url = 'https://vochino-telegram-bot.onrender.com';
  https.get(url, (res) => { console.log(`[Layer 2 - Web] Status: ${res.statusCode}`); }).on('error', (err) => {});
}, 5 * 60 * 1000);

setInterval(async () => {
  try { await pool.query('SELECT 1'); console.log(`[Layer 3 - DB] Supabase pinged!`); } catch (err) {}
}, 3 * 60 * 1000);

setInterval(async () => {
  try { await pool.query('SELECT 1'); console.log(`[Layer 4 - DB] Supabase backup pinged!`); } catch (err) {}
}, 7 * 60 * 1000);

const bot = new Telegraf(process.env.BOT_TOKEN);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const ADMIN_IDS = [8231962200];
const DAILY_LIMIT_TEXT = '2,000,000';
const MIN_WITHDRAW = 100000;
const HOT_VOUCHER_MIN = 50000;
const DEFAULT_USD_RATE = 60000;
const BONUS_THRESHOLD = 500000;
const BONUS_AMOUNT = 100000;
const BONUS_WIN_PROBABILITY = 0.05;

const ALLOWED_REACTIONS = ['👍','👎','❤','🔥','🥰','👏','😁','🤔','🤯','😱','🤬','😢','🎉','🤩','🤮','💩','🙏','👌','🕊','🤡','🥱','🥴','😍','🐳','❤‍🔥','🌚','🌭','💯','🤣','⚡','🍌','🏆','💔','🤨','😐','🍓','🍾','💋','🖕','😈','😴','😭','🤓','👻','👨‍💻','👀','🎃','🙈','😇','😨','🤝','✍','🤗','🫡','🎅','🎄','☃','💅','🤪','🗿','🆒','💘','🙉','🦄','😘','💊','🙊','😎','👾','🤷‍♂','🤷','🤷‍♀','😡'];

const DEPOSIT_CARDS = [
  { number: '6219861819068106', owner: 'علی بهادر' },
  { number: '5047061669481125', owner: 'علی بهادر' }
];

function generateTrackingCode() {
  return 'VOC-' + Math.floor(100000 + Math.random() * 900000);
}

async function safeDelete(ctx) {
  try { await ctx.deleteMessage(); } catch (e) {}
}

const texts = {
  fa: {
    chooseLanguage: 'زبان خود را انتخاب کنید / Please choose your language:',
    welcome: 'به خانواده‌ی ما خوش اومدی! 🌟\nاینجا با خیال راحت خرید و فروش کن، ما همیشه پشتتیم.',
    requestPhone: 'برای تکمیل ثبت‌نام، لطفاً شماره تلفن خود را با دکمه‌ی زیر ارسال کنید 👇',
    sharePhoneButton: '📱 ارسال شماره تلفن',
    requestName: 'لطفاً نام و نام خانوادگی خود را وارد کنید:',
    requestCard: 'لطفاً شماره کارت بانکی خود را وارد کنید (کارتی که برای واریز استفاده می‌کنید):',
    rulesText: 'قوانین و شرایط استفاده:\n\n(متن قوانین بعداً از پنل مدیریت تکمیل می‌شود)\n\nتوجه: واریزی فقط از کارتی که به نام شما ثبت شده معتبر است.',
    confirmRulesButton: '✅ قوانین را می‌پذیرم',
    registrationSuccess: '🎉 ثبت‌نام شما با موفقیت انجام شد!\nاز همین حالا می‌تونی با خیال راحت خرید کنی.\nسقف خرید روزانه‌ت: ' + DAILY_LIMIT_TEXT + ' تومان',
    welcomeBack: 'خوش برگشتی، خوشحالیم دوباره می‌بینیمت! 👋',
    mustJoinTitle: 'برای استفاده از ربات، ابتدا باید عضو کانال زیر شوید:',
    joinChannelButton: '📢 عضویت در کانال',
    checkMembershipButton: '✅ عضو شدم',
    stillNotMember: 'هنوز عضو کانال نشده‌اید. لطفاً ابتدا عضو شوید، سپس دوباره تلاش کنید.',
    walletTitle: '🎒 جیب',
    walletBalance: '💰 موجودی فعلی شما: ',
    walletIncrease: '➕ افزایش موجودی',
    walletWithdraw: '💳 برداشت موجودی',
    walletAddCard: '➕ افزودن کارت جدید',
    depositMethodTitle: 'روش افزایش موجودی را انتخاب کنید:',
    depositCard2Card: '💳 کارت به کارت',
    depositTron: '🪙 ترون (تتر)',
    depositGateway: '🌐 درگاه پرداخت',
    comingSoon: 'به‌زودی 🙂',
    depositCardsTrust: '✅ پرداخت شما مستقیماً و بدون واسطه به حساب رسمی مجموعه واریز می‌شود.\n💚 هزاران کاربر با خیال راحت از این روش استفاده کرده‌اند.\n\nلطفاً مبلغ واریزی خود را به یکی از کارت‌های زیر واریز کنید:',
    depositAskAmount: 'مبلغ واریزی خود را به تومان وارد کنید:',
    depositAskReceipt: 'رسید (فیش) پرداخت خود را همینجا ارسال کنید 📎',
    depositSubmitted: 'درخواست شارژ شما ثبت شد ✅\nپس از بررسی توسط پشتیبانی (معمولاً خیلی سریع)، موجودی شما به‌روزرسانی خواهد شد.',
    withdrawAskAmount: 'مبلغ برداشت خود را به تومان وارد کنید (حداقل ' + MIN_WITHDRAW.toLocaleString('en-US') + ' تومان):',
    withdrawMinError: 'حداقل مبلغ برداشت ' + MIN_WITHDRAW.toLocaleString('en-US') + ' تومان است. لطفاً دوباره وارد کنید:',
    withdrawSelectCard: 'شماره کارت خود را انتخاب کنید:',
    withdrawSubmitted: 'درخواست برداشت شما ثبت شد ✅\nپس از بررسی توسط پشتیبانی، مبلغ به کارت شما واریز خواهد شد.',
    addCardAsk: 'شماره کارت جدید را وارد کنید (۱۶ رقم):',
    addCardInvalid: 'شماره کارت وارد شده معتبر نیست. لطفاً دوباره تلاش کنید:',
    addCardSuccess: 'کارت جدید با موفقیت ثبت شد ✅',
    addCardButton: '➕ افزودن کارت جدید',
    buyMenuTitle: '✨ کدوم محصول رو می‌خوای بخری؟',
    buyNoProducts: 'فعلاً هیچ محصولی برای فروش تعریف نشده.',
    buyAskAmountUsd: '💵 قیمت هر دلار: {rate} تومان\n💰 حداقل خرید: {minUsd} دلار (حدود {minToman} تومان)\n\nمبلغ خرید خود را به تومان وارد کنید:\nمثال: 200000',
    buyAskAmountToman: '💰 حداقل خرید: {min} تومان\n\nمبلغ خرید خود را به تومان وارد کنید:\nمثال: 200000',
    buyMinError: 'مبلغ واردشده کمتر از حداقل خرید ({min} تومان) است. لطفاً دوباره وارد کنید:',
    buyConfirmSummary: '📦 خلاصه‌ی سفارش:\n\nمحصول: {product}\nمبلغ: {amount} تومان\n\nبا تایید، این مبلغ از موجودی کیف پولت کسر می‌شه.',
    buyConfirmButton: '✅ تایید و خرید',
    buyCancelButton: '❌ انصراف',
    buySuccess: '🎉 خرید شما با موفقیت انجام شد!\n\n🆔 کد پیگیری: {trackingCode}\n📦 محصول: {product}\n💰 مبلغ: {amount} تومان\n\nموجودی جدید: {balance} تومان',
    buyInsufficientBalance: '❌ موجودی کیف پولت کافی نیست.\nمبلغ سفارش: {amount} تومان\nموجودی فعلی: {balance} تومان\n\nاول کیف پولت رو شارژ کن، بعد دوباره امتحان کن.',
    buyChargeWalletButton: '💳 شارژ کیف پول',
    buyCancelled: 'سفارش لغو شد.',
    profileTitle: '👤 پروفایل شما',
    invoicesTitle: '🧾 فاکتورهای من',
    invoicesEmpty: 'هنوز هیچ فاکتوری برای شما ثبت نشده.',
    supportTitle: '📞 پشتیبانی\n\nقبل از تماس، یه نگاه به سوالات متداول بنداز، شاید جوابت همونجا باشه 👇',
    supportFaqButton: '❓ سوالات متداول',
    supportContactButton: '💬 ارتباط با پشتیبانی',
    supportContactText: 'برای ارتباط مستقیم با پشتیبانی، پیام خودتون رو همینجا بنویسید تا در اسرع وقت جواب بگیرید.',
    faqText: '❓ سوالات متداول\n\n🔹 چقدر طول می‌کشه شارژم تایید بشه؟\nمعمولاً چند دقیقه، حداکثر تا چند ساعت.\n\n🔹 حداقل مبلغ برداشت چقدره؟\n' + MIN_WITHDRAW.toLocaleString('en-US') + ' تومان.\n\n🔹 آیا واریزی از کارت دیگران قبوله؟\nنه، فقط از کارتی که به نام خودتون ثبت شده.\n\n🔹 بونوس بازی چطور فعال می‌شه؟\nبا رسیدن مجموع خریدت به ' + BONUS_THRESHOLD.toLocaleString('en-US') + ' تومان، یه بونوس بازی برات فعال می‌شه.',
    gameMenuTitle: '🎮 بازی و بونوس',
    gameNotEligible: '🔒 هنوز بونوس بازی برات فعال نشده.\n\nبا رسیدن مجموع خریدت به ' + BONUS_THRESHOLD.toLocaleString('en-US') + ' تومان، یه بونوس ' + BONUS_AMOUNT.toLocaleString('en-US') + ' تومنی می‌گیری که می‌تونی باهاش بازی کنی و ببری! 🎁',
    gameEligibleIntro: '🎁 تبریک! یه بونوس ' + BONUS_AMOUNT.toLocaleString('en-US') + ' تومنی داری.\nیکی از بازی‌های زیر رو انتخاب کن و شانستو امتحان کن. اگه ببری، مبلغ مستقیم میاد تو موجودیت و می‌تونی همون لحظه برداشت بزنی 💸',
    gameAlreadyUsed: 'بونوس بازیت رو قبلاً استفاده کردی. با رسیدن به سقف خرید بعدی، دوباره یه بونوس جدید فعال می‌شه.',
    gameDiceButton: '🎲 بازی تاس',
    gameBasketballButton: '🏀 بازی بسکتبال',
    gamePlaying: '🎲 در حال بازی... منتظر بمون تا نتیجه مشخص بشه...',
    gameWin: '🎉🎉 تبریک، بردی!!\nمبلغ ' + BONUS_AMOUNT.toLocaleString('en-US') + ' تومان به موجودیت اضافه شد. می‌تونی همین الان برداشت بزنی 💸',
    gameLose: '😔 این بار نبردی، بونوست مصرف شد.\nنگران نباش، با خرید بعدیت دوباره شانس داری!'
  }
};

const mainMenuButtons = [
  { key: 'buy', text: '✨ خرید' },
  { key: 'sell', text: '✨ فروش' },
  { key: 'wallet', text: '🎒 جیب' },
  { key: 'profile', text: '🧢 پروفایل' },
  { key: 'game', text: '🎮 بازی بونوس' },
  { key: 'rules_education', text: '📚 قوانین و آموزش' },
  { key: 'support', text: '📥 پشتیبانی' }
];

function showMainMenu(ctx) {
  const rows = [];
  for (let i = 0; i < mainMenuButtons.length; i += 2) {
    const row = [];
    row.push({ text: mainMenuButtons[i].text, callback_data: 'menu_' + mainMenuButtons[i].key });
    if (mainMenuButtons[i + 1]) row.push({ text: mainMenuButtons[i + 1].text, callback_data: 'menu_' + mainMenuButtons[i + 1].key });
    rows.push(row);
  }
  ctx.reply('منوی اصلی 🏠', { reply_markup: { inline_keyboard: rows } });
}

const sessions = {};

async function getUser(telegramId) {
  const res = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [String(telegramId)]);
  return res.rows[0] || null;
}

async function getUserCards(telegramId) {
  const user = await getUser(telegramId);
  const extraRes = await pool.query('SELECT * FROM cards WHERE telegram_id = $1', [String(telegramId)]);
  const list = [];
  if (user && user.card_number) list.push({ card_number: user.card_number });
  extraRes.rows.forEach(c => list.push({ card_number: c.card_number }));
  return list;
}

async function checkMembership(ctx) {
  const channelsRes = await pool.query('SELECT * FROM required_channels WHERE active = 1');
  const channels = channelsRes.rows;
  if (channels.length === 0) return true;
  for (const channel of channels) {
    try {
      const member = await ctx.telegram.getChatMember(channel.chat_id, ctx.from.id);
      if (member.status === 'left' || member.status === 'kicked') return false;
    } catch (e) { return false; }
  }
  return true;
}

async function showJoinPrompt(ctx) {
  const channelsRes = await pool.query('SELECT * FROM required_channels WHERE active = 1');
  const buttons = channelsRes.rows.map(c => [{ text: texts.fa.joinChannelButton, url: c.invite_link }]);
  buttons.push([{ text: texts.fa.checkMembershipButton, callback_data: 'check_membership' }]);
  ctx.reply(texts.fa.mustJoinTitle, { reply_markup: { inline_keyboard: buttons } });
}

function isAdmin(telegramId) {
  return ADMIN_IDS.indexOf(Number(telegramId)) !== -1;
}

async function getUsdRate() {
  const res = await pool.query('SELECT value FROM settings WHERE key = $1', ['usd_rate']);
  return res.rows.length > 0 ? Number(res.rows[0].value) : DEFAULT_USD_RATE;
}

function fillTemplate(template, data) {
  let result = template;
  for (const key in data) result = result.replace(new RegExp('\\{' + key + '\\}', 'g'), data[key]);
  return result;
}

async function grantBonusIfEligible(telegramId) {
  const totalBuyRes = await pool.query('SELECT COALESCE(SUM(amount), 0) AS total FROM orders WHERE telegram_id = $1 AND status = $2', [String(telegramId), 'completed']);
  const totalBuy = Number(totalBuyRes.rows[0].total);
  if (totalBuy >= BONUS_THRESHOLD) {
    const existing = await pool.query('SELECT * FROM bonuses WHERE telegram_id = $1 AND status = $2', [String(telegramId), 'available']);
    if (existing.rows.length === 0) {
      await pool.query('INSERT INTO bonuses (telegram_id, status, amount, created_at) VALUES ($1, $2, $3, $4)', [String(telegramId), 'available', BONUS_AMOUNT, new Date().toISOString()]);
    }
  }
    }// ====================== دستورات ادمین ======================

bot.command('setreaction', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    const currentRes = await pool.query('SELECT value FROM settings WHERE key = $1', ['start_reaction']);
    const current = currentRes.rows[0] ? currentRes.rows[0].value : '🔥';
    return ctx.reply('❌ لطفاً ایموجی مورد نظر را بعد از دستور وارد کنید.\nایموجی فعلی: ' + current);
  }
  const newEmoji = args[1];
  if (ALLOWED_REACTIONS.indexOf(newEmoji) === -1) return ctx.reply('⚠️ این ایموجی مجاز نیست.');
  try {
    await ctx.telegram.setMessageReaction(ctx.chat.id, ctx.message.message_id, [{ type: 'emoji', emoji: newEmoji }], true);
  } catch (e) { return ctx.reply('⚠️ خطا: ' + e.message); }
  await pool.query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', ['start_reaction', newEmoji]);
  ctx.reply('✅ اکشن استارت تغییر کرد به ' + newEmoji);
});

bot.command('setrate', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    const currentRate = await getUsdRate();
    return ctx.reply('❌ نرخ جدید را وارد کنید.\nنرخ فعلی: ' + currentRate.toLocaleString('en-US'));
  }
  const newRate = parseInt(args[1].replace(/[^0-9]/g, ''), 10);
  if (!newRate || newRate <= 0) return ctx.reply('⚠️ عدد معتبر نیست.');
  await pool.query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', ['usd_rate', String(newRate)]);
  ctx.reply('✅ نرخ دلار تغییر کرد به ' + newRate.toLocaleString('en-US'));
});

bot.command('addproduct', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const raw = ctx.message.text.replace(/^\/addproduct(@\w+)?\s*/, '');
  const parts = raw.split('|').map(p => p.trim());
  if (parts.length < 4) return ctx.reply('❌ فرمت: /addproduct کلید|نام|حداقل|usd یا toman|کارمزد');
  const [key, name, minAmountRaw, priceType, feeRaw] = parts;
  const minAmount = Number(minAmountRaw.replace(/[^0-9.]/g, ''));
  const sellFee = feeRaw ? Number(feeRaw.replace(/[^0-9]/g, '')) : 20000;
  if (!key || !name || !minAmount || (priceType !== 'usd' && priceType !== 'toman')) return ctx.reply('❌ مقادیر نامعتبر');
  await pool.query(
    `INSERT INTO products (key, name, min_amount, price_type, active, buy_active, sell_active, sell_fee, created_at) 
     VALUES ($1,$2,$3,$4,1,1,1,$5,$6) 
     ON CONFLICT (key) DO UPDATE SET name=EXCLUDED.name, min_amount=EXCLUDED.min_amount, price_type=EXCLUDED.price_type, active=1, sell_fee=EXCLUDED.sell_fee`,
    [key, name, minAmount, priceType, sellFee, new Date().toISOString()]
  );
  ctx.reply('✅ محصول «' + name + '» اضافه شد. کارمزد فروش: ' + sellFee.toLocaleString('en-US'));
});

bot.command('listproducts', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const res = await pool.query('SELECT * FROM products ORDER BY id ASC');
  if (res.rows.length === 0) return ctx.reply('محصولی وجود ندارد.');
  let message = '📦 لیست محصولات:\n\n';
  res.rows.forEach(p => {
    message += `کلید: ${p.key}\nنام: ${p.name}\nحداقل: ${p.min_amount}\nکارمزد فروش: ${p.sell_fee || 20000}\nوضعیت: ${p.active ? 'فعال' : 'غیرفعال'}\n\n`;
  });
  ctx.reply(message);
});

bot.command('removeproduct', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const args = ctx.message.text.split(' ');
  if (args.length < 2) return ctx.reply('❌ کلید محصول را وارد کنید');
  const res = await pool.query("UPDATE products SET active = 0 WHERE key = $1 RETURNING name", [args[1].trim()]);
  if (res.rows.length === 0) return ctx.reply('محصول پیدا نشد');
  ctx.reply('✅ محصول «' + res.rows[0].name + '» غیرفعال شد');
});

bot.command('find', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const args = ctx.message.text.split(' ');
  if (args.length < 2) return ctx.reply('❌ کد پیگیری را بنویس');
  const code = args[1].trim().toUpperCase();
  const orderRes = await pool.query('SELECT * FROM orders WHERE tracking_code = $1', [code]);
  const walletRes = await pool.query('SELECT * FROM wallet_requests WHERE tracking_code = $1', [code]);
  const sellRes = await pool.query('SELECT * FROM sell_orders WHERE tracking_code = $1', [code]);
  if (orderRes.rows.length === 0 && walletRes.rows.length === 0 && sellRes.rows.length === 0) return ctx.reply('❌ چیزی پیدا نشد');
  if (orderRes.rows.length > 0) {
    const o = orderRes.rows[0];
    const user = await getUser(o.telegram_id);
    ctx.reply(`📦 خرید\nکد: ${o.tracking_code}\nکاربر: ${user ? user.full_name : '-'}\nمحصول: ${o.product_type}\nمبلغ: ${Number(o.amount).toLocaleString('en-US')}\nوضعیت: ${o.status}`);
  }
  if (walletRes.rows.length > 0) {
    const w = walletRes.rows[0];
    const user = await getUser(w.telegram_id);
    ctx.reply(`${w.type === 'deposit' ? '➕ شارژ' : '💳 برداشت'}\nکد: ${w.tracking_code}\nکاربر: ${user ? user.full_name : '-'}\nمبلغ: ${Number(w.amount).toLocaleString('en-US')}\nوضعیت: ${w.status}`);
  }
  if (sellRes.rows.length > 0) {
    const s = sellRes.rows[0];
    const user = await getUser(s.telegram_id);
    ctx.reply(`💰 فروش\nکد: ${s.tracking_code}\nکاربر: ${user ? user.full_name : '-'}\nمحصول: ${s.product_name}\nکد ووچر: ${s.voucher_code}\nوضعیت: ${s.status}`);
  }
});

bot.command('admin', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const pendingWallet = await pool.query("SELECT COUNT(*) AS c FROM wallet_requests WHERE status = 'pending'");
  const pendingSell = await pool.query("SELECT COUNT(*) AS c FROM sell_orders WHERE status = 'pending'");
  ctx.reply(`👑 پنل مدیریت\n\nدرخواست کیف پول: ${pendingWallet.rows[0].c}\nدرخواست فروش: ${pendingSell.rows[0].c}`, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📥 درخواست‌های کیف پول', callback_data: 'admin_pending' }],
        [{ text: '💰 درخواست‌های فروش', callback_data: 'admin_sell_pending' }]
      ]
    }
  });
});

// ====================== شروع و عضویت ======================

async function triggerStartReaction(ctx) {
  try {
    const settingRes = await pool.query('SELECT value FROM settings WHERE key = $1', ['start_reaction']);
    let emoji = settingRes.rows[0] ? settingRes.rows[0].value : '🎉';
    if (ALLOWED_REACTIONS.indexOf(emoji) === -1) emoji = '🎉';
    await ctx.telegram.setMessageReaction(ctx.chat.id, ctx.message.message_id, [{ type: 'emoji', emoji: emoji }], true);
  } catch (e) {}
}

bot.start(async (ctx) => {
  triggerStartReaction(ctx);
  const isMember = await checkMembership(ctx);
  if (!isMember) return showJoinPrompt(ctx);
  const existingUser = await getUser(ctx.from.id);
  if (existingUser) {
    ctx.reply(texts.fa.welcomeBack);
    return showMainMenu(ctx);
  }
  ctx.reply(texts.fa.chooseLanguage, {
    reply_markup: { inline_keyboard: [[{ text: '🇮🇷 فارسی', callback_data: 'lang_fa' }, { text: '🇬🇧 English', callback_data: 'lang_en' }]] }
  });
});

bot.action('check_membership', async (ctx) => {
  ctx.answerCbQuery();
  if (!(await checkMembership(ctx))) return ctx.reply(texts.fa.stillNotMember);
  await safeDelete(ctx);
  const existingUser = await getUser(ctx.from.id);
  if (existingUser) {
    ctx.reply(texts.fa.welcomeBack);
    showMainMenu(ctx);
  } else {
    ctx.reply(texts.fa.chooseLanguage, {
      reply_markup: { inline_keyboard: [[{ text: '🇮🇷 فارسی', callback_data: 'lang_fa' }, { text: '🇬🇧 English', callback_data: 'lang_en' }]] }
    });
  }
});

function handleLanguageChoice(ctx, lang) {
  sessions[ctx.from.id] = { flow: 'registration', step: 'waiting_phone', lang, data: {} };
  try { ctx.editMessageText(texts.fa.welcome); } catch (e) { ctx.reply(texts.fa.welcome); }
  ctx.reply(texts.fa.requestPhone, Markup.keyboard([Markup.button.contactRequest(texts.fa.sharePhoneButton)]).resize().oneTime());
}

bot.action('lang_fa', ctx => handleLanguageChoice(ctx, 'fa'));
bot.action('lang_en', ctx => handleLanguageChoice(ctx, 'fa'));

bot.on('contact', ctx => {
  const session = sessions[ctx.from.id];
  if (!session || session.flow !== 'registration') return;
  session.data.phone = ctx.message.contact.phone_number;
  session.step = 'waiting_name';
  ctx.reply(texts.fa.requestName, { reply_markup: { remove_keyboard: true } });
});

// ====================== منوهای اصلی ======================

bot.action('menu_wallet', async (ctx) => {
  ctx.answerCbQuery();
  await safeDelete(ctx);
  const user = await getUser(ctx.from.id);
  const balance = user ? user.balance : 0;
  ctx.reply(texts.fa.walletTitle + '\n\n' + texts.fa.walletBalance + Number(balance).toLocaleString('en-US') + ' تومان', {
    reply_markup: {
      inline_keyboard: [
        [{ text: texts.fa.walletIncrease, callback_data: 'wallet_deposit' }],
        [{ text: texts.fa.walletWithdraw, callback_data: 'wallet_withdraw' }],
        [{ text: texts.fa.walletAddCard, callback_data: 'wallet_addcard' }],
        [{ text: '🧾 گزارش تراکنش‌ها', callback_data: 'menu_invoices' }],
        [{ text: '🔙 بازگشت', callback_data: 'back_main_menu' }]
      ]
    }
  });
});

bot.action('menu_profile', async (ctx) => {
  ctx.answerCbQuery();
  await safeDelete(ctx);
  const user = await getUser(ctx.from.id);
  if (!user) return ctx.reply('اطلاعاتی ثبت نشده');
  ctx.reply(`${texts.fa.profileTitle}\n\n👤 نام: ${user.full_name || '-'}\n📱 شماره: ${user.phone || '-'}\n💳 کارت: ${user.card_number || '-'}\n💰 موجودی: ${Number(user.balance).toLocaleString('en-US')} تومان`, {
    reply_markup: { inline_keyboard: [[{ text: '🔙 بازگشت', callback_data: 'back_main_menu' }]] }
  });
});

bot.action('back_main_menu', async (ctx) => {
  ctx.answerCbQuery();
  await safeDelete(ctx);
  showMainMenu(ctx);
});

bot.action('cancel_flow', async (ctx) => {
  ctx.answerCbQuery();
  delete sessions[ctx.from.id];
  await safeDelete(ctx);
  showMainMenu(ctx);
});

bot.action('menu_invoices', async (ctx) => {
  ctx.answerCbQuery();
  await safeDelete(ctx);
  const ordersRes = await pool.query('SELECT * FROM orders WHERE telegram_id = $1 ORDER BY id DESC LIMIT 8', [String(ctx.from.id)]);
  const walletRes = await pool.query('SELECT * FROM wallet_requests WHERE telegram_id = $1 ORDER BY id DESC LIMIT 8', [String(ctx.from.id)]);
  const sellRes = await pool.query('SELECT * FROM sell_orders WHERE telegram_id = $1 ORDER BY id DESC LIMIT 8', [String(ctx.from.id)]);
  if (ordersRes.rows.length === 0 && walletRes.rows.length === 0 && sellRes.rows.length === 0) return ctx.reply(texts.fa.invoicesEmpty);
  let message = texts.fa.invoicesTitle + '\n\n';
  ordersRes.rows.forEach(o => { message += `📦 خرید | ${o.product_type} | ${Number(o.amount).toLocaleString('en-US')} | ${o.status}\n`; });
  walletRes.rows.forEach(w => { message += `${w.type === 'deposit' ? '➕ شارژ' : '💳 برداشت'} | ${Number(w.amount).toLocaleString('en-US')} | ${w.status}\n`; });
  sellRes.rows.forEach(s => { message += `💰 فروش | ${s.product_name} | ${s.status}\n`; });
  ctx.reply(message, { reply_markup: { inline_keyboard: [[{ text: '🔙 بازگشت', callback_data: 'back_main_menu' }]] } });
});

bot.action('menu_support', async (ctx) => {
  ctx.answerCbQuery();
  await safeDelete(ctx);
  ctx.reply(texts.fa.supportTitle, {
    reply_markup: {
      inline_keyboard: [
        [{ text: texts.fa.supportFaqButton, callback_data: 'support_faq' }],
        [{ text: texts.fa.supportContactButton, callback_data: 'support_contact' }],
        [{ text: '🔙 بازگشت', callback_data: 'back_main_menu' }]
      ]
    }
  });
});

bot.action('support_faq', async (ctx) => {
  ctx.answerCbQuery();
  await safeDelete(ctx);
  ctx.reply(texts.fa.faqText, { reply_markup: { inline_keyboard: [[{ text: '🔙 بازگشت', callback_data: 'menu_support' }]] } });
});

bot.action('support_contact', async (ctx) => {
  ctx.answerCbQuery();
  await safeDelete(ctx);
  ctx.reply(texts.fa.supportContactText);
});

bot.action('menu_rules_education', async (ctx) => {
  ctx.answerCbQuery();
  await safeDelete(ctx);
  ctx.reply(texts.fa.rulesText + '\n\n📚 آموزش به‌زودی اضافه می‌شود.');
});

bot.action('menu_game', async (ctx) => {
  ctx.answerCbQuery();
  await safeDelete(ctx);
  const user = await getUser(ctx.from.id);
  if (!user) return ctx.reply('ابتدا ثبت‌نام کنید');
  const totalBuyRes = await pool.query('SELECT COALESCE(SUM(amount), 0) AS total FROM orders WHERE telegram_id = $1 AND status = $2', [String(ctx.from.id), 'completed']);
  const totalBuy = Number(totalBuyRes.rows[0].total);
  const bonusRes = await pool.query('SELECT * FROM bonuses WHERE telegram_id = $1 AND status = $2', [String(ctx.from.id), 'available']);
  if (totalBuy < BONUS_THRESHOLD && bonusRes.rows.length === 0) return ctx.reply(texts.fa.gameNotEligible);
  if (bonusRes.rows.length > 0) {
    ctx.reply(texts.fa.gameEligibleIntro, {
      reply_markup: {
        inline_keyboard: [
          [{ text: texts.fa.gameDiceButton, callback_data: 'game_dice' }],
          [{ text: texts.fa.gameBasketballButton, callback_data: 'game_basketball' }],
          [{ text: '🔙 بازگشت', callback_data: 'back_main_menu' }]
        ]
      }
    });
  } else ctx.reply(texts.fa.gameAlreadyUsed);
});

bot.action('game_dice', async (ctx) => { ctx.answerCbQuery(); await safeDelete(ctx); await playGame(ctx); });
bot.action('game_basketball', async (ctx) => { ctx.answerCbQuery(); await safeDelete(ctx); await playGame(ctx); });

async function playGame(ctx) {
  const bonusRes = await pool.query('SELECT * FROM bonuses WHERE telegram_id = $1 AND status = $2 LIMIT 1', [String(ctx.from.id), 'available']);
  if (bonusRes.rows.length === 0) return ctx.reply(texts.fa.gameAlreadyUsed);
  const bonus = bonusRes.rows[0];
  ctx.reply(texts.fa.gamePlaying);
  const win = Math.random() < BONUS_WIN_PROBABILITY;
  if (win) {
    await pool.query('UPDATE users SET balance = balance + $1 WHERE telegram_id = $2', [BONUS_AMOUNT, String(ctx.from.id)]);
    await pool.query("UPDATE bonuses SET status = 'used' WHERE id = $1", [bonus.id]);
    ctx.reply(texts.fa.gameWin);
  } else {
    await pool.query("UPDATE bonuses SET status = 'used' WHERE id = $1", [bonus.id]);
    ctx.reply(texts.fa.gameLose);// ====================== خرید ======================

bot.action('menu_buy', async (ctx) => {
  ctx.answerCbQuery();
  await safeDelete(ctx);
  const productsRes = await pool.query('SELECT * FROM products WHERE active = 1 AND buy_active = 1 ORDER BY id ASC');
  if (productsRes.rows.length === 0) return ctx.reply(texts.fa.buyNoProducts);
  const buttons = productsRes.rows.map(p => [{ text: p.name, callback_data: 'buy_' + p.key }]);
  buttons.push([{ text: '🔙 بازگشت', callback_data: 'back_main_menu' }]);
  ctx.reply(texts.fa.buyMenuTitle, { reply_markup: { inline_keyboard: buttons } });
});

bot.action(/^buy_(.+)/, async (ctx) => {
  const key = ctx.match[1];
  ctx.answerCbQuery();
  const productRes = await pool.query('SELECT * FROM products WHERE key = $1 AND active = 1 AND buy_active = 1', [key]);
  const product = productRes.rows[0];
  if (!product) { await safeDelete(ctx); return ctx.reply(texts.fa.buyNoProducts); }

  let minToman, messageText;
  if (product.price_type === 'usd') {
    const rate = await getUsdRate();
    minToman = Math.round(Number(product.min_amount) * rate);
    messageText = fillTemplate(texts.fa.buyAskAmountUsd, { rate: rate.toLocaleString('en-US'), minUsd: Number(product.min_amount).toLocaleString('en-US'), minToman: minToman.toLocaleString('en-US') });
  } else {
    minToman = Number(product.min_amount);
    messageText = fillTemplate(texts.fa.buyAskAmountToman, { min: minToman.toLocaleString('en-US') });
  }

  sessions[ctx.from.id] = { flow: 'buy', step: 'waiting_amount', data: { productType: product.key, productLabel: product.name, minAmount: minToman } };
  try {
    await ctx.editMessageText(messageText, { reply_markup: { inline_keyboard: [[{ text: '🔙 بیخیال', callback_data: 'cancel_flow' }]] } });
  } catch (e) {
    await safeDelete(ctx);
    const sent = await ctx.reply(messageText, { reply_markup: { inline_keyboard: [[{ text: '🔙 بیخیال', callback_data: 'cancel_flow' }]] } });
    sessions[ctx.from.id].lastBotMsgId = sent.message_id;
  }
});

bot.action('buy_confirm', async (ctx) => {
  ctx.answerCbQuery();
  const session = sessions[ctx.from.id];
  if (!session || session.flow !== 'buy' || session.step !== 'waiting_confirm') {
    await safeDelete(ctx);
    return ctx.reply(texts.fa.buyCancelled);
  }
  const user = await getUser(ctx.from.id);
  const amount = session.data.amount;
  await safeDelete(ctx);
  if (!user || Number(user.balance) < amount) {
    delete sessions[ctx.from.id];
    return ctx.reply(fillTemplate(texts.fa.buyInsufficientBalance, { amount: amount.toLocaleString('en-US'), balance: user ? Number(user.balance).toLocaleString('en-US') : '0' }), {
      reply_markup: { inline_keyboard: [[{ text: texts.fa.buyChargeWalletButton, callback_data: 'wallet_deposit' }]] }
    });
  }
  await pool.query('UPDATE users SET balance = balance - $1 WHERE telegram_id = $2', [amount, String(ctx.from.id)]);
  const trackingCode = generateTrackingCode();
  await pool.query('INSERT INTO orders (telegram_id, product_type, amount, status, created_at, tracking_code) VALUES ($1,$2,$3,$4,$5,$6)', [String(ctx.from.id), session.data.productType, amount, 'completed', new Date().toISOString(), trackingCode]);
  const newBalanceRes = await pool.query('SELECT balance FROM users WHERE telegram_id = $1', [String(ctx.from.id)]);
  delete sessions[ctx.from.id];
  ctx.reply(fillTemplate(texts.fa.buySuccess, { product: session.data.productLabel, amount: amount.toLocaleString('en-US'), balance: Number(newBalanceRes.rows[0].balance).toLocaleString('en-US'), trackingCode }));
  await grantBonusIfEligible(ctx.from.id);
});

bot.action('buy_cancel', async (ctx) => {
  ctx.answerCbQuery();
  delete sessions[ctx.from.id];
  await safeDelete(ctx);
  ctx.reply(texts.fa.buyCancelled);
});

// ====================== فروش ======================

bot.action('menu_sell', async (ctx) => {
  ctx.answerCbQuery();
  await safeDelete(ctx);
  const productsRes = await pool.query('SELECT * FROM products WHERE active = 1 AND sell_active = 1 ORDER BY id ASC');
  if (productsRes.rows.length === 0) return ctx.reply('فعلاً هیچ محصولی برای فروش فعال نیست.');
  const buttons = productsRes.rows.map(p => [{ text: p.name, callback_data: 'sell_product_' + p.key }]);
  buttons.push([{ text: '🔙 بازگشت', callback_data: 'back_main_menu' }]);
  ctx.reply('کدام محصول را می‌خواهید بفروشید؟', { reply_markup: { inline_keyboard: buttons } });
});

bot.action(/^sell_product_(.+)/, async (ctx) => {
  ctx.answerCbQuery();
  await safeDelete(ctx);
  const key = ctx.match[1];
  const productRes = await pool.query('SELECT * FROM products WHERE key = $1 AND active = 1 AND sell_active = 1', [key]);
  const product = productRes.rows[0];
  if (!product) return ctx.reply('این محصول برای فروش فعال نیست.');
  sessions[ctx.from.id] = { flow: 'sell', step: 'waiting_code', data: { productKey: product.key, productName: product.name, fee: product.sell_fee || 20000 } };
  const msg = `محصول: ${product.name}\nکارمزد فروش: ${Number(product.sell_fee || 20000).toLocaleString('en-US')} تومان\n\nلطفاً کد را به صورت صحیح ارسال کنید:`;
  const sent = await ctx.reply(msg, { reply_markup: { inline_keyboard: [[{ text: '🔙 انصراف', callback_data: 'cancel_flow' }]] } });
  sessions[ctx.from.id].lastBotMsgId = sent.message_id;
});

// ====================== کیف پول ======================

bot.action('wallet_deposit', async (ctx) => {
  ctx.answerCbQuery();
  await safeDelete(ctx);
  ctx.reply(texts.fa.depositMethodTitle, {
    reply_markup: {
      inline_keyboard: [
        [{ text: texts.fa.depositCard2Card, callback_data: 'deposit_card2card' }],
        [{ text: texts.fa.depositTron, callback_data: 'deposit_tron' }],
        [{ text: texts.fa.depositGateway, callback_data: 'deposit_gateway' }]
      ]
    }
  });
});

bot.action('deposit_tron', async (ctx) => { ctx.answerCbQuery(); await safeDelete(ctx); ctx.reply(texts.fa.comingSoon); });
bot.action('deposit_gateway', async (ctx) => { ctx.answerCbQuery(); await safeDelete(ctx); ctx.reply(texts.fa.comingSoon); });

bot.action('deposit_card2card', async (ctx) => {
  ctx.answerCbQuery();
  await safeDelete(ctx);
  let cardsMessage = texts.fa.depositCardsTrust + '\n\n';
  DEPOSIT_CARDS.forEach(c => { cardsMessage += '`' + c.number + '`\n' + c.owner + '\n\n'; });
  await ctx.reply(cardsMessage, { parse_mode: 'Markdown' });
  sessions[ctx.from.id] = { flow: 'deposit', step: 'waiting_amount', data: {} };
  const sent = await ctx.reply(texts.fa.depositAskAmount, { reply_markup: { inline_keyboard: [[{ text: '🔙 بیخیال', callback_data: 'cancel_flow' }]] } });
  sessions[ctx.from.id].lastBotMsgId = sent.message_id;
});

bot.action('wallet_withdraw', async (ctx) => {
  ctx.answerCbQuery();
  await safeDelete(ctx);
  sessions[ctx.from.id] = { flow: 'withdraw', step: 'waiting_amount', data: {} };
  const sent = await ctx.reply(texts.fa.withdrawAskAmount, { reply_markup: { inline_keyboard: [[{ text: '🔙 بیخیال', callback_data: 'cancel_flow' }]] } });
  sessions[ctx.from.id].lastBotMsgId = sent.message_id;
});

bot.action(/^withdraw_card_(.+)$/, async (ctx) => {
  ctx.answerCbQuery();
  await safeDelete(ctx);
  const cardNumber = ctx.match[1];
  const session = sessions[ctx.from.id];
  const amount = session?.data?.amount;
  const trackingCode = generateTrackingCode();
  await pool.query('INSERT INTO wallet_requests (telegram_id, type, amount, card_number, status, created_at, tracking_code) VALUES ($1,$2,$3,$4,$5,$6,$7)', [String(ctx.from.id), 'withdraw', amount, cardNumber, 'pending', new Date().toISOString(), trackingCode]);
  delete sessions[ctx.from.id];
  ctx.reply(texts.fa.withdrawSubmitted + '\n\n🆔 کد پیگیری: ' + trackingCode);
});

bot.action('wallet_addcard', async (ctx) => {
  ctx.answerCbQuery();
  await safeDelete(ctx);
  sessions[ctx.from.id] = { flow: 'addcard', step: 'waiting_card', data: {} };
  const sent = await ctx.reply(texts.fa.addCardAsk);
  sessions[ctx.from.id].lastBotMsgId = sent.message_id;
});

// ====================== ادمین کیف پول و فروش ======================

bot.action('admin_pending', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  ctx.answerCbQuery();
  await safeDelete(ctx);
  const pendingRes = await pool.query("SELECT * FROM wallet_requests WHERE status = 'pending' ORDER BY id ASC");
  if (pendingRes.rows.length === 0) return ctx.reply('هیچ درخواستی در انتظار نیست ✅');
  for (const req of pendingRes.rows) {
    const user = await getUser(req.telegram_id);
    const typeLabel = req.type === 'deposit' ? '➕ افزایش موجودی' : '💳 برداشت';
    let message = `${typeLabel}\n🆔 ${req.tracking_code || '-'}\nکاربر: \( {user ? user.full_name : 'نامشخص'} ( \){req.telegram_id})\nمبلغ: ${Number(req.amount).toLocaleString('en-US')}`;
    if (req.type === 'withdraw') message += `\nکارت: ${req.card_number}`;
    const buttons = [[{ text: '✅ تأیید', callback_data: 'admin_approve_' + req.id }, { text: '❌ رد', callback_data: 'admin_reject_' + req.id }], [{ text: '✉️ رد با توضیح', callback_data: 'admin_reject_reason_' + req.id }]];
    if (req.type === 'deposit' && req.receipt_file_id) {
      await ctx.replyWithPhoto(req.receipt_file_id, { caption: message, reply_markup: { inline_keyboard: buttons } });
    } else {
      await ctx.reply(message, { reply_markup: { inline_keyboard: buttons } });
    }
  }
});

bot.action(/^admin_approve_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  ctx.answerCbQuery();
  await safeDelete(ctx);
  const requestId = ctx.match[1];
  const reqRes = await pool.query('SELECT * FROM wallet_requests WHERE id = $1', [requestId]);
  const request = reqRes.rows[0];
  if (!request || request.status !== 'pending') return ctx.reply('قبلاً بررسی شده');
  const codeText = request.tracking_code ? `\n🆔 ${request.tracking_code}` : '';
  if (request.type === 'deposit') {
    await pool.query('UPDATE users SET balance = balance + $1 WHERE telegram_id = $2', [request.amount, request.telegram_id]);
    bot.telegram.sendMessage(request.telegram_id, '✅ شارژ تایید شد' + codeText + `\nمبلغ ${Number(request.amount).toLocaleString('en-US')} تومان اضافه شد`);
  } else {
    await pool.query('UPDATE users SET balance = balance - $1 WHERE telegram_id = $2', [request.amount, request.telegram_id]);
    bot.telegram.sendMessage(request.telegram_id, '✅ برداشت تایید شد' + codeText + `\nمبلغ ${Number(request.amount).toLocaleString('en-US')} تومان واریز شد`);
  }
  await pool.query("UPDATE wallet_requests SET status = 'approved' WHERE id = $1", [requestId]);
  ctx.reply('تایید شد ✅');
});

bot.action(/^admin_reject_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  ctx.answerCbQuery();
  await safeDelete(ctx);
  const requestId = ctx.match[1];
  const reqRes = await pool.query('SELECT * FROM wallet_requests WHERE id = $1', [requestId]);
  const request = reqRes.rows[0];
  if (!request || request.status !== 'pending') return ctx.reply('قبلاً بررسی شده');
  await pool.query("UPDATE wallet_requests SET status = 'rejected' WHERE id = $1", [requestId]);
  bot.telegram.sendMessage(request.telegram_id, '❌ درخواست شما رد شد' + (request.tracking_code ? `\n🆔 ${request.tracking_code}` : ''));
  ctx.reply('رد شد ❌');
});

bot.action(/^admin_reject_reason_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  ctx.answerCbQuery();
  await safeDelete(ctx);
  sessions[ctx.from.id] = { flow: 'admin_reject_reason', step: 'waiting_reason', data: { requestId: ctx.match[1] } };
  ctx.reply('✍️ دلیل رد را بنویس:');
});

bot.action('admin_sell_pending', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  ctx.answerCbQuery();
  await safeDelete(ctx);
  const res = await pool.query(`SELECT * FROM sell_orders WHERE status = 'pending' ORDER BY id ASC`);
  if (res.rows.length === 0) return ctx.reply('هیچ درخواست فروشی در انتظار نیست ✅');
  for (const order of res.rows) {
    const user = await getUser(order.telegram_id);
    const msg = `💰 فروش\n🆔 ${order.tracking_code}\n👤 \( {user ? user.full_name : 'نامشخص'} ( \){order.telegram_id})\n📦 ${order.product_name}\n🔑 ${order.voucher_code}\n💸 کارمزد: ${Number(order.fee_amount).toLocaleString('en-US')}`;
    await ctx.reply(msg, {
      reply_markup: { inline_keyboard: [[{ text: '✅ تأیید و وارد کردن مبلغ', callback_data: `sell_approve_\( {order.id}` }, { text: '❌ رد', callback_data: `sell_reject_ \){order.id}` }]] }
    });
  }
});

bot.action(/^sell_approve_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  ctx.answerCbQuery();
  await safeDelete(ctx);
  sessions[ctx.from.id] = { flow: 'admin_sell_amount', step: 'waiting_amount', data: { orderId: ctx.match[1] } };
  ctx.reply('مبلغ واقعی شارژ شده را وارد کنید (فقط عدد):\nمثال: 200000');
});

bot.action(/^sell_reject_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  ctx.answerCbQuery();
  await safeDelete(ctx);
  sessions[ctx.from.id] = { flow: 'admin_sell_reject', step: 'waiting_reason', data: { orderId: ctx.match[1] } };
  ctx.reply('دلیل رد را بنویس:');
});

// ====================== text و photo ======================

bot.on('text', async (ctx, next) => {
  const session = sessions[ctx.from.id];
  if (!session) return next();

  if (session.lastBotMsgId) {
    try { await ctx.telegram.deleteMessage(ctx.chat.id, session.lastBotMsgId); } catch (e) {}
    session.lastBotMsgId = null;
  }

  const t = texts.fa;

  if (session.flow === 'registration') {
    if (session.step === 'waiting_name') {
      session.data.fullName = ctx.message.text;
      session.step = 'waiting_card';
      return ctx.reply(t.requestCard);
    }
    if (session.step === 'waiting_card') {
      session.data.cardNumber = ctx.message.text;
      await pool.query(`INSERT INTO users (telegram_id, phone, full_name, card_number, language, balance, registered_at) VALUES ($1,$2,$3,$4,$5,0,$6) ON CONFLICT (telegram_id) DO UPDATE SET phone=EXCLUDED.phone, full_name=EXCLUDED.full_name, card_number=EXCLUDED.card_number`, [String(ctx.from.id), session.data.phone, session.data.fullName, session.data.cardNumber, session.lang, new Date().toISOString()]);
      ctx.reply(t.registrationSuccess).then(() => ctx.reply(t.rulesText, { reply_markup: { inline_keyboard: [[{ text: t.confirmRulesButton, callback_data: 'confirm_rules' }]] } }));
      return;
    }
  }

  if (session.flow === 'deposit' && session.step === 'waiting_amount') {
    session.data.amount = ctx.message.text;
    session.step = 'waiting_receipt';
    const sent = await ctx.reply(t.depositAskReceipt);
    session.lastBotMsgId = sent.message_id;
    return;
  }

  if (session.flow === 'buy' && session.step === 'waiting_amount') {
    const amount = parseInt(ctx.message.text.replace(/[^0-9]/g, ''), 10);
    if (!amount || amount < session.data.minAmount) {
      const sent = await ctx.reply(fillTemplate(t.buyMinError, { min: session.data.minAmount.toLocaleString('en-US') }));
      session.lastBotMsgId = sent.message_id;
      return;
    }
    session.data.amount = amount;
    session.step = 'waiting_confirm';
    const sent = await ctx.reply(fillTemplate(t.buyConfirmSummary, { product: session.data.productLabel, amount: amount.toLocaleString('en-US') }), {
      reply_markup: { inline_keyboard: [[{ text: t.buyConfirmButton, callback_data: 'buy_confirm' }, { text: t.buyCancelButton, callback_data: 'buy_cancel' }]] }
    });
    session.lastBotMsgId = sent.message_id;
    return;
  }

  if (session.flow === 'withdraw' && session.step === 'waiting_amount') {
    const amount = parseInt(ctx.message.text.replace(/[^0-9]/g, ''), 10);
    if (!amount || amount < MIN_WITHDRAW) {
      const sent = await ctx.reply(t.withdrawMinError);
      session.lastBotMsgId = sent.message_id;
      return;
    }
    session.data.amount = amount;
    const cards = await getUserCards(ctx.from.id);
    const buttons = cards.map(c => [{ text: c.card_number, callback_data: 'withdraw_card_' + c.card_number }]);
    buttons.push([{ text: t.addCardButton, callback_data: 'wallet_addcard' }]);
    const sent = await ctx.reply(t.withdrawSelectCard, { reply_markup: { inline_keyboard: buttons } });
    session.lastBotMsgId = sent.message_id;
    return;
  }

  if (session.flow === 'addcard' && session.step === 'waiting_card') {
    const cardNumber = ctx.message.text.replace(/[^0-9]/g, '');
    if (cardNumber.length !== 16) {
      const sent = await ctx.reply(t.addCardInvalid);
      session.lastBotMsgId = sent.message_id;
      return;
    }
    await pool.query('INSERT INTO cards (telegram_id, card_number, created_at) VALUES ($1,$2,$3)', [String(ctx.from.id), cardNumber, new Date().toISOString()]);
    delete sessions[ctx.from.id];
    return ctx.reply(t.addCardSuccess);
  }

  if (session.flow === 'sell' && session.step === 'waiting_code') {
    const code = ctx.message.text.trim();
    if (code.length < 5) {
      const sent = await ctx.reply('کد خیلی کوتاه است. دوباره بفرست:');
      session.lastBotMsgId = sent.message_id;
      return;
    }
    const trackingCode = generateTrackingCode();
    await pool.query(`INSERT INTO sell_orders (telegram_id, product_key, product_name, voucher_code, fee_amount, status, tracking_code, created_at) VALUES ($1,$2,$3,$4,$5,'pending',$6,$7)`, [String(ctx.from.id), session.data.productKey, session.data.productName, code, session.data.fee, trackingCode, new Date().toISOString()]);
    delete sessions[ctx.from.id];
    ctx.reply(`✅ درخواست فروش ثبت شد\n\n🆔 ${trackingCode}\n📦 ${session.data.productName}`);
    for (const adminId of ADMIN_IDS) {
      try { await bot.telegram.sendMessage(adminId, `🔔 فروش جدید\nکاربر: ${ctx.from.id}\nمحصول: ${session.data.productName}\nکد: ${code}\nپیگیری: ${trackingCode}`); } catch (e) {}
    }
    return;
  }

  if (session.flow === 'admin_sell_amount' && session.step === 'waiting_amount') {
    if (!isAdmin(ctx.from.id)) return;
    const amount = parseInt(ctx.message.text.replace(/[^0-9]/g, ''), 10);
    if (!amount || amount <= 0) return ctx.reply('مبلغ معتبر نیست');
    const orderRes = await pool.query('SELECT * FROM sell_orders WHERE id = $1', [session.data.orderId]);
    const order = orderRes.rows[0];
    if (!order || order.status !== 'pending') { delete sessions[ctx.from.id]; return ctx.reply('قبلاً بررسی شده'); }
    const fee = Number(order.fee_amount) || 20000;
    const finalAmount = amount - fee;
    if (finalAmount <= 0) return ctx.reply('مبلغ کمتر از کارمزد است');
    await pool.query(`UPDATE sell_orders SET admin_amount=$1, final_amount=$2, status='approved', processed_at=$3 WHERE id=$4`, [amount, finalAmount, new Date().toISOString(), order.id]);
    await pool.query('UPDATE users SET balance = balance + $1 WHERE telegram_id = $2', [finalAmount, order.telegram_id]);
    await bot.telegram.sendMessage(order.telegram_id, `✅ فروش تأیید شد!\n🆔 ${order.tracking_code}\n📦 ${order.product_name}\n💰 مبلغ شارژ: ${amount.toLocaleString('en-US')}\n📉 کارمزد: ${fee.toLocaleString('en-US')}\n✅ واریز به جیب: ${finalAmount.toLocaleString('en-US')} تومان`);
    delete sessions[ctx.from.id];
    ctx.reply(`تأیید شد ✅\nمبلغ نهایی: ${finalAmount.toLocaleString('en-US')}`);
    return;
  }

  if (session.flow === 'admin_sell_reject' && session.step === 'waiting_reason') {
    if (!isAdmin(ctx.from.id)) return;
    const reason = ctx.message.text;
    const orderRes = await pool.query('SELECT * FROM sell_orders WHERE id = $1', [session.data.orderId]);
    const order = orderRes.rows[0];
    if (!order || order.status !== 'pending') { delete sessions[ctx.from.id]; return ctx.reply('قبلاً بررسی شده'); }
    await pool.query(`UPDATE sell_orders SET status='rejected', admin_note=$1, processed_at=$2 WHERE id=$3`, [reason, new Date().toISOString(), order.id]);
    await bot.telegram.sendMessage(order.telegram_id, `❌ فروش رد شد\n🆔 ${order.tracking_code}\n📝 دلیل: ${reason}`);
    delete sessions[ctx.from.id];
    ctx.reply('رد شد');
    return;
  }

  if (session.flow === 'admin_reject_reason' && session.step === 'waiting_reason') {
    if (!isAdmin(ctx.from.id)) return;
    const reasonText = ctx.message.text;
    const requestId = session.data.requestId;
    const reqRes = await pool.query('SELECT * FROM wallet_requests WHERE id = $1', [requestId]);
    const request = reqRes.rows[0];
    if (!request || request.status !== 'pending') { delete sessions[ctx.from.id]; return ctx.reply('قبلاً بررسی شده'); }
    await pool.query("UPDATE wallet_requests SET status = 'rejected' WHERE id = $1", [requestId]);
    bot.telegram.sendMessage(request.telegram_id, '❌ درخواست رد شد\n📝 دلیل:\n' + reasonText);
    delete sessions[ctx.from.id];
    ctx.reply('رد شد ✅');
    return;
  }
});

bot.on('photo', async (ctx) => {
  const session = sessions[ctx.from.id];
  if (!session || session.flow !== 'deposit' || session.step !== 'waiting_receipt') return;
  if (session.lastBotMsgId) try { await ctx.telegram.deleteMessage(ctx.chat.id, session.lastBotMsgId); } catch (e) {}
  const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
  const trackingCode = generateTrackingCode();
  await pool.query('INSERT INTO wallet_requests (telegram_id, type, amount, receipt_file_id, status, created_at, tracking_code) VALUES ($1,$2,$3,$4,$5,$6,$7)', [String(ctx.from.id), 'deposit', session.data.amount, fileId, 'pending', new Date().toISOString(), trackingCode]);
  delete sessions[ctx.from.id];
  ctx.reply(texts.fa.depositSubmitted + '\n\n🆔 ' + trackingCode);
});

bot.action('confirm_rules', async (ctx) => {
  try { await ctx.deleteMessage(); } catch (e) {}
  delete sessions[ctx.from.id];
  showMainMenu(ctx);
});

// ====================== راه‌اندازی ======================

async function init() {
  await pool.query(`CREATE TABLE IF NOT EXISTS users (telegram_id TEXT PRIMARY KEY, phone TEXT, full_name TEXT, card_number TEXT, language TEXT, balance INTEGER DEFAULT 0, registered_at TEXT)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS cards (id SERIAL PRIMARY KEY, telegram_id TEXT, card_number TEXT, created_at TEXT)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS wallet_requests (id SERIAL PRIMARY KEY, telegram_id TEXT, type TEXT, amount INTEGER, card_number TEXT, receipt_file_id TEXT, status TEXT, created_at TEXT, tracking_code TEXT)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS required_channels (id SERIAL PRIMARY KEY, chat_id TEXT, invite_link TEXT, title TEXT, active INTEGER DEFAULT 1)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS bonuses (id SERIAL PRIMARY KEY, telegram_id TEXT, status TEXT, amount INTEGER, created_at TEXT)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS orders (id SERIAL PRIMARY KEY, telegram_id TEXT, product_type TEXT, amount INTEGER, status TEXT, created_at TEXT, tracking_code TEXT)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS products (id SERIAL PRIMARY KEY, key TEXT UNIQUE, name TEXT, min_amount NUMERIC, price_type TEXT, active INTEGER DEFAULT 1, buy_active INTEGER DEFAULT 1, sell_active INTEGER DEFAULT 0, sell_fee INTEGER DEFAULT 20000, created_at TEXT)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS sell_orders (id SERIAL PRIMARY KEY, telegram_id TEXT, product_key TEXT, product_name TEXT, voucher_code TEXT, admin_amount INTEGER, fee_amount INTEGER, final_amount INTEGER, status TEXT DEFAULT 'pending', tracking_code TEXT, admin_note TEXT, created_at TEXT, processed_at TEXT)`);

  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS buy_active INTEGER DEFAULT 1`);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS sell_active INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS sell_fee INTEGER DEFAULT 20000`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_code TEXT`);
  await pool.query(`ALTER TABLE wallet_requests ADD COLUMN IF NOT EXISTS tracking_code TEXT`);

  const productsCount = await pool.query('SELECT COUNT(*) AS c FROM products');
  if (Number(productsCount.rows[0].c) === 0) {
    await pool.query(`INSERT INTO products (key, name, min_amount, price_type, active, buy_active, sell_active, sell_fee, created_at) VALUES ('voucher', '🎟 یوووچر', 1, 'usd', 1, 1, 1, 20000, $1), ('hotvoucher', '🎟 هات ووچر', $2, 'toman', 1, 1, 1, 20000, $1)`, [new Date().toISOString(), HOT_VOUCHER_MIN]);
  }

  const reactionRes = await pool.query('SELECT value FROM settings WHERE key = $1', ['start_reaction']);
  if (reactionRes.rows.length === 0) await pool.query('INSERT INTO settings (key, value) VALUES ($1, $2)', ['start_reaction', '🎉']);

  const rateRes = await pool.query('SELECT value FROM settings WHERE key = $1', ['usd_rate']);
  if (rateRes.rows.length === 0) await pool.query('INSERT INTO settings (key, value) VALUES ($1, $2)', ['usd_rate', String(DEFAULT_USD_RATE)]);

  const channelRes = await pool.query('SELECT * FROM required_channels WHERE chat_id = $1', ['-1003953090902']);
  if (channelRes.rows.length === 0) {
    await pool.query('INSERT INTO required_channels (chat_id, invite_link, title, active) VALUES ($1, $2, $3, 1)', ['-1003953090902', 'https://t.me/+G9og5Y6KfxEyNTRk', 'کانال اصلی']);
  }

  bot.launch();
  console.log('ربات با موفقیت روشن شد');
}

init().catch(e => console.log('INIT ERROR: ' + e.message));
  }
  }
