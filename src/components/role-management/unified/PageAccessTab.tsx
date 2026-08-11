import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Search, ChevronRight, ChevronDown, Loader2, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PAGE_DEFS, PAGE_GROUPS, hasDefaultAccess } from '@/pages/PageAccessControl';
import { useSelectedUserAccess } from '@/context/role-management/SelectedUserAccessContext';
import { TabProps, AccessEffect } from './types';

const GROUP_COLORS: Record<string, string> = {
  'My Workspace':       'bg-blue-100 text-blue-700',
  'Communication':      'bg-purple-100 text-purple-700',
  'Programme Management': 'bg-teal-100 text-teal-700',
  'Field Operations':   'bg-amber-100 text-amber-700',
  'Coordination':       'bg-lime-100 text-lime-700',
  'Finance':            'bg-green-100 text-green-700',
  'Accounting':         'bg-emerald-100 text-emerald-700',
  'HR & People':        'bg-pink-100 text-pink-700',
  'Analytics':          'bg-cyan-100 text-cyan-700',
  'Surveys':            'bg-sky-100 text-sky-700',
  'Administration':     'bg-red-100 text-red-700',
  'Super Admin':        'bg-rose-100 text-rose-700',
  'Audit & Security':   'bg-orange-100 text-orange-700',
  'CRM':                'bg-violet-100 text-violet-700',
};

const EFF_CONFIG: Record<AccessEffect, { label: string; dot: string; rowCls: string; btnLabel: string; btnCls: string }> = {
  superadmin: { label: 'Full Access', dot: 'bg-red-400', rowCls: '', btnLabel: '—', btnCls: 'opacity-30' },
  granted:    { label: 'Granted',     dot: 'bg-emerald-400', rowCls: 'bg-emerald-50/40 border-l-2 border-l-emerald-400 dark:bg-emerald-900/5', btnLabel: 'Remove Grant', btnCls: 'text-amber-600 border-amber-200 hover:bg-amber-50' },
  blocked:    { label: 'Blocked',     dot: 'bg-red-400',     rowCls: 'bg-red-50/40 border-l-2 border-l-red-400 dark:bg-red-900/5',           btnLabel: 'Remove Block', btnCls: 'text-emerald-600 border-emerald-200 hover:bg-emerald-50' },
  'role-yes': { label: 'Role Default ✓', dot: 'bg-blue-400', rowCls: 'bg-blue-50/20 dark:bg-blue-900/5',                                  btnLabel: 'Block for User', btnCls: 'text-red-600 border-red-200 hover:bg-red-50' },
  'role-no':  { label: 'No Access',   dot: 'bg-slate-300',   rowCls: 'opacity-50',                                                           btnLabel: 'Grant to User', btnCls: 'text-emerald-600 border-emerald-200 hover:bg-emerald-50' },
};

type StatusFilter = 'all' | 'granted' | 'blocked' | 'role-yes' | 'role-no';

export function PageAccessTab({ userRole, isSelectedSuperAdmin }: TabProps) {
  const { loading, savingKey, effectivePage, togglePage } = useSelectedUserAccess();
  const [search, setSearch]           = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(PAGE_GROUPS.slice(0, 4)));

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

  // Stats
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
        <p className="text-xs max-w-xs opacity-70">Super Admins bypass all page access rules. No overrides can be applied.</p>
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
                {s === 'all' ? `All (${PAGE_DEFS.length})`
                  : s === 'granted' ? `Granted (${stats.granted})`
                  : s === 'blocked' ? `Blocked (${stats.blocked})`
                  : s === 'role-yes' ? `Role Default ✓`
                  : 'No Access'}
              </button>
            ))}
          </div>
        </div>

        {/* Stats bar */}
        <div className="px-5 py-2 border-b bg-muted/20 flex items-center gap-3 text-[10px] text-muted-foreground">
          <span>{stats.accessible} accessible</span>
          <span>·</span>
          <span>{stats.blocked} blocked overrides</span>
          <span>·</span>
          <span>{stats.granted} granted overrides</span>
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
                      return (
                        <div key={page.slug}
                          className={cn('flex items-center gap-2 px-3 py-2 rounded-lg border border-transparent', cfg.rowCls)}>
                          <div className={cn('h-2 w-2 rounded-full shrink-0', cfg.dot)} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{page.label}</p>
                            {page.note && (
                              <p className="text-[10px] text-muted-foreground truncate">{page.note}</p>
                            )}
                          </div>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0',
                                eff === 'granted' ? 'bg-emerald-100 text-emerald-700' :
                                eff === 'blocked' ? 'bg-red-100 text-red-700' :
                                eff === 'role-yes' ? 'bg-blue-100 text-blue-700' :
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
                          <button
                            disabled={saving || eff === 'superadmin'}
                            onClick={() => togglePage(page.slug)}
                            className={cn('text-[10px] border rounded px-2.5 py-1 shrink-0 font-medium transition-colors disabled:opacity-40 min-w-[90px] text-center', cfg.btnCls)}
                          >
                            {saving ? <Loader2 className="h-3 w-3 animate-spin mx-auto" /> : cfg.btnLabel}
                          </button>
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
