import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin,
  Wallet,
  Calendar,
  Bell,
  Camera,
  FileText,
  Settings,
  Search,
  Plus,
  QrCode,
  Users,
  Clock,
  CheckCircle,
  Star,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';

interface AppShortcut {
  id: string;
  icon: React.ReactNode;
  label: string;
  path: string;
  color: string;
  bgColor: string;
  description?: string;
  badge?: number;
  isPinned?: boolean;
}

const defaultShortcuts: AppShortcut[] = [
  {
    id: 'new-visit',
    icon: <Plus className="w-5 h-5" />,
    label: 'New Visit',
    path: '/site-visits/new',
    color: 'text-white dark:text-black',
    bgColor: 'bg-black dark:bg-white',
    description: 'Start a new site visit',
  },
  {
    id: 'scan-qr',
    icon: <QrCode className="w-5 h-5" />,
    label: 'Scan QR',
    path: '/scan',
    color: 'text-black dark:text-white',
    bgColor: 'bg-black/10 dark:bg-white/10',
    description: 'Scan a site QR code',
  },
  {
    id: 'take-photo',
    icon: <Camera className="w-5 h-5" />,
    label: 'Photo',
    path: '/camera',
    color: 'text-black dark:text-white',
    bgColor: 'bg-black/10 dark:bg-white/10',
    description: 'Capture a photo',
  },
  {
    id: 'my-visits',
    icon: <MapPin className="w-5 h-5" />,
    label: 'My Visits',
    path: '/site-visits',
    color: 'text-black dark:text-white',
    bgColor: 'bg-black/10 dark:bg-white/10',
  },
  {
    id: 'wallet',
    icon: <Wallet className="w-5 h-5" />,
    label: 'Wallet',
    path: '/wallet',
    color: 'text-black dark:text-white',
    bgColor: 'bg-black/10 dark:bg-white/10',
  },
  {
    id: 'calendar',
    icon: <Calendar className="w-5 h-5" />,
    label: 'Calendar',
    path: '/calendar',
    color: 'text-black dark:text-white',
    bgColor: 'bg-black/10 dark:bg-white/10',
  },
  {
    id: 'notifications',
    icon: <Bell className="w-5 h-5" />,
    label: 'Alerts',
    path: '/notifications',
    color: 'text-black dark:text-white',
    bgColor: 'bg-black/10 dark:bg-white/10',
  },
  {
    id: 'reports',
    icon: <FileText className="w-5 h-5" />,
    label: 'Reports',
    path: '/reports',
    color: 'text-black dark:text-white',
    bgColor: 'bg-black/10 dark:bg-white/10',
  },
  {
    id: 'team',
    icon: <Users className="w-5 h-5" />,
    label: 'Team',
    path: '/team',
    color: 'text-black dark:text-white',
    bgColor: 'bg-black/10 dark:bg-white/10',
  },
  {
    id: 'history',
    icon: <Clock className="w-5 h-5" />,
    label: 'History',
    path: '/history',
    color: 'text-black/60 dark:text-white/60',
    bgColor: 'bg-black/5 dark:bg-white/5',
  },
  {
    id: 'search',
    icon: <Search className="w-5 h-5" />,
    label: 'Search',
    path: '/search',
    color: 'text-black dark:text-white',
    bgColor: 'bg-black/10 dark:bg-white/10',
  },
  {
    id: 'settings',
    icon: <Settings className="w-5 h-5" />,
    label: 'Settings',
    path: '/settings',
    color: 'text-black/60 dark:text-white/60',
    bgColor: 'bg-black/5 dark:bg-white/5',
  },
];

interface MobileAppShortcutsProps {
  shortcuts?: AppShortcut[];
  maxVisible?: number;
  showLabels?: boolean;
  variant?: 'grid' | 'horizontal' | 'compact';
  onShortcutPress?: (shortcut: AppShortcut) => void;
  className?: string;
}

