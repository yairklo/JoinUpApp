# Design screens

Scripted screenshots for the design agent. Do not browse the app to refresh these.

- Web: `cd next_app && npm run screens:web` (optional `-- --grep <screen-id|feature>`). Targets `BASE_URL`, default the Dev preview. Needs `CLERK_SECRET_KEY` / `CLERK_PUBLISHABLE_KEY` (`sk_test_` / `pk_test_` only). Does not start a local server.
- Mobile: `cd mobile_app && npm run screens:mobile` (optional `-- --feature <name>`). Maestro flows in `.maestro/screenshots/`. Needs a device or emulator with the Dev API build. Seeded users have no password; the flow signs in only when an email-code field (`sign-in-code`) is on screen, otherwise it expects an existing session.
- Users: `adult-a`, `adult-b`, `minor-c`, `organizer-o` (`+clerk_test@example.com`, code 424242).
- Files: `web/<feature>/<screen-id>-<light|dark>.png` and `mobile/<feature>/<screen-id>-<light|dark>.png`. Web screen ids include the viewport (`profile-desktop`, `profile-mobile`).

Use a row only when `last captured` is a sha and a date. `failed` and `stale` are not current, and those pngs were removed (`profile-minor-mobile` light, `game-mobile` dark, `tournaments-new-mobile` light). Mobile rows were captured against the Dev API; `profile-settings` and `tournaments-new` deep links do not navigate under Maestro so they are `failed` with no PNG. Earlier hand-captured frames in `docs/plans/d1-feature1-screens/` are not this pack.

