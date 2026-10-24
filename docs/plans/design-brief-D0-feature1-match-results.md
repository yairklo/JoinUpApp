# D0 design brief - Feature 1: match results, player stats, player reports

For the design agent. Context: JoinUp is a Hebrew-first (RTL) sports meetup app (web: Next.js + Tailwind, `next_app/`; mobile: Expo + NativeWind, `mobile_app/`). Sports: SOCCER, BASKETBALL, TENNIS; per-sport identity colors in `shared/sports.js` (`SPORT_THEME`). Read `docs/plans/2026-10-feature-match-results.md` for behaviour. API is already merged on branch `feat/results-tournaments` (server `routes/games.js`, `routes/users.js`, `routes/userReports.js`, `routes/admin.js`).

Deliverable wanted back: for each surface below, a short design spec (layout for web desktop + mobile phone, spacing/typography/colour tokens to use, states, any new tokens/icons) precise enough that an implementation agent can build it as presentational components taking props. No behaviour changes; keep existing `testID` / aria labels. Reuse existing components where they exist (`GameRatingsPanel`, `ReportMessageDialog` pattern, `GameCard`, profile page sections).

## Surfaces

1. **Game result - read view** (on the game page, below the game header; visible to anyone who can see the game once the result exists): final score between two sides with side labels (team names/colors), outcome emphasis (win/draw), optional notes, "recorded by X" + small "self-reported" note, per-player stat list grouped by side (only players whose stats are visible; may be empty), sports-specific headline (tennis shows set scores like 6-4 3-6 10-7).
2. **Game result - editor** (managers only, once the game is finished): per-sport entry form. Sides score (steppers, big touch targets on mobile), tennis set rows (add/remove set), roster list of confirmed players with side assignment and sport stat fields (soccer: goals, assists, saves, cards; basketball: points, rebounds, assists, steals, blocks, 3PT, fouls; tennis: aces, double faults, winners), notes field, soft warning banner (e.g. "player goals exceed team score"), locked state ("editing closed after 7 days"), save / delete. Must be usable one-handed on a phone at the end of a game.
3. **Result badge on match-history cards** (profile): compact W/D/L chip + score ("3-2") + 1-2 personal stats (e.g. "2 שערים"). Hidden entirely when not visible.
4. **Profile stats section**: header numbers (games, W/D/L, win rate), per-sport tabs/segments with headline stats (totals + per game), empty state ("no results yet"), and the hidden states: viewer sees nothing/placeholder; owner sees "visible only to you" when they hide it.
5. **Settings toggle**: "Hide my match stats" (`hideMatchStats`), with helper text; sits next to existing privacy settings.
6. **Report a player dialog**: reason list (harassment, violence, cheating, no-show, fake profile, inappropriate content, other), optional details (max 1000 chars), success confirmation that does not reveal anything about blocks. Entry points: profile overflow menu, and next to a teammate in the game ratings panel. Follow `ReportMessageDialog` visually.
7. **Result dispute entry** (participants): small "this result is wrong" action in the read view -> same dialog with reason RESULT_DISPUTE.
8. **Admin: player reports queue** (inside admin moderation, new tab): list with reporter/target, reason chips, details, game context link, status filter (open/resolved/dismissed), actions resolve / dismiss / resolve + ban with confirm.

## Data shapes (what the UI receives)

- `GET /api/games/:id/result` -> `{ eligible, canEdit, locked, sport, result: { id, status, sport, sides:[{id, order, teamId, label, score, sets|null, outcome:'WIN'|'LOSS'|'DRAW'}], stats:[{userId, sideId, values:{goals:2,...}}], notes, recordedBy:{id,name}, lockedAt, ... } | null, roster:[{userId,name,imageUrl,sideId?}] }` (read the service for the exact final shape: `server/services/gameResultService.js`).
- `PUT /api/games/:id/result` body `{ sides:[{teamId?,label,score,sets?}], stats:[{userId, sideOrder, values}], notes }` -> same view + `warnings[]`.
- `GET /api/users/:id/stats?sport=` -> `{ visible, hiddenReason?: 'USER_HIDDEN'|'PRIVATE', sports:[{sport, games, wins, draws, losses, totals:{key:n}, perGame:{key:n}}] }`.
- Profile payload additions: `statsSummary` (headline numbers) and `matchHistory[].result = { outcome, score:'3-2', myStats:{} }`, both absent when hidden; `hideMatchStats` boolean in settings.
- `POST /api/user-reports` `{ targetId, reason, details?, gameId? }` -> `201 { ok:true }` always.
- Stat labels/order/which are headline: `shared/matchStats.js` (labels he/en).

## States to design for every surface

Loading skeleton, empty, error + retry, long Hebrew names (2 lines truncation), RTL (numbers/score order: define clearly which side is shown on the right in RTL), dark mode, small phone (360px), a game with no teams (tennis singles), a minor profile with hidden stats, owner vs viewer, locked result, saving in progress, offline error.

## Constraints

- Tokens only (Tailwind theme on web, NativeWind classes on mobile, `SPORT_THEME` for sport accents); no hardcoded hex in components.
- Accessibility: contrast AA, touch targets >= 44px on mobile, labels for steppers.
- Keep the visual language of the existing game page and profile; this is an extension, not a redesign.
- Stats are self-reported by game managers: copy must not imply verified/competitive rankings.
- Please also propose empty-state and microcopy in Hebrew (and English for mobile locales).

## Process

Implementation agents are building the API client, types and hooks first (no visual work). When your specs arrive they build the presentational components; then a D1 pass restyles on the running Dev environment with seeded data.
