/**
 * SuperAdminPageAccessPanel
 * Embedded inside the Super Admin Hub → Permissions & Audit → "Page Grants" tab.
 *
 * Lets super admins:
 *  1. Grant / revoke a user's access to the Super Admin Hub itself
 *  2. Show / hide individual tabs within the hub for that user
 *  3. Grant content-level access for tabs that have component-level guards (data-management)
 *
 * Data model:
 *  - Hub-level grant  : page_access_overrides { page_slug: 'super-admin-hub', is_blocked: false }
 *  - Tab visibility   : page_access_overrides { page_slug: 'super-admin-hub:{tabId}', is_blocked: true/false }
 *  - Content grant    : page_access_overrides { page_slug: '{pageSlug}', is_blocked: false }
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSuperAdmin } from '@/context/superAdmin/SuperAdminContext';
import { useUser } from '@/context/user/UserContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { HUB_TAB_REGISTRY } from '@/lib/hub-tab-defs';
import {
  Shield, Search, CheckCircle2, XCircle, Loader2, Users,
  Eye, EyeOff, Lock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toDisplayLabel } from '@/utils/roleMapping';

// ── Constants ────────────────────────────────────────────────────────────────
const HUB_SLUG = 'super-admin-hub';
const SA_HUB   = HUB_TAB_REGISTRY.find(h => h.hubSlug === HUB_SLUG)!;

/**
 * Tabs that additionally have a component-level canSeePageWithOverrides() guard.
 * The tab visibility override controls whether the tab APPEARS in the hub nav.
 * The page-slug grant controls whether the component CONTENT renders for that user.
 * Both are required for full access.
 */
const PAGE_GUARDED_TABS: Record<string, string> = {
  'data-management': 'data-management',
};

// ── Types ────────────────────────────────────────────────────────────────────
type AccessStatus = 'granted' | 'blocked' | 'default';
interface Override { id: string; page_slug: string; is_blocked: boolean }

// ── StatusBadge helper ────────────────────────────────────────────────────────
function StatusBadge({ status, small }: { status: AccessStatus; small?: boolean }) {
  const cls = small ? 'text-[10px] px-1.5 py-0' : 'text-xs';
  if (status === 'granted')
    return <Badge className={cn(cls, 'bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-400')}>Granted</Badge>;
  if (status === 'blocked')
    return <Badge className={cn(cls, 'bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/10')}>Hidden</Badge>;
  return <Badge variant="outline" className={cls}>Default</Badge>;
}

