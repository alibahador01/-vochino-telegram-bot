const fs = require('fs');
const path = require('path');
const { ADMIN_IDS } = require('../constants');
const { getSetting, setSetting } = require('../db');

const LIBRARY_PATH = path.join(__dirname, '..', 'emoji_library.json');
const SETTINGS_KEY = 'emoji_assignments';
const MAX_RESULTS = 50;

let library = [];
let index = [];
let loaded = false;

function isAdmin(id) {
  return ADMIN_IDS.includes(Number(id));
}

function normalizeText(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ة/g, 'ه')
    .replace(/ۀ/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/إ|أ|ٱ/g, 'ا')
    .replace(/[ًٌٍَُِّْـ]/g, '')
    .replace(/[\u200c\u200d]/g, ' ')
    .replace(/[^\p{L}\p{N}_\-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value = '') {
  return normalizeText(value)
    .split(' ')
    .map(x => x.trim())
    .filter(Boolean);
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 0; i < a.length; i++) {
    const cur = [i + 1];

    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;

      cur.push(
        Math.min(
          cur[j] + 1,
          prev[j + 1] + 1,
          prev[j] + cost
        )
      );
    }

    prev.splice(0, prev.length, ...cur);
  }

  return prev[b.length];
}

const STOP_WORDS = new Set([
  'برای',
  'یه',
  'یک',
  'یه‌',
  'ایموجی',
  'ایموجیی',
  'مدل',
  'مدلها',
  'مدل‌ها',
  'نشون',
  'نشان',
  'بیار',
  'بده',
  'پیدا',
  'پیداش',
  'کن',
  'کنه',
  'مناسب',
  'خفن',
  'خوب',
  'بهترین',
  'مختلف',
  'چندتا',
  'چند',
  'تا',
  'عدد',
  'نوع',
  'انواع'
]);

function meaningfulTokens(query) {
  return tokenize(query).filter(token => !STOP_WORDS.has(token));
}

function buildIndex() {
  index = library.map((item, i) => {
    const emoji = normalizeText(item.emoji || '');
    const setName = normalizeText(item.set_name || '');
    const id = String(item.custom_emoji_id || '');

    return {
      i,
      emoji,
      setName,
      id,
      search: normalizeText(
        `${item.emoji || ''} ${item.set_name || ''} ${id}`
      )
    };
  });
}

function loadLibrary() {
  if (loaded) return;

  if (!fs.existsSync(LIBRARY_PATH)) {
    throw new Error(`emoji_library.json not found: ${LIBRARY_PATH}`);
  }

  const raw = fs.readFileSync(LIBRARY_PATH, 'utf8');
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error('emoji_library.json must contain an array');
  }

  library = parsed.filter(x => x && x.custom_emoji_id);
  buildIndex();
  loaded = true;

  console.log(`🎨 Custom Emoji Library loaded: ${library.length}`);
}

function scoreItem(item, idx, query, tokens) {
  if (!query) return Math.random();

  const q = normalizeText(query);
  const full = idx.search;

  let score = 0;

  if (idx.id === q) score += 10000;
  if (idx.emoji === q) score += 5000;
  if (idx.setName === q) score += 3000;

  if (full.includes(q)) {
    score += 1800;
    if (idx.emoji.includes(q)) score += 1200;
    if (idx.setName.includes(q)) score += 700;
  }

  for (const token of tokens) {
    if (idx.emoji.includes(token)) score += 900;
    if (idx.setName.includes(token)) score += 700;
    if (full.includes(token)) score += 300;

    if (token.length >= 3) {
      const words = full.split(' ');

      for (const word of words) {
        if (word.length < 3) continue;

        const distance = levenshtein(token, word);
        const maxLen = Math.max(token.length, word.length);

        if (
          distance <= Math.max(
            1,
            Math.floor(maxLen * 0.25)
          )
        ) {
          score += 180;
          break;
        }
      }
    }
  }

  if (item.is_animated) score += 20;
  if (item.is_video) score += 10;

  return score;
}

function searchLibrary(query = '', limit = MAX_RESULTS) {
  loadLibrary();

  const q = normalizeText(query);
  const tokens = meaningfulTokens(query);

  const scored = index.map((idx, i) => ({
    item: library[i],
    score: scoreItem(library[i], idx, q, tokens)
  }));

  scored.sort((a, b) => b.score - a.score);

  let results = scored
    .filter(x => q ? x.score > 0 : true)
    .slice(0, limit)
    .map(x => x.item);

  if (results.length < limit) {
    const used = new Set(
      results.map(x => x.custom_emoji_id)
    );

    const shuffled = [...library].sort(
      () => Math.random() - 0.5
    );

    for (const item of shuffled) {
      if (results.length >= limit) break;
      if (used.has(item.custom_emoji_id)) continue;

      used.add(item.custom_emoji_id);
      results.push(item);
    }
  }

  return results;
}

function renderCustomEmoji(item) {
  if (!item || !item.custom_emoji_id) {
    return '❓';
  }

  const base = item.emoji || '🔹';

  return `<tg-emoji emoji-id="${item.custom_emoji_id}">${base}</tg-emoji>`;
}

