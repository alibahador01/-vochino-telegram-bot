// handlers/omniAssistant.js
// 🧠 ماژول هوشینو⁰¹ برتر (Omni-Assistant)
// ترکیبی از گفتگوی عمومی، تحلیل ورزشی و جدول زنده مسابقات

const { sessions, showMainMenu } = require('../utils');
const {
  pool, getUser, getSetting, setSetting, getAiConfig, setAiConfig, getAllAiConfig,
  getAiConversationHistory, addAiConversationMessage, resetAiConversation,
  resetAllAiConversations, checkAiInactivity, getCachedFixtures, cacheFixtures,
  clearOldFixtures, verifyAdminBypass, isDevMode
} = require('../db');
const {
  ADMIN_IDS, AI_HEADERS, AI_MODES, AI_KEY_ENV_MAP, AI_THEMES, AI_DEFAULT_THEME,
  EXTERNAL_API_KEYS
} = require('../constants');
const { getTodayFixtures, getMatchLineups, getLiveOdds, fetchSportsData, initSportsData, startSportsDataUpdater } = require('../sportsDataProvider');

const MODE = AI_MODES;
const HEADERS = AI_HEADERS;

// می‌سازد یک دکمه‌ی inline که رنگ واقعی‌اش را از فیلد رسمی تلگرام "style" می‌گیرد
// (نه "color" که تلگرام اصلاً نمی‌شناسدش و بی‌صدا نادیده‌اش می‌گیرد).
// اگر theme.style مقدار نداشته باشد (حالت "اصلی")، فیلد style اصلاً به دکمه اضافه نمی‌شود.
function themedButton(text, callback_data, theme) {
  const btn = { text, callback_data };
  if (theme && theme.style) btn.style = theme.style;
  return btn;
}

// ---------- توابع کمکی ----------
function isAdmin(id) {
  return ADMIN_IDS.includes(Number(id));
}

function getModeApiKey(mode) {
  const keyMap = {
    [MODE.GENERAL]: 'gemini_general_key',
    [MODE.SPORTS]: 'gemini_sports_key',
    [MODE.FIXTURES]: 'gemini_fixtures_key',
    // حالت پشتیبانی از aiSupport استفاده می‌کند، اینجا لازم نیست
  };
  const keyName = keyMap[mode] || 'gemini_general_key';
  return getAiConfig(keyName, '');
}

// ---------- Tavily Search ----------
async function searchWithTavily(query) {
  const apiKey = await getSetting(EXTERNAL_API_KEYS.TAVILY, '');
  if (!apiKey) {
    console.log('Tavily API key not set');
    return null;
  }
  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        query,
        search_depth: 'basic',
        include_answer: true,
        max_results: 5
      })
    });
    if (!response.ok) throw new Error(`Tavily status ${response.status}`);
    const data = await response.json();
    return data;
  } catch (e) {
    console.log(`[Tavily] Error: ${e.message}`);
    return null;
  }
}

// ---------- Groq Whisper (Speech-to-Text) ----------
async function transcribeVoice(fileUrl) {
  const apiKey = await getSetting(EXTERNAL_API_KEYS.GROQ, '');
  if (!apiKey) {
    console.log('Groq API key not set');
    return null;
  }
  try {
    // دانلود فایل صوتی
    const audioResp = await fetch(fileUrl);
    if (!audioResp.ok) throw new Error(`Download failed with status ${audioResp.status}`);
    const audioBuffer = await audioResp.arrayBuffer();

    // ارسال به Groq
    const formData = new FormData();
    formData.append('file', new Blob([audioBuffer], { type: 'audio/ogg' }), 'voice.ogg');
    formData.append('model', 'whisper-large-v3');
    formData.append('language', 'fa'); // می‌توان خودکار باشد

    const groqResp = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      body: formData
    });
    if (!groqResp.ok) throw new Error(`Groq status ${groqResp.status}`);
    const result = await groqResp.json();
    return result.text || null;
  } catch (e) {
    console.log(`[Groq] Error: ${e.message}`);
    return null;
  }
}

