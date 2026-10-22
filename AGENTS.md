# joinUp — Agent memory (terminal Cursor / dispatch)

Persistent instructions for any Cursor Agent run against this repo (including headless `cursor-agent` from the Telegram / dispatch pipeline).

## Always read
- `.cursorrules` (task runner rules)
- `.claude/rules/L1_architecture.md` / `L2_execution.md` (planner/executor protocol)
- `.cursor/rules/*.mdc` (durable project lessons — Cursor auto-attaches by glob; `00-core-invariants.mdc` always applies)
- `docs/agents/dev-env.md` (Dev environment endpoints, test users, and deploy merge commands)
- `docs/agents/workflow.md` (Multi-agent waves, integration branches, and code review rules)
- `docs/agents/screenshots.md` (Scripted Playwright/Maestro screenshot workflow)

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
*(None currently — all promoted into `.cursor/rules/*.mdc`)*
