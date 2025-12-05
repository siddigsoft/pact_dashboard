import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from '@/locales/en.json';
import ar from '@/locales/ar.json';

const resources = {
  en: { translation: en },
  ar: { translation: ar },
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'en',
    fallbackLng: 'en',
    supportedLngs: ['en', 'ar'],
    debug: false,
    interpolation: {
      escapeValue: false,
    },
  })
  .then(() => {
    document.documentElement.dir = 'ltr';
    document.documentElement.lang = 'en';
  });

export const changeLanguage = (lng: 'en' | 'ar') => {
  i18n.changeLanguage(lng);
  document.documentElement.dir = lng === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.lang = lng;
  localStorage.setItem('pact_language', lng);
};

export const getCurrentLanguage = () => i18n.language as 'en' | 'ar';

export const isRTL = () => i18n.language === 'ar';

export default i18n;
