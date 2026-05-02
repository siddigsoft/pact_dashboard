import { useEffect, useMemo, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useAppContext } from '@/context/AppContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import {
  Loader2, RefreshCw, Download, Search, AlertTriangle,
  ClipboardList, Wallet, CheckCircle2, XCircle, Info,
  ShieldAlert, Banknote, TrendingUp, ArrowRight,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { formatNumber, downloadCsv } from '@/lib/accountingFormat';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';

interface Encumbrance {
  id: string; source_type: string; source_id: string;
  amount: number; currency: string; status: string;
  fund_id: string | null; country_id: string | null;
  gl_account_id: string | null; created_at: string;
  budget_line_id: string | null;
}
interface Fund { id: string; code: string; name_en: string }
interface Account { id: string; code: string; name_en: string }
interface BudgetLine { id: string; account_id: string; budget_amount: number }
interface ActualByAccount { account_id: string; actual: number }

const STATUS_CFG: Record<string, { label: string; color: string }> = {
  open:        { label: 'Open',       color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30' },
  liquidated:  { label: 'Liquidated', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30' },
  cancelled:   { label: 'Cancelled',  color: 'bg-slate-100 text-slate-700' },
};

const SOURCE_LABEL: Record<string, string> = {
  purchase_requisition: 'Purchase Requisition',
  purchase_order:       'Purchase Order',
};

export default function AccountingBudgetEncumbrance() {
  const { hasAnyRole, loading: authLoading } = useAuthorization();
  const allowed  = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);
  const canEdit  = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin']);
  const { countries } = useAppContext();
  const { toast } = useToast();

  const [encumbrances, setEncumbrances] = useState<Encumbrance[]>([]);
  const [funds, setFunds]               = useState<Fund[]>([]);
  const [accounts, setAccounts]         = useState<Account[]>([]);
  const [budgetLines, setBudgetLines]   = useState<BudgetLine[]>([]);
  const [actuals, setActuals]           = useState<ActualByAccount[]>([]);
  const [loading, setLoading]           = useState(true);
  const [tableExists, setTableExists]   = useState<boolean | null>(null);

  const [search, setSearch]         = useState('');
  const [statusFilter, setStatusFilter] = useState('open');
  const [fundFilter, setFundFilter] = useState('all');

  const [actionDlg, setActionDlg]   = useState<{ enc: Encumbrance; action: 'liquidate' | 'cancel' } | null>(null);
  const [actioning, setActioning]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: enc, error: encErr } = await supabase
      .from('acct_budget_encumbrances')
      .select('*')
      .order('created_at', { ascending: false });
    if (encErr?.code === '42P01') { setTableExists(false); setLoading(false); return; }
    setTableExists(true);
    setEncumbrances((enc ?? []) as Encumbrance[]);

    const [{ data: fData }, { data: aData }, { data: blData }] = await Promise.all([
      supabase.from('accounting_funds').select('id, code, name_en').eq('is_active', true),
      supabase.from('chart_of_accounts').select('id, code, name_en').order('code'),
      supabase.from('acct_budget_lines').select('id, account_id, budget_amount'),
    ]);
    setFunds((fData ?? []) as Fund[]);
    setAccounts((aData ?? []) as Account[]);
    setBudgetLines((blData ?? []) as BudgetLine[]);

    const { data: jlData } = await supabase
      .from('acct_journal_entry_lines')
      .select('account_id, functional_amount, debit_credit');
    const actualMap = new Map<string, number>();
    for (const l of (jlData ?? []) as any[]) {
      const cur = actualMap.get(l.account_id) ?? 0;
      actualMap.set(l.account_id, cur + (l.debit_credit === 'DR' ? l.functional_amount : -l.functional_amount));
    }
    setActuals(Array.from(actualMap.entries()).map(([account_id, actual]) => ({ account_id, actual })));
    setLoading(false);
  }, []);

  useEffect(() => { if (allowed) void load(); }, [allowed]);

  const filtered = useMemo(() => encumbrances.filter(e => {
    if (statusFilter !== 'all' && e.status !== statusFilter) return false;
    if (fundFilter !== 'all' && e.fund_id !== fundFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!e.source_type.includes(q) && !e.source_id.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [encumbrances, statusFilter, fundFilter, search]);

  const stats = useMemo(() => {
    const open = encumbrances.filter(e => e.status === 'open');
    return {
      openCount: open.length,
      openAmount: open.reduce((s, e) => s + e.amount, 0),
      liquidated: encumbrances.filter(e => e.status === 'liquidated').length,
      cancelled: encumbrances.filter(e => e.status === 'cancelled').length,
    };
  }, [encumbrances]);

  const budgetSummary = useMemo(() => {
    const encByAccount = new Map<string, number>();
    for (const e of encumbrances.filter(en => en.status === 'open')) {
      if (e.gl_account_id) {
        encByAccount.set(e.gl_account_id, (encByAccount.get(e.gl_account_id) ?? 0) + e.amount);
      }
    }
    return budgetLines.map(bl => {
      const account = accounts.find(a => a.id === bl.account_id);
      const enc = encByAccount.get(bl.account_id) ?? 0;
      const actual = actuals.find(a => a.account_id === bl.account_id)?.actual ?? 0;
      const available = bl.budget_amount - actual - enc;
      return { account_id: bl.account_id, account, budget: bl.budget_amount, actual, enc, available };
    }).filter(b => b.budget > 0 || b.enc > 0).sort((a, b) => b.enc - a.enc);
  }, [budgetLines, encumbrances, actuals, accounts]);

  const doAction = async () => {
    if (!actionDlg) return;
    setActioning(true);
    const { enc, action } = actionDlg;
    const newStatus = action === 'liquidate' ? 'liquidated' : 'cancelled';
    const { error } = await supabase.from('acct_budget_encumbrances').update({ status: newStatus }).eq('id', enc.id);
    setActioning(false);
    setActionDlg(null);
    if (error) toast({ title: 'Action failed', description: error.message, variant: 'destructive' });
    else { toast({ title: `Encumbrance ${newStatus}` }); void load(); }
  };

  const exportCsv = () => {
    downloadCsv('budget_encumbrances.csv', [
      ['Source Type', 'Source ID', 'Amount', 'Currency', 'Status', 'Fund', 'Created'],
      ...filtered.map(e => {
        const fund = funds.find(f => f.id === e.fund_id);
        return [SOURCE_LABEL[e.source_type] ?? e.source_type, e.source_id, e.amount, e.currency, e.status, fund?.name_en ?? '', e.created_at];
      }),
    ]);
  };

  if (authLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!allowed)   return <Navigate to="/" replace />;

  if (tableExists === false) {
    return (
      <div className="container mx-auto p-4 sm:p-6 max-w-[900px] space-y-5">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Wallet className="w-6 h-6 text-indigo-600" /> Budget Encumbrance</h1>
        <Card className="border border-amber-200 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="p-5 flex gap-4">
            <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-medium text-amber-800 dark:text-amber-400">Phase 4 Migration Required</p>
              <p className="text-sm text-amber-700 dark:text-amber-500">Apply <code className="font-mono text-xs">supabase/migrations/20260520_acct_phase4_advanced.sql</code> to create the <code className="font-mono text-xs">acct_budget_encumbrances</code> table.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-[1100px]">
      <PageInfoBanner
        title="Budget Encumbrance & Commitment Accounting"
        description="Track budget commitments from Purchase Requisitions and Purchase Orders before they become actual expenses. Encumbrances reduce the available budget to prevent overspending."
        workflowSteps={['PR / PO Created (Encumbrance Opens)', 'Budget Availability Checked', 'Invoice Received (Encumbrance Liquidated)', 'Expense Posted to GL']}
      />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Wallet className="w-6 h-6 text-indigo-600" /> Budget Encumbrance</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Commitment accounting — track reserved budget before actual expenditure.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} data-testid="button-refresh-enc"><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
          <Button variant="outline" size="sm" onClick={exportCsv} data-testid="button-export-enc"><Download className="w-4 h-4 mr-1" /> Export</Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Open Encumbrances', value: stats.openCount,                      sub: formatNumber(stats.openAmount),   color: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-950/30' },
          { label: 'Total Committed',   value: formatNumber(stats.openAmount),        sub: 'reserved from budget',           color: 'text-amber-600',  bg: 'bg-amber-50 dark:bg-amber-950/30' },
          { label: 'Liquidated',        value: stats.liquidated,                      sub: 'converted to actual',            color: 'text-emerald-600',bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
          { label: 'Cancelled',         value: stats.cancelled,                       sub: 'released back to budget',        color: 'text-slate-600',  bg: 'bg-slate-50 dark:bg-slate-800/30' },
        ].map(s => (
          <div key={s.label} className={cn('rounded-xl border p-3', s.bg)}>
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={cn('text-2xl font-bold mt-1', s.color)}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Budget Impact Table */}
      {budgetSummary.length > 0 && (
        <Card className="border shadow-sm">
          <CardHeader className="p-4 border-b">
            <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4 text-indigo-600" /> Budget vs Actual vs Encumbered</CardTitle>
            <CardDescription className="text-xs">Available = Budget − Actual Spend − Open Encumbrances</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b">
                  <tr>
                    {['Account', 'Budget', 'Actual', 'Encumbered', 'Available', ''].map(h => (
                      <th key={h} className="text-left text-xs font-medium text-muted-foreground px-4 py-2.5">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {budgetSummary.map(b => {
                    const pct = b.budget > 0 ? Math.min(((b.actual + b.enc) / b.budget) * 100, 100) : 0;
                    const isOver = b.available < 0;
                    return (
                      <tr key={b.account_id} className="hover:bg-muted/30" data-testid={`row-bud-${b.account_id}`}>
                        <td className="px-4 py-3">
                          <p className="font-mono text-xs font-semibold">{b.account?.code}</p>
                          <p className="text-xs text-muted-foreground">{b.account?.name_en}</p>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">{formatNumber(b.budget)}</td>
                        <td className="px-4 py-3 font-mono text-xs">{formatNumber(b.actual)}</td>
                        <td className="px-4 py-3 font-mono text-xs text-indigo-600 font-semibold">{formatNumber(b.enc)}</td>
                        <td className={cn('px-4 py-3 font-mono text-xs font-bold', isOver ? 'text-rose-600' : 'text-emerald-600')}>
                          {formatNumber(b.available)}
                          {isOver && <span className="ml-1 text-[10px] text-rose-500">(over budget)</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className={cn('h-full rounded-full transition-all', isOver ? 'bg-rose-500' : pct > 85 ? 'bg-amber-400' : 'bg-indigo-400')}
                              style={{ width: `${pct}%` }} />
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{pct.toFixed(0)}% used</p>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Encumbrance List */}
      <Card className="border shadow-sm">
        <CardHeader className="p-4 border-b">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search…" className="pl-9 h-9 text-sm" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-enc" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[120px] h-9" data-testid="select-status-enc"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {Object.entries(STATUS_CFG).map(([v, c]) => <SelectItem key={v} value={v}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={fundFilter} onValueChange={setFundFilter}>
              <SelectTrigger className="w-[140px] h-9" data-testid="select-fund-enc"><SelectValue placeholder="All Funds" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Funds</SelectItem>
                {funds.map(f => <SelectItem key={f.id} value={f.id}>{f.code} – {f.name_en}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Wallet className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No encumbrances found.</p>
              <p className="text-xs mt-1">Encumbrances are created automatically when PRs and POs are approved.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b">
                  <tr>
                    {['Source', 'Fund', 'GL Account', 'Amount', 'Currency', 'Status', 'Date', ''].map(h => (
                      <th key={h} className="text-left text-xs font-medium text-muted-foreground px-4 py-2.5">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map(e => {
                    const fund = funds.find(f => f.id === e.fund_id);
                    const account = accounts.find(a => a.id === e.gl_account_id);
                    const scfg = STATUS_CFG[e.status] ?? STATUS_CFG.open;
                    return (
                      <tr key={e.id} className="hover:bg-muted/30" data-testid={`row-enc-${e.id}`}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-sm">{SOURCE_LABEL[e.source_type] ?? e.source_type}</p>
                          <p className="text-xs text-muted-foreground font-mono">{e.source_id.slice(0, 8)}…</p>
                        </td>
                        <td className="px-4 py-3 text-xs">{fund ? `${fund.code}` : '—'}</td>
                        <td className="px-4 py-3 text-xs">{account ? `${account.code}` : '—'}</td>
                        <td className="px-4 py-3 font-mono text-sm font-semibold text-indigo-600">{formatNumber(e.amount)}</td>
                        <td className="px-4 py-3 text-xs">{e.currency}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={cn('text-[10px]', scfg.color)}>{scfg.label}</Badge>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{format(parseISO(e.created_at), 'dd MMM yyyy')}</td>
                        <td className="px-4 py-3">
                          {canEdit && e.status === 'open' && (
                            <div className="flex gap-1">
                              <Button size="sm" variant="outline" className="h-7 text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                                onClick={() => setActionDlg({ enc: e, action: 'liquidate' })} data-testid={`btn-liquidate-${e.id}`}>
                                Liquidate
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 text-xs text-slate-600 hover:bg-slate-50"
                                onClick={() => setActionDlg({ enc: e, action: 'cancel' })} data-testid={`btn-cancel-enc-${e.id}`}>
                                Cancel
                              </Button>
                            </div>
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

      {/* Action Dialog */}
      <Dialog open={!!actionDlg} onOpenChange={v => { if (!v) setActionDlg(null); }}>
        <DialogContent className="max-w-sm">
          {actionDlg && (
            <>
              <DialogHeader>
                <DialogTitle>{actionDlg.action === 'liquidate' ? 'Liquidate Encumbrance' : 'Cancel Encumbrance'}</DialogTitle>
                <DialogDescription>
                  {actionDlg.action === 'liquidate'
                    ? 'Mark this commitment as liquidated (converted to actual expense via invoice).'
                    : 'Cancel this encumbrance and release the reserved budget back to available.'}
                </DialogDescription>
              </DialogHeader>
              <div className="py-2 space-y-2">
                <div className="rounded-lg bg-muted/40 p-3 text-sm space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">Source:</span><span>{SOURCE_LABEL[actionDlg.enc.source_type] ?? actionDlg.enc.source_type}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Amount:</span><span className="font-bold">{formatNumber(actionDlg.enc.amount)} {actionDlg.enc.currency}</span></div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setActionDlg(null)}>Cancel</Button>
                <Button variant={actionDlg.action === 'cancel' ? 'destructive' : 'default'} disabled={actioning} onClick={doAction} data-testid="button-confirm-enc-action">
                  {actioning ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                  Confirm {actionDlg.action === 'liquidate' ? 'Liquidation' : 'Cancellation'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
