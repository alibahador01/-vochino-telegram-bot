// sportsDataProvider.js
// 🧠 منبع داده ورزشی چندلایه برای هوشینو⁰¹ برتر
// این فایل از چندین API رسمی و غیررسمی برای دریافت اطلاعات زنده مسابقات، ترکیب تیم‌ها، ضرایب و آمار استفاده می‌کند
// با کش هوشمند در دیتابیس، مصرف API را به حداقل می‌رساند

const { pool, getSetting, setSetting } = require('./db');

// ==================== ساختار جدول کش ====================
// برای ذخیره موقت داده‌های مختلف (مسابقات، ترکیب، ضرایب، آمار) از یک جدول key-value با TTL استفاده می‌کنیم
async function ensureSportsCacheTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_sports_cache (
      cache_key TEXT PRIMARY KEY,
      cache_value JSONB NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW(),
      expires_at TIMESTAMP
    );
  `);
}

// ==================== توابع کش ====================
async function getSportsCache(key) {
  const res = await pool.query(
    'SELECT cache_value, expires_at FROM ai_sports_cache WHERE cache_key = $1 AND (expires_at IS NULL OR expires_at > NOW())',
    [key]
  );
  if (res.rows.length === 0) return null;
  return res.rows[0].cache_value;
}

async function setSportsCache(key, value, ttlSeconds = 3600) {
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  await pool.query(
    `INSERT INTO ai_sports_cache (cache_key, cache_value, updated_at, expires_at)
     VALUES ($1, $2, NOW(), $3)
     ON CONFLICT (cache_key) DO UPDATE
     SET cache_value = EXCLUDED.cache_value,
         updated_at = NOW(),
         expires_at = EXCLUDED.expires_at`,
    [key, JSON.stringify(value), expiresAt]
  );
}

async function deleteSportsCache(key) {
  await pool.query('DELETE FROM ai_sports_cache WHERE cache_key = $1', [key]);
}

// ==================== نرمال‌سازی داده‌ها ====================
/**
 * تبدیل داده‌های خام منبع به ساختار استاندارد
 * @param {string} source نام منبع
 * @param {any} rawData داده خام
 * @returns {object} { matches: [], lineups: {}, odds: {} }
 */
function normalizeData(source, rawData) {
  // این تابع بسته به منبع، داده را به ساختار یکسان تبدیل می‌کند
  // در نسخه فعلی یک ساختار نمونه برمی‌گردانیم که بعداً با داده واقعی پر می‌شود
  return {
    source,
    matches: rawData?.matches || [],
    lineups: rawData?.lineups || {},
    odds: rawData?.odds || {},
    raw: rawData
  };
}

// ==================== آداپتورهای منبع ====================
/**
 * دریافت داده از FotMob (بدون نیاز به کلید)
 */
async function fetchFromFotMob(leagueId) {
  try {
    const url = `https://www.fotmob.com/api/leagues?id=${leagueId}`;
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      }
    });
    if (!resp.ok) throw new Error(`FotMob status ${resp.status}`);
    const data = await resp.json();
    return normalizeData('fotmob', data);
  } catch (e) {
    console.log(`[FotMob] Error: ${e.message}`);
    return null;
  }
}

/**
 * دریافت داده از Sofascore (بدون نیاز به کلید)
 */
async function fetchFromSofascore(leagueId) {
  try {
    const url = `https://api.sofascore.com/api/v1/unique-tournament/${leagueId}/events/next/0`;
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      }
    });
    if (!resp.ok) throw new Error(`Sofascore status ${resp.status}`);
    const data = await resp.json();
    return normalizeData('sofascore', data);
  } catch (e) {
    console.log(`[Sofascore] Error: ${e.message}`);
    return null;
  }
}

/**
 * دریافت داده از API-Football (RapidAPI)
 */
