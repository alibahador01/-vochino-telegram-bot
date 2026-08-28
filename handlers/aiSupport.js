// handlers/aiSupport.js
const { sessions } = require('../utils');
const { pool, getUser, getSetting, setSetting } = require('../db');
const { ADMIN_IDS } = require('../constants');

const HEADER = '╭─ ✦ Vochino⁰¹ ✦ ─╮\n🐽 دستیار هوشمند ووچینو⁰¹\n╰─ ✦ ───── ✦ ─╯\n\n';

function isAdmin(id) { return ADMIN_IDS.includes(Number(id)); }

function genTicketCode() {
  return 'TCK-' + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 900 + 100);
}

async function getKnowledgeText() {
  const res = await pool.query('SELECT title, content FROM ai_support_knowledge WHERE active = TRUE ORDER BY id ASC');
  if (res.rows.length === 0) return '';
  return res.rows.map(r => `### ${r.title}\n${r.content}`).join('\n\n');
}

async function buildSystemPrompt() {
  const knowledge = await getKnowledgeText();
  const custom = await getSetting('gemini_extra_prompt', '');
  return (
    'تو دستیار پشتیبانی هوشمند ووچینو⁰¹ هستی (یک صرافی/سرویس خرید و فروش ووچر دیجیتال در تلگرام). ' +
    'مثل یک پشتیبان انسانی حرفه‌ای، طبیعی، محترمانه و صمیمی صحبت کن. سوال کاربر رو دقیق بفهم و مرحله‌به‌مرحله راهنماییش کن. ' +
    'پاسخ خشک، ماشینی، طولانی یا بی‌ربط نده؛ فقط دقیقاً همون اطلاعاتی که لازمه رو بخواه. ' +
    'هرگز اطلاعات ساختگی نساز؛ اگر جواب یک موضوع رو مطمئن نیستی، حدس نزن و صادقانه بگو باید بررسی بشه. ' +
    'هیچ‌وقت درباره کد، ساختار داخلی، تنظیمات فنی یا نحوه ساخته‌شدن این ربات توضیح نده یا اطلاعات محرمانه فاش نکن؛ ' +
    'اگر کسی درباره این موضوعات پرسید، مؤدبانه بگو این اطلاعات داخلی قابل‌ارائه نیست و در عوض پیشنهاد بده در مورد خدمات ووچینو کمک کنی. ' +
    'اگر کاربر توهین کرد، وارد دعوا نشو، آروم و حرفه‌ای جواب بده. ' +
    'راهنمایی‌هات رو فقط بر اساس دانشی که اینجا در اختیارت گذاشته شده بده:\n\n' +
    (knowledge || '(فعلاً محتوای دانش خاصی ثبت نشده — بر اساس دانش عمومی درباره سرویس‌های خرید/فروش ووچر و کیف پول دیجیتال کمک کن.)') +
    (custom ? ('\n\nنکات اضافی از ادمین:\n' + custom) : '') +
    '\n\n🔹 **دستورالعمل ارجاع به پشتیبانی (تیکت):**\n' +
    '• اگر کاربر مشکل یا سوالی دارد که با دانش موجود قابل پاسخ نیست، یا نیاز به بررسی انسانی دارد (مثلاً اشکال در پرداخت، مغایرت در ووچر، مشکلات فنی، یا هر موضوعی که نیاز به مداخله مدیریت دارد)، در انتهای پاسخ خود عبارت `[NEED_SUPPORT]` را قرار بده.\n' +
    '• اگر کاربر به‌صراحت درخواست تیکت یا ارتباط با مدیریت کرد، ابتدا محترمانه توضیح بده که می‌توانی کمک کنی، ولی اگر اصرار داشت، عبارت `[NEED_SUPPORT]` را قرار بده.\n' +
    '• در مواردی که پاسخ کامل و بدون نیاز به پشتیبانی است، عبارت `[NEED_SUPPORT]` را قرار نده.\n' +
    '• هیچ‌گاه عبارت «ارتباط با مدیریت» را به‌صورت متن ثابت در پاسخ خود قرار نده؛ فقط در صورت نیاز، نشانه `[NEED_SUPPORT]` را اضافه کن.\n' +
    '• پاسخ خود را با دقت و بر اساس درک درست از نیاز کاربر تنظیم کن تا کاربر احساس نکند بی‌دلیل به مدیریت ارجاع داده می‌شود.'
  );
}

