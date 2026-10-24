# Feature 1 - Match results, player stats, player reports

Overview and sequencing: [2026-10-match-results-and-tournaments.md](./2026-10-match-results-and-tournaments.md)

## 1. Goals

1. At the end of a game, **any game manager** (organizer, `MANAGER` role, admin; not only the opener) records the result and per-player stats, specific to the sport.
2. A player's profile shows (a) a result/stat badge on each match-history card, (b) an aggregated stats section. Each user can **hide** it.
3. Users can **report a player** for bad behaviour to the site admins (does not exist today; only chat-message reports and free-text support exist).
4. Existing 1-5 star player ratings stay as they are.

Stats are **self-reported** by managers and unverified; they never feed rankings or rewards.

Non-goals (v1): live in-game scoring, per-point tennis tracking, leaderboards across all users, editing after the lock window except by admin.

## 2. Sport stat schemas (single source: `shared/matchStats.js`)

Result shape is common; stats differ per sport.

| Sport | Team result | Per-player stat keys (all non-negative ints unless noted) |
| --- | --- | --- |
| SOCCER | home/away score per team | `goals`, `assists`, `saves` (goalkeeper), `cleanSheet` (0/1), `yellowCards`, `redCards`, `ownGoals`; optional `mvp` (0/1) |
| BASKETBALL | home/away score | `points`, `rebounds`, `assists`, `steals`, `blocks`, `threePointers`, `fouls`; optional `mvp` |
| TENNIS | per side: sets array e.g. `[[6,4],[3,6],[10,7]]` (sides = 1 or 2 players), winner side | `aces`, `doubleFaults`, `winners` (all optional); `setsWon`/`gamesWon` are derived |

Rules encoded in the shared module (with jest tests): allowed keys per sport, max values (sanity caps), `sum(player goals) <= team score` as a soft warning (own goals / unrecorded goals exist), tennis set validation (6-x, 7-5, 7-6 tiebreak, match tiebreak), winner derivation, `deriveOutcome(sideScore, otherScore) -> WIN|LOSS|DRAW`. The module also exports labels (he/en), ordering and which keys appear in the profile summary, so UI never hardcodes stat names.

## 3. Data model (Prisma, additive)

```prisma
enum GameResultStatus { DRAFT FINAL }
enum ResultOutcome { WIN LOSS DRAW }
enum UserReportReason { HARASSMENT VIOLENCE CHEATING NO_SHOW FAKE_PROFILE INAPPROPRIATE_CONTENT RESULT_DISPUTE OTHER }
enum UserReportStatus { OPEN RESOLVED DISMISSED }

/// One recorded result per game.
model GameResult {
  id           String           @id @default(cuid())
  gameId       String           @unique
  sport        SportType
  status       GameResultStatus @default(FINAL)
  recordedById String
  recordedAt   DateTime         @default(now())
  editedById   String?
  editedAt     DateTime?
  lockedAt     DateTime?        // recordedAt + 7 days; only admin edits after
  notes        String?
  game         Game             @relation(fields: [gameId], references: [id], onDelete: Cascade)
  sides        GameResultSide[]
}

/// A side = a game Team, or an ad-hoc side (tennis singles / games without Team rows).
model GameResultSide {
  id       String        @id @default(cuid())
  resultId String
  order    Int           // 0 = home/A, 1 = away/B
  teamId   String?       // optional link to Team
  label    String        // snapshot of the team name so later team edits do not rewrite history
  score    Int           @default(0)
  sets     Json?         // tennis: [[6,4],[3,6]]
  outcome  ResultOutcome
  result   GameResult    @relation(fields: [resultId], references: [id], onDelete: Cascade)

  @@unique([resultId, order])
}

/// Per-player stat as key/value rows so new stats need no migration.
model PlayerStatEntry {
  id     String  @id @default(cuid())
  gameId String
  userId String
  sideId String?  // FK -> GameResultSide, onDelete: SetNull (gives the player's W/D/L)
  key    String   // validated against shared/matchStats.js
  value  Int
  game   Game @relation(fields: [gameId], references: [id], onDelete: Cascade)
  user   User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([gameId, userId, key])
  @@index([userId, key])
  @@index([gameId])
}

model UserReport {
  id           String           @id @default(cuid())
  reporterId   String
  targetId     String
  gameId       String?          // optional context
  tournamentId String?          // optional context (tournament report); FK onDelete SetNull
  reason       UserReportReason
  details      String?
  status       UserReportStatus @default(OPEN)
  resolution   String?
  resolvedById String?
  resolvedAt   DateTime?
  createdAt    DateTime         @default(now())
  reporter     User @relation("ReportsFiled", fields: [reporterId], references: [id], onDelete: Cascade)
  target       User @relation("ReportsReceived", fields: [targetId], references: [id], onDelete: Cascade)

  @@index([status, createdAt])
  @@index([targetId])
  // one open report per (reporter, target, game): enforced in code, because a NULL gameId
  // does not collide in a Postgres unique index.
}

// User: add  hideMatchStats Boolean @default(false)  + relation fields
// Game: add  result GameResult?  statEntries PlayerStatEntry[]
// No notification type for results (owner decision: no result notifications).
```

