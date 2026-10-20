const { isUserOnline, hasOtherUserInRoom, fetchRoomSockets, resetPresenceBreaker } = require('../utils/socketPresence');

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
  expect(await isUserOnline(io, 'u1')).toBe(true);
});

test('offline when fetchSockets returns none', async () => {
  const io = ioWith(async () => []);
  expect(await isUserOnline(io, 'u1')).toBe(false);
});

test('hasOtherUserInRoom ignores the sender\'s own sockets', async () => {
  const mine = ioWith(async () => [{ id: 'a', data: { userId: 'u1' } }, { id: 'b', data: { userId: 'u1' } }]);
  expect(await hasOtherUserInRoom(mine, 'r', 'u1')).toBe(false);
  const other = ioWith(async () => [{ id: 'a', data: { userId: 'u1' } }, { id: 'c', data: { userId: 'u2' } }]);
  expect(await hasOtherUserInRoom(other, 'r', 'u1')).toBe(true);
});

test('rejection falls back to the local view', async () => {
  const io = ioWith(async () => { throw new Error('adapter down'); }, { user_u1: [{ id: 's1', userId: 'u1' }] });
  expect(await isUserOnline(io, 'u1')).toBe(true);
  expect(await isUserOnline(io, 'u2')).toBe(false);
});

test('a hanging fetchSockets times out and uses the local view', async () => {
  jest.useFakeTimers();
  try {
    const io = ioWith(() => new Promise(() => {}), { r: [{ id: 's1', userId: 'u2' }] });
    const p = hasOtherUserInRoom(io, 'r', 'u1', 300);
    await jest.advanceTimersByTimeAsync(301);
    expect(await p).toBe(true);
    const p2 = fetchRoomSockets(ioWith(() => new Promise(() => {})), 'nobody', 300);
    await jest.advanceTimersByTimeAsync(301);
    expect(await p2).toEqual([]);
  } finally {
    jest.useRealTimers();
  }
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

test('a failing cluster opens the breaker: later calls do not touch it until it closes', async () => {
  const fetchImpl = jest.fn(async () => { throw new Error('redis down'); });
  const io = ioWith(fetchImpl);
  for (let i = 0; i < 3; i++) await isUserOnline(io, 'u1');
  expect(fetchImpl).toHaveBeenCalledTimes(3);
  expect(await isUserOnline(io, 'u1')).toBe(false); // local view, no cluster call
  expect(await hasOtherUserInRoom(io, 'r', 'u1')).toBe(false);
  expect(fetchImpl).toHaveBeenCalledTimes(3);
});