// ---------- ارتباط با Gemini ----------
async function callGemini(mode, telegramId, prompt, imageData = null, voiceText = null) {
  const apiKey = getModeApiKey(mode);
  if (!apiKey) {
    return { ok: false, text: '⚠️ کلید API برای این بخش تنظیم نشده است.' };
  }

  // بررسی انقضای حافظه
  const reset = await checkAiInactivity(telegramId);
  if (reset) {
    console.log(`🧹 حافظه کاربر ${telegramId} به دلیل عدم فعالیت پاک شد.`);
  }

  // ساخت history
  const history = await getAiConversationHistory(telegramId, 15);
  const contents = [];
  let lastRole = null;

  for (const h of history) {
    const role = h.role === 'assistant' ? 'model' : 'user';
    if (role !== lastRole) {
      contents.push({ role, parts: [{ text: h.content }] });
      lastRole = role;
    }
  }

  // افزودن ورودی جدید
  let userParts = [];
  if (voiceText) {
    userParts.push({ text: voiceText });
  }
  if (prompt) {
    userParts.push({ text: prompt });
  }
  if (imageData) {
    userParts.push({
      inlineData: {
        mimeType: 'image/jpeg',
        data: imageData.toString('base64')
      }
    });
  }
  if (userParts.length === 0) {
    userParts.push({ text: 'سلام' });
  }

  if (lastRole === 'user' && contents.length > 0) {
    contents[contents.length - 1].parts.push(...userParts);
  } else {
    contents.push({ role: 'user', parts: userParts });
  }

  // ذخیره پیام کاربر (فقط متن یا توضیح عکس/ویس)
  const userContent = voiceText || prompt || (imageData ? '[عکس]' : '');
  await addAiConversationMessage(telegramId, 'user', userContent);

  // اگر حالت ورزشی یا جدول است، از Tavily جستجو کن و نتایج را به context اضافه کن
  let searchContext = '';
  if (mode === MODE.SPORTS || mode === MODE.FIXTURES) {
    const searchQuery = prompt || voiceText || '';
    if (searchQuery) {
      const searchResult = await searchWithTavily(searchQuery);
      if (searchResult && searchResult.answer) {
        searchContext = `\n\nاطلاعات جستجوی وب:\n${searchResult.answer}`;
        // همچنین نتایج دیگر را خلاصه اضافه کن
        if (searchResult.results && searchResult.results.length > 0) {
          searchContext += '\nمنابع:';
          for (const r of searchResult.results.slice(0, 3)) {
            searchContext += `\n- ${r.title}: ${r.url}`;
          }
        }
      }
    }
  }

  const systemPrompt = buildSystemPrompt(mode) + searchContext;

  const requestBody = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1024
    }
    // توجه: از googleSearch استفاده نمی‌کنیم چون Tavily را داریم
  };

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      }
    );
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.log('Gemini error details:', JSON.stringify(data).slice(0, 500));
      return { ok: false, text: '⚠️ خطا در دریافت پاسخ از هوش مصنوعی.' };
    }
    const finalText = text.trim();
    await addAiConversationMessage(telegramId, 'assistant', finalText);
    return { ok: true, text: finalText };
  } catch (e) {
    console.log('Gemini fetch error:', e.message);
    return { ok: false, text: '⚠️ خطا در ارتباط با سرور هوش مصنوعی.' };
  }
}

