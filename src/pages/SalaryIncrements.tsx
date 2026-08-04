import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO, isValid, differenceInCalendarMonths } from 'date-fns';
import {
  TrendingUp, Plus, Edit2, Trash2, Loader2, User, Calendar,
  DollarSign, BarChart2, Search, ChevronUp, ChevronDown,
  ArrowUpRight, Download,
} from 'lucide-react';
import { exportToExcel } from '@/utils/report-export';
import { Button } from '@/components/ui/button';
import { PageLoader } from '@/components/ui/page-loader';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuthorization } from '@/hooks/use-authorization';
import { cn } from '@/lib/utils';
import { useAppContext } from '@/context/AppContext';
import { NotificationTriggerService } from '@/services/NotificationTriggerService';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import {
  useInvalidateSalaryIncrements,
  useSalaryIncrementsQuery,
  type SalaryIncrementRow,
} from '@/hooks/useHrFinance';

type Increment = SalaryIncrementRow;

const INCREMENT_TYPES = [
  { value: 'annual', label: 'Annual Increment' },
  { value: 'merit', label: 'Merit / Performance' },
  { value: 'promotion', label: 'Promotion' },
  { value: 'cost_of_living', label: 'Cost of Living Adjustment' },
  { value: 'market_adjustment', label: 'Market Adjustment' },
  { value: 'correction', label: 'Salary Correction' },
  { value: 'other', label: 'Other' },
];

const TYPE_COLORS: Record<string, string> = {
  annual: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40',
  merit: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40',
  promotion: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40',
  cost_of_living: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40',
  market_adjustment: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40',
  correction: 'bg-gray-100 text-gray-700 dark:bg-gray-800',
  other: 'bg-gray-100 text-gray-700 dark:bg-gray-800',
};

const BLANK = {
  user_id: '', effective_date: format(new Date(), 'yyyy-MM-dd'),
  previous_salary: '', new_salary: '', increment_type: 'annual',
  currency: 'USD', reason: '', notes: '',
};

function calcPct(prev: number | null, next: number): number | null {
  if (!prev || prev === 0) return null;
  return ((next - prev) / prev) * 100;
}

