// priceCard.js
// رندر لیست قیمت لحظه‌ای به‌صورت یک عکس (شبیه کارت‌های تمیزِ جدولی آن کانال نمونه)، با @napi-rs/canvas.
//
// ⚠️ یادداشت صادقانه: این فایل را بدون امکان دیدن خروجی واقعی نوشتم (نه شبکه برای نصب
// @napi-rs/canvas دارم، نه نمایشگری برای دیدن عکس نهایی) — همه‌ی APIها دقیقاً از مستندات رسمی
// پکیج کپی شده‌اند (createCanvas / GlobalFonts.registerFromPath / ctx.font / canvas.toBuffer)، نه
// حدسی. اما چیدمان پیکسلی (فاصله‌ها، سایزها) اولین نسخه‌ست — بعد از دیپلوی یه اسکرین‌شات بفرست
// تا دقیق‌ترش کنم. برای همینه که در homeMenu.js، اگر همین‌جا هر خطایی رخ بدهد، به‌صورت خودکار و
// بی‌صدا به همان نسخه‌ی متنی قبلی برمی‌گردیم — یعنی یک باگ اینجا هرگز کل قابلیت Live Price را
// از کار نمی‌اندازد، فقط به حالت متنی برمی‌گردد.

const path = require('path');
const fs = require('fs');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');

const FONT_FAMILY = 'Vazirmatn';
let fontReady = false;

function ensureFont() {
  if (fontReady) return true;
  // هر دو نام رایج فایل فونت را امتحان می‌کنیم؛ کافیست یکی از این دو را در assets/fonts/ بگذارید
  const candidates = [
    path.join(__dirname, 'assets', 'fonts', 'Vazirmatn-Regular.ttf'),
    path.join(__dirname, 'assets', 'fonts', 'Vazir.ttf')
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      GlobalFonts.registerFromPath(p, FONT_FAMILY);
      fontReady = true;
      return true;
    }
  }
  return false;
}

function fmt(n) {
  if (n === undefined || n === null || n === '' || isNaN(Number(n))) return '—';
  return Number(n).toLocaleString('en-US');
}

// یک کارت دو‌ستونه (خرید | فروش) برای یک ارز، دقیقاً هم‌ارز همان جفت‌خط buildPriceLine در homeMenu.js
function drawCard(ctx, x, y, w, h, label, buyVal, sellVal) {
  // عمداً از roundRect استفاده نشده: پشتیبانی دقیقش روی هر نسخه‌ای از @napi-rs/canvas برایم
  // قطعی نبود، و fillRect/strokeRect همیشه و در همه‌جا کار می‌کند — گوشه‌ی تیز به‌جای گرد،
  // ولی تضمینی.
  ctx.fillStyle = '#1a1f2e';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#2a3144';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);

  // عنوان ارز (راست‌چین، چون فارسیه)
  ctx.fillStyle = '#e8ebf5';
  ctx.font = `bold 26px ${FONT_FAMILY}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(label, x + w - 24, y + 40);

  // خط جداکننده‌ی افقی زیر عنوان
  ctx.strokeStyle = '#2a3144';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 16, y + 58);
  ctx.lineTo(x + w - 16, y + 58);
  ctx.stroke();

  // خط جداکننده‌ی عمودی وسط
  const midX = x + w / 2;
  ctx.beginPath();
  ctx.moveTo(midX, y + 58);
  ctx.lineTo(midX, y + h - 16);
  ctx.stroke();

  const colTop = y + 58;
  const colH = h - 58;
  // ستون راست: خرید
  ctx.textAlign = 'center';
  ctx.fillStyle = '#34d399';
  ctx.font = `18px ${FONT_FAMILY}`;
  ctx.fillText('خرید', midX + w / 4, colTop + 30);
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 28px ${FONT_FAMILY}`;
  ctx.fillText(fmt(buyVal), midX + w / 4, colTop + 68);

  // ستون چپ: فروش
  ctx.fillStyle = '#fb7185';
  ctx.font = `18px ${FONT_FAMILY}`;
  ctx.fillText('فروش', midX - w / 4, colTop + 30);
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 28px ${FONT_FAMILY}`;
  ctx.fillText(fmt(sellVal), midX - w / 4, colTop + 68);
}

// pairs: آرایه‌ای از {label, buy, sell} — دقیقاً همان اعدادی که buildLivePriceText هم استفاده می‌کند
function renderLivePriceCard(pairs) {
  if (!ensureFont()) {
    throw new Error('فایل فونت Vazirmatn/Vazir در assets/fonts پیدا نشد');
  }

  const W = 900;
  const cardH = 150;
  const gap = 24;
  const headerH = 140;
  const footerH = 30;
  const H = headerH + pairs.length * cardH + (pairs.length - 1) * gap + footerH;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // پس‌زمینه
  ctx.fillStyle = '#10131c';
  ctx.fillRect(0, 0, W, H);

  // هدر
  ctx.fillStyle = '#8b7cff';
  ctx.font = `bold 40px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('Vochino', W / 2, 60);

  ctx.fillStyle = '#9aa0b4';
  ctx.font = `20px ${FONT_FAMILY}`;
  ctx.fillText('💱 لیست قیمت لحظه‌ای', W / 2, 96);

  let y = headerH;
  for (const p of pairs) {
    drawCard(ctx, 40, y, W - 80, cardH, p.label, p.buy, p.sell);
    y += cardH + gap;
  }

  return canvas.toBuffer('image/png');
}

module.exports = { renderLivePriceCard };
