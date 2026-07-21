# Next.js PWA Frontend — Architecture, Pitfalls & Design Guardrails

Governs `/next_app` (Next.js 15 App Router, React 19, TypeScript). This is a Progressive Web App wrapped by `next-pwa`, styled with a **triple-stack** of Tailwind CSS + MUI + Bootstrap, using Clerk for auth and a hand-rolled `fetch` client (no Axios/React Query/SWR) plus Socket.IO for live state.

---

## 1. WEB ARCHITECTURE & CLIENT STATE

### 1.1 Core Module File Map
| Module | Path | Notes |
| :--- | :--- | :--- |
| **Root Providers / Layout Wrapper** | `next_app/src/app/layout.tsx` | Mandatory provider nesting — see §1.4. |
| **Dashboard / Home Feed** | `next_app/src/app/home/page.tsx`<br>`next_app/src/components/GamesByCityClient.tsx`<br>`next_app/src/components/GamesByFriendsClient.tsx`<br>`next_app/src/components/GamesByDateClient.tsx`<br>`next_app/src/components/GamesHorizontalList.tsx` | Server Component page shells hydrate `*Client.tsx` components via `useSyncedGames`. |
| **Game Detail / Live State** | `next_app/src/app/games/[id]/page.tsx` (Server Component, fetches + formats) → `next_app/src/components/GameLiveSection.tsx` (Client, owns live state) | See §1.3 for the full join/leave data flow. |
| **Game Booking / Creation Form** | `next_app/src/app/games/new/page.tsx`<br>`next_app/src/hooks/useGameCreator.ts`<br>`next_app/src/components/NewGameInline.tsx`<br>`next_app/src/components/GameDetailsEditor.tsx` (also used for edit) | |
| **Game Join/Leave Controls** | `next_app/src/components/JoinGameButton.tsx`<br>`next_app/src/components/LeaveGameButton.tsx`<br>`next_app/src/components/PendingJoinRequests.tsx` | Pure presentational + fetch; report results up via `onJoined`/`onLeft` callbacks, never own global state. |
| **Series (recurring games)** | `next_app/src/app/series/[id]/page.tsx`<br>`next_app/src/hooks/useSeriesLogic.ts`<br>`next_app/src/components/SeriesManager.tsx`, `SeriesSettingsEditor.tsx` | |
| **Chat Panels** | `next_app/src/components/Chat.tsx` (full-screen thread)<br>`next_app/src/components/FloatingChatWindow.tsx` (global floating widget, mounted once in `layout.tsx`)<br>`next_app/src/components/ChatList.tsx`<br>`next_app/src/hooks/useChatLogic.ts` (all message state/socket logic)<br>`next_app/src/context/ChatContext.tsx` (cross-app chat list + message cache) | |
| **Global Nav / Notifications** | `next_app/src/components/AppNavbar.tsx`<br>`next_app/src/components/NotificationPanel.tsx`<br>`next_app/src/hooks/useNotifications.ts`, `useNotificationCounters.ts`<br>`next_app/src/context/NotificationCountersContext.tsx` | |
| **Field Profiles / Map Search** | `next_app/src/app/fields/[id]/page.tsx`<br>`next_app/src/components/SearchMapComponent.tsx`, `FieldBusyChart.tsx` | Leaflet map components — always dynamically imported with `ssr: false` (Leaflet touches `window` at import time). |

### 1.2 Data-Fetching & Caching Layer
There is **no React Query, SWR, or Axios**. The stack is intentionally simple and split by ownership:

