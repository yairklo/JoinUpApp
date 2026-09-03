#!/usr/bin/env node
// Fails (or warns, with --warn-only) if any .cursor/rules/*.mdc file with `alwaysApply: true`
// exceeds its token budget. These files load on every single task regardless of relevance, so
// unlike a glob-scoped .mdc, their cost can't be avoided by working on an unrelated file — the
// only lever is keeping them small. Run this after editing any .mdc frontmatter or content.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encode } from 'gpt-tokenizer';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rulesDir = path.join(repoRoot, '.cursor', 'rules');
const warnOnly = process.argv.includes('--warn-only');

// Deliberately tight: this should only ever hold rules that apply before a file is even chosen
// (e.g. worktree isolation). Anything glob-scopable belongs in its own non-alwaysApply file.
const ALWAYS_APPLY_BUDGET = 600;

if (!fs.existsSync(rulesDir)) {
  console.log('No .cursor/rules directory — nothing to check.');
  process.exit(0);
}

let failed = false;

for (const file of fs.readdirSync(rulesDir)) {
  if (!file.endsWith('.mdc')) continue;
  const filePath = path.join(rulesDir, file);
  const content = fs.readFileSync(filePath, 'utf8');

  const isAlwaysApply = /^alwaysApply:\s*true\s*$/m.test(content.split('---')[1] || '');
  if (!isAlwaysApply) continue;

  const tokenCount = encode(content).length;
  if (tokenCount > ALWAYS_APPLY_BUDGET) {
    failed = true;
    const message =
      `${file} is alwaysApply:true and ${tokenCount} tokens, over the ${ALWAYS_APPLY_BUDGET}-token ` +
      `budget. Split the least-universal section into its own glob-scoped .mdc rather than raising ` +
      `this budget — see the maintenance note at the top of the file.`;
    if (warnOnly) console.warn(`⚠ ${message}`);
    else console.error(`✗ ${message}`);
  } else {
    console.log(`✔ ${file}: ${tokenCount}/${ALWAYS_APPLY_BUDGET} tokens (alwaysApply)`);
  }
}

if (failed && !warnOnly) process.exit(1);
