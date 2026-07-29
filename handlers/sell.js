const db = require('../database');

module.exports = (bot) => {
    bot.action('sell_voucher', async (ctx) => {
        try {
            await ctx.answerCbQuery();
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
            ctx.session = ctx.session || {};
            ctx.session.waitingForVoucher = true;
        } catch (error) {
            console.error('Error in sell_voucher:', error);
            await ctx.reply('⚠️ یه خطای موقت رخ داد، لطفاً دوباره تلاش کن.');
        }
    });

    bot.on('text', async (ctx, next) => {
        if (ctx.session && ctx.session.waitingForVoucher) {
            const voucherCode = ctx.message.text.trim();
            ctx.session.waitingForVoucher = false;

            try {
                const stmt = db.prepare(`
                    INSERT INTO orders (telegram_id, order_type, amount, submitted_code, status) 
                    VALUES (?, 'sell', 173031, ?, 'pending')
                `);
                stmt.run(ctx.from.id.toString(), voucherCode);

                await ctx.reply('✅ کد ووچر شما با موفقیت ثبت شد و به زودی توسط ادمین بررسی خواهد شد.');
            } catch (error) {
                console.error('Error saving voucher:', error);
                await ctx.reply('⚠️ ثبت کد با خطا مواجه شد. شاید این کد قبلاً ثبت شده باشد.');
            }
            return;
        }
        return next();
    });
};
