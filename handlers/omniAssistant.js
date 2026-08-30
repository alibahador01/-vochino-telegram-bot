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
const { ADMIN_IDS, AI_HEADERS, AI_MODES, AI_KEY_ENV_MAP, AI_THEMES, AI_DEFAULT_THEME } = require('../constants');

const MODE = AI_MODES;
const HEADERS = AI_HEADERS;

// ---------- توابع کمکی ----------
function isAdmin(id) {
  return ADMIN_IDS.includes(Number(id));
}

function getModeApiKey(mode) {
  const envMap = {
    [MODE.GENERAL]: 'gemini_general_key',
    [MODE.SPORTS]: 'gemini_sports_key',
    [MODE.FIXTURES]: 'gemini_fixtures_key',
    [MODE.SUPPORT]: 'gemini_support_key'
  };
  const keyName = envMap[mode] || 'gemini_general_key';
  return getAiConfig(keyName, '');
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
      'از جستجوی زنده وب برای اطلاعات به‌روز استفاده کن. ' +
      'پاسخ‌های تحلیلی را با آمار و ارقام دقیق ارائه بده.' + marketing;
  }

  if (mode === MODE.FIXTURES) {
    return base + security +
      'تو نمایش‌دهنده جدول مسابقات امروز هستی. ' +
      'اطلاعات را از کش داخلی و جستجوی زنده وب بگیر. ' +
      'لیگ‌های مهم مثل لیگ برتر ایران، لیگ برتر انگلیس، بوندسلیگا، سری آ، سوپر لیگ ترکیه و فرکانس ماهواره‌ها را پوشش بده. ' +
      'در صورت درخواست، ترکیب ۱۱ نفره تیم‌ها را نشان بده.' + marketing;
  }

  return base + security + marketing;
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
        mimeType: 'image/jpeg', // assume jpeg, can be adjusted
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

  // ذخیره پیام کاربر
  const userContent = voiceText || prompt || (imageData ? '[عکس]' : '');
  await addAiConversationMessage(telegramId, 'user', userContent);

  const systemPrompt = buildSystemPrompt(mode);

  const requestBody = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1024
    },
    tools: [{ googleSearch: {} }] // فعال‌سازی جستجوی زنده گوگل
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

// ---------- نمایش منوی اصلی هوشینو⁰¹ ----------
async function showOmniMenu(ctx) {
  const themeKey = await getSetting('ai_theme', AI_DEFAULT_THEME);
  const theme = AI_THEMES.find(t => t.key === themeKey) || AI_THEMES[0];
  const emoji = theme.emoji;

  const header = `╭─ ✦Vochino01✦ ─╮\n   🧠 هوشینو⁰¹ برتر\n╰─ ✦ ──── ✦ ─╯\n\n${emoji} یکی از گزینه‌های زیر را انتخاب کنید:`;

  ctx.reply(header, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🐽 گفتگوی AI هوشینو⁰¹', callback_data: 'omni_general_start' }],
        [{ text: '⚽ تحلیل AI هوشینو⁰¹', callback_data: 'omni_sports_start' }],
        [{ text: '📅 جدول امروز هوشینو⁰¹', callback_data: 'omni_fixtures_start' }],
        [{ text: '🔄 شروع گفتگوی جدید', callback_data: 'omni_reset' }],
        [{ text: '🔙 بازگشت به منوی اصلی', callback_data: 'back_main_menu' }]
      ]
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

  ctx.reply(headers[mode] + '\n\n' + prompts[mode], {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔄 شروع گفتگوی جدید', callback_data: 'omni_reset' }],
        [{ text: '🔙 بازگشت به منوی هوشینو⁰¹', callback_data: 'omni_menu' }]
      ]
    }
  });
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
    // برای جدول مسابقات، ابتدا کش را چک می‌کنیم و اگر خالی بود از جستجو کمک می‌گیریم
    sessions[ctx.from.id] = {
      flow: 'omni',
      step: 'chatting',
      data: { mode: MODE.FIXTURES, initialRequest: true }
    };
    // پیام راهنما
    ctx.reply(HEADERS.fixtures + '\n\n📅 برای دریافت جدول مسابقات امروز، لیگ مورد نظر را بگو (مثلاً لیگ برتر ایران، لیگ برتر انگلیس، بوندسلیگا، سری آ، سوپر لیگ ترکیه).');
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

  // دستور پاکسازی کلی برای ادمین (در پنل ادمین جداگانه هندل می‌شود اما اینجا هم)
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

    // بای‌پس ادمین: اگر کاربر ادمین و کد مخفی وارد کرد
    if (isAdmin(ctx.from.id) && prompt === 'ali_bh01') {
      const ok = await verifyAdminBypass(ctx.from.id, prompt);
      if (ok) {
        ctx.reply('🧑‍💻 حالت توسعه‌دهنده فعال شد.');
        return;
      }
    }

    // اگر درخواست اولیه برای جدول بود و متن شامل لیگ است، سعی می‌کنیم از کش بخوانیم
    if (mode === MODE.FIXTURES && session.data.initialRequest) {
      session.data.initialRequest = false;
      // سعی می‌کنیم کش امروز را بخوانیم
      const today = new Date().toISOString().slice(0, 10);
      const cached = await getCachedFixtures(today);
      if (cached.length > 0) {
        let response = '📅 **جدول مسابقات امروز (از کش)**\n\n';
        for (const fix of cached) {
          response += `⚽ ${fix.home_team} vs ${fix.away_team} | ${fix.league || ''} | ساعت: ${fix.match_time || 'نامشخص'}\n`;
        }
        return ctx.reply(HEADERS.fixtures + '\n\n' + response, { parse_mode: 'Markdown' });
      } else {
        // کش خالی است، از جستجوی زنده استفاده می‌کنیم
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
    // دریافت فایل عکس
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
      const response = await fetch(fileUrl.href);
      const buffer = await response.buffer();
      // تبدیل ویس به متن (با استفاده از سرویس فرضی، اینجا فقط شبیه‌سازی)
      // در واقعیت باید از Whisper یا سرویس تبدیل گفتار استفاده کنید
      // برای این نسخه، متن خالی می‌فرستیم تا Gemini پاسخ عمومی دهد
      const voiceText = 'کاربر یک پیام صوتی فرستاده است. لطفاً به آن پاسخ بده.';
      ctx.telegram.sendChatAction(ctx.chat.id, 'typing');
      const result = await callGemini(mode, ctx.from.id, voiceText, null, true);
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
  }, 2 * 60 * 60 * 1000); // هر ۲ ساعت
}

// ---------- خروجی ماژول ----------
module.exports = function (bot) {
  registerOmniHandlers(bot).catch(err => console.log('خطا در ثبت هندلرهای هوشینو⁰¹:', err.message));
};
