# Database Schemas, Migrations & Transaction Rules

## 1. NEON CONNECTION TOPOLOGY (CRITICAL FIX)
`schema.prisma` defines two database connection strings:
- `url = env("DATABASE_URL")` (Pooled traffic via PgBouncer).
- `directUrl = env("DIRECT_DATABASE_URL")` (Direct connection string for migrations).

### Critical Architecture Rules:
1. **The Hostname Rule**: Connection separation on Neon is driven by the **hostname**, NOT the port (both listen on 5432). The pooled connection URL contains a distinct `-pooler` suffix (e.g., `ep-xxxx-pooler.aws.neon.tech`). The direct connection does NOT contain the `-pooler` suffix.
2. **Migration Constraints**: Running `npx prisma migrate dev` or `migrate deploy` uses session-level features that PgBouncer rejects. Prisma CLI automatically handles routing via `directUrl`, but you must ensure `DIRECT_DATABASE_URL` is never pointed to a `-pooler` hostname in any deployment environment.

## 2. CONNECTION POOL EXHAUSTION (KNOWN ARCHITECTURAL DEBT)
- **Current State**: The codebase currently suffers from architectural debt where almost every route and service file executes `const prisma = new PrismaClient();` independently at module scope (creating ~20 distinct client instances).
- **Rule**: While you should reuse existing instances when modifying old files, **NEVER instantiate a `PrismaClient` inside an Express request handler, a loop, or a worker tick.** Doing so under load will completely exhaust Neon's database backend limits instantly.

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
