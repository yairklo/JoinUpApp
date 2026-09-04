#!/usr/bin/env node
/**
 * Deterministic complexity/risk gate for the L1/L2/L3 pipeline (see
 * .claude/rules/L1_architecture.md). Run this before deciding whether a task
 * can take the fast path (L1 implements directly) or needs the full pipeline
 * (L1 plans, L2 executes, L3 reviews).
 *
 * Ported from MultiVendor's scripts/pipeline_triage.py (same repo family,
 * same L1/L2/L3 pattern) -- kept deliberately deterministic for the parts
 * that don't need an LLM judgment call: file-path sensitivity and file count
 * are plain pattern matching, the same reasoning as why .cursor/rules/*.mdc
 * glob matching beats LLM-mediated relevance judgment. It can only ever
 * escalate a "low"/"medium" risk tag to full_pipeline, never downgrade a
 * human-set "high" tag, and never turn a full_pipeline result back into
 * fast_path.
 *
 * Usage:
 *   node scripts/pipeline-triage.mjs --risk low --files next_app/src/app/page.tsx
 *   node scripts/pipeline-triage.mjs --risk medium --files a.ts,b.ts,c.ts,d.ts
 *   node scripts/pipeline-triage.mjs --risk high --files anything.ts
 *
 * Exit code: 0 = fast_path allowed, 1 = full_pipeline required.
 * Prints a JSON decision object to stdout either way.
 */
import { fileURLToPath } from "node:url";

// Sensitive-path patterns curated from this repo's own .cursor/rules/*.mdc
// globs (prisma-db.mdc, server-invariants.mdc's auth/socket files,
// shared-types.mdc, ci-cd.mdc) rather than guessed -- these are the areas
// this repo's own rule files already treat as always-relevant.
const SENSITIVE_PATH_PATTERNS = [
  /server\/prisma\//i,
  /schema\.prisma$/i,
  /server\/lib\/prisma\.js$/i,
  /server\/routes\/auth\.js$/i,
  /server\/utils\/auth\.js$/i,
  /server\/utils\/chatAuth\.js$/i,
  /server\/utils\/socketBridge\.js$/i,
  /server\/index\.js$/i, // socketAuthMiddleware lives here
  /^shared\//i, // cross-cutting client/server type contracts
  /\.github\/workflows\//i,
];

// A "trivial" task is single-file by definition (see L1_architecture.md).
const MAX_FAST_PATH_FILES = 1;

const RISK_ORDER = { low: 0, medium: 1, high: 2 };

export function classify(risk, files) {
  const reasons = [];

  if (!(risk in RISK_ORDER)) {
    throw new Error(`--risk must be one of ${Object.keys(RISK_ORDER).join(", ")}, got ${JSON.stringify(risk)}`);
  }

  if (!files || files.length === 0) {
    return { decision: "full_pipeline", reasons: ["no files given -- cannot be trivial"] };
  }

  if (risk === "high") {
    reasons.push("risk tag is 'high' (set by the human at task definition -- never downgraded)");
    return { decision: "full_pipeline", reasons };
  }

  if (risk === "medium") {
    reasons.push("risk tag is 'medium' -- only 'low' is eligible for the fast path");
    return { decision: "full_pipeline", reasons };
  }

  if (files.length > MAX_FAST_PATH_FILES) {
    reasons.push(
      `${files.length} files touched, fast path is limited to ${MAX_FAST_PATH_FILES} ` +
        `(multi-file changes get the full pipeline)`
    );
    return { decision: "full_pipeline", reasons };
  }

  const hits = [];
  for (const f of files) {
    for (const pattern of SENSITIVE_PATH_PATTERNS) {
      if (pattern.test(f)) {
        hits.push([f, pattern.source]);
      }
    }
  }

  if (hits.length > 0) {
    for (const [f, pattern] of hits) {
      reasons.push(`'${f}' matches sensitive-path pattern /${pattern}/`);
    }
    return { decision: "full_pipeline", reasons };
  }

  reasons.push("risk=low, single file, no sensitive-path match");
  return { decision: "fast_path", reasons };
}

function parseArgs(argv) {
  const args = { risk: null, files: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--risk") args.risk = argv[++i];
    else if (argv[i] === "--files") args.files = argv[++i];
  }
  if (!args.risk || !args.files) {
    throw new Error("Usage: node scripts/pipeline-triage.mjs --risk <low|medium|high> --files <comma-separated>");
  }
  return args;
}

function main() {
  const { risk, files } = parseArgs(process.argv.slice(2));
  const fileList = files
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);

  const result = classify(risk, fileList);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.decision === "fast_path" ? 0 : 1);
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
