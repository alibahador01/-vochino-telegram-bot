// AntiSleepBot.js
const http = require('http');
const https = require('https');
const { EventEmitter } = require('events');

class AntiSleepBot extends EventEmitter {
    constructor(appUrl = 'https://your-app.onrender.com') {
        super();
        this.appUrl = appUrl;
        this.systemAlive = true;
        this.wakeCount = 0;
        this.lastActivity = null;
        this.intervalMs = 4 * 60 * 1000; // هر ۴ دقیقه یک بار کافیه
        console.log('🛡️ Anti-Sleep Bot آماده (نسخه سبک)');
    }

    pingMyself() {
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
                this.wakeCount++;
                this.lastActivity = new Date();
                console.log(`🎯 پینگ سلامت: ${res.statusCode}`);
                res.resume();
            });
            req.on('error', (err) => console.log(`پینگ ناموفق: ${err.message}`));
            req.on('timeout', () => req.destroy());
            req.end();
        } catch (e) {}
    }

    startAll() {
        console.log('✅ Anti-Sleep فعال شد (یک تایمر، هر ۲ دقیقه)');
        const tick = () => {
            if (!this.systemAlive) return;
            this.pingMyself();
            setTimeout(tick, this.intervalMs);
        };
        setTimeout(tick, 10000); // اولین پینگ ۱۵ ثانیه بعد از بوت
    }

    stop() {
        console.log('🛑 خاموش شدن Anti-Sleep...');
        this.systemAlive = false;
    }
}

module.exports = AntiSleepBot;
