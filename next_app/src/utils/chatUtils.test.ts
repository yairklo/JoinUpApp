import { getPrivateChatRoomId } from './chatUtils';

describe('getPrivateChatRoomId', () => {
  test('is symmetric regardless of argument order', () => {
    const a = getPrivateChatRoomId('user_1', 'user_2');
    const b = getPrivateChatRoomId('user_2', 'user_1');
    expect(a).toEqual(b);
  });

  test('produces the expected deterministic id shape', () => {
    expect(getPrivateChatRoomId('user_b', 'user_a')).toEqual('private_user_a_user_b');
  });

  test('two different user pairs never collide', () => {
    const roomA = getPrivateChatRoomId('user_1', 'user_2');
    const roomB = getPrivateChatRoomId('user_1', 'user_3');
    expect(roomA).not.toEqual(roomB);
  });
});
