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
  AccessEffect, PageOverride, PermissionOverride, ColumnVisibilityRow, DataScopeRow,
} from '@/components/role-management/unified/types';

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
  pageOvMap: Record<string, PageOverride>;
  permOvMap: Record<string, boolean>;  // resource:action → is_granted
  effectivePage: (slug: string) => AccessEffect;
  effectiveAction: (resource: string, action: string) => AccessEffect;
  togglePage: (slug: string) => Promise<void>;
  toggleAction: (resource: string, action: string) => Promise<void>;
  upsertColumnVisibility: (pageSlug: string, columnKey: string, isHidden: boolean, target: 'user' | 'role') => Promise<void>;
  removeColumnVisibility: (id: string) => Promise<void>;
  upsertDataScope: (scopeType: DataScopeRow['scope_type'], scopeValue: string, scopeLabel: string, target: 'user' | 'role') => Promise<void>;
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

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [pageRes, permRes, colRes, scopeRes] = await Promise.all([
        supabase.from('page_access_overrides').select('*').eq('user_id', userId),
        supabase.from('user_permission_overrides').select('*').eq('user_id', userId),
        supabase.from('column_visibility_config').select('*').or(`user_id.eq.${userId},role.eq.${userRole}`).catch(() => ({ data: [] as any })),
        supabase.from('data_scope_config').select('*').or(`user_id.eq.${userId},role.eq.${userRole}`).catch(() => ({ data: [] as any })),
      ]);
      setPageOverrides(pageRes.data ?? []);
      setPermOverrides(permRes.data ?? []);
      setColumnConfigs((colRes as any).data ?? []);
      setDataScopeRows((scopeRes as any).data ?? []);
    } finally {
      setLoading(false);
    }
  }, [userId, userRole]);

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

  // ── Effective helpers ────────────────────────────────────────────────────
  function effectivePage(slug: string): AccessEffect {
    const ov = pageOvMap[slug];
    if (ov) return ov.is_blocked ? 'blocked' : 'granted';
    // Hub tab slugs (contain ':') default to visible — no PAGE_DEFS entry
    if (slug.includes(':')) return 'role-yes';
    const def = PAGE_DEFS.find(p => p.slug === slug);
    return (def && hasDefaultAccess(def, userRole)) ? 'role-yes' : 'role-no';
  }

  function effectiveAction(resource: string, action: string): AccessEffect {
    const key = `${resource}:${action}`;
    if (key in permOvMap) return permOvMap[key] ? 'granted' : 'blocked';
    return roleHasAction(userRole, resource as ResourceType, action as ActionType) ? 'role-yes' : 'role-no';
  }

  // ── Page toggle ──────────────────────────────────────────────────────────
  async function togglePage(slug: string) {
    setSavingKey(`page:${slug}`);
    const eff = effectivePage(slug);
    try {
      if (eff === 'granted' || eff === 'blocked') {
        const { error } = await supabase.from('page_access_overrides').delete().eq('user_id', userId).eq('page_slug', slug);
        if (error) throw error;
        toast({ title: 'Override removed', description: 'Restored to role default.' });
      } else if (eff === 'role-yes') {
        const { error } = await supabase.from('page_access_overrides').upsert(
          { user_id: userId, page_slug: slug, is_blocked: true, granted_by: currentUser?.id ?? null },
          { onConflict: 'user_id,page_slug' },
        );
        if (error) throw error;
        toast({ title: 'Blocked', description: `Access removed.` });
      } else {
        const { error } = await supabase.from('page_access_overrides').upsert(
          { user_id: userId, page_slug: slug, is_blocked: false, granted_by: currentUser?.id ?? null },
          { onConflict: 'user_id,page_slug' },
        );
        if (error) throw error;
        toast({ title: 'Granted', description: `Access granted.` });
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
    pageSlug: string, columnKey: string, isHidden: boolean, target: 'user' | 'role',
  ) {
    setSavingKey(`col:${target}:${pageSlug}:${columnKey}`);
    try {
      const row = target === 'user'
        ? { user_id: userId, role: null, page_slug: pageSlug, column_key: columnKey, is_hidden: isHidden, set_by: currentUser?.id ?? null }
        : { user_id: null, role: userRole, page_slug: pageSlug, column_key: columnKey, is_hidden: isHidden, set_by: currentUser?.id ?? null };
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
    scopeType: DataScopeRow['scope_type'], scopeValue: string, scopeLabel: string, target: 'user' | 'role',
  ) {
    setSavingKey(`scope:${target}:${scopeType}:${scopeValue}`);
    try {
      const row = target === 'user'
        ? { user_id: userId, role: null, scope_type: scopeType, scope_value: scopeValue, scope_label: scopeLabel, set_by: currentUser?.id ?? null }
        : { user_id: null, role: userRole, scope_type: scopeType, scope_value: scopeValue, scope_label: scopeLabel, set_by: currentUser?.id ?? null };
      const { error } = await supabase.from('data_scope_config').upsert(row as any);
      if (error) throw error;
      toast({ title: 'Scope rule added', description: `${target === 'role' ? 'Role default' : 'User override'} saved.` });
      await load();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
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
    pageOverrides, permOverrides, columnConfigs, dataScopeRows,
    pageOvMap, permOvMap,
    effectivePage, effectiveAction,
    togglePage, toggleAction,
    upsertColumnVisibility, removeColumnVisibility,
    upsertDataScope, removeDataScope,
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
