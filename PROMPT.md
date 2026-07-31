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

Product-confirmed joinUp fix from Telegram collaborator.
Stay strictly inside the joinUp repository. Do not touch other projects.

Product summary / intent:
שלח שוב את המשימה הזו לביצוע:

1. סקשן "הקבוצות שלי":
   - יוצגו בו אך ורק קבוצות שהמשתמש מחובר וחבר בהן בפועל.
   - אם המשתמש לא מחובר, או שאינו חבר באף קבוצה – הסקשן מוסתר לחלוטין.

2. סקשן "הצטרף לקבוצה":
   - יוצגו בו קבוצות ציבוריות שהמשתמש עדיין אינו חבר בהן.
   - לחיצה על כרטיסיית קבוצה תעביר לעמוד הקבוצה הרלוונטי (ללא כפתור הצטרפות מהיר על גבי הכרטיסייה).
   - אם אין קבוצות חדשות להצטרף אליהן – הסקשן מוסתר לחלוטין.

3. התאמה למובייל ול-Web:
   - התיקון ייושם וייבדק בשני המסכים כדי לוודא התנהגות אחידה.

Recent conversation:
(none)

Implement the described UX/behavior change end-to-end (web + mobile if the feature spans both).
Run local quality gates, then merge to Dev when green.

## Strict Instructions for Cursor / Antigravity Agent
1. **Branching:** Create and switch to a new feature branch before editing code:
   `git checkout -b feature/task-1785486866151`
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
