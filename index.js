const { Telegraf, Markup } = require('telegraf');
const { Pool } = require('pg');
const express = require('express');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is alive and connected to Supabase!'));
app.listen(PORT, () => console.log(`Web server is running on port ${PORT}`));

// ضد خواب
setInterval(() => {
  https.get('https://vochino-telegram-bot.onrender.com', (res) => {
    console.log(`[Layer 1 - Web] Status: ${res.statusCode}`);
  }).on('error', () => {});
}, 2 * 60 * 1000);

setInterval(() => {
  https.get('https://vochino-telegram-bot.onrender.com', (res) => {
    console.log(`[Layer 2 - Web] Status: ${res.statusCode}`);
  }).on('error', () => {});
}, 5 * 60 * 1000);

setInterval(async () => {
  try {
    await pool.query('SELECT 1');
    console.log(`[Layer 3 - DB] Supabase pinged!`);
  } catch (e) {}
}, 3 * 60 * 1000);

setInterval(async () => {
  try {
    await pool.query('SELECT 1');
    console.log(`[Layer 4 - DB] Supabase backup pinged!`);
  } catch (e) {}
}, 7 * 60 * 1000);

const bot = new Telegraf(process.env.BOT_TOKEN);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const ADMIN_IDS = [8231962200];
const MIN_WITHDRAW = 100000;
const HOT_VOUCHER_MIN = 50000;
const DEFAULT_USD_RATE = 60000;
const BONUS_THRESHOLD = 500000;
const BONUS_AMOUNT = 100000;
const BONUS_WIN_PROBABILITY = 0.05;

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
    welcome: 'به خانواده‌ی ما خوش اومدی! 🌟\nاینجا با خیال راحت خرید و فروش کن، ما همیشه پشتتیم.',
    requestPhone: 'برای تکمیل ثبت‌نام، لطفاً شماره تلفن خود را با دکمه‌ی زیر ارسال کنید 👇',
    sharePhoneButton: '📱 ارسال شماره تلفن',
    requestName: 'لطفاً نام و نام خانوادگی خود را وارد کنید:',
    requestCard: 'لطفاً شماره کارت بانکی خود را وارد کنید:',
    rulesText: 'قوانین و شرایط استفاده:\n\n(متن قوانین بعداً از پنل تکمیل می‌شود)\n\nتوجه: واریزی فقط از کارتی که به نام شما ثبت شده معتبر است.',
    confirmRulesButton: '✅ قوانین را می‌پذیرم',
    registrationSuccess: '🎉 ثبت‌نام شما با موفقیت انجام شد!',
    welcomeBack: 'خوش برگشتی! 👋',
    mustJoinTitle: 'برای استفاده از ربات، ابتدا باید عضو کانال زیر شوید:',
    joinChannelButton: '📢 عضویت در کانال',
    checkMembershipButton: '✅ عضو شدم',
    stillNotMember: 'هنوز عضو کانال نشده‌اید.',
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
    depositCardsTrust: '✅ پرداخت شما مستقیماً به حساب رسمی مجموعه واریز می‌شود.\n\nلطفاً مبلغ را به یکی از کارت‌های زیر واریز کنید:',
    depositAskAmount: 'مبلغ واریزی خود را به تومان وارد کنید:',
    depositAskReceipt: 'رسید پرداخت خود را ارسال کنید 📎',
    depositSubmitted: 'درخواست شارژ شما ثبت شد ✅',
    withdrawAskAmount: 'مبلغ برداشت را وارد کنید (حداقل ' + MIN_WITHDRAW.toLocaleString('en-US') + ' تومان):',
    withdrawMinError: 'حداقل مبلغ برداشت ' + MIN_WITHDRAW.toLocaleString('en-US') + ' تومان است.',
    withdrawSelectCard: 'شماره کارت خود را انتخاب کنید:',
    withdrawSubmitted: 'درخواست برداشت ثبت شد ✅',
    addCardAsk: 'شماره کارت جدید را وارد کنید (۱۶ رقم):',
    addCardInvalid: 'شماره کارت معتبر نیست.',
    addCardSuccess: 'کارت جدید ثبت شد ✅',
    addCardButton: '➕ افزودن کارت جدید',
    buyMenuTitle: '✨ کدوم محصول رو می‌خوای بخری؟',
    buyNoProducts: 'فعلاً هیچ محصولی تعریف نشده.',
    buyConfirmButton: '✅ تایید و خرید',
    buyCancelButton: '❌ انصراف',
    buyCancelled: 'سفارش لغو شد.',
    buyChargeWalletButton: '💳 شارژ کیف پول',
    profileTitle: '👤 پروفایل شما',
    invoicesTitle: '🧾 فاکتورهای من',
    invoicesEmpty: 'هنوز فاکتوری ثبت نشده.',
    supportTitle: '📞 پشتیبانی',
    supportFaqButton: '❓ سوالات متداول',
    supportContactButton: '💬 ارتباط با پشتیبانی',
    supportContactText: 'پیام خود را بنویسید تا پاسخ داده شود.',
    gameNotEligible: 'هنوز بونوس بازی فعال نشده.',
    gameEligibleIntro: 'یک بونوس داری! بازی را انتخاب کن.',
    gameAlreadyUsed: 'بونوس قبلاً استفاده شده.',
    gameDiceButton: '🎲 بازی تاس',
    gameBasketballButton: '🏀 بازی بسکتبال',
    gamePlaying: 'در حال بازی...',
    gameWin: '🎉 بردی! مبلغ به موجودی اضافه شد.',
    gameLose: 'این بار نبردی.'
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
    const row = [{ text: mainMenuButtons[i].text, callback_data: 'menu_' + mainMenuButtons[i].key }];
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
  if (channelsRes.rows.length === 0) return true;
  for (const channel of channelsRes.rows) {
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

function isAdmin(id) {
  return ADMIN_IDS.includes(Number(id));
}

async function getUsdRate() {
  const res = await pool.query('SELECT value FROM settings WHERE key = $1', ['usd_rate']);
  return res.rows[0] ? Number(res.rows[0].value) : DEFAULT_USD_RATE;
}

function fillTemplate(str, data) {
  let result = str;
  for (const key in data) result = result.replace(new RegExp('{' + key + '}', 'g'), data[key]);
  return result;
}

async function grantBonusIfEligible(telegramId) {
  const totalRes = await pool.query('SELECT COALESCE(SUM(amount),0) AS total FROM orders WHERE telegram_id = $1 AND status = $2', [String(telegramId), 'completed']);
  if (Number(totalRes.rows[0].total) >= BONUS_THRESHOLD) {
    const exist = await pool.query('SELECT id FROM bonuses WHERE telegram_id = $1 AND status = $2', [String(telegramId), 'available']);
    if (exist.rows.length === 0) {
      await pool.query('INSERT INTO bonuses (telegram_id, status, amount, created_at) VALUES ($1,$2,$3,$4)', [String(telegramId), 'available', BONUS_AMOUNT, new Date().toISOString()]);
    }
  }
}

// ========== دستورات ادمین ==========
bot.command('admin', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const w = await pool.query("SELECT COUNT(*) AS c FROM wallet_requests WHERE status = 'pending'");
  const s = await pool.query("SELECT COUNT(*) AS c FROM sell_orders WHERE status = 'pending'");
  ctx.reply(`👑 پنل مدیریت\n\nکیف پول در انتظار: ${w.rows[0].c}\nفروش در انتظار: ${s.rows[0].c}`, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📥 درخواست‌های کیف پول', callback_data: 'admin_pending' }],
        [{ text: '💰 درخواست‌های فروش', callback_data: 'admin_sell_pending' }]
      ]
    }
  });
});

