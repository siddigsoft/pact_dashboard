import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useAppContext } from '@/context/AppContext';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, RefreshCw, TrendingUp, TrendingDown, Minus, BarChart2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface KPICard { title: string; value: string; subtitle: string; trend?: 'up' | 'down' | 'neutral'; description: string; color: string; }

const fmt = (n: number, d = 2) => new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n ?? 0);
const fmtM = (n: number) => `$${fmt(n / 1000000, 2)}M`;

export default function AccountingKPIRatios() {
  const { hasAnyRole, isAuthenticated } = useAuthorization();
  const { authReady } = useAppContext();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);

  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(String(currentYear));
  const [loading, setLoading] = useState(false);
  const [kpis, setKpis] = useState<KPICard[]>([]);
  const [balances, setBalances] = useState({ assets: 0, liabilities: 0, equity: 0, currentAssets: 0, currentLiabilities: 0, cash: 0, revenue: 0, expenses: 0, netIncome: 0, operatingExpenses: 0 });

  const run = async () => {
    setLoading(true);
    const { data } = await supabase.from('acct_journal_items' as any)
      .select('debit, credit, acct_accounts!inner(account_type, code), acct_journal_entries!inner(entry_date, status)')
      .eq('acct_journal_entries.status', 'posted')
      .gte('acct_journal_entries.entry_date', `${year}-01-01`)
      .lte('acct_journal_entries.entry_date', `${year}-12-31`);

    const b = { assets: 0, liabilities: 0, equity: 0, currentAssets: 0, currentLiabilities: 0, cash: 0, revenue: 0, expenses: 0, netIncome: 0, operatingExpenses: 0 };
    for (const item of (data ?? []) as any[]) {
      const type = item.acct_accounts?.account_type ?? '';
      const code = item.acct_accounts?.code ?? '';
      const net = (item.debit ?? 0) - (item.credit ?? 0);
      if (type === 'asset') { b.assets += net; if (code.startsWith('1')) b.currentAssets += net; if (code.startsWith('11')) b.cash += net; }
      if (type === 'liability') { b.liabilities += Math.abs(net); if (code.startsWith('2')) b.currentLiabilities += Math.abs(net); }
      if (type === 'equity') b.equity += Math.abs(net);
      if (type === 'income') b.revenue += ((item.credit ?? 0) - (item.debit ?? 0));
      if (type === 'expense') { b.expenses += net; if (!code.startsWith('6')) b.operatingExpenses += net; }
    }
    b.netIncome = b.revenue - b.expenses;
    setBalances(b);

    const liquidity = b.currentLiabilities > 0 ? b.currentAssets / b.currentLiabilities : 0;
    const quick = b.currentLiabilities > 0 ? (b.currentAssets - b.cash) / b.currentLiabilities : 0;
    const cashRatio = b.currentLiabilities > 0 ? b.cash / b.currentLiabilities : 0;
    const debtToEquity = b.equity > 0 ? b.liabilities / b.equity : 0;
    const margin = b.revenue > 0 ? (b.netIncome / b.revenue) * 100 : 0;
    const burnRate = b.expenses / 12;
    const runway = burnRate > 0 ? b.cash / burnRate : 0;
    const opEfficiency = b.revenue > 0 ? (b.operatingExpenses / b.revenue) * 100 : 0;

    setKpis([
      { title: 'Current Ratio', value: fmt(liquidity), subtitle: 'Current Assets / Current Liabilities', trend: liquidity >= 2 ? 'up' : liquidity >= 1 ? 'neutral' : 'down', description: '≥2.0 = healthy, <1.0 = concern', color: liquidity >= 2 ? 'border-emerald-200 bg-emerald-50' : liquidity >= 1 ? 'border-amber-200 bg-amber-50' : 'border-rose-200 bg-rose-50' },
      { title: 'Quick Ratio', value: fmt(quick), subtitle: '(Current Assets - Cash) / Current Liab', trend: quick >= 1 ? 'up' : 'down', description: '≥1.0 = can meet obligations', color: quick >= 1 ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50' },
      { title: 'Cash Ratio', value: fmt(cashRatio), subtitle: 'Cash / Current Liabilities', trend: cashRatio >= 0.5 ? 'up' : 'neutral', description: 'Pure cash coverage of short-term debt', color: 'border-blue-200 bg-blue-50' },
      { title: 'Debt to Equity', value: fmt(debtToEquity), subtitle: 'Total Liabilities / Total Equity', trend: debtToEquity <= 1 ? 'up' : debtToEquity <= 2 ? 'neutral' : 'down', description: '<1 = low leverage', color: debtToEquity <= 1 ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50' },
      { title: 'Net Margin', value: `${fmt(margin)}%`, subtitle: 'Net Income / Revenue', trend: margin >= 10 ? 'up' : margin >= 0 ? 'neutral' : 'down', description: 'Revenue remaining after all expenses', color: margin >= 0 ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50' },
      { title: 'Operating Cost Ratio', value: `${fmt(opEfficiency)}%`, subtitle: 'Operating Costs / Revenue', trend: opEfficiency <= 70 ? 'up' : opEfficiency <= 85 ? 'neutral' : 'down', description: 'Lower = more efficient operations', color: opEfficiency <= 70 ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50' },
      { title: 'Monthly Burn Rate', value: fmtM(burnRate), subtitle: `${year} expenses ÷ 12`, trend: 'neutral', description: 'Average monthly expenditure', color: 'border-purple-200 bg-purple-50' },
      { title: 'Cash Runway', value: `${fmt(runway, 1)} months`, subtitle: 'Cash Balance ÷ Burn Rate', trend: runway >= 6 ? 'up' : runway >= 3 ? 'neutral' : 'down', description: 'Months of operations funded by cash', color: runway >= 6 ? 'border-emerald-200 bg-emerald-50' : runway >= 3 ? 'border-amber-200 bg-amber-50' : 'border-rose-200 bg-rose-50' },
    ]);
    setLoading(false);
  };

  useEffect(() => { if (allowed) void run(); }, [allowed, year]);

  if (!authReady || !isAuthenticated) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!allowed) return <Navigate to="/" replace />;

  const TrendIcon = ({ t }: { t?: string }) => t === 'up' ? <TrendingUp className="w-4 h-4 text-emerald-600" /> : t === 'down' ? <TrendingDown className="w-4 h-4 text-rose-600" /> : <Minus className="w-4 h-4 text-muted-foreground" />;

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><BarChart2 className="w-6 h-6 text-indigo-600" /> Financial KPI Ratios</h1>
          <p className="text-sm text-muted-foreground mt-1">Liquidity, leverage, margin, efficiency and cash runway ratios</p>
        </div>
        <div className="flex gap-2">
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>{[currentYear, currentYear - 1, currentYear - 2].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => void run()} disabled={loading}><RefreshCw className={cn('w-4 h-4 mr-1', loading && 'animate-spin')} /> Refresh</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Assets', value: fmtM(balances.assets), color: 'text-blue-700' },
          { label: 'Total Liabilities', value: fmtM(balances.liabilities), color: 'text-rose-700' },
          { label: 'Revenue', value: fmtM(balances.revenue), color: 'text-emerald-700' },
          { label: 'Net Income', value: fmtM(balances.netIncome), color: balances.netIncome >= 0 ? 'text-emerald-700' : 'text-rose-700' },
        ].map(k => (
          <Card key={k.label}><CardContent className="p-4"><div className="text-xs text-muted-foreground">{k.label}</div><div className={cn('text-xl font-bold', k.color)}>{k.value}</div></CardContent></Card>
        ))}
      </div>

      {loading ? <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Calculating ratios…</div>
      : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {kpis.map(k => (
            <Card key={k.title} className={cn('border', k.color)}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{k.title}</div>
                    <div className="text-2xl font-bold mt-1">{k.value}</div>
                    <div className="text-xs text-muted-foreground mt-1">{k.subtitle}</div>
                  </div>
                  <TrendIcon t={k.trend} />
                </div>
                <div className="mt-3 text-xs text-muted-foreground border-t pt-2">{k.description}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="text-xs text-muted-foreground p-3 bg-muted/30 rounded border">
        <strong>Note:</strong> Ratios are computed from posted journal entries only. Account type classification (asset, liability, equity, income, expense) and proper account code prefixes are required for accurate results.
      </div>
    </div>
  );
}
