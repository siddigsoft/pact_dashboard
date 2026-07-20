import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Search, ChevronRight, ChevronDown, User, Building2, ChevronsDownUp, ChevronsUpDown, AlertTriangle, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Profile {
  id: string; full_name: string | null; role: string | null; reports_to: string | null;
  department_id: string | null; email: string | null;
}
interface Dept { id: string; name: string; }
interface Position {
  id: string; title: string; current_holder_id: string | null;
  is_critical_role: boolean; primary_successor_id: string | null;
  secondary_successor_id: string | null; successor_readiness: number | null;
}

interface SuccessionInfo {
  isCritical: boolean;
  hasSuccessor: boolean;
  readiness: number | null;
  title: string;
}

interface TreeNode extends Profile { children: TreeNode[] }

function buildForest(profiles: Profile[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  profiles.forEach(p => map.set(p.id, { ...p, children: [] }));
  const roots: TreeNode[] = [];
  map.forEach(node => {
    if (node.reports_to && map.has(node.reports_to)) {
      map.get(node.reports_to)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  const sortRec = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? ''));
    nodes.forEach(n => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

function SuccessionBadge({ info }: { info: SuccessionInfo }) {
  if (!info.isCritical) return null;
  if (!info.hasSuccessor) {
    return (
      <Badge variant="outline" className="text-[10px] border-red-300 text-red-700 bg-red-50 flex items-center gap-0.5 py-0" title={`Critical role: ${info.title} — no successor`}>
        <AlertTriangle className="h-2.5 w-2.5" />No successor
      </Badge>
    );
  }
  const readiness = info.readiness ?? 0;
  if (readiness < 50) {
    return (
      <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 bg-amber-50 flex items-center gap-0.5 py-0" title={`Critical role: ${info.title} — successor not ready (${readiness}%)`}>
        <Shield className="h-2.5 w-2.5" />{readiness}% ready
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-700 bg-emerald-50 flex items-center gap-0.5 py-0" title={`Critical role: ${info.title} — succession covered`}>
      <Shield className="h-2.5 w-2.5" />Succession ✓
    </Badge>
  );
}

function NodeRow({ node, depth, deptMap, expanded, toggle, highlight, successionMap }: {
  node: TreeNode; depth: number; deptMap: Record<string, string>;
  expanded: Set<string>; toggle: (id: string) => void; highlight: string;
  successionMap: Record<string, SuccessionInfo>;
}) {
  const isOpen = expanded.has(node.id);
  const hasChildren = node.children.length > 0;
  const matches = highlight && (node.full_name ?? '').toLowerCase().includes(highlight.toLowerCase());
  const succession = successionMap[node.id];
  return (
    <div>
      <div
        className={cn('flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/60', matches && 'bg-primary/10 ring-1 ring-primary/30')}
        style={{ paddingLeft: `${depth * 20 + 4}px` }}
        data-testid={`org-node-${node.id}`}
      >
        <button onClick={() => hasChildren && toggle(node.id)} className={cn('h-4 w-4 flex items-center justify-center', !hasChildren && 'invisible')}>
          {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <User className={cn('h-3.5 w-3.5 shrink-0', succession?.isCritical ? 'text-red-500' : 'text-muted-foreground')} />
        <span className="text-sm font-medium">{node.full_name ?? 'Unnamed'}</span>
        {node.role && <Badge variant="outline" className="text-[10px] py-0">{node.role}</Badge>}
        {node.department_id && deptMap[node.department_id] && (
          <span className="text-xs text-muted-foreground flex items-center gap-1"><Building2 className="h-3 w-3" />{deptMap[node.department_id]}</span>
        )}
        {succession && <SuccessionBadge info={succession} />}
        {hasChildren && <span className="text-xs text-muted-foreground ml-1">({node.children.length} direct report{node.children.length === 1 ? '' : 's'})</span>}
      </div>
      {isOpen && hasChildren && (
        <div>
          {node.children.map(child => (
            <NodeRow key={child.id} node={child} depth={depth + 1} deptMap={deptMap} expanded={expanded} toggle={toggle} highlight={highlight} successionMap={successionMap} />
          ))}
        </div>
      )}
    </div>
  );
}

function collectIds(nodes: TreeNode[], acc: string[]) {
  nodes.forEach(n => { acc.push(n.id); collectIds(n.children, acc); });
}

export default function OrgChart() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [profRes, deptRes, posRes] = await Promise.all([
      supabase.from('profiles').select('id, full_name, role, reports_to, department_id, email').order('full_name'),
      supabase.from('departments').select('id, name'),
      supabase.from('positions').select('id, title, current_holder_id, is_critical_role, primary_successor_id, secondary_successor_id, successor_readiness'),
    ]);
    if (profRes.data) setProfiles(profRes.data as Profile[]);
    if (deptRes.data) setDepts(deptRes.data as Dept[]);
    if (posRes.data) setPositions(posRes.data as Position[]);
    setLoading(false);
  }

  const forest = useMemo(() => buildForest(profiles), [profiles]);
  const deptMap = useMemo(() => Object.fromEntries(depts.map(d => [d.id, d.name])), [depts]);

  // Build a map of userId → succession info (for those holding critical positions)
  const successionMap = useMemo<Record<string, SuccessionInfo>>(() => {
    const m: Record<string, SuccessionInfo> = {};
    positions.forEach(pos => {
      if (!pos.is_critical_role || !pos.current_holder_id) return;
      m[pos.current_holder_id] = {
        isCritical: true,
        hasSuccessor: !!(pos.primary_successor_id),
        readiness: pos.successor_readiness,
        title: pos.title,
      };
    });
    return m;
  }, [positions]);

  const criticalAtRisk = useMemo(
    () => positions.filter(p => p.is_critical_role && p.current_holder_id && (!p.primary_successor_id || (p.successor_readiness ?? 0) < 50)),
    [positions]
  );

  useEffect(() => {
    if (forest.length && expanded.size === 0) {
      const ids: string[] = [];
      forest.forEach(r => { ids.push(r.id); r.children.forEach(c => ids.push(c.id)); });
      setExpanded(new Set(ids));
    }
  }, [forest]);

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function expandAll() { const all: string[] = []; collectIds(forest, all); setExpanded(new Set(all)); }
  function collapseAll() { setExpanded(new Set()); }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4" data-testid="page-org-chart">
      {criticalAtRisk.length > 0 && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-red-200 bg-red-50/60 dark:bg-red-950/10 text-xs text-red-700">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            <strong>Succession Risk:</strong>{' '}
            {criticalAtRisk.map(p => p.title).join(', ')} — critical roles without a ready successor.
            Update in Positions &amp; Vacancies.
          </span>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Find a person..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-org" />
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={expandAll} data-testid="button-expand-all"><ChevronsUpDown className="h-3.5 w-3.5 mr-1" />Expand all</Button>
          <Button size="sm" variant="outline" onClick={collapseAll} data-testid="button-collapse-all"><ChevronsDownUp className="h-3.5 w-3.5 mr-1" />Collapse all</Button>
        </div>
      </div>

      {Object.keys(successionMap).length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="text-muted-foreground">Succession legend:</span>
          <span className="flex items-center gap-1 text-red-700"><AlertTriangle className="h-3 w-3" />No successor</span>
          <span className="flex items-center gap-1 text-amber-700"><Shield className="h-3 w-3" />Not ready (&lt;50%)</span>
          <span className="flex items-center gap-1 text-emerald-700"><Shield className="h-3 w-3" />Covered</span>
        </div>
      )}

      <Card>
        <CardContent className="py-4">
          {forest.length === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center">No staff records found.</p>
          ) : (
            <div className="space-y-0.5">
              {forest.map(root => (
                <NodeRow key={root.id} node={root} depth={0} deptMap={deptMap} expanded={expanded} toggle={toggle} highlight={search} successionMap={successionMap} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">Hierarchy is derived from each staff member's "Reports To" field on their profile. Update it in User Management to change the org chart.</p>
    </div>
  );
}
