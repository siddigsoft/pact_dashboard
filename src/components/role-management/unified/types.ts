/**
 * Shared types for the Unified Access Manager components.
 */

/** Effective access status for a page or action */
export type AccessEffect =
  | 'superadmin'  // selected user is super admin — all controls locked
  | 'granted'     // explicitly granted by override (is_blocked = false)
  | 'blocked'     // explicitly blocked by override (is_blocked = true)
  | 'role-yes'    // allowed by role default, no override
  | 'role-no';    // denied by role default, no override

export interface PageOverride {
  id: string;
  user_id: string;
  page_slug: string;
  is_blocked: boolean;
  granted_by?: string | null;
  created_at: string;
}

export interface PermissionOverride {
  id: string;
  user_id: string;
  resource: string;
  action: string;
  is_granted: boolean;
  expires_at?: string | null;
  created_at: string;
}

export interface ColumnVisibilityRow {
  id: string;
  user_id?: string | null;
  role?: string | null;
  page_slug: string;
  column_key: string;
  is_hidden: boolean;
  set_by?: string | null;
  created_at: string;
}

export interface DataScopeRow {
  id: string;
  user_id?: string | null;
  role?: string | null;
  scope_type: 'hub' | 'project' | 'state' | 'cost_center';
  scope_value: string;
  scope_label?: string | null;
  set_by?: string | null;
  created_at: string;
}

export interface ManagedUser {
  id: string;
  name?: string | null;
  full_name?: string | null;
  email: string;
  role: string;
  hub_name?: string | null;
  hub_id?: string | null;
  is_active?: boolean;
}

/** Props shared by all tab components */
export interface TabProps {
  userId: string;
  userRole: string;
  userName: string;
  isSelectedSuperAdmin: boolean;  // whether selected user is a superAdmin → lock all controls
}
