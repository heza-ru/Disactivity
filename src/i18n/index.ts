import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enUS from './locales/en-US.json';
import esES from './locales/es-ES.json';

const resources = {
  'en-US': { translation: enUS },
  'es-ES': { translation: esES },
  // Fallback mappings for base language codes
  'en': { translation: enUS },
  'es': { translation: esES },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en-US',
    supportedLngs: ['en-US', 'es-ES', 'en', 'es'],
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    detection: {
      order: ['navigator', 'htmlTag', 'localStorage'],
      caches: ['localStorage'],
    },
  });

export default i18n;

