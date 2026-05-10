import { useEffect, useMemo, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import {
  Loader2, RefreshCw, Lock, Unlock, CheckCircle2, XCircle,
  AlertTriangle, Clock, Calendar, ChevronDown, ChevronRight,
  BookOpen, Landmark, FileText, DollarSign, ShieldCheck, Info,
  ClipboardCheck,
} from 'lucide-react';
import { format, parseISO, isAfter } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';

interface FiscalYear { id: string; code: string; start_date: string; end_date: string; is_closed: boolean }
interface Period {
  id: string; fiscal_year_id: string; period_no: number;
  start_date: string; end_date: string;
  status: 'open' | 'soft_closed' | 'hard_closed' | 'locked'; closed_at: string | null;
}

interface PeriodHealth {
  periodId: string;
  draftJournals: number;
  unmatchedBankLines: number;
  outstandingAP: number;
  loading: boolean;
}

const STATUS_CFG: Record<string, { label: string; color: string; icon: React.ElementType; order: number }> = {
  open:        { label: 'Open',        color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30',    icon: Unlock,      order: 0 },
  soft_closed: { label: 'Soft Closed', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30', icon: Clock,       order: 1 },
  hard_closed: { label: 'Hard Closed', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30', icon: ShieldCheck, order: 2 },
  locked:      { label: 'Locked',      color: 'bg-slate-100 text-slate-700 dark:bg-slate-800/60', icon: Lock,        order: 3 },
};

const TRANSITIONS: Record<string, { next: string; label: string; warn?: string }[]> = {
  open:        [{ next: 'soft_closed', label: 'Soft Close', warn: 'Journal posting will be restricted. You can still make adjustments.' }],
  soft_closed: [
    { next: 'open',        label: 'Re-Open' },
    { next: 'hard_closed', label: 'Hard Close', warn: 'No new journal entries will be allowed in this period.' },
  ],
  hard_closed: [
    { next: 'soft_closed', label: 'Downgrade to Soft Closed' },
    { next: 'locked',      label: 'Lock Period', warn: 'This is permanent. A locked period cannot be re-opened without DBA intervention.' },
  ],
  locked: [],
};

const CHECK_LABELS: Record<string, { label: string; icon: React.ElementType; desc: string }> = {
  draftJournals:      { label: 'Unposted Journals',        icon: BookOpen,   desc: 'Draft or pending-approval journals within this period' },
  unmatchedBankLines: { label: 'Unmatched Bank Lines',     icon: Landmark,   desc: 'Bank statement lines not yet matched to a journal entry' },
  outstandingAP:      { label: 'Outstanding AP Invoices',  icon: FileText,   desc: 'AP invoices due by period end that are not yet paid' },
};

export default function AccountingPeriodClose() {
  const { hasAnyRole, loading: authLoading } = useAuthorization();
  const allowed   = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);
  const canClose  = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin']);
  const { toast } = useToast();

  const [years, setYears]       = useState<FiscalYear[]>([]);
  const [periods, setPeriods]   = useState<Period[]>([]);
  const [selectedYear, setSelectedYear] = useState('');
  const [loading, setLoading]   = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [health, setHealth]     = useState<Map<string, PeriodHealth>>(new Map());
  const [transitioning, setTransitioning] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ period: Period; next: string; label: string; warn?: string } | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [runAllocation, setRunAllocation] = useState(false);
  const [allocationResult, setAllocationResult] = useState<{ processed: number; errors: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: yData }, { data: pData }] = await Promise.all([
      supabase.from('acct_fiscal_years').select('id, code, start_date, end_date, is_closed').order('start_date', { ascending: false }),
      supabase.from('acct_fiscal_periods').select('id, fiscal_year_id, period_no, start_date, end_date, status, closed_at').order('period_no'),
    ]);
    const ys = (yData ?? []) as FiscalYear[];
    setYears(ys);
    setPeriods((pData ?? []) as Period[]);
    if (ys.length > 0 && !selectedYear) setSelectedYear(ys[0].id);
    setLoading(false);
  }, [selectedYear]);

  useEffect(() => { if (allowed) void load(); }, [allowed]);

  const visiblePeriods = useMemo(() =>
    periods.filter(p => p.fiscal_year_id === selectedYear).sort((a, b) => a.period_no - b.period_no),
    [periods, selectedYear]
  );

  const selectedFY = useMemo(() => years.find(y => y.id === selectedYear), [years, selectedYear]);

  const loadHealth = useCallback(async (period: Period) => {
    setHealth(prev => new Map(prev).set(period.id, {
      periodId: period.id, draftJournals: 0, unmatchedBankLines: 0, outstandingAP: 0, loading: true,
    }));
    const [jRes, apRes, blRes] = await Promise.all([
      supabase.from('acct_journal_entries')
        .select('id', { count: 'exact', head: true })
        .eq('period_id', period.id)
        .in('status', ['draft', 'pending_approval']),
      supabase.from('acct_invoices')
        .select('id', { count: 'exact', head: true })
        .not('status', 'in', '("paid","cancelled","rejected")')
        .lte('due_date', period.end_date),
      supabase.from('acct_bank_statement_lines')
        .select('id', { count: 'exact', head: true })
        .eq('is_matched', false)
        .eq('is_excluded', false)
        .gte('statement_date', period.start_date)
        .lte('statement_date', period.end_date),
    ]);
    setHealth(prev => new Map(prev).set(period.id, {
      periodId: period.id,
      draftJournals: jRes.count ?? 0,
      unmatchedBankLines: blRes.count ?? 0,
      outstandingAP: apRes.count ?? 0,
      loading: false,
    }));
  }, []);

  const toggle = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
      const p = periods.find(p => p.id === id);
      if (p && !health.has(id)) void loadHealth(p);
    }
    setExpanded(next);
  };

  const doTransition = async () => {
    if (!confirmDialog) return;
    const { period, next, warn } = confirmDialog;
    if (warn && confirmText.toLowerCase() !== 'confirm') {
      toast({ title: 'Type "confirm" to proceed', variant: 'destructive' }); return;
    }
    setTransitioning(period.id);
    setAllocationResult(null);
    const update: Record<string, unknown> = { status: next };
    if (['soft_closed', 'hard_closed', 'locked'].includes(next)) update.closed_at = new Date().toISOString();
    else update.closed_at = null;
    const { error } = await supabase.from('acct_fiscal_periods').update(update).eq('id', period.id);
    if (error) {
      setTransitioning(null);
      setConfirmDialog(null);
      setConfirmText('');
      toast({ title: 'Failed', description: error.message, variant: 'destructive' });
      return;
    }

    // Run cost allocation if requested and closing (not re-opening)
    if (runAllocation && ['soft_closed', 'hard_closed'].includes(next)) {
      const { data: allocData, error: allocError } = await supabase.rpc(
        'run_period_close_allocation' as any,
        { p_period_id: period.id }
      );
      if (allocError) {
        toast({
          title: 'Period closed, but allocation failed',
          description: allocError.message,
          variant: 'destructive',
        });
      } else {
        const res = allocData as any;
        setAllocationResult({ processed: res?.processed ?? 0, errors: res?.errors ?? 0 });
        toast({
          title: `Period ${STATUS_CFG[next]?.label ?? next} + Allocation run`,
          description: `${res?.processed ?? 0} allocation rules processed, ${res?.errors ?? 0} errors.`,
        });
      }
    } else {
      toast({ title: `Period ${STATUS_CFG[next]?.label ?? next}` });
    }

    setTransitioning(null);
    setConfirmDialog(null);
    setConfirmText('');
    setRunAllocation(false);
    void load();
    if (expanded.has(period.id)) void loadHealth({ ...period, status: next as any });
  };

  const stats = useMemo(() => {
    const open   = visiblePeriods.filter(p => p.status === 'open').length;
    const closed = visiblePeriods.filter(p => p.status !== 'open').length;
    const locked = visiblePeriods.filter(p => p.status === 'locked').length;
    const today = new Date();
    const pastOpen = visiblePeriods.filter(p => p.status === 'open' && isAfter(today, parseISO(p.end_date))).length;
    return { open, closed, locked, pastOpen };
  }, [visiblePeriods]);

  if (authLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!allowed)   return <Navigate to="/" replace />;

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-[1000px]">
      <PageInfoBanner
        title="Period Close Management"
        description="Guided period-close workflow. Each period progresses from Open → Soft Closed → Hard Closed → Locked. Pre-close checks verify journals, bank reconciliation, and AP invoices before each transition."
        workflowSteps={[
          { step: 1, role: 'Finance Admin', action: 'Open',                   description: 'Period is open; all journal entries are permitted.' },
          { step: 2, role: 'Finance Admin', action: 'Soft Close',             description: 'Restrict new posts — only period-close adjustments allowed.' },
          { step: 3, role: 'Finance Admin', action: 'Hard Close',             description: 'No new journal entries allowed; period is finalised.' },
          { step: 4, role: 'Super Admin',   action: 'Locked',                 description: 'Period is permanently locked; no changes possible.' },
        ]}
      />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 text-orange-600" /> Period Close
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage fiscal period close workflow with pre-close health checks.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} data-testid="button-refresh-close">
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
      </div>

      {/* FY selector */}
      <Card className="border shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="space-y-1 flex-1 max-w-sm">
              <Label>Fiscal Year</Label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger data-testid="select-fiscal-year"><SelectValue placeholder="Select fiscal year" /></SelectTrigger>
                <SelectContent>
                  {years.map(y => (
                    <SelectItem key={y.id} value={y.id}>
                      {y.code} — {format(parseISO(y.start_date), 'dd MMM yyyy')} to {format(parseISO(y.end_date), 'dd MMM yyyy')}
                      {y.is_closed && ' (Closed)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedFY && (
              <div className="flex gap-3 text-sm">
                <div className="text-center">
                  <p className="text-2xl font-bold text-blue-600">{stats.open}</p>
                  <p className="text-xs text-muted-foreground">Open</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-amber-600">{stats.closed - stats.locked}</p>
                  <p className="text-xs text-muted-foreground">Closed</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-slate-600">{stats.locked}</p>
                  <p className="text-xs text-muted-foreground">Locked</p>
                </div>
                {stats.pastOpen > 0 && (
                  <div className="text-center">
                    <p className="text-2xl font-bold text-rose-600">{stats.pastOpen}</p>
                    <p className="text-xs text-muted-foreground">Past-due open</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Periods list */}
      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : visiblePeriods.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No periods found for this fiscal year.</p>
          <p className="text-xs mt-1">Create periods in Fiscal Years & Periods.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visiblePeriods.map(period => {
            const scfg = STATUS_CFG[period.status] ?? STATUS_CFG.open;
            const Icon = scfg.icon;
            const isExpanded = expanded.has(period.id);
            const h = health.get(period.id);
            const transitions = canClose ? (TRANSITIONS[period.status] ?? []) : [];
            const today = new Date();
            const isPastEnd = isAfter(today, parseISO(period.end_date));
            const needsClose = period.status === 'open' && isPastEnd;

            return (
              <Card key={period.id} className={cn('border shadow-sm transition-all',
                needsClose ? 'border-rose-200 dark:border-rose-800/50' :
                period.status === 'locked' ? 'border-slate-200 dark:border-slate-700 opacity-80' :
                'border-border'
              )}>
                <CardHeader className="p-0">
                  <button
                    className="w-full text-left flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors rounded-t-xl"
                    onClick={() => toggle(period.id)}
                    data-testid={`period-row-${period.id}`}
                  >
                    <div className={cn('p-2 rounded-lg shrink-0',
                      period.status === 'locked' ? 'bg-slate-100 dark:bg-slate-800' :
                      period.status === 'hard_closed' ? 'bg-orange-100 dark:bg-orange-900/40' :
                      period.status === 'soft_closed' ? 'bg-amber-100 dark:bg-amber-900/40' :
                      'bg-blue-100 dark:bg-blue-900/40'
                    )}>
                      <Icon className={cn('w-4 h-4',
                        period.status === 'locked' ? 'text-slate-600' :
                        period.status === 'hard_closed' ? 'text-orange-600' :
                        period.status === 'soft_closed' ? 'text-amber-600' :
                        'text-blue-600'
                      )} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">Period {period.period_no}</span>
                        <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium', scfg.color)}>
                          {scfg.label}
                        </span>
                        {needsClose && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-rose-100 text-rose-700">
                            <AlertTriangle className="w-3 h-3" /> Needs closing
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {format(parseISO(period.start_date), 'dd MMM yyyy')} – {format(parseISO(period.end_date), 'dd MMM yyyy')}
                        {period.closed_at && ` · Closed ${format(parseISO(period.closed_at), 'dd MMM yyyy')}`}
                      </p>
                    </div>
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                  </button>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="p-4 pt-0 space-y-4">
                    <Separator />

                    {/* Pre-close checks */}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Pre-Close Health Checks</p>
                      {h?.loading ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                          <Loader2 className="w-4 h-4 animate-spin" /> Running checks…
                        </div>
                      ) : h ? (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          {(Object.keys(CHECK_LABELS) as (keyof typeof CHECK_LABELS)[]).map(key => {
                            const count = h[key as keyof PeriodHealth] as number;
                            const cfg = CHECK_LABELS[key];
                            const CheckIcon = cfg.icon;
                            const isOk = count === 0;
                            return (
                              <div key={key} className={cn('rounded-xl border p-3',
                                isOk ? 'border-emerald-200 bg-emerald-50/40 dark:border-emerald-800/50 dark:bg-emerald-950/10'
                                     : 'border-amber-200 bg-amber-50/40 dark:border-amber-800/50 dark:bg-amber-950/10'
                              )}>
                                <div className="flex items-start gap-2">
                                  <CheckIcon className={cn('w-4 h-4 shrink-0 mt-0.5', isOk ? 'text-emerald-600' : 'text-amber-600')} />
                                  <div className="min-w-0">
                                    <p className="text-xs font-medium">{cfg.label}</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">{cfg.desc}</p>
                                  </div>
                                </div>
                                <div className="mt-2 flex items-center gap-1.5">
                                  {isOk
                                    ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                    : <AlertTriangle className="w-4 h-4 text-amber-500" />}
                                  <span className={cn('text-sm font-bold', isOk ? 'text-emerald-600' : 'text-amber-600')}>
                                    {isOk ? 'Clear' : `${count} outstanding`}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => void loadHealth(period)}>
                          Run Health Checks
                        </Button>
                      )}
                    </div>

                    {/* Transition actions */}
                    {transitions.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Period Actions</p>
                        <div className="flex flex-wrap gap-2">
                          {transitions.map(t => (
                            <Button key={t.next} size="sm" variant="outline"
                              className={cn(
                                t.next === 'locked'      && 'border-slate-400 text-slate-700 hover:bg-slate-50',
                                t.next === 'hard_closed' && 'border-orange-300 text-orange-700 hover:bg-orange-50',
                                t.next === 'soft_closed' && 'border-amber-300 text-amber-700 hover:bg-amber-50',
                                t.next === 'open'        && 'border-blue-300 text-blue-700 hover:bg-blue-50',
                              )}
                              disabled={transitioning === period.id}
                              onClick={() => { setConfirmDialog({ period, ...t }); setConfirmText(''); }}
                              data-testid={`btn-period-${t.next}-${period.id}`}
                            >
                              {transitioning === period.id ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Icon className="w-3.5 h-3.5 mr-1" />}
                              {t.label}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}

                    {period.status === 'locked' && (
                      <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 rounded p-3">
                        <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>This period is permanently locked. Contact a database administrator to unlock it if absolutely necessary.</span>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Confirm Dialog */}
      <Dialog open={!!confirmDialog} onOpenChange={v => { if (!v) { setConfirmDialog(null); setConfirmText(''); } }}>
        <DialogContent className="max-w-md">
          {confirmDialog && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {confirmDialog.next === 'locked'
                    ? <Lock className="w-4 h-4 text-rose-600" />
                    : <ShieldCheck className="w-4 h-4 text-amber-600" />}
                  Confirm: {confirmDialog.label}
                </DialogTitle>
                <DialogDescription>
                  Period {confirmDialog.period.period_no} · {format(parseISO(confirmDialog.period.start_date), 'MMM yyyy')}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                {confirmDialog.warn && (
                  <div className={cn('rounded border p-3 text-sm flex gap-2',
                    confirmDialog.next === 'locked'
                      ? 'border-rose-200 bg-rose-50 text-rose-800'
                      : 'border-amber-200 bg-amber-50 text-amber-800'
                  )}>
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <p>{confirmDialog.warn}</p>
                  </div>
                )}
                {confirmDialog.warn && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Type <strong>confirm</strong> to proceed</Label>
                    <Input
                      value={confirmText}
                      onChange={e => setConfirmText(e.target.value)}
                      placeholder="confirm"
                      data-testid="input-confirm-close"
                    />
                  </div>
                )}
                {['soft_closed', 'hard_closed'].includes(confirmDialog.next) && (
                  <label className="flex items-start gap-2.5 cursor-pointer rounded-lg border border-indigo-200 bg-indigo-50 dark:bg-indigo-950/20 p-3">
                    <input
                      type="checkbox"
                      checked={runAllocation}
                      onChange={e => setRunAllocation(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-indigo-400 text-indigo-600"
                      data-testid="checkbox-run-allocation"
                    />
                    <div>
                      <div className="text-sm font-medium text-indigo-900 dark:text-indigo-200">Run Cost Allocation</div>
                      <div className="text-xs text-indigo-700 dark:text-indigo-400 mt-0.5">
                        Automatically execute all active cost allocation rules for this period and post journal entries to the GL. Results appear in GL Bridge Audit.
                      </div>
                    </div>
                  </label>
                )}
                {allocationResult && (
                  <div className="rounded border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 p-3 text-xs text-emerald-800 dark:text-emerald-300">
                    Allocation complete: {allocationResult.processed} rules processed, {allocationResult.errors} errors.
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setConfirmDialog(null); setConfirmText(''); }}>Cancel</Button>
                <Button
                  variant={confirmDialog.next === 'locked' ? 'destructive' : 'default'}
                  disabled={!!confirmDialog.warn && confirmText.toLowerCase() !== 'confirm'}
                  onClick={doTransition}
                  data-testid="button-confirm-close"
                >
                  {confirmDialog.label}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