async function getAssignments() {
  const value = await getSetting(
    SETTINGS_KEY,
    {}
  );

  return value && typeof value === 'object'
    ? value
    : {};
}

async function saveAssignment(name, item) {
  const assignments = await getAssignments();

  const key = normalizeText(name);

  assignments[key] = {
    name: String(name).trim(),
    custom_emoji_id: String(item.custom_emoji_id),
    emoji: item.emoji || '🔹',
    set_name: item.set_name || null,
    is_animated: Boolean(item.is_animated),
    is_video: Boolean(item.is_video),
    updated_at: new Date().toISOString()
  };

  await setSetting(
    SETTINGS_KEY,
    assignments
  );

  return assignments[key];
}

async function getAssignment(name) {
  const assignments = await getAssignments();

  return assignments[
    normalizeText(name)
  ] || null;
}

async function getAssignedEmojiId(name) {
  const assignment = await getAssignment(name);

  return assignment
    ? assignment.custom_emoji_id
    : null;
}

function clearMode(ctx) {
  if (ctx.session) {
    delete ctx.session.emojiManager;
  }
}

async function showManager(ctx, text = null) {
  loadLibrary();

  await ctx.answerCbQuery().catch(() => {});

  const body =
    text ||
    `🎨 <b>مدیریت Custom Emoji</b>\n\n` +
    `📚 تعداد موجود: <b>${library.length.toLocaleString('en-US')}</b>\n\n` +
    `هر چیزی که می‌خواهی به زبان طبیعی بنویس.\n` +
    `مثلاً:\n` +
    `• ایموجی قلب متحرک\n` +
    `• برای خرید چند مدل\n` +
    `• ایموجی مناسب دکمه برگشت\n` +
    `• ۵۰ مدل برای هر چیزی که خواستی`;

  await ctx.editMessageText(
    body,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🔎 جستجوی آزاد',
              callback_data: 'emoji_mgr_search'
            }
          ],
          [
            {
              text: '🎲 انتخاب تصادفی',
              callback_data: 'emoji_mgr_random'
            }
          ],
          [
            {
              text: '💾 موارد ذخیره‌شده',
              callback_data: 'emoji_mgr_saved'
            }
          ],
          [
            {
              text: '🔙 بازگشت',
              callback_data: 'menu_admin_panel'
            }
          ]
        ]
      }
    }
  );
}

async function showResults(
  ctx,
  results,
  title = 'نتایج'
) {
  if (!results.length) {
    await ctx.reply('❌ موردی پیدا نشد.');
    return;
  }

  ctx.session.emojiManager = {
    ...(ctx.session.emojiManager || {}),
    results
  };

  const rows = [];

  for (let i = 0; i < results.length; i += 2) {
    const row = [];

    for (
      let j = i;
      j < Math.min(i + 2, results.length);
      j++
    ) {
      const item = results[j];

      row.push({
        text: `${item.emoji || '🔹'} ${j + 1}`,
        callback_data: `emoji_pick_${j}`
      });
    }

    rows.push(row);
  }

  rows.push([
    {
      text: '🔎 جستجوی جدید',
      callback_data: 'emoji_mgr_search'
    },
    {
      text: '🎨 مدیریت',
      callback_data: 'admin_emoji_manager'
    }
  ]);

  const preview = results
    .slice(0, 20)
    .map(
      (item, i) =>
        `${i + 1}. ${renderCustomEmoji(item)}`
    )
    .join('  ');

  await ctx.reply(
    `🎨 <b>${title}</b>\n\n` +
    `${preview}\n\n` +
    `یکی از شماره‌ها را انتخاب کن تا برای یک نام دلخواه ذخیره شود.`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: rows
      }
    }
  );
}

