# Test coverage audit — what's missing and how to close it

Snapshot as of 2026-09-01, branch `chore/test-coverage-audit` (built on top of
`chore/production-readiness-hardening`). Read this alongside [AGENTS.md](AGENTS.md) for the
Jest/Prisma conventions already in use — this file only tracks *what's covered vs. not*
and a recommended order of attack, not house style.

## Current state

| Package | Test runner | Files | Tests |
|---|---|---|---|
| `server/` | Jest + supertest, real Postgres | 19 | 86 |
| `shared/` | Jest | 2 | 14 |
| `next_app/` | Jest (`next/jest`, pure-logic only) | 2 | 6 |
| `mobile_app/` | none — `tsc --noEmit` is the only CI gate | 0 | 0 |

`server` and `shared` have real coverage of the logic most likely to cause a bad incident
(auth, permissions, money-adjacent fields, timezone math). `next_app` and `mobile_app` have
**zero** coverage of anything a user actually clicks — every page, component, and hook is
unverified except by manual QA.

## Priority 1 — server gaps (highest risk, cheapest to close)

These follow the exact `jest.mock('../utils/auth', ...)` + supertest + real-Postgres pattern
already used in `server/tests/*.test.js` — see `adminActions.test.js` or `friendRequestCancel.test.js`
for a template. No new tooling needed, just more files.

- **`routes/users.js`** — only `/me` and the new `/requests/*/cancel` are covered. Untested:
  profile update, image upload, friends list, `/search`, accept/decline request happy paths.
- **`routes/search.js`** — no test at all for a user-facing discovery endpoint.
- **`routes/fields.js`** — no test at all.
- ~~`routes/auth.js` — no test at all.~~ **Correction:** `server/docs/agents/auth_pitfalls.md`
  marks this file explicit legacy/dead code ("belongs to a legacy, file-based JSON store...
  completely disconnected from Clerk and Prisma. NEVER extend or reference them"). Do not write
  tests for it — that would validate a code path nothing should be routing through. Remove it
  from any active-repo audit; if it's truly unreferenced, it's a deletion candidate, not a
  coverage gap.
- **`routes/gameTeams.js`** — `captainRole.test.js` covers role assignment but not team
  CRUD/rebalance endpoints directly.
- **`services/moderationService.js`** — the AI content-moderation gate has no test. Worth at
  least a unit test with the OpenAI/Gemini clients mocked, asserting the safe/unsafe/review-needed
  branches route correctly — this is what decides whether a message reaches `FlaggedMessage`.
- **`workers/reviewWorker.js`** — `processReviewQueue` itself (the retry loop) has no direct
  test, only `deleteMessageFromChat` indirectly via `adminActions.test.js`.
- **`workers/cleanupWorker.js`**, **`workers/gameReminderWorker.js`** — no tests; both are
  scheduled jobs with real side effects (deleting notifications, sending reminders).
- **`middleware/upload.js`** — no test on file-type/size validation.

## Priority 2 — next_app (26 pages, 60 components, 15 hooks, 0 component tests)

Pure-logic tests (`jest.config.js` + `next/jest`) are already wired up and a good template for
more utils, but the real gap is anything that renders. Recommended approach:

1. Add `@testing-library/react`, `@testing-library/jest-dom`, and `msw` (or a hand-rolled
   `apiClient` mock) as devDependencies. `next/jest` already handles JSX/TSX transforms — just
   switch `testEnvironment` to `'jsdom'` per-test-file via a `@jest-environment jsdom` docblock
   (keeps the existing node-environment pure-logic tests fast).
2. Start with the flows that changed this session and have real risk if broken silently:
   - `src/app/sign-up/[[...sign-up]]/page.tsx` — the new legal-consent notice renders and links
     resolve.
   - `src/app/admin/moderation/page.tsx` — the new dismiss/remove/ban buttons call the right
     API methods and update local state (mock `usersApi`, not the network).
   - `JoinGameButton.tsx`, `PendingJoinRequests.tsx` — roster/waitlist actions are the core
     product loop; a silent regression here is the worst kind.
3. After that, work outward by user-journey frequency (game creation, series subscribe, chat)
   rather than trying to hit 100% of the 60-component list at once.

## Priority 3 — mobile_app (28 routes, 14 components, 15 hooks, 0 tests)

`tsc --noEmit` is now a real, clean, enforced CI gate (see `chore/production-readiness-hardening`),
which catches a class of bugs on its own — but nothing here executes at runtime under test yet.

1. Add `jest-expo` as the preset (`npx expo install jest-expo jest @testing-library/react-native
   --dev` — respects this repo's "use Expo install, not bare npm install" rule) and a `test`
   script; `jest-expo` ships sensible defaults for mocking native modules (maps, notifications,
   secure-store) that would otherwise block every test.
2. Highest-value first targets, because they're both new and previously silently broken this
   session:
   - `src/hooks/useUserActions.ts` — `handleCancelRequest` now calls a real endpoint; a unit
     test with `usersApi` mocked would have caught the original stub immediately.
   - `app/sign-up.tsx` — the required-consent checkbox actually gates submit and OAuth.
   - `app/settings/index.tsx` — push toggle reflects real permission + backend state, not
     local-only `useState`.
3. Add the resulting `npm test` as a CI job next to `mobile-typecheck` in
   `.github/workflows/ci.yml` once the first few tests exist — don't add the CI step first with
   nothing behind it (that's how `next_app`'s lint step ended up as permanent
   `continue-on-error: true` noise).

## Priority 4 — lower value, skip unless touching that code anyway

- `shared/upload.js`, `shared/types/game.ts` — thin/type-only, low bug surface.
- `server/utils/logger.js` — a console.log wrapper.
- Any of the ~9 deleted Expo-template files from the prior branch — already removed as dead code,
  not a gap.

## Explicitly not done here

This branch does **not** attempt full coverage — that's a multi-week effort across three
codebases with very different testing tooling. It adds the two integration test files that were
the most glaring self-introduced gaps (`server/tests/adminActions.test.js`,
`server/tests/notificationSettings.test.js`) and leaves the rest as this prioritized list for
whoever picks up the next chunk.
