import { Platform } from 'react-native';
import { notificationsApi } from '@/services/api/notifications';

/**
 * Keeps the server's per-device push language in sync. The registered Expo token and a token getter are
 * remembered when the notifications hook registers the device, so a language switch can re-register
 * the same token with the new locale without needing React context.
 */
let registration: { expoPushToken: string; getToken: () => Promise<string | null> } | null = null;

export function rememberPushRegistration(
  expoPushToken: string,
  getToken: () => Promise<string | null>,
) {
  registration = { expoPushToken, getToken };
}

export function pushLocaleFor(lang: string | undefined | null): 'en' | 'he' {
  return String(lang || '').toLowerCase().startsWith('en') ? 'en' : 'he';
}

/** Fire-and-forget; never throws and never waits longer than `timeoutMs`. */
export async function syncPushLocale(lang: string, timeoutMs = 2500): Promise<void> {
  const current = registration;
  if (!current) return;
  try {
    const run = (async () => {
      const token = await current.getToken();
      if (!token) return;
      await notificationsApi.registerDevice(current.expoPushToken, Platform.OS, token, pushLocaleFor(lang));
    })();
    await Promise.race([run, new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))]);
  } catch {
    // Best effort: the next launch re-registers with the saved language anyway.
  }
}
