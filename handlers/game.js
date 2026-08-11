// handlers/game.js
const { Markup } = require('telegraf');
const { sessions } = require('../utils');
const { pool, getUser, getSetting } = require('../db');

// متون بازی‌ها (چندزبانه)
const gameTexts = {
  fa: {
    noPurchase: '⚠️ برای استفاده از بازی‌ها، ابتدا باید حداقل یک خرید موفق انجام دهید.',
    chooseGame: '🎮 یک بازی انتخاب کنید:',
    chooseAccount: 'لطفاً نوع حساب خود را انتخاب کنید:',
    back: '🔙 بازگشت',
    balancePlay: '💸 بازی با پول جیب',
    bonusPlay: '🎁 بازی با بونوس',
    win: (gain, type) => `🎉 برنده شدی! ${gain.toLocaleString()} تومان به ${type === 'bonus' ? 'بونوس' : 'کیف پول'} شما اضافه شد.`,
    lose: '😞 باختی!',
    insufficientBalance: '❌ موجودی کافی نیست.',
    disabled: '⚠️ این نوع حساب در حال حاضر غیرفعال است.',
    gameNames: {
      rock_paper_scissors: '👊 سنگ کاغذ قیچی',
      wheel: '🎡 چرخ و فلک',
      penalty: '🥅 پنالتی',
      bowling: '🎳 بولینگ',
      dice: '🎲 تاس',
      dart: '🎯 دارت'
    }
  },
  en: {
    noPurchase: '⚠️ You need at least one successful purchase to play games.',
    chooseGame: '🎮 Choose a game:',
    chooseAccount: 'Please choose account type:',
    back: '🔙 Back',
    balancePlay: '💸 Play with Balance',
    bonusPlay: '🎁 Play with Bonus',
    win: (gain, type) => `🎉 You won! ${gain.toLocaleString()} Toman added to your ${type === 'bonus' ? 'bonus' : 'wallet'}.`,
    lose: '😞 You lost!',
    insufficientBalance: '❌ Insufficient balance.',
    disabled: '⚠️ This account type is currently disabled.',
    gameNames: {
      rock_paper_scissors: '👊 Rock Paper Scissors',
      wheel: '🎡 Wheel of Fortune',
      penalty: '🥅 Penalty',
      bowling: '🎳 Bowling',
      dice: '🎲 Dice',
      dart: '🎯 Darts'
    }
  },
  tr: {
    noPurchase: '⚠️ Oyunları kullanmak için önce bir başarılı alışveriş yapmalısınız.',
    chooseGame: '🎮 Bir oyun seçin:',
    chooseAccount: 'Lütfen hesap türünü seçin:',
    back: '🔙 Geri',
    balancePlay: '💸 Bakiye ile Oyna',
    bonusPlay: '🎁 Bonus ile Oyna',
    win: (gain, type) => `🎉 Kazandınız! ${gain.toLocaleString()} Tümen ${type === 'bonus' ? 'bonus' : 'cüzdan'} hesabınıza eklendi.`,
    lose: '😞 Kaybettiniz!',
    insufficientBalance: '❌ Yetersiz bakiye.',
    disabled: '⚠️ Bu hesap türü şu anda devre dışı.',
    gameNames: {
      rock_paper_scissors: '👊 Taş Kağıt Makas',
      wheel: '🎡 Çarkıfelek',
      penalty: '🥅 Penaltı',
      bowling: '🎳 Bovling',
      dice: '🎲 Zar',
      dart: '🎯 Dart'
    }
  }
};

// لیست بازی‌های موجود
const gameKeys = ['rock_paper_scissors', 'wheel', 'penalty', 'bowling', 'dice', 'dart'];

