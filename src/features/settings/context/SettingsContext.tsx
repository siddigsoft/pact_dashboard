import React, { createContext, useContext, useMemo, ReactNode, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/shared/hooks/use-toast';
import { useUser } from '../user/UserContext';
import {
  upsertUserSettings,
  upsertDataVisibilitySettings,
  upsertDashboardSettings,
} from '@/features/settings/repository/settingsRepository';
import { useRealtimeResource } from '@/shared/hooks/useRealtimeResource';
import {
  useUserSettingsQuery,
  useDataVisibilitySettingsQuery,
  useDashboardSettingsQuery,
  settingsQueryKeys,
} from './settingsQueries';

// Define types for settings tables
export type UserSettings = {
  id?: string;
  user_id?: string;
  settings?: {
    theme?: 'light' | 'dark' | 'system';
    defaultPage?: string;
    language?: string;
    [key: string]: any;
  };
  last_updated?: string;
};

export type QuietHoursSettings = {
  enabled: boolean;
  startHour: number;
  endHour: number;
};

export type NotificationSettings = {
  enabled: boolean;
  email: boolean;
  sound: boolean;
  browserPush: boolean;
  vibration: boolean;
  categories: {
    assignments: boolean;
    approvals: boolean;
    financial: boolean;
    team: boolean;
    system: boolean;
  };
  quietHours: QuietHoursSettings;
  frequency: 'instant' | 'hourly' | 'daily';
  autoDeleteDays: number | null;
};

export type AppearanceSettings = {
  darkMode: boolean;
  theme: string;
};


export type DataVisibilitySettings = {
  id?: string;
  user_id?: string;
  options?: {
    showSensitiveData?: boolean;
    shareLocationWithTeam?: boolean;
    displayPersonalMetrics?: boolean;
    [key: string]: any;
  };
  last_updated?: string;
};

export type DashboardSettings = {
  id?: string;
  user_id?: string;
  layout?: {
    [key: string]: any;
  };
  widget_order?: string[];
  last_updated?: string;
};

import { MenuPreferences, DashboardPreferences, DEFAULT_MENU_PREFERENCES, DEFAULT_DASHBOARD_PREFERENCES, DashboardZone, ROLE_DEFAULT_ZONES } from '@/types/user-preferences';

type SettingsContextType = {
  userSettings: UserSettings | null;
  dataVisibilitySettings: DataVisibilitySettings | null;
  dashboardSettings: DashboardSettings | null;
  notificationSettings: NotificationSettings;
  appearanceSettings: AppearanceSettings;
  menuPreferences: MenuPreferences;
  dashboardPreferences: DashboardPreferences;
  updateUserSettings: (settings: Partial<UserSettings['settings']>) => Promise<void>;
  updateNotificationSettings: (settings: NotificationSettings) => Promise<void>;
  updateAppearanceSettings: (settings: AppearanceSettings) => Promise<void>;
  updateDataVisibilitySettings: (settings: Partial<DataVisibilitySettings>) => Promise<void>;
  updateDashboardSettings: (settings: Partial<DashboardSettings>) => Promise<void>;
  updateMenuPreferences: (prefs: Partial<MenuPreferences>) => Promise<void>;
  updateDashboardPreferences: (prefs: Partial<DashboardPreferences>) => Promise<void>;
  getDefaultZoneForRole: (role: string) => DashboardZone;
  loading: boolean;
  error: string | null;
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  email: false,
  sound: false,
  browserPush: false,
  vibration: false,
  categories: {
    assignments: true,
    approvals: true,
    financial: true,
    team: true,
    system: true,
  },
  quietHours: {
    enabled: false,
    startHour: 22,
    endHour: 7,
  },
  frequency: 'instant',
  autoDeleteDays: 30,
};

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { currentUser } = useUser();
  const userId = currentUser?.id;

  const { data: userSettings, isLoading: loadingUser, error: userError } = useUserSettingsQuery(userId);
  const { data: dataVisibilitySettings, isLoading: loadingVisibility } = useDataVisibilitySettingsQuery(userId);
  const { data: dashboardSettings, isLoading: loadingDashboard } = useDashboardSettingsQuery(userId);

  const loading = loadingUser || loadingVisibility || loadingDashboard;
  const error = userError ? 'Failed to fetch user settings' : null;

  const notificationSettings = useMemo<NotificationSettings>(() => {
    const savedPrefs = userSettings?.settings?.notificationPreferences;
    if (!savedPrefs) return DEFAULT_NOTIFICATION_SETTINGS;
    return {
      enabled: savedPrefs.enabled ?? DEFAULT_NOTIFICATION_SETTINGS.enabled,
      email: savedPrefs.email ?? DEFAULT_NOTIFICATION_SETTINGS.email,
      sound: savedPrefs.sound ?? DEFAULT_NOTIFICATION_SETTINGS.sound,
      browserPush: savedPrefs.browserPush ?? DEFAULT_NOTIFICATION_SETTINGS.browserPush,
      vibration: savedPrefs.vibration ?? DEFAULT_NOTIFICATION_SETTINGS.vibration,
      categories: {
        assignments: savedPrefs.categories?.assignments ?? DEFAULT_NOTIFICATION_SETTINGS.categories.assignments,
        approvals: savedPrefs.categories?.approvals ?? DEFAULT_NOTIFICATION_SETTINGS.categories.approvals,
        financial: savedPrefs.categories?.financial ?? DEFAULT_NOTIFICATION_SETTINGS.categories.financial,
        team: savedPrefs.categories?.team ?? DEFAULT_NOTIFICATION_SETTINGS.categories.team,
        system: savedPrefs.categories?.system ?? DEFAULT_NOTIFICATION_SETTINGS.categories.system,
      },
      quietHours: {
        enabled: savedPrefs.quietHours?.enabled ?? DEFAULT_NOTIFICATION_SETTINGS.quietHours.enabled,
        startHour: savedPrefs.quietHours?.startHour ?? DEFAULT_NOTIFICATION_SETTINGS.quietHours.startHour,
        endHour: savedPrefs.quietHours?.endHour ?? DEFAULT_NOTIFICATION_SETTINGS.quietHours.endHour,
      },
      frequency: savedPrefs.frequency ?? DEFAULT_NOTIFICATION_SETTINGS.frequency,
      autoDeleteDays: savedPrefs.autoDeleteDays ?? DEFAULT_NOTIFICATION_SETTINGS.autoDeleteDays,
    };
  }, [userSettings?.settings?.notificationPreferences]);

  const appearanceSettings = useMemo<AppearanceSettings>(() => {
    const theme = userSettings?.settings?.theme;
    if (!theme) return { darkMode: false, theme: 'default' };
    return {
      darkMode: theme === 'dark',
      theme: theme === 'system' ? 'default' : theme,
    };
  }, [userSettings?.settings?.theme]);

  const menuPreferences = useMemo<MenuPreferences>(
    () => ({ ...DEFAULT_MENU_PREFERENCES, ...userSettings?.settings?.menuPreferences }),
    [userSettings?.settings?.menuPreferences]
  );

  const dashboardPreferences = useMemo<DashboardPreferences>(
    () => ({ ...DEFAULT_DASHBOARD_PREFERENCES, ...userSettings?.settings?.dashboardPreferences }),
    [userSettings?.settings?.dashboardPreferences]
  );

  const fetchSettings = useCallback(() => {
    if (!userId) return;
    queryClient.invalidateQueries({ queryKey: settingsQueryKeys.userSettings(userId) });
    queryClient.invalidateQueries({ queryKey: settingsQueryKeys.dataVisibility(userId) });
    queryClient.invalidateQueries({ queryKey: settingsQueryKeys.dashboard(userId) });
  }, [userId, queryClient]);

  useRealtimeResource({
    configs: [
      { table: 'user_settings', filter: userId ? `user_id=eq.${userId}` : undefined },
      { table: 'data_visibility_settings', filter: userId ? `user_id=eq.${userId}` : undefined },
      { table: 'dashboard_settings', filter: userId ? `user_id=eq.${userId}` : undefined },
    ],
    onRefresh: fetchSettings,
    enabled: !!userId,
  });
  
  const updateUserSettings = async (settings: Partial<UserSettings['settings']>) => {
    if (!currentUser?.id) return;
    try {
      const updatedSettings = { ...(userSettings?.settings || {}), ...settings };
      await upsertUserSettings(currentUser.id, userSettings?.id, updatedSettings);
      queryClient.invalidateQueries({ queryKey: settingsQueryKeys.userSettings(currentUser.id) });
      toast({ title: 'Settings updated', description: 'Your settings have been saved successfully', variant: 'success' });
    } catch (err: any) {
      console.error('Error updating user settings:', err);
      toast({ title: 'Settings update failed', description: err?.message || 'There was a problem saving your settings', variant: 'destructive' });
    }
  };
  
  const updateNotificationSettings = async (settings: NotificationSettings) => {
    await updateUserSettings({ notificationPreferences: settings });
  };
  
  const updateAppearanceSettings = async (settings: AppearanceSettings) => {
    const theme = settings.darkMode ? 'dark' : 'light';
    await updateUserSettings({ theme });
  };
  
  
  // Update data visibility settings
  const updateDataVisibilitySettings = async (settings: Partial<DataVisibilitySettings>) => {
    if (!currentUser?.id) {
      console.error('[Settings] Cannot update visibility settings: no current user');
      return;
    }
    try {
      const newOptions = { ...(dataVisibilitySettings?.options || {}), ...(settings.options || {}) };
      await upsertDataVisibilitySettings(currentUser.id, dataVisibilitySettings?.id, newOptions);
      queryClient.invalidateQueries({ queryKey: settingsQueryKeys.dataVisibility(currentUser.id) });
      toast({ title: 'Visibility settings updated', description: 'Your data visibility settings have been saved successfully', variant: 'success' });
    } catch (err: any) {
      console.error('Error updating data visibility settings:', err);
      toast({ title: 'Settings update failed', description: err.message || 'There was a problem saving your visibility settings', variant: 'destructive' });
    }
  };

  // Update dashboard settings
  const updateDashboardSettings = async (settings: Partial<DashboardSettings>) => {
    if (!currentUser?.id) return;
    try {
      const layout = settings.layout || dashboardSettings?.layout;
      const widgetOrder = settings.widget_order || dashboardSettings?.widget_order || [];
      await upsertDashboardSettings(currentUser.id, dashboardSettings?.id, layout, widgetOrder);
      queryClient.invalidateQueries({ queryKey: settingsQueryKeys.dashboard(currentUser.id) });
      toast({ title: 'Dashboard settings updated', description: 'Your dashboard layout has been saved successfully', variant: 'success' });
    } catch (err: any) {
      console.error('Error updating dashboard settings:', err);
      toast({ title: 'Settings update failed', description: err.message || 'There was a problem saving your dashboard settings', variant: 'destructive' });
    }
  };

  const updateMenuPreferences = async (prefs: Partial<MenuPreferences>) => {
    const updated = { ...menuPreferences, ...prefs };
    await updateUserSettings({ menuPreferences: updated });
  };

  const updateDashboardPreferences = async (prefs: Partial<DashboardPreferences>) => {
    const updated = { ...dashboardPreferences, ...prefs };
    await updateUserSettings({ dashboardPreferences: updated });
  };

  const getDefaultZoneForRole = (role: string): DashboardZone => {
    const normalizedRole = role.toLowerCase();
    return ROLE_DEFAULT_ZONES[normalizedRole] || 'operations';
  };
  
  return (
    <SettingsContext.Provider
      value={{
        userSettings,
        dataVisibilitySettings,
        dashboardSettings,
        notificationSettings,
        appearanceSettings,
        menuPreferences,
        dashboardPreferences,
        updateUserSettings,
        updateNotificationSettings,
        updateAppearanceSettings,
        updateDataVisibilitySettings,
        updateDashboardSettings,
        updateMenuPreferences,
        updateDashboardPreferences,
        getDefaultZoneForRole,
        loading,
        error
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};

// Safe hook that returns null if outside provider - use for optional settings access
export const useSettingsSafe = () => {
  const context = useContext(SettingsContext);
  return context ?? null;
};
