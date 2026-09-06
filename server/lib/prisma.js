// Load env vars here too, not just in index.js -- this module reads
// process.env.DATABASE_URL at require-time (below) to construct the pg pool,
// so anything that requires this module (directly or transitively) before
// index.js runs its own require('dotenv').config() would silently get an
// undefined connection string, causing every query to fail with ECONNREFUSED
// no matter how correct the actual .env file is. dotenv.config() is a no-op
// for variables already set, so calling it again from index.js is harmless.
require('dotenv').config();

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
