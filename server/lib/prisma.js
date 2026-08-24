const { PrismaClient } = require('@prisma/client');

// One PrismaClient per process. Reuse via globalThis so nodemon/Jest reloads
// do not open additional Neon pool connections.
const globalForPrisma = globalThis;

const prisma = globalForPrisma.__joinupPrisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__joinupPrisma = prisma;
}

module.exports = { prisma };
