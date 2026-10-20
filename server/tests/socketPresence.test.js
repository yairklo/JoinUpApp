const {
  isUserOnline, hasOtherUserInRoom, getUserPresence, queryCluster, resetPresenceBreaker, _breaker,
} = require('../utils/socketPresence');

beforeEach(() => resetPresenceBreaker());

function ioWith(fetchImpl, local = {}) {
  const rooms = new Map();
  const sockets = new Map();
  for (const [room, list] of Object.entries(local)) {
    rooms.set(room, new Set(list.map((s) => s.id)));
    for (const s of list) sockets.set(s.id, { id: s.id, userId: s.userId, data: { userId: s.userId } });
  }
  return {
    in: () => ({ fetchSockets: fetchImpl }),
    sockets: { adapter: { rooms }, sockets },
  };
}

test('online when fetchSockets returns sockets', async () => {
  const io = ioWith(async () => [{ id: 'a', data: { userId: 'u1' } }]);
  expect(await getUserPresence(io, 'u1')).toBe('online');
  expect(await isUserOnline(io, 'u1')).toBe(true);
});

test('offline only when the cluster answered and found nobody', async () => {
  const io = ioWith(async () => []);
  expect(await getUserPresence(io, 'u1')).toBe('offline');
  expect(await isUserOnline(io, 'u1')).toBe(false);
});

test('hasOtherUserInRoom ignores the sender own sockets when the answer is known', async () => {
  const mine = ioWith(async () => [{ id: 'a', data: { userId: 'u1' } }, { id: 'b', data: { userId: 'u1' } }]);
  expect(await hasOtherUserInRoom(mine, 'r', 'u1')).toBe(false);
  const other = ioWith(async () => [{ id: 'a', data: { userId: 'u1' } }, { id: 'c', data: { userId: 'u2' } }]);
  expect(await hasOtherUserInRoom(other, 'r', 'u1')).toBe(true);
});

describe('unknown is treated as maybe online / maybe present, never as offline', () => {
  test('a rejecting cluster => unknown => still counted online (no false offline event)', async () => {
    const io = ioWith(async () => { throw new Error('adapter down'); });
    expect(await getUserPresence(io, 'u2')).toBe('unknown');
    expect(await isUserOnline(io, 'u2')).toBe(true);
    expect(await hasOtherUserInRoom(io, 'r', 'u1')).toBe(true); // delivered is not downgraded
  });

  test('a reply slower than the soft timeout is unknown for that call but does NOT count toward the breaker', async () => {
    jest.useFakeTimers();
    try {
      let resolveSlow;
      const io = ioWith(() => new Promise((r) => { resolveSlow = r; }));
      for (let i = 0; i < 5; i++) {
        const p = isUserOnline(io, 'u9', 300);
        await jest.advanceTimersByTimeAsync(301);
        expect(await p).toBe(true); // unknown => maybe online
        resolveSlow([]); // the slow answer eventually arrives fine
        await Promise.resolve();
      }
      expect(_breaker.isOpen).toBe(false); // five slow replies never opened it
    } finally {
      jest.useRealTimers();
    }
  });

  test('a late reply that is a real error (adapter hard timeout) does count and opens the breaker', async () => {
    jest.useFakeTimers();
    try {
      const rejecters = [];
      const io = ioWith(() => new Promise((_, rej) => { rejecters.push(rej); }));
      for (let i = 0; i < 3; i++) {
        const p = isUserOnline(io, 'u9', 300);
        await jest.advanceTimersByTimeAsync(301);
        await p;
        rejecters[i](new Error('timeout reached while waiting for fetchSockets response'));
        await Promise.resolve();
        await Promise.resolve();
      }
      expect(_breaker.isOpen).toBe(true);
      const fetchSpy = jest.fn();
      const io2 = ioWith(fetchSpy);
      expect(await isUserOnline(io2, 'u9')).toBe(true); // open breaker => unknown => maybe online
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  test('queryCluster reports known:false rather than an empty (offline-looking) answer', async () => {
    const io = ioWith(async () => { throw new Error('x'); });
    expect(await queryCluster(io, 'r')).toEqual({ known: false, sockets: [] });
  });
});

test('a local hit answers without any cluster call', async () => {
  const fetchImpl = jest.fn(async () => []);
  const io = ioWith(fetchImpl, { user_u1: [{ id: 's1', userId: 'u1' }], r: [{ id: 's2', userId: 'u9' }] });
  expect(await isUserOnline(io, 'u1')).toBe(true);
  expect(await hasOtherUserInRoom(io, 'r', 'u1')).toBe(true);
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('the cluster query excludes the sender personal room so only other users are transferred', async () => {
  const except = jest.fn(() => ({ fetchSockets: async () => [{ id: 'x', data: { userId: 'u2' } }] }));
  const io = { in: () => ({ except, fetchSockets: async () => { throw new Error('must use except'); } }), sockets: { adapter: { rooms: new Map() }, sockets: new Map() } };
  expect(await hasOtherUserInRoom(io, 'r', 'u1')).toBe(true);
  expect(except).toHaveBeenCalledWith('user_u1');
});
