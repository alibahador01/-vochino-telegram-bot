// tests/run.js
// اجراکننده‌ی حداقلی تست، بدون هیچ وابستگی جدید (پروژه از قبل هیچ فریم‌ورک تستی نصب نداشت و طبق
// قاعده‌ی پروژه از نصب وابستگی غیرضروری خودداری شده). اجرا: node tests/run.js
const fs = require('fs');
const path = require('path');

const testFiles = fs.readdirSync(__dirname).filter((f) => f.endsWith('.test.js')).sort();

let pass = 0;
let fail = 0;
const failures = [];

function t(name, fn) {
  try {
    fn();
    pass += 1;
    console.log('  ✅ ' + name);
  } catch (e) {
    fail += 1;
    failures.push({ name, error: e });
    console.log('  ❌ ' + name);
    console.log('     ' + e.message);
  }
}

for (const file of testFiles) {
  console.log('\n📄 ' + file);
  const run = require(path.join(__dirname, file));
  run(t);
}

console.log('\n' + '─'.repeat(40));
console.log(`نتیجه: ${pass} موفق، ${fail} ناموفق (از مجموع ${pass + fail})`);
if (fail > 0) {
  console.log('\nموارد ناموفق:');
  for (const f of failures) console.log(' - ' + f.name + ': ' + f.error.message);
  process.exitCode = 1;
}
