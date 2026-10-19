# Mobile QA checklist — build from `main` after PR #348 (2026-10-19)

Audience: an agent/tester running the Android `preview` APK (EAS build 5cc703fb-5057-4bd9-a55f-967529922c30, main @ eb3081e).
For each failure: record steps to reproduce, expected vs actual, screenshot, and logcat if it crashed.

## 0. Setup
- Users: A (manages a group/game), B (regular player), C (not a friend of A).
- Games: one regular game, one game belonging to a recurring group (series).
- Groups: one open group, one friends-only group (A is a member of both).
- Need network access, and the ability to turn it off (airplane mode).

## 1. Own profile (`mobile_app/app/user/profile.tsx`)
1. Tapping "ערוך" shows a **name** field pre-filled with the current name.
2. Change name + save: the name updates in the header and elsewhere (chat, lists).
3. Empty name keeps the old name. Name longer than 60 chars is cut off.
4. Phone field with keyboard open: the screen scrolls, the field is not covered.
5. Change city, gender, sports + save: persisted after sign-out/in.
6. "ביטול" restores all fields, including name.
7. "הקבוצות שלי" card shows above "ספורט ועמדות" when the user has groups; hidden while editing.
8. Tapping a group opens its page (`/series/<id>`).
9. After saving an edit, the groups card does not disappear.

## 2. Other users' profiles (`user/[id].tsx`)
1. B opens A's profile: a "קבוצות" section with tappable chips opening `/series/<id>`.
2. C (non-friend) does not see A's friends-only groups, only open ones.
3. If A set match-history privacy to friends-only, C sees no groups at all; a friend does.
4. A turns on "hide my groups": B and C see no section; A still sees groups on own profile.
5. Adult with no saved settings: groups visible by default.

## 3. Privacy settings (`profile/settings.tsx`)
1. Switch "הסתר את הקבוצות שלי בפרופיל" is below the existing options.
2. Turn on + save, leave and return: still on.
3. Save with a network error shows an error and does not silently reset the switch.
4. The other privacy options still save and load correctly.

## 4. Game page
1. Game belonging to a series: a clear way to reach the group page, and it opens it.
2. Regular game: no group link; the create-group button is available.
3. A new user can tell the game belongs to a group without searching.

## 5. Sport art (reported on iPhone: fields look plain green/orange)
1. Game and field cards for soccer, basketball, tennis show court lines and the ball glyph.
2. Text on cards (titles, chips) is still readable over the stronger lines.
3. A field with an uploaded photo shows the photo.
4. Not verified on a real device yet; also try an iPhone if available.

## 6. Chat
1. Sending: a pending tick, two ticks once the server confirms, blue when read.
2. Airplane mode + send: failure indicator and a "retry" button. After reconnecting, retry sends **once** (no duplicate).
3. Blocked user: the message is shown with a clear explanation.
4. Return from background / network drop: chat reconnects and fetches missed messages.
5. Empty chat: the empty-state text is not mirrored in RTL.
6. An unsent draft survives leaving and re-entering the chat.

## 7. "My management"
1. Home screen: the section appears only for users who manage groups/games; B does not see it.
2. `/manage` lists managed groups and games, without inactive groups.
3. Items needing attention carry a label; tapping goes to the right place.
4. A finished game is not shown as active (based on the game's end time).

## 8. Quick team edit (`game/teams/quick/[id]`)
1. Reached from the live team management of a game; styling matches the web team builder.
2. A game MANAGER can enter; a non-manager is blocked.
3. Assign players + save: teams persist and show on the game.
4. Save failing (airplane mode): assignments are kept, not lost.
5. Leaving with unsaved changes shows a warning.

## 9. Home cards
1. Carousels: all cards equal height, join button not clipped.
2. Date list: titles on a single line, no blank gap.

## 10. General regression
- Sign-in, join/leave a game, open a game from a notification.
- RTL correct on every screen above.
- No crashes or white screens; attach logcat for any crash.

## Not yet verified
- None of today's changes were tested on a real Android/iOS device; only typecheck and server tests ran.
- The `hideGroups` migration (`20261019120000_add_user_hide_groups`) ran only on the dev DB. Against any other backend, confirm it was applied, or profile requests fail.