async function askGemini(telegramId, userText) {
  const apiKey = await getSetting('gemini_api_key', '');
  if (!apiKey) return { ok: false, text: '⚠️ دستیار هوشمند فعلاً تنظیم نشده. لطفاً از گزینه «ارتباط با مدیریت» استفاده کنید.' };

  const historyRes = await pool.query(
    'SELECT role, content FROM ai_support_conversations WHERE telegram_id = $1 ORDER BY id DESC LIMIT 10',
    [String(telegramId)]
  );
  const rawHistory = historyRes.rows.reverse();

  const systemPrompt = await buildSystemPrompt();
  
  const contents = [];
  let lastRole = null;

  for (const h of rawHistory) {
    const role = h.role === 'assistant' ? 'model' : 'user';
    if (role !== lastRole) {
      contents.push({ role, parts: [{ text: h.content }] });
      lastRole = role;
    }
  }

  if (lastRole === 'user') {
    contents[contents.length - 1].parts[0].text += `\n${userText}`;
  } else {
    contents.push({ role: 'user', parts: [{ text: userText }] });
  }

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: { temperature: 0.6, maxOutputTokens: 700 }
        })
      }
    );
    const data = await resp.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.log('Gemini error details:', JSON.stringify(data).slice(0, 500));
      return { ok: false, text: '⚠️ در حال حاضر امکان پاسخ‌گویی نیست، کمی بعد دوباره امتحان کنید یا از گزینه ارتباط با مدیریت استفاده کنید.' };
    }
    return { ok: true, text: text.trim() };
  } catch (e) {
    console.log('Gemini fetch error:', e.message);
    return { ok: false, text: '⚠️ خطا در ارتباط با دستیار هوشمند. لطفاً بعداً دوباره امتحان کنید یا از گزینه ارتباط با مدیریت استفاده کنید.' };
  }
}

async function showSupportMenu(ctx) {
  ctx.reply(
    '╭─ ✦ Vochino⁰¹ ✦ ─╮\n📞 پشتیبانی ووچینو⁰¹\n🐽 ابتدا مشکل خود را با دستیار هوشمند مطرح کنید؛ اگر برطرف نشد، درخواست ارتباط با مدیریت را ثبت کنید.\n👇🏼 گزینه مورد نظر را انتخاب کنید:',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🐽 دستیار هوشمند', callback_data: 'ai_assistant_start' }],
          [{ text: '💬 پیام‌های قبلی', callback_data: 'ai_history' }],
          [{ text: '🔙 بازگشت', callback_data: 'back_main_menu' }]
        ]
      }
    }
  );
}

async function reactivateTicketIfAny(telegramId) {
  await pool.query(
    "UPDATE ai_support_tickets SET status='open', reminder_sent=false, answered_at=NULL, updated_at=NOW() WHERE telegram_id=$1 AND status='answered'",
    [String(telegramId)]
  );
}

