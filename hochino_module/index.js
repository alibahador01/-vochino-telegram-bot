// hochino_module/index.js
// 🐽 ماژول هوچینو⁰¹ — نسخه فاز ۰ (فقط ساختار)
// این ماژول کاملاً مستقل از کدهای صرافی ووچینو⁰¹ است

module.exports = function registerHochinoHandlers(bot) {
  console.log('🐽 هوچینو⁰¹: بارگذاری ماژول...');

  // ============ تابع کمکی: نمایش منوی هوچینو ============
  async function showHochinoMenu(ctx) {
    const analyzeBtn = {
      text: '⚽️ تحلیل AI هوچینو⁰¹',
      callback_data: 'hochino_analyze'
    };

    const tableBtn = {
      text: '📆 جدول AI هوچینو⁰¹',
      callback_data: 'hochino_table'
    };

    await ctx.reply(
      '🐽 <b>هوچینو AI برتر⁰¹</b>\n\nیکی از گزینه‌های زیر رو انتخاب کن:',
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [analyzeBtn],
            [tableBtn],
            [{ text: '🔙 بازگشت', callback_data: 'back_main_menu' }]
          ]
        }
      }
    );
  }

  // ============ هندلر منوی اصلی هوچینو ============
  bot.action('menu_hochino_main', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}
    try { await ctx.deleteMessage(); } catch (e) {}
    await showHochinoMenu(ctx);
  });

  // ============ دکمه مستقیم: گفتگو (از منوی اصلی) ============
  bot.action('menu_hochino_chat', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}
    try { await ctx.deleteMessage(); } catch (e) {}

    await ctx.reply(
      '💬 <b>گفتگو AI هوچینو⁰¹</b>\n\n🚧 این بخش به‌زودی فعال می‌شود...',
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 بازگشت به منو', callback_data: 'back_main_menu' }]
          ]
        }
      }
    );
  });

  // ============ دکمه تحلیل ============
  bot.action('hochino_analyze', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}

    const backBtn = {
      text: '🔙 بازگشت',
      callback_data: 'hochino_back'
    };

    await ctx.reply(
      '⚽️ <b>تحلیل AI هوچینو⁰¹</b>\n\n🚧 این بخش به‌زودی فعال می‌شود...',
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[backBtn]]
        }
      }
    );
  });

  // ============ دکمه جدول ============
  bot.action('hochino_table', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}

    const backBtn = {
      text: '🔙 بازگشت',
      callback_data: 'hochino_back'
    };

    await ctx.reply(
      '📆 <b>جدول AI هوچینو⁰¹</b>\n\n🚧 این بخش به‌زودی فعال می‌شود...',
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[backBtn]]
        }
      }
    );
  });

  // ============ بازگشت به منوی هوچینو ============
  bot.action('hochino_back', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}
    try { await ctx.deleteMessage(); } catch (e) {}
    await showHochinoMenu(ctx);
  });

  console.log('✅ هوچینو⁰¹: ماژول آماده است');
};
