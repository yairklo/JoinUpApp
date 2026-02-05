const OpenAI = require("openai");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Redis = require("ioredis");
const { LRUCache } = require('lru-cache');
const crypto = require('crypto');
const { Logger } = require('../utils/logger'); // Import Logger

/**
 * CONFIGURATION & CONSTANTS
 */
const THRESHOLDS = {
    TEEN: {
        "harassment": { block: 0.80, flag: 0.40 },
        "hate": { block: 0.60, flag: 0.25 },
        "self-harm": { block: 0.40, flag: 0.10 },
        "sexual": { block: 0.60, flag: 0.20 },
        "sexual/minors": { block: 0.50, flag: 0.05 }, // Flag early (0.05), Block only if sure (0.50)
        "violence": { block: 0.80, flag: 0.40 }
    },
    ADULT: {
        "harassment": { block: 0.95, flag: 0.85 },
        "hate": { block: 0.90, flag: 0.80 },
        "self-harm": { block: 0.80, flag: 0.30 },
        "sexual": { block: 0.95, flag: 0.90 },
        "sexual/minors": { block: 0.70, flag: 0.05 }, // Always strictly flagged
        "violence": { block: 0.95, flag: 0.85 }
    }
};

// Default fallback (conservative)
const DEFAULT_THRESHOLDS = THRESHOLDS.TEEN;

