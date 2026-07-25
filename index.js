const { Telegraf, Markup } = require('telegraf');
const { Pool } = require('pg');
const express = require('express');

// Express Server for Render Health Check
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => { res.send('Bot is alive and connected to Supabase!'); });
app.listen(PORT, () => { console.log(`Web server is running on port ${PORT}`); });

// Initialize Bot & PostgreSQL (Supabase) Pool
const bot = new Telegraf(process.env.BOT_TOKEN);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const ADMIN_IDS = [8231962200];
const DAILY_LIMIT_TEXT = '2,000,000';
const MIN_WITHDRAW = 100000;

// ===== تنظیمات بونوس و بازی (اینجا رو هر موقع خواستی تغییر بده) =====
const BONUS_THRESHOLD = 500000;      // حداقل مجموع خرید برای فعال شدن بونوس
const BONUS_AMOUNT = 100000;         // مبلغ جایزه در صورت برد (تومان)
const BONUS_WIN_PROBABILITY = 0.05;  // شانس برد (0.05 یعنی ۵٪ ، تقریباً ۱ از ۲۰ نفر)
// =======================================================================

// لیست ایموجی‌های مجاز تلگرام برای ری‌اکشن روی پیام (Bot API فقط همین‌ها را قبول می‌کند)
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

const DEPOSIT_CARDS = [
  { number: '6219861819068106', owner: 'علی بهادر' },
  { number: '5047061669481125', owner: 'علی بهادر' }
];

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

    walletTitle: '👛 کیف پول',
    walletBalance: '💰 موجودی فعلی شما: ',
    walletIncrease: '➕ افزایش موجودی',
    walletWithdraw: '💳 برداشت موجودی',
    walletAddCard: '➕ افزودن کارت جدید',
    backButton: '🔙 بازگشت',

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

    profileTitle: '👤 پروفایل شما',
    invoicesTitle: '🧾 فاکتورهای من',
    invoicesEmpty: 'هنوز هیچ فاکتوری برای شما ثبت نشده.',

    supportTitle: '📞 پشتیبانی\n\nقبل از تماس، یه نگاه به سوالات متداول بنداز، شاید جوابت همونجا باشه 👇',
    supportFaqButton: '❓ سوالات متداول',
    supportContactButton: '💬 ارتباط با پشتیبانی',
    supportContactText: 'برای ارتباط مستقیم با پشتیبانی، پیام خودتون رو همینجا بنویسید تا در اسرع وقت جواب بگیرید.',
    faqText:
      '❓ سوالات متداول\n\n' +
      '🔹 چقدر طول می‌کشه شارژم تایید بشه؟\n' +
      'معمولاً چند دقیقه، حداکثر تا چند ساعت.\n\n' +
      '🔹 حداقل مبلغ برداشت چقدره؟\n' +
      MIN_WITHDRAW.toLocaleString('en-US') + ' تومان.\n\n' +
      '🔹 آیا واریزی از کارت دیگران قبوله؟\n' +
      'نه، فقط از کارتی که به نام خودتون ثبت شده.\n\n' +
      '🔹 بونوس بازی چطور فعال می‌شه؟\n' +
      'با رسیدن مجموع خریدت به ' + BONUS_THRESHOLD.toLocaleString('en-US') + ' تومان، یه بونوس بازی برات فعال می‌شه.',

    gameMenuTitle: '🎮 بازی و بونوس',
    gameNotEligible:
      '🔒 هنوز بونوس بازی برات فعال نشده.\n\n' +
      'با رسیدن مجموع خریدت به ' + BONUS_THRESHOLD.toLocaleString('en-US') + ' تومان، یه بونوس ' + BONUS_AMOUNT.toLocaleString('en-US') + ' تومنی می‌گیری که می‌تونی باهاش بازی کنی و ببری! 🎁',
    gameEligibleIntro:
      '🎁 تبریک! یه بونوس ' + BONUS_AMOUNT.toLocaleString('en-US') + ' تومنی داری.\n' +
      'یکی از بازی‌های زیر رو انتخاب کن و شانستو امتحان کن. اگه ببری، مبلغ مستقیم میاد تو موجودیت و می‌تونی همون لحظه برداشت بزنی 💸',
    gameAlreadyUsed: 'بونوس بازیت رو قبلاً استفاده کردی. با رسیدن به سقف خرید بعدی، دوباره یه بونوس جدید فعال می‌شه.',
    gameDiceButton: '🎲 بازی تاس',
    gameBasketballButton: '🏀 بازی بسکتبال',
    gamePlaying: '🎲 در حال بازی... منتظر بمون تا نتیجه مشخص بشه...',
    gameWin: '🎉🎉 تبریک، بردی!!\nمبلغ ' + BONUS_AMOUNT.toLocaleString('en-US') + ' تومان به موجودیت اضافه شد. می‌تونی همین الان برداشت بزنی 💸',
    gameLose: '😔 این بار نبردی، بونوست مصرف شد.\nنگران نباش، با خرید بعدیت دوباره شانس داری!'
  }
};