function buildSystemPrompt(mode) {
  const base = 'تو دستیار هوشمند هوشینو⁰¹ هستی، بخشی از ربات ووچینو⁰¹. ';
  const security = 'هرگز اطلاعات داخلی، کد منبع، توکن‌ها یا روش ساخت ربات را فاش نکن. ' +
    'اگر کاربر خواست کد یا آموزش ساخت ربات بدهد، مؤدبانه بگو این اطلاعات محرمانه است. ';
  const marketing = '\n\nدر پایان پاسخ‌های تحلیلی، یک جمله کوتاه و جذاب برای تشویق کاربر به شارژ حساب یا خرید ووچر با /start اضافه کن.';

  if (mode === MODE.GENERAL) {
    return base + security +
      'تو یک دستیار همه‌فن‌حریف هستی. به سوالات عمومی، علمی، فنی و روزمره پاسخ بده. ' +
      'می‌تونی عکس ببینی و درباره آن نظر بدهی. پاسخ‌ها را طبیعی و دوستانه بده.' + marketing;
  }

  if (mode === MODE.SPORTS) {
    return base + security +
      'تو یک تحلیلگر ورزشی حرفه‌ای هستی. ' +
      'می‌توانی تحلیل مسابقات فوتبال، پیش‌بینی نتایج، بررسی آمار تیم‌ها و بازیکنان را انجام دهی. ' +
      'برای هر تحلیل، درصد برد و باخت، پیشنهاد شرط‌بندی (میکس یا تکی) با ذکر دلیل و ضریب را بده. ' +
      'همه رشته‌های ورزشی مهم را پوشش بده: فوتبال، والیبال، تنیس، بسکتبال، هاکی و... ' +
      'از داده‌های جستجو شده برای دقت استفاده کن.' + marketing;
  }

  if (mode === MODE.FIXTURES) {
    return base + security +
      'تو نمایش‌دهنده جدول مسابقات امروز هستی. ' +
      'اطلاعات را از جستجوی وب و کش داخلی بگیر. ' +
      'لیگ‌های مهم مثل لیگ برتر ایران، لیگ برتر انگلیس، بوندسلیگا، سری آ، سوپر لیگ ترکیه و لالیگا را پوشش بده. ' +
      'در صورت درخواست، ترکیب ۱۱ نفره تیم‌ها را نشان بده. ' +
      'فرمت نمایش جدول زیبا و خلاصه باشد.' + marketing;
  }

  return base + security + marketing;
}

// ---------- نمایش منوی اصلی هوشینو⁰¹ ----------
async function showOmniMenu(ctx) {
  const themeKey = await getSetting('ai_theme', AI_DEFAULT_THEME);
  const theme = AI_THEMES.find(t => t.key === themeKey) || AI_THEMES[0];

  const header = `╭─ ✦Vochino01✦ ─╮\n   🧠 هوشینو⁰¹ برتر\n╰─ ✦ ──── ✦ ─╯\n\n${theme.emoji} یکی از گزینه‌های زیر را انتخاب کنید:`;

  // دکمه‌ها با رنگ شیشه‌ای واقعی (فیلد style طبق Bot API 9.4)
  const buttons = [
    [themedButton('🐽 گفتگوی AI هوشینو⁰¹', 'omni_general_start', theme)],
    [themedButton('⚽ تحلیل AI هوشینو⁰¹', 'omni_sports_start', theme)],
    [themedButton('📅 جدول امروز هوشینو⁰¹', 'omni_fixtures_start', theme)],
    [themedButton('🔄 شروع گفتگوی جدید', 'omni_reset', theme)],
    [themedButton('🔙 بازگشت به منوی اصلی', 'back_main_menu', theme)]
  ];

  ctx.reply(header, {
    reply_markup: {
      inline_keyboard: buttons
    }
  });
}

