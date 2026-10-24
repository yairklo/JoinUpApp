# D0 design brief - Feature 2: tournaments

For the design agent. Same context and constraints as [design-brief-D0-feature1-match-results.md](./design-brief-D0-feature1-match-results.md) and the finished spec [design-spec-D0-feature1.md](./design-spec-D0-feature1.md): reuse its global decisions (RTL score order rule 1.1, outcome colours, sport accent usage rules, typography, spacing, touch targets, icons, copy tone, state matrix 1.8, testid conventions). Do not re-decide those; extend them. Hebrew-first RTL, web `next_app/` (MUI `sx` + Tailwind layout, Heebo) and mobile `mobile_app/` (NativeWind, `dark:` variants, he + en i18n).

Behaviour: [2026-10-feature-tournaments.md](./2026-10-feature-tournaments.md). API as implemented: [2026-10-tournaments-api-contract.md](./2026-10-tournaments-api-contract.md) (read it: statuses, roles, error codes and realtime are defined there).

Deliverable: `docs/plans/design-spec-D0-tournaments.md` with, per surface: layout desktop + 360px phone, tokens, states, Hebrew + English microcopy, testIDs, and mobile i18n key list, precise enough for implementation agents to build presentational components with props only. PR into `feat/results-tournaments` (not main), the spec file only.

## Product rules that shape the UI

- Creation is admin-only for now (`GET /api/tournaments/capabilities`); every create/manage entry point must be hidden unless allowed, and designed so it can open to all users later.
- Roles: ORGANIZER > MANAGER > SCOREKEEPER; captains manage their own team; players see their team. The same tournament page looks different per role (`myRole`, `capabilities`).
- Roster size is a range (`minPlayersPerTeam..maxPlayersPerTeam`, substitutes included, `startersPerTeam` on the field). Teams are valid only inside the range.
- Number of matches depends on format and team count; the organizer can add, edit, remove matches by hand after generating.
- Formats: LEAGUE (table), KNOCKOUT (bracket), GROUPS_KNOCKOUT (group tables then bracket), CUSTOM (manual list). Sports: SOCCER, BASKETBALL, TENNIS (tennis matches carry sets).
- No notifications for results; realtime refresh only (`tournament:update` socket event) on open screens. Show a subtle "updated" cue rather than toasts.
- Minors cannot join in v1 (server rejects with `MINORS_NOT_ALLOWED`): a clear, kind state, not an error.
- Stats are self-reported; top-scorer style views must not read as official rankings.

## Surfaces (design all, web + mobile)

