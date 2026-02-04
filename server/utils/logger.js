const debugMode = process.env.DEBUG_AI === 'true';

const Logger = {
  info: (context, msg, meta = {}) => {
    // Only print meta if it has keys
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
    console.log(`[INFO] [${context}] ${msg} ${metaStr}`);
  },
  error: (context, msg, err) => {
    console.error(`[ERROR] [${context}] ${msg}`, err);
    if (err && err.stack && debugMode) console.error(err.stack);
  },
  warn: (context, msg) => console.warn(`[WARN] [${context}] ${msg}`),

  // Special logger for AI payloads
  debugAI: (context, label, data) => {
    if (debugMode) {
      console.log(`\n🔍 [DEBUG-AI] [${context}] --- ${label} ---`);
      console.dir(data, { depth: null, colors: true });
      console.log(`------------------------------------------\n`);
    }
  }
};

module.exports = { Logger };
