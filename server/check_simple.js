require('dotenv').config();
const Redis = require("ioredis");
const fs = require('fs');

async function check() {
    try {
        const redis = new Redis(process.env.REDIS_URL);
        redis.on('error', (err) => {
            try { fs.appendFileSync('simple_result.txt', 'Redis Error: ' + err.message + '\n'); } catch (e) { }
        });

        await redis.set('simple_test', 'ok');
        const val = await redis.get('simple_test');
        try { fs.appendFileSync('simple_result.txt', 'Simple Check Result: ' + val + '\n'); } catch (e) { }
        await redis.quit();
    } catch (e) {
        try { fs.appendFileSync('simple_result.txt', 'Simple Check Failed: ' + e.message + '\n'); } catch (e) { }
        process.exit(1);
    }
}
check();