export default function SalaryIncrements() {
  const { currentUser } = useAppContext();
  const { toast } = useToast();
  const { hasAnyRole } = useAuthorization();
  const isAdmin = hasAnyRole(['super_admin', 'admin', 'hr', 'hrManager', 'financialAdmin']);

  const invalidateIncrements = useInvalidateSalaryIncrements();
  const incrementsQuery = useSalaryIncrementsQuery(isAdmin || !!currentUser?.id);
  const increments = incrementsQuery.data?.increments ?? [];
  const profiles = incrementsQuery.data?.profiles ?? [];
  const loading = incrementsQuery.isLoading;
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Increment | null>(null);
  const [form, setForm] = useState({ ...BLANK });
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState('');
  const [empSearch, setEmpSearch] = useState('');
  const [dialogEmpSearch, setDialogEmpSearch] = useState('');

  const fetchAll = useCallback(async () => {
    await invalidateIncrements();
  }, [invalidateIncrements]);

  // H9: open the new-increment dialog pre-filled when navigated from a Performance Review.
  // URL: /salary-increments?prefill=<userId>&pct=<percent>&reason=<text>
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const prefillUser = params.get('prefill');
    if (!prefillUser) return;
    const pct = Number(params.get('pct') || '0');
    const reason = params.get('reason') || 'Merit increment from performance review';
    const reviewId = params.get('review_id');
    setEditing(null);
    setForm({
      ...BLANK,
      user_id: prefillUser,
      increment_type: 'merit',
      increment_percent: pct > 0 ? pct : null,
      reason,
      notes: reviewId ? `Linked to performance review ${reviewId}` : '',
    } as any);
    setDialogOpen(true);
    // Clean the URL so refreshing doesn't re-open the dialog
    if (window.history.replaceState) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Note: auto-application of due increments is handled by the
  // hr-salary-increment-apply nightly Edge Function (not on page load).

  function openNew() {
    setEditing(null);
    setForm({ ...BLANK, user_id: isAdmin ? '' : (currentUser?.id ?? '') });
    setDialogEmpSearch('');
    setDialogOpen(true);
  }

  function openEdit(inc: Increment) {
    setEditing(inc);
    setForm({
      user_id: inc.user_id,
      effective_date: inc.effective_date,
      previous_salary: inc.previous_salary != null ? String(inc.previous_salary) : '',
      new_salary: String(inc.new_salary),
      increment_type: inc.increment_type,
      currency: inc.currency,
      reason: inc.reason ?? '',
      notes: inc.notes ?? '',
    });
    setDialogEmpSearch('');
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.user_id || !form.new_salary || !form.effective_date) return;
    setSaving(true);
    const prevSal = form.previous_salary ? parseFloat(form.previous_salary) : null;
    const newSal = parseFloat(form.new_salary);
    const pct = calcPct(prevSal, newSal);
    // Bug fix (increment auto-sync): this form has no separate pending-approval
    // step — `approved_by` is already stamped at creation time, so the increment
    // is meant to take effect immediately. Previously the row was saved with the
    // DB default status='pending' and employee_salary_config.base_salary was
    // never touched, so the employee kept being paid their OLD salary on every
    // subsequent payroll run even though HR recorded a "new" salary here.
    const payload: any = {
      user_id: form.user_id,
      effective_date: form.effective_date,
      previous_salary: prevSal,
      new_salary: newSal,
      increment_type: form.increment_type,
      increment_percent: pct != null ? Number(pct.toFixed(2)) : null,
      currency: form.currency,
      reason: form.reason || null,
      approved_by: currentUser?.id ?? null,
      notes: form.notes || null,
      status: 'approved',
      approved_at: new Date().toISOString(),
    };

    // Sync the new base salary + currency into employee_salary_config so the
    // change is actually reflected in the next payroll run. Only applied when
    // the increment's effective date is today or in the past — a future-dated
    // increment is recorded but not yet applied to live pay.
    const syncLiveSalary = async () => {
      const effectiveToday = form.effective_date <= format(new Date(), 'yyyy-MM-dd');
      if (!effectiveToday) return;
      const { data: existingCfg } = await supabase
        .from('employee_salary_config')
        .select('id')
        .eq('user_id', form.user_id)
        .maybeSingle();
      if (existingCfg) {
        await supabase.from('employee_salary_config')
          .update({ base_salary: newSal, currency: form.currency })
          .eq('id', existingCfg.id);
      } else {
        await supabase.from('employee_salary_config').insert({
          user_id: form.user_id, base_salary: newSal, currency: form.currency,
          allowances: [], deductions: [], effective_date: form.effective_date,
          created_by: currentUser?.id ?? null,
        });
      }
    };

    // T012: a retroactive increment (effective_date in the past) means the
    // employee was underpaid for every payroll period between the effective
    // date and today at the OLD salary. Nothing previously surfaced this —
    // HR would record the increment and the shortfall would just be silently
    // absorbed. Compute an estimated backpay figure so it can be processed
    // as a manual one-off payment, and record it in the increment's notes.
    let backpayNote = '';
    let backpayAmount = 0;
    let monthsElapsed = 0;
    if (prevSal != null && form.effective_date < format(new Date(), 'yyyy-MM-dd')) {
      monthsElapsed = Math.max(0, differenceInCalendarMonths(new Date(), parseISO(form.effective_date)));
      backpayAmount = (newSal - prevSal) * monthsElapsed;
      if (monthsElapsed > 0 && backpayAmount !== 0) {
        backpayNote = `[Auto] Estimated backpay owed: ${form.currency} ${backpayAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} for ${monthsElapsed} month(s) since effective date (retroactive increment). Process as a manual one-off payment.`;
        payload.notes = payload.notes ? `${payload.notes}\n${backpayNote}` : backpayNote;
      }
    }

    if (editing) {
      const { error } = await supabase.from('salary_increments').update(payload).eq('id', editing.id);
      if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
      else {
        await syncLiveSalary();
        if (backpayNote) {
          toast({ title: 'Increment updated — backpay required', description: backpayNote, variant: 'destructive' });
        } else {
          toast({ title: 'Increment updated' });
        }
        setDialogOpen(false);
        fetchAll();
      }
    } else {
      const { data: inserted, error } = await supabase.from('salary_increments').insert({ ...payload, created_at: new Date().toISOString() }).select().single();
      if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
      else {
        await syncLiveSalary();
        // Notify the employee about their salary increment
        if (form.user_id && form.user_id !== currentUser?.id) {
          const incTypeLabel = (form.increment_type ?? 'increment').replace(/_/g, ' ');
          const pctText = pct != null ? ` (${pct > 0 ? '+' : ''}${pct.toFixed(1)}%)` : '';
          const backpayText = backpayNote ? ` A retroactive backpay of ${form.currency} ${backpayAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} for ${monthsElapsed} month(s) will be processed separately.` : '';
          await NotificationTriggerService.send({
            userId: form.user_id,
            title: 'Salary Increment Recorded',
            message: `A ${incTypeLabel}${pctText} has been recorded for you, effective ${form.effective_date}. New salary: ${form.currency} ${parseFloat(form.new_salary).toLocaleString()}.${backpayText}`,
            titleAr: 'تم تسجيل زيادة الراتب',
            messageAr: `تم تسجيل ${incTypeLabel}${pctText} لك، اعتبارًا من ${form.effective_date}. الراتب الجديد: ${form.currency} ${parseFloat(form.new_salary).toLocaleString()}.`,
            type: 'success',
            category: 'financial',
            priority: 'high',
            link: '/salary-increments',
            relatedEntityId: inserted?.id,
            sendEmail: true,
            emailActionUrl: '/salary-increments',
            emailActionLabel: 'View Increment Details',
          });
        }
        if (backpayNote) {
          toast({ title: 'Increment recorded — backpay required', description: backpayNote, variant: 'destructive' });
        } else {
          toast({ title: 'Increment recorded' });
        }
        setDialogOpen(false);
        fetchAll();
      }
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    await supabase.from('salary_increments').delete().eq('id', id);
    toast({ title: 'Record deleted' });
    await fetchAll();
  }

  const myIncrements = increments.filter(r => r.user_id === currentUser?.id);
  const displayList = isAdmin
    ? (selectedUser ? increments.filter(r => r.user_id === selectedUser) : increments)
    : myIncrements;

  function exportIncrements() {
    const rows = filtered.map(r => ({
      'Employee': r.user_name ?? profiles.find(p => p.id === r.user_id)?.full_name ?? '',
      'Effective Date': format(new Date(r.effective_date), 'yyyy-MM-dd'),
      'Type': INCREMENT_TYPES.find(t => t.value === r.increment_type)?.label ?? r.increment_type,
      'Previous Salary': r.previous_salary ?? '',
      'New Salary': r.new_salary,
      'Change %': r.increment_percent ?? '',
      'Currency': r.currency,
      'Reason': r.reason ?? '',
      'Approved By': r.approver_name ?? '',
      'Notes': r.notes ?? '',
      'Created At': format(new Date(r.created_at), 'yyyy-MM-dd'),
    }));
    exportToExcel(rows, 'Salary Increments', `salary-increments-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  }

  const filtered = displayList.filter(r =>
    !search ||
    r.user_name?.toLowerCase().includes(search.toLowerCase()) ||
    r.reason?.toLowerCase().includes(search.toLowerCase()) ||
    r.increment_type.toLowerCase().includes(search.toLowerCase())
  );

  // Chart data for selected user
  const chartUser = selectedUser || currentUser?.id;
  const chartData = increments
    .filter(r => r.user_id === chartUser && r.new_salary)
    .sort((a, b) => a.effective_date.localeCompare(b.effective_date))
    .map(r => ({
      date: isValid(parseISO(r.effective_date)) ? format(parseISO(r.effective_date), 'MMM yy') : r.effective_date,
      salary: r.new_salary,
      currency: r.currency,
    }));

  const totalRaise = myIncrements.reduce((s, r) => s + (r.new_salary - (r.previous_salary ?? r.new_salary)), 0);
  const latestSalary = myIncrements.length > 0 ? myIncrements[0].new_salary : null;
  const avgPct = myIncrements.filter(r => r.increment_percent != null).reduce((s, r) => s + (r.increment_percent ?? 0), 0) / (myIncrements.filter(r => r.increment_percent != null).length || 1);

  if (loading && !incrementsQuery.data) {
    return <PageLoader label="Loading salary increments…" />;
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-emerald-500" />
            Salary Increment History
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Track salary changes, raises, and adjustments over time</p>
        </div>
        {isAdmin && (
          <Button onClick={openNew} data-testid="btn-add-increment">
            <Plus className="h-4 w-4 mr-1" /> Record Increment
          </Button>
        )}
      </div>

      {/* My Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: 'Current Salary', value: latestSalary ? `${latestSalary.toLocaleString()} ${myIncrements[0]?.currency ?? 'USD'}` : '—', icon: <DollarSign className="h-4 w-4" />, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
          { label: 'Total Increments', value: myIncrements.length, icon: <BarChart2 className="h-4 w-4" />, color: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-900/20' },
          { label: 'Avg. Raise', value: avgPct ? `${avgPct.toFixed(1)}%` : '—', icon: <ArrowUpRight className="h-4 w-4" />, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
        ].map(s => (
          <div key={s.label} className={cn('rounded-lg p-3 flex items-center gap-3', s.bg)}>
            <span className={s.color}>{s.icon}</span>
            <div>
              <p className={cn('text-lg font-bold', s.color)}>{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Salary growth chart */}
      {chartData.length > 1 && (
        <div className="border rounded-lg bg-card p-4">
          <p className="text-sm font-semibold mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-500" />Salary Growth
          </p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => v.toLocaleString()} />
              <Tooltip formatter={(v: any) => [`${Number(v).toLocaleString()} ${chartData[0]?.currency}`, 'Salary']} />
              <Bar dataKey="salary" radius={[4, 4, 0, 0]}>
                {chartData.map((_, i) => <Cell key={i} fill={i === chartData.length - 1 ? '#10b981' : '#6366f1'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        {isAdmin && (
          <Select value={selectedUser} onValueChange={v => { setSelectedUser(v); setEmpSearch(''); }}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="All employees">
                {selectedUser ? (profiles.find(p => p.id === selectedUser)?.full_name ?? 'Employee') : 'All Employees'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <div className="p-1.5 border-b">
                <Input
                  autoFocus
                  placeholder="Search employee…"
                  value={empSearch}
                  onChange={e => setEmpSearch(e.target.value)}
                  className="h-7 text-sm"
                  onKeyDown={e => e.stopPropagation()}
                />
              </div>
              <SelectItem value="">All Employees</SelectItem>
              {profiles
                .filter(p => !empSearch || p.full_name.toLowerCase().includes(empSearch.toLowerCase()))
                .slice(0, 50)
                .map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)
              }
            </SelectContent>
          </Select>
        )}
        <div className="flex gap-2 items-center">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input className="pl-8 w-48" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Button size="sm" variant="outline" onClick={exportIncrements} data-testid="button-export-increments">
            <Download className="h-4 w-4 mr-1" /> Export
          </Button>
        </div>
      </div>

      {/* Increment list */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <TrendingUp className="h-10 w-10 mx-auto mb-2 opacity-20" />
          <p>No salary increment records found.</p>
          {isAdmin && <Button className="mt-3" variant="outline" onClick={openNew}>Record first increment</Button>}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(inc => {
            const pct = inc.increment_percent;
            const typeLabel = INCREMENT_TYPES.find(t => t.value === inc.increment_type)?.label ?? inc.increment_type;
            return (
              <Card key={inc.id} data-testid={`increment-${inc.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Amount badge */}
                    <div className="min-w-[4rem] text-center bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-2 border border-emerald-100 dark:border-emerald-800">
                      {pct != null && (
                        <p className="text-emerald-600 dark:text-emerald-400 font-bold text-sm">+{pct.toFixed(1)}%</p>
                      )}
                      <p className="text-xs text-muted-foreground">{inc.currency}</p>
                      <p className="font-semibold text-sm">{inc.new_salary.toLocaleString()}</p>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isAdmin && <span className="font-medium text-sm flex items-center gap-1"><User className="h-3.5 w-3.5 text-muted-foreground" />{inc.user_name}</span>}
                        <Badge className={cn('text-xs', TYPE_COLORS[inc.increment_type] ?? TYPE_COLORS.other)}>{typeLabel}</Badge>
                      </div>
                      {inc.previous_salary != null && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Previous: {inc.previous_salary.toLocaleString()} {inc.currency}
                          {pct != null && <span className="text-emerald-600 ml-1 font-medium">▲ +{inc.previous_salary != null ? (inc.new_salary - inc.previous_salary).toLocaleString() : '—'}</span>}
                        </p>
                      )}
                      {inc.reason && <p className="text-xs text-muted-foreground mt-0.5">{inc.reason}</p>}
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />
                          {isValid(parseISO(inc.effective_date)) ? format(parseISO(inc.effective_date), 'dd MMM yyyy') : inc.effective_date}
                        </span>
                        {inc.approver_name && <span className="flex items-center gap-1"><User className="h-3 w-3" />Approved by {inc.approver_name}</span>}
                      </div>
                    </div>

                    {isAdmin && (
                      <div className="flex gap-1 shrink-0">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(inc)}><Edit2 className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(inc.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={v => { setDialogOpen(v); if (!v) setDialogEmpSearch(''); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Increment' : 'Record Salary Increment'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Employee *</Label>
              <Select value={form.user_id} onValueChange={v => { setForm(p => ({ ...p, user_id: v })); setDialogEmpSearch(''); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select employee">
                    {form.user_id ? (profiles.find(p => p.id === form.user_id)?.full_name ?? 'Employee') : 'Select employee'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <div className="p-1.5 border-b">
                    <Input
                      autoFocus
                      placeholder="Search employee…"
                      value={dialogEmpSearch}
                      onChange={e => setDialogEmpSearch(e.target.value)}
                      className="h-7 text-sm"
                      onKeyDown={e => e.stopPropagation()}
                    />
                  </div>
                  {profiles
                    .filter(p => !dialogEmpSearch || p.full_name.toLowerCase().includes(dialogEmpSearch.toLowerCase()))
                    .slice(0, 50)
                    .map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)
                  }
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Effective Date *</Label>
                <Input type="date" value={form.effective_date} onChange={e => setForm(p => ({ ...p, effective_date: e.target.value }))} />
              </div>
              <div>
                <Label>Currency</Label>
                <Select value={form.currency} onValueChange={v => setForm(p => ({ ...p, currency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="SDG">SDG</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Previous Salary</Label>
                <Input type="number" value={form.previous_salary} onChange={e => setForm(p => ({ ...p, previous_salary: e.target.value }))} placeholder="0.00" />
              </div>
              <div>
                <Label>New Salary *</Label>
                <Input type="number" value={form.new_salary} onChange={e => setForm(p => ({ ...p, new_salary: e.target.value }))} placeholder="0.00" />
              </div>
            </div>
            {form.previous_salary && form.new_salary && (
              <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded p-2 text-sm text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                Increment: {calcPct(parseFloat(form.previous_salary), parseFloat(form.new_salary))?.toFixed(2) ?? '—'}%
                ({form.currency} {(parseFloat(form.new_salary) - parseFloat(form.previous_salary)).toLocaleString()} increase)
              </div>
            )}
            <div>
              <Label>Type</Label>
              <Select value={form.increment_type} onValueChange={v => setForm(p => ({ ...p, increment_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INCREMENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Reason</Label>
              <Input value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} placeholder="e.g. Annual performance review" />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Additional notes..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.user_id || !form.new_salary || !form.effective_date} data-testid="btn-save-increment">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {editing ? 'Save Changes' : 'Record Increment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
