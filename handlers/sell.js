const db = require('../database');

module.exports = (bot) => {
    // وقتی کاربر دکمه فروش رو میزنه
    bot.action('sell_voucher', async (ctx) => {
        try {
            await ctx.answerCbQuery();
            
            // ثبت وضعیت در جدول کاربران که الان منتظر کد هستیم
            const updateState = db.prepare('UPDATE users SET state = ? WHERE telegram_id = ?');
            updateState.run('waiting_for_voucher', ctx.from.id.toString());

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

    // دکمه بیخیال یا بازگشت
    bot.action('back_to_home', async (ctx) => {
        try {
            await ctx.answerCbQuery();
            const clearState = db.prepare('UPDATE users SET state = ? WHERE telegram_id = ?');
            clearState.run('idle', ctx.from.id.toString());

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

    // دریافت متن یا همون کد ووچر از کاربر
    bot.on('text', async (ctx, next) => {
        try {
            const userQuery = db.prepare('SELECT state FROM users WHERE telegram_id = ?');
            const user = userQuery.get(ctx.from.id.toString());

            if (user && user.state === 'waiting_for_voucher') {
                const voucherCode = ctx.message.text.trim();

                // ریست کردن وضعیت کاربر به حالت عادی
                const clearState = db.prepare('UPDATE users SET state = ? WHERE telegram_id = ?');
                clearState.run('idle', ctx.from.id.toString());

                // ذخیره سفارش در دیتابیس
                const stmt = db.prepare(`
                    INSERT INTO orders (telegram_id, order_type, amount, submitted_code, status) 
                    VALUES (?, 'sell', 173031, ?, 'pending')
                `);
                stmt.run(ctx.from.id.toString(), voucherCode);

                await ctx.reply('✅ کد ووچر شما با موفقیت ثبت شد و به زودی توسط ادمین بررسی خواهد شد.');
                return;
            }
        } catch (error) {
            console.error('Error saving voucher:', error);
            await ctx.reply('⚠️ ثبت کد با خطا مواجه شد. شاید این کد قبلاً ثبت شده باشد.');
        }
        return next();
    });
};
