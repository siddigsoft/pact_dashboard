import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Download, RefreshCw, ShieldAlert, Search, FileSearch, AlertTriangle, Ban } from 'lucide-react';
import { format, parseISO, subDays } from 'date-fns';
import { downloadCsv } from '@/lib/accountingFormat';
import { cn } from '@/lib/utils';

interface AuditLog {
  id: string;
  table_name: string;
  row_id: string;
  action: string;
  old_data: any;
  new_data: any;
  changed_by: string | null;
  changed_at: string;
  context: any;
}
interface AmlAlert {
  id: string;
  partner_id: string;
  matched_party_id: string;
  match_score: number;
  status: 'open' | 'false_positive' | 'blocked' | 'escalated';
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_notes: string | null;
  created_at: string;
}
interface SodViolation {
  id: string;
  rule_id: string;
  user_id: string;
  attempted_action: string;
  context: any;
  blocked_at: string;
}

const RANGES = [
  { value: '7',  label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '365', label: 'Last 1 year' },
  { value: 'all', label: 'All time' },
];

const ACTION_TONE: Record<string, string> = {
  INSERT: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  UPDATE: 'bg-amber-50 text-amber-800 border-amber-200',
  DELETE: 'bg-rose-50 text-rose-700 border-rose-200',
};

const AML_TONE: Record<AmlAlert['status'], string> = {
  open:            'bg-amber-50 text-amber-800 border-amber-200',
  blocked:         'bg-rose-50 text-rose-700 border-rose-200',
  escalated:       'bg-violet-50 text-violet-700 border-violet-200',
  false_positive:  'bg-slate-50 text-slate-600 border-slate-200',
};

