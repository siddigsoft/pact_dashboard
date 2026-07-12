import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Download, RefreshCw, TrendingUp, TrendingDown, ArrowLeftRight } from 'lucide-react';
import { exportToExcel } from '@/utils/report-export';
import { formatNumber } from '@/lib/accountingFormat';

interface ExchangeRate { from_currency: string; to_currency: string; rate: number; effective_date: string }
interface FxLine { id: string; account_id: string; account_code: string; account_name: string;
  original_amount: number; original_currency: string; functional_amount: number;
  fx_rate: number; posting_date: string; entry_no: number; description: string | null }

interface RevalRow {
  account_code: string; account_name: string; currency: string;
  bookRate: number; currentRate: number; bookValue: number; currentValue: number;
  gainLoss: number; lines: number;
}

export default function AccountingUnrealizedGL() {
  const { hasAnyRole } = useAuthorization();
  const allowed = hasAnyRole(['super_admin','admin','finance','financialAdmin','accountant','auditor']);

  const [rates, setRates]       = useState<ExchangeRate[]>([]);
  const [fxLines, setFxLines]   = useState<FxLine[]>([]);
  const [loading, setLoading]   = useState(true);
  const [asOf, setAsOf]         = useState(new Date().toISOString().slice(0,10));
  const [baseCurrency, setBase] = useState('USD');

  const load = async () => {
    setLoading(true);
    const [rateRes, lineRes] = await Promise.all([
      supabase.from('acct_exchange_rates' as any)
        .select('from_currency,to_currency,rate,effective_date')
        .lte('effective_date', asOf)
        .order('effective_date', { ascending: false })
        .limit(500),
      supabase.from('acct_journal_lines' as any)
        .select(`
          id, account_id, functional_amount, original_amount, original_currency, fx_rate, description,
          acct_accounts(code, name_en, account_type),
          acct_journal_entries!inner(entry_no, posting_date, status)
        `)
        .eq('acct_journal_entries.status' as any, 'posted')
        .neq('original_currency', baseCurrency)
        .lte('acct_journal_entries.posting_date' as any, asOf)
        .limit(2000),
    ]);
    setRates((rateRes.data ?? []) as ExchangeRate[]);
    setFxLines(((lineRes.data ?? []) as any[]).map((l: any) => ({
      id: l.id, account_id: l.account_id,
      account_code: l.acct_accounts?.code ?? '—',
      account_name: l.acct_accounts?.name_en ?? '—',
      original_amount: Number(l.original_amount ?? 0),
      original_currency: l.original_currency ?? '',
      functional_amount: Number(l.functional_amount ?? 0),
      fx_rate: Number(l.fx_rate ?? 1),
      posting_date: l.acct_journal_entries?.posting_date ?? '',
      entry_no: l.acct_journal_entries?.entry_no ?? 0,
      description: l.description,
    })));
    setLoading(false);
  };
  useEffect(() => { if (allowed) void load(); }, [allowed, asOf, baseCurrency]);

  const getRate = (from: string, to: string, beforeDate: string): number | null => {
    const matches = rates.filter(r => r.from_currency === from && r.to_currency === to && r.effective_date <= asOf);
    if (!matches.length) return null;
    return matches[0].rate;
  };

  const revalRows = useMemo((): RevalRow[] => {
    const map = new Map<string, { lines: FxLine[]; accountCode: string; accountName: string; currency: string }>();
    for (const l of fxLines) {
      const key = `${l.account_id}::${l.original_currency}`;
      if (!map.has(key)) map.set(key, { lines: [], accountCode: l.account_code, accountName: l.account_name, currency: l.original_currency });
      map.get(key)!.lines.push(l);
    }
    const rows: RevalRow[] = [];
    for (const [, grp] of map) {
      const currentRate = getRate(grp.currency, baseCurrency, asOf);
      if (!currentRate) continue;
      const bookValue    = grp.lines.reduce((s,l) => s + l.functional_amount, 0);
      const origTotal    = grp.lines.reduce((s,l) => s + l.original_amount,   0);
      const currentValue = origTotal * currentRate;
      const gainLoss     = currentValue - bookValue;
      const avgBookRate  = origTotal !== 0 ? bookValue / origTotal : 0;
      if (Math.abs(gainLoss) < 0.01) continue;
      rows.push({
        account_code: grp.accountCode, account_name: grp.accountName,
        currency: grp.currency, bookRate: avgBookRate, currentRate,
        bookValue, currentValue, gainLoss, lines: grp.lines.length,
      });
    }
    return rows.sort((a,b) => Math.abs(b.gainLoss) - Math.abs(a.gainLoss));
  }, [fxLines, rates, asOf, baseCurrency]);

  const totalGain = revalRows.filter(r=>r.gainLoss>0).reduce((s,r)=>s+r.gainLoss,0);
  const totalLoss = revalRows.filter(r=>r.gainLoss<0).reduce((s,r)=>s+r.gainLoss,0);
  const netGL     = totalGain + totalLoss;

  const exportData = () => exportToExcel(
    revalRows.map(r => ({ Account:r.account_code, Name:r.account_name, Currency:r.currency,
      'Book Rate':r.bookRate.toFixed(4), 'Current Rate':r.currentRate.toFixed(4),
      'Book Value':r.bookValue.toFixed(2), 'Current Value':r.currentValue.toFixed(2),
      'Unrealized G/L':r.gainLoss.toFixed(2),
    })), 'Unrealized G/L', 'unrealized-gl.xlsx'
  );

  if (!allowed) return null;

  return (
    <div className="space-y-4 p-1">
      <div className="flex flex-wrap items-center gap-2">
        <ArrowLeftRight className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Unrealized Currency Gains/Losses</h2>
        <div className="flex-1" />
        <label className="text-sm text-muted-foreground flex items-center gap-1">
          As of <Input type="date" value={asOf} onChange={e=>setAsOf(e.target.value)} className="w-36 h-8 text-sm ml-1" />
        </label>
        <select value={baseCurrency} onChange={e=>setBase(e.target.value)} className="h-8 text-sm border rounded px-2 bg-background">
          {['USD','SDG','EUR','GBP','SAR','AED','EGP'].map(c=><option key={c} value={c}>{c}</option>)}
        </select>
        <Button size="sm" variant="outline" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
        <Button size="sm" variant="outline" onClick={exportData}><Download className="h-4 w-4 mr-1" />Export</Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label:'Unrealized Gains', val:totalGain, icon:TrendingUp,   cls:'text-emerald-700 bg-emerald-50 border-emerald-200' },
          { label:'Unrealized Losses',val:Math.abs(totalLoss), icon:TrendingDown, cls:'text-red-700 bg-red-50 border-red-200' },
          { label:'Net G/L',          val:netGL, icon:ArrowLeftRight, cls:`${netGL>=0?'text-emerald-700 bg-emerald-50 border-emerald-200':'text-red-700 bg-red-50 border-red-200'}` },
        ].map(k => (
          <Card key={k.label} className={`border ${k.cls}`}><CardContent className="p-3 flex items-center gap-3">
            <k.icon className="h-8 w-8 opacity-30" />
            <div>
              <p className="text-xs opacity-80">{k.label}</p>
              <p className="text-lg font-bold mt-0.5">{formatNumber(Math.abs(k.val))}</p>
            </div>
          </CardContent></Card>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Compares book value (at historical FX rate when posted) with current value (at latest rate as of {asOf}). Requires exchange rates to be maintained in Multi-Currency.
      </p>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : revalRows.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border border-dashed rounded-lg">
          <ArrowLeftRight className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p>No unrealized gains/losses found</p>
          <p className="text-sm mt-1">Ensure exchange rates are configured and there are multi-currency journal lines.</p>
        </div>
      ) : (
        <Card><CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead>Account</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Curr.</TableHead>
                <TableHead className="text-right">Book Rate</TableHead>
                <TableHead className="text-right">Current Rate</TableHead>
                <TableHead className="text-right">Book Value ({baseCurrency})</TableHead>
                <TableHead className="text-right">Current Value ({baseCurrency})</TableHead>
                <TableHead className="text-right font-bold">Unrealized G/L</TableHead>
                <TableHead className="text-center">Lines</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {revalRows.map((r,i) => (
                <TableRow key={`${r.account_code}-${r.currency}`} className={i%2!==0?'bg-muted/5':''}>
                  <TableCell className="font-mono">{r.account_code}</TableCell>
                  <TableCell>{r.account_name}</TableCell>
                  <TableCell><Badge variant="outline">{r.currency}</Badge></TableCell>
                  <TableCell className="text-right tabular-nums">{r.bookRate.toFixed(4)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.currentRate.toFixed(4)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(r.bookValue)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(r.currentValue)}</TableCell>
                  <TableCell className={`text-right tabular-nums font-bold ${r.gainLoss>=0?'text-emerald-700':'text-red-700'}`}>
                    {r.gainLoss>=0?'+':''}{formatNumber(r.gainLoss)}
                  </TableCell>
                  <TableCell className="text-center text-muted-foreground">{r.lines}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/40 font-bold border-t-2">
                <TableCell colSpan={7}>NET UNREALIZED GAIN / LOSS</TableCell>
                <TableCell className={`text-right tabular-nums ${netGL>=0?'text-emerald-700':'text-red-700'}`}>
                  {netGL>=0?'+':''}{formatNumber(netGL)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </CardContent></Card>
      )}
    </div>
  );
}
