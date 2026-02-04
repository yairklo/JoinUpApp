const OpenAI = require("openai");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Redis = require("ioredis");
const { LRUCache } = require('lru-cache');
const crypto = require('crypto');
const { Logger } = require('../utils/logger'); // Import Logger

/**
 * CONFIGURATION & CONSTANTS
 */
const DEFAULT_THRESHOLDS = {
    "harassment": 0.2,
    "hate": 0.1,
    "self-harm": 0.05,
    "sexual": 0.1,
    "violence": 0.5
};

const REPUTATION = {
    STARTING_SCORE: 50,
    MAX_SCORE: 100,
    MIN_SCORE: 0,
    REWARD_SAFE_MSG: 1,
    PENALTY_FLAGGED: -5,
    PENALTY_UNSAFE: -20,
    TRUSTED_THRESHOLD: 80,
    SUSPICIOUS_THRESHOLD: 30,
    MIN_LEN_FOR_REWARD: 10
};

/**
 * INFRASTRUCTURE LAYER
 */
class SecurityManager {
    constructor(dbDelegate = null) {
        this.useRedis = false;
        this.localCache = new LRUCache({ max: 5000, ttl: 1000 * 60 * 60 * 24 });

        // DB Delegate ensures persistence if Redis fails
        this.dbDelegate = dbDelegate || {
            getScore: async (id) => null,
            incrementScore: async (id, val) => { }
        };

        if (process.env.REDIS_URL) {
            this.redis = new Redis(process.env.REDIS_URL, {
                maxRetriesPerRequest: 1,
                retryStrategy: (times) => Math.min(times * 50, 2000),
                keyPrefix: 'teenchat:' // Keep namespacing
                // TLS options removed
            });

            this.redis.on('error', (err) => {
                if (this.useRedis) Logger.warn("SecurityManager", `Redis error: ${err.message}`);
                this.useRedis = false;
            });

            this.redis.on('connect', () => {
                Logger.info("SecurityManager", "Redis connected successfully (Standard Mode).");
                this.useRedis = true;
            });
        } else {
            Logger.warn("SecurityManager", "No REDIS_URL found. Running in local memory mode.");
        }
    }

    _hash(text) {
        return crypto.createHash('sha256').update(text).digest('hex');
    }

    async getUserReputation(userId) {
        const key = `user_rep:${userId}`;
        let score = null;

        if (this.useRedis) {
            score = await this.redis.get(key);
        }

        if (score === null) {
            score = await this.dbDelegate.getScore(userId);
            if (score !== null && this.useRedis) {
                this.redis.set(key, score, 'EX', 2592000).catch(() => { });
            }
        }

        return score !== null ? parseInt(score, 10) : REPUTATION.STARTING_SCORE;
    }

    async adjustReputation(userId, adjustment) {
        const key = `user_rep:${userId}`;
        Logger.info("SecurityManager", `Adjusting reputation for ${userId}: ${adjustment}`);

        if (this.useRedis) {
            try {
                const script = `
          local current = tonumber(redis.call('get', KEYS[1]) or ARGV[2])
          local new_score = current + tonumber(ARGV[1])
          if new_score > tonumber(ARGV[3]) then new_score = tonumber(ARGV[3]) end
          if new_score < tonumber(ARGV[4]) then new_score = tonumber(ARGV[4]) end
          redis.call('set', KEYS[1], new_score, 'EX', 2592000)
          return new_score
         `;
                this.redis.eval(script, 1, key, adjustment, REPUTATION.STARTING_SCORE, REPUTATION.MAX_SCORE, REPUTATION.MIN_SCORE).catch(() => { });
            } catch (e) { Logger.error("SecurityManager", "Redis update failed", e); }
        }

        this.dbDelegate.incrementScore(userId, adjustment).catch(err => Logger.error("SecurityManager", "DB Atomic Update failed", err));
    }

    async shouldSkipAI(userId, limit) {
        if (!this.useRedis) return false;
        const finalLimit = limit || (process.env.AI_RATE_LIMIT || 20);
        const key = `mod_ratelimit:${userId}`;
        try {
            const current = await this.redis.incr(key);
            if (current === 1) await this.redis.expire(key, 60);
            if (current > finalLimit) {
                Logger.warn("SecurityManager", `Rate limit exceeded for user ${userId} (${current} > ${finalLimit})`);
                return true;
            }
            return false;
        } catch (e) { return false; }
    }

