export interface FilterVisibilityConfig {
  filter_key: string;
  is_hidden: boolean;
  user_id?: string | null;
  role?: string | null;
}

export function resolveFilterVisibility(input: {
  key: string;
  userId: string | null | undefined;
  roles: readonly string[];
  isSuperAdmin: boolean;
  rows: readonly FilterVisibilityConfig[] | undefined;
  initialLoading: boolean;
  failedWithoutData: boolean;
}): boolean {
  if (!input.userId) return false;
  if (input.isSuperAdmin) return true;
  if (input.initialLoading || input.failedWithoutData) return false;
  const rows = input.rows ?? [];
  const own = rows.find(row => row.filter_key === input.key && row.user_id === input.userId);
  if (own) return !own.is_hidden;
  const roleRows = rows.filter(row =>
    row.filter_key === input.key && row.role && input.roles.includes(row.role),
  );
  return roleRows.length ? !roleRows.some(row => row.is_hidden) : true;
}

/** Clicking a target with no override toggles the inherited result. */
export function nextFilterOverride(
  existing: FilterVisibilityConfig | undefined,
  inheritedHidden: boolean,
): boolean | null {
  if (existing) return null;
  return !inheritedHidden;
}