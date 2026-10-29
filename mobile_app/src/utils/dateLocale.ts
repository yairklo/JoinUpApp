/**
 * Maps the app language (i18n.language) to the locale used for Date formatting, so dates and
 * times follow the language the user chose in the app rather than the device locale or a
 * hard-coded 'he-IL'. Hebrew is the default, matching the rest of the app.
 */
export type DateLocale = 'he-IL' | 'en-GB';

export function dateLocaleFor(language?: string | null): DateLocale {
  return language?.toLowerCase().startsWith('en') ? 'en-GB' : 'he-IL';
}

const HM: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };

export function formatDate(d: Date | string | number, language?: string | null): string {
  return new Date(d).toLocaleDateString(dateLocaleFor(language));
}

export function formatTimeOfDay(d: Date | string | number, language?: string | null): string {
  return new Date(d).toLocaleTimeString(dateLocaleFor(language), HM);
}

export function formatDayMonthTime(d: Date | string | number, language?: string | null): string {
  return new Date(d).toLocaleString(dateLocaleFor(language), { day: '2-digit', month: '2-digit', ...HM });
}
