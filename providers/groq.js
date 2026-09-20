// providers/groq.js
const { fetchWithTimeout } = require('../util/http');

async function callGroqOnce(provider, systemPrompt, rawHistory, userText, tierCfg, timeoutMs) {
  const messages = [{ role: 'system', content: systemPrompt }];
  for (const h of rawHistory) {
    messages.push({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.content });
  }
  messages.push({ role: 'user', content: userText });

  const resp = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${provider.apiKey}`
    },
    body: JSON.stringify({
      model: provider.model,
      messages,
      temperature: 0.7,
      max_tokens: tierCfg.groqMaxTokens
    })
  }, timeoutMs);
  const data = await resp.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) {
    console.log('Groq error details:', JSON.stringify(data).slice(0, 500));
    return { ok: false, text: null };
  }
  return { ok: true, text: text.trim() };
}

async function transcribeVoiceGroq(apiKey, fileUrl, timeoutMs) {
  if (!apiKey) return { ok: false, error: 'no_key' };
  try {
    const audioResp = await fetchWithTimeout(fileUrl, {}, timeoutMs);
    const arrayBuf = await audioResp.arrayBuffer();
    const form = new FormData();
    form.append('file', new Blob([arrayBuf]), 'voice.ogg');
    form.append('model', 'whisper-large-v3-turbo');
    const resp = await fetchWithTimeout('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: form
    }, timeoutMs);
    const data = await resp.json();
    if (!data.text) { console.log('Whisper error:', JSON.stringify(data).slice(0, 300)); return { ok: false, error: 'transcribe_failed' }; }
    return { ok: true, text: data.text.trim() };
  } catch (e) {
    console.log('Transcribe error:', e.message);
    return { ok: false, error: e.name === 'AbortError' ? 'timeout' : e.message };
  }
}

module.exports = { callGroqOnce, transcribeVoiceGroq };
