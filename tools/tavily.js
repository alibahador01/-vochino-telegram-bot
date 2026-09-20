// tools/tavily.js
// Adapter مستقل برای Tavily؛ عمداً موتور Support مستقیم به Tavily وابسته نیست — فقط با
// همین دو تابع (searchWeb/extractUrls) کار می‌کنه، تا بعداً بشه Provider جستجو رو بدون
// دست‌زدن به aiSupport.js عوض کرد (بخش ۳۱ سند).
//
// امنیت کلید (بخش ۳۰): کلید هیچ‌وقت لاگ خام نمی‌شه، هیچ‌وقت داخل Prompt/پیام تلگرام
// نمی‌ره، و در نمایش پنل با maskKey ماسک می‌شه.
const { fetchWithTimeout } = require('../util/http');
const { getAiConfig } = require('../db');

const DEFAULT_TIMEOUT_MS = 8000;

function maskKey(key) {
  if (!key) return null;
  return key.length <= 6 ? '••••••' : '••••••••' + key.slice(-4);
}

async function getTavilyConfig() {
  const [enabledStr, apiKey, depth, maxResultsStr, includeStr, excludeStr] = await Promise.all([
    getAiConfig('tavily_enabled', 'false'),
    getAiConfig('tavily_api_key', ''),
    getAiConfig('tavily_search_depth', 'basic'),
    getAiConfig('tavily_max_results', '5'),
    getAiConfig('tavily_include_domains', ''),
    getAiConfig('tavily_exclude_domains', '')
  ]);
  return {
    enabled: enabledStr === 'true' && !!apiKey,
    apiKey,
    searchDepth: depth === 'advanced' ? 'advanced' : 'basic',
    maxResults: Math.max(1, Math.min(10, parseInt(maxResultsStr, 10) || 5)),
    includeDomains: includeStr ? includeStr.split(',').map(s => s.trim()).filter(Boolean) : undefined,
    excludeDomains: excludeStr ? excludeStr.split(',').map(s => s.trim()).filter(Boolean) : undefined
  };
}

async function searchWeb({ query, searchDepth, maxResults, includeDomains, excludeDomains } = {}) {
  const cfg = await getTavilyConfig();
  if (!cfg.enabled) return { ok: false, reason: 'disabled' };
  try {
    const resp = await fetchWithTimeout('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        query,
        search_depth: searchDepth || cfg.searchDepth,
        max_results: maxResults || cfg.maxResults,
        include_domains: includeDomains || cfg.includeDomains,
        exclude_domains: excludeDomains || cfg.excludeDomains,
        include_raw_content: false
      })
    }, DEFAULT_TIMEOUT_MS);
    const data = await resp.json();
    if (!data || !Array.isArray(data.results)) {
      console.log('Tavily search error: unexpected response shape');
      return { ok: false, reason: 'bad_response' };
    }
    return { ok: true, results: data.results.map(r => ({ title: r.title, url: r.url, content: r.content })) };
  } catch (e) {
    console.log('Tavily search error:', e.name === 'AbortError' ? 'timeout' : e.message);
    return { ok: false, reason: e.name === 'AbortError' ? 'timeout' : 'error' };
  }
}

async function extractUrls({ urls } = {}) {
  const cfg = await getTavilyConfig();
  if (!cfg.enabled) return { ok: false, reason: 'disabled' };
  try {
    const resp = await fetchWithTimeout('https://api.tavily.com/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ urls })
    }, DEFAULT_TIMEOUT_MS);
    const data = await resp.json();
    return { ok: true, results: data?.results || [] };
  } catch (e) {
    console.log('Tavily extract error:', e.name === 'AbortError' ? 'timeout' : e.message);
    return { ok: false, reason: e.name === 'AbortError' ? 'timeout' : 'error' };
  }
}

module.exports = { getTavilyConfig, searchWeb, extractUrls, maskKey };