async function fetchFromApiFootball(leagueId, season) {
  const apiKey = await getSetting('api_football_key', '');
  if (!apiKey) return null;
  try {
    const url = `https://api-football-v1.p.rapidapi.com/v3/fixtures?league=${leagueId}&season=${season || new Date().getFullYear()}`;
    const resp = await fetch(url, {
      headers: {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': 'api-football-v1.p.rapidapi.com'
      }
    });
    if (!resp.ok) throw new Error(`API-Football status ${resp.status}`);
    const data = await resp.json();
    return normalizeData('api_football', data);
  } catch (e) {
    console.log(`[API-Football] Error: ${e.message}`);
    return null;
  }
}

/**
 * دریافت داده از TheSportsDB (رایگان با کلید اختیاری)
 */
async function fetchFromTheSportsDB(leagueId) {
  const apiKey = await getSetting('thesportsdb_key', '3'); // کلید عمومی رایگان
  try {
    const url = `https://www.thesportsdb.com/api/v1/json/${apiKey}/eventsnextleague.php?id=${leagueId}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`TheSportsDB status ${resp.status}`);
    const data = await resp.json();
    return normalizeData('thesportsdb', data);
  } catch (e) {
    console.log(`[TheSportsDB] Error: ${e.message}`);
    return null;
  }
}

/**
 * دریافت ضرایب از The Odds API (رایگان با کلید)
 */
async function fetchFromTheOddsAPI(sportKey = 'soccer') {
  const apiKey = await getSetting('odds_api_key', '');
  if (!apiKey) return null;
  try {
    const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?apiKey=${apiKey}&regions=eu`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`OddsAPI status ${resp.status}`);
    const data = await resp.json();
    return normalizeData('odds_api', { odds: data });
  } catch (e) {
    console.log(`[OddsAPI] Error: ${e.message}`);
    return null;
  }
}

// ==================== زنجیره دریافت داده ====================
/**
 * دریافت داده‌های مسابقات با اولویت منابع
 * @param {string} type نوع داده ('fixtures', 'odds', 'lineups')
 * @param {object} params پارامترها (leagueId, season و...)
 * @returns {Promise<object|null>}
 */
async function fetchSportsData(type, params = {}) {
  const { leagueId, season } = params;
  const sources = [];

  // ترتیب منابع بر اساس نوع داده
  if (type === 'fixtures') {
    sources.push(
      { name: 'api_football', fn: () => fetchFromApiFootball(leagueId, season) },
      { name: 'fotmob', fn: () => fetchFromFotMob(leagueId) },
      { name: 'sofascore', fn: () => fetchFromSofascore(leagueId) },
      { name: 'thesportsdb', fn: () => fetchFromTheSportsDB(leagueId) }
    );
  } else if (type === 'odds') {
    sources.push(
      { name: 'odds_api', fn: () => fetchFromTheOddsAPI() },
      { name: 'fotmob', fn: () => fetchFromFotMob(leagueId) } // ضرایب از FotMob در صورت نبود OddsAPI
    );
  } else if (type === 'lineups') {
    sources.push(
      { name: 'api_football', fn: () => fetchFromApiFootball(leagueId, season) },
      { name: 'fotmob', fn: () => fetchFromFotMob(leagueId) },
      { name: 'sofascore', fn: () => fetchFromSofascore(leagueId) }
    );
  }

  for (const src of sources) {
    const data = await src.fn();
    if (data && (data.matches?.length > 0 || data.odds?.length > 0 || Object.keys(data.lineups || {}).length > 0)) {
      return data;
    }
  }
  return null;
}

// ==================== کش با TTL ====================
/**
 * دریافت داده با کش و fallback
 */
async function getSportsDataCached(type, cacheKey, ttlSeconds, fetchFn) {
  // ابتدا از کش بخوان
  const cached = await getSportsCache(cacheKey);
  if (cached) {
    return cached;
  }
  // اگر نبود، fetch کن
  const data = await fetchFn();
  if (data) {
    await setSportsCache(cacheKey, data, ttlSeconds);
  }
  return data;
}

