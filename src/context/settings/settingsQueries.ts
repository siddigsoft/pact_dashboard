/**
 * React Query keys and hooks for Settings data.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type {
  UserSettings,
  DataVisibilitySettings,
  DashboardSettings,
} from './settingsTypes';

export const settingsQueryKeys = {
  all: ['settings'] as const,
  userSettings: (userId: string) => [...settingsQueryKeys.all, 'user', userId] as const,
  dataVisibility: (userId: string) => [...settingsQueryKeys.all, 'visibility', userId] as const,
  dashboard: (userId: string) => [...settingsQueryKeys.all, 'dashboard', userId] as const,
};

async function fetchUserSettings(userId: string): Promise<UserSettings | null> {
  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .limit(1);

  if (error) throw error;
  return data?.[0] ?? null;
}

async function fetchDataVisibilitySettings(userId: string): Promise<DataVisibilitySettings | null> {
  const { data, error } = await supabase
    .from('data_visibility_settings')
    .select('*')
    .eq('user_id', userId)
    .limit(1);

  if (error) throw error;
  return data?.[0] ?? null;
}

async function fetchDashboardSettings(userId: string): Promise<DashboardSettings | null> {
  const { data, error } = await supabase
    .from('dashboard_settings')
    .select('*')
    .eq('user_id', userId)
    .limit(1);

  if (error) throw error;
  return data?.[0] ?? null;
}

const STALE_MS = 5 * 60 * 1000; // 5 minutes

export function useUserSettingsQuery(userId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: settingsQueryKeys.userSettings(userId ?? ''),
    queryFn: () => fetchUserSettings(userId!),
    staleTime: STALE_MS,
    enabled: !!userId && enabled,
    placeholderData: (prev) => prev,
  });
}

export function useDataVisibilitySettingsQuery(userId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: settingsQueryKeys.dataVisibility(userId ?? ''),
    queryFn: () => fetchDataVisibilitySettings(userId!),
    staleTime: STALE_MS,
    enabled: !!userId && enabled,
    placeholderData: (prev) => prev,
  });
}

export function useDashboardSettingsQuery(userId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: settingsQueryKeys.dashboard(userId ?? ''),
    queryFn: () => fetchDashboardSettings(userId!),
    staleTime: STALE_MS,
    enabled: !!userId && enabled,
    placeholderData: (prev) => prev,
  });
}

export function useInvalidateSettingsQueries() {
  const queryClient = useQueryClient();
  return {
    invalidateAll: (userId?: string) =>
      userId
        ? queryClient.invalidateQueries({ queryKey: settingsQueryKeys.userSettings(userId) })
        : queryClient.invalidateQueries({ queryKey: settingsQueryKeys.all }),
    invalidateUserSettings: (userId: string) =>
      queryClient.invalidateQueries({ queryKey: settingsQueryKeys.userSettings(userId) }),
    invalidateDataVisibility: (userId: string) =>
      queryClient.invalidateQueries({ queryKey: settingsQueryKeys.dataVisibility(userId) }),
    invalidateDashboard: (userId: string) =>
      queryClient.invalidateQueries({ queryKey: settingsQueryKeys.dashboard(userId) }),
  };
}