Notes: `PlayerStatEntry.tournamentMatchId` is added later by the tournament plan (nullable, plus a raw-SQL CHECK that exactly one of `gameId` / `tournamentMatchId` is set; `gameId` becomes nullable in that migration). Player W/D/L for aggregates is derived by joining `sideId` -> `GameResultSide.outcome`; players without a side get no W/D/L but still count stats.

Migrations: (1) tables + `hideMatchStats`; Dev DB first; production gets it via `prisma migrate deploy` on deploy.

## 4. API contract

All under existing routers; every existing response keeps its shape (old mobile builds are still in use), new fields are optional.

| Method + path | Who | Behaviour |
| --- | --- | --- |
| `GET /api/games/:id/result` | anyone who can see the game (respect friends-only access) | `{ eligible, canEdit, result: {sides, stats, notes, status, recordedBy, lockedAt} or null, roster: [{userId,name,imageUrl,sideId}] }`. Per-player stats are filtered by the same gate as the profile (owner always; otherwise hidden if the player set `hideMatchStats` or fails `canViewSection(privacyGames)`, minors included); only team-level scores/sides are always visible to whoever can see the game. |
| `PUT /api/games/:id/result` | level >= `MANAGER` or admin | Upsert result + stats in one transaction. Body: `{ sides:[{teamId?,label,score,sets?}], stats:[{userId,sideId,values:{goals:1,...}}], notes }`. Shared-schema validation, only `CONFIRMED` participants, game finished per the eligibility rule below and not `CANCELLED`, not locked (admin override). Sets `lockedAt = firstWrite + 7 days` on the first write only; later edits never extend it. Sides are upserted by `[resultId, order]` (ids stay stable so stat `sideId` links survive); stat entries are replaced inside the `tx`. |
| `DELETE /api/games/:id/result` | admin, or manager within the lock window | Removes result and stat entries. |
| `POST /api/games/:id/result/dispute` | any confirmed participant | Creates a `UserReport` with `reason=RESULT_DISPUTE` against the recorder; rate limited. |
| `GET /api/users/:id/stats?sport=` | privacy-gated | `{ visible, hiddenReason?: 'USER_HIDDEN'/'PRIVATE', sports: [{sport, games, wins, draws, losses, totals:{...}, perGame:{...}}] }` via `groupBy` over `PlayerStatEntry` + sides. Hidden for non-owners when `hideMatchStats` or `!canViewSection(privacyGames)`; owner always sees. |
| `GET /api/users/:id/match-history` (extend) | existing gate | Each item gains optional `result: { outcome, score:'3-2', myStats:{goals:1} }`, omitted when hidden. |
| `PUT /api/users/profile/settings` (extend) | owner | accepts boolean `hideMatchStats`; returned in the settings payload. |
| `GET /api/users/:id` (extend) | existing | adds `statsSummary` (W/D/L + 2-3 headline stats for the profile hero) only when visible. |
| `POST /api/users/:id/report` | any authed user | `{ reason, details?, gameId? }`. Not self; blocked pairs allowed but the response must not reveal block state (`docs/qa/blocks-and-privacy-contract.md`); `createRateLimiter` 10/h; dedupe open report per (reporter,target,game). Always the same `201 {ok:true}` shape. |
| `GET /api/admin/user-reports?status=`, `POST /api/admin/user-reports/:id/resolve` (`{resolution, action?: 'NONE' or 'BAN'}`), `POST .../dismiss` | `requireAdmin` | Mirrors `field-issue-flags` / `support-messages` handlers; BAN reuses the existing ban logic. |

