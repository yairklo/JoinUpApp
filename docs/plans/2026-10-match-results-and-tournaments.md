# Plan: Match Results & Tournaments (overview)

Status: plan merged for review in PR #387; implementation in progress on integration branch `feat/results-tournaments` (wave 1 merged: schema, shared stats, shared tournament engines). Date: 2026-10-21. Owner: yairklo. Revised after external review (see section 8).

Detailed plans:
- [Feature 1 - Match results, player stats, user reports](./2026-10-feature-match-results.md)
- [Feature 2 - Tournaments](./2026-10-feature-tournaments.md)

Hebrew summary (תקציר): שני פיצ'רים. (1) דיווח תוצאות משחק + סטטיסטיקות שחקן לפי ענף, עם יכולת הסתרה בפרופיל, ודיווח על שחקן למנהלי האתר. (2) טורנירים (בהתחלה רק למנהל האתר): רישום קבוצות עם טווח גודל, יצירת לוח משחקים, תוצאות, טבלאות ושלבי נוק-אאוט. פיצ'ר 1 נבנה קודם כי טורנירים משתמשים בתשתית הסטטיסטיקות שלו.

## 1. What exists today (verified in the repo)

| Area | Today | Where |
| --- | --- | --- |
| Player rating | 1-5 stars, one row per rater/target/game, eligible 90 min after start or `COMPLETED` | `model UserRating`, `server/utils/ratings.js`, `POST /api/users/:id/rate`, `GET /api/games/:id/ratings`, `GameRatingsPanel.tsx` (web + mobile) |
| Rating summary on profile | `ratingAverage`, `totalRatings` | `GET /api/users/:id` |
| Game end | Scheduler flips `OPEN` -> `COMPLETED` at start+duration | `server/services/gameScheduler.js` (`_checkCompletion`) |
| Game roles | `ORGANIZER` (organizerId), `MANAGER`, `CAPTAIN`, `MODERATOR`; `ROLE_LEVEL` 3/2/0.5/1 | `gameService.js` `getRoleLevel`, `canManageGame` |
| Teams inside a game | `Team` (name, color, managerId) + `Participation.teamId` | `routes/gameTeams.js` |
| Profile privacy | `privacyGames` (age-based default for minors), `hideGroups`, `canViewSection` | `routes/users.js` |
| Match history | paginated `GET /api/users/:id/match-history` (id, title, sport, start) | `routes/users.js` |
| Reporting | Chat-message report (-> `FlaggedMessage`), field comment/issue flags, `SupportMessage` (BUG/FEEDBACK), admin ban/unban | `routes/messages.js`, `routes/admin.js`, `routes/support.js` |
| **Report a player's behaviour** | **Not found.** Only message reports and free-text support exist. Needs a new `UserReport`. | - |
| Admin check | `req.user.isAdmin` (Clerk metadata or `ADMIN_USER_IDS`) | `server/utils/admin.js` |
| Shared libs | `shared/` (sports palette/positions, manage, ageGate, ...) with jest tests, consumed by server, web, mobile | `shared/` |

## 2. Cross-cutting decisions

