// sendExpoPush must send the Hebrew title/body even when bilingual data is present — no DB, no network.
const mockSend = jest.fn(async (chunk) => chunk.map(() => ({ status: 'ok', id: 't' })));

jest.mock('firebase-admin', () => ({ apps: [], initializeApp: jest.fn(), credential: { cert: jest.fn() }, messaging: jest.fn() }));
jest.mock('expo-server-sdk', () => {
  class Expo {
    static isExpoPushToken(t) { return typeof t === 'string' && t.startsWith('ExponentPushToken['); }
    chunkPushNotifications(messages) { return [messages]; }
    sendPushNotificationsAsync(chunk) { return mockSend(chunk); }
  }
  return { Expo };
});

const { NotificationService } = require('../services/notificationService');

describe('NotificationService.sendExpoPush language', () => {
  const svc = new NotificationService({ userDevice: { deleteMany: jest.fn() } }, null);
  const devices = [{ expoPushToken: 'ExponentPushToken[abc]' }];

  beforeEach(() => mockSend.mockClear());

  test('sends Hebrew title/body and keeps English in data', async () => {
    await svc.sendExpoPush(devices, 'GAME_INVITATION', 'צורפת למשחק על ידי יוסי', 'גוף בעברית', {
      titleEn: 'You were added to a game by Yossi',
      bodyEn: 'Open the app for game details',
      link: '/game/g1',
    });
    const [msg] = mockSend.mock.calls[0][0];
    expect(msg.title.startsWith('צורפת למשחק')).toBe(true);
    expect(msg.body).toBe('גוף בעברית');
    expect(msg.data.titleEn).toBe('You were added to a game by Yossi');
    expect(msg.data.bodyEn).toBe('Open the app for game details');
  });
});
