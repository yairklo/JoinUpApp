const request = require('supertest');

jest.setTimeout(30000);

jest.mock('../utils/auth', () => ({
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    const tokenMap = {
      mock_token_org: { id: 'sam_org', name: 'Dana Organizer', avatar: null },
      mock_token_str: { id: 'sam_stranger', name: 'Stranger', avatar: null },
    };
    if (!token || !tokenMap[token]) return res.status(401).json({ error: 'Unauthorized' });
    req.user = tokenMap[token];
    return next();
  },
  attachOptionalUser: (req, res, next) => next(),
}));

const { prisma, notificationService } = require('../services/gameService');
const { app } = require('../index');

describe('POST /api/series/:id/members notifications', () => {
  const orgId = 'sam_org';
  const strId = 'sam_stranger';
  const newId = 'sam_new';
  const existingId = 'sam_existing';
  const blockedId = 'sam_blocked';
  const userIds = [orgId, strId, newId, existingId, blockedId];
  let series;
  let sendSpy;

  beforeAll(async () => {
    for (const id of userIds) {
      await prisma.user.upsert({ where: { id }, update: {}, create: { id, name: id, imageUrl: null } });
    }
    series = await prisma.gameSeries.create({
      data: {
        organizerId: orgId,
        fieldName: 'מגרש בדיקה - add members',
        fieldLocation: 'רחוב הבדיקות 1',
        maxPlayers: 10,
        time: '20:00',
        duration: 1,
        dayOfWeek: 2,
        type: 'WEEKLY',
        title: 'קבוצת בדיקה',
      },
    });
    await prisma.seriesParticipant.create({ data: { seriesId: series.id, userId: existingId, role: 'MEMBER' } });
    await prisma.userBlock.create({ data: { blockerId: orgId, blockedId: blockedId } });
  });

  beforeEach(() => {
    sendSpy = jest.spyOn(notificationService, 'sendNotification').mockResolvedValue(undefined);
  });

  afterEach(() => {
    sendSpy.mockRestore();
  });

  afterAll(async () => {
    try {
      await prisma.seriesParticipant.deleteMany({ where: { seriesId: series.id } });
      await prisma.gameSeries.delete({ where: { id: series.id } });
      await prisma.userBlock.deleteMany({ where: { blockerId: orgId, blockedId } });
    } catch (err) {
      console.warn('Clean up skipped:', err.message);
    }
    await prisma.$disconnect();
  });

  const add = (ids, token = 'mock_token_org') =>
    request(app).post(`/api/series/${series.id}/members`).set('Authorization', `Bearer ${token}`).send({ userIds: ids });

  test('notifies a newly added member exactly once and counts only new users', async () => {
    const res = await add([newId, existingId]);
    expect(res.statusCode).toEqual(200);
    expect(res.body.added).toEqual(1);
    expect(sendSpy).toHaveBeenCalledTimes(1);
    const [userId, type, , message, data] = sendSpy.mock.calls[0];
    expect(userId).toEqual(newId);
    expect(type).toEqual('GAME_INVITATION');
    expect(message).toContain('קבוצת בדיקה');
    expect(data).toMatchObject({ seriesId: series.id, link: `/series/${series.id}` });
  });

  test('does not notify on re-adds', async () => {
    const res = await add([newId, existingId]);
    expect(res.statusCode).toEqual(200);
    expect(res.body.added).toEqual(0);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  test('skips blocked users and the adder', async () => {
    const res = await add([blockedId, orgId]);
    // organizer id is filtered out before the empty check, blocked id is dropped afterwards
    expect(res.statusCode).toEqual(200);
    expect(res.body.added).toEqual(0);
    expect(sendSpy).not.toHaveBeenCalled();
    const row = await prisma.seriesParticipant.findFirst({ where: { seriesId: series.id, userId: blockedId } });
    expect(row).toBeNull();
  });

  test('non-managers still get 403 and nothing is sent', async () => {
    const res = await add([newId], 'mock_token_str');
    expect(res.statusCode).toEqual(403);
    expect(sendSpy).not.toHaveBeenCalled();
  });
});
