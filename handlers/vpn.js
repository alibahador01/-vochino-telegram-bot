const texts = require('../texts');
const { sessions, generateTrackingCode } = require('../utils');
const { pool, checkMembership } = require('../db');

module.exports = function registerVPNHandlers(bot) {

  bot.action('menu_vpn', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const isMember = await checkMembership(ctx);
    if (!isMember) {
      ctx.reply('⚠️ لطفاً ابتدا در کانال اجباری عضو شوید.');
      return;
    }

    const activeService = await pool.query(
      "SELECT * FROM vpn_subscriptions WHERE user_id = $1 AND status = 'active' AND expires_at > NOW()",
      [String(ctx.from.id)]
    );

    if (activeService.rows.length > 0) {
      const service = activeService.rows[0];
      const daysLeft = Math.ceil((new Date(service.expires_at) - new Date()) / (1000 * 60 * 60 * 24));
      const dataUsed = service.data_used || 0;
      const dataLimit = 5 * 1024 * 1024 * 1024;

      ctx.reply(
        '🌐 **سرویس VPN فعال شما**\n\n' +
        '📅 روزهای باقی‌مانده: ' + daysLeft + ' روز\n' +
        '📊 مصرف داده: ' + (dataUsed / (1024 * 1024)).toFixed(2) + ' مگابایت از ۵ گیگابایت\n' +
        '🔗 لینک اشتراک: ' + (process.env.BASE_URL || 'https://yourdomain.com') + '/sub/' + ctx.from.id + '\n\n' +
        'برای دریافت QR Code یا مشاهده وضعیت، از دکمه‌های زیر استفاده کنید:',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '📷 دریافت QR Code', callback_data: 'vpn_qr' }],
              [{ text: '🌐 استعلام حجم', callback_data: 'vpn_status' }],
              [{ text: '🛒 خرید سرویس اختصاصی', callback_data: 'menu_buy' }],
              [{ text: '🔙 بازگشت', callback_data: 'back_main_menu' }]
            ]
          }
        }
      );
      return;
    }

    const canGetFree = await pool.query(
      "SELECT COUNT(*) AS count FROM vpn_subscriptions WHERE user_id = $1 AND status = 'active'",
      [String(ctx.from.id)]
    );

    if (Number(canGetFree.rows[0].count) > 0) {
      ctx.reply('⚠️ شما قبلاً یک سرویس رایگان دریافت کرده‌اید.\nبرای خرید سرویس اختصاصی، از دکمه زیر اقدام کنید.', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🛒 خرید سرویس اختصاصی', callback_data: 'menu_buy' }],
            [{ text: '🔙 بازگشت', callback_data: 'back_main_menu' }]
          ]
        }
      });
      return;
    }

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 30);

    const trackingCode = generateTrackingCode();
    await pool.query(
      'INSERT INTO vpn_subscriptions (user_id, status, expires_at, data_limit, tracking_code, created_at) VALUES ($1, $2, $3, $4, $5, NOW())',
      [String(ctx.from.id), 'active', expiryDate.toISOString(), 5 * 1024 * 1024 * 1024, trackingCode]
    );

    const subUrl = (process.env.BASE_URL || 'https://yourdomain.com') + '/sub/' + ctx.from.id;

    const caption =
      '🎉 **تبریک! سرویس VPN رایگان شما فعال شد.**\n\n' +
      '👤 **نام کاربری:** ' + (ctx.from.first_name || 'کاربر') + '\n' +
      '🆔 **آیدی:** ' + ctx.from.id + '\n' +
      '🔗 **لینک سابسکرایب:**\n`' + subUrl + '`\n\n' +
      '📅 **مدت اعتبار:** ۳۰ روز\n' +
      '📊 **حجم:** ۵ گیگابایت\n\n' +
      '✅ لینک زیر را کپی کنید یا از دکمه‌های مدیریت استفاده کنید.';

    ctx.reply(caption, { parse_mode: 'Markdown' });

    ctx.reply(
      '🌐 **سرویس VPN شما فعال شد.**\n\n' +
      'برای مدیریت اشتراک خود از دکمه‌های زیر استفاده کنید:',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📷 دریافت QR Code', callback_data: 'vpn_qr' }],
            [{ text: '🌐 استعلام حجم', callback_data: 'vpn_status' }],
            [{ text: '🛒 خرید سرویس اختصاصی', callback_data: 'menu_buy' }],
            [{ text: '🔙 بازگشت', callback_data: 'back_main_menu' }]
          ]
        }
      }
    );
  });

  bot.action('vpn_qr', async (ctx) => {
    ctx.answerCbQuery();
    const subUrl = (process.env.BASE_URL || 'https://yourdomain.com') + '/sub/' + ctx.from.id;
    ctx.reply('🔗 لینک سابسکرایب شما:\n`' + subUrl + '`\n\nبرای دریافت QR Code از لینک‌های زیر استفاده کنید:', { parse_mode: 'Markdown' });
  });

  bot.action('vpn_status', async (ctx) => {
    ctx.answerCbQuery();
    const service = await pool.query(
      "SELECT * FROM vpn_subscriptions WHERE user_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1",
      [String(ctx.from.id)]
    );

    if (!service.rows[0]) {
      ctx.reply('❌ سرویس فعالی یافت نشد.');
      return;
    }

    const sub = service.rows[0];
    const daysLeft = Math.max(0, Math.ceil((new Date(sub.expires_at) - new Date()) / (1000 * 60 * 60 * 24)));
    const dataUsed = sub.data_used || 0;
    const dataLimit = sub.data_limit || 5 * 1024 * 1024 * 1024;

    ctx.reply(
      '🌐 **وضعیت سرویس VPN**\n\n' +
      '📅 روزهای باقی‌مانده: ' + daysLeft + ' روز\n' +
      '📊 حجم مصرفی: ' + (dataUsed / (1024 * 1024)).toFixed(2) + ' مگابایت\n' +
      '📊 حجم کل: ' + (dataLimit / (1024 * 1024 * 1024)).toFixed(0) + ' گیگابایت\n' +
      '🆔 کد پیگیری: `' + sub.tracking_code + '`',
      { parse_mode: 'Markdown' }
    );
  });

};
