// Hebrew rating copy shared by the web app. Mobile keeps the same wording in i18n
// (`ratings.*`); these strings match what the web already renders, including punctuation.
const RATINGS_COPY = {
  title: 'דרג את חברי הקבוצה',
  hint: 'דרג את השחקנים ששיחקו איתך במשחק זה (1–5 כוכבים).',
  allDone: 'תודה! דירגת את כל חברי הקבוצה.',
  noRatings: 'אין דירוגים עדיין',
  submitted: 'הדירוג נשמר',
  alreadyRated: 'כבר דירגת שחקן זה במשחק זה',
  submitFailed: 'שליחת הדירוג נכשלה',
  empty: 'ריק',
};

/** "{{score}} ({{count}} דירוגים)" — score is already formatted (one decimal on the profile). */
function ratingsAverage(score, count) {
  return `${score} (${count} דירוגים)`;
}

/** Accessible star name: "1 כוכב" / "N כוכבים". */
function ratingsStarLabel(value) {
  const n = Number(value);
  return `${n} ${n === 1 ? 'כוכב' : 'כוכבים'}`;
}

module.exports = {
  RATINGS_COPY,
  ratingsAverage,
  ratingsStarLabel,
};
