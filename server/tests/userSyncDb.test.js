process.env.JOINUP_SKIP_DOTENV = '1';

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

  test('creating a user succeeds when another row already has that email', async () => {
    const holder = 'user_sync_email_holder';
    const newbie = 'user_sync_email_newbie';
    const email = 'user-sync-held@example.com';
    const wipe = () => prisma.user.deleteMany({
      where: { OR: [{ id: { in: [holder, newbie] } }, { email }] },
    });
    await wipe();
    try {
      await prisma.user.create({ data: { id: holder, name: 'Holder', email } });
      const created = await safeUpsertUserFromAuth(prisma, {
        id: newbie, name: 'Real Person', email, avatar: null,
      });
      expect(created.id).toBe(newbie);
      const rows = await prisma.user.findMany({ where: { id: { in: [holder, newbie] } } });
      const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
      expect(byId[newbie]).toBeTruthy();
      expect(byId[newbie].name).toBe('Real Person');
      expect(byId[newbie].email).toBe(email);
      expect(byId[holder].email).toBeNull();
    } finally {
      await wipe();
    }
  });
});
