import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Languages, Check } from 'lucide-react';
import { changeLanguage, getCurrentLanguage } from '@/lib/i18n';
import { cn } from '@/lib/utils';

interface LanguageSwitcherProps {
  variant?: 'icon' | 'full';
  className?: string;
}

const languages = [
  { code: 'en', name: 'English', nativeName: 'English', flag: 'EN' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: 'AR' },
] as const;

export function LanguageSwitcher({ variant = 'icon', className }: LanguageSwitcherProps) {
  const { t } = useTranslation();
  const currentLang = getCurrentLanguage();

  const handleLanguageChange = (langCode: 'en' | 'ar') => {
    changeLanguage(langCode);
  };

  const currentLanguage = languages.find(l => l.code === currentLang) || languages[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size={variant === 'icon' ? 'icon' : 'default'}
          className={cn(className)}
          data-testid="button-language-switcher"
        >
          <Languages className="h-4 w-4" />
          {variant === 'full' && (
            <span className="ml-2">{currentLanguage.nativeName}</span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px]">
        {languages.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => handleLanguageChange(lang.code)}
            className="flex items-center justify-between gap-2 cursor-pointer"
            data-testid={`menu-item-language-${lang.code}`}
          >
            <span className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground w-6">
                {lang.flag}
              </span>
              <span>{lang.nativeName}</span>
            </span>
            {currentLang === lang.code && (
              <Check className="h-4 w-4 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function LanguageToggle({ className }: { className?: string }) {
  const currentLang = getCurrentLanguage();

  const toggleLanguage = () => {
    changeLanguage(currentLang === 'en' ? 'ar' : 'en');
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleLanguage}
      className={cn("font-medium", className)}
      data-testid="button-language-toggle"
    >
      {currentLang === 'en' ? 'العربية' : 'English'}
    </Button>
  );
}
