#!/usr/bin/env node
// Lightweight internal dependency graph: per source file, its exported symbols and its
// internal (relative / workspace-scoped) imports. No function bodies, no external npm deps.
// Deliberately NOT an AST parser (regex-based) — good enough for a topology map, zero new
// heavy dependencies, easy to audit and keep fast on hundreds of files.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_EXT = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx']);
// Prefixes (besides relative ./ ../) treated as internal edges, not external npm packages.
const WORKSPACE_SCOPES = ['@joinup/'];

const outArg = process.argv.find((a) => a.startsWith('--output='));
const outputPath = path.resolve(repoRoot, outArg ? outArg.slice('--output='.length) : '.graph-context.md');

function trackedFiles() {
  return execSync('git ls-files', { cwd: repoRoot, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .filter((f) => SOURCE_EXT.has(path.extname(f)));
}

const EXPORT_PATTERNS = [
  /export\s+(?:default\s+)?(?:async\s+)?function\s*\*?\s+([A-Za-z0-9_$]+)/g,
  /export\s+(?:default\s+)?class\s+([A-Za-z0-9_$]+)/g,
  /export\s+const\s+([A-Za-z0-9_$]+)/g,
  /export\s+let\s+([A-Za-z0-9_$]+)/g,
  /export\s+(?:type|interface)\s+([A-Za-z0-9_$]+)/g,
  /export\s+\{\s*([^}]+)\s*\}/g, // re-export list: capture group split on comma below
  /module\.exports\.([A-Za-z0-9_$]+)\s*=/g,
  /exports\.([A-Za-z0-9_$]+)\s*=/g,
];

const DEFAULT_EXPORT_ONLY = /export\s+default\s+(?!function|class)/;
const IMPORT_PATTERNS = [
  /import\s+(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]/g,
  /require\(\s*['"]([^'"]+)['"]\s*\)/g,
  /import\(\s*['"]([^'"]+)['"]\s*\)/g,
];

function isInternal(spec) {
  return spec.startsWith('.') || spec.startsWith('/') || WORKSPACE_SCOPES.some((p) => spec.startsWith(p));
}

function normalizeImport(fromFile, spec) {
  if (spec.startsWith('.')) {
    const resolved = path.normalize(path.join(path.dirname(fromFile), spec));
    return resolved.split(path.sep).join('/');
  }
  return spec; // workspace-scoped package name, left as-is
}

// module.exports = { a, b: c, ...spread } — the dominant CommonJS export style in server/, and
// not matched by any pattern above (module\.exports\.X = only catches property-assignment form).
// Confirmed this was a real, not hypothetical, gap: server/lib/prisma.js — the single most
// imported module in server/ — has only `module.exports = { prisma };` and no internal imports
// (its requires are all external npm packages), so it was silently invisible in the graph
// entirely (both exports and imports empty -> skipped as a "leaf file"). 28 files in server/ use
// this export style.
const CJS_OBJECT_EXPORT = /module\.exports\s*=\s*\{([^}]*)\}/;

function extractExports(src) {
  const names = new Set();
  for (const re of EXPORT_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) {
      if (m[1].includes(',')) {
        m[1].split(',').forEach((n) => {
          const clean = n.trim().split(/\s+as\s+/).pop().trim();
          if (clean) names.add(clean);
        });
      } else {
        names.add(m[1].trim());
      }
    }
  }
  const cjsObjectExport = CJS_OBJECT_EXPORT.exec(src);
  if (cjsObjectExport) {
    cjsObjectExport[1].split(',').forEach((entry) => {
      const trimmed = entry.trim();
      if (!trimmed || trimmed.startsWith('...')) return; // spread of another object, not itself a name
      // `{ key: value }` exports the key (what importers see), not the value/alias.
      const key = trimmed.split(':')[0].trim();
      if (/^[A-Za-z0-9_$]+$/.test(key)) names.add(key);
    });
  }
  if (DEFAULT_EXPORT_ONLY.test(src)) names.add('default');
  return [...names];
}

function extractImports(fromFile, src) {
  const targets = new Set();
  for (const re of IMPORT_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) {
      if (isInternal(m[1])) targets.add(normalizeImport(fromFile, m[1]));
    }
  }
  return [...targets];
}

const files = trackedFiles();
const lines = [];
for (const file of files) {
  let src;
  try {
    src = fs.readFileSync(path.join(repoRoot, file), 'utf8');
  } catch {
    continue;
  }
  const exportsList = extractExports(src);
  const importsList = extractImports(file, src);
  if (exportsList.length === 0 && importsList.length === 0) continue; // skip leaf/no-edge files
  const parts = [file];
  if (exportsList.length) parts.push(`exports: ${exportsList.join(',')}`);
  if (importsList.length) parts.push(`imports: ${importsList.join(',')}`);
  lines.push(parts.join(' | '));
}

const header = `# Dependency topology (generated, do not edit by hand)\n# ${files.length} source files scanned, ${lines.length} with export/import edges.\n# Format: <path> | exports: <names> | imports: <internal targets>\n\n`;
fs.writeFileSync(outputPath, header + lines.join('\n') + '\n');
console.log(`Wrote ${outputPath} (${lines.length} files with edges out of ${files.length} scanned)`);
