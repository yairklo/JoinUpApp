const request = require('supertest');

jest.setTimeout(30000);

jest.mock('../utils/auth', () => {
  const tokenMap = {
    mock_token_qa_alice: { id: 'qa_r_alice', name: 'qa.alice@mailinator.com', avatar: null },
    mock_token_qa_bob: { id: 'qa_r_bob', name: 'Bob', avatar: null },
    mock_token_qa_minor: { id: 'qa_r_minor', name: 'qa.minor.20oct@mailinator.com', avatar: null },
    mock_token_qa_stranger: { id: 'qa_r_stranger', name: 'Stranger', avatar: null },
    mock_token_qa_friend: { id: 'qa_r_friend', name: 'Friend', avatar: null },
  };
  const userFor = (req) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    return token ? tokenMap[token] : undefined;
  };
  return {
    authenticateToken: (req, res, next) => {
      const user = userFor(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });
      req.user = user;
      return next();
    },
    attachOptionalUser: (req, res, next) => {
      const user = userFor(req);
      if (user) req.user = user;
      next();
    },
    invalidateAccountState: jest.fn(),
  };
});

jest.mock('../workers/reviewWorker', () => ({ processReviewQueue: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../workers/gameReminderWorker', () => ({
  startGameReminderWorker: jest.fn().mockResolvedValue(undefined),
  checkUpcomingGames: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../workers/cleanupWorker', () => ({
  startCleanupWorker: jest.fn().mockResolvedValue(undefined),
  runCleanup: jest.fn().mockResolvedValue(undefined),
}));

const { prisma, mapGameForSearchClient } = require('../services/gameService');
const { app } = require('../index');

const alice = 'qa_r_alice';
const bob = 'qa_r_bob';
const minor = 'qa_r_minor';
const stranger = 'qa_r_stranger';
const friend = 'qa_r_friend';
const ids = [alice, bob, minor, stranger, friend];
const aliceAuth = 'Bearer mock_token_qa_alice';
const bobAuth = 'Bearer mock_token_qa_bob';
const minorAuth = 'Bearer mock_token_qa_minor';
const strangerAuth = 'Bearer mock_token_qa_stranger';
const friendAuth = 'Bearer mock_token_qa_friend';

function orderPair(a, b) {
  return a < b ? [a, b] : [b, a];
}

// A fixed 2012 birthdate turns 18 in 2030 and breaks the minor assertions.
// Day 15 of the month 14 years ago is always age 13 or 14 in Jerusalem.
function minorBirthDate(now = new Date()) {
  const [year, month] = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
  }).format(now).split('-').map(Number);
  return new Date(Date.UTC(year - 14, month - 1, 15));
}

