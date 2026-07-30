const { Telegraf, Markup } = require('telegraf');
const { pool, getUser, initDb } = require('./db');

// فراخوانی دقیق فایل‌ها از داخل پوشه handlers
const { registerAdminCommands } = require('./handlers/admin');
const { registerSellHandlers } = require('./handlers/sell');

const bot = new Telegraf(process.env.BOT_TOKEN);
const sessions = {};

const TEXTS = {
  welcomeBack: '👋 خوش برگشتی! خوشحالیم دوباره می‌بینیمت.',
  joinTitle: 'برای استفاده از ربات، ابتدا باید عضو کانال زیر شوید:',
  channelButton: '📢 عضویت در کانال',
  membershipButton: '✅ عضو شدم',
  notMember: 'شما هنوز عضو کانال نشده‌اید. لطفاً ابتدا عضو شوید، سپس دوباره تلاش کنید.',
  walletTitle: '👛 کیف پول شما',
  walletBalance: '💰 موجودی فعلی شما: '
};

// منوی اصلی
function getMainKeyboard() {
  return Markup.keyboard([
    ['🎟 خرید ووچر', '🎟 فروش به ما'],
    ['👛 کیف پول', '📊 تراکنش‌ها'],
    ['📞 پشتیبانی', '❓ راهنما']
  ]).resize();
}

// بررسی قفل کانال اجباری
async function checkMembership(ctx) {
  try {
    const res = await pool.query('SELECT * FROM required_channels WHERE active = 1');
    for (const channel of res.rows) {
      try {
        const member = await ctx.telegram.getChatMember(channel.chat_id, ctx.from.id);
        if (['left', 'kicked'].includes(member.status)) {
          return { isMember: false, channel };
        }
      } catch (e) {}
    }
    return { isMember: true };
  } catch (e) {
    return { isMember: true };
  }
}

async function startBot() {
  try {
    console.log('⚡ در حال اتصال به دیتابیس...');
    await initDb();
    console.log('✅ دیتابیس متصل شد.');

    // ثبت ماژول‌های ادمین و فروش
    registerAdminCommands(bot, sessions);
    registerSellHandlers(bot, sessions);

    // دستور /start
    bot.start(async (ctx) => {
      const check = await checkMembership(ctx);
      if (!check.isMember) {
        return ctx.reply(TEXTS.joinTitle, {
          reply_markup: {
            inline_keyboard: [
              [{ text: TEXTS.channelButton, url: check.channel.invite_link }],
              [{ text: TEXTS.membershipButton, callback_data: 'check_membership' }]
            ]
          }
        });
      }

      const telegramId = String(ctx.from.id);
      const user = await getUser(telegramId);

      if (!user) {
        const fullName = (ctx.from.first_name || '') + ' ' + (ctx.from.last_name || '');
        await pool.query(
          'INSERT INTO users (telegram_id, full_name, registered_at) VALUES ($1, $2, $3)',
          [telegramId, fullName.trim(), new Date().toISOString()]
        );
      }

      ctx.reply(TEXTS.welcomeBack, getMainKeyboard());
    });

    // بررسی مجدد عضویت
    bot.action('check_membership', async (ctx) => {
      ctx.answerCbQuery();
      const check = await checkMembership(ctx);
      if (check.isMember) {
        try { await ctx.deleteMessage(); } catch (e) {}
        ctx.reply(TEXTS.welcomeBack, getMainKeyboard());
      } else {
        ctx.reply(TEXTS.notMember);
      }
    });

    // خرید ووچر
    bot.hears('🎟 خرید ووچر', async (ctx) => {
      ctx.reply('✨ بخش خرید ووچر به زودی با قابلیت اتصال مستقیم به API فعال خواهد شد.');
    });

    // کیف پول
    bot.hears(['👛 کیف پول', '/wallet'], async (ctx) => {
      const user = await getUser(ctx.from.id);
      const balance = user ? Number(user.balance).toLocaleString('fa-IR') : '۰';
      ctx.reply(TEXTS.walletTitle + '\n\n' + TEXTS.walletBalance + balance + ' تومان');
    });

    // تراکنش‌ها
    bot.hears('📊 تراکنش‌ها', async (ctx) => {
      ctx.reply('📑 لیست تراکنش‌های اخیر شما به زودی بارگذاری خواهد شد.');
    });

    // پشتیبانی
    bot.hears('📞 پشتیبانی', async (ctx) => {
      ctx.reply(' جهت ارتباط با پشتیبانی به آیدی زیر پیام دهید:\n🆔 @Support');
    });

    // راهنما
    bot.hears('❓ راهنما', async (ctx) => {
      ctx.reply('❓ راهنمای استفاده از ربات:\n۱. جهت فروش ووچر روی دکمه "فروش به ما" بزنید.\n۲. کد ووچر را وارد کنید.\n۳. پس از تایید مالی، کیف پول شما شارژ خواهد شد.');
    });

    // دکمه بازگشت
    bot.hears('🔙 بازگشت', (ctx) => {
      delete sessions[ctx.from.id];
      ctx.reply('به منوی اصلی بازگشتید.', getMainKeyboard());
    });

    // مدیریت خطاها
    bot.catch((err, ctx) => {
      console.error(`❌ خطا در عملکرد ${ctx.updateType}:`, err);
    });

    console.log('🚀 در حال روشن کردن ربات...');
    await bot.launch();
    console.log('🤖 ربات آنلاین شد!');
  } catch (error) {
    console.error('❌ خطا در راه اندازی:', error);
  }
}

startBot();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
