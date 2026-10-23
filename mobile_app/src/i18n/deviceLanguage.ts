export type AppLanguage = 'en' | 'he';

type DeviceLocale = { languageCode?: string | null; languageTag?: string | null } | undefined;

/**
 * Maps the first device locale to a supported app language. Android reports Hebrew with the
 * legacy ISO code `iw` (languageCode "iw", tag "he-IL"), so check the code and the tag's
 * primary subtag, both normalized.
 */
export function resolveDeviceLanguage(locale: DeviceLocale): AppLanguage {
  const candidates = [locale?.languageCode, locale?.languageTag?.split(/[-_]/)[0]];
  for (const c of candidates) {
    const code = c?.toLowerCase();
    if (code === 'he' || code === 'iw') return 'he';
  }
  return 'en';
}
