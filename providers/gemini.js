// providers/gemini.js
const { fetchWithTimeout } = require('../util/http');

function buildContents(rawHistory, userText, imagePart) {
  const contents = [];
  let lastRole = null;
  for (const h of rawHistory) {
    const role = h.role === 'assistant' ? 'model' : 'user';
    if (role !== lastRole) {
      contents.push({ role, parts: [{ text: h.content }] });
      lastRole = role;
    } else {
      contents[contents.length - 1].parts[0].text += '\n' + h.content;
    }
  }
  // پیام فعلی کاربر همیشه دقیقاً یک‌بار اضافه می‌شه (rawHistory شامل پیام فعلی نیست)
  contents.push({ role: 'user', parts: [{ text: userText }] });
  if (imagePart) contents[contents.length - 1].parts.push({ inlineData: { mimeType: imagePart.mimeType, data: imagePart.base64 } });
  return contents;
}

async function callGeminiOnce(provider, systemPrompt, rawHistory, userText, imagePart, tierCfg, timeoutMs) {
  async function call(maxOutputTokens, thinkingLevel) {
    const resp = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${provider.model}:generateContent?key=${provider.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: buildContents(rawHistory, userText, imagePart),
          generationConfig: { maxOutputTokens, thinkingConfig: { thinkingLevel } }
        })
      },
      timeoutMs
    );
    const data = await resp.json();
    const candidate = data?.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text;
    return { data, candidate, text };
  }

  let { data, candidate, text } = await call(tierCfg.maxOutputTokens, tierCfg.thinkingLevel);

  // اگه کل بودجه‌ی Token صرف Thinking شده و متنی برنگشته (finishReason=MAX_TOKENS و خروجی خالی)،
  // یه‌بار با بودجه‌ی بزرگ‌تر + سطح Thinking پایین‌تر دوباره تلاش کن (نه تلاش نامحدود).
  if ((!text || text.trim().length === 0) && candidate?.finishReason === 'MAX_TOKENS') {
    const boosted = Math.min(tierCfg.maxOutputTokens * 2, 4096);
    const lowerLevel = tierCfg.thinkingLevel === 'high' ? 'medium' : (tierCfg.thinkingLevel === 'medium' ? 'low' : 'minimal');
    ({ data, candidate, text } = await call(boosted, lowerLevel));
  }

  if (!text) {
    console.log('Gemini error details:', JSON.stringify(data).slice(0, 500));
    return { ok: false, text: null };
  }
  return { ok: true, text: text.trim() };
}

module.exports = { callGeminiOnce };
