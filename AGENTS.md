# joinUp — Agent memory (terminal Cursor / dispatch)

Persistent instructions for any Cursor Agent run against this repo (including headless `cursor-agent` from the Telegram / dispatch pipeline).

## Always read
- `PROMPT.md` (current task)
- `.cursorrules` (task runner rules)
- `.cursor/rules/*.mdc` (durable project lessons)

## Database & Migration Architecture (For Planner / L1)
1. **Neon Connection Topology:** \`schema.prisma\` uses \`DATABASE_URL\` for pooled traffic and \`DIRECT_DATABASE_URL\` for direct connection. Never point \`DIRECT_DATABASE_URL\` at a \`-pooler\` hostname.
2. **Migrations:** \`prisma migrate dev\` requires \`directUrl\`. The L1 Planner must be aware of this when generating tasks that change the schema.
3. **PrismaClient Lifecycle:** Import `prisma` from `server/lib/prisma.js`. Never instantiate `new PrismaClient()` inside an Express request handler, a loop, or a worker tick.
4. **Transactions:** Roster joins, waitlist promotion, and game creation must be atomic. Game + group chat pairing must happen in the same interactive transaction, where the group chat \`id\` exactly equals the \`game.id\`.

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

6. **Jest open handle `TCPSERVERWRAP` / cascading `testGame.id` undefined in roster tests**  
   Cause: `require('../index')` still calls `server.listen(...)`, leaving a TCP handle; host `PORT` clashes can also make create-game fail so later tests read `undefined.id`.  
   Fix: skip `startServer()`/`server.listen` when `JEST_WORKER_ID` is set; export `{ app }` and hit Express via `supertest(app)` (do not bind a real port in Jest).

7. **Stale Prisma Client rejects new schema fields (e.g. `welcomeMessage`)**  
   Cause: `gameService` writes a field present in `schema.prisma` but local `@prisma/client` was generated before that field existed → create-game returns 500 and roster tests cascade with `testGame.id` undefined.  
   Fix: run `prisma generate` before `npm test` (wired into `server` `npm test` script).

8. **HTTP rate limiter 429s health checks or Socket.IO**  
   Cause: a global Express limiter counting `/api/health` (Render probes) or `/api/socket` (Engine.IO polling).  
   Fix: exempt those paths and disable the limiter under Jest so roster/messages tests never 429.

9. **GitHub CI never ran server tests / used Node 18**  
   Cause: `.github/workflows/ci.yml` only built Next on PRs to `main`, skipped `npm test` in `server`, and pinned Node 18. Agent merges go to `Dev`.  
   Fix: run Next 15 build + Prisma migrate + Jest on PRs to `main`/`Dev` and pushes to `Dev`, on Node 20, with a disposable Postgres service.

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
- Jest roster tests must use exported Express `app` with supertest and must not call `server.listen` under `JEST_WORKER_ID` (avoids TCPSERVERWRAP + undefined game id cascades).
- Stale `@prisma/client` after schema changes (e.g. `welcomeMessage`) breaks create-game in roster tests — `npm test` must run `prisma generate` first.
- Chat write paths must use `authenticateToken` / `socket.userId` + `checkChatPermission`. Never trust client-supplied `userId`, never fail-open socket JWT, never leave `POST /api/messages` public. Recurring series games must create `ChatRoom` (id === game.id) in the same transaction as the game.
- Runtime code must import Prisma from `server/lib/prisma.js` (one client per process). Do not add `new PrismaClient()` in routes/services/workers. Scheduler handlers must claim work with `updateMany` on sentinel fields (`lotteryExecutedAt`, `reminderSent`, `pickingOpenedAt`, `status`) so a second Render instance is a no-op.
- HTTP rate limiter (`server/middleware/rateLimit.js`) must skip Jest (`NODE_ENV=test` / `JEST_WORKER_ID`), `OPTIONS`, `/api/health`, and `/api/socket`. Do not count Engine.IO polling or health probes.
- `req.user.isAdmin` comes from Clerk metadata (`isAdmin` / `role=admin`) or `ADMIN_USER_IDS`. Do not hardcode `false`.
- GitHub CI (`.github/workflows/ci.yml`) must run `next_app` `npm run build` and `server` `npm test` on Node 20 against a workflow Postgres — not Next-only on PRs to `main`.
