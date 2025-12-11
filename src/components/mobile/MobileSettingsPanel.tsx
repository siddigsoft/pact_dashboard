import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { 
  ChevronRight, 
  Check, 
  Moon, 
  Sun, 
  Bell, 
  Shield, 
  Globe,
  Smartphone,
  LogOut,
  User,
  HelpCircle,
  Info,
  ChevronDown
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';

interface SettingsItem {
  id: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  type: 'toggle' | 'link' | 'select' | 'action';
  value?: boolean | string;
  options?: Array<{ id: string; label: string }>;
  onClick?: () => void;
  onChange?: (value: boolean | string) => void;
  destructive?: boolean;
  disabled?: boolean;
}

interface SettingsGroup {
  id: string;
  title?: string;
  items: SettingsItem[];
}

interface MobileSettingsPanelProps {
  groups: SettingsGroup[];
  className?: string;
}

export function MobileSettingsPanel({ groups, className }: MobileSettingsPanelProps) {
  return (
    <div className={cn("space-y-6", className)} data-testid="settings-panel">
      {groups.map((group) => (
        <SettingsGroupComponent key={group.id} group={group} />
      ))}
    </div>
  );
}

interface SettingsGroupComponentProps {
  group: SettingsGroup;
}

function SettingsGroupComponent({ group }: SettingsGroupComponentProps) {
  return (
    <div>
      {group.title && (
        <h3 className="text-xs font-semibold text-black/40 dark:text-white/40 uppercase tracking-wider px-4 mb-2">
          {group.title}
        </h3>
      )}
      <div className="bg-white dark:bg-neutral-900 rounded-2xl overflow-hidden divide-y divide-black/5 dark:divide-white/5">
        {group.items.map((item) => (
          <SettingsItemComponent key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

interface SettingsItemComponentProps {
  item: SettingsItem;
}

function SettingsItemComponent({ item }: SettingsItemComponentProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleClick = useCallback(() => {
    if (item.disabled) return;
    
    hapticPresets.buttonPress();
    
    if (item.type === 'link' || item.type === 'action') {
      item.onClick?.();
    } else if (item.type === 'select') {
      setIsExpanded(!isExpanded);
    }
  }, [item, isExpanded]);

  const handleToggle = useCallback((checked: boolean) => {
    if (item.disabled) return;
    hapticPresets.toggle();
    item.onChange?.(checked);
  }, [item]);

  const handleSelectOption = useCallback((optionId: string) => {
    hapticPresets.selection();
    item.onChange?.(optionId);
    setIsExpanded(false);
  }, [item]);

  return (
    <div>
      <button
        onClick={item.type === 'toggle' ? undefined : handleClick}
        disabled={item.disabled}
        className={cn(
          "w-full flex items-center gap-4 px-4 py-3.5 text-left touch-manipulation",
          item.type !== 'toggle' && "active:bg-black/5 dark:active:bg-white/5",
          item.disabled && "opacity-40 cursor-not-allowed"
        )}
        data-testid={`setting-${item.id}`}
      >
        {item.icon && (
          <div className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center",
            item.destructive 
              ? "bg-destructive/10 text-destructive" 
              : "bg-black/5 dark:bg-white/5 text-black dark:text-white"
          )}>
            {item.icon}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <p className={cn(
            "text-sm font-medium",
            item.destructive ? "text-destructive" : "text-black dark:text-white"
          )}>
            {item.label}
          </p>
          {item.description && (
            <p className="text-xs text-black/50 dark:text-white/50 mt-0.5 truncate">
              {item.description}
            </p>
          )}
        </div>

        {item.type === 'toggle' && (
          <Switch
            checked={item.value as boolean}
            onCheckedChange={handleToggle}
            disabled={item.disabled}
            data-testid={`toggle-${item.id}`}
          />
        )}

        {item.type === 'link' && (
          <ChevronRight className="h-5 w-5 text-black/30 dark:text-white/30" />
        )}

        {item.type === 'select' && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-black/50 dark:text-white/50">
              {item.options?.find(o => o.id === item.value)?.label}
            </span>
            <motion.div
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown className="h-5 w-5 text-black/30 dark:text-white/30" />
            </motion.div>
          </div>
        )}
      </button>

      {item.type === 'select' && isExpanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="border-t border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02]"
        >
          {item.options?.map((option) => (
            <button
              key={option.id}
              onClick={() => handleSelectOption(option.id)}
              className="w-full flex items-center justify-between px-4 py-3 pl-16 text-left touch-manipulation active:bg-black/5 dark:active:bg-white/5"
              data-testid={`option-${option.id}`}
            >
              <span className="text-sm text-black dark:text-white">{option.label}</span>
              {item.value === option.id && (
                <Check className="h-5 w-5 text-black dark:text-white" />
              )}
            </button>
          ))}
        </motion.div>
      )}
    </div>
  );
}

export const defaultSettingsGroups: SettingsGroup[] = [
  {
    id: 'account',
    title: 'Account',
    items: [
      {
        id: 'profile',
        label: 'Profile',
        description: 'Name, email, phone',
        icon: <User className="h-4 w-4" />,
        type: 'link',
      },
      {
        id: 'security',
        label: 'Security',
        description: 'Password, 2FA, biometrics',
        icon: <Shield className="h-4 w-4" />,
        type: 'link',
      },
    ],
  },
  {
    id: 'preferences',
    title: 'Preferences',
    items: [
      {
        id: 'notifications',
        label: 'Push Notifications',
        icon: <Bell className="h-4 w-4" />,
        type: 'toggle',
        value: true,
      },
      {
        id: 'theme',
        label: 'Dark Mode',
        icon: <Moon className="h-4 w-4" />,
        type: 'toggle',
        value: false,
      },
      {
        id: 'language',
        label: 'Language',
        icon: <Globe className="h-4 w-4" />,
        type: 'select',
        value: 'en',
        options: [
          { id: 'en', label: 'English' },
          { id: 'ar', label: 'Arabic' },
        ],
      },
    ],
  },
  {
    id: 'app',
    title: 'App',
    items: [
      {
        id: 'device',
        label: 'Device Settings',
        icon: <Smartphone className="h-4 w-4" />,
        type: 'link',
      },
      {
        id: 'help',
        label: 'Help & Support',
        icon: <HelpCircle className="h-4 w-4" />,
        type: 'link',
      },
      {
        id: 'about',
        label: 'About',
        description: 'Version 1.0.0',
        icon: <Info className="h-4 w-4" />,
        type: 'link',
      },
    ],
  },
  {
    id: 'danger',
    items: [
      {
        id: 'logout',
        label: 'Sign Out',
        icon: <LogOut className="h-4 w-4" />,
        type: 'action',
        destructive: true,
      },
    ],
  },
];

interface ThemeToggleSettingProps {
  isDark: boolean;
  onChange: (isDark: boolean) => void;
}

export function ThemeToggleSetting({ isDark, onChange }: ThemeToggleSettingProps) {
  return (
    <button
      onClick={() => {
        hapticPresets.toggle();
        onChange(!isDark);
      }}
      className="w-full flex items-center gap-4 px-4 py-3.5 text-left touch-manipulation active:bg-black/5 dark:active:bg-white/5"
      data-testid="setting-theme-toggle"
    >
      <div className="w-8 h-8 rounded-lg bg-black/5 dark:bg-white/5 flex items-center justify-center text-black dark:text-white">
        {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-black dark:text-white">
          {isDark ? 'Dark Mode' : 'Light Mode'}
        </p>
        <p className="text-xs text-black/50 dark:text-white/50">
          Tap to switch theme
        </p>
      </div>
      <Switch
        checked={isDark}
        onCheckedChange={onChange}
        data-testid="toggle-theme"
      />
    </button>
  );
}
