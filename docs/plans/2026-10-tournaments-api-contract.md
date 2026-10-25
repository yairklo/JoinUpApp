# Tournaments API contract (server, as implemented)

Base: `/api/tournaments`. Auth = Clerk bearer token. "opt" = optional auth (guests allowed, drafts hidden).
Errors: `{ "error": string, "code": string, ...extra }`. Hidden tournaments (DRAFT for non-roles, non-public for outsiders) answer **404**.
Roles: `ORGANIZER` (owner, ORGANIZER row, site admin) > `MANAGER` > `SCOREKEEPER`. Realtime: join room with socket event `joinTournament` (tournamentId), receive `tournament:update` `{ tournamentId, type: 'teams'|'schedule'|'result'|'status', matchId?, changedMatchIds?, at }` and refetch. No push/in-app notification for results.

## Capabilities / list / create
| Route | Auth | Request | Response |
| --- | --- | --- | --- |
| `GET /capabilities` | user | - | `{ canCreateTournaments: boolean }` (admin or `TOURNAMENT_CREATOR_IDS`) |
| `GET /?status=&sport=&city=&mine=1&limit=&offset=` | opt | status may be comma separated | `Tournament[]` summaries (`approvedTeams`, no `rules`) |
| `POST /` | creator (403 otherwise) | `{ title, description?, sport: SOCCER\|BASKETBALL\|TENNIS, format: LEAGUE\|KNOCKOUT\|GROUPS_KNOCKOUT\|CUSTOM, startsAt, endsAt?, fieldId?, customLocation?, imageUrl?, isPublic?=true, openToMinors?=false, registrationOpensAt?, registrationClosesAt?, rosterLockAt?, minTeams?=2, maxTeams, startersPerTeam, minPlayersPerTeam, maxPlayersPerTeam, requireApproval?=true, rules? }` | 201 `Tournament` (status DRAFT, `myRole: 'ORGANIZER'`) |
| `GET /:id` | opt | - | `Tournament & { myRole, myTeam: {id,name,status,memberStatus,memberRole,isCaptain}\|null, counts: {teamsApproved, teamsPending?, teamsWaitlisted?, matchesTotal, matchesFinished}, capabilities: {canManage, canScore, canManageRoles, canRegisterTeam} }` |
| `PATCH /:id` | manager+ | any create field (+ `force: true` organizer only to change limits/format after a schedule exists) | `Tournament` |
| `POST /:id/status` | manager+ | `{ status, force? }` | `Tournament & { previousStatus }` |

`rules` (all optional, defaults shown): `{ points:{win:3,draw:1,loss:0}, tiebreak:['HEAD_TO_HEAD','GOAL_DIFFERENCE','GOALS_FOR'], forfeitScore:{winner:3,loser:0}, legs:1|2, matchMinutes, breakMinutes:0, minRestMinutes:0, thirdPlace:false, seeding:'MANUAL'|'RANDOM', groupCount:2, advancePerGroup:2, bestOf:3|5 (tennis) }`.
Status machine: `DRAFT -> REGISTRATION_OPEN -> REGISTRATION_CLOSED -> IN_PROGRESS -> COMPLETED`; `REGISTRATION_CLOSED -> REGISTRATION_OPEN` only before a schedule exists; any non-final -> `CANCELLED` (cancels unfinished matches). Start needs `>= minTeams` approved teams, every approved roster within min/max, and a schedule (`409 CANNOT_START { problems[] }`, organizer `force` overrides).

## Roles
`GET /:id/roles` (manager+) -> `[{ userId, role, name, imageUrl }]`; `POST /:id/roles` (organizer) `{ userId, role: 'MANAGER'|'SCOREKEEPER' }` -> `{ userId, role }`; `DELETE /:id/roles/:userId` (organizer) -> `{ ok: true }`.

## Teams and roster
Team: `{ id, tournamentId, name, color, logoUrl, captainId, status: PENDING|APPROVED|REJECTED|WAITLISTED|WITHDRAWN, seed, manualRank, groupId, memberCount, joinCode? (captain/manager only), members: [{ userId, name, imageUrl, role: CAPTAIN|PLAYER|SUBSTITUTE, status, jerseyNumber }] }`. Public viewers see APPROVED teams and ACCEPTED members only.

