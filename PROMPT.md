# Cursor Task Execution Instruction

## Task Description
Product-confirmed feature request for the joinUp project only.
Stay strictly inside this repository. Do not touch other projects or system paths.

QUALITY / DEPLOY REQUIREMENTS (joinUp):
- After coding: run `cd next_app && npm run build` and fix TypeScript/build errors in a loop until green.
- Run server tests when relevant (`cd server && npm test`).
- Do not consider the task done while Next build is red (Vercel will fail otherwise).
- When green: merge the feature branch into Dev and push (triggers Vercel).

Fix a localization bug in the newly added team-management/draft feature (scheduling, live picking screen, group chat, turn indicators, trade/swap flow) — all new UI strings were hardcoded in English instead of using the app's existing translation/localization system. On web, integrate every new string from this feature into the existing localization setup so it displays in Hebrew (matching the rest of the site). On mobile, integrate every new string into the existing i18n/language-selection system so it correctly switches between Hebrew and English based on the user's chosen language setting, exactly like all other existing text in the app. This includes: schedule/lottery labels, the live picking screen (turn indicators, bench/pool labels, team pick displays, online/offline status), the group chat UI (placeholders, system messages), and the trade/swap proposal and approval UI. No new visual/behavioral changes — just correct translation wiring for all text introduced by this feature.

## Strict Instructions for Cursor / Antigravity Agent
1. **Branching:** Create and switch to a new feature branch before editing code:
   `git checkout -b feature/task-1785085009972`
2. **Autonomy:** Run in non-interactive/auto-approve mode. Do NOT prompt for permission on file edits or terminal commands.
3. **Verification & Completion:**
   - Execute local quality gates (build/tests) and fix failures in a loop until green.
   - Stage all changes, commit them with a clean descriptive message, and push the branch to the remote origin.
   - Merge into `Dev` and push so deploy (e.g. Vercel) runs.
4. **Do not delete PROMPT.md or .cursorrules** until after commit (E2E verifies them).

## Quality Gate Loop (MANDATORY — do not skip)
After implementing code changes you MUST locally verify before declaring done.
This catches TypeScript / Next.js / Vercel build failures before deploy.

### Verify commands (run from the matching package directory)
1. If `next_app/package.json` exists: `cd next_app && npm run build`
2. If `server/package.json` has a test script: `cd server && npm test`
3. If `mobile_app` has `typecheck` or `lint`: run that script
4. Otherwise run root `npm test` / `npm run build` when those scripts exist

### Fix loop
- If ANY command fails: read the error, fix the code, re-run the failing command.
- Repeat until ALL gates pass (up to ~5 fix iterations).
- Do NOT push a "done" state while `npm run build` (or equivalent) is red.
- Do NOT rely on Vercel/CI to discover type errors — catch them locally.

### Merge to deploy branch
- After gates are green: commit, push the feature branch, then merge into `Dev`.
- Example: `git checkout Dev && git pull && git merge --no-ff <feature-branch> -m "merge: <feature>" && git push origin Dev`
- Then return to the feature branch. Merging `Dev` triggers the production/Vercel build.
- If merge conflicts occur, resolve them, re-run quality gates, then finish the merge.

### Done criteria
- Local quality gates green
- Feature branch pushed
- Changes merged and pushed to `Dev`
