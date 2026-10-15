// Unit test of the web-push (FCM) payload shape — no DB, no Firebase network.
jest.mock('firebase-admin', () => ({ apps: [], initializeApp: jest.fn(), credential: { cert: jest.fn() }, messaging: jest.fn() }));

const { buildFcmMessage } = require('../services/notificationService');

describe('buildFcmMessage (web push)', () => {
  const msg = buildFcmMessage('tok', 'GAME_INVITATION', 'כותרת', 'גוף', {
    notificationId: 'n1',
    link: '/games/g1',
    gameId: 'g1',
    count: 3,
  });

  test('is data-only so the service worker is the single display path', () => {
    expect(msg).not.toHaveProperty('notification');
    expect(msg).not.toHaveProperty('apns');
    expect(msg.webpush).not.toHaveProperty('notification');
  });

  test('carries title/body/link/notificationId in data, all as strings', () => {
    expect(msg.token).toBe('tok');
    expect(msg.data).toMatchObject({
      type: 'GAME_INVITATION',
      title: 'כותרת',
      body: 'גוף',
      link: '/games/g1',
      notificationId: 'n1',
      gameId: 'g1',
      count: '3',
    });
    for (const v of Object.values(msg.data)) expect(typeof v).toBe('string');
  });

  test('asks for high urgency and defaults link to /', () => {
    const m = buildFcmMessage('tok', 'X', 't', 'b');
    expect(m.webpush.headers).toEqual({ Urgency: 'high' });
    expect(m.data.link).toBe('/');
    expect(m.data.notificationId).toBe('');
    expect(m.webpush.fcmOptions.link).toBe('/');
  });
});
