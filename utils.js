// utils.js
const { mainMenuButtons, ADMIN_BUTTON, ADMIN_IDS } = require('./constants');
const { getSetting } = require('./db');

const sessions = {};

function generateTrackingCode() {
  const randomPart = Math.floor(100000 + Math.random() * 900000);
  return 'VOC-' + randomPart;
}

function generateVoucherTrackingCode() {
  const randomPart = Math.floor(1000 + Math.random() * 9000);
  return '#VCH_' + randomPart;
}

function fillTemplate(template, values) {
  let result = template;
  Object.keys(values).forEach(function (key) {
    result = result.split('{' + key + '}').join(values[key]);
  });
  return result;
}

async function sendTracked(ctx, session, text, extra) {
  if (session && session.lastBotMsgId) {
    try { await ctx.telegram.deleteMessage(ctx.chat.id, session.lastBotMsgId); } catch (e) {}
  }
  const sent = await ctx.reply(text, extra);
  if (session) session.lastBotMsgId = sent.message_id;
  return sent;
}

/**
 * نمایش منوی اصلی با چیدمان جدید:
 * خرید (چپ) - فروش (راست)
 * جیب (چپ) - بونوس (راست)
 * ویژه ووچینو⁰۱ (چپ) - وب‌سایت (راست)
 * پشتیبانی (وسط)
 */
async function showMainMenu(ctx) {
  const isAdmin = ADMIN_IDS.includes(Number(ctx.from.id));

  const buttons = [...mainMenuButtons];

  if (isAdmin) {
    buttons.push(ADMIN_BUTTON);
  }

  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) {
    if (i + 1 < buttons.length) {
      rows.push([
        { text: buttons[i].text, callback_data: 'menu_' + buttons[i].key },
        { text: buttons[i + 1].text, callback_data: 'menu_' + buttons[i + 1].key }
      ]);
    } else {
      rows.push([
        { text: buttons[i].text, callback_data: 'menu_' + buttons[i].key }
      ]);
    }
  }

  const headerText =
    '╭─ ✦ Vochino⁰¹✦─╮\n' +
    '          👑 ووچینو⁰¹\n' +
    '╰─ ✦ ──── ✦ ─╯\n\n' +
    '⚜ مرجع تخصصی معاملات | ووچر\n' +
    '🔹 سرعت بالا در نقدشوندگی\n' +
    '🐽 پشتیبانی آنلاین و لحظه‌ای\n' +
    '🔹 محیطی امن برای تمامی تراکنش‌ها\n' +
    '👇🏼 جهت ادامه، گزینه مورد نظر را انتخاب کنید';

  const sent = await ctx.reply(headerText, { reply_markup: { inline_keyboard: rows } });

  // تلاش برای واکنش شناور روی پیام منو با ایموجی تنظیم‌شده در پنل ادمین
  try {
    const reactionEmoji = await getSetting('start_reaction', '🎉');
    if (reactionEmoji && reactionEmoji.trim() !== '') {
      await ctx.telegram.callApi('setMessageReaction', {
        chat_id: ctx.chat.id,
        message_id: sent.message_id,
        reaction: [{ type: 'emoji', emoji: reactionEmoji.trim() }]
      });
    }
  } catch (e) {
    // خطای setMessageReaction نادیده گرفته می‌شود
    console.log('[setMessageReaction] Not supported or error:', e.message);
  }
}

async function sendMessageToUser(bot, userId, text, extra = {}) {
  try {
    const sent = await bot.telegram.sendMessage(userId, text, extra);
    return { success: true, messageId: sent.message_id };
  } catch (error) {
    console.log('❌ ارسال پیام به ' + userId + ' ناموفق: ' + error.message);
    return { success: false, error: error.message };
  }
}

async function sendMessageToUserWithPhoto(bot, userId, photo, caption, extra = {}) {
  try {
    const sent = await bot.telegram.sendPhoto(userId, photo, { caption, ...extra });
    return { success: true, messageId: sent.message_id };
  } catch (error) {
    console.log('❌ ارسال عکس به ' + userId + ' ناموفق: ' + error.message);
    return { success: false, error: error.message };
  }
}

async function sendBroadcast(bot, userIds, text, extra = {}, isFake = false) {
  const results = [];
  const targetUsers = isFake ? userIds.slice(0, 1) : userIds;
  for (const userId of targetUsers) {
    await new Promise(resolve => setTimeout(resolve, 100));
    const result = await sendMessageToUser(bot, userId, text, extra);
    results.push({ userId, ...result });
  }
  return results;
}

async function sendBroadcastWithPhoto(bot, userIds, photo, caption, extra = {}, isFake = false) {
  const results = [];
  const targetUsers = isFake ? userIds.slice(0, 1) : userIds;
  for (const userId of targetUsers) {
    await new Promise(resolve => setTimeout(resolve, 100));
    const result = await sendMessageToUserWithPhoto(bot, userId, photo, caption, extra);
    results.push({ userId, ...result });
  }
  return results;
}

module.exports = {
  sessions,
  generateTrackingCode,
  generateVoucherTrackingCode,
  fillTemplate,
  sendTracked,
  showMainMenu,
  sendMessageToUser,
  sendMessageToUserWithPhoto,
  sendBroadcast,
  sendBroadcastWithPhoto
};
