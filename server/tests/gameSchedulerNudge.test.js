const scheduler = require('../services/gameScheduler');
const redisLib = require('../lib/redis');
const { DIRTY_KEY, DIRTY_TTL_MS, REDIS_OP_TIMEOUT_MS } = require('../services/reminderDirty');

function makeFakeRedis() {
  const data = new Map();
  const fake = {
    data,
    set: jest.fn(async (key, val, px, ttl) => {
      data.set(key, { val, px, ttl: Number(ttl), exp: Date.now() + Number(ttl) });
      return 'OK';
    }),
    get: jest.fn(async (key) => {
      const entry = data.get(key);
      if (!entry || entry.exp <= Date.now()) return null;
      return entry.val;
    }),
    del: jest.fn(async (key) => (data.delete(key) ? 1 : 0)),
  };
  return fake;
}

afterEach(() => {
  scheduler.stop();
  scheduler.setPublisher(null);
  scheduler.setReminderNudge(null);
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('gameScheduler reminder nudges', () => {
  test('on the job leader a nudge calls the registered reminder driver', () => {
    const nudge = jest.fn();
    scheduler.init({ prisma: {}, io: null, notificationService: {} });
    scheduler.setReminderNudge(nudge);
    scheduler.nudgeReminders();
    expect(nudge).toHaveBeenCalledTimes(1);
  });

  test('on any other process a nudge is forwarded to the leader instead', () => {
    const publish = jest.fn();
    const nudge = jest.fn();
    scheduler.setPublisher(publish);
    scheduler.setReminderNudge(nudge); // a stale driver must not fire when not the runner
    scheduler.nudgeReminders();
    expect(publish).toHaveBeenCalledWith({ type: 'remindersReplan' });
    expect(nudge).not.toHaveBeenCalled();
  });

  test('the leader turns a forwarded signal into a local nudge (no re-publish ping-pong)', async () => {
    const publish = jest.fn();
    const nudge = jest.fn();
    scheduler.setPublisher(publish);
    scheduler.init({ prisma: {}, io: null, notificationService: {} });
    scheduler.setReminderNudge(nudge);
    await scheduler.handleSignal({ type: 'remindersReplan' });
    expect(nudge).toHaveBeenCalledTimes(1);
    expect(publish).not.toHaveBeenCalled();
  });

  test('a rejected reminder-wake publish is logged', async () => {
    const err = new Error('redis down');
    scheduler.setPublisher(() => Promise.reject(err));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    scheduler.nudgeReminders();
    await Promise.resolve();
    await Promise.resolve();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('reminder wake publish failed'), err);
    spy.mockRestore();
  });

  test('a throwing reminder-wake publish is logged', () => {
    const err = new Error('redis down');
    scheduler.setPublisher(() => { throw err; });
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    scheduler.nudgeReminders();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('reminder wake publish failed'), err);
    spy.mockRestore();
  });

  test('a rejected reminder-wake publish still sets the dirty key', async () => {
    const fake = makeFakeRedis();
    jest.spyOn(redisLib, 'getRedis').mockReturnValue(fake);
    scheduler.setPublisher(() => Promise.reject(new Error('redis down')));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    scheduler.nudgeReminders();
    await Promise.resolve();
    expect(fake.set).toHaveBeenCalledWith(DIRTY_KEY, '1', 'PX', DIRTY_TTL_MS);
    expect(fake.data.get(DIRTY_KEY).val).toBe('1');
  });

  test('a throwing reminder-wake publish still sets the dirty key', () => {
    const fake = makeFakeRedis();
    jest.spyOn(redisLib, 'getRedis').mockReturnValue(fake);
    scheduler.setPublisher(() => { throw new Error('redis down'); });
    jest.spyOn(console, 'error').mockImplementation(() => {});
    scheduler.nudgeReminders();
    expect(fake.set).toHaveBeenCalledWith(DIRTY_KEY, '1', 'PX', DIRTY_TTL_MS);
    expect(fake.data.get(DIRTY_KEY).val).toBe('1');
  });

  test('a hanging dirty-flag write times out and is logged', async () => {
    jest.useFakeTimers();
    const fake = makeFakeRedis();
    fake.set.mockReturnValueOnce(new Promise(() => {}));
    jest.spyOn(redisLib, 'getRedis').mockReturnValue(fake);
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    scheduler.setPublisher(() => { throw new Error('redis down'); });
    scheduler.nudgeReminders();
    await jest.advanceTimersByTimeAsync(REDIS_OP_TIMEOUT_MS);
    expect(err).toHaveBeenCalledWith(
      expect.stringContaining('dirty flag set failed'),
      expect.objectContaining({ message: 'redis timeout' }),
    );
  });

  test('a disabled resync sets the dirty key even when publish throws', () => {
    const fake = makeFakeRedis();
    jest.spyOn(redisLib, 'getRedis').mockReturnValue(fake);
    scheduler.setPublisher(() => { throw new Error('down'); });
    expect(() => scheduler.resyncGame({
      id: 'g9', status: 'OPEN', start: new Date(Date.now() + 3600e3),
    })).toThrow('down');
    expect(fake.set).toHaveBeenCalledWith(DIRTY_KEY, '1', 'PX', DIRTY_TTL_MS);
  });

  test('the leader drops the dirty key when it applies a nudge', async () => {
    const fake = makeFakeRedis();
    jest.spyOn(redisLib, 'getRedis').mockReturnValue(fake);
    fake.data.set(DIRTY_KEY, { val: '1', exp: Date.now() + DIRTY_TTL_MS });
    const nudge = jest.fn();
    scheduler.init({ prisma: {}, io: null, notificationService: {} });
    scheduler.setReminderNudge(nudge);
    scheduler.nudgeReminders();
    await Promise.resolve();
    await Promise.resolve();
    expect(nudge).toHaveBeenCalledTimes(1);
    expect(fake.data.has(DIRTY_KEY)).toBe(false);
  });

  test('a leader resync drops the dirty key after nudging', async () => {
    const fake = makeFakeRedis();
    jest.spyOn(redisLib, 'getRedis').mockReturnValue(fake);
    fake.data.set(DIRTY_KEY, { val: '1', exp: Date.now() + DIRTY_TTL_MS });
    const nudge = jest.fn();
    scheduler.init({ prisma: {}, io: null, notificationService: {} });
    scheduler.setReminderNudge(nudge);
    scheduler.resyncGame({ id: 'g1', status: 'CANCELLED', start: new Date(Date.now() + 3600e3) });
    await Promise.resolve();
    await Promise.resolve();
    expect(nudge).toHaveBeenCalled();
    expect(fake.data.has(DIRTY_KEY)).toBe(false);
  });

  test('resyncGame nudges the reminder driver (a game write can move a reminder moment)', () => {
    const nudge = jest.fn();
    scheduler.init({ prisma: {}, io: null, notificationService: {} });
    scheduler.setReminderNudge(nudge);
    scheduler.resyncGame({ id: 'g1', status: 'CANCELLED', start: new Date(Date.now() + 3600e3) });
    expect(nudge).toHaveBeenCalled();
  });
});
