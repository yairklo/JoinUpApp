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

## When you learn a new deploy bug
Append a short bullet under **Known failure modes** in this file and/or add a rule under `.cursor/rules/`, then commit it with the fix so future terminal agents inherit the lesson.

## Lessons learned (auto)
- Type error on untyped `apiClient` result (`state` on `{}`) — always pass an explicit generic matching the server JSON (e.g. `proposeTrade` → `{ trade; state: PickSessionState }`).
- Missing required `alt` on joinUp `Avatar` — always pass `alt={name || id}` in Next.js UI.
- Live pick bench must never include managers/captains: `ensureManagerTeams` alone is not enough — also `assignManagersToOwnTeams` (set `participation.teamId`), filter managers out of `computeBench`, block `makePick` of managers, and mirror the filter on web/mobile derived bench/unassigned lists.
