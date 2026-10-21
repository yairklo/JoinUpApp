jest.mock('openai', () => jest.fn().mockImplementation(() => ({
  moderations: { create: jest.fn() },
})));

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: () => ({ generateContent: jest.fn() }),
  })),
}));

const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { resolveModerationProvider } = require('../services/moderationStub');

const MEETING = 'ניפגש מחר אחרי המשחק';
const PHONE = 'הטלפון שלי 0501234567';
const LINK = 'https://example.com/map';

describe('moderation stub provider', () => {
  const ORIGINAL = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL };
    delete process.env.MODERATION_PROVIDER;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.REDIS_URL;
  });

  afterAll(() => {
    process.env = ORIGINAL;
  });

  test('stays live unless MODERATION_PROVIDER=stub', () => {
    expect(resolveModerationProvider({ NODE_ENV: 'development' })).toBe('live');
    expect(resolveModerationProvider({ NODE_ENV: 'test', MODERATION_PROVIDER: 'live' })).toBe('live');
  });

  test('refuses to enable when NODE_ENV=production', () => {
    expect(() => resolveModerationProvider({
      NODE_ENV: 'production',
      MODERATION_PROVIDER: 'stub',
    })).toThrow(/NODE_ENV=production/);
  });

  test('allows meeting proposals, phone numbers, and links without calling a model', async () => {
    process.env.NODE_ENV = 'test';
    process.env.MODERATION_PROVIDER = 'stub';
    const { ContentModerator } = require('../services/moderationService');
    const moderator = new ContentModerator();

    for (const text of [MEETING, PHONE, LINK, 'חרא במשחק', 'זונה']) {
      const result = await moderator.checkMessage(text, [], {}, { userId: 'adult', userAge: 30, receiverAge: 14 });
      expect(result).toEqual({ isSafe: true, source: 'stub', reason: 'allowed' });
      expect(result.unverified).toBeUndefined();
    }
    expect(OpenAI).not.toHaveBeenCalled();
    expect(GoogleGenerativeAI).not.toHaveBeenCalled();
  });

  test('the constructor throws in production so the API cannot boot the stub', () => {
    process.env.NODE_ENV = 'production';
    process.env.MODERATION_PROVIDER = 'stub';
    const { ContentModerator } = require('../services/moderationService');
    expect(() => new ContentModerator()).toThrow(/NODE_ENV=production/);
  });
});
