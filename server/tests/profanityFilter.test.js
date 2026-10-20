const { containsProfanity } = require('../services/profanityFilter');

describe('containsProfanity', () => {
  test('blocks the reported slur, inflections, and split letters', () => {
    expect(containsProfanity('זונה')).toBe(true);
    expect(containsProfanity('שלום זונה!')).toBe(true);
    expect(containsProfanity('ז ו נ ה')).toBe(true);
    expect(containsProfanity('זו-נה')).toBe(true);
    expect(containsProfanity('FUCK this')).toBe(true);
    expect(containsProfanity('בן זונה')).toBe(true);
  });

  test('does not flag ordinary game chat or a cup of water', () => {
    expect(containsProfanity('בוא נשחק כדורגל ב-18:00')).toBe(false);
    expect(containsProfanity('כוס מים בבקשה')).toBe(false);
    expect(containsProfanity('מזונות לקבוצה')).toBe(false);
    expect(containsProfanity('class is at 6')).toBe(false);
    expect(containsProfanity('')).toBe(false);
  });
});
