import { useState, useCallback, useEffect, createContext, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe, Check, ChevronRight, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';

type Language = 'en' | 'ar';
type Direction = 'ltr' | 'rtl';

interface LanguageConfig {
  code: Language;
  name: string;
  nativeName: string;
  direction: Direction;
  flag?: string;
}

const languages: LanguageConfig[] = [
  { code: 'en', name: 'English', nativeName: 'English', direction: 'ltr', flag: '🇬🇧' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', direction: 'rtl', flag: '🇸🇩' },
];

interface LanguageContextValue {
  language: Language;
  direction: Direction;
  setLanguage: (language: Language) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  isRTL: boolean;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

interface LanguageProviderProps {
  children: React.ReactNode;
  defaultLanguage?: Language;
  translations?: Record<Language, Record<string, string>>;
}

export function LanguageProvider({
  children,
  defaultLanguage = 'en',
  translations = defaultTranslations,
}: LanguageProviderProps) {
  const [language, setLanguageState] = useState<Language>(() => {
    const stored = localStorage.getItem('app-language');
    return (stored as Language) || defaultLanguage;
  });

  const direction = languages.find(l => l.code === language)?.direction || 'ltr';
  const isRTL = direction === 'rtl';

  useEffect(() => {
    document.documentElement.dir = direction;
    document.documentElement.lang = language;
    localStorage.setItem('app-language', language);
  }, [language, direction]);

  const setLanguage = useCallback((newLanguage: Language) => {
    hapticPresets.selection();
    setLanguageState(newLanguage);
  }, []);

  const t = useCallback((key: string, params?: Record<string, string | number>) => {
    let text = translations[language]?.[key] || translations.en?.[key] || key;
    
    if (params) {
      Object.entries(params).forEach(([param, value]) => {
        text = text.replace(`{{${param}}}`, String(value));
      });
    }
    
    return text;
  }, [language, translations]);

  return (
    <LanguageContext.Provider value={{ language, direction, setLanguage, t, isRTL }}>
      {children}
    </LanguageContext.Provider>
  );
}

// Default fallback values when LanguageProvider is not available
const defaultLanguageValue: LanguageContextValue = {
  language: 'en',
  direction: 'ltr',
  setLanguage: () => {},
  t: (key: string) => key,
  isRTL: false,
};

export function useLanguage() {
  const context = useContext(LanguageContext);
  // Return safe defaults instead of throwing - prevents crashes when provider is missing
  if (!context) {
    return defaultLanguageValue;
  }
  return context;
}

interface MobileLanguageSwitcherProps {
  variant?: 'button' | 'dropdown' | 'list' | 'compact';
  showNativeName?: boolean;
  showFlag?: boolean;
  className?: string;
}

export function MobileLanguageSwitcher({
  variant = 'button',
  showNativeName = true,
  showFlag = true,
  className,
}: MobileLanguageSwitcherProps) {
  const { language, setLanguage } = useLanguage();
  const [showDropdown, setShowDropdown] = useState(false);

  const currentLanguage = languages.find(l => l.code === language)!;

  const handleSelect = useCallback((code: Language) => {
    setLanguage(code);
    setShowDropdown(false);
  }, [setLanguage]);

  if (variant === 'compact') {
    return (
      <button
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/5 dark:bg-white/5 text-sm font-medium",
          className
        )}
        onClick={() => {
          const nextIndex = (languages.findIndex(l => l.code === language) + 1) % languages.length;
          handleSelect(languages[nextIndex].code);
        }}
        data-testid="language-switcher-compact"
      >
        <Globe className="h-3.5 w-3.5" />
        <span>{language.toUpperCase()}</span>
      </button>
    );
  }

  if (variant === 'list') {
    return (
      <div className={cn("space-y-1", className)} data-testid="language-switcher-list">
        {languages.map((lang) => (
          <button
            key={lang.code}
            className={cn(
              "w-full flex items-center gap-3 p-3 rounded-xl transition-colors",
              language === lang.code
                ? "bg-black dark:bg-white text-white dark:text-black"
                : "bg-black/5 dark:bg-white/5 text-black dark:text-white"
            )}
            onClick={() => handleSelect(lang.code)}
            data-testid={`language-option-${lang.code}`}
          >
            {showFlag && <span className="text-lg">{lang.flag}</span>}
            <div className="flex-1 text-left">
              <p className="text-sm font-medium">{lang.name}</p>
              {showNativeName && lang.name !== lang.nativeName && (
                <p className={cn(
                  "text-xs",
                  language === lang.code ? "opacity-80" : "opacity-60"
                )}>
                  {lang.nativeName}
                </p>
              )}
            </div>
            {language === lang.code && <Check className="h-4 w-4" />}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("relative", className)}>
      <button
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-xl border border-black/10 dark:border-white/10",
          variant === 'dropdown' && "w-full justify-between"
        )}
        onClick={() => {
          hapticPresets.buttonPress();
          setShowDropdown(!showDropdown);
        }}
        data-testid="language-switcher-button"
      >
        <div className="flex items-center gap-2">
          {showFlag && <span className="text-lg">{currentLanguage.flag}</span>}
          <span className="text-sm font-medium text-black dark:text-white">
            {currentLanguage.name}
          </span>
        </div>
        {variant === 'dropdown' && (
          <ChevronDown className={cn(
            "h-4 w-4 text-black/40 dark:text-white/40 transition-transform",
            showDropdown && "rotate-180"
          )} />
        )}
      </button>

      <AnimatePresence>
        {showDropdown && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40"
              onClick={() => setShowDropdown(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              className={cn(
                "absolute z-50 mt-2 bg-white dark:bg-neutral-900 rounded-xl shadow-xl border border-black/10 dark:border-white/10 overflow-hidden min-w-[180px]",
                variant === 'dropdown' ? "left-0 right-0" : "right-0"
              )}
              data-testid="language-dropdown"
            >
              {languages.map((lang) => (
                <button
                  key={lang.code}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors",
                    "hover:bg-black/5 dark:hover:bg-white/5",
                    language === lang.code && "bg-black/5 dark:bg-white/5"
                  )}
                  onClick={() => handleSelect(lang.code)}
                  data-testid={`language-option-${lang.code}`}
                >
                  {showFlag && <span className="text-lg">{lang.flag}</span>}
                  <div className="flex-1">
                    <p className="text-sm font-medium text-black dark:text-white">
                      {lang.name}
                    </p>
                    {showNativeName && lang.name !== lang.nativeName && (
                      <p className="text-xs text-black/60 dark:text-white/60">
                        {lang.nativeName}
                      </p>
                    )}
                  </div>
                  {language === lang.code && (
                    <Check className="h-4 w-4 text-black dark:text-white" />
                  )}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

interface RTLWrapperProps {
  children: React.ReactNode;
  className?: string;
}

export function RTLWrapper({ children, className }: RTLWrapperProps) {
  const { isRTL } = useLanguage();

  return (
    <div 
      className={cn(className)}
      dir={isRTL ? 'rtl' : 'ltr'}
      data-testid="rtl-wrapper"
    >
      {children}
    </div>
  );
}

interface RTLFlexProps {
  children: React.ReactNode;
  className?: string;
}

export function RTLFlex({ children, className }: RTLFlexProps) {
  const { isRTL } = useLanguage();

  return (
    <div 
      className={cn(
        "flex",
        isRTL && "flex-row-reverse",
        className
      )}
      data-testid="rtl-flex"
    >
      {children}
    </div>
  );
}

const defaultTranslations: Record<Language, Record<string, string>> = {
  en: {
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.edit': 'Edit',
    'common.confirm': 'Confirm',
    'common.loading': 'Loading...',
    'common.error': 'Error',
    'common.success': 'Success',
    'common.retry': 'Retry',
    'common.back': 'Back',
    'common.next': 'Next',
    'common.done': 'Done',
    'common.search': 'Search',
    'common.filter': 'Filter',
    'common.sort': 'Sort',
    'common.settings': 'Settings',
    'common.profile': 'Profile',
    'common.logout': 'Logout',
    'common.language': 'Language',
    
    'auth.login': 'Login',
    'auth.signup': 'Sign Up',
    'auth.email': 'Email',
    'auth.password': 'Password',
    'auth.forgotPassword': 'Forgot Password?',
    'auth.biometric': 'Use Biometrics',
    
    'home.welcome': 'Welcome back, {{name}}',
    'home.dashboard': 'Dashboard',
    'home.sites': 'Sites',
    'home.wallet': 'Wallet',
    'home.notifications': 'Notifications',
    
    'visit.startVisit': 'Start Visit',
    'visit.endVisit': 'End Visit',
    'visit.inProgress': 'In Progress',
    'visit.completed': 'Completed',
    'visit.pending': 'Pending',
    
    'offline.syncing': 'Syncing...',
    'offline.offline': 'You are offline',
    'offline.pendingItems': '{{count}} items pending sync',
    'offline.syncNow': 'Sync Now',
  },
  ar: {
    'common.save': 'حفظ',
    'common.cancel': 'إلغاء',
    'common.delete': 'حذف',
    'common.edit': 'تعديل',
    'common.confirm': 'تأكيد',
    'common.loading': 'جاري التحميل...',
    'common.error': 'خطأ',
    'common.success': 'نجاح',
    'common.retry': 'إعادة المحاولة',
    'common.back': 'رجوع',
    'common.next': 'التالي',
    'common.done': 'تم',
    'common.search': 'بحث',
    'common.filter': 'تصفية',
    'common.sort': 'ترتيب',
    'common.settings': 'الإعدادات',
    'common.profile': 'الملف الشخصي',
    'common.logout': 'تسجيل الخروج',
    'common.language': 'اللغة',
    
    'auth.login': 'تسجيل الدخول',
    'auth.signup': 'إنشاء حساب',
    'auth.email': 'البريد الإلكتروني',
    'auth.password': 'كلمة المرور',
    'auth.forgotPassword': 'نسيت كلمة المرور؟',
    'auth.biometric': 'استخدام البصمة',
    
    'home.welcome': 'مرحباً بعودتك، {{name}}',
    'home.dashboard': 'لوحة التحكم',
    'home.sites': 'المواقع',
    'home.wallet': 'المحفظة',
    'home.notifications': 'الإشعارات',
    
    'visit.startVisit': 'بدء الزيارة',
    'visit.endVisit': 'إنهاء الزيارة',
    'visit.inProgress': 'قيد التنفيذ',
    'visit.completed': 'مكتمل',
    'visit.pending': 'معلق',
    
    'offline.syncing': 'جاري المزامنة...',
    'offline.offline': 'أنت غير متصل',
    'offline.pendingItems': '{{count}} عناصر في انتظار المزامنة',
    'offline.syncNow': 'مزامنة الآن',
  },
};

export { languages, defaultTranslations };
export type { Language, Direction, LanguageConfig };
