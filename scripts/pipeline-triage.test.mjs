// Standalone self-test for pipeline-triage.mjs -- run directly, not part of
// the Jest server suite: `node --test scripts/pipeline-triage.test.mjs`
import { test } from "node:test";
import assert from "node:assert/strict";
import { classify } from "./pipeline-triage.mjs";

test("high risk always escalates", () => {
  const result = classify("high", ["next_app/src/app/page.tsx"]);
  assert.equal(result.decision, "full_pipeline");
});

test("medium risk always escalates", () => {
  const result = classify("medium", ["next_app/src/app/page.tsx"]);
  assert.equal(result.decision, "full_pipeline");
});

test("low risk multi-file escalates", () => {
  const result = classify("low", ["a.ts", "b.ts"]);
  assert.equal(result.decision, "full_pipeline");
});

test("low risk prisma schema path escalates", () => {
  const result = classify("low", ["server/prisma/schema.prisma"]);
  assert.equal(result.decision, "full_pipeline");
});

test("low risk auth path escalates", () => {
  const result = classify("low", ["server/utils/auth.js"]);
  assert.equal(result.decision, "full_pipeline");
});

test("low risk single non-sensitive file is fast_path", () => {
  const result = classify("low", ["next_app/src/components/Example.tsx"]);
  assert.equal(result.decision, "fast_path");
});

test("no files never fast_path", () => {
  const result = classify("low", []);
  assert.equal(result.decision, "full_pipeline");
});
