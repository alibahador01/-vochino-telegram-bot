// handlers/wallet.js
const { Markup } = require('telegraf');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { isAdmin } = require('../utils');

// متون سه‌زبانه برای دکمه‌های داخلی جیب
const walletTexts = {
  fa: {
    increase: '🧳 افزایش موجودی',
    withdraw: '💸 برداشت موجودی',
    gold: '🪪 افزایش سقف خرید',
    addCard: '💳 افزودن کارت جدید',
    report: '♻️ گزارش تراکنش‌ها',
    earn: '🪎 کسب درآمد',
    back: '🔴 بازگشت'
  },
  en: {
    increase: '🧳 Top Up',
    withdraw: '💸 Withdraw',
    gold: '🪪 Raise Limit',
    addCard: '💳 Add Card',
    report: '♻️ Transactions',
    earn: '🪎 Earn',
    back: '🔴 Back'
  },
  tr: {
    increase: '🧳 Bakiye Yükle',
    withdraw: '💸 Çekim',
    gold: '🪪 Limit Artır',
    addCard: '💳 Kart Ekle',
    report: '♻️ İşlemler',
    earn: '🪎 Kazanç',
    back: '🔴 Geri'
  }
};

// نمایش منوی کیف پول (دکمه‌های شیشه‌ای)
const walletMenu = async (ctx) => {
  ctx.session.step = 'wallet';
  const user = await User.findOne({ telegramId: ctx.from.id });
  const lang = user?.language || 'fa';
  const t = walletTexts[lang];

  await ctx.reply('💳 کیف پول من | Vochino⁰¹\n✨ از اینجا کیف پول خود را مدیریت کنید.',
    Markup.inlineKeyboard([
      [Markup.button.callback(t.increase, 'increase_balance'),
       Markup.button.callback(t.withdraw, 'withdraw')],
      [Markup.button.callback(t.gold, 'verify_gold'),
       Markup.button.callback(t.addCard, 'add_card')],
      [Markup.button.callback(t.report, 'transaction_report'),
       Markup.button.callback(t.earn, 'referral_earning')],
      [Markup.button.callback(t.back, 'back_to_main')]
    ])
  );
  if (ctx.callbackQuery) await ctx.answerCbQuery();
};

// افزایش موجودی (نمایش راهنما)
const increaseBalance = async (ctx) => {
  // اینجا می‌توانی شماره کارت بانکی یا درگاه پرداخت را نمایش دهی
  // برای سادگی، پیام راهنما
  await ctx.reply('💳 لطفاً مبلغ مورد نظر را به شماره کارت زیر واریز کرده و رسید را برای پشتیبانی ارسال کنید:\n\n`6037-xxxx-xxxx-xxxx`\n\nپس از تأیید، موجودی شما افزایش می‌یابد.', { parse_mode: 'Markdown' });
  await ctx.answerCbQuery();
};

// درخواست برداشت
const withdrawRequest = async (ctx) => {
  const user = await User.findOne({ telegramId: ctx.from.id });
  if (!user.cardNumber) {
    await ctx.answerCbQuery('❌ ابتدا شماره کارت خود را ثبت کنید.');
    return;
  }
  // ذخیره مرحله برای درخواست مبلغ
  ctx.session.step = 'withdraw_amount';
  await ctx.reply('💰 لطفاً مبلغ برداشت (تومان) را وارد کنید:');
  if (ctx.callbackQuery) await ctx.answerCbQuery();
};

// پردازش مبلغ برداشت و ارسال به ادمین
const processWithdrawAmount = async (ctx) => {
  const amount = parseInt(ctx.message.text.replace(/,/g, ''));
  if (isNaN(amount) || amount <= 0) {
    return ctx.reply('⚠️ لطفاً یک عدد صحیح معتبر وارد کنید.');
  }

  const user = await User.findOne({ telegramId: ctx.from.id });
  if (amount > user.balance) {
    return ctx.reply('❌ موجودی کافی نیست.');
  }

  // ایجاد تراکنش معلق
  const tx = await Transaction.create({
    userId: ctx.from.id,
    type: 'withdraw',
    amount,
    status: 'pending',
    description: `درخواست برداشت به کارت ${user.cardNumber}`
  });

  // ارسال به ادمین‌ها
  const admins = process.env.ADMIN_IDS.split(',').map(Number);
  for (const adminId of admins) {
    try {
      await ctx.telegram.sendMessage(adminId,
        `📤 درخواست برداشت\n` +
        `👤 کاربر: ${user.name || '---'}\n` +
        `🆔 شناسه: \`${user.telegramId}\`\n` +
        `💳 شماره کارت: \`${user.cardNumber}\`\n` +
        `💰 مبلغ: ${amount.toLocaleString()} تومان\n` +
        `📌 کد پیگیری: ${tx.trackingCode}`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('✅ تأیید واریز', `confirm_withdraw_${tx._id}`),
             Markup.button.callback('❌ رد', `reject_withdraw_${tx._id}`)]
          ])
        }
      );
    } catch (err) {
      console.log('Could not send to admin:', adminId);
    }
  }

  ctx.session.step = 'main_menu';
  await ctx.reply('✅ درخواست شما ثبت شد. پس از بررسی پشتیبانی، موجودی شما برداشت خواهد شد.');
};

