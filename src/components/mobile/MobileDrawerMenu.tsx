import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  User, 
  Settings, 
  HelpCircle, 
  LogOut, 
  Moon, 
  Sun,
  Shield,
  Bell,
  Wallet,
  FileText,
  ChevronRight,
  ExternalLink
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';
import { useUser } from '@/context/user/UserContext';
import { Badge } from '@/components/ui/badge';

interface MobileDrawerMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onLogout?: () => void;
}

interface MenuItem {
  id: string;
  icon: React.ElementType;
  label: string;
  description?: string;
  path?: string;
  onClick?: () => void;
  badge?: string;
  external?: boolean;
}

export function MobileDrawerMenu({ isOpen, onClose, onLogout }: MobileDrawerMenuProps) {
  const navigate = useNavigate();
  const { currentUser } = useUser();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    if (savedTheme) {
      setTheme(savedTheme);
    } else if (document.documentElement.classList.contains('dark')) {
      setTheme('dark');
    }
  }, []);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  const handleThemeChange = (newTheme: 'light' | 'dark') => {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
  };

  const handleNavigation = (path: string) => {
    hapticPresets.buttonPress();
    onClose();
    navigate(path);
  };

  const handleLogout = () => {
    hapticPresets.buttonPress();
    onClose();
    onLogout?.();
  };

  const toggleTheme = () => {
    hapticPresets.buttonPress();
    handleThemeChange(theme === 'dark' ? 'light' : 'dark');
  };

  const menuSections: { title: string; items: MenuItem[] }[] = [
    {
      title: 'Account',
      items: [
        { id: 'profile', icon: User, label: 'My Profile', description: 'View and edit your profile', path: '/profile' },
        { id: 'wallet', icon: Wallet, label: 'My Wallet', description: 'View balance and transactions', path: '/wallet' },
        { id: 'notifications', icon: Bell, label: 'Notifications', description: 'Manage notification settings', path: '/notifications' },
      ]
    },
    {
      title: 'Settings',
      items: [
        { id: 'settings', icon: Settings, label: 'Settings', description: 'App preferences', path: '/settings' },
        { id: 'security', icon: Shield, label: 'Security', description: 'Password and 2FA', path: '/settings?tab=security' },
      ]
    },
    {
      title: 'Support',
      items: [
        { id: 'help', icon: HelpCircle, label: 'Help & Support', description: 'Get help and FAQs', path: '/help' },
        { id: 'terms', icon: FileText, label: 'Terms & Privacy', description: 'Legal information', path: '/terms', external: true },
      ]
    }
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-50"
            onClick={onClose}
            data-testid="drawer-backdrop"
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={cn(
              "fixed inset-y-0 left-0 z-50",
              "w-[85%] max-w-[320px]",
              "bg-white dark:bg-black",
              "flex flex-col",
              "safe-area-left safe-area-top safe-area-bottom"
            )}
            data-testid="drawer-menu"
          >
            {/* Header with Profile */}
            <div className="flex flex-col p-4 border-b border-black/10 dark:border-white/10">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-black dark:text-white">Menu</h2>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  data-testid="button-close-drawer"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>

              {/* Profile Card */}
              <button
                onClick={() => handleNavigation('/profile')}
                className={cn(
                  "flex items-center gap-3 p-3 -mx-1 rounded-xl",
                  "bg-black/5 dark:bg-white/5",
                  "hover-elevate active-elevate-2"
                )}
                data-testid="button-profile"
              >
                <Avatar className="h-12 w-12 border-2 border-black dark:border-white">
                  <AvatarImage src={(currentUser as any)?.avatarUrl || (currentUser as any)?.avatar || undefined} alt={currentUser?.name || 'User'} />
                  <AvatarFallback className="bg-black text-white dark:bg-white dark:text-black font-semibold">
                    {currentUser?.name?.charAt(0)?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 text-left">
                  <p className="font-semibold text-black dark:text-white">
                    {currentUser?.name || 'User'}
                  </p>
                  <p className="text-xs text-black/60 dark:text-white/60">
                    {currentUser?.email || 'View profile'}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-black/40 dark:text-white/40" />
              </button>
            </div>

            {/* Menu Items */}
            <div className="flex-1 overflow-y-auto py-2">
              {menuSections.map((section) => (
                <div key={section.title} className="mb-4">
                  <p className="px-4 py-2 text-xs font-semibold text-black/50 dark:text-white/50 uppercase tracking-wider">
                    {section.title}
                  </p>
                  <div className="px-2">
                    {section.items.map((item) => (
                      <MenuRow
                        key={item.id}
                        item={item}
                        onPress={() => item.path && handleNavigation(item.path)}
                      />
                    ))}
                  </div>
                </div>
              ))}

              {/* Theme Toggle */}
              <div className="px-2 mb-4">
                <div className={cn(
                  "flex items-center justify-between px-3 py-3 rounded-xl",
                  "hover-elevate"
                )}>
                  <div className="flex items-center gap-3">
                    {theme === 'dark' ? (
                      <Moon className="w-5 h-5 text-black dark:text-white" />
                    ) : (
                      <Sun className="w-5 h-5 text-black dark:text-white" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-black dark:text-white">Dark Mode</p>
                      <p className="text-xs text-black/50 dark:text-white/50">Toggle theme</p>
                    </div>
                  </div>
                  <Switch
                    checked={theme === 'dark'}
                    onCheckedChange={toggleTheme}
                    data-testid="switch-theme"
                  />
                </div>
              </div>
            </div>

            {/* Logout Button */}
            <div className="p-4 border-t border-black/10 dark:border-white/10">
              <Button
                variant="outline"
                className="w-full justify-start gap-3 text-destructive border-destructive/20 hover:bg-destructive/10"
                onClick={handleLogout}
                data-testid="button-logout"
              >
                <LogOut className="w-5 h-5" />
                Log Out
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

interface MenuRowProps {
  item: MenuItem;
  onPress: () => void;
}

function MenuRow({ item, onPress }: MenuRowProps) {
  const Icon = item.icon;
  
  return (
    <button
      onClick={() => {
        hapticPresets.buttonPress();
        if (item.onClick) {
          item.onClick();
        } else {
          onPress();
        }
      }}
      className={cn(
        "flex items-center w-full gap-3 px-3 py-3 rounded-xl",
        "text-left",
        "hover-elevate active-elevate-2"
      )}
      data-testid={`menu-item-${item.id}`}
    >
      <div className="flex items-center justify-center w-9 h-9 rounded-full bg-black/5 dark:bg-white/5">
        <Icon className="w-5 h-5 text-black dark:text-white" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-black dark:text-white">{item.label}</p>
        {item.description && (
          <p className="text-xs text-black/50 dark:text-white/50">{item.description}</p>
        )}
      </div>
      {item.badge && (
        <Badge 
          variant="secondary" 
          className="min-h-[20px] bg-black text-white dark:bg-white dark:text-black rounded-full text-xs px-2"
        >
          {item.badge}
        </Badge>
      )}
      {item.external ? (
        <ExternalLink className="w-4 h-4 text-black/40 dark:text-white/40" />
      ) : (
        <ChevronRight className="w-4 h-4 text-black/40 dark:text-white/40" />
      )}
    </button>
  );
}

export default MobileDrawerMenu;
