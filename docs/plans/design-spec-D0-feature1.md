# D0 design spec - Feature 1: match results, player stats, player reports

Answers [design-brief-D0-feature1-match-results.md](./design-brief-D0-feature1-match-results.md). Behaviour and API: [2026-10-feature-match-results.md](./2026-10-feature-match-results.md), `server/services/gameResultService.js`, `server/services/userStatsService.js`.

Audience: the implementation agents building presentational components (F1-8..F1-11 web, F1-13..F1-16 mobile). Everything here is visual: layout, tokens, states, copy, testIDs. Data fetching, hooks and API clients are out of scope. Where the spec needs data the API does not return yet, it is listed in [section 12](#12-open-items-and-api-gaps) and the UI must degrade as described there.

Language: product UI is Hebrew-first RTL. Web copy is Hebrew only (the web app has no i18n, matching the existing pages). Mobile copy is Hebrew + English via `src/i18n/locales/{he,en}.json`; keys are in [section 11](#11-mobile-i18n-keys).

---

## 0. Design language recap (what "keep the existing look" means)

Measured from the current code, not invented:

| Element | Web (`next_app`, MUI + Tailwind layout utilities) | Mobile (`mobile_app`, NativeWind) |
| --- | --- | --- |
| Section card | `Card variant="outlined" sx={{ borderRadius: 2 }}` + `CardContent` (as `GameRatingsPanel`) | `bg-white dark:bg-cyber-card rounded-2xl p-5 border border-gray-100 dark:border-cyber-border mx-4 mt-4` |
| Section title | `Typography variant="h6" fontWeight={800}` (`letterSpacing: "-0.02em"`) | `text-lg font-bold text-gray-900 dark:text-cyber-text` |
| Secondary text | `variant="body2" color="text.secondary"` | `text-gray-500 dark:text-cyber-muted` |
| Caption / meta | `variant="caption" color="text.secondary"` | `text-xs text-gray-500 dark:text-cyber-muted` |
| Divider | `Divider` / `borderColor: "divider"` | `border-gray-100 dark:border-cyber-border` |
| Primary button | `Button variant="contained"` (pill, theme override) | `h-[52px] rounded-2xl bg-brand items-center justify-center`, label `text-white font-bold text-[16px]` |
| Secondary action | `Button variant="text"` / `outlined` | `SecondaryAction` row in `game/[id].tsx` (`h-12 rounded-2xl border`) |
| Destructive | `color="error"` | `text-red-600`, border `border-red-200` |
| Neutral chip | `Chip size="small"` | `bg-gray-100 dark:bg-cyber-border px-3 py-1.5 rounded-full` |
| Brand chip | `Chip color="primary" variant="outlined"` | `bg-brand-mist border border-brand-pale` + `text-brand-dark` |
| Avatar | `@/components/Avatar` (`size="md"` rows, `"lg"` hero) | `Image` `w-12 h-12 rounded-full bg-gray-200` (rows), `w-8 h-8` (dense lists) |
| Loading | `LoadingMotif id="bouncing-ball"` inside sections | `LoadingMotif id="bouncing-ball"` |
| Toast | MUI `Snackbar` + filled `Alert`, bottom-center, 2000ms | `Alert.alert('', msg)` today; keep for parity |

Dark mode: web is MUI `palette.mode` (`theme.ts`), so every colour in a web component comes from the MUI palette (`success`, `secondary`, `error`, `warning`, `text.*`, `divider`, `action.*`, `background.paper`) through `sx`, never Tailwind colour classes. Mobile dark mode is the `dark:` variant with the existing `cyber-*` tokens. Several mobile screens touched here (`user/[id].tsx`, `profile/settings.tsx`, `admin/moderation.tsx`, `GameRatingsPanel`) have **no** `dark:` classes today; new components must include them anyway (the game screen does).

---

## 1. Global decisions

### 1.1 Score order in RTL (decision)

**Rule: a side's score always sits next to that side's label, and side `order: 0` (home/A) is at the reading-start edge.** In Hebrew (RTL) that is the right; in the English mobile locale (LTR) it is the left. The layout follows `dir`, so nothing is mirrored by hand.

```
RTL (as seen on screen)          LTR (English locale)
 האדומים ●  2  :  3  ● הכחולים    Blues ●  3  :  2  ● Reds
 side 1 (B)          side 0 (A)    side 0 (A)         side 1 (B)
```

Reading right-to-left a Hebrew user gets "הכחולים 3, האדומים 2", which is the Israeli sports-media convention (home on the right, score hugging its team).

Implementation constraints that follow from it:

1. **Never render a score as one string like `"3-2"`.** Bidi treats `3-2` as a single LTR number run, so in RTL the first number lands on the *left*, away from side A. Render the two numbers and the separator as **separate flex children** (`flexDirection: row`, which follows `dir`). Web: three `<span>`s in a `Stack direction="row"`; mobile: three `<Text>` in `flex-row`.
2. Separator is `:` in the big scoreboard and an en dash `–` in compact places, both with 4-8px gap; never a hyphen.
3. Numbers use tabular figures: web `fontVariantNumeric: "tabular-nums"`, mobile `style={{ fontVariant: ['tabular-nums'] }}`.
4. Personal contexts (history badge, section 4) use the API's `result.score` which is already "mine-other" (`userStatsService.getResultsForGames`). Split it on `-` and render **my score at the start edge**, other at the end edge, same flex rule. So in RTL a 3-2 win reads "3 – 2" right to left with 3 on the right.
5. Tennis sets: never "6-4 3-6" strings either. Use the set grid (section 2.3): rows = sides, columns = sets, set 1 nearest the labels, later sets toward the end edge.
6. Lists of sides (stat groups, editor) also go A then B: on desktop A is the start column (right in RTL), on phones A is on top.

### 1.2 Colour tokens

No hex in components. Sources, in priority order:

1. **MUI palette** (web) / **NativeWind classes** (mobile) for all UI chrome and outcome colours.
2. **`SPORT_THEME[sport]`** (`shared/sports.js`, via `getSportTheme()` in `next_app/src/utils/sports.ts`; mobile imports from `@joinup/shared/sports` the same way) for sport accents. Mobile applies these through `style={{ ... }}` since the values are dynamic, as `SportCover` already does.
3. **Team colour** (`game.teams[].color`, free hex chosen by the pick-session palette, includes near-black `#1f2937` and yellow) only as a swatch, never as a background behind text.

#### Sport accent usage rules (contrast-checked)

| Use | Light mode | Dark mode | Why |
| --- | --- | --- | --- |
| Accent bar / stripe / filled selected segment | `base` | `base` | Large shapes only. |
| Text on a filled `base` surface | `ink` | `ink` | ink on base is about 4.6:1 (soccer), higher for basketball/tennis. White on tennis yellow fails AA. |
| Accent text on card | `deep` | `glow` | `base` as small text on white fails AA for soccer and tennis. |
| Pale tinted surface (stat tile, selected row) | `tint` bg + `deep` text | `deep` at 35%: web `alpha(deep, 0.35)`; mobile an absolutely positioned `View` with `backgroundColor: deep` and `opacity: 0.35` behind the content (no hex string concatenation). Text `glow`. | `tint` is a light-only colour. |

#### Outcome colours (W / D / L)

Young and friendly, not punitive: a loss is neutral grey, not red. The letter always carries the meaning, so colour is never the only signal.

| Outcome | Web (`sx`) | Mobile light | Mobile dark |
| --- | --- | --- | --- |
| WIN | `color: "success.dark"` (dark mode `success.main`), `bgcolor: alpha(success.main, 0.14)` | `bg-brand-mist text-brand-dark` | `dark:bg-brand-ink dark:text-brand-light` |
| DRAW | `color: "secondary.dark"` (dark mode `secondary.light`), `bgcolor: alpha(secondary.main, 0.14)` | `bg-indigo-50 text-indigo-700` | `dark:bg-indigo-950 dark:text-indigo-300` |
| LOSS | `color: "text.secondary"`, `bgcolor: "action.hover"` | `bg-gray-100 text-gray-600` | `dark:bg-cyber-border dark:text-cyber-muted` |
| null (no side) | as LOSS, no letter | as LOSS | as LOSS |

#### Team swatch

`10x10` circle (web `Box`, mobile `View w-2.5 h-2.5 rounded-full`) filled with the team colour plus a 1px ring (`borderColor: "divider"` / `border border-gray-200 dark:border-cyber-border`) so near-black reads in dark mode and yellow reads on white. Ad-hoc sides (no `teamId`, e.g. tennis singles): side A swatch = sport `base`, side B swatch = neutral (`text.disabled` / `bg-gray-400`).

#### Proposed new tokens

None are required to ship; these are optional clean-ups the implementers may add if they want named tokens instead of repeating class strings:

- **Mobile `tailwind.config.js`**: `colors.outcome = { win: <brand.DEFAULT>, draw: <indigo-600>, loss: <gray-500> }` only if the class strings above get repeated in more than three files.
- **Web**: a tiny helper `outcomeSx(outcome, mode)` next to the component (not a theme change).
- **Web Tailwind HSL vars** in `globals.css` have no dark overrides. Not a problem here because the new web components use MUI `sx`, but flagging it so nobody reaches for `bg-card`/`text-muted-foreground` in these components and gets light colours in dark mode.

### 1.3 Typography

| Role | Web | Mobile |
| --- | --- | --- |
| Scoreboard numeral | `fontSize: { xs: 36, sm: 48 }`, `fontWeight: 800`, `lineHeight: 1`, `letterSpacing: "-0.02em"`, tabular | `text-[36px] font-extrabold` (`leading-none`), tabular |
| Scoreboard separator | same size, `fontWeight: 400`, `color: text.disabled` | `text-gray-300 dark:text-cyber-border` |
| Side label | `subtitle1` 600, 2-line clamp | `text-[15px] font-bold`, `numberOfLines={2}` |
| Stat tile value | `fontSize: 22, fontWeight: 800`, tabular | `text-[22px] font-extrabold` |
| Stat tile label | `caption` `text.secondary` | `text-xs text-gray-500 dark:text-cyber-muted` |
| Editor stepper value | `fontSize: 28, fontWeight: 800` | `text-[28px] font-extrabold` |
| Badge text | `fontSize: 13, fontWeight: 700` | `text-[13px] font-bold` |

Font is Heebo on web (already themed); mobile uses the system font as everywhere else.

### 1.4 Spacing, radius, touch

- Web spacing on the MUI 8px grid; mobile on Tailwind 4px units. Card padding: web `CardContent` default (16px, 24px on `sm+` via `p: { xs: 2, sm: 3 }`), mobile `p-5` (20px) on cards, `p-4` inside nested rows.
- Radius: cards follow the existing shells above; chips/pills fully rounded; inputs 12px (theme default on web, `rounded-xl` mobile).
- Touch targets: mobile >= 44px everywhere, **56px** for the editor score steppers (end-of-game, one-handed, sweaty thumbs). Web icon buttons >= 40px, steppers 44px.
- Phone width baseline 360px: horizontal page gutter 16px on both platforms, leaving 328px of content.

### 1.5 Icons

Web uses `@mui/icons-material` Rounded variants (as `GameLiveSection` does); mobile uses `Ionicons` (most common set in `mobile_app`). No new icon assets are needed.

| Meaning | Web | Mobile `Ionicons` |
| --- | --- | --- |
| Result / scoreboard header | `ScoreboardRounded` | `trophy-outline` |
| Winner mark | `EmojiEventsRounded` (16px) | `trophy` (14) |
| Edit result | `EditRounded` | `create-outline` |
| Stepper | `RemoveRounded` / `AddRounded` | `remove` / `add` |
| Add / remove set | `AddRounded` / `CloseRounded` | `add-circle-outline` / `close` |
| Locked | `LockRounded` | `lock-closed-outline` |
| Hidden (owner banner) | `VisibilityOffRounded` | `eye-off-outline` |
| Soft warning | `WarningAmberRounded` (Alert default) | `warning-outline` |
| Report / dispute | `OutlinedFlagRounded` | `flag-outline` |
| Stats section | `InsightsRounded` | `stats-chart-outline` |
| MVP | `StarRounded` | `star` |
| Delete | `DeleteOutlineRounded` | `trash-outline` |
| Self-reported info | `InfoOutlined` (14px) | `information-circle-outline` (14) |

Sport identity keeps using `SPORT_EMOJI` where the existing UI already does (history rows, sport chips).

### 1.6 Stat value formatting

- Order and labels come from `getStatDefs(sport)` / `getStatLabel(sport, key, lang)`; never hardcode names.
- Show only keys with value > 0 in read views. Binary keys (`cleanSheet`, `mvp`) render as a badge with no number ("רשת נקייה", "⭐ שחקן המשחק").
- Inline format: `{value} {label}` ("2 שערים"). The shared module only has plural labels, so **value 1** renders `{label}: 1` ("בישולים: 1") until singular labels exist (proposal in section 12).
- Per-game averages: one decimal, `toLocaleString(lang === 'he' ? 'he-IL' : 'en-US', { maximumFractionDigits: 1 })`, suffix "למשחק" / "per game".
- Win rate: `Math.round(wins / (wins + draws + losses) * 100)`; hide when the denominator is 0.

### 1.7 Copy tone

- Stats are self-reported by game managers. Never say "official", "verified", "ranking", "דירוג" (that word is taken by star ratings) or "טבלה". Say "תוצאה", "סטטיסטיקות", "לפי מנהלי המשחק".
- Hebrew copy is gender-neutral: plural imperative ("הזינו", "נסו שוב") or infinitive, matching existing strings ("נסו שוב", "שוחחו עם שאר השחקנים").
- English copy is sentence case, short.

### 1.8 States every surface must handle

| State | Treatment |
| --- | --- |
| Loading | Skeleton of the final shape (web `Skeleton variant="rounded"`, mobile `bg-gray-100 dark:bg-cyber-border rounded-xl` blocks with the existing shimmer if available), never a full-page spinner. Small sections may use `LoadingMotif` like `GameRatingsPanel`. |
| Empty | Copy per surface below; never an empty card with only a title. |
| Error | Inline in the section: one line + "נסו שוב" text button. Never block the rest of the game/profile page (web pages already wrap sections in `SectionErrorBoundary`; wrap the new ones too, label "תוצאת המשחק" / "סטטיסטיקות"). |
| Offline | Same slot as error, copy "אין חיבור לאינטרנט" / "You're offline". In the editor, keep the entered values. |
| Long names | 2-line clamp for side labels and player names in editor; 1-line ellipsis in dense lists (stats per player, admin rows) with the full name in `title` (web) / `accessibilityLabel` (mobile). Use `minWidth: 0` on flex children so clamping works. |
| Dark mode | Every colour from section 1.2. Check the swatch ring. |
| 360px | Layouts below. No horizontal scroll except the sport segment control. |
| No teams (tennis singles / ad-hoc) | Side labels come from `side.label` (server snapshot); swatch rule from 1.2. |
| Hidden | Nothing rendered (no placeholder) for viewers, owner banner only for the owner (section 5). |
| Locked | Read view gets a lock chip for managers; editor closed (section 3.8). |
| Saving | Primary button shows spinner + "שומר…", form `disabled`, dialog not dismissable. |

---

## 2. Screen 1 - Game result, read view

Component: `GameResultPanel` (web `next_app/src/components/GameResultPanel.tsx`, mobile `mobile_app/src/components/GameResultPanel.tsx`). Props (presentational): `sport`, `result` (the API `result` object), `teams` (for colour by `teamId`), `viewerCanDispute`, `canEdit`, `locked`, `lockedAt`, `onEdit`, `onDispute`, `state: 'loading' | 'error' | 'ready'`, `onRetry`.

### 2.1 Placement

- **Web**: in `GameLiveSection.tsx`, right after the manager bar / `PendingJoinRequests` block and before the roster `Grid`, full container width. The game header (`GameHero`) stays first.
- **Mobile**: in `app/(tabs)/game/[id].tsx`, directly after the quick-actions card (share / navigate / calendar, around line 416) and before the roster section.
- Rendered only when `result` exists (plus the manager CTA in 2.5 when `eligible && canEdit && !result`).

### 2.2 Layout

Desktop (web, container `md`/`lg`):

```
┌───────────────────────────────────────────────────────────────┐  RTL view
│ [✎ עריכה]  [🔒 נעול]                         תוצאת המשחק  ▣  │  header row
│                                                               │
│     האדומים ●        2   :   3        ● הכחולים               │  scoreboard
│                                      [🏆 ניצחון]              │  outcome under winner
│ ─────────────────────────────────────────────────────────────  │
│  האדומים (5)                   │  הכחולים (5)                 │  stats, 2 columns
│  ◯ רון לוי     1 שערים          │  ◯ דני כהן   2 שערים · ⭐     │  (A = right column)
│  ...                           │  ...                         │
│ ─────────────────────────────────────────────────────────────  │
│ "משחק צמוד, הכחולים הפכו בדקה האחרונה"                         │  notes
│ ⓘ נרשם ע״י דני כהן · דיווח עצמי של מנהלי המשחק   התוצאה לא נכונה? │  footer
└───────────────────────────────────────────────────────────────┘
```

- Card shell from section 0. A 4px accent stripe in sport `base` along the top edge of the card (web `borderTop: 4px solid`, mobile absolutely positioned `View h-1` at top with `style={{ backgroundColor: theme.base }}`), the same identity cue the sport chips use.
- Header: title "תוצאת המשחק" (h6 800) with the scoreboard icon at the start; actions at the end edge: "עריכה" text button (managers with `canEdit`), lock chip (managers when `locked`).
- Scoreboard: 3-column grid `1fr auto 1fr`; side A column at start. Each side column: swatch + label stacked over nothing (label 2-line clamp, `textAlign` toward the centre: A column aligned end-of-column so it hugs the score). Score cluster centred: `A-score : B-score` per rule 1.1 (A's number on the start side). Gap between numbers and colon: 12px desktop, 8px phone.
- Outcome emphasis: winner's number `text.primary` 800; loser's number `text.secondary` 700. Under the winner's label a small chip `🏆 ניצחון` (WIN tokens). DRAW: one chip "תיקו" centred under the colon (DRAW tokens), both numbers `text.primary`.
- Stats block (only if `result.stats.length > 0`): grouped by side. Desktop 2 columns (A start). Group header: swatch + side label + count. Player row (min-height 44): avatar 32, name (1-line ellipsis), then stat text in `body2 text.secondary`: up to 3 non-zero stats joined with " · ", MVP star last; `+N` overflow is not needed (max 8 keys; if more than 3 non-zero, show the 3 earliest in `STAT_DEFS` order and the rest on a second line, wrapping allowed). Players with `sideId` null go in a third group "ללא שיבוץ" after B.
- Notes: `body1`, `whiteSpace: pre-wrap`, quoted look: start-edge 3px bar `divider`, padding-inline-start 12px.
- Footer (caption, `text.secondary`): info icon + "נרשם ע״י {name}" + " · דיווח עצמי של מנהלי המשחק". If `editedAt` exists, append " · עודכן {date}". At the end edge, the dispute link (section 8) when allowed.

Phone (360):

```
┌────────────────────────────────┐
│ ▣ תוצאת המשחק        [✎ עריכה] │
│                                │
│  האדומים ●  2 : 3  ● הכחולים    │  labels 2-line clamp, ~110px each
│                    [🏆 ניצחון]  │
│ ────────────────────────────── │
│ ● הכחולים (5)                  │  A group first
│ ◯ דני כהן         2 שערים · ⭐  │
│ ● האדומים (5)                  │
│ ◯ רון לוי               1 שערים │
│ ────────────────────────────── │
│ notes                          │
│ ⓘ נרשם ע״י דני כהן · דיווח עצמי │
│ התוצאה לא נכונה?               │  dispute on its own line
└────────────────────────────────┘
```

- Same structure, single stats column, A group first. Score numerals 36px. Side label max width = (328 - score cluster ~96) / 2 = 116px, 2-line clamp, `fontSize 14`.
- Stats groups longer than 6 players collapse to 6 with "הצגת כל השחקנים (N)" text button.

### 2.3 Tennis variant

Sides are 1-2 players, usually no teams. Big score = sets won (`side.score`; see 12.4). Below the scoreboard, the set grid replaces nothing; it is added:

```
RTL view                       מע׳ 3   מע׳ 2   מע׳ 1
                     ● דנה      10      3      6✓      ← winner row bold
                     ● נועה      7      6      4
```

- Grid: label column at start (≤ 45% width, 2-line clamp), then one column per set in order (set 1 nearest the label). Column width 40px, numbers 18px 700 tabular, set winner's number `text.primary` 800, other `text.secondary`.
- Column header caption: "מע׳ 1", "מע׳ 2"; a deciding match tiebreak column header "שובר שוויון" abbreviated "ש״ש" with `title`/`accessibilityLabel` "שובר שוויון".
- Doubles: label is the side label (e.g. "דנה ונועה"), names in the stats list below as usual.
- Stats block for tennis is usually small (aces, double faults, winners); same rules.

### 2.4 States

| State | Treatment |
| --- | --- |
| Loading | Card shell with: title skeleton 120x20, scoreboard skeleton (two 80x16 bars + two 40x40 squares), two 1-line row skeletons. Same height as the final card to avoid layout shift. |
| No result, viewer not manager | Render nothing. |
| No result, manager (`eligible && canEdit`) | CTA card (2.5). |
| Not eligible yet (game not finished) | Render nothing, also for managers. |
| Error / offline | Card with title + one line "לא הצלחנו לטעון את התוצאה" + "נסו שוב" button. |
| Stats empty / all hidden | Hide the stats block; no message (a missing player is a privacy choice, not an error). |
| Friends-only outsider (score only, `stats: []`, `roster: []`) | Scoreboard + notes + footer only. |
| Locked (managers) | Lock chip "נעול" in header; edit button hidden unless admin (`canEdit` true for admin). Chip tooltip (web) / tap-to-alert (mobile): "אפשר לערוך תוצאה עד 7 ימים אחרי שהוזנה. לתיקון פנו לתמיכה." |
| Long names | Side labels 2-line clamp; player names 1 line. |

Accessibility: the score cluster gets one label: web `aria-label` on the cluster, mobile `accessible accessibilityLabel` on the wrapping `View`: "הכחולים 3, האדומים 2. ניצחון להכחולים" / "Blues 3, Reds 2. Blues won". Draw: "תיקו 2–2" / "Draw 2–2". The individual numbers are `aria-hidden`. Set grid is a real `<table>` on web with `<th scope="col">` and `<th scope="row">`.

### 2.5 Manager CTA (no result yet)

Compact card, same shell, horizontal on desktop, stacked on phone:

- Icon circle 38px (`alpha(primary, 0.1)` bg / mobile `bg-brand-mist dark:bg-cyber-border`) with the scoreboard icon, like the chat card header.
- Title "המשחק הסתיים, איך נגמר?" / "Game over. How did it end?"
- Body "הזינו תוצאה וסטטיסטיקות לשחקנים. אפשר לערוך עד 7 ימים." / "Add the score and player stats. You can edit for 7 days."
- Button (contained, primary) "הזנת תוצאה" / "Add result", full width on phone.

### 2.6 Testids (new)

`game-result-panel`, `game-result-side-0`, `game-result-side-1`, `game-result-score-0`, `game-result-score-1`, `game-result-outcome`, `game-result-sets`, `game-result-stats`, `game-result-notes`, `game-result-recorded-by`, `game-result-edit`, `game-result-locked`, `game-result-dispute`, `game-result-cta`, `game-result-error`. Web as `data-testid`, mobile as `testID`, same strings.

---

## 3. Screen 2 - Result editor (managers)

Component: `GameResultEditor`. Props: `sport`, `initial` (sides/stats/notes or null), `roster`, `teams`, `locked`, `lockedAt`, `isAdmin`, `saving`, `warnings`, `fieldErrors`, `onSave(body)`, `onDelete()`, `onClose()`. Local form state is presentational state and belongs to the component; validation display only (rules come from `shared/matchStats.js`).

### 3.1 Container

- **Web desktop**: MUI `Dialog maxWidth="sm" fullWidth`, `dir="rtl"`, scrollable `DialogContent`, sticky `DialogActions`. Opened from the panel's "עריכה" or the CTA.
- **Web < 600px**: same `Dialog` with `fullScreen` (`useMediaQuery(theme.breakpoints.down("sm"))`), app-bar style header: close (X) at start, title centre, nothing at end.
- **Mobile**: RN `Modal` with `presentationStyle="pageSheet"` and `animationType="slide"` (no new route needed). Header row: close at start, title, then content `ScrollView` with `keyboardShouldPersistTaps="handled"`, and a **sticky bottom bar** (safe-area padded) holding the save button so it is always under the thumb.

Title: "תוצאת המשחק" / "Game result"; subtitle caption with sport emoji + game title + date.

### 3.2 Section A - score (soccer, basketball)

```
Phone (360), A on top                    Desktop, A at start (right in RTL)
┌──────────────────────────────┐        ┌──────────────┐ ┌──────────────┐
│ ● הכחולים                    │        │ ● האדומים     │ │ ● הכחולים     │
│  [ – ]      3       [ + ]    │        │ [–]  2  [+]  │ │ [–]  3  [+]  │
├──────────────────────────────┤        └──────────────┘ └──────────────┘
│ ● האדומים                    │
│  [ – ]      2       [ + ]    │
└──────────────────────────────┘
```

- Each side is a tile: `bgcolor: action.hover` / `bg-gray-50 dark:bg-cyber-bg`, radius 16, padding 12. Swatch + label (2-line clamp). For ad-hoc sides (no `teamId`) the label is an inline text field, placeholder "שם הצד" / "Side name", max 40 chars.
- Stepper: `[–] value [+]`. Mobile buttons 56x56 `rounded-2xl bg-white dark:bg-cyber-card border border-gray-200 dark:border-cyber-border`, icon 24. Web `IconButton` 44x44 `outlined`. Value 28px 800, min width 56, centred; **tapping the value turns it into a numeric input** (web `type="number" inputMode="numeric"`, mobile `keyboardType="number-pad"`) for big basketball scores.
- Basketball long-press on `+`/`–` repeats (every 80ms after 400ms), plus quick chips under the stepper: "+2" "+3" (`Chip size="small"` / 36px pills). Soccer has no quick chips.
- `–` disabled at 0; `+` disabled at `MAX_TEAM_SCORE[sport]`.
- Accessibility: web `aria-label` "הפחתת נקודה ל{side}" / "הוספת נקודה ל{side}" (soccer: "שער" instead of "נקודה"); value has `aria-live="polite"`. Mobile `accessibilityLabel` same, `accessibilityRole="button"`, and the value `View` uses `accessibilityRole="adjustable"` with `accessibilityActions` increment/decrement so VoiceOver swipe works.
- Live outcome preview under the two tiles: caption "ניצחון להכחולים" / "תיקו" with the outcome chip tokens. Updates as values change.

### 3.3 Section A - tennis sets

```
                       הכחולים(A)  האדומים(B)
 מערכה 1               [  6  ]     [  4  ]       ✕
 מערכה 2               [  3  ]     [  6  ]       ✕
 מערכה 3 · שובר שוויון  [ 10  ]     [  7  ]       ✕
 [+ הוספת מערכה]
 מנצח: הכחולים (2–1 במערכות)
```

- Column headers are the two side labels (with swatch), A column at start. Rows: label caption at start, two numeric inputs (mobile `h-12 w-16 rounded-xl text-center text-[20px] font-bold`, web `TextField size="small"` 64px wide, `inputMode="numeric"`), remove `IconButton` at end (hidden on row 1).
- "הוספת מערכה" outlined pill, disabled at best-of limit (3; 5 is not exposed in v1). The 3rd row label adds " · שובר שוויון" when the entered score is a match tiebreak (e.g. 10-7).
- Inline row error (from `validateTennisSets` codes), caption `error.main` / `text-red-600`: `INVALID_SET_SCORE` "תוצאת מערכה לא תקינה (לדוגמה 6–4, 7–5, 7–6)"; `MATCH_INCOMPLETE` "המשחק עוד לא הוכרע, הוסיפו מערכה"; `SETS_AFTER_MATCH_END` "המשחק הוכרע כבר במערכה הקודמת".
- Derived winner line under the rows, outcome chip tokens.

### 3.4 Section B - players and stats

Header: "שחקנים וסטטיסטיקות" + caption "לא חובה. מלאו רק מה שזוכרים." / "Optional. Fill in what you remember."

Grouped by side (A first, then B, then "ללא שיבוץ"). Group header: swatch + label + count, sticky inside the scroll on mobile.

Collapsed player row (min-height 56, one row per confirmed player):

```
┌──────────────────────────────────────────────┐
│ ◯  דני כהן                [ ⚽ – 2 + ]   ⌄   │
│    [הכחולים | האדומים]                        │  side segment (only if not team-derived)
└──────────────────────────────────────────────┘
```

- Avatar 40 at start, name 2-line clamp, `minWidth: 0`.
- **Quick stat**: the sport's first summary key (`goals` soccer, `points` basketball, `aces` tennis) has an inline compact stepper (buttons 44x44 mobile, 36x36 web) so the most common entry is one tap without expanding. Basketball quick stepper adds the "+2/+3" long-press behaviour.
- Expand chevron at end (44x44). Only **one row expanded at a time** (accordion) to keep thumb travel short.
- Side assignment: a 2-option segmented control (web `ToggleButtonGroup size="small" exclusive`, mobile two 40px pills) under the name, shown when the player is not on a game team, or always for ad-hoc sides. Selected segment fill = the side's swatch colour as a 3px bottom border plus `action.selected` background (not the team colour as fill, contrast).
- A summary line of entered non-quick stats appears under the name when collapsed ("1 בישולים · כרטיס צהוב: 1").

Expanded row: a grid of mini steppers for the remaining keys in `STAT_DEFS` order.

- Grid: 2 columns on phone (each column 156px: label caption over `[–] n [+]` with 44px buttons), 3 columns on web desktop.
- Binary keys (`cleanSheet`, `mvp`) are toggle chips instead of steppers, full row: "רשת נקייה", "⭐ שחקן המשחק". Selecting MVP for one player un-selects it on others (visual only; if the API allows several, drop this, see 12.5).
- `+` disabled at the key's `max` (yellow cards 2, red cards 1).
- Cards keys get a tiny colour square (yellow `warning.main`, red `error.main`) before the label; this is an icon, not text colour.

### 3.5 Section C - notes

Multiline field, 3 rows min, label "הערות (לא חובה)" / "Notes (optional)", placeholder "משהו שקרה במשחק ששווה לזכור" / "Anything worth remembering", counter `n/500` at end (cap to confirm, 12.6).

### 3.6 Soft warnings

From `warnings[]` (server) or live via `checkPlayerTotals` (client mirror):

- MUI `Alert severity="warning" variant="standard"` / mobile `bg-amber-50 border border-amber-200 rounded-2xl p-3` with `dark:bg-amber-950 dark:border-amber-900`, text `text-amber-800 dark:text-amber-200`.
- Placement: at the top of the players section **and** as a one-line repeat in the sticky footer above the save button, so it is seen at save time.
- Copy `PLAYER_SUM_EXCEEDS_SCORE`: "סכום ה{label} של שחקני {side} ({sum}) גבוה מהתוצאה ({teamScore}). אפשר לשמור בכל זאת." / "{side} players' {label} ({sum}) is more than the team score ({teamScore}). You can still save."
- Never blocks saving; the save button keeps its normal style.

### 3.7 Footer, save, delete

- Sticky footer: primary "שמירת תוצאה" / "Save result" full width on phone (52px mobile, `size="large"` web). Under it caption "אפשר לערוך עד {date}" / "Editable until {date}" (from `lockedAt`, or "7 ימים מהשמירה" before the first save).
- Delete lives **at the bottom of the scroll content**, not in the sticky bar: text button `color="error"` "מחיקת התוצאה" / "Delete result", only when a result exists. Confirm dialog: title "למחוק את התוצאה?" / "Delete this result?", body "התוצאה והסטטיסטיקות של כל השחקנים במשחק יימחקו. אי אפשר לשחזר." / "The score and every player's stats for this game will be removed. This can't be undone.", buttons "ביטול" / "מחיקה" (error, contained). Mobile: `Alert.alert` with a `destructive` button (existing block pattern).
- Close with unsaved changes: confirm "לצאת בלי לשמור?" / "Leave without saving?", buttons "המשך עריכה" / "יציאה".

### 3.8 States

| State | Treatment |
| --- | --- |
| Loading roster | Score tiles render immediately; players section shows 4 row skeletons. |
| Empty roster (no confirmed players) | Players section replaced by caption "אין שחקנים מאושרים במשחק הזה. אפשר לשמור רק את התוצאה." |
| Saving | Button spinner + "שומר…" / "Saving…", all inputs `disabled`, dialog/modal not dismissable, no backdrop close. |
| Saved | Close the editor, Snackbar "התוצאה נשמרה" / "Result saved" (mobile `Alert.alert('', ...)` like ratings). |
| Validation error (400) | Top-of-content `Alert severity="error"` "לא הצלחנו לשמור. בדקו את השדות המסומנים." / "Couldn't save. Check the highlighted fields."; scroll to first field error; field-level captions. |
| Locked (403 `RESULT_LOCKED`) or opened when `locked && !isAdmin` | Editor does not open; read view shows the lock chip. If it races (locks while open): full-width info alert replacing the footer "העריכה נסגרה. עברו 7 ימים מאז שהתוצאה הוזנה." / "Editing closed. It's been 7 days since the result was added." with a close button. |
| Admin editing a locked result | Info alert at top "עריכה כמנהל מערכת. התוצאה נעולה למנהלי המשחק." / "Admin edit. Locked for game managers." |
| Another manager saved meanwhile | If the save response `editedAt`/`recordedBy` shows another editor (when available), info Snackbar "מנהל אחר עדכן את התוצאה. מוצגת הגרסה האחרונה." |
| Offline / network | Error alert "אין חיבור לאינטרנט. מה שהזנתם נשמר כאן, נסו שוב." / "You're offline. Your entries are kept here, try again." with "נסו שוב"; values stay. |
| Long names | 2-line clamp; side segment labels 1-line ellipsis at 120px. |

### 3.9 Testids (new)

`result-editor`, `result-editor-close`, `result-editor-side-label-{order}`, `result-editor-score-{order}`, `result-editor-score-inc-{order}`, `result-editor-score-dec-{order}`, `result-editor-set-row-{i}`, `result-editor-set-{i}-{order}`, `result-editor-set-add`, `result-editor-set-remove-{i}`, `result-editor-player-{userId}`, `result-editor-player-side-{userId}-{order}`, `result-editor-stat-{userId}-{key}`, `result-editor-stat-inc-{userId}-{key}`, `result-editor-stat-dec-{userId}-{key}`, `result-editor-notes`, `result-editor-warning`, `result-editor-save`, `result-editor-delete`, `result-editor-locked`.

---

## 4. Screen 3 - Result badge on match-history cards

Component: `MatchResultBadge`. Props: `result` (`{ outcome, score, myStats }`), `sport`, `compact` (phone).

Placement: inside the existing history row (web `UserProfileSections.tsx`, mobile `user/[id].tsx`), as the **last child of the row** (end edge, left in RTL), after the title/meta block. The existing row stays as is (icon, title, meta, link).

```
RTL view
┌──────────────────────────────────────────────────┐
│ [נ 3–2]                  ערב כדורגל בפארק   ⚽   │
│ 2 שערים               ⚽ כדורגל · 12/10 · 20:00   │
└──────────────────────────────────────────────────┘
```

- Pill: height 28, padding-inline 10, radius full, outcome tokens (1.2). Content (flex row, rule 1.1): letter (Hebrew `נ` / `ת` / `ה`, English `W` / `D` / `L`) bold, 6px gap, my score, en dash, other score. Tabular, 13px 700.
- Under the pill (aligned to the pill's centre): up to 2 non-zero `myStats` in summary order, caption `text.secondary`, 1 line, ellipsis. Phone (≤ 400px) shows 1 stat; MVP shows as "⭐" only.
- Badge column `flexShrink: 0`, max width 112 (phone 96); the title block keeps `minWidth: 0` so it truncates first.
- `outcome: null` (player had stats but no side): pill in LOSS/neutral tokens with score only, no letter.
- `score: null`: pill hidden, stats line only.
- **Hidden / no result: render nothing**, no placeholder, row unchanged.
- Accessibility: pill + stats get one label: "ניצחון 3–2, 2 שערים" / "Win 3–2, 2 goals"; the row's link label stays the title.
- Testid: `history-result-badge-{gameId}`.

Loading/error: inherits the history list's own states (badge is part of the payload, no separate fetch).

---

## 5. Screen 4 - Profile stats section

Component: `ProfileStatsCard` (web), `ProfileStatsCard` (mobile). Props: `state`, `visible`, `isOwner`, `ownerHidden` (see 12.1), `sports[]`, `selectedSport`, `onSelectSport`, `onRetry`, `settingsHref`.

### 5.1 Placement

- Web: inside `UserProfileSections`, **between friends and match history**, preceded by the same `Divider`. Section title in the existing `h6 bold` style.
- Mobile: its own card (shell from section 0) between the friends card and the match-history card.
- Optional hero strip (`statsSummary`): one caption line under `UserProfileRating` / the mobile rating row: "{games} משחקים · {wins} נ · {draws} ת · {losses} ה" with the letters in outcome tokens as tiny pills. Hidden when `statsSummary` is absent. Testid `profile-stats-summary`.

### 5.2 Layout

```
Desktop (web profile card is maxWidth="sm", ~552px content)
┌─────────────────────────────────────────────────┐
│ 📈 סטטיסטיקות                 לפי מנהלי המשחקים │
│ [⚽ כדורגל] [🏀 כדורסל]                          │  sport segments
│ ┌────────┬────────┬────────┬────────┐           │
│ │  12    │   7    │   2    │   3    │           │  tiles: משחקים | נ | ת | ה
│ │ משחקים │ ניצחונות│  תיקו  │ הפסדים │           │
│ └────────┴────────┴────────┴────────┘           │
│ ████████████████░░░░░▒▒▒▒▒▒   58% ניצחונות      │  W/D/L bar
│ ┌───────────────┐ ┌───────────────┐             │
│ │ 9  שערים       │ │ 4  בישולים     │             │  stat tiles 2-col
│ │ 0.8 למשחק      │ │ 0.3 למשחק      │             │
│ └───────────────┘ └───────────────┘             │
│ [הצגת כל הסטטיסטיקות]                           │
└─────────────────────────────────────────────────┘
```

- Header: title "סטטיסטיקות" (owner: "הסטטיסטיקות שלי") + caption at end "לפי מנהלי המשחקים" / "As reported by game managers" with the info icon; tooltip/tap: "התוצאות מוזנות על ידי מנהלי המשחקים ולא נבדקות." / "Results are entered by game managers and aren't verified."
- Sport segments: only sports with `games > 0`, ordered by games desc; hidden when there is exactly one sport (the header shows its emoji instead). Selected pill: fill `base`, text `ink`; unselected: neutral chip. Horizontal scroll allowed on phone. Each pill shows `{emoji} {label} · {games}`.
- Tiles row: 4 equal tiles (also at 360: 4 x 76px), `action.hover` / `bg-gray-50 dark:bg-cyber-bg`, radius 12, value 22px 800, label caption. W/D/L tile values use the outcome text colour; games tile `text.primary`.
- W/D/L bar: 8px high, radius full, segments in outcome colours (win `success.main` / `bg-brand`, draw `secondary.main` / `bg-indigo-500`, loss `action.disabled` / `bg-gray-300 dark:bg-cyber-border`), label at end "58% ניצחונות" / "58% wins". Hidden if `wins + draws + losses === 0` (players without sides). `role="img"` with `aria-label` "7 ניצחונות, 2 תיקו, 3 הפסדים".
- Stat tiles: 2-col grid, summary keys first then the rest in `STAT_DEFS` order, only keys with total > 0. Tile: `tint` bg + `deep` value (dark: section 1.2 rule) for the sport accent, value 22px, label caption, per-game line caption "0.8 למשחק". Binary keys show as count: "3 פעמים שחקן המשחק" / "MVP ×3"; "רשת נקייה" same pattern.
- Show 4 tiles, then "הצגת כל הסטטיסטיקות" / "Show all stats" expands in place.

### 5.3 States

| State | Viewer | Owner |
| --- | --- | --- |
| Loading | Skeleton: title, 4 tile skeletons, 2 stat tile skeletons. | Same. |
| `visible: true`, `sports: []` | Card with caption "עוד אין תוצאות להצגה" / "No results yet" (no tiles). | Empty state: sport emoji row "⚽🏀🎾" at 32px, title "עוד אין תוצאות", body "כשמנהל משחק יזין תוצאה למשחק ששיחקתם בו, הסטטיסטיקות יופיעו כאן." / "When a game manager adds a result for a game you played, your stats show up here." |
| `visible: false` (`USER_HIDDEN` or `PRIVATE`, minors included) | **Render nothing.** Same as other hidden sections (groups, friends): no "hidden" placeholder, so the viewer cannot tell a hidden profile from one with no stats, and a minor's profile looks like any private profile. | n/a (owner is always visible). |
| Owner with `hideMatchStats` on | n/a | Normal card plus a banner at the top: `VisibilityOffRounded` + "מוסתר מאחרים, רק לך זה מוצג" / "Hidden from others. Only you can see this." + text link "שינוי בהגדרות" / "Change in settings" to the privacy settings. Banner tokens: `bgcolor: action.hover`, radius 12, caption. Testid `profile-stats-hidden-owner`. |
| Error / offline | Title + "לא הצלחנו לטעון את הסטטיסטיקות" / "Couldn't load stats" + "נסו שוב". | Same. |

Testids: `profile-stats`, `profile-stats-sport-{SPORT}`, `profile-stats-tile-{games|wins|draws|losses}`, `profile-stats-stat-{key}`, `profile-stats-empty`, `profile-stats-hidden-owner`, `profile-stats-error`, `profile-stats-show-all`.

---

## 6. Screen 5 - Settings toggle "Hide my match stats"

Web `app/profile/settings/page.tsx`, directly under the existing "הסתר את הקבוצות שלי בפרופיל" switch; mobile `app/profile/settings.tsx`, a new row card directly under the `hideGroups` row. Saved with the existing "שמירה" button like `hideGroups` (not instant), so behaviour matches its neighbour.

- Web: `FormControlLabel` + `Switch`, label "הסתר את הסטטיסטיקות שלי מאחרים", then a `Typography variant="caption" color="text.secondary"` helper directly under it, indented to align with the label text (`ps: 6.5` to clear the switch in RTL; check visually in D1):
  "התוצאות והסטטיסטיקות שלך לא יוצגו לאחרים בפרופיל ובעמודי המשחקים. עדיין אפשר לראות אותן בעצמך."
  Switch `inputProps={{ "aria-describedby": "hide-match-stats-help" }}`, helper `id="hide-match-stats-help"`.
- Mobile row: same card as `hideGroups` (`flex-row items-center justify-between bg-white dark:bg-cyber-card rounded-2xl border border-gray-100 dark:border-cyber-border px-4 py-3`), but the text side is a column: label `font-bold text-gray-800 dark:text-cyber-text`, helper `text-xs text-gray-500 dark:text-cyber-muted mt-1`. `Switch` gets `accessibilityLabel` = label and `accessibilityHint` = helper.
- English: label "Hide my match stats from others", helper "Your results and stats won't be shown to others on your profile or game pages. You can still see them."
- Testid: `settings-hide-match-stats`.
- Note in copy: team scores of a game are still visible to anyone who can see the game; the helper deliberately says "התוצאות והסטטיסטיקות **שלך**", which is accurate.

---

## 7. Screen 6 - Report a player dialog

Component: `ReportUserDialog`. Visual twin of `ReportMessageDialog`. Props: `open`, `isRTL`, `target: { name, imageUrl }`, `mode: 'user' | 'dispute'`, `state: 'idle' | 'submitting' | 'success' | 'error'`, `errorKind`, `onClose`, `onSubmit(reason, details?)`.

### 7.1 Layout

Web: `Dialog fullWidth maxWidth="xs"`, `sx={{ zIndex: 2102 }}`, `dir` from `isRTL`, as the message dialog.

```
┌──────────────────────────────┐
│ דיווח על שחקן                 │  DialogTitle
│ ◯ דני כהן                     │  target row (replaces messagePreview), action.hover bg
│ מה קרה?                       │  subtitle2
│ ○ הטרדה או בריונות            │
│ ○ אלימות או איומים            │
│ ○ רמאות במשחק                 │
│ ○ לא הגיע למשחק               │
│ ○ פרופיל מזויף                │
│ ○ תוכן לא הולם                │
│ ○ אחר                         │
│ [פרטים נוספים (לא חובה)     ] │  multiline, minRows 3
│                      0/1000  │
│ הדיווח נשלח לצוות JoinUp...   │  caption
│              [ביטול] [שליחה] │
└──────────────────────────────┘
```

- Target row: avatar 32 + name 1-line ellipsis, `bgcolor: action.hover`, radius 8, padding 8 (same tokens as the message preview box).
- Radio list: default selection **none** (unlike the message dialog's default) so a reason is a deliberate choice; submit disabled until one is picked. Rows min-height 44 (`FormControlLabel` with `sx={{ minHeight: 44 }}`).
- Details: `maxLength 1000`, counter at end in caption, turns `error.main` at 1000.
- Caption: "הדיווח נשלח לצוות JoinUp ונבדק ידנית. השחקן לא יידע מי דיווח." / "Your report goes to the JoinUp team for review. The player won't know who reported."
- Actions: "ביטול" / "Cancel" (text) and "שליחת דיווח" / "Send report" (`color="error" variant="contained"`), spinner while submitting.

Mobile: bottom sheet (`Modal transparent animationType="slide"`, backdrop `bg-black/40`, sheet `bg-white dark:bg-cyber-card rounded-t-3xl px-5 pt-3 pb-[safe-area+16]`, grab handle `w-10 h-1 rounded-full bg-gray-300 self-center mb-3`). Max height 90%, content in `ScrollView`, `KeyboardAvoidingView` for the details field. Radio rows 48px with a 20px ring indicator (`border-2 border-gray-300` / selected `border-brand` with inner dot `bg-brand`). Buttons at the bottom side by side: cancel neutral `h-[52px] rounded-2xl bg-gray-100 dark:bg-cyber-border`, send `bg-red-600` with white bold text.

### 7.2 Reasons and copy

| Value | Hebrew | English |
| --- | --- | --- |
| `HARASSMENT` | הטרדה או בריונות | Harassment or bullying |
| `VIOLENCE` | אלימות או איומים | Violence or threats |
| `CHEATING` | רמאות במשחק | Cheating |
| `NO_SHOW` | לא הגיע למשחק | Didn't show up |
| `FAKE_PROFILE` | פרופיל מזויף | Fake profile |
| `INAPPROPRIATE_CONTENT` | תוכן לא הולם | Inappropriate content |
| `OTHER` | אחר | Other |

(`RESULT_DISPUTE` is never in this list; it is section 8.)

### 7.3 Success, the same for every outcome

The API always returns `201 { ok: true }`; the UI must not branch on anything else, so the success view is identical whether the target blocked the reporter, the report was a duplicate, or anything else.

- Replace the dialog body in place (no second dialog): check icon 48px in a `alpha(success.main, 0.12)` circle, title "תודה, קיבלנו את הדיווח" / "Thanks, we got your report", body "הצוות שלנו יבדוק אותו. אם מישהו גורם לך לאי נוחות, אפשר גם לחסום אותו מהפרופיל." / "Our team will review it. If someone makes you uncomfortable, you can also block them from their profile." Single button "סגירה" / "Close".
- No mention of the target's status, block state, or "already reported".

### 7.4 Errors

- Network / 5xx: inline `Alert severity="error"` above actions "לא הצלחנו לשלוח את הדיווח. נסו שוב." / "Couldn't send the report. Try again." Inputs keep their values.
- 429: "שלחתם הרבה דיווחים לאחרונה. נסו שוב מאוחר יותר." / "You've sent a lot of reports recently. Try again later." (reveals nothing about the target).
- Offline: "אין חיבור לאינטרנט" / "You're offline".

### 7.5 Entry points

1. **Profile.** There is no overflow menu today on either platform; adding one would move the existing block button. Decision: add a sibling action **next to "חסום משתמש"**, same size and style but neutral colour: web `Button size="small" color="inherit" startIcon={<OutlinedFlagRounded fontSize="small" />}` "דיווח על שחקן"; mobile `TouchableOpacity flex-row items-center py-2` with `flag-outline` 14px `text-gray-600 dark:text-cyber-muted` + `font-semibold` label "דיווח" / "Report". Hidden on own profile. Shown also when blocked (reporting a blocked user is allowed). If an overflow menu is introduced later, both actions move into it together.
2. **Ratings panel.** In each teammate row of `GameRatingsPanel` (web + mobile), a trailing icon button at the end edge: web `IconButton size="small"` 40x40, `color: text.disabled` (hover `text.secondary`), `aria-label="דיווח על {name}"`; mobile 44x44 hit area (`hitSlop` if the icon is 18), `flag-outline` 18 `text-gray-400`, `accessibilityLabel` "דיווח על {name}" / "Report {name}". It sits after the star row and does not shift the stars. Do not touch the existing rating behaviour or the row's layout otherwise.

Testids: `report-user-open` (profile), `ratings-report-{userId}`, `report-user-dialog`, `report-user-reason-{REASON}`, `report-user-details`, `report-user-submit`, `report-user-cancel`, `report-user-success`, `report-user-error`. Do **not** reuse `report-submit` (owned by `ReportMessageDialog`, used by existing tests).

---

## 8. Screen 7 - Result dispute

- Trigger: text link in the read view footer (section 2.2), shown to confirmed participants who cannot edit (`viewerCanDispute`, see 12.3). Web `Button size="small" variant="text" color="inherit" startIcon={<OutlinedFlagRounded />}` with `color: text.secondary`; mobile `TouchableOpacity` min-height 44 with `flag-outline` 14 + `text-[13px] text-gray-500 dark:text-cyber-muted font-semibold`. Copy "התוצאה לא נכונה?" / "Result looks wrong?".
- Opens `ReportUserDialog` with `mode="dispute"`:
  - Title "דיווח על תוצאה שגויה" / "Report a wrong result".
  - Target row shows the **game** (sport emoji + game title + date), not the recorder. The recorder is the server-side target, but naming them as "reported" would feel accusatory for an honest typo.
  - No reason list (reason is fixed `RESULT_DISPUTE`).
  - Details label "מה לא נכון?" / "What's wrong?", placeholder "לדוגמה: התוצאה הייתה 4–3 ולא 3–2" / "e.g. it was 4–3, not 3–2". Optional, max 1000.
  - Caption "הצוות שלנו יבדוק את התוצאה מול מנהלי המשחק." / "Our team will check the result with the game managers."
  - Send button primary (not error colour): "שליחה" / "Send".
  - Success: "תודה! נבדוק את התוצאה." / "Thanks! We'll look into it." + "סגירה".
- After success the link changes to a disabled caption "דיווחת על התוצאה" / "You reported this result" for the session (local state only).
- Testids: `game-result-dispute`, then the dialog testids from section 7 with `mode` not affecting them, plus `report-user-dialog` gets `data-mode="dispute"` on web.

---

## 9. Screen 8 - Admin: player reports queue

### 9.1 Web

- New admin tab in `next_app/src/app/admin/layout.tsx` `ADMIN_TABS`: `{ href: "/admin/moderation/player-reports", label: "דיווחים על שחקנים" }` (route-based tabs, exact pathname match, so a sub-route works). Component `AdminUserReports.tsx` rendered by that page. Layout file edit is one line; mention to the F1-11 implementer.
- Page header: `Typography variant="h5" fontWeight={800}` "דיווחים על שחקנים" (same as the other moderation headers).
- Status filter under the header: `ToggleButtonGroup size="small" exclusive` "פתוחים" / "טופלו" / "נדחו" (default פתוחים), counts in parentheses when the API returns them.
- List: one `Card` per report (same as the flagged-message cards):

```
┌───────────────────────────────────────────────────────────┐
│ [פתוח] [הטרדה או בריונות]                    לפני 3 שעות   │  chips + relative time
│ דווח על ידי: רון לוי    על: דני כהן                        │  UserLink x2 (target bold)
│ משחק: ערב כדורגל בפארק · 12/10  ↗                          │  context link (if gameId)
│ "קילל אותי אחרי המשחק ודחף..."                             │  details, pre-wrap, 4-line clamp
│ [טופל]  [דחייה]  [טיפול + השעיה]                           │  actions (OPEN only)
└───────────────────────────────────────────────────────────┘
```

- Chips: status (`Chip size="small"`: OPEN default, RESOLVED `success`, DISMISSED default outlined), reason `color="warning"` (`RESULT_DISPUTE` uses `color="info"` and label "ערעור על תוצאה").
- People: reuse the page's `UserLink` with the labels "דווח על ידי:" (existing phrasing) and "על:"; target name `fontWeight 700`. Stack `direction={{ xs: "column", sm: "row" }}` like the existing card.
- Details: `whiteSpace: pre-wrap`, 4-line clamp with "הצגת הכל" toggle.
- Actions (OPEN only), `Button size="small"` row like existing: "טופל" (default) → small dialog with optional "הערה פנימית" field and confirm "סימון כטופל"; "דחייה" (default) → immediate with Snackbar "הדיווח נדחה" + no confirm; "טיפול + השעיה" (`color="error"`) → confirm dialog title "להשעות את {name}?", body "המשתמש לא יוכל להתחבר ל-JoinUp. הדיווח יסומן כטופל.", optional internal note, buttons "ביטול" / "השעיה" (error contained). Use a real MUI `Dialog`, not `window.confirm` (existing code uses `confirm()`; new code should not add more).
- Resolved/dismissed cards: no actions; a caption "טופל ע״י {admin} · {date}" + resolution text.
- States: loading `LoadingMotif id="brand-pulse" label="טוען…"` (existing); empty `Alert severity="success"` "אין דיווחים פתוחים." / for other filters "אין דיווחים בסטטוס הזה."; error `Alert severity="error"` + retry; acting row buttons `disabled` (existing `actingId` pattern).

### 9.2 Mobile

`app/admin/moderation.tsx` is a single scroll with sections, no tabs. Add a section **at the top** "דיווחים על שחקנים" (`text-lg font-bold text-gray-800 dark:text-cyber-text`), with a 3-pill status filter (40px pills, selected `bg-brand` + white text, others neutral). Report card: `bg-white dark:bg-cyber-card rounded-2xl p-4 border border-gray-100 dark:border-cyber-border mb-3`; reason chip `bg-orange-100 rounded-full px-2 py-0.5` + `text-orange-800 text-xs font-bold` (existing flag chip tokens) with `dark:bg-orange-950 dark:text-orange-200`. Actions as 44px-high text buttons (larger than the existing 12px text links, which are under the touch-target minimum). Ban confirm through `Alert.alert` with a `destructive` button. Hebrew only (admin screen is not localized today).

Testids: `admin-user-reports`, `admin-user-reports-filter-{OPEN|RESOLVED|DISMISSED}`, `admin-user-report-{id}`, `admin-user-report-resolve-{id}`, `admin-user-report-dismiss-{id}`, `admin-user-report-ban-{id}`, `admin-user-report-ban-confirm`.

---

## 10. Testids and aria to keep

Existing, must not change or move: `profile-sections`, `profile-name`, `profile-email`, `profile-age` (web profile); `report-submit` (`ReportMessageDialog`); `game-friends-only` (web game page); `game-join-button`, `game-open-chat` (mobile game screen). Existing `aria`/accessibility on `GameRatingsPanel` stars and the block button stay as they are; the new report icon is added beside, not wrapped around, them.

New testids are listed per section (2.6, 3.9, 4, 5.3, 6, 7.5, 8, 9). Same string on web (`data-testid`) and mobile (`testID`) so the Playwright and Maestro flows in F1-17 share selectors.

---

## 11. Mobile i18n keys

New namespaces in `src/i18n/locales/he.json` and `en.json` (web uses the Hebrew strings inline).

```json
"results": {
  "title":            { "he": "תוצאת המשחק",                    "en": "Game result" },
  "edit":             { "he": "עריכה",                           "en": "Edit" },
  "locked":           { "he": "נעול",                            "en": "Locked" },
  "lockedHint":       { "he": "אפשר לערוך תוצאה עד 7 ימים אחרי שהוזנה. לתיקון פנו לתמיכה.", "en": "Results can be edited for 7 days after they're added. Contact support for fixes." },
  "win":              { "he": "ניצחון",                          "en": "Win" },
  "draw":             { "he": "תיקו",                            "en": "Draw" },
  "loss":             { "he": "הפסד",                            "en": "Loss" },
  "letterWin":        { "he": "נ",                               "en": "W" },
  "letterDraw":       { "he": "ת",                               "en": "D" },
  "letterLoss":       { "he": "ה",                               "en": "L" },
  "wonBy":            { "he": "ניצחון ל{{side}}",                "en": "{{side}} won" },
  "a11yScore":        { "he": "{{a}} {{aScore}}, {{b}} {{bScore}}", "en": "{{a}} {{aScore}}, {{b}} {{bScore}}" },
  "set":              { "he": "מע׳ {{n}}",                       "en": "Set {{n}}" },
  "setLong":          { "he": "מערכה {{n}}",                     "en": "Set {{n}}" },
  "matchTiebreak":    { "he": "שובר שוויון",                     "en": "Match tiebreak" },
  "unassigned":       { "he": "ללא שיבוץ",                       "en": "Unassigned" },
  "showAllPlayers":   { "he": "הצגת כל השחקנים ({{count}})",     "en": "Show all players ({{count}})" },
  "recordedBy":       { "he": "נרשם ע״י {{name}}",               "en": "Recorded by {{name}}" },
  "selfReported":     { "he": "דיווח עצמי של מנהלי המשחק",       "en": "Self-reported by game managers" },
  "updatedAt":        { "he": "עודכן {{date}}",                  "en": "Updated {{date}}" },
  "loadFailed":       { "he": "לא הצלחנו לטעון את התוצאה",       "en": "Couldn't load the result" },
  "ctaTitle":         { "he": "המשחק הסתיים, איך נגמר?",         "en": "Game over. How did it end?" },
  "ctaBody":          { "he": "הזינו תוצאה וסטטיסטיקות לשחקנים. אפשר לערוך עד 7 ימים.", "en": "Add the score and player stats. You can edit for 7 days." },
  "ctaButton":        { "he": "הזנת תוצאה",                      "en": "Add result" },
  "dispute":          { "he": "התוצאה לא נכונה?",                "en": "Result looks wrong?" },
  "disputed":         { "he": "דיווחת על התוצאה",                "en": "You reported this result" }
},
"resultEditor": {
  "title":            { "he": "תוצאת המשחק",                     "en": "Game result" },
  "sideName":         { "he": "שם הצד",                          "en": "Side name" },
  "incPoint":         { "he": "הוספת נקודה ל{{side}}",           "en": "Add a point for {{side}}" },
  "decPoint":         { "he": "הפחתת נקודה ל{{side}}",           "en": "Remove a point from {{side}}" },
  "incGoal":          { "he": "הוספת שער ל{{side}}",             "en": "Add a goal for {{side}}" },
  "decGoal":          { "he": "הפחתת שער ל{{side}}",             "en": "Remove a goal from {{side}}" },
  "addSet":           { "he": "הוספת מערכה",                     "en": "Add set" },
  "removeSet":        { "he": "הסרת מערכה {{n}}",                "en": "Remove set {{n}}" },
  "winnerLine":       { "he": "מנצח: {{side}} ({{a}}–{{b}} במערכות)", "en": "Winner: {{side}} ({{a}}–{{b}} sets)" },
  "errSetScore":      { "he": "תוצאת מערכה לא תקינה (לדוגמה 6–4, 7–5, 7–6)", "en": "Invalid set score (e.g. 6–4, 7–5, 7–6)" },
  "errIncomplete":    { "he": "המשחק עוד לא הוכרע, הוסיפו מערכה", "en": "No winner yet, add a set" },
  "errAfterEnd":      { "he": "המשחק הוכרע כבר במערכה הקודמת",   "en": "The match was already decided in the previous set" },
  "playersTitle":     { "he": "שחקנים וסטטיסטיקות",              "en": "Players and stats" },
  "playersHint":      { "he": "לא חובה. מלאו רק מה שזוכרים.",    "en": "Optional. Fill in what you remember." },
  "noPlayers":        { "he": "אין שחקנים מאושרים במשחק הזה. אפשר לשמור רק את התוצאה.", "en": "No confirmed players in this game. You can save just the score." },
  "notes":            { "he": "הערות (לא חובה)",                 "en": "Notes (optional)" },
  "notesPlaceholder": { "he": "משהו שקרה במשחק ששווה לזכור",     "en": "Anything worth remembering" },
  "warnSum":          { "he": "סכום ה{{label}} של שחקני {{side}} ({{sum}}) גבוה מהתוצאה ({{teamScore}}). אפשר לשמור בכל זאת.", "en": "{{side}} players' {{label}} ({{sum}}) is more than the team score ({{teamScore}}). You can still save." },
  "save":             { "he": "שמירת תוצאה",                     "en": "Save result" },
  "saving":           { "he": "שומר…",                           "en": "Saving…" },
  "saved":            { "he": "התוצאה נשמרה",                    "en": "Result saved" },
  "editableUntil":    { "he": "אפשר לערוך עד {{date}}",          "en": "Editable until {{date}}" },
  "editableFor7":     { "he": "אפשר לערוך 7 ימים מהשמירה",       "en": "Editable for 7 days after saving" },
  "saveFailed":       { "he": "לא הצלחנו לשמור. בדקו את השדות המסומנים.", "en": "Couldn't save. Check the highlighted fields." },
  "offline":          { "he": "אין חיבור לאינטרנט. מה שהזנתם נשמר כאן, נסו שוב.", "en": "You're offline. Your entries are kept here, try again." },
  "lockedNow":        { "he": "העריכה נסגרה. עברו 7 ימים מאז שהתוצאה הוזנה.", "en": "Editing closed. It's been 7 days since the result was added." },
  "adminEdit":        { "he": "עריכה כמנהל מערכת. התוצאה נעולה למנהלי המשחק.", "en": "Admin edit. Locked for game managers." },
  "otherEditor":      { "he": "מנהל אחר עדכן את התוצאה. מוצגת הגרסה האחרונה.", "en": "Another manager updated the result. Showing the latest version." },
  "delete":           { "he": "מחיקת התוצאה",                    "en": "Delete result" },
  "deleteTitle":      { "he": "למחוק את התוצאה?",                "en": "Delete this result?" },
  "deleteBody":       { "he": "התוצאה והסטטיסטיקות של כל השחקנים במשחק יימחקו. אי אפשר לשחזר.", "en": "The score and every player's stats for this game will be removed. This can't be undone." },
  "deleteConfirm":    { "he": "מחיקה",                           "en": "Delete" },
  "leaveTitle":       { "he": "לצאת בלי לשמור?",                 "en": "Leave without saving?" },
  "keepEditing":      { "he": "המשך עריכה",                      "en": "Keep editing" },
  "leave":            { "he": "יציאה",                           "en": "Leave" }
},
"stats": {
  "title":            { "he": "סטטיסטיקות",                      "en": "Stats" },
  "titleOwner":       { "he": "הסטטיסטיקות שלי",                 "en": "My stats" },
  "source":           { "he": "לפי מנהלי המשחקים",               "en": "As reported by game managers" },
  "sourceHint":       { "he": "התוצאות מוזנות על ידי מנהלי המשחקים ולא נבדקות.", "en": "Results are entered by game managers and aren't verified." },
  "games":            { "he": "משחקים",                          "en": "Games" },
  "wins":             { "he": "ניצחונות",                        "en": "Wins" },
  "draws":            { "he": "תיקו",                            "en": "Draws" },
  "losses":           { "he": "הפסדים",                          "en": "Losses" },
  "winRate":          { "he": "{{pct}}% ניצחונות",               "en": "{{pct}}% wins" },
  "perGame":          { "he": "{{value}} למשחק",                 "en": "{{value}} per game" },
  "showAll":          { "he": "הצגת כל הסטטיסטיקות",             "en": "Show all stats" },
  "emptyViewer":      { "he": "עוד אין תוצאות להצגה",            "en": "No results yet" },
  "emptyOwnerTitle":  { "he": "עוד אין תוצאות",                  "en": "No results yet" },
  "emptyOwnerBody":   { "he": "כשמנהל משחק יזין תוצאה למשחק ששיחקתם בו, הסטטיסטיקות יופיעו כאן.", "en": "When a game manager adds a result for a game you played, your stats show up here." },
  "hiddenOwner":      { "he": "מוסתר מאחרים, רק לך זה מוצג",     "en": "Hidden from others. Only you can see this." },
  "changeInSettings": { "he": "שינוי בהגדרות",                   "en": "Change in settings" },
  "loadFailed":       { "he": "לא הצלחנו לטעון את הסטטיסטיקות",  "en": "Couldn't load stats" },
  "summaryLine":      { "he": "{{games}} משחקים",                "en": "{{games}} games" }
},
"privacy": {
  "hideMatchStats":     { "he": "הסתר את הסטטיסטיקות שלי מאחרים", "en": "Hide my match stats from others" },
  "hideMatchStatsHint": { "he": "התוצאות והסטטיסטיקות שלך לא יוצגו לאחרים בפרופיל ובעמודי המשחקים. עדיין אפשר לראות אותן בעצמך.", "en": "Your results and stats won't be shown to others on your profile or game pages. You can still see them." }
},
"userReport": {
  "title":            { "he": "דיווח על שחקן",                   "en": "Report player" },
  "open":             { "he": "דיווח",                           "en": "Report" },
  "openA11y":         { "he": "דיווח על {{name}}",               "en": "Report {{name}}" },
  "question":         { "he": "מה קרה?",                         "en": "What happened?" },
  "reasons": {
    "HARASSMENT":            { "he": "הטרדה או בריונות", "en": "Harassment or bullying" },
    "VIOLENCE":              { "he": "אלימות או איומים", "en": "Violence or threats" },
    "CHEATING":              { "he": "רמאות במשחק",      "en": "Cheating" },
    "NO_SHOW":               { "he": "לא הגיע למשחק",    "en": "Didn't show up" },
    "FAKE_PROFILE":          { "he": "פרופיל מזויף",     "en": "Fake profile" },
    "INAPPROPRIATE_CONTENT": { "he": "תוכן לא הולם",     "en": "Inappropriate content" },
    "OTHER":                 { "he": "אחר",              "en": "Other" }
  },
  "details":          { "he": "פרטים נוספים (לא חובה)",          "en": "More details (optional)" },
  "privacyNote":      { "he": "הדיווח נשלח לצוות JoinUp ונבדק ידנית. השחקן לא יידע מי דיווח.", "en": "Your report goes to the JoinUp team for review. The player won't know who reported." },
  "cancel":           { "he": "ביטול",                           "en": "Cancel" },
  "submit":           { "he": "שליחת דיווח",                     "en": "Send report" },
  "successTitle":     { "he": "תודה, קיבלנו את הדיווח",          "en": "Thanks, we got your report" },
  "successBody":      { "he": "הצוות שלנו יבדוק אותו. אם מישהו גורם לך לאי נוחות, אפשר גם לחסום אותו מהפרופיל.", "en": "Our team will review it. If someone makes you uncomfortable, you can also block them from their profile." },
  "close":            { "he": "סגירה",                           "en": "Close" },
  "failed":           { "he": "לא הצלחנו לשלוח את הדיווח. נסו שוב.", "en": "Couldn't send the report. Try again." },
  "rateLimited":      { "he": "שלחתם הרבה דיווחים לאחרונה. נסו שוב מאוחר יותר.", "en": "You've sent a lot of reports recently. Try again later." },
  "disputeTitle":     { "he": "דיווח על תוצאה שגויה",            "en": "Report a wrong result" },
  "disputeQuestion":  { "he": "מה לא נכון?",                     "en": "What's wrong?" },
  "disputePlaceholder": { "he": "לדוגמה: התוצאה הייתה 4–3 ולא 3–2", "en": "e.g. it was 4–3, not 3–2" },
  "disputeNote":      { "he": "הצוות שלנו יבדוק את התוצאה מול מנהלי המשחק.", "en": "Our team will check the result with the game managers." },
  "disputeSubmit":    { "he": "שליחה",                           "en": "Send" },
  "disputeSuccess":   { "he": "תודה! נבדוק את התוצאה.",          "en": "Thanks! We'll look into it." }
}
```

The `{ he, en }` pairs above are shorthand: split them into the two locale files under the same key path. `privacy.*` adds two keys to the existing `privacy` namespace. Shared copy (`common.retry` "נסו שוב", `common.error`) already exists and is reused. Stat names are never keys here: they come from `shared/matchStats.js`.

---

## 12. Open items and API gaps

These do not block the presentational components (each has a fallback), but someone should decide them before D1.

1. **Owner "hidden" banner has no flag in the stats payload.** `getStatsVisibility` returns `visible: true` for the owner with no reason, so `ProfileStatsCard` cannot know the owner has `hideMatchStats` on. Options: (a) server adds `ownerHidden: true` to `/users/:id/stats` and the profile payload for the owner, or (b) the owner's profile reads `hideMatchStats` from the settings payload it already fetches. Fallback until decided: no banner. Recommend (a), one field.
2. **History badge only appears when the player has stat rows.** `getResultsForGames` starts from `PlayerStatEntry`, so a player on a side with zero stats entered gets no W/D/L badge even though the game has a result. Design assumes a badge whenever the user's side is known. Needs either a "side membership" row or deriving side from `Team` membership. Fallback: no badge (current behaviour).
3. **`viewerCanDispute`** is not in `GET /games/:id/result`. The dispute link needs "viewer is a CONFIRMED participant and `!canEdit`". The game page already knows `viewerParticipationStatus`, so the panel can take it as a prop; no API change strictly needed.
4. **Tennis big score** assumes `side.score` = sets won. Confirm in `gameResultService.normalizeSides` (or the editor computes it from `validateTennisSets().setsWon` before PUT).
5. **MVP uniqueness**: the editor treats MVP as one-per-game (selecting moves it). If the server allows several, drop the auto-unselect.
6. **Notes max length**: spec assumes 500 with a counter; align with the server cap if it differs.
7. **Singular stat labels**: propose adding `heOne`/`enOne` to `STAT_DEFS` (שער, בישול, הצלה, כרטיס צהוב, כרטיס אדום, שער עצמי, נקודה, ריבאונד, אסיסט, חטיפה, חסימה, שלשה, עבירה, אייס, פסילה כפולה, וינר) so "1 שער" reads naturally. Fallback in 1.6 (`{label}: 1`).
8. **Admin list extras** (optional): reporter/target names, game title/date, and "open reports on this target" count in the list response would let the card show context without extra calls. Fallback: ids via the existing `UserLink` fallback, game link by id.
9. **Mobile dark mode gaps**: `user/[id].tsx`, `profile/settings.tsx`, `admin/moderation.tsx` and `GameRatingsPanel` have no `dark:` classes, so new dark-ready components will sit next to light-only neighbours in dark mode. Not in scope for F1; worth a separate pass.
10. **D1 checks on Dev** (visual, need seeded data): Hebrew 2-line clamps at 360px, the tennis grid with doubles labels, swatch ring with the near-black team colour in dark mode, the settings helper indent next to the RTL switch, and the report bottom sheet with the keyboard open on a small Android.
