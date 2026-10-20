// Chat send-path safety policy: AI moderation only for minor recipients, fail-closed only
// for minor non-friends, message length and send-rate limits. No DB: Prisma is mocked.
const mockChatRoomFindUnique = jest.fn();
const mockParticipationFindMany = jest.fn();
const mockUserFindMany = jest.fn();
const mockFriendshipFindMany = jest.fn();
const mockFlaggedCreate = jest.fn();

jest.mock('../lib/prisma', () => ({
  prisma: {
    chatRoom: { findUnique: (...a) => mockChatRoomFindUnique(...a) },
    participation: { findMany: (...a) => mockParticipationFindMany(...a) },
    user: { findMany: (...a) => mockUserFindMany(...a) },
    friendship: { findMany: (...a) => mockFriendshipFindMany(...a) },
    flaggedMessage: { create: (...a) => mockFlaggedCreate(...a) },
  },
}));

const {
  MAX_MESSAGE_LENGTH,
  validateMessageText,
  createSendRateLimiter,
  assessOutgoingMessage,
} = require('../services/chatSafety');

const yearsAgo = (n) => new Date(Date.now() - n * 365.25 * 24 * 3600 * 1000 - 7 * 24 * 3600 * 1000);
const ADULT = yearsAgo(30);
const MINOR = yearsAgo(14);

const sender = { id: 'sender', birthDate: ADULT, gender: 'MALE' };
const GATED = 'שלח לי תמונה'; // trips the pre-gate, so AI moderation runs
const minorSender = { id: 'sender', birthDate: MINOR, gender: 'MALE' };

function room(...userIds) {
  mockChatRoomFindUnique.mockResolvedValue({
    participants: ['sender', ...userIds].map((userId) => ({ userId })),
  });
}
function users(map) {
  mockUserFindMany.mockResolvedValue(Object.entries(map).map(([id, birthDate]) => ({ id, birthDate })));
}
function friendsWith(...ids) {
  mockFriendshipFindMany.mockResolvedValue(ids.map((id) => ({ userAId: 'sender', userBId: id })));
}
const moderatorReturning = (result) => ({ checkMessage: jest.fn().mockResolvedValue(result) });
const moderatorThrowing = () => ({ checkMessage: jest.fn().mockRejectedValue(new Error('boom')) });
const UNVERIFIED = { isSafe: true, reviewNeeded: true, unverified: true, source: 'fail_open_error' };

