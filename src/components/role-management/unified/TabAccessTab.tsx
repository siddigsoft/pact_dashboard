import { useState, useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Layers, Shield, AlertTriangle, Loader2, ChevronDown, ChevronRight, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { HUB_TAB_REGISTRY, hubTabSlug } from '@/lib/hub-tab-defs';
import { PAGE_DEFS, hasDefaultAccess } from '@/pages/PageAccessControl';
import { useSelectedUserAccess } from '@/context/role-management/SelectedUserAccessContext';
import { TabProps, AccessEffect } from './types';

const EFF_CONFIG: Record<AccessEffect, { label: string; dot: string; rowCls: string; btnLabel: string; btnCls: string }> = {
  superadmin: { label: 'Full Access', dot: 'bg-red-400',     rowCls: '', btnLabel: '—', btnCls: 'opacity-30' },
  granted:    { label: 'Visible',     dot: 'bg-emerald-400', rowCls: 'bg-emerald-50/30 border-l-2 border-l-emerald-400 dark:bg-emerald-900/5', btnLabel: 'Remove Grant', btnCls: 'text-amber-600 border-amber-200 hover:bg-amber-50' },
  blocked:    { label: 'Hidden',      dot: 'bg-red-400',     rowCls: 'bg-red-50/30 border-l-2 border-l-red-400 dark:bg-red-900/5 opacity-60', btnLabel: 'Restore Tab',  btnCls: 'text-emerald-600 border-emerald-200 hover:bg-emerald-50' },
  'role-yes': { label: 'Visible (default)', dot: 'bg-blue-300', rowCls: '', btnLabel: 'Hide Tab',   btnCls: 'text-red-600 border-red-200 hover:bg-red-50' },
  'role-no':  { label: 'No Access',   dot: 'bg-slate-300',   rowCls: 'opacity-45',                                                            btnLabel: 'Show Tab',   btnCls: 'text-emerald-600 border-emerald-200 hover:bg-emerald-50' },
};

export function TabAccessTab({ userRole, isSelectedSuperAdmin }: TabProps) {
  const { loading, savingKey, effectivePage, togglePage, pageOvMap } = useSelectedUserAccess();
  const [selectedHub, setSelectedHub] = useState(HUB_TAB_REGISTRY[0]?.hubSlug ?? '');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['all']));

  const hub = useMemo(() => HUB_TAB_REGISTRY.find(h => h.hubSlug === selectedHub) ?? HUB_TAB_REGISTRY[0], [selectedHub]);

  // Check if the parent hub page itself is accessible to this user
  const hubPageDef = PAGE_DEFS.find(p => p.slug === hub?.hubSlug);
  const hubPageOv = pageOvMap[hub?.hubSlug ?? ''];
  const hubPageBlocked = hubPageOv?.is_blocked === true;
  const hubPageGranted = hubPageOv && !hubPageOv.is_blocked;
  const hubPageByRole = hubPageDef ? hasDefaultAccess(hubPageDef, userRole) : false;
  const hubPageAccessible = !hubPageBlocked && (hubPageGranted || hubPageByRole);

  // Count overrides for display
  const overrideCount = useMemo(() => {
    if (!hub) return 0;
    return hub.sections.flatMap(s => s.tabs).filter(t => {
      const slug = hubTabSlug(hub.hubSlug, t.tabId);
      return pageOvMap[slug] !== undefined;
    }).length;
  }, [hub, pageOvMap]);

  function toggleSection(id: string) {
    setExpandedSections(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  if (isSelectedSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-3 text-muted-foreground">
        <Shield className="h-10 w-10 opacity-20" />
        <p className="text-sm font-semibold">Super Admin — All Tabs Always Accessible</p>
        <p className="text-xs max-w-xs opacity-70">Super Admins bypass all tab access rules.</p>
      </div>
    );
  }

  if (loading) {
    return <div className="p-5 space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-10 rounded-lg" />)}</div>;
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full overflow-hidden">
        {/* Hub selector */}
        <div className="px-5 py-3 border-b bg-card/50 flex items-center gap-3">
          <Layers className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="flex-1 max-w-xs">
            <Select value={selectedHub} onValueChange={setSelectedHub}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select a hub…" />
              </SelectTrigger>
              <SelectContent>
                {HUB_TAB_REGISTRY.map(h => (
                  <SelectItem key={h.hubSlug} value={h.hubSlug} className="text-xs">
                    {h.hubLabel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {overrideCount > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              {overrideCount} override{overrideCount !== 1 ? 's' : ''} active
            </Badge>
          )}
        </div>

        {/* Hub page access warning */}
        {!hubPageAccessible && (
          <div className="mx-5 mt-3 flex items-center gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs dark:bg-amber-900/20 dark:border-amber-800/30 dark:text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>
              <strong>Note:</strong> This user can't reach {hub?.hubLabel} (page access is blocked or not granted). Tab settings below won't have effect until the parent page is accessible.
              <a href="#" className="underline ml-1" onClick={e => { e.preventDefault(); }}>→ Fix in Page Access tab</a>
            </span>
          </div>
        )}

        {/* How it works note */}
        <div className="mx-5 mt-3 flex items-start gap-2 p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-xs dark:bg-blue-900/20 dark:border-blue-800/30 dark:text-blue-300">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            Tabs are <strong>visible by default</strong> to anyone who can access the hub. Use "Hide Tab" to remove specific tabs from this user's view. "Restore Tab" removes the override and returns to the default.
          </span>
        </div>

        {/* Tab list */}
        <div className="flex-1 overflow-y-auto p-3 mt-2 space-y-1">
          {hub?.sections.map(section => {
            const isOpen = expandedSections.has('all') || expandedSections.has(section.sectionId);
            const hiddenCount = section.tabs.filter(t =>
              effectivePage(hubTabSlug(hub.hubSlug, t.tabId)) === 'blocked'
            ).length;

            return (
              <div key={section.sectionId}>
                <button onClick={() => toggleSection(section.sectionId)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-muted/50 rounded-lg transition-colors">
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground flex-1 text-left">
                    {section.sectionLabel}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{section.tabs.length} tabs</span>
                  {hiddenCount > 0 && (
                    <Badge className="text-[9px] px-1.5 bg-red-100 text-red-700 border-0 h-4">
                      {hiddenCount} hidden
                    </Badge>
                  )}
                </button>

                <div className="ml-2 space-y-0.5 mb-1">
                  {section.tabs.map(tab => {
                    const slug = hubTabSlug(hub.hubSlug, tab.tabId);
                    const eff = effectivePage(slug);
                    const cfg = EFF_CONFIG[eff];
                    const saving = savingKey === `page:${slug}`;

                    return (
                      <div key={tab.tabId}
                        className={cn('flex items-center gap-2 px-3 py-2 rounded-lg border border-transparent', cfg.rowCls)}>
                        <div className={cn('h-2 w-2 rounded-full shrink-0', cfg.dot)} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium">{tab.label}</p>
                          {tab.description && (
                            <p className="text-[10px] text-muted-foreground truncate">{tab.description}</p>
                          )}
                        </div>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0',
                              eff === 'blocked' ? 'bg-red-100 text-red-700' :
                              eff === 'granted' ? 'bg-emerald-100 text-emerald-700' :
                              eff === 'role-yes' ? 'bg-blue-100 text-blue-700' :
                              'bg-slate-100 text-slate-500'
                            )}>
                              {cfg.label}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="text-xs">
                            <p className="font-mono">{slug}</p>
                          </TooltipContent>
                        </Tooltip>
                        <button
                          disabled={saving || eff === 'superadmin'}
                          onClick={() => togglePage(slug)}
                          className={cn('text-[10px] border rounded px-2.5 py-1 shrink-0 font-medium transition-colors disabled:opacity-40 min-w-[90px] text-center', cfg.btnCls)}
                        >
                          {saving ? <Loader2 className="h-3 w-3 animate-spin mx-auto" /> : cfg.btnLabel}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}
