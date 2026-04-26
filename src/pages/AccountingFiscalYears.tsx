import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Loader2, RefreshCw, Plus, ChevronRight, ChevronDown, Calendar, Lock, Unlock,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO } from 'date-fns';
import { ACCT_STATUS_TONE } from '@/lib/accountingFormat';
import { cn } from '@/lib/utils';

interface FiscalYear {
  id: string;
  code: string;
  start_date: string;
  end_date: string;
  is_closed: boolean;
  created_at: string;
}

interface Period {
  id: string;
  fiscal_year_id: string;
  period_no: number;
  start_date: string;
  end_date: string;
  status: 'open' | 'soft_closed' | 'hard_closed' | 'locked';
  closed_at: string | null;
}

const PERIOD_STATUSES = ['open', 'soft_closed', 'hard_closed', 'locked'] as const;
const STATUS_LABELS: Record<string, string> = {
  open: 'Open', soft_closed: 'Soft Closed', hard_closed: 'Hard Closed', locked: 'Locked',
};

export default function AccountingFiscalYears() {
  const { hasAnyRole, loading: authLoading } = useAuthorization();
  const allowed    = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);
  const canManage  = hasAnyRole(['super_admin', 'admin']);
  const { toast }  = useToast();

  const [years, setYears]     = useState<FiscalYear[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // FY form
  const [fyOpen, setFyOpen]   = useState(false);
  const [fyForm, setFyForm]   = useState({ code: '', start_date: '', end_date: '' });
  const [fySaving, setFySaving] = useState(false);

  // Period form
  const [pOpen, setPOpen]       = useState(false);
  const [pFyId, setPFyId]       = useState('');
  const [pForm, setPForm]        = useState({ period_no: '', start_date: '', end_date: '', status: 'open' });
  const [pSaving, setPSaving]   = useState(false);

  // Period status change
  const [statusBusy, setStatusBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const [yRes, pRes] = await Promise.all([
      supabase.from('acct_fiscal_years').select('id, code, start_date, end_date, is_closed, created_at').order('start_date', { ascending: false }),
      supabase.from('acct_fiscal_periods').select('id, fiscal_year_id, period_no, start_date, end_date, status, closed_at').order('period_no'),
    ]);
    if (yRes.error) setError(yRes.error.message);
    setYears((yRes.data ?? []) as FiscalYear[]);
    setPeriods((pRes.data ?? []) as Period[]);
    setLoading(false);
  };

  useEffect(() => { if (allowed) void load(); }, [allowed]);

  const periodsByYear = useMemo(() => {
    const m = new Map<string, Period[]>();
    for (const p of periods) {
      if (!m.has(p.fiscal_year_id)) m.set(p.fiscal_year_id, []);
      m.get(p.fiscal_year_id)!.push(p);
    }
    return m;
  }, [periods]);

  const toggle = (id: string) => {
    setExpanded(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  // ── Save FY ──────────────────────────────────────────────
  const saveFY = async () => {
    if (!fyForm.code.trim() || !fyForm.start_date || !fyForm.end_date) {
      toast({ title: 'Code, start date, and end date are required', variant: 'destructive' });
      return;
    }
    setFySaving(true);
    const { error: err } = await supabase.from('acct_fiscal_years').insert({
      code: fyForm.code.trim(),
      start_date: fyForm.start_date,
      end_date: fyForm.end_date,
      is_closed: false,
    });
    setFySaving(false);
    if (err) toast({ title: 'Failed to create fiscal year', description: err.message, variant: 'destructive' });
    else {
      toast({ title: 'Fiscal year created' });
      setFyOpen(false);
      setFyForm({ code: '', start_date: '', end_date: '' });
      void load();
    }
  };

  // ── Save Period ──────────────────────────────────────────
  const openNewPeriod = (fyId: string) => {
    setPFyId(fyId);
    const existingNos = (periodsByYear.get(fyId) ?? []).map(p => p.period_no);
    const nextNo = Math.max(0, ...existingNos) + 1;
    setPForm({ period_no: String(nextNo), start_date: '', end_date: '', status: 'open' });
    setPOpen(true);
  };

  const savePeriod = async () => {
    if (!pForm.period_no || !pForm.start_date || !pForm.end_date) {
      toast({ title: 'All period fields are required', variant: 'destructive' });
      return;
    }
    setPSaving(true);
    const { error: err } = await supabase.from('acct_fiscal_periods').insert({
      fiscal_year_id: pFyId,
      period_no: Number(pForm.period_no),
      start_date: pForm.start_date,
      end_date: pForm.end_date,
      status: pForm.status,
    });
    setPSaving(false);
    if (err) toast({ title: 'Failed to create period', description: err.message, variant: 'destructive' });
    else {
      toast({ title: 'Period created' });
      setPOpen(false);
      void load();
    }
  };

  // ── Change period status ─────────────────────────────────
  const changePeriodStatus = async (p: Period, newStatus: string) => {
    setStatusBusy(p.id);
    const { error: err } = await supabase
      .from('acct_fiscal_periods')
      .update({
        status: newStatus,
        closed_at: ['soft_closed', 'hard_closed', 'locked'].includes(newStatus) ? new Date().toISOString() : null,
      })
      .eq('id', p.id);
    setStatusBusy(null);
    if (err) toast({ title: 'Failed to update status', description: err.message, variant: 'destructive' });
    else {
      toast({ title: `Period ${STATUS_LABELS[newStatus] ?? newStatus}` });
      void load();
    }
  };

  // ── Close/reopen FY ─────────────────────────────────────
  const toggleFyClosed = async (fy: FiscalYear) => {
    const { error: err } = await supabase
      .from('acct_fiscal_years')
      .update({ is_closed: !fy.is_closed })
      .eq('id', fy.id);
    if (err) toast({ title: 'Failed', description: err.message, variant: 'destructive' });
    else {
      toast({ title: fy.is_closed ? 'Fiscal year re-opened' : 'Fiscal year closed' });
      void load();
    }
  };

  if (authLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!allowed) return <Navigate to="/" replace />;

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-4 max-w-[1100px]">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calendar className="w-6 h-6 text-blue-600" /> Fiscal Years &amp; Periods
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Manage fiscal years and their accounting periods.</p>
        </div>
        <div className="flex gap-2">
          {canManage && (
            <Button size="sm" onClick={() => setFyOpen(true)} data-testid="button-add-fy">
              <Plus className="w-4 h-4 mr-1" /> New Fiscal Year
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => void load()} data-testid="button-refresh">
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded border border-rose-200 bg-rose-50 text-rose-800 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
        </div>
      ) : years.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          No fiscal years yet. {canManage && 'Click "New Fiscal Year" to get started.'}
        </div>
      ) : (
        <div className="space-y-3">
          {years.map(fy => {
            const fyPeriods = periodsByYear.get(fy.id) ?? [];
            const isOpen = expanded.has(fy.id);
            return (
              <Card key={fy.id} data-testid={`card-fy-${fy.id}`}>
                <CardHeader className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggle(fy.id)}
                        className="p-0.5 hover:bg-muted rounded"
                        data-testid={`button-expand-fy-${fy.id}`}
                      >
                        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                      <div>
                        <span className="font-semibold text-base">{fy.code}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {format(parseISO(fy.start_date), 'dd MMM yyyy')} → {format(parseISO(fy.end_date), 'dd MMM yyyy')}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {fyPeriods.length} period{fyPeriods.length !== 1 ? 's' : ''}
                      </Badge>
                      <Badge variant="outline" className={cn('text-xs', fy.is_closed
                        ? 'bg-zinc-100 text-zinc-700 border-zinc-300'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      )}>
                        {fy.is_closed ? 'Closed' : 'Open'}
                      </Badge>
                      {canManage && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => void toggleFyClosed(fy)}
                          data-testid={`button-toggle-fy-${fy.id}`}
                        >
                          {fy.is_closed ? <><Unlock className="w-3 h-3 mr-1" /> Re-open</> : <><Lock className="w-3 h-3 mr-1" /> Close FY</>}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>

                {isOpen && (
                  <CardContent className="pt-0 pb-3 px-4">
                    <div className="border rounded-md">
                      <div className="grid grid-cols-12 gap-2 px-3 py-2 border-b bg-muted/40 text-[11px] font-semibold uppercase text-muted-foreground">
                        <div className="col-span-1">#</div>
                        <div className="col-span-3">Start Date</div>
                        <div className="col-span-3">End Date</div>
                        <div className="col-span-2">Status</div>
                        <div className="col-span-3 text-right">Actions</div>
                      </div>
                      {fyPeriods.length === 0 ? (
                        <div className="text-center py-6 text-muted-foreground text-sm">No periods yet.</div>
                      ) : (
                        fyPeriods.map(p => (
                          <div key={p.id} className="grid grid-cols-12 gap-2 px-3 py-2 border-b last:border-0 items-center" data-testid={`row-period-${p.id}`}>
                            <div className="col-span-1 font-mono text-sm font-semibold">{p.period_no}</div>
                            <div className="col-span-3 text-sm">{format(parseISO(p.start_date), 'dd MMM yyyy')}</div>
                            <div className="col-span-3 text-sm">{format(parseISO(p.end_date), 'dd MMM yyyy')}</div>
                            <div className="col-span-2">
                              <Badge variant="outline" className={cn('text-[10px] px-1.5', ACCT_STATUS_TONE[p.status])}>
                                {STATUS_LABELS[p.status] ?? p.status}
                              </Badge>
                            </div>
                            <div className="col-span-3 flex justify-end">
                              {canManage && (
                                <Select
                                  value={p.status}
                                  onValueChange={v => void changePeriodStatus(p, v)}
                                  disabled={statusBusy === p.id}
                                >
                                  <SelectTrigger className="h-7 text-xs w-36" data-testid={`select-period-status-${p.id}`}>
                                    {statusBusy === p.id
                                      ? <Loader2 className="w-3 h-3 animate-spin" />
                                      : <SelectValue />}
                                  </SelectTrigger>
                                  <SelectContent>
                                    {PERIOD_STATUSES.map(s => (
                                      <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {canManage && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3 text-xs"
                        onClick={() => openNewPeriod(fy.id)}
                        data-testid={`button-add-period-${fy.id}`}
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" /> Add Period
                      </Button>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* ── New Fiscal Year Dialog ── */}
      <Dialog open={fyOpen} onOpenChange={setFyOpen}>
        <DialogContent data-testid="dialog-new-fy">
          <DialogHeader>
            <DialogTitle>New Fiscal Year</DialogTitle>
            <DialogDescription>Create a new fiscal year. You can add periods after creation.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Code (e.g. FY2027)</Label>
              <Input value={fyForm.code} onChange={e => setFyForm(f => ({ ...f, code: e.target.value }))} placeholder="FY2027" data-testid="input-fy-code" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Start Date</Label>
                <Input type="date" value={fyForm.start_date} onChange={e => setFyForm(f => ({ ...f, start_date: e.target.value }))} data-testid="input-fy-start" />
              </div>
              <div className="space-y-1">
                <Label>End Date</Label>
                <Input type="date" value={fyForm.end_date} onChange={e => setFyForm(f => ({ ...f, end_date: e.target.value }))} data-testid="input-fy-end" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFyOpen(false)} disabled={fySaving}>Cancel</Button>
            <Button onClick={() => void saveFY()} disabled={fySaving} data-testid="button-save-fy">
              {fySaving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Create Fiscal Year
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── New Period Dialog ── */}
      <Dialog open={pOpen} onOpenChange={setPOpen}>
        <DialogContent data-testid="dialog-new-period">
          <DialogHeader>
            <DialogTitle>Add Period</DialogTitle>
            <DialogDescription>Add a new accounting period to the selected fiscal year.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Period Number</Label>
              <Input type="number" min={1} max={12} value={pForm.period_no} onChange={e => setPForm(f => ({ ...f, period_no: e.target.value }))} data-testid="input-period-no" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Start Date</Label>
                <Input type="date" value={pForm.start_date} onChange={e => setPForm(f => ({ ...f, start_date: e.target.value }))} data-testid="input-period-start" />
              </div>
              <div className="space-y-1">
                <Label>End Date</Label>
                <Input type="date" value={pForm.end_date} onChange={e => setPForm(f => ({ ...f, end_date: e.target.value }))} data-testid="input-period-end" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Initial Status</Label>
              <Select value={pForm.status} onValueChange={v => setPForm(f => ({ ...f, status: v }))}>
                <SelectTrigger data-testid="select-period-init-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PERIOD_STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPOpen(false)} disabled={pSaving}>Cancel</Button>
            <Button onClick={() => void savePeriod()} disabled={pSaving} data-testid="button-save-period">
              {pSaving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Add Period
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