const mainMenuButtons = [
  { key: 'profile', text: '👤 پروفایل' },
  { key: 'buy', text: '🛒 خرید' },
  { key: 'sell', text: '💸 فروش' },
  { key: 'wallet', text: '👛 کیف پول' },
  { key: 'support', text: '📞 پشتیبانی' },
  { key: 'game', text: '🎮 بازی‌های بونوس' }
];

function showMainMenu(ctx) {
  const rows = [];
  for (let i = 0; i < mainMenuButtons.length; i += 2) {
    const row = [];
    row.push({ text: mainMenuButtons[i].text, callback_data: 'menu_' + mainMenuButtons[i].key });
    if (mainMenuButtons[i + 1]) {
      row.push({ text: mainMenuButtons[i + 1].text, callback_data: 'menu_' + mainMenuButtons[i + 1].key });
    }
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
  if (user && user.card_number) {
    list.push({ card_number: user.card_number });
  }
  extraRes.rows.forEach(function (c) { list.push({ card_number: c.card_number }); });
  return list;
}

async function checkMembership(ctx) {
  const channelsRes = await pool.query('SELECT * FROM required_channels WHERE active = 1');
  const channels = channelsRes.rows;
  if (channels.length === 0) return true;

  for (const channel of channels) {
    try {
      const member = await ctx.telegram.getChatMember(channel.chat_id, ctx.from.id);
      if (member.status === 'left' || member.status === 'kicked') {
        return false;
      }
    } catch (e) {
      console.log('خطا در بررسی عضویت: ' + e.message);
      return false;
    }
  }
  return true;
}

async function showJoinPrompt(ctx) {
  const t = texts.fa;
  const channelsRes = await pool.query('SELECT * FROM required_channels WHERE active = 1');
  const channels = channelsRes.rows;

  const buttons = channels.map(function (c) {
    return [{ text: t.joinChannelButton, url: c.invite_link }];
  });
  buttons.push([{ text: t.checkMembershipButton, callback_data: 'check_membership' }]);

  ctx.reply(t.mustJoinTitle, { reply_markup: { inline_keyboard: buttons } });
}

// Set reaction command for admin
bot.command('setreaction', async (ctx) => {
  if (ADMIN_IDS.indexOf(Number(ctx.from.id)) === -1) return;
  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    const currentRes = await pool.query('SELECT value FROM settings WHERE key = $1', ['start_reaction']);
    const current = currentRes.rows[0] ? currentRes.rows[0].value : '🔥';
    ctx.reply('❌ لطفاً ایموجی مورد نظر را بعد از دستور وارد کنید.\nایموجی فعلی ربات: ' + current + '\n\nمثال:\n`/setreaction 🔥`', { parse_mode: 'Markdown' });
    return;
  }
  const newEmoji = args[1];

  if (ALLOWED_REACTIONS.indexOf(newEmoji) === -1) {
    ctx.reply(
      '⚠️ این ایموجی جزو ری‌اکشن‌های مجاز تلگرام نیست (تلگرام فقط یک لیست ثابت را قبول می‌کند، متأسفانه ایموجی پول/دلار جزو این لیست نیست).\n' +
      'چند نمونه‌ی مجاز که حس هیجان و خوشحالی می‌دن:\n🎉 🔥 🤩 💯 🏆 ❤ 👏'
    );
    return;
  }

  try {
    await ctx.telegram.setMessageReaction(ctx.chat.id, ctx.message.message_id, {
      reaction: [{ type: 'emoji', emoji: newEmoji }],
      is_big: true
    });
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

// Fixed reaction trigger — با افکت بزرگ
async function triggerStartReaction(ctx) {
  try {
    const settingRes = await pool.query('SELECT value FROM settings WHERE key = $1', ['start_reaction']);
    let emoji = settingRes.rows[0] ? settingRes.rows[0].value : '🎉';

    if (ALLOWED_REACTIONS.indexOf(emoji) === -1) {
      emoji = '🎉';
    }

    await ctx.telegram.setMessageReaction(ctx.chat.id, ctx.message.message_id, {
      reaction: [{ type: 'emoji', emoji: emoji }],
      is_big: true
    });
  } catch (e) {
    console.log('Reaction error details: ' + e.message);
  }
}

bot.action('check_membership', async (ctx) => {
  ctx.answerCbQuery();
  const isMember = await checkMembership(ctx);

  if (!isMember) {
    ctx.reply(texts.fa.stillNotMember);
    return;
  }

  ctx.deleteMessage().catch(function () {});
  const existingUser = await getUser(ctx.from.id);
  if (existingUser) {
    const lang = existingUser.language || 'fa';
    ctx.reply(texts[lang].welcomeBack);
    showMainMenu(ctx);
  } else {
    ctx.reply(texts.fa.chooseLanguage, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🇮🇷 فارسی', callback_data: 'lang_fa' },
            { text: '🇬🇧 English', callback_data: 'lang_en' }
          ]
        ]
      }
    });
  }
});

