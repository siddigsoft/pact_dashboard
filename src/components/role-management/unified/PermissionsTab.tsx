import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Search, Shield, ChevronDown, ChevronRight, Loader2,
  Key, Columns, Eye, EyeOff, CheckCircle2, XCircle, MinusCircle, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MODULE_REGISTRY } from '@/types/moduleRegistry';
import { ResourceType, ActionType } from '@/types/roles';
import { COLUMN_REGISTRY } from '@/lib/column-registry';
import { useSelectedUserAccess } from '@/context/role-management/SelectedUserAccessContext';
import { TabProps, AccessEffect } from './types';

const ACTION_LABELS: Partial<Record<ActionType, string>> = {
  read: 'View', create: 'Create', update: 'Edit', delete: 'Delete',
  approve: 'Approve', export: 'Export',
};
const ACTION_ICONS: Partial<Record<ActionType, any>> = {
  read: Eye, create: CheckCircle2, update: Key, delete: XCircle,
  approve: CheckCircle2, export: Columns,
};

function StatusIcon({ eff, small }: { eff: AccessEffect; small?: boolean }) {
  const sz = small ? 'h-3 w-3' : 'h-3.5 w-3.5';
  if (eff === 'superadmin' || eff === 'granted' || eff === 'role-yes')
    return <CheckCircle2 className={cn(sz, eff === 'granted' ? 'text-emerald-500' : eff === 'role-yes' ? 'text-blue-400' : 'text-red-400')} />;
  if (eff === 'blocked') return <XCircle className={cn(sz, 'text-red-500')} />;
  return <MinusCircle className={cn(sz, 'text-slate-300')} />;
}

