/**
 * Unit tests for the gameScheduler cross-process resync bridge. No DB / server boot required —
 * these exercise the publish/resyncGameById fallback added so resyncGame()/triggerReviewQueue()
 * calls from a process without an enabled scheduler (e.g. the web API split from worker.js) still
 * reach the process that runs it, instead of silently no-oping.
 */
const gameScheduler = require('../services/gameScheduler');

function futureGame(id, overrides = {}) {
  return {
    id,
    status: 'OPEN',
    start: new Date(Date.now() + 3 * 3600000), // 3h out, so armed timers never fire mid-test
    duration: 1,
    reminderSent: false,
    lotteryEnabled: false,
    lotteryExecutedAt: null,
    lotteryAt: null,
    pickDrawAt: null,
    pickDrawExecutedAt: null,
    pickingStartsAt: null,
    pickingOpenedAt: null,
    ...overrides,
  };
}

describe('gameScheduler cross-process resync bridge', () => {
  afterEach(() => {
    // Reset the singleton's state so tests in this file don't leak into each other.
    for (const t of gameScheduler.timers.values()) clearTimeout(t);
    gameScheduler.timers.clear();
    gameScheduler.enabled = false;
    gameScheduler.publish = null;
    gameScheduler.prisma = null;
  });

  test('resyncGame publishes a resync signal instead of arming when the scheduler is disabled', () => {
    const published = [];
    gameScheduler.setPublisher((msg) => published.push(msg));

    gameScheduler.resyncGame(futureGame('game-1'));

    expect(published).toEqual([{ type: 'resync', gameId: 'game-1' }]);
    expect(gameScheduler.timers.size).toBe(0);
  });

  test('resyncGame is a silent no-op when disabled and no publisher is configured', () => {
    expect(() => gameScheduler.resyncGame(futureGame('game-2'))).not.toThrow();
    expect(gameScheduler.timers.size).toBe(0);
  });

  test('resyncGame arms timers directly (no publish) once the scheduler is enabled', () => {
    const published = [];
    gameScheduler.setPublisher((msg) => published.push(msg));
    gameScheduler.init({ prisma: {}, io: null, notificationService: null });

    gameScheduler.resyncGame(futureGame('game-3'));

    expect(published).toEqual([]);
    expect(gameScheduler.timers.has('completion:game-3')).toBe(true);
    expect(gameScheduler.timers.has('reminder:game-3')).toBe(true);
  });

  test('triggerReviewQueue publishes a reviewQueue signal when disabled', () => {
    const published = [];
    gameScheduler.setPublisher((msg) => published.push(msg));

    gameScheduler.triggerReviewQueue();

    expect(published).toEqual([{ type: 'reviewQueue' }]);
  });

  test('resyncGameById re-fetches the game from the DB and resyncs once enabled', async () => {
    const fakeGame = futureGame('game-4');
    const findUnique = jest.fn().mockResolvedValue(fakeGame);
    gameScheduler.init({ prisma: { game: { findUnique } }, io: null, notificationService: null });

    await gameScheduler.resyncGameById('game-4');

    expect(findUnique).toHaveBeenCalledWith({ where: { id: 'game-4' } });
    expect(gameScheduler.timers.has('completion:game-4')).toBe(true);
  });

  test('resyncGameById is a no-op when the scheduler is disabled', async () => {
    const findUnique = jest.fn();
    gameScheduler.prisma = { game: { findUnique } };

    await gameScheduler.resyncGameById('game-5');

    expect(findUnique).not.toHaveBeenCalled();
  });
});