| Route | Auth | Request | Response |
| --- | --- | --- | --- |
| `POST /:id/teams` | user, registration open | `{ name, color?, logoUrl? }` | 201 `{ team, waitlisted }` (status WAITLISTED when full, else PENDING / APPROVED per `requireApproval`) |
| `GET /:id/teams?status=` | opt | - | `{ tournamentId, teams: Team[] (+isMine) }` |
| `GET /:id/teams/:teamId` | opt | - | `Team` |
| `PATCH /:id/teams/:teamId` | captain, manager+ | `{ name?, color?, logoUrl?, seed?, manualRank? }` (seed/manualRank manager only) | `Team` |
| `DELETE /:id/teams/:teamId` | captain, manager+ | - | `{ ok, affectedMatchIds, promotedTeamIds }` (scheduled matches become FORFEIT, or POSTPONED if opponent TBD) |
| `POST /:id/teams/:teamId/decision` | manager+ | `{ decision: 'APPROVE'\|'REJECT'\|'WAITLIST' }` | `{ team, promotedTeamIds }` (`409 ROSTER_INVALID` below min, `409 TOURNAMENT_FULL`) |
| `POST /:id/teams/:teamId/join-code/rotate` | captain, manager+ | - | `{ joinCode }` |
| `POST /:id/teams/:teamId/members` | captain, manager+ | `{ userId }` | 201 / 200 (repeat) `{ member }` |
| `POST /:id/teams/:teamId/members/:userId/respond` | the invitee | `{ accept: boolean }` | `{ member, accepted }` (accepting voids the user's other pending invites) |
| `PATCH /:id/teams/:teamId/members/:userId` | captain, manager+ | `{ jerseyNumber?, role?: PLAYER\|SUBSTITUTE }` | `member` |
| `DELETE /:id/teams/:teamId/members/:userId` | the member, captain, manager+ | - | `{ ok: true }` (captain cannot be removed) |
| `POST /:id/join/:joinCode` | user | - | `{ member, team }` (rejected once registration is closed) |
| `GET /my-invites` | user | - | `[{ tournamentId, tournamentTitle, sport, startsAt, teamId, teamName, teamColor, captainName, invitedAt }]` |

Roster errors (`code`): `PLAYER_IN_OTHER_TEAM`(409) `TOO_MANY_PLAYERS`(409) `MINORS_NOT_ALLOWED`(403) `ROSTER_LOCKED`(409) `REGISTRATION_CLOSED`(409) `NAME_TAKEN`(409) `INVALID_CODE`(404) `CAPTAIN_CANNOT_LEAVE`(409).

## Schedule and matches
Match: `{ id, number, stageId, groupId, round, status: SCHEDULED|LIVE|FINISHED|FORFEIT|POSTPONED|CANCELLED, home: {teamId, team:{id,name,color,logoUrl}|null, source}, away: {...}, scheduledAt, fieldId, courtLabel, homeScore, awayScore, homePenalties, awayPenalties, details ({sets:[[6,4],..], bestOf}), winnerTeamId, version }`. `source` = `{ type:'WINNER_OF'|'LOSER_OF', matchId }` or `{ type:'GROUP_RANK', groupId, rank, pos }` or `{ type:'LEAGUE_RANK', stageId, rank, pos }` or null.

| Route | Auth | Request | Response |
| --- | --- | --- | --- |
| `POST /:id/schedule/generate?preview=1` | manager+ | `{ seed?, allowConflicts?, schedule?: { days?: [{date:'YYYY-MM-DD', from:'HH:mm', to:'HH:mm'}] (Asia/Jerusalem), windows?: [{start,end ISO}], courts?: number\|string[], matchMinutes?, breakMinutes?, minRestMinutes?, stepMinutes? } }` | preview: `{ preview:true, stages, matches:[{key,number,stageKey,groupKey,round,home:{teamId,source},away,scheduledAt,courtLabel}], conflicts, teamCount }`; commit: `{ preview:false, matchCount, scheduledCount, conflicts }`. Needs REGISTRATION_CLOSED or IN_PROGRESS; refused with `SCHEDULE_HAS_RESULTS` once a result exists; `SCHEDULE_CONFLICTS` unless `allowConflicts` |
| `POST /:id/matches` | manager+ | `{ stageId?, groupId?, round?, homeTeamId?, awayTeamId?, scheduledAt?, courtLabel?, fieldId?, force? }` | 201 `{ match, conflicts }` (`409 SCHEDULE_CONFLICT { conflicts }` unless `force`) |
| `PATCH /:id/matches/:matchId` | manager+ | `{ homeTeamId?, awayTeamId?, scheduledAt?, courtLabel?, fieldId?, round?, status?: SCHEDULED\|LIVE\|POSTPONED\|CANCELLED, force? }` | `{ match, conflicts }` |
| `DELETE /:id/matches/:matchId` | manager+ | - | `{ ok }` (`409 MATCH_REFERENCED`, `MATCH_FINISHED`) |

Conflict types: `NO_SLOT, DEPENDENCY_UNSCHEDULED, COURT_OVERLAP, TEAM_OVERLAP, TEAM_REST, OUTSIDE_WINDOW`.

## Results
`PUT /:id/matches/:matchId/result` (scorekeeper+, tournament IN_PROGRESS):
`{ expectedVersion: number (required), status: 'FINISHED'|'FORFEIT'|'LIVE'|'SCHEDULED'(undo), homeScore, awayScore, penalties?: {home,away} (knockout draws), details?: { sets: [[6,4],[3,6],[7,5]] } (tennis), forfeitBy?: teamId, stats?: { [userId]: { goals: 2 } }, force?: boolean (organizer only) }`
-> `{ match, changedMatchIds, warnings: [{code:'PLAYER_SUM_EXCEEDS_SCORE', key, sum, teamScore, teamId}] }`.
Errors: `409 VERSION_CONFLICT { currentVersion }`, `409 DOWNSTREAM_FINISHED { matchId, canForce }`, `400 NEEDS_PENALTIES`, `400 INVALID_RESULT|INVALID_SCORES|INVALID_STATS`, `409 NOT_IN_PROGRESS`, `409 TEAMS_UNKNOWN`.
Winners/losers advance automatically (WINNER_OF / LOSER_OF); group ranks resolve once **all** matches of the group are FINISHED/FORFEIT; unseparable ties need `PATCH team { manualRank }` first.

## Computed views (opt auth, visibility as `GET /:id`)
- `GET /:id/schedule?teamId=&status=&stageId=&from=&to=` -> `{ tournamentId, stages:[{id,order,type,name,config,groups:[{id,name}]}], matches: Match[] }`
- `GET /:id/standings` -> `{ tournamentId, tables:[{ stageId, stageName, stageType, groupId, groupName, complete, needsManualRank, manualOrder, rows:[{ rank, team:{id,name,color,logoUrl}, played, won, drawn, lost, gf, ga, gd, points, autoPoints, pointsAdjustment, adjustmentReason, tied, manualRank, withdrawn? }] }] }`
- `PUT /:id/standings/override` (manager+) `{ stageId, groupId|null, teamOrder:[teamId...], adjustments?:[{ teamId, points, reason }] }` -> `{ ok, changedMatchIds }`. `teamOrder` must list every team currently in that group/league table once. `points` is a non-zero integer from -100 to 100; `reason` is required (1–200 chars). Replaces any previous override for that table.
- `DELETE /:id/standings/override` (manager+) `{ stageId, groupId|null }` -> `{ ok, changedMatchIds }`. 404 when that table has no override.
- `GET /:id/bracket` -> `{ tournamentId, stages:[{ stageId, name, rounds:[{ round, name, matches:[Match & {isThirdPlace}] }] }] }`
- `GET /:id/stats/leaders?key=&limit=` -> `{ tournamentId, key, label:{he,en}, keys, leaders:[{ rank, userId, name, imageUrl, teamId, teamName, value, matches }] }` (users with `hideMatchStats` excluded)

### How a standings override interacts with automatic results
Automatic columns (`played`, W/D/L, goals, goal difference, `autoPoints`) are always recomputed from finished/forfeit matches and are not stored. With no override, the table order is that automatic ranking; `TournamentTeam.manualRank` still pins a team to break a tie the tiebreakers could not separate.

When an override exists (`manualOrder: true`):
- The published order is `teamOrder` until a manager resets (deletes) it. Teams that join the table later and are missing from the saved list are appended in automatic order.
- Displayed `points` = `autoPoints` + `pointsAdjustment`. Adjustments do not change W/D/L or goals, and they do **not** re-sort the table. A new result updates the automatic columns (and therefore the displayed points) on the next read; the saved order stays.
- `needsManualRank` is false: the manual order separates ties. Per-team `manualRank` pins are ignored for ordering until reset, then they apply again.
- Knockout `GROUP_RANK` slots follow this same order. A knockout slot seeded from a single-table stage (`LEAGUE_RANK`, or `GROUP_RANK` with `stageId` and no `groupId`) uses that same published table, including points adjustments. A single-table stage is any stage that is not `GROUP` and not `KNOCKOUT`, the same rule as this endpoint. Group-fed `GROUP_RANK` slots are unchanged. The write is refused with `409 OVERRIDE_BLOCKED` when a finished downstream match would have to change, and nothing is saved.
- Draft and cancelled tournaments refuse the write with `409 TOURNAMENT_CLOSED`. Scorekeepers and other users get `403`. Viewers only see the note and the per-row reason; they cannot edit.

## Notifications (types already in the schema)
`TOURNAMENT_TEAM_INVITE` (invitee), `TOURNAMENT_TEAM_DECISION` (captain, also waitlist promotion), `TOURNAMENT_MATCH_SCHEDULED` (players of both teams; one digest per player on bulk generation), `TOURNAMENT_STARTING_SOON` (players, 60 min before, from the leader-locked job). Preference categories reuse `invitations` / `myGames` / `gameReminders`. `data` always has `tournamentId` and `link: '/tournaments/<id>'`; match notifications add `matchId`.

## Notes for implementers
- The reminder claim is stored as `details.reminderSentAt` on the match (no schema change); the API strips it from `details`.
- `POST /:id/report` is not part of this server step (player reports live in the reports API: `UserReport.tournamentId`).