1. **Tournament list / discovery**: cards (cover/sport accent, title, dates, venue/city, status chip, teams `x/max`, "registration open until..."), filters (sport, status, "mine"), empty state. Entry point in the main navigation shown only when relevant (creators, or at least one public tournament exists).
2. **Tournament page shell (hero + tabs)**: hero with status, dates, venue, progress ("12/20 matches played"), role-aware primary CTA (register a team / manage / view my team); tabs: Overview, Teams, Schedule, Standings, Bracket (only for knockout stages), Top players. Tab bar behaviour on phone (scrollable, RTL order), realtime "updated" cue.
3. **Create / edit tournament wizard** (creators only): steps basics -> teams and roster limits (min/max teams, starters, min/max players with a visual range slider/steppers and live validation) -> format and rules (points, tiebreakers order, legs, third place, group count and advance count, tennis best-of) -> registration window and approval -> review. DRAFT save, publish (status transitions with consequence copy).
4. **Register a team + captain's team page**: create team (name, colour, logo), roster list with role chips (captain/player/substitute), roster-size meter (min..max with starters marker), invite players (search + friends), join code share/rotate, pending/accepted/declined states, status banners (pending approval, approved, waitlisted with position, rejected), withdraw. Error states for the known codes (`PLAYER_IN_OTHER_TEAM`, `TOO_MANY_PLAYERS`, `ROSTER_LOCKED`, `REGISTRATION_CLOSED`, `NAME_TAKEN`, `MINORS_NOT_ALLOWED`).
5. **Invitee flow**: "my invites" list and accept/decline screen, join-by-code screen (deep link `/tournaments/<id>`), accepting voids other invites (explain it).
6. **Teams tab**: grid/list of approved teams with logo, colour, roster count; team detail sheet (members with jersey numbers, privacy: name and avatar only).
7. **Schedule tab**: matches grouped by day/round with time, court, teams (or placeholders "winner of match 5", "1st in group A"), status chips (scheduled, live, finished, forfeit, postponed, cancelled), filters by team/day/status, "my team" highlight, add to calendar.
8. **Standings tab**: table per stage/group (rank, team, P, W, D, L, GF, GA, GD, Pts) usable on a 360px RTL phone (sticky team column, which columns collapse, how ties and `manualRank` / `needsManualRank` are shown, qualification zone marker, "table incomplete" state).
9. **Bracket view**: single-elimination rounds with connectors, byes, third-place match, placeholders for unresolved slots, horizontal scroll/snap on mobile, zoom or round-by-round mode, RTL direction of flow (decide and justify), winner path highlight, tennis set display inside a bracket cell.
10. **Match detail**: scoreboard (reuse rule 1.1), status, venue/time, tennis set grid, penalties, per-player stats if present, history of changes not needed. Role-based actions.
11. **Manage console (organizer/manager)**: (a) teams queue (approve/reject/waitlist, roster validity badges, seeding and `manualRank` editing); (b) schedule builder: generate with parameters (days/time windows in Israel time, courts, match and break minutes, rest), **preview before commit**, conflicts list with explanations (`COURT_OVERLAP`, `TEAM_OVERLAP`, `TEAM_REST`, `OUTSIDE_WINDOW`, `NO_SLOT`, `DEPENDENCY_UNSCHEDULED`), manual add/edit/remove/move of matches (drag-and-drop on desktop, tap-to-edit on phone); (c) status controls with consequence confirmations (close registration, start, cancel; `CANNOT_START` problems list; organizer force); (d) roles (add manager/scorekeeper).
12. **Score entry (scorekeeper+)**: fast, one-handed bottom sheet on phone: big steppers, status (live/finished/forfeit), penalties when a knockout is drawn (`NEEDS_PENALTIES`), tennis sets, optional per-player stats, optimistic-concurrency conflict state (`VERSION_CONFLICT`: show the newer score and ask to reapply), `DOWNSTREAM_FINISHED` warning with organizer force, undo to scheduled.
13. **Top players tab**: leaders for a stat key (goals, assists, points...), key switcher, "self-reported" note, hidden players simply absent.
14. **Profile: tournaments history section** (respecting profile privacy) and a small "my next match" card on the home screen when the user is on an active team.
15. **Admin overview** (optional, low priority): list of all tournaments with status.

## States and edge cases to design

Loading skeletons per tab, empty states per tab (no teams yet, no schedule yet, no results yet), error + retry, offline, long Hebrew team names (2 lines, 1 line in tables), 2 teams vs 32 teams (bracket and table density), odd team counts (byes), tournament cancelled, finished tournament (champion moment: podium/winner banner, share card), registration closed, roster locked, team withdrawn after scheduling (forfeit display), RTL numerals and score order, dark mode, 360px, tablet, keyboard open in forms, role differences (guest, player, captain, scorekeeper, manager, organizer, admin).

## Constraints

- Tokens only; sport accents from `SPORT_THEME` with the contrast rules already defined; team colours only as swatches (with the ring).
- Touch targets >= 44px (56px for score steppers). AA contrast. Labels for steppers and icon buttons.
- Keep `testID` / aria conventions; propose new ones per surface.
- Propose any new icons/tokens explicitly and keep them minimal.
- Flag any place where the API does not give the UI what the design needs (list as "API gaps", like section 12 of the Feature 1 spec).

## Process

Server and shared engines are merged on the integration branch; Feature 1 UI is finished first. Tournament implementation agents start only after your spec is merged. A D1 pass will restyle the real screens on Dev with seeded tournaments.
