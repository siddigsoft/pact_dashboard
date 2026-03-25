/**
 * Settings repository — all Supabase DB access for the settings domain.
 * Pure async functions: no React, no hooks, no toasts.
 */
import { supabase } from '@/integrations/supabase/client';
import type { UserSettings, DataVisibilitySettings, DashboardSettings } from '@/features/settings/context/SettingsContext';

// ─── Fetchers ─────────────────────────────────────────────────────────────────

export async function fetchUserSettings(userId: string): Promise<UserSettings | null> {
  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function fetchDataVisibilitySettings(userId: string): Promise<DataVisibilitySettings | null> {
  const { data, error } = await supabase
    .from('data_visibility_settings')
    .select('*')
    .eq('user_id', userId)
    .limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function fetchDashboardSettings(userId: string): Promise<DashboardSettings | null> {
  const { data, error } = await supabase
    .from('dashboard_settings')
    .select('*')
    .eq('user_id', userId)
    .limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function upsertUserSettings(
  userId: string,
  existingId: string | undefined,
  settings: Record<string, any>,
): Promise<void> {
  if (existingId) {
    const { error } = await supabase
      .from('user_settings')
      .update({ settings })
      .eq('id', existingId);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('user_settings')
      .insert([{ user_id: userId, settings }]);
    if (error) throw error;
  }
}

export async function upsertDataVisibilitySettings(
  userId: string,
  existingId: string | undefined,
  options: Record<string, any>,
): Promise<void> {
  if (existingId) {
    const { error } = await supabase
      .from('data_visibility_settings')
      .update({ options })
      .eq('id', existingId);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('data_visibility_settings')
      .insert([{ user_id: userId, options }])
      .select()
      .single();
    if (error) throw error;
  }
}

export async function upsertDashboardSettings(
  userId: string,
  existingId: string | undefined,
  layout: any,
  widgetOrder: string[],
): Promise<void> {
  if (existingId) {
    const { error } = await supabase
      .from('dashboard_settings')
      .update({ layout, widget_order: widgetOrder })
      .eq('id', existingId);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('dashboard_settings')
      .insert([{ user_id: userId, layout: layout || {}, widget_order: widgetOrder || [] }]);
    if (error) throw error;
  }
}
