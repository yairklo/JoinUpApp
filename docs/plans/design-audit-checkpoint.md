# Design consistency audit - checkpoint (steps 1-2)

Generated 2026-10-29 by a heuristic code scan (signals, not verdicts). Scan script: not committed.

## Coverage by feature

| feature | web pages | web dialogs | mobile screens | mobile sheets/modals | with screenshots (web/mobile) | surfaces never design-touched |
|---|---|---|---|---|---|---|
| tournaments | 10 | 4 | 11 | 8 | 13/3 | 33 |
| games | 4 | 1 | 6 | 0 | 3/1 | 4 |
| fields | 3 | 3 | 6 | 2 | 0/0 | 12 |
| profile | 4 | 3 | 4 | 2 | 3/2 | 9 |
| admin | 3 | 0 | 4 | 0 | 0/0 | 7 |
| settings | 2 | 0 | 5 | 0 | 0/0 | 5 |
| other/shared | 1 | 4 | 6 | 1 | 0/0 | 9 |
| legal | 3 | 0 | 2 | 0 | 0/0 | 5 |
| chat | 3 | 0 | 2 | 1 | 0/0 | 3 |
| auth | 2 | 0 | 2 | 0 | 0/0 | 4 |
| search | 2 | 0 | 1 | 0 | 0/0 | 1 |
| series | 2 | 2 | 1 | 2 | 0/0 | 5 |
| manage | 1 | 0 | 1 | 0 | 0/0 | 2 |
| home | 1 | 0 | 0 | 0 | 0/0 | 1 |
totals web pages 41 web overlay-named 17 mobile pages 51 mobile overlay-named 16

## Ranked suspects (no screenshots yet), top 60