bot.command('setrate', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const args = ctx.message.text.split(' ');
  if (args.length < 2) return ctx.reply('نرخ را وارد کنید');
  const rate = parseInt(args[1].replace(/\D/g, ''));
  if (!rate) return ctx.reply('عدد معتبر نیست');
  await pool.query('INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = $2', ['usd_rate', String(rate)]);
  ctx.reply('نرخ دلار به ' + rate.toLocaleString('en-US') + ' تغییر کرد');
});

bot.command('addproduct', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const parts = ctx.message.text.replace(/^\/addproduct\s*/, '').split('|').map(p => p.trim());
  if (parts.length < 4) return ctx.reply('فرمت: /addproduct کلید|نام|حداقل|usd یا toman|کارمزد');
  const [key, name, minRaw, type, feeRaw] = parts;
  const minAmount = Number(minRaw.replace(/[^0-9.]/g, ''));
  const fee = feeRaw ? Number(feeRaw.replace(/\D/g, '')) : 20000;
  if (!key || !name || !minAmount) return ctx.reply('مقادیر نامعتبر');
  await pool.query(
    `INSERT INTO products (key, name, min_amount, price_type, active, buy_active, sell_active, sell_fee, created_at)
     VALUES ($1,$2,$3,$4,1,1,1,$5,$6)
     ON CONFLICT (key) DO UPDATE SET name=$2, min_amount=$3, price_type=$4, sell_fee=$5, active=1`,
    [key, name, minAmount, type, fee, new Date().toISOString()]
  );
  ctx.reply(`محصول ${name} اضافه شد. کارمزد فروش: ${fee.toLocaleString('en-US')}`);
});

bot.command('listproducts', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const res = await pool.query('SELECT * FROM products ORDER BY id');
  if (!res.rows.length) return ctx.reply('محصولی نیست');
  let msg = '📦 محصولات:\n\n';
  res.rows.forEach(p => {
    msg += `${p.key} | ${p.name} | حداقل: ${p.min_amount} | کارمزد: ${p.sell_fee || 20000} | ${p.active ? 'فعال' : 'غیرفعال'}\n`;
  });
  ctx.reply(msg);
});

// ========== شروع ==========
bot.start(async (ctx) => {
  const isMember = await checkMembership(ctx);
  if (!isMember) return showJoinPrompt(ctx);

  const user = await getUser(ctx.from.id);
  if (user) {
    ctx.reply(texts.fa.welcomeBack);
    return showMainMenu(ctx);
  }

  sessions[ctx.from.id] = { flow: 'registration', step: 'waiting_phone', data: {} };
  ctx.reply(texts.fa.welcome);
  ctx.reply(texts.fa.requestPhone, Markup.keyboard([Markup.button.contactRequest(texts.fa.sharePhoneButton)]).resize().oneTime());
});

