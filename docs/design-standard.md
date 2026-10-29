# JoinUp design standard (web, PWA, mobile)

The bar every screen is compared against, including side pages, dialogs and sheets. It consolidates what the redesigned screens already do; nothing here is a new design. Deeper per-feature decisions live in `docs/plans/design-spec-D0-feature1.md` (colour, type, spacing, icons, states) and `design-spec-D0-tournaments.md` (status chips, brackets). When a spec and this page disagree, the spec wins; fix this page.

Scope of a consistency fix: colours, spacing, states, direction, copy language. It never changes layout flows, navigation, APIs or schema.

## 1. Where the tokens live

| | Web / PWA (`next_app`) | Mobile (`mobile_app`) |
| --- | --- | --- |
| Palette | MUI theme in `src/components/theme/theme.ts` (light + dark). Primary emerald `#047857` / `#34d399`, secondary indigo | `tailwind.config.js`: `brand-*` and `cyber-*` (dark surfaces) |
| Font | Heebo (theme `typography`) | system font |
| Radius | cards 20, paper 16, dialog 20, inputs 12, buttons/chips fully rounded | cards `rounded-2xl`, inputs `rounded-xl`, pills `rounded-full` |
| Dark mode | theme `mode`; never `bg-card`/Tailwind HSL vars (no dark overrides) | NativeWind `dark:` classes; inline-styled components read `useColorMode()` |
| Language | Hebrew only (`<html lang="he" dir="rtl">`); no English strings in UI | `t('key', 'עברית')` with he + en locale files |

## 2. Mobile class pairs (light / dark)

Every light colour class gets its dark twin in the same string. Text with no colour class renders black, so always set one.

| Role | Light | Dark |
| --- | --- | --- |
| Page background | `bg-gray-50` | `dark:bg-cyber-bg` |
| Card / sheet / header | `bg-white` | `dark:bg-cyber-card` |
| Border | `border-gray-100/200` | `dark:border-cyber-border` |
| Neutral chip, avatar placeholder | `bg-gray-100/200` | `dark:bg-cyber-border` |
| Primary text | `text-gray-900/800/700` | `dark:text-cyber-text` |
| Secondary text | `text-gray-600/500/400` | `dark:text-cyber-muted` |
| Brand text / tint | `text-brand` / `bg-brand-mist` | `dark:text-brand-light` / `dark:bg-brand-ink` |
| Danger / warning | `text-red-600` / `bg-red-50` / `text-amber-700` | `dark:text-red-400` / `dark:bg-red-950` / `dark:text-amber-300` |

Icon tints (`color="#..."`): mid-tones (`#059669`, `#6b7280`, `#9ca3af`) work in both modes. Dark-on-dark tints such as `#374151` do not: read `useColorMode()` and use `#f1f5f9` in dark (see `BackButton`).

Components styled with inline `style` objects have no `dark:` support. Define a `PALETTE = { light, dark }` keyed by `useColorMode().colorMode` (see `map/FieldPreviewCard.tsx`).

## 3. Shared building blocks (use these, do not re-create)

| Need | Mobile | Web |
| --- | --- | --- |
| Back button | `ui/BackButton` (RTL-aware chevron, dark-aware) | `ArrowForward` is "back" in RTL; mirror with `isRTL ? "scaleX(-1)" : "none"` where direction matters (`Chat.tsx`) |
| Page / section header | `ui/SectionHeader` | `ui/PageHeader`, `ui/Section` |
| Loading | `loading/LoadingMotif` | `LoadingMotif` / `Skeleton`; spinners only inside buttons |
| Empty state | tournaments `TabState` pattern | `ui/EmptyState` |
| Confirm / info alerts | `appAlert` (Hebrew/English OK button) or `Alert.alert` with explicit buttons; never bare `Alert.alert(title)` | MUI `Dialog` |
| Dates and times | `utils/dateLocale` (`formatTimeOfDay`, `formatDayMonthTime`, `dateLocaleFor(i18n.language)`) | `he-IL` |
| Status chips | `tournaments/tournamentTokens` | MUI `Chip` per spec §0.3 |

## 4. Checklist per screen

Run it on every surface in light and dark, Hebrew (RTL) and English (mobile), at 360 px.

1. **Colour**: no light-only classes, no hard-coded hex for surfaces/text, no text without a colour class.
2. **i18n**: no literal Hebrew or English in JSX, props, alerts or accessibility labels (mobile: `t('key', 'עברית')`, key present in `he.json` and `en.json`; web: Hebrew only). Fallback defaults are Hebrew.
3. **Dates**: follow the app language, never a hard-coded locale or the device default.
4. **Direction**: chevrons and arrows point with reading direction (back = right in RTL). Use `BackButton`/`I18nManager.isRTL`, not hard-coded `chevron-left`. Web `sx` left/right and margins flip automatically through the stylis RTL plugin; React Native `left/right` flip under forced RTL; prefer `ms-/me-` (mobile) and logical props in new code.
5. **Avatar and text**: 12 px between an avatar and its text (mobile `me-3`/`gap-3`, web `gap: 1.5`); avatar placeholders use the neutral chip colour in dark.
6. **States**: loading, empty, error and long-text (two lines, ellipsis) all handled.
7. **Touch and phone**: targets at least 44 px (mobile) / 40 px (web icon buttons); dialogs on a 360 px phone are full-screen or scroll, with no clipped action buttons; gutter 16 px.
8. **Motion and a11y**: respect reduced motion; icon-only buttons have an accessibility label.

## 5. Quick greps for drift

```bash
# mobile: light-only surfaces (compare with `dark:` count per file)
grep -rnE "bg-white|bg-gray-50|text-gray-[5-9]00" mobile_app/app mobile_app/src --include=*.tsx | grep -v "dark:"
# mobile: Hebrew outside t()
grep -rnP "[\x{0590}-\x{05FF}]" mobile_app/app mobile_app/src --include=*.tsx | grep -vE "t\(|//|\*"
# mobile: hard-coded date locales
grep -rnE "toLocale(Date|Time)?String\(\s*(\[\]|'he-IL'|'en-US')" mobile_app/app mobile_app/src
# web: dialogs without phone handling
grep -rL "fullScreen\|useMediaQuery" $(grep -rl "<Dialog" next_app/src --include=*.tsx)
```

## 6. Screenshots

Scripted, never browsed (`docs/agents/screenshots.md`). Before/after pairs for consistency work: `cd mobile_app && node .maestro/screenshots/run.mjs` flows, or the `consistency-*.yaml` flows, which capture he/en x light/dark per screen.
