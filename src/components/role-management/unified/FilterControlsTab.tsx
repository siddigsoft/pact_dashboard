import { useMemo, useState } from 'react';
import { Search, Shield, Eye, EyeOff, RotateCcw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { FILTER_REGISTRY } from '@/lib/filter-registry';
import { useSelectedUserAccess } from '@/context/role-management/SelectedUserAccessContext';
import { TabProps } from './types';

/** Visibility only: this tab never changes row authorization, scope, or exports. */
export function FilterControlsTab({ userRole, isSelectedSuperAdmin }: TabProps) {
  const { loading, loadError, savingKey, effectiveFilter, explainFilter, toggleFilter, effectiveRoleNames } = useSelectedUserAccess();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState('all');
  const [selectedRole, setSelectedRole] = useState(effectiveRoleNames[0] ?? userRole);
  const pages = useMemo(() => [...new Set(FILTER_REGISTRY.map(f => `${f.page}|${f.pageLabel}`))], []);
  const rows = FILTER_REGISTRY.filter(f => (!query || `${f.label} ${f.description} ${f.pageLabel}`.toLowerCase().includes(query.toLowerCase())) && (page === 'all' || f.page === page));
  if (loading) return <div className="p-5 space-y-3">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>;
  if (loadError && !rows.length) return <p className="p-6 text-sm text-destructive">{loadError}</p>;
  return <div className="flex h-full flex-col overflow-hidden">
    <div className="border-b bg-card/50 p-4 space-y-2">
      <p className="text-xs text-muted-foreground">Controls filter visibility only — it never changes data access, server scope, authorization, or export scope.</p>
      <div className="flex gap-2">
        <div className="relative max-w-xs flex-1"><Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" /><Input className="h-8 pl-7 text-xs" placeholder="Search filters…" value={query} onChange={e => setQuery(e.target.value)} /></div>
        <select className="h-8 rounded-md border bg-background px-2 text-xs" value={page} onChange={e => setPage(e.target.value)}><option value="all">All pages</option>{pages.map(p => { const [key, label] = p.split('|'); return <option key={key} value={key}>{label}</option>; })}</select>
        <select className="h-8 rounded-md border bg-background px-2 text-xs" value={selectedRole} onChange={e => setSelectedRole(e.target.value)} aria-label="Role default target">{effectiveRoleNames.map(role => <option key={role} value={role}>{role} role default</option>)}</select>
      </div>
    </div>
    <div className="flex-1 overflow-y-auto p-4 space-y-2">{rows.map(item => {
      const effect = effectiveFilter(item.key); const trace = explainFilter(item.key); const override = effect === 'granted' || effect === 'blocked';
      return <div key={item.key} className={cn('flex items-center gap-3 rounded-lg border p-3', effect === 'blocked' && 'bg-muted/40 opacity-70')}>
        {effect === 'blocked' ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-emerald-600" />}
        <div className="min-w-0 flex-1"><p className="text-xs font-medium">{item.label} <span className="text-muted-foreground">· {item.pageLabel}</span></p><p className="text-[10px] text-muted-foreground">{item.description}</p><p className="text-[10px] text-muted-foreground/70">{trace.summary}</p></div>
        {override && <Badge variant="outline" className="text-[9px]">{effect === 'blocked' ? 'Hidden override' : 'Visible override'}</Badge>}
        {!isSelectedSuperAdmin && <div className="flex gap-1">
          <button disabled={savingKey === `filter:user:${item.key}`} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px]" onClick={() => void toggleFilter(item.key)}>{override ? <><RotateCcw className="h-3 w-3" /> Restore</> : <><EyeOff className="h-3 w-3" /> Hide</>}</button>
          <button disabled={savingKey === `filter:role:${item.key}`} className="rounded border px-2 py-1 text-[10px]" onClick={() => void toggleFilter(item.key, 'role', selectedRole)}>Role default</button>
        </div>}
      </div>;
    })}</div>
    {isSelectedSuperAdmin && <div className="border-t p-3 text-xs text-muted-foreground flex items-center gap-2"><Shield className="h-3.5 w-3.5" /> Super Admin filters are always visible and read-only.</div>}
    <span className="sr-only">{userRole} {effectiveRoleNames.join(',')}</span>
  </div>;
}