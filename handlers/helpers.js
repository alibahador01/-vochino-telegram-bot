const config = require('../config.json');

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

function isAdmin(telegramId) {
  return config.adminIds.indexOf(Number(telegramId)) !== -1;
}

async function sendTracked(ctx, session, text, extra) {
  if (session && session.lastBotMsgId) {
    try { await ctx.telegram.deleteMessage(ctx.chat.id, session.lastBotMsgId); } catch (e) {}
  }
  const sent = await ctx.reply(text, extra);
  if (session) session.lastBotMsgId = sent.message_id;
  return sent;
}

module.exports = {
  generateTrackingCode,
  fillTemplate,
  isAdmin,
  sendTracked
};
