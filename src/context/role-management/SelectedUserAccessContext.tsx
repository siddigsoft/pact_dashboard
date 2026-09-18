/**
 * SelectedUserAccessContext
 * Provides all access data for the currently-selected user in the Unified Access Manager.
 * All 5 tab components read from this single shared load — no duplicate DB calls.
 */
import { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';
import { toast } from '@/hooks/use-toast';
import { PAGE_DEFS } from '@/lib/access-registry';
import { resolveRoutePermission } from '@/lib/page-roles';

import {
  AccessEffect, AccessDecisionTrace, PageOverride, PermissionOverride, ColumnVisibilityRow, FilterVisibilityRow, DataScopeRow,
  DataScopePolicyMode, DataScopeSelector, ScopePreview,
} from '@/components/role-management/unified/types';
import {
  isSuperAdminRole,
  resolveActionEffect,
  unionRoleNames,
} from '@/lib/effectiveAccess';
import { expandRelatedPageSlugs, getPageRoutePermissions, resolvePageToggleIntent } from '@/lib/pageAccessLinks';
import { overrideIsActive, evaluateManifestPageAccess, manifestIsTabBlocked, type CurrentUserAccessManifest } from '@/lib/current-user-access';
import { nextFilterOverride } from '@/lib/filter-visibility';

// ── Context type ──────────────────────────────────────────────────────────────
interface SelectedUserAccessValue {
  loading: boolean;
  loadError: string | null;
  loadWarning: string | null;
  hasLoaded: boolean;
  savingKey: string | null;
  pageOverrides: PageOverride[];
  permOverrides: PermissionOverride[];
  columnConfigs: ColumnVisibilityRow[];
  filterConfigs: FilterVisibilityRow[];
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
  updateOverrideMetadata: (kind: 'page' | 'action', id: string, reason: string, expiresAt: string | null) => Promise<boolean>;
  removeOverride: (kind: 'page' | 'action', id: string) => Promise<boolean>;
  upsertColumnVisibility: (pageSlug: string, columnKey: string, isHidden: boolean, target: 'user' | 'role', roleName?: string) => Promise<void>;
  removeColumnVisibility: (id: string) => Promise<void>;
  effectiveFilter: (filterKey: string) => AccessEffect;
  explainFilter: (filterKey: string) => AccessDecisionTrace;
  toggleFilter: (filterKey: string, target?: 'user' | 'role', roleName?: string) => Promise<void>;
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

// Parallel load stages share a bounded budget; they must not stack multiple
// long waits during an initial render.
const ACCESS_LOAD_TIMEOUT_MS = 7_000;
const ACCESS_LOAD_ERROR = 'Access data could not be loaded. Check your connection and try again.';

/** A timed promise cannot cancel Supabase's request, so callers must also guard
 * the result with a request sequence before writing it into state. */
function withTimeout<T>(promise: PromiseLike<T>, timeoutMs = ACCESS_LOAD_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = globalThis.setTimeout(() => reject(new Error('Access data request timed out.')), timeoutMs);
    Promise.resolve(promise).then(
      value => { globalThis.clearTimeout(timer); resolve(value); },
      error => { globalThis.clearTimeout(timer); reject(error); },
    );
  });
}

// ── Provider ──────────────────────────────────────────────────────────────────
interface Props {
  userId: string;
  userRole: string;
  children: ReactNode;
}