module.exports = function registerEmojiManager(bot) {
  loadLibrary();

  bot.action(
    'admin_emoji_manager',
    async ctx => {
      if (!isAdmin(ctx.from.id)) {
        return ctx.answerCbQuery(
          '⛔ دسترسی ندارید',
          { show_alert: true }
        );
      }

      clearMode(ctx);
      await showManager(ctx);
    }
  );

  bot.action(
    'emoji_mgr_search',
    async ctx => {
      if (!isAdmin(ctx.from.id)) {
        return ctx.answerCbQuery(
          '⛔ دسترسی ندارید',
          { show_alert: true }
        );
      }

      await ctx.answerCbQuery().catch(() => {});

      ctx.session.emojiManager = {
        mode: 'search'
      };

      await ctx.reply(
        `🔎 <b>جستجوی آزاد</b>\n\n` +
        `هر چیزی که می‌خواهی بنویس؛ لازم نیست از دسته‌بندی خاصی استفاده کنی.\n\n` +
        `مثلاً: <i>قلب متحرک</i> یا <i>ایموجی مناسب دکمه برگشت</i>`,
        {
          parse_mode: 'HTML'
        }
      );
    }
  );

  bot.action(
    'emoji_mgr_random',
    async ctx => {
      if (!isAdmin(ctx.from.id)) {
        return ctx.answerCbQuery(
          '⛔ دسترسی ندارید',
          { show_alert: true }
        );
      }

      const results = searchLibrary(
        '',
        MAX_RESULTS
      );

      await ctx.answerCbQuery('🎲 آماده شد');

      await showResults(
        ctx,
        results,
        '🎲 انتخاب تصادفی'
      );
    }
  );

  bot.action(
    'emoji_mgr_saved',
    async ctx => {
      if (!isAdmin(ctx.from.id)) {
        return ctx.answerCbQuery(
          '⛔ دسترسی ندارید',
          { show_alert: true }
        );
      }

      const assignments =
        await getAssignments();

      const entries =
        Object.values(assignments);

      await ctx.answerCbQuery().catch(() => {});

      if (!entries.length) {
        return ctx.reply(
          '💾 هنوز هیچ Custom Emoji با نام دلخواه ذخیره نشده است.'
        );
      }

      const lines = entries
        .slice(0, 100)
        .map(
          (x, i) =>
            `${i + 1}. ${renderCustomEmoji(x)} <b>${x.name}</b>`
        );

      await ctx.reply(
        `💾 <b>موارد ذخیره‌شده</b>\n\n` +
        `${lines.join('\n')}`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '🎨 مدیریت',
                  callback_data: 'admin_emoji_manager'
                }
              ]
            ]
          }
        }
      );
    }
  );

  bot.action(
    /^emoji_pick_(\d+)$/,
    async ctx => {
      if (!isAdmin(ctx.from.id)) {
        return ctx.answerCbQuery(
          '⛔ دسترسی ندارید',
          { show_alert: true }
        );
      }

      const indexNumber =
        Number(ctx.match[1]);

      const manager =
        ctx.session.emojiManager || {};

      const item =
        manager.results?.[indexNumber];

      if (!item) {
        return ctx.answerCbQuery(
          '❌ این نتیجه دیگر موجود نیست',
          { show_alert: true }
        );
      }

      ctx.session.emojiManager = {
        mode: 'assignment_name',
        selected: item
      };

      await ctx.answerCbQuery(
        '✅ انتخاب شد'
      );

      await ctx.reply(
        `🎯 انتخاب شد:\n\n` +
        `${renderCustomEmoji(item)}\n\n` +
        `حالا <b>هر اسم دلخواهی</b> که می‌خواهی برای این ایموجی داشته باشد بفرست.\n\n` +
        `مثلاً:\n` +
        `دکمه برگشت اصلی\n` +
        `ایموجی خرید جدید\n` +
        `هدر صفحه کاربران`,
        {
          parse_mode: 'HTML'
        }
      );
    }
  );

  bot.on(
    'text',
    async (ctx, next) => {
      if (!isAdmin(ctx.from.id)) {
        return next();
      }

      const state =
        ctx.session?.emojiManager;

      if (!state?.mode) {
        return next();
      }

      const text =
        String(ctx.message.text || '').trim();

      if (!text) return;

      if (state.mode === 'search') {
        const results =
          searchLibrary(
            text,
            MAX_RESULTS
          );

        ctx.session.emojiManager = {
          mode: 'results',
          results
        };

        return showResults(
          ctx,
          results,
          `نتایج برای «${text}»`
        );
      }

      if (
        state.mode === 'assignment_name'
      ) {
        if (!state.selected) {
          clearMode(ctx);

          return ctx.reply(
            '❌ ایموجی انتخاب‌شده پیدا نشد.'
          );
        }

        const saved =
          await saveAssignment(
            text,
            state.selected
          );

        clearMode(ctx);

        return ctx.reply(
          `✅ <b>ذخیره شد</b>\n\n` +
          `${renderCustomEmoji(saved)}\n` +
          `نام: <b>${saved.name}</b>\n` +
          `ID: <code>${saved.custom_emoji_id}</code>`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: '🎨 مدیریت Custom Emoji',
                    callback_data: 'admin_emoji_manager'
                  }
                ]
              ]
            }
          }
        );
      }

      return next();
    }
  );

  bot.command(
    'emoji',
    async ctx => {
      if (!isAdmin(ctx.from.id)) return;

      clearMode(ctx);

      await ctx.reply(
        `🎨 <b>مدیریت Custom Emoji</b>\n\n` +
        `📚 ${library.length.toLocaleString('en-US')} ایموجی در کتابخانه موجود است.`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '🔎 جستجوی آزاد',
                  callback_data: 'emoji_mgr_search'
                }
              ],
              [
                {
                  text: '🎲 تصادفی',
                  callback_data: 'emoji_mgr_random'
                }
              ],
              [
                {
                  text: '💾 ذخیره‌شده‌ها',
                  callback_data: 'emoji_mgr_saved'
                }
              ]
            ]
          }
        }
      );
    }
  );
};

module.exports.getAssignment =
  getAssignment;

module.exports.getAssignedEmojiId =
  getAssignedEmojiId;

module.exports.renderCustomEmoji =
  renderCustomEmoji;

module.exports.searchLibrary =
  searchLibrary;

module.exports.getLibraryCount = () => {
  loadLibrary();
  return library.length;
};
