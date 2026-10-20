const {
  publicDisplayName,
  notificationName,
  redactNotificationFields,
  isEmailAddress,
} = require('../utils/publicName');

describe('publicDisplayName', () => {
  test('keeps a real display name', () => {
    expect(publicDisplayName('נועה')).toBe('נועה');
    expect(publicDisplayName('  Dana Cohen  ')).toBe('Dana Cohen');
  });

  test('never returns an email or a raw Clerk id', () => {
    expect(publicDisplayName('qa.minor.20oct@mailinator.com')).toBe('משתמש');
    expect(publicDisplayName('user_2abcXYZ')).toBe('משתמש');
    expect(publicDisplayName('')).toBe('משתמש');
    expect(publicDisplayName(null)).toBe('משתמש');
    expect(publicDisplayName('qa@mailinator.com', null)).toBeNull();
  });

  test('isEmailAddress matches the whole string only', () => {
    expect(isEmailAddress('qa.minor.20oct@mailinator.com')).toBe(true);
    expect(isEmailAddress('נועה הצטרפה')).toBe(false);
  });
});

describe('notificationName', () => {
  test('prefers the stored profile name over an email on the auth user', async () => {
    const prisma = { user: { findUnique: jest.fn(async () => ({ name: 'נועה' })) } };
    const name = await notificationName(prisma, { id: 'user_1', name: 'qa.minor.20oct@mailinator.com' }, 'משתמש');
    expect(name).toBe('נועה');
  });

  test('falls back to משתמש when the stored name is also an email', async () => {
    const prisma = { user: { findUnique: jest.fn(async () => ({ name: 'qa.minor.20oct@mailinator.com' })) } };
    const name = await notificationName(prisma, { id: 'user_1', name: 'qa.minor.20oct@mailinator.com' });
    expect(name).toBe('משתמש');
  });

  test('uses a non-email inline name when the profile row has none', async () => {
    const prisma = { user: { findUnique: jest.fn(async () => ({ name: null })) } };
    const name = await notificationName(prisma, { id: 'user_1', name: 'יוסי' });
    expect(name).toBe('יוסי');
  });
});

describe('redactNotificationFields', () => {
  test('replaces an email in the body with the actor display name', async () => {
    const prisma = { user: { findUnique: jest.fn(async () => ({ name: 'נועה' })) } };
    const out = await redactNotificationFields(
      prisma,
      'מישהו הצטרף למשחק שלך',
      'qa.minor.20oct@mailinator.com הצטרף/ה למשחק שלך',
      { actorId: 'user_1', requesterName: 'qa.minor.20oct@mailinator.com', link: '/game/g1', titleEn: 'qa.minor.20oct@mailinator.com joined' },
    );
    expect(out.body).toBe('נועה הצטרף/ה למשחק שלך');
    expect(out.data.requesterName).toBe('נועה');
    expect(out.data.titleEn).toBe('נועה joined');
    expect(out.data.link).toBe('/game/g1');
    expect(JSON.stringify(out)).not.toMatch(/@/);
  });

  test('uses משתמש when the actor has no public name', async () => {
    const prisma = { user: { findUnique: jest.fn(async () => ({ name: null })) } };
    const out = await redactNotificationFields(
      prisma,
      'בקשת הצטרפות חדשה',
      'qa@mailinator.com ביקש/ה להצטרף למשחק שלך וממתין/ה לאישורך',
      { actorId: 'user_1' },
    );
    expect(out.body.startsWith('משתמש ')).toBe(true);
    expect(out.body).not.toMatch(/@/);
  });

  test('does not query when nothing looks like an email', async () => {
    const prisma = { user: { findUnique: jest.fn() } };
    const out = await redactNotificationFields(prisma, 'מישהו הצטרף', 'נועה הצטרף/ה למשחק שלך', { actorId: 'user_1' });
    expect(out.body).toBe('נועה הצטרף/ה למשחק שלך');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
