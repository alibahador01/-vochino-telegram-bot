// handlers/adminGifts.js
const { sessions, sendMessageToUser } = require('../utils');
const { pool, getUserById, getAllUsers, setSetting, getSetting } = require('../db');
const { ADMIN_IDS } = require('../constants');

function isAdmin(telegramId) {
  return ADMIN_IDS.includes(Number(telegramId));
}

module.exports = function registerAdminGiftsHandlers(bot) {

  const cancelToPanelKb = { reply_markup: { inline_keyboard: [[{ text: '🔙 لغو و بازگشت', callback_data: 'admin_gifts_panel' }]] } };

  async function showGiftsPanel(ctx) {
    const regActive = (await getSetting('bonus_registration_active', 'false')) === 'true';
    const buyActive = (await getSetting('bonus_first_purchase_active', 'false')) === 'true';
    const refActive = (await getSetting('bonus_referral_active', 'false')) === 'true';
    const percentActive = (await getSetting('bonus_referral_percent_active', 'false')) === 'true';

    const on = '✅ فعال';
    const off = '◻️ غیرفعال';

    const msg =
      '🎁 **مدیریت هدایا**\n\n' +
      'همه‌ی هدیه‌ها مستقیم و بدون هیچ پیش‌شرطی به کیف پول واقعی کاربر واریز می‌شوند.\n\n' +
      `👤 هدیه‌ی ثبت‌نام: ${regActive ? on : off}\n` +
      `🛍 هدیه‌ی اولین خرید: ${buyActive ? on : off}\n` +
      `👥 هدیه‌ی نقدیِ دعوت دوستان: ${refActive ? on : off}\n` +
      `♾️ سود مادام‌العمرِ دعوت (درصدی): ${percentActive ? on : off}\n`;

    ctx.reply(msg, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '👤 هدیه‌ی ثبت‌نام', callback_data: 'gifts_set_reg' }],
          [{ text: '🛍 هدیه‌ی اولین خرید', callback_data: 'gifts_set_buy' }],
          [{ text: '👥 هدیه‌ی نقدیِ دعوت دوستان', callback_data: 'gifts_set_ref' }],
          [{ text: '♾️ سود مادام‌العمرِ دعوت', callback_data: 'gifts_set_ref_percent' }],
          [{ text: '🎯 هدیه به کاربران دلخواه', callback_data: 'gifts_custom_start' }],
          [{ text: '📢 هدیه‌ی همگانی (به همه‌ی کاربران)', callback_data: 'gifts_broadcast_start' }],
          [{ text: '🔙 بازگشت', callback_data: 'menu_admin_panel' }]
        ]
      }
    });
  }

  bot.action('admin_gifts_panel', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    return showGiftsPanel(ctx);
  });

  bot.action('gifts_set_reg', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    const active = (await getSetting('bonus_registration_active', 'false')) === 'true';
    const gift = await getSetting('bonus_registration_gift', '0');
    ctx.reply(
      '👤 **هدیه‌ی ثبت‌نام**\n\n' +
      `✅ فعال: ${active ? 'بله' : 'خیر'}\n` +
      `🎁 مبلغ هدیه: ${Number(gift).toLocaleString()} تومان\n\n` +
      'با هر ثبت‌نام جدید (بعد از فعال‌سازی)، این مبلغ مستقیم به کیف پول کاربر اضافه می‌شود.',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 فعال/غیرفعال', callback_data: 'gifts_reg_toggle' }],
            [{ text: '🎁 تغییر مبلغ هدیه', callback_data: 'gifts_reg_set_amount' }],
            [{ text: '🔙 بازگشت', callback_data: 'admin_gifts_panel' }]
          ]
        }
      }
    );
  });

  bot.action('gifts_reg_toggle', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const cur = (await getSetting('bonus_registration_active', 'false')) === 'true';
    await setSetting('bonus_registration_active', cur ? 'false' : 'true');
    if (!cur) await setSetting('bonus_registration_activated_at', new Date().toISOString());
    ctx.answerCbQuery();
    ctx.reply(`✅ هدیه‌ی ثبت‌نام ${cur ? 'غیرفعال' : 'فعال'} شد.`);
  });

  bot.action('gifts_reg_set_amount', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'gifts_reg_amount', step: 'waiting_value' };
    ctx.reply('🎁 مبلغ هدیه‌ی ثبت‌نام (تومان) را وارد کنید:', cancelToPanelKb);
  });

  bot.action('gifts_set_buy', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    const active = (await getSetting('bonus_first_purchase_active', 'false')) === 'true';
    const minAmount = await getSetting('bonus_first_purchase_min_amount', '0');
    const gift = await getSetting('bonus_first_purchase_gift', '0');
    ctx.reply(
      '🛍 **هدیه‌ی اولین خرید**\n\n' +
      `✅ فعال: ${active ? 'بله' : 'خیر'}\n` +
      `📉 حداقل مبلغ خرید: ${Number(minAmount).toLocaleString()} تومان\n` +
      `🎁 مبلغ هدیه: ${Number(gift).toLocaleString()} تومان`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 فعال/غیرفعال', callback_data: 'gifts_buy_toggle' }],
            [{ text: '📉 حداقل مبلغ خرید', callback_data: 'gifts_buy_set_min' }],
            [{ text: '🎁 تغییر مبلغ هدیه', callback_data: 'gifts_buy_set_amount' }],
            [{ text: '🔙 بازگشت', callback_data: 'admin_gifts_panel' }]
          ]
        }
      }
    );
  });

  bot.action('gifts_buy_toggle', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const cur = (await getSetting('bonus_first_purchase_active', 'false')) === 'true';
    await setSetting('bonus_first_purchase_active', cur ? 'false' : 'true');
    if (!cur) await setSetting('bonus_first_purchase_activated_at', new Date().toISOString());
    ctx.answerCbQuery();
    ctx.reply(`✅ هدیه‌ی اولین خرید ${cur ? 'غیرفعال' : 'فعال'} شد.`);
  });

  bot.action('gifts_buy_set_min', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'gifts_buy_min', step: 'waiting_value' };
    ctx.reply('📉 حداقل مبلغ خرید (تومان) را وارد کنید:', cancelToPanelKb);
  });

  bot.action('gifts_buy_set_amount', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'gifts_buy_amount', step: 'waiting_value' };
    ctx.reply('🎁 مبلغ هدیه‌ی اولین خرید (تومان) را وارد کنید:', cancelToPanelKb);
  });

  bot.action('gifts_set_ref', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    const active = (await getSetting('bonus_referral_active', 'false')) === 'true';
    const threshold = await getSetting('bonus_referral_threshold', '1');
    const gift = await getSetting('bonus_referral_gift', '0');
    ctx.reply(
      '👥 **هدیه‌ی نقدیِ دعوت دوستان**\n\n' +
      `✅ فعال: ${active ? 'بله' : 'خیر'}\n` +
      `🔢 هر ${threshold} دعوتِ موفق\n` +
      `🎁 مبلغ هدیه: ${Number(gift).toLocaleString()} تومان\n\n` +
      'این مبلغ همان لحظه‌ی اعطا، مستقیم و بدون هیچ شرطی به کیف پولِ دعوت‌کننده اضافه می‌شود.',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 فعال/غیرفعال', callback_data: 'gifts_ref_toggle' }],
            [{ text: '🔢 تعداد دعوتِ لازم', callback_data: 'gifts_ref_set_threshold' }],
            [{ text: '🎁 تغییر مبلغ هدیه', callback_data: 'gifts_ref_set_amount' }],
            [{ text: '🔙 بازگشت', callback_data: 'admin_gifts_panel' }]
          ]
        }
      }
    );
  });

  bot.action('gifts_ref_toggle', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const cur = (await getSetting('bonus_referral_active', 'false')) === 'true';
    await setSetting('bonus_referral_active', cur ? 'false' : 'true');
    if (!cur) await setSetting('bonus_referral_activated_at', new Date().toISOString());
    ctx.answerCbQuery();
    ctx.reply(`✅ هدیه‌ی دعوت دوستان ${cur ? 'غیرفعال' : 'فعال'} شد.`);
  });

  bot.action('gifts_ref_set_threshold', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'gifts_ref_threshold', step: 'waiting_value' };
    ctx.reply('🔢 هر چند دعوتِ موفق، یک هدیه تعلق بگیرد؟ (عدد وارد کنید)', cancelToPanelKb);
  });

  bot.action('gifts_ref_set_amount', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'gifts_ref_amount', step: 'waiting_value' };
    ctx.reply('🎁 مبلغ هدیه (تومان) را وارد کنید:', cancelToPanelKb);
  });

  bot.action('gifts_set_ref_percent', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    const active = (await getSetting('bonus_referral_percent_active', 'false')) === 'true';
    const percent = await getSetting('bonus_referral_percent', '0');
    ctx.reply(
      '♾️ **سود مادام‌العمرِ دعوت**\n\n' +
      `✅ فعال: ${active ? 'بله' : 'خیر'}\n` +
      `📈 درصد فعلی: ${percent}٪\n\n` +
      'با هر خریدِ موفقِ کاربرِ دعوت‌شده، این درصد از مبلغ خرید مستقیم به کیف پولِ دعوت‌کننده واریز می‌شود — کاملاً مستقل از هدیه‌ی نقدیِ دعوت.',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 فعال/غیرفعال', callback_data: 'gifts_ref_percent_toggle' }],
            [{ text: '📈 تنظیم درصد سود', callback_data: 'gifts_ref_percent_set' }],
            [{ text: '🔙 بازگشت', callback_data: 'admin_gifts_panel' }]
          ]
        }
      }
    );
  });

  bot.action('gifts_ref_percent_toggle', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const cur = (await getSetting('bonus_referral_percent_active', 'false')) === 'true';
    await setSetting('bonus_referral_percent_active', cur ? 'false' : 'true');
    ctx.answerCbQuery();
    ctx.reply(`✅ سود مادام‌العمرِ دعوت ${cur ? 'غیرفعال' : 'فعال'} شد.`);
  });

  bot.action('gifts_ref_percent_set', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'gifts_ref_percent', step: 'waiting_value' };
    ctx.reply('📈 درصد سود را وارد کنید (فقط عدد، مثلاً 5 برای ۵٪):', cancelToPanelKb);
  });

  bot.action('gifts_custom_start', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'gifts_custom', step: 'waiting_user_ids', data: {} };
    ctx.reply('🎯 **هدیه به کاربران دلخواه**\n\nلطفاً آیدی کاربر(ها) را وارد کنید (با خط تیره جدا کنید، مثال:\n`123456-789012`)\n\n⚠️ می‌توانید چند کاربر را هم‌زمان هدیه دهید.', { parse_mode: 'Markdown', ...cancelToPanelKb });
  });

  async function sendCustomGift(ctx) {
    const session = sessions[ctx.from.id];
    const amount = session.data.amount;
    const userIds = session.userIds;
    let success = 0;
    for (const id of userIds) {
      try {
        const upd = await pool.query('UPDATE users SET balance = balance + $1 WHERE telegram_id = $2 RETURNING balance', [amount, id]);
        if (upd.rowCount > 0) {
          const after = Number(upd.rows[0].balance);
          await pool.query(
            'INSERT INTO transaction_logs (telegram_id, type, amount, balance_before, balance_after, description, created_at) VALUES ($1,$2,$3,$4,$5,$6,NOW())',
            [String(id), 'gift', amount, after - amount, after, 'هدیه از طرف مدیریت']
          );
          success++;
          const giftMsg =
            '✨ یه سورپرایز کوچک برای شما...\n\n' +
            `🎁 ${amount.toLocaleString()} تومان مستقیم به کیف پولتون اضافه شد.\n\n` +
            '🎗این هدیه از طرف مدیریت ووچینو⁰۱\nبه پاس همراهی شما تقدیم شد.\n\n' +
            'گاهی برای شروع یک همراهی خوب،\nلازم نیست حرف زیادی بزنیم،،،\nکافیه یک قدم کوچیک برداریم💎\n\n' +
            '👑امیدواریم وقتی نوبت خرید ووچر رسید،\nووچینو⁰۱ یکی از اولین انتخاب‌های شما باشد.\n\n' +
            '🩵راستی رفیق جان\nامیدوارم امروز شروعِ شانسای خوبت باشه🤲\nپرسود باشید همیشه...💸';
          await sendMessageToUser(bot, id, giftMsg);
        }
      } catch (e) { console.log(e); }
    }
    delete sessions[ctx.from.id];
    ctx.reply(`✅ هدیه با موفقیت به ${success} نفر واریز شد.`);
  }

  bot.action('gifts_broadcast_start', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'gifts_broadcast', step: 'waiting_amount', data: {} };
    ctx.reply('📢 **هدیه‌ی همگانی**\n\nمبلغ هدیه (تومان) که به کیف پولِ *همه‌ی* کاربران ربات اضافه شود را وارد کنید:', { parse_mode: 'Markdown', ...cancelToPanelKb });
  });

  bot.action('gifts_broadcast_confirm', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const session = sessions[ctx.from.id];
    if (!session || session.flow !== 'gifts_broadcast' || session.step !== 'waiting_confirm') return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    const amount = session.data.amount;
    const users = await getAllUsers();
    await ctx.reply(`⏳ در حال ارسال به ${users.length} کاربر... (ممکن است چند دقیقه طول بکشد)`);

    let success = 0;
    for (const u of users) {
      try {
        const upd = await pool.query('UPDATE users SET balance = balance + $1 WHERE telegram_id = $2 RETURNING balance', [amount, u.telegram_id]);
        if (upd.rowCount > 0) {
          const after = Number(upd.rows[0].balance);
          await pool.query(
            'INSERT INTO transaction_logs (telegram_id, type, amount, balance_before, balance_after, description, created_at) VALUES ($1,$2,$3,$4,$5,$6,NOW())',
            [String(u.telegram_id), 'gift', amount, after - amount, after, 'هدیه‌ی همگانی مدیریت']
          );
          success++;
          await new Promise(resolve => setTimeout(resolve, 100));
          await sendMessageToUser(bot, u.telegram_id,
            '🎉 یه هدیه از طرف ووچینو⁰۱ برای همه‌ی اعضای خانواده‌مون!\n\n' +
            `🎁 ${amount.toLocaleString()} تومان مستقیم به کیف پولتون اضافه شد.\n\n` +
            'ممنون که همراه ما هستید 💙'
          );
        }
      } catch (e) { console.log(e); }
    }
    delete sessions[ctx.from.id];
    ctx.reply(`✅ هدیه‌ی همگانی به ${success} از ${users.length} کاربر واریز شد.`);
  });

  bot.action('gifts_broadcast_cancel', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery('لغو شد');
    delete sessions[ctx.from.id];
    try { await ctx.deleteMessage(); } catch (e) {}
    return showGiftsPanel(ctx);
  });

  bot.on('text', async (ctx, next) => {
    const session = sessions[ctx.from.id];
    if (!session) return next();

    if (session.flow === 'gifts_reg_amount' && session.step === 'waiting_value') {
      const val = parseInt(ctx.message.text.replace(/[^0-9]/g, ''));
      if (isNaN(val) || val <= 0) return ctx.reply('❌ عدد نامعتبر.');
      await setSetting('bonus_registration_gift', String(val));
      delete sessions[ctx.from.id];
      ctx.reply('✅ مبلغ هدیه‌ی ثبت‌نام تنظیم شد.');
      return;
    }
    if (session.flow === 'gifts_buy_min' && session.step === 'waiting_value') {
      const val = parseInt(ctx.message.text.replace(/[^0-9]/g, ''));
      if (isNaN(val) || val < 0) return ctx.reply('❌ عدد نامعتبر.');
      await setSetting('bonus_first_purchase_min_amount', String(val));
      delete sessions[ctx.from.id];
      ctx.reply('✅ حداقل مبلغ خرید تنظیم شد.');
      return;
    }
    if (session.flow === 'gifts_buy_amount' && session.step === 'waiting_value') {
      const val = parseInt(ctx.message.text.replace(/[^0-9]/g, ''));
      if (isNaN(val) || val <= 0) return ctx.reply('❌ عدد نامعتبر.');
      await setSetting('bonus_first_purchase_gift', String(val));
      delete sessions[ctx.from.id];
      ctx.reply('✅ مبلغ هدیه‌ی اولین خرید تنظیم شد.');
      return;
    }
    if (session.flow === 'gifts_ref_threshold' && session.step === 'waiting_value') {
      const val = parseInt(ctx.message.text.replace(/[^0-9]/g, ''));
      if (isNaN(val) || val < 1) return ctx.reply('❌ حداقل ۱ وارد کنید.');
      await setSetting('bonus_referral_threshold', String(val));
      delete sessions[ctx.from.id];
      ctx.reply('✅ تعداد دعوتِ لازم تنظیم شد.');
      return;
    }
    if (session.flow === 'gifts_ref_amount' && session.step === 'waiting_value') {
      const val = parseInt(ctx.message.text.replace(/[^0-9]/g, ''));
      if (isNaN(val) || val <= 0) return ctx.reply('❌ عدد نامعتبر.');
      await setSetting('bonus_referral_gift', String(val));
      delete sessions[ctx.from.id];
      ctx.reply('✅ مبلغ هدیه تنظیم شد.');
      return;
    }
    if (session.flow === 'gifts_ref_percent' && session.step === 'waiting_value') {
      const val = parseFloat(ctx.message.text.replace(/[^0-9.]/g, ''));
      if (isNaN(val) || val <= 0 || val > 100) return ctx.reply('❌ عدد نامعتبر (بین ۰ تا ۱۰۰ وارد کنید).');
      await setSetting('bonus_referral_percent', String(val));
      delete sessions[ctx.from.id];
      ctx.reply('✅ درصد سود مادام‌العمر تنظیم شد.');
      return;
    }

    if (session.flow === 'gifts_custom') {
      if (session.step === 'waiting_user_ids') {
        const ids = ctx.message.text.split('-').map(s => s.trim()).filter(Boolean);
        const valid = [];
        for (const id of ids) { if (await getUserById(id)) valid.push(id); }
        if (valid.length === 0) return ctx.reply('❌ کاربر معتبری نیست.');
        session.userIds = valid;
        session.step = 'waiting_amount';
        return ctx.reply(`✅ ${valid.length} کاربر معتبر.\n💰 مبلغ هدیه به هر کاربر را وارد کنید:`, cancelToPanelKb);
      }
      if (session.step === 'waiting_amount') {
        const amount = parseInt(ctx.message.text.replace(/[^0-9]/g, ''));
        if (!amount || amount <= 0) return ctx.reply('❌ مبلغ نامعتبر.');
        session.data.amount = amount;
        return sendCustomGift(ctx);
      }
    }

    if (session.flow === 'gifts_broadcast' && session.step === 'waiting_amount') {
      const amount = parseInt(ctx.message.text.replace(/[^0-9]/g, ''));
      if (!amount || amount <= 0) return ctx.reply('❌ مبلغ نامعتبر.');
      session.data.amount = amount;
      session.step = 'waiting_confirm';
      const users = await getAllUsers();
      return ctx.reply(
        `⚠️ تأیید نهایی\n\n` +
        `${amount.toLocaleString()} تومان به کیف پولِ هر یک از ${users.length} کاربر اضافه خواهد شد.\n` +
        `💰 مجموع واریزی: ${(amount * users.length).toLocaleString()} تومان\n\n` +
        'این عملیات بازگشت‌پذیر نیست. آیا مطمئن هستید؟',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ بله، ارسال کن', callback_data: 'gifts_broadcast_confirm' }],
              [{ text: '❌ انصراف', callback_data: 'gifts_broadcast_cancel' }]
            ]
          }
        }
      );
    }

    return next();
  });
};