export default function FinanceAuditTrail() {
  const { hasAnyRole, loading: authLoading } = useAuthorization();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'auditor']);

  const [tab, setTab] = useState('changes');
  const [range, setRange] = useState('30');
  const [tableFilter, setTableFilter] = useState<string>('all');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [alerts, setAlerts] = useState<AmlAlert[]>([]);
  const [sods, setSods] = useState<SodViolation[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [partners, setPartners] = useState<Record<string, string>>({});
  const [sanctioned, setSanctioned] = useState<Record<string, string>>({});
  const [rules, setRules] = useState<Record<string, string>>({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sinceIso = useMemo(() => range === 'all' ? null : subDays(new Date(), Number(range)).toISOString(), [range]);

  const load = async () => {
    setLoading(true);
    setError(null);
    let logQ = supabase.from('acct_finance_audit_log')
      .select('id, table_name, row_id, action, old_data, new_data, changed_by, changed_at, context')
      .order('changed_at', { ascending: false }).limit(2000);
    let alertQ = supabase.from('acct_aml_alerts')
      .select('id, partner_id, matched_party_id, match_score, status, resolved_at, resolved_by, resolution_notes, created_at')
      .order('created_at', { ascending: false }).limit(1000);
    let sodQ = supabase.from('acct_sod_violations')
      .select('id, rule_id, user_id, attempted_action, context, blocked_at')
      .order('blocked_at', { ascending: false }).limit(1000);
    if (sinceIso) {
      logQ = logQ.gte('changed_at', sinceIso);
      alertQ = alertQ.gte('created_at', sinceIso);
      sodQ = sodQ.gte('blocked_at', sinceIso);
    }
    const [lres, ares, sres, profRes, partRes, sancRes, ruleRes] = await Promise.all([
      logQ, alertQ, sodQ,
      supabase.from('profiles').select('id, full_name'),
      supabase.from('partners').select('id, name'),
      supabase.from('acct_sanctioned_parties').select('id, full_name, list'),
      supabase.from('acct_sod_rules').select('id, code, description'),
    ]);

    const firstErr = [lres.error, ares.error, sres.error].find(Boolean);
    if (firstErr) setError(firstErr.message);
    setLogs((lres.data ?? []) as AuditLog[]);
    setAlerts((ares.data ?? []) as AmlAlert[]);
    setSods((sres.data ?? []) as SodViolation[]);
    const pm: Record<string, string> = {};
    for (const p of (profRes.data ?? [])) pm[p.id] = (p as any).full_name ?? p.id.slice(0, 8);
    setProfiles(pm);
    const partm: Record<string, string> = {};
    for (const p of (partRes.data ?? [])) partm[p.id] = (p as any).name ?? p.id.slice(0, 8);
    setPartners(partm);
    const sm: Record<string, string> = {};
    for (const s of (sancRes.data ?? [])) sm[s.id] = `${(s as any).full_name} (${(s as any).list})`;
    setSanctioned(sm);
    const rm: Record<string, string> = {};
    for (const r of (ruleRes.data ?? [])) rm[r.id] = `${(r as any).code} — ${(r as any).description}`;
    setRules(rm);
    setLoading(false);
  };

  useEffect(() => { if (allowed) void load(); }, [allowed, range]);

  const tableOptions = useMemo(() => Array.from(new Set(logs.map(l => l.table_name))).sort(), [logs]);

  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter(l => {
      if (tableFilter !== 'all' && l.table_name !== tableFilter) return false;
      if (actionFilter !== 'all' && l.action !== actionFilter) return false;
      if (q) {
        const who = profiles[l.changed_by ?? ''] ?? l.changed_by ?? '';
        return l.row_id.toLowerCase().includes(q)
          || l.table_name.toLowerCase().includes(q)
          || who.toLowerCase().includes(q)
          || JSON.stringify(l.new_data ?? {}).toLowerCase().includes(q)
          || JSON.stringify(l.old_data ?? {}).toLowerCase().includes(q);
      }
      return true;
    });
  }, [logs, tableFilter, actionFilter, search, profiles]);

  const counts = {
    logs: logs.length,
    alerts: alerts.length,
    alertsOpen: alerts.filter(a => a.status === 'open' || a.status === 'escalated').length,
    sods: sods.length,
  };

  const exportLogs = () => {
    const header = ['Changed At', 'Table', 'Row ID', 'Action', 'Changed By', 'Old → New (JSON)'];
    const body = filteredLogs.map(l => [
      l.changed_at, l.table_name, l.row_id, l.action,
      profiles[l.changed_by ?? ''] ?? l.changed_by ?? '',
      JSON.stringify({ old: l.old_data, new: l.new_data }),
    ]);
    downloadCsv(`finance-audit-log-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...body]);
  };
  const exportAlerts = () => {
    const header = ['Created At', 'Partner', 'Sanctioned Party', 'Match Score', 'Status', 'Resolved At', 'Resolved By', 'Notes'];
    const body = alerts.map(a => [
      a.created_at,
      partners[a.partner_id] ?? a.partner_id,
      sanctioned[a.matched_party_id] ?? a.matched_party_id,
      a.match_score,
      a.status,
      a.resolved_at ?? '',
      profiles[a.resolved_by ?? ''] ?? a.resolved_by ?? '',
      a.resolution_notes ?? '',
    ]);
    downloadCsv(`aml-alerts-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...body]);
  };
  const exportSod = () => {
    const header = ['Blocked At', 'Rule', 'User', 'Attempted Action', 'Context (JSON)'];
    const body = sods.map(s => [
      s.blocked_at,
      rules[s.rule_id] ?? s.rule_id,
      profiles[s.user_id] ?? s.user_id,
      s.attempted_action,
      JSON.stringify(s.context ?? {}),
    ]);
    downloadCsv(`sod-violations-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...body]);
  };

  if (authLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!allowed) return <Navigate to="/" replace />;

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-4 max-w-[1400px]">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-amber-600" /> Finance Audit Trail
            <span className="text-sm font-normal text-muted-foreground" dir="rtl" lang="ar">سجل التدقيق المالي</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            All changes to <code className="text-xs bg-muted px-1 rounded">acct_funds</code>, <code className="text-xs bg-muted px-1 rounded">acct_accounts</code>, <code className="text-xs bg-muted px-1 rounded">acct_fiscal_periods</code> and <code className="text-xs bg-muted px-1 rounded">feature_flags</code>, plus AML alerts and SoD violations.
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="w-[160px]" data-testid="select-range"><SelectValue /></SelectTrigger>
            <SelectContent>
              {RANGES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => void load()} data-testid="button-refresh">
            <RefreshCw className={cn('w-4 h-4 mr-1', loading && 'animate-spin')} /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Card><CardContent className="p-3"><div className="text-[11px] text-muted-foreground">Audit-log entries</div><div className="text-xl font-bold" data-testid="kpi-logs">{counts.logs}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-[11px] text-muted-foreground">AML alerts</div><div className="text-xl font-bold" data-testid="kpi-alerts">{counts.alerts}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-[11px] text-muted-foreground">Open / escalated alerts</div><div className="text-xl font-bold text-amber-700" data-testid="kpi-alerts-open">{counts.alertsOpen}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-[11px] text-muted-foreground">SoD violations</div><div className="text-xl font-bold text-rose-700" data-testid="kpi-sods">{counts.sods}</div></CardContent></Card>
      </div>

      {error && (
        <div className="p-3 rounded border border-rose-200 bg-rose-50 text-rose-800 text-sm" data-testid="text-error">
          {error}
          <div className="text-xs mt-1 text-rose-700/80">
            If this is a missing-relation error, Sprint 1.2 SQL has not been pasted into pactdb yet.
          </div>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="changes" data-testid="tab-changes"><FileSearch className="w-4 h-4 mr-1" /> Changes</TabsTrigger>
          <TabsTrigger value="aml" data-testid="tab-aml"><AlertTriangle className="w-4 h-4 mr-1" /> AML Alerts</TabsTrigger>
          <TabsTrigger value="sod" data-testid="tab-sod"><Ban className="w-4 h-4 mr-1" /> SoD Violations</TabsTrigger>
        </TabsList>

        <TabsContent value="changes">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base">Finance table changes</CardTitle>
              <Button variant="outline" size="sm" onClick={exportLogs} disabled={!filteredLogs.length} data-testid="button-export-logs">
                <Download className="w-4 h-4 mr-1" /> CSV
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Search row id, table, user, payload…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8" data-testid="input-search" />
                </div>
                <Select value={tableFilter} onValueChange={setTableFilter}>
                  <SelectTrigger data-testid="select-table"><SelectValue placeholder="Table" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All tables</SelectItem>
                    {tableOptions.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={actionFilter} onValueChange={setActionFilter}>
                  <SelectTrigger data-testid="select-action"><SelectValue placeholder="Action" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All actions</SelectItem>
                    <SelectItem value="INSERT">INSERT</SelectItem>
                    <SelectItem value="UPDATE">UPDATE</SelectItem>
                    <SelectItem value="DELETE">DELETE</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading audit log…</div>
              ) : filteredLogs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm" data-testid="text-empty-logs">No audit-log entries match the current filters.</div>
              ) : (
                <div className="border rounded-md overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-[11px] uppercase text-muted-foreground">
                      <tr>
                        <th className="text-left px-3 py-2">When</th>
                        <th className="text-left px-3 py-2">Table</th>
                        <th className="text-left px-3 py-2">Action</th>
                        <th className="text-left px-3 py-2">Row</th>
                        <th className="text-left px-3 py-2">Who</th>
                        <th className="text-left px-3 py-2">Change preview</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLogs.map(l => (
                        <tr key={l.id} className="border-t align-top hover:bg-muted/30" data-testid={`row-log-${l.id}`}>
                          <td className="px-3 py-2 text-xs whitespace-nowrap">{format(parseISO(l.changed_at), 'yyyy-MM-dd HH:mm:ss')}</td>
                          <td className="px-3 py-2 text-xs"><Badge variant="outline" className="text-[10px]">{l.table_name}</Badge></td>
                          <td className="px-3 py-2"><Badge variant="outline" className={cn('text-[10px]', ACTION_TONE[l.action] ?? '')}>{l.action}</Badge></td>
                          <td className="px-3 py-2 font-mono text-[11px]">{l.row_id.slice(0, 8)}…</td>
                          <td className="px-3 py-2 text-xs">{profiles[l.changed_by ?? ''] ?? (l.changed_by ?? '—')}</td>
                          <td className="px-3 py-2 text-[11px] text-muted-foreground max-w-[420px]">
                            <details>
                              <summary className="cursor-pointer text-foreground hover:underline">View payload</summary>
                              <pre className="mt-1 p-2 bg-muted/50 rounded overflow-x-auto text-[10px]">{JSON.stringify({ old: l.old_data, new: l.new_data, ctx: l.context }, null, 2)}</pre>
                            </details>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="aml">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base">Sanctions / AML alerts</CardTitle>
              <Button variant="outline" size="sm" onClick={exportAlerts} disabled={!alerts.length} data-testid="button-export-alerts">
                <Download className="w-4 h-4 mr-1" /> CSV
              </Button>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading alerts…</div>
              ) : alerts.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm" data-testid="text-empty-alerts">No AML alerts in the selected window.</div>
              ) : (
                <div className="border rounded-md overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-[11px] uppercase text-muted-foreground">
                      <tr>
                        <th className="text-left px-3 py-2">Created</th>
                        <th className="text-left px-3 py-2">Partner</th>
                        <th className="text-left px-3 py-2">Sanctioned party</th>
                        <th className="text-right px-3 py-2">Match</th>
                        <th className="text-left px-3 py-2">Status</th>
                        <th className="text-left px-3 py-2">Resolved by</th>
                        <th className="text-left px-3 py-2">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {alerts.map(a => (
                        <tr key={a.id} className="border-t hover:bg-muted/30" data-testid={`row-alert-${a.id}`}>
                          <td className="px-3 py-2 text-xs whitespace-nowrap">{format(parseISO(a.created_at), 'yyyy-MM-dd HH:mm')}</td>
                          <td className="px-3 py-2">{partners[a.partner_id] ?? a.partner_id.slice(0, 8)}</td>
                          <td className="px-3 py-2 text-xs">{sanctioned[a.matched_party_id] ?? a.matched_party_id.slice(0, 8)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-xs">{Number(a.match_score).toFixed(2)}</td>
                          <td className="px-3 py-2"><Badge variant="outline" className={cn('text-[10px]', AML_TONE[a.status])}>{a.status}</Badge></td>
                          <td className="px-3 py-2 text-xs">{a.resolved_by ? (profiles[a.resolved_by] ?? a.resolved_by.slice(0, 8)) : '—'}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground max-w-[260px] truncate">{a.resolution_notes ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sod">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base">Segregation-of-Duties violations</CardTitle>
              <Button variant="outline" size="sm" onClick={exportSod} disabled={!sods.length} data-testid="button-export-sod">
                <Download className="w-4 h-4 mr-1" /> CSV
              </Button>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading violations…</div>
              ) : sods.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm" data-testid="text-empty-sod">No SoD violations in the selected window.</div>
              ) : (
                <div className="border rounded-md overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-[11px] uppercase text-muted-foreground">
                      <tr>
                        <th className="text-left px-3 py-2">When</th>
                        <th className="text-left px-3 py-2">Rule</th>
                        <th className="text-left px-3 py-2">User</th>
                        <th className="text-left px-3 py-2">Attempted action</th>
                        <th className="text-left px-3 py-2">Context</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sods.map(s => (
                        <tr key={s.id} className="border-t hover:bg-muted/30 align-top" data-testid={`row-sod-${s.id}`}>
                          <td className="px-3 py-2 text-xs whitespace-nowrap">{format(parseISO(s.blocked_at), 'yyyy-MM-dd HH:mm:ss')}</td>
                          <td className="px-3 py-2 text-xs">{rules[s.rule_id] ?? s.rule_id.slice(0, 8)}</td>
                          <td className="px-3 py-2 text-xs">{profiles[s.user_id] ?? s.user_id.slice(0, 8)}</td>
                          <td className="px-3 py-2"><Badge variant="outline" className="text-[10px]">{s.attempted_action}</Badge></td>
                          <td className="px-3 py-2 text-[11px] text-muted-foreground max-w-[420px]">
                            <details>
                              <summary className="cursor-pointer text-foreground hover:underline">View context</summary>
                              <pre className="mt-1 p-2 bg-muted/50 rounded overflow-x-auto text-[10px]">{JSON.stringify(s.context ?? {}, null, 2)}</pre>
                            </details>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
