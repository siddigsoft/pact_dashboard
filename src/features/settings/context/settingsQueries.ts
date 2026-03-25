/**
 * React Query keys and hooks for Settings data.
 * Fetch logic lives in settingsRepository — this file owns only the hooks and cache keys.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchUserSettings,
  fetchDataVisibilitySettings,
  fetchDashboardSettings,
} from '@/features/settings/repository/settingsRepository';
import type { UserSettings, DataVisibilitySettings, DashboardSettings } from './SettingsContext';

export const settingsQueryKeys = {
  all: ['settings'] as const,
  userSettings: (userId: string) => [...settingsQueryKeys.all, 'user', userId] as const,
  dataVisibility: (userId: string) => [...settingsQueryKeys.all, 'visibility', userId] as const,
  dashboard: (userId: string) => [...settingsQueryKeys.all, 'dashboard', userId] as const,
};

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
