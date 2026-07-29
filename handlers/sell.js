const db = require('../database');

// یک حافظه موقت امن برای نگهداری وضعیت کاربران
const userStates = {};

module.exports = (bot) => {
    // دکمه فروش
    bot.action('sell_voucher', async (ctx) => {
        try {
            await ctx.answerCbQuery();
            userStates[ctx.from.id.toString()] = 'waiting_for_voucher';

            await ctx.reply(
                '🪙 فروش 🔤 یووچر\n\n' +
                '♻️ قیمت واحد: 173,031 تومان\n\n' +
                '🔤 نمونه کد صحیح:\n<code>USD-7T3H-C2QG-P6YA-D4UW-XOIQ</code>\n\n' +
                '◼️ لطفاً کد ووچر را وارد کنید:',
                {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔙 بیخیال', callback_data: 'back_to_home' }]
                        ]
                    }
                }
            );
        } catch (error) {
            console.error('Error in sell_voucher:', error);
            await ctx.reply('⚠️ یه خطای موقت رخ داد، لطفاً دوباره تلاش کن.');
        }
    });

    // دکمه بازگشت
    bot.action('back_to_home', async (ctx) => {
        try {
            await ctx.answerCbQuery();
            delete userStates[ctx.from.id.toString()];

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
            await ctx.editMessageText('🏠 منوی اصلی', mainMenu);
        } catch (error) {
            console.error('Error in back_to_home:', error);
        }
    });

    // دریافت متن (کد ووچر)
    bot.on('text', async (ctx, next) => {
        const userId = ctx.from.id.toString();
        
        if (userStates[userId] === 'waiting_for_voucher') {
            const voucherCode = ctx.message.text.trim();
            delete userStates[userId]; // پاک کردن وضعیت پس از دریافت

            try {
                const stmt = db.prepare(`
                    INSERT INTO orders (telegram_id, order_type, amount, submitted_code, status) 
                    VALUES (?, 'sell', 173031, ?, 'pending')
                `);
                stmt.run(userId, voucherCode);

                await ctx.reply('✅ کد ووچر شما با موفقیت ثبت شد و به زودی توسط ادمین بررسی خواهد شد.');
            } catch (error) {
                console.error('Error saving voucher:', error);
                await ctx.reply('⚠️ ثبت کد با خطا مواجه شد. ممکن است این کد تکراری باشد.');
            }
            return;
        }
        return next();
    });
};
