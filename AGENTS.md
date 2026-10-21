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
- `00-core-invariants.mdc` — worktree isolation only. **Always applies — keep this one small; see
  its own maintenance note before adding to it.**
- `server-invariants.mdc` (`server/**`) — auth/security, transaction atomicity, single Prisma
  client, background-job idempotency, admin-flag source, payment constraint. Applies to any
  `server/` file, without being paid on every `next_app`/`mobile_app`-only task.
- `shared-types.mdc` (`shared/**` + `next_app`/`mobile_app` type files) — shared-types source of truth.
- `mobile-map.mdc` (`mobile_app/src/components/map/**`) — react-native-maps perf pitfalls that
  already regressed once: `tracksViewChanges` must always freeze after mount, and viewport-driven
  clustering must extend the existing memoized pipeline instead of forking a second one keyed on
  raw `currentRegion`.
- `prisma-db.mdc` — Neon connection topology, migrations, enum sync, stale-client regen.
- `testing-jest.mdc` — Jest open-handle/scheduler gating, supertest pattern, `prisma generate`
  before test, Neon dev-DB connection discipline.
- `server-runtime.mdc` — rate-limiter exemptions, socket batching, worker/API process split.
- `ci-cd.mdc` — required CI gates and Node version.
- `typescript-vercel-quality.mdc` — Next.js/Vercel TypeScript build lessons (pre-existing, unchanged):
  API client generics, required component props (`Avatar` `alt`), Clerk publishable-key format,
  "build before merge".

## When you learn a new deploy bug
1. Append a short bullet under **New lessons (not yet promoted)** below — cause + fix, like the entries
   used to look.
