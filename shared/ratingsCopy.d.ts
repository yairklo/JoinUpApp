export const RATINGS_COPY: {
  title: string;
  hint: string;
  allDone: string;
  noRatings: string;
  submitted: string;
  alreadyRated: string;
  submitFailed: string;
  empty: string;
};

export function ratingsAverage(score: string | number, count: number): string;
export function ratingsStarLabel(value: number): string;