    async getCache(text) {
        const key = this._hash(text);
        try {
            if (this.useRedis) {
                const val = await this.redis.get(`mod_cache:${key}`);
                return val ? JSON.parse(val) : null;
            }
            return this.localCache.get(key);
        } catch (e) { return null; }
    }

    setCache(text, value) {
        const key = this._hash(text);
        try {
            if (this.useRedis) {
                this.redis.set(`mod_cache:${key}`, JSON.stringify(value), 'EX', 86400).catch(() => { });
            } else {
                this.localCache.set(key, value);
            }
        } catch (e) { }
    }
}

/**
 * LOGIC LAYER
 */
class ContentModerator {
    constructor(dbDelegate) {
        this.security = new SecurityManager(dbDelegate);

        const hasOpenAI = !!process.env.OPENAI_API_KEY;
        const hasGemini = !!process.env.GOOGLE_API_KEY;

        Logger.info("ContentModerator", `Initializing services... OpenAI: ${hasOpenAI}, Gemini: ${hasGemini}`);

        try {
            this.openai = hasOpenAI ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
            const genAI = hasGemini ? new GoogleGenerativeAI(process.env.GOOGLE_API_KEY) : null;
            this.gemini = genAI ? genAI.getGenerativeModel({
                model: "gemini-1.5-flash",
                generationConfig: { responseMimeType: "application/json" }
            }) : null;
        } catch (e) { Logger.error("ContentModerator", "Init Error", e); }
    }

