const { Telegraf } = require('telegraf');
const express = require('express');
const db = require('./database');

const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';
const bot = new Telegraf(BOT_TOKEN);

bot.use((ctx, next) => {
    ctx.session = ctx.session || {};
    return next();
});

// منوی شیک و مرتب با ایموجی‌های پرمیوم انتخابی شما
const mainMenu = {
    reply_markup: {
        inline_keyboard: [
            [
                { text: '💎 خرید 💎', callback_data: 'buy_voucher' },
                { text: '👑 فروش 👑', callback_data: 'sell_voucher' }
            ],
            [
                { text: '🎁 جیب', callback_data: 'wallet' },
                { text: '⚡ پروفایل', callback_data: 'profile' }
            ],
            [
                { text: '📚 قوانین و آموزش', callback_data: 'rules' },
                { text: '🎮 بازی بونوس', callback_data: 'bonus' }
            ],
            [
                { text: '📩 پشتیبانی 🪄', callback_data: 'support' }
            ]
        ]
    }
};

// دستور استارت با متن دلخواه شما و کدهای دقیق ایموجی پرمیوم
bot.start(async (ctx) => {
    try {
        const checkUser = db.prepare('SELECT * FROM users WHERE telegram_id = ?');
        let user = checkUser.get(ctx.from.id.toString());
        
        if (!user) {
            const insertUser = db.prepare('INSERT INTO users (telegram_id, username) VALUES (?, ?)');
            insertUser.run(ctx.from.id.toString(), ctx.from.username || '');
        }

        // متن درخواستی شما با ایموجی‌های پرمیومِ دقیق
        const welcomeText = 
            '<tg-emoji emoji-id="5960630362999626865">💎</tg-emoji> وقتی اعتماد و سرعت کنار هم قرار بگیرند،\n\n' +
            '<tg-emoji emoji-id="596058869320580393">🪄</tg-emoji> نتیجه چیزی می‌شود به نام <b>ووچینو</b>؛\n\n' +
            '<tg-emoji emoji-id="5958467095346813746">🔥</tg-emoji> خوش برگشتی، خوشحالیم دوباره می‌بینیمت! <tg-emoji emoji-id="5958726498486590755">👑</tg-emoji>';

        // ارسال پیام همراه با رای‌اکشن استارت دلخواه شما
        const sentMessage = await ctx.reply(welcomeText, {
            parse_mode: 'HTML',
            ...mainMenu
        });

        // تنظیم رای‌اکشن روی پیام استارت (اگر ربات روی چت شخصی کانال یا گروه یا پیام کاربر دسترسی داشته باشد)
        try {
            await bot.telegram.setMessageReaction(ctx.chat.id, sentMessage.message_id, [
                { type: 'emoji', emoji: '🔥' },
                { type: 'emoji', emoji: '💎' },
                { type: 'emoji', emoji: '👑' }
            ]);
        } catch (reactionErr) {
            console.log('Reaction note: Reactions might require specific bot rights or supergroup/channel context.');
        }

    } catch (error) {
        console.error('Error in /start:', error);
        await ctx.reply('✨ خوش آمدید!', mainMenu);
    }
});

// دکمه بازگشت به منوی اصلی
bot.action('back_to_home', async (ctx) => {
    try {
        await ctx.answerCbQuery();
        const welcomeText = 
            '<tg-emoji emoji-id="5960630362999626865">💎</tg-emoji> وقتی اعتماد و سرعت کنار هم قرار بگیرند،\n\n' +
            '<tg-emoji emoji-id="596058869320580393">🪄</tg-emoji> نتیجه چیزی می‌شود به نام <b>ووچینو</b>;';

        await ctx.editMessageText(welcomeText, {
            parse_mode: 'HTML',
            ...mainMenu
        });
    } catch (error) {
        await ctx.reply('🏠 منوی اصلی', mainMenu);
    }
});

// فراخوانی هندلرهای بخش‌ها
require('./handlers/sell')(bot);

// راه‌اندازی وب‌سرور برای رندر
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Vochino Bot is running with custom Premium emojis!');
});

app.listen(PORT, () => {
    console.log(`Web server is running on port ${PORT}`);
});

bot.launch().then(() => {
    console.log('Telegram Bot started successfully with custom design!');
}).catch(err => {
    console.error('Failed to start bot:', err);
});

process.once('SIGINT', () => db.close());
process.once('SIGTERM', () => db.close());