bot.action('check_membership', async (ctx) => {
  ctx.answerCbQuery();
  if (!(await checkMembership(ctx))) return ctx.reply(texts.fa.stillNotMember);
  await safeDelete(ctx);
  const user = await getUser(ctx.from.id);
  if (user) {
    ctx.reply(texts.fa.welcomeBack);
    showMainMenu(ctx);
  } else {
    sessions[ctx.from.id] = { flow: 'registration', step: 'waiting_phone', data: {} };
    ctx.reply(texts.fa.requestPhone, Markup.keyboard([Markup.button.contactRequest(texts.fa.sharePhoneButton)]).resize().oneTime());
  }
});

bot.on('contact', async (ctx) => {
  const session = sessions[ctx.from.id];
  if (!session || session.flow !== 'registration') return;
  session.data.phone = ctx.message.contact.phone_number;
  session.step = 'waiting_name';
  ctx.reply(texts.fa.requestName, { reply_markup: { remove_keyboard: true } });
});

// ========== منوها ==========
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
        [{ text: '🧾 گزارش', callback_data: 'menu_invoices' }],
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
  ctx.reply(`${texts.fa.profileTitle}\n\n👤 ${user.full_name || '-'}\n📱 ${user.phone || '-'}\n💳 ${user.card_number || '-'}\n💰 ${Number(user.balance).toLocaleString('en-US')} تومان`, {
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
  ctx.reply('سوالات متداول به‌زودی کامل می‌شود.', {
    reply_markup: { inline_keyboard: [[{ text: '🔙 بازگشت', callback_data: 'menu_support' }]] }
  });
});

bot.action('support_contact', async (ctx) => {
  ctx.answerCbQuery();
  await safeDelete(ctx);
  ctx.reply(texts.fa.supportContactText);
});

bot.action('menu_rules_education', async (ctx) => {
  ctx.answerCbQuery();
  await safeDelete(ctx);
  ctx.reply(texts.fa.rulesText);
});

bot.action('menu_game', async (ctx) => {
  ctx.answerCbQuery();
  await safeDelete(ctx);
  const bonus = await pool.query('SELECT * FROM bonuses WHERE telegram_id = $1 AND status = $2', [String(ctx.from.id), 'available']);
  if (bonus.rows.length === 0) return ctx.reply(texts.fa.gameNotEligible);
  ctx.reply(texts.fa.gameEligibleIntro, {
    reply_markup: {
      inline_keyboard: [
        [{ text: texts.fa.gameDiceButton, callback_data: 'game_dice' }],
        [{ text: texts.fa.gameBasketballButton, callback_data: 'game_basketball' }],
        [{ text: '🔙 بازگشت', callback_data: 'back_main_menu' }]
      ]
    }
  });
});

bot.action(['game_dice', 'game_basketball'], async (ctx) => {
  ctx.answerCbQuery();
  await safeDelete(ctx);
  const bonus = await pool.query('SELECT * FROM bonuses WHERE telegram_id = $1 AND status = $2 LIMIT 1', [String(ctx.from.id), 'available']);
  if (!bonus.rows.length) return ctx.reply(texts.fa.gameAlreadyUsed);
  ctx.reply(texts.fa.gamePlaying);
  const win = Math.random() < BONUS_WIN_PROBABILITY;
  if (win) {
    await pool.query('UPDATE users SET balance = balance + $1 WHERE telegram_id = $2', [BONUS_AMOUNT, String(ctx.from.id)]);
    await pool.query("UPDATE bonuses SET status = 'used' WHERE id = $1", [bonus.rows[0].id]);
    ctx.reply(texts.fa.gameWin);
  } else {
    await pool.query("UPDATE bonuses SET status = 'used' WHERE id = $1", [bonus.rows[0].id]);
    ctx.reply(texts.fa.gameLose);
  }
});

// ========== خرید ==========
bot.action('menu_buy', async (ctx) => {
  ctx.answerCbQuery();
  await safeDelete(ctx);
  const products = await pool.query('SELECT * FROM products WHERE active = 1 AND buy_active = 1 ORDER BY id');
  if (!products.rows.length) return ctx.reply(texts.fa.buyNoProducts);
  const buttons = products.rows.map(p => [{ text: p.name, callback_data: 'buy_' + p.key }]);
  buttons.push([{ text: '🔙 بازگشت', callback_data: 'back_main_menu' }]);
  ctx.reply(texts.fa.buyMenuTitle, { reply_markup: { inline_keyboard: buttons } });
});

bot.action(/^buy_(.+)/, async (ctx) => {
  ctx.answerCbQuery();
  const key = ctx.match[1];
  const product = (await pool.query('SELECT * FROM products WHERE key = $1 AND active = 1 AND buy_active = 1', [key])).rows[0];
  if (!product) return ctx.reply(texts.fa.buyNoProducts);

  let minToman = product.price_type === 'usd' ? Math.round(Number(product.min_amount) * await getUsdRate()) : Number(product.min_amount);
  sessions[ctx.from.id] = {
    flow: 'buy',
    step: 'waiting_amount',
    data: { productType: product.key, productLabel: product.name, minAmount: minToman }
  };

  const msg = product.price_type === 'usd'
    ? `قیمت دلار: ${(await getUsdRate()).toLocaleString('en-US')}\nحداقل: ${minToman.toLocaleString('en-US')} تومان\n\nمبلغ را وارد کنید:`
    : `حداقل: ${minToman.toLocaleString('en-US')} تومان\n\nمبلغ را وارد کنید:`;

  try {
    await ctx.editMessageText(msg, { reply_markup: { inline_keyboard: [[{ text: '🔙 بیخیال', callback_data: 'cancel_flow' }]] } });
  } catch (e) {
    await safeDelete(ctx);
    const sent = await ctx.reply(msg, { reply_markup: { inline_keyboard: [[{ text: '🔙 بیخیال', callback_data: 'cancel_flow' }]] } });
    sessions[ctx.from.id].lastBotMsgId = sent.message_id;
  }
});

