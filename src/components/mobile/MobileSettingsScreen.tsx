import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  User,
  Bell,
  Shield,
  Globe,
  MapPin,
  Fingerprint,
  LogOut,
  ChevronRight,
  HelpCircle,
  FileText,
  Info,
  Database,
  Trash2,
  Download,
  Activity,
  Palette,
  Smartphone,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';
import { MobileHeader } from './MobileHeader';
import { MobileBottomSheet } from './MobileBottomSheet';
import { LogoutConfirmDialog } from './MobileConfirmDialog';
import { MobileDeviceInfo, DeviceTrustBadge } from './MobileDeviceInfo';
import { MobileBatteryStatus } from './MobileBatteryStatus';
import { MobilePerformancePanel, PerformanceBadge } from './MobilePerformancePanel';
import { MobileLanguageSwitcher, useLanguage } from './MobileLanguageSwitcher';
import { useSettings } from '@/context/settings/SettingsContext';
import { useBiometric } from '@/hooks/use-biometric';
import { useToast } from '@/hooks/use-toast';

interface UserProfile {
  name: string;
  email: string;
  role: string;
  avatarUrl?: string;
}

interface MobileSettingsScreenProps {
  user?: UserProfile;
  onLogout?: () => Promise<void>;
  onDeleteAccount?: () => Promise<void>;
  className?: string;
}

