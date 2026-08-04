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
