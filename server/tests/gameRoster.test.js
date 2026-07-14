const request = require('supertest');

// 1. Mocking authentication
jest.mock('../utils/auth', () => ({
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'No token provided' });

    if (token === 'mock_token_organizer') {
      req.user = { id: 'user_org_123', name: 'Organizer', avatar: 'org_img' };
    } else if (token === 'mock_token_player1') {
      req.user = { id: 'user_play_1', name: 'Player 1', avatar: 'p1_img' };
    } else if (token === 'mock_token_player2') {
      req.user = { id: 'user_play_2', name: 'Player 2', avatar: 'p2_img' };
    } else if (token === 'mock_token_player3') {
      req.user = { id: 'user_play_3', name: 'Player 3', avatar: 'p3_img' };
    } else {
      return res.status(403).json({ error: 'Invalid token' });
    }
    return next();
  },
  attachOptionalUser: (req, res, next) => {
    req.user = { id: 'user_org_123', name: 'Organizer', avatar: 'org_img' };
    return next();
  }
}));

// 2. Mocking workers safely
jest.mock('../workers/reviewWorker', () => ({
  processReviewQueue: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../workers/gameReminderWorker', () => ({
  startGameReminderWorker: jest.fn().mockResolvedValue(undefined),
  checkUpcomingGames: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../workers/cleanupWorker', () => ({
  startCleanupWorker: jest.fn().mockResolvedValue(undefined),
  runCleanup: jest.fn().mockResolvedValue(undefined)
}));

const { prisma } = require('../services/gameService');

// טוענים את השרת כדי שיעלה ברקע עם כל ה-Mocks שלנו
require('../index'); 

const app = 'http://127.0.0.1:3005'; 

