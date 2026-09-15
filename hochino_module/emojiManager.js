// handlers/emojiManager.js
// 🎨 پنل ساده مدیریت Custom Emoji
// ------------------------------------------------------------
// روش کار:
//   ۱. ادمین روی «افزودن ایموجی جدید» می‌زند
//   ۲. ایموجی معمولی را می‌فرستد (مثلاً ⚽️)
//   ۳. آیدی ایموجی پرمیوم را وارد می‌کند
//   ۴. سیستم به صورت خودکار آن را ذخیره می‌کند
//   ۵. از این پس هر جا این ایموجی در ربات باشد،
//      به صورت خودکار به ایموجی پرمیوم تبدیل می‌شود
//
// ⚠️ این فایل کاملاً مستقل از کدهای صرافی است و فقط
//    از توابع db و constants استفاده می‌کند.
// ------------------------------------------------------------

const { ADMIN_IDS } = require('../constants');
const { getSetting, setSetting } = require('../db');
const { clearCache } = require('../hochino_module/emoji_helper');

const SETTINGS_KEY = 'emoji_assignments';

// بررسی ادمین بودن
function isAdmin(id) {
  return ADMIN_IDS.includes(Number(id));
}

// ============================================================
// خواندن لیست نگاشت‌های ذخیره‌شده
// ============================================================
async function getAssignments() {
  try {
    const value = await getSetting(SETTINGS_KEY, {});
    return value && typeof value === 'object' ? value : {};
  } catch (e) {
    console.error('emojiManager: خطا در خواندن settings:', e.message);
    return {};
  }
}

// ============================================================
// ذخیره یک نگاشت جدید (ایموجی معمولی → آیدی پرمیوم)
// ============================================================
async function saveAssignment(normalEmoji, customId) {
  const assignments = await getAssignments();

  assignments[normalEmoji] = {
    emoji: normalEmoji,
    custom_emoji_id: String(customId),
    updated_at: new Date().toISOString()
  };

  await setSetting(SETTINGS_KEY, assignments);

  // پاک کردن کش تا ایموجی جدید بدون restart اعمال شود
  try {
    clearCache();
  } catch (e) {
    console.log('emojiManager: خطا در پاک کردن کش:', e.message);
  }

  return assignments[normalEmoji];
}

// ============================================================
// حذف یک نگاشت
// ============================================================
async function deleteAssignment(normalEmoji) {
  const assignments = await getAssignments();
  if (assignments[normalEmoji]) {
    delete assignments[normalEmoji];
    await setSetting(SETTINGS_KEY, assignments);
    try {
      clearCache();
    } catch (e) {}
    return true;
  }
  return false;
}

// ============================================================
// ثبت هندلرها روی ربات
// ============================================================
module.exports = function registerEmojiManager(bot) {

  // ============ باز کردن پنل مدیریت ============
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
      `ایموجی <b>معمولی</b> که می‌خواهی عوض شود را بفرست.\n\n` +
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

    if (entries.length > 50) {
      text += `\n... و ${entries.length - 50} مورد دیگر`;
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
    // فقط ادمین‌ها
    if (!isAdmin(ctx.from.id)) return next();

    // فقط اگر توی حالت emojiMgr باشیم
    const state = ctx.session?.emojiMgr;
    if (!state) return next();

    const text = String(ctx.message.text || '').trim();
    if (!text) return next();

    // ---------- مرحله ۱: دریافت ایموجی معمولی ----------
    if (state.step === 'waiting_emoji') {
      // اطمینان از اینکه یه ایموجی معمولی هست (نه متن طولانی)
      if (text.length > 10) {
        return ctx.reply(
          '❌ لطفاً فقط یک ایموجی بفرست (مثلاً ⚽️)، نه متن.'
        );
      }

      ctx.session.emojiMgr = {
        step: 'waiting_id',
        normalEmoji: text
      };

      return ctx.reply(
        `✅ ایموجی انتخاب‌شده: <b>${text}</b>\n\n` +
        `مرحله ۲ از ۲:\n` +
        `حالا <b>آیدی ایموجی پرمیوم</b> را بفرست.\n\n` +
        `مثلاً: <code>5854836453686647425</code>`,
        { parse_mode: 'HTML' }
      );
    }

    // ---------- مرحله ۲: دریافت آیدی پرمیوم ----------
    if (state.step === 'waiting_id') {
      // فقط اعداد را نگه می‌داریم
      const id = text.replace(/\D/g, '');

      if (!id || id.length < 10) {
        return ctx.reply(
          '❌ آیدی معتبر نیست. فقط اعداد را بفرست (حداقل ۱۰ رقم).'
        );
      }

      try {
        const saved = await saveAssignment(state.normalEmoji, id);

        // پاک کردن state
        ctx.session.emojiMgr = null;

        return ctx.reply(
          `✅ <b>ذخیره شد</b>\n\n` +
          `ایموجی: ${saved.emoji}\n` +
          `آیدی: <code>${saved.custom_emoji_id}</code>\n\n` +
          `از این پس، هر جا این ایموجی در ربات باشد، خودکار پرمیوم می‌شود.`,
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
        console.error('emojiManager: خطا در ذخیره:', e.message);
        ctx.session.emojiMgr = null;

        return ctx.reply(
          '❌ خطا در ذخیره‌سازی. لطفاً دوباره تلاش کن.'
        );
      }
    }

    return next();
  });
};
