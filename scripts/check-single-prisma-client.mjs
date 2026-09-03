#!/usr/bin/env node
// Fails if `new PrismaClient()` appears anywhere under server/ outside the shared singleton
// (server/lib/prisma.js) or a recognized one-off CLI/seed script. server-invariants.mdc's rule
// ("one client per process — never in a request handler, a loop, or a worker tick") isn't
// something Jest can regression-test the way behavior can; this is the static-check equivalent.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverRoot = path.join(repoRoot, 'server');

// The canonical singleton itself, plus short-lived CLI/seed scripts that intentionally create
// their own client outside the request lifecycle (documented exception, see prisma-db.mdc).
const ALLOWED_FILES = new Set(
  [
    'lib/prisma.js',
    'check.js',
    'check_notification_settings.js',
    'cleanup.js',
    'script.js',
  ].map((p) => path.join(serverRoot, p))
);
const ALLOWED_DIRS = [path.join(serverRoot, 'scripts'), path.join(serverRoot, 'prisma')];

function isAllowed(filePath) {
  if (ALLOWED_FILES.has(filePath)) return true;
  return ALLOWED_DIRS.some((dir) => filePath.startsWith(dir + path.sep));
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

const violations = [];
for (const file of walk(serverRoot)) {
  if (isAllowed(file)) continue;
  const content = fs.readFileSync(file, 'utf8');
  if (/new\s+PrismaClient\s*\(/.test(content)) {
    violations.push(path.relative(repoRoot, file));
  }
}

if (violations.length) {
  console.error('✗ new PrismaClient() found outside the shared singleton:');
  for (const v of violations) console.error(`  - ${v}`);
  console.error(
    '  Import { prisma } from server/lib/prisma.js instead (server-invariants.mdc: one client per process).'
  );
  process.exit(1);
}

console.log('✔ No stray PrismaClient instances — one client per process, as required.');