1. **Server Components fetch directly** — e.g. `next_app/src/app/games/[id]/page.tsx` calls `fetch(...)` with `cache: "no-store"` server-side and passes the result down as `initialGame` props. This is the *only* place raw HTTP is used for the first paint; it guarantees the SSR HTML always reflects live DB state.
2. **Client-side calls go through `apiClient<T>()`** in `next_app/src/services/api/client.ts`, wrapped per-domain in `next_app/src/services/api/{games,users,chats,series,fields,notifications,ratings,search}.ts`. Every response is piped through `mapGameTimezones()`, which walks the JSON tree and backfills `date`/`time` string fields from any `start` ISO timestamp it finds — **do not hand-roll a second date formatter**; call the shared `formatJerusalemDate`/`formatJerusalemTime` from `next_app/src/utils/timezone.ts` if you need a one-off.
3. **Live state is Context, not a cache library**:
   - `SocketContext` (`next_app/src/context/SocketContext.tsx`) — single global Socket.IO connection, gated on `useAuth()` being loaded + signed in.
   - `GameUpdateContext` (`next_app/src/context/GameUpdateContext.tsx`) — an in-memory pub/sub bus (`Set` of callbacks) fed by `game:created`/`game:deleted`/`series:created`/`series:deleted` socket events. Components subscribe via `useGameUpdateListener`/`useGameCreatedListener`/`useGameDeletedListener`, never `socket.on(...)` directly for these events.
   - `ChatContext` — chat list + a `messagesCache` keyed by room id, shared across `Chat.tsx` and `FloatingChatWindow.tsx` so opening the same room twice doesn't refetch.
   - `NotificationCountersContext` — navbar badge counts.

### 1.3 The Join/Leave State-Update Contract (read before touching any game mutation)
Every mutating game action (join, leave, approve, reject, waitlist-confirm) follows the **same two-channel merge pattern**, seen end-to-end in `GameLiveSection.tsx` + `JoinGameButton.tsx`:

1. The component calls its own `fetch(...)` directly (not through a shared "join" hook) and awaits the **full updated game object** in the response body.
2. On success it calls a callback prop (`onJoined`, `onLeft`, `onDecision`, `onRequestSent`) that always merges via spread, never a raw replace:
   ```typescript
   const mergeAndSet = (updated?: any) => {
     if (updated) setGame((prev) => ({ ...prev, ...normalizeIncomingGame(updated) }));
   };
   ```
3. Independently, a `socket.on("game:updated", handler)` listener in the *same* component applies the identical `normalizeIncomingGame()` merge whenever the backend broadcasts a change (e.g. someone else joins).

**Why this doesn't double-fire or race**: both channels write the same idempotent full-snapshot merge, so if the HTTP response and the socket broadcast for the same action both land, the second merge is a harmless no-op (same values). List-level state (`useSyncedGames.ts`) goes further and explicitly **dedupes by id** before inserting a socket-delivered `game:created` event:
```typescript
setGames((prev) => {
  if (prev.some((g) => g.id === normalizedGame.id)) return prev; // idempotent
  ...
});
```

**Actionable rule**: Any new mutation you add MUST (a) return the full updated resource from the API route, (b) run it through `normalizeIncomingGame()`/`mapGameTimezones()` before merging into state, and (c) merge with `{ ...prev, ...updated }` — never `setState(updated)` — so fields the socket event doesn't carry (e.g. `chatRoomId`) aren't clobbered to `undefined`.

### 1.4 Mandatory Provider/Layout Nesting
`next_app/src/app/layout.tsx` defines a fixed provider order that every page implicitly depends on:
```
ClerkProvider → SocketProvider → ThemeRegistry (MUI) → ChatProvider → NotificationCountersProvider → { AppNavbar, <page>, FloatingChatWindow, NotificationAsker }
```
Any component using `useChat()`, `useSocket()`, or `useNotificationCounters()` assumes it is mounted under this tree. **Never** render `FloatingChatWindow` or a second `SocketProvider`/`ChatProvider` inside an individual page — there must be exactly one instance app-wide, created here.

---

## 2. WEB-SPECIFIC PITFALLS & BUG LOGS

### 2.1 Hydration Mismatch — Locale/Timezone-Sensitive `Date` Calls in Client Components
**The Pitfall**: In the App Router, a component marked `"use client"` is still **server-rendered for the first paint and then re-executed during hydration in the browser**. Any `new Date()` / `.toLocaleDateString()` / `.toLocaleTimeString()` call made with no explicit `timeZone` (and evaluated at render time, not inside `useEffect`) can legitimately produce **different text on the server (Node, UTC) vs. the client (browser, `Asia/Jerusalem`)**, or simply a different instant if the two renders happen seconds apart. React then throws a hydration mismatch warning/error and forces a client-side re-render.