// تأیید برداشت توسط ادمین
const confirmWithdraw = async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const txId = ctx.match[0].split('_')[2];
  const tx = await Transaction.findById(txId);
  if (!tx || tx.status !== 'pending') {
    await ctx.answerCbQuery('این تراکنش قبلاً پردازش شده.');
    return;
  }

  // کسر موجودی کاربر
  await User.updateOne(
    { telegramId: tx.userId },
    { $inc: { balance: -tx.amount } }
  );

  tx.status = 'completed';
  await tx.save();

  // اطلاع به کاربر
  try {
    await ctx.telegram.sendMessage(tx.userId,
      `✅ برداشت شما به مبلغ ${tx.amount.toLocaleString()} تومان انجام شد.\n📌 کد پیگیری: ${tx.trackingCode}`
    );
  } catch (err) {}

  await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  await ctx.reply(`✅ تراکنش ${tx.trackingCode} تأیید شد.`);
};

// رد برداشت توسط ادمین
const rejectWithdraw = async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const txId = ctx.match[0].split('_')[2];
  const tx = await Transaction.findById(txId);
  if (!tx || tx.status !== 'pending') {
    await ctx.answerCbQuery('این تراکنش قبلاً پردازش شده.');
    return;
  }

  tx.status = 'failed';
  await tx.save();

  try {
    await ctx.telegram.sendMessage(tx.userId,
      `❌ متأسفانه درخواست برداشت شما (${tx.amount.toLocaleString()} تومان) رد شد.\n📌 کد پیگیری: ${tx.trackingCode}`
    );
  } catch (err) {}

  await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  await ctx.reply(`❌ تراکنش ${tx.trackingCode} رد شد.`);
};

// افزودن کارت
const addCard = async (ctx) => {
  ctx.session.step = 'add_card';
  await ctx.reply('💳 لطفاً شماره کارت ۱۶ رقمی خود را وارد کنید:');
  if (ctx.callbackQuery) await ctx.answerCbQuery();
};

// پردازش شماره کارت ورودی
const processCardNumber = async (ctx) => {
  const cardNumber = ctx.message.text.replace(/\s/g, '');
  // اعتبارسنجی ساده برای ۱۶ رقم
  if (!/^\d{16}$/.test(cardNumber)) {
    return ctx.reply('⚠️ شماره کارت باید ۱۶ رقم باشد. لطفاً دوباره وارد کنید.');
  }

  await User.updateOne(
    { telegramId: ctx.from.id },
    { cardNumber }
  );
  ctx.session.step = 'main_menu';
  await ctx.reply('✅ شماره کارت با موفقیت ثبت شد.');
};

// گزارش تراکنش‌ها
const transactionReport = async (ctx) => {
  const userId = ctx.from.id;
  const transactions = await Transaction.find({ userId })
    .sort({ createdAt: -1 })
    .limit(10);

  if (transactions.length === 0) {
    await ctx.reply('شما هیچ تراکنشی ندارید.');
    if (ctx.callbackQuery) await ctx.answerCbQuery();
    return;
  }

  const emojiMap = {
    buy: '🟢 خرید',
    sell: '🟣 فروش',
    withdraw: '🔴 برداشت',
    pending: '🟠 در حال انتظار'
  };

  let report = '📋 **گزارش ۱۰ تراکنش اخیر**\n\n';
  transactions.forEach(tx => {
    report += `${emojiMap[tx.type]} | ${tx.amount.toLocaleString()} تومان\n`;
    report += `📎 کد: \`${tx.trackingCode}\` | وضعیت: ${tx.status === 'completed' ? '✅' : tx.status === 'pending' ? '⏳' : '❌'}\n`;
    report += `📅 ${tx.createdAt.toLocaleDateString('fa-IR')}\n\n`;
  });

  await ctx.reply(report, { parse_mode: 'Markdown' });
  if (ctx.callbackQuery) await ctx.answerCbQuery();
};

// پردازش تیکت پشتیبانی (که ممکن است از اینجا فراخوانی شود)
const processSupportTicket = async (ctx) => {
  const message = ctx.message.text;
  const admins = process.env.ADMIN_IDS.split(',').map(Number);
  for (const adminId of admins) {
    try {
      await ctx.telegram.sendMessage(adminId,
        `📩 تیکت پشتیبانی\nاز کاربر: \`${ctx.from.id}\`\n\n${message}`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('پاسخ', `reply_ticket_${ctx.from.id}`),
             Markup.button.callback('رد', `reject_ticket_${ctx.from.id}`)]
          ])
        }
      );
    } catch (err) {}
  }
  ctx.session.step = 'main_menu';
  await ctx.reply('✅ پیام شما به پشتیبانی ارسال شد.');
};

module.exports = {
  walletMenu,
  increaseBalance,
  withdrawRequest,
  processWithdrawAmount,
  confirmWithdraw,
  rejectWithdraw,
  addCard,
  processCardNumber,
  transactionReport,
  processSupportTicket
};