export function MobileSettingsScreen({
  user,
  onLogout,
  onDeleteAccount,
  className,
}: MobileSettingsScreenProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { language, setLanguage, direction } = useLanguage();
  const { 
    dataVisibilitySettings, 
    updateDataVisibilitySettings,
    notificationSettings,
    updateNotificationSettings,
    appearanceSettings,
    updateAppearanceSettings
  } = useSettings();
  const { status: biometricStatus, storeCredentials, clearCredentials, refreshStatus } = useBiometric();
  
  const [isDark, setIsDark] = useState(false);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDeviceInfo, setShowDeviceInfo] = useState(false);
  const [showPerformance, setShowPerformance] = useState(false);
  const [showLanguage, setShowLanguage] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Derive state from settings context
  const notificationsEnabled = notificationSettings?.enabled ?? true;
  const locationSharingEnabled = dataVisibilitySettings?.options?.shareLocationWithTeam ?? false;
  const biometricEnabled = biometricStatus?.hasStoredCredentials ?? false;

  useEffect(() => {
    const dark = document.documentElement.classList.contains('dark') || appearanceSettings?.darkMode;
    setIsDark(dark);
  }, [appearanceSettings?.darkMode]);

  const handleThemeToggle = useCallback(() => {
    hapticPresets.toggle();
    const newDark = !isDark;
    setIsDark(newDark);
    document.documentElement.classList.toggle('dark', newDark);
    localStorage.setItem('theme', newDark ? 'dark' : 'light');
    updateAppearanceSettings({ darkMode: newDark });
  }, [isDark, updateAppearanceSettings]);

  const handleNotificationsToggle = useCallback((enabled: boolean) => {
    hapticPresets.toggle();
    updateNotificationSettings({ ...notificationSettings, enabled });
  }, [notificationSettings, updateNotificationSettings]);

  const handleLocationSharingToggle = useCallback((enabled: boolean) => {
    hapticPresets.toggle();
    updateDataVisibilitySettings({
      options: {
        ...dataVisibilitySettings?.options,
        shareLocationWithTeam: enabled
      }
    });
  }, [dataVisibilitySettings, updateDataVisibilitySettings]);

  const handleBiometricToggle = useCallback(async (enabled: boolean) => {
    hapticPresets.toggle();
    if (enabled) {
      // Navigate to biometric setup
      navigate('/settings?tab=security');
      toast({
        title: "Biometric Setup",
        description: "Please set up biometric login in the Security settings.",
      });
    } else {
      // Disable biometric
      const result = await clearCredentials();
      if (result.success) {
        await refreshStatus();
        toast({
          title: "Biometric Disabled",
          description: "Biometric login has been disabled.",
        });
      }
    }
  }, [clearCredentials, refreshStatus, navigate, toast]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await onLogout?.();
    } finally {
      setIsLoggingOut(false);
      setShowLogoutDialog(false);
    }
  };

  const defaultUser: UserProfile = user || {
    name: 'Guest User',
    email: 'guest@example.com',
    role: 'Field Agent',
  };

  return (
    <div className={cn("min-h-screen bg-gray-50 dark:bg-neutral-950 pb-safe", className)} data-testid="mobile-settings">
      <MobileHeader
        title="Settings"
        showBack
        elevated
        rightActions={
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              hapticPresets.buttonPress();
              navigate('/help');
            }}
            data-testid="button-help"
          >
            <HelpCircle className="w-5 h-5" />
          </Button>
        }
      />

      <div className="px-4 py-4 space-y-6">
        <Card className="p-4">
          <button
            onClick={() => {
              hapticPresets.buttonPress();
              navigate('/profile');
            }}
            className="flex items-center gap-4 w-full"
            data-testid="button-profile"
          >
            <div className="w-14 h-14 bg-black dark:bg-white rounded-full flex items-center justify-center">
              {defaultUser.avatarUrl ? (
                <img 
                  src={defaultUser.avatarUrl} 
                  alt={defaultUser.name}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <User className="w-6 h-6 text-white dark:text-black" />
              )}
            </div>
            <div className="flex-1 text-left">
              <p className="text-base font-semibold text-black dark:text-white">
                {defaultUser.name}
              </p>
              <p className="text-sm text-black/60 dark:text-white/60">
                {defaultUser.email}
              </p>
              <Badge variant="secondary" className="mt-1 text-xs">
                {defaultUser.role}
              </Badge>
            </div>
            <ChevronRight className="w-5 h-5 text-black/20 dark:text-white/20" />
          </button>
        </Card>

        <SettingsSection title="Preferences">
          <SettingsRow
            icon={<Palette className="w-5 h-5" />}
            label="Dark Mode"
            description="Switch between light and dark theme"
            action={
              <Switch
                checked={isDark}
                onCheckedChange={handleThemeToggle}
                data-testid="switch-dark-mode"
                aria-label="Toggle dark mode"
              />
            }
          />
          <SettingsRow
            icon={<Globe className="w-5 h-5" />}
            label="Language"
            description={language === 'ar' ? 'العربية' : 'English'}
            onClick={() => {
              hapticPresets.buttonPress();
              setShowLanguage(true);
            }}
          />
          <SettingsRow
            icon={<Bell className="w-5 h-5" />}
            label="Push Notifications"
            description="Receive alerts and updates"
            action={
              <Switch
                checked={notificationsEnabled}
                onCheckedChange={handleNotificationsToggle}
                data-testid="switch-notifications"
                aria-label="Toggle push notifications"
              />
            }
          />
        </SettingsSection>

        <SettingsSection title="Privacy & Security">
          <SettingsRow
            icon={<MapPin className="w-5 h-5" />}
            label="Share Location with Team"
            description="Allow team members to see your location"
            action={
              <Switch
                checked={locationSharingEnabled}
                onCheckedChange={handleLocationSharingToggle}
                data-testid="switch-location"
                aria-label="Toggle location sharing with team"
              />
            }
          />
          <SettingsRow
            icon={<Fingerprint className="w-5 h-5" />}
            label="Biometric Login"
            description={biometricStatus?.isAvailable 
              ? "Use fingerprint or face to login" 
              : "Not available on this device"}
            action={
              <Switch
                checked={biometricEnabled}
                onCheckedChange={handleBiometricToggle}
                disabled={!biometricStatus?.isAvailable}
                data-testid="switch-biometric"
                aria-label="Toggle biometric login"
              />
            }
          />
          <SettingsRow
            icon={<Shield className="w-5 h-5" />}
            label="Security Settings"
            onClick={() => {
              hapticPresets.buttonPress();
              navigate('/security');
            }}
          />
        </SettingsSection>

        <SettingsSection title="Device & Performance">
          <SettingsRow
            icon={<Smartphone className="w-5 h-5" />}
            label="Device Information"
            rightContent={<DeviceTrustBadge />}
            onClick={() => {
              hapticPresets.buttonPress();
              setShowDeviceInfo(true);
            }}
          />
          <SettingsRow
            icon={<Activity className="w-5 h-5" />}
            label="Performance"
            rightContent={<PerformanceBadge />}
            onClick={() => {
              hapticPresets.buttonPress();
              setShowPerformance(true);
            }}
          />
          <SettingsRow
            icon={<Database className="w-5 h-5" />}
            label="Offline Data"
            description="Manage cached data and sync"
            onClick={() => {
              hapticPresets.buttonPress();
              navigate('/offline-data');
            }}
          />
        </SettingsSection>

        <SettingsSection title="Support">
          <SettingsRow
            icon={<HelpCircle className="w-5 h-5" />}
            label="Help Center"
            onClick={() => {
              hapticPresets.buttonPress();
              navigate('/help');
            }}
          />
          <SettingsRow
            icon={<FileText className="w-5 h-5" />}
            label="Terms of Service"
            onClick={() => {
              hapticPresets.buttonPress();
              navigate('/terms');
            }}
          />
          <SettingsRow
            icon={<Info className="w-5 h-5" />}
            label="About"
            description="Version 1.0.0"
            onClick={() => {
              hapticPresets.buttonPress();
              navigate('/about');
            }}
          />
        </SettingsSection>

        <SettingsSection title="Account">
          <SettingsRow
            icon={<Download className="w-5 h-5" />}
            label="Export Data"
            description="Download your personal data"
            onClick={() => {
              hapticPresets.buttonPress();
            }}
          />
          <SettingsRow
            icon={<LogOut className="w-5 h-5" />}
            label="Sign Out"
            textColor="text-destructive"
            onClick={() => {
              hapticPresets.buttonPress();
              setShowLogoutDialog(true);
            }}
          />
          <SettingsRow
            icon={<Trash2 className="w-5 h-5" />}
            label="Delete Account"
            textColor="text-destructive"
            description="Permanently delete your account and data"
            onClick={() => {
              hapticPresets.buttonPress();
              setShowDeleteDialog(true);
            }}
          />
        </SettingsSection>

        <p className="text-xs text-center text-black/40 dark:text-white/40 py-4">
          PACT Workflow v1.0.0
        </p>
      </div>

      <MobileBottomSheet
        isOpen={showDeviceInfo}
        onClose={() => setShowDeviceInfo(false)}
        title="Device Information"
      >
        <div className="p-4">
          <MobileDeviceInfo showFullDetails />
          <div className="mt-4">
            <MobileBatteryStatus showOptimizations />
          </div>
        </div>
      </MobileBottomSheet>

      <MobileBottomSheet
        isOpen={showPerformance}
        onClose={() => setShowPerformance(false)}
        title="Performance"
      >
        <div className="p-4">
          <MobilePerformancePanel showDetails autoRefresh />
        </div>
      </MobileBottomSheet>

      <MobileBottomSheet
        isOpen={showLanguage}
        onClose={() => setShowLanguage(false)}
        title="Language"
      >
        <div className="p-4">
          <MobileLanguageSwitcher 
            variant="list"
            onLanguageChange={(lang) => {
              setLanguage(lang);
              setShowLanguage(false);
            }}
          />
        </div>
      </MobileBottomSheet>

      <LogoutConfirmDialog
        isOpen={showLogoutDialog}
        onClose={() => setShowLogoutDialog(false)}
        onConfirm={handleLogout}
        isLoading={isLoggingOut}
      />

      <MobileConfirmDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={async () => {
          await onDeleteAccount?.();
          setShowDeleteDialog(false);
        }}
        title="Delete Account"
        description="This action is permanent and cannot be undone. All your data will be permanently deleted."
        confirmLabel="Delete Account"
        variant="destructive"
      />
    </div>
  );
}

