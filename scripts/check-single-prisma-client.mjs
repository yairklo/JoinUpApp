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

const SOURCE_EXT = new Set(['.js', '.mjs', '.cjs']);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (SOURCE_EXT.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

// Coarse strip of // line comments and /* */ block comments — good enough for a guard script,
// not a full JS parser. Does not try to avoid stripping "//" that appears inside a string
// literal (e.g. a URL) — over-stripping only produces false negatives here, which is the
// acceptable direction of error for a guard rail (miss a rare edge case rather than block a
// commit over documentation text). Without this, a line like a code comment reading
// "// don't do: new PrismaClient()" would itself trip the check (this has already nearly
// happened — see server/docs/agents/database_rules.md, which uses that exact phrase in prose,
// only spared because it's a .md file the walk doesn't scan).
function stripComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const violations = [];
for (const file of walk(serverRoot)) {
  if (isAllowed(file)) continue;
  const content = stripComments(fs.readFileSync(file, 'utf8'));
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
