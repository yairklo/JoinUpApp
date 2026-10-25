# joinUp — Agent memory (terminal Cursor / dispatch)

Persistent instructions for any Cursor Agent run against this repo (including headless `cursor-agent` from the Telegram / dispatch pipeline).

## Always read
- `.cursorrules` (task runner rules)
- `.claude/rules/L1_architecture.md` / `L2_execution.md` (planner/executor protocol)
- `.cursor/rules/*.mdc` (durable project lessons — Cursor auto-attaches by glob; `00-core-invariants.mdc` always applies)

## Read when relevant
- `docs/agents/dev-env.md` (deploying or testing on Dev, endpoints, test users, merge commands)
- `docs/agents/workflow.md` (multi-agent waves, worktrees, integration branch, code review)
- `docs/agents/screenshots.md` (scripted Playwright/Maestro screenshot capture)

## Durable lessons have moved
Lessons are maintained in glob-scoped rule files under `.cursor/rules/`:
- `00-core-invariants.mdc` — Worktree isolation, Git & deploy rules (**always applies**).
- `server-invariants.mdc` (`server/**`) — Auth/security, transactions, single Prisma client, background jobs, privacy, uploads.
- `shared-types.mdc` (`shared/**` + type files) — Shared contracts, client/server types.
- `mobile-map.mdc` (`mobile_app/src/components/map/**`) — Map performance, tracksViewChanges, clustering.
- `prisma-db.mdc` — Neon connections, migrations, JSON columns, dev seed protection.
- `testing-jest.mdc` — Jest open handles, supertest, Neon connection discipline.
- `server-runtime.mdc` — Rate limiting, socket batching, Redis multi-instance, worker/API split.
- `ci-cd.mdc` — GitHub Actions gates, Playwright dev seed isolation.
- `typescript-vercel-quality.mdc` — Next.js/Vercel TypeScript rules, geolocation error boundaries, Clerk FAPI.

## When you learn a new deploy bug
1. Append a short bullet under **New lessons (not yet promoted)** below — cause + fix.
2. Promote it into the matching `.mdc` file above (or a new glob-scoped `.mdc`) once ~5 bullets accumulate. **Default to the narrowest file that fits**. `00-core-invariants.mdc` is the last resort for rules that apply before picking any file.

## New lessons (not yet promoted)
- **next-pwa service worker never activates on the App Router deploy.** `register: true` only prepends `register.js` to the Pages entry `main.js`; App Router loads `main-app`, so the register call is in the build and never runs. `GenerateSW` also precaches `*.map`, `app-build-manifest.json`, and `dynamic-css-manifest.json`, which are not served (404). Workbox then fails install and `navigator.serviceWorker.ready` never resolves — including a manual `register('/sw.js')`. Fix: inject `register.js` into `main-app`, and `buildExcludes` those assets (`next_app/next.config.ts`).
