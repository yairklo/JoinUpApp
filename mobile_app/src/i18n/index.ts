import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import * as SecureStore from 'expo-secure-store';
import { I18nManager, Platform, Alert } from 'react-native';
import * as Updates from 'expo-updates';

import en from './locales/en.json';
import he from './locales/he.json';

const LANGUAGE_KEY = 'app_language';
const memoryStorage = new Map<string, string>();

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timeoutId: any;
  const timeoutPromise = new Promise<T>((resolve) => {
    timeoutId = setTimeout(() => resolve(fallback), timeoutMs);
  });
  return Promise.race([
    promise.then((res) => {
      clearTimeout(timeoutId);
      return res;
    }),
    timeoutPromise
  ]);
}

const safeGetLang = async (): Promise<string | null> => {
  try {
    const val = await withTimeout(SecureStore.getItemAsync(LANGUAGE_KEY), 1000, "__TIMEOUT__");
    if (val === "__TIMEOUT__") {
      console.warn("SecureStore.getItemAsync timed out for key:", LANGUAGE_KEY);
      return memoryStorage.get(LANGUAGE_KEY) || null;
    }
    return val;
  } catch (e) {
    console.error("SecureStore.getItemAsync error:", e);
    return memoryStorage.get(LANGUAGE_KEY) || null;
  }
};

const safeSetLang = async (lang: string): Promise<void> => {
  memoryStorage.set(LANGUAGE_KEY, lang);
  try {
    await withTimeout(SecureStore.setItemAsync(LANGUAGE_KEY, lang), 1000, null);
  } catch (e) {
    console.error("SecureStore.setItemAsync error:", e);
  }
};

const resources = {
  en: { translation: en },
  he: { translation: he },
};

// --- language switching state (drives a visible loading overlay during reload) ---
let switching = false;
const switchListeners = new Set<(v: boolean) => void>();
const setSwitching = (v: boolean) => {
  switching = v;
  switchListeners.forEach((l) => l(v));
};
export const isLanguageSwitching = () => switching;
export const subscribeLanguageSwitching = (l: (v: boolean) => void) => {
  switchListeners.add(l);
  return () => {
    switchListeners.delete(l);
  };
};

const RELOAD_SAFETY_TIMEOUT_MS = 8000;
const RTL_RELOAD_KEY = 'rtl_reload_for';

/** Reloads the JS bundle so the native layout direction takes effect. Returns false if it could not. */
const reloadApp = async (): Promise<boolean> => {
  if (Platform.OS === 'web') return false;
  try {
    await Updates.reloadAsync();
    // A real reload tears this JS context down; if we are still running shortly after,
    // reloadAsync resolved without reloading — never leave the overlay stuck.
    setTimeout(() => setSwitching(false), RELOAD_SAFETY_TIMEOUT_MS);
    return true;
  } catch (e) {
    console.warn('Updates.reloadAsync failed:', e);
    return false;
  }
};

export const initI18n = async () => {
  let savedLanguage = await safeGetLang();

  if (!savedLanguage) {
    const deviceLanguage = getLocales()[0]?.languageCode;
    savedLanguage = deviceLanguage === 'he' ? 'he' : 'en';
  }

  // The native layout direction only applies after a restart. If it does not match the
  // saved language (e.g. first cold start), set it and reload once (guarded against loops).
  const isRTL = savedLanguage === 'he';
  if (I18nManager.isRTL !== isRTL) {
    I18nManager.allowRTL(isRTL);
    I18nManager.forceRTL(isRTL);
    let alreadyTried = false;
    try {
      alreadyTried = memoryStorage.get(RTL_RELOAD_KEY) === savedLanguage ||
        (await withTimeout(SecureStore.getItemAsync(RTL_RELOAD_KEY), 1000, null)) === savedLanguage;
    } catch {}
    if (!alreadyTried) {
      memoryStorage.set(RTL_RELOAD_KEY, savedLanguage);
      try { await withTimeout(SecureStore.setItemAsync(RTL_RELOAD_KEY, savedLanguage), 1000, null); } catch {}
      setSwitching(true);
      if (!(await reloadApp())) setSwitching(false);
    }
  } else {
    memoryStorage.delete(RTL_RELOAD_KEY);
    try { await withTimeout(SecureStore.deleteItemAsync(RTL_RELOAD_KEY), 1000, null); } catch {}
  }

  await i18n
    .use(initReactI18next)
    .init({
      compatibilityJSON: 'v4',
      resources,
      lng: savedLanguage,
      fallbackLng: 'en',
      interpolation: {
        escapeValue: false, // React already does escaping
      },
    });

  return i18n;
};

export const changeLanguage = async (lang: 'en' | 'he') => {
  if (switching) return;
  await safeSetLang(lang);

  const isRTL = lang === 'he';
  if (I18nManager.isRTL === isRTL) {
    await i18n.changeLanguage(lang);
    return;
  }

  I18nManager.allowRTL(isRTL);
  I18nManager.forceRTL(isRTL);
  // Keep the old text until the reload so we never render new text with the old direction.
  setSwitching(true);
  if (await reloadApp()) return;

  // Reload unavailable (e.g. updates disabled): apply text now, direction on next launch.
  setSwitching(false);
  await i18n.changeLanguage(lang);
  Alert.alert(
    lang === 'he' ? 'הפעל מחדש' : 'Restart required',
    lang === 'he'
      ? 'סגור ופתח את האפליקציה כדי להחיל את כיוון הכתיבה.'
      : 'Close and reopen the app to apply the layout direction.'
  );
};

export default i18n;
