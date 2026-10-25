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

## UI / design rules (all of next_app and mobile_app)
Full guide: `next_app/DESIGN_GUIDE.md`. Principles are inspired by Impeccable (github.com/pbakaus/impeccable, Apache-2.0).
- **Refine, don't redesign.** Use existing tokens (`globals.css` + MUI theme; mobile `brand.*`/`cyber.*`), Heebo, and existing components. No new palettes, fonts or UI libraries.
- Every color needs a dark-mode pair. No raw hex in components.
- Build every state: loading (skeleton), empty (next step + CTA), error (Hebrew + retry), disabled (says why), focus ring, pending/double-submit guard, signed-out guest.
- Hebrew first: no hard-coded English in UI. Mobile uses `t('key','עברית')`. Use short, action-named buttons and gender-neutral phrasing.
- RTL: use logical props (`ms/me/ps/pe`, `text-start`, `border-s`, `marginInlineStart`). Mirror directional arrows/chevrons. Wrap times, scores and counts in `<bdi>`/`dir="ltr"`. Format dates with `'he-IL'`. Use `dir="auto"` for user text.
- Contrast ≥ 4.5:1 for text (3:1 for large text/icons) in light AND dark. Text ≥ 12px, inputs 16px on web.
- Touch targets ≥ 44×44 (use padding/`hitSlop`). Design mobile-first at 390px and keep the bottom nav and safe areas clear.
- Avoid: gradient text, AI purple gradients, glassmorphism, glows, `border-l-4` accent cards, identical card grids, nested cards, emoji icons, animating everything, generic marketing copy.
- Before done: run the app and check the touched screens at 390px and desktop with real Hebrew data, signed-in AND guest, light/dark, keyboard focus. Attach screenshots to the PR.
