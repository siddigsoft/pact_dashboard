import { supabase } from '@/integrations/supabase/client';

export type UserDirectoryRow = {
  id: string;
  full_name: string | null;
  username: string | null;
  email: string | null;
  role: string | null;
  status: string | null;
  availability: string | null;
  avatar_url: string | null;
  department_id: string | null;
  state_id: string | null;
  hub_id: string | null;
  is_active: boolean | null;
  total_count?: number;
};

export type SearchUserDirectoryParams = {
  search?: string;
  limit?: number;
  offset?: number;
  status?: string | null;
  activeOnly?: boolean;
};

/** Map directory RPC row → User shape used by pickers / team UI. */
export function directoryRowToUser(row: UserDirectoryRow): import('@/types').User {
  const name = row.full_name || row.username || row.email || 'Unknown';
  return {
    id: row.id,
    name,
    fullName: row.full_name || undefined,
    username: row.username || undefined,
    email: row.email || '',
    role: row.role || 'user',
    avatar: row.avatar_url || undefined,
    stateId: row.state_id || undefined,
    hubId: row.hub_id || undefined,
    availability: (row.availability as 'online' | 'offline' | 'busy') || 'offline',
    profileStatus: row.status || undefined,
    isApproved: row.status === 'approved',
    lastActive: new Date().toISOString(),
  } as import('@/types').User;
}

/** Session-scoped cache so Chat/maps don't re-hit the RPC for the same ids. */
const profileCache = new Map<string, UserDirectoryRow>();

export function displayNameFromProfile(p: UserDirectoryRow | undefined | null): string {
  if (!p) return 'Unknown User';
  return p.full_name || p.username || p.email || 'Unknown User';
}

export function getCachedProfile(id: string): UserDirectoryRow | undefined {
  return profileCache.get(id);
}

export async function searchUserDirectory(
  params: SearchUserDirectoryParams = {}
): Promise<{ rows: UserDirectoryRow[]; totalCount: number }> {
  const {
    search = '',
    limit = 50,
    offset = 0,
    status = null,
    activeOnly = true,
  } = params;

  const { data, error } = await supabase.rpc('search_user_directory', {
    p_search: search,
    p_limit: limit,
    p_offset: offset,
    p_status: status,
    p_active_only: activeOnly,
  });

  if (error) throw error;

  const rows = (data ?? []) as UserDirectoryRow[];
  for (const row of rows) profileCache.set(row.id, row);
  const totalCount = Number(rows[0]?.total_count ?? 0);
  return { rows, totalCount };
}

export async function getProfilesByIds(ids: string[]): Promise<UserDirectoryRow[]> {
  if (!ids.length) return [];
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const missing = unique.filter((id) => !profileCache.has(id));

  if (missing.length) {
    const { data, error } = await supabase.rpc('get_profiles_by_ids', {
      p_ids: missing,
    });
    if (error) throw error;
    for (const row of (data ?? []) as UserDirectoryRow[]) {
      profileCache.set(row.id, row);
    }
  }

  return unique
    .map((id) => profileCache.get(id))
    .filter((row): row is UserDirectoryRow => Boolean(row));
}

export async function resolveProfiles(
  ids: string[]
): Promise<Map<string, UserDirectoryRow>> {
  const rows = await getProfilesByIds(ids);
  return new Map(rows.map((r) => [r.id, r]));
}

export async function resolveDisplayName(id: string): Promise<string> {
  const map = await resolveProfiles([id]);
  return displayNameFromProfile(map.get(id));
}

export type ProfileWithLocationRow = {
  id: string;
  full_name: string | null;
  username: string | null;
  email: string | null;
  role: string | null;
  status: string | null;
  availability: string | null;
  avatar_url: string | null;
  state_id: string | null;
  hub_id: string | null;
  location: {
    latitude?: number | string;
    longitude?: number | string;
    region?: string;
    lastUpdated?: string;
    [key: string]: unknown;
  } | null;
  last_activity: string | null;
  is_active: boolean | null;
};

/** Map RPC row → User shape expected by field maps. */
export function profileWithLocationToUser(row: ProfileWithLocationRow): import('@/types').User {
  const lat = Number(row.location?.latitude);
  const lng = Number(row.location?.longitude);
  const name = row.full_name || row.username || row.email || 'Unknown';
  return {
    id: row.id,
    name,
    fullName: row.full_name || undefined,
    username: row.username || undefined,
    email: row.email || '',
    role: row.role || 'dataCollector',
    avatar: row.avatar_url || undefined,
    stateId: row.state_id || undefined,
    hubId: row.hub_id || undefined,
    availability: (row.availability as 'online' | 'offline' | 'busy') || 'offline',
    profileStatus: row.status || undefined,
    isApproved: row.status === 'approved',
    lastActive: row.last_activity || new Date().toISOString(),
    location:
      Number.isFinite(lat) && Number.isFinite(lng)
        ? {
            latitude: lat,
            longitude: lng,
            region: typeof row.location?.region === 'string' ? row.location.region : undefined,
            lastUpdated:
              typeof row.location?.lastUpdated === 'string'
                ? row.location.lastUpdated
                : row.last_activity || undefined,
          }
        : undefined,
  } as import('@/types').User;
}

export async function listProfilesWithLocation(
  limit = 200
): Promise<ProfileWithLocationRow[]> {
  const { data, error } = await supabase.rpc('list_profiles_with_location', {
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as ProfileWithLocationRow[];
}

export type FieldTeamProfileRow = ProfileWithLocationRow & {
  phone?: string | null;
  total_count?: number;
};

/** Map field-team RPC row → User (includes phone + optional GPS). */
export function fieldTeamRowToUser(row: FieldTeamProfileRow): import('@/types').User {
  const base = profileWithLocationToUser(row);
  return {
    ...base,
    phone: row.phone || undefined,
  } as import('@/types').User;
}

export async function listFieldTeamProfiles(params: {
  search?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<{ rows: FieldTeamProfileRow[]; totalCount: number }> {
  const { search = '', limit = 100, offset = 0 } = params;
  const { data, error } = await supabase.rpc('list_field_team_profiles', {
    p_search: search,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  const rows = (data ?? []) as FieldTeamProfileRow[];
  for (const row of rows) {
    profileCache.set(row.id, {
      id: row.id,
      full_name: row.full_name,
      username: row.username,
      email: row.email,
      role: row.role,
      status: row.status,
      availability: row.availability,
      avatar_url: row.avatar_url,
      department_id: null,
      state_id: row.state_id,
      hub_id: row.hub_id,
      is_active: row.is_active,
    });
  }
  return { rows, totalCount: Number(rows[0]?.total_count ?? 0) };
}

