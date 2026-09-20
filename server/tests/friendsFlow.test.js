const request = require('supertest');

jest.setTimeout(30000);

jest.mock('../utils/auth', () => ({
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    const tokenMap = {
      mock_token_alice: { id: 'ff_test_alice', name: 'Alice', avatar: null },
      mock_token_bob: { id: 'ff_test_bob', name: 'Bob', avatar: null },
    };
    if (!token || !tokenMap[token]) return res.status(401).json({ error: 'Unauthorized' });
    req.user = tokenMap[token];
    return next();
  },
  attachOptionalUser: (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token === 'mock_token_alice') req.user = { id: 'ff_test_alice', name: 'Alice', avatar: null };
    if (token === 'mock_token_bob') req.user = { id: 'ff_test_bob', name: 'Bob', avatar: null };
    next();
  },
}));

jest.mock('../workers/reviewWorker', () => ({ processReviewQueue: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../workers/gameReminderWorker', () => ({
  startGameReminderWorker: jest.fn().mockResolvedValue(undefined),
  checkUpcomingGames: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../workers/cleanupWorker', () => ({
  startCleanupWorker: jest.fn().mockResolvedValue(undefined),
  runCleanup: jest.fn().mockResolvedValue(undefined),
}));

const { prisma } = require('../services/gameService');
const { app } = require('../index');

describe('friend request -> notification -> accept flow', () => {
  const alice = 'ff_test_alice';
  const bob = 'ff_test_bob';
  const aliceAuth = 'Bearer mock_token_alice';
  const bobAuth = 'Bearer mock_token_bob';

  const cleanup = async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: [alice, bob] } } }).catch(() => {});
    await prisma.friendship.deleteMany({ where: { OR: [{ userAId: { in: [alice, bob] } }, { userBId: { in: [alice, bob] } }] } });
    await prisma.friendRequest.deleteMany({ where: { OR: [{ requesterId: { in: [alice, bob] } }, { receiverId: { in: [alice, bob] } }] } });
  };

  beforeAll(async () => {
    for (const id of [alice, bob]) {
      await prisma.user.upsert({ where: { id }, update: {}, create: { id, name: id, imageUrl: null } });
    }
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.user.deleteMany({ where: { id: { in: [alice, bob] } } }).catch(() => {});
    await prisma.$disconnect();
  });

  let requestId;

  test('alice sends a request; bob sees it as incoming and gets a notification', async () => {
    const send = await request(app).post('/api/users/requests').set('Authorization', aliceAuth).send({ receiverId: bob });
    expect(send.statusCode).toEqual(201);
    requestId = send.body.id;

    const incoming = await request(app).get(`/api/users/${bob}/requests/incoming`).set('Authorization', bobAuth);
    expect(incoming.statusCode).toEqual(200);
    expect(incoming.body.map((r) => r.id)).toContain(requestId);

    const notif = await prisma.notification.findFirst({ where: { userId: bob, type: 'FRIEND_REQUEST' }, orderBy: { createdAt: 'desc' } });
    expect(notif).toBeTruthy();
  });

  test('bob accepting makes both users friends, visible from both sides', async () => {
    const accept = await request(app).post(`/api/users/requests/${requestId}/accept`).set('Authorization', bobAuth);
    expect(accept.statusCode).toEqual(200);

    const bobFriends = await request(app).get(`/api/users/${bob}/friends`).set('Authorization', bobAuth);
    expect(bobFriends.body.map((f) => f.id)).toEqual([alice]);

    const aliceFriends = await request(app).get(`/api/users/${alice}/friends`).set('Authorization', aliceAuth);
    expect(aliceFriends.body.map((f) => f.id)).toEqual([bob]);

    const incoming = await request(app).get(`/api/users/${bob}/requests/incoming`).set('Authorization', bobAuth);
    expect(incoming.body).toEqual([]);
  });
});

