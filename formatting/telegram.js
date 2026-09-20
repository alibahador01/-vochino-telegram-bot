// formatting/telegram.js
// تبدیل واقعی Markdown مدل به HTML مجاز تلگرام (به‌جای حذف کورکورانه‌ی *) + Chunk‌بندی امن
// زیر سقف پیام تلگرام، بدون شکستن تگ‌های HTML وسط راه.
const TELEGRAM_CHUNK_MAX = 3500; // زیر سقف واقعی تلگرام (۴۰۹۶) تا جا برای HEADER/دکمه بمونه

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inlineMarkdownToHtml(text) {
  let out = escapeHtml(text);
  out = out.replace(/`([^`\n]+)`/g, (m, p1) => '<code>' + p1 + '</code>');
  out = out.replace(/\*\*([^\n*]+)\*\*/g, (m, p1) => '<b>' + p1 + '</b>');
  out = out.replace(/(^|[^*])\*([^\n*]+)\*(?!\*)/g, (m, pre, p1) => pre + '<i>' + p1 + '</i>');
  out = out.replace(/(^|[^_])_([^\n_]+)_(?!_)/g, (m, pre, p1) => pre + '<i>' + p1 + '</i>');
  // شبکه‌ی ایمنی نهایی: هر ستاره/زیرخط جفت‌نشده‌ای که تا اینجا باقی مونده رو پاک کن
  out = out.replace(/\*{1,3}/g, '');
  return out;
}

function markdownToBlocks(rawText) {
  const lines = String(rawText).split('\n');
  const blocks = []; // { type:'html', html } یا { type:'code', lang, content }
  let i = 0;
  let paragraphBuf = [];

  function flushParagraph() {
    if (paragraphBuf.length === 0) return;
    const text = paragraphBuf.join('\n').trim();
    if (text) blocks.push({ type: 'html', html: inlineMarkdownToHtml(text) });
    paragraphBuf = [];
  }

  while (i < lines.length) {
    const line = lines[i];
    const fenceMatch = line.match(/^```(\w+)?\s*$/);
    if (fenceMatch) {
      flushParagraph();
      const lang = fenceMatch[1] || '';
      const codeLines = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) { codeLines.push(lines[i]); i++; }
      i++; // رد شدن از ``` بسته
      blocks.push({ type: 'code', lang, content: codeLines.join('\n') });
      continue;
    }
    const headingMatch = line.match(/^#{1,6}\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      blocks.push({ type: 'html', html: '<b>' + inlineMarkdownToHtml(headingMatch[1]) + '</b>' });
      i++;
      continue;
    }
    if (line.trim() === '') { flushParagraph(); i++; continue; }
    paragraphBuf.push(line);
    i++;
  }
  flushParagraph();
  return blocks;
}

function packBlocksIntoChunks(blocks, maxLen) {
  const chunks = [];
  let current = '';
  const pushCurrent = () => { if (current) { chunks.push(current); current = ''; } };

  for (const block of blocks) {
    if (block.type === 'code') {
      const langAttr = block.lang ? ` class="language-${escapeHtml(block.lang)}"` : '';
      const overhead = `<pre><code${langAttr}></code></pre>`.length;
      if (block.content.length + overhead <= maxLen) {
        const rendered = `<pre><code${langAttr}>${escapeHtml(block.content)}</code></pre>`;
        const candidate = current ? current + '\n\n' + rendered : rendered;
        if (candidate.length > maxLen) { pushCurrent(); current = rendered; } else { current = candidate; }
      } else {
        // کدبلاک تنها از سقف یک پیام تلگرام بزرگ‌تره؛ محتوای خامش تکه‌تکه و هر تکه در pre/code جدا
        pushCurrent();
        const sliceSize = Math.max(200, maxLen - overhead - 20);
        for (let start = 0; start < block.content.length; start += sliceSize) {
          const part = block.content.slice(start, start + sliceSize);
          chunks.push(`<pre><code${langAttr}>${escapeHtml(part)}</code></pre>`);
        }
      }
      continue;
    }
    const rendered = block.html;
    if (rendered.length > maxLen) {
      pushCurrent();
      let buf = '';
      for (const part of rendered.split('\n')) {
        const cand = buf ? buf + '\n' + part : part;
        if (cand.length > maxLen) { if (buf) chunks.push(buf); buf = part; } else buf = cand;
      }
      if (buf) chunks.push(buf);
      continue;
    }
    const candidate = current ? current + '\n\n' + rendered : rendered;
    if (candidate.length > maxLen) { pushCurrent(); current = rendered; } else { current = candidate; }
  }
  pushCurrent();
  return chunks.length ? chunks : [''];
}

function formatForTelegramChunks(rawText) {
  const blocks = markdownToBlocks(rawText);
  return packBlocksIntoChunks(blocks, TELEGRAM_CHUNK_MAX);
}

// header جداگانه پاس داده می‌شه تا این ماژول به ثابت‌های کسب‌وکاری (مثل HEADER ربات) وابسته نباشه
async function sendAiReply(ctx, thinkingMsg, rawText, extraPayload, header) {
  const chunks = formatForTelegramChunks(rawText);
  for (let idx = 0; idx < chunks.length; idx++) {
    const isFirst = idx === 0;
    const isLast = idx === chunks.length - 1;
    const payload = { parse_mode: 'HTML', ...((isLast && extraPayload) ? extraPayload : {}) };
    let handled = false;
    if (isFirst && thinkingMsg) {
      try {
        await ctx.telegram.editMessageText(ctx.chat.id, thinkingMsg.message_id, undefined, (header || '') + chunks[idx], payload);
        handled = true;
      } catch (e) { /* اگه ویرایش شکست خورد (مثلاً پیام خیلی طولانیه)، به‌صورت پیام جدید بفرست */ }
    }
    if (!handled) await ctx.reply(isFirst ? (header || '') + chunks[idx] : chunks[idx], payload);
  }
}

module.exports = { escapeHtml, formatForTelegramChunks, sendAiReply, TELEGRAM_CHUNK_MAX };
