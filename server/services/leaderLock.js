/**
 * Redis leader lock for background jobs (gameScheduler timers, weekly series generation, review
 * queue, cleanup cron). Any API instance (or worker.js) may host the jobs, but only the current
 * lock holder runs them.
 *
 *  - acquire : SET key <instanceId> NX PX ttl
 *  - renew   : compare-and-renew Lua (PEXPIRE only if the value is still our instanceId)
 *  - release : compare-and-delete Lua (graceful shutdown hands over immediately)
 *  - standby : keeps retrying to acquire every `renewMs`
 *
 * Safety rule (no double leaders): a leader that cannot reach Redis keeps running only until its
 * local lease runs out, i.e. strictly before the key can expire and be taken by someone else; then
 * it stops its jobs. The lease is measured from the moment the renew/acquire command was SENT
 * (the key cannot expire earlier than sent + ttl, however long the round trip took) minus a margin
 * for clock drift, and a DEDICATED timer fires at the deadline, so enforcement does not depend on
 * the renew tick cadence. Job entry points can also consult isLeader() (checks the lease) so a
 * frozen process that wakes up late does not run anything before the timer demotes it.
 * Short Redis blips do not interrupt jobs, long outages pause them (a new leader catches up from
 * the DB: overdue timers fire immediately on loadAll()).
 *
 * onAcquire/onLose are serialised, so a hand-over never overlaps a start.
 */
const os = require('os');
const crypto = require('crypto');
const { key: redisKey } = require('../lib/redis');

const RENEW_LUA = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('pexpire', KEYS[1], ARGV[2])
end
return 0
`;

const RELEASE_LUA = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0
`;

function newInstanceId() {
  return `${os.hostname()}:${process.pid}:${crypto.randomBytes(4).toString('hex')}`;
}

function createLeaderLock({
  client,
  lockKey = redisKey('jobs', 'leader'),
  instanceId = newInstanceId(),
  ttlMs = 30_000,
  renewMs = Math.floor(ttlMs / 3),
  marginMs = Math.floor(ttlMs / 6),
  opTimeoutMs = 2000,
  onAcquire = async () => {},
  onLose = async () => {},
  logger = console,
  now = Date.now,
} = {}) {
  if (!client) throw new Error('createLeaderLock requires a Redis client');

  let leader = false;
  let leaseDeadline = 0;
  let stopped = true;
  let timer = null;
  let leaseTimer = null;
  // True when this instance's id may still sit in the lock key although we are not leading: an
  // acquire whose reply timed out, or a lease we gave up while the key was still ours. The next
  // tick then tries a compare-and-renew first, so we recognise our own lock instead of waiting
  // out its TTL.
  let maybeHeld = false;
  let chain = Promise.resolve(); // serialises onAcquire / onLose

  function op(p) {
    let t;
    return Promise.race([
      p,
      new Promise((_, rej) => { t = setTimeout(() => rej(new Error('redis timeout')), opTimeoutMs); }),
    ]).finally(() => clearTimeout(t));
  }

  function enqueue(fn) {
    chain = chain.then(fn).catch((err) => {
      logger.error('[leader-lock] transition handler failed:', err && err.message);
    });
    return chain;
  }

  function armLease() {
    if (leaseTimer) clearTimeout(leaseTimer);
    leaseTimer = setTimeout(() => {
      if (leader && now() >= leaseDeadline) demote('lease expired (no successful renewal)');
      else if (leader) armLease();
    }, Math.max(0, leaseDeadline - now()) + 1);
    if (leaseTimer.unref) leaseTimer.unref();
  }

  function extendLease(sentAt) {
    leaseDeadline = sentAt + ttlMs - marginMs;
    armLease();
  }

  function promote(sentAt) {
    leader = true;
    maybeHeld = false;
    extendLease(sentAt);
    logger.log(`[leader-lock] ${instanceId} acquired job leadership`);
    enqueue(async () => {
      try {
        await onAcquire();
      } catch (err) {
        // Could not start the jobs: step down and free the lock for someone who can.
        logger.error('[leader-lock] onAcquire failed, releasing leadership:', err && err.message);
        leader = false;
        if (leaseTimer) clearTimeout(leaseTimer);
        try { await onLose(); } catch (_) { /* best effort */ }
        try { await op(client.eval(RELEASE_LUA, 1, lockKey, instanceId)); } catch (_) { /* expires by TTL */ }
      }
    });
  }

  function demote(reason) {
    if (!leader) return;
    leader = false;
    if (leaseTimer) { clearTimeout(leaseTimer); leaseTimer = null; }
    maybeHeld = !/taken over/.test(reason);
    logger.warn(`[leader-lock] ${instanceId} lost job leadership: ${reason}`);
    enqueue(async () => { await onLose(); });
  }

  async function tick() {
    if (stopped) return;
    try {
      if (leader) {
        const sentAt = now();
        let res;
        try {
          res = Number(await op(client.eval(RENEW_LUA, 1, lockKey, instanceId, String(ttlMs))));
        } catch (_) {
          res = null; // Redis unreachable: the lease timer enforces the deadline
        }
        if (res === 1 && leader) extendLease(sentAt);
        else if (res === 0) demote('lock taken over or expired');
        else if (now() >= leaseDeadline) demote('lease expired while Redis was unreachable');
      } else {
        const sentAt = now();
        let acquired = false;
        try {
          if (maybeHeld) {
            // Is the key still ours (timed-out SET NX / lease we gave up on)? Renew recognises it.
            acquired = Number(await op(client.eval(RENEW_LUA, 1, lockKey, instanceId, String(ttlMs)))) === 1;
            if (!acquired) maybeHeld = false;
          }
          if (!acquired) {
            acquired = (await op(client.set(lockKey, instanceId, 'PX', ttlMs, 'NX'))) === 'OK';
          }
        } catch (_) {
          maybeHeld = true; // the command may have been applied although the reply was lost
        }
        if (acquired && !stopped) promote(sentAt);
      }
    } catch (err) {
      logger.error('[leader-lock] tick failed:', err && err.message);
    } finally {
      schedule();
    }
  }

  function schedule() {
    if (stopped) return;
    timer = setTimeout(tick, renewMs);
    if (timer.unref) timer.unref();
  }

  return {
    instanceId,
    isLeader: () => leader && now() < leaseDeadline,
    /** Begin competing for leadership (first attempt is immediate). */
    start() {
      if (!stopped) return;
      stopped = false;
      tick();
    },
    /** Stop competing; if leading, stop jobs and release the lock for immediate hand-over. */
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (leaseTimer) { clearTimeout(leaseTimer); leaseTimer = null; }
      const wasLeader = leader;
      leader = false;
      await chain;
      if (wasLeader) await enqueue(async () => { await onLose(); });
      // Also release after a lapsed-lease demotion / lost acquire reply (maybeHeld): the key may
      // still carry our id and would otherwise block a hand-over until its TTL. Compare-and-delete
      // only removes OUR id, so this is safe when someone else holds it.
      if (wasLeader || maybeHeld) {
        try { await op(client.eval(RELEASE_LUA, 1, lockKey, instanceId)); } catch (_) { /* expires by TTL */ }
        maybeHeld = false;
      }
    },
    status: () => ({ role: leader ? 'leader' : 'standby', instanceId }),
  };
}

module.exports = { createLeaderLock, RENEW_LUA, RELEASE_LUA };