function registerAiSupportHandlers(bot) {
  bot.action('ai_assistant_start', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'ai_chat', step: 'chatting', data: {} };
    ctx.reply(HEADER + '💬 مشکل یا سوالتون رو بنویسید، در خدمتتونم.');
  });

  bot.action('ai_history', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    const res = await pool.query(
      'SELECT role, content, created_at FROM ai_support_conversations WHERE telegram_id = $1 ORDER BY id DESC LIMIT 20',
      [String(ctx.from.id)]
    );
    if (res.rows.length === 0) return ctx.reply('📭 هنوز گفتگویی با دستیار هوشمند نداشتید.');
    const rows = res.rows.reverse();
    let msg = '💬 پیام‌های قبلی شما\n\n';
    for (const r of rows) {
      const who = r.role === 'assistant' ? '🐽 دستیار' : '🙋 شما';
      const content = r.content.length > 200 ? r.content.slice(0, 200) + '…' : r.content;
      msg += `${who}: ${content}\n\n`;
    }
    if (msg.length > 3900) msg = msg.slice(-3900);
    ctx.reply(msg);
  });

  // شروع فرآیند تیکت از طریق دکمه (ارتباط با مدیریت)
  bot.action('ai_start_ticket', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    const userId = ctx.from.id;
    sessions[userId] = { flow: 'ai_ticket', step: 'waiting_order_code', data: {} };
    const user = await getUser(userId);
    const msg =
      HEADER +
      '📩 **ارتباط با مدیریت**\n\n' +
      'حتماً، برای اینکه مدیریت بتواند دقیق‌تر موضوع شما را بررسی کند، لطفاً ابتدا **کد پیگیری مربوط به سفارش یا تراکنش** را ارسال کنید.\n' +
      'سپس در پیام بعدی، مشکل خود را کامل توضیح دهید.\n' +
      'پس از بررسی، در اولین فرصت با شما تماس گرفته می‌شود.';
    ctx.reply(msg, { parse_mode: 'Markdown' });
  });

  bot.action(/^ai_ticket_reply_(\d+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('⛔ دسترسی محدود');
    ctx.answerCbQuery();
    const ticketId = ctx.match[1];
    sessions[ctx.from.id] = { flow: 'ai_admin_reply', step: 'waiting_message', data: { ticketId } };
    ctx.reply(`✍️ پاسخ خودتون رو برای تیکت #${ticketId} بنویسید:`);
  });

  bot.action(/^ai_ticket_close_(\d+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('⛔ دسترسی محدود');
    const ticketId = ctx.match[1];
    const upd = await pool.query("UPDATE ai_support_tickets SET status='closed', updated_at=NOW() WHERE id=$1 AND status != 'closed' RETURNING *", [ticketId]);
    ctx.answerCbQuery(upd.rows[0] ? '✅ بسته شد' : '⛔ قبلاً بسته شده');
    if (upd.rows[0]) {
      ctx.reply(`🔒 تیکت #${ticketId} بسته شد.`);
      try { await ctx.telegram.sendMessage(upd.rows[0].telegram_id, `🔒 تیکت پشتیبانی شما (کد ${upd.rows[0].ticket_code}) بسته شد.`); } catch (e) {}
    }
  });

  // ------------------ پنل ادمین ------------------
  bot.action('admin_ai_support', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    const openCount = (await pool.query("SELECT COUNT(*)::int c FROM ai_support_tickets WHERE status IN ('open','answered')")).rows[0].c;
    const apiKey = await getSetting('gemini_api_key', '');
    ctx.reply(
      `🐽 مدیریت پشتیبانی هوشمند\n\n🔑 کلید Gemini: ${apiKey ? '✅ تنظیم شده' : '❌ تنظیم نشده'}\n📥 تیکت‌های باز/در انتظار: ${openCount}`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔑 تنظیم کلید Gemini', callback_data: 'ai_set_key' }],
            [{ text: '📚 مدیریت دانش پشتیبانی', callback_data: 'ai_knowledge_list' }],
            [{ text: '📝 نکات اضافی برای Gemini', callback_data: 'ai_set_extra_prompt' }],
            [{ text: '🎫 تیکت‌های باز', callback_data: 'ai_tickets_open' }],
            [{ text: '📋 همه تیکت‌ها', callback_data: 'ai_tickets_all' }],
            [{ text: '🔙 بازگشت', callback_data: 'menu_admin_panel' }]
          ]
        }
      }
    );
  });

  bot.action('ai_set_key', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'ai_set_key', step: 'waiting_value' };
    ctx.reply('🔑 کلید API گوگل Gemini رو بفرستید (از aistudio.google.com/apikey رایگان می‌گیرید):');
  });

  bot.action('ai_set_extra_prompt', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'ai_set_extra_prompt', step: 'waiting_value' };
    ctx.reply('📝 نکات اضافی‌ای که می‌خواید Gemini همیشه رعایت کنه رو بفرستید:');
  });

  bot.action('ai_knowledge_list', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    const res = await pool.query('SELECT * FROM ai_support_knowledge ORDER BY id DESC');
    const buttons = res.rows.map(r => [{ text: (r.active ? '✅ ' : '⛔ ') + r.title, callback_data: 'ai_knowledge_view_' + r.id }]);
    buttons.push([{ text: '➕ افزودن دانش جدید', callback_data: 'ai_knowledge_add' }]);
    buttons.push([{ text: '🔙 بازگشت', callback_data: 'admin_ai_support' }]);
    ctx.reply('📚 دانش پشتیبانی (' + res.rows.length + ' مورد):', { reply_markup: { inline_keyboard: buttons } });
  });

  bot.action('ai_knowledge_add', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    sessions[ctx.from.id] = { flow: 'ai_knowledge_add', step: 'waiting_title', data: {} };
    ctx.reply('📌 عنوان دانش جدید رو بفرستید:');
  });

  async function renderKnowledgeItem(ctx, id) {
    const row = (await pool.query('SELECT * FROM ai_support_knowledge WHERE id=$1', [id])).rows[0];
    if (!row) return ctx.reply('یافت نشد.');
    ctx.reply(`📌 ${row.title}\n\n${row.content}\n\nوضعیت: ${row.active ? '✅ فعال' : '⛔ غیرفعال'}`, {
      reply_markup: { inline_keyboard: [
        [{ text: row.active ? '⛔ غیرفعال کردن' : '✅ فعال کردن', callback_data: 'ai_knowledge_toggle_' + id }],
        [{ text: '🗑 حذف', callback_data: 'ai_knowledge_del_' + id }],
        [{ text: '🔙 بازگشت', callback_data: 'ai_knowledge_list' }]
      ] }
    });
  }

  bot.action(/^ai_knowledge_view_(\d+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery();
    return renderKnowledgeItem(ctx, ctx.match[1]);
  });

  bot.action(/^ai_knowledge_toggle_(\d+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const id = ctx.match[1];
    await pool.query('UPDATE ai_support_knowledge SET active = NOT active, updated_at=NOW() WHERE id=$1', [id]);
    ctx.answerCbQuery('✅ به‌روز شد');
    try { await ctx.deleteMessage(); } catch (e) {}
    return renderKnowledgeItem(ctx, id);
  });

  bot.action(/^ai_knowledge_del_(\d+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const id = ctx.match[1];
    await pool.query('DELETE FROM ai_support_knowledge WHERE id=$1', [id]);
    ctx.answerCbQuery('🗑 حذف شد');
    try { await ctx.deleteMessage(); } catch (e) {}
    ctx.reply('🗑 حذف شد.');
  });

  async function renderTicketList(ctx, statusFilter) {
    const query = statusFilter
      ? "SELECT * FROM ai_support_tickets WHERE status = ANY($1) ORDER BY id DESC LIMIT 15"
      : 'SELECT * FROM ai_support_tickets ORDER BY id DESC LIMIT 15';
    const res = statusFilter ? await pool.query(query, [statusFilter]) : await pool.query(query);
    if (res.rows.length === 0) return ctx.reply('📭 تیکتی یافت نشد.');
    for (const t of res.rows) {
      const u = await getUser(t.telegram_id);
      const s = { open: '🟡 باز', answered: '🔵 پاسخ‌داده‌شده', closed: '🟢 بسته' }[t.status] || t.status;
      const msg =
        `╭─ ✦ Vochino⁰¹ ✦ ─╮\n🎫 تیکت پشتیبانی\n` +
        `🆔 کد شناسه کاربر: ${t.telegram_id}\n` +
        `🎫 کد پیگیری تیکت: ${t.ticket_code}\n` +
        `👤 نام و نام خانوادگی: ${u?.full_name || '—'}\n` +
        `📱 تلفن همراه: ${u?.phone || '—'}\n` +
        `💳 کارت بانکی: ${u?.card_number || '—'}\n` +
        `🔖 کد پیگیری سفارش: ${t.order_tracking_code}\n` +
        `❓ سؤال: ${t.question}\n` +
        `━━━━━━━━━━━━━━\n📊 وضعیت: ${s}`;
      const kb = t.status === 'closed' ? [] : [[
        { text: '💬 پاسخ', callback_data: 'ai_ticket_reply_' + t.id },
        { text: '🔒 بستن', callback_data: 'ai_ticket_close_' + t.id }
      ]];
      ctx.reply(msg, kb.length ? { reply_markup: { inline_keyboard: kb } } : undefined);
    }
  }

  bot.action('ai_tickets_open', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    return renderTicketList(ctx, ['open', 'answered']);
  });

  bot.action('ai_tickets_all', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.answerCbQuery(); try { await ctx.deleteMessage(); } catch (e) {}
    return renderTicketList(ctx, null);
  });

  // ------------------ ورودی‌های متنی ------------------
  bot.on('text', async (ctx, next) => {
    const userId = ctx.from.id;
    const session = sessions[userId];

    if (!session) {
      reactivateTicketIfAny(userId).catch(() => {});
      return next();
    }

    // ---- تنظیمات ادمین ----
    if (session.flow === 'ai_set_key' && session.step === 'waiting_value') {
      const key = ctx.message.text.trim();
      if (key.length < 10) return ctx.reply('❌ کلید نامعتبر است.');
      await setSetting('gemini_api_key', key);
      delete sessions[userId];
      return ctx.reply('✅ کلید Gemini ذخیره شد.');
    }
    if (session.flow === 'ai_set_extra_prompt' && session.step === 'waiting_value') {
      await setSetting('gemini_extra_prompt', ctx.message.text.trim());
      delete sessions[userId];
      return ctx.reply('✅ ذخیره شد.');
    }
    if (session.flow === 'ai_knowledge_add' && session.step === 'waiting_title') {
      session.data.title = ctx.message.text.trim();
      session.step = 'waiting_content';
      return ctx.reply('📝 حالا محتوای کامل این دانش رو بفرستید:');
    }
    if (session.flow === 'ai_knowledge_add' && session.step === 'waiting_content') {
      await pool.query('INSERT INTO ai_support_knowledge (title, content, active, created_at, updated_at) VALUES ($1,$2,TRUE,NOW(),NOW())', [session.data.title, ctx.message.text.trim()]);
      delete sessions[userId];
      return ctx.reply('✅ دانش جدید ثبت شد.');
    }
    if (session.flow === 'ai_admin_reply' && session.step === 'waiting_message') {
      const reply = ctx.message.text;
      const ticketId = session.data.ticketId;
      const t = (await pool.query('SELECT * FROM ai_support_tickets WHERE id=$1', [ticketId])).rows[0];
      if (!t) { delete sessions[userId]; return ctx.reply('❌ تیکت یافت نشد.'); }
      try {
        await ctx.telegram.sendMessage(t.telegram_id, `📩 پاسخ پشتیبانی (تیکت ${t.ticket_code}):\n\n${reply}`);
        await pool.query("UPDATE ai_support_tickets SET status='answered', admin_response=$1, answered_at=NOW(), reminder_sent=false, updated_at=NOW() WHERE id=$2", [reply, ticketId]);
        delete sessions[userId];
        ctx.reply('✅ پاسخ ارسال شد.');
      } catch (e) {
        ctx.reply('❌ خطا در ارسال پاسخ.');
        delete sessions[userId];
      }
      return;
    }

    // ---- گفتگوی دستیار هوشمند ----
    if (session.flow === 'ai_chat' && session.step === 'chatting') {
      const text = ctx.message.text.trim();

      // اگر کاربر مستقیماً درخواست تیکت کرد (با عبارت "ارتباط با مدیریت" یا مشابه)
      if (text.includes('ارتباط با مدیریت') || text.includes('تیکت') || text.includes('پشتیبانی') || text.includes('مدیریت')) {
        // بررسی کنیم که آیا واقعاً درخواست تیکت هست یا صرفاً کلمه تیکت در سوال آمده
        // اگر درخواست تیکت بود، کاربر رو به سیستم تیکت هدایت کنیم
        // برای سادگی، اگر عبارت "ارتباط با مدیریت" یا "تیکت" یا "پشتیبانی" در متن بود، فرض می‌کنیم درخواست تیکت هست.
        // اما برای جلوگیری از تشخیص اشتباه، بهتره از هوش مصنوعی استفاده کنیم.
        // در اینجا یک روش ساده: اگر عبارت "ارتباط با مدیریت" دقیقاً یا با کمی تغییر بود، هدایت به تیکت.
        // همچنین اگر کاربر گفت "می‌خوام تیکت بزنم" یا مشابه.
        // برای دقت بیشتر، می‌تونیم از هوش مصنوعی کمک بگیریم که تشخیص بده آیا درخواست تیکت هست یا نه.
        // اما در اینجا به دلیل سادگی، اگر عبارت "ارتباط با مدیریت" در متن باشه، فرض می‌کنیم درخواست تیکت هست.
        // همچنین اگر کاربر گفت "تیکت" یا "پشتیبانی" و متن حاکی از درخواست کمک داشت.
        // بهتره که از هوش مصنوعی بخوایم که تشخیص بده، اما برای سرعت، یک تشخیص ساده انجام می‌دیم.
        // اما برای اطمینان بیشتر، اگر کاربر گفت "ارتباط با مدیریت" یا "می‌خوام تیکت بزنم" یا "با پشتیبانی صحبت کنم"، هدایت به تیکت.
        const ticketKeywords = ['ارتباط با مدیریت', 'تیکت', 'پشتیبانی', 'با مدیریت صحبت کنم', 'می‌خوام تیکت', 'درخواست تیکت'];
        const isTicketRequest = ticketKeywords.some(kw => text.includes(kw));
        if (isTicketRequest) {
          // هدایت به سیستم تیکت
          sessions[userId] = { flow: 'ai_ticket', step: 'waiting_order_code', data: {} };
          const msg =
            HEADER +
            '📩 **ارتباط با مدیریت**\n\n' +
            'حتماً، برای اینکه مدیریت بتواند دقیق‌تر موضوع شما را بررسی کند، لطفاً ابتدا **کد پیگیری مربوط به سفارش یا تراکنش** را ارسال کنید.\n' +
            'سپس در پیام بعدی، مشکل خود را کامل توضیح دهید.\n' +
            'پس از بررسی، در اولین فرصت با شما تماس گرفته می‌شود.';
          return ctx.reply(msg, { parse_mode: 'Markdown' });
        }
      }

      // ذخیره پیام کاربر در تاریخچه
      await pool.query('INSERT INTO ai_support_conversations (telegram_id, role, content, created_at) VALUES ($1,$2,$3,NOW())', [String(userId), 'user', text]);
      const result = await askGemini(userId, text);
      const responseText = result.text;

      // ذخیره پاسخ در تاریخچه
      await pool.query('INSERT INTO ai_support_conversations (telegram_id, role, content, created_at) VALUES ($1,$2,$3,NOW())', [String(userId), 'assistant', responseText]);

      // بررسی وجود نشانه NEED_SUPPORT در پاسخ
      const needSupport = responseText.includes('[NEED_SUPPORT]');
      let finalText = responseText.replace(/\[NEED_SUPPORT\]/g, '').trim();

      // اگر نیاز به پشتیبانی بود، دکمه تیکت نمایش داده می‌شود
      if (needSupport) {
        return ctx.reply(HEADER + finalText, {
          reply_markup: {
            inline_keyboard: [
              [{ text: '📩 ارتباط با مدیریت', callback_data: 'ai_start_ticket' }]
            ]
          }
        });
      } else {
        // پاسخ عادی بدون دکمه
        return ctx.reply(HEADER + finalText);
      }
    }

    // ---- فرآیند تیکت ----
    if (session.flow === 'ai_ticket' && session.step === 'waiting_order_code') {
      // کاربر کد پیگیری را ارسال کرده
      const orderCode = ctx.message.text.trim();
      if (orderCode.length < 3) {
        return ctx.reply('❌ لطفاً یک کد پیگیری معتبر وارد کنید (حداقل ۳ کاراکتر).');
      }
      session.data.orderCode = orderCode;
      session.step = 'waiting_question';
      return ctx.reply(HEADER + '💬 لطفاً مشکل خود را به‌طور کامل توضیح دهید.');
    }

    if (session.flow === 'ai_ticket' && session.step === 'waiting_question') {
      const question = ctx.message.text.trim();
      if (question.length < 5) {
        return ctx.reply('❌ لطفاً مشکل خود را با حداقل ۵ کاراکتر توضیح دهید.');
      }
      const ticketCode = genTicketCode();
      const ins = await pool.query(
        'INSERT INTO ai_support_tickets (telegram_id, ticket_code, order_tracking_code, question, status, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,NOW(),NOW()) RETURNING *',
        [String(userId), ticketCode, session.data.orderCode, question, 'open']
      );
      const ticket = ins.rows[0];
      const u = await getUser(userId);
      delete sessions[userId];

      for (const adminId of ADMIN_IDS) {
        try {
          await ctx.telegram.sendMessage(
            adminId,
            `╭─ ✦ Vochino⁰¹ ✦ ─╮\n🎫 تیکت پشتیبانی\n` +
            `🆔 کد شناسه کاربر: ${userId}\n` +
            `🎫 کد پیگیری تیکت: ${ticket.ticket_code}\n` +
            `👤 نام و نام خانوادگی: ${u?.full_name || '—'}\n` +
            `📱 تلفن همراه: ${u?.phone || '—'}\n` +
            `💳 کارت بانکی: ${u?.card_number || '—'}\n` +
            `🔖 کد پیگیری سفارش: ${ticket.order_tracking_code}\n` +
            `❓ سؤال: ${ticket.question}\n` +
            `━━━━━━━━━━━━━━`,
            { reply_markup: { inline_keyboard: [
              [{ text: '💬 پاسخ', callback_data: 'ai_ticket_reply_' + ticket.id }],
              [{ text: '🔒 بستن', callback_data: 'ai_ticket_close_' + ticket.id }]
            ] } }
          );
        } catch (e) {}
      }

      return ctx.reply(HEADER + `✅ درخواست شما ثبت شد.\n🎫 کد پیگیری تیکت: ${ticket.ticket_code}\nبه‌زودی پاسخ داده می‌شود.`);
    }

    return next();
  });
}