bot.action('buy_confirm', async (ctx) => {
  ctx.answerCbQuery();
  const session = sessions[ctx.from.id];
  if (!session || session.flow !== 'buy') return;
  await safeDelete(ctx);
  const user = await getUser(ctx.from.id);
  const amount = session.data.amount;
  if (!user || user.balance < amount) {
    delete sessions[ctx.from.id];
    return ctx.reply('موجودی کافی نیست.', {
      reply_markup: { inline_keyboard: [[{ text: texts.fa.buyChargeWalletButton, callback_data: 'wallet_deposit' }]] }
    });
  }
  await pool.query('UPDATE users SET balance = balance - $1 WHERE telegram_id = $2', [amount, String(ctx.from.id)]);
  const code = generateTrackingCode();
  await pool.query('INSERT INTO orders (telegram_id, product_type, amount, status, created_at, tracking_code) VALUES ($1,$2,$3,$4,$5,$6)',
    [String(ctx.from.id), session.data.productType, amount, 'completed', new Date().toISOString(), code]);
  const newBal = (await pool.query('SELECT balance FROM users WHERE telegram_id = $1', [String(ctx.from.id)])).rows[0].balance;
  delete sessions[ctx.from.id];
  ctx.reply(`🎉 خرید موفق\nکد پیگیری: ${code}\nمحصول: ${session.data.productLabel}\nمبلغ: ${amount.toLocaleString('en-US')}\nموجودی جدید: ${Number(newBal).toLocaleString('en-US')}`);
  await grantBonusIfEligible(ctx.from.id);
});

bot.action('buy_cancel', async (ctx) => {
  ctx.answerCbQuery();
  delete sessions[ctx.from.id];
  await safeDelete(ctx);
  ctx.reply(texts.fa.buyCancelled);
});

// ========== فروش ==========
bot.action('menu_sell', async (ctx) => {
  ctx.answerCbQuery();
  await safeDelete(ctx);
  const products = await pool.query('SELECT * FROM products WHERE active = 1 AND sell_active = 1 ORDER BY id');
  if (!products.rows.length) return ctx.reply('هیچ محصولی برای فروش فعال نیست.');
  const buttons = products.rows.map(p => [{ text: p.name, callback_data: 'sell_product_' + p.key }]);
  buttons.push([{ text: '🔙 بازگشت', callback_data: 'back_main_menu' }]);
  ctx.reply('کدام محصول را می‌فروشید؟', { reply_markup: { inline_keyboard: buttons } });
});

bot.action(/^sell_product_(.+)/, async (ctx) => {
  ctx.answerCbQuery();
  await safeDelete(ctx);
  const product = (await pool.query('SELECT * FROM products WHERE key = $1 AND sell_active = 1', [ctx.match[1]])).rows[0];
  if (!product) return ctx.reply('محصول فعال نیست');
  sessions[ctx.from.id] = {
    flow: 'sell',
    step: 'waiting_code',
    data: { productKey: product.key, productName: product.name, fee: product.sell_fee || 20000 }
  };
  const sent = await ctx.reply(`محصول: ${product.name}\nکارمزد: ${Number(product.sell_fee || 20000).toLocaleString('en-US')} تومان\n\nکد را ارسال کنید:`, {
    reply_markup: { inline_keyboard: [[{ text: '🔙 انصراف', callback_data: 'cancel_flow' }]] }
  });
  sessions[ctx.from.id].lastBotMsgId = sent.message_id;
});

// ========== کیف پول ==========
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
  let msg = texts.fa.depositCardsTrust + '\n\n';
  DEPOSIT_CARDS.forEach(c => msg += `\`\( {c.number}\`\n \){c.owner}\n\n`);
  await ctx.reply(msg, { parse_mode: 'Markdown' });
  sessions[ctx.from.id] = { flow: 'deposit', step: 'waiting_amount', data: {} };
  const sent = await ctx.reply(texts.fa.depositAskAmount, {
    reply_markup: { inline_keyboard: [[{ text: '🔙 بیخیال', callback_data: 'cancel_flow' }]] }
  });
  sessions[ctx.from.id].lastBotMsgId = sent.message_id;
});

bot.action('wallet_withdraw', async (ctx) => {
  ctx.answerCbQuery();
  await safeDelete(ctx);
  sessions[ctx.from.id] = { flow: 'withdraw', step: 'waiting_amount', data: {} };
  const sent = await ctx.reply(texts.fa.withdrawAskAmount, {
    reply_markup: { inline_keyboard: [[{ text: '🔙 بیخیال', callback_data: 'cancel_flow' }]] }
  });
  sessions[ctx.from.id].lastBotMsgId = sent.message_id;
});

