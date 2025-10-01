
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '../user/UserContext';

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

export type NotificationSettings = {
  enabled: boolean;
  email: boolean;
  sound: boolean;
};

export type AppearanceSettings = {
  darkMode: boolean;
  theme: string;
};

export type WalletSettings = {
  id?: string;
  user_id?: string;
  notification_prefs?: {
    onPayment?: boolean;
    onWithdrawal?: boolean;
    lowBalance?: boolean;
    [key: string]: any;
  };
  auto_withdraw?: boolean;
  last_updated?: string;
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

type SettingsContextType = {
  userSettings: UserSettings | null;
  walletSettings: WalletSettings | null;
  dataVisibilitySettings: DataVisibilitySettings | null;
  dashboardSettings: DashboardSettings | null;
  notificationSettings: NotificationSettings;
  appearanceSettings: AppearanceSettings;
  updateUserSettings: (settings: Partial<UserSettings['settings']>) => Promise<void>;
  updateNotificationSettings: (settings: NotificationSettings) => Promise<void>;
  updateAppearanceSettings: (settings: AppearanceSettings) => Promise<void>;
  updateWalletSettings: (settings: Partial<WalletSettings>) => Promise<void>;
  updateDataVisibilitySettings: (settings: Partial<DataVisibilitySettings>) => Promise<void>;
  updateDashboardSettings: (settings: Partial<DashboardSettings>) => Promise<void>;
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
  const [walletSettings, setWalletSettings] = useState<WalletSettings | null>(null);
  const [dataVisibilitySettings, setDataVisibilitySettings] = useState<DataVisibilitySettings | null>(null);
  const [dashboardSettings, setDashboardSettings] = useState<DashboardSettings | null>(null);
  
  // Frontend-only settings that we'll eventually migrate to the database
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>({
    enabled: true,
    email: false,
    sound: false,
  });
  const [appearanceSettings, setAppearanceSettings] = useState<AppearanceSettings>({
    darkMode: false,
    theme: 'default',
  });

  // Fetch settings from the database when the component mounts
  useEffect(() => {
    if (!currentUser?.id) return;

    const fetchSettings = async () => {
      setLoading(true);
      setError(null);
      try {
        // user_settings
        const { data: userData, error: userError } = await supabase
          .from('user_settings')
          .select('*')
          .eq('user_id', currentUser.id)
          .maybeSingle();

        if (userError) {
          console.error('Error fetching user settings:', userError);
          setError('Failed to fetch user settings');
        }
        if (userData) {
          setUserSettings(userData);
          if (userData.settings?.theme) {
            setAppearanceSettings(prev => ({
              ...prev,
              darkMode: userData.settings.theme === 'dark',
              theme: userData.settings.theme === 'system' ? 'default' : userData.settings.theme,
            }));
          }
        }

        // wallet_settings
        const { data: walletData, error: walletError } = await supabase
          .from('wallet_settings')
          .select('*')
          .eq('user_id', currentUser.id)
          .maybeSingle();
        if (walletError) {
          console.error('Error fetching wallet settings:', walletError);
        }
        if (walletData) setWalletSettings(walletData);

        // data_visibility_settings
        const { data: visibilityData, error: visibilityError } = await supabase
          .from('data_visibility_settings')
          .select('*')
          .eq('user_id', currentUser.id)
          .maybeSingle();
        if (visibilityError) {
          console.error('Error fetching data visibility settings:', visibilityError);
        }
        if (visibilityData) setDataVisibilitySettings(visibilityData);

        // dashboard_settings
        const { data: dashboardData, error: dashboardError } = await supabase
          .from('dashboard_settings')
          .select('*')
          .eq('user_id', currentUser.id)
          .maybeSingle();
        if (dashboardError) {
          console.error('Error fetching dashboard settings:', dashboardError);
        }
        if (dashboardData) setDashboardSettings(dashboardData);
      } catch (err) {
        console.error('Error in fetchSettings:', err);
        setError('An unexpected error occurred while fetching settings');
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, [currentUser?.id]);
  
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
  
  // Update notification settings (currently frontend-only)
  const updateNotificationSettings = async (settings: NotificationSettings) => {
    setNotificationSettings(settings);
    // We'll update user settings in the database
    await updateUserSettings({ notificationPreferences: settings });
  };
  
  // Update appearance settings (currently frontend-only)
  const updateAppearanceSettings = async (settings: AppearanceSettings) => {
    setAppearanceSettings(settings);
    // Map to the database theme format
    const theme = settings.darkMode ? 'dark' : 'light';
    await updateUserSettings({ theme });
  };
  
  // Update wallet settings
  const updateWalletSettings = async (settings: Partial<WalletSettings>) => {
    if (!currentUser?.id) return;
    
    try {
      // First check if the user already has wallet settings
      if (walletSettings?.id) {
        // Update existing settings
        const { error } = await supabase
          .from('wallet_settings')
          .update({
            notification_prefs: settings.notification_prefs || walletSettings.notification_prefs,
            auto_withdraw: settings.auto_withdraw !== undefined ? settings.auto_withdraw : walletSettings.auto_withdraw
          })
          .eq('id', walletSettings.id);
        
        if (error) throw error;
      } else {
        // Create new wallet settings
        const { error } = await supabase
          .from('wallet_settings')
          .insert([{ 
            user_id: currentUser.id, 
            notification_prefs: settings.notification_prefs || {},
            auto_withdraw: settings.auto_withdraw || false
          }]);
        
        if (error) throw error;
      }
      
      // Update local state
      setWalletSettings(prev => ({
        ...prev,
        ...settings,
        user_id: currentUser.id
      }));
      
      toast({
        title: "Wallet settings updated",
        description: "Your wallet settings have been saved successfully",
        variant: "success",
      });
    } catch (err: any) {
      console.error('Error updating wallet settings:', err);
      toast({
        title: "Settings update failed",
        description: err.message || "There was a problem saving your wallet settings",
        variant: "destructive",
      });
    }
  };
  
  // Update data visibility settings
  const updateDataVisibilitySettings = async (settings: Partial<DataVisibilitySettings>) => {
    if (!currentUser?.id) return;
    
    try {
      // First check if the user already has data visibility settings
      if (dataVisibilitySettings?.id) {
        // Update existing settings
        const { error } = await supabase
          .from('data_visibility_settings')
          .update({
            options: {
              ...dataVisibilitySettings.options,
              ...(settings.options || {})
            }
          })
          .eq('id', dataVisibilitySettings.id);
        
        if (error) throw error;
      } else {
        // Create new data visibility settings
        const { error } = await supabase
          .from('data_visibility_settings')
          .insert([{ 
            user_id: currentUser.id, 
            options: settings.options || {}
          }]);
        
        if (error) throw error;
      }
      
      // Update local state
      setDataVisibilitySettings(prev => ({
        ...prev,
        options: {
          ...(prev?.options || {}),
          ...(settings.options || {})
        },
        user_id: currentUser.id
      }));
      
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
  
  return (
    <SettingsContext.Provider
      value={{
        userSettings,
        walletSettings,
        dataVisibilitySettings,
        dashboardSettings,
        notificationSettings,
        appearanceSettings,
        updateUserSettings,
        updateNotificationSettings,
        updateAppearanceSettings,
        updateWalletSettings,
        updateDataVisibilitySettings,
        updateDashboardSettings,
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