module.exports = function registerGameHandlers(bot) {

  // منوی اصلی بازی‌ها
  bot.action('menu_game', async (ctx) => {
    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    const user = await getUser(ctx.from.id);
    const lang = user?.language || 'fa';
    const t = gameTexts[lang];

    // بررسی خرید موفق
    const purchaseRes = await pool.query(
      "SELECT COUNT(*)::int AS cnt FROM orders WHERE telegram_id = $1 AND status = 'completed'",
      [String(ctx.from.id)]
    );
    if (purchaseRes.rows[0].cnt === 0) {
      return ctx.reply(t.noPurchase);
    }

    // ساختن دکمه‌های بازی
    const buttons = gameKeys.map(key => {
      const name = t.gameNames[key] || key;
      return [{ text: name, callback_data: 'game_select_' + key }];
    });
    buttons.push([{ text: t.back, callback_data: 'back_main_menu' }]);

    ctx.reply(t.chooseGame, Markup.inlineKeyboard(buttons));
  });

  // انتخاب یک بازی
  bot.action(/^game_select_(.+)/, async (ctx) => {
    const gameKey = ctx.match[1];
    const user = await getUser(ctx.from.id);
    const lang = user?.language || 'fa';
    const t = gameTexts[lang];

    // دریافت تنظیمات ادمین
    const disableBalance = await getSetting('disableBalanceGame', 'false') === 'true';
    const disableBonus = await getSetting('disableBonusGame', 'false') === 'true';

    // دکمه‌های انتخاب نوع حساب
    const accountButtons = [];
    if (!disableBalance) {
      accountButtons.push(Markup.button.callback(t.balancePlay, `play_${gameKey}_balance`));
    }
    if (!disableBonus) {
      accountButtons.push(Markup.button.callback(t.bonusPlay, `play_${gameKey}_bonus`));
    }
    if (accountButtons.length === 0) {
      return ctx.reply('⚠️ در حال حاضر هیچ نوع حسابی برای بازی فعال نیست.');
    }

    ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    ctx.reply(t.chooseAccount, Markup.inlineKeyboard(accountButtons.map(b => [b])));
  });

  // اجرای بازی
  bot.action(/^play_(.+)_(balance|bonus)$/, async (ctx) => {
    const gameKey = ctx.match[1];
    const accountType = ctx.match[2]; // 'balance' or 'bonus'
    const user = await getUser(ctx.from.id);
    const lang = user?.language || 'fa';
    const t = gameTexts[lang];

    // مبلغ شرط (می‌توان بعداً از تنظیمات خواند، فعلاً ثابت ۱۰۰۰ تومان)
    const betAmount = 1000;

    // بررسی موجودی
    const balanceField = accountType === 'bonus' ? 'bonus_balance' : 'balance';
    const currentBalance = user ? Number(user[balanceField]) : 0;
    if (currentBalance < betAmount) {
      await ctx.answerCbQuery('❌ موجودی کافی نیست');
      return ctx.reply(t.insufficientBalance);
    }

    // درصد برد از تنظیمات
    const winRateKey = accountType === 'bonus' ? 'winRateBonus' : 'winRateBalance';
    const winRate = parseInt(await getSetting(winRateKey, '50'), 10);

    // ضریب برد
    const multiplier = parseInt(await getSetting('gameMultiplier', '2'), 10);

    // محاسبه نتیجه
    const won = Math.random() * 100 < winRate;

    await ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}

    if (won) {
      const gain = betAmount * multiplier;
      await pool.query(
        `UPDATE users SET ${balanceField} = ${balanceField} + $1 WHERE telegram_id = $2`,
        [gain - betAmount, String(ctx.from.id)]  // چون betAmount کم می‌شود و سپس gain اضافه، خالص gain - betAmount
      );
      // در واقع ابتدا باید betAmount کم شود و سپس gain اضافه شود، اما با یک کوئری خالص: balance = balance - betAmount + gain = balance + (gain - betAmount)
      ctx.reply(t.win(gain, accountType));
    } else {
      await pool.query(
        `UPDATE users SET ${balanceField} = ${balanceField} - $1 WHERE telegram_id = $2`,
        [betAmount, String(ctx.from.id)]
      );
      ctx.reply(t.lose);
    }

    // بازگشت به منوی اصلی بازی‌ها
    // یک مکث کوتاه برای طبیعی‌تر شدن
    setTimeout(() => {
      // شبیه‌سازی بازگشت به منوی بازی‌ها (می‌توان دوباره action menu_game را فراخوانی کرد)
    }, 1000);
    // اما بهتر است بلافاصله منوی بازی‌ها را دوباره نمایش دهیم
    // با صدا زدن همان action
    ctx.answerCbQuery(); // قبلاً answer داده شده، اینجا دیگر نیاز نیست
    // دوباره منوی بازی‌ها را نشان بده
    // کمی تأخیر برای نمایش نتیجه، بعد دوباره منوی بازی
    setTimeout(async () => {
      try {
        // حذف پیام قبلی (اختیاری) و نمایش منو
        await ctx.deleteMessage();
        // با یک callback دستی منوی بازی‌ها را دوباره صدا بزن
        await ctx.reply('🎮 بازی دیگری انتخاب کنید:');
        // فراخوانی مستقیم handler
        const user = await getUser(ctx.from.id);
        const lang = user?.language || 'fa';
        const t2 = gameTexts[lang];
        const purchaseRes = await pool.query(
          "SELECT COUNT(*)::int AS cnt FROM orders WHERE telegram_id = $1 AND status = 'completed'",
          [String(ctx.from.id)]
        );
        if (purchaseRes.rows[0].cnt === 0) return;
        const buttons = gameKeys.map(key => [{ text: t2.gameNames[key], callback_data: 'game_select_' + key }]);
        buttons.push([{ text: t2.back, callback_data: 'back_main_menu' }]);
        await ctx.reply(t2.chooseGame, Markup.inlineKeyboard(buttons));
      } catch (e) {}
    }, 2000);
  });

};
