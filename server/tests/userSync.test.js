const { buildSafeUserUpsertPayload, safeUpsertUserFromAuth } = require('../utils/userSync');

function makePrisma(upsertResult, count = 1) {
  return {
    user: {
      upsert: jest.fn().mockResolvedValue(upsertResult),
      updateMany: jest.fn().mockResolvedValue({ count }),
    },
  };
}

describe('userSync', () => {
  const clerk = { id: 'u1', name: 'Clerk Name', avatar: 'http://a/img.png', email: 'a@b.c' };

  test('payload never updates existing users', () => {
    expect(buildSafeUserUpsertPayload(clerk).update).toEqual({});
  });

  test('new user is created with Clerk name, avatar, email', () => {
    expect(buildSafeUserUpsertPayload(clerk).create).toEqual({
      id: 'u1', name: 'Clerk Name', imageUrl: 'http://a/img.png', email: 'a@b.c',
    });
  });

  test('name-fallback (name === id) is never written on create', () => {
    const c = buildSafeUserUpsertPayload({ id: 'u1', name: 'u1', avatar: null }).create;
    expect(c.name).toBeNull();
  });

  test('existing customised name is preserved', async () => {
    const prisma = makePrisma({ id: 'u1', name: 'My Custom Name' });
    const res = await safeUpsertUserFromAuth(prisma, clerk);
    expect(res.name).toBe('My Custom Name');
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  test('null stored name is filled from Clerk via guarded updateMany', async () => {
    const prisma = makePrisma({ id: 'u1', name: null });
    const res = await safeUpsertUserFromAuth(prisma, clerk);
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u1', name: null },
      data: { name: 'Clerk Name' },
    });
    expect(res.name).toBe('Clerk Name');
  });

  test('empty stored name is filled, but fallback name never written', async () => {
    const prisma = makePrisma({ id: 'u1', name: '' });
    await safeUpsertUserFromAuth(prisma, { id: 'u1', name: 'u1', avatar: null });
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  test('lost race (count 0) keeps the upserted user as-is', async () => {
    const prisma = makePrisma({ id: 'u1', name: null }, 0);
    const res = await safeUpsertUserFromAuth(prisma, clerk);
    expect(res.name).toBeNull();
  });

  test('email-shaped / username Clerk names are never written', async () => {
    const prisma = makePrisma({ id: 'u1', name: null });
    await safeUpsertUserFromAuth(prisma, { id: 'u1', name: 'a@b.c' });
    await safeUpsertUserFromAuth(prisma, { id: 'u1', name: 'uname', username: 'uname' });
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(buildSafeUserUpsertPayload({ id: 'u1', name: 'a@b.c' }).create.name).toBeNull();
  });

  test('email-shaped stored name is repaired when Clerk has a real name', async () => {
    const prisma = makePrisma({ id: 'u1', name: 'old@x.com', email: 'old@x.com' });
    const res = await safeUpsertUserFromAuth(prisma, clerk);
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u1', name: 'old@x.com' },
      data: { name: 'Clerk Name' },
    });
    expect(res.name).toBe('Clerk Name');
  });

  test('no extra query for empty stored name + unusable Clerk name', async () => {
    const prisma = makePrisma({ id: 'u1', name: null });
    await safeUpsertUserFromAuth(prisma, { id: 'u1', name: 'u1' });
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  test('an email unique conflict releases the other row and retries', async () => {
    const conflict = Object.assign(new Error('unique'), { code: 'P2002', meta: { target: ['email'] } });
    const created = { id: 'u1', name: 'Clerk Name', email: 'a@b.c' };
    const prisma = {
      user: {
        upsert: jest.fn().mockRejectedValueOnce(conflict).mockResolvedValueOnce(created),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const res = await safeUpsertUserFromAuth(prisma, clerk);
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { email: 'a@b.c', NOT: { id: 'u1' } },
      data: { email: null },
    });
    expect(prisma.user.upsert).toHaveBeenCalledTimes(2);
    expect(res.email).toBe('a@b.c');
  });

  test('if the email is still taken after release, the user is created without it', async () => {
    const conflict = Object.assign(new Error('unique'), { code: 'P2002', meta: { target: ['User_email_key'] } });
    const created = { id: 'u1', name: 'Clerk Name', email: null };
    const prisma = {
      user: {
        upsert: jest.fn()
          .mockRejectedValueOnce(conflict)
          .mockRejectedValueOnce(conflict)
          .mockResolvedValueOnce(created),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const res = await safeUpsertUserFromAuth(prisma, clerk);
    expect(res.id).toBe('u1');
    expect(prisma.user.upsert.mock.calls[2][0].create.email).toBeUndefined();
  });

  test('a non-email unique conflict still throws', async () => {
    const conflict = Object.assign(new Error('unique'), { code: 'P2002', meta: { target: ['id'] } });
    const prisma = {
      user: {
        upsert: jest.fn().mockRejectedValue(conflict),
        updateMany: jest.fn(),
      },
    };
    await expect(safeUpsertUserFromAuth(prisma, clerk)).rejects.toBe(conflict);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
});
