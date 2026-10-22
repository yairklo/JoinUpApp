# Design pass — web only (paste this)

You are the visual design pass for joinUp web. Look at the screenshots and edit the source files they point at. Do not explore the repo, do not install anything, and do not run the site, the API, Playwright, or Maestro.

## Where the screens are

Index (source of truth): `C:\JoinUpApp\.claude\worktrees\w11-design-screens\docs\design-screens\INDEX.md`

Images sit next to it: `C:\JoinUpApp\.claude\worktrees\w11-design-screens\docs\design-screens\web\<feature>\<screen-id>-<light|dark>.png`

These files are on this machine in that worktree. They are not on `main`. Mobile rows in the index are `not yet` — ignore them. A later pass will add mobile.

Use a row only when the last-captured cell is a git sha and a date (`91ce4a0 2026-10-22`). Do not open or design from:

- `profile-minor-mobile` light — `failed` (file removed; do not retry)
- `game-mobile` dark — `stale` (file removed)
- `tournaments-new-mobile` light — `stale` (file removed)
- anything under `docs/plans/d1-feature1-screens/` (older hand captures)

Captured Dev web (`https://join-up-app-git-dev-yair-klausners-projects.vercel.app`), Hebrew RTL, light and dark, viewports 1280×800 (`*-desktop`) and 390×844 (`*-mobile`).

| screen id | route | source | png folder |
| --- | --- | --- | --- |
| profile-desktop, profile-mobile | /profile | next_app/src/app/profile/page.tsx | web/profile |
| profile-settings-desktop, profile-settings-mobile | /profile/settings | next_app/src/app/profile/settings/page.tsx | web/profile |
| profile-minor-desktop (both themes), profile-minor-mobile dark only | /profile | next_app/src/app/profile/page.tsx | web/profile |
| game-desktop (both), game-mobile light only | /games/seed_game_approval | next_app/src/components/gameResult/GameResultPanel.tsx | web/match-results |
| tournaments-list-desktop, tournaments-list-mobile | /tournaments | next_app/src/app/tournaments/page.tsx | web/tournaments |
| tournaments-new-desktop (both), tournaments-new-mobile dark only | /tournaments/new | next_app/src/app/tournaments/new/page.tsx | web/tournaments |
| tournaments-invites-desktop, tournaments-invites-mobile | /tournaments/invites | next_app/src/app/tournaments/invites/page.tsx | web/tournaments |
| tournament-desktop, tournament-mobile | /tournaments/cmvjab6px0001qe0iqqd47k50 | next_app/src/components/tournaments/shell/TournamentPage.tsx | web/tournaments |

## What to match

- Match results and profile stats: `docs/plans/design-spec-D0-feature1.md`
- Tournaments: `docs/plans/design-spec-D0-tournaments.md`

Web copy is Hebrew only. Dark mode uses the MUI palette (`sx`), not Tailwind color classes. Keep the existing card, type, and button language in section 0 of the feature-1 spec.

## What to edit

Edit only the source files in the table above, plus a presentational child they render if the screenshot shows a problem that lives in that child (for example a result row or a tournament card). Layout, spacing, type, color, empty/loading/error states, and copy.

Leave data fetching alone. Do not change `useUserStats`, profile `useEffect` loads, API clients, or auth. Another fix is in flight on those paths.

Do not add result confirm or dispute. Results stay organizer-only. Do not invent screens that are not in the index.

When you finish, list each file you changed and which screenshot row it answers.
