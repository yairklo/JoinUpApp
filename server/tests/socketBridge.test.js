const { createPublisherIo, applySocketEvent } = require('../utils/socketBridge');

describe('socket bridge', () => {
  test('publisher io.to().emit sends a room-scoped message', async () => {
    const sent = [];
    const io = createPublisherIo((msg) => sent.push(msg));
    io.to('user_1').emit('notification', { ok: true });
    await new Promise((r) => setImmediate(r));
    expect(sent).toEqual([{
      rooms: ['user_1'],
      event: 'notification',
      payload: { ok: true },
      broadcast: false,
    }]);
  });

  test('applySocketEvent fans out to rooms or broadcasts', () => {
    const emitted = [];
    const io = {
      emit: (event, payload) => emitted.push({ type: 'all', event, payload }),
      to: (room) => ({
        emit: (event, payload) => emitted.push({ type: 'room', room, event, payload }),
      }),
    };
    applySocketEvent(io, { broadcast: true, event: 'game:deleted', payload: { gameIds: ['a'] } });
    applySocketEvent(io, { rooms: ['user_1'], event: 'pick:state', payload: { ok: 1 } });
    expect(emitted).toEqual([
      { type: 'all', event: 'game:deleted', payload: { gameIds: ['a'] } },
      { type: 'room', room: 'user_1', event: 'pick:state', payload: { ok: 1 } },
    ]);
  });
});

describe('socket bridge local delivery (multi-instance de-dup)', () => {
  function mockIo() {
    const calls = [];
    const make = (tag) => ({
      emit: (event, payload) => calls.push({ tag, event, payload }),
      to: (room) => ({ emit: (event, payload) => calls.push({ tag, room, event, payload }) }),
    });
    const io = make('cluster');
    io.local = make('local');
    return { io, calls };
  }

  test('applySocketEvent delivers via io.local and never via the cluster-wide emit', () => {
    const { io, calls } = mockIo();
    applySocketEvent(io, { broadcast: true, event: 'a', payload: 1 });
    applySocketEvent(io, { rooms: ['r1', 'r2'], event: 'b', payload: 2 });
    expect(calls.every((c) => c.tag === 'local')).toBe(true);
    expect(calls).toHaveLength(3);
  });

  test('falls back to plain io when no local flag exists', () => {
    const calls = [];
    const io = { emit: (e) => calls.push(e), to: () => ({ emit: (e) => calls.push(e) }) };
    applySocketEvent(io, { broadcast: true, event: 'x' });
    applySocketEvent(io, { rooms: ['r'], event: 'y' });
    expect(calls).toEqual(['x', 'y']);
  });
});
