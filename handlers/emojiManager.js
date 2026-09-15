// handlers/emojiManager.js
// 🎨 پنل ساده مدیریت Custom Emoji
const { ADMIN_IDS } = require('../constants');
const { getSetting, setSetting } = require('../db');
const { clearCache } = require('../hochino_module/emoji_helper');

const SETTINGS_KEY = 'emoji_assignments';

function isAdmin(id) {
  return ADMIN_IDS.includes(Number(id));
}

async function getAssignments() {
  try {
    const value = await getSetting(SETTINGS_KEY, {});
    return value && typeof value === 'object' ? value : {};
  } catch (e) {
    console.error('emojiManager: خطا در خواندن settings:', e.message);
    return {};
  }
}

async function saveAssignment(normalEmoji, customId) {
  const assignments = await getAssignments();
  assignments[normalEmoji] = {
    emoji: normalEmoji,
    custom_emoji_id: String(customId),
    updated_at: new Date().toISOString()
  };
  await setSetting(SETTINGS_KEY, assignments);
  try { clearCache(); } catch (e) {}
  return assignments[normalEmoji];
}

module.exports = function registerEmojiManager(bot) {

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
      `۱. دکمه «افزودن» را بزن\n` +
      `۲. ایموجی معمولی را بفرست (مثلاً ⚽️)\n` +
      `۳. آیدی ایموجی پرمیوم را بفرست\n` +
      `۴. خودکار ذخیره می‌شود\n\n` +
      `از این پس، هر جا این ایموجی در ربات باشد، خودکار پرمیوم می‌شود.`;
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
      `ایموجی <b>معمولی</b> که می‌خواهی عوض شود را بفرست.\n\n` +
      `مثلاً: ⚽️ یا 👛 یا 🐽`,
      { parse_mode: 'HTML' }
    );
  });

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

  bot.on('text', async (ctx, next) => {
    if (!isAdmin(ctx.from.id)) return next();
    const state = ctx.session?.emojiMgr;
    if (!state) return next();
    const text = String(ctx.message.text || '').trim();
    if (!text) return next();

    if (state.step === 'waiting_emoji') {
      if (text.length > 10) {
        return ctx.reply('❌ لطفاً فقط یک ایموجی بفرست.');
      }
      ctx.session.emojiMgr = {
        step: 'waiting_id',
        normalEmoji: text
      };
      return ctx.reply(
        `✅ ایموجی: <b>${text}</b>\n\n` +
        `مرحله ۲ از ۲:\n` +
        `حالا <b>آیدی ایموجی پرمیوم</b> را بفرست.`,
        { parse_mode: 'HTML' }
      );
    }

    if (state.step === 'waiting_id') {
      const id = text.replace(/\D/g, '');
      if (!id || id.length < 10) {
        return ctx.reply('❌ آیدی معتبر نیست.');
      }
      try {
        const saved = await saveAssignment(state.normalEmoji, id);
        ctx.session.emojiMgr = null;
        return ctx.reply(
          `✅ <b>ذخیره شد</b>\n\n` +
          `ایموجی: ${saved.emoji}\n` +
          `آیدی: <code>${saved.custom_emoji_id}</code>`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '➕ افزودن یکی دیگر', callback_data: 'emoji_mgr_add' }],
                [{ text: '🎨 مدیریت', callback_data: 'admin_emoji_manager' }]
              ]
            }
          }
        );
      } catch (e) {
        ctx.session.emojiMgr = null;
        return ctx.reply('❌ خطا در ذخیره.');
      }
    }
    return next();
  });
};