// ------------------ یادآوری خودکار و بستن خودکار ------------------
function startReminderTimer(bot) {
  async function check() {
    try {
      const reminderHours = parseInt(await getSetting('ai_support_reminder_hours', '12'), 10);
      const closeHours = parseInt(await getSetting('ai_support_autoclose_hours', '12'), 10);

      const toRemind = await pool.query(
        `SELECT * FROM ai_support_tickets WHERE status='answered' AND reminder_sent=false AND answered_at < NOW() - ($1 || ' hours')::interval`,
        [reminderHours]
      );
      for (const t of toRemind.rows) {
        try {
          await bot.telegram.sendMessage(t.telegram_id, '🔔 یادآوری پشتیبانی\nآیا مشکل شما برطرف شده است؟ اگر همچنان نیاز به پیگیری دارید، همین‌جا پاسخ دهید.');
          await pool.query('UPDATE ai_support_tickets SET reminder_sent=true, updated_at=NOW() WHERE id=$1', [t.id]);
        } catch (e) {}
      }

      await pool.query(
        `UPDATE ai_support_tickets SET status='closed', updated_at=NOW() WHERE status='answered' AND reminder_sent=true AND answered_at < NOW() - ($1 || ' hours')::interval`,
        [reminderHours + closeHours]
      );
    } catch (e) {
      console.log('خطا در بررسی یادآوری تیکت‌ها:', e.message);
    }
  }
  check().catch(() => {});
  setInterval(() => check().catch(() => {}), 30 * 60 * 1000);
}

module.exports = function (bot) {
  registerAiSupportHandlers(bot);
  startReminderTimer(bot);
};
module.exports.showSupportMenu = showSupportMenu;