// ==================== توابع عمومی برای هندلرها ====================
/**
 * دریافت جدول مسابقات امروز برای یک لیگ
 * @param {string} leagueId شناسه لیگ
 * @param {string} leagueName نام لیگ (برای کش)
 */
async function getTodayFixtures(leagueId, leagueName) {
  const cacheKey = `fixtures_${leagueId}`;
  return getSportsDataCached(
    'fixtures',
    cacheKey,
    7200, // ۲ ساعت
    async () => {
      const data = await fetchSportsData('fixtures', { leagueId });
      return data ? data.matches : null;
    }
  );
}

/**
 * دریافت ترکیب ۱۱ نفره برای یک مسابقه خاص
 */
async function getMatchLineups(matchId) {
  const cacheKey = `lineups_${matchId}`;
  return getSportsDataCached(
    'lineups',
    cacheKey,
    1800, // ۳۰ دقیقه
    async () => {
      const data = await fetchSportsData('lineups', { matchId });
      return data ? data.lineups : null;
    }
  );
}

/**
 * دریافت ضرایب زنده برای مسابقات
 */
async function getLiveOdds(leagueId) {
  const cacheKey = `odds_${leagueId}`;
  return getSportsDataCached(
    'odds',
    cacheKey,
    300, // ۵ دقیقه
    async () => {
      const data = await fetchSportsData('odds', { leagueId });
      return data ? data.odds : null;
    }
  );
}

// ==================== زمان‌بندی به‌روزرسانی خودکار ====================
/**
 * شروع به‌روزرسانی دوره‌ای داده‌های ورزشی
 * @param {Telegraf} bot نمونه ربات (برای ارسال اعلان‌ها در صورت نیاز)
 */
function startSportsDataUpdater(bot) {
  // لیست لیگ‌های مهم برای به‌روزرسانی مداوم
  const IMPORTANT_LEAGUES = [
    { id: '47', name: 'لیگ برتر انگلیس' },      // Premier League
    { id: '49', name: 'لیگ برتر ایران' },       // Persian Gulf Pro League (شناسه فرضی)
    { id: '54', name: 'بوندسلیگا آلمان' },      // Bundesliga
    { id: '55', name: 'سری آ ایتالیا' },        // Serie A
    { id: '71', name: 'سوپر لیگ ترکیه' },       // Süper Lig
    { id: '73', name: 'لالیگا اسپانیا' }        // La Liga
  ];

  // اجرای اولیه
  updateAllLeagues(IMPORTANT_LEAGUES).catch(err => console.log('[SportsUpdater] Initial error:', err.message));

  // به‌روزرسانی هر ۱۵ دقیقه
  setInterval(() => {
    updateAllLeagues(IMPORTANT_LEAGUES).catch(err => console.log('[SportsUpdater] Interval error:', err.message));
  }, 15 * 60 * 1000);
}

async function updateAllLeagues(leagues) {
  for (const league of leagues) {
    try {
      const data = await fetchSportsData('fixtures', { leagueId: league.id });
      if (data) {
        await setSportsCache(`fixtures_${league.id}`, data.matches, 7200);
        console.log(`[SportsUpdater] Updated fixtures for ${league.name}`);
      }
      // ضرایب را هم به‌روزرسانی کن
      const odds = await fetchSportsData('odds', { leagueId: league.id });
      if (odds) {
        await setSportsCache(`odds_${league.id}`, odds.odds, 300);
      }
    } catch (e) {
      console.log(`[SportsUpdater] Error for ${league.name}:`, e.message);
    }
  }
}

// ==================== مقداردهی اولیه ====================
async function initSportsData() {
  await ensureSportsCacheTable();
  console.log('✅ جدول کش ورزشی آماده است');
}

module.exports = {
  initSportsData,
  startSportsDataUpdater,
  getTodayFixtures,
  getMatchLineups,
  getLiveOdds,
  fetchSportsData,
  setSportsCache,
  getSportsCache
};