describe('friend request edge cases', () => {
  const alice = 'ff_test_alice';
  const bob = 'ff_test_bob';
  const aliceAuth = 'Bearer mock_token_alice';
  const bobAuth = 'Bearer mock_token_bob';

  beforeEach(async () => {
    await prisma.friendship.deleteMany({ where: { OR: [{ userAId: { in: [alice, bob] } }, { userBId: { in: [alice, bob] } }] } });
    await prisma.friendRequest.deleteMany({ where: { OR: [{ requesterId: { in: [alice, bob] } }, { receiverId: { in: [alice, bob] } }] } });
  });

  test('a declined request cannot be re-sent right away by the same person (no spamming the decliner)', async () => {
    const first = await request(app).post('/api/users/requests').set('Authorization', aliceAuth).send({ receiverId: bob });
    expect(first.statusCode).toEqual(201);
    const decline = await request(app).post(`/api/users/requests/${first.body.id}/decline`).set('Authorization', bobAuth);
    expect(decline.statusCode).toEqual(200);

    const notificationsBefore = await prisma.notification.count({ where: { userId: bob, type: 'FRIEND_REQUEST' } });
    const again = await request(app).post('/api/users/requests').set('Authorization', aliceAuth).send({ receiverId: bob });
    expect(again.statusCode).toEqual(400);
    expect(again.body.code).toEqual('REQUEST_DECLINED_RECENTLY');
    expect(await prisma.notification.count({ where: { userId: bob, type: 'FRIEND_REQUEST' } })).toEqual(notificationsBefore);
  });

  test('after the cooldown the same person may ask again; a still-pending request is rejected', async () => {
    const first = await request(app).post('/api/users/requests').set('Authorization', aliceAuth).send({ receiverId: bob });
    await request(app).post(`/api/users/requests/${first.body.id}/decline`).set('Authorization', bobAuth);
    await prisma.friendRequest.update({
      where: { id: first.body.id },
      data: { createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) },
    });

    const again = await request(app).post('/api/users/requests').set('Authorization', aliceAuth).send({ receiverId: bob });
    expect(again.statusCode).toEqual(201);
    const dup = await request(app).post('/api/users/requests').set('Authorization', aliceAuth).send({ receiverId: bob });
    expect(dup.statusCode).toEqual(400);
  });

  test('the other side can request after being declined', async () => {
    const first = await request(app).post('/api/users/requests').set('Authorization', aliceAuth).send({ receiverId: bob });
    await request(app).post(`/api/users/requests/${first.body.id}/decline`).set('Authorization', bobAuth);
    const reverse = await request(app).post('/api/users/requests').set('Authorization', bobAuth).send({ receiverId: alice });
    expect(reverse.statusCode).toEqual(201);
  });

  test('friend request notification and accepted notification carry usable links', async () => {
    const sent = await request(app).post('/api/users/requests').set('Authorization', aliceAuth).send({ receiverId: bob });
    const n = await prisma.notification.findFirst({ where: { userId: bob, type: 'FRIEND_REQUEST' }, orderBy: { createdAt: 'desc' } });
    expect(n.data.friendRequestId).toEqual(sent.body.id);
    expect(n.data.requesterId).toEqual(alice);

    await request(app).post(`/api/users/requests/${sent.body.id}/accept`).set('Authorization', bobAuth);
    const accepted = await prisma.notification.findFirst({ where: { userId: alice, type: 'FRIEND_ACCEPTED' }, orderBy: { createdAt: 'desc' } });
    expect(accepted.data.userId).toEqual(bob);
    expect(accepted.data.link).toEqual(`/user/${bob}`);
  });
});

describe('profile name validation and reserved user ids', () => {
  const alice = 'ff_test_alice';
  const aliceAuth = 'Bearer mock_token_alice';

  test.each(['', '   ', 'a', null, 42])('rejects an empty/too short display name (%p)', async (bad) => {
    const before = await prisma.user.findUnique({ where: { id: alice } });
    const res = await request(app).put(`/api/users/${alice}`).set('Authorization', aliceAuth).send({ name: bad });
    expect(res.statusCode).toEqual(400);
    const after = await prisma.user.findUnique({ where: { id: alice } });
    expect(after.name).toEqual(before.name);
  });

  test('saves a valid name, trimmed and stripped of HTML', async () => {
    const res = await request(app).put(`/api/users/${alice}`).set('Authorization', aliceAuth).send({ name: '  <b>Alice</b> Test ' });
    expect(res.statusCode).toEqual(200);
    expect(res.body.name).toEqual('Alice Test');
  });

  test('an update that does not touch the name still works', async () => {
    const res = await request(app).put(`/api/users/${alice}`).set('Authorization', aliceAuth).send({ city: 'תל אביב' });
    expect(res.statusCode).toEqual(200);
  });

  test('GET /api/users/friends requires auth and is never read as a user id', async () => {
    const res = await request(app).get('/api/users/friends').set('Authorization', 'Bearer nope');
    expect(res.statusCode).toEqual(401);
    const ok = await request(app).get('/api/users/friends').set('Authorization', aliceAuth);
    expect(ok.statusCode).toEqual(200);
    expect(Array.isArray(ok.body)).toBe(true);
    expect(await prisma.user.findUnique({ where: { id: 'friends' } })).toBeNull();
  });

  test('other reserved words 404 instead of creating placeholder users', async () => {
    const res = await request(app).get('/api/users/notifications');
    expect(res.statusCode).toEqual(404);
    expect(await prisma.user.findUnique({ where: { id: 'notifications' } })).toBeNull();
  });
});
