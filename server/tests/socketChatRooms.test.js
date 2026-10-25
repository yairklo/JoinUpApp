/**
 * Unit tests for live chat-room membership. No database: the helper only talks to Socket.IO.
 * Chat rooms are the chat id string (joinRoom / joinChats). Personal rooms are user_${id}.
 */
const { leaveUserChatRoom, leaveChatMemberships, disconnectUserSockets } = require('../utils/socketChatRooms');

function fakeIo() {
  const calls = [];
  return {
    calls,
    in: (room) => ({
      socketsLeave: (leave) => calls.push(['leave', room, leave]),
      disconnectSockets: (close) => calls.push(['disconnect', room, close]),
    }),
  };
}

describe('leaveUserChatRoom', () => {
  test('removes the user room from the chat id room', () => {
    const io = fakeIo();
    leaveUserChatRoom(io, 'uid', 'chat_1');
    expect(io.calls).toEqual([['leave', 'user_uid', 'chat_1']]);
  });

  test('stringifies ids the same way chat joins do', () => {
    const io = fakeIo();
    leaveUserChatRoom(io, 12, 34);
    expect(io.calls).toEqual([['leave', 'user_12', '34']]);
  });

  test('no-ops without io, user, or chat', () => {
    const io = fakeIo();
    leaveUserChatRoom(null, 'u', 'c');
    leaveUserChatRoom(io, '', 'c');
    leaveUserChatRoom(io, 'u', '');
    leaveUserChatRoom(io, null, 'c');
    leaveUserChatRoom(io, 'u', null);
    expect(io.calls).toEqual([]);
  });

  test('no-ops when the server cannot drop rooms', () => {
    const io = { in: () => ({}) };
    expect(() => leaveUserChatRoom(io, 'u', 'c')).not.toThrow();
  });

  test('swallows a socketsLeave failure', () => {
    const io = { in: () => { throw new Error('adapter down'); } };
    jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => leaveUserChatRoom(io, 'u', 'c')).not.toThrow();
    console.error.mockRestore();
  });
});

describe('leaveChatMemberships', () => {
  test('leaves each captured membership', () => {
    const io = fakeIo();
    leaveChatMemberships(io, [
      { userId: 'a', chatId: 'c1' },
      null,
      { userId: 'b', chatId: 'c2' },
    ]);
    expect(io.calls).toEqual([
      ['leave', 'user_a', 'c1'],
      ['leave', 'user_b', 'c2'],
    ]);
  });

  test('no-ops without a list', () => {
    const io = fakeIo();
    leaveChatMemberships(io, null);
    leaveChatMemberships(null, [{ userId: 'a', chatId: 'c1' }]);
    expect(io.calls).toEqual([]);
  });
});

describe('disconnectUserSockets', () => {
  test('closes every socket in the user room', () => {
    const io = fakeIo();
    disconnectUserSockets(io, 'uid');
    expect(io.calls).toEqual([['disconnect', 'user_uid', true]]);
  });

  test('no-ops without io or user', () => {
    const io = fakeIo();
    disconnectUserSockets(null, 'uid');
    disconnectUserSockets(io, '');
    disconnectUserSockets(io, null);
    expect(io.calls).toEqual([]);
  });

  test('swallows a disconnect failure', () => {
    const io = { in: () => { throw new Error('adapter down'); } };
    jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => disconnectUserSockets(io, 'uid')).not.toThrow();
    console.error.mockRestore();
  });
});
