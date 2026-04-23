import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollText, Loader2, Search, ArrowRight, Building2, GitBranch } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Navigate } from 'react-router-dom';

interface AuditRow {
  id: string;
  profile_id: string;
  field: 'reports_to' | 'department_id';
  old_value: string | null;
  new_value: string | null;
  changed_by: string | null;
  reason: string | null;
  created_at: string;
}

export default function HierarchyAuditLogPage() {
  const { hasAnyRole } = useAuthorization();
  const isAdmin = hasAnyRole(['super_admin', 'admin', 'hr']);

  const [rows, setRows] = useState<AuditRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [depts, setDepts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [fieldFilter, setFieldFilter] = useState<string>('all');

  useEffect(() => { if (isAdmin) load(); /* eslint-disable-line */ }, [isAdmin]);

  async function load() {
    setLoading(true);
    const [a, p, d] = await Promise.all([
      supabase.from('hierarchy_audit_log').select('*').order('created_at', { ascending: false }).limit(500),
      supabase.from('profiles').select('id, full_name'),
      supabase.from('departments').select('id, name'),
    ]);
    if (a.data) setRows(a.data as AuditRow[]);
    if (p.data) setProfiles(Object.fromEntries(p.data.map((x: any) => [x.id, x.full_name])));
    if (d.data) setDepts(Object.fromEntries(d.data.map((x: any) => [x.id, x.name])));
    setLoading(false);
  }

  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const visible = useMemo(() => {
    let list = rows;
    if (fieldFilter !== 'all') list = list.filter(r => r.field === fieldFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        (profiles[r.profile_id] ?? '').toLowerCase().includes(q) ||
        (r.changed_by && (profiles[r.changed_by] ?? '').toLowerCase().includes(q)));
    }
    return list;
  }, [rows, fieldFilter, search, profiles]);

  function fmtVal(field: string, val: string | null): string {
    if (!val) return '—';
    if (field === 'reports_to') return profiles[val] ?? val.slice(0, 8);
    if (field === 'department_id') return depts[val] ?? val.slice(0, 8);
    return val;
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4" data-testid="page-hierarchy-audit">
      <header className="flex flex-wrap items-center gap-3">
        <ScrollText className="h-5 w-5 text-blue-500" />
        <h1 className="text-xl font-semibold">Hierarchy Audit Log</h1>
        <p className="text-xs text-muted-foreground ml-1">Last 500 changes to reporting line and department.</p>
      </header>

      <div className="flex flex-wrap gap-2">
        <Select value={fieldFilter} onValueChange={setFieldFilter}>
          <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All changes</SelectItem>
            <SelectItem value="reports_to">Reporting line only</SelectItem>
            <SelectItem value="department_id">Department only</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input data-testid="input-search-audit" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name…" className="pl-8 w-64" />
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center"><Loader2 className="h-6 w-6 animate-spin opacity-30" /></div>
      ) : visible.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
          No hierarchy changes yet. Once you change a profile's manager or department, it will appear here.
        </CardContent></Card>
      ) : (
        <Card><CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900 text-xs text-muted-foreground">
              <tr>
                <th className="text-left p-3">When</th>
                <th className="text-left p-3">Person</th>
                <th className="text-left p-3">Field</th>
                <th className="text-left p-3">Change</th>
                <th className="text-left p-3">Changed by</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(r => (
                <tr key={r.id} className="border-t" data-testid={`row-audit-${r.id}`}>
                  <td className="p-3 text-xs whitespace-nowrap">{format(parseISO(r.created_at), 'PP p')}</td>
                  <td className="p-3 text-xs">{profiles[r.profile_id] ?? r.profile_id.slice(0, 8)}</td>
                  <td className="p-3">
                    <Badge variant="outline" className="text-[10px] gap-1">
                      {r.field === 'reports_to' ? <GitBranch className="h-3 w-3" /> : <Building2 className="h-3 w-3" />}
                      {r.field === 'reports_to' ? 'Manager' : 'Department'}
                    </Badge>
                  </td>
                  <td className="p-3 text-xs">
                    <span className="text-muted-foreground line-through">{fmtVal(r.field, r.old_value)}</span>
                    <ArrowRight className="inline h-3 w-3 mx-1 text-muted-foreground" />
                    <span className="font-medium">{fmtVal(r.field, r.new_value)}</span>
                  </td>
                  <td className="p-3 text-xs">{r.changed_by ? (profiles[r.changed_by] ?? '—') : 'System'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent></Card>
      )}
    </div>
  );
}
