// textManager.js
const { getAllBotTexts, getBotTextByKey, updateBotText } = require('./db');

// کش در حافظه
let textsCache = {};
let cacheLoaded = false;

/**
 * بارگذاری تمام متن‌ها از دیتابیس و ذخیره در کش
 * فقط یک‌بار موقع روشن‌شدن ربات صدا زده می‌شود
 */
async function loadTextsCache() {
  try {
    const allTexts = await getAllBotTexts();
    const newCache = {};
    
    for (const row of allTexts) {
      newCache[row.key] = {
        value: row.value,
        category: row.category,
        description: row.description || ''
      };
    }
    
    textsCache = newCache;
    cacheLoaded = true;
    console.log(`✅ کش متن‌ها بارگذاری شد (${Object.keys(textsCache).length} متن)`);
    return true;
  } catch (err) {
    console.error('❌ خطا در بارگذاری کش متن‌ها:', err.message);
    return false;
  }
}

/**
 * دریافت یک متن از کش
 * @param {string} key - کلید متن
 * @param {string} defaultValue - مقدار پیش‌فرض اگر کلید وجود نداشت
 * @returns {string}
 */
function getText(key, defaultValue = '') {
  if (!cacheLoaded) {
    console.warn('⚠️ کش هنوز بارگذاری نشده، مقدار پیش‌فرض برگردانده شد');
    return defaultValue;
  }
  
  if (textsCache[key]) {
    return textsCache[key].value;
  }
  
  console.warn(`⚠️ کلید "${key}" در کش یافت نشد`);
  return defaultValue;
}

/**
 * دریافت تمام متن‌های یک دسته‌بندی خاص
 * @param {string} category 
 * @returns {Array}
 */
function getTextsByCategory(category) {
  if (!cacheLoaded) return [];
  
  const result = [];
  for (const key in textsCache) {
    if (textsCache[key].category === category) {
      result.push({
        key,
        value: textsCache[key].value,
        description: textsCache[key].description
      });
    }
  }
  return result;
}

/**
 * جستجوی متن در کش
 * @param {string} searchTerm 
 * @returns {Array}
 */
function searchTextsInCache(searchTerm) {
  if (!cacheLoaded) return [];
  
  const term = searchTerm.toLowerCase();
  const result = [];
  
  for (const key in textsCache) {
    const item = textsCache[key];
    if (
      key.toLowerCase().includes(term) ||
      item.value.toLowerCase().includes(term) ||
      item.category.toLowerCase().includes(term)
    ) {
      result.push({
        key,
        value: item.value,
        category: item.category,
        description: item.description
      });
    }
  }
  return result;
}

/**
 * استخراج placeholder های یک متن
 * @param {string} text 
 * @returns {Array} آرایه‌ای از placeholder ها
 */
function extractPlaceholders(text) {
  const regex = /\{(\w+)\}/g;
  const matches = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (!matches.includes(match[1])) {
      matches.push(match[1]);
    }
  }
  return matches;
}

/**
 * بررسی صحت placeholder ها بین متن قدیم و جدید
 * @param {string} oldText 
 * @param {string} newText 
 * @returns {object} { valid: boolean, missing: Array, extra: Array }
 */
function validatePlaceholders(oldText, newText) {
  const oldPlaceholders = extractPlaceholders(oldText);
  const newPlaceholders = extractPlaceholders(newText);
  
  const missing = oldPlaceholders.filter(p => !newPlaceholders.includes(p));
  const extra = newPlaceholders.filter(p => !oldPlaceholders.includes(p));
  
  return {
    valid: missing.length === 0,
    missing,
    extra
  };
}

/**
 * آپدیت یک متن در دیتابیس و کش
 * @param {string} key 
 * @param {string} newValue 
 * @returns {object} result
 */
async function refreshText(key, newValue) {
  try {
    // آپدیت در دیتابیس
    const updated = await updateBotText(key, newValue);
    
    if (!updated) {
      return { success: false, error: 'کلید در دیتابیس یافت نشد' };
    }
    
    // آپدیت کش
    textsCache[key] = {
      value: newValue,
      category: updated.category,
      description: updated.description || ''
    };
    
    return { success: true, data: updated };
  } catch (err) {
    console.error(`❌ خطا در آپدیت متن ${key}:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * دریافت اطلاعات کامل یک متن از کش
 * @param {string} key 
 * @returns {object|null}
 */
function getTextInfo(key) {
  if (!cacheLoaded || !textsCache[key]) return null;
  
  return {
    key,
    value: textsCache[key].value,
    category: textsCache[key].category,
    description: textsCache[key].description,
    placeholders: extractPlaceholders(textsCache[key].value)
  };
}

/**
 * دریافت لیست تمام دسته‌بندی‌ها
 * @returns {Array}
 */
function getAllCategories() {
  if (!cacheLoaded) return [];
  
  const categories = new Set();
  for (const key in textsCache) {
    categories.add(textsCache[key].category);
  }
  return Array.from(categories).sort();
}

/**
 * فرمت‌کردن یک متن برای نمایش به ادمین (placeholder ها با 🔒 مشخص شوند)
 * @param {string} text 
 * @returns {string}
 */
function formatTextForDisplay(text) {
  return text.replace(/\{(\w+)\}/g, '🔒{$1}🔒');
}

module.exports = {
  loadTextsCache,
  getText,
  getTextsByCategory,
  searchTextsInCache,
  extractPlaceholders,
  validatePlaceholders,
  refreshText,
  getTextInfo,
  getAllCategories,
  formatTextForDisplay,
  isCacheLoaded: () => cacheLoaded
};
