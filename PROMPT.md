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
מעולה, ריכזתי את כל הדרישות והשינויים לתוכנית עבודה אחת מקיפה ושלמה עבור **joinUp**:

### 1. מעבר אוטומטי לדף המשחק (בכל יצירת משחק)
- **יצירת משחק (כולל יצירת משחק ב-Vibe):** מיד לאחר סיום יצירת המשחק, המערכת תעביר אותך באופן מיידי וישיר לדף המשחק החדש באותה לשונית בדפדפן, ללא הודעות מעבר. 
- **שגיאות:** במקרה של תקלה ביצירה, תישאר בדף היצירה ותופיע הודעת שגיאה.

### 2. עריכת הגדרות קבוצה (למנהלים)
- כפתור עריכה/הגדרות בראש עמוד הקבוצה (אייקון גלגל שיניים) למנהלי הקבוצה בלבד.
- אפשרות לעריכת כל פרטי הקבוצה: שם, תיאור, תמונה, מיקום ברירת מחדל וזמני פעילות קבועים.

### 3. סנכרון הגדרות הקבוצה למשחקים עתידיים
- שינוי הגדרות המיקום והשעה ברמת הקבוצה יחול אוטומטית כברירת מחדל על כל המשחקים העתידיים שייווצרו בקבוצה.
- עדיין תישמר הגמישות לשנות שעה/מיקום למשחק מסוים בעת יצירתו במידת הצורך.

### 4. הוספת חברים, קישור הזמנה ומינוי מנהלים
- **הוספת חברים:** כפתור "הוסף חברים" לחיפוש והוספת משתמשים קיימים.
- **קישור הצטרפות ושיתוף:** העתקת קישור הזמנה ושיתוף מהיר לוואטסאפ/פלטפורמות נוספות.
- **ניהול מנהלים:** אפשרות למנהל קבוצה להגדיר חברים נוספים כמנהלים.

אני מעביר כעת את כל המשימות בבת אחת לפיתוח!

Recent conversation:
(none)

Implement the described UX/behavior change end-to-end (web + mobile if the feature spans both).
Run local quality gates, then merge to Dev when green.

## Strict Instructions for Cursor / Antigravity Agent
1. **Branching:** Create and switch to a new feature branch before editing code:
   `git checkout -b feature/task-1785939333271`
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
