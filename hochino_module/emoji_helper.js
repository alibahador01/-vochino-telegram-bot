// hochino_module/emoji_helper.js
// سیستم Custom Emoji — خوانده‌شده از دیتابیس
// هم برای متن‌ها، هم برای دکمه‌ها

const { getSetting } = require('../db');

const SETTINGS_KEY = 'emoji_assignments';
const CACHE_TTL = 30000; // ۳۰ ثانیه

let cache = null;
let cacheTime = 0;

// ============================================================
// خواندن assignments از دیتابیس (با کش ۳۰ ثانیه‌ای)
// ============================================================
async function getAssignments() {
  const now = Date.now();
  if (cache && now - cacheTime < CACHE_TTL) {
    return cache;
  }
  try {
    const val = await getSetting(SETTINGS_KEY, {});
    cache = (val && typeof val === 'object') ? val : {};
    cacheTime = now;
    return cache;
  } catch (e) {
    return {};
  }
}

// پاک کردن کش (برای زمانی که ادمین چیزی اضافه می‌کنه)
function clearCache() {
  cache = null;
  cacheTime = 0;
}

// ============================================================
// گرفتن ID ایموجی بر اساس ایموجی معمولی
// ============================================================
async function getEmojiId(normalEmoji) {
  const assignments = await getAssignments();
  for (const a of Object.values(assignments)) {
    if (a.emoji === normalEmoji && a.custom_emoji_id) {
      return a.custom_emoji_id;
    }
  }
  return null;
}

// ============================================================
// تبدیل متن: هر ایموجی معمولی که در دیتابیس باشه، پرمیوم می‌شه
// ============================================================
async function premiumize(text) {
  if (!text || typeof text !== 'string') return text;

  const assignments = await getAssignments();
  if (!Object.keys(assignments).length) return text;

  let result = text;

  for (const a of Object.values(assignments)) {
    if (!a.emoji || !a.custom_emoji_id) continue;

    const escaped = a.emoji.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped, 'g');

    result = result.replace(
      re,
      `<tg-emoji emoji-id="${a.custom_emoji_id}">${a.emoji}</tg-emoji>`
    );
  }

  return result;
}

// ============================================================
// ساخت دکمه با آیکون پرمیوم
// emojiOrName: خود ایموجی معمولی (مثلاً ⚽️)
// ============================================================
async function premiumButton(text, callback_data, emoji) {
  const btn = { text, callback_data };
  if (!emoji) return btn;

  const id = await getEmojiId(emoji);
  if (id) btn.icon_custom_emoji_id = id;
  return btn;
}

module.exports = {
  premiumize,
  premiumButton,
  getEmojiId,
  clearCache,
  getAssignments
};
