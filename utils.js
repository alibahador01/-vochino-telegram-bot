// utils.js
const { mainMenuButtons, ADMIN_BUTTON, ADMIN_IDS, AI_THEMES, AI_DEFAULT_THEME } = require('./constants');
const { getSetting, getUser, getRequiredChannels } = require('./db');
const { getText } = require('./textManager');
const i18n = require('./i18n');
const { normalizeTelegramLink } = require('./util/validators');

const sessions = {};

function backToMenuButton(callbackData = 'back_main_menu') {
  return { text: getText('navBackToMenu', '🔙 بازگشت به منو'), callback_data: callbackData };
}

async function reactToMessage(ctx, chatId, messageId, isBig) {
  try {
    const reactionEmoji = await getSetting('start_reaction', '🎉');
    if (!reactionEmoji || !reactionEmoji.trim()) return;
    await ctx.telegram.callApi('setMessageReaction', {
      chat_id: chatId,
      message_id: messageId,
      reaction: [{ type: 'emoji', emoji: reactionEmoji.trim() }],
      is_big: !!isBig
    });
  } catch (e) {
    console.log('[setMessageReaction] رد شد یا پشتیبانی نمی‌شود:', e.message);
  }
}

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

const MENU_BUTTON_I18N_KEY = {
  buy: 'menu.buy',
  sell: 'menu.sell',
  wallet: 'menu.wallet',
  miniapp: 'menu.miniapp',
  hochino_chat: 'menu.hochino_chat',
  hochino_main: 'menu.hochino_main',
  support: 'menu.support'
};

async function getActiveMenuChannel() {
  let channels;
  try {
    channels = await getRequiredChannels();
  } catch (e) {
    return null;
  }
  let sawInvalidLink = false;
  for (const ch of channels || []) {
    const link = normalizeTelegramLink(ch.invite_link);
    if (link) return { ...ch, invite_link: link };
    sawInvalidLink = true;
  }
  if (sawInvalidLink) {
    console.error('[menu] کانال(های) فعال در required_channels بدون لینک معتبر تلگرام — دکمه‌ی «کانال و نرخ‌های آنلاین» پنهان ماند. لینک را در پنل مدیریت بررسی کنید.');
  }
  return null;
}

async function showMainMenu(ctx) {
  const isAdmin = ADMIN_IDS.includes(Number(ctx.from.id));
  const user = await getUser(ctx.from.id).catch(() => null);
  const lang = i18n.normalizeLang(user && user.language) || 'en';

  const buttons = mainMenuButtons.map(b => ({ key: b.key, text: i18n.t(lang, MENU_BUTTON_I18N_KEY[b.key]), url: b.url }));

  const activeChannel = await getActiveMenuChannel();
  if (activeChannel) {
    buttons.push({ key: 'channel', text: i18n.t(lang, 'menu.channel') });
  }

  if (isAdmin) {
    buttons.push({ key: ADMIN_BUTTON.key, text: i18n.t(lang, 'menu.admin_panel') });
  }

  const themeKey = await getSetting('ai_theme', AI_DEFAULT_THEME);
  const theme = AI_THEMES.find(t => t.key === themeKey) || AI_THEMES[0];
  const styleField = theme && theme.style ? { style: theme.style } : {};

  const buildBtn = (b) => (b.url
    ? { text: b.text, url: b.url, ...styleField }
    : { text: b.text, callback_data: 'menu_' + b.key, ...styleField });

  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) {
    if (i + 1 < buttons.length) {
      rows.push([buildBtn(buttons[i]), buildBtn(buttons[i + 1])]);
    } else {
      rows.push([buildBtn(buttons[i])]);
    }
  }

  const headerText =
    '╭〰✨⫹𓆩🏦𓆪⫺✨〰╮\n' +
    '⚡️                              ⚡️\n' +
    '╰〰➫ 𝑽𝒐𝒄𝒉𝒊𝒏𝒐 ➫〰╯\n' +
    '🜲 صرافی ووچینو⁰¹\n' +
    i18n.t(lang, 'menu.header');
  return ctx.reply(headerText, { reply_markup: { inline_keyboard: rows } });
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
  backToMenuButton,
  generateTrackingCode,
  generateVoucherTrackingCode,
  fillTemplate,
  sendTracked,
  showMainMenu,
  getActiveMenuChannel,
  reactToMessage,
  sendMessageToUser,
  sendMessageToUserWithPhoto,
  sendBroadcast,
  sendBroadcastWithPhoto
};
