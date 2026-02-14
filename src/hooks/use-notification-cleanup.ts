import { useEffect, useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSettings } from '@/context/settings/SettingsContext';

const MAX_AGE_DAYS = 90;

export function useNotificationCleanup() {
  const { notificationSettings } = useSettings();
  const [lastAutoDeleteDays, setLastAutoDeleteDays] = useState(notificationSettings.autoDeleteDays);

  const cleanupOldNotifications = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) return;

      const autoDeleteDays = notificationSettings.autoDeleteDays || 30;
      const readCutoff = new Date();
      readCutoff.setDate(readCutoff.getDate() - autoDeleteDays);

      const maxAgeCutoff = new Date();
      maxAgeCutoff.setDate(maxAgeCutoff.getDate() - MAX_AGE_DAYS);

      const { error: readError } = await supabase
        .from('notifications')
        .delete()
        .eq('user_id', user.id)
        .eq('is_read', true)
        .lt('created_at', readCutoff.toISOString());

      if (readError) {
        console.error('Failed to cleanup read notifications:', readError);
      }

      const { error: maxAgeError } = await supabase
        .from('notifications')
        .delete()
        .eq('user_id', user.id)
        .lt('created_at', maxAgeCutoff.toISOString());

      if (maxAgeError) {
        console.error('Failed to cleanup old notifications beyond max age:', maxAgeError);
      } else {
        console.log(`Cleaned up read notifications older than ${autoDeleteDays} days and all notifications older than ${MAX_AGE_DAYS} days`);
      }
    } catch (error) {
      console.error('Error during notification cleanup:', error);
    }
  }, [notificationSettings.autoDeleteDays]);

  const cleanupByCategory = useCallback(async (category: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) return;

      const { error, count } = await supabase
        .from('notifications')
        .delete()
        .eq('user_id', user.id)
        .eq('category', category)
        .eq('is_read', true);

      if (error) {
        console.error(`Failed to cleanup notifications for category "${category}":`, error);
      } else {
        console.log(`Cleaned up ${count ?? 0} read notifications in category "${category}"`);
      }
    } catch (error) {
      console.error('Error during category cleanup:', error);
    }
  }, []);

  const getCleanupStats = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) return { readExpired: 0, maxAgeExpired: 0, total: 0 };

      const autoDeleteDays = notificationSettings.autoDeleteDays || 30;
      const readCutoff = new Date();
      readCutoff.setDate(readCutoff.getDate() - autoDeleteDays);

      const maxAgeCutoff = new Date();
      maxAgeCutoff.setDate(maxAgeCutoff.getDate() - MAX_AGE_DAYS);

      const { count: readExpired } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', true)
        .lt('created_at', readCutoff.toISOString());

      const { count: maxAgeExpired } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .lt('created_at', maxAgeCutoff.toISOString());

      const totalReadExpired = readExpired ?? 0;
      const totalMaxAge = maxAgeExpired ?? 0;
      const total = totalReadExpired + totalMaxAge;

      return { readExpired: totalReadExpired, maxAgeExpired: totalMaxAge, total };
    } catch (error) {
      console.error('Error getting cleanup stats:', error);
      return { readExpired: 0, maxAgeExpired: 0, total: 0 };
    }
  }, [notificationSettings.autoDeleteDays]);

  useEffect(() => {
    cleanupOldNotifications();

    const interval = setInterval(cleanupOldNotifications, 24 * 60 * 60 * 1000);

    return () => clearInterval(interval);
  }, [cleanupOldNotifications]);

  useEffect(() => {
    if (lastAutoDeleteDays !== notificationSettings.autoDeleteDays) {
      setLastAutoDeleteDays(notificationSettings.autoDeleteDays);
      cleanupOldNotifications();
    }
  }, [notificationSettings.autoDeleteDays, lastAutoDeleteDays, cleanupOldNotifications]);

  return { cleanupOldNotifications, cleanupByCategory, getCleanupStats };
}

export default useNotificationCleanup;