export function PermissionsTab({ userId, userRole, isSelectedSuperAdmin }: TabProps) {
  const { loading, savingKey, effectiveAction, toggleAction, columnConfigs, upsertColumnVisibility, removeColumnVisibility } = useSelectedUserAccess();
  const [activeSection, setActiveSection] = useState<'actions' | 'columns'>('actions');
  const [moduleSearch, setModuleSearch] = useState('');
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [selectedPage, setSelectedPage] = useState(COLUMN_REGISTRY[0]?.pageSlug ?? '');

  function toggleModule(m: string) {
    setExpandedModules(prev => { const n = new Set(prev); n.has(m) ? n.delete(m) : n.add(m); return n; });
  }

  const filteredModules = useMemo(() => {
    if (!moduleSearch) return MODULE_REGISTRY;
    const q = moduleSearch.toLowerCase();
    return MODULE_REGISTRY.map(mod => ({
      ...mod,
      pages: mod.pages.map(pg => ({
        ...pg,
        actions: pg.actions.filter(a =>
          a.label.toLowerCase().includes(q) ||
          a.resource.toLowerCase().includes(q) ||
          a.description?.toLowerCase().includes(q)
        ),
      })).filter(pg => pg.actions.length > 0 || pg.page.toLowerCase().includes(q)),
    })).filter(mod => mod.pages.length > 0 || mod.module.toLowerCase().includes(q));
  }, [moduleSearch]);

  const pageDef = COLUMN_REGISTRY.find(p => p.pageSlug === selectedPage);
  const userColMap = useMemo(() =>
    Object.fromEntries(columnConfigs.filter(c => c.user_id === userId).map(c => [`${c.page_slug}:${c.column_key}`, c])),
    [columnConfigs, userId],
  );
  const roleColMap = useMemo(() =>
    Object.fromEntries(columnConfigs.filter(c => c.role === userRole).map(c => [`${c.page_slug}:${c.column_key}`, c])),
    [columnConfigs, userRole],
  );

  if (isSelectedSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-3 text-muted-foreground">
        <Shield className="h-10 w-10 opacity-20" />
        <p className="text-sm font-semibold">Super Admin — Full Permissions, No Overrides</p>
        <p className="text-xs max-w-xs opacity-70">Super Admins always have all permissions. No overrides can be applied.</p>
      </div>
    );
  }

  if (loading) {
    return <div className="p-5 space-y-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>;
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full overflow-hidden">
        {/* Section tabs */}
        <div className="px-5 pt-3 border-b bg-card/50">
          <div className="flex gap-1 mb-0">
            {(['actions', 'columns'] as const).map(s => (
              <button key={s} onClick={() => setActiveSection(s)}
                className={cn('px-4 py-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5',
                  activeSection === s ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
                )}>
                {s === 'actions' ? <><Key className="h-3 w-3" /> Action Permissions</> : <><Columns className="h-3 w-3" /> Column Visibility</>}
              </button>
            ))}
          </div>
        </div>

        {/* ── Action Permissions ── */}
        {activeSection === 'actions' && (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="px-5 py-2.5 border-b flex items-center gap-2">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input value={moduleSearch} onChange={e => setModuleSearch(e.target.value)}
                  placeholder="Search actions, resources…" className="pl-8 h-7 text-xs" />
              </div>
              <div className="flex gap-2 text-[10px] text-muted-foreground items-center">
                <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-blue-400" /> Role default</span>
                <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> Granted</span>
                <span className="flex items-center gap-1"><XCircle className="h-3 w-3 text-red-500" /> Blocked</span>
                <span className="flex items-center gap-1"><MinusCircle className="h-3 w-3 text-slate-300" /> No access</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {filteredModules.map(mod => {
                const isOpen = expandedModules.has(mod.module);
                const overrideCount = mod.pages.flatMap(pg => pg.actions).filter(a => {
                  const key = `${a.resource}:${a.action}`;
                  const eff = effectiveAction(a.resource, a.action as ActionType);
                  return eff === 'granted' || eff === 'blocked';
                }).length;
                return (
                  <div key={mod.module}>
                    <button onClick={() => toggleModule(mod.module)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-muted/50 rounded-lg transition-colors">
                      {isOpen ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                      <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground flex-1 text-left">{mod.module}</span>
                      {overrideCount > 0 && (
                        <Badge className="text-[9px] h-4 px-1.5 bg-amber-100 text-amber-700 border-0">{overrideCount} override{overrideCount !== 1 ? 's' : ''}</Badge>
                      )}
                    </button>

                    {isOpen && mod.pages.map(pg => (
                      <div key={pg.page} className="ml-4 mb-2">
                        <p className="text-[10px] text-muted-foreground px-2 py-1">{pg.page}</p>
                        <div className="space-y-0.5">
                          {pg.actions.map(a => {
                            const eff = effectiveAction(a.resource, a.action as ActionType);
                            const saving = savingKey === `perm:${a.resource}:${a.action}`;
                            const Icon = ACTION_ICONS[a.action as ActionType] ?? Key;
                            const hasOverride = eff === 'granted' || eff === 'blocked';
                            return (
                              <div key={`${a.resource}:${a.action}`}
                                className={cn('flex items-center gap-2 px-3 py-1.5 rounded-lg',
                                  eff === 'granted' ? 'bg-emerald-50/50 dark:bg-emerald-900/5' :
                                  eff === 'blocked' ? 'bg-red-50/50 dark:bg-red-900/5 opacity-60' :
                                  eff === 'role-yes' ? 'bg-blue-50/20' : 'opacity-40'
                                )}>
                                <StatusIcon eff={eff} small />
                                <Icon className="h-3 w-3 text-muted-foreground shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <span className="text-xs font-medium">{a.label}</span>
                                  {a.description && (
                                    <span className="text-[10px] text-muted-foreground ml-1.5">{a.description}</span>
                                  )}
                                </div>
                                {hasOverride && (
                                  <Badge className={cn('text-[9px] h-4 px-1.5 border-0 shrink-0',
                                    eff === 'granted' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                                  )}>
                                    {eff === 'granted' ? 'Granted' : 'Blocked'}
                                  </Badge>
                                )}
                                <button
                                  disabled={saving}
                                  onClick={() => toggleAction(a.resource, a.action as ActionType)}
                                  className={cn('text-[10px] border rounded px-2 py-0.5 shrink-0 font-medium transition-colors disabled:opacity-40 min-w-[72px] text-center',
                                    eff === 'granted' ? 'text-amber-600 border-amber-200 hover:bg-amber-50' :
                                    eff === 'blocked' ? 'text-emerald-600 border-emerald-200 hover:bg-emerald-50' :
                                    eff === 'role-yes' ? 'text-red-600 border-red-200 hover:bg-red-50' :
                                    'text-emerald-600 border-emerald-200 hover:bg-emerald-50'
                                  )}
                                >
                                  {saving ? <Loader2 className="h-3 w-3 animate-spin mx-auto" /> :
                                    eff === 'granted' ? 'Remove' :
                                    eff === 'blocked' ? 'Restore' :
                                    eff === 'role-yes' ? 'Block' : 'Grant'
                                  }
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Column Visibility ── */}
        {activeSection === 'columns' && (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="px-5 py-2.5 border-b flex items-center gap-3">
              <div className="flex-1 max-w-xs">
                <Select value={selectedPage} onValueChange={setSelectedPage}>
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue placeholder="Select a page…" />
                  </SelectTrigger>
                  <SelectContent>
                    {COLUMN_REGISTRY.map(p => (
                      <SelectItem key={p.pageSlug} value={p.pageSlug} className="text-xs">{p.pageLabel}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Eye = visible · Slash = hidden · Blue = role rule · Purple = user override
              </p>
            </div>

            {/* Column headers */}
            <div className="px-5 py-1.5 border-b bg-muted/20 grid grid-cols-[1fr_auto_auto] gap-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              <span>Column</span>
              <span className="w-28 text-center">Role Default<br/><span className="font-normal text-[9px] normal-case">Applies to all {userRole}s</span></span>
              <span className="w-28 text-center">User Override<br/><span className="font-normal text-[9px] normal-case">Only this user</span></span>
            </div>

            <div className="flex-1 overflow-y-auto">
              {pageDef?.columns.map(col => {
                const roleKey = `${selectedPage}:${col.key}`;
                const roleRow = roleColMap[roleKey];
                const userRow = userColMap[roleKey];
                const roleSaving = savingKey === `col:role:${selectedPage}:${col.key}`;
                const userSaving = savingKey === `col:user:${selectedPage}:${col.key}`;
                const roleRemoveSaving = roleRow ? savingKey === `col:remove:${roleRow.id}` : false;
                const userRemoveSaving = userRow ? savingKey === `col:remove:${userRow.id}` : false;

                return (
                  <div key={col.key} className="px-5 py-2.5 border-b grid grid-cols-[1fr_auto_auto] gap-2 items-center hover:bg-muted/20">
                    <div>
                      <p className="text-xs font-medium">{col.label}</p>
                      {col.sensitive && (
                        <Badge className="text-[9px] h-3.5 px-1 bg-orange-100 text-orange-700 border-0 mt-0.5">sensitive</Badge>
                      )}
                    </div>

                    {/* Role default toggle */}
                    <div className="w-28 flex items-center justify-center gap-1.5">
                      {roleRow ? (
                        <>
                          <span className={cn('text-[10px] flex items-center gap-0.5',
                            roleRow.is_hidden ? 'text-red-600' : 'text-emerald-600'
                          )}>
                            {roleRow.is_hidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                            {roleRow.is_hidden ? 'Hidden' : 'Visible'}
                          </span>
                          <button disabled={roleRemoveSaving}
                            onClick={() => removeColumnVisibility(roleRow.id)}
                            className="text-muted-foreground hover:text-destructive disabled:opacity-40">
                            {roleRemoveSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                          </button>
                        </>
                      ) : (
                        <div className="flex gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button disabled={roleSaving}
                                onClick={() => upsertColumnVisibility(selectedPage, col.key, true, 'role')}
                                className="flex items-center gap-0.5 text-[10px] px-2 py-0.5 border rounded text-red-600 border-red-200 hover:bg-red-50 disabled:opacity-40">
                                {roleSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <EyeOff className="h-3 w-3" />}
                                Hide
                              </button>
                            </TooltipTrigger>
                            <TooltipContent className="text-xs">Hide for all {userRole}s</TooltipContent>
                          </Tooltip>
                        </div>
                      )}
                    </div>

                    {/* User override toggle */}
                    <div className="w-28 flex items-center justify-center gap-1.5">
                      {userRow ? (
                        <>
                          <span className={cn('text-[10px] flex items-center gap-0.5',
                            userRow.is_hidden ? 'text-red-600' : 'text-emerald-600'
                          )}>
                            {userRow.is_hidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                            {userRow.is_hidden ? 'Hidden' : 'Visible'}
                          </span>
                          <button disabled={userRemoveSaving}
                            onClick={() => removeColumnVisibility(userRow.id)}
                            className="text-muted-foreground hover:text-destructive disabled:opacity-40">
                            {userRemoveSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                          </button>
                        </>
                      ) : (
                        <div className="flex gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button disabled={userSaving}
                                onClick={() => upsertColumnVisibility(selectedPage, col.key, true, 'user')}
                                className="flex items-center gap-0.5 text-[10px] px-2 py-0.5 border rounded text-red-600 border-red-200 hover:bg-red-50 disabled:opacity-40">
                                {userSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <EyeOff className="h-3 w-3" />}
                                Hide
                              </button>
                            </TooltipTrigger>
                            <TooltipContent className="text-xs">Hide only for this user</TooltipContent>
                          </Tooltip>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
