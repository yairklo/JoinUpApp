# joinUp — Agent memory (terminal Cursor / dispatch)

Persistent instructions for any Cursor Agent run against this repo (including headless `cursor-agent` from the Telegram / dispatch pipeline).

## Always read
- `PROMPT.md` (current task)
- `.cursorrules` (task runner rules)
- `.claude/rules/L1_architecture.md` / `L2_execution.md` (planner/executor protocol)
- `.cursor/rules/*.mdc` (durable project lessons — Cursor auto-attaches by glob; `00-core-invariants.mdc` always applies)

## Durable lessons have moved
The lessons that used to accumulate here have been promoted into glob-scoped rule files under
`.cursor/rules/`, so they load only when relevant instead of on every prompt:
- `00-core-invariants.mdc` — auth/security, transaction atomicity, single Prisma client, background-job
  idempotency, admin-flag source, payment constraint, shared-types source of truth. **Always applies.**
- `prisma-db.mdc` — Neon connection topology, migrations, enum sync, stale-client regen.
- `testing-jest.mdc` — Jest open-handle/scheduler gating, supertest pattern, `prisma generate` before test.
- `server-runtime.mdc` — rate-limiter exemptions, socket batching, worker/API process split.
- `ci-cd.mdc` — required CI gates and Node version.
- `typescript-vercel-quality.mdc` — Next.js/Vercel TypeScript build lessons (pre-existing, unchanged):
  API client generics, required component props (`Avatar` `alt`), Clerk publishable-key format,
  "build before merge".

## When you learn a new deploy bug
1. Append a short bullet under **New lessons (not yet promoted)** below — cause + fix, like the entries
   used to look.
2. Promote it into the matching `.mdc` file above (or a new one, with an explicit `globs:`) once this
   section has ~5 unpromoted bullets, or before a release — don't let it grow back into a monolith. If
   the lesson is cross-cutting (security, transactions, process lifecycle) with no natural glob, put it
   in `00-core-invariants.mdc` instead of leaving it here.

## New lessons (not yet promoted)
- Live pick bench must never include managers/captains: `ensureManagerTeams` alone is not enough — also `assignManagersToOwnTeams` (set `participation.teamId`), filter managers out of `computeBench`, block `makePick` of managers, and mirror the filter on web/mobile derived bench/unassigned lists.
