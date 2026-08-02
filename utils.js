const { mainMenuButtons } = require('./constants');

const sessions = {};

function generateTrackingCode() {
  const randomPart = Math.floor(100000 + Math.random() * 900000);
  return 'VOC-' + randomPart;
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
  const rows = [];
  for (let i = 0; i < mainMenuButtons.length; i += 2) {
    const row = [];
    row.push({ text: mainMenuButtons[i].text, callback_data: 'menu_' + mainMenuButtons[i].key });
    if (mainMenuButtons[i + 1]) {
      row.push({ text: mainMenuButtons[i + 1].text, callback_data: 'menu_' + mainMenuButtons[i + 1].key });
    }
    rows.push(row);
  }
  ctx.reply('منوی اصلی 🏠', { reply_markup: { inline_keyboard: rows } });
}

module.exports = {
  sessions,
  generateTrackingCode,
  fillTemplate,
  sendTracked,
  showMainMenu
};
