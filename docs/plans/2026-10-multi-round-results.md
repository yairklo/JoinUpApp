# Multi-round results (pickup evening)

A game result is still one row per game. It can now hold N rounds (a pickup evening, for example three teams and "winner stays"). A result with one round behaves as before.

## Two lineup modes

- **Fixed teams** (`FIXED_TEAMS`): the game's teams stay. Only the pairing changes. Quick-add keeps the winner and brings on the team that sat out. A draw keeps the previous challenger. With only two teams they play again.
- **Rotating lineups** (`ROTATING_LINEUPS`): each round's sides are player lists. Quick-add copies the previous round's players (goals cleared) so the organizer edits the change instead of picking everyone again.

Scorers are optional. In fixed mode the server also records every confirmed player of a side's team, with 0 goals if they did not score, so a player who did not score still gets that round's W/D/L.

## Profile stats

Choice, applied in `server/services/userStatsService.js`:

| Counter | What it counts |
| --- | --- |
| `games` / `gamesPlayed` | The evening **once**. Rounds never multiply games played. |
| `wins` / `draws` / `losses` | **Match** results. Incremented only when the game has a single round (every historical result, and every new one-score save). A multi-round evening has no single winner, so it does not change these and does not increment `gamesWithOutcome`. |
| `roundWins` / `roundDraws` / `roundLosses` | **Separate.** One increment per round the player took part in. A single-round game contributes one here too, so the two counters match until someone records an evening. |
| `totals.goals` / `totals.points` | The sum across the evening, written once on `PlayerStatEntry`. |

The profile shows the round line only when round results outnumber match results, so players who only have ordinary scores see the same card as before.

## Migration

`20261024200000_game_result_rounds` adds the round tables and `GameResult.lineupMode` (nullable). Every existing result gets one round (`order = 1`) and its sides point at that round. Scores, outcomes, and stat rows are not rewritten or deleted. `lineupMode` stays null, which is the single-score shape.

## Permissions

The same people who can record today's result (manager level and up, admin past the lock) can record rounds. Confirmed participants only. Tournament matches are untouched.
