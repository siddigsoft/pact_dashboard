import { useCallback } from 'react';
import { motion } from 'framer-motion';
import { Sun, Moon, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';
import { useTheme } from 'next-themes';

type ThemeMode = 'light' | 'dark' | 'system';

interface MobileDarkModeToggleProps {
  className?: string;
  variant?: 'icon' | 'pill' | 'segmented';
  showLabel?: boolean;
}

export function MobileDarkModeToggle({
  className,
  variant = 'icon',
  showLabel = false,
}: MobileDarkModeToggleProps) {
  const { theme, setTheme } = useTheme();

  const cycleTheme = useCallback(() => {
    hapticPresets.toggle();
    const modes: ThemeMode[] = ['light', 'dark', 'system'];
    const currentIndex = modes.indexOf(theme as ThemeMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    setTheme(modes[nextIndex]);
  }, [theme, setTheme]);

  const setSpecificTheme = useCallback((mode: ThemeMode) => {
    hapticPresets.selection();
    setTheme(mode);
  }, [setTheme]);

  const getIcon = (mode?: ThemeMode) => {
    const currentMode = mode || theme;
    switch (currentMode) {
      case 'light':
        return <Sun className="h-5 w-5" />;
      case 'dark':
        return <Moon className="h-5 w-5" />;
      case 'system':
        return <Monitor className="h-5 w-5" />;
      default:
        return <Sun className="h-5 w-5" />;
    }
  };

  const getLabel = () => {
    switch (theme) {
      case 'light':
        return 'Light';
      case 'dark':
        return 'Dark';
      case 'system':
        return 'System';
      default:
        return 'Light';
    }
  };

  if (variant === 'icon') {
    return (
      <button
        onClick={cycleTheme}
        className={cn(
          "w-11 h-11 rounded-full flex items-center justify-center",
          "bg-black/5 dark:bg-white/10",
          "text-black dark:text-white",
          "active:scale-95 transition-all touch-manipulation",
          className
        )}
        aria-label={`Current theme: ${theme}. Click to change.`}
        data-testid="button-theme-toggle"
      >
        <motion.div
          key={theme}
          initial={{ rotate: -90, opacity: 0 }}
          animate={{ rotate: 0, opacity: 1 }}
          exit={{ rotate: 90, opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {getIcon()}
        </motion.div>
      </button>
    );
  }

  if (variant === 'pill') {
    return (
      <button
        onClick={cycleTheme}
        className={cn(
          "h-11 px-4 rounded-full flex items-center gap-2",
          "bg-black/5 dark:bg-white/10",
          "text-black dark:text-white",
          "active:scale-95 transition-all touch-manipulation",
          className
        )}
        aria-label={`Current theme: ${theme}. Click to change.`}
        data-testid="button-theme-toggle-pill"
      >
        <motion.div
          key={theme}
          initial={{ rotate: -90, opacity: 0 }}
          animate={{ rotate: 0, opacity: 1 }}
          transition={{ duration: 0.2 }}
        >
          {getIcon()}
        </motion.div>
        {showLabel && (
          <span className="text-sm font-medium">{getLabel()}</span>
        )}
      </button>
    );
  }

  if (variant === 'segmented') {
    const modes: ThemeMode[] = ['light', 'dark', 'system'];
    
    return (
      <div 
        className={cn(
          "flex p-1 rounded-full bg-black/5 dark:bg-white/10",
          className
        )}
        role="radiogroup"
        aria-label="Theme selection"
      >
        {modes.map((mode) => (
          <button
            key={mode}
            onClick={() => setSpecificTheme(mode)}
            className={cn(
              "relative flex items-center justify-center w-11 h-11 rounded-full",
              "transition-all touch-manipulation",
              theme === mode 
                ? "text-black dark:text-white" 
                : "text-black/40 dark:text-white/40"
            )}
            role="radio"
            aria-checked={theme === mode}
            aria-label={`${mode} theme`}
            data-testid={`button-theme-${mode}`}
          >
            {theme === mode && (
              <motion.div
                layoutId="theme-indicator"
                className="absolute inset-0 bg-white dark:bg-black rounded-full shadow-sm"
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              />
            )}
            <span className="relative z-10">{getIcon(mode)}</span>
          </button>
        ))}
      </div>
    );
  }

  return null;
}

export function QuickThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  const toggleTheme = useCallback(() => {
    hapticPresets.toggle();
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggleTheme}
      className={cn(
        "relative w-14 h-8 rounded-full p-1",
        "bg-black/10 dark:bg-white/20",
        "transition-colors touch-manipulation",
        className
      )}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      data-testid="quick-theme-toggle"
    >
      <motion.div
        className={cn(
          "w-6 h-6 rounded-full flex items-center justify-center",
          "bg-white dark:bg-black shadow-sm"
        )}
        animate={{ x: isDark ? 24 : 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      >
        <motion.div
          key={isDark ? 'moon' : 'sun'}
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ duration: 0.2 }}
        >
          {isDark ? (
            <Moon className="h-4 w-4 text-white" />
          ) : (
            <Sun className="h-4 w-4 text-black" />
          )}
        </motion.div>
      </motion.div>
    </button>
  );
}

export default MobileDarkModeToggle;
