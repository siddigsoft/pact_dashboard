import { useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';
import {
  Loader2, RefreshCw, Download, CheckCircle2, XCircle, AlertTriangle,
  SkipForward, Activity, Database, FileText, TrendingUp,
} from 'lucide-react';
import { format, parseISO, subDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';

interface BridgeLogEntry {
  id: string;
  source_table: string;
  source_id: string;
  event_type: string;
  status: 'success' | 'error' | 'skipped';
  journal_entry_id: string | null;
  je_reference: string | null;
  je_description: string | null;
  error_message: string | null;
  created_at: string;
}

interface CoverageRow {
  source_table: string;
  total_events: number;
  success_count: number;
  error_count: number;
  skipped_count: number;
  success_pct: number;
  last_event_at: string | null;
  last_error_at: string | null;
  health_status: 'healthy' | 'degraded' | 'no_data';
}

const STATUS_CFG = {
  success: { label: 'Posted',  class: 'bg-emerald-100 text-emerald-700 border-emerald-300', icon: CheckCircle2 },
  error:   { label: 'Error',   class: 'bg-rose-100 text-rose-700 border-rose-300',          icon: XCircle },
  skipped: { label: 'Skipped', class: 'bg-slate-100 text-slate-600 border-slate-300',       icon: SkipForward },
};

const TABLE_LABELS: Record<string, string> = {
  payroll_runs:                    'Payroll Runs',
  operational_cost_submissions:    'Operational Costs',
  withdrawal_requests:             'Withdrawal Requests',
  down_payment_requests:           'Down Payments',
  salary_advances:                 'Cash Salary Advances',
  wallet_transactions:             'Wallet Transactions',
  acct_invoices:                   'AP Invoices',
  acct_payments:                   'AP Payments',
  eosb_accruals:                   'EOSB Provisions',
  hr_salary_advances:              'HR Salary Advances',
  hr_salary_advance_recoveries:    'Advance Recoveries',
  acct_grant_expenses:             'Grant Expenses',
  acct_allocation_runs:            'Cost Allocations',
  acct_depreciation_runs:          'Depreciation Runs',
  acct_budget_encumbrances:        'Budget Encumbrances',
  leave_requests:                  'Leave Liability',
  acct_fixed_assets:               'Fixed Assets',
  acct_cash_flow_adjustments:      'Cash Flow Adjustments',
  acct_grants:                     'Grants',
  acct_grant_milestones:           'Grant Milestones',
  acct_bank_statement_lines:       'Bank Statement Lines',
  // Phase 7 — Statutory Reporting
  acct_statutory_filings:          'Statutory Filings',
  acct_tax_withholding:            'Tax Withholding',
  // Phase 8 — Audit Pack
  acct_audit_packs:                'Audit Packs',
  acct_auditor_findings:           'Auditor Findings',
};

const HEALTH_CFG = {
  healthy:  { label: 'Healthy',  class: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  degraded: { label: 'Has Errors', class: 'bg-rose-100 text-rose-700',     dot: 'bg-rose-500' },
  no_data:  { label: 'No Data',  class: 'bg-slate-100 text-slate-500',     dot: 'bg-slate-400' },
};

export default function AccountingGLAudit() {
  const { hasAnyRole, loading: authLoading } = useAuthorization();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);
  const { toast } = useToast();

  const [tab, setTab] = useState<'log' | 'coverage'>('coverage');
  const [logEntries, setLogEntries]   = useState<BridgeLogEntry[]>([]);
  const [coverage, setCoverage]       = useState<CoverageRow[]>([]);
  const [loading, setLoading]         = useState(false);
  const [coverageLoading, setCoverageLoading] = useState(false);

  const [sourceFilter, setSourceFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom]         = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [dateTo, setDateTo]             = useState(format(new Date(), 'yyyy-MM-dd'));
  const [search, setSearch]             = useState('');

  const loadLog = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_gl_bridge_log' as any, {
      p_source_table: sourceFilter === 'all' ? null : sourceFilter,
      p_status:       statusFilter === 'all' ? null : statusFilter,
      p_date_from:    dateFrom || null,
      p_date_to:      dateTo   || null,
      p_limit:        1000,
    });
    setLoading(false);
    if (error) {
      // fallback: direct table query
      const { data: d2 } = await supabase
        .from('acct_gl_bridge_log' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      setLogEntries(((d2 ?? []) as any[]) as BridgeLogEntry[]);
      return;
    }
    setLogEntries(((data ?? []) as any[]) as BridgeLogEntry[]);
  }, [sourceFilter, statusFilter, dateFrom, dateTo]);

  const loadCoverage = useCallback(async () => {
    setCoverageLoading(true);
    // Use v_acct_gl_bridge_summary (Phase 2 view); derive coverage fields in JS
    const { data } = await supabase
      .from('v_acct_gl_bridge_summary' as any)
      .select('source_table, event_type, success_count, error_count, skipped_count, last_fired_at, last_error')
      .order('last_fired_at', { ascending: false })
      .limit(200);
    // Group by source_table and compute aggregate CoverageRow fields
    const grouped: Record<string, CoverageRow> = {};
    for (const row of ((data ?? []) as any[])) {
      const key = row.source_table as string;
      const s = Number(row.success_count ?? 0);
      const e = Number(row.error_count ?? 0);
      const sk = Number(row.skipped_count ?? 0);
      if (!grouped[key]) {
        grouped[key] = {
          source_table: key,
          total_events: 0,
          success_count: 0,
          error_count: 0,
          skipped_count: 0,
          success_pct: 0,
          last_event_at: row.last_fired_at ?? null,
          last_error_at: e > 0 ? (row.last_fired_at ?? null) : null,
          health_status: 'no_data',
        };
      }
      grouped[key].total_events  += s + e + sk;
      grouped[key].success_count += s;
      grouped[key].error_count   += e;
      grouped[key].skipped_count += sk;
      if (row.last_fired_at && (!grouped[key].last_event_at || row.last_fired_at > grouped[key].last_event_at!)) {
        grouped[key].last_event_at = row.last_fired_at;
      }
    }
    const rows: CoverageRow[] = Object.values(grouped).map(c => {
      const total = c.success_count + c.error_count;
      c.success_pct = total > 0 ? Math.round((c.success_count / total) * 100) : 0;
      c.health_status = c.total_events === 0
        ? 'no_data'
        : c.error_count === 0
          ? 'healthy'
          : c.success_pct >= 80 ? 'healthy' : 'degraded';
      return c;
    }).sort((a, b) => (b.last_event_at ?? '').localeCompare(a.last_event_at ?? ''));
    setCoverage(rows);
    setCoverageLoading(false);
  }, []);

  const load = useCallback(() => {
    if (tab === 'log') void loadLog();
    else void loadCoverage();
  }, [tab, loadLog, loadCoverage]);

  const handleTabChange = (t: 'log' | 'coverage') => {
    setTab(t);
    if (t === 'log' && logEntries.length === 0) void loadLog();
    if (t === 'coverage' && coverage.length === 0) void loadCoverage();
  };

  const filteredLog = logEntries.filter(e => {
    if (!search) return true;
    const q = search.toLowerCase();
    return e.source_table.toLowerCase().includes(q)
      || e.event_type.toLowerCase().includes(q)
      || (e.source_id ?? '').toLowerCase().includes(q)
      || (e.je_reference ?? '').toLowerCase().includes(q)
      || (e.error_message ?? '').toLowerCase().includes(q);
  });

  const exportLog = () => {
    const rows = filteredLog.map(e => ({
      'Source Module':   TABLE_LABELS[e.source_table] ?? e.source_table,
      'Source ID':       e.source_id,
      'Event':           e.event_type,
      'Status':          e.status,
      'JE Reference':    e.je_reference ?? '',
      'JE Description':  e.je_description ?? '',
      'Error':           e.error_message ?? '',
      'Posted At':       format(parseISO(e.created_at), 'yyyy-MM-dd HH:mm:ss'),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'GL Bridge Log');
    XLSX.writeFile(wb, `GL_Bridge_Log_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const totals = {
    success: logEntries.filter(e => e.status === 'success').length,
    error:   logEntries.filter(e => e.status === 'error').length,
    skipped: logEntries.filter(e => e.status === 'skipped').length,
  };

  if (authLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!allowed)   return <Navigate to="/" replace />;

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-[1200px]">
      <PageInfoBanner
        title="GL Bridge Audit Log"
        description="Complete audit trail of all automatic journal postings generated by the GL Bridge Engine. Every operational event (payroll, advances, grants, EOSB, costs) that triggers an accounting entry is logged here with full timestamps and receipts."
        workflowSteps={[
          { step: 1, role: 'System',        action: 'Operational Event',       description: 'A PO, invoice, GRN or other event occurs in the system.' },
          { step: 2, role: 'System',        action: 'Trigger Fires',           description: 'Database trigger detects the change and fires automatically.' },
          { step: 3, role: 'System',        action: 'Post to GL',              description: 'Journal entry is created and posted to the general ledger.' },
          { step: 4, role: 'System',        action: 'Bridge Log Created',      description: 'GL Bridge log records the posting event for full audit trail.' },
        ]}
      />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="w-6 h-6 text-indigo-600" /> GL Bridge Audit
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            All modules → Accounting auto-posting history
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} data-testid="button-refresh-audit">
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
          {tab === 'log' && (
            <Button variant="outline" size="sm" onClick={exportLog} disabled={filteredLog.length === 0}
              data-testid="button-export-audit">
              <Download className="w-4 h-4 mr-1" /> Export
            </Button>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b">
        {(['coverage', 'log'] as const).map(t => (
          <button
            key={t}
            onClick={() => handleTabChange(t)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              tab === t
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
            data-testid={`tab-${t}`}
          >
            {t === 'coverage' ? 'Coverage Matrix' : 'Audit Log'}
          </button>
        ))}
      </div>

      {/* COVERAGE TAB */}
      {tab === 'coverage' && (
        <div className="space-y-4">
          {coverageLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : coverage.length === 0 ? (
            <div className="text-center py-20 space-y-3">
              <Database className="w-10 h-10 mx-auto text-muted-foreground/40" />
              <p className="text-muted-foreground text-sm">No bridge activity yet.</p>
              <Button size="sm" onClick={loadCoverage}>Load Coverage</Button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card><CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">Modules Bridged</div>
                  <div className="text-2xl font-bold mt-1 text-indigo-600">{coverage.length}</div>
                </CardContent></Card>
                <Card><CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">Total Events</div>
                  <div className="text-2xl font-bold mt-1">{coverage.reduce((s, c) => s + c.total_events, 0).toLocaleString()}</div>
                </CardContent></Card>
                <Card><CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">Successful Posts</div>
                  <div className="text-2xl font-bold mt-1 text-emerald-600">{coverage.reduce((s, c) => s + c.success_count, 0).toLocaleString()}</div>
                </CardContent></Card>
                <Card><CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">Posting Errors</div>
                  <div className="text-2xl font-bold mt-1 text-rose-600">{coverage.reduce((s, c) => s + c.error_count, 0).toLocaleString()}</div>
                </CardContent></Card>
              </div>

              <Card>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm font-semibold">Module Coverage Matrix</CardTitle>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/40">
                          <th className="text-left px-4 py-2 font-medium text-muted-foreground">Module</th>
                          <th className="text-right px-4 py-2 font-medium text-muted-foreground">Events</th>
                          <th className="text-right px-4 py-2 font-medium text-muted-foreground">Posted</th>
                          <th className="text-right px-4 py-2 font-medium text-muted-foreground">Errors</th>
                          <th className="text-right px-4 py-2 font-medium text-muted-foreground">Rate</th>
                          <th className="text-left px-4 py-2 font-medium text-muted-foreground">Last Event</th>
                          <th className="text-left px-4 py-2 font-medium text-muted-foreground">Health</th>
                        </tr>
                      </thead>
                      <tbody>
                        {coverage.map((c, i) => {
                          const hcfg = HEALTH_CFG[c.health_status] ?? HEALTH_CFG.no_data;
                          return (
                            <tr key={c.source_table}
                              className={cn('border-b hover:bg-muted/20 cursor-pointer', i % 2 !== 0 && 'bg-muted/10')}
                              onClick={() => { setSourceFilter(c.source_table); handleTabChange('log'); void loadLog(); }}
                              data-testid={`coverage-row-${c.source_table}`}
                            >
                              <td className="px-4 py-2.5">
                                <div className="font-medium">{TABLE_LABELS[c.source_table] ?? c.source_table}</div>
                                <div className="text-[10px] text-muted-foreground font-mono">{c.source_table}</div>
                              </td>
                              <td className="px-4 py-2.5 text-right tabular-nums">{c.total_events.toLocaleString()}</td>
                              <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600">{c.success_count.toLocaleString()}</td>
                              <td className="px-4 py-2.5 text-right tabular-nums text-rose-600">
                                {c.error_count > 0 ? c.error_count : <span className="text-muted-foreground">—</span>}
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <div className="w-16 h-1.5 rounded bg-muted overflow-hidden">
                                    <div className="h-full bg-emerald-500 rounded" style={{ width: `${c.success_pct ?? 0}%` }} />
                                  </div>
                                  <span className="text-[10px] tabular-nums">{c.success_pct ?? 0}%</span>
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-muted-foreground">
                                {c.last_event_at ? format(parseISO(c.last_event_at), 'dd MMM yyyy HH:mm') : '—'}
                              </td>
                              <td className="px-4 py-2.5">
                                <Badge variant="outline" className={cn('text-[10px] gap-1', hcfg.class)}>
                                  <span className={cn('w-1.5 h-1.5 rounded-full', hcfg.dot)} />
                                  {hcfg.label}
                                </Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-4 py-2 text-[10px] text-muted-foreground border-t">
                    Click any row to drill into that module's audit log.
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}

      {/* AUDIT LOG TAB */}
      {tab === 'log' && (
        <div className="space-y-4">
          {/* KPI row */}
          <div className="grid grid-cols-3 gap-3">
            {(['success', 'error', 'skipped'] as const).map(s => {
              const cfg = STATUS_CFG[s];
              const Icon = cfg.icon;
              return (
                <Card key={s} className={cn('cursor-pointer border', statusFilter === s && 'ring-2 ring-indigo-500')}
                  onClick={() => setStatusFilter(prev => prev === s ? 'all' : s)}>
                  <CardContent className="p-3 flex items-center gap-3">
                    <Icon className={cn('w-5 h-5', s === 'success' ? 'text-emerald-600' : s === 'error' ? 'text-rose-600' : 'text-slate-500')} />
                    <div>
                      <div className="text-xs text-muted-foreground">{cfg.label}</div>
                      <div className="text-xl font-bold">{totals[s].toLocaleString()}</div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Module</Label>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="h-8 w-52 text-xs" data-testid="select-source-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Modules</SelectItem>
                  {Object.entries(TABLE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 w-36 text-xs" data-testid="select-status-filter"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="success">Posted</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                  <SelectItem value="skipped">Skipped</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input type="date" className="h-8 text-xs w-36" value={dateFrom} onChange={e => setDateFrom(e.target.value)} data-testid="input-date-from" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input type="date" className="h-8 text-xs w-36" value={dateTo} onChange={e => setDateTo(e.target.value)} data-testid="input-date-to" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Search</Label>
              <Input className="h-8 text-xs w-48" placeholder="event, ref, error…" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-audit-search" />
            </div>
            <Button size="sm" className="h-8" onClick={loadLog} disabled={loading} data-testid="button-apply-filters">
              {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
              Apply
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : filteredLog.length === 0 ? (
            <div className="text-center py-20 space-y-3">
              <TrendingUp className="w-10 h-10 mx-auto text-muted-foreground/40" />
              <p className="text-muted-foreground text-sm">No bridge events match the current filters.</p>
              <Button size="sm" onClick={loadLog}>Load Log</Button>
            </div>
          ) : (
            <Card>
              <CardContent className="px-0 pb-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground">Status</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground">Module</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground">Event</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground w-28">Source ID</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground">Journal / Error</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground w-36">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLog.map((e, i) => {
                        const scfg = STATUS_CFG[e.status] ?? STATUS_CFG.skipped;
                        const Icon = scfg.icon;
                        return (
                          <tr key={e.id}
                            className={cn('border-b hover:bg-muted/20', i % 2 !== 0 && 'bg-muted/10')}
                            data-testid={`log-row-${e.id}`}
                          >
                            <td className="px-4 py-2.5">
                              <Badge variant="outline" className={cn('text-[10px] gap-1', scfg.class)}>
                                <Icon className="w-3 h-3" />{scfg.label}
                              </Badge>
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="font-medium">{TABLE_LABELS[e.source_table] ?? e.source_table}</div>
                              <div className="text-[10px] text-muted-foreground font-mono">{e.event_type}</div>
                            </td>
                            <td className="px-4 py-2.5 font-mono text-[10px] text-muted-foreground">{e.event_type}</td>
                            <td className="px-4 py-2.5 font-mono text-[10px] text-muted-foreground" title={e.source_id}>
                              {e.source_id.slice(0, 8)}…
                            </td>
                            <td className="px-4 py-2.5 max-w-xs">
                              {e.status === 'success' ? (
                                <div>
                                  {e.je_reference && <span className="font-semibold text-indigo-700">#{e.je_reference} </span>}
                                  <span className="text-muted-foreground line-clamp-1">{e.je_description ?? 'Posted'}</span>
                                </div>
                              ) : e.status === 'error' ? (
                                <div className="flex items-start gap-1 text-rose-700">
                                  <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                                  <span className="line-clamp-2 font-mono text-[10px]">{e.error_message}</span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                              {format(parseISO(e.created_at), 'dd MMM yyyy HH:mm:ss')}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-2 text-[10px] text-muted-foreground border-t">
                  Showing {filteredLog.length.toLocaleString()} of {logEntries.length.toLocaleString()} entries.
                  Every row is an immutable audit record created by the GL Bridge Engine.
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