bot.start(async (ctx) => {
  triggerStartReaction(ctx);

  const isMember = await checkMembership(ctx);
  if (!isMember) {
    await showJoinPrompt(ctx);
    return;
  }

  const existingUser = await getUser(ctx.from.id);
  if (existingUser) {
    const lang = existingUser.language || 'fa';
    ctx.reply(texts[lang].welcomeBack);
    showMainMenu(ctx);
    return;
  }

  ctx.reply(texts.fa.chooseLanguage, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🇮🇷 فارسی', callback_data: 'lang_fa' },
          { text: '🇬🇧 English', callback_data: 'lang_en' }
        ]
      ]
    }
  });
});

function handleLanguageChoice(ctx, lang) {
  sessions[ctx.from.id] = { flow: 'registration', step: 'waiting_phone', lang: lang, data: {} };
  const t = texts[lang] || texts.fa;
  ctx.editMessageText(t.welcome);

  ctx.reply(
    t.requestPhone,
    Markup.keyboard([
      Markup.button.contactRequest(t.sharePhoneButton)
    ]).resize().oneTime()
  );
}

bot.action('lang_fa', (ctx) => handleLanguageChoice(ctx, 'fa'));
bot.action('lang_en', (ctx) => handleLanguageChoice(ctx, 'fa'));

bot.on('contact', (ctx) => {
  const session = sessions[ctx.from.id];
  if (!session || session.flow !== 'registration') return;

  session.data.phone = ctx.message.contact.phone_number;
  session.step = 'waiting_name';

  const t = texts[session.lang] || texts.fa;
  ctx.reply(t.requestName, { reply_markup: { remove_keyboard: true } });
});

async function showWalletMenu(ctx) {
  const t = texts.fa;
  const user = await getUser(ctx.from.id);
  const balance = user ? user.balance : 0;

  ctx.reply(t.walletTitle + '\n\n' + t.walletBalance + Number(balance).toLocaleString('en-US') + ' تومان', {
    reply_markup: {
      inline_keyboard: [
        [{ text: t.walletIncrease, callback_data: 'wallet_deposit' }],
        [{ text: t.walletWithdraw, callback_data: 'wallet_withdraw' }],
        [{ text: t.walletAddCard, callback_data: 'wallet_addcard' }],
        [{ text: '🧾 گزارش تراکنش‌ها', callback_data: 'menu_invoices' }]
      ]
    }
  });
}