Confirmed live examples of this exact risk in the current codebase:
```12:52:next_app/src/components/JoinGameButton.tsx
  const now = new Date();                                    // computed on every render, server AND client
  const openDate = registrationOpensAt ? new Date(registrationOpensAt) : null;
  const isRegistrationClosed = openDate && now < openDate;    // this boolean can differ between SSR pass and hydration pass
```
```143:144:next_app/src/components/JoinGameButton.tsx
    dateStr = openDate.toLocaleDateString("he-IL", { day: 'numeric', month: 'numeric' }); // no timeZone → uses host's local zone
    timeStr = openDate.toLocaleTimeString("he-IL", { hour: '2-digit', minute: '2-digit' });
```
The same class of risk exists in `Chat.tsx` (`toLocaleDateString(isRTL ? 'he-IL' : 'en-US')`, `toLocaleTimeString(...)`), `SeriesManager.tsx:213` (`toLocaleString()`), `TeamBuilderWrapper.tsx:133` (`toLocaleString()`), and `GamesDateNav.tsx:26`.

**The already-correct reference pattern** (do not diverge from it): Server Components format dates **before** they ever reach the client, using an explicit IANA zone via `next_app/src/utils/timezone.ts`:
```1:16:next_app/src/utils/timezone.ts
export function formatJerusalemDate(dateInput: Date | string | number): string {
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return "";
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    ...
```
`next_app/src/app/games/[id]/page.tsx` calls this server-side once and passes plain `date`/`time` strings as props; live socket updates re-run the exact same formatter via `normalizeIncomingGame()` so the string is byte-identical regardless of where it's computed.

**Actionable rule (copy-paste)**: Never call `new Date()`, `.toLocaleDateString()`, or `.toLocaleTimeString()` directly in a component's render body. Instead:
- If the value only needs to be *correct*, not live: compute it in the parent **Server Component** and pass a pre-formatted string prop.
- If it must react to client state, wrap it in `useEffect`/`useState` so it only executes post-mount (client-only), OR gate the render with a `mounted` flag:
```tsx
const [mounted, setMounted] = useState(false);
useEffect(() => { setMounted(true); }, []);
if (!mounted) return null; // or a stable skeleton — avoids SSR/CSR text divergence
```
- Always pass an explicit `timeZone: 'Asia/Jerusalem'` to any `Intl.DateTimeFormat`/`toLocaleDateString` call touching game/series times — reuse `formatJerusalemDate`/`formatJerusalemTime`, never a bare `toLocaleString()`.

### 2.2 Duplicate List Keys — Optimistic Message Reconciliation
**The Pitfall**: Chat sends an optimistic message keyed by a client-generated id before the server confirms it. If the confirmed message from the socket is ever *appended* instead of *replacing* the optimistic entry, you get two list items — one with the temp key, one with the real key — or, worse, a duplicate key collision if both temporarily share an id.

**The already-correct reference pattern**, in `next_app/src/hooks/useChatLogic.ts`, matches incoming socket messages against **either** the real id **or** the `tempId` the optimistic message was sent with, and replaces in place:
```139:159:next_app/src/hooks/useChatLogic.ts
const handleMessage = (incomingMsg: ChatMessage) => {
  ...
  setMessages(prev => {
    const matchIndex = prev.findIndex(m => {
      const idMatch = String(m.id) === String(incomingMsg.id);
      const tempMatch = incomingMsg.tempId && (String(m.id) == String(incomingMsg.tempId));
      return idMatch || tempMatch;
    });
    if (matchIndex > -1) {
      const newMessages = [...prev];
      newMessages[matchIndex] = { ...incomingMsg, status: 'sent', ... };
      return newMessages;               // REPLACE — never push a second entry
    }
    return [...prev, incomingMsg];
  });
};
```
`Chat.tsx` then renders with `key={m.id || m.tempId}` so a still-pending optimistic message and its confirmed replacement never coexist as two DOM nodes.