describe('Game Roster & Waitlist Integration Tests', () => {
  let testGame;
  let testField;
  let organizerToken;
  let player1Token;
  let player2Token;
  let player3Token;

  const testOrganizerId = 'user_org_123';
  const testPlayer1Id = 'user_play_1';
  const testPlayer2Id = 'user_play_2';
  const testPlayer3Id = 'user_play_3';

  beforeAll(async () => {
    // א. יצירת/עדכון משתמשי בדיקה ב-DB (לא פוגע בנתונים קיימים)
    await prisma.user.upsert({
      where: { id: testOrganizerId },
      update: {},
      create: { id: testOrganizerId, name: 'Organizer', imageUrl: 'org_img' }
    });

    // ב. יצירת מגרש בדיקה ייעודי לטסט כדי לעבור ולידציה ב-gameService
    testField = await prisma.field.create({
      data: {
        name: 'מגרש בדיקה לטסטים',
        location: 'רחוב הבדיקות 123, תל אביב',
        city: 'תל אביב',
        price: 100,
        rating: 5,
        available: false, // לא יופיע בחיפושים ציבוריים באפליקציה
        type: 'OPEN'
      }
    });
    
    organizerToken = 'mock_token_organizer';
    player1Token = 'mock_token_player1';
    player2Token = 'mock_token_player2';
    player3Token = 'mock_token_player3';
  });

  afterAll(async () => {
    // 🛡️ ניקוי בטוח וממוקד בלבד של הרשומות שנוצרו בטסט
    if (testGame && testGame.id) {
      try {
        await prisma.participation.deleteMany({ where: { gameId: testGame.id } });
        await prisma.gameRole.deleteMany({ where: { gameId: testGame.id } });
        await prisma.team.deleteMany({ where: { gameId: testGame.id } });
        await prisma.chatParticipant.deleteMany({ where: { chatId: testGame.id } });
        await prisma.chatRoom.deleteMany({ where: { id: testGame.id } });
        await prisma.game.delete({ where: { id: testGame.id } });
      } catch (err) {
        console.warn('Clean up of test game skipped:', err.message);
      }
    }

    if (testField && testField.id) {
      try {
        await prisma.field.delete({ where: { id: testField.id } });
      } catch (err) {
        console.warn('Clean up of test field skipped:', err.message);
      }
    }

    await prisma.$disconnect();
    
    if (app && typeof app.close === 'function') {
      await app.close();
    }
  });

  // --- טסט 1: יצירת משחק חדש על ידי המארגן ---
  test('1. Should create a new game successfully (Max Players: 2)', async () => {
    const res = await request(app)
      .post('/api/games')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        title: 'משחק בדיקה רוסטר',
        maxPlayers: 2,
        fieldId: testField.id, // חיוני! שולחים את המגרש שיצרנו כדי לעבור ולידציה
        start: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        duration: 1,
        sport: 'SOCCER',
        isOpenToJoin: true,
        joinPolicy: 'INSTANT'
      });

    expect(res.statusCode).toEqual(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.maxPlayers).toEqual(2);
    expect(res.body.confirmedCount).toEqual(1);
    
    testGame = res.body;
  });

  // --- טסט 2: שחקן ראשון מצטרף ---
  test('2. Player 1 joins - game should reach capacity (2/2)', async () => {
    const res = await request(app)
      .post(`/api/games/${testGame.id}/join`)
      .set('Authorization', `Bearer ${player1Token}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.confirmedCount).toEqual(2);
    expect(res.body.waitlistCount).toEqual(0);
  });

  // --- טסט 3: שחקן שני מנסה להצטרף כשהמשחק מלא -> נכנס להמתנה ---
  test('3. Player 2 joins full game -> should be placed on WAITLIST', async () => {
    const res = await request(app)
      .post(`/api/games/${testGame.id}/join`)
      .set('Authorization', `Bearer ${player2Token}`);

    expect(res.statusCode).toEqual(200);
    
    const participation = await prisma.participation.findFirst({
      where: { gameId: testGame.id, userId: testPlayer2Id }
    });
    expect(participation.status).toEqual('WAITLISTED');
  });

  // --- טסט 4: שחקן שלישי נכנס גם הוא להמתנה ---
  test('4. Player 3 joins full game -> should be placed on WAITLIST (position 2)', async () => {
    await request(app)
      .post(`/api/games/${testGame.id}/join`)
      .set('Authorization', `Bearer ${player3Token}`);

    const res = await request(app)
      .get(`/api/games/${testGame.id}/join-requests`)
      .set('Authorization', `Bearer ${organizerToken}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.waitlist.length).toEqual(2);
    expect(res.body.waitlist[0].userId).toEqual(testPlayer2Id);
    expect(res.body.waitlist[1].userId).toEqual(testPlayer3Id);
  });

  // --- טסט 5: שחקן מאושר (Player 1) עוזב -> שחקן 2 מקבל הצעה (PENDING) ---
  test('5. Player 1 leaves -> Player 2 should automatically get a PENDING offer', async () => {
    const res = await request(app)
      .post(`/api/games/${testGame.id}/leave`)
      .set('Authorization', `Bearer ${player1Token}`);

    expect(res.statusCode).toEqual(200);
    
    const partPlayer2 = await prisma.participation.findFirst({
      where: { gameId: testGame.id, userId: testPlayer2Id }
    });
    expect(partPlayer2.status).toEqual('PENDING');
    expect(partPlayer2.isWaitlistOffer).toEqual(true);
  });

  // --- טסט 6: שחקן 2 מאשר את ההצעה ---
  test('6. Player 2 confirms waitlist offer -> status changes to CONFIRMED', async () => {
    const res = await request(app)
      .post(`/api/games/${testGame.id}/waitlist-confirm`)
      .set('Authorization', `Bearer ${player2Token}`)
      .send({ accept: true });

    expect(res.statusCode).toEqual(200);
    expect(res.body.confirmedCount).toEqual(2);

    const partPlayer2 = await prisma.participation.findFirst({
      where: { gameId: testGame.id, userId: testPlayer2Id }
    });
    expect(partPlayer2.status).toEqual('CONFIRMED');
    expect(partPlayer2.isWaitlistOffer).toEqual(false);
  });
});