async function cleanup() {
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await prisma.userSport.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await prisma.friendship.deleteMany({
    where: { OR: [{ userAId: { in: ids } }, { userBId: { in: ids } }] },
  }).catch(() => {});
  await prisma.friendRequest.deleteMany({
    where: { OR: [{ requesterId: { in: ids } }, { receiverId: { in: ids } }] },
  }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
}

describe('QA privacy and notification fixes', () => {
  beforeAll(async () => {
    await cleanup();
    await prisma.sport.upsert({
      where: { name: 'qa_r_soccer' },
      update: {},
      create: { id: 'qa_r_soccer', name: 'qa_r_soccer' },
    });
    await prisma.user.create({
      data: {
        id: alice,
        name: 'qa.alice@mailinator.com',
        birthDate: new Date('1992-04-01T00:00:00.000Z'),
      },
    });
    await prisma.user.create({
      data: {
        id: bob,
        name: 'Bob',
        birthDate: new Date('1990-01-15T00:00:00.000Z'),
      },
    });
    await prisma.user.create({
      data: {
        id: minor,
        name: 'qa.minor.20oct@mailinator.com',
        // 14 years before today, so "age < 18" still holds after 2030.
        birthDate: minorBirthDate(),
        city: 'תל אביב',
        gender: 'MALE',
        sports: { create: [{ sportId: 'qa_r_soccer', positionDescription: 'שוער' }] },
      },
    });
    await prisma.user.create({ data: { id: stranger, name: 'Stranger', birthDate: new Date('1991-06-01T00:00:00.000Z') } });
    await prisma.user.create({ data: { id: friend, name: 'Friend', birthDate: new Date('1988-06-01T00:00:00.000Z') } });
    const [a, b] = orderPair(minor, friend);
    await prisma.friendship.create({ data: { userAId: a, userBId: b } });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.sport.deleteMany({ where: { id: 'qa_r_soccer' } }).catch(() => {});
  });

  beforeEach(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.friendRequest.deleteMany({
      where: { OR: [{ requesterId: { in: ids } }, { receiverId: { in: ids } }] },
    });
  });

  test('R-04 creating a friend request stores a bell notification without an email', async () => {
    const send = await request(app).post('/api/users/requests').set('Authorization', aliceAuth).send({ receiverId: bob });
    expect(send.statusCode).toEqual(201);
    const note = await prisma.notification.findFirst({
      where: { userId: bob, type: 'FRIEND_REQUEST' },
      orderBy: { createdAt: 'desc' },
    });
    expect(note).toBeTruthy();
    expect(note.data.friendRequestId).toEqual(send.body.id);
    expect(note.body).toContain('משתמש');
    expect(note.body).not.toMatch(/@/);
    expect(JSON.stringify(note.data)).not.toMatch(/@/);
  });

  test('R-04 a pending request with no notification is repaired instead of 400', async () => {
    const send = await request(app).post('/api/users/requests').set('Authorization', aliceAuth).send({ receiverId: bob });
    expect(send.statusCode).toEqual(201);
    await prisma.notification.deleteMany({ where: { userId: bob, type: 'FRIEND_REQUEST' } });

    const again = await request(app).post('/api/users/requests').set('Authorization', aliceAuth).send({ receiverId: bob });
    expect(again.statusCode).toEqual(200);
    expect(again.body.id).toEqual(send.body.id);
    expect(await prisma.friendRequest.count({ where: { requesterId: alice, receiverId: bob } })).toEqual(1);

    const notes = await prisma.notification.findMany({ where: { userId: bob, type: 'FRIEND_REQUEST' } });
    expect(notes).toHaveLength(1);
    expect(notes[0].data.friendRequestId).toEqual(send.body.id);
  });

  test('R-04 the other direction of a pending request is a distinct error', async () => {
    const send = await request(app).post('/api/users/requests').set('Authorization', aliceAuth).send({ receiverId: bob });
    expect(send.statusCode).toEqual(201);
    const reverse = await request(app).post('/api/users/requests').set('Authorization', bobAuth).send({ receiverId: alice });
    expect(reverse.statusCode).toEqual(400);
    expect(reverse.body.code).toEqual('INCOMING_REQUEST_EXISTS');
  });

  test('R-01 served notifications replace stored emails with משתמש', async () => {
    await prisma.notification.create({
      data: {
        userId: bob,
        type: 'FRIEND_NEW_GAME',
        title: 'test2@gmail.com פתח/ה משחק',
        body: 'qa.minor.20oct@mailinator.com ביקש/ה להצטרף',
        data: { actorName: 'test2@gmail.com', link: '/games/1' },
      },
    });
    const res = await request(app).get('/api/notifications').set('Authorization', bobAuth);
    expect(res.statusCode).toEqual(200);
    const row = res.body.notifications.find((n) => n.type === 'FRIEND_NEW_GAME');
    expect(row).toBeTruthy();
    expect(row.title).toBe('משתמש פתח/ה משחק');
    expect(row.body).toBe('משתמש ביקש/ה להצטרף');
    expect(row.data.actorName).toBe('משתמש');
    expect(JSON.stringify(row)).not.toMatch(/@/);
  });

  test('R-03 a stranger viewing a minor does not see age or contact actions', async () => {
    const res = await request(app).get(`/api/users/${minor}`).set('Authorization', strangerAuth);
    expect(res.statusCode).toEqual(200);
    expect(res.body.profileRestricted).toEqual(true);
    expect(res.body.canMessage).toEqual(false);
    expect(res.body.canAddFriend).toEqual(false);
    expect(res.body.age).toBeUndefined();
    expect(res.body.gender).toBeUndefined();
    expect(res.body.city).toBeUndefined();
    expect(res.body.sports).toEqual([]);
    expect(res.body.name).toEqual('משתמש');
    expect(JSON.stringify(res.body)).not.toMatch(/@/);
  });

  test('R-03 a friend and the owner still see the minor age', async () => {
    const asFriend = await request(app).get(`/api/users/${minor}`).set('Authorization', friendAuth);
    expect(asFriend.statusCode).toEqual(200);
    expect(asFriend.body.profileRestricted).toEqual(false);
    expect(asFriend.body.age).toBeGreaterThanOrEqual(13);
    expect(asFriend.body.age).toBeLessThan(18);
    expect(asFriend.body.city).toEqual('תל אביב');
    expect(asFriend.body.gender).toEqual('MALE');
    expect(asFriend.body.sports).toEqual([
      expect.objectContaining({ name: 'qa_r_soccer', position: 'שוער' }),
    ]);
    expect(asFriend.body.canMessage).toEqual(true);
    expect(asFriend.body.canAddFriend).toEqual(true);

    const asOwner = await request(app).get(`/api/users/${minor}`).set('Authorization', minorAuth);
    expect(asOwner.body.profileRestricted).toEqual(false);
    expect(asOwner.body.age).toBeGreaterThanOrEqual(13);
    expect(asOwner.body.canAddFriend).toEqual(true);
  });

  test('R-03 a stranger cannot send a friend request to a default minor profile', async () => {
    const res = await request(app).post('/api/users/requests').set('Authorization', strangerAuth).send({ receiverId: minor });
    expect(res.statusCode).toEqual(403);
    expect(res.body.code).toEqual('PROFILE_FRIENDS_ONLY');
    expect(await prisma.friendRequest.count({ where: { requesterId: stranger, receiverId: minor } })).toEqual(0);
  });

  test('logged-out game lists omit participant ids and keep the field location', () => {
    const game = {
      id: 'g1',
      title: 'Evening',
      seriesId: null,
      fieldId: 'f1',
      imageUrl: null,
      customLat: 32.1,
      customLng: 34.8,
      customLocation: null,
      start: new Date('2026-11-01T18:00:00Z'),
      duration: 60,
      maxPlayers: 10,
      price: 0,
      teamSize: null,
      registrationOpensAt: null,
      joinPolicy: 'OPEN',
      organizerId: 'org1',
      status: 'OPEN',
      isOpenToJoin: true,
      isFriendsOnly: false,
      field: {
        id: 'f1',
        name: 'Field',
        location: 'Loc',
        city: 'TLV',
        lat: 32.07,
        lng: 34.78,
        image: null,
      },
      participants: [
        { userId: 'u1', status: 'CONFIRMED' },
        { userId: 'u2', status: 'CONFIRMED' },
      ],
    };

    const anon = mapGameForSearchClient(game, null);
    expect(anon.participants).toEqual([]);
    expect(anon.organizerId).toEqual('org1');
    expect(anon.fieldLat).toEqual(32.07);
    expect(anon.fieldLng).toEqual(34.78);
    expect(anon.field.lat).toEqual(32.07);
    expect(anon.field.lng).toEqual(34.78);
    expect(anon.customLat).toEqual(32.1);
    expect(anon.currentPlayers).toEqual(2);

    const signedIn = mapGameForSearchClient(game, 'u1');
    expect(signedIn.participants).toEqual([{ id: 'u1' }, { id: 'u2' }]);
  });
});
