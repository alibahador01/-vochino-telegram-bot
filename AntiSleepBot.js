// AntiSleepBot.js
// ضد خواب دو لایه: رباب کتی💃 (لایه اصلی) + علی دیوانه🕺 (لایه پشتیبان)
const http = require('http');
const https = require('https');

class AntiSleepBot {
    constructor(appUrl = 'https://your-app.onrender.com') {
        this.appUrl = appUrl;
        this.lastPingAt = Date.now();
        this.primaryIntervalMs = 5 * 60 * 1000;   // رباب کتی: هر ۵ دقیقه
        this.watchdogCheckMs = 60 * 1000;         // علی دیوانه: هر ۱ دقیقه فقط چک می‌کند
        this.overdueMs = 6 * 60 * 1000;           // اگر بیش از ۶ دقیقه از آخرین پینگ گذشت، دیر مانده حساب می‌شود
        this.alive = true;
    }

    ping(who) {
        try {
            const url = new URL('/health', this.appUrl);
            const requester = url.protocol === 'https:' ? https : http;
            const req = requester.request({
                hostname: url.hostname,
                port: url.port,
                path: url.pathname,
                method: 'GET',
                timeout: 5000
            }, (res) => {
                this.lastPingAt = Date.now();
                console.log(`💃🕺 ${who} بیدارم! (${res.statusCode})`);
                res.resume();
            });
            req.on('error', (err) => console.log(`⚠️ ${who} پینگ ناموفق: ${err.message}`));
            req.on('timeout', () => req.destroy());
            req.end();
        } catch (e) {}
    }

    // لایه اول - رباب کتی💃: هر ۵ دقیقه یک‌بار وارد می‌شود
    startPrimary() {
        const tick = () => {
            if (!this.alive) return;
            this.ping('رباب کتی💃');
            setTimeout(tick, this.primaryIntervalMs);
        };
        setTimeout(tick, 10000);
    }

    // لایه دوم - علی دیوانه🕺: فقط چک می‌کند، تا وقتی رباب کتی سر وقت باشد کاری نمی‌کند
    startWatchdog() {
        const check = () => {
            if (!this.alive) return;
            const overdue = Date.now() - this.lastPingAt > this.overdueMs;
            if (overdue) {
                console.log('🕺 رباب کتی دیر کرد، علی دیوانه وارد صحنه شد!');
                this.ping('علی دیوانه🕺');
            }
            setTimeout(check, this.watchdogCheckMs);
        };
        setTimeout(check, this.watchdogCheckMs);
    }

    startAll() {
        console.log('✅ ضد خواب دو لایه فعال شد (رباب کتی💃 + علی دیوانه🕺)');
        this.startPrimary();
        this.startWatchdog();
    }

    stop() {
        this.alive = false;
    }
}

module.exports = AntiSleepBot;
