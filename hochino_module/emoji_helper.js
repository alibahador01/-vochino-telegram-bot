// hochino_module/emoji_helper.js
// سیستم Custom Emoji خودکار — خوانده‌شده از پنل ادمین
const { getSetting } = require('../db');

const SETTINGS_KEY = 'emoji_assignments';
const CACHE_TTL = 60000; // ۶۰ ثانیه

let assignmentsCache = null;
let cacheTime = 0;

// خواندن assignment‌ها از دیتابیس
async function getAssignments() {
  const now = Date.now();
  if (assignmentsCache && now - cacheTime < CACHE_TTL) {
    return assignmentsCache;
  }
  try {
    const val = await getSetting(SETTINGS_KEY, {});
    assignmentsCache = (val && typeof val === 'object') ? val : {};
    cacheTime = now;
    return assignmentsCache;
  } catch (e) {
    return {};
  }
}

// گرفتن ID ایموجی بر اساس ایموجی معمولی
async function getEmojiId(normalEmoji) {
  const assignments = await getAssignments();
  for (const a of Object.values(assignments)) {
    if (a.emoji === normalEmoji && a.custom_emoji_id) {
      return a.custom_emoji_id;
    }
  }
  return null;
}

// گرفتن ID ایموجی بر اساس نام دلخواه (مثلاً "wallet" یا "کیف پول")
async function getEmojiIdByName(name) {
  const assignments = await getAssignments();
  const key = String(name || '').toLowerCase().trim();
  for (const a of Object.values(assignments)) {
    const aName = (a.name || '').toLowerCase().trim();
    if (aName === key) return a.custom_emoji_id;
  }
  return null;
}

// تبدیل همه ایموجی‌های مپ‌شده در یک متن به پرمیوم
async function premiumize(text) {
  if (!text || typeof text !== 'string') return text;
  const assignments = await getAssignments();
  const map = {};
  for (const a of Object.values(assignments)) {
    if (a.emoji && a.custom_emoji_id) {
      map[a.emoji] = a.custom_emoji_id;
    }
  }
  if (!Object.keys(map).length) return text;

  let result = text;
  for (const [emoji, id] of Object.entries(map)) {
    const escaped = emoji.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped, 'g');
    result = result.replace(
      re,
      `<tg-emoji emoji-id="${id}">${emoji}</tg-emoji>`
    );
  }
  return result;
}

// ساخت دکمه با آیکون پرمیوم
// emojiOrName: یا خود ایموجی (مثل ⚡) یا نام دلخواه (مثل "wallet")
async function premiumButton(text, callback_data, emojiOrName) {
  const btn = { text, callback_data };
  if (!emojiOrName) return btn;

  // اول اسم رو چک کن
  let id = await getEmojiIdByName(emojiOrName);
  // اگه پیدا نشد، خود ایموجی رو چک کن
  if (!id) id = await getEmojiId(emojiOrName);

  if (id) btn.icon_custom_emoji_id = id;
  return btn;
}

module.exports = {
  premiumize,
  premiumButton,
  getEmojiId,
  getEmojiIdByName,
};
