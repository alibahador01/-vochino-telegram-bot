// handlers/verification.js
const { Markup } = require('telegraf');
const User = require('../models/User');
const { isAdmin } = require('../utils');

// درخواست احراز هویت طلایی
const verifyGoldRequest = async (ctx) => {
  const user = await User.findOne({ telegramId: ctx.from.id });
  if (!user) return;
  
  const lang = user.language || 'fa';
  
  // متن اختصاصی برای درخواست احراز طلایی
  let message;
  if (lang === 'fa') {
    message = `👤 کاربر گرامی: ${user.name || 'کاربر'}
💎 احراز هویت طلایی | Vochino⁰¹
🔐 یک قدم تا سقف خرید بالاتر
کافیست یک تصویر واضح و شفاف از 🪪 کارت ملی در کنار 💳 کارت بانکی ارسال نمایید.
✅ پس از بررسی توسط پشتیبانی و تأیید مدارک، درخواست افزایش سقف خرید شما انجام خواهد شد.
💛 Vochino⁰¹ | تجربه‌ای متفاوت`;
  } else if (lang === 'en') {
    message = `👤 Dear ${user.name || 'User'}
💎 Gold Verification | Vochino⁰¹
🔐 One step to higher purchase limit
Please send a clear photo of your national ID card 🪪 next to your bank card 💳.
✅ After review and approval by support, your limit will be increased.
💛 Vochino⁰¹ | A different experience`;
  } else { // tr
    message = `👤 Sayın ${user.name || 'Kullanıcı'}
💎 Altın Doğrulama | Vochino⁰¹
🔐 Daha yüksek alım limitine bir adım
Lütfen 🪪 kimlik kartınızı ve 💳 banka kartınızı yan yana net bir şekilde fotoğraflayıp gönderin.
✅ Destek ekibi tarafından incelendikten sonra limit artırımı yapılacaktır.
💛 Vochino⁰¹ | Farklı bir deneyim`;
  }
  
  // تنظیم مرحله برای دریافت عکس
  ctx.session.step = 'upload_gold_docs';
  await ctx.reply(message);
  if (ctx.callbackQuery) await ctx.answerCbQuery();
};

// پردازش عکس ارسالی کاربر برای احراز طلایی
const processGoldDocuments = async (ctx) => {
  // فقط اگر مرحله فعال باشد
  if (ctx.session.step !== 'upload_gold_docs') return;
  
  const userId = ctx.from.id;
  const user = await User.findOne({ telegramId: userId });
  if (!user) return;

  // عکس(ها) می‌توانند شامل چندین photo size باشند، بزرگ‌ترین را می‌گیریم.
  const photo = ctx.message.photo.slice(-1)[0];
  const fileId = photo.file_id;

  // تغییر مرحله برای جلوگیری از تکرار
  ctx.session.step = 'main_menu';

  // ارسال عکس به تمام ادمین‌ها همراه با دکمه‌های تأیید/رد
  const admins = process.env.ADMIN_IDS.split(',').map(Number);
  for (const adminId of admins) {
    try {
      await ctx.telegram.sendPhoto(adminId, fileId, {
        caption: `📸 مدارک احراز طلایی\n👤 کاربر: ${user.name || '---'}\n🆔 شناسه: \`${userId}\`\n📱 تلفن: ${user.phone || '---'}\n💳 کارت: ${user.cardNumber || '---'}`,
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('✅ تأیید', `confirm_verification_${userId}`),
           Markup.button.callback('❌ رد', `reject_verification_${userId}`)]
        ])
      });
    } catch (err) {
      console.log(`Could not send to admin ${adminId}:`, err.message);
    }
  }

  await ctx.reply('✅ مدارک شما با موفقیت ارسال شد. پس از بررسی پشتیبانی، نتیجه به شما اطلاع داده خواهد شد.');
};

// تأیید احراز هویت توسط ادمین
const confirmVerification = async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  
  const targetId = parseInt(ctx.match[0].split('_').pop());
  if (isNaN(targetId)) return;
  
  // به‌روزرسانی سطح کاربر به طلایی
  await User.updateOne({ telegramId: targetId }, { verificationLevel: 'gold' });
  
  // اطلاع‌رسانی به کاربر
  try {
    await ctx.telegram.sendMessage(targetId, '🎉 تبریک! احراز هویت طلایی شما تأیید شد. اکنون سقف خرید شما افزایش یافته است.');
  } catch (err) {}
  
  // ویرایش پیام ادمین (حذف دکمه‌ها)
  try {
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    await ctx.reply('✅ درخواست تأیید شد.');
  } catch (err) {}
  
  await ctx.answerCbQuery('تأیید شد');
};

// رد احراز هویت توسط ادمین
const rejectVerification = async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  
  const targetId = parseInt(ctx.match[0].split('_').pop());
  if (isNaN(targetId)) return;
  
  // اطلاع‌رسانی به کاربر
  try {
    await ctx.telegram.sendMessage(targetId, '❌ متأسفانه مدارک شما برای احراز هویت طلایی رد شد. لطفاً دوباره تلاش کنید یا با پشتیبانی تماس بگیرید.');
  } catch (err) {}
  
  // ویرایش پیام ادمین
  try {
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    await ctx.reply('❌ درخواست رد شد.');
  } catch (err) {}
  
  await ctx.answerCbQuery('رد شد');
};

module.exports = {
  verifyGoldRequest,
  processGoldDocuments,
  confirmVerification,
  rejectVerification
};
