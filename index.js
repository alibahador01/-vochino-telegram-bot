const http = require('http');
const https = require('https');
const { EventEmitter } = require('events');

class AntiSleepBot extends EventEmitter {
    constructor(appUrl = 'https://your-app.onrender.com') {
        super();
        this.appUrl = appUrl;
        this.systemAlive = true;
        this.wakeCount = 0;
        this.lastActivity = new Map();
        this.healthStatus = new Map();
        
        this.mainTimers = [30, 60, 120, 200];
        this.backupTimers = [50, 100, 160, 300];
        this.emergencyTimers = [15, 45, 90, 150];
        this.ultraTimers = [5, 10, 25, 40];
        
        console.log('🛡️ Anti-Sleep Bot آماده نبرد با Render!');
    }

    startUnstoppableHeart() {
        console.log('❤️ قلب تپنده ضد خواب فعال شد');
        
        const heartbeat = () => {
            if (!this.systemAlive) return;
            
            try {
                this.internalActivity();
                this.pingMyself();
                this.generateFakeActivity();
                
                const randomDelay = Math.random() * 2000 + 500;
                setTimeout(heartbeat, randomDelay);
                
            } catch (error) {
                console.log('قلب تپنده لرزید ولی نمیمیره:', error.message);
                setTimeout(heartbeat, 100);
            }
        };
        
        heartbeat();
    }

    internalActivity() {
        this.wakeCount++;
        this.emit('activity', { count: this.wakeCount, time: new Date() });
        
        const tempArray = Array.from({ length: 100 }, () => Math.random());
        const sum = tempArray.reduce((a, b) => a + b, 0);
        
        const fs = require('fs');
        try {
            fs.appendFileSync('keep_alive.log', `❤️ Alive at ${new Date().toISOString()}\n`);
        } catch (e) {}
    }

    pingMyself() {
        const endpoints = ['/', '/health', '/ping', '/api/status', '/keep-alive'];
        const randomEndpoints = endpoints.sort(() => Math.random() - 0.5).slice(0, 3);
        
        randomEndpoints.forEach(endpoint => {
            const url = new URL(endpoint, this.appUrl);
            const requester = url.protocol === 'https:' ? https : http;
            
            const options = {
                hostname: url.hostname,
                port: url.port,
                path: url.pathname,
                method: 'GET',
                headers: {
                    'User-Agent': this.getRandomUserAgent(),
                    'X-Forwarded-For': this.getRandomIP(),
                    'X-Real-IP': this.getRandomIP(),
                    'Cache-Control': 'no-cache',
                },
                timeout: 3000
            };
            
            const req = requester.request(options, (res) => {
                console.log(`🎯 پینگ به ${endpoint}: ${res.statusCode}`);
                res.resume();
            });
            
            req.on('error', (err) => {
                console.log(`پینگ موقتاً ناموفق: ${err.message}`);
            });
            
            req.end();
        });
    }

    generateFakeActivity() {
        const url = new URL(this.appUrl);
        
        for (let i = 0; i < 3; i++) {
            const requester = url.protocol === 'https:' ? https : http;
            const req = requester.request({
                hostname: url.hostname,
                port: url.port,
                path: '/health',
                method: 'HEAD',
                timeout: 2000
            }, (res) => {
                res.resume();
            });
            
            req.on('error', () => {});
            req.end();
        }
    }

    startGuardianOfWakefulness() {
        console.log('👁️ نگهبان بیداری شروع به کار کرد');
        let lastCheck = Date.now();
        
        const guardian = () => {
            if (!this.systemAlive) return;
            
            const now = Date.now();
            const diff = (now - lastCheck) / 1000;
            
            if (diff > 5) {
                console.log(`🚨 هشدار: ${diff.toFixed(1)} ثانیه عدم فعالیت!`);
                this.emergencyWakeUp();
            } else if (diff > 2) {
                console.log('⚠️ فعالیت کم - تکون تکون!');
                this.shakeThingsUp();
            }
            
            lastCheck = now;
            setTimeout(guardian, 500);
        };
        
        guardian();
    }

    shakeThingsUp() {
        console.log('🔄 تکون تکون!');
        this.internalActivity();
        this.pingMyself();
        this.danceForRender();
    }

    emergencyWakeUp() {
        console.log('🚨🚨🚨 بیدارباش اضطراری!!!');
        
        for (let i = 0; i < 10; i++) {
            this.pingMyself();
        }
        
        for (let i = 0; i < 5; i++) {
            this.heavyComputation();
        }
        
        for (let i = 0; i < 3; i++) {
            this.danceForRender();
        }
        
        this.nuclearOption();
    }