// ── Main component ────────────────────────────────────────────────────────────
export function SuperAdminPageAccessPanel() {
  const { isSuperAdmin }     = useSuperAdmin();
  const { users, currentUser } = useUser();

  // Super-admins AND admin/ICT roles can manage page grants.
  // (The destructive data operations inside each guarded page still have their
  //  own isSuperAdmin checks — this panel only controls *who can see* a tab.)
  const canManageGrants = isSuperAdmin || ['admin', 'ict'].includes(currentUser?.role ?? '');
  const { toast }            = useToast();

  const [search,       setSearch]       = useState('');
  const [selectedId,   setSelectedId]   = useState<string | null>(null);
  const [overrides,    setOverrides]    = useState<Override[]>([]);
  const [loadingOv,    setLoadingOv]    = useState(false);
  const [savingSlug,   setSavingSlug]   = useState<string | null>(null);

  // Eligible users: everyone who isn't a super admin or deactivated
  const eligibleUsers = useMemo(() =>
    (users ?? [])
      .filter(u => u.role !== 'superAdmin' && !u.deactivated && u.id !== currentUser?.id)
      .filter(u => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          u.full_name?.toLowerCase().includes(q) ||
          u.email?.toLowerCase().includes(q) ||
          (u.role ?? '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (a.full_name ?? a.email ?? '').localeCompare(b.full_name ?? b.email ?? '')),
    [users, search, currentUser?.id],
  );

  const selectedUser = useMemo(() => users?.find(u => u.id === selectedId), [users, selectedId]);

  // ── Load overrides for selected user ────────────────────────────────────────
  const loadOverrides = useCallback(async () => {
    if (!selectedId) { setOverrides([]); return; }
    setLoadingOv(true);
    try {
      const { data } = await supabase
        .from('page_access_overrides')
        .select('id, page_slug, is_blocked')
        .eq('user_id', selectedId);
      setOverrides((data ?? []) as Override[]);
    } catch { /* silent */ }
    finally { setLoadingOv(false); }
  }, [selectedId]);

  useEffect(() => { loadOverrides(); }, [loadOverrides]);

  // ── Access helpers ───────────────────────────────────────────────────────────
  const getOverride = (slug: string) => overrides.find(o => o.page_slug === slug);

  function statusFor(slug: string): AccessStatus {
    const ov = getOverride(slug);
    if (!ov) return 'default';
    return ov.is_blocked ? 'blocked' : 'granted';
  }

  const hubStatus = statusFor(HUB_SLUG);

  // ── DB operations ────────────────────────────────────────────────────────────
  async function upsertOverride(slug: string, isBlocked: boolean, label?: string) {
    if (!selectedId) return;
    setSavingSlug(slug);
    try {
      const existing = getOverride(slug);
      if (existing) {
        await supabase.from('page_access_overrides').update({ is_blocked: isBlocked, granted_by: currentUser?.id }).eq('id', existing.id);
      } else {
        await supabase.from('page_access_overrides').insert({
          page_slug: slug,
          user_id:   selectedId,
          is_blocked: isBlocked,
          level:      isBlocked ? 'view' : 'manage',
          granted_by: currentUser?.id,
        });
      }
      toast({
        title: isBlocked ? 'Tab hidden' : 'Access granted',
        description: `${selectedUser?.full_name ?? 'User'} — ${label ?? slug}`,
      });
      await loadOverrides();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setSavingSlug(null); }
  }

  async function removeOverride(slug: string, label?: string) {
    if (!selectedId) return;
    setSavingSlug(slug);
    try {
      const existing = getOverride(slug);
      if (existing) {
        await supabase.from('page_access_overrides').delete().eq('id', existing.id);
      }
      toast({ title: 'Restored to default', description: `${selectedUser?.full_name ?? 'User'} — ${label ?? slug}` });
      await loadOverrides();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setSavingSlug(null); }
  }

  // ── Access guard ─────────────────────────────────────────────────────────────
  if (!canManageGrants) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center space-y-4">
            <Shield className="h-16 w-16 text-destructive mx-auto" />
            <h2 className="text-2xl font-bold">Access Denied</h2>
            <p className="text-muted-foreground">Only super-admins and admins can manage page access grants.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex gap-4 h-[calc(100vh-200px)] p-4 md:p-6">

      {/* ── Left: User picker ─────────────────────────────────────────────── */}
      <div className="w-72 flex flex-col gap-3 shrink-0">
        <div>
          <h2 className="text-sm font-semibold mb-1">Select User</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Name, email, or role…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-1 rounded-lg border bg-muted/20 p-1 min-h-0">
          {eligibleUsers.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No users found</p>
          )}
          {eligibleUsers.map(u => {
            const isSelected = selectedId === u.id;
            const initials = (u.full_name ?? u.email ?? '?').slice(0, 1).toUpperCase();
            // Quick hub-access indicator in the list
            const { data: _ov } = { data: overrides }; // just trigger memo dep
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => setSelectedId(u.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-colors',
                  isSelected
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted',
                )}
              >
                <div className={cn(
                  'h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                  isSelected ? 'bg-white/20 text-white' : 'bg-primary/15 text-primary',
                )}>
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{u.full_name ?? u.email}</p>
                  <p className={cn('text-xs truncate', isSelected ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                    {toDisplayLabel(u.role ?? '')}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground text-center">
          {eligibleUsers.length} users · Super Admins excluded
        </p>
      </div>

      {/* ── Right: Access controls ────────────────────────────────────────── */}
      {!selectedId ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3 text-muted-foreground">
            <Users className="h-14 w-14 mx-auto opacity-20" />
            <p className="text-sm">Select a user on the left to manage their Super Admin Hub access</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-4 min-h-0">

          {/* User header */}
          <div className="flex items-center gap-3 pb-2 border-b">
            <div className="h-10 w-10 rounded-full bg-primary/15 flex items-center justify-center font-bold text-primary">
              {(selectedUser?.full_name ?? selectedUser?.email ?? '?').slice(0, 1).toUpperCase()}
            </div>
            <div>
              <p className="font-semibold">{selectedUser?.full_name ?? selectedUser?.email}</p>
              <p className="text-sm text-muted-foreground">
                {toDisplayLabel(selectedUser?.role ?? '')} · {selectedUser?.email}
              </p>
            </div>
          </div>

          {loadingOv ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}
            </div>
          ) : (
            <>
              {/* ── Hub-level access ────────────────────────────────────────── */}
              <Card className={cn(
                'border-2 transition-colors',
                hubStatus === 'granted'  ? 'border-emerald-400/60 dark:border-emerald-600/50' :
                hubStatus === 'blocked'  ? 'border-destructive/50' :
                'border-border',
              )}>
                <CardHeader className="pb-3 pt-4 px-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary" />
                    Super Admin Hub — Hub Access
                    <StatusBadge status={hubStatus} />
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    {hubStatus === 'granted'
                      ? 'This user has been explicitly granted access to navigate to the Super Admin Hub.'
                      : hubStatus === 'blocked'
                        ? 'This user has been explicitly blocked from the Super Admin Hub.'
                        : 'By default, only Super Admins can reach this hub. Grant access below to allow this user to enter.'}
                  </p>
                </CardHeader>
                <CardContent className="px-4 pb-4 flex flex-wrap gap-2">
                  {hubStatus !== 'granted' && (
                    <Button
                      type="button" size="sm" className="gap-1.5"
                      disabled={savingSlug === HUB_SLUG}
                      onClick={() => upsertOverride(HUB_SLUG, false, 'Super Admin Hub')}
                    >
                      {savingSlug === HUB_SLUG
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <CheckCircle2 className="h-3 w-3" />}
                      Grant Hub Access
                    </Button>
                  )}
                  {hubStatus === 'granted' && (
                    <Button
                      type="button" size="sm" variant="destructive" className="gap-1.5"
                      disabled={savingSlug === HUB_SLUG}
                      onClick={() => removeOverride(HUB_SLUG, 'Super Admin Hub')}
                    >
                      {savingSlug === HUB_SLUG
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <XCircle className="h-3 w-3" />}
                      Revoke Hub Access
                    </Button>
                  )}
                  {hubStatus !== 'default' && hubStatus !== 'granted' && (
                    <Button
                      type="button" size="sm" variant="outline" className="gap-1.5"
                      disabled={savingSlug === HUB_SLUG}
                      onClick={() => removeOverride(HUB_SLUG, 'Super Admin Hub')}
                    >
                      Restore Default
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* ── Per-section tab controls ─────────────────────────────── */}
              <p className="text-xs text-muted-foreground px-1">
                Below you can show or hide individual tabs within the Super Admin Hub for this user.
                Tabs are <strong>visible by default</strong> once the user has hub access.
                Use "Hide Tab" to restrict specific sections.
              </p>

              {SA_HUB.sections.map(section => (
                <Card key={section.sectionId}>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">
                      {section.sectionLabel}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-2">
                    {section.tabs.map(tab => {
                      const tabSlug   = `${HUB_SLUG}:${tab.tabId}`;
                      const status    = statusFor(tabSlug);
                      const isSaving  = savingSlug === tabSlug;

                      // Page-guarded tabs (component-level content gate)
                      const pageSlug  = PAGE_GUARDED_TABS[tab.tabId];
                      const pageStatus = pageSlug ? statusFor(pageSlug) : null;
                      const pageGranted = pageStatus === 'granted';

                      return (
                        <div
                          key={tab.tabId}
                          className={cn(
                            'flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors',
                            status === 'blocked'
                              ? 'bg-destructive/5 border-destructive/20 dark:bg-destructive/10'
                              : 'bg-muted/30 border-transparent',
                          )}
                        >
                          {/* Tab info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-sm font-medium">{tab.label}</span>
                              <StatusBadge status={status} small />
                              {pageSlug && (
                                <span className={cn(
                                  'text-[10px] px-1.5 py-0 rounded font-medium border',
                                  pageGranted
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400'
                                    : 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400',
                                )}>
                                  Content: {pageGranted ? 'Granted' : 'Role default'}
                                </span>
                              )}
                            </div>
                            {tab.description && (
                              <p className="text-xs text-muted-foreground mt-0.5 truncate">{tab.description}</p>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex gap-1.5 shrink-0">
                            {status === 'blocked' ? (
                              <Button
                                type="button" size="sm" variant="outline"
                                className="gap-1 h-7 text-xs"
                                disabled={isSaving}
                                onClick={() => removeOverride(tabSlug, tab.label)}
                              >
                                {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
                                Restore
                              </Button>
                            ) : (
                              <Button
                                type="button" size="sm" variant="outline"
                                className="gap-1 h-7 text-xs text-destructive hover:text-destructive hover:border-destructive/50"
                                disabled={isSaving}
                                onClick={() => upsertOverride(tabSlug, true, tab.label)}
                              >
                                {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <EyeOff className="h-3 w-3" />}
                                Hide Tab
                              </Button>
                            )}

                            {/* Content grant for page-guarded tabs */}
                            {pageSlug && !pageGranted && (
                              <Button
                                type="button" size="sm" variant="outline"
                                className="gap-1 h-7 text-xs"
                                disabled={savingSlug === pageSlug}
                                onClick={() => upsertOverride(pageSlug, false, `${tab.label} (content)`)}
                              >
                                {savingSlug === pageSlug
                                  ? <Loader2 className="h-3 w-3 animate-spin" />
                                  : <Lock className="h-3 w-3" />}
                                Grant Content
                              </Button>
                            )}
                            {pageSlug && pageGranted && (
                              <Button
                                type="button" size="sm" variant="outline"
                                className="gap-1 h-7 text-xs text-muted-foreground"
                                disabled={savingSlug === pageSlug}
                                onClick={() => removeOverride(pageSlug, `${tab.label} (content)`)}
                              >
                                {savingSlug === pageSlug
                                  ? <Loader2 className="h-3 w-3 animate-spin" />
                                  : <XCircle className="h-3 w-3" />}
                                Revoke Content
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
