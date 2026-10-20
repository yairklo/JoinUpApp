const { isUserOnline, hasOtherUserInRoom, fetchRoomSockets } = require('../utils/socketPresence');

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