beforeEach(() => {
  jest.clearAllMocks();
  mockFriendshipFindMany.mockResolvedValue([]);
  mockFlaggedCreate.mockResolvedValue({});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('assessOutgoingMessage', () => {
  test('adult-only chat: never calls AI moderation', async () => {
    room('bob');
    users({ bob: ADULT });
    const moderator = moderatorReturning({ isSafe: false });
    const res = await assessOutgoingMessage({ moderator, sender, roomId: 'r1', text: 'hi' });
    expect(res).toEqual({ status: 'sent', recipientIds: ['bob'] });
    expect(moderator.checkMessage).not.toHaveBeenCalled();
  });

  test('unknown recipient age is treated as adult (no moderation)', async () => {
    room('bob');
    users({ bob: null });
    const moderator = moderatorReturning({ isSafe: false });
    const res = await assessOutgoingMessage({ moderator, sender, roomId: 'r1', text: 'hi' });
    expect(res.status).toBe('sent');
    expect(moderator.checkMessage).not.toHaveBeenCalled();
  });

  test('minor recipient: moderation runs with the youngest age, unsafe -> blocked', async () => {
    room('kid', 'bob');
    users({ kid: MINOR, bob: ADULT });
    const moderator = moderatorReturning({ isSafe: false, source: 'gemini_decision' });
    const res = await assessOutgoingMessage({ moderator, sender, roomId: 'r1', text: GATED });
    expect(res.status).toBe('blocked');
    expect(moderator.checkMessage.mock.calls[0][3]).toMatchObject({ userId: 'sender', userAge: 30, receiverAge: 14 });
  });

  test('minor recipient: unsafe is blocked even between friends', async () => {
    room('kid');
    users({ kid: MINOR });
    friendsWith('kid');
    const res = await assessOutgoingMessage({ moderator: moderatorReturning({ isSafe: false }), sender, roomId: 'r1', text: GATED });
    expect(res.status).toBe('blocked');
  });

  test('minor recipient, safe verdict -> sent', async () => {
    room('kid');
    users({ kid: MINOR });
    const res = await assessOutgoingMessage({ moderator: moderatorReturning({ isSafe: true, source: 'openai_clean' }), sender, roomId: 'r1', text: GATED });
    expect(res.status).toBe('sent');
  });

  test.each([
    ['moderation threw', moderatorThrowing],
    ['moderation unverified (AI down / AI rate limit)', () => moderatorReturning(UNVERIFIED)],
  ])('%s + minor non-friend -> blocked (fail closed)', async (_label, make) => {
    room('kid');
    users({ kid: MINOR });
    const res = await assessOutgoingMessage({ moderator: make(), sender, roomId: 'r1', text: GATED });
    expect(res.status).toBe('blocked');
  });

  test.each([
    ['moderation threw', moderatorThrowing],
    ['moderation unverified', () => moderatorReturning(UNVERIFIED)],
  ])('%s + minor who is a friend -> sent', async (_label, make) => {
    room('kid');
    users({ kid: MINOR });
    friendsWith('kid');
    const res = await assessOutgoingMessage({ moderator: make(), sender, roomId: 'r1', text: GATED });
    expect(res.status).toBe('sent');
  });

  test('group with a friend minor and a non-friend minor, moderation down -> blocked', async () => {
    room('kidFriend', 'kidStranger');
    users({ kidFriend: MINOR, kidStranger: MINOR });
    friendsWith('kidFriend');
    const res = await assessOutgoingMessage({ moderator: moderatorThrowing(), sender, roomId: 'r1', text: GATED });
    expect(res.status).toBe('blocked');
  });

  test('reviewNeeded saves a FlaggedMessage and fires onFlagged', async () => {
    room('kid');
    users({ kid: MINOR });
    friendsWith('kid');
    const onFlagged = jest.fn();
    await assessOutgoingMessage({ moderator: moderatorReturning(UNVERIFIED), sender, roomId: 'r1', text: GATED, onFlagged });
    expect(mockFlaggedCreate).toHaveBeenCalledTimes(1);
    expect(mockFlaggedCreate.mock.calls[0][0].data).toMatchObject({ content: GATED, userId: 'sender', status: 'PENDING_REVIEW' });
    expect(onFlagged).toHaveBeenCalled();
  });

  test('recipient lookup failure throws (caller must not deliver)', async () => {
    mockChatRoomFindUnique.mockRejectedValue(new Error('db down'));
    await expect(
      assessOutgoingMessage({ moderator: moderatorReturning({ isSafe: true }), sender, roomId: 'r1', text: 'hi' })
    ).rejects.toThrow('db down');
  });

  test('legacy private_ room id resolves the other user', async () => {
    mockChatRoomFindUnique.mockResolvedValue(null);
    users({ bob: ADULT });
    const res = await assessOutgoingMessage({ moderator: moderatorReturning({ isSafe: true }), sender, roomId: 'private_sender_bob', text: 'hi' });
    expect(res.recipientIds).toEqual(['bob']);
  });

  test('game room id falls back to confirmed participants', async () => {
    mockChatRoomFindUnique.mockResolvedValue(null);
    mockParticipationFindMany.mockResolvedValue([{ userId: 'p1' }, { userId: 'p2' }]);
    users({ p1: ADULT, p2: ADULT });
    const res = await assessOutgoingMessage({ moderator: moderatorReturning({ isSafe: true }), sender, roomId: 'game123', text: 'hi' });
    expect(res.recipientIds).toEqual(['p1', 'p2']);
  });

  test('minor sender is never moderated, in private or group chats', async () => {
    const moderator = moderatorReturning({ isSafe: false });
    room('bob');
    users({ bob: ADULT });
    let res = await assessOutgoingMessage({ moderator, sender: minorSender, roomId: 'r1', text: 'זונה שלח לי תמונה' });
    expect(res.status).toBe('sent');
    mockChatRoomFindUnique.mockResolvedValue(null);
    mockParticipationFindMany.mockResolvedValue([{ userId: 'kid' }, { userId: 'bob' }]);
    users({ kid: MINOR, bob: ADULT });
    res = await assessOutgoingMessage({ moderator, sender: minorSender, roomId: 'game123', text: 'fuck this shit' });
    expect(res.status).toBe('sent');
    expect(moderator.checkMessage).not.toHaveBeenCalled();
  });

  test('private adult → minor: a severe slur is blocked without calling AI', async () => {
    room('kid');
    users({ kid: MINOR });
    const moderator = moderatorReturning({ isSafe: true, source: 'openai_clean' });
    const res = await assessOutgoingMessage({ moderator, sender, roomId: 'r1', text: 'זונה' });
    expect(res.status).toBe('blocked');
    expect(res.reason).toBe('profanity');
    expect(moderator.checkMessage).not.toHaveBeenCalled();
  });

  test('private adult → minor: ordinary swearing is not blocked and skips AI', async () => {
    room('kid');
    users({ kid: MINOR });
    const moderator = moderatorReturning({ isSafe: false });
    const res = await assessOutgoingMessage({ moderator, sender, roomId: 'r1', text: 'איזה חרא של משחק' });
    expect(res.status).toBe('sent');
    expect(moderator.checkMessage).not.toHaveBeenCalled();
  });

  test('game chat with a minor: an adult slur is not lexicon-blocked', async () => {
    mockChatRoomFindUnique.mockResolvedValue(null);
    mockParticipationFindMany.mockResolvedValue([{ userId: 'kid' }, { userId: 'bob' }]);
    users({ kid: MINOR, bob: ADULT });
    const moderator = moderatorReturning({ isSafe: true });
    const res = await assessOutgoingMessage({ moderator, sender, roomId: 'game123', text: 'שלום זונה' });
    expect(res.status).toBe('sent');
  });

  test('game chat with a minor: a grooming-signal message from an adult still goes to AI', async () => {
    mockChatRoomFindUnique.mockResolvedValue(null);
    mockParticipationFindMany.mockResolvedValue([{ userId: 'kid' }, { userId: 'bob' }]);
    users({ kid: MINOR, bob: ADULT });
    const moderator = moderatorReturning({ isSafe: false, source: 'gemini_decision' });
    const res = await assessOutgoingMessage({ moderator, sender, roomId: 'game123', text: GATED });
    expect(res.status).toBe('blocked');
    expect(moderator.checkMessage).toHaveBeenCalledTimes(1);
  });

  test('adult → minor: an ordinary message never reaches AI, even if AI is down', async () => {
    room('kid');
    users({ kid: MINOR });
    const moderator = moderatorThrowing();
    const res = await assessOutgoingMessage({ moderator, sender, roomId: 'r1', text: 'מגיע ב-8' });
    expect(res.status).toBe('sent');
    expect(moderator.checkMessage).not.toHaveBeenCalled();
  });

  test('a blocked slur leaves a moderator trail', async () => {
    room('kid');
    users({ kid: MINOR });
    await assessOutgoingMessage({ moderator: moderatorReturning({ isSafe: true }), sender, roomId: 'r1', text: 'זונה' });
    expect(mockFlaggedCreate).toHaveBeenCalledTimes(1);
    expect(mockFlaggedCreate.mock.calls[0][0].data).toMatchObject({
      content: 'זונה', userId: 'sender', status: 'PENDING_REVIEW',
      aiTriggers: { source: 'blocked_attempt', reason: 'severe_slur', chatMode: 'ADULT_TO_MINOR' },
    });
  });

  test('an AI-blocked message leaves a trail, but not a duplicate when reviewNeeded already writes one', async () => {
    room('kid');
    users({ kid: MINOR });
    await assessOutgoingMessage({ moderator: moderatorReturning({ isSafe: false, source: 'gemini_decision' }), sender, roomId: 'r1', text: GATED });
    expect(mockFlaggedCreate).toHaveBeenCalledTimes(1);
    expect(mockFlaggedCreate.mock.calls[0][0].data.aiTriggers).toMatchObject({ source: 'blocked_attempt', reason: 'blocked_unsafe' });

    mockFlaggedCreate.mockClear();
    await assessOutgoingMessage({ moderator: moderatorReturning({ isSafe: false, reviewNeeded: true, source: 'gemini_decision' }), sender, roomId: 'r1', text: GATED });
    expect(mockFlaggedCreate).toHaveBeenCalledTimes(1);
  });

  test('a sent message leaves no trail', async () => {
    room('kid');
    users({ kid: MINOR });
    await assessOutgoingMessage({ moderator: moderatorReturning({ isSafe: true, source: 'openai_clean' }), sender, roomId: 'r1', text: GATED });
    expect(mockFlaggedCreate).not.toHaveBeenCalled();
  });

  test('adult-only chat: nothing is filtered', async () => {
    room('bob');
    users({ bob: ADULT });
    const moderator = moderatorReturning({ isSafe: false });
    const res = await assessOutgoingMessage({ moderator, sender, roomId: 'r1', text: 'זונה' });
    expect(res.status).toBe('sent');
    expect(moderator.checkMessage).not.toHaveBeenCalled();
  });
});

describe('validateMessageText', () => {
  test('rejects empty, whitespace and non-strings', () => {
    expect(validateMessageText('')).toBe('EMPTY_MESSAGE');
    expect(validateMessageText('   ')).toBe('EMPTY_MESSAGE');
    expect(validateMessageText({ a: 1 })).toBe('EMPTY_MESSAGE');
  });
  test('enforces the max length', () => {
    expect(validateMessageText('a'.repeat(MAX_MESSAGE_LENGTH))).toBeNull();
    expect(validateMessageText('a'.repeat(MAX_MESSAGE_LENGTH + 1))).toBe('MESSAGE_TOO_LONG');
  });
});

describe('createSendRateLimiter', () => {
  test('allows max per window per user, then recovers after the window', () => {
    const limiter = createSendRateLimiter({ windowMs: 1000, max: 3 });
    const t = 1_000_000;
    expect([1, 2, 3].map((i) => limiter.allow('u1', t + i))).toEqual([true, true, true]);
    expect(limiter.allow('u1', t + 4)).toBe(false);
    expect(limiter.allow('u2', t + 4)).toBe(true);
    expect(limiter.allow('u1', t + 1002)).toBe(true);
  });
});
