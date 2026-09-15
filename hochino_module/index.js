// hochino_module/index.js
// 🐽 ماژول هوچینو⁰¹ — با Custom Emoji
const { premiumButton } = require('./emoji_helper');

module.exports = function registerHochinoHandlers(bot) {
  console.log('🐽 هوچینو⁰¹: بارگذاری ماژول...');

  // ============ منوی اصلی هوچینو ============
  bot.action('menu_hochino_main', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}
    try { await ctx.deleteMessage(); } catch (e) {}

    const analyzeBtn = await premiumButton('تحلیل AI هوچینو⁰¹', 'hochino_analyze', '⚽️');
    const tableBtn = await premiumButton('جدول AI هوچینو⁰¹', 'hochino_table', '📆');

    await ctx.reply('🐽 <b>هوچینو AI برتر⁰¹</b>\n\nیکی از گزینه‌های زیر رو انتخاب کن:', {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [analyzeBtn],
          [tableBtn]
        ]
      }
    });
  });

  // ============ دکمه مستقیم گفتگو ============
  bot.action('menu_hochino_chat', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}
    try { await ctx.deleteMessage(); } catch (e) {}

    await ctx.reply('💬 <b>گفتگو AI هوچینو⁰¹</b>\n\n🚧 این بخش به‌زودی فعال می‌شود...', {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: 'بازگشت به منو', callback_data: 'back_main_menu' }]]
      }
    });
  });

  // ============ تحلیل ============
  bot.action('hochino_analyze', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}
    const backBtn = await premiumButton('بازگشت', 'hochino_back', '🔙');
    await ctx.reply('⚽️ <b>تحلیل AI هوچینو⁰¹</b>\n\n🚧 این بخش به‌زودی فعال می‌شود...', {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[backBtn]] }
    });
  });

  // ============ جدول ============
  bot.action('hochino_table', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}
    const backBtn = await premiumButton('بازگشت', 'hochino_back', '🔙');
    await ctx.reply('📆 <b>جدول AI هوچینو⁰¹</b>\n\n🚧 این بخش به‌زودی فعال می‌شود...', {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[backBtn]] }
    });
  });

  // ============ بازگشت ============
  bot.action('hochino_back', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}
    try { await ctx.deleteMessage(); } catch (e) {}

    const analyzeBtn = await premiumButton('تحلیل AI هوچینو⁰¹', 'hochino_analyze', '⚽️');
    const tableBtn = await premiumButton('جدول AI هوچینو⁰¹', 'hochino_table', '📆');

    await ctx.reply('🐽 <b>هوچینو AI برتر⁰¹</b>\n\nیکی از گزینه‌های زیر رو انتخاب کن:', {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [analyzeBtn],
          [tableBtn]
        ]
      }
    });
  });

  console.log('✅ هوچینو⁰¹: ماژول آماده است');
};
