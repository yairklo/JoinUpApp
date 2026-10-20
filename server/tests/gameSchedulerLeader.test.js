/**
 * gameScheduler hardening for multi-instance deployments: stale-timer protection (due-time
 * re-checks), leader hand-over (stop/handleSignal) and review-queue serialization.
 */
const gameScheduler = require('../services/gameScheduler');

const inMs = (ms) => new Date(Date.now() + ms);

function futureGame(id) {
  return {
    id,
    status: 'OPEN',
    start: new Date(Date.now() + 3 * 3600000),
    duration: 1,
    reminderSent: false,
    lotteryEnabled: false,
    lotteryExecutedAt: null,
    lotteryAt: null,
    pickDrawAt: null,
    pickDrawExecutedAt: null,
    pickingStartsAt: null,
    pickingOpenedAt: null,
  };
}

function lotteryPrisma() {
  return {
    game: {
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    participation: { updateMany: jest.fn() },
    $transaction: jest.fn(),
  };
}

afterEach(() => {
  gameScheduler.stop();
  gameScheduler.publish = null;
  gameScheduler.prisma = null;
  gameScheduler.reviewRunning = false;
  gameScheduler.reviewPending = false;
});

describe('due-time re-checks', () => {
  test('_runLottery is a no-op for a stale timer (lotteryAt moved later)', async () => {
    const prisma = lotteryPrisma();
    prisma.game.findUnique.mockResolvedValue({ lotteryEnabled: true, lotteryExecutedAt: null, lotteryAt: inMs(3600_000) });
    gameScheduler.init({ prisma, io: null, notificationService: null });
    await gameScheduler._runLottery('g1');
    expect(prisma.game.updateMany).not.toHaveBeenCalled();
  });

  test('_runLottery is a no-op when disabled or already executed', async () => {
    for (const row of [
      { lotteryEnabled: false, lotteryExecutedAt: null, lotteryAt: inMs(-1000) },
      { lotteryEnabled: true, lotteryExecutedAt: new Date(), lotteryAt: inMs(-1000) },
    ]) {
      const prisma = lotteryPrisma();
      prisma.game.findUnique.mockResolvedValue(row);
      gameScheduler.init({ prisma, io: null, notificationService: null });
      await gameScheduler._runLottery('g1');
      expect(prisma.game.updateMany).not.toHaveBeenCalled();
    }
  });

  test('_runLottery still runs when due, and tolerates a timer firing a hair early', async () => {
    for (const offset of [-5000, 500]) {
      const prisma = lotteryPrisma();
      prisma.game.findUnique
        .mockResolvedValueOnce({ lotteryEnabled: true, lotteryExecutedAt: null, lotteryAt: inMs(offset) })
        .mockResolvedValueOnce({ id: 'g1', maxPlayers: 10, participants: [] });
      gameScheduler.init({ prisma, io: null, notificationService: null });
      await gameScheduler._runLottery('g1');
      expect(prisma.game.updateMany).toHaveBeenCalledTimes(1);
    }
  });

  test('_runPickDraw and _runPickOpen skip stale timers, run when due', async () => {
    const svc = require('../services/pickSessionService');
    const drawSpy = jest.spyOn(svc, 'executePickDraw').mockResolvedValue(null);
    const openSpy = jest.spyOn(svc, 'openPicking').mockResolvedValue(null);
    const findUnique = jest.fn().mockResolvedValue({
      pickDrawAt: inMs(3600_000), pickDrawExecutedAt: null, pickingStartsAt: inMs(3600_000), pickingOpenedAt: null,
    });
    gameScheduler.init({ prisma: { game: { findUnique } }, io: null, notificationService: null });
    await gameScheduler._runPickDraw('g1');
    await gameScheduler._runPickOpen('g1');
    expect(drawSpy).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();

    findUnique.mockResolvedValue({
      pickDrawAt: inMs(-1000), pickDrawExecutedAt: null, pickingStartsAt: inMs(-1000), pickingOpenedAt: null,
    });
    await gameScheduler._runPickDraw('g1');
    await gameScheduler._runPickOpen('g1');
    expect(drawSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledTimes(1);
    drawSpy.mockRestore();
    openSpy.mockRestore();
  });
});

describe('leader hand-over', () => {
  test('stop() clears every timer and returns to forwarding mode', () => {
    const published = [];
    gameScheduler.setPublisher((m) => published.push(m));
    gameScheduler.init({ prisma: {}, io: null, notificationService: null });
    gameScheduler.resyncGame(futureGame('game-s'));
    expect(gameScheduler.timers.size).toBeGreaterThan(0);
    gameScheduler.stop();
    expect(gameScheduler.timers.size).toBe(0);
    expect(gameScheduler.enabled).toBe(false);
    gameScheduler.resyncGame(futureGame('game-s'));
    expect(published).toEqual([{ type: 'resync', gameId: 'game-s' }]);
  });

  test('handleSignal is ignored by a non-leader (no re-publish ping-pong) and acted on by the leader', async () => {
    const published = [];
    gameScheduler.setPublisher((m) => published.push(m));
    await gameScheduler.handleSignal({ type: 'resync', gameId: 'x' });
    await gameScheduler.handleSignal({ type: 'reviewQueue' });
    expect(published).toEqual([]);

    const findUnique = jest.fn().mockResolvedValue(futureGame('x'));
    gameScheduler.init({ prisma: { game: { findUnique } }, io: null, notificationService: null });
    await gameScheduler.handleSignal({ type: 'resync', gameId: 'x' });
    expect(findUnique).toHaveBeenCalled();
    expect(gameScheduler.timers.has('completion:x')).toBe(true);
  });
});

describe('review queue serialization', () => {
  test('overlapping triggers run once at a time and coalesce into a single re-run', async () => {
    jest.resetModules();
    const releases = [];
    const calls = [];
    jest.doMock('../workers/reviewWorker', () => ({
      processReviewQueue: jest.fn(() => {
        calls.push(1);
        return new Promise((r) => { releases.push(r); });
      }),
    }));
    const scheduler = require('../services/gameScheduler');
    scheduler.init({ prisma: {}, io: null, notificationService: null });
    scheduler.triggerReviewQueue();
    scheduler.triggerReviewQueue();
    scheduler.triggerReviewQueue();
    expect(calls).toHaveLength(1);
    releases[0]();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    expect(calls).toHaveLength(2);
    releases[1]();
    await new Promise((r) => setImmediate(r));
    scheduler.stop();
    jest.dontMock('../workers/reviewWorker');
  });
});
