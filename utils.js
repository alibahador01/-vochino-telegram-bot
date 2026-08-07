const { mainMenuButtons } = require('./constants');

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

function showMainMenu(ctx) {
  let buttons = mainMenuButtons.filter(b => b.key !== 'admin_panel');
  const isAdmin = ADMIN_IDS.indexOf(Number(ctx.from.id)) !== -1;
  if (isAdmin) {
    buttons = mainMenuButtons;
  }
  
  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) {
    const row = [];
    row.push({ text: buttons[i].text, callback_data: 'menu_' + buttons[i].key });
    if (buttons[i + 1]) {
      row.push({ text: buttons[i + 1].text, callback_data: 'menu_' + buttons[i + 1].key });
    }
    rows.push(row);
  }
  
  const headerText =
    '⚜️ مرجع تخصصی معاملات ووچر| Vochino⁰¹\n' +
    '🔹 سرعت بالا در نقدشوندگی\n' +
    '🔹️ پشتیبانی آنلاین و لحظه‌ای\n' +
    '🔹 محیطی امن برای تمامی تراکنش‌ها\n\n' +
    '👇🏼 جهت ادامه، گزینه مورد نظر را انتخاب کنید:';
  ctx.reply(headerText, { reply_markup: { inline_keyboard: rows } });
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
    const sent = await bot.telegram.sendPhoto(userId, photo, { caption: caption, ...extra });
    return { success: true, messageId: sent.message_id };
  } catch (error) {
    console.log('❌ ارسال عکس به ' + userId + ' ناموفق: ' + error.message);
    return { success: false, error: error.message };
  }
}

async function sendBroadcast(bot, userIds, text, extra = {}, isFake = false) {
  const results = [];
  let targetUsers = [];
  
  if (isFake) {
    targetUsers = userIds.slice(0, 1);
  } else {
    targetUsers = userIds;
  }
  
  for (const userId of targetUsers) {
    await new Promise(resolve => setTimeout(resolve, 100));
    const result = await sendMessageToUser(bot, userId, text, extra);
    results.push({ userId, ...result });
  }
  
  return results;
}

async function sendBroadcastWithPhoto(bot, userIds, photo, caption, extra = {}, isFake = false) {
  const results = [];
  let targetUsers = [];
  
  if (isFake) {
    targetUsers = userIds.slice(0, 1);
  } else {
    targetUsers = userIds;
  }
  
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
