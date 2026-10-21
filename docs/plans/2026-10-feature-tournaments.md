# Feature 2 - Tournaments

Overview and sequencing: [2026-10-match-results-and-tournaments.md](./2026-10-match-results-and-tournaments.md)
Depends on: Feature 1 steps F1-1 (schema) and F1-3 (shared stat schemas).

## 1. Goals

- Creation is **admin-only for now** (`canCreateTournament`), designed so it can later open to any user without a rewrite.
- Teams register with a **roster-size range** (e.g. min 5, max 9 including substitutes).
- The organizer gets a **match list whose size depends on the format and team count**, can generate it automatically and then add / remove / edit matches by hand.
- Teams are assigned to matches (seeding, groups, bracket), results are entered, standings and brackets update, winners advance.
- Per-player stats from Feature 1 also work for tournament matches (top scorers, etc.).

Non-goals (v1): payments, double elimination, Swiss system, live minute-by-minute scoring, referee assignment, cross-tournament rankings.

## 2. Concepts

- **Tournament**: sport, dates, venue(s), status, format, rules, registration window, team limits, roster limits, visibility.
- **Roster size**: `startersPerTeam` (on field, e.g. 5), `minPlayersPerTeam`, `maxPlayersPerTeam` (includes substitutes). A team is *valid* when `min <= accepted members <= max`.
- **Team**: created by a captain (any user) while registration is open; members join by invite/accept or a join code. One player = one team per tournament.
- **Stage**: `GROUP` (round-robin groups), `LEAGUE` (single round-robin or double round), `KNOCKOUT` (single elimination). A tournament has an ordered list of stages, e.g. Groups -> Knockout.
- **Match**: two slots; each slot is a concrete team or a *source* (`WINNER_OF match X`, `LOSER_OF`, `GROUP_RANK group A pos 1`). Resolved automatically as results arrive.
- **Roles**: `ORGANIZER`, `MANAGER` (full edit), `SCOREKEEPER` (results only).

## 3. Data model (Prisma, additive; own migrations, never mixed with UI steps)

