import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  Loader2, RefreshCw, Download, Plus, CreditCard,
  ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, XCircle,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';

interface Advance {
  id: string; user_id: string; amount: number; currency: string;
  issue_date: string; reason: string | null; status: string;
  monthly_recovery: number | null; notes: string | null; created_at: string;
  staff_name?: string;
}
interface Recovery {
  id: string; advance_id: string; recovery_date: string; amount: number;
  payroll_period: string | null; notes: string | null;
}
interface GlBridgeEntry {
  source_id: string;
  status: 'success' | 'error' | 'skipped';
  event_type: string;
}

const STATUS_CFG: Record<string, { label: string; class: string }> = {
  active:           { label: 'Active',          class: 'bg-amber-100 text-amber-700 border-amber-300' },
  fully_recovered:  { label: 'Fully Recovered', class: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
  written_off:      { label: 'Written Off',     class: 'bg-rose-100 text-rose-700 border-rose-300' },
};

const BLANK_ADVANCE  = { user_id: '', amount: '', currency: 'USD', issue_date: '', reason: '', monthly_recovery: '', notes: '' };
const BLANK_RECOVERY = { recovery_date: '', amount: '', payroll_period: '', notes: '' };

export default function SalaryAdvancesPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch]               = useState('');
  const [statusFilter, setStatusFilter]   = useState('all');
  const [expandedId, setExpandedId]       = useState<string | null>(null);

  const [showAdd, setShowAdd]             = useState(false);
  const [saving, setSaving]               = useState(false);
  const [form, setForm]                   = useState(BLANK_ADVANCE);

  const [recoveryAdvId, setRecoveryAdvId] = useState<string | null>(null);
  const [recoveryForm, setRecoveryForm]   = useState(BLANK_RECOVERY);
  const [savingRecovery, setSavingRecovery] = useState(false);

  const { data: profiles } = useQuery({
    queryKey: ['advance_profiles'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, full_name').order('full_name').limit(500);
      return (data ?? []) as { id: string; full_name: string | null }[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: advances, isLoading, refetch } = useQuery({
    queryKey: ['salary_advances'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hr_salary_advances' as any)
        .select('*')
        .order('issue_date', { ascending: false })
        .limit(500);
      if (error?.code === '42P01') return null; // table not yet migrated
      const profs = profiles ?? [];
      return ((data ?? []) as Advance[]).map(a => ({
        ...a,
        staff_name: profs.find(p => p.id === a.user_id)?.full_name ?? a.user_id.slice(0, 8),
      }));
    },
    enabled: !!profiles,
    staleTime: 30_000,
  });

  const { data: recoveries } = useQuery({
    queryKey: ['advance_recoveries'],
    queryFn: async () => {
      const { data } = await supabase
        .from('hr_salary_advance_recoveries' as any)
        .select('*')
        .order('recovery_date', { ascending: false })
        .limit(2000)
        .catch(() => ({ data: [] }));
      return ((data as any)?.data ?? data ?? []) as Recovery[];
    },
    staleTime: 30_000,
  });

  // GL Bridge log — fetch statuses for all advances + recoveries
  const { data: glLog } = useQuery({
    queryKey: ['advances_gl_log'],
    queryFn: async () => {
      if (!advances?.length) return {} as Record<string, GlBridgeEntry>;
      const advIds = advances.map(a => a.id);
      const { data } = await supabase
        .from('acct_gl_bridge_log' as any)
        .select('source_id, status, event_type')
        .in('source_table', ['hr_salary_advances', 'hr_salary_advance_recoveries'])
        .in('source_id', advIds.slice(0, 500))
        .order('created_at', { ascending: false });
      const map: Record<string, GlBridgeEntry> = {};
      for (const row of ((data ?? []) as any[]) as GlBridgeEntry[]) {
        if (!map[row.source_id]) map[row.source_id] = row;
      }
      return map;
    },
    enabled: !!advances?.length,
    staleTime: 30_000,
  });

  const filtered = (advances ?? []).filter(a => {
    if (statusFilter !== 'all' && a.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (a.staff_name ?? '').toLowerCase().includes(q) || (a.reason ?? '').toLowerCase().includes(q);
    }
    return true;
  });

  const getOutstanding = useCallback((advId: string, principal: number) => {
    const recovered = (recoveries ?? []).filter(r => r.advance_id === advId).reduce((s, r) => s + r.amount, 0);
    return Math.max(0, principal - recovered);
  }, [recoveries]);

  const totals = filtered.reduce((acc, a) => ({
    principal:   acc.principal + a.amount,
    outstanding: acc.outstanding + getOutstanding(a.id, a.amount),
  }), { principal: 0, outstanding: 0 });

  const saveAdvance = async () => {
    if (!form.user_id || !form.amount || !form.issue_date) {
      toast({ title: 'Staff, amount, and issue date are required', variant: 'destructive' }); return;
    }
    setSaving(true);
    const { error } = await supabase.from('hr_salary_advances' as any).insert({
      user_id: form.user_id,
      amount: parseFloat(form.amount),
      currency: form.currency,
      issue_date: form.issue_date,
      reason: form.reason || null,
      monthly_recovery: form.monthly_recovery ? parseFloat(form.monthly_recovery) : null,
      notes: form.notes || null,
      status: 'active',
    });
    setSaving(false);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Advance recorded — GL journal posted automatically', description: 'DR: Salary Advances Receivable (1520) / CR: Cash at Bank (1200)' });
    setShowAdd(false);
    setForm(BLANK_ADVANCE);
    void refetch();
    void queryClient.invalidateQueries({ queryKey: ['advances_gl_log'] });
  };

  const saveRecovery = async () => {
    if (!recoveryAdvId || !recoveryForm.recovery_date || !recoveryForm.amount) {
      toast({ title: 'Date and amount are required', variant: 'destructive' }); return;
    }
    setSavingRecovery(true);
    const adv = (advances ?? []).find(a => a.id === recoveryAdvId);
    const outstanding = adv ? getOutstanding(recoveryAdvId, adv.amount) : 0;
    const recAmt = parseFloat(recoveryForm.amount);

    const { error } = await supabase.from('hr_salary_advance_recoveries' as any).insert({
      advance_id: recoveryAdvId,
      recovery_date: recoveryForm.recovery_date,
      amount: recAmt,
      payroll_period: recoveryForm.payroll_period || null,
      notes: recoveryForm.notes || null,
    });

    if (!error && adv && recAmt >= outstanding - 0.01) {
      await supabase.from('hr_salary_advances' as any).update({ status: 'fully_recovered' }).eq('id', recoveryAdvId);
    }

    setSavingRecovery(false);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Recovery recorded — GL journal posted automatically', description: 'DR: Cash at Bank (1200) / CR: Salary Advances Receivable (1520)' });
    setRecoveryAdvId(null);
    setRecoveryForm(BLANK_RECOVERY);
    void queryClient.invalidateQueries({ queryKey: ['salary_advances'] });
    void queryClient.invalidateQueries({ queryKey: ['advance_recoveries'] });
    void queryClient.invalidateQueries({ queryKey: ['advances_gl_log'] });
  };

  const exportXlsx = () => {
    const data = filtered.map(a => ({
      'Staff':           a.staff_name,
      'Issue Date':      a.issue_date,
      'Amount':          a.amount,
      'Currency':        a.currency,
      'Outstanding':     getOutstanding(a.id, a.amount),
      'Status':          STATUS_CFG[a.status]?.label ?? a.status,
      'GL Posted':       glLog?.[a.id]?.status === 'success' ? 'Yes' : glLog?.[a.id]?.status === 'error' ? 'Error' : 'Pending',
      'Reason':          a.reason ?? '',
      'Monthly Recovery Plan': a.monthly_recovery ?? '',
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Advances');
    XLSX.writeFile(wb, `salary_advances_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const migrationNeeded = advances === null;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-rose-600 text-white shrink-0">
            <CreditCard className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Salary Advances</h2>
            <p className="text-sm text-muted-foreground">سلف الرواتب — Automatic GL posting: DR 1520 / CR 1200 on issue; DR 1200 / CR 1520 on recovery</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={cn('h-4 w-4 mr-1', isLoading && 'animate-spin')} />Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportXlsx} disabled={!filtered.length}>
            <Download className="h-4 w-4 mr-1" />Export
          </Button>
          {!migrationNeeded && (
            <Button size="sm" onClick={() => setShowAdd(true)} data-testid="button-add-advance">
              <Plus className="h-4 w-4 mr-1" />Issue Advance
            </Button>
          )}
        </div>
      </div>

      {migrationNeeded ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/10 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Migration required</p>
            <p className="text-xs text-amber-700 mt-1">Run <code className="bg-amber-100 px-1 rounded">supabase/migrations/hr_advances_grant_milestones.sql</code> and <code className="bg-amber-100 px-1 rounded">accounting_gl_bridges_phase3.sql</code> to enable Salary Advances with GL auto-posting.</p>
          </div>
        </div>
      ) : (
        <>
          {/* GL Bridge Info */}
          <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 dark:bg-indigo-950/10 px-4 py-2.5 text-xs text-indigo-800 dark:text-indigo-300 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-indigo-600" />
            <span>
              <strong>Automatic GL Bridge active.</strong> Every advance issued → DR: Salary Advances Receivable (1520) / CR: Cash at Bank (1200).
              Every recovery → DR: Cash at Bank (1200) / CR: Salary Advances Receivable (1520). All entries are timestamped and logged.
            </span>
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-3 gap-3">
            <Card><CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Total Issued</div>
              <div className="text-xl font-bold mt-1 text-rose-700 dark:text-rose-400">{totals.principal.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
            </CardContent></Card>
            <Card><CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Total Outstanding</div>
              <div className="text-xl font-bold mt-1 text-amber-700 dark:text-amber-400">{totals.outstanding.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
            </CardContent></Card>
            <Card><CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Active Advances</div>
              <div className="text-xl font-bold mt-1">{(advances ?? []).filter(a => a.status === 'active').length}</div>
            </CardContent></Card>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <Input className="h-9 text-sm max-w-xs" placeholder="Search staff or reason…" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-advance-search" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-44" data-testid="select-advance-status"><SelectValue placeholder="All Statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {Object.entries(STATUS_CFG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground text-sm">No salary advances found. Click "Issue Advance" to create the first one.</div>
          ) : (
            <div className="space-y-2">
              {filtered.map(a => {
                const outstanding = getOutstanding(a.id, a.amount);
                const pct = a.amount > 0 ? Math.round(((a.amount - outstanding) / a.amount) * 100) : 0;
                const advRecoveries = (recoveries ?? []).filter(r => r.advance_id === a.id);
                const expanded = expandedId === a.id;
                const cfg = STATUS_CFG[a.status] ?? STATUS_CFG['active'];
                const gl = glLog?.[a.id];

                return (
                  <Card key={a.id} data-testid={`card-advance-${a.id}`}>
                    <CardContent className="p-0">
                      <button
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors text-left"
                        onClick={() => setExpandedId(expanded ? null : a.id)}
                      >
                        {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm">{a.staff_name}</span>
                            <Badge variant="outline" className={cn('text-[10px]', cfg.class)}>{cfg.label}</Badge>
                            {/* GL posting badge */}
                            {gl?.status === 'success' ? (
                              <Badge variant="outline" className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-300 gap-1">
                                <CheckCircle2 className="h-3 w-3" />GL Posted
                              </Badge>
                            ) : gl?.status === 'error' ? (
                              <Badge variant="outline" className="text-[10px] bg-rose-100 text-rose-700 border-rose-300 gap-1">
                                <XCircle className="h-3 w-3" />GL Error
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] text-slate-400">GL Pending</Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Issued {a.issue_date} · {a.currency} {a.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                            {a.reason && ` · ${a.reason}`}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-bold tabular-nums">{outstanding.toLocaleString('en-US', { maximumFractionDigits: 2 })} outstanding</div>
                          <div className="text-[10px] text-muted-foreground">{pct}% recovered</div>
                        </div>
                      </button>

                      {/* Progress bar */}
                      <div className="h-1 bg-muted mx-4 mb-0 rounded-full overflow-hidden">
                        <div className={cn('h-full rounded-full', pct >= 100 ? 'bg-emerald-500' : 'bg-amber-500')} style={{ width: `${pct}%` }} />
                      </div>

                      {expanded && (
                        <div className="px-4 pb-4 pt-3 border-t mt-0 space-y-3">
                          {/* GL detail */}
                          {gl && (
                            <div className={cn('rounded-lg px-3 py-2 text-xs flex items-start gap-2',
                              gl.status === 'success' ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 border border-emerald-200' :
                              gl.status === 'error'   ? 'bg-rose-50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-300 border border-rose-200' :
                              'bg-slate-50 text-slate-600 border border-slate-200'
                            )}>
                              {gl.status === 'success' ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" /> : <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
                              <span>
                                <strong>GL Bridge:</strong> {gl.status === 'success'
                                  ? 'Journal entry posted — DR: Salary Advances Receivable (1520) / CR: Cash at Bank (1200)'
                                  : 'GL posting failed — check GL Bridge Audit page for details'}
                              </span>
                            </div>
                          )}

                          {a.monthly_recovery && (
                            <div className="text-xs text-muted-foreground">Recovery plan: <strong>{a.monthly_recovery} {a.currency}/month</strong></div>
                          )}
                          {a.notes && <div className="text-xs text-muted-foreground">Notes: {a.notes}</div>}

                          {/* Recovery history */}
                          <div>
                            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Recovery History</div>
                            {advRecoveries.length === 0 ? (
                              <div className="text-xs text-muted-foreground">No recoveries recorded yet.</div>
                            ) : (
                              <div className="space-y-1">
                                {advRecoveries.map(rec => (
                                  <div key={rec.id} className="flex items-center gap-2 text-xs text-muted-foreground" data-testid={`row-recovery-${rec.id}`}>
                                    <span className="w-24 shrink-0">{rec.recovery_date}</span>
                                    <span className="flex-1">{rec.payroll_period ?? '—'}</span>
                                    <span className="font-medium text-foreground">{rec.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
                                    {glLog?.[rec.id]?.status === 'success' && (
                                      <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {a.status === 'active' && (
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setRecoveryAdvId(a.id); setRecoveryForm(BLANK_RECOVERY); }} data-testid={`button-recover-${a.id}`}>
                              <Plus className="h-3.5 w-3.5 mr-1" />Record Recovery
                            </Button>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Issue Advance Dialog ────────────────────────────────── */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Issue Salary Advance</DialogTitle></DialogHeader>
          <div className="text-xs text-muted-foreground rounded border px-3 py-2 bg-muted/30 mb-2">
            Saving this will automatically post: <strong>DR: Salary Advances Receivable (1520) / CR: Cash at Bank (1200)</strong> to the General Ledger.
          </div>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs mb-1 block">Staff Member *</Label>
              <Select value={form.user_id} onValueChange={v => setForm(p => ({ ...p, user_id: v }))}>
                <SelectTrigger className="h-8" data-testid="select-advance-user"><SelectValue placeholder="Select staff" /></SelectTrigger>
                <SelectContent>{(profiles ?? []).map(p => <SelectItem key={p.id} value={p.id}>{p.full_name ?? p.id}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1 block">Amount *</Label>
                <Input type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} className="h-8 text-sm" data-testid="input-advance-amount" />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Currency</Label>
                <Input value={form.currency} onChange={e => setForm(p => ({ ...p, currency: e.target.value }))} className="h-8 text-sm" />
              </div>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Issue Date *</Label>
              <Input type="date" value={form.issue_date} onChange={e => setForm(p => ({ ...p, issue_date: e.target.value }))} className="h-8 text-sm" data-testid="input-advance-date" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Monthly Recovery Amount (Payroll Deduction)</Label>
              <Input type="number" min="0" step="0.01" value={form.monthly_recovery} onChange={e => setForm(p => ({ ...p, monthly_recovery: e.target.value }))} className="h-8 text-sm" placeholder="Deducted from payroll each month" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Reason</Label>
              <Input value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className="text-sm min-h-[60px]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={saveAdvance} disabled={saving} data-testid="button-save-advance">
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Issue Advance
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Record Recovery Dialog ──────────────────────────────── */}
      <Dialog open={!!recoveryAdvId} onOpenChange={open => { if (!open) setRecoveryAdvId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Record Recovery</DialogTitle></DialogHeader>
          <div className="text-xs text-muted-foreground rounded border px-3 py-2 bg-muted/30 mb-2">
            Saving will post: <strong>DR: Cash at Bank (1200) / CR: Salary Advances Receivable (1520)</strong>.
          </div>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs mb-1 block">Recovery Date *</Label>
              <Input type="date" value={recoveryForm.recovery_date} onChange={e => setRecoveryForm(p => ({ ...p, recovery_date: e.target.value }))} className="h-8 text-sm" data-testid="input-recovery-date" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Amount Recovered *</Label>
              <Input type="number" min="0" step="0.01" value={recoveryForm.amount} onChange={e => setRecoveryForm(p => ({ ...p, amount: e.target.value }))} className="h-8 text-sm" data-testid="input-recovery-amount" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Payroll Period (e.g. 2026-05)</Label>
              <Input value={recoveryForm.payroll_period} onChange={e => setRecoveryForm(p => ({ ...p, payroll_period: e.target.value }))} className="h-8 text-sm" placeholder="YYYY-MM" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Notes</Label>
              <Input value={recoveryForm.notes} onChange={e => setRecoveryForm(p => ({ ...p, notes: e.target.value }))} className="h-8 text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecoveryAdvId(null)}>Cancel</Button>
            <Button onClick={saveRecovery} disabled={savingRecovery} data-testid="button-save-recovery">
              {savingRecovery && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save Recovery
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
