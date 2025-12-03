# Copilot Instructions for JoinUp (next_app)

Purpose: Provide concise, repository-specific guidance to AI agents (Copilot/assistants) to be immediately productive in this codebase.

---

## Overview

- This is a Next.js (v15) app using the `app/` router and React 19. Server components are the default; client components must include `"use client"`.
- Authentication: Clerk (frontend + middleware). See `src/app/layout.tsx` for `ClerkProvider` and `src/middleware.ts` for `clerkMiddleware()` configuration.
- Realtime chat: Socket.IO server is implemented as a Next API route in `src/pages/api/socket.ts` and used by `src/components/Chat.tsx`.
- External API backend: The app integrates with a separate API (default: `http://localhost:3005`) via `process.env.NEXT_PUBLIC_API_URL`.

## Big Picture Architecture

- UI / Hosting: This repo is the frontend. It fetches live application state from an external API (games, fields, users, messages) and uses Clerk for auth.
- Server Components: Page and layout files under `src/app/` typically are server components (they `await` server-side `fetch` calls). UI rendering + static data is mostly server-side rendered.
- Client Components: Interactive UI (chat, join/leave game actions, forms) are client components and use `@clerk/nextjs` hooks and socket.io-client.
- Separation of concerns:
  - Server components fetch data from API server using `fetch( API_BASE, {cache: 'no-store'})`.
  - Client components handle user actions, tokens, and websockets using `useAuth()` and `getToken()` to add `Authorization: Bearer <token>` headers.

## Critical Files & Patterns

- `src/middleware.ts` — Adds Clerk middleware for all routes (matcher covers most paths). Keep it in mind for global auth behavior.
- `src/app/layout.tsx` — App shell; contains `ClerkProvider` and theme provider. UI-level wrappers live here.
- `src/pages/api/socket.ts` — Socket.IO server instantiation. Important pattern: it guards re-creation across dev reloads by storing instance at `res.socket.server.io`. If making any changes here, keep that pattern.
- `src/components/Chat.tsx` — Client-side socket client; uses `fetch('/api/socket')` to warm-up server and then `io({ path: '/api/socket' })`.
- Client action buttons: `JoinGameButton.tsx`, `LeaveGameButton.tsx`, `AddFriendButton.tsx` — Use `getToken()` to append Authorization header and call external API endpoints under `API_BASE`.
- `src/app/games/*` — Example of server-side `fetch` and `GameListClient` usage: server fetches and then attaches client components for interactions.
- `.env.local` — Contains `NEXT_PUBLIC_API_URL` and Clerk keys (dev keys). Ensure these are set correctly.

## Developer Workflow

- Start dev server (standard Next):
  - `npm run dev` (default to `localhost:3000`)
  - To run on port 3002: `npm run dev:3002` (Windows cmd example)
- Build and run production preview:
  - `npm run build` then `npm run start`.
- Lint: `npm run lint`
- Testing: No test harness present in the repo. If tests are added, keep them close to components or `__tests__` folders and prefer Jest/RTL.

## Key Environment Variables

- `NEXT_PUBLIC_API_URL` — The external API’s base (default used in this codebase: `http://localhost:3005`). Many files read this and fall back to `http://localhost:3005`.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_SIGN_IN_URL`, `CLERK_SIGN_UP_URL` — Clerk configuration.
- Local dev: `npm run dev` + `.env.local` to provide the above values.

⚠️ Note: The repo’s `.env.local` currently contains duplicate or malformed lines. Ensure correct `KEY=value` lines when setting up locally.

## Conventions & Patterns to Follow

- Components & routing
  - `src/app/**` server components: prefer `async` function components that `fetch()` server-side data. Use `fetch(url, { cache: 'no-store' })` where you need fresh data.
  - Client components must include `"use client"` (e.g., `Chat.tsx`, `JoinGameButton.tsx`). Keep client components minimal (only interactive parts). Avoid mixing server logic in client components.
- Auth/Token
  - Use `useAuth()` from `@clerk/nextjs` in client components for actions requiring authentication.
  - When calling backend endpoints from the client, call `const token = await getToken().catch(() => "");` and add Authorization header if token exists.
- Socket
  - Socket server path: `/api/socket`. Socket server initialized in `src/pages/api/socket.ts` and cached on the Node `res.socket.server` to avoid multiple instances in dev.
  - Client should call `fetch('/api/socket').catch(() => {});` before `io({ path: '/api/socket' })` to guarantee the server is present.
- API calls
  - `API_BASE` constant pattern across components: `const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";`
  - Ensure consistent fallbacks when adding new components.

## Integration Points & External Dependencies

- External API server (self-host or provided) — routes used include:
  - `/api/games`, `/api/games/:id`, `/api/games/:id/join`, `/api/games/:id/leave`
  - `/api/messages`, `/api/messages?roomId=...`
  - `/api/users/:id`, `/api/users/requests` (friends)
- Authentication service: Clerk
- Realtime communications: Socket.IO (server side via Next API route, client side via `socket.io-client`).
- Styling: Tailwind CSS (v4 with CSS variables in `tailwind.config.ts`), `src/app/globals.css` for global styles.

## Debugging Tips (common problems)

- socket.io: If you see duplicate events or odd behavior during dev, check whether the server instance was re-created. Look at `src/pages/api/socket.ts` to confirm the dev-protection pattern (`res.socket.server.io`).
- Missing tokens in client requests: Verify Clerk dev keys in `.env.local`. Called endpoints that require auth use `getToken()` and expect Authorization header to be present.
- Server fetches returning stale data: Server components should use `fetch(..., { cache: 'no-store'})` when fetching dynamic content (games, messages).

## Examples (copy/paste for new components)

- Server fetch: `const res = await fetch(`${API_BASE}/api/games`, { cache: 'no-store' });`.
- Client POST with token:
  ```js
  const token = await getToken().catch(() => "");
  const res = await fetch(`${API_BASE}/api/games/${id}/join`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  ```
- Socket: in client `Chat.tsx`:
  ```js
  // warm up
  fetch("/api/socket").catch(() => {});
  const socket = io({ path: "/api/socket" });
  // handle joinRoom, message, typing
  ```