```prisma
enum TournamentStatus { DRAFT REGISTRATION_OPEN REGISTRATION_CLOSED IN_PROGRESS COMPLETED CANCELLED }
enum TournamentFormat { LEAGUE KNOCKOUT GROUPS_KNOCKOUT CUSTOM }
enum TournamentTeamStatus { PENDING APPROVED REJECTED WAITLISTED WITHDRAWN }
enum TournamentMemberRole { CAPTAIN PLAYER SUBSTITUTE }
enum TournamentMemberStatus { INVITED ACCEPTED DECLINED REMOVED }
enum TournamentMatchStatus { SCHEDULED LIVE FINISHED FORFEIT POSTPONED CANCELLED }
enum TournamentStageType { GROUP LEAGUE KNOCKOUT }
enum TournamentRoleType { ORGANIZER MANAGER SCOREKEEPER }

model Tournament {
  id                  String           @id @default(cuid())
  organizerId         String
  title               String
  description         String?
  sport               SportType
  imageUrl            String?
  fieldId             String?          // main venue (optional; matches can override)
  customLocation      String?
  startsAt            DateTime
  endsAt              DateTime?
  status              TournamentStatus @default(DRAFT)
  format              TournamentFormat
  isPublic            Boolean          @default(true)
  openToMinors        Boolean          @default(false)
  registrationOpensAt DateTime?
  registrationClosesAt DateTime?
  rosterLockAt        DateTime?        // after this no roster changes without organizer
  minTeams            Int              @default(2)
  maxTeams            Int
  startersPerTeam     Int
  minPlayersPerTeam   Int
  maxPlayersPerTeam   Int
  requireApproval     Boolean          @default(true)
  rules               Json             // points (3/1/0), tiebreak order, legs, matchDuration, thirdPlace, ...
  createdAt           DateTime         @default(now())
  updatedAt           DateTime         @updatedAt
  teams  TournamentTeam[]  stages TournamentStage[]  matches TournamentMatch[]  roles TournamentRole[]
  @@index([status, startsAt])
  @@index([organizerId])
}

model TournamentTeam {
  id           String               @id @default(cuid())
  tournamentId String
  name         String
  color        String?
  logoUrl      String?
  captainId    String
  status       TournamentTeamStatus @default(PENDING)
  seed         Int?
  groupId      String?
  joinCode     String               @unique   // invite link
  createdAt    DateTime             @default(now())
  members      TournamentTeamMember[]
  @@unique([tournamentId, name])
  @@index([tournamentId, status])
}

model TournamentTeamMember {
  id           String                 @id @default(cuid())
  teamId       String
  tournamentId String                 // denormalised to enforce one team per player
  userId       String
  role         TournamentMemberRole   @default(PLAYER)
  status       TournamentMemberStatus @default(INVITED)
  jerseyNumber Int?
  createdAt    DateTime               @default(now())
  @@unique([tournamentId, userId])
  @@index([teamId])
}

model TournamentStage {
  id String @id @default(cuid())  tournamentId String  order Int  type TournamentStageType
  name String  config Json   // groups count, legs, advance count, seeding method
  groups TournamentGroup[]
  @@unique([tournamentId, order])
}
model TournamentGroup { id String @id @default(cuid())  stageId String  name String }

model TournamentMatch {
  id           String                @id @default(cuid())
  tournamentId String
  stageId      String
  groupId      String?
  round        Int
  number       Int                   // display number within the tournament
  homeTeamId   String?
  awayTeamId   String?
  homeSource   Json?                 // {type:'WINNER_OF',matchId} | {type:'GROUP_RANK',groupId,pos} | {type:'SEED',n}
  awaySource   Json?
  scheduledAt  DateTime?
  fieldId      String?
  courtLabel   String?
  status       TournamentMatchStatus @default(SCHEDULED)
  homeScore    Int?
  awayScore    Int?
  homePenalties Int?
  awayPenalties Int?
  details      Json?                 // tennis sets
  winnerTeamId String?
  version      Int                   @default(0)   // optimistic concurrency for score updates
  updatedById  String?
  @@index([tournamentId, stageId, round])
  @@index([tournamentId, scheduledAt])
}

model TournamentRole { id String @id @default(cuid())  tournamentId String  userId String  role TournamentRoleType
  @@unique([tournamentId, userId]) }

// PlayerStatEntry (from Feature 1): gameId -> nullable, add tournamentMatchId String?,
// raw-SQL CHECK ((gameId IS NULL) <> (tournamentMatchId IS NULL)), unique (tournamentMatchId,userId,key).
// NotificationType additions (own migration): TOURNAMENT_TEAM_INVITE, TOURNAMENT_TEAM_DECISION,
//   TOURNAMENT_MATCH_SCHEDULED, TOURNAMENT_STARTING_SOON.
// ChatRoom: tournament chat room with id = tournament id (same convention as games).
```

Standings are **computed, not stored** (pure function over finished matches), with an in-memory cache keyed by `(tournamentId, max(match.updatedAt))` if needed.

## 4. Shared engines (`shared/tournament/`, pure, heavily tested)

1. `standings.js`: points (win/draw/loss configurable), played, W/D/L, GF/GA/GD, tiebreakers in the order set by `rules.tiebreak` (head-to-head, goal difference, goals for, fair play, draw lot flag). Handles forfeits (3-0 default, configurable), unequal games played, ties across 3+ teams (mini-table).
2. `roundRobin.js`: circle method, supports odd team counts (byes), 1 or 2 legs, home/away balance, groups split (snake seeding).
3. `bracket.js`: single elimination for any N (byes to top seeds), seeding methods (manual, random with seed, by group rank), third-place match, source references, `advance(match)` to resolve downstream slots.
4. `scheduler.js`: assigns `scheduledAt` / court from constraints: day windows, court count, match duration, break, minimum rest per team, no team in two matches at once; returns conflicts rather than silently failing.
5. `rosterRules.js`: roster validity for min/max/starters, one-team-per-player, minors rule, captain required.
6. `tennis.js` reuse from `matchStats` for set validation.

All are plain JS + `.d.ts` with jest tests (property-style checks: every team plays the right number of matches, no double booking, bracket size = next power of two, advancement correctness).

