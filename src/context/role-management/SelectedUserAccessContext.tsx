/**
 * SelectedUserAccessContext
 * Provides all access data for the currently-selected user in the Unified Access Manager.
 * All 5 tab components read from this single shared load — no duplicate DB calls.
 */
import { createContext, useContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/hooks/use-toast';
import { PAGE_DEFS, hasDefaultAccess } from '@/pages/PageAccessControl';
import { DEFAULT_ROLE_PERMISSIONS, AppRole, ResourceType, ActionType } from '@/types/roles';
import {
  AccessEffect, AccessDecisionTrace, PageOverride, PermissionOverride, ColumnVisibilityRow, DataScopeRow,
  DataScopePolicyMode, DataScopeSelector, ScopePreview,
} from '@/components/role-management/unified/types';
import {
  isSuperAdminRole,
  resolveActionEffect,
  resolvePageEffect,
  unionRoleNames,
} from '@/lib/effectiveAccess';
import { expandRelatedPageSlugs, resolvePageToggleIntent } from '@/lib/pageAccessLinks';

// ── Role→AppRole mapping ──────────────────────────────────────────────────────
const ROLE_CODE_TO_APP_ROLE: Record<string, AppRole> = {
  superAdmin: 'SuperAdmin', admin: 'Admin', countryDirector: 'CountryDirector',
  ict: 'ICT', fom: 'Field Operation Manager (FOM)', financialAdmin: 'FinancialAdmin',
  projectManager: 'ProjectManager', seniorOperationsLead: 'SeniorOperationsLead',
  supervisor: 'Supervisor', coordinator: 'Coordinator', dataTeam: 'DataTeam',
  dataCollector: 'DataCollector', reviewer: 'Reviewer', auditor: 'Auditor',
};

function roleHasAction(roleCode: string, resource: ResourceType, action: ActionType): boolean {
  if (roleCode === 'superAdmin') return true;
  const appRole = ROLE_CODE_TO_APP_ROLE[roleCode];
  if (!appRole) return false;
  return (DEFAULT_ROLE_PERMISSIONS[appRole] ?? []).some(p => p.resource === resource && p.action === action);
}

// ── Context type ──────────────────────────────────────────────────────────────
interface SelectedUserAccessValue {
  loading: boolean;
  savingKey: string | null;
  pageOverrides: PageOverride[];
  permOverrides: PermissionOverride[];
  columnConfigs: ColumnVisibilityRow[];
  dataScopeRows: DataScopeRow[];
  /** The primary profile role plus every canonical role assignment. */
  effectiveRoleNames: string[];
  scopePreview: ScopePreview | null;
  scopePreviewError: string | null;
  pageOvMap: Record<string, PageOverride>;
  permOvMap: Record<string, boolean>;  // resource:action → is_granted
  effectivePage: (slug: string) => AccessEffect;
  effectiveAction: (resource: string, action: string) => AccessEffect;
  explainPage: (slug: string) => AccessDecisionTrace;
  explainAction: (resource: string, action: string) => AccessDecisionTrace;
  togglePage: (slug: string) => Promise<void>;
  toggleAction: (resource: string, action: string) => Promise<void>;
  upsertColumnVisibility: (pageSlug: string, columnKey: string, isHidden: boolean, target: 'user' | 'role', roleName?: string) => Promise<void>;
  removeColumnVisibility: (id: string) => Promise<void>;
  upsertDataScope: (
    scopeType: DataScopeRow['scope_type'],
    scopeValue: string,
    scopeLabel: string,
    target: 'user' | 'role', roleName?: string,
  ) => Promise<void>;
  replaceCostSubmissionPolicy: (
    target: 'user' | 'role',
    mode: DataScopePolicyMode,
    includeValues: DataScopeSelector[],
    excludeValues: DataScopeSelector[], roleName?: string,
  ) => Promise<ScopePreview | null>;
  removeDataScope: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const SelectedUserAccessContext = createContext<SelectedUserAccessValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────
interface Props {
  userId: string;
  userRole: string;
  children: ReactNode;
}

export function SelectedUserAccessProvider({ userId, userRole, children }: Props) {
  const { currentUser } = useAppContext();
  const { toast } = useToast();

  const [loading, setLoading]             = useState(false);
  const [savingKey, setSavingKey]         = useState<string | null>(null);
  const [pageOverrides, setPageOverrides] = useState<PageOverride[]>([]);
  const [permOverrides, setPermOverrides] = useState<PermissionOverride[]>([]);
  const [columnConfigs, setColumnConfigs] = useState<ColumnVisibilityRow[]>([]);
  const [dataScopeRows, setDataScopeRows] = useState<DataScopeRow[]>([]);
  const [effectiveRoleNames, setEffectiveRoleNames] = useState<string[]>([userRole]);
  const [rolePermissionKeys, setRolePermissionKeys] = useState<Set<string>>(new Set());
  const [pageRoleConfigs, setPageRoleConfigs] = useState<Record<string, string[]>>({});
  const [scopePreview, setScopePreview] = useState<ScopePreview | null>(null);
  const [scopePreviewError, setScopePreviewError] = useState<string | null>(null);

  function isMigrationError(error: any): boolean {
    const message = String(error?.message ?? error ?? '').toLowerCase();
    return error?.code === '42P01' || error?.code === '42883' || error?.code === 'PGRST202'
      || message.includes('does not exist') || message.includes('could not find the function')
      || message.includes('schema cache') || message.includes('row-level security');
  }

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [pageRes, permRes, roleConfigRes, permissionRes, userRolesRes] = await Promise.all([
        supabase.from('page_access_overrides').select('*').eq('user_id', userId),
        supabase.from('user_permission_overrides').select('*').eq('user_id', userId),
        supabase.from('page_role_configs').select('page_slug, roles'),
        supabase.rpc('get_user_permissions', { user_uuid: userId }),
        supabase
          .from('canonical_user_role_assignments')
          .select('role_id, roles(name)')
          .eq('user_id', userId),
      ]);
      setPageOverrides(pageRes.data ?? []);
      setPermOverrides(permRes.data ?? []);

      if (userRolesRes.error) {
        console.error('[SelectedUserAccess] canonical role assignments load error:', userRolesRes.error);
      }
      const assignedRows = userRolesRes.data ?? [];
      const customRoleNames = assignedRows
        .map((row: any) => row.roles?.name)
        .filter((name: string | null): name is string => Boolean(name));
      const roleNames = unionRoleNames(userRole, customRoleNames);
      setEffectiveRoleNames(roleNames);

      // A user may hold several canonical roles. Load defaults for every one so
      // the editor never silently treats a custom role as if it did not exist.
      const [userColumnsRes, roleColumnsRes, userScopesRes, roleScopesRes] = await Promise.all([
        supabase.from('column_visibility_config').select('*').eq('user_id', userId),
        supabase.from('column_visibility_config').select('*').in('role', roleNames),
        supabase.from('data_scope_config').select('*').eq('user_id', userId),
        supabase.from('data_scope_config').select('*').in('role', roleNames),
      ]);
      const colRes = roleColumnsRes.error ? roleColumnsRes : userColumnsRes.error ? userColumnsRes : null;
      const scopeRes = roleScopesRes.error ? roleScopesRes : userScopesRes.error ? userScopesRes : null;

      // Surface RLS / table-missing errors rather than silently returning [].
      // Column and scope configs failing means saved rules won't be applied —
      // warn the admin so they know to run the RLS migration.
      if (colRes?.error) {
        const isRls = colRes.error.message?.includes('row-level security') || (colRes.error as any).code === '42501';
        console.error('[SelectedUserAccess] column_visibility_config load error:', colRes.error);
        if (isRls || isMigrationError(colRes.error)) {
          toast({
            title: 'Column visibility rules unavailable',
            description: 'Database access policy not yet applied. Run the access_config_tables_rls migration in Supabase Studio.',
            variant: 'destructive',
          });
        }
      }
      if (scopeRes?.error) {
        const isRls = scopeRes.error.message?.includes('row-level security') || (scopeRes.error as any).code === '42501';
        console.error('[SelectedUserAccess] data_scope_config load error:', scopeRes.error);
        if (isRls || isMigrationError(scopeRes.error)) {
          toast({
            title: 'Data scope rules unavailable',
            description: 'Database access policy not yet applied. Run the access_config_tables_rls migration in Supabase Studio.',
            variant: 'destructive',
          });
        }
      }

      setColumnConfigs([...(userColumnsRes.data ?? []), ...(roleColumnsRes.data ?? [])]);
      setDataScopeRows([...(userScopesRes.data ?? []), ...(roleScopesRes.data ?? [])]);

      if (roleConfigRes.error) {
        console.error('[SelectedUserAccess] page_role_configs load error:', roleConfigRes.error);
      }
      setPageRoleConfigs(Object.fromEntries(
        (roleConfigRes.data ?? []).map((row: any) => [row.page_slug, row.roles ?? []]),
      ));

      if (permissionRes.error) {
        console.error('[SelectedUserAccess] get_user_permissions error:', permissionRes.error);
      }
      setRolePermissionKeys(new Set(
        (permissionRes.data ?? []).map((permission: any) => `${permission.resource}:${permission.action}`),
      ));

    } finally {
      setLoading(false);
    }
  }, [userId, userRole, toast]);

  useEffect(() => { load(); }, [load]);

  // ── Derived maps ─────────────────────────────────────────────────────────
  const pageOvMap = useMemo(
    () => Object.fromEntries(pageOverrides.map(o => [o.page_slug, o])),
    [pageOverrides],
  );
  const permOvMap = useMemo(
    () => Object.fromEntries(permOverrides.map(o => [`${o.resource}:${o.action}`, o.is_granted as boolean])),
    [permOverrides],
  );

  // ── Effective helpers (see src/lib/effectiveAccess.ts for precedence) ──
  function effectivePage(slug: string): AccessEffect {
    const ov = pageOvMap[slug];
    if (slug.includes(':') && !ov) {
      // Hub tab slugs without an override default to visible.
      return resolvePageEffect({
        isSuperAdmin: effectiveRoleNames.some(isSuperAdminRole),
        override: null,
        roleAllows: true,
      });
    }
    const def = PAGE_DEFS.find(p => p.slug === slug);
    const configuredRoles = pageRoleConfigs[slug];
    const roleAllows = !!(def && effectiveRoleNames.some(role => hasDefaultAccess(def, role, configuredRoles)));
    return resolvePageEffect({
      isSuperAdmin: effectiveRoleNames.some(isSuperAdminRole),
      override: ov ?? null,
      roleAllows,
    });
  }

  function effectiveAction(resource: string, action: string): AccessEffect {
    const key = `${resource}:${action}`;
    const explicit = key in permOvMap ? permOvMap[key] : null;
    const roleAllows = rolePermissionKeys.has(key)
      || effectiveRoleNames.some(role => roleHasAction(role, resource as ResourceType, action as ActionType));
    return resolveActionEffect({
      isSuperAdmin: effectiveRoleNames.some(isSuperAdminRole),
      explicitGrant: explicit,
      roleAllows,
    });
  }

  function explainPage(slug: string): AccessDecisionTrace {
    const effect = effectivePage(slug);
    const override = pageOvMap[slug];
    if (effect === 'superadmin') {
      return { effect, source: 'super_admin', summary: 'Super Admin bypass grants access.' };
    }
    if (override) {
      return {
        effect,
        source: 'user_override',
        summary: override.is_blocked
          ? 'Explicit user page block overrides all role defaults.'
          : 'Explicit user page grant overrides the role default.',
      };
    }
    return {
      effect,
      source: 'role_default',
      summary: effect === 'role-yes'
        ? `Allowed by role default (${effectiveRoleNames.join(', ')}).`
        : `No assigned role grants this page (${effectiveRoleNames.join(', ')}).`,
    };
  }

  function explainAction(resource: string, action: string): AccessDecisionTrace {
    const effect = effectiveAction(resource, action);
    const override = permOverrides.find(item => item.resource === resource && item.action === action);
    if (effect === 'superadmin') {
      return { effect, source: 'super_admin', summary: 'Super Admin bypass grants this action.' };
    }
    if (override) {
      return {
        effect,
        source: 'user_override',
        summary: override.is_granted
          ? 'Explicit user action grant overrides the role default.'
          : 'Explicit user action block overrides all role defaults.',
      };
    }
    return {
      effect,
      source: 'role_default',
      summary: effect === 'role-yes'
        ? 'Allowed by the effective role permission set.'
        : 'No effective role permission grants this action.',
    };
  }

  // ── Page toggle (cascades to related page family, e.g. my-projects ↔ projects)
  async function togglePage(slug: string) {
    setSavingKey(`page-family:${expandRelatedPageSlugs(slug).slice().sort().join('|')}`);
    const eff = effectivePage(slug);
    const intent = resolvePageToggleIntent(eff);
    if (intent === 'noop') {
      setSavingKey(null);
      return;
    }
    const targets = expandRelatedPageSlugs(slug);
    try {
      if (intent === 'clear') {
        const { error } = await supabase
          .from('page_access_overrides')
          .delete()
          .eq('user_id', userId)
          .in('page_slug', targets);
        if (error) throw error;
        toast({
          title: 'Override removed',
          description: targets.length > 1
            ? `Restored role default for ${targets.length} linked pages.`
            : 'Restored to role default.',
        });
      } else {
        const rows = targets.map((page_slug) => ({
          user_id: userId,
          page_slug,
          is_blocked: intent === 'block',
          granted_by: currentUser?.id ?? null,
        }));
        const { error } = await supabase
          .from('page_access_overrides')
          .upsert(rows, { onConflict: 'user_id,page_slug' });
        if (error) throw error;
        toast({
          title: intent === 'block' ? 'Blocked' : 'Granted',
          description: targets.length > 1
            ? `${intent === 'block' ? 'Blocked' : 'Granted'} ${targets.length} linked pages together.`
            : intent === 'block' ? 'Access removed.' : 'Access granted.',
        });
      }
      await load();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSavingKey(null);
    }
  }

  // ── Action toggle ─────────────────────────────────────────────────────────
  async function toggleAction(resource: string, action: string) {
    const key = `${resource}:${action}`;
    setSavingKey(`perm:${key}`);
    const eff = effectiveAction(resource, action);
    if (eff === 'superadmin') {
      setSavingKey(null);
      return;
    }
    try {
      if (eff === 'granted' || eff === 'blocked') {
        const { error } = await supabase.from('user_permission_overrides')
          .delete().eq('user_id', userId).eq('resource', resource).eq('action', action);
        if (error) throw error;
        toast({ title: 'Override removed', description: 'Restored to role default.' });
      } else if (eff === 'role-yes') {
        const { error } = await supabase.from('user_permission_overrides').upsert(
          { user_id: userId, resource, action, is_granted: false },
          { onConflict: 'user_id,resource,action' },
        );
        if (error) throw error;
        toast({ title: 'Permission blocked', description: `${action} on ${resource} removed.` });
      } else {
        const { error } = await supabase.from('user_permission_overrides').upsert(
          { user_id: userId, resource, action, is_granted: true },
          { onConflict: 'user_id,resource,action' },
        );
        if (error) throw error;
        toast({ title: 'Permission granted', description: `${action} on ${resource} granted.` });
      }
      await load();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSavingKey(null);
    }
  }

  // ── Column visibility ────────────────────────────────────────────────────
  async function upsertColumnVisibility(
    pageSlug: string, columnKey: string, isHidden: boolean, target: 'user' | 'role', roleName = userRole,
  ) {
    setSavingKey(`col:${target}:${pageSlug}:${columnKey}`);
    try {
      const row = target === 'user'
        ? { user_id: userId, role: null, page_slug: pageSlug, column_key: columnKey, is_hidden: isHidden, set_by: currentUser?.id ?? null }
        : { user_id: null, role: roleName, page_slug: pageSlug, column_key: columnKey, is_hidden: isHidden, set_by: currentUser?.id ?? null };
      const { error } = await supabase.from('column_visibility_config').upsert(row as any);
      if (error) throw error;
      toast({ title: isHidden ? 'Column hidden' : 'Column visible', description: `${target === 'role' ? 'Role default' : 'User override'} saved.` });
      await load();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSavingKey(null);
    }
  }

  async function removeColumnVisibility(id: string) {
    setSavingKey(`col:remove:${id}`);
    try {
      const { error } = await supabase.from('column_visibility_config').delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Column rule removed' });
      await load();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSavingKey(null);
    }
  }

  // ── Data scope ───────────────────────────────────────────────────────────
  async function upsertDataScope(
    scopeType: DataScopeRow['scope_type'], scopeValue: string, scopeLabel: string, target: 'user' | 'role', roleName = userRole,
  ): Promise<void> {
    setSavingKey(`scope:${target}:${scopeType}:${scopeValue}`);
    try {
      const row = target === 'user'
        ? {
          user_id: userId, role: null, scope_type: scopeType, scope_value: scopeValue,
          scope_label: scopeLabel, set_by: currentUser?.id ?? null,
        }
        : {
          user_id: null, role: roleName, scope_type: scopeType, scope_value: scopeValue,
          scope_label: scopeLabel, set_by: currentUser?.id ?? null,
        };
      const { error } = await supabase.from('data_scope_config').upsert(row as any);
      if (error) throw error;
      toast({ title: 'Scope rule added', description: `${target === 'role' ? 'Role default' : 'User override'} saved.` });
      await load();
    } catch (e: any) {
      const description = isMigrationError(e)
        ? 'The data scope migration has not been applied. Apply the access-scope migration, then try again.'
        : e.message;
      toast({ title: 'Unable to save scope', description, variant: 'destructive' });
    } finally {
      setSavingKey(null);
    }
  }

  async function replaceCostSubmissionPolicy(
    target: 'user' | 'role',
    mode: DataScopePolicyMode,
    includeValues: DataScopeSelector[],
    excludeValues: DataScopeSelector[], roleName = userRole,
  ): Promise<ScopePreview | null> {
    setSavingKey(`scope:replace:${target}`);
    setScopePreviewError(null);
    try {
      const { data, error } = await (supabase as any).rpc(
        'replace_operational_cost_data_scope',
        {
          p_target_user_id: target === 'user' ? userId : null,
          p_target_role: target === 'role' ? roleName : null,
          p_mode: mode,
          p_include_values: includeValues,
          p_exclude_values: excludeValues,
        },
      );
      if (error) throw error;

      const result = Array.isArray(data) ? data[0] : data;
      let count = Number(result?.visible_count ?? result?.count ?? result?.matching_count ?? result?.total_count);
      if (!Number.isFinite(count)) {
        const preview = await (supabase as any).rpc(
          'preview_operational_cost_submission_scope',
          { p_target_user_id: userId },
        );
        if (preview.error) throw preview.error;
        const previewRow = Array.isArray(preview.data) ? preview.data[0] : preview.data;
        count = Number(previewRow?.visible_count ?? previewRow?.count);
      }
      const scopePreview = { count: Number.isFinite(count) ? count : null };
      setScopePreview(scopePreview);
      toast({
        title: 'Cost Submission scope saved',
        description: target === 'role' ? 'Role default saved atomically.' : 'User override saved atomically.',
      });
      await load();
      return scopePreview;
    } catch (e: any) {
      const description = isMigrationError(e)
        ? 'The Cost Submission scope migration has not been applied. Apply it before saving this policy.'
        : e.message;
      setScopePreview(null);
      setScopePreviewError(description);
      toast({ title: 'Unable to save Cost Submission scope', description, variant: 'destructive' });
      return null;
    } finally {
      setSavingKey(null);
    }
  }

  async function removeDataScope(id: string) {
    setSavingKey(`scope:remove:${id}`);
    try {
      const { error } = await supabase.from('data_scope_config').delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Scope rule removed' });
      await load();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSavingKey(null);
    }
  }

  const value: SelectedUserAccessValue = {
    loading, savingKey,
    pageOverrides, permOverrides, columnConfigs, dataScopeRows, scopePreview, scopePreviewError, effectiveRoleNames,
    pageOvMap, permOvMap,
    effectivePage, effectiveAction, explainPage, explainAction,
    togglePage, toggleAction,
    upsertColumnVisibility, removeColumnVisibility,
    upsertDataScope, replaceCostSubmissionPolicy, removeDataScope,
    refresh: load,
  };

  return (
    <SelectedUserAccessContext.Provider value={value}>
      {children}
    </SelectedUserAccessContext.Provider>
  );
}

export function useSelectedUserAccess(): SelectedUserAccessValue {
  const ctx = useContext(SelectedUserAccessContext);
  if (!ctx) throw new Error('useSelectedUserAccess must be inside SelectedUserAccessProvider');
  return ctx;
}
