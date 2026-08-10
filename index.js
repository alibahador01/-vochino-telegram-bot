// index.js
require('dotenv').config();
const { Telegraf, Markup, session } = require('telegraf');
const database = require('./database');
const startHandler = require('./handlers/start');
const mainMenuHandler = require('./handlers/mainMenu');
const walletHandler = require('./handlers/wallet');
const verificationHandler = require('./handlers/verification');
const gamesHandler = require('./handlers/games');
const adminHandler = require('./handlers/admin');
const referralHandler = require('./handlers/referral');
const server = require('./server');

const bot = new Telegraf(process.env.BOT_TOKEN);

// Session middleware
bot.use(session());

// Connect to database
database.connect();

// =====================
// COMMANDS
// =====================
bot.command('start', startHandler.start);
bot.command('admin', async (ctx) => {
  // Only show admin panel if user is admin
  const { isAdmin } = require('./utils');
  if (isAdmin(ctx.from.id)) {
    await adminHandler.adminPanel(ctx);
  } else {
    await ctx.reply('⛔️ شما دسترسی ندارید.');
  }
});
bot.command('invite', referralHandler.inviteLink);

// =====================
// ACTIONS
// =====================
// Language selection
bot.action(/^lang_(fa|en|tr)$/, startHandler.languageAction);

// Onboarding
bot.action('accept_rules', startHandler.acceptRulesAction);
bot.action('check_join', startHandler.checkJoinAction);
bot.action('member_joined', startHandler.memberJoinedAction);

// Main menu navigation
bot.action('wallet', walletHandler.walletMenu);
bot.action('increase_balance', walletHandler.increaseBalance);
bot.action('withdraw', walletHandler.withdrawRequest);
bot.action('verify_gold', verificationHandler.verifyGoldRequest);
bot.action('add_card', walletHandler.addCard);
bot.action('transaction_report', walletHandler.transactionReport);
bot.action('referral_earning', referralHandler.referralMenu);
bot.action('back_to_main', mainMenuHandler.backToMain);

// Wallet sub‑actions (admin confirmations)
bot.action(/^confirm_withdraw_(.+)$/, walletHandler.confirmWithdraw);
bot.action(/^reject_withdraw_(.+)$/, walletHandler.rejectWithdraw);
bot.action(/^confirm_verification_(.+)$/, verificationHandler.confirmVerification);
bot.action(/^reject_verification_(.+)$/, verificationHandler.rejectVerification);

// Games
bot.action('games_menu', gamesHandler.gamesMenu);
bot.action(/^game_(.+)$/, gamesHandler.startGame);
bot.action(/^play_(.+)_(bonus|balance)$/, gamesHandler.playGame);
bot.action('back_to_games', gamesHandler.gamesMenu);

// Admin callbacks
bot.action('admin_panel', adminHandler.adminPanel);
bot.action('send_message_all', adminHandler.sendAll);
bot.action('edit_texts', adminHandler.editTexts);
bot.action('manage_products', adminHandler.manageProducts);
bot.action('settings', adminHandler.settings);
bot.action('gift_user', adminHandler.giftUser);
bot.action('admin_back', adminHandler.adminPanel); // simplified back to main admin

// Support / Gift (from main menu)
bot.action('support', async (ctx) => {
  ctx.session.step = 'support_ticket';
  await ctx.reply('📝 لطفاً پیام خود را برای پشتیبانی بنویسید:');
  await ctx.answerCbQuery();
});
bot.action('gift', async (ctx) => {
  // Show VPN gift info
  const user = await require('./models/User').findOne({ telegramId: ctx.from.id });
  if (!user) return;
  await ctx.reply(
    `🎁 هدیه ووچینو⁰¹ (فیلترشکن رایگان)\n` +
    `🔗 لینک اختصاصی شما:\n${process.env.DOMAIN}/sub/${user.telegramId}\n` +
    `📊 حجم: ۵ گیگابایت – مدت: ۳۰ روز`
  );
  await ctx.answerCbQuery();
});

// Referral inline
bot.action('invite', referralHandler.inviteLink);

// =====================
// INPUT HANDLING MIDDLEWARE
// =====================
bot.use(async (ctx, next) => {
  if (!ctx.session) ctx.session = {};

  // Handle text messages only when a step is set
  if (ctx.message && ctx.message.text) {
    const step = ctx.session.step;
    if (step === 'add_card') {
      return walletHandler.processCardNumber(ctx);
    } else if (step === 'support_ticket') {
      return walletHandler.processSupportTicket(ctx);
    } else if (step === 'main_menu') {
      // Ignore other texts when in main menu – just show menu again
      return mainMenuHandler.showMainMenu(ctx);
    }
  }

  // Handle photo messages for gold verification
  if (ctx.message && ctx.message.photo && ctx.session.step === 'upload_gold_docs') {
    return verificationHandler.processGoldDocuments(ctx);
  }

  // If no step matches, just continue
  return next();
});

// =====================
// ERROR HANDLING
// =====================
bot.catch((err, ctx) => {
  console.error(`Ooops, encountered an error for ${ctx.updateType}`, err);
});

// =====================
// LAUNCH SERVER & BOT
// =====================
server.launch(bot);

bot.launch().then(() => {
  console.log('🤖 Vochino bot is running...');
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