export function MobileAppShortcuts({
  shortcuts = defaultShortcuts,
  maxVisible = 8,
  showLabels = true,
  variant = 'grid',
  onShortcutPress,
  className,
}: MobileAppShortcutsProps) {
  const navigate = useNavigate();
  const [pinnedShortcuts, setPinnedShortcuts] = useState<string[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem('pact_pinned_shortcuts');
    if (stored) {
      setPinnedShortcuts(JSON.parse(stored));
    }
  }, []);

  const handleShortcutPress = useCallback((shortcut: AppShortcut) => {
    hapticPresets.buttonPress();
    onShortcutPress?.(shortcut);
    navigate(shortcut.path);
  }, [navigate, onShortcutPress]);

  const togglePin = useCallback((shortcutId: string) => {
    hapticPresets.selection();
    setPinnedShortcuts(prev => {
      const updated = prev.includes(shortcutId)
        ? prev.filter(id => id !== shortcutId)
        : [...prev, shortcutId];
      localStorage.setItem('pact_pinned_shortcuts', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const sortedShortcuts = [...shortcuts].sort((a, b) => {
    const aPin = pinnedShortcuts.includes(a.id) ? 0 : 1;
    const bPin = pinnedShortcuts.includes(b.id) ? 0 : 1;
    return aPin - bPin;
  });

  const visibleShortcuts = sortedShortcuts.slice(0, maxVisible);

  if (variant === 'horizontal') {
    return (
      <div 
        className={cn("overflow-x-auto scrollbar-hide", className)}
        data-testid="shortcuts-horizontal"
      >
        <div className="flex gap-3 px-4 py-2 min-w-max">
          {visibleShortcuts.map((shortcut) => (
            <ShortcutPill
              key={shortcut.id}
              shortcut={shortcut}
              showLabel={showLabels}
              onPress={() => handleShortcutPress(shortcut)}
            />
          ))}
        </div>
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div 
        className={cn("flex flex-wrap gap-2", className)}
        data-testid="shortcuts-compact"
      >
        {visibleShortcuts.slice(0, 4).map((shortcut) => (
          <motion.button
            key={shortcut.id}
            whileTap={{ scale: 0.95 }}
            onClick={() => handleShortcutPress(shortcut)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-full",
              shortcut.bgColor
            )}
            data-testid={`shortcut-${shortcut.id}`}
          >
            <span className={shortcut.color}>{shortcut.icon}</span>
            <span className={cn("text-sm font-medium", shortcut.color)}>
              {shortcut.label}
            </span>
          </motion.button>
        ))}
      </div>
    );
  }

  return (
    <div 
      className={cn("grid grid-cols-4 gap-4", className)}
      data-testid="shortcuts-grid"
    >
      {visibleShortcuts.map((shortcut, index) => (
        <ShortcutButton
          key={shortcut.id}
          shortcut={shortcut}
          showLabel={showLabels}
          isPinned={pinnedShortcuts.includes(shortcut.id)}
          onPress={() => handleShortcutPress(shortcut)}
          onLongPress={() => togglePin(shortcut.id)}
          index={index}
        />
      ))}
    </div>
  );
}

interface ShortcutButtonProps {
  shortcut: AppShortcut;
  showLabel: boolean;
  isPinned?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  index: number;
}

function ShortcutButton({
  shortcut,
  showLabel,
  isPinned,
  onPress,
  onLongPress,
  index,
}: ShortcutButtonProps) {
  const [isPressed, setIsPressed] = useState(false);
  const pressTimerRef = { current: null as NodeJS.Timeout | null };

  const handleTouchStart = () => {
    setIsPressed(true);
    if (onLongPress) {
      pressTimerRef.current = setTimeout(() => {
        hapticPresets.success();
        onLongPress();
      }, 500);
    }
  };

  const handleTouchEnd = () => {
    setIsPressed(false);
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
    }
  };

  return (
    <motion.button
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      whileTap={{ scale: 0.9 }}
      onClick={onPress}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      className="flex flex-col items-center gap-2 p-2"
      data-testid={`shortcut-${shortcut.id}`}
    >
      <div className={cn(
        "relative w-14 h-14 rounded-2xl flex items-center justify-center transition-transform",
        shortcut.bgColor,
        isPressed && "scale-95"
      )}>
        <span className={shortcut.color}>{shortcut.icon}</span>
        {isPinned && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-black dark:bg-white rounded-full flex items-center justify-center" data-testid={`indicator-pinned-${shortcut.id}`}>
            <Star className="w-2.5 h-2.5 text-white dark:text-black fill-current" />
          </div>
        )}
        {shortcut.badge !== undefined && shortcut.badge > 0 && (
          <div className="absolute -top-1 -right-1 min-w-5 h-5 bg-destructive rounded-full flex items-center justify-center px-1" data-testid={`badge-count-${shortcut.id}`}>
            <span className="text-xs font-bold text-white">
              {shortcut.badge > 99 ? '99+' : shortcut.badge}
            </span>
          </div>
        )}
      </div>
      {showLabel && (
        <span className="text-xs text-black/70 dark:text-white/70 font-medium truncate w-full text-center">
          {shortcut.label}
        </span>
      )}
    </motion.button>
  );
}

interface ShortcutPillProps {
  shortcut: AppShortcut;
  showLabel: boolean;
  onPress: () => void;
}

function ShortcutPill({ shortcut, showLabel, onPress }: ShortcutPillProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={onPress}
      className={cn(
        "flex items-center gap-2 px-4 py-3 rounded-2xl",
        shortcut.bgColor
      )}
      data-testid={`shortcut-pill-${shortcut.id}`}
    >
      <span className={shortcut.color}>{shortcut.icon}</span>
      {showLabel && (
        <span className={cn("text-sm font-medium whitespace-nowrap", shortcut.color)}>
          {shortcut.label}
        </span>
      )}
    </motion.button>
  );
}

