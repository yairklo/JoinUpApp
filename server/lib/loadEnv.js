/**
 * Load server/.env unless this process was given its environment explicitly.
 *
 * Playwright sets JOINUP_SKIP_DOTENV=1 and passes DATABASE_URL /
 * DIRECT_DATABASE_URL itself. dotenv must not fill the gaps from server/.env,
 * which on a developer machine may point at production.
 * dotenv.config() is a no-op for variables already set, so a second call from
 * index.js after prisma.js is harmless when the flag is off.
 */
function loadEnv() {
  if (process.env.JOINUP_SKIP_DOTENV === '1' || process.env.JOINUP_SKIP_DOTENV === 'true') {
    return;
  }
  require('dotenv').config();
}

module.exports = { loadEnv };
