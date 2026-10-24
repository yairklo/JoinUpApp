// Event-driven replacement for the old setInterval polling sweeps (lottery, pick sessions,
// game completion, reminders, review queue). Each item's due timestamp gets its own in-memory
// timer instead of the whole table being scanned every 30-60s — that polling never let Neon's
// compute suspend, since the DB was touched every tick regardless of whether anything was due.
const { lockGameRow } = require('../utils/gameRowLock');

const MAX_TIMEOUT = 2_147_000_000; // ~24.8 days, safely under Node's 2^31-1 ms setTimeout cap
// A timer may fire a hair before its due time; anything further out is a STALE timer (the row was
// edited to a later time, or another process owns the schedule) and must not execute early.
const DUE_TOLERANCE_MS = 2000;

function isDue(at, now = Date.now()) {
  if (!at) return false;
  return new Date(at).getTime() - now <= DUE_TOLERANCE_MS;
}

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
    // Cross-process notifier, set via setPublisher(). Used only when this process's own
    // scheduler isn't enabled, to forward the signal to whichever process runs it.
    this.publish = null;
    this.reviewRunning = false;
    this.reviewPending = false;
    // Optional extra permission check (leader lock): consulted right before any job runs, so a
    // process that was frozen past its lease cannot fire timers before its demotion is processed.
    this.runGuard = null;
  }

  setRunGuard(fn) {
    this.runGuard = fn;
  }

  _mayRun() {
    return this.enabled && (!this.runGuard || !!this.runGuard());
  }

  // Must be called once at boot (gated the same way as the old setIntervals, so Jest never
  // arms real timers) before resyncGame/loadAll do anything.
  init({ prisma, io, notificationService }) {
    this.prisma = prisma;
    this.io = io;
    this.notificationService = notificationService;
    this.enabled = true;
  }

  // Leader-lock loss / shutdown: drop every timer and go back to forwarding signals. The next
  // leader rebuilds its schedule from the DB via loadAll(), so nothing is lost by stopping.
  stop() {
    this.enabled = false;
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }

  // Entry point for signals received over the scheduler channel. Only the process that is
  // actually running the scheduler (the leader) acts on them; everyone else ignores them.
  // (A non-leader must NOT re-publish, or standbys would ping-pong the signal forever.)
  handleSignal(msg) {
    if (!this.enabled || !msg) return Promise.resolve();
    if (msg.type === 'resync') return this.resyncGameById(msg.gameId);
    if (msg.type === 'reviewQueue') { this.triggerReviewQueue(); return Promise.resolve(); }
    return Promise.resolve();
  }

  // Lets a process that doesn't run the scheduler itself (e.g. the web API when split from
  // a dedicated `worker.js` jobs process, per RUN_BACKGROUND_JOBS) forward resync and
  // review-queue signals over Redis to whichever process does.
  setPublisher(fn) {
    this.publish = fn;
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
      if (!this._mayRun()) {
        console.warn(`[SCHEDULER] Skipping ${key}: not (or no longer) the job leader`);
        return;
      }
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

    if (!this.enabled) {
      if (this.publish) this.publish({ type: 'resync', gameId: game.id });
      return;
    }

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

  // Re-fetches and resyncs a single game by id — used when this process's scheduler is
  // enabled but the write that changed the game happened in another process (see
  // setPublisher() / the SCHEDULER_CHANNEL handler in index.js).
  async resyncGameById(gameId) {
    if (!this.enabled || !this.prisma || !gameId) return;
    const game = await this.prisma.game.findUnique({ where: { id: gameId } });
    if (game) this.resyncGame(game);
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
    return this.drawLottery(this.prisma, gameId);
  }

  // Idempotent: the updateMany claim means exactly one caller draws. Also called lazily from the
  // join route when the timer was missed (process down at lotteryAt), with the route's own client.
  //
  // Claim, participant read, and CONFIRMED/NOT_SELECTED writes are one transaction that holds
  // lockGameRow the whole time. A /join that sees lotteryExecutedAt already set would otherwise
  // count CONFIRMED before the winners exist, take a seat, and then the draw would fill
  // maxPlayers - confirmedBefore on top (overbook). A throw after the claim rolls the claim
  // back too, so a later join or boot can draw again instead of leaving the pool WAITLISTED.
  async drawLottery(prisma, gameId) {
    const now = new Date();
    // Cheap pre-check so a stale timer does not lock the row. The re-check under the lock is
    // the one that excludes a concurrent join.
    const due = await prisma.game.findUnique({
      where: { id: gameId },
      select: { lotteryEnabled: true, lotteryExecutedAt: true, lotteryAt: true },
    });
    if (!due || !due.lotteryEnabled || due.lotteryExecutedAt || !isDue(due.lotteryAt)) return;

    const drew = await prisma.$transaction(async (tx) => {
      await lockGameRow(tx, gameId);
      const game = await tx.game.findUnique({
        where: { id: gameId },
        include: { participants: true },
      });
      if (!game || !game.lotteryEnabled || game.lotteryExecutedAt || !isDue(game.lotteryAt)) return false;

      const claimed = await tx.game.updateMany({
        where: { id: gameId, lotteryEnabled: true, lotteryExecutedAt: null },
        data: { lotteryExecutedAt: now },
      });
      if (claimed.count === 0) return false;

      const confirmed = game.participants.filter(p => p.status === 'CONFIRMED');
      const waitlisted = game.participants.filter(p => p.status === 'WAITLISTED');
      const slotsRemaining = Math.max(0, game.maxPlayers - confirmed.length);

      // Sequential on the interactive transaction's one connection. Starting these in parallel
      // would interleave queries on that connection.
      const apply = async (ids, status) => {
        if (!ids.length) return;
        await tx.participation.updateMany({
          where: { id: { in: ids } },
          data: { status },
        });
      };

      if (slotsRemaining > 0 && waitlisted.length > 0) {
        shuffleInPlace(waitlisted);
        const winners = waitlisted.slice(0, slotsRemaining);
        const losers = waitlisted.slice(slotsRemaining);
        await apply(winners.map(w => w.id), 'CONFIRMED');
        await apply(losers.map(l => l.id), 'NOT_SELECTED');
      } else if (waitlisted.length > 0) {
        await apply(waitlisted.map(w => w.id), 'NOT_SELECTED');
      }
      return true;
    }, { timeout: 20000, maxWait: 10000 });

    if (drew) {
      console.log(`🎲 [SCHEDULER] Lottery executed for game ${gameId} at ${now.toISOString()}`);
    }
  }

  async _runPickDraw(gameId) {
    // Lazy require: pickSessionService requires gameScheduler too (to call resyncGame after
    // updatePickSchedule), so this avoids a circular require at module-load time.
    const { executePickDraw } = require('./pickSessionService');
    const due = await this.prisma.game.findUnique({
      where: { id: gameId },
      select: { pickDrawAt: true, pickDrawExecutedAt: true },
    });
    if (!due || due.pickDrawExecutedAt || !isDue(due.pickDrawAt)) return;
    await executePickDraw(gameId, this.io);
  }

  async _runPickOpen(gameId) {
    const { openPicking } = require('./pickSessionService');
    const due = await this.prisma.game.findUnique({
      where: { id: gameId },
      select: { pickingStartsAt: true, pickingOpenedAt: true },
    });
    if (!due || due.pickingOpenedAt || !isDue(due.pickingStartsAt)) return;
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
    if (!this.enabled) {
      if (this.publish) this.publish({ type: 'reviewQueue' });
      return;
    }
    if (!this._mayRun()) return;
    // One run at a time per process; triggers arriving mid-run coalesce into a single re-run.
    // (Overlapping runs would double-apply AI retries and reputation penalties.)
    if (this.reviewRunning) { this.reviewPending = true; return; }
    this.reviewRunning = true;
    const { processReviewQueue } = require('../workers/reviewWorker');
    processReviewQueue({ isActive: () => this._mayRun() })
      .catch(err => console.error('[SCHEDULER] Review queue trigger failed:', err))
      .finally(() => {
        this.reviewRunning = false;
        if (this.reviewPending) {
          this.reviewPending = false;
          if (this._mayRun()) this.triggerReviewQueue();
        }
      });
  }

  armReviewRetry(id, retryAfter) {
    this._arm(`review:${id}`, new Date(retryAfter), () => this.triggerReviewQueue());
  }
}

module.exports = new GameScheduler();
module.exports.isDue = isDue;
