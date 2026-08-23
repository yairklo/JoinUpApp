// Event-driven replacement for the old setInterval polling sweeps (lottery, pick sessions,
// game completion, reminders, review queue). Each item's due timestamp gets its own in-memory
// timer instead of the whole table being scanned every 30-60s — that polling never let Neon's
// compute suspend, since the DB was touched every tick regardless of whether anything was due.
const MAX_TIMEOUT = 2_147_000_000; // ~24.8 days, safely under Node's 2^31-1 ms setTimeout cap

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

class GameScheduler {
  constructor() {
    this.timers = new Map();
    this.prisma = null;
    this.io = null;
    this.notificationService = null;
    this.enabled = false;
  }

  // Must be called once at boot (gated the same way as the old setIntervals, so Jest never
  // arms real timers) before resyncGame/loadAll do anything.
  init({ prisma, io, notificationService }) {
    this.prisma = prisma;
    this.io = io;
    this.notificationService = notificationService;
    this.enabled = true;
  }

  _arm(key, dueAt, handler) {
    this._disarm(key);
    if (!this.enabled || !dueAt) return;

    const delay = dueAt.getTime() - Date.now();
    if (delay > MAX_TIMEOUT) {
      const timeout = setTimeout(() => this._arm(key, dueAt, handler), MAX_TIMEOUT);
      this.timers.set(key, timeout);
      return;
    }

    const timeout = setTimeout(() => {
      this.timers.delete(key);
      Promise.resolve().then(handler).catch(err => {
        console.error(`[SCHEDULER] Handler failed for ${key}:`, err);
      });
    }, Math.max(0, delay));
    this.timers.set(key, timeout);
  }

  _disarm(key) {
    const existing = this.timers.get(key);
    if (existing) {
      clearTimeout(existing);
      this.timers.delete(key);
    }
  }

  // Single hook every write path calls after creating/updating a game row. Arms or disarms
  // each per-game timer based on the current field values, so it can't drift out of sync
  // regardless of which of the several call sites touched the row.
  resyncGame(game) {
    if (!game || !game.id) return;

    if (game.lotteryEnabled && !game.lotteryExecutedAt && game.lotteryAt) {
      this._arm(`lottery:${game.id}`, new Date(game.lotteryAt), () => this._runLottery(game.id));
    } else {
      this._disarm(`lottery:${game.id}`);
    }

    if (game.pickDrawAt && !game.pickDrawExecutedAt) {
      this._arm(`pickDraw:${game.id}`, new Date(game.pickDrawAt), () => this._runPickDraw(game.id));
    } else {
      this._disarm(`pickDraw:${game.id}`);
    }

    if (game.pickingStartsAt && !game.pickingOpenedAt) {
      this._arm(`pickOpen:${game.id}`, new Date(game.pickingStartsAt), () => this._runPickOpen(game.id));
    } else {
      this._disarm(`pickOpen:${game.id}`);
    }

    if (game.status === 'OPEN' && game.start) {
      const dur = typeof game.duration === 'number' ? game.duration : 1;
      const endAt = new Date(new Date(game.start).getTime() + dur * 3600000);
      this._arm(`completion:${game.id}`, endAt, () => this._checkCompletion(game.id));
    } else {
      this._disarm(`completion:${game.id}`);
    }

    if (game.status === 'OPEN' && !game.reminderSent && game.start) {
      const reminderAt = new Date(new Date(game.start).getTime() - 3600000);
      this._arm(`reminder:${game.id}`, reminderAt, () => this._sendReminder(game.id));
    } else {
      this._disarm(`reminder:${game.id}`);
    }
  }

  // Boot-time reload: one query per condition, replacing the 4 setIntervals + reminder cron.
  // Recovers pending schedules after a restart/redeploy, since in-memory timers don't survive one.
  async loadAll() {
    const prisma = this.prisma;
    const [lotteryGames, pickDrawGames, pickOpenGames, openGames] = await Promise.all([
      prisma.game.findMany({ where: { lotteryEnabled: true, lotteryExecutedAt: null, lotteryAt: { not: null } } }),
      prisma.game.findMany({ where: { pickDrawAt: { not: null }, pickDrawExecutedAt: null } }),
      prisma.game.findMany({ where: { pickingStartsAt: { not: null }, pickingOpenedAt: null } }),
      prisma.game.findMany({ where: { status: 'OPEN' } }),
    ]);

    const byId = new Map();
    for (const g of [...lotteryGames, ...pickDrawGames, ...pickOpenGames, ...openGames]) {
      byId.set(g.id, { ...(byId.get(g.id) || {}), ...g });
    }
    for (const game of byId.values()) {
      this.resyncGame(game);
    }

    const flaggedRetries = await prisma.flaggedMessage.findMany({
      where: { status: 'PENDING_RETRY', retryCount: { lt: 3 } },
      select: { id: true, aiTriggers: true },
    });
    let armedRetries = 0;
    for (const item of flaggedRetries) {
      const retryAfter = item.aiTriggers && item.aiTriggers.retryAfter;
      if (retryAfter) {
        this.armReviewRetry(item.id, retryAfter);
        armedRetries += 1;
      }
    }

    console.log(`[SCHEDULER] Loaded ${byId.size} game schedule(s) and ${armedRetries} review retry(s) on boot`);
  }

