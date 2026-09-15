// handlers/emojiManager.js
// 🎨 پنل ساده مدیریت Custom Emoji
// روش کار: ایموجی معمولی → آیدی پرمیوم → ذخیره خودکار

const { ADMIN_IDS } = require('../constants');
const { getSetting, setSetting } = require('../db');

const SETTINGS_KEY = 'emoji_assignments';

function isAdmin(id) {
  return ADMIN_IDS.includes(Number(id));
}

// خواندن لیست ذخیره‌شده‌ها
async function getAssignments() {
  const value = await getSetting(SETTINGS_KEY, {});
  return value && typeof value === 'object' ? value : {};
}

// ذخیره یک نگاشت جدید
async function saveAssignment(normalEmoji, customId) {
  const assignments = await getAssignments();

  assignments[normalEmoji] = {
    emoji: normalEmoji,
    custom_emoji_id: String(customId),
    updated_at: new Date().toISOString()
  };

  await setSetting(SETTINGS_KEY, assignments);
  return assignments[normalEmoji];
}

module.exports = function registerEmojiManager(bot) {

  // ============ باز کردن پنل ادمین ============
  bot.action('admin_emoji_manager', async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
      return ctx.answerCbQuery('⛔ دسترسی ندارید', { show_alert: true });
    }

    await ctx.answerCbQuery().catch(() => {});

    const assignments = await getAssignments();
    const count = Object.keys(assignments).length;

    const text =
      `🎨 <b>مدیریت Custom Emoji</b>\n\n` +
      `📚 تعداد ذخیره‌شده: <b>${count}</b>\n\n` +
      `<b>روش کار:</b>\n` +
      `۱. دکمه «افزودن» رو بزن\n` +
      `۲. ایموجی معمولی رو بفرست (مثلاً ⚽️)\n` +
      `۳. آیدی ایموجی پرمیوم رو بفرست\n` +
      `۴. خودکار ذخیره می‌شه\n\n` +
      `از این به بعد، هر جا این ایموجی توی ربات باشه، خودکار پرمیوم می‌شه.`;

    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '➕ افزودن ایموجی جدید', callback_data: 'emoji_mgr_add' }],
          [{ text: '📋 لیست ذخیره‌شده‌ها', callback_data: 'emoji_mgr_list' }],
          [{ text: '🔙 بازگشت', callback_data: 'menu_admin_panel' }]
        ]
      }
    });
  });

  // ============ شروع افزودن ایموجی جدید ============
  bot.action('emoji_mgr_add', async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
      return ctx.answerCbQuery('⛔ دسترسی ندارید', { show_alert: true });
    }

    await ctx.answerCbQuery().catch(() => {});

    if (!ctx.session) ctx.session = {};
    ctx.session.emojiMgr = { step: 'waiting_emoji' };

    await ctx.reply(
      `➕ <b>افزودن ایموجی جدید</b>\n\n` +
      `مرحله ۱ از ۲:\n` +
      `ایموجی <b>معمولی</b> که می‌خوای عوض بشه رو بفرست.\n\n` +
      `مثلاً: ⚽️ یا 👛 یا 🐽`,
      { parse_mode: 'HTML' }
    );
  });

  // ============ نمایش لیست ذخیره‌شده‌ها ============
  bot.action('emoji_mgr_list', async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
      return ctx.answerCbQuery('⛔ دسترسی ندارید', { show_alert: true });
    }

    await ctx.answerCbQuery().catch(() => {});

    const assignments = await getAssignments();
    const entries = Object.values(assignments);

    if (!entries.length) {
      return ctx.reply('📭 هنوز هیچ ایموجی‌ای ذخیره نشده.');
    }

    let text = `📋 <b>ایموجی‌های ذخیره‌شده (${entries.length})</b>\n\n`;

    for (const e of entries.slice(0, 50)) {
      text += `${e.emoji} → <code>${e.custom_emoji_id}</code>\n`;
    }

    await ctx.reply(text, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 بازگشت', callback_data: 'admin_emoji_manager' }]
        ]
      }
    });
  });

  // ============ دریافت پیام‌های متنی (مرحله‌ای) ============
  bot.on('text', async (ctx, next) => {
    if (!isAdmin(ctx.from.id)) return next();

    const state = ctx.session?.emojiMgr;
    if (!state) return next();

    const text = String(ctx.message.text || '').trim();
    if (!text) return next();

    // مرحله ۱: دریافت ایموجی معمولی
    if (state.step === 'waiting_emoji') {
      ctx.session.emojiMgr = {
        step: 'waiting_id',
        normalEmoji: text
      };

      return ctx.reply(
        `✅ ایموجی: <b>${text}</b>\n\n` +
        `مرحله ۲ از ۲:\n` +
        `حالا <b>آیدی ایموجی پرمیوم</b> رو بفرست.\n\n` +
        `مثلاً: <code>5854836453686647425</code>`,
        { parse_mode: 'HTML' }
      );
    }

    // مرحله ۲: دریافت آیدی
    if (state.step === 'waiting_id') {
      const id = text.replace(/\D/g, '');

      if (!id || id.length < 10) {
        return ctx.reply('❌ آیدی معتبر نیست. فقط اعداد رو بفرست.');
      }

      const saved = await saveAssignment(state.normalEmoji, id);

      ctx.session.emojiMgr = null;

      return ctx.reply(
        `✅ <b>ذخیره شد</b>\n\n` +
        `ایموجی: ${saved.emoji}\n` +
        `آیدی: <code>${saved.custom_emoji_id}</code>\n\n` +
        `از این به بعد، هر جا این ایموجی توی ربات باشه، خودکار پرمیوم می‌شه.`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '➕ افزودن یکی دیگه', callback_data: 'emoji_mgr_add' }],
              [{ text: '🎨 مدیریت', callback_data: 'admin_emoji_manager' }]
            ]
          }
        }
      );
    }

    return next();
  });
};
