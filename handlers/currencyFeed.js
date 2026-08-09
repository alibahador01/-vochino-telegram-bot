const { pool, sendRatesToChannel } = require('../db');
const { ADMIN_IDS } = require('../constants');

// تایمر برای ارسال خودکار نرخ
let feedInterval = null;

module.exports = function registerCurrencyFeedHandlers(bot) {

  // راه‌اندازی تایمر در هنگام راه‌اندازی ربات
  (async function initFeed() {
    const isActive = await pool.query(`SELECT value FROM settings WHERE key = 'currency_feed_active'`);
    if (isActive.rows.length > 0 && isActive.rows[0].value === 'true') {
      startFeedTimer(bot);
    }
  })();

  // تابع شروع تایمر
  async function startFeedTimer(botInstance) {
    if (feedInterval) {
      clearInterval(feedInterval);
      feedInterval = null;
    }

    const interval = await pool.query(`SELECT value FROM settings WHERE key = 'currency_feed_interval'`);
    const seconds = interval.rows.length > 0 ? Number(interval.rows[0].value) : 3600;

    feedInterval = setInterval(async () => {
      try {
        await sendRatesToChannel(botInstance);
        console.log('📨 نرخ ارز به‌طور خودکار ارسال شد.');
      } catch (e) {
        console.log('❌ خطا در ارسال خودکار نرخ: ' + e.message);
      }
    }, seconds * 1000);

    console.log('⏱️ تایمر فید نرخ ارز با زمان ' + seconds + ' ثانیه راه‌اندازی شد.');
  }

  // توقف تایمر
  async function stopFeedTimer() {
    if (feedInterval) {
      clearInterval(feedInterval);
      feedInterval = null;
      console.log('⏹️ تایمر فید نرخ ارز متوقف شد.');
    }
  }

  // بازنویسی تابع sendRatesToChannel در db.js برای استفاده در اینجا
  // (قبلاً در db.js تعریف شده بود)

  // مشاهده تنظیمات فعلی
  bot.action('admin_currency_feed', async (ctx) => {
    if (!ADMIN_IDS.includes(Number(ctx.from.id))) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const isActive = await pool.query(`SELECT value FROM settings WHERE key = 'currency_feed_active'`);
    const interval = await pool.query(`SELECT value FROM settings WHERE key = 'currency_feed_interval'`);

    const activeStatus = isActive.rows.length > 0 ? isActive.rows[0].value : 'false';
    const intervalValue = interval.rows.length > 0 ? Number(interval.rows[0].value) : 3600;

    ctx.reply(
      '🌐 **مدیریت فید نرخ ارز**\n\n' +
      '🔹 وضعیت: ' + (activeStatus === 'true' ? '✅ فعال' : '❌ غیرفعال') + '\n' +
      '⏱️ زمانبندی: هر ' + (intervalValue / 60) + ' دقیقه\n\n' +
      'از گزینه‌های زیر انتخاب کنید:',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: (activeStatus === 'true' ? '⏹️ غیرفعال کردن' : '▶️ فعال کردن'), callback_data: 'admin_currency_feed_toggle' }],
            [{ text: '⏱️ تنظیم زمانبندی (دقیقه)', callback_data: 'admin_currency_feed_interval' }],
            [{ text: '📨 ارسال دستی نرخ‌ها', callback_data: 'admin_currency_feed_send' }],
            [{ text: '🔙 بازگشت', callback_data: 'menu_admin_panel' }]
          ]
        }
      }
    );
  });

  // تغییر وضعیت
  bot.action('admin_currency_feed_toggle', async (ctx) => {
    if (!ADMIN_IDS.includes(Number(ctx.from.id))) return;
    ctx.answerCbQuery();

    const current = await pool.query(`SELECT value FROM settings WHERE key = 'currency_feed_active'`);
    const newValue = current.rows.length > 0 && current.rows[0].value === 'true' ? 'false' : 'true';

    await pool.query(
      "INSERT INTO settings (key, value) VALUES ('currency_feed_active', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
      [newValue]
    );

    if (newValue === 'true') {
      await startFeedTimer(bot);
      ctx.reply('✅ فید نرخ ارز فعال شد.');
    } else {
      await stopFeedTimer();
      ctx.reply('✅ فید نرخ ارز غیرفعال شد.');
    }
  });

  // تنظیم زمانبندی
  bot.action('admin_currency_feed_interval', async (ctx) => {
    if (!ADMIN_IDS.includes(Number(ctx.from.id))) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    sessions[ctx.from.id] = {
      flow: 'admin_currency_feed_interval',
      step: 'waiting_value',
      lang: 'fa'
    };

    ctx.reply('⏱️ **تنظیم زمانبندی فید نرخ ارز**\n\nلطفاً زمان را به **دقیقه** وارد کنید:\nمثال: `60` (هر یک ساعت)', { parse_mode: 'Markdown' });
  });

  // ارسال دستی
  bot.action('admin_currency_feed_send', async (ctx) => {
    if (!ADMIN_IDS.includes(Number(ctx.from.id))) return;
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const msg = await ctx.reply('📨 در حال ارسال نرخ‌ها به کانال...');
    try {
      await sendRatesToChannel(bot);
      await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, '✅ نرخ‌ها با موفقیت به کانال ارسال شدند.');
    } catch (err) {
      await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, '❌ خطا در ارسال: ' + err.message);
    }
  });

  // هندلر متنی برای تنظیم زمانبندی
  bot.on('text', async (ctx, next) => {
    const session = sessions[ctx.from.id];
    if (!session || session.flow !== 'admin_currency_feed_interval') return next();

    const minutes = parseInt(ctx.message.text.replace(/[^0-9]/g, ''), 10);
    if (!minutes || minutes < 1) {
      ctx.reply('❌ لطفاً یک عدد معتبر (بزرگتر از ۰) وارد کنید.');
      return;
    }

    const seconds = minutes * 60;
    await pool.query(
      "INSERT INTO settings (key, value) VALUES ('currency_feed_interval', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
      [String(seconds)]
    );

    // راه‌اندازی مجدد تایمر با زمان جدید
    const isActive = await pool.query(`SELECT value FROM settings WHERE key = 'currency_feed_active'`);
    if (isActive.rows.length > 0 && isActive.rows[0].value === 'true') {
      await startFeedTimer(bot);
    }

    delete sessions[ctx.from.id];
    ctx.reply('✅ زمانبندی فید نرخ ارز به **هر ' + minutes + ' دقیقه** تنظیم شد.');
  });

};
