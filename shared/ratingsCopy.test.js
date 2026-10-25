const { RATINGS_COPY, ratingsAverage, ratingsStarLabel } = require('./ratingsCopy');

describe('ratingsCopy', () => {
  it('keeps the Hebrew strings the web rating surfaces already show', () => {
    expect(RATINGS_COPY).toMatchObject({
      title: 'דרג את חברי הקבוצה',
      hint: 'דרג את השחקנים ששיחקו איתך במשחק זה (1–5 כוכבים).',
      allDone: 'תודה! דירגת את כל חברי הקבוצה.',
      noRatings: 'אין דירוגים עדיין',
      submitted: 'הדירוג נשמר',
      alreadyRated: 'כבר דירגת שחקן זה במשחק זה',
      submitFailed: 'שליחת הדירוג נכשלה',
      empty: 'ריק',
    });
    expect(ratingsAverage('4.0', 3)).toBe('4.0 (3 דירוגים)');
    expect(ratingsStarLabel(1)).toBe('1 כוכב');
    expect(ratingsStarLabel(4)).toBe('4 כוכבים');
  });
});
