/**
 * Render start entrypoint — run migrations, then boot the server.
 * Logs migration failures clearly instead of failing silently with a 502.
 */
const { execSync } = require('child_process');

console.log('[BOOT] JoinUp server starting…');
console.log('[BOOT] PORT=%s NODE_ENV=%s', process.env.PORT || '(unset)', process.env.NODE_ENV || '(unset)');

try {
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: process.env });
  console.log('[BOOT] Prisma migrations OK');
} catch (err) {
  // A failed migration leaves Render showing 502 because node never starts.
  // Log loudly, then still attempt boot so an already-migrated DB can recover.
  console.error('[BOOT] prisma migrate deploy FAILED:', err.message || err);
  console.error('[BOOT] Attempting to start server anyway (DB may already be migrated)…');
}

require('../index.js');
