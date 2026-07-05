import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Search, ChevronRight, ChevronDown, User, Building2, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Profile {
  id: string; full_name: string | null; role: string | null; reports_to: string | null;
  department_id: string | null; email: string | null;
}
interface Dept { id: string; name: string; }

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

function NodeRow({ node, depth, deptMap, expanded, toggle, highlight }: {
  node: TreeNode; depth: number; deptMap: Record<string, string>;
  expanded: Set<string>; toggle: (id: string) => void; highlight: string;
}) {
  const isOpen = expanded.has(node.id);
  const hasChildren = node.children.length > 0;
  const matches = highlight && (node.full_name ?? '').toLowerCase().includes(highlight.toLowerCase());
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
        <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium">{node.full_name ?? 'Unnamed'}</span>
        {node.role && <Badge variant="outline" className="text-[10px] py-0">{node.role}</Badge>}
        {node.department_id && deptMap[node.department_id] && (
          <span className="text-xs text-muted-foreground flex items-center gap-1"><Building2 className="h-3 w-3" />{deptMap[node.department_id]}</span>
        )}
        {hasChildren && <span className="text-xs text-muted-foreground ml-1">({node.children.length} direct report{node.children.length === 1 ? '' : 's'})</span>}
      </div>
      {isOpen && hasChildren && (
        <div>
          {node.children.map(child => (
            <NodeRow key={child.id} node={child} depth={depth + 1} deptMap={deptMap} expanded={expanded} toggle={toggle} highlight={highlight} />
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
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [profRes, deptRes] = await Promise.all([
      supabase.from('profiles').select('id, full_name, role, reports_to, department_id, email').order('full_name'),
      supabase.from('departments').select('id, name'),
    ]);
    if (profRes.data) setProfiles(profRes.data as Profile[]);
    if (deptRes.data) setDepts(deptRes.data as Dept[]);
    setLoading(false);
  }

  const forest = useMemo(() => buildForest(profiles), [profiles]);
  const deptMap = useMemo(() => Object.fromEntries(depts.map(d => [d.id, d.name])), [depts]);

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
      <Card>
        <CardContent className="py-4">
          {forest.length === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center">No staff records found.</p>
          ) : (
            <div className="space-y-0.5">
              {forest.map(root => (
                <NodeRow key={root.id} node={root} depth={0} deptMap={deptMap} expanded={expanded} toggle={toggle} highlight={search} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">Hierarchy is derived from each staff member's "Reports To" field on their profile. Update it in User Management to change the org chart.</p>
    </div>
  );
}
