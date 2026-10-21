const mockPrisma = {
  flaggedMessage: { findMany: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
  message: { updateMany: jest.fn(), findUnique: jest.fn() },
};
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
const mockCheck = jest.fn();
const mockAdjust = jest.fn();
jest.mock('../moderationInstance', () => ({
  moderator: { checkMessage: (...a) => mockCheck(...a), security: { adjustReputation: (...a) => mockAdjust(...a) } },
}));
jest.mock('../services/gameScheduler', () => ({ armReviewRetry: jest.fn() }));

const { processReviewQueue } = require('../workers/reviewWorker');

const item = { id: 'f1', messageId: 'm1', content: 'bad', userId: 'u1', aiTriggers: null, status: 'PENDING_RETRY', retryCount: 0 };

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.REDIS_URL;
  mockPrisma.flaggedMessage.findMany.mockResolvedValue([item]);
  mockCheck.mockResolvedValue({ reviewNeeded: false, isSafe: false });
  mockPrisma.message.updateMany.mockResolvedValue({ count: 1 });
});

test('rejection applies side effects only for the run that wins the status claim', async () => {
  mockPrisma.flaggedMessage.updateMany.mockResolvedValue({ count: 1 });
  await processReviewQueue();
  expect(mockAdjust).toHaveBeenCalledWith('u1', -20);
  expect(mockPrisma.message.updateMany).toHaveBeenCalled();
});

test('a run that loses the claim (overlap or leader hand-over) does not delete or penalise again', async () => {
  mockPrisma.flaggedMessage.updateMany.mockResolvedValue({ count: 0 });
  await processReviewQueue();
  expect(mockAdjust).not.toHaveBeenCalled();
  expect(mockPrisma.message.updateMany).not.toHaveBeenCalled();
});

test('aborts before touching anything once the instance is no longer the leader', async () => {
  await processReviewQueue({ isActive: () => false });
  expect(mockCheck).not.toHaveBeenCalled();
  expect(mockAdjust).not.toHaveBeenCalled();
});
