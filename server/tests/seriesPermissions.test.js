const request = require('supertest');

jest.setTimeout(30000);

jest.mock('../utils/auth', () => ({
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    const tokenMap = {
      mock_token_organizer: { id: 'srs_test_org', name: 'Organizer', avatar: null },
      mock_token_manager: { id: 'srs_test_mgr', name: 'Manager', avatar: null },
      mock_token_promotee: { id: 'srs_test_promotee', name: 'Promotee', avatar: null },
      mock_token_stranger: { id: 'srs_test_str', name: 'Stranger', avatar: null },
    };
    if (!token || !tokenMap[token]) return res.status(401).json({ error: 'Unauthorized' });
    req.user = tokenMap[token];
    return next();
  },
  attachOptionalUser: (req, res, next) => next(),
}));

const { prisma } = require('../services/gameService');
const { app } = require('../index');

describe('Series permission checks reuse canManageSeries consistently', () => {
  let testSeries;

  const orgId = 'srs_test_org';
  const mgrId = 'srs_test_mgr';
  const promoteeId = 'srs_test_promotee';
  const strId = 'srs_test_str';

  const mgrToken = 'mock_token_manager';
  const strToken = 'mock_token_stranger';

  beforeAll(async () => {
    for (const id of [orgId, mgrId, promoteeId, strId]) {
      await prisma.user.upsert({ where: { id }, update: {}, create: { id, name: id, imageUrl: null } });
    }

    testSeries = await prisma.gameSeries.create({
      data: {
        organizerId: orgId,
        fieldName: 'מגרש בדיקה - series permissions',
        fieldLocation: 'רחוב הבדיקות 1',
        maxPlayers: 10,
        time: '20:00',
        duration: 1,
        dayOfWeek: 2,
        type: 'WEEKLY',
        title: 'סדרה לבדיקה',
      },
    });

    await prisma.seriesParticipant.create({
      data: { seriesId: testSeries.id, userId: mgrId, role: 'MANAGER' },
    });
  });

  afterAll(async () => {
    if (testSeries && testSeries.id) {
      try {
        await prisma.game.updateMany({ where: { seriesId: testSeries.id }, data: { seriesId: null } });
        await prisma.seriesParticipant.deleteMany({ where: { seriesId: testSeries.id } });
        await prisma.gameSeries.delete({ where: { id: testSeries.id } });
      } catch (err) {
        console.warn('Clean up of test series skipped:', err.message);
      }
    }
    await prisma.$disconnect();
  });

  test('a series MANAGER can edit series settings via canManageSeries', async () => {
    const res = await request(app)
      .patch(`/api/series/${testSeries.id}`)
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({ title: 'כותרת מעודכנת', updateFutureGames: false });

    expect(res.statusCode).toEqual(200);
    expect(res.body.series.title).toEqual('כותרת מעודכנת');
  });

  test('a series MANAGER can now also change another member\'s role (previously organizer-only)', async () => {
    const res = await request(app)
      .patch(`/api/series/${testSeries.id}/members/${promoteeId}`)
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({ role: 'MANAGER' });

    expect(res.statusCode).toEqual(200);
    const participant = await prisma.seriesParticipant.findUnique({
      where: { seriesId_userId: { seriesId: testSeries.id, userId: promoteeId } },
    });
    expect(participant.role).toEqual('MANAGER');
  });

  test('a non-manager stranger still cannot change member roles', async () => {
    const res = await request(app)
      .patch(`/api/series/${testSeries.id}/members/${mgrId}`)
      .set('Authorization', `Bearer ${strToken}`)
      .send({ role: 'MEMBER' });

    expect(res.statusCode).toEqual(403);
  });

  test('a non-manager stranger still cannot edit series settings', async () => {
    const res = await request(app)
      .patch(`/api/series/${testSeries.id}`)
      .set('Authorization', `Bearer ${strToken}`)
      .send({ title: 'לא אמור לעבוד', updateFutureGames: false });

    expect(res.statusCode).toEqual(403);
  });
});