    nuclearOption() {
        console.log('💣 فعال‌سازی گزینه هسته‌ای!');
        
        for (let i = 0; i < 50; i++) {
            const url = new URL('/wake-up', this.appUrl);
            const requester = url.protocol === 'https:' ? https : http;
            
            const req = requester.request({
                hostname: url.hostname,
                port: url.port,
                path: url.pathname,
                method: 'GET',
                timeout: 1000
            }, (res) => res.resume());
            
            req.on('error', () => {});
            req.end();
            
            const start = Date.now();
            while (Date.now() - start < 50) {}
        }
    }

    heavyComputation() {
        const largeArray = Array.from({ length: 10000 }, (_, i) => i * i);
        return largeArray.filter(x => x % 2 === 0).length;
    }

    danceForRender() {
        const dances = ['💃', '🕺', '🪩', '🎵', '🎸', '🥁', '🔥', '⚡'];
        const dance = dances[Math.floor(Math.random() * dances.length)];
        console.log(`رقص برای Render: ${dance}`);
    }

    startMultiLayerDefense() {
        console.log('🛡️ سیستم دفاع چندلایه فعال شد');
        
        const layers = [
            { name: 'برنزی', timers: this.mainTimers },
            { name: 'نقره‌ای', timers: this.backupTimers },
            { name: 'طلایی', timers: this.emergencyTimers },
            { name: 'الماس', timers: this.ultraTimers }
        ];
        
        layers.forEach(layer => {
            layer.timers.forEach(interval => {
                this.createLayerGuardian(layer.name, interval);
            });
        });
    }

    createLayerGuardian(layerName, intervalSeconds) {
        const taskName = `${layerName}_${intervalSeconds}s`;
        console.log(`🔰 ${taskName} فعال شد`);
        
        const guardian = () => {
            if (!this.systemAlive) return;
            
            try {
                console.log(`💚 ${taskName}: بیدارم!`);
                this.lastActivity.set(taskName, new Date());
                this.healthStatus.set(taskName, 'healthy');
                
                this.internalActivity();
                this.pingMyself();
                
                setTimeout(guardian, intervalSeconds * 1000);
                
            } catch (error) {
                console.log(`${taskName} لرزید:`, error.message);
                this.healthStatus.set(taskName, 'error');
                setTimeout(guardian, 1000);
            }
        };
        
        setTimeout(guardian, Math.random() * intervalSeconds * 1000);
    }

    startChaosMonkey() {
        console.log('🐒 میمون آشوب وارد عمل شد!');
        
        const chaoticActions = [
            () => this.danceForRender(),
            () => this.internalActivity(),
            () => this.pingMyself(),
            () => this.heavyComputation(),
            () => this.generateFakeActivity(),
            () => this.shakeThingsUp()
        ];
        
        const monkey = () => {
            if (!this.systemAlive) return;
            
            const action = chaoticActions[Math.floor(Math.random() * chaoticActions.length)];
            action();
            
            const randomDelay = Math.random() * 7000 + 100;
            setTimeout(monkey, randomDelay);
        };
        
        monkey();
    }

    startHealthMonitor() {
        console.log('📊 مانیتور سلامت فعال شد');
        
        const monitor = () => {
            if (!this.systemAlive) return;
            
            console.log('\n' + '='.repeat(50));
            console.log('📊 وضعیت سلامت سیستم:');
            console.log('='.repeat(50));
            
            this.healthStatus.forEach((status, taskName) => {
                const lastAct = this.lastActivity.get(taskName);
                const timeAgo = lastAct ? (Date.now() - lastAct.getTime()) / 1000 : 'N/A';
                console.log(`• ${taskName}: ${status} (${timeAgo} ثانیه پیش)`);
            });
            
            console.log('='.repeat(50) + '\n');
            
            setTimeout(monitor, 10000);
        };
        
        setTimeout(monitor, 5000);
    }

    getRandomUserAgent() {
        const agents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
            'Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
        ];
        return agents[Math.floor(Math.random() * agents.length)];
    }

    getRandomIP() {
        return `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
    }

    startAll() {
        console.log(`
        🌟 ========================================
        🤖 ربات ضدخواب مطلق - نسخه Node.js
        🛡️ حتی Render هم نمی‌تونه بخوابونتش!
        💪 استراتژی: حمله از همه جبهه‌ها
        🐒 آشوب کنترل‌شده برای فریب پلتفرم
        ========================================
        `);
        
        this.startUnstoppableHeart();
        this.startGuardianOfWakefulness();
        this.startMultiLayerDefense();
        this.startChaosMonkey();
        this.startHealthMonitor();
        
        console.log('✅ تمام سیستم‌های ضد خواب فعال شدند!');
    }

    stop() {
        console.log('🛑 خاموش شدن سیستم ضد خواب...');
        this.systemAlive = false;
    }
}

module.exports = AntiSleepBot;
