# JoinUp Backend Constitution - Master CLAUDE.md

This is the primary runtime constitution and routing guide for all agent personas (Tier 1 API/n8n agents and Tier 2 CLI/Claude Code agents) working on the JoinUp backend.

---

## 1. GLOBAL SYSTEM ARCHITECTURE
- **Runtime & Framework**: Node.js, CommonJS module resolution (`require`), Express 4.
- **Database Layer**: Prisma 6 ORM, PostgreSQL (hosted on Neon).
- **Real-Time Layer**: Socket.io 4 for live badges, roster status syncing, and chat delivery.
- **Authentication**: Clerk (managed authentication) with verification and local caching.

---

## 2. AGENT PERSONAS & TASK DELEGATION MANDATES

### Tier 1: API / Automation Agents (e.g., n8n, simpler API loops)
- **Scope**: Code research, drafting route controllers, writing logic validations, creating tests.
- **Mandate Boundary**: Tier 1 agents do NOT possess terminal CLI execution capabilities. 
- **Delegation Handshake Rule**: If a task requires database migrations (`npx prisma migrate dev`), running seeds, or installing npm packages, Tier 1 must **NOT** fail. It must draft the required code/schema change, freeze its own execution, generate a clear CLI command payload, and explicitly delegate the terminal execution to a **Tier 2 Agent**. Once Tier 2 completes the command, Tier 1 resumes.

### Tier 2: CLI / Developer Agents (e.g., Claude Code, CLI-enabled agents)
- **Scope**: Executing terminal operations, running tests, database migrations, package installations, and environment diagnostics.
- **Requirement**: Always run the compulsory "Self-Critique" loop using the sub-documents below before executing structural code shifts.

---

## 3. VECTOR SEARCH & KEYWORD ROUTING GUIDE (Token Optimization)
To prevent context bloat, exhaustive edge cases are offloaded to sub-documents. Before making changes, search and read the specific file governing your target module:

| Target Domain | Files Impacted | Keywords for Search / Context | Sub-Document to Open |
| :--- | :--- | :--- | :--- |
| **User Profiles, JWTs & Friends** | `/server/utils/auth.js`<br>`/server/routes/users.js` | `clerk`, `jwt`, `upsert user`, `req.user`, `friendship`, `orderPair` | [`server/docs/agents/auth_pitfalls.md`](./docs/agents/auth_pitfalls.md) |
| **Migrations, Schema & Tx** | `/server/prisma/schema.prisma`<br>`/server/services/gameService.js` | `migration`, `pooler`, `directUrl`, `transaction`, `PrismaClient` | [`server/docs/agents/database_rules.md`](./docs/agents/database_rules.md) |
| **WebSockets, Push & Workers** | `/server/index.js`<br>`/server/services/notificationService.js` | `socket.io`, `firebase`, `chat:sync`, `useEffect`, `cleanupWorker` | [`server/docs/agents/realtime_rules.md`](./docs/agents/realtime_rules.md) |
| **Next.js PWA Front-end, Styling & Client Caching** | `/next_app/src/app/*`<br>`/next_app/src/components/*`<br>`/next_app/src/context/*` | `next.js`, `tailwind`, `hydration`, `useSyncedGames`, `apiClient`, `leaflet` | [`server/docs/agents/frontend_rules.md`](./docs/agents/frontend_rules.md) |

---

## 4. STANDARD TERMINAL COMMANDS (Tier 2 Only)
- **Run Dev Server**: `npm run dev` (starts Express locally on port 3005).
- **Run Integration Tests**: `npm run test` (runs Jest-based roster, lottery, and auth mocks).
- **Prisma Studio**: `npx prisma studio` (opens database explorer GUI).
- **Run Migration**: `npx prisma migrate dev --name <migration_name>` (applies schema variations).
