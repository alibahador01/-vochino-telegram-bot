const { Telegraf, Markup } = require('telegraf');
const { pool, getUser, getUserCards, initDb } = require('./db');
const { registerAdminCommands } = require('./handlers/admin');
const { registerSellHandlers } = require('./handlers/sell');

const bot = new Telegraf(process.env.BOT_TOKEN);
const sessions = {};

// متون و پیام‌های اصلی ربات
const TEXTS = {
  welcomeBack: '👋 خوش برگشتی! خوشحالیم دوباره می‌بینیمت.',
  joinTitle: 'برای استفاده از ربات، ابتدا باید عضو کانال زیر شوید:',
  channelButton: '📢 عضویت در کانال',
  membershipButton: '✅ عضو شدم',
  notMember: 'شما هنوز عضو کانال نشده‌اید. لطفاً ابتدا عضو شوید، سپس دوباره تلاش کنید.',
  walletTitle: '👛 کیف پول شما',
  walletBalance: '💰 موجودی فعلی شما: ',
  walletIncrease: '➕ افزایش موجودی',
  walletWithdraw: '💳 برداشت موجودی',
  walletAddCard: '➕ افزودن کارت جدید',
  backButton: '🔙 بازگشت',
  depositMethodTitle: 'روش افزایش موجودی را انتخاب کنید:',
  depositCard2Card: '💳 کارت به کارت',
  depositTron: '🪙 ترون (تتر)',
  depositGateway: '🌐 درگاه پرداخت',
  comingSoon: '😃 به زودی!',
  depositCardsTrust: 'واریز به حساب رسمی مجموعه انجام می‌شود.',
  depositAskAmount: 'لطفاً مبلغ واریزی خود را به تومان وارد کنید:',
  depositAskReceipt: 'لطفاً تصویر رسید (فیش) پرداخت خود را بفرستید:',
  depositSubmitted: '✅ درخواست شارژ شما ثبت شد و پس از بررسی اعمال خواهد شد.'
};

// کیبورد منوی اصلی
function getMainKeyboard() {
  return Markup.keyboard([
    ['🎟 خرید ووچر', '🎟 فروش به ما'],
    ['👛 کیف پول', '📊 تراکنش‌ها'],
    ['📞 پشتیبانی', '❓ راهنما']
  ]).resize();
}

// بررسی عضویت اجباری در کانال
async function checkMembership(ctx) {
  try {
    const res = await pool.query('SELECT * FROM required_channels WHERE active = 1');
    const channels = res.rows;

    for (const channel of channels) {
      try {
        const member = await ctx.telegram.getChatMember(channel.chat_id, ctx.from.id);
        if (['left', 'kicked'].includes(member.status)) {
          return { isMember: false, channel };
        }
      } catch (e) {
        console.error('Error checking channel membership:', e);
      }
    }
    return { isMember: true };
  } catch (e) {
    return { isMember: true };
  }
}

async function startBot() {
  try {
    console.log('⚡ در حال اتصال و آماده‌سازی پایگاه داده...');
    await initDb();
    console.log('✅ پایگاه داده آماده شد.');

    // ثبت ماژول‌های اختصاصی
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

    // بررسی مجدد عضویت کانال
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

    // بخش کیف پول
    bot.hears(['👛 کیف پول', '/wallet'], async (ctx) => {
      const user = await getUser(ctx.from.id);
      const balance = user ? Number(user.balance).toLocaleString('fa-IR') : '۰';

      const walletMsg = TEXTS.walletTitle + '\n\n' + TEXTS.walletBalance + balance + ' تومان';
      
      ctx.reply(walletMsg, {
        reply_markup: {
          inline_keyboard: [
            [{ text: TEXTS.walletIncrease, callback_data: 'wallet_deposit' }],
            [{ text: TEXTS.walletWithdraw, callback_data: 'wallet_withdraw' }]
          ]
        }
      });
    });

    // دکمه بازگشت به منوی اصلی
    bot.hears('🔙 بازگشت', (ctx) => {
      delete sessions[ctx.from.id];
      ctx.reply('به منوی اصلی بازگشتید.', getMainKeyboard());
    });

    // مدیریت خطاها جهت جلوگیری از کرش ربات
    bot.catch((err, ctx) => {
      console.error(`❌ خطا در عملکرد ${ctx.updateType}:`, err);
    });

    console.log('🚀 در حال روشن کردن ربات...');
    await bot.launch();
    console.log('🤖 ربات با موفقیت آنلاین شد!');
  } catch (error) {
    console.error('❌ خطا در راه اندازی ربات:', error);
  }
}

startBot();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
