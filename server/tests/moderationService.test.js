const mockModerationsCreate = jest.fn();
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    moderations: { create: (...args) => mockModerationsCreate(...args) },
  }));
});

const mockGenerateContent = jest.fn();
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: () => ({ generateContent: (...args) => mockGenerateContent(...args) }),
  })),
}));

function cleanModerationResult(overrides = {}) {
  return {
    flagged: false,
    category_scores: {
      harassment: 0.05,
      hate: 0.05,
      'self-harm': 0.05,
      sexual: 0.05,
      'sexual/minors': 0.01,
      violence: 0.05,
      ...overrides,
    },
  };
}

describe('ContentModerator.checkMessage', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.REDIS_URL; // stay on the local LRUCache path — no Redis mocking needed
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.GOOGLE_API_KEY = 'test-google-key';
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test('empty message returns isSafe:true without calling OpenAI or Gemini', async () => {
    const { ContentModerator } = require('../services/moderationService');
    const moderator = new ContentModerator();

    const result = await moderator.checkMessage('', [], {}, { userId: 'u1' });

    expect(result).toEqual({ isSafe: true });
    expect(mockModerationsCreate).not.toHaveBeenCalled();
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  test('missing AI keys fails open with source system_down', async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    const { ContentModerator } = require('../services/moderationService');
    const moderator = new ContentModerator();

    const result = await moderator.checkMessage('hello there', [], {}, { userId: 'u2' });

    expect(result).toEqual({ isSafe: true, reviewNeeded: true, source: 'system_down' });
    expect(mockModerationsCreate).not.toHaveBeenCalled();
  });

  test('clean OpenAI result returns isSafe:true, source openai_clean, without escalating to Gemini', async () => {
    mockModerationsCreate.mockResolvedValue({ results: [cleanModerationResult()] });
    const { ContentModerator } = require('../services/moderationService');
    const moderator = new ContentModerator();

    const result = await moderator.checkMessage('just saying hi to the group', [], {}, { userId: 'u3' });

    expect(result).toEqual({ isSafe: true, source: 'openai_clean' });
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  test('OpenAI trigger above threshold escalates to Gemini and returns its verdict', async () => {
    mockModerationsCreate.mockResolvedValue({
      results: [cleanModerationResult({ harassment: 0.85, flagged: true })],
    });
    mockGenerateContent.mockResolvedValue({
      response: { text: () => JSON.stringify({ isSafe: false, reason: 'test' }) },
    });
    const { ContentModerator } = require('../services/moderationService');
    const moderator = new ContentModerator();

    // userAge/receiverAge under 18 -> TEEN thresholds (block: 0.80 for harassment), so 0.85 trips it.
    const result = await moderator.checkMessage(
      'a borderline message',
      [],
      {},
      { userId: 'u4', userAge: 15, receiverAge: 15 }
    );

    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ isSafe: false, reason: 'test', source: 'gemini_decision' });
  });

  test('an OpenAI failure fails open instead of throwing or blocking', async () => {
    mockModerationsCreate.mockRejectedValue(new Error('openai unavailable'));
    const { ContentModerator } = require('../services/moderationService');
    const moderator = new ContentModerator();

    const result = await moderator.checkMessage('any message', [], {}, { userId: 'u5' });

    expect(result.isSafe).toBe(true);
    expect(result.reviewNeeded).toBe(true);
    expect(result.source).toBe('fail_open_error');
    expect(result.auditData.error).toMatch(/openai unavailable/);
  });
});
