const { needsAiReview } = require('../services/moderationGate');

describe('needsAiReview', () => {
  test.each([
    'תוסיף אותי בוואטסאפ',
    'שלח לי תמונה',
    'add me on snap',
    '050-123-4567',
    'https://t.me/someone',
    'אל תספר להורים, זה סוד',
    'בוא ניפגש אחרי המשחק',
    'בן כמה אתה?',
    'אני אהרוג אותך',
    'שלום זונה',
  ])('gates %s', (text) => {
    expect(needsAiReview(text)).toBe(true);
  });

  test.each([
    'מגיע ב-8',
    'מי מביא כדור?',
    'איזה חרא של משחק',
    'GG well played',
    'אפשר להגיע עם חבר?',
    '',
  ])('skips ordinary chat: %s', (text) => {
    expect(needsAiReview(text)).toBe(false);
  });
});
