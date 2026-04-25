import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enUS from './locales/en-US.json';

const resources = {
  'en-US': { translation: enUS },
  'en': { translation: enUS },
} as const;

const esBundlePromise = import('./locales/es-ES.json');

function ensureSpanishBundle(): Promise<void> {
  if (i18n.hasResourceBundle('es-ES', 'translation')) {
    return Promise.resolve();
  }
  return esBundlePromise.then((m) => {
    const es = m.default;
    i18n.addResourceBundle('es-ES', 'translation', es, true, true);
    i18n.addResourceBundle('es', 'translation', es, true, true);
  });
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { ...resources },
    fallbackLng: 'en-US',
    supportedLngs: ['en-US', 'es-ES', 'en', 'es'],
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    detection: {
      order: ['navigator', 'htmlTag', 'localStorage'],
      caches: ['localStorage'],
    },
  })
  .then(() => {
    const raw = (i18n.resolvedLanguage ?? i18n.language ?? '').toLowerCase();
    if (raw.startsWith('es')) {
      return ensureSpanishBundle().then(() => {
        i18n.changeLanguage('es-ES');
      });
    }
    // Warm secondary locale in idle time so switching is instant
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => {
        void ensureSpanishBundle();
      });
    } else {
      setTimeout(() => {
        void ensureSpanishBundle();
      }, 2_000);
    }
  })
  .catch(console.error);

i18n.on('languageChanged', (lng) => {
  if (lng === 'es-ES' || lng === 'es') {
    void ensureSpanishBundle();
  }
});

export default i18n;

