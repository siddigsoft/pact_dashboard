import { useEffect, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Loader2, Zap, RefreshCw, Plus, AlertTriangle, CheckCircle2,
  Download, Target, BookOpen,
} from 'lucide-react';
import { format, startOfMonth } from 'date-fns';
import { formatNumber, downloadCsv } from '@/lib/accountingFormat';
import { cn } from '@/lib/utils';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';
import { useToast } from '@/hooks/use-toast';

async function getGLPrereqs() {
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: fund }, { data: period }, { data: authData }] = await Promise.all([
    supabase.from('acct_funds').select('id').eq('is_active', true).limit(1).single(),
    supabase.from('acct_fiscal_periods' as any).select('id').lte('start_date', today).gte('end_date', today).eq('status', 'open').limit(1).single(),
    supabase.auth.getUser(),
  ]);
  return {
    fundId: (fund as any)?.id as string | null ?? null,
    periodId: (period as any)?.id as string | null ?? null,
    userId: authData?.user?.id ?? null,
  };
}

interface AllocationRule {
  id: string; pool_name: string; source_account_id: string; source_account_code: string;
  source_account_name: string; basis_type: 'equal' | 'budget_pct' | 'headcount';
  target_count: number; is_active: boolean; description: string | null; created_at: string;
}
interface AllocationTarget {
  id: string; rule_id: string; target_account_id: string;
  account_code: string; account_name: string; weight_pct: number;
}
interface AllocationRun {
  id: string; run_date: string; total_allocated: number; rule_count: number;
  journal_entry_id: string | null; status: string; notes: string | null; created_by: string | null;
}

const BASIS_LABELS: Record<string, string> = { equal: 'Equal Split', budget_pct: 'Budget %', headcount: 'Headcount' };

const MIGRATION_NOTICE = (
  <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/10 p-4 flex items-start gap-3">
    <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
    <div>
      <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Migration required</p>
      <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
        Run <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">supabase/migrations/20260502_acct_phase5_expansion.sql</code> then{' '}
        <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">hr_advances_grant_milestones.sql</code> to enable Cost Allocation.
      </p>
    </div>
  </div>
);

