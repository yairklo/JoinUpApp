/**
 * Render start entrypoint — run migrations, then boot the server.
 * A failed migration stops the boot: running new code against a schema it doesn't
 * match can corrupt data. (The Dockerfile CMD already stops on failure via `&&`.)
 * Emergency override: ALLOW_START_ON_MIGRATION_FAILURE=true.
 */
const { execSync } = require('child_process');

console.log('[BOOT] JoinUp server starting…');
console.log('[BOOT] PORT=%s NODE_ENV=%s', process.env.PORT || '(unset)', process.env.NODE_ENV || '(unset)');

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
