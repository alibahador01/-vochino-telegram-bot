const texts = require('../texts');
const { sessions, showMainMenu } = require('../utils');
const { pool, getUser, getReferrals } = require('../db');

module.exports = function registerProfileHandlers(bot) {

  bot.action('menu_profile', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    const user = await getUser(ctx.from.id);
    if (!user) {
      ctx.reply('اطلاعاتی برای شما ثبت نشده.');
      return;
    }

    const referrals = await getReferrals(ctx.from.id);
    const userLevel = user.verification_status === 'verified' ? '🥇 طلایی' : '🥈 نقره‌ای';

    let infoText =
      '🧢 **پروفایل کاربری**\n\n' +
      '🆔 `' + user.telegram_id + '`\n' +
      '👤 **نام:** ' + (user.full_name || '-') + '\n' +
      '📱 **شماره:** ' + (user.phone || '-') + '\n' +
      '💳 **کارت:** ' + (user.card_number || '-') + '\n' +
      '💰 **موجودی جیب:** ' + Number(user.balance).toLocaleString('en-US') + ' تومان\n' +
      '🧩 **موجودی بونوس:** ' + Number(user.bonus_balance).toLocaleString('en-US') + ' تومان\n' +
      '👥 **زیرمجموعه:** ' + referrals + ' نفر\n' +
      '🏅 **سطح کاربری:** ' + userLevel + '\n';

    if (user.verification_status === 'pending') {
      infoText += '\n🟡 **وضعیت احراز هویت:** در انتظار بررسی';
    } else if (user.verification_status === 'verified') {
      infoText += '\n✅ **وضعیت احراز هویت:** تأیید شده';
    } else {
      infoText += '\n❌ **وضعیت احراز هویت:** تأیید نشده';
    }

    const buttons = [
      [{ text: '🛡️ احراز هویت طلایی', callback_data: 'profile_verification' }],
      [{ text: '🧾 گزارش تراکنش‌ها', callback_data: 'menu_invoices' }],
      [{ text: '🔙 بازگشت', callback_data: 'back_main_menu' }]
    ];

    ctx.reply(infoText, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons }
    });
  });

  bot.action('profile_verification', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    const user = await getUser(ctx.from.id);

    if (user.verification_status === 'verified') {
      ctx.reply('✅ شما قبلاً احراز هویت طلایی شده‌اید.');
      return;
    }

    if (user.verification_status === 'pending') {
      ctx.reply('🟡 درخواست احراز هویت شما در حال بررسی است. لطفاً صبر کنید.');
      return;
    }

    sessions[ctx.from.id] = {
      flow: 'profile_verification',
      step: 'waiting_photo',
      lang: 'fa'
    };

    ctx.reply(
      '🛡️ **احراز هویت طلایی**\n\n' +
      'لطفاً **عکس کارت ملی** خود را به همراه **کارت بانکی** که در ربات ثبت کرده‌اید، در یک قاب بگیرید.\n\n' +
      '📸 روی کارت بانکی، عبارت **"ووچینو"** را به صورت دستی بنویسید و در کنار کارت ملی عکس بگیرید.\n\n' +
      '✅ پس از تأیید، نشان طلایی دریافت خواهید کرد.',
      { parse_mode: 'Markdown' }
    );
  });

  bot.on('photo', async (ctx, next) => {
    const session = sessions[ctx.from.id];
    if (!session || session.flow !== 'profile_verification' || session.step !== 'waiting_photo') return next();

    const photos = ctx.message.photo;
    const fileId = photos[photos.length - 1].file_id;

    await pool.query('UPDATE users SET national_card_photo_id = $1, verification_status = $2 WHERE telegram_id = $3', [fileId, 'pending', String(ctx.from.id)]);

    delete sessions[ctx.from.id];
    ctx.reply('✅ عکس شما دریافت شد.\n🟡 درخواست احراز هویت شما برای بررسی به ادمین ارسال شد.');

    // اطلاع‌رسانی به ادمین‌ها
    const admins = require('../constants').ADMIN_IDS;
    for (const adminId of admins) {
      try {
        await ctx.telegram.sendMessage(adminId, '🛡️ درخواست احراز هویت جدید از کاربر `' + ctx.from.id + '`', { parse_mode: 'Markdown' });
      } catch (e) {}
    }
  });
};