**Actionable rule (copy-paste)**: Any new optimistic-update flow (reactions, edits, deletes, future "pending game" cards, etc.) MUST generate a client-side `tempId`, send it to the server, and reconcile the server echo by **finding-and-replacing** on `id || tempId` — never blindly `[...prev, incoming]` for anything that could already exist client-side. When you `.map()` over any list for rendering, `key` must be the same stable id used in this reconciliation, never the array `index`.

### 2.3 Memory Leaks — Uncleaned Socket Listeners & Dynamic Route Effects
**The Pitfall**: Every page under `next_app/src/app/**/[id]/page.tsx` (games, series, fields, users, chat) unmounts and remounts its client children on route change (`gameId` changes without a full page reload). Any `socket.on(...)` or `setTimeout`/`setInterval` registered without a matching `off`/`clearTimeout` in the effect's cleanup accumulates one listener per navigation, eventually firing stale handlers against the wrong `gameId`/`roomId`.

**The already-correct reference pattern**, `next_app/src/context/GameUpdateContext.tsx`, centralizes all `game:*`/`series:*` listener registration into a single Context effect and hands out narrow `subscribe*` helpers that always return an unsubscribe function:
```163:170:next_app/src/context/GameUpdateContext.tsx
export const useGameUpdateListener = (callback: (event: GameUpdateEvent) => void) => {
    const { subscribe } = useGameUpdate();
    useEffect(() => {
        const unsubscribe = subscribe(callback);
        return () => unsubscribe();
    }, [subscribe, callback]);
};
```
`useChatLogic.ts` (§1) and `ChatContext.tsx` follow the same discipline for `presence:update`, `typing:start/stop`, `message`, `messageUpdated`, `messageDeleted`, `messageReaction`, and `messageStatusUpdate` — every `socket.on` in their setup effect has a matching `socket.off` in the returned cleanup, and typing timeouts are cleared via `Object.values(typingTimeoutsRef.current).forEach(clearTimeout)`.

**Actionable rule (copy-paste)**: Every `useEffect` that calls `socket.on(...)`, `SomeContext.subscribe(...)`, `setTimeout`, or `setInterval` MUST return a cleanup function that undoes exactly what it registered, and the effect's dependency array MUST include the route-scoped id (`roomId`, `gameId`) that identifies which subscription this is, so navigating to a different id tears down the old listeners before wiring new ones:
```tsx
useEffect(() => {
  if (!socket || !roomId) return;
  const handler = (msg) => { /* ... */ };
  socket.on("message", handler);
  return () => socket.off("message", handler); // compulsory
}, [socket, roomId]);
```
Also watch Clerk's `getToken` — it is not guaranteed referentially stable across renders. Follow the ref-freezing pattern already used in `next_app/src/hooks/useNotifications.ts` (see `server/docs/agents/realtime_rules.md` §3) rather than putting `getToken` directly in a `useEffect` dependency array, or you will get a refresh loop, not a leak, but the same class of "uncontrolled effect re-fire" bug.

---

## 3. TAILWIND & DESIGN GUARDRAILS

### 3.1 Triple Styling Stack — Handle With Care
This app simultaneously loads **three** styling systems, all globally scoped:
- **Tailwind v4** (`next_app/tailwind.config.ts`, utility classes, `darkMode: "class"`), scanning `src/app/**` and `src/components/**`.
- **MUI** via `next_app/src/components/theme/themeRegistry.tsx`, generating its own class names and injecting a theme through Emotion.
- **Bootstrap 5 CSS** (`bootstrap/dist/css/bootstrap.min.css`), imported globally in `next_app/src/app/layout.tsx` purely because `AppNavbar.tsx` still uses Bootstrap classes/components.