2. Promote it into the matching `.mdc` file above (or a new one, with an explicit `globs:`) once this
   section has ~5 unpromoted bullets, or before a release — don't let it grow back into a monolith.
   **Default to the narrowest file that fits** (a new topic gets its own `.mdc` with its own
   `globs:` before it gets added to an existing one). `00-core-invariants.mdc` is the *last* resort,
   not the default catch-all for "cross-cutting" — reserve it for rules that hold before you've even
   picked a file to edit (`server-invariants.mdc` already covers "spans multiple server/
   subdirectories", which is not the same thing as "applies repo-wide").

## New lessons (not yet promoted)
- Minor-to-minor friend requests stay allowed under the default friends-only contact setting. `canRequestFriendship` in `server/utils/privacy.js` refuses only an adult or unknown-age account requesting a minor who did not choose `EVERYONE`. Do not put that gate back on both sides — two minors could never become friends. Profile, search, and the user list expose the same answer as `canAddFriend`. Blocks stay a silent 201 (`silentFriendRequest`) checked before this gate, and search still omits blocked users.
- `POST /users/requests` must not map every failure after the insert to 400 `Request already exists`. That status made the client call `checkStatus()`, see the pending row, and show "request sent" while the bell was never created (the notification `.catch` swallowed the error, and a retry returned 400 before notifying). Same-direction pending is idempotent 200 and must ensure a `FRIEND_REQUEST` row; only `P2002` is a duplicate race. Opposite pending is `INCOMING_REQUEST_EXISTS`. Notification copy is scrubbed again when served (`scrubNotificationRecord`) because rows written before write-time redaction still contain emails.
- Dev seed (`server/scripts/seedDev.js`) must refuse production even when only `DIRECT_DATABASE_URL` is prod: guard both URLs after stripping `-pooler`, require `SEED_ALLOWED_DB_HOST` plus a pre-created `joinup_dev_seed_marker` row, and do not load `server/.env` (set `JOINUP_SKIP_DOTENV=1` before `lib/prisma.js`). Whole-token host matches only — `precious`/`contest` are not dev. Details in `prisma-db.mdc`.
- Notification identity must never use Clerk `displayName()` as-is: it falls back to the account email, and join/request copy interpolated `req.user.name` directly (`qa@… הצטרף/ה`). Resolve `notificationName()` (stored profile name, else a non-email inline name, else `משתמש`) and keep `redactNotificationFields` on every NotificationService entry point so push, socket, and in-app rows cannot leak an email.
- Minor chat policy (`chatSafety.js`): teens swear and we do not moderate that. Minor senders are never filtered; group/game chats have no lexicon filter; only a private adult→minor chat blocks a short list of severe sexual slurs (`profanityFilter.js`). AI runs only when the sender is an adult and a recipient is a known minor, and only for messages that trip `moderationGate.js` (grooming/threat/sexual signals) so ordinary chat costs nothing. Reports (`POST /messages/:id/report` → admin flagged queue) are the safety net for everything else.
- Live pick bench must never include managers/captains: `ensureManagerTeams` alone is not enough — also `assignManagersToOwnTeams` (set `participation.teamId`), filter managers out of `computeBench`, block `makePick` of managers, and mirror the filter on web/mobile derived bench/unassigned lists.
- `/search` must not auto-prompt geolocation on mount: many mobile browsers throw `SecurityError` (no user gesture / Permissions-Policy) instead of calling the error callback, which takes down the route error boundary. Only auto-detect when `permissions.query` already reports `granted`; always try/catch `getCurrentPosition` and validate lat/lng before `panTo` / AdvancedMarker. Wrap the map in a local error boundary so a Maps crash cannot replace the whole page.
- Uploads: `server/middleware/upload.js` stores images in Cloudinary (`CLOUDINARY_URL`) and throws at boot if it is missing/malformed unless `NODE_ENV` is `test`/`development` or `ALLOW_DISK_UPLOADS=true`. `handleSingleUpload` discards the stored file automatically when the route answers 4xx/5xx, so routes need no orphan cleanup. Never let clients set `imageUrl` to a managed URL they don't already own (`PUT /users/:id` guards this) — `deleteUploadedFile` would destroy someone else's file. Tests: mock `cloudinary` with `jest.resetModules` + `jest.doMock` (see `tests/uploadCloudinary.test.js`).
- Playwright must not inherit `server/.env`. `e2e/global-setup.ts` refuses unless `DATABASE_URL` and `DIRECT_DATABASE_URL` are already in the shell; the API it starts gets an explicit env and `JOINUP_SKIP_DOTENV=1` (`server/lib/loadEnv.js`). Every remote host needs `SEED_ALLOWED_DB_HOST` (pooler and direct count as one host). `JOINUP_SEED_CONFIRM=dev` does not choose the database. `MODERATION_PROVIDER=stub` is the CI moderation provider and must throw when `NODE_ENV=production`.
- Multi-instance API (Redis, all opt-in flags): the adapter alone is not enough. (1) Bridged events (`joinup:socket_events`, `moderation_events`) must be applied with `io.local`, or each of N instances re-broadcasts to the cluster and clients get N copies. (2) `io.sockets.adapter.rooms`/`io.sockets.sockets` are node-local; use `utils/socketPresence`. (3) The adapter fires `pubClient.publish()` un-awaited, so a down Redis becomes unhandled rejections unless `socket/adapter.js` `guardPublish` + fail-fast pub / queueing sub clients (`lib/redis.js createAdapterClients`) are kept. (4) Jobs run on one process only: `JOBS_LEADER_LOCK=redis` elects it; standbys must never re-publish scheduler signals (`gameScheduler.handleSignal`). Details: `server/docs/agents/realtime_rules.md` §4-5.

- **Never regex a whole JSON column as text** (`data::text` -> `::jsonb`): the `n` of a `\n` escape can match an email pattern and corrupt the escape, aborting the migration. Rewrite JSON values (see `20261020140000_scrub_notification_emails`). Test migrations against a throwaway Docker Postgres.
- **Blocked-pair responses must be identical to unblocked ones** for every gate; apply the block only at the final write. Older app builds retry `retryable` failures forever, so a refusal that can never succeed must be `retryable: false` / a 4xx.
