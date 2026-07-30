# joinUp — Agent memory (terminal Cursor / dispatch)

Persistent instructions for any Cursor Agent run against this repo (including headless `cursor-agent` from the Telegram / dispatch pipeline).

## Always read
- `PROMPT.md` (current task)
- `.cursorrules` (task runner rules)
- `.cursor/rules/*.mdc` (durable project lessons)

## Non-negotiable quality loop
1. Implement on a `feature/task-*` branch.
2. Run local gates:
   - `cd next_app && npm run build` (catches the same TypeScript errors as Vercel)
   - `cd server && npm test` when server code changed
3. On failure: fix and re-run until green (loop).
4. Commit + push feature branch.
5. Merge into `Dev` and push `Dev` (triggers Vercel).

## Known failure modes (do not regress)
1. **`Property 'X' does not exist on type '{}'`**  
   Cause: `apiClient` called without a generic, then reading `result.X`.  
   Fix: `apiClient<{ state: PickSessionState; ... }>(...)`.

2. **Missing required prop (e.g. `alt` on `Avatar`)**  
   Cause: new JSX omitted required props from shared components.  
   Fix: satisfy the component's prop types; run `next build` locally.

3. **Green locally in `next dev` but red on Vercel**  
   Cause: `next build` runs full typecheck; dev mode is looser.  
   Fix: always run production build before merge.

4. **NotificationType enum must match Postgres**  
   Cause: Prisma `NotificationType` values used in code (e.g. `GAME_INVITATION`, `GAME_WAITLIST_OFFER`, `GAME_REMOVED_PEER`, `GAME_ROLE_UPDATE`) exist in `schema.prisma` but not in a migration.  
   Effect: `notification.create` fails while roster joins still succeed — users appear added with no in-app/push notification.  
   Fix: update `schema.prisma` AND add `ALTER TYPE ... ADD VALUE` migration in the same change.

5. **Jest `--detectOpenHandles` Timeout on `setInterval` in `server/index.js`**  
   Cause: requiring `index.js` in integration tests starts background schedulers (review/lottery/pick/completion/series).  
   Fix: gate all top-level `setInterval`/`setTimeout` (and boot kicks) behind `enableBackgroundSchedulers` when `NODE_ENV === 'test'` or `JEST_WORKER_ID` is set.

## When you learn a new deploy bug
Append a short bullet under **Known failure modes** in this file and/or add a rule under `.cursor/rules/`, then commit it with the fix so future terminal agents inherit the lesson.

## Lessons learned (auto)
- Type error on untyped `apiClient` result (`state` on `{}`) — always pass an explicit generic matching the server JSON (e.g. `proposeTrade` → `{ trade; state: PickSessionState }`).
- Missing required `alt` on joinUp `Avatar` — always pass `alt={name || id}` in Next.js UI.
- Live pick bench must never include managers/captains: `ensureManagerTeams` alone is not enough — also `assignManagersToOwnTeams` (set `participation.teamId`), filter managers out of `computeBench`, block `makePick` of managers, and mirror the filter on web/mobile derived bench/unassigned lists.
- Quality gate `next_app:typecheck` failed — re-run and fix locally before merge/deploy.
- When `NODE_ENV=production`, `npm install` skips devDependencies (no `jest` / `typescript`) — keep `include=dev` in package `.npmrc` (or pass `--include=dev`) for local gates.
- `next build` needs `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (and related Clerk env) set; missing key fails prerender of `/_not-found`.
- Clerk publishable key must be **format-valid** (base64 payload ending in `$`), not a string like `pk_test_quality_gate_placeholder` — invalid format fails prerender (e.g. `/chat`). `next_app` `npm run build` normalizes via `scripts/next-build.mjs`.
- Quality gate `next_app:build` failed — re-run and fix locally before merge/deploy.
- Quality gate `server:test` failed — re-run and fix locally before merge/deploy.
- Jest `--detectOpenHandles` fails when `server/index.js` starts `setInterval`/`setTimeout` under test — skip background schedulers when `NODE_ENV=test` or `JEST_WORKER_ID` is set. Integration tests must also pin `PORT` (host env often sets `PORT=8787`) and hit that same port.