Eligibility: allowed once `status=COMPLETED`, or `start + duration <= now`, or the manager explicitly finishes the game (existing complete action); never when `CANCELLED`. Not allowed mid-game.

## 5. Atomic steps (<= 3 files, schema and UI never mixed)

| Step | Area | Files | Work |
| --- | --- | --- | --- |
| F1-1 | server schema | `server/prisma/schema.prisma`, new migration | Models above + `hideMatchStats`. Tier-2 runs `prisma migrate dev`. |
| F1-2 | shared | `shared/matchStats.js`, `.d.ts`, `.test.js` | Sport schemas, validators, derivations, labels. Parallel with F1-1. |
| F1-3 | server | `server/services/gameResultService.js`, `server/tests/gameResult.test.js` | `getGameResult`, `upsertGameResult` (tx), `deleteGameResult`, permission via `getRoleLevel`. |
| F1-4 | server | `server/routes/games.js`, `server/tests/gameResultRoutes.test.js` | `GET/PUT/DELETE /:id/result`, dispute. Declare before `/:id` catch-alls. |
| F1-5 | server | `server/services/userStatsService.js`, `server/routes/users.js`, `server/tests/userStats.test.js` | `/users/:id/stats`, `statsSummary`, match-history `result`, `hideMatchStats` setting; privacy matrix. |
| F1-6a | server | `server/routes/users.js`, `server/tests/userReports.test.js` | `POST /users/:id/report`, rate limit, no block leakage. |
| F1-6b | server | `server/routes/admin.js`, `server/tests/adminUserReports.test.js` | Admin list / resolve / dismiss / ban. |
| F1-7 | web | `next_app/src/services/api/results.ts`, types, `useGameResult.ts` | API client + types + hook. |
| F1-8 | web | `GameResultPanel.tsx`, `GameResultEditor.tsx`, `app/games/[id]/page.tsx` | Read panel for everyone, editor for managers (per-sport fields from the shared schema). |
| F1-9 | web | `app/users/[id]/page.tsx`, `ProfileStatsCard.tsx`, history card | Stats section + result badge on history cards; owner sees "hidden from others". |
| F1-10 | web | `app/profile/settings/*`, `ReportUserDialog.tsx`, `GameRatingsPanel.tsx` | "Hide my stats" toggle; report dialog (pattern: `ReportMessageDialog.tsx`) on profile and in the ratings panel. |
| F1-11 | web admin | `app/admin/moderation/*`, `AdminUserReports.tsx` | Player-reports tab with resolve/ban. |
| F1-12..16 | mobile | mirror of F1-7..11 under `mobile_app/` (`src/services/api/results.ts`, hook, components, `app/user/[id].tsx`, settings, `app/admin/moderation.tsx`, locales he/en) | Parallel with web after F1-4/6/7 are merged. |
| F1-17 | seed + e2e | `server/scripts/seedDev*`, `docs/dev-seed.md`, one Playwright + one Maestro flow | Finished games with results in each sport. Flow: manager records result -> profile shows it -> user hides -> stranger no longer sees it. |

Design-agent checkpoints: D0 before F1-7 / F1-12 (briefs: result editor per sport, profile stats card, history badge, report dialog); D1 after F1-11 / F1-16 on Dev.

## 6. Test matrix (server)

- Permission: organizer, MANAGER, admin (allowed); MODERATOR, CAPTAIN, plain participant, stranger (denied); not-started game; cancelled game; locked after 7 days (admin ok).
- Validation: unknown stat key, negative, over cap, non-confirmed player, duplicate player, invalid tennis set; re-PUT replaces rows without duplicates; transaction rolls back on mid-failure.
- Privacy: owner / friend / stranger / minor default / `hideMatchStats` / blocked viewer; history items omit `result` when hidden.
- Reports: self-report, duplicate, rate limit, identical response for blocked pairs, admin-only listing, BAN path.
- Concurrency: two managers saving at once (last write wins inside the tx; response returns `editedAt` so the UI can warn).

## 7. Rollout

1. Schema (additive) to Dev first, verify the migration on the Dev Neon branch.
2. New endpoints only, nothing existing changes, so no flag is required.
3. Clients render the UI only when the API says `eligible: true` / `visible: true`.
4. Mobile: OTA is enough (no native module added; fingerprint unchanged).
5. Rollback: stop rendering the UI; tables stay; no destructive migration.