    _scrubPII(text) {
        if (!text) return "";
        return text
            .replace(/\b0(5[^7]|[2-4]|[8-9])[- ]?\d{3}[- ]?\d{4}\b/g, "[PHONE]")
            .replace(/(?:\+?\d{1,3}[- ]?)?\(?\d{2,3}\)?[- ]?\d{3}[- ]?\d{4}/g, "[PHONE]")
            .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL]");
    }

    _getDynamicConfig(baseConfig, reputation) {
        if (reputation === 50) return baseConfig;
        const modifier = (reputation - 50) / 100;
        const dynamicConfig = { ...baseConfig };
        for (const key in dynamicConfig) {
            let newVal = dynamicConfig[key] + modifier;
            newVal = Math.max(0.01, Math.min(0.95, newVal));
            dynamicConfig[key] = parseFloat(newVal.toFixed(2));
        }
        return dynamicConfig;
    }

    async checkMessage(currentMessage, chatHistory = [], userConfig = {}, options = {}) {
        const {
            userId = 'anonymous',
            userAge = null,
            userGender = null,
            maxHistoryChars = 2000
        } = options;

        Logger.info("ContentModerator", `Checking message for User: ${userId}`);
        const safeMessage = (currentMessage || "").substring(0, 10000);
        if (!safeMessage) return { isSafe: true };

        const cached = await this.security.getCache(safeMessage);
        if (cached) {
            Logger.info("ContentModerator", "Cache hit (Skipping AI)");
            return { ...cached, source: "cache_hit" };
        }

        const reputation = await this.security.getUserReputation(userId);
        const rateLimit = reputation < REPUTATION.SUSPICIOUS_THRESHOLD ? 5 : 20;

        if (await this.security.shouldSkipAI(userId, rateLimit)) {
            return { isSafe: true, reviewNeeded: true, source: "ratelimit_bypass" };
        }

        if (!this.openai || !this.gemini) {
            Logger.error("ContentModerator", "AI Systems unavailable");
            return { isSafe: true, reviewNeeded: true, source: "system_down" };
        }

        const sanitizedMessage = this._scrubPII(safeMessage);
        const activeConfig = this._getDynamicConfig({ ...DEFAULT_THRESHOLDS, ...userConfig }, reputation);

        try {
            // Layer 1: OpenAI
            Logger.debugAI('OpenAI', 'Request Payload', { input: sanitizedMessage });
            const modResponse = await this.openai.moderations.create({ input: sanitizedMessage });
            Logger.debugAI('OpenAI', 'Raw Response', modResponse.results[0]);

            const triggers = this._getSuspicionTriggers(modResponse.results[0], activeConfig);

            if (triggers.length === 0) {
                if (safeMessage.length >= REPUTATION.MIN_LEN_FOR_REWARD) {
                    this.security.adjustReputation(userId, REPUTATION.REWARD_SAFE_MSG);
                }

                this.security.setCache(safeMessage, { isSafe: true });
                return { isSafe: true, source: "openai_clean" };
            }

            Logger.warn("ContentModerator", `Triggers detected: [${triggers.join(', ')}]. Escalating to Gemini.`);

            // Layer 2: Gemini
            // Removed: this.security.adjustReputation(userId, REPUTATION.PENALTY_FLAGGED); // Fix 3: Double Jeopardy

            const context = this._truncateHistory(chatHistory, maxHistoryChars, 10);
            const demographics = { age: userAge, gender: userGender };

            const result = await this._askGemini(
                sanitizedMessage,
                context,
                triggers,
                activeConfig,
                reputation,
                demographics
            );

            Logger.info("ContentModerator", "Gemini Verdict", result);

            if (!result.isSafe) {
                Logger.info("ContentModerator", "Message deemed unsafe. Applying penalty.");
                // Apply penalty only if confirmed unsafe
                this.security.adjustReputation(userId, REPUTATION.PENALTY_UNSAFE);
                // Technically we could apply the smaller flag penalty here too if we wanted, 
                // but usually the unsafe penalty covers it.
            }

            return result;

        } catch (error) {
            Logger.error("ContentModerator", "Execution Error", error);
            return {
                isSafe: true,
                reviewNeeded: true,
                source: "fail_open_error",
                auditData: { error: error.message }
            };
        }
    }

    _getSuspicionTriggers(modResult, config) {
        const triggers = [];
        if (modResult.flagged) triggers.push("flagged_by_openai");
        for (const [cat, score] of Object.entries(modResult.category_scores)) {
            let limit = config[cat] || (cat.includes('/') ? config[cat.split('/')[0]] : undefined);
            if (limit !== undefined && score > limit) {
                triggers.push(`${cat} (${score.toFixed(3)} > ${limit})`);
            }
        }
        return [...new Set(triggers)];
    }

    _truncateHistory(history, maxChars, maxMsgs) {
        let currentChars = 0;
        const result = [];
        const reversed = [...history].reverse().slice(0, maxMsgs);

        for (const msg of reversed) {
            const cleanContent = this._scrubPII(msg.content);
            const text = `${msg.role}: ${cleanContent}\n`;

            if ((currentChars + text.length) > maxChars) break;
            result.push(text);
            currentChars += text.length;
        }
        return result.reverse().join("");
    }

    async _askGemini(message, context, triggers, config, userScore, demographics) {
        const policy = Object.entries(config).map(([k, v]) => `- ${k}: ${v}`).join("\n");

        let userProfile = `Reputation: ${userScore}/100.`;
        if (demographics.age) userProfile += ` Age: ${demographics.age}.`;
        if (demographics.gender) userProfile += ` Gender: ${demographics.gender}.`;

        let safetyInstruction = "Important: Ignore gaming slang or friendly banter if context allows.";

        if (demographics.age && demographics.age < 15) {
            safetyInstruction += " **HIGH ALERT: User is a minor (<15). Be stricter with grooming, sexual topics, or bullying.**";
        }
        if (userScore < REPUTATION.SUSPICIOUS_THRESHOLD) {
            safetyInstruction += " **WARNING: Low reputation user. Do not give benefit of the doubt.**";
        }

        const prompt = `You are a Safety Moderator for a teen chat app. 
    User Profile: ${userProfile}
    
    Policy (0=Strict, 1=Loose):
    ${policy}
    
    Triggers Detected: [${triggers.join(", ")}]
    
    Context (PII Scrubbed):
    ${context}
    
    Message to Evaluate: "${message}"
    
    Task: Evaluate safety based on policy/profile.
    Instruction: ${safetyInstruction}
    
    Return JSON: { "isSafe": boolean, "reason": "string" }`;

        Logger.debugAI('Gemini', 'Full Prompt Context', prompt);

        try {
            const result = await this.gemini.generateContent(prompt);
            const rawText = result.response.text();
            Logger.debugAI('Gemini', 'Raw Output', rawText);

            const parsed = JSON.parse(rawText.replace(/```json|```/g, "").trim());
            return { ...parsed, source: "gemini_decision" };
        } catch (e) {
            Logger.error("ContentModerator", "Gemini Generation/Parse Error", e);
            return { isSafe: true, reviewNeeded: true, source: "fail_open_gemini" };
        }
    }
}

module.exports = { ContentModerator };
