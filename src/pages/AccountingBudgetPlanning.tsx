import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useAccountingCountry } from '@/hooks/use-accounting-country';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, PiggyBank, Download, RefreshCw, Pencil, Check, X,
  Search, Copy, AlertTriangle, CheckCircle2, Upload, FileDown,
  SendHorizonal, ShieldCheck, ClockIcon, RotateCcw as RejectIcon,
} from 'lucide-react';
import { formatNumber, downloadCsv } from '@/lib/accountingFormat';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';
import { format, parseISO } from 'date-fns';
import { NotificationTriggerService } from '@/services/NotificationTriggerService';

interface Account { id: string; code: string; name_en: string; name_ar: string; account_type: string; country_id: string | null }
interface FiscalYear { id: string; code: string; name_en: string }
interface Period { id: string; period_no: number; start_date: string; end_date: string; status: string; fiscal_year_id: string; period_name: string }
interface Fund { id: string; code: string; name_en: string }
interface BudgetLine { id: string; account_id: string; period_id: string | null; fund_id: string | null; fiscal_year_id: string | null; budget_amount: number }

interface Row {
  account_id: string; code: string; name_en: string; name_ar: string; type: string;
  budget: number; budgetLineId: string | null;
}

const TYPE_LABEL: Record<string, { label: string; color: string }> = {
  expense:   { label: 'Expense',   color: 'bg-rose-50   text-rose-700   dark:bg-rose-900/30' },
  revenue:   { label: 'Revenue',   color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30' },
  asset:     { label: 'Asset',     color: 'bg-blue-50   text-blue-700   dark:bg-blue-900/30' },
  liability: { label: 'Liability', color: 'bg-amber-50  text-amber-700  dark:bg-amber-900/30' },
  equity:    { label: 'Equity',    color: 'bg-violet-50 text-violet-700 dark:bg-violet-900/30' },
};

export default function AccountingBudgetPlanning() {
  const { hasAnyRole, loading: authLoading } = useAuthorization();
  const allowed  = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);
  const canEdit  = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant']);
  const { countryId: defaultCountryId, loading: acctLoading } = useAccountingCountry();
  const { toast } = useToast();

  const [years, setYears]       = useState<FiscalYear[]>([]);
  const [periods, setPeriods]   = useState<Period[]>([]);
  const [funds, setFunds]       = useState<Fund[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [budgetLines, setBudgetLines] = useState<BudgetLine[]>([]);

  const [yearId, setYearId]     = useState('');
  const [periodId, setPeriodId] = useState('');
  const [fundId, setFundId]     = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch]     = useState('');
  const [countryFilter, setCountryFilter] = useState('all');
  const [countries, setCountries] = useState<{ id: string; name_en: string }[]>([]);

  const [loading, setLoading]   = useState(true);
  const [tableExists, setTableExists] = useState(true);
  const [saving, setSaving]     = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [copying, setCopying]   = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Budget approval workflow state
  const [approvalRecord, setApprovalRecord] = useState<{ id: string; status: string; submitted_by: string | null; reviewed_by: string | null; reviewer_notes: string | null; submitted_at: string | null; reviewed_at: string | null } | null>(null);
  const [approvalTableExists, setApprovalTableExists] = useState(true);
  const [approvingBudget, setApprovingBudget] = useState(false);

  /* ── bootstrap ── */
  useEffect(() => {
    (async () => {
      const [yRes, pRes, fRes, aRes, cRes] = await Promise.all([
        supabase.from('acct_fiscal_years').select('id, code, name_en').order('code', { ascending: false }),
        supabase.from('acct_fiscal_periods').select('id, period_no, start_date, end_date, status, fiscal_year_id, period_name').order('start_date', { ascending: false }),
        supabase.from('acct_funds').select('id, code, name_en').eq('is_active', true).order('code'),
        supabase.from('acct_accounts').select('id, code, name_en, name_ar, account_type, country_id').order('code'),
        supabase.from('countries').select('id, name_en').eq('is_active', true).order('name_en'),
      ]);
      setYears((yRes.data ?? []) as FiscalYear[]);
      setPeriods((pRes.data ?? []) as Period[]);
      setFunds((fRes.data ?? []) as Fund[]);
      setAccounts((aRes.data ?? []) as Account[]);
      setCountries((cRes.data ?? []) as { id: string; name_en: string }[]);
      const open = (pRes.data ?? []).find((p: any) => p.status === 'open' || p.status === 'soft_closed');
      if (open) {
        setPeriodId((open as any).id);
        setYearId((open as any).fiscal_year_id);
      } else if (pRes.data?.[0]) {
        setPeriodId((pRes.data[0] as any).id);
        setYearId((pRes.data[0] as any).fiscal_year_id);
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!acctLoading && defaultCountryId) setCountryFilter(defaultCountryId);
  }, [acctLoading, defaultCountryId]);

  /* ── load budget lines for selected period/fund ── */
  const loadBudgetLines = useCallback(async (pid: string, fid: string) => {
    if (!pid) return;
    const q = supabase.from('acct_budget_lines').select('id, account_id, period_id, fund_id, fiscal_year_id, budget_amount').eq('period_id', pid);
    if (fid !== 'all') (q as any).eq('fund_id', fid);
    const { data, error } = await q;
    if (error?.code === '42P01') { setTableExists(false); return; }
    setTableExists(true);
    setBudgetLines((data ?? []) as BudgetLine[]);
  }, []);

  useEffect(() => { if (periodId) void loadBudgetLines(periodId, fundId); }, [periodId, fundId, loadBudgetLines]);

  /* ── load approval record for current period/fund ── */
  const loadApproval = useCallback(async (pid: string, fid: string) => {
    if (!pid || !approvalTableExists) return;
    const q = supabase.from('acct_budget_approvals' as any).select('*').eq('period_id', pid);
    if (fid !== 'all') (q as any).eq('fund_id', fid); else (q as any).is('fund_id', null);
    const { data, error } = await (q as any).maybeSingle();
    if (error?.code === '42P01') { setApprovalTableExists(false); return; }
    setApprovalRecord((data as any) ?? null);
  }, [approvalTableExists]);

  useEffect(() => { if (periodId) void loadApproval(periodId, fundId); }, [periodId, fundId, loadApproval]);

  /* ── budget approval actions ── */
  const submitForApproval = async () => {
    if (!periodId || approvingBudget) return;
    setApprovingBudget(true);
    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      period_id: periodId,
      fund_id: fundId !== 'all' ? fundId : null,
      status: 'submitted',
      submitted_by: user?.id ?? null,
      submitted_at: new Date().toISOString(),
      total_budget: stats.totalBudget,
      line_count: stats.withBudget,
    };
    let err;
    if (approvalRecord) {
      ({ error: err } = await supabase.from('acct_budget_approvals' as any).update({ ...payload }).eq('id', (approvalRecord as any).id));
    } else {
      ({ error: err } = await supabase.from('acct_budget_approvals' as any).insert(payload));
    }
    if (err) toast({ title: 'Submit failed', description: (err as any).message, variant: 'destructive' });
    else {
      toast({ title: 'Budget submitted for approval' });
      void loadApproval(periodId, fundId);
      // Notify finance admins / approvers
      try {
        const { data: admins } = await supabase.from('profiles')
          .select('id')
          .in('role', ['super_admin', 'superAdmin', 'admin', 'financialAdmin', 'finance'])
          .eq('status', 'approved');
        if (admins) {
          for (const admin of admins) {
            void NotificationTriggerService.send({
              userId: admin.id,
              title: 'Budget Submitted for Approval',
              message: 'A budget plan has been submitted and is awaiting your review.',
              titleAr: 'الميزانية في انتظار الموافقة',
              messageAr: 'تم تقديم خطة الميزانية وتنتظر مراجعتك.',
              type: 'info',
              category: 'approvals',
              priority: 'normal',
              link: '/accounting/budget-planning',
            });
          }
        }
      } catch { /* notifications are non-critical */ }
    }
    setApprovingBudget(false);
  };

  const reviewBudget = async (action: 'approved' | 'rejected') => {
    if (!approvalRecord || approvingBudget) return;
    setApprovingBudget(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error: err } = await supabase.from('acct_budget_approvals' as any).update({
      status: action,
      reviewed_by: user?.id ?? null,
      reviewed_at: new Date().toISOString(),
    }).eq('id', (approvalRecord as any).id);
    if (err) toast({ title: 'Action failed', description: (err as any).message, variant: 'destructive' });
    else {
      toast({ title: action === 'approved' ? 'Budget approved ✓' : 'Budget rejected' });
      void loadApproval(periodId, fundId);
      // Notify the original submitter
      const submitterId = (approvalRecord as any).submitted_by;
      if (submitterId) {
        try {
          void NotificationTriggerService.send({
            userId: submitterId,
            title: action === 'approved' ? 'Budget Approved ✓' : 'Budget Rejected',
            message: action === 'approved'
              ? 'Your budget submission has been approved.'
              : 'Your budget submission has been rejected. Please revise and resubmit.',
            titleAr: action === 'approved' ? 'تمت الموافقة على الميزانية' : 'تم رفض الميزانية',
            messageAr: action === 'approved'
              ? 'تمت الموافقة على تقديم الميزانية.'
              : 'تم رفض تقديم الميزانية. يرجى المراجعة وإعادة التقديم.',
            type: action === 'approved' ? 'success' : 'warning',
            category: 'approvals',
            priority: 'normal',
            link: '/accounting/budget-planning',
          });
        } catch { /* notifications are non-critical */ }
      }
    }
    setApprovingBudget(false);
  };

  /* ── derived rows ── */
  const rows = useMemo((): Row[] => {
    const budgetMap: Record<string, BudgetLine> = {};
    for (const bl of budgetLines) budgetMap[bl.account_id] = bl;
    return accounts
      .filter(a => typeFilter === 'all' || a.account_type === typeFilter)
      .filter(a => countryFilter === 'all' || a.country_id === countryFilter || !a.country_id)
      .filter(a => {
        if (!search) return true;
        const q = search.toLowerCase();
        return a.code.toLowerCase().includes(q) || a.name_en.toLowerCase().includes(q);
      })
      .map(a => ({
        account_id: a.id, code: a.code, name_en: a.name_en, name_ar: a.name_ar,
        type: a.account_type,
        budget: budgetMap[a.id]?.budget_amount ?? 0,
        budgetLineId: budgetMap[a.id]?.id ?? null,
      }));
  }, [accounts, budgetLines, typeFilter, countryFilter, search]);

  const selectedPeriod = periods.find(p => p.id === periodId);
  const filteredPeriods = yearId ? periods.filter(p => p.fiscal_year_id === yearId) : periods;

  const stats = useMemo(() => {
    const withBudget = rows.filter(r => r.budget > 0);
    return {
      totalBudget: rows.reduce((s, r) => s + r.budget, 0),
      withBudget: withBudget.length,
      withoutBudget: rows.filter(r => r.budget === 0 && ['expense','revenue'].includes(r.type)).length,
      total: rows.length,
    };
  }, [rows]);

  /* ── save a budget line ── */
  const saveEdit = async (row: Row) => {
    const amt = parseFloat(editValue);
    if (isNaN(amt) || amt < 0) { toast({ title: 'Enter a valid amount', variant: 'destructive' }); return; }
    setSaving(p => ({ ...p, [row.account_id]: true }));
    const period = periods.find(p => p.id === periodId);
    if (row.budgetLineId) {
      const { error } = await supabase.from('acct_budget_lines').update({ budget_amount: amt }).eq('id', row.budgetLineId);
      if (error) toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
      else { toast({ title: 'Budget updated' }); setEditingId(null); void loadBudgetLines(periodId, fundId); }
    } else {
      const { error } = await supabase.from('acct_budget_lines').insert({
        account_id: row.account_id,
        period_id: periodId,
        fund_id: fundId === 'all' ? null : fundId,
        fiscal_year_id: period?.fiscal_year_id ?? null,
        budget_amount: amt,
      });
      if (error) toast({ title: 'Create failed', description: error.message, variant: 'destructive' });
      else { toast({ title: 'Budget line created' }); setEditingId(null); void loadBudgetLines(periodId, fundId); }
    }
    setSaving(p => ({ ...p, [row.account_id]: false }));
  };

  /* ── copy from previous period ── */
  const copyFromPrevious = async () => {
    if (!periodId || !selectedPeriod) return;
    const sortedPeriods = [...periods].filter(p => p.fiscal_year_id === selectedPeriod.fiscal_year_id).sort((a, b) => a.period_no - b.period_no);
    const currentIdx = sortedPeriods.findIndex(p => p.id === periodId);
    const prevPeriod = currentIdx > 0 ? sortedPeriods[currentIdx - 1] : null;
    if (!prevPeriod) { toast({ title: 'No previous period found in this fiscal year', variant: 'destructive' }); return; }
    setCopying(true);
    const q = supabase.from('acct_budget_lines').select('account_id, fund_id, fiscal_year_id, budget_amount').eq('period_id', prevPeriod.id);
    if (fundId !== 'all') (q as any).eq('fund_id', fundId);
    const { data: prevLines, error } = await q;
    if (error || !prevLines?.length) {
      toast({ title: error ? error.message : 'Previous period has no budget lines', variant: 'destructive' });
      setCopying(false); return;
    }
    const currentBudgetMap: Record<string, string> = {};
    for (const bl of budgetLines) currentBudgetMap[bl.account_id] = bl.id;
    let created = 0, updated = 0;
    for (const pl of prevLines as any[]) {
      if (currentBudgetMap[pl.account_id]) {
        await supabase.from('acct_budget_lines').update({ budget_amount: pl.budget_amount }).eq('id', currentBudgetMap[pl.account_id]);
        updated++;
      } else {
        await supabase.from('acct_budget_lines').insert({
          account_id: pl.account_id, period_id: periodId,
          fund_id: fundId === 'all' ? pl.fund_id : fundId,
          fiscal_year_id: selectedPeriod.fiscal_year_id,
          budget_amount: pl.budget_amount,
        });
        created++;
      }
    }
    toast({ title: `Copied from ${prevPeriod.period_name}`, description: `${created} created, ${updated} updated` });
    void loadBudgetLines(periodId, fundId);
    setCopying(false);
  };

  /* ── import CSV ── */
  const handleImportCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !periodId) return;
    setImporting(true);
    try {
      const text = await file.text();
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      const hasHeader = /account[\s_]?code/i.test(lines[0] ?? '');
      const dataLines = hasHeader ? lines.slice(1) : lines;

      const accountByCode: Record<string, Account> = {};
      for (const a of accounts) accountByCode[a.code.toLowerCase()] = a;

      const budgetMap: Record<string, BudgetLine> = {};
      for (const bl of budgetLines) budgetMap[bl.account_id] = bl;

      const period = periods.find(p => p.id === periodId);
      let created = 0, updated = 0, skipped = 0;
      const skippedRows: string[] = [];

      for (const line of dataLines) {
        const parts = line.split(',').map(p => p.trim().replace(/^"|"$/g, ''));
        // Support: account_code,budget_amount OR account_code,fund_code,budget_amount
        let code: string, amtStr: string, fundCode: string | undefined;
        if (parts.length >= 3 && isNaN(Number(parts[1]))) {
          [code, fundCode, amtStr] = parts as [string, string, string];
        } else {
          [code, amtStr] = parts as [string, string];
        }
        const amt = parseFloat(amtStr);
        if (!code || isNaN(amt) || amt < 0) { skipped++; skippedRows.push(line); continue; }

        const acct = accountByCode[code.toLowerCase()];
        if (!acct) { skipped++; skippedRows.push(`Unknown code: ${code}`); continue; }

        let resolvedFundId = fundId === 'all' ? null : fundId;
        if (fundCode) {
          const f = funds.find(f => f.code.toLowerCase() === fundCode!.toLowerCase());
          if (f) resolvedFundId = f.id;
        }

        const existing = budgetMap[acct.id];
        if (existing) {
          const { error } = await supabase.from('acct_budget_lines').update({ budget_amount: amt }).eq('id', existing.id);
          if (!error) updated++; else { skipped++; skippedRows.push(`Update failed: ${code}`); }
        } else {
          const { error } = await supabase.from('acct_budget_lines').insert({
            account_id: acct.id, period_id: periodId,
            fund_id: resolvedFundId,
            fiscal_year_id: period?.fiscal_year_id ?? null,
            budget_amount: amt,
          });
          if (!error) created++; else { skipped++; skippedRows.push(`Insert failed: ${code}`); }
        }
      }
      toast({
        title: 'Import complete',
        description: `${created} created, ${updated} updated${skipped > 0 ? `, ${skipped} skipped` : ''}`,
      });
      void loadBudgetLines(periodId, fundId);
    } catch (err: any) {
      toast({ title: 'Import failed', description: err.message, variant: 'destructive' });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  /* ── export CSV ── */
  const exportCsv = () => {
    downloadCsv(`budget-plan-${periodId}.csv`, [
      ['Account Code', 'Account Name', 'Type', 'Budget Amount'],
      ...rows.map(r => [r.code, r.name_en, r.type, r.budget]),
    ]);
  };

  /* ── download blank import template ── */
  const downloadTemplate = () => {
    const withFund = fundId !== 'all';
    const selectedFund = funds.find(f => f.id === fundId);
    const cols = withFund
      ? ['account_code', 'fund_code', 'budget_amount']
      : ['account_code', 'budget_amount'];
    const templateRows = accounts
      .filter(a => typeFilter === 'all' || a.account_type === typeFilter)
      .filter(a => countryFilter === 'all' || a.country_id === countryFilter || !a.country_id)
      .map(a => withFund
        ? [a.code, selectedFund?.code ?? '', '0']
        : [a.code, '0']
      );
    downloadCsv('budget-import-template.csv', [cols, ...templateRows]);
    toast({ title: 'Template downloaded', description: `${templateRows.length} account rows — fill in budget_amount and import` });
  };

  if (authLoading || loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!allowed) return <Navigate to="/" replace />;

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-[1200px]">
      <PageInfoBanner
        title="Budget Planning"
        description="Set and manage budget targets for each account per fiscal period and fund. Budget lines feed directly into the Budget vs Actual variance analysis."
        workflowSteps={[
          { step: 1, role: 'Finance Admin', action: 'Select Period & Fund',    description: 'Choose the fiscal period and fund to plan against.' },
          { step: 2, role: 'Finance Admin', action: 'Enter Budget Targets',    description: 'Set budget amounts per GL account line.' },
          { step: 3, role: 'Finance Admin', action: 'Save & Submit',           description: 'Budget lines are saved and submitted for approval.' },
          { step: 4, role: 'Finance Admin', action: 'Track vs Actual',         description: 'Monitor spend against plan in the Budget vs Actual report.' },
        ]}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <PiggyBank className="w-6 h-6 text-purple-600" /> Budget Planning
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {selectedPeriod ? `${selectedPeriod.period_name} · ${format(parseISO(selectedPeriod.start_date), 'dd MMM')}–${format(parseISO(selectedPeriod.end_date), 'dd MMM yyyy')}` : 'Select a fiscal period to begin.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={copyFromPrevious} disabled={copying || !periodId} data-testid="button-copy-previous">
            {copying ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Copy className="w-4 h-4 mr-1" />} Copy Previous
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={importing || !periodId} data-testid="button-import-budget">
            {importing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />} Import CSV
          </Button>
          <Button variant="outline" size="sm" onClick={downloadTemplate} disabled={!accounts.length} data-testid="button-download-template"><FileDown className="w-4 h-4 mr-1" /> Template</Button>
          <Button variant="outline" size="sm" onClick={exportCsv} data-testid="button-export-budget"><Download className="w-4 h-4 mr-1" /> Export</Button>
          <Button variant="outline" size="sm" onClick={() => void loadBudgetLines(periodId, fundId)} data-testid="button-refresh-budget"><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleImportCsv} data-testid="input-import-csv" />
        </div>
      </div>

      {/* Migration required banner */}
      {!tableExists && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Database migration required</p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">The <code>acct_budget_lines</code> table does not exist yet. Apply the Phase 1 Sprint 1.1 migration to enable budget planning.</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Select value={yearId} onValueChange={v => { setYearId(v); setPeriodId(''); }}>
          <SelectTrigger className="w-[160px] h-9" data-testid="select-fiscal-year"><SelectValue placeholder="Fiscal Year" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Years</SelectItem>
            {years.map(y => <SelectItem key={y.id} value={y.id}>{y.code} — {y.name_en}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={periodId} onValueChange={setPeriodId}>
          <SelectTrigger className="w-[200px] h-9" data-testid="select-period"><SelectValue placeholder="Select Period" /></SelectTrigger>
          <SelectContent>
            {filteredPeriods.map(p => (
              <SelectItem key={p.id} value={p.id}>
                {p.period_name} ({p.status})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={fundId} onValueChange={setFundId}>
          <SelectTrigger className="w-[160px] h-9" data-testid="select-fund"><SelectValue placeholder="All Funds" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Funds</SelectItem>
            {funds.map(f => <SelectItem key={f.id} value={f.id}>{f.code} — {f.name_en}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[140px] h-9" data-testid="select-type"><SelectValue placeholder="Account Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="expense">Expense</SelectItem>
            <SelectItem value="revenue">Revenue</SelectItem>
            <SelectItem value="asset">Asset</SelectItem>
            <SelectItem value="liability">Liability</SelectItem>
            <SelectItem value="equity">Equity</SelectItem>
          </SelectContent>
        </Select>
        {countries.length > 1 && (
          <Select value={countryFilter} onValueChange={setCountryFilter}>
            <SelectTrigger className="w-[150px] h-9" data-testid="select-country"><SelectValue placeholder="Country" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Countries</SelectItem>
              {countries.map(c => <SelectItem key={c.id} value={c.id}>{c.name_en}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search accounts…" className="pl-9 h-9 text-sm" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-budget" />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Budget',          value: `$${formatNumber(stats.totalBudget)}`,  color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-950/30', isText: true },
          { label: 'Accounts Budgeted',     value: stats.withBudget,                        color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
          { label: 'Missing Budgets',       value: stats.withoutBudget,                     color: stats.withoutBudget > 0 ? 'text-amber-600' : 'text-slate-500', bg: stats.withoutBudget > 0 ? 'bg-amber-50 dark:bg-amber-950/30' : 'bg-slate-50 dark:bg-slate-800/30' },
          { label: 'Accounts Shown',        value: stats.total,                             color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/30' },
        ].map(s => (
          <div key={s.label} className={cn('rounded-xl border p-3', s.bg)}>
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={cn('font-bold mt-1', s.isText ? 'text-lg' : 'text-2xl', s.color)}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Budget Approval Workflow Banner */}
      {approvalTableExists && periodId && (
        <div className={cn(
          'rounded-xl border p-3 flex flex-col sm:flex-row sm:items-center gap-3',
          !approvalRecord || approvalRecord.status === 'draft'
            ? 'bg-slate-50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-700'
            : approvalRecord.status === 'submitted'
            ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
            : approvalRecord.status === 'approved'
            ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
            : 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800',
        )}>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              {!approvalRecord || approvalRecord.status === 'draft'
                ? <ClockIcon className="h-4 w-4 text-slate-500" />
                : approvalRecord.status === 'submitted'
                ? <SendHorizonal className="h-4 w-4 text-blue-600" />
                : approvalRecord.status === 'approved'
                ? <ShieldCheck className="h-4 w-4 text-emerald-600" />
                : <RejectIcon className="h-4 w-4 text-rose-600" />}
              <span className="text-sm font-semibold">
                {!approvalRecord || approvalRecord.status === 'draft'
                  ? 'Budget in Draft'
                  : approvalRecord.status === 'submitted'
                  ? 'Awaiting Approval'
                  : approvalRecord.status === 'approved'
                  ? 'Budget Approved'
                  : 'Budget Rejected — Revision Required'}
              </span>
              {approvalRecord?.status && (
                <Badge className={cn('text-[10px] px-1.5 py-0',
                  approvalRecord.status === 'approved' ? 'bg-emerald-100 text-emerald-800' :
                  approvalRecord.status === 'submitted' ? 'bg-blue-100 text-blue-800' :
                  approvalRecord.status === 'rejected' ? 'bg-rose-100 text-rose-800' :
                  'bg-slate-100 text-slate-600',
                )}>{approvalRecord.status}</Badge>
              )}
            </div>
            {approvalRecord?.reviewer_notes && (
              <p className="text-xs text-muted-foreground mt-1 ml-6">{approvalRecord.reviewer_notes}</p>
            )}
          </div>
          {canEdit && (
            <div className="flex gap-2 shrink-0">
              {(!approvalRecord || approvalRecord.status === 'draft' || approvalRecord.status === 'rejected') && (
                <Button size="sm" variant="outline" className="h-8 text-xs border-blue-300 text-blue-700 hover:bg-blue-50" onClick={submitForApproval} disabled={approvingBudget || !stats.withBudget} data-testid="button-submit-approval">
                  {approvingBudget ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <SendHorizonal className="h-3.5 w-3.5 mr-1" />}
                  Submit for Approval
                </Button>
              )}
              {approvalRecord?.status === 'submitted' && hasAnyRole(['super_admin', 'admin', 'financialAdmin']) && (
                <>
                  <Button size="sm" className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => reviewBudget('approved')} disabled={approvingBudget} data-testid="button-approve-budget">
                    {approvingBudget ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <ShieldCheck className="h-3.5 w-3.5 mr-1" />}
                    Approve
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs text-rose-600 border-rose-300 hover:bg-rose-50" onClick={() => reviewBudget('rejected')} disabled={approvingBudget} data-testid="button-reject-budget">
                    <RejectIcon className="h-3.5 w-3.5 mr-1" />Reject
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-2 pt-4 px-4 border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">
              Budget Lines
              {selectedPeriod && <span className="ml-2 text-muted-foreground font-normal">— {selectedPeriod.period_name}</span>}
            </CardTitle>
            {stats.withoutBudget > 0 && (
              <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50 dark:bg-amber-950/30 text-[10px]">
                <AlertTriangle className="h-3 w-3 mr-1" /> {stats.withoutBudget} unbudgeted
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {!periodId ? (
            <div className="text-center py-16 text-muted-foreground">
              <PiggyBank className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Select a fiscal period to view and edit budgets.</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <PiggyBank className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No accounts match current filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead className="bg-muted/40 border-b">
                  <tr>
                    {['Account Code', 'Account Name', 'Type', 'Budget Amount', ''].map(h => (
                      <th key={h} className="text-left text-xs font-medium text-muted-foreground px-4 py-2.5">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map(row => {
                    const tcfg = TYPE_LABEL[row.type] ?? TYPE_LABEL.expense;
                    const isEditing = editingId === row.account_id;
                    const isSaving = saving[row.account_id];
                    return (
                      <tr key={row.account_id} className={cn('hover:bg-muted/20 transition-colors', row.budget === 0 && ['expense','revenue'].includes(row.type) && 'bg-amber-50/30 dark:bg-amber-950/10')} data-testid={`row-budget-${row.account_id}`}>
                        <td className="px-4 py-2.5 font-mono text-xs font-semibold text-blue-600">{row.code}</td>
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-sm leading-tight">{row.name_en}</div>
                          <div className="text-[11px] text-muted-foreground" dir="rtl">{row.name_ar}</div>
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge className={cn('text-[10px] px-1.5 py-0 h-4 font-medium border-0', tcfg.color)}>{tcfg.label}</Badge>
                        </td>
                        <td className="px-4 py-2.5 min-w-[180px]">
                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') void saveEdit(row); if (e.key === 'Escape') setEditingId(null); }}
                                className="h-7 w-36 text-xs"
                                autoFocus
                                data-testid={`input-budget-${row.account_id}`}
                              />
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600 hover:bg-emerald-50" onClick={() => void saveEdit(row)} disabled={isSaving} data-testid={`button-save-budget-${row.account_id}`}>
                                {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-500 hover:bg-rose-50" onClick={() => setEditingId(null)} data-testid={`button-cancel-budget-${row.account_id}`}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className={cn('tabular-nums font-semibold', row.budget === 0 ? 'text-muted-foreground' : 'text-foreground')}>
                                {row.budget === 0 ? '—' : `$${formatNumber(row.budget)}`}
                              </span>
                              {row.budget > 0 && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
                              {row.budget === 0 && ['expense','revenue'].includes(row.type) && <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {canEdit && !isEditing && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              onClick={() => { setEditingId(row.account_id); setEditValue(String(row.budget)); }}
                              data-testid={`button-edit-budget-${row.account_id}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Footer hint */}
      <p className="text-[11px] text-muted-foreground text-center pb-2">
        Click <Pencil className="inline h-3 w-3 mx-0.5" /> to edit any budget line. Press <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">Enter</kbd> to save, <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">Esc</kbd> to cancel.
        Budget lines are visible in Budget vs Actual.
      </p>

      {/* Budget Audit Trail */}
      {periodId && <BudgetAuditLog periodId={periodId} fundId={fundId} />}
    </div>
  );
}

/* ── Budget Audit Log ────────────────────────────────────────────────────── */
function BudgetAuditLog({ periodId, fundId }: { periodId: string; fundId: string }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [tableExists, setTableExists] = useState(true);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!open || !tableExists) return;
    setLoading(true);
    const q = supabase.from('acct_budget_audit_log' as any)
      .select('id, changed_at, action, account_code, account_name_en, old_amount, new_amount, changed_by_email')
      .eq('period_id', periodId)
      .order('changed_at', { ascending: false })
      .limit(50);
    if (fundId !== 'all') (q as any).eq('fund_id', fundId); else (q as any).is('fund_id', null);
    const { data, error } = await (q as any);
    if (error?.code === '42P01') { setTableExists(false); setLoading(false); return; }
    setLogs(data ?? []);
    setLoading(false);
  }, [open, tableExists, periodId, fundId]);

  useEffect(() => { void load(); }, [load]);

  if (!tableExists) return null;

  return (
    <Card className="border border-dashed border-muted-foreground/30">
      <CardHeader className="py-3 px-4 cursor-pointer" onClick={() => setOpen(o => !o)}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ClockIcon className="h-4 w-4 text-muted-foreground" />
            Budget Change Audit Log
          </CardTitle>
          <div className="flex items-center gap-2">
            {logs.length > 0 && <Badge variant="secondary" className="text-[10px]">{logs.length} entries</Badge>}
            <span className="text-xs text-muted-foreground">{open ? '▲ Hide' : '▼ Show'}</span>
          </div>
        </div>
      </CardHeader>
      {open && (
        <CardContent className="px-4 pb-4 pt-0">
          {loading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading audit log…
            </div>
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No budget changes recorded for this period yet.
              {!tableExists && ' Apply the acct_budget_approvals.sql migration to enable audit logging.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[500px]">
                <thead>
                  <tr className="border-b">
                    {['When', 'Action', 'Account', 'Old Amount', 'New Amount', 'Changed By'].map(h => (
                      <th key={h} className="text-left font-medium text-muted-foreground pb-2 pr-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {logs.map((log: any) => (
                    <tr key={log.id} className="hover:bg-muted/20">
                      <td className="py-1.5 pr-3 whitespace-nowrap text-muted-foreground">
                        {log.changed_at ? format(parseISO(log.changed_at), 'MMM d, HH:mm') : '—'}
                      </td>
                      <td className="py-1.5 pr-3">
                        <Badge className={cn('text-[10px] px-1.5 py-0',
                          log.action === 'insert' ? 'bg-emerald-50 text-emerald-700' :
                          log.action === 'update' ? 'bg-blue-50 text-blue-700' :
                          'bg-rose-50 text-rose-700'
                        )}>{log.action ?? 'update'}</Badge>
                      </td>
                      <td className="py-1.5 pr-3 font-mono">{log.account_code} <span className="text-muted-foreground font-sans">{log.account_name_en}</span></td>
                      <td className="py-1.5 pr-3 tabular-nums text-muted-foreground line-through">{log.old_amount != null ? `$${formatNumber(log.old_amount)}` : '—'}</td>
                      <td className="py-1.5 pr-3 tabular-nums font-semibold">{log.new_amount != null ? `$${formatNumber(log.new_amount)}` : '—'}</td>
                      <td className="py-1.5 text-muted-foreground truncate max-w-[140px]">{log.changed_by_email ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