interface QuickActionFabProps {
  actions?: Array<{
    id: string;
    icon: React.ReactNode;
    label: string;
    onPress: () => void;
    color?: string;
  }>;
  className?: string;
}

export function QuickActionFab({ actions, className }: QuickActionFabProps) {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  const defaultActions = actions || [
    {
      id: 'new-visit',
      icon: <MapPin className="w-5 h-5" />,
      label: 'New Visit',
      onPress: () => navigate('/site-visits/new'),
      color: 'bg-black dark:bg-white',
    },
    {
      id: 'take-photo',
      icon: <Camera className="w-5 h-5" />,
      label: 'Take Photo',
      onPress: () => navigate('/camera'),
      color: 'bg-black/80 dark:bg-white/80',
    },
    {
      id: 'scan-qr',
      icon: <QrCode className="w-5 h-5" />,
      label: 'Scan QR',
      onPress: () => navigate('/scan'),
      color: 'bg-black/60 dark:bg-white/60',
    },
  ];

  return (
    <div className={cn("fixed right-4 bottom-24 z-50", className)} data-testid="quick-action-fab">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 -z-10"
            onClick={() => setIsOpen(false)}
          />
        )}
      </AnimatePresence>

      <div className="flex flex-col-reverse items-center gap-3">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => {
            hapticPresets.buttonPress();
            setIsOpen(!isOpen);
          }}
          className={cn(
            "w-14 h-14 rounded-full shadow-lg flex items-center justify-center",
            "bg-black dark:bg-white"
          )}
          data-testid="fab-toggle"
          aria-label={isOpen ? 'Close quick actions' : 'Open quick actions'}
          aria-expanded={isOpen}
        >
          <motion.div
            animate={{ rotate: isOpen ? 45 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <Plus className="w-6 h-6 text-white dark:text-black" />
          </motion.div>
        </motion.button>

        <AnimatePresence>
          {isOpen && defaultActions.map((action, index) => (
            <motion.div
              key={action.id}
              initial={{ opacity: 0, y: 20, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.8 }}
              transition={{ delay: index * 0.05 }}
              className="flex items-center gap-2"
            >
              <span className="text-sm font-medium text-black dark:text-white bg-white dark:bg-black px-3 py-1 rounded-full shadow-sm">
                {action.label}
              </span>
              <button
                onClick={() => {
                  hapticPresets.buttonPress();
                  action.onPress();
                  setIsOpen(false);
                }}
                className={cn(
                  "w-12 h-12 rounded-full shadow-md flex items-center justify-center text-white",
                  action.color || 'bg-gray-800'
                )}
                data-testid={`fab-action-${action.id}`}
                aria-label={action.label}
              >
                {action.icon}
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

export { defaultShortcuts };
export type { AppShortcut };