bot.action(/^withdraw_card_(.+)$/, async (ctx) => {
  ctx.answerCbQuery();
  await safeDelete(ctx);
  const session = sessions[ctx.from.id];
  const amount = session?.data?.amount;
  const code = generateTrackingCode();
  await pool.query('INSERT INTO wallet_requests (telegram_id, type, amount, card_number, status, created_at, tracking_code) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [String(ctx.from.id), 'withdraw', amount, ctx.match[1], 'pending', new Date().toISOString(), code]);
  delete sessions[ctx.from.id];
  ctx.reply(texts.fa.withdrawSubmitted + '\n\nکد پیگیری: ' + code);
});

bot.action('wallet_addcard', async (ctx) => {
  ctx.answerCbQuery();
  await safeDelete(ctx);
  sessions[ctx.from.id] = { flow: 'addcard', step: 'waiting_card', data: {} };
  const sent = await ctx.reply(texts.fa.addCardAsk);
  sessions[ctx.from.id].lastBotMsgId = sent.message_id;
});

// ========== ادمین ==========
bot.action('admin_pending', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  ctx.answerCbQuery();
  await safeDelete(ctx);
  const list = await pool.query("SELECT * FROM wallet_requests WHERE status = 'pending' ORDER BY id");
  if (!list.rows.length) return ctx.reply('درخواستی نیست');
  for (const req of list.rows) {
    const user = await getUser(req.telegram_id);
    const typeLabel = req.type === 'deposit' ? '➕ شارژ' : '💳 برداشت';
    let msg = `${typeLabel}\nکد: ${req.tracking_code || '-'}\nکاربر: \( {user ? user.full_name : 'نامشخص'} ( \){req.telegram_id})\nمبلغ: ${Number(req.amount).toLocaleString('en-US')}`;
    if (req.type === 'withdraw') msg += `\nکارت: ${req.card_number}`;
    const buttons = [
      [{ text: '✅ تأیید', callback_data: 'admin_approve_' + req.id }, { text: '❌ رد', callback_data: 'admin_reject_' + req.id }],
      [{ text: '✉️ رد با توضیح', callback_data: 'admin_reject_reason_' + req.id }]
    ];
    if (req.type === 'deposit' && req.receipt_file_id) {
      await ctx.replyWithPhoto(req.receipt_file_id, { caption: msg, reply_markup: { inline_keyboard: buttons } });
    } else {
      await ctx.reply(msg, { reply_markup: { inline_keyboard: buttons } });
    }
  }
});

bot.action(/^admin_approve_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  ctx.answerCbQuery();
  await safeDelete(ctx);
  const req = (await pool.query('SELECT * FROM wallet_requests WHERE id = $1', [ctx.match[1]])).rows[0];
  if (!req || req.status !== 'pending') return ctx.reply('قبلاً بررسی شده');
  if (req.type === 'deposit') {
    await pool.query('UPDATE users SET balance = balance + $1 WHERE telegram_id = $2', [req.amount, req.telegram_id]);
    bot.telegram.sendMessage(req.telegram_id, `✅ شارژ تایید شد\nمبلغ ${Number(req.amount).toLocaleString('en-US')} تومان اضافه شد`);
  } else {
    await pool.query('UPDATE users SET balance = balance - $1 WHERE telegram_id = $2', [req.amount, req.telegram_id]);
    bot.telegram.sendMessage(req.telegram_id, `✅ برداشت تایید شد\nمبلغ ${Number(req.amount).toLocaleString('en-US')} تومان واریز شد`);
  }
  await pool.query("UPDATE wallet_requests SET status = 'approved' WHERE id = $1", [req.id]);
  ctx.reply('تایید شد ✅');
});

bot.action(/^admin_reject_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  ctx.answerCbQuery();
  await safeDelete(ctx);
  const req = (await pool.query('SELECT * FROM wallet_requests WHERE id = $1', [ctx.match[1]])).rows[0];
  if (!req || req.status !== 'pending') return ctx.reply('قبلاً بررسی شده');
  await pool.query("UPDATE wallet_requests SET status = 'rejected' WHERE id = $1", [req.id]);
  bot.telegram.sendMessage(req.telegram_id, '❌ درخواست رد شد');
  ctx.reply('رد شد');
});

bot.action(/^admin_reject_reason_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  ctx.answerCbQuery();
  await safeDelete(ctx);
  sessions[ctx.from.id] = { flow: 'admin_reject_reason', step: 'waiting_reason', data: { requestId: ctx.match[1] } };
  ctx.reply('دلیل رد را بنویس:');
});

bot.action('admin_sell_pending', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  ctx.answerCbQuery();
  await safeDelete(ctx);
  const list = await pool.query("SELECT * FROM sell_orders WHERE status = 'pending' ORDER BY id");
  if (!list.rows.length) return ctx.reply('درخواست فروشی نیست');
  for (const order of list.rows) {
    const user = await getUser(order.telegram_id);
    const msg = `💰 فروش\nکد پیگیری: ${order.tracking_code}\nکاربر: \( {user ? user.full_name : 'نامشخص'} ( \){order.telegram_id})\nمحصول: ${order.product_name}\nکد: ${order.voucher_code}\nکارمزد: ${Number(order.fee_amount).toLocaleString('en-US')}`;
    await ctx.reply(msg, {
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ تأیید و وارد کردن مبلغ', callback_data: 'sell_approve_' + order.id },
          { text: '❌ رد', callback_data: 'sell_reject_' + order.id }
        ]]
      }
    });
  }
});