interface SettingsSectionProps {
  title: string;
  children: React.ReactNode;
}

function SettingsSection({ title, children }: SettingsSectionProps) {
  return (
    <section>
      <h2 className="text-xs font-semibold text-black/60 dark:text-white/60 uppercase tracking-wider mb-2 px-1">
        {title}
      </h2>
      <Card className="divide-y divide-black/5 dark:divide-white/5">
        {children}
      </Card>
    </section>
  );
}

interface SettingsRowProps {
  icon: React.ReactNode;
  label: string;
  description?: string;
  action?: React.ReactNode;
  rightContent?: React.ReactNode;
  textColor?: string;
  onClick?: () => void;
}

function SettingsRow({
  icon,
  label,
  description,
  action,
  rightContent,
  textColor,
  onClick,
}: SettingsRowProps) {
  const content = (
    <div className="flex items-center gap-3 p-4">
      <div className={cn("text-black/60 dark:text-white/60", textColor)}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-medium text-black dark:text-white", textColor)}>
          {label}
        </p>
        {description && (
          <p className="text-xs text-black/50 dark:text-white/50 truncate">
            {description}
          </p>
        )}
      </div>
      {rightContent}
      {action}
      {onClick && !action && (
        <ChevronRight className="w-4 h-4 text-black/20 dark:text-white/20" />
      )}
    </div>
  );

  if (onClick) {
    return (
      <button
        onClick={onClick}
        className="w-full text-left active:bg-black/5 dark:active:bg-white/5"
        data-testid={`settings-row-${label.toLowerCase().replace(/\s/g, '-')}`}
      >
        {content}
      </button>
    );
  }

  return <div data-testid={`settings-row-${label.toLowerCase().replace(/\s/g, '-')}`}>{content}</div>;
}
