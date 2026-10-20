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
 * local lease runs out (lastSuccessfulRenew + ttl - margin), i.e. strictly before the key can
 * expire and be taken by someone else; then it stops its jobs. Short Redis blips therefore do not
 * interrupt jobs, long outages pause them (they catch up from the DB when a leader is elected:
 * overdue timers fire immediately on loadAll()).
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

  function promote() {
    leader = true;
    leaseDeadline = now() + ttlMs - marginMs;
    logger.log(`[leader-lock] ${instanceId} acquired job leadership`);
    enqueue(async () => {
      try {
        await onAcquire();
      } catch (err) {
        // Could not start the jobs: step down and free the lock for someone who can.
        logger.error('[leader-lock] onAcquire failed, releasing leadership:', err && err.message);
        leader = false;
        try { await onLose(); } catch (_) { /* best effort */ }
        try { await op(client.eval(RELEASE_LUA, 1, lockKey, instanceId)); } catch (_) { /* expires by TTL */ }
      }
    });
  }

  function demote(reason) {
    if (!leader) return;
    leader = false;
    logger.warn(`[leader-lock] ${instanceId} lost job leadership: ${reason}`);
    enqueue(async () => { await onLose(); });
  }

  async function tick() {
    if (stopped) return;
    try {
      if (leader) {
        let res;
        try {
          res = Number(await op(client.eval(RENEW_LUA, 1, lockKey, instanceId, String(ttlMs))));
        } catch (_) {
          res = null; // Redis unreachable: judge by the local lease
        }
        if (res === 1) leaseDeadline = now() + ttlMs - marginMs;
        else if (res === 0) demote('lock taken over or expired');
        else if (now() >= leaseDeadline) demote('lease expired while Redis was unreachable');
      } else {
        let acquired = false;
        try {
          acquired = (await op(client.set(lockKey, instanceId, 'PX', ttlMs, 'NX'))) === 'OK';
        } catch (_) { /* Redis down: stay standby, retry next tick */ }
        if (acquired && !stopped) promote();
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
      const wasLeader = leader;
      leader = false;
      await chain;
      if (wasLeader) {
        await enqueue(async () => { await onLose(); });
        try { await op(client.eval(RELEASE_LUA, 1, lockKey, instanceId)); } catch (_) { /* expires by TTL */ }
      }
    },
    status: () => ({ role: leader ? 'leader' : 'standby', instanceId }),
  };
}

module.exports = { createLeaderLock, RENEW_LUA, RELEASE_LUA };