bot.action('menu_wallet', async (ctx) => {
  ctx.answerCbQuery();
  await showWalletMenu(ctx);
});

bot.action('menu_referral', (ctx) => {
  ctx.answerCbQuery();
  ctx.reply('به‌زودی 🙂');
});

bot.action('menu_profile', async (ctx) => {
  ctx.answerCbQuery();
  const t = texts.fa;
  const user = await getUser(ctx.from.id);
  if (!user) {
    ctx.reply('اطلاعاتی برای شما ثبت نشده.');
    return;
  }
  ctx.reply(
    t.profileTitle + '\n\n' +
    '👤 نام: ' + (user.full_name || '-') + '\n' +
    '📱 شماره تلفن: ' + (user.phone || '-') + '\n' +
    '💳 شماره کارت: ' + (user.card_number || '-') + '\n' +
    '💰 موجودی: ' + Number(user.balance).toLocaleString('en-US') + ' تومان'
  );
});

bot.action('menu_invoices', async (ctx) => {
  ctx.answerCbQuery();
  const t = texts.fa;
  const res = await pool.query(
    'SELECT * FROM wallet_requests WHERE telegram_id = $1 ORDER BY id DESC LIMIT 10',
    [String(ctx.from.id)]
  );
  if (res.rows.length === 0) {
    ctx.reply(t.invoicesTitle + '\n\n' + t.invoicesEmpty);
    return;
  }
  let message = t.invoicesTitle + '\n\n';
  res.rows.forEach(function (r) {
    const typeLabel = r.type === 'deposit' ? '➕ شارژ' : '💳 برداشت';
    const statusLabel = r.status === 'pending' ? '⏳ در انتظار' : (r.status === 'approved' ? '✅ تایید شده' : '❌ رد شده');
    message += typeLabel + ' | ' + Number(r.amount).toLocaleString('en-US') + ' تومان | ' + statusLabel + '\n';
  });
  ctx.reply(message);
});

bot.action('menu_support', (ctx) => {
  ctx.answerCbQuery();
  const t = texts.fa;
  ctx.reply(t.supportTitle, {
    reply_markup: {
      inline_keyboard: [
        [{ text: t.supportFaqButton, callback_data: 'support_faq' }],
        [{ text: t.supportContactButton, callback_data: 'support_contact' }]
      ]
    }
  });
});

bot.action('support_faq', (ctx) => {
  ctx.answerCbQuery();
  ctx.reply(texts.fa.faqText);
});

bot.action('support_contact', (ctx) => {
  ctx.answerCbQuery();
  ctx.reply(texts.fa.supportContactText);
});

async function getUserTotalApprovedDeposits(telegramId) {
  const res = await pool.query(
    "SELECT COALESCE(SUM(amount), 0) AS total FROM wallet_requests WHERE telegram_id = $1 AND type = 'deposit' AND status = 'approved'",
    [String(telegramId)]
  );
  return Number(res.rows[0].total);
}

async function getActiveBonus(telegramId) {
  const res = await pool.query(
    "SELECT * FROM bonuses WHERE telegram_id = $1 AND status = 'available' ORDER BY id DESC LIMIT 1",
    [String(telegramId)]
  );
  return res.rows[0] || null;
}

async function grantBonusIfEligible(telegramId) {
  const total = await getUserTotalApprovedDeposits(telegramId);
  if (total < BONUS_THRESHOLD) return;

  const existing = await pool.query(
    'SELECT * FROM bonuses WHERE telegram_id = $1',
    [String(telegramId)]
  );
  if (existing.rows.length > 0) return; // فقط یک‌بار در کل عمر کاربر

  await pool.query(
    'INSERT INTO bonuses (telegram_id, status, amount, created_at) VALUES ($1, $2, $3, $4)',
    [String(telegramId), 'available', BONUS_AMOUNT, new Date().toISOString()]
  );
}

