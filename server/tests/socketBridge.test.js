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