## 5. API contract (`server/routes/tournaments.js`, mounted at `/api/tournaments`)

Gating: `canCreateTournament(req.user)` = `isAdmin` or id in `TOURNAMENT_CREATOR_IDS`. `GET /api/users/me` adds `capabilities.canCreateTournaments` (clients show create entry points from this).

| Method + path | Who | Behaviour |
| --- | --- | --- |
| `GET /api/tournaments?status=&sport=&city=` | public (optional auth) | Published (non-DRAFT) public tournaments; drafts only for roles. |
| `POST /api/tournaments` | creators | Create DRAFT; validates limits (`minPlayers <= maxPlayers`, `startersPerTeam <= minPlayers`, `minTeams <= maxTeams`); creates organizer role + chat room in a tx. |
| `GET /api/tournaments/:id` | per visibility | Overview + counts + my team + `myRole` + `capabilities`. |
| `PATCH /api/tournaments/:id`, `POST /:id/status` | organizer/manager | Edits; status transitions validated by a state machine (e.g. cannot reopen registration once IN_PROGRESS; limits locked after schedule generation unless forced). |
| `POST/DELETE /:id/roles` | organizer | Manage MANAGER / SCOREKEEPER. |
| `POST /:id/teams` | any authed user while registration open | Create team (captain = caller); enforces one team per player, minors rule, `maxTeams` (-> WAITLISTED), `requireApproval` (-> PENDING). |
| `GET /:id/teams`, `GET /:id/teams/:teamId` | per visibility | Teams + roster (member privacy: name/avatar only). |
| `PATCH/DELETE /:id/teams/:teamId` | captain, organizer | Edit, withdraw (after schedule: marks FORFEIT and flags affected matches). |
| `POST /:id/teams/:teamId/members` (invite by userId), `POST /:id/join/:joinCode` (join via link), `POST .../members/:userId/respond`, `DELETE .../members/:userId` | captain / invitee / organizer | Roster ops; every change re-validates roster rules and `rosterLockAt`; notifications. |
| `POST /:id/teams/:teamId/decision` | organizer/manager | APPROVE / REJECT / WAITLIST (+ promote waitlist when a spot opens, in tx). |
| `POST /:id/schedule/generate?preview=1` | organizer/manager | Runs stage config through the shared engines; `preview=1` returns the proposal without saving; commit replaces unfinished generated matches only (never finished ones). |
| `POST/PATCH/DELETE /:id/matches[/:matchId]` | organizer/manager | Manual add / edit (teams, time, court) / remove; conflict check from `scheduler.js`. |
| `PUT /:id/matches/:matchId/result` | organizer/manager/scorekeeper | `{ homeScore, awayScore, penalties?, details?, status, stats?, expectedVersion }`; in one tx: validate, bump `version` (409 on mismatch), set winner, advance winner/loser into downstream slots, optionally write `PlayerStatEntry` (tournamentMatchId); socket `tournament:update` (no push for results). |
| `GET /:id/standings`, `GET /:id/bracket`, `GET /:id/schedule`, `GET /:id/stats/leaders?key=` | per visibility | Computed views. |
| `POST /:id/report` | any | Reuses the Feature 1 report model (`UserReport` + optional `tournamentId`). |

Realtime: reuse the Socket.io rooms pattern (`tournament:<id>`), emit on result / schedule changes; clients also refetch on focus (as games do).

## 6. Client surfaces

Web (`next_app`): `/tournaments` (list + filters), `/tournaments/new` (wizard: basics -> teams & roster limits -> format & rules -> review), `/tournaments/[id]` (tabs: Overview, Teams, Schedule, Standings, Bracket, Stats), `/tournaments/[id]/manage` (approve teams, generate/edit schedule with drag-to-assign, enter results), `/tournaments/[id]/team/new` and team page (roster, invite, join code share).
Mobile (`mobile_app/app/tournaments/*`): same screens; bracket horizontally scrollable; score entry as a bottom sheet with large steppers; share join code via native share.
Entry points: shown when `capabilities.canCreateTournaments` (create) or at least one public tournament exists (browse). Profile gets a "tournaments" history section (respecting `privacyGames`).