bot.action('menu_game', async (ctx) => {
  ctx.answerCbQuery();
  const t = texts.fa;
  const bonus = await getActiveBonus(ctx.from.id);

  if (!bonus) {
    const hasAnyBonus = await pool.query('SELECT * FROM bonuses WHERE telegram_id = $1', [String(ctx.from.id)]);
    if (hasAnyBonus.rows.length > 0) {
      ctx.reply(t.gameAlreadyUsed);
    } else {
      ctx.reply(t.gameNotEligible);
    }
    return;
  }

  ctx.reply(t.gameEligibleIntro, {
    reply_markup: {
      inline_keyboard: [
        [{ text: t.gameDiceButton, callback_data: 'game_play_dice' }],
        [{ text: t.gameBasketballButton, callback_data: 'game_play_basketball' }]
      ]
    }
  });
});

async function playBonusGame(ctx, emoji) {
  const t = texts.fa;
  const bonus = await getActiveBonus(ctx.from.id);
  if (!bonus) {
    ctx.reply(t.gameAlreadyUsed);
    return;
  }

  // بلافاصله وضعیت بونوس رو قفل می‌کنیم تا کسی نتونه دوبار بازی کنه
  await pool.query("UPDATE bonuses SET status = 'in_progress' WHERE id = $1", [bonus.id]);

  await ctx.reply(t.gamePlaying);
  await ctx.sendDice({ emoji: emoji }).catch(function () {});

  const won = Math.random() < BONUS_WIN_PROBABILITY;

  setTimeout(async function () {
    try {
      if (won) {
        await pool.query('UPDATE users SET balance = balance + $1 WHERE telegram_id = $2', [BONUS_AMOUNT, String(ctx.from.id)]);
        await pool.query("UPDATE bonuses SET status = 'used_won' WHERE id = $1", [bonus.id]);
        ctx.reply(t.gameWin);
      } else {
        await pool.query("UPDATE bonuses SET status = 'used_lost' WHERE id = $1", [bonus.id]);
        ctx.reply(t.gameLose);
      }
    } catch (e) {
      console.log('Game settlement error: ' + e.message);
    }
  }, 4000);
}

bot.action('game_play_dice', async (ctx) => {
  ctx.answerCbQuery();
  await playBonusGame(ctx, '🎲');
});

bot.action('game_play_basketball', async (ctx) => {
  ctx.answerCbQuery();
  await playBonusGame(ctx, '🏀');
});

bot.action(/^menu_.+/, (ctx) => {
  const actionKey = ctx.match[0];
  const known = ['menu_wallet', 'menu_referral', 'menu_profile', 'menu_invoices', 'menu_support', 'menu_game'];
  if (known.indexOf(actionKey) !== -1) return;
  ctx.answerCbQuery();
  ctx.reply('این بخش به‌زودی تکمیل می‌شود 🛠');
});

bot.action('wallet_deposit', (ctx) => {
  ctx.answerCbQuery();
  const t = texts.fa;
  ctx.reply(t.depositMethodTitle, {
    reply_markup: {
      inline_keyboard: [
        [{ text: t.depositCard2Card, callback_data: 'deposit_card2card' }],
        [{ text: t.depositTron, callback_data: 'deposit_tron' }],
        [{ text: t.depositGateway, callback_data: 'deposit_gateway' }]
      ]
    }
  });
});

bot.action('deposit_tron', (ctx) => { ctx.answerCbQuery(); ctx.reply(texts.fa.comingSoon); });
bot.action('deposit_gateway', (ctx) => { ctx.answerCbQuery(); ctx.reply(texts.fa.comingSoon); });

bot.action('deposit_card2card', (ctx) => {
  ctx.answerCbQuery();
  const t = texts.fa;

  let cardsMessage = t.depositCardsTrust + '\n\n';
  DEPOSIT_CARDS.forEach(function (c) {
    cardsMessage += '`' + c.number + '`' + '\n' + c.owner + '\n\n';
  });

  ctx.reply(cardsMessage, { parse_mode: 'Markdown' }).then(function () {
    sessions[ctx.from.id] = { flow: 'deposit', step: 'waiting_amount', lang: 'fa', data: {} };
    ctx.reply(t.depositAskAmount);
  });
});