// Range for "Review Only" (Flag but don't block)
const REVIEW_RANGES = {
    ADULT: { min: 0.50, max: 0.90 }
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
                model: "gemini-2.5-flash",
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
            newVal = Math.max(0.15, Math.min(0.95, newVal));
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

        // SELECT CONFIG BASED ON AGE
        const senderAge = userAge || 21;
        const receiverAge = options.receiverAge || 21;
        const isAdultChat = senderAge >= 18 && receiverAge >= 18;

        const baseConfig = isAdultChat ? THRESHOLDS.ADULT : THRESHOLDS.TEEN;
        const activeConfig = this._getDynamicConfig({ ...baseConfig, ...userConfig }, reputation);

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
            const demographics = { age: userAge, gender: userGender, receiverAge: options.receiverAge };

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
            // Config structure is now { block: X, flag: Y }
            let limits = config[cat] || (cat.includes('/') ? config[cat.split('/')[0]] : undefined);

            if (limits) {
                // Check BLOCK
                if (limits.block && score > limits.block) {
                    triggers.push(`[BLOCK] ${cat} (${score.toFixed(3)} > ${limits.block})`);
                }
                // Check FLAG
                else if (limits.flag && score > limits.flag) {
                    triggers.push(`[FLAG] ${cat} (${score.toFixed(3)} > ${limits.flag})`);
                }
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
        // Logic to determine safety tier
        const senderAge = demographics.age || 21; // Default to Adult (Fix 4)
        const receiverAge = demographics.receiverAge || 21; // Assume adult if unknown
        const isSenderMinor = senderAge < 18;
        const isReceiverMinor = receiverAge < 18;

        let safetyTier = "STANDARD";
        let systemInstruction = "";

        if (!isSenderMinor && !isReceiverMinor) {
            // SCENARIO 1: Adult to Adult
            safetyTier = "LOOSE";
            systemInstruction = `
            MODE: ADULT_PRIVATE_CHAT.
            1. ALLOW: Profanity, cursing, sexual humor, and coarse language. This is a private chat between adults.
            2. BLOCK ONLY: actionable threats, severe sexual harassment (non-consensual), or encouragement of self-harm.
            3. SLANG: Hebrew slang like "פיפי" (Pee) means "funny", NOT bodily fluids. "זונה" (Bitch) can be friendly banter. Context is king.
            `;
        } else if (!isSenderMinor && isReceiverMinor) {
            // SCENARIO 2: Adult to Minor (STRICTEST)
            safetyTier = "STRICT_PROTECTION";
            systemInstruction = `
            MODE: ADULT_TALKING_TO_MINOR.
            1. ZERO TOLERANCE (BLOCK): Grooming, sexual innuendo, asking for photos, meeting requests, or manipulation.
            2. BLOCK: Severe hostility, threats, or bullying from the adult.
            3. ALLOW WITH FLAG: Casual Hebrew slang and mild profanity (e.g., "איזה זין", "חרא", "לעזאזל") - mark as reviewNeeded: true but isSafe: true.
            4. ALLOW: Normal game coordination, mild frustration, casual conversation.
            
            IMPORTANT: Distinguish between harmful sexual content (BLOCK) and casual slang expressions (ALLOW but FLAG for review).
            `;
        } else {
            // SCENARIO 3: Minor to Minor / Public Game
            safetyTier = "TEEN_GAMER";
            systemInstruction = `
            MODE: TEEN_GAMING_CHAT.
            1. ALLOW: Casual swearing ("shit", "fuck", "damn"), gaming trash-talk, and slang.
            2. IGNORE: Words like "פיפי" (funny), "הומו" (often used as slang, flag only if malicious bullying).
            3. BLOCK: Sexual solicitation, severe bullying/boycotting (חרם), suicide threats, doxxing.
            4. DISTINCTION: "You suck at this game" is SAFE. "Go kill yourself" is UNSAFE.
            `;
        }

        Logger.info("ContentModerator", `Detected Chat Mode: ${safetyTier} (SenderAge: ${senderAge}, ReceiverAge: ${receiverAge}, DefaultUsed: ${!demographics.age})`);

        const policy = Object.entries(config).map(([k, v]) => `- ${k}: ${v}`).join("\n");
        let userProfile = `Reputation: ${userScore}/100. Age: ${senderAge}.`;

        // Model Fallback Chain (fastest → most reliable)
        const modelChain = [
            'gemini-2.5-flash',           // Primary: Fast but quota-limited
            'gemini-2.0-flash-001',       // Fallback 1: Stable 2.0 version
            'gemini-2.0-flash-lite-001',  // Fallback 2: Lighter, separate quota
            'gemini-flash-lite-latest',   // Fallback 3: Latest lite version
            'gemini-flash-latest'         // Fallback 4: Latest stable (last resort)
        ];

        let lastError = null;
        for (const modelName of modelChain) {
            try {
                const model = this.gemini.getGenerativeModel({ model: modelName });
                const fullSystemInstruction = `
                Role: Context-Aware Safety Moderator.
                Current Mode: ${safetyTier}
                Triggers Detected: [${triggers.join(", ")}]
                Task: Return JSON { "isSafe": boolean, "reason": "short string" }.
                If safe, set isSafe: true.
                If unsafe, specify if it's "HARASSMENT", "GROOMING", "THREAT", or "SELF_HARM".
                ${systemInstruction}
                
                # Policy
                ${policy}
                
                # User
                ${userProfile}
                
                # Context (PII Scrubbed)
                ${context}
                `;

                Logger.debugAI('Gemini', 'Full Prompt Context', { model: modelName, systemInstruction: fullSystemInstruction, message });

                const result = await model.generateContent({
                    contents: [{ role: "user", parts: [{ text: message }] }],
                    systemInstruction: fullSystemInstruction,
                    generationConfig: { temperature: 0.3, responseMimeType: "application/json" }
                });

                const raw = result.response.text();
                Logger.debugAI('Gemini', 'Raw Output', raw);

                const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
                const verdict = { isSafe: !!parsed.isSafe, reason: parsed.reason || "N/A", source: "gemini_decision" };
                Logger.info("ContentModerator", `Gemini Verdict (${modelName})`, verdict);
                return verdict;
            } catch (error) {
                lastError = error;

                // Check if it's a quota error (429)
                if (error.status === 429) {
                    Logger.warn("ContentModerator", `Model ${modelName} quota exceeded, trying next model...`);

                    // Extract retryDelay from Google's API response
                    let retryDelay = null;
                    try {
                        const retryInfo = error.errorDetails?.find(detail => detail['@type'] === 'type.googleapis.com/google.rpc.RetryInfo');
                        if (retryInfo?.retryDelay) {
                            // Parse "48s" -> 48 seconds
                            const match = retryInfo.retryDelay.match(/(\d+)s/);
                            if (match) {
                                retryDelay = parseInt(match[1], 10);
                            }
                        }
                    } catch (parseError) {
                        Logger.warn("ContentModerator", "Failed to parse retryDelay:", parseError);
                    }

                    // Store for potential use if all models fail
                    if (retryDelay) {
                        lastError.parsedRetryDelay = retryDelay;
                    }

                    continue; // Try next model
                }

                // For other errors, break the loop and fail open
                Logger.error("ContentModerator", `Model ${modelName} failed with non-quota error:`, error.message);
                break;
            }
        }

        // All models failed - Fail Open
        Logger.error("ContentModerator", "Gemini Generation/Parse Error", lastError);
        return {
            isSafe: true,
            reviewNeeded: true,
            source: "fail_open_gemini",
            retryDelay: lastError?.parsedRetryDelay || null
        };
    }
}

module.exports = { ContentModerator };