export default function AccountingCostAllocation() {
  const { hasAnyRole, loading: authLoading } = useAuthorization();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);
  const canEdit  = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin']);
  const { toast } = useToast();

  const [rules, setRules]               = useState<AllocationRule[]>([]);
  const [targets, setTargets]           = useState<AllocationTarget[]>([]);
  const [runs, setRuns]                 = useState<AllocationRun[]>([]);
  const [accounts, setAccounts]         = useState<{ id: string; code: string; name_en: string }[]>([]);
  const [loading, setLoading]           = useState(true);
  const [migrationNeeded, setMigrationNeeded] = useState(false);
  const [running, setRunning]           = useState(false);
  const [glLogMap, setGlLogMap]         = useState<Map<string, string>>(new Map());

  // Add rule dialog
  const [showAdd, setShowAdd]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [form, setForm]         = useState({ pool_name: '', source_account_id: '', basis_type: 'equal', target_count: '2', description: '' });

  // Add target dialog
  const [showAddTarget, setShowAddTarget]     = useState(false);
  const [targetRuleId, setTargetRuleId]       = useState<string>('');
  const [targetForm, setTargetForm]           = useState({ target_account_id: '', weight_pct: '100' });
  const [savingTarget, setSavingTarget]       = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [rulesRes, runsRes, acctRes] = await Promise.all([
      supabase.from('acct_cost_allocation_rules' as any)
        .select('id, pool_name, source_account_id, basis_type, target_count, is_active, description, created_at, acct_accounts!source_account_id(code, name_en)')
        .order('pool_name').limit(200),
      supabase.from('acct_allocation_runs' as any).select('*').order('run_date', { ascending: false }).limit(50),
      supabase.from('acct_accounts').select('id, code, name_en').order('code').limit(1000),
    ]);

    if (rulesRes.error?.code === '42P01') { setMigrationNeeded(true); setLoading(false); return; }
    setMigrationNeeded(false);

    const mappedRules: AllocationRule[] = ((rulesRes.data ?? []) as any[]).map(r => ({
      ...r,
      source_account_code: (r.acct_accounts as any)?.code ?? '',
      source_account_name: (r.acct_accounts as any)?.name_en ?? '',
    }));
    setRules(mappedRules);
    setRuns((runsRes.data ?? []) as AllocationRun[]);
    setAccounts((acctRes.data ?? []) as any[]);

    // Load targets (may not exist yet if migration not run)
    const tgtsRes = await supabase.from('acct_cost_allocation_targets' as any)
      .select('id, rule_id, target_account_id, weight_pct, acct_accounts!target_account_id(code, name_en)')
      .limit(2000).catch(() => ({ data: [] }));
    const mappedTargets: AllocationTarget[] = ((tgtsRes as any).data ?? []).map((t: any) => ({
      id: t.id, rule_id: t.rule_id, target_account_id: t.target_account_id,
      account_code: t.acct_accounts?.code ?? '',
      account_name: t.acct_accounts?.name_en ?? '',
      weight_pct: t.weight_pct,
    }));
    setTargets(mappedTargets);

    const loadedRuns = (runsRes.data ?? []) as AllocationRun[];
    if (loadedRuns.length > 0) {
      const completedIds = loadedRuns.filter(r => r.status === 'completed').map(r => r.id);
      if (completedIds.length > 0) {
        const { data: logData } = await supabase
          .from('acct_gl_bridge_log' as any)
          .select('source_id, status')
          .eq('source_table', 'acct_allocation_runs')
          .in('source_id', completedIds)
          .order('created_at', { ascending: false });
        const map = new Map<string, string>();
        for (const row of (logData ?? []) as { source_id: string; status: string }[]) {
          if (!map.has(row.source_id)) map.set(row.source_id, row.status);
        }
        setGlLogMap(map);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const saveRule = async () => {
    if (!form.pool_name || !form.source_account_id) { toast({ title: 'Required fields missing', variant: 'destructive' }); return; }
    setSaving(true);
    const { error } = await supabase.from('acct_cost_allocation_rules' as any).insert({
      pool_name: form.pool_name, source_account_id: form.source_account_id,
      basis_type: form.basis_type, target_count: parseInt(form.target_count) || 2,
      description: form.description || null, is_active: true,
    });
    setSaving(false);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Allocation rule saved' });
    setShowAdd(false);
    setForm({ pool_name: '', source_account_id: '', basis_type: 'equal', target_count: '2', description: '' });
    void load();
  };

  const saveTarget = async () => {
    if (!targetForm.target_account_id || !targetRuleId) { toast({ title: 'Select an account', variant: 'destructive' }); return; }
    setSavingTarget(true);
    const { error } = await supabase.from('acct_cost_allocation_targets' as any).insert({
      rule_id: targetRuleId,
      target_account_id: targetForm.target_account_id,
      weight_pct: parseFloat(targetForm.weight_pct) || 100,
    });
    setSavingTarget(false);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Target account added' });
    setShowAddTarget(false);
    setTargetForm({ target_account_id: '', weight_pct: '100' });
    void load();
  };

  const removeTarget = async (tgtId: string) => {
    await supabase.from('acct_cost_allocation_targets' as any).delete().eq('id', tgtId);
    setTargets(prev => prev.filter(t => t.id !== tgtId));
    toast({ title: 'Target removed' });
  };

  /**
   * Run allocation — creates a real draft GL journal entry:
   * For each active rule with targets:
   *   CR source account for pool balance (current month posted debits)
   *   DR each target account proportionally (by weight_pct)
   */
  const runAllocation = async () => {
    const activeRules = rules.filter(r => r.is_active);
    if (activeRules.length === 0) { toast({ title: 'No active rules', variant: 'destructive' }); return; }

    const rulesWithTargets = activeRules.filter(r => targets.some(t => t.rule_id === r.id));
    if (rulesWithTargets.length === 0) {
      toast({ title: 'No targets defined', description: 'Add at least one target account to an active rule before running.', variant: 'destructive' });
      return;
    }

    setRunning(true);
    try {
      const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');

      // 1. Resolve GL prerequisites (fiscal period, fund, current user)
      const prereqs = await getGLPrereqs();
      if (!prereqs.periodId || !prereqs.userId) {
        toast({ title: 'GL prerequisites missing', description: prereqs.periodId ? 'Could not resolve current user.' : 'No open fiscal period found for today. Create or open a fiscal period first.', variant: 'destructive' });
        setRunning(false);
        return;
      }
      if (!prereqs.fundId) {
        toast({ title: 'No active fund found', description: 'Create at least one active fund in the Funds module before running cost allocation.', variant: 'destructive' });
        setRunning(false);
        return;
      }

      // 2. Create draft journal entry header
      const today = new Date().toISOString().slice(0, 10);
      const { data: je, error: jeErr } = await supabase
        .from('acct_journal_entries')
        .insert({
          posting_date: today,
          description_en: `Cost Allocation Run — ${rulesWithTargets.length} pool(s) — ${format(new Date(), 'MMM yyyy')}`,
          description_ar: 'تشغيل توزيع التكاليف',
          status: 'draft',
          source_type: 'cost_allocation',
          period_id: prereqs.periodId,
          idempotency_key: crypto.randomUUID(),
          created_by: prereqs.userId,
        })
        .select('id')
        .single();

      if (jeErr || !je) {
        toast({ title: 'Failed to create journal entry', description: jeErr?.message, variant: 'destructive' });
        setRunning(false);
        return;
      }

      const lines: any[] = [];
      let totalAllocated = 0;

      for (const rule of rulesWithTargets) {
        const ruleTargets = targets.filter(t => t.rule_id === rule.id);
        const totalWeight = ruleTargets.reduce((s, t) => s + t.weight_pct, 0) || 1;

        // Get pool balance from posted debits this month
        const { data: srcLines } = await supabase
          .from('acct_journal_lines')
          .select('functional_amount, debit_credit, acct_journal_entries!inner(posting_date, status)')
          .eq('account_id', rule.source_account_id)
          .eq('acct_journal_entries.status', 'posted')
          .gte('acct_journal_entries.posting_date', monthStart);

        const poolBalance = ((srcLines ?? []) as any[]).reduce((s: number, l: any) => {
          const amt = Number(l.functional_amount ?? 0);
          return l.debit_credit === 'DR' ? s + amt : s - amt;
        }, 0);

        // If no balance, skip this rule
        if (poolBalance <= 0) continue;

        totalAllocated += poolBalance;

        // CR source — clear the pool
        lines.push({
          entry_id: je.id,
          account_id: rule.source_account_id,
          fund_id: prereqs.fundId,
          function: 'none',
          debit_credit: 'CR',
          original_amount: poolBalance,
          original_currency: 'USD',
          functional_amount: poolBalance,
          functional_currency: 'USD',
          description: `Pool clearing: ${rule.pool_name}`,
          line_no: lines.length + 1,
        });

        // DR each target proportionally
        for (const tgt of ruleTargets) {
          const share = parseFloat(((tgt.weight_pct / totalWeight) * poolBalance).toFixed(2));
          lines.push({
            entry_id: je.id,
            account_id: tgt.target_account_id,
            fund_id: prereqs.fundId,
            function: 'program',
            debit_credit: 'DR',
            original_amount: share,
            original_currency: 'USD',
            functional_amount: share,
            functional_currency: 'USD',
            description: `Allocated from pool: ${rule.pool_name}`,
            line_no: lines.length + 1,
          });
        }
      }

      if (lines.length === 0) {
        // No pool balance found — remove the empty JE
        await supabase.from('acct_journal_entries').delete().eq('id', je.id);
        toast({ title: 'No pool balance found', description: 'Source accounts have no posted debit activity this month. Post some journal entries first.', variant: 'destructive' });
        setRunning(false);
        return;
      }

      // 3. Insert all lines
      const { error: lineErr } = await supabase.from('acct_journal_lines').insert(lines);
      if (lineErr) {
        toast({ title: 'Failed to insert journal lines', description: lineErr.message, variant: 'destructive' });
        setRunning(false);
        return;
      }

      // 5. Record the run
      await supabase.from('acct_allocation_runs' as any).insert({
        run_date: new Date().toISOString().slice(0, 10),
        total_allocated: totalAllocated,
        rule_count: rulesWithTargets.length,
        journal_entry_id: je.id,
        status: 'completed',
        notes: `Draft JE #${nextNo} created — ${lines.length} lines posted`,
      });

      toast({
        title: 'Allocation run completed',
        description: `Draft journal entry #${nextNo} created with ${lines.length} lines. Review in the Journals module before posting.`,
      });
    } catch (e: any) {
      toast({ title: 'Run failed', description: e.message, variant: 'destructive' });
    }
    setRunning(false);
    void load();
  };

  const exportRuns = () => {
    downloadCsv(`allocation-runs-${new Date().toISOString().slice(0, 10)}.csv`, [
      ['Run Date', 'Rules Applied', 'Total Allocated', 'Journal Entry', 'Status', 'Notes'],
      ...runs.map(r => [r.run_date, String(r.rule_count), r.total_allocated.toFixed(2), r.journal_entry_id ?? '—', r.status, r.notes ?? '']),
    ]);
  };

  if (authLoading) return <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!allowed) return <Navigate to="/" replace />;

  const activeRulesCount = rules.filter(r => r.is_active).length;
  const rulesWithTargets = rules.filter(r => targets.some(t => t.rule_id === r.id)).length;

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl" data-testid="cost-allocation-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-violet-600 text-white shrink-0"><Zap className="h-5 w-5" /></div>
          <div>
            <h1 className="text-2xl font-bold">Cost Allocation</h1>
            <p className="text-muted-foreground text-sm">توزيع التكاليف — Distribute overhead pools across programs with GL posting</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw className={cn('h-4 w-4 mr-1', loading && 'animate-spin')} />Refresh</Button>
          {canEdit && !migrationNeeded && (
            <>
              <Button variant="outline" size="sm" onClick={() => setShowAdd(true)} data-testid="button-add-rule">
                <Plus className="h-4 w-4 mr-1" />Add Rule
              </Button>
              <Button size="sm" onClick={runAllocation} disabled={running || activeRulesCount === 0} data-testid="button-run-allocation">
                {running ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Zap className="h-4 w-4 mr-1" />}
                Run Allocation
              </Button>
            </>
          )}
        </div>
      </div>

      <PageInfoBanner
        title="Cost Allocation"
        description="Define overhead pools with a source GL account and target accounts. Click 'Run Allocation' to read this month's pool balance from posted journal lines and post a proportional draft journal entry (CR source, DR targets). Review and post the draft in the Journals module."
        descriptionAr="تعريف مجمعات التكاليف غير المباشرة وتوزيعها على الحسابات المستهدفة مع ترحيل قيود اليومية تلقائياً."
      />

      {migrationNeeded ? MIGRATION_NOTICE : loading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            {[
              { label: 'Total Rules',        v: String(rules.length),        color: 'text-indigo-700' },
              { label: 'Active with Targets', v: String(rulesWithTargets),   color: 'text-emerald-700' },
              { label: 'Runs This Month',    v: String(runs.filter(r => r.run_date >= new Date().toISOString().slice(0, 7)).length), color: 'text-sky-700' },
            ].map(s => (
              <Card key={s.label}><CardContent className="p-3"><div className="text-xs text-muted-foreground">{s.label}</div><div className={cn('text-xl font-bold mt-1', s.color)}>{s.v}</div></CardContent></Card>
            ))}
          </div>

          {rulesWithTargets === 0 && activeRulesCount > 0 && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {activeRulesCount} active rule(s) have no target accounts. Add targets to each rule before running an allocation.
            </div>
          )}

          <Tabs defaultValue="rules">
            <TabsList className="mb-4">
              <TabsTrigger value="rules">Allocation Rules ({rules.length})</TabsTrigger>
              <TabsTrigger value="history">Run History ({runs.length})</TabsTrigger>
            </TabsList>

            {/* Rules tab */}
            <TabsContent value="rules">
              {rules.length === 0 ? (
                <div className="text-center text-muted-foreground py-16 text-sm">No allocation rules yet. Add your first rule to start distributing overhead costs.</div>
              ) : (
                <div className="space-y-3">
                  {rules.map(r => {
                    const ruleTargets = targets.filter(t => t.rule_id === r.id);
                    return (
                      <Card key={r.id} className={cn(!r.is_active && 'opacity-60')} data-testid={`card-rule-${r.id}`}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-sm">{r.pool_name}</span>
                                <Badge variant="outline" className="text-[10px]">{BASIS_LABELS[r.basis_type] ?? r.basis_type}</Badge>
                                {r.is_active
                                  ? <Badge variant="outline" className="text-[10px] text-emerald-700 border-emerald-300 gap-1"><CheckCircle2 className="h-3 w-3" />Active</Badge>
                                  : <Badge variant="outline" className="text-[10px] text-slate-500 border-slate-300">Inactive</Badge>}
                              </div>
                              <div className="text-xs text-muted-foreground mt-1 font-mono">
                                Source: {r.source_account_code} — {r.source_account_name}
                              </div>
                              {r.description && <div className="text-[11px] text-muted-foreground mt-0.5">{r.description}</div>}
                            </div>
                            {canEdit && (
                              <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={() => { setTargetRuleId(r.id); setShowAddTarget(true); }} data-testid={`button-add-target-${r.id}`}>
                                <Target className="h-3.5 w-3.5 mr-1" />Add Target
                              </Button>
                            )}
                          </div>

                          {/* Targets */}
                          {ruleTargets.length > 0 ? (
                            <div className="mt-3 border-t pt-3">
                              <div className="text-[11px] font-medium text-muted-foreground mb-2">TARGET ACCOUNTS ({ruleTargets.length})</div>
                              <div className="space-y-1">
                                {ruleTargets.map(tgt => (
                                  <div key={tgt.id} className="flex items-center gap-2 text-xs" data-testid={`row-target-${tgt.id}`}>
                                    <div className="flex-1 font-mono text-muted-foreground">{tgt.account_code} — {tgt.account_name}</div>
                                    <div className="text-right w-16 font-medium">{tgt.weight_pct}%</div>
                                    {canEdit && (
                                      <button onClick={() => removeTarget(tgt.id)} className="text-muted-foreground hover:text-rose-600 transition-colors">×</button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="mt-3 text-[11px] text-amber-600 flex items-center gap-1 border-t pt-3">
                              <AlertTriangle className="h-3 w-3" />No target accounts — add at least one to include this rule in allocation runs.
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* History tab */}
            <TabsContent value="history">
              <div className="flex justify-end mb-2">
                <Button variant="outline" size="sm" onClick={exportRuns} disabled={!runs.length}><Download className="h-4 w-4 mr-1" />CSV</Button>
              </div>
              {runs.length === 0 ? (
                <div className="text-center text-muted-foreground py-16 text-sm">No allocation runs yet. Click "Run Allocation" to begin.</div>
              ) : (
                <Card>
                  <CardContent className="px-0 pb-0">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/40">
                          <th className="text-left px-4 py-2 font-medium text-muted-foreground">Run Date</th>
                          <th className="text-right px-4 py-2 font-medium text-muted-foreground w-20">Rules</th>
                          <th className="text-right px-4 py-2 font-medium text-muted-foreground w-32">Total Allocated</th>
                          <th className="text-left px-4 py-2 font-medium text-muted-foreground w-24">Journal Entry</th>
                          <th className="text-left px-4 py-2 font-medium text-muted-foreground w-24">Status</th>
                          <th className="text-left px-4 py-2 font-medium text-muted-foreground w-24">GL</th>
                          <th className="text-left px-4 py-2 font-medium text-muted-foreground">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {runs.map((r, i) => (
                          <tr key={r.id} className={cn('border-b hover:bg-muted/20', i % 2 !== 0 && 'bg-muted/10')}>
                            <td className="px-4 py-2">{r.run_date}</td>
                            <td className="px-4 py-2 text-right">{r.rule_count}</td>
                            <td className="px-4 py-2 text-right tabular-nums font-medium">{formatNumber(r.total_allocated, 2)}</td>
                            <td className="px-4 py-2">
                              {r.journal_entry_id
                                ? <span className="flex items-center gap-1 text-blue-700"><BookOpen className="h-3 w-3" />Linked</span>
                                : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="px-4 py-2">
                              <Badge variant="outline" className={cn('text-[10px]', r.status === 'completed' ? 'text-emerald-700 border-emerald-300' : 'text-amber-700 border-amber-300')}>
                                {r.status}
                              </Badge>
                            </td>
                            <td className="px-4 py-2">
                              {r.status === 'completed' && (() => {
                                const gl = glLogMap.get(r.id);
                                if (gl === 'success') return <Badge variant="outline" className="text-[10px] text-emerald-700 border-emerald-300">GL Posted</Badge>;
                                if (gl === 'error')   return <Badge variant="outline" className="text-[10px] text-rose-700 border-rose-300">GL Error</Badge>;
                                if (gl === 'skipped') return <Badge variant="outline" className="text-[10px] text-slate-500 border-slate-300">GL Skipped</Badge>;
                                return <Badge variant="outline" className="text-[10px] text-slate-400 border-slate-200">GL Pending</Badge>;
                              })()}
                            </td>
                            <td className="px-4 py-2 text-muted-foreground">{r.notes ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}

      {/* ── Add Rule Dialog ─────────────────────────────────────── */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Allocation Rule</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label className="text-xs mb-1 block">Pool Name *</Label>
              <Input value={form.pool_name} onChange={e => setForm(p => ({ ...p, pool_name: e.target.value }))} className="h-8 text-sm" placeholder="e.g. Admin Overhead" /></div>
            <div>
              <Label className="text-xs mb-1 block">Source Account *</Label>
              <Select value={form.source_account_id} onValueChange={v => setForm(p => ({ ...p, source_account_id: v }))}>
                <SelectTrigger className="h-8"><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.code} — {a.name_en}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Allocation Basis</Label>
              <Select value={form.basis_type} onValueChange={v => setForm(p => ({ ...p, basis_type: v }))}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="equal">Equal Split</SelectItem>
                  <SelectItem value="budget_pct">Budget %</SelectItem>
                  <SelectItem value="headcount">Headcount</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs mb-1 block">Description</Label>
              <Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="h-8 text-sm" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={saveRule} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save Rule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Target Dialog ───────────────────────────────────── */}
      <Dialog open={showAddTarget} onOpenChange={setShowAddTarget}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Target Account</DialogTitle>
            <p className="text-xs text-muted-foreground pt-1">
              Allocating from: <strong>{rules.find(r => r.id === targetRuleId)?.pool_name ?? '—'}</strong>
            </p>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs mb-1 block">Target Account *</Label>
              <Select value={targetForm.target_account_id} onValueChange={v => setTargetForm(p => ({ ...p, target_account_id: v }))}>
                <SelectTrigger className="h-8"><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.code} — {a.name_en}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Weight % (used for proportional split)</Label>
              <Input type="number" min="1" max="100" step="0.01" value={targetForm.weight_pct} onChange={e => setTargetForm(p => ({ ...p, weight_pct: e.target.value }))} className="h-8 text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddTarget(false)}>Cancel</Button>
            <Button onClick={saveTarget} disabled={savingTarget}>{savingTarget && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Add Target</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