bot.action('wallet_withdraw', (ctx) => {
  ctx.answerCbQuery();
  sessions[ctx.from.id] = { flow: 'withdraw', step: 'waiting_amount', lang: 'fa', data: {} };
  ctx.reply(texts.fa.withdrawAskAmount);
});

bot.action(/^withdraw_card_/, async (ctx) => {
  ctx.answerCbQuery();
  const cardNumber = ctx.match[0].replace('withdraw_card_', '');
  const session = sessions[ctx.from.id];
  const amount = session && session.data ? session.data.amount : null;

  await pool.query(
    'INSERT INTO wallet_requests (telegram_id, type, amount, card_number, status, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
    [String(ctx.from.id), 'withdraw', amount, cardNumber, 'pending', new Date().toISOString()]
  );

  delete sessions[ctx.from.id];
  ctx.reply(texts.fa.withdrawSubmitted);
});

bot.action('wallet_addcard', (ctx) => {
  ctx.answerCbQuery();
  sessions[ctx.from.id] = { flow: 'addcard', step: 'waiting_card', lang: 'fa', data: {} };
  ctx.reply(texts.fa.addCardAsk);
});

bot.action('confirm_rules', (ctx) => {
  ctx.deleteMessage().catch(function () {});
  delete sessions[ctx.from.id];
  showMainMenu(ctx);
});

bot.on('text', async (ctx, next) => {
  const session = sessions[ctx.from.id];
  if (!session) return next();

  const t = texts[session.lang] || texts.fa;

  if (session.flow === 'registration') {
    if (session.step === 'waiting_name') {
      session.data.fullName = ctx.message.text;
      session.step = 'waiting_card';
      ctx.reply(t.requestCard);
      return;
    }

    if (session.step === 'waiting_card') {
      session.data.cardNumber = ctx.message.text;

      await pool.query(
        'INSERT INTO users (telegram_id, phone, full_name, card_number, language, balance, registered_at) ' +
        'VALUES ($1, $2, $3, $4, $5, 0, $6) ' +
        'ON CONFLICT (telegram_id) DO UPDATE SET phone = EXCLUDED.phone, full_name = EXCLUDED.full_name, ' +
        'card_number = EXCLUDED.card_number, language = EXCLUDED.language',
        [String(ctx.from.id), session.data.phone, session.data.fullName, session.data.cardNumber, session.lang, new Date().toISOString()]
      );

      ctx.reply(t.registrationSuccess).then(function () {
        ctx.reply(t.rulesText, {
          reply_markup: {
            inline_keyboard: [
              [{ text: t.confirmRulesButton, callback_data: 'confirm_rules' }]
            ]
          }
        });
      });
      return;
    }
  }

  if (session.flow === 'deposit' && session.step === 'waiting_amount') {
    session.data.amount = ctx.message.text;
    session.step = 'waiting_receipt';
    ctx.reply(t.depositAskReceipt);
    return;
  }

  if (session.flow === 'withdraw' && session.step === 'waiting_amount') {
    const amount = parseInt(ctx.message.text.replace(/[^0-9]/g, ''), 10);

    if (!amount || amount < MIN_WITHDRAW) {
      ctx.reply(t.withdrawMinError);
      return;
    }

    session.data.amount = amount;

    const cards = await getUserCards(ctx.from.id);
    const buttons = cards.map(function (c) {
      return [{ text: c.card_number, callback_data: 'withdraw_card_' + c.card_number }];
    });
    buttons.push([{ text: t.addCardButton, callback_data: 'wallet_addcard' }]);

    ctx.reply(t.withdrawSelectCard, { reply_markup: { inline_keyboard: buttons } });
    return;
  }

  if (session.flow === 'addcard' && session.step === 'waiting_card') {
    const cardNumber = ctx.message.text.replace(/[^0-9]/g, '');

    if (cardNumber.length !== 16) {
      ctx.reply(t.addCardInvalid);
      return;
    }

    await pool.query(
      'INSERT INTO cards (telegram_id, card_number, created_at) VALUES ($1, $2, $3)',
      [String(ctx.from.id), cardNumber, new Date().toISOString()]
    );

    delete sessions[ctx.from.id];
    ctx.reply(t.addCardSuccess);
    return;
  }
});

