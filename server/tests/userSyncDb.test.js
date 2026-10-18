const { prisma } = require('../services/gameService');
const { safeUpsertUserFromAuth } = require('../utils/userSync');

jest.setTimeout(30000);

describe('safeUpsertUserFromAuth (DB)', () => {
  const id = 'user_sync_db_1';

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.deleteMany({ where: { id } });
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id } });
    await prisma.$disconnect();
  });

  test('profile-edited name survives later upserts; missing name is filled', async () => {
    await safeUpsertUserFromAuth(prisma, { id, name: 'Clerk Name', avatar: null });
    await prisma.user.update({ where: { id }, data: { name: 'My Edited Name' } });
    await safeUpsertUserFromAuth(prisma, { id, name: 'Clerk Name', avatar: null });
    expect((await prisma.user.findUnique({ where: { id } })).name).toBe('My Edited Name');

    await prisma.user.update({ where: { id }, data: { name: null } });
    await safeUpsertUserFromAuth(prisma, { id, name: 'Clerk Name', avatar: null });
    expect((await prisma.user.findUnique({ where: { id } })).name).toBe('Clerk Name');
  });
});