| score | platform | kind | file | signals |
|---|---|---|---|---|
| 54.6 | mobile | page | mobile_app/app/(tabs)/game/edit/[id].tsx | hex colors 10, named colors 1, left/right props 2, Hebrew outside t() 21, date locale 4, avatar no gap 1, px font 1, light-only classes 61 |
| 41.5 | mobile | page | mobile_app/app/admin/fields/index.tsx | hex colors 7, left/right props 5, Hebrew outside t() 12, light-only classes 16, raw spinner 1 |
| 35.6 | mobile | component | mobile_app/src/components/admin/FieldEditorForm.tsx | named colors 1, left/right props 4, Hebrew outside t() 18, light-only classes 11, raw spinner 1 |
| 35.4 | mobile | page | mobile_app/app/(tabs)/game/new.tsx | hex colors 9, named colors 1, left/right props 8, date locale 8, px font 1, light-only classes 74, raw spinner 2 |
| 33.8 | mobile | page | mobile_app/app/admin/moderation.tsx | Hebrew outside t() 26, light-only classes 18 |
| 30.3 | mobile | overlay | mobile_app/src/components/admin/FieldLocationPicker.tsx | hex colors 2, left/right props 2, arrow dir review 1, Hebrew outside t() 7, light-only classes 8 |
| 30.2 | mobile | overlay | mobile_app/src/components/chat/MessageActionSheet.tsx | hex colors 9, left/right props 5, Hebrew outside t() 5, px font 1, light-only classes 8, raw spinner 1 |
| 28.5 | mobile | page | mobile_app/app/series/[id].tsx | hex colors 34, left/right props 8, arrow dir review 2, avatar margin 1, px font 2, light-only classes 125, raw spinner 2 |
| 27.8 | mobile | page | mobile_app/app/(tabs)/search.tsx | hex colors 10, named colors 1, left/right props 14, arrow dir review 1, English literal 1, avatar no gap 1, light-only classes 20 |
| 27.2 | mobile | page | mobile_app/app/admin/feedback.tsx | hex colors 1, Hebrew outside t() 6, light-only classes 11, raw spinner 1 |
| 26 | mobile | page | mobile_app/app/user/[id].tsx | hex colors 13, left/right props 14, arrow dir review 1, light-only classes 42, raw spinner 1, custom back 1 |
| 25.6 | mobile | page | mobile_app/app/settings/notifications.tsx | hex colors 6, left/right props 11, date locale 2, avatar no gap 1, light-only classes 39, raw spinner 2 |
| 25.5 | mobile | component | mobile_app/src/components/admin/AdminUserReportsSection.tsx | hex colors 1, Hebrew outside t() 27, raw spinner 1 |
| 23.8 | web | overlay | next_app/src/components/TeamBuilderDialog.tsx | hex colors 24, px font 20, raw spinner 1, custom shadow 4 |
| 22.7 | mobile | page | mobile_app/app/(tabs)/game/teams/[id].tsx | hex colors 59, left/right props 2, date locale 2, px font 20, custom back 1 |
| 21.6 | mobile | component | mobile_app/src/components/map/FieldPreviewCard.tsx | hex colors 28, left/right props 8, arrow dir review 1, English literal 1, px font 11 |
| 21.2 | mobile | page | mobile_app/app/field/[id].tsx | hex colors 9, left/right props 4, date locale 1, px font 2, light-only classes 34 |
| 21.1 | mobile | component | mobile_app/src/components/FieldIssueReportSection.tsx | hex colors 13, left/right props 4, px font 1, light-only classes 14, raw spinner 1 |
| 20.9 | mobile | page | mobile_app/app/admin/index.tsx | hex colors 2, left/right props 1, arrow dir review 1, Hebrew outside t() 4, light-only classes 8 |
| 20.7 | mobile | page | mobile_app/app/settings/index.tsx | hex colors 7, date locale 1, avatar no gap 1, light-only classes 19, English OK button 1 |
| 20.4 | mobile | component | mobile_app/src/components/JoinGameButton.tsx | hex colors 5, named colors 3, left/right props 6, light-only classes 12, raw spinner 2 |
| 20 | web | component | next_app/src/components/SearchMapComponent.tsx | hex colors 8, named colors 2, left/right props 3, px font 9, custom shadow 3 |
| 19.9 | mobile | page | mobile_app/app/chat/[id].tsx | hex colors 8, named colors 1, avatar no gap 1, px font 1, light-only classes 14, custom back 1 |
| 19.1 | mobile | component | mobile_app/src/components/PlayerSearch.tsx | hex colors 7, left/right props 8, avatar no gap 1, light-only classes 12, raw spinner 2 |
| 18.2 | mobile | page | mobile_app/app/(tabs)/fields.tsx | hex colors 5, left/right props 4, arrow dir review 1, avatar no gap 1, light-only classes 15, raw spinner 1 |
| 18.2 | mobile | page | mobile_app/app/(tabs)/friends.tsx | hex colors 6, left/right props 8, avatar no gap 1, light-only classes 15 |
| 18.2 | mobile | component | mobile_app/src/components/FieldCommentsSection.tsx | hex colors 10, left/right props 2, px font 1, light-only classes 13, raw spinner 1 |
| 18.1 | mobile | component | mobile_app/src/components/admin/FieldImageUpload.tsx | hex colors 3, left/right props 4, Hebrew outside t() 3, avatar no gap 1, light-only classes 4, raw spinner 2 |
| 17.5 | web | component | next_app/src/components/GameHero.tsx | hex colors 8, arrow dir review 1, date locale 2, px font 2, custom shadow 2 |
| 17 | mobile | page | mobile_app/app/(tabs)/game/teams/quick/[id].tsx | hex colors 39, left/right props 2, px font 26, raw spinner 1 |
| 15.8 | mobile | component | mobile_app/src/components/GlobalSearchOmnibar.tsx | hex colors 6, left/right props 5, Hebrew outside t() 2, avatar no gap 1, light-only classes 3, raw spinner 1 |
| 15.5 | web | component | next_app/src/components/HomeHero.tsx | hex colors 7, named colors 3, date locale 1, px font 1, custom shadow 1 |
| 15.1 | mobile | page | mobile_app/app/sign-up.tsx | named colors 1, left/right props 2, English literal 1, light-only classes 19 |
| 15 | mobile | component | mobile_app/src/components/PendingRequestsList.tsx | hex colors 2, left/right props 5, avatar no gap 1, light-only classes 18, raw spinner 1 |
| 14 | mobile | page | mobile_app/app/settings/feedback.tsx | hex colors 3, left/right props 1, arrow dir review 1, light-only classes 11, raw spinner 1, custom back 1 |
| 13.5 | mobile | component | mobile_app/src/components/map/MarkerPin.tsx | hex colors 6, named colors 5, left/right props 2, px font 2 |
| 13.2 | mobile | component | mobile_app/src/components/GameDetailsSkeleton.tsx | left/right props 1, Hebrew outside t() 1, light-only classes 15 |
| 12.5 | mobile | component | mobile_app/src/components/GameResultEditor.tsx | hex colors 11, px font 8, raw spinner 1 |
| 12.5 | mobile | overlay | mobile_app/src/components/series/DeleteSeriesModal.tsx | hex colors 2, left/right props 1, light-only classes 13, raw spinner 2 |
| 12 | mobile | component | mobile_app/src/components/GameRatingsPanel.tsx | hex colors 2, left/right props 1, Hebrew outside t() 1, avatar no gap 1, px font 1, light-only classes 7, raw spinner 1 |
| 11.6 | mobile | component | mobile_app/src/components/admin/FieldPhotoGallery.tsx | hex colors 4, left/right props 3, Hebrew outside t() 2, raw spinner 2 |
| 11.5 | mobile | page | mobile_app/app/sign-in.tsx | left/right props 2, English literal 1, light-only classes 11 |
| 11.3 | mobile | component | mobile_app/src/components/chat/MessageBubble.tsx | hex colors 2, left/right props 6, date locale 1, avatar no gap 1, px font 1, light-only classes 5 |
| 11 | web | component | next_app/src/components/FieldBusyChart.tsx | hex colors 8, left/right props 1, date locale 1, px font 1 |
| 10.8 | mobile | overlay | mobile_app/src/components/SuggestFieldModal.tsx | hex colors 1, left/right props 4, light-only classes 11, raw spinner 1 |
| 10.5 | mobile | page | mobile_app/app/tournaments/[id]/matches/[matchId].tsx | hex colors 5, px font 14 |
| 9.3 | mobile | component | mobile_app/src/components/GameResultPanel.tsx | hex colors 4, px font 13 |
| 9.3 | mobile | component | mobile_app/src/components/series/SeriesRegistrationRule.tsx | Hebrew outside t() 1, light-only classes 9 |
| 9.2 | mobile | page | mobile_app/app/settings/blocked.tsx | hex colors 1, left/right props 1, avatar no gap 1, light-only classes 9, raw spinner 1 |
| 9.1 | web | component | next_app/src/components/MapComponent.tsx | hex colors 4, px font 6, raw elements 1 |
| 9.1 | mobile | page | mobile_app/app/(tabs)/_layout.tsx | hex colors 11, left/right props 1, px font 2 |
| 8.7 | mobile | component | mobile_app/src/components/tournaments/wizard/StepBasics.tsx | hex colors 1, English literal 1, date locale 2 |
| 8.6 | mobile | component | mobile_app/src/components/tournaments/StandingsTable.tsx | hex colors 3, px font 13 |
| 8.5 | mobile | component | mobile_app/src/components/MatchResultBadge.tsx | Hebrew outside t() 2, px font 5 |
| 8.5 | mobile | component | mobile_app/src/components/SeriesSection.tsx | hex colors 5, left/right props 5, Hebrew outside t() 1 |
| 8.3 | mobile | page | mobile_app/app/_layout.tsx | hex colors 9, left/right props 1, raw spinner 2 |
| 8.3 | mobile | component | mobile_app/src/components/series/SeriesImageUpload.tsx | hex colors 3, left/right props 2, avatar no gap 1, light-only classes 4, raw spinner 2 |
| 8.2 | web | component | next_app/src/components/SeriesManager.tsx | arrow dir review 1, date locale 1, raw elements 1, raw spinner 1, dialog not mobile-aware 2 |
| 7.8 | web | component | next_app/src/components/GameLiveSection.tsx | hex colors 7, left/right props 1, raw spinner 1 |
| 7.5 | web | component | next_app/src/components/SeriesHeaderCard.tsx | hex colors 5, px font 3, custom shadow 1 |
