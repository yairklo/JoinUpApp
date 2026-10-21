# D0 design spec - Feature 2: tournaments

Answers [design-brief-D0-tournaments.md](./design-brief-D0-tournaments.md). Behaviour: [2026-10-feature-tournaments.md](./2026-10-feature-tournaments.md). API as implemented: [2026-10-tournaments-api-contract.md](./2026-10-tournaments-api-contract.md).

**This spec extends [design-spec-D0-feature1.md](./design-spec-D0-feature1.md) and does not re-decide it.** References like "F1 §1.1" point there. In particular these are binding and only cited here: score order in RTL (F1 §1.1), colour tokens, outcome colours, sport accent rules and team swatch (F1 §1.2), typography (F1 §1.3), spacing and touch (F1 §1.4), icons (F1 §1.5), stat formatting (F1 §1.6), copy tone (F1 §1.7), state matrix (F1 §1.8), testid convention (same string as web `data-testid` and mobile `testID`).

Audience: implementation agents for T-14..T-23 building presentational components (props only). No logic, hooks or API clients here. Where the design needs data the API does not return, it is in [§19 API gaps](#19-api-gaps) with a fallback.

Already built in Feature 1 and reused as is (mobile names; web equivalents follow the same names): `OUTCOME_CLASSES`, `sideSwatchColor`, `describeStats`, `tabular` (`mobile_app/src/components/results/resultUtils.ts`), the set grid from `GameResultPanel`, the stepper and player-stat rows from `GameResultEditor`, `ReportUserDialog`.

---

## 0. New global decisions for tournaments

### 0.1 Bracket direction in RTL (decision)

**Rounds flow from the reading-start edge to the end edge: in Hebrew the first round is on the right and the final on the left. In the English locale it mirrors (first round left).** One-sided bracket, not the two-halves-meeting-in-the-middle layout.

Why:
- It is F1 §1.1 applied to time: everything that comes first sits at the start edge (side A, set 1, round 1). One rule, no exceptions to learn.
- A Hebrew reader scans right to left, so the eye travels with the tournament toward the champion.
- On a phone the user swipes toward the end edge to go forward, which is the natural "next page" gesture in RTL.
- The two-sided layout halves the width needed for 32 teams, but it breaks the rule above (half the bracket flows the other way), connectors get cramped at the centre, and it does not work in round-by-round phone mode. Desktop zoom (§9) covers the width instead.

Inside one bracket cell, the home slot is the top row and away the bottom row. Rows are vertical, so F1 §1.1's horizontal rule does not apply. The score sits at the end edge of each row.

### 0.2 Standings on a 360px phone (decision)

The default is a **compact table with 5 columns**: rank, team (sticky), played, goal difference, points. Tapping a row expands a detail line with W/D/L and GF:GA. A **"כל העמודות"** switch turns the table into the full 10-column table, scrolling horizontally with rank and team pinned to the start edge. From 600px up the full table is the default. Details are in §8.

### 0.3 Tournament and match status tokens

Status chips are always text and colour, never colour alone. On web they are MUI `Chip size="small"` with these props; on mobile they are pills `px-2.5 py-1 rounded-full text-xs font-bold` with these classes.

| Status | Hebrew / English | Web | Mobile light / dark |
| --- | --- | --- | --- |
| Tournament `DRAFT` | טיוטה / Draft | `variant="outlined"` default | `border border-gray-300 text-gray-600` / `dark:border-cyber-border dark:text-cyber-muted` |
| `REGISTRATION_OPEN` | הרשמה פתוחה / Registration open | `color="success"` | `bg-brand-mist text-brand-dark` / `dark:bg-brand-ink dark:text-brand-light` |
| `REGISTRATION_CLOSED` | ההרשמה נסגרה / Registration closed | default | `bg-gray-100 text-gray-700` / `dark:bg-cyber-border dark:text-cyber-text` |
| `IN_PROGRESS` | מתקיים עכשיו / In progress | `color="secondary"` | `bg-indigo-50 text-indigo-700` / `dark:bg-indigo-950 dark:text-indigo-300` |
| `COMPLETED` | הסתיים / Finished | default + `EmojiEventsRounded` icon | gray pill + `trophy` icon |
| `CANCELLED` | בוטל / Cancelled | `color="error" variant="outlined"` | `border border-red-200 text-red-600` / `dark:border-red-900 dark:text-red-400` |
| Match `SCHEDULED` | מתוכנן / Scheduled | no chip (time is shown instead) | none |
| `LIVE` | חי / Live | `color="error"` + 6px pulsing dot | `bg-red-50 text-red-700` + dot / `dark:bg-red-950 dark:text-red-300` |
| `FINISHED` | הסתיים / Final | none; the score is the signal | none |
| `FORFEIT` | ניצחון טכני / Forfeit | `color="warning" variant="outlined"` | `border border-amber-300 text-amber-700` / `dark:border-amber-800 dark:text-amber-300` |
| `POSTPONED` | נדחה / Postponed | `color="warning" variant="outlined"` | same as forfeit |
| `CANCELLED` | בוטל / Cancelled | default, card at 60% opacity, teams struck through | same |

Red is used for LIVE only (the universal "live" convention). It never marks an outcome; outcomes keep F1 §1.2. With reduced motion, the live dot does not pulse.

### 0.4 Slot placeholders (teams not known yet)

Text is `text.secondary` italic (mobile `text-gray-500 italic dark:text-cyber-muted`), with a dashed 10px ring instead of the swatch. Placeholders show a match by its `number`; the client maps `source.matchId` to `number` from the schedule or bracket payload.

| `source.type` | Hebrew | English |
| --- | --- | --- |
| `WINNER_OF` | המנצחת במשחק {n} | Winner of match {n} |
| `LOSER_OF` | המפסידה במשחק {n} | Loser of match {n} |
| `GROUP_RANK` | מקום {rank} בבית {group} | {rank} in group {group} |
| `SEED` | מדורגת {n} | Seed {n} |
| `BYE` | פטור | Bye |
| none, team null | ייקבע בהמשך | TBD |

### 0.5 Realtime "updated" cue

When `tournament:update` arrives on an open screen, the client refetches and then:
- A small pill **"עודכן עכשיו" / "Updated just now"** fades in under the tab bar (start edge, `bgcolor: alpha(secondary.main, .12)` / `bg-indigo-50 dark:bg-indigo-950`, caption, `RefreshRounded` / `refresh` 12px). It stays 3s and has `aria-live="polite"`. It is not a toast and never stacks; a second event restarts the timer.
- Changed rows or cards (`changedMatchIds` / `matchId`) get a 1.2s background flash: `alpha(secondary.main, .16)` to transparent; mobile uses an animated `opacity` on an absolute overlay with `bg-indigo-100 dark:bg-indigo-900`. With reduced motion there is no flash, only the pill.
- Scroll position and an open sheet are never reset. If the match being edited changes, the score sheet shows the conflict state (§12.6) instead of silently swapping values.

### 0.6 New icons

Web uses `@mui/icons-material` Rounded and mobile uses `Ionicons`. This adds to F1 §1.5; no custom assets are needed.

| Meaning | Web | Mobile |
| --- | --- | --- |
| Tournament (nav, sections) / champion | `EmojiEventsRounded` | `trophy-outline` / `trophy` |
| Bracket tab | `AccountTreeRounded` (mirrored with `transform: scaleX(-1)` in RTL so branches point toward the final) | `git-network-outline` |
| Standings tab | `FormatListNumberedRounded` | `list-outline` |
| Schedule tab | `CalendarMonthRounded` | `calendar-outline` |
| Teams tab | `GroupsRounded` | `people-outline` |
| Top players tab | `InsightsRounded` | `stats-chart-outline` |
| Overview tab | `InfoOutlined` | `information-circle-outline` |
| Join code copy / share / rotate | `ContentCopyRounded` / `IosShareRounded` / `AutorenewRounded` | `copy-outline` / `share-social-outline` / `refresh` |
| Captain | `ShieldRounded` (14px) with the letter "ק" chip | `shield` (14) |
| Manual rank | `PanToolAltRounded` | `hand-left-outline` |
| Drag handle | `DragIndicatorRounded` | not used (no drag on phone) |
| Court | `StadiumRounded` | `location-outline` |
| Conflict | `ReportProblemRounded` | `alert-circle-outline` |
| Add to calendar | `EventAvailableRounded` | `calendar-number-outline` |
| Invite | `PersonAddAlt1Rounded` | `person-add-outline` |

### 0.7 Shared building blocks (new presentational components)

| Component | Used in | Notes |
| --- | --- | --- |
| `TournamentStatusChip` | list, hero, admin | §0.3 |
| `MatchStatusChip` | schedule, bracket, match | §0.3 |
| `TeamBadge` | everywhere a team is shown | Logo 24/32/40, or swatch 10px with ring when there is no logo; name 1 line (tables) or 2 lines (cards). The logo is a circle with a 1px `divider` ring. |
| `SlotLabel` | schedule, bracket, match | Team or placeholder (§0.4) |
| `MatchCard` | schedule, overview, team page, home | §7.2 |
| `ScoreCluster` | match card, match detail, bracket | F1 §1.1: separate flex children, tabular, penalties as a small trailing `(4)` |
| `StandingsTable` | standings, overview, group stage | §8 |
| `BracketView` / `BracketCell` | bracket | §9 |
| `RosterMeter` | team page, teams queue, wizard preview | §4.4 |
| `UpdatedCue` | all tabs | §0.5 |
| `ScoreEntrySheet` | manage, schedule, match detail | §12 |

### 0.8 Role matrix (what changes per role)

| Role | Hero primary CTA | Extra tabs/actions |
| --- | --- | --- |
| Guest (not signed in) | "התחברות להרשמה" if registration is open; otherwise none | read-only tabs |
| Signed in, no team | "רישום קבוצה" when `capabilities.canRegisterTeam`; "הצטרפות עם קוד" as secondary | — |
| Invited (pending invite) | "הזמנה לקבוצה {name}" banner with accept/decline (§5) | — |
| Player (accepted) | "הקבוצה שלי" | my-team highlight in all tabs |
| Captain | "ניהול הקבוצה" | team page edit, invite, join code |
| Scorekeeper | "הזנת תוצאות" (opens schedule filtered to today and live) | score button on match cards |
| Manager | "ניהול הטורניר" | manage console (no roles section) |
| Organizer / admin | "ניהול הטורניר" | manage console with roles and force options |
| Minor (server rejects) | no register CTA; kind info card (§4.7) | — |

Rule: create and manage entry points render only when `capabilities` / `myRole` allow. Hide them rather than disable them, and never show a locked button.

---

## 1. Tournament list / discovery

Routes: web `/tournaments`, mobile `app/tournaments/index.tsx`. Component `TournamentList` with `TournamentCard`.

### 1.1 Entry points

- **Web desktop**: a navbar link "טורנירים" (`EmojiEventsRounded`) after "מגרשים" in `AppNavbar`. Render it only when `canCreateTournaments` is true or at least one public tournament exists (`GET /tournaments?limit=1`).
- **Web phone and mobile app**: no new bottom-nav or tab item; the 5 slots are full and a sixth crowds the FAB. Instead:
  - a home rail "טורנירים" on the web `/games` feed, and a `TournamentsSection` on the mobile home after `MyGamesSection`. It uses the same condition, shows up to 6 cards horizontally, and has "הכל" at the end.
  - the "my next match" card (§14.2) when relevant.
  - the profile section (§14.1).
- **Create**: a "טורניר חדש" button in the list header (contained, `AddRounded`) and in the mobile header (`add` icon button, 44px), only with `canCreateTournaments`.

### 1.2 Layout

Desktop: container `lg`; header row with title "טורנירים" (h4 800) and the create button at the end. Below it the filter row, then a grid of 3 columns (`md`) or 2 columns (`sm`) of cards, 16px gap.

```
┌──────────────────────────────┐   TournamentCard (desktop ~360px wide)
│▓▓▓▓ cover / SportCover ▓▓▓▓▓▓│   16:7, image or generated SportCover art
│ [הרשמה פתוחה]          ⚽     │   status chip over the cover (start), sport emoji (end)
├──────────────────────────────┤
│ גביע הקיץ של רמת גן          │   h6 800, 2-line clamp
│ 📅 12–14/11 · 📍 ספורטק, ת״א  │   body2 text.secondary, 1 line
│ ████████░░  8/12 קבוצות       │   capacity bar (sport base) + count
│ ההרשמה פתוחה עד 5/11          │   caption, success colour when < 3 days
└──────────────────────────────┘
```

- Cover: `imageUrl`, or the existing `SportCover` art (sport `deep`/`ink` gradient) when there is none. A 4px top stripe is not needed because the cover carries the sport identity.
- Capacity bar: 6px, track `action.hover`, fill sport `base` (a non-text use, allowed by F1 §1.2), at 100% the fill is `text.disabled` and the label reads "מלא · רשימת המתנה".
- The bottom line depends on status: registration open "ההרשמה פתוחה עד {date}"; in progress "{finished}/{total} משחקים שוחקו" (from summary counts when present, §19); completed "🏆 {champion}" when known; cancelled "הטורניר בוטל".
- Phone 360: a single column of full-width cards (328px). The cover drops to 16:6 and the title stays 2 lines.

Filters (one row, horizontally scrollable on phone, with the `carousel-edge` fade like `SportFilterBar`):
- sport chips (reuse `SportFilterBar` styling: selected chip uses `base` fill with `ink` text);
- status segments "הכל · פתוחים להרשמה · מתקיימים · הסתיימו";
- a "שלי" toggle chip (signed in only), mapped to `mine=1`.

Sections (no filter applied): "פתוחים להרשמה", "מתקיימים עכשיו", "הסתיימו". Each has its own heading and grid, and empty sections are omitted.

### 1.3 States

- Loading: 6 card skeletons (cover block + 3 lines).
- Empty, no tournaments at all: an emoji row "🏆", title "עוד אין טורנירים", body "כשייפתח טורניר באזור שלך, הוא יופיע כאן." / "No tournaments yet. When one opens near you, it'll show up here." Creators see a "טורניר חדש" CTA under it.
- Empty with filters: "אין טורנירים שמתאימים לסינון" + "ניקוי סינון".
- Error / offline: F1 §1.8.
- Drafts (roles only): a "טיוטה" chip and the card at 85% opacity; listed first under "הטיוטות שלי".

Testids: `tournaments-list`, `tournament-card-{id}`, `tournaments-filter-sport-{SPORT}`, `tournaments-filter-status-{key}`, `tournaments-filter-mine`, `tournaments-create`, `tournaments-empty`, `nav-tournaments`, `home-tournaments-rail`.

---

## 2. Tournament page shell (hero + tabs)

Routes: web `/tournaments/[id]`, mobile `app/tournaments/[id].tsx`. Components `TournamentHero` and `TournamentTabs`.

### 2.1 Hero

Desktop (container `lg`):

```
┌────────────────────────────────────────────────────────────────────┐
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ cover / SportCover, 220px ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│ [מתקיים עכשיו] ⚽ כדורגל · ליגה                                     │
│ גביע הקיץ של רמת גן                                    [ניהול הטורניר]│  h3 800 / primary CTA at end
│ 📅 12–14/11  📍 ספורטק תל אביב  👥 12 קבוצות                         │
│ ███████████████░░░░░░░░  12/20 משחקים שוחקו                         │  progress (IN_PROGRESS only)
└────────────────────────────────────────────────────────────────────┘
 [סקירה] [קבוצות] [לוח משחקים] [טבלה] [עץ] [שחקנים בולטים]      ← tabs, start edge first
```

- The hero follows `GameHero` styling: the cover with a dark gradient at the bottom carries the text in white. The meta line uses `text.secondary` below the cover on light surfaces. Format label: LEAGUE "ליגה", KNOCKOUT "נוקאאוט", GROUPS_KNOCKOUT "בתים + נוקאאוט", CUSTOM "מותאם אישית".
- The progress bar appears when IN_PROGRESS: 8px, fill sport `base`, label "{finished}/{total} משחקים שוחקו" (`counts.matchesFinished/matchesTotal`).
- The primary CTA comes from the role matrix (§0.8): contained, `size="large"`, at the end edge on desktop.
- An overflow `IconButton` (`MoreVertRounded` / `ellipsis-vertical`) next to the CTA holds: share ("שיתוף הטורניר"), report ("דיווח על הטורניר" → `ReportUserDialog` variant, §19), and for managers "עריכת פרטים".
- Phone 360: the cover is 160px. The title (h5 800, 2 lines) and meta sit below the cover, not over it. The CTA is a **sticky bottom bar** (52px button, same pattern as the game screen's sticky CTA) so it stays reachable. The progress bar is full width.

### 2.2 Status-specific hero states

| State | Treatment |
| --- | --- |
| DRAFT (roles only) | Warning strip on top of the hero: "טיוטה: רק מנהלי הטורניר רואים אותה" + "פרסום" button (manager+) |
| REGISTRATION_OPEN | Caption "ההרשמה פתוחה עד {date}" + "{approved}/{max} קבוצות" |
| REGISTRATION_CLOSED | Caption "ההרשמה נסגרה · לוח המשחקים יפורסם בקרוב" (or "לוח המשחקים פורסם") |
| IN_PROGRESS | Progress bar; a "חי" chip with a count when any match is LIVE: "2 משחקים חיים עכשיו" (links to schedule filtered by live) |
| COMPLETED | **Champion banner** (§2.4) replaces the progress bar |
| CANCELLED | `Alert severity="warning"` under the hero: "הטורניר בוטל. המשחקים שלא שוחקו בוטלו." The CTA is hidden; tabs remain read-only |

### 2.3 Tabs

- Order (start edge first): סקירה / Overview, קבוצות / Teams, לוח משחקים / Schedule, טבלה / Standings, עץ / Bracket, שחקנים בולטים / Top players.
- Visibility:
  - Standings appears only for LEAGUE and GROUPS_KNOCKOUT.
  - Bracket appears only when a KNOCKOUT stage exists.
  - Schedule shows its empty state until a schedule exists.
  - Top players appears only once at least one match is FINISHED.
- Web: MUI `Tabs variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile`, sticky under the app bar (`position: sticky; top: navbar height`), with the active indicator in `primary`. Each tab is a URL segment (`?tab=standings`) so tabs can be linked and shared.
- Phone: a horizontally scrollable row of pills, 40px high (44px hit area with padding), with the `carousel-edge` fade. The first tab is at the right in RTL. The active pill is `bg-gray-900 text-white dark:bg-cyber-text dark:text-cyber-bg`; the rest are neutral. The row is sticky under the header. On first open, the active pill auto-scrolls into view.
- Mobile app: the same pill row inside the screen, sticky via `stickyHeaderIndices` on the `ScrollView`. Do not use a native top tab navigator (it does not handle RTL well).
- The `UpdatedCue` (§0.5) anchors just under the tab bar.

### 2.4 Champion moment (COMPLETED)

```
┌──────────────────────────────────────────────┐
│              🏆                              │  trophy 40px in sport glow-on-deep circle
│        אלופת גביע הקיץ 2026                   │  caption
│          ● הכחולים                            │  h4 800, team swatch/logo 40
│   🥈 האדומים        🥉 הירוקים                │  podium line (knockout with third place)
│                [שיתוף]                       │
└──────────────────────────────────────────────┘
```

- Surface: sport `deep` background with `ink`-to-`deep` gradient, and the text in white or `glow`. This is the one place a full-bleed accent surface is used (celebration). Contrast: white on `deep` passes for all three sports.
- A podium line shows only when the 2nd and 3rd places are known (knockout final loser; third-place match winner). For a league, show the 2nd and 3rd from standings rank.
- "שיתוף" uses the native share sheet or the Web Share API with the tournament link and text "{team} אלופי {title}! 🏆". A generated image share card is a §19 gap; v1 shares the link only.
- Confetti: one burst of about 1.2s on first view per device (localStorage / SecureStore flag). None with reduced motion.
- The champion comes from the client (final winner, or league rank 1 when complete); see §19.

### 2.5 Overview tab

Stacked sections, each one omitted when empty:
1. "המשחק הבא שלך" (player): one `MatchCard` with countdown.
2. "חי עכשיו": live match cards.
3. "משחקים קרובים": the next 3 matches, with "ללוח המלא" linking to Schedule.
4. A compact standings snippet: top 4 of each table (or my group), with "לטבלה המלאה".
5. "על הטורניר": description (pre-wrap), venue with a map link, a rules summary card (points "ניצחון 3 · תיקו 1 · הפסד 0", tiebreak order as a numbered list, roster "5 בהרכב · 5–9 שחקנים בקבוצה", legs, best-of for tennis).
6. Registration info (before IN_PROGRESS): dates, approval note "הקבוצות מאושרות ע״י המארגן".
7. Organizer row: avatar, name, and "מנהלים" avatars.

Testids: `tournament-hero`, `tournament-status`, `tournament-cta`, `tournament-progress`, `tournament-champion`, `tournament-share`, `tournament-tab-{overview|teams|schedule|standings|bracket|leaders}`, `tournament-updated-cue`, `tournament-overview-next-match`.

---

## 3. Create / edit tournament wizard (creators only)

Routes: web `/tournaments/new` and `/tournaments/[id]/edit`, mobile `app/tournaments/new.tsx` (with `?id=` for edit). Component `TournamentWizard`. Never linked unless `canCreateTournaments` (create) or `canManage` (edit).

### 3.1 Frame

- **Desktop**: two columns inside container `md`. The vertical stepper sits at the start edge (MUI `Stepper orientation="vertical"`, 220px; steps are clickable once visited) and the step content takes the rest. A sticky footer bar inside the card holds "חזרה" (text), "שמירה כטיוטה" (outlined), and "הבא" (contained) at the end. On the last step, "הבא" becomes "פרסום" / "שמירה".
- **Phone**: top header with close (X, confirms if there are unsaved changes) and title, then a progress line "שלב 2 מתוך 5 · קבוצות והרכבים" with a 4px segmented progress bar. Content scrolls. A sticky bottom bar has "חזרה" (44px text) and "הבא" (52px contained, flex 1). "שמירה כטיוטה" sits in the header as a text button.
- **Keyboard open (mobile)**: the sticky bar hides (`KeyboardAvoidingView` + listening to keyboard events) and the same buttons appear inline after the last field, so the keyboard never covers a primary action.
- Each step validates live. Errors appear on blur and on "הבא". "הבא" never disables; on press it scrolls to the first error and shows the message.

### 3.2 Step 1: basics

Fields, in order:
- title (required, max 80);
- sport (3 big tiles, 72px tall, using the sport emoji and `tint`/`base` selection);
- description (multiline, max 2000, counter);
- cover image (reuse the existing image upload control from game edit);
- dates: start date and time (required), end (optional);
- venue: field picker (reuse the existing field search) or free text "מיקום אחר";
- visibility switch "טורניר ציבורי" with helper "טורניר ציבורי מופיע ברשימת הטורנירים. טורניר פרטי נגיש רק בקישור.";
- `openToMinors`: not shown in v1 (server forces false). A static info row says "בשלב זה הטורניר פתוח לבני 18 ומעלה בלבד." / "For now, tournaments are open to players 18 and over."

### 3.3 Step 2: teams and roster limits

```
מספר קבוצות
  מינימום  [–] 4 [+]        מקסימום  [–] 12 [+]
גודל קבוצה
  בהרכב (על המגרש)   [–] 5 [+]
  שחקנים בקבוצה      ●━━━━━━━━●━━━━━━━━━━○   5 – 9      (web: dual-thumb Slider; mobile: two steppers)
                     1        5         9     20
  תצוגה:  ▮▮▮▮▮|▯▯▯▯   5 בהרכב · עד 4 מחליפים              live RosterMeter preview
```

- Steppers are 44px (web IconButton outlined; mobile `w-11 h-11 rounded-xl border`), and the value is tappable to type it. Labels: `aria-label` "הגדלת מספר הקבוצות המקסימלי" and so on.
- Players range on web: MUI `Slider` with `value={[min, max]}`, `min=1 max=30`, `disableSwap`, marks at `startersPerTeam`, the track in `primary`, and `getAriaLabel` "מינימום שחקנים" / "מקסימום שחקנים". Two number steppers under it stay in sync. Mobile has steppers only; dual-thumb sliders without a library are unreliable in RTL.
- Live validation, inline caption under the group in `error.main`:
  - `minPlayers > maxPlayers`: "המינימום גדול מהמקסימום"
  - `starters > minPlayers`: "בהרכב לא יכולים להיות יותר שחקנים מהמינימום בקבוצה ({min})"
  - `minTeams > maxTeams`: "מספר הקבוצות המינימלי גדול מהמקסימלי"
  - KNOCKOUT with `maxTeams` not a power of two shows as info, not an error: "עם {n} קבוצות יהיו {byes} פטורים בסיבוב הראשון"
- Live preview: a `RosterMeter` (§4.4) with sample values and the sentence "כל קבוצה תצטרך {min}–{max} שחקנים, {starters} מהם על המגרש."

### 3.4 Step 3: format and rules

- **Format**: 4 large radio cards (2x2 desktop, stacked phone). Each has an icon, a name, and a one-line explanation with a tiny diagram:
  - ליגה "כולם נגד כולם, טבלה אחת"
  - נוקאאוט "מפסידה יוצאת, עד הגמר"
  - בתים + נוקאאוט "שלב בתים ואחריו עץ"
  - מותאם אישית "בונים את המשחקים ידנית"
- **Match count preview** (live, caption under the cards): "עם 12 קבוצות: 66 משחקים בליגה" / "11 משחקים בנוקאאוט" / "בתים: 2 בתים של 6 · 30 משחקים + 7 בנוקאאוט". It is computed client side with the shared engines' counting helpers. Without them, show only the formula text (§19).
- Points (LEAGUE / GROUPS): three steppers in one row "ניצחון 3 · תיקו 1 · הפסד 0", range −10..10.
- **Tiebreak order**: a reorderable list. Desktop uses a drag handle plus up/down arrow buttons for keyboard; phone uses up/down 44px buttons only. Items are HEAD_TO_HEAD "מפגש ישיר", GOAL_DIFFERENCE "הפרש שערים", GOALS_FOR "שערי זכות", WINS "ניצחונות", FAIR_PLAY "משחק הוגן", DRAW_LOT "הגרלה". Unused ones sit below a divider and can be added with "+". For basketball the labels say "סל" instead of "שערים" (הפרש סלים, סלי זכות).
- Legs: segmented "סיבוב אחד" / "בית וחוץ".
- Groups (GROUPS_KNOCKOUT): steppers "מספר בתים" (1..16) and "עולות מכל בית" (1..16). Live caption: "16 קבוצות יעלו לשלב הנוקאאוט".
- Knockout: a switch "משחק על המקום השלישי", seeding segmented "ידני" / "אקראי".
- Tennis only: best of segmented "2 מתוך 3" / "3 מתוך 5".
- Timing: match minutes, break minutes, minimum rest (steppers with "דק׳" suffix). These prefill the schedule builder.
- Forfeit score: "ניצחון טכני: 3–0" (two steppers), collapsed under "הגדרות מתקדמות".

### 3.5 Step 4: registration

- Registration opens (date and time, default now) and closes (required before publish); roster lock time (optional, helper "אחרי המועד הזה קפטנים לא יוכלו לשנות את הסגל").
- Approval switch "אישור ידני של קבוצות" (default on), helper "כשכבוי, קבוצה שנרשמת מאושרת מיד (עד שהטורניר מתמלא)".
- Validation: close after open; lock after close or equal; all of them before `startsAt` (warning, not an error, if close is after start).

### 3.6 Step 5: review and publish

- Summary cards per step, each with "עריכה" jumping back.
- Problems list at the top (`Alert severity="warning"`), e.g. "לא נקבע מועד סגירת הרשמה". Publishing is disabled only for hard errors.
- Actions: "שמירה כטיוטה" (outlined) and **"פרסום ופתיחת הרשמה"** (contained). The publish confirm dialog reads: title "לפרסם את הטורניר?", body "הטורניר יופיע ברשימה וקבוצות יוכלו להירשם עד {date}. אחרי פרסום עדיין אפשר לערוך פרטים, אבל לא את מבנה הטורניר אחרי שייבנה לוח משחקים.", buttons "ביטול" / "פרסום".
- Edit mode on a published tournament: fields locked by the server after a schedule exists (format, limits) show a lock icon and caption "נעול אחרי בניית לוח המשחקים". The organizer sees "שינוי בכל זאת" (sets `force`) with a confirm that warns "שינוי המבנה עלול לבטל משחקים שתוכננו".

### 3.7 States

- Saving: the buttons show a spinner and the fields are disabled.
- Saved draft: Snackbar "הטיוטה נשמרה".
- Server validation 400: map to fields and show the top alert from F1 §3.8.
- Leaving with changes: confirm "לצאת בלי לשמור?" (F1 keys reused).
- Offline: keep the values and show the error alert with retry.

Testids: `wizard`, `wizard-step-{1..5}`, `wizard-next`, `wizard-back`, `wizard-save-draft`, `wizard-publish`, `wizard-sport-{SPORT}`, `wizard-format-{FORMAT}`, `wizard-min-teams`, `wizard-max-teams`, `wizard-starters`, `wizard-min-players`, `wizard-max-players`, `wizard-players-range`, `wizard-tiebreak-{KEY}`, `wizard-error-{field}`.

---

## 4. Register a team and the captain's team page

Routes: web `/tournaments/[id]/team/new` and `/tournaments/[id]/teams/[teamId]`; mobile `app/tournaments/[id]/team/new.tsx` and `app/tournaments/[id]/teams/[teamId].tsx`. The team page is one screen with role-based actions; teams are viewed read-only from the Teams tab (§6).

### 4.1 Create team

A short form (dialog on desktop at `maxWidth="sm"`; full screen on phones):
- Name (required, max 40, live counter).
- Colour: a row of 8 swatches, 44px targets, from the existing pick-session palette (keep the hexes in one shared constant; propose `shared/teamColors.js`, §19). The selected swatch has a 2px `text.primary` ring and a check.
- Logo (optional, existing image upload, round crop preview).
- Preview card `TeamBadge` at the top updates live.
- Caption "אתם תהיו הקפטן של הקבוצה. אחרי ההרשמה אפשר להזמין שחקנים." / "You'll be the captain. After registering, invite your players."
- Submit "רישום הקבוצה" / "Register team".
- Result:
  - approved: "הקבוצה נרשמה!"
  - pending: "הקבוצה נרשמה וממתינה לאישור המארגן"
  - waitlisted: "הטורניר מלא. הקבוצה ברשימת ההמתנה"

  All three go straight to the team page with the status banner.

### 4.2 Team page layout

Desktop (container `md`):

```
┌──────────────────────────────────────────────────────────┐
│ ◉ logo 56  הכחולים                  [עריכה] [⋯]          │  TeamBadge large + captain actions
│ גביע הקיץ של רמת גן · כדורגל                              │
├──────────────────────────────────────────────────────────┤
│ ⓘ ממתינה לאישור המארגן                                    │  status banner (§4.5)
├──────────────────────────────────────────────────────────┤
│ סגל · 6 שחקנים                                            │
│ ▮▮▮▮▮|▮▯▯▯   6 מתוך 5–9 · 5 בהרכב                          │  RosterMeter
│ ◯ דני כהן     [ק] קפטן     #10                           │
│ ◯ רון לוי     בסגל         #7      [⋯]                    │
│ ◯ יעל אבן     ספסל                 [⋯]                    │
│ ◯ עומר ש.     הזמנה נשלחה          [ביטול הזמנה]           │  invited rows muted
├──────────────────────────────────────────────────────────┤
│ הזמנת שחקנים  [🔍 חיפוש שחקנים או חברים        ]           │
│ קישור הצטרפות  joinup.app/t/…?join=K7P2  [העתקה][שיתוף][↻]│
├──────────────────────────────────────────────────────────┤
│ המשחקים של הקבוצה  (MatchCard list)                       │
│                              [יציאה מהטורניר]             │  destructive, bottom
└──────────────────────────────────────────────────────────┘
```

Phone 360: the same sections stacked, each in a card shell. The invite search opens a full-screen picker. The join code row stacks as a code box (monospace, 20px 700, letter-spacing 0.1em) with 3 icon buttons (44px) under it.

### 4.3 Roster rows

- Row min-height 56: avatar 40, name (2-line clamp), role chip, jersey number at the end edge (`#10`, tabular, `text.secondary`), and an overflow menu for the captain and managers.
- Role chips (gender-neutral Hebrew): CAPTAIN "קפטן" (primary outlined + `ShieldRounded`), PLAYER "בסגל", SUBSTITUTE "ספסל". English: Captain / Player / Sub.
- Member status:
  - ACCEPTED: normal row.
  - INVITED: avatar at 60% opacity with the caption "הזמנה נשלחה", plus a "ביטול הזמנה" text button.
  - DECLINED: caption "דחו את ההזמנה", the row muted, shown to the captain only and collapsed under "הזמנות שנדחו (n)".
  - REMOVED: not shown.
- Overflow actions (captain/manager): "מספר חולצה" (numeric dialog 0–99), "העברה לספסל" / "העברה לסגל", "הסרה מהקבוצה" (confirm "להסיר את {name} מהקבוצה?"). A player on their own row gets "עזיבת הקבוצה". The captain row has no remove (`CAPTAIN_CANNOT_LEAVE`).
- Privacy: name and avatar only; no profile link for members whose profile is private (link only where the profile route allows, same as the game roster).

### 4.4 RosterMeter

A horizontal bar of `max` segments, each 1fr with a 2px gap and 10px tall (6px when compact), rounded ends.
- Filled segments are accepted members; invited members show as hatched segments with a `divider` border.
- A marker tick above the bar at `min` (label "מינימום {min}") and a small marker at `starters` (label "בהרכב {starters}").
- Fill colour by state:

  | State | Colour | Caption |
  | --- | --- | --- |
  | below min | `warning.main` / `bg-amber-400` | "חסרים עוד {n} שחקנים כדי שהקבוצה תהיה תקינה" |
  | within range | `success.main` / `bg-brand` | "הסגל תקין" |
  | at max | `text.secondary` / `bg-gray-500` | "הסגל מלא" |

- Above 20 segments the bar becomes continuous with ticks.
- `role="meter"`, `aria-valuemin=0`, `aria-valuemax=max`, `aria-valuenow=accepted`, `aria-valuetext` "6 שחקנים, נדרשים 5 עד 9".

### 4.5 Team status banners

Same height and shape for all: radius 12, icon, title, body, optional action. Web `Alert` variant `standard`; mobile a rounded box with the matching soft colour.

| Status | Severity | Hebrew | English |
| --- | --- | --- | --- |
| PENDING | info | "ממתינה לאישור המארגן. בינתיים אפשר להזמין שחקנים." | "Waiting for organizer approval. You can invite players meanwhile." |
| APPROVED | success | "הקבוצה אושרה! נתראה במגרש." (dismissible, stays as a small "מאושרת" chip) | "Your team is in! See you on the field." |
| WAITLISTED | warning | "הטורניר מלא. הקבוצה במקום {n} ברשימת ההמתנה." (without position: "הקבוצה ברשימת ההמתנה", §19) | "The tournament is full. Your team is #{n} on the waitlist." |
| REJECTED | error-soft (`action.hover` bg, `error.main` icon) | "הקבוצה לא אושרה לטורניר הזה." | "Your team wasn't accepted to this tournament." |
| WITHDRAWN | neutral | "הקבוצה יצאה מהטורניר." | "Your team withdrew from this tournament." |
| Roster invalid (any status) | warning | "חסרים {n} שחקנים. קבוצה עם פחות מ-{min} שחקנים לא תאושר." | "{n} more players needed. Teams under {min} players can't be approved." |
| Roster locked | info + lock | "הסגל נעול מ-{date}. לשינויים פנו למארגן." | "Roster locked since {date}. Contact the organizer for changes." |

### 4.6 Invite players and join code

- Invite: a search field "חיפוש שחקנים או חברים". Before typing it shows a "חברים" list (friends API); while typing it shows people search results. Each result row has a 44px "הזמנה" button that becomes "הוזמן ✓" (disabled) after success. Results for players already in another team show the caption "כבר בקבוצה אחרת" and no button (when the server tells us; otherwise the error toast, §4.7).
- Join code box: label "קישור הצטרפות", the code and 3 actions:
  - "העתקה": copies the link, Snackbar "הקישור הועתק".
  - "שיתוף": native share with text "בואו לשחק איתנו ב{title}! להצטרפות לקבוצה {team}: {link}".
  - "קוד חדש": confirm "ליצור קוד חדש? הקישור הקודם יפסיק לעבוד."
- Link format decision: `/tournaments/{id}?join={code}`. It is the page the brief names, plus a query parameter that opens the join sheet (§5.2), with no new route on either platform.
- When registration is closed, the code box shows "ההרשמה נסגרה, הקישור לא פעיל" and its actions are hidden.

### 4.7 Errors for known codes

These are inline in the relevant control (invite row, join sheet, create form), in plain language, never with the raw code.

| Code | Hebrew | English |
| --- | --- | --- |
| `PLAYER_IN_OTHER_TEAM` | "השחקן כבר בקבוצה אחרת בטורניר הזה" (for yourself: "כבר יש לך קבוצה בטורניר הזה") | "This player is already on another team in this tournament" / "You're already on a team in this tournament" |
| `TOO_MANY_PLAYERS` | "הסגל מלא ({max} שחקנים)" | "The roster is full ({max} players)" |
| `ROSTER_LOCKED` | "הסגל נעול. לשינויים פנו למארגן." | "The roster is locked. Contact the organizer." |
| `REGISTRATION_CLOSED` | "ההרשמה לטורניר נסגרה" | "Registration is closed" |
| `NAME_TAKEN` | "כבר יש קבוצה בשם הזה, נסו שם אחר" | "That name is taken, try another" |
| `INVALID_CODE` | "הקישור לא תקין או שהוחלף. בקשו קישור חדש מהקפטן." | "This link is invalid or was replaced. Ask the captain for a new one." |
| `CAPTAIN_CANNOT_LEAVE` | "קפטן לא יכול לעזוב. אפשר להוציא את הקבוצה מהטורניר." | "Captains can't leave. You can withdraw the team instead." |
| `MINORS_NOT_ALLOWED` | not an error: see the minors card below | |

**Minors card** (kind, not an error). Use an info surface (`action.hover` bg), the trophy icon in `text.secondary`, title "הטורניר הזה פתוח לבני 18 ומעלה" / "This tournament is for players 18+", body "בינתיים טורנירים פתוחים רק למבוגרים. אפשר לעקוב אחרי המשחקים והתוצאות כאן." / "For now, tournaments are for adults only. You can still follow the matches and results here." No action button. Show it in place of the register CTA when known up front (§19), or replacing the join/create form after a 403.

### 4.8 Withdraw

A destructive text button at the bottom, "הוצאת הקבוצה מהטורניר" / "Withdraw team" (captain).
- Before a schedule exists, the confirm reads: "להוציא את {team} מהטורניר? כל השחקנים יוסרו מהקבוצה."
- After a schedule exists it reads: "להוציא את {team}? המשחקים שלה שעוד לא שוחקו ייחשבו כהפסד טכני." with the button "הוצאה" in error colour.

Testids: `team-create-form`, `team-create-name`, `team-create-color-{i}`, `team-create-submit`, `team-page`, `team-status-banner`, `team-roster`, `team-member-{userId}`, `team-member-menu-{userId}`, `roster-meter`, `team-invite-search`, `team-invite-{userId}`, `team-join-code`, `team-join-code-copy`, `team-join-code-share`, `team-join-code-rotate`, `team-withdraw`, `tournament-minors-card`.

---

## 5. Invitee flow

### 5.1 My invites

- Entry: notification deep link (`TOURNAMENT_TEAM_INVITE` → `/tournaments/{id}`), a hero banner on that tournament (§0.8), and a list screen "ההזמנות שלי" (web `/tournaments/invites`, mobile `app/tournaments/invites.tsx`), linked from the tournaments list header as a badge button "הזמנות (2)" when non-empty.
- Card: tournament title, sport emoji, date; team `TeamBadge` with team colour; "הקפטן: {captainName}"; invited relative time. Actions are 44px: "הצטרפות" (contained) and "דחייה" (text).
- **Several invites in the same tournament**: group them under the tournament title with an info line above them: "אפשר להצטרף לקבוצה אחת בלבד. הצטרפות תבטל את שאר ההזמנות לטורניר הזה." / "You can join one team only. Joining cancels your other invites for this tournament." The accept confirm repeats it: "להצטרף ל{team}? ההזמנות מ-{other teams} יבוטלו."
- After accepting: the card turns into a success state "הצטרפת ל{team}!" with the button "לעמוד הקבוצה", and the sibling invites disappear with a short fade.
- Empty: "אין הזמנות פתוחות" / "No open invites".

### 5.2 Join by link / code

Opening `/tournaments/{id}?join={code}` shows the tournament page with a sheet on top (dialog on desktop):
- The tournament summary (title, dates, sport).
- When the team can be previewed (§19), its name, colour and captain, and spots "{accepted}/{max}". Without a preview, the copy reads "הוזמנת להצטרף לקבוצה בטורניר הזה".
- Buttons "הצטרפות לקבוצה" and "לא עכשיו".
- When signed out, the primary becomes "התחברות להצטרפות" (returns to the same URL with the code).

Results: success becomes the team page with a "הצטרפת לקבוצה!" Snackbar. Errors follow §4.7. Minors get the minors card. If the user already has a team, the sheet shows "כבר יש לך קבוצה בטורניר הזה" with "לקבוצה שלי".

A manual code entry is there for people who got the code verbally: a small "יש לך קוד?" link in the hero for signed-in non-members opens the same sheet with a 6-char code field (monospace, auto uppercase, `autoCapitalize="characters"`).

Testids: `invites-list`, `invite-card-{teamId}`, `invite-accept-{teamId}`, `invite-decline-{teamId}`, `invites-one-team-note`, `join-sheet`, `join-code-input`, `join-submit`.

---

## 6. Teams tab

- **Desktop**: a grid of team cards, 3 columns. The card is 88px tall: logo/swatch 40, name (2 lines), caption "{n} שחקנים" plus a group chip ("בית א׳") when grouped, and "הקבוצה שלך" as a primary outlined chip for my team (also sorted first). A seed number appears in the corner for managers.
- **Phone**: a list. Rows are 64px with a logo 36, name 2 lines, count at the end edge, and a chevron.
- Grouped tournaments use group sections ("בית א׳", "בית ב׳") once groups exist.
- Tapping a team opens the **team detail sheet**. It is a bottom sheet on phones, a right-side `Drawer` on desktop (anchor `start` in RTL, i.e. right; 400px), with a full-page link "לעמוד הקבוצה". Content: the large `TeamBadge`; the roster list (avatar, name, jersey number, role chip, no other info), sorted captain, players, subs; and the team's matches mini-list (3 recent or upcoming).
- Privacy: no ages, no cities, and no profile link unless the profile route allows it.
- States:
  - Loading: 6 card skeletons.
  - Empty before registration opens: "עוד אין קבוצות. ההרשמה תיפתח ב-{date}."
  - Empty while open: "עוד אין קבוצות רשומות. היו הראשונים!" with a "רישום קבוצה" CTA when allowed.
  - Withdrawn teams: listed at the end under "יצאו מהטורניר", muted and struck through.
- Managers additionally see a status filter (all, pending, waitlist) that links to the manage queue (§11.1).

Testids: `teams-tab`, `team-card-{teamId}`, `team-sheet`, `team-sheet-member-{userId}`, `teams-empty`.

---

## 7. Schedule tab

### 7.1 Layout

- Toolbar (sticky under the tabs, wrapping on phone):
  - a day selector: chips per date "שישי 12/11" plus "הכל"; the default is today when today is a match day, else the first upcoming day;
  - a "הקבוצה שלי" toggle (players), also the default when the viewer has a team;
  - a team select; a status select (הכל / חי / קרובים / הסתיימו);
  - a round/stage select for multi-stage tournaments.
- Grouping: by day (header "יום שישי, 12 בנובמבר"), then by time slot. When there is one day, group by round or stage instead ("מחזור 3", "בית א׳ · מחזור 1", "רבע גמר").
- Desktop: two columns of `MatchCard` per group when the container is `lg`; one column at `md` and below.

### 7.2 MatchCard

```
Desktop / phone (328px wide)
┌──────────────────────────────────────────┐
│ #12 · 18:30 · מגרש 2           [חי]      │  caption row: number, time, court; status chip at end
│ ● הכחולים             2 : 1      האדומים ●│  ScoreCluster between SlotLabels (F1 §1.1)
│ בית א׳ · מחזור 2                [📅] [✎]  │  stage caption; add-to-calendar; score (scorekeeper+)
└──────────────────────────────────────────┘
```

- The shell is the section card with tighter padding (12px).
  - My team's card gets a 3px start-edge bar in `primary` and the "הקבוצה שלך" caption.
  - The LIVE card border is `error.main` at 40%.
- Team slots: `SlotLabel` with a 1-line ellipsis in the card (names are long, so the full name is in the label and title), max width `calc(50% - 40px)`.
  - The home slot is at the start edge (F1 §1.1).
  - The winner's name is 800 weight; the loser's is `text.secondary`.
- Before kickoff, the score area shows the time "18:30" (or "–" with no time) instead of numbers.
- Penalties: `2 : 2` with a caption below the cluster "פנדלים 4 : 3", with the same order rule.
- Forfeit: the score shows the forfeit score plus the chip "ניצחון טכני"; the forfeiting team's name has a small "(הפסד טכני)" caption.
- Postponed: the time is struck through, chip "נדחה", caption "מועד חדש ייקבע".
- Cancelled: card at 60% opacity, chip "בוטל".
- Tennis: the cluster shows sets won (big) and, below it, a mini set row "6–4 · 3–6 · 10–7". Each set renders as separate spans, home number at the start (F1 §1.1). Each set winner's number is bold.
- Actions (end edge of the last row, 40px web / 44px mobile):
  - add to calendar (scheduled matches with a time and my team only, or a per-day "הוספה ליומן" in the day header for all my matches; uses the existing calendar helper on mobile and an `.ics` download on web);
  - score entry `EditRounded` (canScore and the tournament IN_PROGRESS).
- Tapping the card opens the match detail (§10).

### 7.3 States

- Loading: grouped skeletons (3 headers, 2 cards each).
- No schedule yet:
  - viewers see "לוח המשחקים עוד לא פורסם. הוא יופיע כאן אחרי סגירת ההרשמה." / "The schedule isn't out yet. It'll appear here after registration closes.";
  - managers see the same plus the CTA "בניית לוח משחקים" linking to §11.2.
- Filters with no results: "אין משחקים שמתאימים לסינון" + "ניקוי".
- Team withdrawn after scheduling: its matches render as FORFEIT (or POSTPONED when the opponent is a placeholder) with the withdrawn team's name struck through.
- Cancelled tournament: all unplayed cards show "בוטל".

Testids: `schedule-tab`, `schedule-day-{yyyy-mm-dd}`, `schedule-filter-team`, `schedule-filter-status`, `schedule-filter-mine`, `match-card-{matchId}`, `match-card-score-{matchId}`, `match-card-edit-{matchId}`, `match-card-calendar-{matchId}`, `schedule-empty`.

---

## 8. Standings tab

Component `StandingsTable({ table, myTeamId, advanceCount, mode, canManage, onSetManualRank })`. One table per `tables[]` entry. Tables are stacked; with more than 2 groups on a phone, there is a group selector pill row "בית א׳ · בית ב׳ · …" above a single table.

### 8.1 Columns

| Key | Hebrew header | English | Compact (360) | Full |
| --- | --- | --- | --- | --- |
| rank | # | # | ✓ 28px | ✓ |
| team | קבוצה | Team | ✓ flex, sticky | ✓ sticky |
| played | מש׳ | P | ✓ 32px | ✓ |
| won | נ׳ | W | – | ✓ |
| drawn | ת׳ | D | – | ✓ |
| lost | ה׳ | L | – | ✓ |
| gf | זכות | GF | – | ✓ |
| ga | חובה | GA | – | ✓ |
| gd | הפרש | GD | ✓ 40px | ✓ |
| points | נק׳ | Pts | ✓ 40px, bold | ✓ bold |

- Basketball labels: GF "סלי זכות", GA "סלי חובה" (the column headers stay "זכות/חובה"). Tennis tables (when LEAGUE) use GF/GA as games won and lost; the header tooltip says "משחקונים".
- Each header abbreviation has a full label in `title` / `accessibilityLabel` ("משחקים", "ניצחונות", ...).
- GD shows a sign: "+5", "−2" (a real minus U+2212), "0". Wrap the sign and number in an LTR isolate (`<bdi dir="ltr">`, mobile `writingDirection: 'ltr'`) so the sign stays on the left of the number in RTL.

### 8.2 360px layout

```
compact (default on phone)                         ← RTL: team column at right
┌────────────────────────────────────────────┐
│ #   קבוצה                    מש׳  הפרש  נק׳ │  header 32px, caption 700
│ 1 ▎ ● הכחולים                  5   +7   13 │  rows 48px
│ 2 ▎ ● האדומים                  5   +3   10 │  ▎ = qualification bar (start edge)
│- - - - - - - - - - - - - - - - - - - - - - │  dashed line after last qualifier
│ 3   ● הירוקים                  5   −1    7 │
│ =4  ● מכבי רחוב הרצל הארוך…    5   −4    4 │  tied: "=" prefix, 1-line ellipsis
│ ▾ 1 נ׳ · 1 ת׳ · 3 ה׳ · שערים 6:10         │  expanded detail line (tap)
└────────────────────────────────────────────┘
 ● עולות לשלב הבא   [כל העמודות ⇄]              legend + mode switch
```

- Widths at 360 (content 328): rank 28, numbers 32 + 40 + 40, so team = 328 − 140 − 16 (cell padding) = 172px. That fits a swatch and about 14 Hebrew characters before the ellipsis.
- The row expand is a chevron-less tap target (the whole row, 48px). The expanded line uses caption `text.secondary` and holds W/D/L and "שערים {gf}:{ga}" (gf at the start, F1 §1.1). Only one row is expanded at a time.
- **Full mode** (switch): a horizontal scroll container. The rank and team columns are sticky at the start edge: web `position: sticky; inset-inline-start: 0` with `background: background.paper` and a 1px end-edge shadow while scrolled; mobile uses two side-by-side views, a fixed start column and a horizontal `ScrollView` for the numbers, with rows height-locked so they align. The team column is 140px with 1-line ellipsis.
- From 600px up: full mode without scrolling and no switch.
- Number cells: `textAlign: center`, tabular, `body2`; points 800 weight.

### 8.3 Markers

- **My team**: row background `alpha(primary.main, 0.08)` / `bg-brand-mist dark:bg-brand-ink`, and the name 800 weight.
- **Qualification zone** (GROUP tables with `rules.advancePerGroup`, or a LEAGUE with no zone): a 3px start-edge bar in `success.main` / `bg-brand` on rows `rank <= advance`, a dashed `divider` line after the last one, and the legend "● עולות לשלב הבא" / "● Advance to the next stage". When `complete`, the qualifiers' names also get a small "עולה" chip at 600px+.
- **League winner**: when the table is complete and the tournament is COMPLETED, row 1 gets a 🏆 before the name.
- **Ties**: rows with `tied: true` show the rank as "=4" (equals sign before the number, `text.secondary`). Hovering or long-pressing shows the tooltip "שוויון מלא בכל שוברי השוויון".
- **Manual rank**: rows with a `manualRank` show the `PanToolAltRounded` 14px icon next to the rank, tooltip "הסדר נקבע ידנית ע״י מארגן הטורניר".
- **`needsManualRank`**: a warning banner above that table.
  - Viewers see "יש שוויון שהשוברים לא הכריעו. הדירוג יעודכן אחרי שהמארגן יקבע את הסדר." The text avoids implying a competitive ranking.
  - Managers see the same plus the button "קביעת סדר" that opens the manual rank dialog (§11.1).
- **Incomplete**: when `complete: false`, a caption under the table title reads "הטבלה עדיין לא סופית" / "Table not final yet". Before any match is played, the table shows all teams with zeros and the caption "עוד לא שוחקו משחקים".

### 8.4 States

- Loading: a header plus 6 row skeletons.
- No tables (no schedule): "הטבלה תופיע אחרי שייבנה לוח המשחקים".
- Error and offline per F1 §1.8.
- Long names: 1 line in tables, the full name in `title`.
- 2 teams: the table still renders (2 rows).
- 32 teams in a league: no virtualization needed (32 rows). The header row stays sticky at the top of the scroll.

Testids: `standings-tab`, `standings-table-{stageId}-{groupId|all}`, `standings-row-{teamId}`, `standings-row-detail-{teamId}`, `standings-mode-toggle`, `standings-needs-manual-rank`, `standings-set-order`, `standings-group-{groupId}`.

---

## 9. Bracket view

Component `BracketView({ stage, myTeamId, highlightTeamId, mode, onOpenMatch })`. Data: `GET /:id/bracket` (rounds with `name`, matches with `isThirdPlace`).

### 9.1 Round names

| `name` | Hebrew | English |
| --- | --- | --- |
| `FINAL` | גמר | Final |
| `SEMI_FINAL` | חצי גמר | Semi-final |
| `QUARTER_FINAL` | רבע גמר | Quarter-final |
| `ROUND_OF_16` | שמינית גמר | Round of 16 |
| `ROUND_OF_32` | שלב 32 האחרונות | Round of 32 |
| `ROUND_OF_{n}` | שלב {n} האחרונות | Round of {n} |
| third place | משחק על המקום השלישי | Third-place match |

### 9.2 Desktop layout (one-sided, §0.1)

```
RTL: round 1 at right → final at left
   גמר              חצי גמר             רבע גמר
                                      ┌──────────────┐
                    ┌──────────────┐──┤ ● הכחולים  2 │
                    │ ● הכחולים  1 │  │ ● ירוקים   0 │
 ┌──────────────┐───┤ ● צהובים   0 │  └──────────────┘
 │ ● הכחולים    │   └──────────────┘  ┌──────────────┐
 │ ● המנצחת #6  │                   ──┤ ● צהובים   3 │
 └──────────────┘                     │ ● סגולים   1 │
                                      └──────────────┘
   🥉 משחק על המקום השלישי  (card under the final column)
```

- Columns: one per round, 216px wide, 32px gap, each with a header (round name, caption 700, plus round dates "12/11"). The final column also gets the trophy icon.
- Cell (`BracketCell`): 200x72, radius 12, card shell. Two rows of 36px, each with the swatch or logo 20, the name (1 line), and the score at the end edge (tabular, 16px). The top row is home and the bottom away. Above the cell sits a caption "#{n} · {time}" when scheduled.
  - Winner row: name and score 800 weight, plus a 2px start-edge bar in sport `deep` / `glow` (dark).
  - Loser row: `text.secondary`.
  - Before play: the score area shows nothing, the time sits in the caption, and placeholders follow §0.4.
  - Penalties: score "1" with a small "(4)" after it in caption size, same row.
  - Tennis: instead of one score, up to 3 (or 5) set columns of 18px, small 13px numbers, set winner bold. The match winner gets the same start-edge bar. At 5 sets the cell widens to 240px.
  - LIVE: a 6px red dot before the caption and the border in `error.main` at 40%.
- Vertical rhythm: the cells of round r+1 are centred between their two feeders. Spacing doubles per round (standard bracket geometry); the top-of-column offset is `(2^(r-1) - 1) * (cellH + gap) / 2`.
- Connectors: 2px lines in `divider`, drawn as an SVG overlay per column pair or with CSS borders on wrapper boxes. Elbows are right-angled with a 6px radius. In RTL, the lines leave each cell from its end edge (left) toward the next round.
- **Winner path highlight**: lines and cell borders along the path of `highlightTeamId` use sport `deep` (light) / `glow` (dark), 2px. The default highlight is my team. Hovering or focusing a team name highlights its path temporarily, and clicking pins it. Other cells dim to 70% opacity while a path is pinned, and "ביטול הדגשה" clears it.
- **Byes**: a round-1 match whose slot is `BYE` renders as a ghost cell: dashed `divider` border, half height (36px), only the advancing team, and the caption "פטור". This keeps the geometry intact. With many byes (>25% of round 1) a toggle "הסתרת פטורים" (default on for phones) collapses them, and the round-2 cells get the caption "עלתה ישירות".
- **Third place**: a separate cell under the final column with the 🥉 header. It is not connected by lines; it gets a dotted line from the semi-final losers when space allows, otherwise none.
- **Zoom**: the toolbar above the bracket holds "התאמה למסך" (fit width: CSS `transform: scale()` on the canvas, min 0.55, with the container height adjusted), "100%", and "+ / −" buttons (aria labelled). The canvas scrolls horizontally inside the container, starting scrolled to the start edge (round 1). Keyboard: arrow keys move focus between cells in bracket order (focus ring per the theme).
- Density by team count:
  - ≤ 8 teams: no zoom controls, the cells grow to 240px.
  - 16 teams: fits `lg` at 100%.
  - 32 teams: opens at "fit" (about 0.8). Below 0.7, names truncate more aggressively and the time caption hides.
- GROUPS_KNOCKOUT: the bracket tab shows only the knockout stage. Unresolved slots read "מקום 1 בבית א׳" until the groups finish.

### 9.3 Phone layout (360): round-by-round

```
[שמינית] [רבע גמר] [חצי] [גמר] [מקום 3]      ← round pills, scrollable, start = first round
┌────────────────────────────────┐ ┌─
│ #5 · שישי 18:30                │ │   next round peeks 24px at the end edge
│ ● הכחולים                    2 │ │
│ ● הירוקים                    0 │ │
├────────────────────────────────┤ │
│ #6 · שישי 19:15                │ │
│ ● צהובים                     3 │ │
│ ● סגולים                     1 │ │
└────────────────────────────────┘ └─
```

- Default mode **round-by-round**: one round at a time as a vertical list of cells, each full width (296px plus the 24px peek). The cells of each consecutive pair are grouped in one rounded container with a thin end-edge bracket line ("]" shape, 2px `divider`) that signals "these two feed one match". The caption under each pair reads "→ המנצחות נפגשות במשחק #9" (the arrow glyph mirrors per `dir`: use `ArrowBackRounded` in RTL, never a text arrow).
- Navigation:
  - round pills at the top (selected pill `bg-gray-900 text-white`);
  - horizontal swipe with snap (web: `scroll-snap-type: x mandatory`, each round column `scroll-snap-align: start`, width `calc(100% - 24px)`; mobile: a horizontal `FlatList` with `pagingEnabled`-like `snapToInterval` and `inverted` handled per platform, see the RTL note);
  - the default round is the current one (the first round with an unfinished match), or the final when completed.
- My team: the same highlight bar on its cells; a floating chip "המסלול של הקבוצה שלי" toggles a filtered view showing only my team's matches across rounds, stacked.
- "תצוגת עץ" in the toolbar switches to the full desktop canvas with pinch zoom (mobile: a `ScrollView` with `maximumZoomScale={2}` `minimumZoomScale={0.5}`; web: the same zoom controls). This is for people who want the whole picture.
- **RTL note for D1**: RN horizontal lists in RTL behave differently on iOS and Android (scroll origin and `snapToOffsets`). Implement round paging with an explicit index state that drives `scrollToIndex`, and verify on both platforms in D1. Do not rely on `I18nManager` auto-mirroring.

### 9.4 States

- Loading: 3 column skeletons on desktop, or 4 cell skeletons on phone.
- No bracket yet (groups ongoing): "העץ ייקבע אחרי שלב הבתים", and the bracket still shows its placeholders ("מקום 1 בבית א׳") so people see the structure.
- No schedule: "העץ יופיע אחרי בניית לוח המשחקים".
- 2 teams: a single final cell centred with the champion moment below it when finished.
- Odd counts: byes per §9.2.
- Cancelled matches inside the bracket: cell at 60% with the chip.
- Completed tournament: the final cell gets a trophy and the winner row a gold-ish accent. Use `warning.main` for the trophy icon only (an icon, not text).

Testids: `bracket-view`, `bracket-round-{round}`, `bracket-round-pill-{round}`, `bracket-cell-{matchId}`, `bracket-cell-slot-{matchId}-{home|away}`, `bracket-third-place`, `bracket-zoom-in`, `bracket-zoom-out`, `bracket-zoom-fit`, `bracket-mode-toggle`, `bracket-my-path`, `bracket-hide-byes`.

---

## 10. Match detail

Route: web `/tournaments/[id]/matches/[matchId]` (also openable as a dialog over the tab, URL-synced); mobile `app/tournaments/[id]/match/[matchId].tsx`. Component `TournamentMatchDetail`.

- **Header**: caption "#{n} · {stage/round name} · {group}", status chip, time "שישי 12/11 · 18:30" (Israel time; show "שעון ישראל" only when the device timezone differs), and venue/court with a map link.
- **Scoreboard**: exactly the F1 read-view scoreboard (F1 §2.2): two `TeamBadge`s with 2-line clamp, `ScoreCluster`, and the outcome chip under the winner. Placeholders follow §0.4.
  - Penalties sit under the cluster: "פנדלים 4 : 3", winner bold.
  - Forfeit: the forfeit chip and "{team} הפסידה טכנית".
  - Tennis: the F1 set grid (F1 §2.3) under the scoreboard.
- **Path context** (knockout): a caption "המנצחת תעלה ל{round} נגד {slot}" and "המפסידה תשחק על המקום השלישי" when relevant, each linking to that match.
- **Per-player stats**: F1 §2.2 stats block grouped by team, when present (§19). Hidden players are simply absent.
- **Teams**: two collapsible roster lists (accepted members, jersey numbers).
- **Actions by role**:
  - scorekeeper+ while IN_PROGRESS: "הזנת תוצאה" (contained, opens §12), or "עדכון תוצאה" when finished;
  - manager+: "עריכת משחק" (time, court, teams; opens the §11.2 edit sheet);
  - players of either team: "הוספה ליומן";
  - everyone: share.
- States: loading uses the F1 scoreboard skeleton; a not-found match shows "המשחק לא נמצא" with a back link; postponed and cancelled show their chip plus a caption.

Testids: `match-detail`, `match-detail-score`, `match-detail-penalties`, `match-detail-sets`, `match-detail-stats`, `match-detail-enter-score`, `match-detail-edit`.

---

## 11. Manage console (organizer / manager)

Route: web `/tournaments/[id]/manage` (tabs: קבוצות · לוח משחקים · סטטוס · הרשאות), mobile `app/tournaments/[id]/manage.tsx` (the same sections as pills). Only rendered with `capabilities.canManage`. The "הרשאות" section requires `canManageRoles`.

Frame: the hero is replaced by a compact header "ניהול · {title}", the status chip and "לעמוד הטורניר". It uses the same dark "admin mode" strip style as `GameLiveSection`'s manager bar (`bgcolor` near-black in light mode, `alpha(white, .06)` in dark, `warning.light` icon) so managers always know they are in edit mode.

### 11.1 (a) Teams queue

- Segments: "ממתינות ({n})" (default when any), "מאושרות", "רשימת המתנה", "נדחו/יצאו".
- Row (desktop table, phone cards):
  - `TeamBadge`, captain name, `RosterMeter` compact (6px);
  - a validity badge: "תקינה" success, "חסרים {n}" warning, "{n} מעל המקסימום" error;
  - created relative time;
  - actions: "אישור", "רשימת המתנה", "דחייה".
- "אישור" is disabled with a tooltip when the roster is invalid ("אי אפשר לאשר קבוצה עם פחות מ-{min} שחקנים"); the server's `ROSTER_INVALID` maps to the same text. When the tournament is full, `TOURNAMENT_FULL` reads "הטורניר מלא. העבירו קבוצה לרשימת ההמתנה או הגדילו את מספר הקבוצות."
- Reject confirm: "לדחות את {team}? הקפטן יקבל הודעה." A promotion result shows the Snackbar "{team} עלתה מרשימת ההמתנה".
- **Seeding** (approved segment, KNOCKOUT or seeding MANUAL):
  - a "סדר זריעה" mode turns the list into a reorderable list (desktop drag handle plus up/down buttons; phone up/down 44px);
  - seed numbers sit at the start;
  - "שמירת סדר" is in a sticky footer;
  - "הגרלה אקראית" fills a random order (preview, then save).
- **Manual rank dialog** (from standings `needsManualRank`):
  - title "קביעת סדר בשוויון · {group}";
  - lists only the tied teams with their stats line;
  - reorder as above;
  - explanation "הקבוצות שוות בכל שוברי השוויון. הסדר שתקבעו יקבע מי עולה לשלב הבא.";
  - "שמירה".

### 11.2 (b) Schedule builder with preview

Desktop: two panes. The parameters pane sits at the start edge (380px); the preview pane fills the rest. Phone: a 3-step flow in one screen: parameters, then preview, then confirm, with a sticky bottom bar.

**Parameters**
- Days: a list of rows `[date] [from HH:mm] [to HH:mm] [✕]` with "+ הוספת יום". Times are Israel time, labelled "שעון ישראל". The helper says "חלונות הזמן הם בשעון ישראל, כולל מעבר שעון קיץ/חורף."
- Courts: a count stepper (1..20), or names in a chips input ("מגרש 1", "מגרש צפוני"). The toggle "מתן שמות למגרשים" switches between them.
- Match minutes, break minutes and min rest are prefilled from rules, as steppers with "דק׳".
- Advanced (collapsed): step minutes, random seed with a "הגרלה חדשה" button.
- Primary: **"תצוגה מקדימה"** / "Preview". There is no direct commit without a preview.

**Preview** (`preview=1` response; nothing saved)

The summary strip at the top reads "{matchCount} משחקים · {days} ימים · {courts} מגרשים · {conflicts} התנגשויות", with the conflicts number in `warning.main` when > 0 and a "✓ בלי התנגשויות" success chip otherwise.

Views (segmented):
- **"לפי יום"** (default on phone): day headers, then rows "18:30 · מגרש 2 · #12 הכחולים – האדומים". Placeholders follow §0.4.
- **"לוח מגרשים"** (default on desktop ≥ 900px): a time grid. Rows are time slots (every `stepMinutes`, labelled at the start edge); columns are courts (court 1 at the start edge). Match blocks span their duration with the match number, both team names (1 line each) and a small stage chip. Blocks with conflicts get a `warning.main` 2px border and the `ReportProblemRounded` icon. The grid scrolls in both directions with the time column and the court header row sticky.

**Conflicts panel** (desktop: under the parameters; phone: a collapsible card above the list). Each item has an icon, a plain-language title, an explanation, and match chips (`#5`, `#7`) that scroll to and highlight those matches:

| Type | Title (he / en) | Explanation (he) |
| --- | --- | --- |
| `COURT_OVERLAP` | שני משחקים באותו מגרש באותה שעה / Two matches on one court at once | "משחקים #{a} ו-#{b} מתנגשים ב{court}. הוסיפו מגרש או זמן." |
| `TEAM_OVERLAP` | קבוצה בשני משחקים במקביל / A team is double-booked | "{team} משובצת ב-#{a} וב-#{b} באותו זמן." |
| `TEAM_REST` | אין מספיק מנוחה / Not enough rest | "ל{team} יש פחות מ-{min} דק׳ בין #{a} ל-#{b}." |
| `OUTSIDE_WINDOW` | מחוץ לשעות שהוגדרו / Outside the time windows | "משחק #{a} לא נכנס לאף חלון זמן." |
| `NO_SLOT` | אין זמן פנוי / No free slot | "לא נמצא מגרש פנוי למשחק #{a}. הוסיפו יום, שעות או מגרשים." |
| `DEPENDENCY_UNSCHEDULED` | משחק תלוי לא שובץ / Depends on an unscheduled match | "#{a} תלוי בתוצאה של משחק שעוד לא שובץ, ולכן לא שובץ גם הוא." |

Team names come from `teamId`. The server's English `message` is never shown.

**Commit**: the sticky footer (desktop under the preview) has "חזרה לעריכה" and **"שמירת לוח המשחקים"**.
- With conflicts, the primary becomes "שמירה עם התנגשויות" in `warning` colour, and a confirm lists the count: "לשמור לוח עם {n} התנגשויות? אפשר לתקן ידנית אחר כך."
- Commit confirm when matches already exist: "לוח המשחקים הקיים יוחלף. משחקים שכבר הסתיימו לא ישתנו."
- Error `SCHEDULE_HAS_RESULTS`: "כבר הוזנו תוצאות, אי אפשר לבנות מחדש. אפשר לערוך משחקים ידנית."
- Success: Snackbar "לוח המשחקים נשמר. השחקנים יקבלו עדכון." (match-scheduled notifications exist; results never notify), and the view switches to the editable schedule.

**Manual edit** (after commit; the editable schedule reuses the preview views with live data)
- Desktop:
  - Drag a match block in "לוח מגרשים" to another slot or court. While dragging, the target cells highlight green (free) or amber (would conflict, with a tooltip naming the conflict).
  - Dropping saves via PATCH. On a conflict, a dialog shows the conflicts and offers "ביטול" or "שמירה בכל זאת" (`force`).
  - Keyboard alternative: each block has a menu "העברה…" that opens the edit dialog. Drag is never the only way.
- Phone: tap a match to open the **edit sheet**:
  - home and away team selects (or a "מקום פנוי" placeholder);
  - date and time picker (Israel time);
  - court select;
  - status (מתוכנן / נדחה / בוטל);
  - "מחיקת משחק" (destructive, with confirm). `MATCH_REFERENCED` reads "משחק אחר תלוי בתוצאה של המשחק הזה, אי אפשר למחוק." and `MATCH_FINISHED` reads "אי אפשר למחוק משחק שהסתיים."
- "+ הוספת משחק" (FAB on phone, a button in the desktop toolbar) opens the same sheet empty, with stage/group/round selects.
- The conflict check result shows inline in the sheet before saving (from the response `conflicts`).

### 11.3 (c) Status controls

A vertical timeline of statuses (DRAFT → REGISTRATION_OPEN → REGISTRATION_CLOSED → IN_PROGRESS → COMPLETED): the current one is highlighted, the next allowed transition is a button, and "ביטול הטורניר" sits separately at the bottom (destructive).

| Transition | Button | Confirm copy (he) |
| --- | --- | --- |
| DRAFT → REGISTRATION_OPEN | פרסום ופתיחת הרשמה | "הטורניר יפורסם וקבוצות יוכלו להירשם." |
| → REGISTRATION_CLOSED | סגירת הרשמה | "קבוצות חדשות לא יוכלו להירשם, והקישורים להצטרפות יפסיקו לעבוד. אפשר לפתוח מחדש כל עוד לא נבנה לוח משחקים." |
| REGISTRATION_CLOSED → REGISTRATION_OPEN | פתיחת ההרשמה מחדש (only before a schedule) | "ההרשמה תיפתח שוב עד {date}." |
| → IN_PROGRESS | התחלת הטורניר | "אחרי ההתחלה אפשר להזין תוצאות, ואי אפשר לפתוח הרשמה מחדש." |
| → COMPLETED | סיום הטורניר | "הטורניר יסומן כהסתיים והאלופה תוצג בעמוד. משחקים שלא שוחקו יישארו כפי שהם." |
| → CANCELLED | ביטול הטורניר | "כל המשחקים שלא שוחקו יבוטלו. אי אפשר לבטל את הפעולה." Type-to-confirm: the user types the tournament title. |

**`CANNOT_START` problems** show in the start dialog as a checklist with ✕ / ✓ items:
- `TOO_FEW_TEAMS` "רק {approved} קבוצות מאושרות, צריך לפחות {minTeams}";
- `TOO_FEW_PLAYERS` / `TOO_MANY_PLAYERS` "{team}: {players} שחקנים (צריך {min}–{max})", linking to the team;
- `NO_SCHEDULE` "עוד לא נבנה לוח משחקים", linking to the builder.

The organizer sees "התחלה בכל זאת" (outlined warning, `force`); managers see only "סגירה".

### 11.4 (d) Roles

- List: avatar, name, role chip (מארגן / מנהל / רשם תוצאות, English Organizer / Manager / Scorekeeper), and for the organizer an overflow menu on others with "שינוי ל…" and "הסרה".
- Role explanations under the list:
  - מנהל "יכול לערוך את הטורניר, לאשר קבוצות ולבנות לוח משחקים";
  - רשם תוצאות "יכול להזין תוצאות בלבד".
- "+ הוספת מנהל או רשם": a people search (friends first) and a role segmented control, then "הוספה".
- States: empty "אין עוד מנהלים". A manager (not organizer) sees the list read-only, without the section actions.

Testids: `manage-console`, `manage-section-{teams|schedule|status|roles}`, `queue-team-{teamId}`, `queue-approve-{teamId}`, `queue-reject-{teamId}`, `queue-waitlist-{teamId}`, `seeding-mode`, `seeding-save`, `manual-rank-dialog`, `schedule-param-day-{i}`, `schedule-param-courts`, `schedule-preview`, `schedule-preview-summary`, `schedule-conflict-{i}`, `schedule-commit`, `schedule-view-{day|grid}`, `schedule-match-block-{matchIdOrKey}`, `match-edit-sheet`, `match-add`, `status-action-{STATUS}`, `status-confirm`, `cannot-start-list`, `status-force`, `roles-list`, `roles-add`.

---

## 12. Score entry (scorekeeper+)

Component `ScoreEntrySheet({ match, sport, rules, rosters, isKnockout, canForce, state, conflict, warnings, onSubmit, onUndo, onClose })`. Opened from a match card, match detail, or the scorekeeper CTA.

### 12.1 Container

- **Phone (web < 600 and mobile app)**: a bottom sheet with two snap points, 70% (default) and 95% (when stats are expanded). Grab handle; header row: close at the start, "#12 · רבע גמר" centred. The content scrolls and the save bar is sticky at the bottom (safe-area padded). Designed for one hand: every frequent control sits in the bottom 60% of the screen.
- **Desktop**: `Dialog maxWidth="sm"` with the same content.

### 12.2 Layout (phone 360, one-handed)

```
┌────────────────────────────────┐
│ ✕        #12 · רבע גמר          │
│   ● הכחולים        ● האדומים    │  team labels, 2-line clamp, A at start (right)
│ ┌──────────┐   ┌──────────┐    │
│ │   [ + ]  │   │   [ + ]  │    │  56px steppers, + on top (closest to thumb travel)
│ │    3     │ : │    1     │    │  value 40px 800, tap to type
│ │   [ – ]  │   │   [ – ]  │    │
│ └──────────┘   └──────────┘    │
│ [ חי ] [ הסתיים ] [ טכני ]      │  status segmented, 48px
│ ── פנדלים (רק בתיקו בנוקאאוט) ── │
│  [–] 4 [+]        [–] 3 [+]     │  44px
│ ▸ סטטיסטיקות שחקנים (לא חובה)   │  collapsed
│ ┌────────────────────────────┐ │
│ │      שמירה וסיום משחק        │ │  sticky, 56px, contained
│ └────────────────────────────┘ │
└────────────────────────────────┘
```

- **Side-by-side vertical steppers** (decision): each team gets a column (156px at 360) with `+` (56x56), the value (40px, 800, tabular, tap to type with `keyboardType="number-pad"`), and `−` (56x56). The home column is at the start edge (F1 §1.1), with ":" between them. This keeps both scores visible while tapping with the thumb, unlike F1's stacked tiles, which suit the slower post-game editor.
  - `+` is on top because the thumb lands on the upper part of the sheet's lower half on most phones; `−` is the rarer action.
  - Basketball: long-press repeat plus "+2" and "+3" chips (36px) under each column.
  - Haptics on mobile (`Haptics.selectionAsync`) on each change.
  - Aria per F1 §3.2 ("הוספת שער ל{team}").
- **Status segmented**: "חי" (LIVE), "הסתיים" (FINISHED, default), "טכני" (FORFEIT). With FORFEIT selected, the steppers collapse and a "מי הפסיד טכנית?" segmented control with the two team names appears; the score preview reads "{forfeitScore} לטובת {winner}".
- **Penalties**: appear only when `isKnockout && status === FINISHED && home === away`, sliding in with the caption "תיקו בנוקאאוט. הזינו פנדלים כדי לקבוע מי עולה." The steppers are 44px, A at the start. The server's `NEEDS_PENALTIES` shows the same section and scrolls to it.
- **Tennis**: the steppers are replaced by the F1 §3.3 set rows (best-of from `details.bestOf` / `rules.bestOf`). Inputs are 48px tall, A at the start, with a derived winner line.
- **Stats** (collapsed by default): expanding shows F1 §3.4 player rows for both rosters (accepted members), grouped by team, with the quick-stat inline stepper. The sheet snaps to 95%. The soft warning `PLAYER_SUM_EXCEEDS_SCORE` follows F1 §3.6 and includes the team name.
- **Save bar**: the label depends on status: "שמירה וסיום משחק" (FINISHED), "עדכון תוצאה חיה" (LIVE), "שמירת ניצחון טכני" (FORFEIT). Saving shows a spinner and keeps the sheet open. On success the sheet closes with the Snackbar "התוצאה נשמרה". When `changedMatchIds` contains downstream matches, the Snackbar reads "התוצאה נשמרה · {team} עלתה ל{round}".
- **Undo to scheduled**: a text button at the bottom of the content (not in the sticky bar), "החזרה ל״מתוכנן״" / "Reset to scheduled", visible when the match is LIVE or FINISHED. Confirm: "למחוק את התוצאה ולהחזיר את המשחק למתוכנן? קבוצות שעלו בזכות המשחק הזה יחזרו למקום פנוי."

### 12.3 One-handed details

- The sheet opens at 70%, so the steppers sit at 35–60% of screen height, inside thumb reach on 6"+ phones.
- No control needed in the common path (score, then save) sits in the top 30%. The close X is the only top control.
- After the first save of a LIVE match, the next open goes straight to the steppers with the status kept as LIVE, so updating a running score is one tap plus save.
- Orientation: portrait only for the sheet. Landscape on a tablet uses the desktop dialog.

### 12.4 States

| State | Treatment |
| --- | --- |
| Teams unknown (`TEAMS_UNKNOWN`) | The sheet does not open. The match card's edit button is hidden while a slot is a placeholder. A race shows the info "הקבוצות במשחק הזה עוד לא נקבעו". |
| Tournament not in progress (`NOT_IN_PROGRESS`) | Not openable. If it races: "אפשר להזין תוצאות רק כשהטורניר מתקיים". |
| Validation (`INVALID_RESULT`, `INVALID_SCORES`, `INVALID_STATS`) | Top alert "התוצאה לא תקינה. בדקו את השדות המסומנים." plus field captions (F1 §3.8). |
| Offline | The F1 offline alert; values kept; "נסו שוב". |
| Saving | Spinner; the sheet cannot be dismissed (no swipe-down). |

### 12.5 `DOWNSTREAM_FINISHED`

An inline warning card above the save bar (`warning` soft surface):
- Title "המשחק הבא כבר הסתיים".
- Body "שינוי התוצאה כאן משנה מי עלתה ל-#{matchId→number}, שכבר שוחק."
- Organizer (`canForce`): the button "שינוי בכל זאת" (warning outlined) resends with `force`. The confirm explains "התוצאה של #{n} תישאר, אבל הקבוצה בו תוחלף. בדקו אותו אחר כך."
- Others: the caption "רק מארגן הטורניר יכול לשנות את זה" and only "סגירה".

### 12.6 `VERSION_CONFLICT`

Someone else saved first. The sheet does not close and does not discard input. A conflict card replaces the stepper area's header:

```
┌────────────────────────────────┐
│ ⚠ מישהו אחר עדכן את התוצאה      │
│ עכשיו:  הכחולים 2 : 2 האדומים   │  newer score, ScoreCluster small
│ שלך:    הכחולים 3 : 2 האדומים   │  my unsaved values
│ [להשאיר את שלהם] [לשמור את שלי] │
└────────────────────────────────┘
```

- "לשמור את שלי" reapplies my values with the new `currentVersion`, after a refetch, since `currentVersion` alone gives no score (§19).
- "להשאיר את שלהם" loads the newer values into the form and closes the card.
- If the realtime cue (§0.5) reports this match changing while the sheet is open, show the same card proactively before the user hits save.

Testids: `score-sheet`, `score-sheet-close`, `score-home`, `score-away`, `score-inc-home`, `score-dec-home`, `score-inc-away`, `score-dec-away`, `score-quick-{2|3}-{home|away}`, `score-status-{LIVE|FINISHED|FORFEIT}`, `score-forfeit-by-{teamId}`, `score-penalties-home`, `score-penalties-away`, `score-set-{i}-{home|away}`, `score-stats-toggle`, `score-save`, `score-undo`, `score-conflict`, `score-conflict-keep-mine`, `score-conflict-keep-theirs`, `score-downstream-warning`, `score-force`.

---

## 13. Top players tab

Component `LeadersList({ keys, selectedKey, label, leaders, sport })`.

- **Title**: "שחקנים בולטים" / "Top players" (never "מלכי השערים" or "דירוג"). The caption under it reads "לפי דיווחי מנהלי הטורניר. שחקנים שבחרו להסתיר סטטיסטיקות לא מופיעים." / "From organizer-reported stats. Players who hide their stats aren't listed." with the info icon.
- **Key switcher**: pills from `keys`, labels from `getStatLabel`; the default is the sport's first summary key (goals / points / aces).
- **List rows** (56px): position number (`text.secondary`, tabular, 24px column), avatar 40, name (1 line) with the team swatch and team name in a caption below, then at the end edge the value (20px 800, tabular) with "ב-{matches} משחקים" below it as a caption.
  - Shared values: equal values share a position number with "=" (as in standings).
  - No medals and no gold/silver colours, so it does not read as an official ranking. My row gets the my-team highlight.
- Top 10 by default, then "הצגת עוד" (limit 25).
- Desktop: a single column, max width 640, centred in the tab.
- States:
  - loading: 5 row skeletons;
  - empty (no finished matches, or no stats entered): "עוד אין סטטיסטיקות. הן יופיעו כאן אחרי שמנהלי הטורניר יזינו אותן." / "No stats yet. They'll show up once organizers enter them.";
  - key with no entries: "אף אחד עוד לא רשם {label}".

Testids: `leaders-tab`, `leaders-key-{key}`, `leaders-row-{userId}`, `leaders-empty`.

---

## 14. Profile tournaments section and home "next match"

### 14.1 Profile: tournaments history

- **Placement**: in `UserProfileSections` (web) and the mobile profile, after the match-history section. It respects `privacyGames` exactly like match history: hidden means render nothing.
- **Section**: title "טורנירים" / "Tournaments"; rows (64px) show the tournament title (1 line), sport emoji, dates, the user's team with `TeamBadge` small, and a **result chip** at the end edge:
  - "🏆 אלופים" (success);
  - "גמר" / "חצי גמר" / "רבע גמר" (neutral);
  - "שלב הבתים" (neutral);
  - "מקום {n}" (league);
  - "מתקיים" (in progress).

  The chip is personal and celebratory, never negative ("הודחו" is not used).
- Show 3, then "הצגת הכל".
- Empty: render nothing. A profile does not advertise tournaments the user never joined. The data source is a §19 gap; without it the section is not rendered.

### 14.2 Home: "my next match" card

- Placement: the top of the home feed (web `/games` under `HomeHero`; mobile home above `ManageSection`), only when the user is on an APPROVED team in an IN_PROGRESS or REGISTRATION_CLOSED tournament with an upcoming match.
- Card: a 4px sport `base` stripe at the start edge, the caption "המשחק הבא שלך בטורניר · {title}", then a `MatchCard`-like body (my team at the start edge regardless of home/away, since this is a personal view consistent with F1's personal badge rule), the time and court, a countdown "בעוד 2 שעות" / "מחר 18:30" / "עכשיו!" (when LIVE, with the live chip), and actions "לפרטים" and "הוספה ליומן".
- At 360: full width, about 120px tall.
- Several tournaments: show the soonest match only, with a caption "+1 טורניר נוסף".
- Data: §19 gap. Without an endpoint the card is not rendered.

Testids: `profile-tournaments`, `profile-tournament-{id}`, `home-next-match`, `home-next-match-calendar`.

---

## 15. Admin overview (optional, low priority)

- **Web only**: a new admin tab in `ADMIN_TABS` ("טורנירים", `/admin/tournaments`). It is an MUI `Table` with these columns: title (link), sport, status chip, dates, teams `x/max`, organizer, created. A status filter and search sit above it, sorted by start date desc. Row actions: "לניהול" (manage console) and "ביטול" (opens the §11.3 cancel confirm).
- **Phone width**: the table becomes cards with the same fields.
- **Mobile app**: not in v1. Admins use the regular list with the "שלי" filter off (drafts are visible to them as roles).
- States: F1 admin patterns (loading motif, success alert on empty "אין טורנירים").

Testids: `admin-tournaments`, `admin-tournament-row-{id}`.

---

## 16. Cross-cutting states checklist

| Case | Where | Treatment |
| --- | --- | --- |
| Loading | every tab | Shape-matching skeletons (F1 §1.8), never a page spinner. Tabs render the shell first. |
| Empty | every tab | The copy in each section; always one sentence of "what happens next". |
| Error + retry / offline | every tab | Inline in the tab (F1 §1.8). The hero stays visible. Wrap each tab in `SectionErrorBoundary` (web). |
| Long Hebrew names | teams | 2 lines on cards, sheets and the scoreboard; 1 line in tables, bracket cells and schedule rows; full name in `title` / `accessibilityLabel`. |
| 2 teams | bracket, table | A single final cell; a 2-row table. No zoom controls. |
| 32 teams | bracket, table, grid | Bracket opens at fit zoom; the phone uses round-by-round; table header sticky; schedule grid virtualizes rows by time (web: render only visible slots if > 200 rows). |
| Odd team count | league, bracket | League: a "מנוחה" (bye) chip in a round header for the resting team, "{team} במנוחה במחזור הזה". Bracket: ghost bye cells (§9.2). |
| Tournament cancelled | all | Hero alert; unplayed matches "בוטל"; the CTA hidden; manage console read-only (cancel is final in v1). |
| Finished | hero, bracket, table | Champion moment (§2.4); 🏆 on the final and on table row 1. |
| Registration closed | hero, team page, join | Caption, the join code inactive, the join sheet shows `REGISTRATION_CLOSED` copy. |
| Roster locked | team page | Info banner; the edit controls hidden (not disabled). |
| Team withdrawn after scheduling | schedule, bracket, table | Forfeit display; the team struck through in the teams tab; table rows keep their results. |
| RTL numerals | all scores | F1 §1.1, GD sign isolate (§8.1), times "18:30" are LTR-isolated (`<bdi>`). |
| Dark mode | all | Tokens only; the champion surface stays dark in both modes. |
| 360px | all | The layouts above; no horizontal page scroll except intended scrollers (tabs, filters, full-mode table, bracket canvas). |
| Tablet (768) | all | Standings full mode, the bracket desktop canvas, the manage console single pane with section pills, the score entry as a centred dialog. |
| Keyboard open | wizard, team create, join code, edit sheet | Sticky bars hide and actions go inline (§3.1); the focused field is scrolled into view. |
| Role differences | all | §0.8; hidden, not disabled. |
| Realtime | open tabs | §0.5. |

---

## 17. Testid summary

All new; listed per section above. The prefixes are `tournament-*`, `tournaments-*`, `wizard-*`, `team-*`, `roster-meter`, `invite*`, `join-*`, `teams-*`, `schedule-*`, `match-*`, `standings-*`, `bracket-*`, `manage-*`, `queue-*`, `seeding-*`, `status-*`, `roles-*`, `score-*`, `leaders-*`, `profile-tournament*`, `home-next-match*`, `admin-tournament*`, `nav-tournaments`. Existing testids from F1 §10 are untouched. `report-submit` and `report-user-*` are reused as is when the tournament report opens `ReportUserDialog`.

---

## 18. Mobile i18n keys

Namespace `tournaments` in `src/i18n/locales/{he,en}.json`. Web uses the Hebrew strings inline. Keys are listed as `path: he | en`; split them into the two files. Placeholders use i18next `{{x}}`.

### 18.1 Common, list and hero

```
tournaments.title: טורנירים | Tournaments
tournaments.new: טורניר חדש | New tournament
tournaments.all: הכל | All
tournaments.mine: שלי | Mine
tournaments.invitesButton: הזמנות ({{count}}) | Invites ({{count}})
tournaments.sectionOpen: פתוחים להרשמה | Open for registration
tournaments.sectionLive: מתקיימים עכשיו | Happening now
tournaments.sectionDone: הסתיימו | Finished
tournaments.myDrafts: הטיוטות שלי | My drafts
tournaments.emptyTitle: עוד אין טורנירים | No tournaments yet
tournaments.emptyBody: כשייפתח טורניר באזור שלך, הוא יופיע כאן. | When one opens near you, it'll show up here.
tournaments.emptyFiltered: אין טורנירים שמתאימים לסינון | No tournaments match these filters
tournaments.clearFilters: ניקוי סינון | Clear filters
tournaments.teamsCount: {{approved}}/{{max}} קבוצות | {{approved}}/{{max}} teams
tournaments.full: מלא · רשימת המתנה | Full · waitlist
tournaments.registrationUntil: ההרשמה פתוחה עד {{date}} | Registration open until {{date}}
tournaments.progress: {{finished}}/{{total}} משחקים שוחקו | {{finished}}/{{total}} matches played
tournaments.liveNow: {{count}} משחקים חיים עכשיו | {{count}} matches live now
tournaments.cancelledBanner: הטורניר בוטל. המשחקים שלא שוחקו בוטלו. | This tournament was cancelled. Unplayed matches were cancelled.
tournaments.draftBanner: טיוטה: רק מנהלי הטורניר רואים אותה | Draft: only organizers can see it
tournaments.publish: פרסום | Publish
tournaments.share: שיתוף הטורניר | Share tournament
tournaments.report: דיווח על הטורניר | Report tournament
tournaments.updated: עודכן עכשיו | Updated just now
tournaments.israelTime: שעון ישראל | Israel time
tournaments.status.DRAFT: טיוטה | Draft
tournaments.status.REGISTRATION_OPEN: הרשמה פתוחה | Registration open
tournaments.status.REGISTRATION_CLOSED: ההרשמה נסגרה | Registration closed
tournaments.status.IN_PROGRESS: מתקיים עכשיו | In progress
tournaments.status.COMPLETED: הסתיים | Finished
tournaments.status.CANCELLED: בוטל | Cancelled
tournaments.format.LEAGUE: ליגה | League
tournaments.format.KNOCKOUT: נוקאאוט | Knockout
tournaments.format.GROUPS_KNOCKOUT: בתים + נוקאאוט | Groups + knockout
tournaments.format.CUSTOM: מותאם אישית | Custom
tournaments.cta.signIn: התחברות להרשמה | Sign in to register
tournaments.cta.register: רישום קבוצה | Register a team
tournaments.cta.joinCode: הצטרפות עם קוד | Join with a code
tournaments.cta.myTeam: הקבוצה שלי | My team
tournaments.cta.manageTeam: ניהול הקבוצה | Manage team
tournaments.cta.enterScores: הזנת תוצאות | Enter scores
tournaments.cta.manage: ניהול הטורניר | Manage tournament
tournaments.tabs.overview: סקירה | Overview
tournaments.tabs.teams: קבוצות | Teams
tournaments.tabs.schedule: לוח משחקים | Schedule
tournaments.tabs.standings: טבלה | Standings
tournaments.tabs.bracket: עץ | Bracket
tournaments.tabs.leaders: שחקנים בולטים | Top players
tournaments.champion.title: אלופת {{title}} | {{title}} champions
tournaments.champion.share: שיתוף | Share
tournaments.champion.shareText: {{team}} אלופי {{title}}! 🏆 | {{team}} won {{title}}! 🏆
tournaments.overview.nextMatch: המשחק הבא שלך | Your next match
tournaments.overview.live: חי עכשיו | Live now
tournaments.overview.upcoming: משחקים קרובים | Upcoming matches
tournaments.overview.fullSchedule: ללוח המלא | Full schedule
tournaments.overview.fullTable: לטבלה המלאה | Full table
tournaments.overview.about: על הטורניר | About
tournaments.overview.rules: חוקים | Rules
tournaments.overview.pointsLine: ניצחון {{win}} · תיקו {{draw}} · הפסד {{loss}} | Win {{win}} · Draw {{draw}} · Loss {{loss}}
tournaments.overview.rosterLine: {{starters}} בהרכב · {{min}}–{{max}} שחקנים בקבוצה | {{starters}} starters · {{min}}–{{max}} players per team
tournaments.overview.approvalNote: הקבוצות מאושרות ע״י המארגן | Teams are approved by the organizer
tournaments.overview.organizer: מארגן | Organizer
tournaments.overview.managers: מנהלים | Managers
```

### 18.2 Match, slots, schedule, bracket, standings, leaders

```
tournaments.match.number: משחק {{n}} | Match {{n}}
tournaments.match.status.LIVE: חי | Live
tournaments.match.status.FORFEIT: ניצחון טכני | Forfeit
tournaments.match.status.POSTPONED: נדחה | Postponed
tournaments.match.status.CANCELLED: בוטל | Cancelled
tournaments.match.forfeitLoser: (הפסד טכני) | (forfeit)
tournaments.match.newTimeTbd: מועד חדש ייקבע | New time TBD
tournaments.match.penalties: פנדלים {{home}} : {{away}} | Penalties {{home}} : {{away}}
tournaments.match.winnerAdvances: המנצחת תעלה ל{{round}} נגד {{slot}} | The winner plays {{slot}} in the {{round}}
tournaments.match.loserThird: המפסידה תשחק על המקום השלישי | The loser plays for third place
tournaments.match.addToCalendar: הוספה ליומן | Add to calendar
tournaments.match.enterScore: הזנת תוצאה | Enter score
tournaments.match.updateScore: עדכון תוצאה | Update score
tournaments.match.edit: עריכת משחק | Edit match
tournaments.match.notFound: המשחק לא נמצא | Match not found
tournaments.match.myTeam: הקבוצה שלך | Your team
tournaments.slot.winnerOf: המנצחת במשחק {{n}} | Winner of match {{n}}
tournaments.slot.loserOf: המפסידה במשחק {{n}} | Loser of match {{n}}
tournaments.slot.groupRank: מקום {{rank}} בבית {{group}} | {{rank}} in group {{group}}
tournaments.slot.seed: מדורגת {{n}} | Seed {{n}}
tournaments.slot.bye: פטור | Bye
tournaments.slot.tbd: ייקבע בהמשך | TBD
tournaments.schedule.all: הכל | All
tournaments.schedule.live: חי | Live
tournaments.schedule.upcoming: קרובים | Upcoming
tournaments.schedule.finished: הסתיימו | Finished
tournaments.schedule.myTeam: הקבוצה שלי | My team
tournaments.schedule.round: מחזור {{n}} | Round {{n}}
tournaments.schedule.resting: {{team}} במנוחה במחזור הזה | {{team}} rests this round
tournaments.schedule.emptyViewer: לוח המשחקים עוד לא פורסם. הוא יופיע כאן אחרי סגירת ההרשמה. | The schedule isn't out yet. It'll appear here after registration closes.
tournaments.schedule.emptyManager: בניית לוח משחקים | Build the schedule
tournaments.schedule.emptyFiltered: אין משחקים שמתאימים לסינון | No matches match these filters
tournaments.bracket.FINAL: גמר | Final
tournaments.bracket.SEMI_FINAL: חצי גמר | Semi-final
tournaments.bracket.QUARTER_FINAL: רבע גמר | Quarter-final
tournaments.bracket.ROUND_OF_16: שמינית גמר | Round of 16
tournaments.bracket.roundOfN: שלב {{n}} האחרונות | Round of {{n}}
tournaments.bracket.thirdPlace: משחק על המקום השלישי | Third-place match
tournaments.bracket.pairNext: המנצחות נפגשות במשחק {{n}} | Winners meet in match {{n}}
tournaments.bracket.advancedDirectly: עלתה ישירות | Advanced directly
tournaments.bracket.hideByes: הסתרת פטורים | Hide byes
tournaments.bracket.myPath: המסלול של הקבוצה שלי | My team's path
tournaments.bracket.clearHighlight: ביטול הדגשה | Clear highlight
tournaments.bracket.treeView: תצוגת עץ | Tree view
tournaments.bracket.roundView: לפי סיבובים | By round
tournaments.bracket.fit: התאמה למסך | Fit to screen
tournaments.bracket.zoomIn: הגדלה | Zoom in
tournaments.bracket.zoomOut: הקטנה | Zoom out
tournaments.bracket.afterGroups: העץ ייקבע אחרי שלב הבתים | The bracket fills in after the group stage
tournaments.bracket.afterSchedule: העץ יופיע אחרי בניית לוח המשחקים | The bracket appears once the schedule is built
tournaments.standings.rank: # | #
tournaments.standings.team: קבוצה | Team
tournaments.standings.played: מש׳ | P
tournaments.standings.playedFull: משחקים | Played
tournaments.standings.won: נ׳ | W
tournaments.standings.wonFull: ניצחונות | Won
tournaments.standings.drawn: ת׳ | D
tournaments.standings.drawnFull: תיקו | Drawn
tournaments.standings.lost: ה׳ | L
tournaments.standings.lostFull: הפסדים | Lost
tournaments.standings.gf: זכות | GF
tournaments.standings.ga: חובה | GA
tournaments.standings.gd: הפרש | GD
tournaments.standings.points: נק׳ | Pts
tournaments.standings.pointsFull: נקודות | Points
tournaments.standings.allColumns: כל העמודות | All columns
tournaments.standings.advance: עולות לשלב הבא | Advance to the next stage
tournaments.standings.advanceChip: עולה | Advances
tournaments.standings.notFinal: הטבלה עדיין לא סופית | Table not final yet
tournaments.standings.noMatches: עוד לא שוחקו משחקים | No matches played yet
tournaments.standings.tied: שוויון מלא בכל שוברי השוויון | Tied on every tiebreaker
tournaments.standings.manual: הסדר נקבע ידנית ע״י מארגן הטורניר | Order set manually by the organizer
tournaments.standings.needsManualViewer: יש שוויון שהשוברים לא הכריעו. הטבלה תתעדכן אחרי שהמארגן יקבע את הסדר. | There's a tie the tiebreakers couldn't split. The table updates once the organizer sets the order.
tournaments.standings.setOrder: קביעת סדר | Set order
tournaments.standings.detailLine: {{w}} נ׳ · {{d}} ת׳ · {{l}} ה׳ · שערים {{gf}}:{{ga}} | {{w}}W · {{d}}D · {{l}}L · goals {{gf}}:{{ga}}
tournaments.standings.empty: הטבלה תופיע אחרי שייבנה לוח המשחקים | The table appears once the schedule is built
tournaments.leaders.title: שחקנים בולטים | Top players
tournaments.leaders.note: לפי דיווחי מנהלי הטורניר. שחקנים שבחרו להסתיר סטטיסטיקות לא מופיעים. | From organizer-reported stats. Players who hide their stats aren't listed.
tournaments.leaders.inMatches: ב-{{count}} משחקים | in {{count}} matches
tournaments.leaders.more: הצגת עוד | Show more
tournaments.leaders.empty: עוד אין סטטיסטיקות. הן יופיעו כאן אחרי שמנהלי הטורניר יזינו אותן. | No stats yet. They'll show up once organizers enter them.
tournaments.leaders.emptyKey: אף אחד עוד לא רשם {{label}} | No one has recorded {{label}} yet
```

### 18.3 Teams, roster, invites, join

```
tournaments.team.create: רישום הקבוצה | Register team
tournaments.team.name: שם הקבוצה | Team name
tournaments.team.color: צבע | Colour
tournaments.team.logo: לוגו (לא חובה) | Logo (optional)
tournaments.team.captainNote: אתם תהיו הקפטן של הקבוצה. אחרי ההרשמה אפשר להזמין שחקנים. | You'll be the captain. After registering, invite your players.
tournaments.team.registeredApproved: הקבוצה נרשמה! | Your team is registered!
tournaments.team.registeredPending: הקבוצה נרשמה וממתינה לאישור המארגן | Registered, waiting for organizer approval
tournaments.team.registeredWaitlist: הטורניר מלא. הקבוצה ברשימת ההמתנה | The tournament is full. Your team is on the waitlist
tournaments.team.roster: סגל · {{count}} שחקנים | Roster · {{count}} players
tournaments.team.role.CAPTAIN: קפטן | Captain
tournaments.team.role.PLAYER: בסגל | Player
tournaments.team.role.SUBSTITUTE: ספסל | Sub
tournaments.team.invited: הזמנה נשלחה | Invite sent
tournaments.team.cancelInvite: ביטול הזמנה | Cancel invite
tournaments.team.declinedGroup: הזמנות שנדחו ({{count}}) | Declined invites ({{count}})
tournaments.team.jersey: מספר חולצה | Jersey number
tournaments.team.toBench: העברה לספסל | Move to bench
tournaments.team.toRoster: העברה לסגל | Move to roster
tournaments.team.remove: הסרה מהקבוצה | Remove from team
tournaments.team.removeConfirm: להסיר את {{name}} מהקבוצה? | Remove {{name}} from the team?
tournaments.team.leave: עזיבת הקבוצה | Leave team
tournaments.team.meter.below: חסרים עוד {{count}} שחקנים כדי שהקבוצה תהיה תקינה | {{count}} more players needed
tournaments.team.meter.ok: הסגל תקין | Roster is valid
tournaments.team.meter.full: הסגל מלא | Roster is full
tournaments.team.meter.min: מינימום {{n}} | Min {{n}}
tournaments.team.meter.starters: בהרכב {{n}} | {{n}} starters
tournaments.team.meter.a11y: {{count}} שחקנים, נדרשים {{min}} עד {{max}} | {{count}} players, {{min}} to {{max}} needed
tournaments.team.banner.PENDING: ממתינה לאישור המארגן. בינתיים אפשר להזמין שחקנים. | Waiting for organizer approval. You can invite players meanwhile.
tournaments.team.banner.APPROVED: הקבוצה אושרה! נתראה במגרש. | Your team is in! See you on the field.
tournaments.team.banner.WAITLISTED: הטורניר מלא. הקבוצה במקום {{n}} ברשימת ההמתנה. | The tournament is full. Your team is #{{n}} on the waitlist.
tournaments.team.banner.WAITLISTED_NOPOS: הטורניר מלא. הקבוצה ברשימת ההמתנה. | The tournament is full. Your team is on the waitlist.
tournaments.team.banner.REJECTED: הקבוצה לא אושרה לטורניר הזה. | Your team wasn't accepted to this tournament.
tournaments.team.banner.WITHDRAWN: הקבוצה יצאה מהטורניר. | Your team withdrew from this tournament.
tournaments.team.banner.invalid: חסרים {{count}} שחקנים. קבוצה עם פחות מ-{{min}} שחקנים לא תאושר. | {{count}} more players needed. Teams under {{min}} players can't be approved.
tournaments.team.banner.locked: הסגל נעול מ-{{date}}. לשינויים פנו למארגן. | Roster locked since {{date}}. Contact the organizer for changes.
tournaments.team.invite.search: חיפוש שחקנים או חברים | Search players or friends
tournaments.team.invite.friends: חברים | Friends
tournaments.team.invite.send: הזמנה | Invite
tournaments.team.invite.sent: הוזמן ✓ | Invited ✓
tournaments.team.invite.inOtherTeam: כבר בקבוצה אחרת | Already on another team
tournaments.team.code.label: קישור הצטרפות | Join link
tournaments.team.code.copy: העתקה | Copy
tournaments.team.code.copied: הקישור הועתק | Link copied
tournaments.team.code.share: שיתוף | Share
tournaments.team.code.shareText: בואו לשחק איתנו ב{{title}}! להצטרפות לקבוצה {{team}}: {{link}} | Play with us in {{title}}! Join {{team}}: {{link}}
tournaments.team.code.rotate: קוד חדש | New code
tournaments.team.code.rotateConfirm: ליצור קוד חדש? הקישור הקודם יפסיק לעבוד. | Create a new code? The old link will stop working.
tournaments.team.code.closed: ההרשמה נסגרה, הקישור לא פעיל | Registration closed, link inactive
tournaments.team.withdraw: הוצאת הקבוצה מהטורניר | Withdraw team
tournaments.team.withdrawConfirmBefore: להוציא את {{team}} מהטורניר? כל השחקנים יוסרו מהקבוצה. | Withdraw {{team}}? All players will be removed from the team.
tournaments.team.withdrawConfirmAfter: להוציא את {{team}}? המשחקים שלה שעוד לא שוחקו ייחשבו כהפסד טכני. | Withdraw {{team}}? Its unplayed matches will count as forfeits.
tournaments.team.withdrawn: יצאו מהטורניר | Withdrawn
tournaments.team.playersCount: {{count}} שחקנים | {{count}} players
tournaments.team.group: בית {{name}} | Group {{name}}
tournaments.teams.emptyBefore: עוד אין קבוצות. ההרשמה תיפתח ב-{{date}}. | No teams yet. Registration opens {{date}}.
tournaments.teams.emptyOpen: עוד אין קבוצות רשומות. היו הראשונים! | No teams yet. Be the first!
tournaments.teams.toTeamPage: לעמוד הקבוצה | Team page
tournaments.errors.PLAYER_IN_OTHER_TEAM: השחקן כבר בקבוצה אחרת בטורניר הזה | This player is already on another team in this tournament
tournaments.errors.PLAYER_IN_OTHER_TEAM_SELF: כבר יש לך קבוצה בטורניר הזה | You're already on a team in this tournament
tournaments.errors.TOO_MANY_PLAYERS: הסגל מלא ({{max}} שחקנים) | The roster is full ({{max}} players)
tournaments.errors.ROSTER_LOCKED: הסגל נעול. לשינויים פנו למארגן. | The roster is locked. Contact the organizer.
tournaments.errors.REGISTRATION_CLOSED: ההרשמה לטורניר נסגרה | Registration is closed
tournaments.errors.NAME_TAKEN: כבר יש קבוצה בשם הזה, נסו שם אחר | That name is taken, try another
tournaments.errors.INVALID_CODE: הקישור לא תקין או שהוחלף. בקשו קישור חדש מהקפטן. | This link is invalid or was replaced. Ask the captain for a new one.
tournaments.errors.CAPTAIN_CANNOT_LEAVE: קפטן לא יכול לעזוב. אפשר להוציא את הקבוצה מהטורניר. | Captains can't leave. You can withdraw the team instead.
tournaments.errors.ROSTER_INVALID: אי אפשר לאשר קבוצה עם פחות מ-{{min}} שחקנים | Teams under {{min}} players can't be approved
tournaments.errors.TOURNAMENT_FULL: הטורניר מלא. העבירו קבוצה לרשימת ההמתנה או הגדילו את מספר הקבוצות. | The tournament is full. Waitlist a team or raise the team limit.
tournaments.minors.title: הטורניר הזה פתוח לבני 18 ומעלה | This tournament is for players 18+
tournaments.minors.body: בינתיים טורנירים פתוחים רק למבוגרים. אפשר לעקוב אחרי המשחקים והתוצאות כאן. | For now, tournaments are for adults only. You can still follow the matches and results here.
tournaments.invites.title: ההזמנות שלי | My invites
tournaments.invites.captain: הקפטן: {{name}} | Captain: {{name}}
tournaments.invites.accept: הצטרפות | Join
tournaments.invites.decline: דחייה | Decline
tournaments.invites.oneTeam: אפשר להצטרף לקבוצה אחת בלבד. הצטרפות תבטל את שאר ההזמנות לטורניר הזה. | You can join one team only. Joining cancels your other invites for this tournament.
tournaments.invites.acceptConfirm: להצטרף ל{{team}}? ההזמנות מ-{{others}} יבוטלו. | Join {{team}}? Your invites from {{others}} will be cancelled.
tournaments.invites.joined: הצטרפת ל{{team}}! | You joined {{team}}!
tournaments.invites.empty: אין הזמנות פתוחות | No open invites
tournaments.join.title: הצטרפות לקבוצה | Join a team
tournaments.join.generic: הוזמנת להצטרף לקבוצה בטורניר הזה | You've been invited to join a team in this tournament
tournaments.join.spots: {{count}}/{{max}} שחקנים | {{count}}/{{max}} players
tournaments.join.submit: הצטרפות לקבוצה | Join team
tournaments.join.notNow: לא עכשיו | Not now
tournaments.join.signIn: התחברות להצטרפות | Sign in to join
tournaments.join.haveCode: יש לך קוד? | Have a code?
tournaments.join.codeLabel: קוד הצטרפות | Join code
tournaments.join.alreadyInTeam: כבר יש לך קבוצה בטורניר הזה | You're already on a team in this tournament
tournaments.join.toMyTeam: לקבוצה שלי | My team
tournaments.join.success: הצטרפת לקבוצה! | You joined the team!
```

### 18.4 Wizard, manage console, score entry

```
tournaments.wizard.stepOf: שלב {{n}} מתוך {{total}} | Step {{n}} of {{total}}
tournaments.wizard.steps.basics: פרטים | Basics
tournaments.wizard.steps.teams: קבוצות והרכבים | Teams and rosters
tournaments.wizard.steps.format: מבנה וחוקים | Format and rules
tournaments.wizard.steps.registration: הרשמה | Registration
tournaments.wizard.steps.review: סיכום | Review
tournaments.wizard.next: הבא | Next
tournaments.wizard.back: חזרה | Back
tournaments.wizard.saveDraft: שמירה כטיוטה | Save draft
tournaments.wizard.draftSaved: הטיוטה נשמרה | Draft saved
tournaments.wizard.publish: פרסום ופתיחת הרשמה | Publish and open registration
tournaments.wizard.publishConfirmTitle: לפרסם את הטורניר? | Publish this tournament?
tournaments.wizard.publishConfirmBody: הטורניר יופיע ברשימה וקבוצות יוכלו להירשם עד {{date}}. אחרי פרסום עדיין אפשר לערוך פרטים, אבל לא את מבנה הטורניר אחרי שייבנה לוח משחקים. | It'll be listed and teams can register until {{date}}. You can still edit details after publishing, but not the structure once a schedule exists.
tournaments.wizard.title: שם הטורניר | Tournament name
tournaments.wizard.sport: ענף | Sport
tournaments.wizard.description: תיאור | Description
tournaments.wizard.cover: תמונת שער | Cover image
tournaments.wizard.startsAt: התחלה | Starts
tournaments.wizard.endsAt: סיום (לא חובה) | Ends (optional)
tournaments.wizard.venue: מקום | Venue
tournaments.wizard.otherLocation: מיקום אחר | Other location
tournaments.wizard.public: טורניר ציבורי | Public tournament
tournaments.wizard.publicHint: טורניר ציבורי מופיע ברשימת הטורנירים. טורניר פרטי נגיש רק בקישור. | Public tournaments are listed. Private ones are reachable by link only.
tournaments.wizard.adultsOnly: בשלב זה הטורניר פתוח לבני 18 ומעלה בלבד. | For now, tournaments are open to players 18 and over.
tournaments.wizard.teamCount: מספר קבוצות | Number of teams
tournaments.wizard.min: מינימום | Min
tournaments.wizard.max: מקסימום | Max
tournaments.wizard.teamSize: גודל קבוצה | Team size
tournaments.wizard.starters: בהרכב (על המגרש) | Starters (on the field)
tournaments.wizard.playersPerTeam: שחקנים בקבוצה | Players per team
tournaments.wizard.rosterSentence: כל קבוצה תצטרך {{min}}–{{max}} שחקנים, {{starters}} מהם על המגרש. | Each team needs {{min}}–{{max}} players, {{starters}} on the field.
tournaments.wizard.err.minOverMax: המינימום גדול מהמקסימום | Min is above max
tournaments.wizard.err.startersOverMin: בהרכב לא יכולים להיות יותר שחקנים מהמינימום בקבוצה ({{min}}) | Starters can't exceed the team minimum ({{min}})
tournaments.wizard.err.teamsMinOverMax: מספר הקבוצות המינימלי גדול מהמקסימלי | Min teams is above max teams
tournaments.wizard.info.byes: עם {{n}} קבוצות יהיו {{byes}} פטורים בסיבוב הראשון | With {{n}} teams there'll be {{byes}} byes in round one
tournaments.wizard.formatHint.LEAGUE: כולם נגד כולם, טבלה אחת | Everyone plays everyone, one table
tournaments.wizard.formatHint.KNOCKOUT: מפסידה יוצאת, עד הגמר | Lose and you're out, down to the final
tournaments.wizard.formatHint.GROUPS_KNOCKOUT: שלב בתים ואחריו עץ | Groups, then a bracket
tournaments.wizard.formatHint.CUSTOM: בונים את המשחקים ידנית | Build matches by hand
tournaments.wizard.matchCount: עם {{teams}} קבוצות: {{count}} משחקים | With {{teams}} teams: {{count}} matches
tournaments.wizard.points: ניקוד | Points
tournaments.wizard.win: ניצחון | Win
tournaments.wizard.draw: תיקו | Draw
tournaments.wizard.loss: הפסד | Loss
tournaments.wizard.tiebreak: סדר שוברי שוויון | Tiebreaker order
tournaments.wizard.tb.HEAD_TO_HEAD: מפגש ישיר | Head-to-head
tournaments.wizard.tb.GOAL_DIFFERENCE: הפרש שערים | Goal difference
tournaments.wizard.tb.GOALS_FOR: שערי זכות | Goals scored
tournaments.wizard.tb.WINS: ניצחונות | Wins
tournaments.wizard.tb.FAIR_PLAY: משחק הוגן | Fair play
tournaments.wizard.tb.DRAW_LOT: הגרלה | Draw lots
tournaments.wizard.tbBasketball.GOAL_DIFFERENCE: הפרש סלים | Point difference
tournaments.wizard.tbBasketball.GOALS_FOR: סלי זכות | Points scored
tournaments.wizard.legs: מספר סיבובים | Legs
tournaments.wizard.legs1: סיבוב אחד | One leg
tournaments.wizard.legs2: בית וחוץ | Home and away
tournaments.wizard.groupCount: מספר בתים | Number of groups
tournaments.wizard.advancePerGroup: עולות מכל בית | Advance per group
tournaments.wizard.advanceTotal: {{count}} קבוצות יעלו לשלב הנוקאאוט | {{count}} teams advance to the knockout
tournaments.wizard.thirdPlace: משחק על המקום השלישי | Third-place match
tournaments.wizard.seeding: זריעה | Seeding
tournaments.wizard.seedingManual: ידני | Manual
tournaments.wizard.seedingRandom: אקראי | Random
tournaments.wizard.bestOf3: 2 מתוך 3 | Best of 3
tournaments.wizard.bestOf5: 3 מתוך 5 | Best of 5
tournaments.wizard.matchMinutes: אורך משחק | Match length
tournaments.wizard.breakMinutes: הפסקה בין משחקים | Break between matches
tournaments.wizard.minRest: מנוחה מינימלית לקבוצה | Minimum team rest
tournaments.wizard.minutesSuffix: דק׳ | min
tournaments.wizard.advanced: הגדרות מתקדמות | Advanced settings
tournaments.wizard.forfeitScore: ניצחון טכני | Forfeit score
tournaments.wizard.regOpens: פתיחת הרשמה | Registration opens
tournaments.wizard.regCloses: סגירת הרשמה | Registration closes
tournaments.wizard.rosterLock: נעילת סגלים (לא חובה) | Roster lock (optional)
tournaments.wizard.rosterLockHint: אחרי המועד הזה קפטנים לא יוכלו לשנות את הסגל | After this time captains can't change their roster
tournaments.wizard.approval: אישור ידני של קבוצות | Approve teams manually
tournaments.wizard.approvalHint: כשכבוי, קבוצה שנרשמת מאושרת מיד (עד שהטורניר מתמלא) | When off, teams are approved right away (until the tournament is full)
tournaments.wizard.lockedAfterSchedule: נעול אחרי בניית לוח המשחקים | Locked once the schedule is built
tournaments.wizard.changeAnyway: שינוי בכל זאת | Change anyway
tournaments.wizard.changeAnywayWarn: שינוי המבנה עלול לבטל משחקים שתוכננו | Changing the structure may cancel scheduled matches
tournaments.manage.header: ניהול · {{title}} | Manage · {{title}}
tournaments.manage.toPage: לעמוד הטורניר | Tournament page
tournaments.manage.sections.teams: קבוצות | Teams
tournaments.manage.sections.schedule: לוח משחקים | Schedule
tournaments.manage.sections.status: סטטוס | Status
tournaments.manage.sections.roles: הרשאות | Roles
tournaments.manage.queue.pending: ממתינות ({{count}}) | Pending ({{count}})
tournaments.manage.queue.approved: מאושרות | Approved
tournaments.manage.queue.waitlist: רשימת המתנה | Waitlist
tournaments.manage.queue.closed: נדחו/יצאו | Rejected/withdrawn
tournaments.manage.queue.approve: אישור | Approve
tournaments.manage.queue.toWaitlist: רשימת המתנה | Waitlist
tournaments.manage.queue.reject: דחייה | Reject
tournaments.manage.queue.rejectConfirm: לדחות את {{team}}? הקפטן יקבל הודעה. | Reject {{team}}? The captain will be notified.
tournaments.manage.queue.valid: תקינה | Valid
tournaments.manage.queue.missing: חסרים {{count}} | {{count}} short
tournaments.manage.queue.over: {{count}} מעל המקסימום | {{count}} over max
tournaments.manage.queue.promoted: {{team}} עלתה מרשימת ההמתנה | {{team}} moved up from the waitlist
tournaments.manage.seeding: סדר זריעה | Seeding order
tournaments.manage.seedingSave: שמירת סדר | Save order
tournaments.manage.seedingRandom: הגרלה אקראית | Random draw
tournaments.manage.manualRankTitle: קביעת סדר בשוויון · {{group}} | Set tie order · {{group}}
tournaments.manage.manualRankBody: הקבוצות שוות בכל שוברי השוויון. הסדר שתקבעו יקבע מי עולה לשלב הבא. | These teams are tied on every tiebreaker. The order you set decides who advances.
tournaments.manage.sched.days: ימים ושעות | Days and hours
tournaments.manage.sched.addDay: הוספת יום | Add day
tournaments.manage.sched.from: מ- | From
tournaments.manage.sched.to: עד | To
tournaments.manage.sched.tzHint: חלונות הזמן הם בשעון ישראל, כולל מעבר שעון קיץ/חורף. | Time windows are in Israel time, including daylight-saving changes.
tournaments.manage.sched.courts: מגרשים | Courts
tournaments.manage.sched.nameCourts: מתן שמות למגרשים | Name the courts
tournaments.manage.sched.court: מגרש {{n}} | Court {{n}}
tournaments.manage.sched.stepMinutes: מרווח שיבוץ | Slot step
tournaments.manage.sched.newSeed: הגרלה חדשה | New draw
tournaments.manage.sched.preview: תצוגה מקדימה | Preview
tournaments.manage.sched.summary: {{matches}} משחקים · {{days}} ימים · {{courts}} מגרשים · {{conflicts}} התנגשויות | {{matches}} matches · {{days}} days · {{courts}} courts · {{conflicts}} conflicts
tournaments.manage.sched.noConflicts: בלי התנגשויות | No conflicts
tournaments.manage.sched.byDay: לפי יום | By day
tournaments.manage.sched.grid: לוח מגרשים | Court grid
tournaments.manage.sched.backToEdit: חזרה לעריכה | Back to edit
tournaments.manage.sched.commit: שמירת לוח המשחקים | Save schedule
tournaments.manage.sched.commitWithConflicts: שמירה עם התנגשויות | Save with conflicts
tournaments.manage.sched.commitConflictsConfirm: לשמור לוח עם {{count}} התנגשויות? אפשר לתקן ידנית אחר כך. | Save a schedule with {{count}} conflicts? You can fix them by hand later.
tournaments.manage.sched.replaceConfirm: לוח המשחקים הקיים יוחלף. משחקים שכבר הסתיימו לא ישתנו. | The current schedule will be replaced. Finished matches won't change.
tournaments.manage.sched.hasResults: כבר הוזנו תוצאות, אי אפשר לבנות מחדש. אפשר לערוך משחקים ידנית. | Results already exist, so the schedule can't be rebuilt. Edit matches by hand instead.
tournaments.manage.sched.saved: לוח המשחקים נשמר. השחקנים יקבלו עדכון. | Schedule saved. Players will be notified.
tournaments.manage.sched.addMatch: הוספת משחק | Add match
tournaments.manage.sched.moveTo: העברה… | Move…
tournaments.manage.sched.saveAnyway: שמירה בכל זאת | Save anyway
tournaments.manage.sched.deleteMatch: מחיקת משחק | Delete match
tournaments.manage.sched.matchReferenced: משחק אחר תלוי בתוצאה של המשחק הזה, אי אפשר למחוק. | Another match depends on this one, so it can't be deleted.
tournaments.manage.sched.matchFinished: אי אפשר למחוק משחק שהסתיים. | A finished match can't be deleted.
tournaments.manage.sched.openSlot: מקום פנוי | Open slot
tournaments.manage.conflict.COURT_OVERLAP.title: שני משחקים באותו מגרש באותה שעה | Two matches on one court at once
tournaments.manage.conflict.COURT_OVERLAP.body: משחקים {{a}} ו-{{b}} מתנגשים ב{{court}}. הוסיפו מגרש או זמן. | Matches {{a}} and {{b}} collide on {{court}}. Add a court or more time.
tournaments.manage.conflict.TEAM_OVERLAP.title: קבוצה בשני משחקים במקביל | A team is double-booked
tournaments.manage.conflict.TEAM_OVERLAP.body: {{team}} משובצת ב-{{a}} וב-{{b}} באותו זמן. | {{team}} is in {{a}} and {{b}} at the same time.
tournaments.manage.conflict.TEAM_REST.title: אין מספיק מנוחה | Not enough rest
tournaments.manage.conflict.TEAM_REST.body: ל{{team}} יש פחות מ-{{min}} דק׳ בין {{a}} ל-{{b}}. | {{team}} has under {{min}} min between {{a}} and {{b}}.
tournaments.manage.conflict.OUTSIDE_WINDOW.title: מחוץ לשעות שהוגדרו | Outside the time windows
tournaments.manage.conflict.OUTSIDE_WINDOW.body: משחק {{a}} לא נכנס לאף חלון זמן. | Match {{a}} doesn't fit any time window.
tournaments.manage.conflict.NO_SLOT.title: אין זמן פנוי | No free slot
tournaments.manage.conflict.NO_SLOT.body: לא נמצא מגרש פנוי למשחק {{a}}. הוסיפו יום, שעות או מגרשים. | No free court for match {{a}}. Add a day, hours or courts.
tournaments.manage.conflict.DEPENDENCY_UNSCHEDULED.title: משחק תלוי לא שובץ | Depends on an unscheduled match
tournaments.manage.conflict.DEPENDENCY_UNSCHEDULED.body: {{a}} תלוי בתוצאה של משחק שעוד לא שובץ, ולכן לא שובץ גם הוא. | {{a}} depends on a match that isn't scheduled, so it isn't either.
tournaments.manage.status.publish: פרסום ופתיחת הרשמה | Publish and open registration
tournaments.manage.status.close: סגירת הרשמה | Close registration
tournaments.manage.status.closeConfirm: קבוצות חדשות לא יוכלו להירשם, והקישורים להצטרפות יפסיקו לעבוד. אפשר לפתוח מחדש כל עוד לא נבנה לוח משחקים. | New teams can't register and join links stop working. You can reopen until a schedule is built.
tournaments.manage.status.reopen: פתיחת ההרשמה מחדש | Reopen registration
tournaments.manage.status.start: התחלת הטורניר | Start tournament
tournaments.manage.status.startConfirm: אחרי ההתחלה אפשר להזין תוצאות, ואי אפשר לפתוח הרשמה מחדש. | Once started, results can be entered and registration can't reopen.
tournaments.manage.status.complete: סיום הטורניר | Finish tournament
tournaments.manage.status.completeConfirm: הטורניר יסומן כהסתיים והאלופה תוצג בעמוד. משחקים שלא שוחקו יישארו כפי שהם. | The tournament will be marked finished and the champion shown. Unplayed matches stay as they are.
tournaments.manage.status.cancel: ביטול הטורניר | Cancel tournament
tournaments.manage.status.cancelConfirm: כל המשחקים שלא שוחקו יבוטלו. אי אפשר לבטל את הפעולה. | All unplayed matches will be cancelled. This can't be undone.
tournaments.manage.status.typeTitle: הקלידו את שם הטורניר לאישור | Type the tournament name to confirm
tournaments.manage.status.forceStart: התחלה בכל זאת | Start anyway
tournaments.manage.problem.TOO_FEW_TEAMS: רק {{approved}} קבוצות מאושרות, צריך לפחות {{minTeams}} | Only {{approved}} approved teams, at least {{minTeams}} needed
tournaments.manage.problem.TOO_FEW_PLAYERS: {{team}}: {{players}} שחקנים (צריך {{min}}–{{max}}) | {{team}}: {{players}} players ({{min}}–{{max}} needed)
tournaments.manage.problem.TOO_MANY_PLAYERS: {{team}}: {{players}} שחקנים (צריך {{min}}–{{max}}) | {{team}}: {{players}} players ({{min}}–{{max}} needed)
tournaments.manage.problem.NO_SCHEDULE: עוד לא נבנה לוח משחקים | No schedule yet
tournaments.manage.roles.ORGANIZER: מארגן | Organizer
tournaments.manage.roles.MANAGER: מנהל | Manager
tournaments.manage.roles.SCOREKEEPER: רשם תוצאות | Scorekeeper
tournaments.manage.roles.managerHint: יכול לערוך את הטורניר, לאשר קבוצות ולבנות לוח משחקים | Can edit the tournament, approve teams and build the schedule
tournaments.manage.roles.scorekeeperHint: יכול להזין תוצאות בלבד | Can enter results only
tournaments.manage.roles.add: הוספת מנהל או רשם | Add a manager or scorekeeper
tournaments.manage.roles.change: שינוי ל… | Change to…
tournaments.manage.roles.remove: הסרה | Remove
tournaments.manage.roles.empty: אין עוד מנהלים | No other managers
tournaments.score.inc: הוספת נקודה ל{{team}} | Add a point for {{team}}
tournaments.score.dec: הפחתת נקודה ל{{team}} | Remove a point from {{team}}
tournaments.score.incGoal: הוספת שער ל{{team}} | Add a goal for {{team}}
tournaments.score.decGoal: הפחתת שער ל{{team}} | Remove a goal from {{team}}
tournaments.score.status.LIVE: חי | Live
tournaments.score.status.FINISHED: הסתיים | Finished
tournaments.score.status.FORFEIT: טכני | Forfeit
tournaments.score.forfeitWho: מי הפסיד טכנית? | Who forfeited?
tournaments.score.forfeitPreview: {{score}} לטובת {{winner}} | {{score}} to {{winner}}
tournaments.score.penaltiesTitle: פנדלים | Penalties
tournaments.score.penaltiesHint: תיקו בנוקאאוט. הזינו פנדלים כדי לקבוע מי עולה. | Knockout draw. Enter penalties to decide who advances.
tournaments.score.statsToggle: סטטיסטיקות שחקנים (לא חובה) | Player stats (optional)
tournaments.score.saveFinished: שמירה וסיום משחק | Save and finish
tournaments.score.saveLive: עדכון תוצאה חיה | Update live score
tournaments.score.saveForfeit: שמירת ניצחון טכני | Save forfeit
tournaments.score.saved: התוצאה נשמרה | Result saved
tournaments.score.savedAdvanced: התוצאה נשמרה · {{team}} עלתה ל{{round}} | Result saved · {{team}} advances to the {{round}}
tournaments.score.undo: החזרה ל״מתוכנן״ | Reset to scheduled
tournaments.score.undoConfirm: למחוק את התוצאה ולהחזיר את המשחק למתוכנן? קבוצות שעלו בזכות המשחק הזה יחזרו למקום פנוי. | Clear the result and reset to scheduled? Teams that advanced from this match go back to an open slot.
tournaments.score.teamsUnknown: הקבוצות במשחק הזה עוד לא נקבעו | The teams for this match aren't set yet
tournaments.score.notInProgress: אפשר להזין תוצאות רק כשהטורניר מתקיים | Results can be entered only while the tournament is in progress
tournaments.score.invalid: התוצאה לא תקינה. בדקו את השדות המסומנים. | Invalid result. Check the highlighted fields.
tournaments.score.downstreamTitle: המשחק הבא כבר הסתיים | The next match is already finished
tournaments.score.downstreamBody: שינוי התוצאה כאן משנה מי עלתה למשחק {{n}}, שכבר שוחק. | Changing this result changes who advanced to match {{n}}, which was already played.
tournaments.score.downstreamForce: שינוי בכל זאת | Change anyway
tournaments.score.downstreamForceConfirm: התוצאה של משחק {{n}} תישאר, אבל הקבוצה בו תוחלף. בדקו אותו אחר כך. | Match {{n}}'s score stays, but its team will change. Check it afterwards.
tournaments.score.downstreamOrganizerOnly: רק מארגן הטורניר יכול לשנות את זה | Only the organizer can change this
tournaments.score.conflictTitle: מישהו אחר עדכן את התוצאה | Someone else updated the score
tournaments.score.conflictNow: עכשיו | Now
tournaments.score.conflictMine: שלך | Yours
tournaments.score.keepTheirs: להשאיר את שלהם | Keep theirs
tournaments.score.keepMine: לשמור את שלי | Save mine
tournaments.profile.title: טורנירים | Tournaments
tournaments.profile.champion: 🏆 אלופים | 🏆 Champions
tournaments.profile.groupStage: שלב הבתים | Group stage
tournaments.profile.place: מקום {{n}} | {{n}} place
tournaments.profile.inProgress: מתקיים | In progress
tournaments.profile.showAll: הצגת הכל | Show all
tournaments.home.nextMatch: המשחק הבא שלך בטורניר · {{title}} | Your next tournament match · {{title}}
tournaments.home.inHours: בעוד {{count}} שעות | In {{count}} hours
tournaments.home.tomorrowAt: מחר {{time}} | Tomorrow {{time}}
tournaments.home.now: עכשיו! | Now!
tournaments.home.details: לפרטים | Details
tournaments.home.moreTournaments: +{{count}} טורניר נוסף | +{{count}} more tournament
```

Reused from F1 or common: `common.retry`, `common.error`, `results.win/draw/loss`, `resultEditor.leaveTitle/keepEditing/leave`, `resultEditor.offline`, `resultEditor.warnSum`. Stat names come from `shared/matchStats.js`, never from keys.

---

## 19. API gaps

Each has a fallback so presentational work is not blocked; please decide them before D1.

1. **Champion and podium not in the payload.** `GET /:id` has no `championTeamId` / placements, so the client derives them (final winner, third-place winner, or league rank 1 when the table is complete). Fallback: derive; for a CUSTOM format show no champion. Recommend adding `podium: [{place, team}]` to the COMPLETED tournament payload.
2. **Waitlist position.** Teams have no `waitlistPosition`; public viewers cannot see other waitlisted teams to compute it. Fallback: the "ברשימת ההמתנה" banner without a number (`WAITLISTED_NOPOS`). Recommend `myTeam.waitlistPosition`.
3. **Join-code preview.** There is no `GET /:id/join/:code` to show the team before joining (`POST` joins immediately). Fallback: the generic join sheet (§5.2). Recommend a read-only preview `{ team: {name,color,logoUrl,captainName,memberCount}, maxPlayers }`.
4. **Why can't I register?** `capabilities.canRegisterTeam` is boolean only. The UI wants a reason to show the minors card up front instead of after a 403, and to tell "already in a team" apart from "full" (waitlist allowed) and "closed". Recommend `registerBlockedReason: 'MINOR'|'CLOSED'|'ALREADY_IN_TEAM'|null`. Fallback: show the CTA and handle errors per §4.7.
5. **Per-player stats on a match.** `Match` has no stats, so the match detail (§10) and the score sheet's stats prefill cannot show existing entries. Recommend `GET /:id/matches/:matchId` returning `stats: [{userId, teamId, values}]` filtered by the F1 privacy gate (owner, `hideMatchStats`, `privacyGames`). Fallback: hide the stats block in the match detail, and the score sheet starts with empty stats (risk: re-saving overwrites). Until it lands, keep the stats toggle off for matches that already have a result.
6. **`VERSION_CONFLICT` has only `currentVersion`.** The conflict card needs the newer score. Fallback: refetch the match before showing the card. Recommend including the current `match` in the 409 body.
7. **Downstream match number.** `DOWNSTREAM_FINISHED { matchId }` gives an id, and the copy needs the match `number`. Fallback: map through the cached schedule. Fine if the schedule is loaded; otherwise say "המשחק הבא".
8. **Profile tournaments history (§14.1)** has no endpoint. Recommend `GET /api/users/:id/tournaments` (privacy-gated like match history) returning `[{tournamentId, title, sport, startsAt, endsAt, status, team:{id,name,color,logoUrl}, placement: 'CHAMPION'|'FINAL'|'SEMI_FINAL'|'QUARTER_FINAL'|'GROUP_STAGE'|{leagueRank}|null}]`. Fallback: the section is not rendered.
9. **Home "my next match" (§14.2)** has no endpoint. `GET /?mine=1` returns tournaments, not matches; looping over schedules per tournament on the home screen is too heavy. Recommend `GET /api/tournaments/my-next-match` → `{ tournamentId, title, sport, match }|null`. Fallback: the card is not rendered.
10. **List card progress.** Summaries include `approvedTeams` but not `matchesFinished/matchesTotal`, so "{x}/{y} משחקים שוחקו" on list cards needs them. Fallback: show dates instead of progress for IN_PROGRESS cards.
11. **Venue name and city on list cards.** Summaries have `fieldId` / `customLocation` but no field name or city. Recommend adding `venueName`, `city`. Fallback: `customLocation`, or nothing.
12. **Match counting helpers for the wizard preview (§3.4).** The shared engines count matches when generating, but there is no small exported `countMatches(format, teams, rules)` for the client. Recommend one pure helper in `shared/tournament/`. Fallback: show only the format explanation.
13. **Team colour palette in shared code.** The palette lives in `server/services/pickSessionService.js`. Recommend `shared/teamColors.js` so the team-create swatches and the server share it, keeping hex out of components.
14. **Tournament report.** The plan's `POST /:id/report` is not in this server step; player reports use `UserReport.tournamentId` via the F1 reports API. The overflow item "דיווח על הטורניר" needs a target. Fallback: hide that menu item. Reporting a player from a team sheet uses the F1 `ReportUserDialog` with `tournamentId` context once the reports API accepts it.
15. **Admin overview filters** (optional): the list endpoint has no text search and no organizer name. Fallback: client-side filter on the loaded page and organizer id.
16. **D1 checks on Dev** (visual, need seeded data): the bracket connectors and the RTL paging on Android and iOS (§9.3), the sticky standings column in full mode at 360px on both platforms, Hebrew 2-line clamps on the bracket and schedule cards, the schedule grid with 4+ courts at 1280px, sheet snap points with the keyboard open, and the champion surface in light and dark mode for all three sports.
