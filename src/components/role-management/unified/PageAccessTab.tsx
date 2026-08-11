import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Search, ChevronRight, ChevronDown, Loader2, Shield,
  Eye, EyeOff, X, Key, Columns, ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PAGE_DEFS, PAGE_GROUPS, hasDefaultAccess } from '@/pages/PageAccessControl';
import { COLUMN_REGISTRY } from '@/lib/column-registry';
import { useSelectedUserAccess } from '@/context/role-management/SelectedUserAccessContext';
import { TabProps, AccessEffect } from './types';

// ── Page → resources mapping (used to surface action overrides inline) ────────
const PAGE_SLUG_TO_RESOURCES: Record<string, string[]> = {
  'cost-submission':      ['cost_submissions'],
  'admin-wallets':        ['wallets'],
  'transaction-scanner':  ['transactions'],
  'site-visits':          ['site_visits'],
  'payroll-admin':        ['payroll', 'hr'],
  'employees':            ['hr'],
  'users':                ['users'],
  'role-management':      ['roles', 'permissions'],
  'finance-hub':          ['finances', 'wallets', 'accounting', 'down_payments'],
  'hr':                   ['hr', 'payroll', 'leave', 'benefits'],
  'accounting':           ['accounting'],
  'pre-funding':          ['pre_funding'],
  'down-payment-tracker': ['down_payments'],
  'projects':             ['projects'],
  'programme-hub':        ['projects', 'portfolio', 'analytics'],
  'field-ops':            ['site_visits', 'safety', 'incidents', 'equipment'],
  'mmp':                  ['mmp'],
  'safety-hub':           ['safety'],
  'incident-reports':     ['incidents'],
  'equipment':            ['equipment'],
  'surveys':              ['surveys'],
  'analytics':            ['analytics'],
  'crm':                  ['crm'],
  'broadcast':            ['broadcast'],
  'whatsapp-admin':       ['whatsapp'],
  'notifications':        ['notifications'],
  'tasks':                ['tasks'],
  'super-admin-hub':      ['system', 'super_admins'],
};

// ── Column label/icon helpers ─────────────────────────────────────────────────
const GROUP_COLORS: Record<string, string> = {
  'My Workspace':         'bg-blue-100 text-blue-700',
  'Communication':        'bg-purple-100 text-purple-700',
  'Programme Management': 'bg-teal-100 text-teal-700',
  'Field Operations':     'bg-amber-100 text-amber-700',
  'Coordination':         'bg-lime-100 text-lime-700',
  'Finance':              'bg-green-100 text-green-700',
  'Accounting':           'bg-emerald-100 text-emerald-700',
  'HR & People':          'bg-pink-100 text-pink-700',
  'Analytics':            'bg-cyan-100 text-cyan-700',
  'Surveys':              'bg-sky-100 text-sky-700',
  'Administration':       'bg-red-100 text-red-700',
  'Super Admin':          'bg-rose-100 text-rose-700',
  'Audit & Security':     'bg-orange-100 text-orange-700',
  'CRM':                  'bg-violet-100 text-violet-700',
};

const EFF_CONFIG: Record<AccessEffect, {
  label: string; dot: string; rowCls: string; btnLabel: string; btnCls: string;
}> = {
  superadmin: { label: 'Full Access',      dot: 'bg-red-400',     rowCls: '',                                                                                btnLabel: '—',             btnCls: 'opacity-30' },
  granted:    { label: 'Granted',          dot: 'bg-emerald-400', rowCls: 'bg-emerald-50/40 border-l-2 border-l-emerald-400 dark:bg-emerald-900/5',          btnLabel: 'Remove Grant',  btnCls: 'text-amber-600 border-amber-200 hover:bg-amber-50' },
  blocked:    { label: 'Blocked',          dot: 'bg-red-400',     rowCls: 'bg-red-50/40 border-l-2 border-l-red-400 dark:bg-red-900/5',                     btnLabel: 'Remove Block',  btnCls: 'text-emerald-600 border-emerald-200 hover:bg-emerald-50' },
  'role-yes': { label: 'Role Default ✓',   dot: 'bg-blue-400',    rowCls: 'bg-blue-50/20 dark:bg-blue-900/5',                                               btnLabel: 'Block for User',btnCls: 'text-red-600 border-red-200 hover:bg-red-50' },
  'role-no':  { label: 'No Access',        dot: 'bg-slate-300',   rowCls: 'opacity-50',                                                                     btnLabel: 'Grant to User', btnCls: 'text-emerald-600 border-emerald-200 hover:bg-emerald-50' },
};