bot.on('photo', async (ctx) => {
  const session = sessions[ctx.from.id];
  if (!session || session.flow !== 'deposit' || session.step !== 'waiting_receipt') return;

  const t = texts.fa;
  const photos = ctx.message.photo;
  const fileId = photos[photos.length - 1].file_id;

  await pool.query(
    'INSERT INTO wallet_requests (telegram_id, type, amount, receipt_file_id, status, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
    [String(ctx.from.id), 'deposit', session.data.amount, fileId, 'pending', new Date().toISOString()]
  );

  delete sessions[ctx.from.id];
  ctx.reply(t.depositSubmitted);
});

function isAdmin(telegramId) {
  return ADMIN_IDS.indexOf(Number(telegramId)) !== -1;
}

async function showAdminMenu(ctx) {
  const pendingRes = await pool.query("SELECT COUNT(*) AS c FROM wallet_requests WHERE status = 'pending'");
  const pendingCount = pendingRes.rows[0].c;
  const settingRes = await pool.query('SELECT value FROM settings WHERE key = $1', ['start_reaction']);
  const currentReaction = settingRes.rows[0] ? settingRes.rows[0].value : '🔥';

  ctx.reply('👑 پنل مدیریت پیشرفته\n\n' +
    '🔹 درخواست‌های در انتظار: ' + pendingCount + '\n' +
    '🔹 ایموجی اکشن استارت فعلی: ' + currentReaction + '\n\n' +
    '💡 برای تغییر ایموجی استارت کافیست بفرستید:\n`/setreaction <ایموجی>`', {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '📥 درخواست‌های در انتظار کیف پول', callback_data: 'admin_pending' }]
      ]
    }
  });
}

bot.command('admin', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  await showAdminMenu(ctx);
});

bot.action('admin_pending', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  ctx.answerCbQuery();

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
    message += 'کاربر: ' + userName + ' (' + req.telegram_id + ')\n';
    message += 'مبلغ: ' + Number(req.amount).toLocaleString('en-US') + ' تومان\n';

    if (req.type === 'withdraw') {
      message += 'شماره کارت مقصد: ' + req.card_number + '\n';
    }

    const buttons = [
      [
        { text: '✅ تایید', callback_data: 'admin_approve_' + req.id },
        { text: '❌ رد', callback_data: 'admin_reject_' + req.id }
      ]
    ];

    if (req.type === 'deposit' && req.receipt_file_id) {
      await ctx.replyWithPhoto(req.receipt_file_id, {
        caption: message,
        reply_markup: { inline_keyboard: buttons }
      });
    } else {
      await ctx.reply(message, { reply_markup: { inline_keyboard: buttons } });
    }
  }
});

bot.action(/^admin_approve_/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  ctx.answerCbQuery();

  const requestId = ctx.match[0].replace('admin_approve_', '');
  const reqRes = await pool.query('SELECT * FROM wallet_requests WHERE id = $1', [requestId]);
  const request = reqRes.rows[0];

  if (!request || request.status !== 'pending') {
    ctx.reply('این درخواست قبلاً بررسی شده است.');
    return;
  }

  if (request.type === 'deposit') {
    await pool.query('UPDATE users SET balance = balance + $1 WHERE telegram_id = $2', [request.amount, request.telegram_id]);
    bot.telegram.sendMessage(request.telegram_id, '✅ شارژ کیف پول شما تایید شد.\nمبلغ ' + Number(request.amount).toLocaleString('en-US') + ' تومان به موجودی شما اضافه شد.');
    await grantBonusIfEligible(request.telegram_id);
  } else {
    await pool.query('UPDATE users SET balance = balance - $1 WHERE telegram_id = $2', [request.amount, request.telegram_id]);
    bot.telegram.sendMessage(request.telegram_id, '✅ درخواست برداشت شما تایید شد.\nمبلغ ' + Number(request.amount).toLocaleString('en-US') + ' تومان به کارت شما واریز شد.');
  }

  await pool.query("UPDATE wallet_requests SET status = 'approved' WHERE id = $1", [requestId]);

  ctx.reply('درخواست شماره ' + requestId + ' تایید شد ✅');
});

