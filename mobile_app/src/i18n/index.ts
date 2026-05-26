import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import * as SecureStore from 'expo-secure-store';
import { I18nManager, Platform, DevSettings } from 'react-native';
import * as Updates from 'expo-updates';

import en from './locales/en.json';
import he from './locales/he.json';

const LANGUAGE_KEY = 'app_language';

const resources = {
  en: { translation: en },
  he: { translation: he },
};

export const initI18n = async () => {
  let savedLanguage = await SecureStore.getItemAsync(LANGUAGE_KEY);

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
  await SecureStore.setItemAsync(LANGUAGE_KEY, lang);
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