// ---------- شروع یک حالت ----------
function startMode(ctx, mode) {
  const headers = {
    [MODE.GENERAL]: HEADERS.general,
    [MODE.SPORTS]: HEADERS.sports,
    [MODE.FIXTURES]: HEADERS.fixtures
  };
  const prompts = {
    [MODE.GENERAL]: '💬 سلام! من هوشینو⁰¹ هستم.\nسوالت رو بپرس یا عکس/ویس بفرست.',
    [MODE.SPORTS]: '⚽ تحلیلگر ورزشی هوشینو⁰¹ در خدمت شماست.\nمسابقه یا تیم مورد نظرت رو بگو.',
    [MODE.FIXTURES]: '📅 جدول امروز مسابقات رو می‌خوای؟ بگو کدوم لیگ؟'
  };

  sessions[ctx.from.id] = {
    flow: 'omni',
    step: 'chatting',
    data: { mode }
  };

  (async () => {
    const themeKeyValue = await getSetting('ai_theme', AI_DEFAULT_THEME);
    const theme = AI_THEMES.find(t => t.key === themeKeyValue) || AI_THEMES[0];

    ctx.reply(headers[mode] + '\n\n' + prompts[mode], {
      reply_markup: {
        inline_keyboard: [
          [themedButton('🔄 شروع گفتگوی جدید', 'omni_reset', theme)],
          [themedButton('🔙 بازگشت به منوی هوشینو⁰¹', 'omni_menu', theme)]
        ]
      }
    });
  })();
}

