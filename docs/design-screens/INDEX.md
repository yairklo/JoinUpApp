# Design screens

Scripted screenshots for the design agent. Do not browse the app to refresh these.

- Web: `cd next_app && npm run screens:web` (optional `-- --grep <screen-id|feature>`). Targets `BASE_URL`, default the Dev preview. Needs `CLERK_SECRET_KEY` / `CLERK_PUBLISHABLE_KEY` (`sk_test_` / `pk_test_` only). Does not start a local server.
- Mobile: `cd mobile_app && npm run screens:mobile` (optional `-- --feature <name>`). Maestro flows in `.maestro/screenshots/`. Needs a device or emulator with the Dev API build. Seeded users have no password; the flow signs in only when an email-code field (`sign-in-code`) is on screen, otherwise it expects an existing session.
- Users: `adult-a`, `adult-b`, `minor-c`, `organizer-o` (`+clerk_test@example.com`, code 424242).
- Files: `web/<feature>/<screen-id>-<light|dark>.png` and `mobile/<feature>/<screen-id>-<light|dark>.png`. Web screen ids include the viewport (`profile-desktop`, `profile-mobile`).

Earlier hand-captured frames live in `docs/plans/d1-feature1-screens/`.

| screen id | platform | route/screen | source file | theme | last captured (sha, date) |
| --- | --- | --- | --- | --- | --- |
| profile-desktop | web | /profile | next_app/src/app/profile/page.tsx | light | 0ed3a729 2026-10-22 |
| profile-desktop | web | /profile | next_app/src/app/profile/page.tsx | dark | 0ed3a729 2026-10-22 |
| profile-mobile | web | /profile | next_app/src/app/profile/page.tsx | light | 0ed3a729 2026-10-22 |
| profile-mobile | web | /profile | next_app/src/app/profile/page.tsx | dark | 0ed3a729 2026-10-22 |
| profile-history-desktop | web | /profile | next_app/src/app/profile/page.tsx | light | 0ed3a729 2026-10-22 |
| profile-history-desktop | web | /profile | next_app/src/app/profile/page.tsx | dark | 0ed3a729 2026-10-22 |
| profile-history-mobile | web | /profile | next_app/src/app/profile/page.tsx | light | 0ed3a729 2026-10-22 |
| profile-history-mobile | web | /profile | next_app/src/app/profile/page.tsx | dark | 0ed3a729 2026-10-22 |
| profile-settings-desktop | web | /profile/settings | next_app/src/app/profile/settings/page.tsx | light | 0ed3a729 2026-10-22 |
| profile-settings-desktop | web | /profile/settings | next_app/src/app/profile/settings/page.tsx | dark | 0ed3a729 2026-10-22 |
| profile-settings-mobile | web | /profile/settings | next_app/src/app/profile/settings/page.tsx | light | 0ed3a729 2026-10-22 |
| profile-settings-mobile | web | /profile/settings | next_app/src/app/profile/settings/page.tsx | dark | 0ed3a729 2026-10-22 |
| profile-minor-desktop | web | /profile | next_app/src/app/profile/page.tsx | light | 0ed3a729 2026-10-22 |
| profile-minor-desktop | web | /profile | next_app/src/app/profile/page.tsx | dark | 0ed3a729 2026-10-22 |
| profile-minor-mobile | web | /profile | next_app/src/app/profile/page.tsx | light | 0ed3a729 2026-10-22 |
| profile-minor-mobile | web | /profile | next_app/src/app/profile/page.tsx | dark | 0ed3a729 2026-10-22 |
| game-desktop | web | /games/cmvimszfo0038nw0ihwu88lkm | next_app/src/components/gameResult/GameResultPanel.tsx | light | 0ed3a729 2026-10-22 |
| game-desktop | web | /games/cmvimszfo0038nw0ihwu88lkm | next_app/src/components/gameResult/GameResultPanel.tsx | dark | 0ed3a729 2026-10-22 |
| game-mobile | web | /games/cmvimszfo0038nw0ihwu88lkm | next_app/src/components/gameResult/GameResultPanel.tsx | light | 0ed3a729 2026-10-22 |
| game-mobile | web | /games/cmvimszfo0038nw0ihwu88lkm | next_app/src/components/gameResult/GameResultPanel.tsx | dark | 0ed3a729 2026-10-22 |
| game-report-user-desktop | web | /games/cmvimszfo0038nw0ihwu88lkm | next_app/src/components/ReportUserDialog.tsx | light | 0ed3a729 2026-10-22 |
| game-report-user-desktop | web | /games/cmvimszfo0038nw0ihwu88lkm | next_app/src/components/ReportUserDialog.tsx | dark | 0ed3a729 2026-10-22 |
| game-report-user-mobile | web | /games/cmvimszfo0038nw0ihwu88lkm | next_app/src/components/ReportUserDialog.tsx | light | 0ed3a729 2026-10-22 |
| game-report-user-mobile | web | /games/cmvimszfo0038nw0ihwu88lkm | next_app/src/components/ReportUserDialog.tsx | dark | 0ed3a729 2026-10-22 |
| tournaments-list-desktop | web | /tournaments | next_app/src/app/tournaments/page.tsx | light | 0ed3a729 2026-10-22 |
| tournaments-list-desktop | web | /tournaments | next_app/src/app/tournaments/page.tsx | dark | 0ed3a729 2026-10-22 |
| tournaments-list-mobile | web | /tournaments | next_app/src/app/tournaments/page.tsx | light | 0ed3a729 2026-10-22 |
| tournaments-list-mobile | web | /tournaments | next_app/src/app/tournaments/page.tsx | dark | 0ed3a729 2026-10-22 |
| tournaments-new-desktop | web | /tournaments/new | next_app/src/app/tournaments/new/page.tsx | light | 0ed3a729 2026-10-22 |
| tournaments-new-desktop | web | /tournaments/new | next_app/src/app/tournaments/new/page.tsx | dark | 0ed3a729 2026-10-22 |
| tournaments-new-mobile | web | /tournaments/new | next_app/src/app/tournaments/new/page.tsx | light | 0ed3a729 2026-10-22 |
| tournaments-new-mobile | web | /tournaments/new | next_app/src/app/tournaments/new/page.tsx | dark | 0ed3a729 2026-10-22 |
| tournaments-new-step2-desktop | web | /tournaments/new | next_app/src/components/tournaments/wizard/StepTeams.tsx | light | 0ed3a729 2026-10-22 |
| tournaments-new-step2-desktop | web | /tournaments/new | next_app/src/components/tournaments/wizard/StepTeams.tsx | dark | 0ed3a729 2026-10-22 |
| tournaments-new-step2-mobile | web | /tournaments/new | next_app/src/components/tournaments/wizard/StepTeams.tsx | light | 0ed3a729 2026-10-22 |
| tournaments-new-step2-mobile | web | /tournaments/new | next_app/src/components/tournaments/wizard/StepTeams.tsx | dark | 0ed3a729 2026-10-22 |
| tournaments-new-step3-desktop | web | /tournaments/new | next_app/src/components/tournaments/wizard/StepFormat.tsx | light | 0ed3a729 2026-10-22 |
| tournaments-new-step3-desktop | web | /tournaments/new | next_app/src/components/tournaments/wizard/StepFormat.tsx | dark | 0ed3a729 2026-10-22 |
| tournaments-new-step3-mobile | web | /tournaments/new | next_app/src/components/tournaments/wizard/StepFormat.tsx | light | 0ed3a729 2026-10-22 |
| tournaments-new-step3-mobile | web | /tournaments/new | next_app/src/components/tournaments/wizard/StepFormat.tsx | dark | 0ed3a729 2026-10-22 |
| tournaments-new-step4-desktop | web | /tournaments/new | next_app/src/components/tournaments/wizard/StepRegistration.tsx | light | 0ed3a729 2026-10-22 |
| tournaments-new-step4-desktop | web | /tournaments/new | next_app/src/components/tournaments/wizard/StepRegistration.tsx | dark | 0ed3a729 2026-10-22 |
| tournaments-new-step4-mobile | web | /tournaments/new | next_app/src/components/tournaments/wizard/StepRegistration.tsx | light | 0ed3a729 2026-10-22 |
| tournaments-new-step4-mobile | web | /tournaments/new | next_app/src/components/tournaments/wizard/StepRegistration.tsx | dark | 0ed3a729 2026-10-22 |
| tournaments-new-step5-desktop | web | /tournaments/new | next_app/src/components/tournaments/wizard/StepReview.tsx | light | 0ed3a729 2026-10-22 |
| tournaments-new-step5-desktop | web | /tournaments/new | next_app/src/components/tournaments/wizard/StepReview.tsx | dark | 0ed3a729 2026-10-22 |
| tournaments-new-step5-mobile | web | /tournaments/new | next_app/src/components/tournaments/wizard/StepReview.tsx | light | 0ed3a729 2026-10-22 |
| tournaments-new-step5-mobile | web | /tournaments/new | next_app/src/components/tournaments/wizard/StepReview.tsx | dark | 0ed3a729 2026-10-22 |
| tournaments-invites-desktop | web | /tournaments/invites | next_app/src/app/tournaments/invites/page.tsx | light | 0ed3a729 2026-10-22 |
| tournaments-invites-desktop | web | /tournaments/invites | next_app/src/app/tournaments/invites/page.tsx | dark | 0ed3a729 2026-10-22 |
| tournaments-invites-mobile | web | /tournaments/invites | next_app/src/app/tournaments/invites/page.tsx | light | 0ed3a729 2026-10-22 |
| tournaments-invites-mobile | web | /tournaments/invites | next_app/src/app/tournaments/invites/page.tsx | dark | 0ed3a729 2026-10-22 |
| tournament-desktop | web | /tournaments/cmvjad6r3000gqe0iifmjp349 | next_app/src/components/tournaments/shell/TournamentPage.tsx | light | 0ed3a729 2026-10-22 |
| tournament-desktop | web | /tournaments/cmvjad6r3000gqe0iifmjp349 | next_app/src/components/tournaments/shell/TournamentPage.tsx | dark | 0ed3a729 2026-10-22 |
| tournament-mobile | web | /tournaments/cmvjad6r3000gqe0iifmjp349 | next_app/src/components/tournaments/shell/TournamentPage.tsx | light | 0ed3a729 2026-10-22 |
| tournament-mobile | web | /tournaments/cmvjad6r3000gqe0iifmjp349 | next_app/src/components/tournaments/shell/TournamentPage.tsx | dark | 0ed3a729 2026-10-22 |
| tournament-schedule-desktop | web | /tournaments/cmvjad6r3000gqe0iifmjp349 | next_app/src/components/tournaments/tabs/ScheduleTab.tsx | light | 0ed3a729 2026-10-22 |
| tournament-schedule-desktop | web | /tournaments/cmvjad6r3000gqe0iifmjp349 | next_app/src/components/tournaments/tabs/ScheduleTab.tsx | dark | 0ed3a729 2026-10-22 |
| tournament-schedule-mobile | web | /tournaments/cmvjad6r3000gqe0iifmjp349 | next_app/src/components/tournaments/tabs/ScheduleTab.tsx | light | 0ed3a729 2026-10-22 |
| tournament-schedule-mobile | web | /tournaments/cmvjad6r3000gqe0iifmjp349 | next_app/src/components/tournaments/tabs/ScheduleTab.tsx | dark | 0ed3a729 2026-10-22 |
| tournament-standings-desktop | web | /tournaments/cmvjad6r3000gqe0iifmjp349 | next_app/src/components/tournaments/tabs/StandingsTab.tsx | light | 0ed3a729 2026-10-22 |
| tournament-standings-desktop | web | /tournaments/cmvjad6r3000gqe0iifmjp349 | next_app/src/components/tournaments/tabs/StandingsTab.tsx | dark | 0ed3a729 2026-10-22 |
| tournament-standings-mobile | web | /tournaments/cmvjad6r3000gqe0iifmjp349 | next_app/src/components/tournaments/tabs/StandingsTab.tsx | light | 0ed3a729 2026-10-22 |
| tournament-standings-mobile | web | /tournaments/cmvjad6r3000gqe0iifmjp349 | next_app/src/components/tournaments/tabs/StandingsTab.tsx | dark | 0ed3a729 2026-10-22 |
| tournament-leaders-desktop | web | /tournaments/cmvjad6r3000gqe0iifmjp349 | next_app/src/components/tournaments/tabs/TopPlayersTab.tsx | light | 0ed3a729 2026-10-22 |
| tournament-leaders-desktop | web | /tournaments/cmvjad6r3000gqe0iifmjp349 | next_app/src/components/tournaments/tabs/TopPlayersTab.tsx | dark | 0ed3a729 2026-10-22 |
| tournament-leaders-mobile | web | /tournaments/cmvjad6r3000gqe0iifmjp349 | next_app/src/components/tournaments/tabs/TopPlayersTab.tsx | light | 0ed3a729 2026-10-22 |
| tournament-leaders-mobile | web | /tournaments/cmvjad6r3000gqe0iifmjp349 | next_app/src/components/tournaments/tabs/TopPlayersTab.tsx | dark | 0ed3a729 2026-10-22 |
| tournament-manage-desktop | web | /tournaments/cmvjad6r3000gqe0iifmjp349/manage | next_app/src/components/tournaments/manage/ManageConsole.tsx | light | 0ed3a729 2026-10-22 |
| tournament-manage-desktop | web | /tournaments/cmvjad6r3000gqe0iifmjp349/manage | next_app/src/components/tournaments/manage/ManageConsole.tsx | dark | 0ed3a729 2026-10-22 |
| tournament-manage-mobile | web | /tournaments/cmvjad6r3000gqe0iifmjp349/manage | next_app/src/components/tournaments/manage/ManageConsole.tsx | light | 0ed3a729 2026-10-22 |
| tournament-manage-mobile | web | /tournaments/cmvjad6r3000gqe0iifmjp349/manage | next_app/src/components/tournaments/manage/ManageConsole.tsx | dark | 0ed3a729 2026-10-22 |
| tournament-score-sheet-desktop | web | /tournaments/cmvjad6r3000gqe0iifmjp349 | next_app/src/components/tournaments/ScoreEntrySheet.tsx | light | 0ed3a729 2026-10-22 |
| tournament-score-sheet-desktop | web | /tournaments/cmvjad6r3000gqe0iifmjp349 | next_app/src/components/tournaments/ScoreEntrySheet.tsx | dark | 0ed3a729 2026-10-22 |
| tournament-score-sheet-mobile | web | /tournaments/cmvjad6r3000gqe0iifmjp349 | next_app/src/components/tournaments/ScoreEntrySheet.tsx | light | 0ed3a729 2026-10-22 |
| tournament-score-sheet-mobile | web | /tournaments/cmvjad6r3000gqe0iifmjp349 | next_app/src/components/tournaments/ScoreEntrySheet.tsx | dark | 0ed3a729 2026-10-22 |
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
