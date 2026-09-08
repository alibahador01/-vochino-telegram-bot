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
    const userLevel = user.verification_status === 'gold' ? '🥇 طلایی' : (user.verification_status === 'silver' ? '🥈 نقره‌ای' : '⚪ مهمان');

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

    if (user.verification_status === 'gold') {
      infoText += '\n✅ **وضعیت احراز هویت:** طلایی تأیید شده';
    } else {
      // نکته: وضعیت «در انتظار بررسی» احراز طلایی در جدول wallet_requests نگه داشته می‌شود، نه روی خود کاربر
      const pendingReq = await pool.query(
        `SELECT id FROM wallet_requests WHERE telegram_id = $1 AND type = 'gold_verify' AND status = 'pending'`,
        [String(ctx.from.id)]
      );
      if (pendingReq.rows.length > 0) {
        infoText += '\n🟡 **وضعیت احراز هویت طلایی:** در انتظار بررسی';
      } else {
        infoText += '\n❌ **وضعیت احراز هویت طلایی:** تأیید نشده';
      }
    }

    const buttons = [
      // این دکمه به همون فلوی سالم و کامل احراز طلایی در wallet.js وصل می‌شه (نه یک فلوی جدا و ناقص)
      [{ text: '🛡️ احراز هویت طلایی', callback_data: 'wallet_gold_verify' }],
      [{ text: '🧾 گزارش تراکنش‌ها', callback_data: 'menu_invoices' }],
      [{ text: '🔙 بازگشت', callback_data: 'back_main_menu' }]
    ];

    ctx.reply(infoText, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons }
    });
  });

  // توجه: فلوی قدیمی «profile_verification» + هندلر عکسِ مربوطه از اینجا عمداً حذف شد.
  // آن فلو verification_status را مستقیم و بدون تأیید ادمین به 'pending' تغییر می‌داد و باعث می‌شد
  // وضعیت 'silver' کاربر (که با زحمت احراز شده بود) پاک شود و دیگر هیچ‌وقت هم تکمیل نشود
  // (چون هیچ‌جای دیگر کد آن را به 'verified' تبدیل نمی‌کرد). حالا همه‌چیز از مسیر واحد و سالم
  // wallet.js (wallet_gold_verify → wallet_requests → تأیید ادمین → verification_status='gold') انجام می‌شود.
};

