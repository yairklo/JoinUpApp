// Unit test of the delivery gate in NotificationService with a fake prisma — no DB.
jest.mock('firebase-admin', () => ({ apps: [], initializeApp: jest.fn(), credential: { cert: jest.fn() }, messaging: jest.fn() }));

const { NotificationService } = require('../services/notificationService');

function makePrisma({ settings = [], mutes = [] } = {}) {
  let n = 0;
  return {
    userNotificationSettings: { findMany: jest.fn(async ({ where }) => settings.filter(s => where.userId.in.includes(s.userId))) },
    notificationMute: { findMany: jest.fn(async ({ where }) => mutes.filter(m => where.userId.in.includes(m.userId) && where.targetId.in.includes(m.targetId))) },
    notification: { create: jest.fn(async ({ data }) => ({ id: `n${++n}`, createdAt: new Date(), ...data })) },
    userDevice: { findMany: jest.fn(async () => []) },
  };
}

function makeIo() {
  const emit = jest.fn();
  return { emit, io: { to: jest.fn(() => ({ emit })) } };
}

describe('NotificationService preference gate', () => {
  const NOT_QUIET = { quietHoursEnabled: false };

  test('in-app off: no row and no socket event, push still sent', async () => {
    const prisma = makePrisma({ settings: [{ userId: 'u1', ...NOT_QUIET, friendGamesInApp: false }] });
    const svc = new NotificationService(prisma);
    const push = jest.spyOn(svc, 'sendPushToAllDevices').mockResolvedValue();
    const { io, emit } = makeIo();
    const result = await svc.sendNotification('u1', 'FRIEND_NEW_GAME', 't', 'b', { gameId: 'g1', actorId: 'a1' }, io);
    expect(result).toBeNull();
    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledTimes(1);
  });

  test('push off: row + socket but no push', async () => {
    const prisma = makePrisma({ settings: [{ userId: 'u1', invitationsPush: false }] });
    const svc = new NotificationService(prisma);
    const push = jest.spyOn(svc, 'sendPushToAllDevices').mockResolvedValue();
    const { io, emit } = makeIo();
    const row = await svc.sendNotification('u1', 'GAME_INVITATION', 't', 'b', { gameId: 'g1' }, io);
    expect(row.id).toBe('n1');
    expect(emit).toHaveBeenCalledWith('notification', expect.objectContaining({ id: 'n1' }));
    expect(push).not.toHaveBeenCalled();
  });

  test('default city game: in-app only', async () => {
    const svc = new NotificationService(makePrisma());
    const push = jest.spyOn(svc, 'sendPushToAllDevices').mockResolvedValue();
    const row = await svc.sendNotification('u1', 'NEW_GAME_IN_CITY', 't', 'b', { gameId: 'g1' });
    expect(row).not.toBeNull();
    expect(push).not.toHaveBeenCalled();
  });

  test('muted actor suppresses FRIEND_NEW_GAME but not GAME_CANCELLED', async () => {
    const prisma = makePrisma({ mutes: [{ userId: 'u1', targetType: 'USER', targetId: 'a1', until: null }] });
    const svc = new NotificationService(prisma);
    const push = jest.spyOn(svc, 'sendPushToAllDevices').mockResolvedValue();
    expect(await svc.sendNotification('u1', 'FRIEND_NEW_GAME', 't', 'b', { gameId: 'g1', actorId: 'a1' })).toBeNull();
    expect(push).not.toHaveBeenCalled();
    expect(await svc.sendNotification('u1', 'GAME_CANCELLED', 't', 'b', { gameId: 'g1', actorId: 'a1' })).not.toBeNull();
    expect(push).toHaveBeenCalledTimes(1);
  });

  test('sendPushOnly respects messages switch', async () => {
    const prisma = makePrisma({ settings: [{ userId: 'u1', messagesEnabled: false }] });
    const svc = new NotificationService(prisma);
    const push = jest.spyOn(svc, 'sendPushToAllDevices').mockResolvedValue();
    await svc.sendPushOnly('u1', 'NEW_MESSAGE', 't', 'b', { chatId: 'c1' });
    expect(push).not.toHaveBeenCalled();
  });

  test('sendNotificationToMany loads preferences once for the whole batch and isolates failures', async () => {
    const ids = Array.from({ length: 120 }, (_, i) => `u${i}`);
    const prisma = makePrisma({ settings: [{ userId: 'u3', cityGamesInApp: false }] });
    prisma.notification.create.mockImplementation(async ({ data }) => {
      if (data.userId === 'u7') throw new Error('boom');
      return { id: `n_${data.userId}`, createdAt: new Date(), ...data };
    });
    const svc = new NotificationService(prisma);
    jest.spyOn(svc, 'sendPushToAllDevices').mockResolvedValue();
    const stats = await svc.sendNotificationToMany([...ids, 'u1'], 'NEW_GAME_IN_CITY', 't', 'b', { gameId: 'g1', actorId: 'a1' });
    expect(prisma.userNotificationSettings.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.notificationMute.findMany).toHaveBeenCalledTimes(1);
    expect(stats.skipped).toBe(1); // u3
    expect(stats.failed).toBe(1); // u7
    expect(stats.stored).toBe(118); // 121 recipients - u3 skipped - u7 failed
    expect(prisma.notification.create).toHaveBeenCalledTimes(119); // includes u7's failed attempt
  });
});
