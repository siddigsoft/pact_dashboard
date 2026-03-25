/**
 * User / profiles domain — Supabase table + RPC access for UserContext.
 * Auth (signIn, signOut, session, MFA, channels) stays in UserContext.
 */
import { supabase } from '@/integrations/supabase/client';
import type { AppRole } from '@/types';
import type { User } from '@/types';

export const PROFILE_COLUMNS =
  'id, full_name, username, email, role, status, availability, avatar_url, phone, employee_id, state_id, hub_id, secondary_hub_id, locality_id, location, created_at';

export async function fetchProfilesList() {
  return supabase
    .from('profiles')
    .select(
      'id, full_name, username, email, role, status, availability, avatar_url, phone, employee_id, state_id, hub_id, secondary_hub_id, locality_id, location, created_at',
    );
}

export async function fetchAllUserRolesRows() {
  return supabase.from('user_roles').select('user_id, role');
}

export async function fetchProfileById(userId: string) {
  return supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).single();
}

/** Login path uses full row shape */
export async function fetchProfileFullById(userId: string) {
  return supabase.from('profiles').select('*').eq('id', userId).single();
}

export async function fetchProfileByEmail(email: string) {
  return supabase.from('profiles').select(PROFILE_COLUMNS).eq('email', email).single();
}

export async function updateProfileIdByEmail(email: string, newId: string) {
  return supabase.from('profiles').update({ id: newId }).eq('email', email).select(PROFILE_COLUMNS).single();
}

export async function updateSuperAdminsUserId(oldUserId: string, newUserId: string) {
  return supabase.from('super_admins').update({ user_id: newUserId }).eq('user_id', oldUserId);
}

export async function fetchUserRolesByUserId(userId: string) {
  return supabase.from('user_roles').select('role').eq('user_id', userId);
}

export async function fetchActiveUserClassification(userId: string) {
  return supabase
    .from('user_classifications')
    .select(
      'classification_level, role_scope, has_retainer, retainer_amount_cents, retainer_currency, effective_from, effective_until',
    )
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle();
}

export async function approveProfile(userId: string) {
  return supabase.from('profiles').update({ status: 'approved' }).eq('id', userId).select('id');
}

export async function fetchProfileEmailNameRole(userId: string) {
  return supabase.from('profiles').select('email, full_name, role').eq('id', userId).single();
}

export async function deleteNotificationsForUser(userId: string) {
  await supabase.from('notifications').delete().eq('recipient_id', userId);
  await supabase.from('notifications').delete().eq('triggered_by', userId);
}

export async function deleteProfile(userId: string) {
  return supabase.from('profiles').delete().eq('id', userId).select('id');
}

export async function updateUserLocationDb(
  userId: string,
  location: NonNullable<User['location']>,
) {
  return supabase
    .from('profiles')
    .update({
      location,
      location_sharing: true,
    })
    .eq('id', userId)
    .select('id');
}

export async function updateUserAvailabilityDb(userId: string, status: 'online' | 'offline' | 'busy') {
  return supabase.from('profiles').update({ availability: status }).eq('id', userId);
}

export async function updateLocationSharingDb(userId: string, isSharing: boolean) {
  return supabase.from('profiles').update({ location_sharing: isSharing }).eq('id', userId);
}

export async function updateProfilePayload(userId: string, payload: Record<string, unknown>) {
  return supabase.from('profiles').update(payload).eq('id', userId);
}

export async function rpcAdminUpdateProfile(params: {
  target_id: string;
  new_full_name: string | null;
  new_username: string | null;
  new_email: string | null;
  new_role: string | null;
  new_avatar_url: string | null;
  new_hub_id: string | null;
  new_state_id: string | null;
  new_locality_id: string | null;
  new_employee_id: string | null;
  new_phone: string | null;
  new_bank_account: unknown;
}) {
  return supabase.rpc('admin_update_profile', params);
}

export async function updateSecondaryHubColumn(userId: string, secHubValue: string | null) {
  return supabase.from('profiles').update({ secondary_hub_id: secHubValue }).eq('id', userId);
}

export async function fetchProfileLocationOnly(userId: string) {
  return supabase.from('profiles').select('location').eq('id', userId).single();
}

export async function updateProfileLocationJson(userId: string, location: Record<string, unknown>) {
  return supabase.from('profiles').update({ location }).eq('id', userId);
}

export async function fetchProfileIdByEmail(email: string) {
  return supabase.from('profiles').select('id').eq('email', email).maybeSingle();
}

export async function invokeVerifyResetOtp(body: { email: string; action: string }) {
  return supabase.functions.invoke('verify-reset-otp', { body });
}

export async function invokeAdminConfirmEmail(userId: string, accessToken: string) {
  return supabase.functions.invoke('admin-confirm-email', {
    body: { userId },
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function invokeAdminUpdateEmail(userId: string, newEmail: string, accessToken: string) {
  return supabase.functions.invoke('admin-update-email', {
    body: { userId, newEmail: newEmail.toLowerCase() },
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}
