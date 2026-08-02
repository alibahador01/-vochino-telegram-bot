const { Markup } = require('telegraf');
const texts = require('../texts');
const { sessions, showMainMenu } = require('../utils');
const { pool, getUser, checkMembership } = require('../db');
const { ALLOWED_REACTIONS } = require('../constants');

async function showJoinPrompt(ctx) {
  const t = texts.fa;
  const channelsRes = await pool.query('SELECT * FROM required_channels WHERE active = 1');
  const channels = channelsRes.rows;

  const buttons = channels.map(function (c) {
    return [{ text: t.joinChannelButton, url: c.invite_link }];
  });
  buttons.push([{ text: t.checkMembershipButton, callback_data: 'check_membership' }]);

  ctx.reply(t.mustJoinTitle, { reply_markup: { inline_keyboard: buttons } });
}

async function triggerStartReaction(ctx) {
  try {
    const settingRes = await pool.query('SELECT value FROM settings WHERE key = $1', ['start_reaction']);
    let emoji = settingRes.rows[0] ? settingRes.rows[0].value : '🎉';
    if (ALLOWED_REACTIONS.indexOf(emoji) === -1) { emoji = '🎉'; }
    await ctx.telegram.setMessageReaction(ctx.chat.id, ctx.message.message_id, [{ type: 'emoji', emoji: emoji }], true);
  } catch (e) {
    console.log('REACTION ERROR: ' + e.message);
  }
}

function handleLanguageChoice(ctx, lang) {
  sessions[ctx.from.id] = { flow: 'registration', step: 'waiting_phone', lang: lang, data: {} };
  const t = texts[lang] || texts.fa;

  try {
    ctx.editMessageText(t.welcome);
  } catch (e) {
    ctx.reply(t.welcome);
  }

  ctx.reply(
    t.requestPhone,
    Markup.keyboard([
      Markup.button.contactRequest(t.sharePhoneButton)
    ]).resize().oneTime()
  );
}

module.exports = function registerRegistrationHandlers(bot) {
  bot.start(async (ctx) => {
    triggerStartReaction(ctx);

    const isMember = await checkMembership(ctx);
    if (!isMember) {
      await showJoinPrompt(ctx);
      return;
    }

    const existingUser = await getUser(ctx.from.id);
    if (existingUser) {
      showMainMenu(ctx);
      return;
    }

    ctx.reply(texts.fa.chooseLanguage, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🇮🇷 فارسی', callback_data: 'lang_fa' },
            { text: '🇬🇧 English', callback_data: 'lang_en' }
          ]
        ]
      }
    });
  });

  bot.action('check_membership', async (ctx) => {
    ctx.answerCbQuery();
    const isMember = await checkMembership(ctx);

    if (!isMember) {
      ctx.reply(texts.fa.stillNotMember);
      return;
    }

    ctx.deleteMessage().catch(function () {});
    const existingUser = await getUser(ctx.from.id);
    if (existingUser) {
      showMainMenu(ctx);
    } else {
      ctx.reply(texts.fa.chooseLanguage, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🇮🇷 فارسی', callback_data: 'lang_fa' },
              { text: '🇬🇧 English', callback_data: 'lang_en' }
            ]
          ]
        }
      });
    }
  });

  bot.action('lang_fa', (ctx) => handleLanguageChoice(ctx, 'fa'));
  bot.action('lang_en', (ctx) => handleLanguageChoice(ctx, 'fa'));

  bot.on('contact', (ctx) => {
    const session = sessions[ctx.from.id];
    if (!session || session.flow !== 'registration') return;

    session.data.phone = ctx.message.contact.phone_number;
    session.step = 'waiting_name';

    const t = texts[session.lang] || texts.fa;
    ctx.reply(t.requestName, { reply_markup: { remove_keyboard: true } });
  });

  bot.action('confirm_rules', async (ctx) => {
    try {
      await ctx.deleteMessage();
    } catch (e) {}
    delete sessions[ctx.from.id];
    showMainMenu(ctx);
  });

  // این هندلر فقط مرحله‌های ثبت‌نام (نام و شماره کارت) رو می‌گیره،
  // بقیه‌ی متن‌ها رو با next() می‌فرسته برای هندلرهای دیگه (خرید، فروش، برداشت و ...)
  bot.on('text', async (ctx, next) => {
    const session = sessions[ctx.from.id];
    if (!session || session.flow !== 'registration') return next();

    const t = texts[session.lang] || texts.fa;

    if (session.step === 'waiting_name') {
      session.data.fullName = ctx.message.text;
      session.step = 'waiting_card';
      ctx.reply(t.requestCard);
      return;
    }

    if (session.step === 'waiting_card') {
      session.data.cardNumber = ctx.message.text;
      await pool.query(
        'INSERT INTO users (telegram_id, phone, full_name, card_number, language, balance, registered_at) ' +
        'VALUES ($1, $2, $3, $4, $5, 0, $6) ' +
        'ON CONFLICT (telegram_id) DO UPDATE SET phone = EXCLUDED.phone, full_name = EXCLUDED.full_name, ' +
        'card_number = EXCLUDED.card_number, language = EXCLUDED.language',
        [String(ctx.from.id), session.data.phone, session.data.fullName, session.data.cardNumber, session.lang, new Date().toISOString()]
      );
      ctx.reply(t.registrationSuccess).then(function () {
        ctx.reply(t.rulesText, {
          reply_markup: {
            inline_keyboard: [
              [{ text: t.confirmRulesButton, callback_data: 'confirm_rules' }]
            ]
          }
        });
      });
      return;
    }

    return next();
  });
};