Presentational components take props only (`<StandingsTable rows/>`, `<BracketView rounds/>`, `<MatchCard match/>`, `<TeamRosterEditor/>`, `<ScoreEntrySheet/>`), logic in hooks, so the design agent can restyle freely (see overview section 4).

## 7. Atomic steps (<= 3 files each)

| Step | Area | Files | Work |
| --- | --- | --- | --- |
| T-1 | schema | schema + migration | Tournament, Team, Member, Stage, Group, Match, Role models + enums. |
| T-2 | schema | schema + migration | `PlayerStatEntry.tournamentMatchId` + CHECK (raw SQL) + notification enum values (separate migration for the enum). |
| T-3..T-7 | shared | `shared/tournament/{standings,roundRobin,bracket,scheduler,rosterRules}.js` + `.d.ts` + tests (one engine per step) | Parallel with T-1/T-2. |
| T-8 | server | `server/utils/tournamentAccess.js`, `server/index.js` mount, test | `canCreateTournament`, `getTournamentRole`, `capabilities` in `/users/me`. |
| T-9 | server | `server/services/tournamentService.js` (create/read/update/state machine), `routes/tournaments.js`, test | CRUD + status transitions + chat room. |
| T-10 | server | `tournamentTeamService.js`, routes (teams/members/join), test | Registration, roster rules, waitlist promotion, concurrency on last spot (tx + unique). |
| T-11 | server | `tournamentScheduleService.js`, routes (generate/matches), test | Preview/commit, manual edits, conflict detection. |
| T-12 | server | `tournamentResultService.js`, routes (result/standings/bracket/leaders), test | Result tx with versioning + advancement + stats write. |
| T-13 | server | notification types in `notificationService.js`, prefs in `shared/notificationPrefs.js`, tests | Invite, decision, scheduled, starting soon (NO result notifications); reminder job via existing scheduler (leader-locked, idempotent). |
| T-14 | web | `services/api/tournaments.ts`, types, `useTournament*` hooks | Client layer. |
| T-15..T-18 | web | list + detail tabs; wizard; team & roster; manage console (one per step) | UI. |
| T-19..T-23 | mobile | mirror of T-14..T-18 | Parallel with web. |
| T-24 | seed + e2e | `seedDev` + `docs/dev-seed.md` + Playwright & Maestro flows | One tournament per status; flow: admin creates -> captains register -> approve -> generate -> result -> standings. |
| T-25 | admin/polish | admin tournament overview, SEO/sitemap, share cards | Optional. |

Design-agent checkpoints: D0 before T-14 / T-19 (bracket, standings, score sheet, team page, wizard); D1 after T-18 / T-23 on Dev.

## 8. Test matrix highlights

- Gating: non-creator `POST /tournaments` -> 403; creator allowlist and admin work; capability flag on `/users/me`.
- Registration races: two captains take the last spot (one APPROVED/PENDING, one WAITLISTED); player in two teams (409); roster below min cannot be approved, above max cannot be invited; lock time; minors rule.
- Engines: N = 2..32 teams for round-robin/bracket (byes, odd counts), no double booking, rest constraints, tiebreaker permutations incl. 3-way ties.
- Results: stale `expectedVersion` -> 409; editing a finished match re-resolves downstream slots and refuses if a downstream match is already finished (unless organizer force); forfeits; penalties winner.
- Permissions: scorekeeper may only write results; manager may not change roles; stranger read-only; DRAFT hidden from non-roles.
- Notifications: exactly one per event, prefs respected, no duplicates on retry.

## 9. Rollout and risks

- Feature stays invisible to normal users until the first tournament is published (creation gate + browse-only-if-exists).
- Everything additive; deploy to Dev first with the seeded tournaments; production merge only on the owner's go.
- Biggest risks: schedule generator edge cases (mitigated by pure-function tests), roster/age rules (open question in overview), result correction after advancement (mitigated by version + downstream check), notification volume (digest per team captain if noisy).
- Later: open creation to all users (flip allowlist -> `User.canCreateTournaments` / rate limit), double elimination, Swiss, live scoring, payments (out of scope: joinUp does not process payments today).