  // --- handlers: each re-fetches and re-checks before acting, so a stale or duplicate fire
  // (e.g. right after a rearm) is always a safe no-op. --------------------------------------

  async _runLottery(gameId) {
    const prisma = this.prisma;
    const now = new Date();
    const claimed = await prisma.game.updateMany({
      where: { id: gameId, lotteryEnabled: true, lotteryExecutedAt: null },
      data: { lotteryExecutedAt: now },
    });
    if (claimed.count === 0) return;

    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: { participants: true },
    });
    if (!game) return;

    const confirmed = game.participants.filter(p => p.status === 'CONFIRMED');
    const waitlisted = game.participants.filter(p => p.status === 'WAITLISTED');
    const slotsRemaining = Math.max(0, game.maxPlayers - confirmed.length);

    const updates = [];
    if (slotsRemaining > 0 && waitlisted.length > 0) {
      shuffleInPlace(waitlisted);
      const winners = waitlisted.slice(0, slotsRemaining);
      const losers = waitlisted.slice(slotsRemaining);
      if (winners.length) {
        updates.push(prisma.participation.updateMany({
          where: { id: { in: winners.map(w => w.id) } },
          data: { status: 'CONFIRMED' },
        }));
      }
      if (losers.length) {
        updates.push(prisma.participation.updateMany({
          where: { id: { in: losers.map(l => l.id) } },
          data: { status: 'NOT_SELECTED' },
        }));
      }
    } else if (waitlisted.length > 0) {
      updates.push(prisma.participation.updateMany({
        where: { id: { in: waitlisted.map(w => w.id) } },
        data: { status: 'NOT_SELECTED' },
      }));
    }

    if (updates.length) await prisma.$transaction(updates);
    console.log(`🎲 [SCHEDULER] Lottery executed for game ${game.id} at ${now.toISOString()}`);
  }

  async _runPickDraw(gameId) {
    // Lazy require: pickSessionService requires gameScheduler too (to call resyncGame after
    // updatePickSchedule), so this avoids a circular require at module-load time.
    const { executePickDraw } = require('./pickSessionService');
    await executePickDraw(gameId, this.io);
  }

  async _runPickOpen(gameId) {
    const { openPicking } = require('./pickSessionService');
    await openPicking(gameId, this.io);
  }

  async _checkCompletion(gameId) {
    const prisma = this.prisma;
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: { id: true, status: true, start: true, duration: true },
    });
    if (!game || game.status !== 'OPEN') return;

    const dur = typeof game.duration === 'number' ? game.duration : 1;
    const endTime = new Date(new Date(game.start).getTime() + dur * 3600000);
    if (endTime > new Date()) {
      this._arm(`completion:${game.id}`, endTime, () => this._checkCompletion(game.id));
      return;
    }

    const claimed = await prisma.game.updateMany({
      where: { id: game.id, status: 'OPEN' },
      data: { status: 'COMPLETED' },
    });
    if (claimed.count === 0) return;
    console.log(`🏁 [SCHEDULER] Auto-completed game ${game.id}.`);
  }

  async _sendReminder(gameId) {
    const prisma = this.prisma;
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        participants: { where: { status: 'CONFIRMED' }, select: { userId: true } },
        field: { select: { name: true, location: true } },
      },
    });
    if (!game || game.status !== 'OPEN') return;

    const claimed = await prisma.game.updateMany({
      where: { id: game.id, reminderSent: false, status: 'OPEN' },
      data: { reminderSent: true },
    });
    if (claimed.count === 0) return;

    if (new Date(game.start).getTime() <= Date.now()) {
      return;
    }

    const gameTime = new Date(game.start).toLocaleTimeString('he-IL', {
      timeZone: 'Asia/Jerusalem',
      hour: '2-digit',
      minute: '2-digit',
    });
    const title = 'משחק מתקרב!';
    const body = `המשחק שלך ב-${game.field.name} מתחיל בעוד שעה (${gameTime})`;
    const data = { gameId: game.id, link: `/games/${game.id}`, type: 'GAME_REMINDER' };

    for (const participant of game.participants) {
      try {
        await this.notificationService.sendNotification(
          participant.userId, 'GAME_REMINDER', title, body, data, this.io
        );
      } catch (error) {
        console.error(`[SCHEDULER] Failed to send reminder to ${participant.userId}:`, error);
      }
    }

    console.log(`[SCHEDULER] Sent reminders for game ${game.id} to ${game.participants.length} participants`);
  }

  // --- review queue (FlaggedMessage backlog table - not timestamp-driven like the above,
  // so it's triggered on insert instead of armed against a due column). ----------------------

  triggerReviewQueue() {
    if (!this.enabled) return;
    const { processReviewQueue } = require('../workers/reviewWorker');
    processReviewQueue().catch(err => console.error('[SCHEDULER] Review queue trigger failed:', err));
  }

  armReviewRetry(id, retryAfter) {
    this._arm(`review:${id}`, new Date(retryAfter), () => this.triggerReviewQueue());
  }
}

module.exports = new GameScheduler();
