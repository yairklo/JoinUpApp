# JoinUp Design Guide (for coding agents)
Hebrew-first, RTL sports pickup app. Web: `next_app` (Next.js + MUI + Tailwind). Mobile: `mobile_app` (Expo + NativeWind).
Current goal: first real user tests. **Refine, don't redesign.**
Principles are inspired by Impeccable (github.com/pbakaus/impeccable, Apache-2.0).

## 1. Refine, not redesign
- Work inside the existing system. Do not add new palettes, fonts, component libraries or layouts unless a task asks for them.
- Make the smallest change that fixes what a tester would notice. One concern per PR.
- If a screen already has a pattern (card, list row, chip), reuse it. Don't fork it.
- Prefer fixing states, copy, contrast and touch targets over visual restyling.

## 2. The existing system (source of truth)
- **Web tokens**: `next_app/src/app/globals.css` (HSL CSS vars) together with the MUI theme in `components/theme/theme.ts`. Tailwind maps them in `tailwind.config.ts` (`primary`, `muted`, `card`, `destructive`, `border`, `ring`).
  - primary = emerald `161 94% 30%`; secondary = indigo `239 84% 67%`; radius `1rem`; `--bottom-nav-height: 64px`.
- **Mobile tokens**: `mobile_app/tailwind.config.js` with `brand.*` (DEFAULT #059669, dark #047857, soft/light/pale/mist) and `cyber.*` for dark surfaces (bg #0b1220, card #111a2c, text #f1f5f9, muted #94a3b8).
- **Dark mode**: `darkMode: 'class'` on both. Every new color needs a dark pair. Use tokens and never raw hex in components.
- **Font**: Heebo (`--font-heebo`, next/font). Don't add a second family.
- **Icons**: web uses MUI icons (lucide-react exists; don't mix both in one component). Mobile uses `@expo/vector-icons` (Ionicons). No emoji as icons.
- Keep MUI vs Tailwind usage consistent within a file. Follow what the file already uses.
- `next_app/DESIGN_GUIDE.md` (older guardrails) still applies: rounded-2xl cards, shadow-sm/md, 100–150ms micro-motion.

## 3. Every state, every time
A screen or component isn't done until it has all of these:
- **Loading**: a skeleton shaped like the content (not a lone spinner on a blank page). Avoid layout shift.
- **Empty**: what happened and the next step, e.g. "אין משחקים קרובים באזור שלך" plus a "יצירת משחק" button.
- **Error**: plain Hebrew, what to do next, and a retry. Never show raw error text, stack traces or English API messages.
- **Disabled**: visibly disabled AND explains why (e.g. "המשחק מלא", "ההרשמה נפתחת ב־18:00").
- **Focus**: a visible focus ring (`ring` token) on every interactive element. Never `outline: none` without a replacement.
- **Pending action**: the button shows progress and blocks double-submit (join, leave, create game).
- **Signed-out guest**: `/games/[id]` and the feed must be useful without login. Gated actions explain the gate and send the user to sign-in and back.
- Robustness: long Hebrew names, 0/1/30 participants, missing field photo, past games, a full game.

## 4. Hebrew-first copy
- Write the Hebrew first. English is the fallback, never the default. No hard-coded English strings ("User", "Loading...", "Replying to") in UI.
  - Mobile: `t('key', 'ברירת מחדל בעברית')`. Web: follow the file's existing i18n or isRTL pattern.
- Tone: short, friendly, direct, like a teammate. Prefer gender-neutral forms (infinitive or plural: "הצטרפות למשחק", "בחרו מגרש").
- Buttons name the action ("הצטרפות", "יצירת משחק", "שיתוף"), not "אישור"/"OK".
- No fake stats, testimonials or placeholder lorem in shipped UI.
- No letter-spacing or ALL-CAPS on Hebrew. Use weight for emphasis, not italics.

## 5. RTL rules
- Web root is `<html lang="he" dir="rtl">`. Mobile uses `I18nManager.forceRTL`.
- Use logical properties: `ms/me/ps/pe`, `start-*/end-*`, `text-start/end`, `border-s/e`, `rounded-s/e`. In MUI `sx`, use `marginInlineStart` and similar.
  - On RN, forceRTL already swaps left/right, so existing `ml/mr` aren't bugs. Use logical classes in new code and don't sweep old code before tests.
- **Mirror directional icons** (back/forward arrows, chevrons, "next"). An `ArrowBack` must point right in RTL. Don't mirror non-directional icons (clock, search, checkmark, play, logos).
- **Numbers and time (bidi)**: wrap mixed runs (times, scores "3–2", phone numbers, prices, `8/10 שחקנים`) in `<bdi>`/`dir="ltr"` spans or Unicode isolates, so they don't scramble next to Hebrew.
- Format dates and times with `he-IL` explicitly (`toLocaleDateString('he-IL')`, 24h `HH:mm`). Never call locale-less `toLocale*()`.
- User-generated text (names, chat): `dir="auto"`.

## 6. Contrast and readability
- Body text ≥ 4.5:1. Large text (≥ 24px, or ≥ 19px bold) and UI icons/borders ≥ 3:1. Check both light and dark.
  - Watch for: gray-400 on white, `cyber.muted` on `cyber.card` for small text, and white on `brand.soft`/`light`.
- Minimum text size is 12px (only for meta/badges). Body text is ≥ 14px on mobile and 16px on web inputs (prevents iOS zoom). Never 9–11px.
- Don't convey state by color alone (full/open/cancelled). Add a label or icon.

## 7. Mobile-first and touch
- Design at 360–390px first, then widen.
- Touch targets ≥ 44×44 (iOS) / 48dp (Android). Grow small icons with padding or `hitSlop`. Keep ≥ 8px between targets.
- Primary actions go in the thumb zone. Keep the fixed bottom nav clear (`--bottom-nav-height` plus the safe-area inset).
- Respect safe areas, the keyboard covering inputs (forms in `/games/new`), and `prefers-reduced-motion`.

## 8. AI slop to avoid
- Gradient text, purple-blue "AI" gradients, glassmorphism, neon glows.
- Thick one-side accent borders on cards (`border-l-4`).
- Grids of identical icon+title+blurb cards; cards nested in cards.
- Eyebrow labels over every heading, "01/02/03" numbering, emoji bullets.
- Fade-in or bounce on every element. Hero sections in a utility app.
- Generic copy ("ברוכים הבאים!", "חוויה ללא פשרות"). Centered everything.

## 9. Verify before you say done
1. Run the app and open the screens you touched at real sizes: 390×844 mobile and 1280 desktop (Expo on device or emulator for mobile).
2. Use real Hebrew data: long names, a full game, an empty list, a slow network, an error.
3. Check both **signed-in and signed-out guest** flows (home feed, `/games`, `/games/[id]`, `/games/new`).
4. Check light and dark mode, keyboard Tab focus, and that icons point the right way in RTL.
5. Optional: `npx impeccable detect http://localhost:3000 --viewport 390x844` and triage out the RTL false positives.
6. Attach before/after screenshots to the PR.

## Legacy guardrails (kept)
- Typography: H1 2.25rem/700; H2 1.5rem/600; body 1rem/400; line-height 1.65.
- Layout: max-w-screen-xl, global paddings px-4 md:px-8, sections py-8 md:py-12.
- Components: unify Button, Card, Badge, Avatar; CTA primary solid, secondary ghost.
