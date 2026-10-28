// sendExpoPush picks Hebrew/English copy per device locale — no DB, no network.
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

const { NotificationService, pickPushCopy, normalizeLocale } = require('../services/notificationService');

const EN_DATA = {
  titleEn: 'You were added to a game by Yossi',
  bodyEn: 'Open the app for game details',
  link: '/game/g1',
};

describe('NotificationService.sendExpoPush language', () => {
  const svc = new NotificationService({ userDevice: { deleteMany: jest.fn() } }, null);

  beforeEach(() => mockSend.mockClear());

  const sendTo = async (device, data = EN_DATA) => {
    await svc.sendExpoPush([{ expoPushToken: 'ExponentPushToken[abc]', ...device }], 'GAME_INVITATION',
      'צורפת למשחק על ידי יוסי', 'גוף בעברית', data);
    return mockSend.mock.calls[0][0][0];
  };

  test('an English device gets the English title/body', async () => {
    const msg = await sendTo({ locale: 'en' });
    expect(msg.title).toBe(EN_DATA.titleEn);
    expect(msg.body).toBe(EN_DATA.bodyEn);
  });

  test('a Hebrew device gets Hebrew and English still travels in data', async () => {
    const msg = await sendTo({ locale: 'he' });
    expect(msg.title.startsWith('צורפת למשחק')).toBe(true);
    expect(msg.body).toBe('גוף בעברית');
    expect(msg.data.titleEn).toBe(EN_DATA.titleEn);
  });

  test('a device with no locale defaults to Hebrew', async () => {
    const msg = await sendTo({ locale: null });
    expect(msg.title.startsWith('צורפת למשחק')).toBe(true);
  });

  test('an English device falls back to Hebrew when no English copy was supplied', async () => {
    const msg = await sendTo({ locale: 'en' }, { link: '/game/g1' });
    expect(msg.title.startsWith('צורפת למשחק')).toBe(true);
    expect(msg.body).toBe('גוף בעברית');
  });

  test('English title without English body keeps the Hebrew body', () => {
    expect(pickPushCopy({ locale: 'en' }, 'כ', 'ג', { titleEn: 'T' })).toEqual({ title: 'T', body: 'ג' });
  });
});

describe('normalizeLocale', () => {
  test.each([
    ['en', 'en'], ['en-US', 'en'], ['EN', 'en'], ['he', 'he'], ['he-IL', 'he'], ['iw', 'he'],
    ['fr', null], ['', null], [undefined, null], [42, null],
  ])('%p -> %p', (input, expected) => {
    expect(normalizeLocale(input)).toBe(expected);
  });
});

describe('NotificationService.registerDevice locale', () => {
  const makeSvc = () => {
    const upsert = jest.fn(async ({ create }) => ({ id: 'd1', ...create }));
    return { upsert, svc: new NotificationService({ userDevice: { upsert } }, null) };
  };

  test('stores the normalized locale on create and update', async () => {
    const { svc, upsert } = makeSvc();
    await svc.registerDevice('u1', { expoPushToken: 'ExponentPushToken[abc]' }, 'ios', null, 'en-GB');
    const args = upsert.mock.calls[0][0];
    expect(args.create.locale).toBe('en');
    expect(args.update.locale).toBe('en');
  });

  test('omits locale when not provided or invalid, so an existing value is left alone', async () => {
    const { svc, upsert } = makeSvc();
    await svc.registerDevice('u1', { fcmToken: 'tok' }, 'web');
    await svc.registerDevice('u1', { fcmToken: 'tok' }, 'web', null, 'klingon');
    for (const [args] of upsert.mock.calls) {
      expect(args.create).not.toHaveProperty('locale');
      expect(args.update).not.toHaveProperty('locale');
    }
  });
});
