

bot.action('confirm_rules', (ctx) => {
  ctx.deleteMessage().catch(function () {});
  delete sessions[ctx.from.id];
  showMainMenu(ctx);
});

bot.on('text', (ctx, next) => {
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

      db.prepare(
        'INSERT OR REPLACE INTO users (telegram_id, phone, full_name, card_number, language, balance, registered_at) VALUES (?, ?, ?, ?, ?, 0, ?)'
      ).run(String(ctx.from.id), session.data.phone, session.data.fullName, session.data.cardNumber, session.lang, new Date().toISOString());

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

    const cards = getUserCards(ctx.from.id);
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

    db.prepare(
      'INSERT INTO cards (telegram_id, card_number, created_at) VALUES (?, ?, ?)'
    ).run(String(ctx.from.id), cardNumber, new Date().toISOString());

    delete sessions[ctx.from.id];
    ctx.reply(t.addCardSuccess);
    return;
  }
});

bot.on('photo', (ctx) => {
  const session = sessions[ctx.from.id];
  if (!session || session.flow !== 'deposit' || session.step !== 'waiting_receipt') return;

  const t = texts.fa;
  const photos = ctx.message.photo;
  const fileId = photos[photos.length - 1].file_id;

  db.prepare(
    'INSERT INTO wallet_requests (telegram_id, type, amount, receipt_file_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(String(ctx.from.id), 'deposit', session.data.amount, fileId, 'pending', new Date().toISOString());

  delete sessions[ctx.from.id];
  ctx.reply(t.depositSubmitted);
});

function isAdmin(telegramId) {
  return ADMIN_IDS.indexOf(Number(telegramId)) !== -1;
}

function showAdminMenu(ctx) {
  const pendingCount = db.prepare('SELECT COUNT(*) AS c FROM wallet_requests WHERE status = ?').get('pending').c;

  ctx.reply('👑 پنل مدیریت\n\nدرخواست‌های در انتظار: ' + pendingCount, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📥 درخواست‌های در انتظار کیف پول', callback_data: 'admin_pending' }]
      ]
    }
  });
}

bot.command('admin', (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  showAdminMenu(ctx);
});

bot.action('admin_pending', (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  ctx.answerCbQuery();

  const pendingRequests = db.prepare('SELECT * FROM wallet_requests WHERE status = ? ORDER BY id ASC').all('pending');

  if (pendingRequests.length === 0) {
    ctx.reply('در حال حاضر هیچ درخواست در انتظاری وجود ندارد ✅');
    return;
  }

  pendingRequests.forEach(function (req) {
    const user = getUser(req.telegram_id);
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
      ctx.replyWithPhoto(req.receipt_file_id, {
        caption: message,
        reply_markup: { inline_keyboard: buttons }
      });
    } else {
      ctx.reply(message, { reply_markup: { inline_keyboard: buttons } });
    }
  });
});

bot.action(/^admin_approve_/, (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  ctx.answerCbQuery();

  const requestId = ctx.match[0].replace('admin_approve_', '');
  const request = db.prepare('SELECT * FROM wallet_requests WHERE id = ?').get(requestId);

  if (!request || request.status !== 'pending') {
    ctx.reply('این درخواست قبلاً بررسی شده است.');
    return;
  }

  if (request.type === 'deposit') {
    db.prepare('UPDATE users SET balance = balance + ? WHERE telegram_id = ?').run(request.amount, request.telegram_id);
    bot.telegram.sendMessage(request.telegram_id, '✅ شارژ کیف پول شما تایید شد.\nمبلغ ' + Number(request.amount).toLocaleString('en-US') + ' تومان به موجودی شما اضافه شد.');
  } else {
    db.prepare('UPDATE users SET balance = balance - ? WHERE telegram_id = ?').run(request.amount, request.telegram_id);
    bot.telegram.sendMessage(request.telegram_id, '✅ درخواست برداشت شما تایید شد.\nمبلغ ' + Number(request.amount).toLocaleString('en-US') + ' تومان به کارت شما واریز شد.');
  }

  db.prepare('UPDATE wallet_requests SET status = ? WHERE id = ?').run('approved', requestId);

  ctx.reply('درخواست شماره ' + requestId + ' تایید شد ✅');
});

bot.action(/^admin_reject_/, (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  ctx.answerCbQuery();

  const requestId = ctx.match[0].replace('admin_reject_', '');
  const request = db.prepare('SELECT * FROM wallet_requests WHERE id = ?').get(requestId);

  if (!request || request.status !== 'pending') {
    ctx.reply('این درخواست قبلاً بررسی شده است.');
    return;
  }

  db.prepare('UPDATE wallet_requests SET status = ? WHERE id = ?').run('rejected', requestId);

  bot.telegram.sendMessage(request.telegram_id, '❌ درخواست شما رد شد.\nدر صورت هرگونه سؤال با پشتیبانی در تماس باشید.');

  ctx.reply('درخواست شماره ' + requestId + ' رد شد ❌');
});

bot.launch();
console.log('ربات با موفقیت روشن شد');

const express = require('express');
const app = express();
app.get('/', function (req, res) { res.send('Bot is alive!'); });
app.listen(3000, function () { console.log('Web server is running on port 3000'); });// ==========================================
// بخش تنظیم واکنش (مخصوص Telegraf / GrammY)
// ==========================================
bot.command('setreaction', (ctx) => {
  const ADMIN_ID = 8231962200;

  // بررسی دسترسی ادمین
  if (ctx.from?.id !== ADMIN_ID) {
    return ctx.reply("⚠️ شما دسترسی مدیریت این ربات را ندارید.");
  }

  // گرفتن ایموجی ارسال شده
  const textParts = ctx.message.text.split(' ');
  const emoji = textParts[1];

  if (!emoji) {
    return ctx.reply("راهنما: لطفاً ایموجی را همراه دستور بفرستید.\nمثال:\n/setreaction 👍");
  }

  // پاسخ موفقیت‌آمیز
  return ctx.reply(`✅ ایموجی واکنش با موفقیت روی ${emoji} تنظیم شد.`);
});