| screen id | platform | route/screen | source file | theme | last captured (sha, date) |
| --- | --- | --- | --- | --- | --- |
| profile-desktop | web | /profile | next_app/src/app/profile/page.tsx | light | 91ce4a0 2026-10-22 |
| profile-desktop | web | /profile | next_app/src/app/profile/page.tsx | dark | 91ce4a0 2026-10-22 |
| profile-mobile | web | /profile | next_app/src/app/profile/page.tsx | light | 91ce4a0 2026-10-22 |
| profile-mobile | web | /profile | next_app/src/app/profile/page.tsx | dark | 91ce4a0 2026-10-22 |
| profile-settings-desktop | web | /profile/settings | next_app/src/app/profile/settings/page.tsx | light | 91ce4a0 2026-10-22 |
| profile-settings-desktop | web | /profile/settings | next_app/src/app/profile/settings/page.tsx | dark | 91ce4a0 2026-10-22 |
| profile-settings-mobile | web | /profile/settings | next_app/src/app/profile/settings/page.tsx | light | 91ce4a0 2026-10-22 |
| profile-settings-mobile | web | /profile/settings | next_app/src/app/profile/settings/page.tsx | dark | 91ce4a0 2026-10-22 |
| profile-minor-desktop | web | /profile | next_app/src/app/profile/page.tsx | light | 91ce4a0 2026-10-22 |
| profile-minor-desktop | web | /profile | next_app/src/app/profile/page.tsx | dark | 91ce4a0 2026-10-22 |
| profile-minor-mobile | web | /profile | next_app/src/app/profile/page.tsx | light | failed |
| profile-minor-mobile | web | /profile | next_app/src/app/profile/page.tsx | dark | 91ce4a0 2026-10-22 |
| game-desktop | web | /games/seed_game_approval | next_app/src/components/gameResult/GameResultPanel.tsx | light | 91ce4a0 2026-10-22 |
| game-desktop | web | /games/seed_game_approval | next_app/src/components/gameResult/GameResultPanel.tsx | dark | 91ce4a0 2026-10-22 |
| game-mobile | web | /games/seed_game_approval | next_app/src/components/gameResult/GameResultPanel.tsx | light | 91ce4a0 2026-10-22 |
| game-mobile | web | /games/seed_game_approval | next_app/src/components/gameResult/GameResultPanel.tsx | dark | stale |
| tournaments-list-desktop | web | /tournaments | next_app/src/app/tournaments/page.tsx | light | 91ce4a0 2026-10-22 |
| tournaments-list-desktop | web | /tournaments | next_app/src/app/tournaments/page.tsx | dark | 91ce4a0 2026-10-22 |
| tournaments-list-mobile | web | /tournaments | next_app/src/app/tournaments/page.tsx | light | 91ce4a0 2026-10-22 |
| tournaments-list-mobile | web | /tournaments | next_app/src/app/tournaments/page.tsx | dark | 91ce4a0 2026-10-22 |
| tournaments-new-desktop | web | /tournaments/new | next_app/src/app/tournaments/new/page.tsx | light | 91ce4a0 2026-10-22 |
| tournaments-new-desktop | web | /tournaments/new | next_app/src/app/tournaments/new/page.tsx | dark | 91ce4a0 2026-10-22 |
| tournaments-new-mobile | web | /tournaments/new | next_app/src/app/tournaments/new/page.tsx | light | stale |
| tournaments-new-mobile | web | /tournaments/new | next_app/src/app/tournaments/new/page.tsx | dark | 91ce4a0 2026-10-22 |
| tournaments-invites-desktop | web | /tournaments/invites | next_app/src/app/tournaments/invites/page.tsx | light | 91ce4a0 2026-10-22 |
| tournaments-invites-desktop | web | /tournaments/invites | next_app/src/app/tournaments/invites/page.tsx | dark | 91ce4a0 2026-10-22 |
| tournaments-invites-mobile | web | /tournaments/invites | next_app/src/app/tournaments/invites/page.tsx | light | 91ce4a0 2026-10-22 |
| tournaments-invites-mobile | web | /tournaments/invites | next_app/src/app/tournaments/invites/page.tsx | dark | 91ce4a0 2026-10-22 |
| tournament-desktop | web | /tournaments/cmvjad6r3000gqe0iifmjp349 | next_app/src/components/tournaments/shell/TournamentPage.tsx | light | 52e7afa 2026-10-22 |
| tournament-desktop | web | /tournaments/cmvjad6r3000gqe0iifmjp349 | next_app/src/components/tournaments/shell/TournamentPage.tsx | dark | 52e7afa 2026-10-22 |
| tournament-mobile | web | /tournaments/cmvjad6r3000gqe0iifmjp349 | next_app/src/components/tournaments/shell/TournamentPage.tsx | light | 52e7afa 2026-10-22 |
| tournament-mobile | web | /tournaments/cmvjad6r3000gqe0iifmjp349 | next_app/src/components/tournaments/shell/TournamentPage.tsx | dark | 52e7afa 2026-10-22 |
| profile | mobile | /user/profile | mobile_app/app/user/profile.tsx | light | 2a5f61dd 2026-10-22 |
| profile | mobile | /user/profile | mobile_app/app/user/profile.tsx | dark | 2a5f61dd 2026-10-22 (screen renders light UI in dark mode) |
| profile-settings | mobile | /profile/settings | mobile_app/app/profile/settings.tsx | light | failed (deep link did not open settings) |
| profile-settings | mobile | /profile/settings | mobile_app/app/profile/settings.tsx | dark | failed (deep link did not open settings) |
| game | mobile | /(tabs)/game/[id] | mobile_app/app/(tabs)/game/[id].tsx | light | 2a5f61dd 2026-10-22 |
| game | mobile | /(tabs)/game/[id] | mobile_app/app/(tabs)/game/[id].tsx | dark | 2a5f61dd 2026-10-22 |
| tournaments-list | mobile | /tournaments | mobile_app/app/tournaments/index.tsx | light | 2a5f61dd 2026-10-22 |
| tournaments-list | mobile | /tournaments | mobile_app/app/tournaments/index.tsx | dark | 2a5f61dd 2026-10-22 |
| tournaments-new | mobile | /tournaments/new | mobile_app/app/tournaments/new.tsx | light | failed (deep link did not open the form) |
| tournaments-new | mobile | /tournaments/new | mobile_app/app/tournaments/new.tsx | dark | failed (deep link did not open the form) |
| tournament | mobile | /tournaments/[id] | mobile_app/app/tournaments/[id]/index.tsx | light | 2a5f61dd 2026-10-22 |
| tournament | mobile | /tournaments/[id] | mobile_app/app/tournaments/[id]/index.tsx | dark | 2a5f61dd 2026-10-22 |
