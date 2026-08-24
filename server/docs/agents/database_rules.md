# Database Schemas, Migrations & Transaction Rules

## 1. NEON CONNECTION TOPOLOGY (CRITICAL FIX)
`schema.prisma` defines two database connection strings:
- `url = env("DATABASE_URL")` (Pooled traffic via PgBouncer).
- `directUrl = env("DIRECT_DATABASE_URL")` (Direct connection string for migrations).

### Critical Architecture Rules:
1. **The Hostname Rule**: Connection separation on Neon is driven by the **hostname**, NOT the port (both listen on 5432). The pooled connection URL contains a distinct `-pooler` suffix (e.g., `ep-xxxx-pooler.aws.neon.tech`). The direct connection does NOT contain the `-pooler` suffix.
2. **Migration Constraints**: Running `npx prisma migrate dev` or `migrate deploy` uses session-level features that PgBouncer rejects. Prisma CLI automatically handles routing via `directUrl`, but you must ensure `DIRECT_DATABASE_URL` is never pointed to a `-pooler` hostname in any deployment environment.

## 2. PRISMA CLIENT LIFECYCLE
- **Runtime rule:** Import the shared client from `server/lib/prisma.js`. Do not call `new PrismaClient()` in routes, services, or workers.
- **Never** instantiate `new PrismaClient()` inside an Express request handler, a loop, or a worker tick — that exhausts Neon's pool immediately.
- CLI scripts (`prisma/seed.js`, one-off `check.js`) may create their own short-lived client.

## 3. PRISMA TRANSACTION CONVENTIONS
High-concurrency writes (such as joining rosters, waitlist promotion, and game creations) must be atomic.
- **Callback Form for Connected Writes**: Paired writes (like creating a `Game` and its matching `ChatRoom`) must use the interactive transaction block. Ensure the group chat ID matches the game ID exactly, eliminating foreign key overhead:
```javascript
const created = await prisma.$transaction(async (tx) => {
  const game = await tx.game.create({ data: { ... } });
  await tx.chatRoom.create({ data: { id: game.id, type: 'GROUP' } });
  return game;
});
```
Rule: Every tx.* call inside the callback must use the tx client instance. Mixing tx and the outer module-level prisma client will silently bypass the atomic transaction boundary.
