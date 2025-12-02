import { useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSettings } from '@/context/settings/SettingsContext';

export function useNotificationCleanup() {
  const { notificationSettings } = useSettings();

  const cleanupOldNotifications = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) return;

      const autoDeleteDays = notificationSettings.autoDeleteDays || 30;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - autoDeleteDays);

      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('user_id', user.id)
        .eq('is_read', true)
        .lt('created_at', cutoffDate.toISOString());

      if (error) {
        console.error('Failed to cleanup old notifications:', error);
      } else {
        console.log(`Cleaned up notifications older than ${autoDeleteDays} days`);
      }
    } catch (error) {
      console.error('Error during notification cleanup:', error);
    }
  }, [notificationSettings.autoDeleteDays]);

  useEffect(() => {
    cleanupOldNotifications();

    const interval = setInterval(cleanupOldNotifications, 24 * 60 * 60 * 1000);

    return () => clearInterval(interval);
  }, [cleanupOldNotifications]);

  return { cleanupOldNotifications };
}

export default useNotificationCleanup;