type StatusFilter = 'all' | 'granted' | 'blocked' | 'role-yes' | 'role-no';

// Column-slug to friendly action name (for fine-grained CS overrides shown inline)
const CS_ACTION_LABELS: Record<string, string> = {
  mark_paid: 'Mark Paid', revert_paid: 'Revert Paid', send_to_finance: 'Send to Finance',
  reconcile: 'Reconcile', recall: 'Recall', revert_tier: 'Revert Tier', edit: 'Edit Any',
};

interface PageAccessTabProps extends TabProps {
  onTabChange: (tab: string) => void;
}

export function PageAccessTab({ userRole, isSelectedSuperAdmin, onTabChange, userId }: PageAccessTabProps) {
  const { loading, savingKey, effectivePage, togglePage, columnConfigs, permOverrides, upsertColumnVisibility, removeColumnVisibility } = useSelectedUserAccess();
  const [search, setSearch]               = useState('');
  const [statusFilter, setStatusFilter]   = useState<StatusFilter>('all');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(PAGE_GROUPS.slice(0, 4)));
  const [expandedPages, setExpandedPages]   = useState<Set<string>>(new Set());

  // Build column config lookup per page
  const userColMap = useMemo(() =>
    Object.fromEntries(columnConfigs.filter(c => c.user_id === userId).map(c => [`${c.page_slug}:${c.column_key}`, c])),
    [columnConfigs, userId],
  );
  const roleColMap = useMemo(() =>
    Object.fromEntries(columnConfigs.filter(c => c.role === userRole).map(c => [`${c.page_slug}:${c.column_key}`, c])),
    [columnConfigs, userRole],
  );

  // Column registry by slug for quick lookup
  const colRegBySlug = useMemo(() =>
    Object.fromEntries(COLUMN_REGISTRY.map(p => [p.pageSlug, p])),
    [],
  );

  const filteredPages = useMemo(() => {
    const q = search.toLowerCase();
    return PAGE_DEFS.filter(p => {
      if (q && !p.label.toLowerCase().includes(q) && !p.group.toLowerCase().includes(q)) return false;
      if (statusFilter !== 'all') {
        const eff = effectivePage(p.slug);
        if (eff !== statusFilter) return false;
      }
      return true;
    });
  }, [search, statusFilter, effectivePage]);

  const groupedPages = useMemo(() =>
    PAGE_GROUPS
      .map(g => ({ group: g, pages: filteredPages.filter(p => p.group === g) }))
      .filter(g => g.pages.length > 0),
    [filteredPages],
  );

  // Auto-expand all groups when filtering
  const effectiveExpanded = (search || statusFilter !== 'all')
    ? new Set(groupedPages.map(g => g.group))
    : expandedGroups;

  function toggleGroup(g: string) {
    setExpandedGroups(prev => { const n = new Set(prev); n.has(g) ? n.delete(g) : n.add(g); return n; });
  }

  function togglePageExpand(slug: string) {
    setExpandedPages(prev => { const n = new Set(prev); n.has(slug) ? n.delete(slug) : n.add(slug); return n; });
  }

  const stats = useMemo(() => {
    const accessible = PAGE_DEFS.filter(p => {
      const e = effectivePage(p.slug);
      return e === 'role-yes' || e === 'granted' || e === 'superadmin';
    }).length;
    const blocked = PAGE_DEFS.filter(p => effectivePage(p.slug) === 'blocked').length;
    const granted = PAGE_DEFS.filter(p => effectivePage(p.slug) === 'granted').length;
    return { accessible, blocked, granted };
  }, [effectivePage]);

  if (isSelectedSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-3 text-muted-foreground">
        <Shield className="h-10 w-10 opacity-20" />
        <p className="text-sm font-semibold">Super Admin — All Pages Always Accessible</p>
        <p className="text-xs max-w-xs opacity-70">Super Admins bypass all page access rules.</p>
      </div>
    );
  }

  if (loading) {
    return <div className="p-5 space-y-3">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 rounded-lg" />)}</div>;
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full overflow-hidden">
        {/* Toolbar */}
        <div className="px-5 py-3 border-b flex flex-col sm:flex-row gap-2 items-start sm:items-center bg-card/50">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search pages…" className="pl-8 h-7 text-xs" />
          </div>
          <div className="flex gap-1 flex-wrap">
            {(['all', 'granted', 'blocked', 'role-yes', 'role-no'] as StatusFilter[]).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={cn('px-2.5 py-1 text-[10px] font-medium rounded-full border transition-colors',
                  statusFilter === s ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
                )}>
                {s === 'all'      ? `All (${PAGE_DEFS.length})`
                  : s === 'granted'  ? `Granted (${stats.granted})`
                  : s === 'blocked'  ? `Blocked (${stats.blocked})`
                  : s === 'role-yes' ? 'Role Default ✓'
                  : 'No Access'}
              </button>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="px-5 py-2 border-b bg-muted/20 flex items-center gap-3 text-[10px] text-muted-foreground">
          <span>{stats.accessible} accessible</span>
          <span>·</span>
          <span>{stats.blocked} blocked</span>
          <span>·</span>
          <span>{stats.granted} granted overrides</span>
          <span>·</span>
          <span className="italic opacity-70">Click any page row to see column visibility and action permissions inline</span>
        </div>

        {/* Page list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {groupedPages.length === 0 && (
            <p className="text-center text-xs text-muted-foreground py-10">No pages match your filter</p>
          )}
          {groupedPages.map(({ group, pages }) => {
            const isOpen = effectiveExpanded.has(group);
            const groupAccessible = pages.filter(p => {
              const e = effectivePage(p.slug);
              return e === 'role-yes' || e === 'granted';
            }).length;
            return (
              <div key={group}>
                {/* Group header */}
                <button onClick={() => toggleGroup(group)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-muted/50 rounded-lg transition-colors">
                  {isOpen ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                  <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground flex-1 text-left">{group}</span>
                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', GROUP_COLORS[group] ?? 'bg-slate-100 text-slate-600')}>
                    {groupAccessible}/{pages.length}
                  </span>
                </button>

                {isOpen && (
                  <div className="ml-2 space-y-0.5 mb-1">
                    {pages.map(page => {
                      const eff = effectivePage(page.slug);
                      const cfg = EFF_CONFIG[eff];
                      const saving = savingKey === `page:${page.slug}`;
                      const isExpanded = expandedPages.has(page.slug);

                      // Data for expansion panel
                      const colDef = colRegBySlug[page.slug];
                      const pageResources = PAGE_SLUG_TO_RESOURCES[page.slug] ?? [];
                      const pagePermOverrides = permOverrides.filter(o => pageResources.includes(o.resource));
                      const hasExpandContent = !!colDef || pagePermOverrides.length > 0;

                      // Count of column rules for this page
                      const colRuleCount = (colDef?.columns ?? []).filter(c => {
                        const k = `${page.slug}:${c.key}`;
                        return userColMap[k] || roleColMap[k];
                      }).length;
                      const actionOverrideCount = pagePermOverrides.length;

                      return (
                        <div key={page.slug} className="rounded-lg overflow-hidden">
                          {/* Page row */}
                          <div className={cn('flex items-center gap-2 px-3 py-2 border border-transparent', cfg.rowCls,
                            hasExpandContent && 'cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors'
                          )}
                            onClick={hasExpandContent ? () => togglePageExpand(page.slug) : undefined}
                          >
                            {/* Expand chevron */}
                            <div className="shrink-0 w-3">
                              {hasExpandContent
                                ? (isExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />)
                                : <div className="h-3 w-3" />
                              }
                            </div>
                            <div className={cn('h-2 w-2 rounded-full shrink-0', cfg.dot)} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <p className="text-xs font-medium truncate">{page.label}</p>
                                {/* Column / action badges */}
                                {colRuleCount > 0 && (
                                  <Badge className="text-[9px] h-3.5 px-1 bg-blue-100 text-blue-700 border-0 shrink-0">
                                    <Columns className="h-2 w-2 mr-0.5" />{colRuleCount} col rule{colRuleCount !== 1 ? 's' : ''}
                                  </Badge>
                                )}
                                {actionOverrideCount > 0 && (
                                  <Badge className="text-[9px] h-3.5 px-1 bg-amber-100 text-amber-700 border-0 shrink-0">
                                    <Key className="h-2 w-2 mr-0.5" />{actionOverrideCount} action override{actionOverrideCount !== 1 ? 's' : ''}
                                  </Badge>
                                )}
                              </div>
                              {page.note && (
                                <p className="text-[10px] text-muted-foreground truncate mt-0.5">{page.note}</p>
                              )}
                            </div>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0',
                                  eff === 'granted'   ? 'bg-emerald-100 text-emerald-700' :
                                  eff === 'blocked'   ? 'bg-red-100 text-red-700' :
                                  eff === 'role-yes'  ? 'bg-blue-100 text-blue-700' :
                                  'bg-slate-100 text-slate-500'
                                )}>
                                  {cfg.label}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs max-w-[200px]">
                                <p className="font-mono">{page.path}</p>
                                {page.note && <p className="opacity-70">{page.note}</p>}
                              </TooltipContent>
                            </Tooltip>
                            {/* Grant/Block button — stops propagation so expanding row still works */}
                            <button
                              disabled={saving || eff === 'superadmin'}
                              onClick={e => { e.stopPropagation(); togglePage(page.slug); }}
                              className={cn('text-[10px] border rounded px-2.5 py-1 shrink-0 font-medium transition-colors disabled:opacity-40 min-w-[90px] text-center', cfg.btnCls)}
                            >
                              {saving ? <Loader2 className="h-3 w-3 animate-spin mx-auto" /> : cfg.btnLabel}
                            </button>
                          </div>

                          {/* ── Expanded: column visibility + action overrides ── */}
                          {isExpanded && hasExpandContent && (
                            <div className="ml-6 mb-1.5 border border-t-0 rounded-b-lg overflow-hidden bg-muted/10">
                              {/* Column Visibility section */}
                              {colDef && (
                                <div>
                                  <div className="flex items-center gap-1.5 px-3 py-2 bg-blue-50/60 dark:bg-blue-900/10 border-b">
                                    <Columns className="h-3 w-3 text-blue-600" />
                                    <p className="text-[10px] font-bold uppercase tracking-wide text-blue-700 dark:text-blue-400 flex-1">
                                      Column Visibility
                                    </p>
                                    <p className="text-[9px] text-muted-foreground">
                                      Blue = role default · Purple = this user only
                                    </p>
                                  </div>
                                  {/* Column header */}
                                  <div className="px-3 py-1 grid grid-cols-[1fr_auto_auto] gap-2 text-[9px] font-semibold text-muted-foreground uppercase tracking-wide border-b bg-muted/20">
                                    <span>Column</span>
                                    <span className="w-24 text-center">For all {userRole}s</span>
                                    <span className="w-24 text-center">This user only</span>
                                  </div>
                                  {colDef.columns.map(col => {
                                    const k = `${page.slug}:${col.key}`;
                                    const roleRow = roleColMap[k];
                                    const userRow = userColMap[k];
                                    const roleSaving = savingKey === `col:role:${page.slug}:${col.key}`;
                                    const userSaving = savingKey === `col:user:${page.slug}:${col.key}`;
                                    const roleRemSaving = roleRow ? savingKey === `col:remove:${roleRow.id}` : false;
                                    const userRemSaving = userRow ? savingKey === `col:remove:${userRow.id}` : false;
                                    return (
                                      <div key={col.key} className="px-3 py-1.5 border-b grid grid-cols-[1fr_auto_auto] gap-2 items-center hover:bg-muted/20 last:border-b-0">
                                        <div>
                                          <p className="text-[11px] font-medium">{col.label}</p>
                                          {col.sensitive && (
                                            <Badge className="text-[8px] h-3 px-1 bg-orange-100 text-orange-700 border-0">sensitive</Badge>
                                          )}
                                        </div>
                                        {/* Role column toggle */}
                                        <div className="w-24 flex items-center justify-center gap-1">
                                          {roleRow ? (
                                            <>
                                              <span className={cn('text-[9px] flex items-center gap-0.5',
                                                roleRow.is_hidden ? 'text-red-600' : 'text-emerald-600'
                                              )}>
                                                {roleRow.is_hidden ? <EyeOff className="h-2.5 w-2.5" /> : <Eye className="h-2.5 w-2.5" />}
                                                {roleRow.is_hidden ? 'Hidden' : 'Visible'}
                                              </span>
                                              <button disabled={roleRemSaving} onClick={() => removeColumnVisibility(roleRow.id)}
                                                className="text-muted-foreground hover:text-destructive disabled:opacity-40">
                                                {roleRemSaving ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <X className="h-2.5 w-2.5" />}
                                              </button>
                                            </>
                                          ) : (
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <button disabled={roleSaving}
                                                  onClick={e => { e.stopPropagation(); upsertColumnVisibility(page.slug, col.key, true, 'role'); }}
                                                  className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 border rounded text-red-600 border-red-200 hover:bg-red-50 disabled:opacity-40">
                                                  {roleSaving ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <EyeOff className="h-2.5 w-2.5" />}
                                                  Hide
                                                </button>
                                              </TooltipTrigger>
                                              <TooltipContent className="text-xs">Hide for all {userRole}s</TooltipContent>
                                            </Tooltip>
                                          )}
                                        </div>
                                        {/* User column toggle */}
                                        <div className="w-24 flex items-center justify-center gap-1">
                                          {userRow ? (
                                            <>
                                              <span className={cn('text-[9px] flex items-center gap-0.5',
                                                userRow.is_hidden ? 'text-red-600' : 'text-emerald-600'
                                              )}>
                                                {userRow.is_hidden ? <EyeOff className="h-2.5 w-2.5" /> : <Eye className="h-2.5 w-2.5" />}
                                                {userRow.is_hidden ? 'Hidden' : 'Visible'}
                                              </span>
                                              <button disabled={userRemSaving} onClick={() => removeColumnVisibility(userRow.id)}
                                                className="text-muted-foreground hover:text-destructive disabled:opacity-40">
                                                {userRemSaving ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <X className="h-2.5 w-2.5" />}
                                              </button>
                                            </>
                                          ) : (
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <button disabled={userSaving}
                                                  onClick={e => { e.stopPropagation(); upsertColumnVisibility(page.slug, col.key, true, 'user'); }}
                                                  className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 border rounded text-red-600 border-red-200 hover:bg-red-50 disabled:opacity-40">
                                                  {userSaving ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <EyeOff className="h-2.5 w-2.5" />}
                                                  Hide
                                                </button>
                                              </TooltipTrigger>
                                              <TooltipContent className="text-xs">Hide only for this user</TooltipContent>
                                            </Tooltip>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {/* Action Overrides section */}
                              {pagePermOverrides.length > 0 && (
                                <div>
                                  <div className="flex items-center gap-1.5 px-3 py-2 bg-amber-50/60 dark:bg-amber-900/10 border-b border-t">
                                    <Key className="h-3 w-3 text-amber-600" />
                                    <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400 flex-1">
                                      Active Action Overrides
                                    </p>
                                    <button
                                      onClick={e => { e.stopPropagation(); onTabChange('permissions'); }}
                                      className="flex items-center gap-0.5 text-[9px] text-primary hover:underline"
                                    >
                                      Manage all <ArrowRight className="h-2.5 w-2.5" />
                                    </button>
                                  </div>
                                  <div className="px-3 py-2 flex flex-wrap gap-1.5">
                                    {pagePermOverrides.map(o => (
                                      <span key={o.id} className={cn(
                                        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border',
                                        o.is_granted
                                          ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                          : 'bg-red-50 text-red-700 border-red-300'
                                      )}>
                                        {o.is_granted ? '✓' : '✗'}
                                        {CS_ACTION_LABELS[o.action] ?? o.action}
                                        <span className="opacity-60">({o.resource})</span>
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Footer link when no active overrides but page has resources */}
                              {pagePermOverrides.length === 0 && pageResources.length > 0 && (
                                <div className="px-3 py-2 flex items-center gap-1.5 border-t">
                                  <Key className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-[10px] text-muted-foreground">No action overrides for this page.</span>
                                  <button
                                    onClick={e => { e.stopPropagation(); onTabChange('permissions'); }}
                                    className="flex items-center gap-0.5 text-[9px] text-primary hover:underline ml-1"
                                  >
                                    Add in Permissions <ArrowRight className="h-2.5 w-2.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}
