const { Telegraf } = require('telegraf');
const express = require('express');
const db = require('./database');

// توکن رباتت (حتماً چک کن که توکت صحیح باشه یا از متغیر محیطی بخونه)
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';
const bot = new Telegraf(BOT_TOKEN);

// سیستم نشست (Session) موقت برای ذخیره وضعیت کاربر
bot.use((ctx, next) => {
    ctx.session = ctx.session || {};
    return next();
});

// منوی اصلی ربات
const mainMenu = {
    reply_markup: {
        inline_keyboard: [
            [
                { text: '✨ خرید ✨', callback_data: 'buy_voucher' },
                { text: '✨ فروش ✨', callback_data: 'sell_voucher' }
            ],
            [
                { text: '👛 جیب', callback_data: 'wallet' },
                { text: '👤 پروفایل', callback_data: 'profile' }
            ],
            [
                { text: '📚 قوانین و آموزش', callback_data: 'rules' },
                { text: '🎮 بازی بونوس', callback_data: 'bonus' }
            ],
            [
                { text: '📩 پشتیبانی', callback_data: 'support' }
            ]
        ]
    }
};

// دستور استارت
bot.start(async (ctx) => {
    try {
        // ذخیره کاربر در دیتابیس
        const checkUser = db.prepare('SELECT * FROM users WHERE telegram_id = ?');
        let user = checkUser.get(ctx.from.id.toString());
        
        if (!user) {
            const insertUser = db.prepare('INSERT INTO users (telegram_id, username) VALUES (?, ?)');
            insertUser.run(ctx.from.id.toString(), ctx.from.username || '');
        }

        await ctx.reply('👋 خوش برگشتی، خوشحالیم دوباره می‌بینیمت!\n\n🏠 منوی اصلی', mainMenu);
    } catch (error) {
        console.error('Error in /start:', error);
        await ctx.reply('👋 خوش آمدید!');
    }
});

// دکمه بازگشت به منوی اصلی
bot.action('back_to_home', async (ctx) => {
    try {
        await ctx.answerCbQuery();
        ctx.session.waitingForVoucher = false; // ریست کردن وضعیت
        await ctx.editMessageText('🏠 منوی اصلی', mainMenu);
    } catch (error) {
        await ctx.reply('🏠 منوی اصلی', mainMenu);
    }
});

// فراخوانی هندلرهای بخش‌ها (مثل فروش)
require('./handlers/sell')(bot);

// راه‌اندازی وب‌سرور ساده برای پایش توسط Render
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Vochino Bot is running perfectly!');
});

app.listen(PORT, () => {
    console.log(`Web server is running on port ${PORT}`);
});

// استارت ربات تلگرام
bot.launch().then(() => {
    console.log('Telegram Bot started successfully!');
}).catch(err => {
    console.error('Failed to start bot:', err);
});

// بستن امن دیتابیس موقع خروج
process.once('SIGINT', () => db.close());
process.once('SIGTERM', () => db.close());
