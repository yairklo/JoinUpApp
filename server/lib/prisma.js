const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

// One PrismaClient per process. Reuse via globalThis so nodemon/Jest reloads
// do not open additional Neon pool connections.
const globalForPrisma = globalThis;

// pg-backed adapter instead of Prisma's built-in engine pool: it actually closes idle
// connections (idleTimeoutMillis) instead of holding them open for the life of the process.
// Neon does not auto-suspend its compute while any connection is open, even an idle one —
// with the default pool this VPS process (which never exits) kept the DB awake permanently.
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

const prisma = globalForPrisma.__joinupPrisma || new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__joinupPrisma = prisma;
}

module.exports = { prisma };