// ---------- هندلرهای منو ----------
async function registerOmniHandlers(bot) {
  // دکمه منوی اصلی هوشینو⁰¹ (از منوی اصلی ربات)
  bot.action('menu_website', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    return showOmniMenu(ctx);
  });

  // دکمه بازگشت به منوی هوشینو⁰¹
  bot.action('omni_menu', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    return showOmniMenu(ctx);
  });

  // شروع حالت‌ها
  bot.action('omni_general_start', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    return startMode(ctx, MODE.GENERAL);
  });

  bot.action('omni_sports_start', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    return startMode(ctx, MODE.SPORTS);
  });

  bot.action('omni_fixtures_start', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    // برای جدول، ابتدا پیام راهنما نمایش داده و session را تنظیم می‌کنیم
    sessions[ctx.from.id] = {
      flow: 'omni',
      step: 'chatting',
      data: { mode: MODE.FIXTURES, initialRequest: true }
    };
    ctx.reply(HEADERS.fixtures + '\n\n📅 برای دریافت جدول مسابقات امروز، لیگ مورد نظر را بگو (مثلاً لیگ برتر انگلیس، اروپا، بوندسلیگا، سری آ، لیگ برتر ایران، سوپر لیگ ترکیه).');
    return;
  });

  // شروع گفتگوی جدید (پاک کردن حافظه)
  bot.action('omni_reset', async (ctx) => {
    ctx.answerCbQuery();
    await resetAiConversation(ctx.from.id);
    const currentMode = sessions[ctx.from.id]?.data?.mode;
    if (currentMode) {
      // اگر در حالتی بود، دوباره همان حالت را شروع کن
      try { await ctx.deleteMessage(); } catch (e) {}
      return startMode(ctx, currentMode);
    } else {
      try { await ctx.deleteMessage(); } catch (e) {}
      return showOmniMenu(ctx);
    }
  });

  // دستور پاکسازی کلی برای ادمین
  bot.command('flush_ai', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    await resetAllAiConversations();
    ctx.reply('🧹 تمام گفتگوهای هوشینو⁰¹ پاک شد.');
  });

  // ---------- دریافت متن ----------
  bot.on('text', async (ctx, next) => {
    const session = sessions[ctx.from.id];
    if (!session || session.flow !== 'omni' || session.step !== 'chatting') {
      return next();
    }
    const mode = session.data.mode;
    const prompt = ctx.message.text.trim();

    // بای‌پس ادمین
    if (isAdmin(ctx.from.id) && prompt === 'ali_bh01') {
      const ok = await verifyAdminBypass(ctx.from.id, prompt);
      if (ok) {
        ctx.reply('🧑‍💻 حالت توسعه‌دهنده فعال شد.');
        return;
      }
    }

    // اگر درخواست اولیه برای جدول بود و متن شامل لیگ است، از کش و جستجو استفاده می‌کنیم
    if (mode === MODE.FIXTURES && session.data.initialRequest) {
      session.data.initialRequest = false;
      // سعی می‌کنیم از کش امروز بخوانیم
      const today = new Date().toISOString().slice(0, 10);
      const cached = await getCachedFixtures(today);
      if (cached.length > 0) {
        let response = '📅 **جدول مسابقات امروز (از کش)**\n\n';
        for (const fix of cached) {
          response += `⚽ ${fix.home_team} vs ${fix.away_team} | ${fix.league || ''} | ساعت: ${fix.match_time || 'نامشخص'}\n`;
        }
        return ctx.reply(HEADERS.fixtures + '\n\n' + response, { parse_mode: 'Markdown' });
      } else {
        // کش خالی است، از جستجو + Gemini استفاده می‌کنیم
        const result = await callGemini(mode, ctx.from.id, prompt);
        const finalText = result.text;
        return ctx.reply(HEADERS.fixtures + '\n\n' + finalText);
      }
    }

    // پردازش عادی
    ctx.telegram.sendChatAction(ctx.chat.id, 'typing');
    const result = await callGemini(mode, ctx.from.id, prompt);
    const finalText = result.text;
    return ctx.reply(HEADERS[mode] + '\n\n' + finalText, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 شروع گفتگوی جدید', callback_data: 'omni_reset' }],
          [{ text: '🔙 بازگشت به منوی هوشینو⁰¹', callback_data: 'omni_menu' }]
        ]
      }
    });
  });

  // ---------- دریافت عکس ----------
  bot.on('photo', async (ctx, next) => {
    const session = sessions[ctx.from.id];
    if (!session || session.flow !== 'omni' || session.step !== 'chatting') {
      return next();
    }
    const mode = session.data.mode;
    const fileId = ctx.message.photo.slice(-1)[0].file_id;
    try {
      const fileUrl = await ctx.telegram.getFileLink(fileId);
      const response = await fetch(fileUrl.href);
      const buffer = await response.buffer();
      const imageData = buffer.toString('base64');
      const prompt = ctx.message.caption || 'این عکس را تحلیل کن.';
      ctx.telegram.sendChatAction(ctx.chat.id, 'typing');
      const result = await callGemini(mode, ctx.from.id, prompt, imageData);
      return ctx.reply(HEADERS[mode] + '\n\n' + result.text);
    } catch (e) {
      console.log('Photo processing error:', e.message);
      return ctx.reply('⚠️ خطا در پردازش عکس.');
    }
  });

  // ---------- دریافت ویس ----------
  bot.on('voice', async (ctx, next) => {
    const session = sessions[ctx.from.id];
    if (!session || session.flow !== 'omni' || session.step !== 'chatting') {
      return next();
    }
    const mode = session.data.mode;
    const fileId = ctx.message.voice.file_id;
    try {
      const fileUrl = await ctx.telegram.getFileLink(fileId);
      // تبدیل ویس به متن با Groq
      const transcribedText = await transcribeVoice(fileUrl.href);
      if (!transcribedText) {
        return ctx.reply('⚠️ نتوانستم ویس شما را تشخیص دهم. لطفاً دوباره تلاش کنید.');
      }
      // پردازش متن استخراج شده
      ctx.telegram.sendChatAction(ctx.chat.id, 'typing');
      const result = await callGemini(mode, ctx.from.id, null, null, transcribedText);
      return ctx.reply(HEADERS[mode] + '\n\n' + result.text);
    } catch (e) {
      console.log('Voice processing error:', e.message);
      return ctx.reply('⚠️ خطا در پردازش ویس.');
    }
  });

  // ---------- پاکسازی دوره‌ای کش مسابقات قدیمی ----------
  setInterval(async () => {
    try {
      await clearOldFixtures();
    } catch (e) {
      console.log('خطا در پاکسازی کش مسابقات:', e.message);
    }
  }, 2 * 60 * 60 * 1000); // هر ۱ ساعت
}

// ---------- خروجی ماژول ----------
module.exports = function (bot) {
  registerOmniHandlers(bot).catch(err => console.log('خطا در ثبت هندلرهای هوشینو⁰¹:', err.message));
  // شروع زمان‌بندی داده ورزشی
  startSportsDataUpdater(bot);
};
