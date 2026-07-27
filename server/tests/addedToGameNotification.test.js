const {
  buildAddedToGameCopy,
  formatGameWhen,
  resolveLocation,
  notifyUserAddedToGame,
} = require('../utils/addedToGameNotification');

describe('addedToGameNotification helpers', () => {
  const sampleStart = new Date('2026-07-27T15:00:00.000Z'); // 18:00 Asia/Jerusalem (UTC+3 in July)

  test('formatGameWhen returns Jerusalem date/time', () => {
    const he = formatGameWhen(sampleStart, 'he-IL');
    expect(he.time).toMatch(/18:00/);
    expect(he.date).toBeTruthy();
  });

  test('resolveLocation prefers field name · location', () => {
    expect(
      resolveLocation({
        field: { name: 'מגרש מרכז', location: 'תל אביב', city: 'תל אביב' },
      })
    ).toBe('מגרש מרכז · תל אביב');
    expect(resolveLocation({ customLocation: 'חוף הים' })).toBe('חוף הים');
    expect(resolveLocation({})).toBe('');
  });

  test('buildAddedToGameCopy uses product Hebrew + English wording', () => {
    const copy = buildAddedToGameCopy({
      adderName: 'יוסי',
      game: {
        id: 'g1',
        title: 'כדורגל ערב',
        start: sampleStart,
        field: { name: 'מגרש מרכז', location: 'תל אביב' },
      },
    });

    expect(copy.title).toBe('צורפת למשחק על ידי יוסי');
    expect(copy.titleEn).toBe('You were added to a game by יוסי');
    expect(copy.body).toContain('18:00');
    expect(copy.body).toContain('מגרש מרכז');
    expect(copy.bodyEn).toContain('18:00');
    expect(copy.bodyEn).toContain('מגרש מרכז');
  });

  test('buildAddedToGameCopy falls back when adder name missing', () => {
    const copy = buildAddedToGameCopy({
      adderName: '',
      game: { id: 'g1', start: sampleStart, title: 'Game' },
    });
    expect(copy.title).toContain('מנהל המשחק');
    expect(copy.titleEn).toContain('a game manager');
  });

  test('notifyUserAddedToGame sends GAME_INVITATION with bilingual data', async () => {
    const sendNotification = jest.fn().mockResolvedValue({ id: 'n1' });
    const notificationService = { sendNotification };

    await notifyUserAddedToGame(notificationService, {
      userId: 'user_play_1',
      adderName: 'Organizer',
      adderId: 'user_org_123',
      game: {
        id: 'game_abc',
        start: sampleStart,
        field: { name: 'Field A', location: 'Tel Aviv' },
      },
      io: null,
    });

    expect(sendNotification).toHaveBeenCalledTimes(1);
    const [userId, type, title, body, data] = sendNotification.mock.calls[0];
    expect(userId).toBe('user_play_1');
    expect(type).toBe('GAME_INVITATION');
    expect(title).toBe('צורפת למשחק על ידי Organizer');
    expect(body).toContain('Field A');
    expect(data.gameId).toBe('game_abc');
    expect(data.link).toBe('/game/game_abc');
    expect(data.titleEn).toBe('You were added to a game by Organizer');
    expect(data.bodyEn).toContain('Field A');
    expect(data.adderId).toBe('user_org_123');
  });

  test('notifyUserAddedToGame no-ops without userId/game', async () => {
    const sendNotification = jest.fn();
    await notifyUserAddedToGame({ sendNotification }, { userId: null, game: { id: 'x' } });
    await notifyUserAddedToGame({ sendNotification }, { userId: 'u', game: null });
    expect(sendNotification).not.toHaveBeenCalled();
  });
});
