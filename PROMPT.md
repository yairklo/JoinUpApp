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

When a game organizer/admin manually adds a friend to a game (as opposed to the friend requesting to join independently), the system must immediately trigger the same in-app notification and mobile push notification mechanisms already used for other existing notifications in the app (e.g., game reminders) for that added friend. Currently, the friend is added to the game and can see their membership in-app, but no notification event is fired at all when they are added this way — this notification trigger needs to be added at the point where a user is added to a game's participant list by another user (organizer/admin), not when a user joins on their own. Notification content: Hebrew in-app text "צורפת למשחק על ידי [שם המצרף]" including game details (date/time/location); English (mobile) equivalent: "You were added to a game by [Name]" including the same game details. Do not modify the existing pre-game reminder notification logic, which already works correctly — this task is scoped only to adding the missing "added to game by organizer" notification trigger and message.

## Strict Instructions for Cursor / Antigravity Agent
1. **Branching:** Create and switch to a new feature branch before editing code:
   `git checkout -b feature/task-1785161235017`
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
