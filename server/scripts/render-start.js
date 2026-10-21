/**
 * Render start entrypoint — run migrations, then boot the server.
 * A failed migration stops the boot: running new code against a schema it doesn't
 * match can corrupt data. (The Dockerfile CMD already stops on failure via `&&`.)
 * Emergency override: ALLOW_START_ON_MIGRATION_FAILURE=true.
 */
const { execSync } = require('child_process');

console.log('[BOOT] JoinUp server starting…');
console.log('[BOOT] PORT=%s NODE_ENV=%s', process.env.PORT || '(unset)', process.env.NODE_ENV || '(unset)');

// Playwright starts this process with JOINUP_SKIP_DOTENV=1 and the database
// URLs already in the environment. Prisma's own CLI still reads server/.env
// but does not override variables that are already set. Refuse to migrate if
// the URLs are missing, so that file cannot become the source.
const skipDotenv = process.env.JOINUP_SKIP_DOTENV === '1' || process.env.JOINUP_SKIP_DOTENV === 'true';
if (skipDotenv) {
  const hasDatabaseUrl = String(process.env.DATABASE_URL || '').trim();
  const hasDirectUrl = String(process.env.DIRECT_DATABASE_URL || '').trim();
  if (!hasDatabaseUrl || !hasDirectUrl) {
    console.error('[BOOT] JOINUP_SKIP_DOTENV is set but DATABASE_URL and DIRECT_DATABASE_URL must already be in the environment. Refusing to load server/.env.');
    process.exit(1);
  }
  console.log('[BOOT] JOINUP_SKIP_DOTENV=1 (database URLs taken from the process environment)');
}

try {
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: process.env });
  console.log('[BOOT] Prisma migrations OK');
} catch (err) {
  console.error('[BOOT] prisma migrate deploy FAILED:', err.message || err);
  if (process.env.ALLOW_START_ON_MIGRATION_FAILURE !== 'true') {
    console.error('[BOOT] Refusing to start. Fix the migration, or set ALLOW_START_ON_MIGRATION_FAILURE=true to override.');
    process.exit(1);
  }
  console.error('[BOOT] ALLOW_START_ON_MIGRATION_FAILURE=true — starting anyway.');
}

require('../index.js');
