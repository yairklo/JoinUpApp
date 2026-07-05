import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import * as SecureStore from 'expo-secure-store';
import { I18nManager, Platform, DevSettings } from 'react-native';
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

export const initI18n = async () => {
  let savedLanguage = await safeGetLang();

  if (!savedLanguage) {
    const deviceLanguage = getLocales()[0]?.languageCode;
    savedLanguage = deviceLanguage === 'he' ? 'he' : 'en';
  }

  // Handle RTL natively
  const isRTL = savedLanguage === 'he';
  if (I18nManager.isRTL !== isRTL) {
    I18nManager.allowRTL(isRTL);
    I18nManager.forceRTL(isRTL);
    // Restart is usually required, but we'll try to let the app handle it dynamically
    // or rely on a reload if necessary.
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
  await safeSetLang(lang);
  await i18n.changeLanguage(lang);
  
  const isRTL = lang === 'he';
  if (I18nManager.isRTL !== isRTL) {
    I18nManager.allowRTL(isRTL);
    I18nManager.forceRTL(isRTL);
    
    if (Platform.OS !== 'web') {
      try {
        await Updates.reloadAsync();
      } catch (e) {
        if (__DEV__) {
          DevSettings.reload();
        }
      }
    }
  }
};

export default i18n;
