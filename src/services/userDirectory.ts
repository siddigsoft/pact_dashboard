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
  const totalCount = Number(rows[0]?.total_count ?? 0);
  return { rows, totalCount };
}

export async function getProfilesByIds(ids: string[]): Promise<UserDirectoryRow[]> {
  if (!ids.length) return [];
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const { data, error } = await supabase.rpc('get_profiles_by_ids', {
    p_ids: unique,
  });
  if (error) throw error;
  return (data ?? []) as UserDirectoryRow[];
}
