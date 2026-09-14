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
  /** Resource is optional for backwards compatibility with the original generic rows. */
  resource?: 'operational_cost_submissions' | 'legacy' | string | null;
  scope_type: 'hub' | 'project' | 'state' | 'country' | 'organization' | 'cost_center' | 'policy';
  scope_value: string;
  scope_label?: string | null;
  /** Cost Submission policy fields added to the data_scope_config contract. */
  mode?: DataScopePolicyMode | null;
  is_excluded?: boolean | null;
  include_values?: DataScopeSelector[] | null;
  exclude_values?: DataScopeSelector[] | null;
  set_by?: string | null;
  created_at: string;
}

export interface DataScopeSelector {
  type: 'hub' | 'project' | 'state' | 'country';
  value: string;
  label: string;
}

export type DataScopePolicyMode =
  | 'role_default'
  | 'none'
  | 'own'
  | 'assigned'
  | 'selected'
  | 'country'
  | 'organization';

export type DataScopeResource = 'operational_cost_submissions' | 'legacy';

export interface DataScopePolicyInput {
  resource: DataScopeResource;
  policyMode: DataScopePolicyMode;
  scopeType?: 'hub' | 'project' | 'state' | 'country' | 'cost_center';
  scopeValue?: string;
  scopeLabel?: string;
  isExclusion?: boolean;
  target: 'user' | 'role';
  includeValues?: DataScopeSelector[];
  excludeValues?: DataScopeSelector[];
}

export interface ScopePreview {
  count: number | null;
  error?: string;
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
