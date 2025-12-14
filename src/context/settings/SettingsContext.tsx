
import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '../user/UserContext';
import { useRealtimeResource } from '@/hooks/useRealtimeResource';

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

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { toast } = useToast();
  const { currentUser } = useUser();
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [dataVisibilitySettings, setDataVisibilitySettings] = useState<DataVisibilitySettings | null>(null);
  const [dashboardSettings, setDashboardSettings] = useState<DashboardSettings | null>(null);
  
  const defaultNotificationSettings: NotificationSettings = {
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
  
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>(defaultNotificationSettings);
  const [appearanceSettings, setAppearanceSettings] = useState<AppearanceSettings>({
    darkMode: false,
    theme: 'default',
  });
  
  const [menuPreferences, setMenuPreferences] = useState<MenuPreferences>(DEFAULT_MENU_PREFERENCES);
  const [dashboardPreferences, setDashboardPreferences] = useState<DashboardPreferences>(DEFAULT_DASHBOARD_PREFERENCES);

  const fetchSettings = useCallback(async () => {
    if (!currentUser?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // user_settings - use limit(1) to handle duplicates gracefully
      const { data: userDataArray, error: userError } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', currentUser.id)
        .limit(1);

      if (userError) {
        console.error('Error fetching user settings:', userError);
        setError('Failed to fetch user settings');
      }
      const userData = userDataArray?.[0];
      if (userData) {
        setUserSettings(userData);
        if (userData.settings?.theme) {
          setAppearanceSettings(prev => ({
            ...prev,
            darkMode: userData.settings.theme === 'dark',
            theme: userData.settings.theme === 'system' ? 'default' : userData.settings.theme,
          }));
        }
        if (userData.settings?.notificationPreferences) {
          const savedPrefs = userData.settings.notificationPreferences;
          setNotificationSettings({
            enabled: savedPrefs.enabled ?? defaultNotificationSettings.enabled,
            email: savedPrefs.email ?? defaultNotificationSettings.email,
            sound: savedPrefs.sound ?? defaultNotificationSettings.sound,
            browserPush: savedPrefs.browserPush ?? defaultNotificationSettings.browserPush,
            vibration: savedPrefs.vibration ?? defaultNotificationSettings.vibration,
            categories: {
              assignments: savedPrefs.categories?.assignments ?? defaultNotificationSettings.categories.assignments,
              approvals: savedPrefs.categories?.approvals ?? defaultNotificationSettings.categories.approvals,
              financial: savedPrefs.categories?.financial ?? defaultNotificationSettings.categories.financial,
              team: savedPrefs.categories?.team ?? defaultNotificationSettings.categories.team,
              system: savedPrefs.categories?.system ?? defaultNotificationSettings.categories.system,
            },
            quietHours: {
              enabled: savedPrefs.quietHours?.enabled ?? defaultNotificationSettings.quietHours.enabled,
              startHour: savedPrefs.quietHours?.startHour ?? defaultNotificationSettings.quietHours.startHour,
              endHour: savedPrefs.quietHours?.endHour ?? defaultNotificationSettings.quietHours.endHour,
            },
            frequency: savedPrefs.frequency ?? defaultNotificationSettings.frequency,
            autoDeleteDays: savedPrefs.autoDeleteDays ?? defaultNotificationSettings.autoDeleteDays,
          });
        }
        if (userData.settings?.menuPreferences) {
          setMenuPreferences({ ...DEFAULT_MENU_PREFERENCES, ...userData.settings.menuPreferences });
        }
        if (userData.settings?.dashboardPreferences) {
          setDashboardPreferences({ ...DEFAULT_DASHBOARD_PREFERENCES, ...userData.settings.dashboardPreferences });
        }
      }


      // data_visibility_settings - use limit(1) to handle duplicates gracefully
      const { data: visibilityDataArray, error: visibilityError } = await supabase
        .from('data_visibility_settings')
        .select('*')
        .eq('user_id', currentUser.id)
        .limit(1);
      if (visibilityError) {
        console.error('Error fetching data visibility settings:', visibilityError);
      }
      const visibilityData = visibilityDataArray?.[0];
      if (visibilityData) setDataVisibilitySettings(visibilityData);

      // dashboard_settings - use limit(1) to handle duplicates gracefully
      const { data: dashboardDataArray, error: dashboardError } = await supabase
        .from('dashboard_settings')
        .select('*')
        .eq('user_id', currentUser.id)
        .limit(1);
      if (dashboardError) {
        console.error('Error fetching dashboard settings:', dashboardError);
      }
      const dashboardData = dashboardDataArray?.[0];
      if (dashboardData) setDashboardSettings(dashboardData);
    } catch (err) {
      console.error('Error in fetchSettings:', err);
      setError('An unexpected error occurred while fetching settings');
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id]);

  // Fetch settings from the database when the component mounts
  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useRealtimeResource({
    configs: [
      { table: 'user_settings', filter: currentUser?.id ? `user_id=eq.${currentUser.id}` : undefined },
      { table: 'data_visibility_settings', filter: currentUser?.id ? `user_id=eq.${currentUser.id}` : undefined },
      { table: 'dashboard_settings', filter: currentUser?.id ? `user_id=eq.${currentUser.id}` : undefined },
    ],
    onRefresh: fetchSettings,
    enabled: !!currentUser?.id,
  });
  
  const updateUserSettings = async (settings: Partial<UserSettings['settings']>) => {
    if (!currentUser?.id) return;
    try {
      const updatedSettings = {
        ...(userSettings?.settings || {}),
        ...settings,
      };

      if (userSettings?.id) {
        const { error } = await supabase
          .from('user_settings')
          .update({ settings: updatedSettings })
          .eq('id', userSettings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_settings')
          .insert([{ user_id: currentUser.id, settings: updatedSettings }]);
        if (error) throw error;
      }

      setUserSettings(prev => ({
        ...(prev || {} as any),
        settings: updatedSettings,
        user_id: currentUser.id,
      }));

      toast({
        title: 'Settings updated',
        description: 'Your settings have been saved successfully',
        variant: 'success',
      });
    } catch (err: any) {
      console.error('Error updating user settings:', err);
      toast({
        title: 'Settings update failed',
        description: err?.message || 'There was a problem saving your settings',
        variant: 'destructive',
      });
    }
  };
  
  const updateNotificationSettings = async (settings: NotificationSettings) => {
    setNotificationSettings(settings);
    await updateUserSettings({ notificationPreferences: settings });
  };
  
  // Update appearance settings (currently frontend-only)
  const updateAppearanceSettings = async (settings: AppearanceSettings) => {
    setAppearanceSettings(settings);
    // Map to the database theme format
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
      const newOptions = {
        ...(dataVisibilitySettings?.options || {}),
        ...(settings.options || {})
      };
      
      // First check if the user already has data visibility settings
      if (dataVisibilitySettings?.id) {
        // Update existing settings
        const { error } = await supabase
          .from('data_visibility_settings')
          .update({
            options: newOptions
          })
          .eq('id', dataVisibilitySettings.id);
        
        if (error) throw error;
        
        // Update local state
        setDataVisibilitySettings(prev => ({
          ...prev,
          options: newOptions,
          user_id: currentUser.id
        }));
      } else {
        // Create new data visibility settings and get the ID back
        const { data: insertedData, error } = await supabase
          .from('data_visibility_settings')
          .insert([{ 
            user_id: currentUser.id, 
            options: newOptions
          }])
          .select()
          .single();
        
        if (error) throw error;
        
        // Update local state with the new record including ID
        setDataVisibilitySettings({
          id: insertedData.id,
          user_id: currentUser.id,
          options: newOptions
        });
      }
      
      toast({
        title: "Visibility settings updated",
        description: "Your data visibility settings have been saved successfully",
        variant: "success",
      });
    } catch (err: any) {
      console.error('Error updating data visibility settings:', err);
      toast({
        title: "Settings update failed",
        description: err.message || "There was a problem saving your visibility settings",
        variant: "destructive",
      });
    }
  };
  
  // Update dashboard settings
  const updateDashboardSettings = async (settings: Partial<DashboardSettings>) => {
    if (!currentUser?.id) return;
    
    try {
      // First check if the user already has dashboard settings
      if (dashboardSettings?.id) {
        // Update existing settings
        const { error } = await supabase
          .from('dashboard_settings')
          .update({
            layout: settings.layout || dashboardSettings.layout,
            widget_order: settings.widget_order || dashboardSettings.widget_order
          })
          .eq('id', dashboardSettings.id);
        
        if (error) throw error;
      } else {
        // Create new dashboard settings
        const { error } = await supabase
          .from('dashboard_settings')
          .insert([{ 
            user_id: currentUser.id, 
            layout: settings.layout || {},
            widget_order: settings.widget_order || []
          }]);
        
        if (error) throw error;
      }
      
      // Update local state
      setDashboardSettings(prev => ({
        ...prev,
        ...settings,
        user_id: currentUser.id
      }));
      
      toast({
        title: "Dashboard settings updated",
        description: "Your dashboard layout has been saved successfully",
        variant: "success",
      });
    } catch (err: any) {
      console.error('Error updating dashboard settings:', err);
      toast({
        title: "Settings update failed",
        description: err.message || "There was a problem saving your dashboard settings",
        variant: "destructive",
      });
    }
  };

  const updateMenuPreferences = async (prefs: Partial<MenuPreferences>) => {
    const updated = { ...menuPreferences, ...prefs };
    setMenuPreferences(updated);
    await updateUserSettings({ menuPreferences: updated });
  };

  const updateDashboardPreferences = async (prefs: Partial<DashboardPreferences>) => {
    const updated = { ...dashboardPreferences, ...prefs };
    setDashboardPreferences(updated);
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
