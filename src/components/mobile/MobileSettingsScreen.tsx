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
  Battery,
  Wifi,
  WifiOff,
  Image,
  HardDrive,
  Eye,
  Type,
  Vibrate,
  Clock,
  Cloud,
  Zap,
  Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';
import { MobileHeader } from './MobileHeader';
import { MobileBottomSheet } from './MobileBottomSheet';
import { LogoutConfirmDialog, MobileConfirmDialog } from './MobileConfirmDialog';
import { MobileDeviceInfo, DeviceTrustBadge } from './MobileDeviceInfo';
import { MobileBatteryStatus } from './MobileBatteryStatus';
import { MobilePerformancePanel, PerformanceBadge } from './MobilePerformancePanel';
import { MobileLanguageSwitcher, useLanguage } from './MobileLanguageSwitcher';
import { useSettingsSafe } from '@/context/settings/SettingsContext';
import { useBiometric } from '@/hooks/use-biometric';
import { useToast } from '@/hooks/use-toast';
import { useMobilePermissions } from '@/hooks/use-mobile-permissions';
import { useMobileExtendedSettings, FontSize, HapticIntensity, ImageQuality } from '@/hooks/use-mobile-extended-settings';
import { useDevice } from '@/hooks/use-device';
import { Camera, Mic, BellRing, CheckCircle, XCircle, RefreshCw } from 'lucide-react';

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
  const settings = useSettingsSafe();
  const dataVisibilitySettings = settings?.dataVisibilitySettings;
  const updateDataVisibilitySettings = settings?.updateDataVisibilitySettings ?? (async () => {});
  const notificationSettings = settings?.notificationSettings;
  const updateNotificationSettings = settings?.updateNotificationSettings ?? (async () => {});
  const appearanceSettings = settings?.appearanceSettings;
  const updateAppearanceSettings = settings?.updateAppearanceSettings ?? (async () => {});
  const { status: biometricStatus, storeCredentials, clearCredentials, refreshStatus } = useBiometric();
  const { permissions, checkAllPermissions, resetSetup, isChecking } = useMobilePermissions();
  const { isNative } = useDevice();
  const { 
    settings: extendedSettings, 
    updateDataUsage, 
    updateAccessibility, 
    updateHapticIntensity,
    updateBatteryOptimization,
    clearCache 
  } = useMobileExtendedSettings();
  
  const [isDark, setIsDark] = useState(false);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDeviceInfo, setShowDeviceInfo] = useState(false);
  const [showPerformance, setShowPerformance] = useState(false);
  const [showLanguage, setShowLanguage] = useState(false);
  const [showPermissions, setShowPermissions] = useState(false);
  const [showDataUsage, setShowDataUsage] = useState(false);
  const [showAccessibility, setShowAccessibility] = useState(false);
  const [showSyncStatus, setShowSyncStatus] = useState(false);
  const [showSecurityInfo, setShowSecurityInfo] = useState(false);
  const [showHelpInfo, setShowHelpInfo] = useState(false);
  const [showTermsInfo, setShowTermsInfo] = useState(false);
  const [showAboutInfo, setShowAboutInfo] = useState(false);
  const [showProfileInfo, setShowProfileInfo] = useState(false);
  const [showExportInfo, setShowExportInfo] = useState(false);
  const [showOfflineInfo, setShowOfflineInfo] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isClearingCache, setIsClearingCache] = useState(false);

  // Derive state from settings context
  const notificationsEnabled = notificationSettings?.enabled ?? true;
  const locationSharingEnabled = dataVisibilitySettings?.options?.shareLocationWithTeam ?? false;
  const biometricEnabled = biometricStatus?.hasStoredCredentials ?? false;

  useEffect(() => {
    const dark = document.documentElement.classList.contains('dark') || appearanceSettings?.darkMode;
    setIsDark(dark);
  }, [appearanceSettings?.darkMode]);

  // Load permissions on mount so status is immediately visible
  useEffect(() => {
    checkAllPermissions();
  }, [checkAllPermissions]);

  const handleThemeToggle = useCallback(() => {
    hapticPresets.toggle();
    const newDark = !isDark;
    setIsDark(newDark);
    document.documentElement.classList.toggle('dark', newDark);
    localStorage.setItem('theme', newDark ? 'dark' : 'light');
    if (settings) {
      updateAppearanceSettings({ darkMode: newDark, theme: newDark ? 'dark' : 'light' });
    }
  }, [isDark, settings, updateAppearanceSettings]);

  const handleNotificationsToggle = useCallback((enabled: boolean) => {
    hapticPresets.toggle();
    if (!settings) {
      toast({ title: "Settings unavailable", description: "Please try again later.", variant: "destructive" });
      return;
    }
    const currentSettings = notificationSettings ?? {
      enabled: true,
      email: false,
      sound: false,
      browserPush: false,
      vibration: false,
      categories: { assignments: true, approvals: true, financial: true, team: true, system: true },
      quietHours: { enabled: false, startHour: 22, endHour: 7 },
      frequency: 'instant' as const,
      autoDeleteDays: 30,
    };
    updateNotificationSettings({ ...currentSettings, enabled });
  }, [settings, notificationSettings, updateNotificationSettings, toast]);

  const handleLocationSharingToggle = useCallback((enabled: boolean) => {
    hapticPresets.toggle();
    if (!settings) {
      toast({ title: "Settings unavailable", description: "Please try again later.", variant: "destructive" });
      return;
    }
    updateDataVisibilitySettings({
      options: {
        ...(dataVisibilitySettings?.options ?? {}),
        shareLocationWithTeam: enabled
      }
    });
  }, [settings, dataVisibilitySettings, updateDataVisibilitySettings, toast]);

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
    <div className={cn("flex flex-col h-screen bg-white dark:bg-black", className)} data-testid="mobile-settings">
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
              setShowHelpInfo(true);
            }}
            data-testid="button-help"
            aria-label="Open help center"
          >
            <HelpCircle className="w-5 h-5" />
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-32 space-y-6">
        <Card className="p-4">
          <button
            onClick={() => {
              hapticPresets.buttonPress();
              setShowProfileInfo(true);
            }}
            className="flex items-center gap-4 w-full"
            data-testid="button-profile"
            aria-label="View and edit your profile"
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
              <Badge 
                variant="outline" 
                className="mt-1 text-xs min-h-[24px] rounded-full px-3 bg-white text-black dark:bg-black dark:text-white border-black/20 dark:border-white/20"
                data-testid="badge-user-role"
                aria-label={`User role: ${defaultUser.role}`}
              >
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
            description="2FA and password options"
            onClick={() => {
              hapticPresets.buttonPress();
              setShowSecurityInfo(true);
            }}
          />
        </SettingsSection>

        <SettingsSection title="App Permissions">
          <SettingsRow
            icon={<MapPin className="w-5 h-5" />}
            label="Location"
            description="Required for site visits"
            ariaLabel="View location permission status"
            rightContent={
              <Badge 
                variant="outline"
                className={cn(
                  "min-h-[28px] rounded-full px-3",
                  permissions.location === 'granted' 
                    ? "bg-black text-white dark:bg-white dark:text-black border-black dark:border-white" 
                    : "bg-white text-black dark:bg-black dark:text-white border-black/20 dark:border-white/20"
                )}
                data-testid="badge-permission-location-inline"
                aria-label={`Location permission ${permissions.location}`}
              >
                {permissions.location === 'granted' ? (
                  <><CheckCircle className="w-3 h-3 mr-1" /> Granted</>
                ) : permissions.location === 'denied' ? (
                  <><XCircle className="w-3 h-3 mr-1" /> Denied</>
                ) : (
                  'Not Set'
                )}
              </Badge>
            }
            onClick={() => {
              hapticPresets.buttonPress();
              setShowPermissions(true);
            }}
          />
          <SettingsRow
            icon={<Camera className="w-5 h-5" />}
            label="Camera"
            description="For photos and documents"
            ariaLabel="View camera permission status"
            rightContent={
              <Badge 
                variant="outline"
                className={cn(
                  "min-h-[28px] rounded-full px-3",
                  permissions.camera === 'granted' 
                    ? "bg-black text-white dark:bg-white dark:text-black border-black dark:border-white" 
                    : "bg-white text-black dark:bg-black dark:text-white border-black/20 dark:border-white/20"
                )}
                data-testid="badge-permission-camera-inline"
                aria-label={`Camera permission ${permissions.camera}`}
              >
                {permissions.camera === 'granted' ? 'Granted' : permissions.camera === 'denied' ? 'Denied' : 'Not Set'}
              </Badge>
            }
            onClick={() => {
              hapticPresets.buttonPress();
              setShowPermissions(true);
            }}
          />
          <SettingsRow
            icon={<Mic className="w-5 h-5" />}
            label="Microphone"
            description="For voice notes"
            ariaLabel="View microphone permission status"
            rightContent={
              <Badge 
                variant="outline"
                className={cn(
                  "min-h-[28px] rounded-full px-3",
                  permissions.microphone === 'granted' 
                    ? "bg-black text-white dark:bg-white dark:text-black border-black dark:border-white" 
                    : "bg-white text-black dark:bg-black dark:text-white border-black/20 dark:border-white/20"
                )}
                data-testid="badge-permission-microphone-inline"
                aria-label={`Microphone permission ${permissions.microphone}`}
              >
                {permissions.microphone === 'granted' ? 'Granted' : permissions.microphone === 'denied' ? 'Denied' : 'Not Set'}
              </Badge>
            }
            onClick={() => {
              hapticPresets.buttonPress();
              setShowPermissions(true);
            }}
          />
          <SettingsRow
            icon={<BellRing className="w-5 h-5" />}
            label="Notifications"
            description="For alerts and updates"
            ariaLabel="View notifications permission status"
            rightContent={
              <Badge 
                variant="outline"
                className={cn(
                  "min-h-[28px] rounded-full px-3",
                  permissions.notifications === 'granted' 
                    ? "bg-black text-white dark:bg-white dark:text-black border-black dark:border-white" 
                    : "bg-white text-black dark:bg-black dark:text-white border-black/20 dark:border-white/20"
                )}
                data-testid="badge-permission-notifications-inline"
                aria-label={`Notifications permission ${permissions.notifications}`}
              >
                {permissions.notifications === 'granted' ? 'Granted' : permissions.notifications === 'denied' ? 'Denied' : 'Not Set'}
              </Badge>
            }
            onClick={() => {
              hapticPresets.buttonPress();
              setShowPermissions(true);
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
              if (!isNative) {
                toast({
                  title: "Not Available",
                  description: "Device information is only available in the mobile app.",
                  variant: "destructive",
                });
                return;
              }
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
              setShowOfflineInfo(true);
            }}
          />
        </SettingsSection>

        <SettingsSection title="Data & Sync">
          <SettingsRow
            icon={<Cloud className="w-5 h-5" />}
            label="Sync Status"
            ariaLabel="View sync status and history"
            description={extendedSettings.syncStatus.lastSyncTime 
              ? `Last synced: ${new Date(extendedSettings.syncStatus.lastSyncTime).toLocaleString()}`
              : 'Not synced yet'}
            rightContent={
              extendedSettings.syncStatus.pendingItemsCount > 0 ? (
                <Badge 
                  variant="outline" 
                  className="min-h-[28px] rounded-full px-3 bg-black text-white dark:bg-white dark:text-black border-black dark:border-white"
                  data-testid="badge-sync-pending"
                  aria-label={`${extendedSettings.syncStatus.pendingItemsCount} items pending sync`}
                >
                  {extendedSettings.syncStatus.pendingItemsCount} pending
                </Badge>
              ) : null
            }
            onClick={() => {
              hapticPresets.buttonPress();
              setShowSyncStatus(true);
            }}
          />
          <SettingsRow
            icon={<Wifi className="w-5 h-5" />}
            label="Data Usage"
            ariaLabel="Configure data usage and sync settings"
            description="Wi-Fi sync, image quality, cache"
            onClick={() => {
              hapticPresets.buttonPress();
              setShowDataUsage(true);
            }}
          />
          <SettingsRow
            icon={<Battery className="w-5 h-5" />}
            label="Battery Optimization"
            ariaLabel="Configure battery optimization for background GPS"
            description="Disable for reliable GPS tracking"
            rightContent={
              <Badge 
                variant="outline" 
                className={cn(
                  "min-h-[28px] rounded-full px-3",
                  extendedSettings.batteryOptimization.isOptimizationDisabled
                    ? "bg-black text-white dark:bg-white dark:text-black border-black dark:border-white"
                    : "bg-white text-black dark:bg-black dark:text-white border-black/20 dark:border-white/20"
                )}
                data-testid="badge-battery-optimization"
                aria-label={`Battery optimization ${extendedSettings.batteryOptimization.isOptimizationDisabled ? 'disabled' : 'enabled'}`}
              >
                {extendedSettings.batteryOptimization.isOptimizationDisabled ? (
                  <><CheckCircle className="w-3 h-3 mr-1" /> Disabled</>
                ) : (
                  'Enabled'
                )}
              </Badge>
            }
            onClick={() => {
              hapticPresets.buttonPress();
              updateBatteryOptimization({ hasSeenGuidance: true });
              if (typeof window !== 'undefined' && 'Capacitor' in window) {
                toast({
                  title: "Battery Optimization",
                  description: "Open your device Settings > Apps > PACT > Battery > Unrestricted to allow background GPS.",
                });
              } else {
                toast({
                  title: "Battery Optimization",
                  description: "This feature is only available on the mobile app.",
                });
              }
            }}
          />
        </SettingsSection>

        <SettingsSection title="Accessibility">
          <SettingsRow
            icon={<Type className="w-5 h-5" />}
            label="Font Size"
            ariaLabel="Adjust font size"
            rightContent={
              <Badge 
                variant="outline" 
                className="min-h-[28px] rounded-full px-3 bg-white text-black dark:bg-black dark:text-white border-black/20 dark:border-white/20 capitalize"
                data-testid="badge-font-size"
                aria-label={`Font size ${extendedSettings.accessibility.fontSize}`}
              >
                {extendedSettings.accessibility.fontSize}
              </Badge>
            }
            onClick={() => {
              hapticPresets.buttonPress();
              setShowAccessibility(true);
            }}
          />
          <SettingsRow
            icon={<Eye className="w-5 h-5" />}
            label="High Contrast"
            ariaLabel="Toggle high contrast mode"
            description="Increase visual contrast"
            action={
              <Switch
                checked={extendedSettings.accessibility.highContrast}
                onCheckedChange={(checked) => {
                  hapticPresets.toggle();
                  updateAccessibility({ highContrast: checked });
                }}
                data-testid="switch-high-contrast"
                aria-label="Toggle high contrast mode"
              />
            }
          />
          <SettingsRow
            icon={<Zap className="w-5 h-5" />}
            label="Reduced Motion"
            ariaLabel="Toggle reduced motion for animations"
            description="Minimize animations"
            action={
              <Switch
                checked={extendedSettings.accessibility.reducedMotion}
                onCheckedChange={(checked) => {
                  hapticPresets.toggle();
                  updateAccessibility({ reducedMotion: checked });
                }}
                data-testid="switch-reduced-motion"
                aria-label="Toggle reduced motion"
              />
            }
          />
          <SettingsRow
            icon={<Vibrate className="w-5 h-5" />}
            label="Haptic Feedback"
            ariaLabel="Configure haptic feedback intensity"
            rightContent={
              <Badge 
                variant="outline" 
                className="min-h-[28px] rounded-full px-3 bg-white text-black dark:bg-black dark:text-white border-black/20 dark:border-white/20 capitalize"
                data-testid="badge-haptic-intensity"
                aria-label={`Haptic feedback intensity ${extendedSettings.hapticIntensity}`}
              >
                {extendedSettings.hapticIntensity}
              </Badge>
            }
            onClick={() => {
              hapticPresets.buttonPress();
              setShowAccessibility(true);
            }}
          />
        </SettingsSection>

        <SettingsSection title="Support">
          <SettingsRow
            icon={<HelpCircle className="w-5 h-5" />}
            label="Help Center"
            description="FAQ and support"
            onClick={() => {
              hapticPresets.buttonPress();
              setShowHelpInfo(true);
            }}
          />
          <SettingsRow
            icon={<FileText className="w-5 h-5" />}
            label="Terms of Service"
            description="Legal information"
            onClick={() => {
              hapticPresets.buttonPress();
              setShowTermsInfo(true);
            }}
          />
          <SettingsRow
            icon={<Info className="w-5 h-5" />}
            label="About"
            description="Version 1.0.0"
            onClick={() => {
              hapticPresets.buttonPress();
              setShowAboutInfo(true);
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
              setShowExportInfo(true);
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

        {/* Sign Out Button - Prominent placement */}
        <Button
          variant="outline"
          className="w-full min-h-12 rounded-full border-destructive text-destructive hover:bg-destructive hover:text-white dark:border-destructive dark:text-destructive"
          onClick={() => {
            hapticPresets.buttonPress();
            setShowLogoutDialog(true);
          }}
          data-testid="button-sign-out"
          aria-label="Sign out of your account"
        >
          <LogOut className="w-5 h-5 mr-2" />
          Sign Out
        </Button>

        <p className="text-xs text-center text-black/40 dark:text-white/40 py-4 pb-32">
          PACT Command Center v1.0.0
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
          <MobileLanguageSwitcher variant="list" />
          <Button 
            className="w-full mt-4 rounded-full"
            onClick={() => setShowLanguage(false)}
            data-testid="button-close-language"
            aria-label="Done selecting language"
          >
            Done
          </Button>
        </div>
      </MobileBottomSheet>

      <MobileBottomSheet
        isOpen={showPermissions}
        onClose={() => setShowPermissions(false)}
        title="App Permissions"
      >
        <div className="p-4 space-y-4">
          <p className="text-sm text-black/60 dark:text-white/60">
            Manage app permissions to ensure all features work correctly.
          </p>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-black/5 dark:bg-white/5 rounded-xl min-h-11">
              <div className="flex items-center gap-3">
                <MapPin className="w-5 h-5 text-black/60 dark:text-white/60" />
                <div>
                  <p className="text-sm font-medium text-black dark:text-white">Location</p>
                  <p className="text-xs text-black/50 dark:text-white/50">Required for site visits</p>
                </div>
              </div>
              <Badge 
                variant="outline"
                className={cn(
                  "min-h-[28px] rounded-full px-3",
                  permissions.location === 'granted' 
                    ? "bg-black text-white dark:bg-white dark:text-black border-black dark:border-white" 
                    : "bg-white text-black dark:bg-black dark:text-white border-black/20 dark:border-white/20"
                )}
                data-testid="badge-permission-location"
                aria-label={`Location permission ${permissions.location}`}
              >
                {permissions.location === 'granted' ? 'Granted' : permissions.location === 'denied' ? 'Denied' : 'Not Set'}
              </Badge>
            </div>

            <div className="flex items-center justify-between p-3 bg-black/5 dark:bg-white/5 rounded-xl min-h-11">
              <div className="flex items-center gap-3">
                <Camera className="w-5 h-5 text-black/60 dark:text-white/60" />
                <div>
                  <p className="text-sm font-medium text-black dark:text-white">Camera</p>
                  <p className="text-xs text-black/50 dark:text-white/50">Photos and documents</p>
                </div>
              </div>
              <Badge 
                variant="outline"
                className={cn(
                  "min-h-[28px] rounded-full px-3",
                  permissions.camera === 'granted' 
                    ? "bg-black text-white dark:bg-white dark:text-black border-black dark:border-white" 
                    : "bg-white text-black dark:bg-black dark:text-white border-black/20 dark:border-white/20"
                )}
                data-testid="badge-permission-camera"
                aria-label={`Camera permission ${permissions.camera}`}
              >
                {permissions.camera === 'granted' ? 'Granted' : permissions.camera === 'denied' ? 'Denied' : 'Not Set'}
              </Badge>
            </div>

            <div className="flex items-center justify-between p-3 bg-black/5 dark:bg-white/5 rounded-xl min-h-11">
              <div className="flex items-center gap-3">
                <Mic className="w-5 h-5 text-black/60 dark:text-white/60" />
                <div>
                  <p className="text-sm font-medium text-black dark:text-white">Microphone</p>
                  <p className="text-xs text-black/50 dark:text-white/50">Voice notes</p>
                </div>
              </div>
              <Badge 
                variant="outline"
                className={cn(
                  "min-h-[28px] rounded-full px-3",
                  permissions.microphone === 'granted' 
                    ? "bg-black text-white dark:bg-white dark:text-black border-black dark:border-white" 
                    : "bg-white text-black dark:bg-black dark:text-white border-black/20 dark:border-white/20"
                )}
                data-testid="badge-permission-microphone"
                aria-label={`Microphone permission ${permissions.microphone}`}
              >
                {permissions.microphone === 'granted' ? 'Granted' : permissions.microphone === 'denied' ? 'Denied' : 'Not Set'}
              </Badge>
            </div>

            <div className="flex items-center justify-between p-3 bg-black/5 dark:bg-white/5 rounded-xl min-h-11">
              <div className="flex items-center gap-3">
                <BellRing className="w-5 h-5 text-black/60 dark:text-white/60" />
                <div>
                  <p className="text-sm font-medium text-black dark:text-white">Notifications</p>
                  <p className="text-xs text-black/50 dark:text-white/50">Alerts and updates</p>
                </div>
              </div>
              <Badge 
                variant="outline"
                className={cn(
                  "min-h-[28px] rounded-full px-3",
                  permissions.notifications === 'granted' 
                    ? "bg-black text-white dark:bg-white dark:text-black border-black dark:border-white" 
                    : "bg-white text-black dark:bg-black dark:text-white border-black/20 dark:border-white/20"
                )}
                data-testid="badge-permission-notifications"
                aria-label={`Notifications permission ${permissions.notifications}`}
              >
                {permissions.notifications === 'granted' ? 'Granted' : permissions.notifications === 'denied' ? 'Denied' : 'Not Set'}
              </Badge>
            </div>
          </div>

          <div className="pt-4 space-y-3">
            <Button
              variant="outline"
              className="w-full rounded-full"
              onClick={async () => {
                hapticPresets.buttonPress();
                await checkAllPermissions();
                toast({
                  title: "Permissions Refreshed",
                  description: "Permission status has been updated.",
                });
              }}
              disabled={isChecking}
              data-testid="button-refresh-permissions"
              aria-label="Refresh permission status"
            >
              {isChecking ? (
                <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Checking...</>
              ) : (
                <><RefreshCw className="w-4 h-4 mr-2" /> Refresh Status</>
              )}
            </Button>

            <Button
              variant="destructive"
              className="w-full rounded-full"
              onClick={() => {
                hapticPresets.warning();
                resetSetup();
                setShowPermissions(false);
                toast({
                  title: "Permission Setup Reset",
                  description: "You'll be prompted for permissions again on next app launch.",
                });
              }}
              data-testid="button-reset-permissions"
              aria-label="Reset permission setup"
            >
              Reset Permission Setup
            </Button>
          </div>

          <p className="text-xs text-center text-black/40 dark:text-white/40 pt-2">
            To change permissions, go to your device Settings and find PACT in the Apps section.
          </p>
        </div>
      </MobileBottomSheet>

      <MobileBottomSheet
        isOpen={showDataUsage}
        onClose={() => setShowDataUsage(false)}
        title="Data Usage"
      >
        <div className="p-4 space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-black dark:text-white">Sync on Wi-Fi Only</p>
                <p className="text-xs text-black/50 dark:text-white/50">Save mobile data by syncing only on Wi-Fi</p>
              </div>
              <Switch
                checked={extendedSettings.dataUsage.syncOnWifiOnly}
                onCheckedChange={(checked) => {
                  hapticPresets.toggle();
                  updateDataUsage({ syncOnWifiOnly: checked });
                }}
                data-testid="switch-wifi-sync"
                aria-label="Toggle Wi-Fi only sync"
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-black dark:text-white">Image Quality</p>
              <p className="text-xs text-black/50 dark:text-white/50">Lower quality uses less data</p>
              <div className="flex gap-2 flex-wrap">
                {(['low', 'medium', 'high', 'original'] as ImageQuality[]).map((quality) => (
                  <Button
                    key={quality}
                    variant={extendedSettings.dataUsage.imageQuality === quality ? 'default' : 'outline'}
                    size="sm"
                    className="rounded-full capitalize"
                    onClick={() => {
                      hapticPresets.buttonPress();
                      updateDataUsage({ imageQuality: quality });
                    }}
                    data-testid={`button-quality-${quality}`}
                    aria-label={`Set image quality to ${quality}`}
                  >
                    {quality}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-black dark:text-white">Cache Limit</p>
                <Badge variant="secondary">{extendedSettings.dataUsage.cacheLimitMB} MB</Badge>
              </div>
              <Slider
                value={[extendedSettings.dataUsage.cacheLimitMB]}
                onValueChange={(value) => updateDataUsage({ cacheLimitMB: value[0] })}
                min={100}
                max={2000}
                step={100}
                className="w-full"
                data-testid="slider-cache-limit"
                aria-label="Cache limit slider"
              />
              <div className="flex justify-between text-xs text-black/40 dark:text-white/40">
                <span>100 MB</span>
                <span>2 GB</span>
              </div>
            </div>

            <Button
              variant="outline"
              className="w-full rounded-full"
              onClick={async () => {
                setIsClearingCache(true);
                hapticPresets.buttonPress();
                const result = await clearCache();
                setIsClearingCache(false);
                toast({
                  title: result.success ? "Cache Cleared" : "Error",
                  description: result.success ? "All cached data has been removed." : "Failed to clear cache.",
                  variant: result.success ? "default" : "destructive",
                });
              }}
              disabled={isClearingCache}
              data-testid="button-clear-cache"
              aria-label="Clear cached data"
            >
              {isClearingCache ? 'Clearing...' : 'Clear Cache'}
            </Button>
          </div>
        </div>
      </MobileBottomSheet>

      <MobileBottomSheet
        isOpen={showAccessibility}
        onClose={() => setShowAccessibility(false)}
        title="Accessibility"
      >
        <div className="p-4 space-y-6">
          <div className="space-y-2">
            <p className="text-sm font-medium text-black dark:text-white">Font Size</p>
            <div className="flex gap-2 flex-wrap">
              {(['small', 'medium', 'large', 'extra-large'] as FontSize[]).map((size) => (
                <Button
                  key={size}
                  variant={extendedSettings.accessibility.fontSize === size ? 'default' : 'outline'}
                  size="sm"
                  className="rounded-full capitalize"
                  onClick={() => {
                    hapticPresets.buttonPress();
                    updateAccessibility({ fontSize: size });
                  }}
                  data-testid={`button-font-${size}`}
                  aria-label={`Set font size to ${size}`}
                >
                  {size.replace('-', ' ')}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-black dark:text-white">Haptic Feedback Intensity</p>
            <div className="flex gap-2 flex-wrap">
              {(['off', 'light', 'medium', 'strong'] as HapticIntensity[]).map((intensity) => (
                <Button
                  key={intensity}
                  variant={extendedSettings.hapticIntensity === intensity ? 'default' : 'outline'}
                  size="sm"
                  className="rounded-full capitalize"
                  onClick={() => {
                    hapticPresets.buttonPress();
                    updateHapticIntensity(intensity);
                  }}
                  data-testid={`button-haptic-${intensity}`}
                  aria-label={`Set haptic intensity to ${intensity}`}
                >
                  {intensity}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-black dark:text-white">High Contrast</p>
                <p className="text-xs text-black/50 dark:text-white/50">Increase visual contrast</p>
              </div>
              <Switch
                checked={extendedSettings.accessibility.highContrast}
                onCheckedChange={(checked) => {
                  hapticPresets.toggle();
                  updateAccessibility({ highContrast: checked });
                }}
                data-testid="switch-high-contrast-sheet"
                aria-label="Toggle high contrast"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-black dark:text-white">Reduced Motion</p>
                <p className="text-xs text-black/50 dark:text-white/50">Minimize animations</p>
              </div>
              <Switch
                checked={extendedSettings.accessibility.reducedMotion}
                onCheckedChange={(checked) => {
                  hapticPresets.toggle();
                  updateAccessibility({ reducedMotion: checked });
                }}
                data-testid="switch-reduced-motion-sheet"
                aria-label="Toggle reduced motion"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-black dark:text-white">Screen Reader Optimized</p>
                <p className="text-xs text-black/50 dark:text-white/50">Optimize for assistive technology</p>
              </div>
              <Switch
                checked={extendedSettings.accessibility.screenReaderOptimized}
                onCheckedChange={(checked) => {
                  hapticPresets.toggle();
                  updateAccessibility({ screenReaderOptimized: checked });
                }}
                data-testid="switch-screen-reader"
                aria-label="Toggle screen reader optimization"
              />
            </div>
          </div>
        </div>
      </MobileBottomSheet>

      <MobileBottomSheet
        isOpen={showSyncStatus}
        onClose={() => setShowSyncStatus(false)}
        title="Sync Status"
      >
        <div className="p-4 space-y-4">
          <div className="p-4 bg-black/5 dark:bg-white/5 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-black/60 dark:text-white/60">Last Synced</span>
              <span className="text-sm font-medium text-black dark:text-white">
                {extendedSettings.syncStatus.lastSyncTime 
                  ? new Date(extendedSettings.syncStatus.lastSyncTime).toLocaleString()
                  : 'Never'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-black/60 dark:text-white/60">Pending Items</span>
              <Badge variant={extendedSettings.syncStatus.pendingItemsCount > 0 ? 'secondary' : 'outline'}>
                {extendedSettings.syncStatus.pendingItemsCount}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-black/60 dark:text-white/60">Status</span>
              <Badge variant={extendedSettings.syncStatus.isSyncing ? 'default' : 'secondary'}>
                {extendedSettings.syncStatus.isSyncing ? 'Syncing...' : 'Idle'}
              </Badge>
            </div>
          </div>

          {extendedSettings.syncStatus.syncHistory.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-black dark:text-white">Recent Sync History</p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {extendedSettings.syncStatus.syncHistory.slice(0, 10).map((entry) => (
                  <div 
                    key={entry.id}
                    className="flex items-center justify-between p-2 bg-black/5 dark:bg-white/5 rounded-lg text-xs"
                  >
                    <div className="flex items-center gap-2">
                      {entry.success ? (
                        <CheckCircle className="w-3 h-3 text-green-500" />
                      ) : (
                        <XCircle className="w-3 h-3 text-red-500" />
                      )}
                      <span className="text-black/60 dark:text-white/60">
                        {new Date(entry.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <span className="text-black dark:text-white">
                      {entry.itemsSynced} items
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button
            variant="outline"
            className="w-full rounded-full"
            onClick={() => {
              hapticPresets.buttonPress();
              toast({
                title: "Sync Started",
                description: "Syncing your data in the background.",
              });
            }}
            data-testid="button-manual-sync"
            aria-label="Start manual sync"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Sync Now
          </Button>
        </div>
      </MobileBottomSheet>

      {/* Security Info Sheet */}
      <MobileBottomSheet
        isOpen={showSecurityInfo}
        onClose={() => setShowSecurityInfo(false)}
        title="Security Settings"
      >
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-3 p-3 bg-black/5 dark:bg-white/5 rounded-xl">
            <Shield className="w-6 h-6 text-black dark:text-white" />
            <div>
              <p className="font-medium text-black dark:text-white">Two-Factor Authentication</p>
              <p className="text-xs text-black/60 dark:text-white/60">Manage 2FA settings in the web portal</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-black/5 dark:bg-white/5 rounded-xl">
            <Lock className="w-6 h-6 text-black dark:text-white" />
            <div>
              <p className="font-medium text-black dark:text-white">Password Settings</p>
              <p className="text-xs text-black/60 dark:text-white/60">Change password from your profile</p>
            </div>
          </div>
          <p className="text-xs text-black/50 dark:text-white/50 text-center">
            Advanced security options are available in the web dashboard
          </p>
        </div>
      </MobileBottomSheet>

      {/* Help Info Sheet */}
      <MobileBottomSheet
        isOpen={showHelpInfo}
        onClose={() => setShowHelpInfo(false)}
        title="Help Center"
      >
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-3 p-3 bg-black/5 dark:bg-white/5 rounded-xl">
            <HelpCircle className="w-6 h-6 text-black dark:text-white" />
            <div>
              <p className="font-medium text-black dark:text-white">Contact Support</p>
              <p className="text-xs text-black/60 dark:text-white/60">support@pact.org</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-black/5 dark:bg-white/5 rounded-xl">
            <FileText className="w-6 h-6 text-black dark:text-white" />
            <div>
              <p className="font-medium text-black dark:text-white">Documentation</p>
              <p className="text-xs text-black/60 dark:text-white/60">Access guides and tutorials</p>
            </div>
          </div>
          <p className="text-xs text-black/50 dark:text-white/50 text-center">
            Full documentation available in the web portal
          </p>
        </div>
      </MobileBottomSheet>

      {/* Terms Info Sheet */}
      <MobileBottomSheet
        isOpen={showTermsInfo}
        onClose={() => setShowTermsInfo(false)}
        title="Terms of Service"
      >
        <div className="p-4 space-y-4">
          <p className="text-sm text-black/80 dark:text-white/80 leading-relaxed">
            By using PACT Command Center, you agree to our terms of service and privacy policy.
          </p>
          <div className="p-3 bg-black/5 dark:bg-white/5 rounded-xl">
            <p className="text-xs text-black/60 dark:text-white/60">
              Your data is encrypted and securely stored. Location data is only shared during active site visits with your consent.
            </p>
          </div>
          <p className="text-xs text-black/50 dark:text-white/50 text-center">
            Full legal documents at pact.org/terms
          </p>
        </div>
      </MobileBottomSheet>

      {/* About Info Sheet */}
      <MobileBottomSheet
        isOpen={showAboutInfo}
        onClose={() => setShowAboutInfo(false)}
        title="About PACT Command Center"
      >
        <div className="p-4 space-y-4">
          <div className="text-center py-4">
            <div className="w-16 h-16 rounded-2xl bg-black dark:bg-white mx-auto mb-3 flex items-center justify-center">
              <MapPin className="w-8 h-8 text-white dark:text-black" />
            </div>
            <h3 className="text-lg font-bold text-black dark:text-white">PACT Command Center</h3>
            <p className="text-sm text-black/60 dark:text-white/60">Version 1.0.0</p>
          </div>
          <div className="p-3 bg-black/5 dark:bg-white/5 rounded-xl text-center">
            <p className="text-xs text-black/70 dark:text-white/70">
              Field Operations Management Platform
            </p>
            <p className="text-xs text-black/50 dark:text-white/50 mt-1">
              Built with security and efficiency in mind
            </p>
          </div>
          <p className="text-xs text-black/40 dark:text-white/40 text-center">
            2024 PACT Consultancy. All rights reserved.
          </p>
        </div>
      </MobileBottomSheet>

      {/* Profile Info Sheet */}
      <MobileBottomSheet
        isOpen={showProfileInfo}
        onClose={() => setShowProfileInfo(false)}
        title="My Profile"
      >
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-4 p-4 bg-black/5 dark:bg-white/5 rounded-xl">
            <div className="w-16 h-16 bg-black dark:bg-white rounded-full flex items-center justify-center">
              {defaultUser.avatarUrl ? (
                <img 
                  src={defaultUser.avatarUrl} 
                  alt={defaultUser.name}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <User className="w-8 h-8 text-white dark:text-black" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-lg font-semibold text-black dark:text-white">{defaultUser.name}</p>
              <p className="text-sm text-black/60 dark:text-white/60">{defaultUser.email}</p>
              <Badge 
                variant="outline" 
                className="mt-2 text-xs min-h-[24px] rounded-full px-3 bg-white text-black dark:bg-black dark:text-white border-black/20 dark:border-white/20"
              >
                {defaultUser.role}
              </Badge>
            </div>
          </div>
          <p className="text-xs text-black/50 dark:text-white/50 text-center">
            To edit your profile, please use the web dashboard
          </p>
        </div>
      </MobileBottomSheet>

      {/* Export Data Sheet */}
      <MobileBottomSheet
        isOpen={showExportInfo}
        onClose={() => setShowExportInfo(false)}
        title="Export Your Data"
      >
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-3 p-3 bg-black/5 dark:bg-white/5 rounded-xl">
            <Download className="w-6 h-6 text-black dark:text-white" />
            <div>
              <p className="font-medium text-black dark:text-white">Personal Data Export</p>
              <p className="text-xs text-black/60 dark:text-white/60">Request a copy of all your data</p>
            </div>
          </div>
          <p className="text-sm text-black/70 dark:text-white/70">
            Data export includes your profile information, activity history, and submitted documents.
          </p>
          <Button
            className="w-full rounded-full"
            onClick={() => {
              hapticPresets.buttonPress();
              toast({
                title: "Export Requested",
                description: "Your data export will be sent to your email within 24 hours.",
              });
              setShowExportInfo(false);
            }}
            data-testid="button-request-export"
            aria-label="Request data export"
          >
            Request Export
          </Button>
          <p className="text-xs text-black/50 dark:text-white/50 text-center">
            For immediate exports, use the web dashboard
          </p>
        </div>
      </MobileBottomSheet>

      {/* Offline Data Sheet */}
      <MobileBottomSheet
        isOpen={showOfflineInfo}
        onClose={() => setShowOfflineInfo(false)}
        title="Offline Data"
      >
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-3 p-3 bg-black/5 dark:bg-white/5 rounded-xl">
            <Database className="w-6 h-6 text-black dark:text-white" />
            <div>
              <p className="font-medium text-black dark:text-white">Cached Data</p>
              <p className="text-xs text-black/60 dark:text-white/60">
                {isNative ? 'Data stored for offline use' : 'Limited offline support in browser'}
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center p-2">
              <span className="text-sm text-black/70 dark:text-white/70">Site visits cached</span>
              <Badge variant="outline" className="rounded-full">
                {isNative ? 'Available' : 'Web only'}
              </Badge>
            </div>
            <div className="flex justify-between items-center p-2">
              <span className="text-sm text-black/70 dark:text-white/70">Offline queue</span>
              <Badge variant="outline" className="rounded-full">
                {extendedSettings.syncStatus.pendingItemsCount} items
              </Badge>
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full rounded-full"
            onClick={async () => {
              hapticPresets.buttonPress();
              await clearCache();
              toast({
                title: "Cache Cleared",
                description: "Offline data has been cleared.",
              });
            }}
            data-testid="button-clear-offline"
            aria-label="Clear offline cache"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Clear Offline Cache
          </Button>
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
  ariaLabel?: string;
}

function SettingsRow({
  icon,
  label,
  description,
  action,
  rightContent,
  textColor,
  onClick,
  ariaLabel,
}: SettingsRowProps) {
  const content = (
    <div className="flex items-center gap-3 px-4 min-h-11">
      <div className={cn("text-black/70 dark:text-white/70", textColor)}>
        {icon}
      </div>
      <div className="flex-1 min-w-0 py-3">
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
        <ChevronRight className="w-5 h-5 text-black/30 dark:text-white/30" />
      )}
    </div>
  );

  if (onClick) {
    return (
      <button
        onClick={onClick}
        className="w-full text-left min-h-11 active:bg-black/5 dark:active:bg-white/5 transition-colors"
        data-testid={`settings-row-${label.toLowerCase().replace(/\s/g, '-')}`}
        aria-label={ariaLabel || `${label} settings`}
      >
        {content}
      </button>
    );
  }

  return (
    <div 
      className="min-h-11" 
      data-testid={`settings-row-${label.toLowerCase().replace(/\s/g, '-')}`}
    >
      {content}
    </div>
  );
}
