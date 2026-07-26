# Cursor Task Execution Instruction

## Task Description
Product-confirmed feature request for the joinUp project only.
Stay strictly inside this repository. Do not touch other projects or system paths.

QUALITY / DEPLOY REQUIREMENTS (joinUp):
- After coding: run `cd next_app && npm run build` and fix TypeScript/build errors in a loop until green.
- Run server tests when relevant (`cd server && npm test`).
- Do not consider the task done while Next build is red (Vercel will fail otherwise).
- When green: merge the feature branch into Dev and push (triggers Vercel preview).
- Server/API staging is https://my-app-staging-ijyp.onrender.com (NOT the old joinupapp-1.onrender.com).
- Production API is https://joinup-api.duckdns.org — do not treat old Render prod as current.
- After server/ changes the orchestrator redeploys Render staging and watches /api/health for errors.

Re-attempt fixing a bug in the live team-picking/draft feature for a game: managers/captains are still appearing in the selectable "bench" pool of available players, allowing other managers to pick them onto a team — this is incorrect and the previous fix attempt did not resolve it. Managers always play in the game and must be automatically assigned to their own team from the start (no picking needed for them). Update the logic so that any player who is a manager for this game is automatically excluded from the bench/pool list and automatically placed on their own team's roster before the picking phase begins, on both web and mobile frontends. Ensure the live picking screen, team rosters display, and any "unassigned players" count all correctly reflect managers as pre-assigned rather than pickable. Please double-check all places where the bench/pool list is generated or displayed (including any cached/derived lists) since the first fix attempt apparently missed at least one of them.

## Strict Instructions for Cursor / Antigravity Agent
1. **Branching:** Create and switch to a new feature branch before editing code:
   `git checkout -b feature/task-1785091078021`
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