1. **One stats engine for both features.** Per-player stats are stored as key/value rows (`PlayerStatEntry`), keyed by a sport schema defined once in `shared/matchStats.js`. A row belongs to a casual `Game` (feature 1) or to a `TournamentMatch` (feature 2). Adding a stat (e.g. "yellow cards") is a one-line shared-schema change, no migration.
2. **Pure logic lives in `shared/`** (stat schemas, validation, standings + tiebreakers, round-robin and bracket generators). Pure functions with exhaustive jest tests; server, web and mobile import them. This is also the safest layer for agents to work on in parallel.
3. **Permissions reuse `getRoleLevel`.** "Game manager, not only the opener" = level >= `MANAGER` (organizer, MANAGER role, admin). Captains/moderators cannot write results.
4. **Privacy**: stats follow the existing `privacyGames` rule (incl. minors default) AND a new explicit user switch `hideMatchStats`. The owner always sees their own. The same gate applies on the game page: per-player stats of a user who hid them (or who fails the privacy/minor gate for the viewer) are not returned there either; only team-level scores remain.
5. **Stats are self-reported** by game managers and unverified. They never feed rankings, rewards or leaderboards.
6. **Tournament creation is gated** by a single server helper `canCreateTournament(user)` (admin or env allowlist `TOURNAMENT_CREATOR_IDS`, later a per-user flag). The client learns it from `GET /api/users/me` (`capabilities.canCreateTournaments`) so no client code hardcodes "only Yair".
7. **Migrations**: additive only (new tables, nullable columns, enum values added in their own migration). Old mobile builds are still in use, so every existing response keeps its shape; new fields are optional. No change to existing endpoints' required inputs.
8. **Repo rules honoured**: shared Prisma client, interactive transactions with `tx.*`, <=3 files per atomic step, schema/migration steps never mixed with UI steps, server tests per route, `testing-jest.mdc` conventions (run only the new test files locally).

## 3. Sequencing

```
F1-A schema -> F1-B shared stats lib -> F1-C server (result + stats + privacy + reports)
   -> F1-D web  \
   -> F1-E mobile / -> F1-F admin reports UI
                                  \
T-A schema -> T-B shared engines (standings, round-robin, bracket) -> T-C..T-F server
   -> T-G web  / T-H mobile  -> T-I notifications/chat/realtime -> T-J polish
```
- F1 server and the tournament **shared engines (T-B)** are independent and can run in parallel (different files).
- Web and mobile for the same feature can run in parallel once the API contract (section "API contract" in each plan) is merged.
- Tournaments need F1-A/B (stat entries + shared schema) merged first.

## 4. Where to bring in the high-level design agent

Answering the question directly: **not only after the basic frontend, and not at the very start. Two touchpoints, plus a final polish.**

| # | When | What the design agent gets | Why then |
| --- | --- | --- | --- |
| D0 | Right after the API contract + shared types are merged, **before** any UI code | Written brief per surface, the real JSON shapes, 3 sports, states (empty / loading / error / long Hebrew names / RTL / dark mode / minor-hidden stats), and the list of "novel" surfaces below | Designing blind earlier would invent data that does not exist; designing after the UI is built risks redoing component structure (bracket and mobile score entry change the layout, not just the colours) |
| D1 | After the **basic functional frontend** works on the dev environment with seeded data | The running dev web + Maestro/Expo screens with real results and a seeded tournament | It restyles real screens with real data, in the presentation layer only |
| D2 | End of each feature | Final polish: motion, empty states, share cards, icons | Low risk |

Novel surfaces worth the design agent's time (the rest follows existing patterns): tournament **bracket view** (mobile especially), **standings table** (RTL, many columns on a phone), **live score entry** (big touch targets, one-hand), **player stats card** on profile (3 sports), **post-game "result recorded" share card**, tournament **hero / team page**.

To make the hand-off cheap:
- Frontend steps build **logic in hooks + dumb presentational components that take props** (`useGameResult`, `useTournament`, `<StandingsTable rows />`, `<BracketView rounds />`). The design agent then changes only presentational files and never touches API/state code.
- Use the existing tokens (`shared/sports.js` SPORT_THEME, Tailwind on web, NativeWind on mobile); no hardcoded colours in new components.
- Extend `docs/dev-seed.md` / `seed:dev` with finished games with results and one tournament in each state, so D1 reviews real data. (Included as step in each feature plan.)
- Tell the design agent the 3-file rule and that behaviour/test ids (`testID`, aria labels used by Playwright/Maestro) must be preserved.

## 5. Risks and open questions (need owner answers; defaults are stated)

