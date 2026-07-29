const { Telegraf, Scenes, session } = require('telegraf');
const express = require('express');
const config = require('./config.json');
const db = require('./database.js');
const { isAdmin } = require('./handlers/helpers.js');

const bot = new Telegraf(process.env.BOT_TOKEN);

// Anti-Sleep Express Server
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Vochino Bot is Alive!'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

bot.use(session());

// Basic Start Command
bot.start(async (ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.username || '';
  
  // Save user to database if not exists
  const existing = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(String(userId));
  if (!existing) {
    db.prepare('INSERT INTO users (telegram_id, username) VALUES (?, ?)').run(String(userId), username);
  }

  let welcomeText = `✨ سلام ${ctx.from.first_name || 'کاربر عزیز'} به ربات **Vochino** خوش آمدید!\n\nلطفاً از منوی زیر یکی از گزینه‌ها را انتخاب کنید:`;
  
  const keyboard = [
    [{ text: '✨ خرید' }, { text: '✨ فروش' }],
    [{ text: '🎒 جیب' }, { text: '🧢 پروفایل' }],
    [{ text: '🎮 بازی بونوس' }],
    [{ text: '📚 قوانین و آموزش' }, { text: '📥 پشتیبانی' }]
  ];

  if (isAdmin(userId)) {
    keyboard.push([{ text: '👑 پنل ادمین' }]);
  }

  return ctx.reply(welcomeText, {
    parse_mode: 'Markdown',
    reply_markup: { keyboard: keyboard, resize_keyboard: true }
  });
});

// Launch Bot
bot.launch().then(() => {
  console.log('Vochino Bot started successfully!');
}).catch((err) => {
  console.error('Error starting bot:', err);
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

