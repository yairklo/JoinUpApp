const { containsSevereSlur } = require('../services/profanityFilter');

describe('containsSevereSlur', () => {
  test('blocks severe sexual slurs, inflections, and split letters', () => {
    expect(containsSevereSlur('זונה')).toBe(true);
    expect(containsSevereSlur('שלום זונה!')).toBe(true);
    expect(containsSevereSlur('ז ו נ ה')).toBe(true);
    expect(containsSevereSlur('זו-נה')).toBe(true);
    expect(containsSevereSlur('בן זונה')).toBe(true);
    expect(containsSevereSlur('you WHORE')).toBe(true);
  });

  test('ordinary swearing is not a severe slur', () => {
    expect(containsSevereSlur('איזה חרא של משחק')).toBe(false);
    expect(containsSevereSlur('shit, missed it')).toBe(false);
    expect(containsSevereSlur('FUCK this')).toBe(false);
    expect(containsSevereSlur('איזה זין')).toBe(false);
  });

  test('does not flag ordinary game chat or a cup of water', () => {
    expect(containsSevereSlur('בוא נשחק כדורגל ב-18:00')).toBe(false);
    expect(containsSevereSlur('כוס מים בבקשה')).toBe(false);
    expect(containsSevereSlur('מזונות לקבוצה')).toBe(false);
    expect(containsSevereSlur('class is at 6')).toBe(false);
    expect(containsSevereSlur('')).toBe(false);
  });
});
