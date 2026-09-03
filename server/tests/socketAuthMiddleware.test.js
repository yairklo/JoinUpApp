// createClerkClient is not mocked here on purpose: '../utils/auth' (below) is fully replaced,
// so the real utils/auth.js — the only caller of createClerkClient — never actually loads.
jest.mock('@clerk/backend', () => ({
  verifyToken: jest.fn(),
}));

const mockGetUser = jest.fn();
// authenticateToken/attachOptionalUser are not exercised by any test in this file — present only
// because require('../index') below registers every route at module-load time, and Express
// throws immediately if a wired-in middleware is undefined.
jest.mock('../utils/auth', () => ({
  authenticateToken: (req, res, next) => next(),
  attachOptionalUser: (_req, _res, next) => next(),
  clerkClient: { users: { getUser: mockGetUser } },
}));

const mockResolveIsBanned = jest.fn();
// requireAdmin: same module-load-time reasoning as above, not exercised by this file's tests.
jest.mock('../utils/admin', () => ({
  requireAdmin: (_req, _res, next) => next(),
  resolveIsBanned: mockResolveIsBanned,
}));

jest.mock('../workers/reviewWorker', () => ({
  processReviewQueue: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../workers/cleanupWorker', () => ({
  startCleanupWorker: jest.fn(),
}));

const { verifyToken } = require('@clerk/backend');
const { socketAuthMiddleware } = require('../index');

function mockSocket({ authToken, headerToken } = {}) {
  return {
    handshake: {
      auth: authToken ? { token: authToken } : {},
      headers: headerToken ? { authorization: `Bearer ${headerToken}` } : {},
    },
  };
}

describe('socketAuthMiddleware (Socket.IO connection auth)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveIsBanned.mockReturnValue(false);
  });

  test('no token at all: next(Unauthorized), socket.userId never set', async () => {
    const socket = mockSocket();
    const next = jest.fn();

    await socketAuthMiddleware(socket, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(next.mock.calls[0][0].message).toEqual('Unauthorized');
    expect(socket.userId).toBeUndefined();
    expect(verifyToken).not.toHaveBeenCalled();
  });

  test('token present but verifyToken rejects: fails closed with Unauthorized, not re-thrown', async () => {
    verifyToken.mockRejectedValue(new Error('token expired'));
    const socket = mockSocket({ authToken: 'bad-token' });
    const next = jest.fn();

    await expect(socketAuthMiddleware(socket, next)).resolves.toBeUndefined();

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].message).toEqual('Unauthorized');
  });

  test('verifyToken resolves but claims.sub is missing: fails closed with Unauthorized', async () => {
    verifyToken.mockResolvedValue({ sub: null });
    const socket = mockSocket({ headerToken: 'valid-but-subless' });
    const next = jest.fn();

    await socketAuthMiddleware(socket, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].message).toEqual('Unauthorized');
  });

  test('valid token, but the Clerk ban-check itself throws: connection still succeeds (deliberate, not a regression)', async () => {
    verifyToken.mockResolvedValue({ sub: 'user_1' });
    mockGetUser.mockRejectedValue(new Error('Clerk API unreachable'));
    const socket = mockSocket({ authToken: 'good-token' });
    const next = jest.fn();

    await socketAuthMiddleware(socket, next);

    expect(socket.userId).toEqual('user_1');
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(); // called with no error — allowed through
  });

  test('valid token, ban check succeeds and user is banned: next(Account suspended), distinct from Unauthorized', async () => {
    verifyToken.mockResolvedValue({ sub: 'user_2' });
    mockGetUser.mockResolvedValue({ privateMetadata: { isBanned: true } });
    mockResolveIsBanned.mockReturnValue(true);
    const socket = mockSocket({ authToken: 'good-token' });
    const next = jest.fn();

    await socketAuthMiddleware(socket, next);

    expect(socket.userId).toEqual('user_2');
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(next.mock.calls[0][0].message).toEqual('Account suspended');
  });
});
