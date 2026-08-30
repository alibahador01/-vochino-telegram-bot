// textManager.js
const { pool } = require('./db');

// کش در حافظه برای متن‌های ربات
let textCache = new Map(); // key -> { key, category, value, description, updated_at }

/**
 * بارگذاری همه متن‌ها از دیتابیس به کش
 * @returns {Promise<boolean>} موفقیت یا شکست
 */
async function loadTextsCache() {
  try {
    const res = await pool.query('SELECT key, category, value, description, updated_at FROM bot_texts');
    textCache.clear();
    for (const row of res.rows) {
      textCache.set(row.key, {
        key: row.key,
        category: row.category,
        value: row.value,
        description: row.description || '',
        updated_at: row.updated_at
      });
    }
    console.log(`✅ ${textCache.size} متن در کش بارگذاری شد.`);
    return true;
  } catch (e) {
    console.log('❌ خطا در بارگذاری کش متن‌ها:', e.message);
    return false;
  }
}

/**
 * دریافت یک متن از کش با مقدار پیش‌فرض
 * @param {string} key کلید متن
 * @param {string} defaultValue مقدار پیش‌فرض در صورت نبودن
 * @returns {string}
 */
function getText(key, defaultValue = '') {
  const item = textCache.get(key);
  return item ? item.value : defaultValue;
}

/**
 * دریافت اطلاعات کامل یک متن از کش
 * @param {string} key
 * @returns {object|null} {key, category, value, placeholders: string[]}
 */
function getTextInfo(key) {
  const item = textCache.get(key);
  if (!item) return null;
  const placeholders = extractPlaceholders(item.value);
  return {
    key: item.key,
    category: item.category,
    value: item.value,
    placeholders
  };
}

/**
 * استخراج placeholder های {xxx} از یک متن
 * @param {string} text
 * @returns {string[]} آرایه‌ای از نام‌های placeholder بدون { }
 */
function extractPlaceholders(text) {
  if (!text) return [];
  const matches = text.match(/\{(\w+)\}/g);
  if (!matches) return [];
  return [...new Set(matches.map(m => m.slice(1, -1)))];
}

/**
 * دریافت همه متن‌های یک دسته‌بندی
 * @param {string} category
 * @returns {Array<{key, category, value}>}
 */
function getTextsByCategory(category) {
  const result = [];
  for (const item of textCache.values()) {
    if (item.category === category) {
      result.push({ key: item.key, category: item.category, value: item.value });
    }
  }
  return result;
}

/**
 * دریافت لیست همه دسته‌بندی‌های موجود
 * @returns {string[]}
 */
function getAllCategories() {
  const categories = new Set();
  for (const item of textCache.values()) {
    categories.add(item.category);
  }
  return Array.from(categories).sort();
}

/**
 * جستجوی کلیدواژه در بین متن‌های کش
 * @param {string} searchTerm
 * @returns {Array<{key, category, value}>}
 */
function searchTextsInCache(searchTerm) {
  const term = searchTerm.toLowerCase();
  const results = [];
  for (const item of textCache.values()) {
    if (item.key.toLowerCase().includes(term) || item.value.toLowerCase().includes(term)) {
      results.push({ key: item.key, category: item.category, value: item.value });
    }
  }
  return results;
}

/**
 * اعتبارسنجی placeholder ها: اطمینان از حفظ placeholder های متن قبلی در متن جدید
 * @param {string} oldValue
 * @param {string} newValue
 * @returns {{valid: boolean, missing: string[]}}
 */
function validatePlaceholders(oldValue, newValue) {
  const oldPlaceholders = extractPlaceholders(oldValue);
  const newPlaceholders = extractPlaceholders(newValue);
  const missing = oldPlaceholders.filter(p => !newPlaceholders.includes(p));
  return {
    valid: missing.length === 0,
    missing
  };
}

/**
 * بروزرسانی متن در دیتابیس و کش
 * @param {string} key
 * @param {string} newValue
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function refreshText(key, newValue) {
  try {
    const res = await pool.query(
      'UPDATE bot_texts SET value = $2, updated_at = NOW() WHERE key = $1 RETURNING key, category, value, updated_at',
      [key, newValue]
    );
    if (res.rows.length === 0) {
      return { success: false, error: 'متن یافت نشد.' };
    }
    const row = res.rows[0];
    textCache.set(key, {
      key: row.key,
      category: row.category,
      value: row.value,
      description: '', // description is not updated
      updated_at: row.updated_at
    });
    return { success: true };
  } catch (e) {
    console.log('❌ خطا در بروزرسانی متن:', e.message);
    return { success: false, error: e.message };
  }
}

/**
 * فرمت‌دهی متن برای نمایش در پنل ادمین (جلوگیری از تفسیر HTML)
 * @param {string} value
 * @returns {string}
 */
function formatTextForDisplay(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

module.exports = {
  loadTextsCache,
  getText,
  getTextInfo,
  getTextsByCategory,
  getAllCategories,
  searchTextsInCache,
  validatePlaceholders,
  refreshText,
  formatTextForDisplay,
  extractPlaceholders
};
