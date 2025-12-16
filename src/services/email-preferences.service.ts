import { supabase } from '@/integrations/supabase/client';
import { 
  EmailPreferences, 
  EmailPreferenceCategory, 
  DEFAULT_EMAIL_PREFERENCES 
} from '@/types/notification';

const PREFERENCES_STORAGE_KEY = 'pact_email_preferences';

export const EmailPreferencesService = {
  async getUserPreferences(userId: string): Promise<EmailPreferences> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('email_preferences')
        .eq('id', userId)
        .single();

      if (error || !data?.email_preferences) {
        return this.getDefaultPreferences(userId);
      }

      return {
        userId,
        preferences: {
          ...DEFAULT_EMAIL_PREFERENCES,
          ...(data.email_preferences as EmailPreferences['preferences']),
        },
        updatedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error('[EMAIL-PREFS] Failed to get preferences:', error);
      return this.getDefaultPreferences(userId);
    }
  },

  getDefaultPreferences(userId: string): EmailPreferences {
    return {
      userId,
      preferences: { ...DEFAULT_EMAIL_PREFERENCES },
      updatedAt: new Date().toISOString(),
    };
  },

  async updatePreferences(
    userId: string, 
    updates: Partial<EmailPreferences['preferences']>
  ): Promise<boolean> {
    try {
      const current = await this.getUserPreferences(userId);
      const newPreferences = {
        ...current.preferences,
        ...updates,
      };

      const { error } = await supabase
        .from('profiles')
        .update({ 
          email_preferences: newPreferences,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (error) {
        console.error('[EMAIL-PREFS] Failed to update preferences:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('[EMAIL-PREFS] Update error:', error);
      return false;
    }
  },

  async toggleCategory(
    userId: string,
    category: EmailPreferenceCategory,
    channel: 'email' | 'inApp',
    enabled: boolean
  ): Promise<boolean> {
    const prefs = await this.getUserPreferences(userId);
    const categoryPrefs = prefs.preferences[category] || {
      enabled: true,
      inApp: true,
      email: true,
    };

    return this.updatePreferences(userId, {
      [category]: {
        ...categoryPrefs,
        [channel]: enabled,
      },
    });
  },

  async shouldSendEmail(
    userId: string,
    category: EmailPreferenceCategory
  ): Promise<boolean> {
    try {
      const prefs = await this.getUserPreferences(userId);
      const categoryPref = prefs.preferences[category];
      
      if (!categoryPref) {
        return true;
      }

      return categoryPref.enabled && categoryPref.email;
    } catch (error) {
      console.error('[EMAIL-PREFS] Check error:', error);
      return true;
    }
  },

  async shouldShowInApp(
    userId: string,
    category: EmailPreferenceCategory
  ): Promise<boolean> {
    try {
      const prefs = await this.getUserPreferences(userId);
      const categoryPref = prefs.preferences[category];
      
      if (!categoryPref) {
        return true;
      }

      return categoryPref.enabled && categoryPref.inApp;
    } catch (error) {
      console.error('[EMAIL-PREFS] Check error:', error);
      return true;
    }
  },

  getCategoryLabel(category: EmailPreferenceCategory): { en: string; ar: string } {
    const labels: Record<EmailPreferenceCategory, { en: string; ar: string }> = {
      mmp_notifications: { 
        en: 'MMP Notifications', 
        ar: 'إشعارات خطة المراقبة الشهرية' 
      },
      site_notifications: { 
        en: 'Site Notifications', 
        ar: 'إشعارات المواقع' 
      },
      task_reminders: { 
        en: 'Task Reminders', 
        ar: 'تذكيرات المهام' 
      },
      permit_alerts: { 
        en: 'Permit Alerts', 
        ar: 'تنبيهات التصاريح' 
      },
      financial_updates: { 
        en: 'Financial Updates', 
        ar: 'التحديثات المالية' 
      },
      weekly_summary: { 
        en: 'Weekly Summary', 
        ar: 'الملخص الأسبوعي' 
      },
      system_updates: { 
        en: 'System Updates', 
        ar: 'تحديثات النظام' 
      },
    };
    return labels[category];
  },

  getAllCategories(): EmailPreferenceCategory[] {
    return [
      'mmp_notifications',
      'site_notifications',
      'task_reminders',
      'permit_alerts',
      'financial_updates',
      'weekly_summary',
      'system_updates',
    ];
  },
};

export default EmailPreferencesService;