bot.action(/^admin_reject_/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  ctx.answerCbQuery();

  const requestId = ctx.match[0].replace('admin_reject_', '');
  const reqRes = await pool.query('SELECT * FROM wallet_requests WHERE id = $1', [requestId]);
  const request = reqRes.rows[0];

  if (!request || request.status !== 'pending') {
    ctx.reply('این درخواست قبلاً بررسی شده است.');
    return;
  }

  await pool.query("UPDATE wallet_requests SET status = 'rejected' WHERE id = $1", [requestId]);

  bot.telegram.sendMessage(request.telegram_id, '❌ درخواست شما رد شد.\nدر صورت هرگونه سؤال با پشتیبانی در تماس باشید.');

  ctx.reply('درخواست شماره ' + requestId + ' رد شد ❌');
});

// راه‌اندازی جداول دیتابیس و مقادیر پیش‌فرض، سپس روشن کردن ربات
async function init() {
  await pool.query(
    'CREATE TABLE IF NOT EXISTS users (' +
    'telegram_id TEXT PRIMARY KEY, ' +
    'phone TEXT, ' +
    'full_name TEXT, ' +
    'card_number TEXT, ' +
    'language TEXT, ' +
    'balance INTEGER DEFAULT 0, ' +
    'registered_at TEXT' +
    ')'
  );

  await pool.query(
    'CREATE TABLE IF NOT EXISTS cards (' +
    'id SERIAL PRIMARY KEY, ' +
    'telegram_id TEXT, ' +
    'card_number TEXT, ' +
    'created_at TEXT' +
    ')'
  );

  await pool.query(
    'CREATE TABLE IF NOT EXISTS wallet_requests (' +
    'id SERIAL PRIMARY KEY, ' +
    'telegram_id TEXT, ' +
    'type TEXT, ' +
    'amount INTEGER, ' +
    'card_number TEXT, ' +
    'receipt_file_id TEXT, ' +
    'status TEXT, ' +
    'created_at TEXT' +
    ')'
  );

  await pool.query(
    'CREATE TABLE IF NOT EXISTS required_channels (' +
    'id SERIAL PRIMARY KEY, ' +
    'chat_id TEXT, ' +
    'invite_link TEXT, ' +
    'title TEXT, ' +
    'active INTEGER DEFAULT 1' +
    ')'
  );

  await pool.query(
    'CREATE TABLE IF NOT EXISTS settings (' +
    'key TEXT PRIMARY KEY, ' +
    'value TEXT' +
    ')'
  );

  await pool.query(
    'CREATE TABLE IF NOT EXISTS bonuses (' +
    'id SERIAL PRIMARY KEY, ' +
    'telegram_id TEXT, ' +
    'status TEXT, ' +
    'amount INTEGER, ' +
    'created_at TEXT' +
    ')'
  );

  const defaultReactionRes = await pool.query('SELECT value FROM settings WHERE key = $1', ['start_reaction']);
  if (defaultReactionRes.rows.length === 0) {
    await pool.query('INSERT INTO settings (key, value) VALUES ($1, $2)', ['start_reaction', '🎉']);
  }

  const existingChannelRes = await pool.query('SELECT * FROM required_channels WHERE chat_id = $1', ['-1003953090902']);
  if (existingChannelRes.rows.length === 0) {
    await pool.query(
      'INSERT INTO required_channels (chat_id, invite_link, title, active) VALUES ($1, $2, $3, 1)',
      ['-1003953090902', 'https://t.me/+G9og5Y6KfxEyNTRk', 'کانال اصلی']
    );
  }

  bot.launch();
  console.log('ربات با موفقیت به Supabase متصل و روشن شد');
}

init().catch(function (e) {
  console.log('خطا در راه‌اندازی: ' + e.message);
});