export function SelectedUserAccessProvider({ userId, userRole, children }: Props) {
  const { currentUser } = useAppContext();

  const [loading, setLoading]             = useState(true);
  const [loadError, setLoadError]         = useState<string | null>(null);
  const [loadWarning, setLoadWarning]     = useState<string | null>(null);
  const [hasLoaded, setHasLoaded]         = useState(false);
  const hasLoadedRef = useRef(false);
  const loadSequence = useRef(0);
  const mounted = useRef(true);
  const [savingKey, setSavingKey]         = useState<string | null>(null);
  const [pageOverrides, setPageOverrides] = useState<PageOverride[]>([]);
  const [permOverrides, setPermOverrides] = useState<PermissionOverride[]>([]);
  const [columnConfigs, setColumnConfigs] = useState<ColumnVisibilityRow[]>([]);
  const [filterConfigs, setFilterConfigs] = useState<FilterVisibilityRow[]>([]);
  const [dataScopeRows, setDataScopeRows] = useState<DataScopeRow[]>([]);
  const [effectiveRoleNames, setEffectiveRoleNames] = useState<string[]>([]);
  const [rolePermissionKeys, setRolePermissionKeys] = useState<Set<string>>(new Set());
  const [pageRoleConfigs, setPageRoleConfigs] = useState<Record<string, string[]>>({});
  const [roleTabBlocks, setRoleTabBlocks] = useState<Record<string, boolean>>({});
  const [scopePreview, setScopePreview] = useState<ScopePreview | null>(null);
  const [scopePreviewError, setScopePreviewError] = useState<string | null>(null);
  const [accessNow, setAccessNow] = useState(Date.now());

  // Re-evaluate open editor decisions when a saved override expires.
  useEffect(() => {
    const expiry = [...pageOverrides, ...permOverrides]
      .map(row => new Date(row.expires_at ?? '').getTime())
      .filter(value => Number.isFinite(value) && value > Date.now())
      .sort((a, b) => a - b)[0];
    if (!expiry) return;
    const timer = window.setTimeout(() => setAccessNow(Date.now()), Math.min(expiry - Date.now() + 1, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [pageOverrides, permOverrides, accessNow]);

  function isMigrationError(error: any): boolean {
    const message = String(error?.message ?? error ?? '').toLowerCase();
    return error?.code === '42P01' || error?.code === '42883' || error?.code === 'PGRST202'
      || message.includes('does not exist') || message.includes('could not find the function')
      || message.includes('schema cache') || message.includes('row-level security');
  }

  function isOptionalRoleTabsError(error: any): boolean {
    const message = String(error?.message ?? error ?? '').toLowerCase();
    const referencesRoleTabs = message.includes('role_tab_configs');
    const missingOrSchema = error?.code === '42P01' || error?.code === '42883'
      || error?.code === 'PGRST202' || message.includes('does not exist')
      || message.includes('could not find the table') || message.includes('schema cache');
    return referencesRoleTabs && missingOrSchema;
  }

  // React StrictMode runs an extra setup → cleanup → setup cycle in
  // development. Re-arm the guard on every setup or the second load treats the
  // mounted provider as stale forever and leaves every tab on its skeleton.
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const load = useCallback(async () => {
    if (!userId) return;
    const sequence = ++loadSequence.current;
    const isCurrent = () => mounted.current && sequence === loadSequence.current;
    const deadline = Date.now() + 14_000;
    const bounded = <T,>(promise: PromiseLike<T>) =>
      withTimeout(promise, Math.max(1, deadline - Date.now()));
    // Keep the last good view usable while a manual refresh is in flight.
    setLoading(!hasLoadedRef.current);
    setLoadError(null);
    setLoadWarning(null);
    try {
      const [pageRes, permRes, roleConfigRes, permissionRes, userRolesRes] = await bounded(Promise.all([
        bounded(supabase.from('page_access_overrides').select('*').eq('user_id', userId)),
        bounded(supabase.from('user_permission_overrides').select('*').eq('user_id', userId)),
        bounded(supabase.from('page_role_configs').select('page_slug, roles')),
        bounded(supabase.rpc('get_user_permissions', { user_uuid: userId })),
        bounded(supabase
          .from('canonical_user_role_assignments')
          .select('role_id, roles!inner(name, is_active)')
          .eq('user_id', userId)),
      ]));
      const firstError = [pageRes, permRes, roleConfigRes, permissionRes, userRolesRes].find(result => result.error)?.error;
      if (firstError) throw firstError;
      const assignedRows = userRolesRes.data ?? [];
      const customRoleNames = assignedRows
        .filter((row: any) => row.roles?.is_active === true)
        .map((row: any) => row.roles?.name)
        .filter((name: string | null): name is string => Boolean(name));
      // Resolve exactly like runtime access: the profile's primary role is
      // always included, then active canonical assignments are added.
      const roleNames = unionRoleNames(userRole, customRoleNames);
      const roleIds = assignedRows.filter((row: any) => row.roles?.is_active === true).map((row: any) => row.role_id);
      // A user may hold several canonical roles. Load defaults for every one so
      // the editor never silently treats a custom role as if it did not exist.
      // Once role IDs/names are known, all remaining dimensions can load in one
      // parallel stage instead of waiting for tabs before starting configs.
      const roleTabsQuery = roleIds.length
        ? (supabase as any).from('role_tab_configs').select('role_id, page_slug, is_blocked').in('role_id', roleIds)
        : Promise.resolve({ data: [], error: null });
      const [roleTabsRes, userColumnsRes, roleColumnsRes, userFiltersRes, roleFiltersRes, userScopesRes, roleScopesRes] = await bounded(Promise.all([
        bounded(roleTabsQuery),
        bounded(supabase.from('column_visibility_config').select('*').eq('user_id', userId)),
        bounded(supabase.from('column_visibility_config').select('*').in('role', roleNames)),
        bounded((supabase as any).from('filter_visibility_config').select('*').eq('user_id', userId)),
        bounded((supabase as any).from('filter_visibility_config').select('*').in('role', roleNames)),
        bounded(supabase.from('data_scope_config').select('*').eq('user_id', userId)),
        bounded(supabase.from('data_scope_config').select('*').in('role', roleNames)),
      ]));
      if (!isCurrent()) return;
       const roleTabsOptional = Boolean(roleTabsRes.error && isOptionalRoleTabsError(roleTabsRes.error));
       if (roleTabsRes.error && !roleTabsOptional) throw roleTabsRes.error;
       const configError = [userColumnsRes, roleColumnsRes, userFiltersRes, roleFiltersRes, userScopesRes, roleScopesRes].find(result => result.error)?.error;
      if (configError) throw configError;
       const tabRows = roleTabsRes.data ?? [];
       if (roleTabsOptional) {
         setLoadWarning('Role tab defaults are unavailable until the access-baseline migration is applied. Individual page and tab overrides remain active.');
       }
      const tabSlugs = new Set<string>(tabRows.map((row: any) => row.page_slug));
      const nextRoleTabBlocks = Object.fromEntries([...tabSlugs].map(slug => [
        slug,
        roleIds.every(id => tabRows.some((row: any) => row.role_id === id && row.page_slug === slug && row.is_blocked)),
      ]));
      const nextPageRoleConfigs = Object.fromEntries(
        (roleConfigRes.data ?? []).map((row: any) => [row.page_slug, row.roles ?? []]),
      );
      const nextRolePermissionKeys = new Set(
        (permissionRes.data ?? []).map((permission: any) => `${permission.resource}:${permission.action}`),
      );
      const nextColumnConfigs = [...(userColumnsRes.data ?? []), ...(roleColumnsRes.data ?? [])];
      const nextFilterConfigs = [...(userFiltersRes.data ?? []), ...(roleFiltersRes.data ?? [])];
      const nextDataScopeRows = [...(userScopesRes.data ?? []), ...(roleScopesRes.data ?? [])];
      // Commit the complete snapshot together. No access slice is changed
      // until every required stage has succeeded and this request is current.
      if (!isCurrent()) return;
      setPageOverrides(pageRes.data ?? []);
      setPermOverrides(permRes.data ?? []);
      setEffectiveRoleNames(roleNames);
      setRoleTabBlocks(nextRoleTabBlocks);
      setColumnConfigs(nextColumnConfigs);
      setFilterConfigs(nextFilterConfigs);
      setDataScopeRows(nextDataScopeRows);
      setPageRoleConfigs(nextPageRoleConfigs);
      setRolePermissionKeys(nextRolePermissionKeys);
      setAccessNow(Date.now());
      setHasLoaded(true);
      hasLoadedRef.current = true;

    } catch (error: any) {
      if (!isCurrent()) return;
      console.error('[SelectedUserAccess] load failed:', {
        userIdPresent: Boolean(userId),
        reason: error?.name === 'AbortError' ? 'aborted' : error?.message?.includes('timed out') ? 'timeout' : 'query_error',
      });
      setLoadError(ACCESS_LOAD_ERROR);
    } finally {
      // Clear the spinner for the latest sequence even if this provider instance
      // is mid StrictMode remount; only skip superseded in-flight loads.
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [userId, userRole]);

  useEffect(() => { load(); }, [load]);

  // ── Derived maps ─────────────────────────────────────────────────────────
  const pageOvMap = useMemo(
    () => Object.fromEntries(pageOverrides
      .filter(o => overrideIsActive(o, accessNow))
      .map(o => [o.page_slug, o])),
    [pageOverrides, accessNow],
  );
  const permOvMap = useMemo(
    () => Object.fromEntries(permOverrides
      .filter(o => overrideIsActive(o, accessNow))
      .map(o => [`${o.resource}:${o.action}`, o.is_granted as boolean])),
    [permOverrides, accessNow],
  );
  const filterUserMap = useMemo(() => Object.fromEntries(filterConfigs.filter(row => row.user_id === userId).map(row => [row.filter_key, row])), [filterConfigs, userId]);

  // ── Effective helpers (see src/lib/effectiveAccess.ts for precedence) ──
  const selectedManifest: CurrentUserAccessManifest = {
    user_id: userId,
    roles: effectiveRoleNames,
    page_role_configs: pageRoleConfigs,
    role_tab_blocks: roleTabBlocks,
    page_overrides: pageOvMap,
    action_overrides: Object.fromEntries(permOverrides.filter(row => overrideIsActive(row, accessNow)).map(row => [`${row.resource}:${row.action}`, row])),
    role_permissions: [...rolePermissionKeys].map(key => { const [resource, action] = key.split(':'); return { resource, action }; }),
    generated_at: '',
  };

  function effectivePage(slug: string): AccessEffect {
    if (effectiveRoleNames.some(isSuperAdminRole)) return 'superadmin';
    if (slug.includes(':')) {
      const blocked = manifestIsTabBlocked(selectedManifest, slug);
      const own = pageOvMap[slug];
      if (blocked) return own?.is_blocked ? 'blocked' : 'role-no';
      return own ? 'granted' : 'role-yes';
    }
    const page = PAGE_DEFS.find(item => item.slug === slug);
    const url = page ? new URL(page.path, 'https://access.local') : null;
    const permission = url ? resolveRoutePermission(url.pathname, url.search, url.hash) : null;
    const decision = evaluateManifestPageAccess(selectedManifest, slug, permission);
    if (decision.source === 'page_override' || decision.source === 'action_override') return decision.allowed ? 'granted' : 'blocked';
    return decision.allowed ? 'role-yes' : 'role-no';
  }
  function effectiveAction(resource: string, action: string): AccessEffect {
    const key = `${resource}:${action}`;
    const explicit = key in permOvMap ? permOvMap[key] : null;
    const roleAllows = rolePermissionKeys.has(key);
    return resolveActionEffect({
      isSuperAdmin: effectiveRoleNames.some(isSuperAdminRole),
      explicitGrant: explicit,
      roleAllows,
    });
  }
  function effectiveFilter(filterKey: string): AccessEffect {
    if (effectiveRoleNames.some(isSuperAdminRole)) return 'superadmin';
    const user = filterUserMap[filterKey];
    if (user) return user.is_hidden ? 'blocked' : 'granted';
    const roleRows = filterConfigs.filter(row => row.role && effectiveRoleNames.includes(row.role) && row.filter_key === filterKey);
    if (roleRows.some(row => row.is_hidden)) return 'blocked';
    if (roleRows.length) return 'role-yes';
    return 'role-yes';
  }
  function explainFilter(filterKey: string): AccessDecisionTrace {
    const effect = effectiveFilter(filterKey);
    if (effect === 'superadmin') return { effect, source: 'super_admin', summary: 'Super Admin bypass keeps this filter visible.' };
    if (filterUserMap[filterKey]) return { effect, source: 'user_override', summary: effect === 'blocked' ? 'Explicit user block hides this filter.' : 'Explicit user grant shows this filter.' };
    if (filterConfigs.some(row => row.role && effectiveRoleNames.includes(row.role) && row.filter_key === filterKey))
      return { effect, source: 'role_default', summary: effect === 'blocked' ? 'Role default hides this filter.' : 'Role default shows this filter.' };
    return { effect, source: 'role_default', summary: 'Registry default shows this filter.' };
  }
  async function toggleFilter(filterKey: string, target: 'user' | 'role' = 'user', roleName = userRole) {
    if ((target === 'user' && effectiveRoleNames.some(isSuperAdminRole)) || (target === 'role' && isSuperAdminRole(roleName))) return;
    setSavingKey(`filter:${target}:${filterKey}`);
    try {
      const existing = filterConfigs.find(row => (target === 'user' ? row.user_id === userId : row.role === roleName) && row.filter_key === filterKey);
      if (existing) {
        const { error } = await (supabase as any).from('filter_visibility_config').delete().eq('id', existing.id);
        if (error) throw error;
       } else {
        const inheritedHidden = target === 'user'
          ? filterConfigs.some(row => row.role && effectiveRoleNames.includes(row.role) && row.filter_key === filterKey && row.is_hidden)
          : false;
        const isHidden = nextFilterOverride(existing, inheritedHidden);
        const { error } = await (supabase as any).from('filter_visibility_config').upsert(target === 'user'
          ? { user_id: userId, role: null, filter_key: filterKey, is_hidden: isHidden, set_by: currentUser?.id ?? null }
          : { user_id: null, role: roleName, filter_key: filterKey, is_hidden: isHidden, set_by: currentUser?.id ?? null });
        if (error) throw error;
      }
      await load();
    } catch (e: any) { toast({ title: 'Unable to save filter visibility', description: e.message, variant: 'destructive' }); }
    finally { setSavingKey(null); }
  }

  function explainPage(slug: string): AccessDecisionTrace {
    const effect = effectivePage(slug);
    const override = pageOvMap[slug];
    if (effect === 'superadmin') {
      return { effect, source: 'super_admin', summary: 'Super Admin bypass grants access.' };
    }
    if (override && ((effect === 'granted' && !override.is_blocked) || (effect === 'blocked' && override.is_blocked))) {
      return {
        effect,
        source: 'user_override',
        summary: `${override.is_blocked
          ? 'Explicit user page block overrides all role defaults.'
          : 'Explicit user page grant overrides the role default.'}${override.reason ? ` Reason: ${override.reason}` : ''}${override.expires_at ? ` Expires ${new Date(override.expires_at).toLocaleString()}.` : ''}`,
      };
    }
    return {
      effect,
      source: effect === 'granted' || effect === 'blocked' ? 'user_override' : 'role_default',
      summary: effect === 'granted' ? 'Allowed by an explicit required action grant.'
        : effect === 'blocked' ? 'Denied by a page dependency, read restriction or required action override.'
        : override && effect === 'role-no' ? 'This page exception cannot grant the required action or open a denied parent page.'
        : effect === 'role-yes'
        ? `Allowed by role default (${effectiveRoleNames.join(', ')}).`
        : `No assigned role grants this page (${effectiveRoleNames.join(', ')}).`,
    };
  }

  function explainAction(resource: string, action: string): AccessDecisionTrace {
    const effect = effectiveAction(resource, action);
    const override = permOverrides.find(item => item.resource === resource && item.action === action
      && (!item.expires_at || new Date(item.expires_at).getTime() > Date.now()));
    if (effect === 'superadmin') {
      return { effect, source: 'super_admin', summary: 'Super Admin bypass grants this action.' };
    }
    if (override) {
      return {
        effect,
        source: 'user_override',
        summary: `${override.is_granted
          ? 'Explicit user action grant overrides the role default.'
          : 'Explicit user action block overrides all role defaults.'}${override.reason ? ` Reason: ${override.reason}` : ''}${override.expires_at ? ` Expires ${new Date(override.expires_at).toLocaleString()}.` : ''}`,
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

  // ── Page toggle (cascades only within configured related families)
  async function togglePage(slug: string) {
    setSavingKey(`page-family:${expandRelatedPageSlugs(slug).slice().sort().join('|')}`);
    const eff = effectivePage(slug);
    const own = pageOvMap[slug];
    const intent = resolvePageToggleIntent(own ? own.is_blocked ? 'blocked' : 'granted' : eff === 'blocked' ? 'role-no' : eff);
    if (intent === 'noop') {
      setSavingKey(null);
      return;
    }
    const targets = expandRelatedPageSlugs(slug);
    const routePermissions = getPageRoutePermissions(targets);
    try {
      if (slug.includes(':')) {
        const { error } = await (supabase as any).rpc('toggle_user_tab_access', {
          p_target_user_id: userId,
          p_tab_slug: slug,
          p_intent: intent,
        });
        if (error) throw error;
        toast({
          title: intent === 'grant' ? 'Tab and parent page granted' : intent === 'block' ? 'Tab blocked' : 'Tab override removed',
          description: intent === 'grant'
            ? 'The parent hub page was enabled so this tab is reachable.'
            : intent === 'clear' ? 'The parent page was left unchanged.' : 'The tab is now hidden.',
        });
      } else if (intent === 'clear') {
        const { error } = await supabase
          .from('page_access_overrides')
          .delete()
          .eq('user_id', userId)
          .in('page_slug', targets);
        if (error) throw error;
        // Action-gated pages (MMP, etc.) stay "Granted" until the admitting
        // user_permission_overrides row is removed too.
        for (const permission of routePermissions) {
          const { error: actionError } = await supabase
            .from('user_permission_overrides')
            .delete()
            .eq('user_id', userId)
            .eq('resource', permission.resource)
            .eq('action', permission.action);
          if (actionError) throw actionError;
        }
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
          reason: null,
          expires_at: null,
          granted_by: currentUser?.id ?? null,
          approved_by: currentUser?.id ?? null,
          approved_at: new Date().toISOString(),
        }));
        const { error } = await supabase
          .from('page_access_overrides')
          .upsert(rows, { onConflict: 'user_id,page_slug' });
        if (error) throw error;
        if (intent === 'grant') {
          for (const permission of routePermissions) {
            const { error: actionError } = await supabase.from('user_permission_overrides').upsert(
              {
                user_id: userId,
                resource: permission.resource,
                action: permission.action,
                is_granted: true,
                reason: null,
                expires_at: null,
                granted_by: currentUser?.id ?? null,
                approved_by: currentUser?.id ?? null,
                approved_at: new Date().toISOString(),
              },
              { onConflict: 'user_id,resource,action' },
            );
            if (actionError) throw actionError;
          }
        }
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
          { user_id: userId, resource, action, is_granted: false, reason: null, expires_at: null, granted_by: currentUser?.id ?? null, approved_by: currentUser?.id ?? null, approved_at: new Date().toISOString() },
          { onConflict: 'user_id,resource,action' },
        );
        if (error) throw error;
        toast({ title: 'Permission blocked', description: `${action} on ${resource} removed.` });
      } else {
        const { error } = await supabase.from('user_permission_overrides').upsert(
          { user_id: userId, resource, action, is_granted: true, reason: null, expires_at: null, granted_by: currentUser?.id ?? null, approved_by: currentUser?.id ?? null, approved_at: new Date().toISOString() },
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
  async function updateOverrideMetadata(kind: 'page' | 'action', id: string, reason: string, expiresAt: string | null): Promise<boolean> {
    setSavingKey(`metadata:${kind}:${id}`);
    try {
      if (effectiveRoleNames.some(isSuperAdminRole)) throw new Error('Super Admin access cannot be overridden.');
      if (expiresAt && (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now())) {
        throw new Error('Choose a future expiry or clear it for a permanent override.');
      }
      const { data, error } = await supabase.from(kind === 'page' ? 'page_access_overrides' : 'user_permission_overrides')
        .update({ reason: reason.trim() || null, expires_at: expiresAt })
        .eq('id', id).eq('user_id', userId).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('Override could not be updated. Refresh and confirm your access.');
      await load();
      toast({ title: 'Override details saved' });
      return true;
    } catch (error: any) {
      toast({ title: 'Unable to save override', description: error.message, variant: 'destructive' });
      return false;
    } finally { setSavingKey(null); }
  }

  async function removeOverride(kind: 'page' | 'action', id: string): Promise<boolean> {
    setSavingKey(`metadata:${kind}:${id}`);
    try {
      if (effectiveRoleNames.some(isSuperAdminRole)) throw new Error('Super Admin access cannot be overridden.');
      const { data, error } = await supabase.from(kind === 'page' ? 'page_access_overrides' : 'user_permission_overrides')
        .delete().eq('id', id).eq('user_id', userId).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('Override could not be removed. Refresh and confirm your access.');
      await load();
      toast({ title: 'Override removed', description: 'Role default restored.' });
      return true;
    } catch (error: any) {
      toast({ title: 'Unable to remove override', description: error.message, variant: 'destructive' });
      return false;
    } finally { setSavingKey(null); }
  }

  async function upsertColumnVisibility(
    pageSlug: string, columnKey: string, isHidden: boolean, target: 'user' | 'role', roleName = userRole,
  ) {
    setSavingKey(`col:${target}:${pageSlug}:${columnKey}`);
    try {
      if ((target === 'user' && effectiveRoleNames.some(isSuperAdminRole)) || (target === 'role' && isSuperAdminRole(roleName))) {
        throw new Error('Super Admin access cannot be overridden.');
      }
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
      const existing = columnConfigs.find(row => row.id === id);
      if (isSuperAdminRole(existing?.role) || (existing?.user_id === userId && effectiveRoleNames.some(isSuperAdminRole))) {
        throw new Error('Super Admin access cannot be overridden.');
      }
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
      if ((target === 'user' && effectiveRoleNames.some(isSuperAdminRole)) || (target === 'role' && isSuperAdminRole(roleName))) {
        throw new Error('Super Admin access cannot be overridden.');
      }
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
      if ((target === 'user' && effectiveRoleNames.some(isSuperAdminRole)) || (target === 'role' && isSuperAdminRole(roleName))) {
        throw new Error('Super Admin access cannot be overridden.');
      }
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
      const existing = dataScopeRows.find(row => row.id === id);
      if (isSuperAdminRole(existing?.role) || (existing?.user_id === userId && effectiveRoleNames.some(isSuperAdminRole))) {
        throw new Error('Super Admin access cannot be overridden.');
      }
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
    loading, loadError, loadWarning, hasLoaded, savingKey,
    pageOverrides, permOverrides, columnConfigs, filterConfigs, dataScopeRows, scopePreview, scopePreviewError, effectiveRoleNames,
    pageOvMap, permOvMap,
    effectivePage, effectiveAction, explainPage, explainAction, effectiveFilter, explainFilter, toggleFilter,
    togglePage, toggleAction, updateOverrideMetadata, removeOverride,
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