bot.action(/^sell_approve_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  ctx.answerCbQuery();
  await safeDelete(ctx);
  sessions[ctx.from.id] = { flow: 'admin_sell_amount', step: 'waiting_amount', data: { orderId: ctx.match[1] } };
  ctx.reply('مبلغ واقعی شارژ شده را وارد کنید (فقط عدد):');
});

bot.action(/^sell_reject_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  ctx.answerCbQuery();
  await safeDelete(ctx);
  sessions[ctx.from.id] = { flow: 'admin_sell_reject', step: 'waiting_reason', data: { orderId: ctx.match[1] } };
  ctx.reply('دلیل رد را بنویس:');
});

// ========== text handler ==========
bot.on('text', async (ctx, next) => {
  const session = sessions[ctx.from.id];
  if (!session) return next();

  if (session.lastBotMsgId) {
    try { await ctx.telegram.deleteMessage(ctx.chat.id, session.lastBotMsgId); } catch (e) {}
    session.lastBotMsgId = null;
  }

  // ثبت‌نام
  if (session.flow === 'registration') {
    if (session.step === 'waiting_name') {
      session.data.fullName = ctx.message.text;
      session.step = 'waiting_card';
      return ctx.reply(texts.fa.requestCard);
    }
    if (session.step === 'waiting_card') {
      session.data.cardNumber = ctx.message.text;
      await pool.query(
        `INSERT INTO users (telegram_id, phone, full_name, card_number, language, balance, registered_at)
         VALUES ($1,$2,$3,$4,'fa',0,$5)
         ON CONFLICT (telegram_id) DO UPDATE SET phone=$2, full_name=$3, card_number=$4`,
        [String(ctx.from.id), session.data.phone, session.data.fullName, session.data.cardNumber, new Date().toISOString()]
      );
      delete sessions[ctx.from.id];
      ctx.reply(texts.fa.registrationSuccess);
      ctx.reply(texts.fa.rulesText, {
        reply_markup: { inline_keyboard: [[{ text: texts.fa.confirmRulesButton, callback_data: 'confirm_rules' }]] }
      });
      return;
    }
  }

  // شارژ
  if (session.flow === 'deposit' && session.step === 'waiting_amount') {
    session.data.amount = ctx.message.text;
    session.step = 'waiting_receipt';
    const sent = await ctx.reply(texts.fa.depositAskReceipt);
    session.lastBotMsgId = sent.message_id;
    return;
  }

  // خرید
  if (session.flow === 'buy' && session.step === 'waiting_amount') {
    const amount = parseInt(ctx.message.text.replace(/\D/g, ''));
    if (!amount || amount < session.data.minAmount) {
      const sent = await ctx.reply('مبلغ کمتر از حداقل است. دوباره وارد کنید:');
      session.lastBotMsgId = sent.message_id;
      return;
    }
    session.data.amount = amount;
    session.step = 'waiting_confirm';
    const sent = await ctx.reply(`خلاصه سفارش:\nمحصول: ${session.data.productLabel}\nمبلغ: ${amount.toLocaleString('en-US')} تومان\n\nتایید می‌کنید؟`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: texts.fa.buyConfirmButton, callback_data: 'buy_confirm' }],
          [{ text: texts.fa.buyCancelButton, callback_data: 'buy_cancel' }]
        ]
      }
    });
    session.lastBotMsgId = sent.message_id;
    return;
  }

  // برداشت
  if (session.flow === 'withdraw' && session.step === 'waiting_amount') {
    const amount = parseInt(ctx.message.text.replace(/\D/g, ''));
    if (!amount || amount < MIN_WITHDRAW) {
      const sent = await ctx.reply(texts.fa.withdrawMinError);
      session.lastBotMsgId = sent.message_id;
      return;
    }
    session.data.amount = amount;
    const cards = await getUserCards(ctx.from.id);
    const buttons = cards.map(c => [{ text: c.card_number, callback_data: 'withdraw_card_' + c.card_number }]);
    buttons.push([{ text: texts.fa.addCardButton, callback_data: 'wallet_addcard' }]);
    const sent = await ctx.reply(texts.fa.withdrawSelectCard, { reply_markup: { inline_keyboard: buttons } });
    session.lastBotMsgId = sent.message_id;
    return;
  }

  // افزودن کارت
  if (session.flow === 'addcard' && session.step === 'waiting_card') {
    const card = ctx.message.text.replace(/\D/g, '');
    if (card.length !== 16) {
      const sent = await ctx.reply(texts.fa.addCardInvalid);
      session.lastBotMsgId = sent.message_id;
      return;
    }
    await pool.query('INSERT INTO cards (telegram_id, card_number, created_at) VALUES ($1,$2,$3)', [String(ctx.from.id), card, new Date().toISOString()]);
    delete sessions[ctx.from.id];
    return ctx.reply(texts.fa.addCardSuccess);
  }

  // فروش - کد
  if (session.flow === 'sell' && session.step === 'waiting_code') {
    const code = ctx.message.text.trim();
    if (code.length < 5) {
      const sent = await ctx.reply('کد خیلی کوتاه است.');
      session.lastBotMsgId = sent.message_id;
      return;
    }
    const tracking = generateTrackingCode();
    await pool.query(
      `INSERT INTO sell_orders (telegram_id, product_key, product_name, voucher_code, fee_amount, status, tracking_code, created_at)
       VALUES ($1,$2,$3,$4,$5,'pending',$6,$7)`,
      [String(ctx.from.id), session.data.productKey, session.data.productName, code, session.data.fee, tracking, new Date().toISOString()]
    );
    delete sessions[ctx.from.id];
    ctx.reply(`✅ درخواست فروش ثبت شد\nکد پیگیری: ${tracking}\nمحصول: ${session.data.productName}`);
    for (const adminId of ADMIN_IDS) {
      try {
        await bot.telegram.sendMessage(adminId, `🔔 فروش جدید\nکاربر: ${ctx.from.id}\nمحصول: ${session.data.productName}\nکد: ${code}\nپیگیری: ${tracking}`);
      } catch (e) {}
    }
    return;
  }

  // ادمین - مبلغ فروش
  if (session.flow === 'admin_sell_amount' && session.step === 'waiting_amount') {
    if (!isAdmin(ctx.from.id)) return;
    const amount = parseInt(ctx.message.text.replace(/\D/g, ''));
    if (!amount) return ctx.reply('مبلغ معتبر نیست');
    const order = (await pool.query('SELECT * FROM sell_orders WHERE id = $1', [session.data.orderId])).rows[0];
    if (!order || order.status !== 'pending') {
      delete sessions[ctx.from.id];
      return ctx.reply('قبلاً بررسی شده');
    }
    const fee = Number(order.fee_amount) || 20000;
    const finalAmount = amount - fee;
    if (finalAmount <= 0) return ctx.reply('مبلغ کمتر از کارمزد است');
    await pool.query('UPDATE sell_orders SET admin_amount=$1, final_amount=$2, status=$3, processed_at=$4 WHERE id=$5',
      [amount, finalAmount, 'approved', new Date().toISOString(), order.id]);
    await pool.query('UPDATE users SET balance = balance + $1 WHERE telegram_id = $2', [finalAmount, order.telegram_id]);
    await bot.telegram.sendMessage(order.telegram_id,
      `✅ فروش تأیید شد\nکد پیگیری: ${order.tracking_code}\nمحصول: ${order.product_name}\nمبلغ شارژ: ${amount.toLocaleString('en-US')}\nکارمزد: ${fee.toLocaleString('en-US')}\nواریز به جیب: ${finalAmount.toLocaleString('en-US')} تومان`);
    delete sessions[ctx.from.id];
    ctx.reply(`تأیید شد. مبلغ نهایی کاربر: ${finalAmount.toLocaleString('en-US')}`);
    return;
  }

  // ادمین - رد فروش
  if (session.flow === 'admin_sell_reject' && session.step === 'waiting_reason') {
    if (!isAdmin(ctx.from.id)) return;
    const reason = ctx.message.text;
    const order = (await pool.query('SELECT * FROM sell_orders WHERE id = $1', [session.data.orderId])).rows[0];
    if (!order || order.status !== 'pending') {
      delete sessions[ctx.from.id];
      return ctx.reply('قبلاً بررسی شده');
    }
    await pool.query('UPDATE sell_orders SET status=$1, admin_note=$2, processed_at=$3 WHERE id=$4',
      ['rejected', reason, new Date().toISOString(), order.id]);
    await bot.telegram.sendMessage(order.telegram_id, `❌ فروش رد شد\nکد: ${order.tracking_code}\nدلیل: ${reason}`);
    delete sessions[ctx.from.id];
    ctx.reply('رد شد');
    return;
  }

  // ادمین - رد با دلیل کیف پول
  if (session.flow === 'admin_reject_reason' && session.step === 'waiting_reason') {
    if (!isAdmin(ctx.from.id)) return;
    const reason = ctx.message.text;
    const req = (await pool.query('SELECT * FROM wallet_requests WHERE id = $1', [session.data.requestId])).rows[0];
    if (!req || req.status !== 'pending') {
      delete sessions[ctx.from.id];
      return ctx.reply('قبلاً بررسی شده');
    }
    await pool.query("UPDATE wallet_requests SET status = 'rejected' WHERE id = $1", [req.id]);
    bot.telegram.sendMessage(req.telegram_id, '❌ درخواست رد شد\nدلیل: ' + reason);
    delete sessions[ctx.from.id];
    ctx.reply('رد شد');
    return;
  }
});