Because Bootstrap's global reset and utility classes (`.container`, `.btn`, `.card`, `.row`/`.col-*`) share names with common conventions and can silently override or be overridden by Tailwind utilities/MUI's injected styles depending on CSS load order, **never assume a class name is uncontested**.

### 3.2 What Counts As a Dangerous UI Change
- **Editing `next_app/tailwind.config.ts` or `next_app/src/app/globals.css` CSS variables** (`--background`, `--primary`, `--radius`, etc.). These custom properties are the single source of truth consumed both by Tailwind's `theme.extend.colors` (as `hsl(var(--primary))`) and by the MUI theme registry — changing them changes color/spacing app-wide, including inside third-party MUI components that don't visibly reference Tailwind. Treat this file like a schema migration: change deliberately, check every page, never quick-patch a single component's look by editing a shared variable.
- **Removing or bypassing `next_app/src/app/layout.tsx`'s provider tree** (see §1.4) — e.g., adding a page that needs `useChat()`/`useSocket()` under a route group that somehow skips `RootLayout`, or wrapping a page in a second `SocketProvider`. This silently breaks chat/notifications for that page with no build-time error.
- **Hardcoding an API/socket origin** instead of reading `process.env.NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_SOCKET_URL`. Every fetch and socket call in this codebase resolves its base URL through `next_app/src/services/api/client.ts` (`API_BASE`) or `SocketContext.tsx` — a hardcoded `localhost:3005` or old Render/Coolify URL committed anywhere will silently work in dev and break in every deployed environment.
- **Mixing MUI `sx`/Bootstrap classes and Tailwind utility classes on the same element for the same concern** (e.g. spacing set by both a Tailwind `p-4` and an MUI `sx={{ p: 2 }}`). Pick one system per component; new components should prefer Tailwind + the existing `class-variance-authority`/`tailwind-merge`/Radix primitives already in `package.json`, since MUI/Bootstrap are legacy holdovers being phased out page-by-page.
- **Importing Leaflet-based map components without `dynamic(..., { ssr: false })`** — Leaflet touches `window`/`document` at module-eval time and will crash the Next.js server render if imported statically into a Server Component tree (`SearchMapComponent.tsx`, `MapComponent.tsx`, `GameLocationMap.tsx`).
- **Editing `next_app/next.config.ts` PWA flags** (`register`, `skipWaiting`, `disable`) without checking `next-pwa`'s generated `public/sw.js` — note `eslint.ignoreDuringBuilds: true` is already set, meaning **lint errors do not fail the production build**; do not rely on `next build` succeeding as proof the code is lint-clean.

### 3.3 Web Troubleshooting Checklist
1. **Stale build/cache issues** (styles not updating, old chunks served, PWA showing old content): stop the dev server, delete `next_app/.next`, and if a service worker is suspected, also clear `next_app/public/sw.js`/`workbox-*.js` (regenerated on next build) and hard-reload with "Unregister service worker" in devtools.
2. **Hydration warnings in the console**: search the failing component for `new Date()`, `Math.random()`, `toLocaleString`/`toLocaleDateString`/`toLocaleTimeString` without an explicit `timeZone`, or any `typeof window` branch rendered before mount — fix per §2.1.
3. **Socket not connecting on web**: confirm `NEXT_PUBLIC_SOCKET_URL`/`NEXT_PUBLIC_API_URL` are set for the environment (Vercel envs are separate from `.env.local`), then check `SocketContext.tsx`'s `connect_error` handler log for `Authentication error`/JWT issues — Clerk's `getToken()` must resolve before `io(...)` is called.
4. **A new mutation isn't reflected live in other open tabs/components**: verify the backend route actually emits the corresponding `game:updated`/`chat:sync` broadcast (see `server/docs/agents/realtime_rules.md`) — the frontend merge pattern in §1.3 only works if the server sends a full updated payload.
5. **CORS/network errors calling the API from web**: this is a backend concern — see `server/index.js` CORS config and `server/docs/agents/database_rules.md`; do not "fix" it by hardcoding `no-cors` or disabling `credentials` on the client fetch calls.