1. ~~"רשימת משחקים בגודל משתנה"~~ - RESOLVED by owner: the number of matches varies with format and team count, and the organizer can add/remove matches manually. This is what the tournament plan already specifies (generator + manual add/edit/remove endpoints); on-field team size stays fixed per tournament.
2. Minors in tournaments: v1 default = `openToMinors=false`, enforced on the server (minors cannot join or be invited); revisit as a legal/product decision later. Previous idea: follow age gate; a minor can join only if the tournament is marked open to minors, and minors/adults are not mixed unless the organizer opts in. Needs a legal/product call.
3. Result disputes: default = managers may edit for 7 days counted from the FIRST write (edits never extend it), then locked (admin can reopen); any participant can flag a result, which lands in the admin queue.
4. Stats input: default = manager enters per-player numbers after the game (not live). Live scoring is limited to tournament matches (score only) in v1.
5. Tennis modelled as sides (singles = 1 player, doubles = 2) with set scores; no per-point tracking.
6. ~~Result notifications~~ - RESOLVED by owner: none. No push / in-app notification for game or tournament-match results (clients see them on refresh / realtime socket for open tournament screens).
7. Public tournaments are visible to everyone (SEO sitemap later). Entry points in the apps appear only once at least one tournament is published, or for creators.

## 6. Definition of done (both features)

- All server routes covered by jest tests (permission matrix, privacy, concurrency on result edits).
- `shared/` pure libs at >=95% branch coverage on standings/bracket logic.
- `next_app` build + typecheck, `mobile_app` typecheck/lint green; one Playwright flow and one Maestro flow per feature.
- Hebrew + English strings (mobile i18n locales; web copy follows existing approach), RTL checked.
- Deployed first to the **Dev** environment, reviewed there, then merged to `main` (merge = production deploy; owner decides).

## 7. Execution model (agreed with owner)

- Integration branch `feat/results-tournaments` (cut from this plan branch). Every agent works in its own worktree and opens a PR **into the integration branch**, never `main`.
- Wave 1 (parallel): schema (F1-1 + T-1 + T-2, one agent, sequential migrations), shared `matchStats` (F1-2), shared tournament engines (T-3..T-7).
- Wave 2 (after wave 1 merges into the integration branch): server F1 (F1-3..6b), server tournaments (T-8..T-12) as separate agents on disjoint files; then web and mobile agents per feature once API contracts are in.
- Each agent finishes with an initial implementation, then **code review (L3 / `/code-review`) happens before anything is pushed to `Dev`**. Only the reviewed integration branch is pushed to `Dev` (Coolify dev API + Vercel Preview), where extra tests (Playwright / Maestro) can run.
- Never push to `main`; merge to `main` (= production deploy) only on the owner's explicit say-so.
- D0 design brief: delivered to the owner (or to an Opus session if one can be opened) once the API contract + shared types are merged into the integration branch.

## 8. Revisions after review (2026-10-21)

Applied: stats self-reported + same privacy gate on game page; result entry only after `start + duration`, status COMPLETED, or an explicit manager "finish game"; lock counted from first write; `PlayerStatEntry.sideId` becomes a real FK (`SetNull`) and sides are upserted by `[resultId, order]`; `UserReport.tournamentId`; one ACCEPTED team per player via partial unique index (invites unrestricted); `TournamentTeam.manualRank` and rule that `GROUP_RANK` resolves only when the group is finished; join code rotation/expiry; `openToMinors=false` enforced in v1; scheduler works in Asia/Jerusalem incl. DST; standings cache removed; F1 steps renumbered. Schema corrections ship as a follow-up migration on the integration branch.

## 9. Scope and ordering decision (owner, 2026-10-21)

- Tournament scope stays FULL as planned (all formats, self-registration, waitlist, SCOREKEEPER, auto-scheduler).
- Ordering: tournament **server + shared** work continues in parallel, but **Feature 1 UI (web + mobile) is finished first**; tournament web/mobile UI starts only after Feature 1 UI is merged into the integration branch. D0 for Feature 1 happens before its UI work; D1 on the real Feature 1 screens on Dev; tournament D0 afterwards.