bot.on('photo', async (ctx) => {
  const session = sessions[ctx.from.id];
  if (!session || session.flow !== 'deposit' || session.step !== 'waiting_receipt') return;
  if (session.lastBotMsgId) {
    try { await ctx.telegram.deleteMessage(ctx.chat.id, session.lastBotMsgId); } catch (e) {}
  }
  const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
  const code = generateTrackingCode();
  await pool.query(
    'INSERT INTO wallet_requests (telegram_id, type, amount, receipt_file_id, status, created_at, tracking_code) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [String(ctx.from.id), 'deposit', session.data.amount, fileId, 'pending', new Date().toISOString(), code]
  );
  delete sessions[ctx.from.id];
  ctx.reply(texts.fa.depositSubmitted + '\n\nکد پیگیری: ' + code);
});

bot.action('confirm_rules', async (ctx) => {
  try { await ctx.deleteMessage(); } catch (e) {}
  delete sessions[ctx.from.id];
  showMainMenu(ctx);
});

bot.action('menu_invoices', async (ctx) => {
  ctx.answerCbQuery();
  await safeDelete(ctx);
  const orders = await pool.query('SELECT * FROM orders WHERE telegram_id = $1 ORDER BY id DESC LIMIT 5', [String(ctx.from.id)]);
  const wallets = await pool.query('SELECT * FROM wallet_requests WHERE telegram_id = $1 ORDER BY id DESC LIMIT 5', [String(ctx.from.id)]);
  const sells = await pool.query('SELECT * FROM sell_orders WHERE telegram_id = $1 ORDER BY id DESC LIMIT 5', [String(ctx.from.id)]);
  if (!orders.rows.length && !wallets.rows.length && !sells.rows.length) return ctx.reply(texts.fa.invoicesEmpty);
  let msg = texts.fa.invoicesTitle + '\n\n';
  orders.rows.forEach(o => msg += `📦 خرید | ${o.product_type} | ${Number(o.amount).toLocaleString('en-US')} | ${o.status}\n`);
  wallets.rows.forEach(w => msg += `${w.type === 'deposit' ? '➕ شارژ' : '💳 برداشت'} | ${Number(w.amount).toLocaleString('en-US')} | ${w.status}\n`);
  sells.rows.forEach(s => msg += `💰 فروش | ${s.product_name} | ${s.status}\n`);
  ctx.reply(msg, { reply_markup: { inline_keyboard: [[{ text: '🔙 بازگشت', callback_data: 'back_main_menu' }]] } });
});

// ========== راه‌اندازی ==========
async function init() {
  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    telegram_id TEXT PRIMARY KEY, phone TEXT, full_name TEXT, card_number TEXT,
    language TEXT, balance INTEGER DEFAULT 0, registered_at TEXT
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS cards (
    id SERIAL PRIMARY KEY, telegram_id TEXT, card_number TEXT, created_at TEXT
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS wallet_requests (
    id SERIAL PRIMARY KEY, telegram_id TEXT, type TEXT, amount INTEGER,
    card_number TEXT, receipt_file_id TEXT, status TEXT, created_at TEXT, tracking_code TEXT
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS required_channels (
    id SERIAL PRIMARY KEY, chat_id TEXT, invite_link TEXT, title TEXT, active INTEGER DEFAULT 1
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS bonuses (
    id SERIAL PRIMARY KEY, telegram_id TEXT, status TEXT, amount INTEGER, created_at TEXT
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY, telegram_id TEXT, product_type TEXT, amount INTEGER,
    status TEXT, created_at TEXT, tracking_code TEXT
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY, key TEXT UNIQUE, name TEXT, min_amount NUMERIC,
    price_type TEXT, active INTEGER DEFAULT 1, buy_active INTEGER DEFAULT 1,
    sell_active INTEGER DEFAULT 0, sell_fee INTEGER DEFAULT 20000, created_at TEXT
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS sell_orders (
    id SERIAL PRIMARY KEY, telegram_id TEXT, product_key TEXT, product_name TEXT,
    voucher_code TEXT, admin_amount INTEGER, fee_amount INTEGER, final_amount INTEGER,
    status TEXT DEFAULT 'pending', tracking_code TEXT, admin_note TEXT,
    created_at TEXT, processed_at TEXT
  )`);

  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS buy_active INTEGER DEFAULT 1`);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS sell_active INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS sell_fee INTEGER DEFAULT 20000`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_code TEXT`);
  await pool.query(`ALTER TABLE wallet_requests ADD COLUMN IF NOT EXISTS tracking_code TEXT`);

  const count = await pool.query('SELECT COUNT(*) AS c FROM products');
  if (Number(count.rows[0].c) === 0) {
    await pool.query(
      `INSERT INTO products (key, name, min_amount, price_type, active, buy_active, sell_active, sell_fee, created_at)
       VALUES ('voucher', '🎟 یوووچر', 1, 'usd', 1, 1, 1, 20000, $1),
              ('hotvoucher', '🎟 هات ووچر', $2, 'toman', 1, 1, 1, 20000, $1)`,
      [new Date().toISOString(), HOT_VOUCHER_MIN]
    );
  }

  const rate = await pool.query('SELECT value FROM settings WHERE key = $1', ['usd_rate']);
  if (!rate.rows.length) {
    await pool.query('INSERT INTO settings (key, value) VALUES ($1, $2)', ['usd_rate', String(DEFAULT_USD_RATE)]);
  }

  const ch = await pool.query('SELECT id FROM required_channels WHERE chat_id = $1', ['-1003953090902']);
  if (!ch.rows.length) {
    await pool.query(
      'INSERT INTO required_channels (chat_id, invite_link, title, active) VALUES ($1, $2, $3, 1)',
      ['-1003953090902', 'https://t.me/+G9og5Y6KfxEyNTRk', 'کانال اصلی']
    );
  }

  bot.launch();
  console.log('ربات با موفقیت روشن شد');
}

init().catch(e => console.log('INIT ERROR:', e.message));
