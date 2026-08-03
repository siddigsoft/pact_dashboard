/**
 * AccountingOpeningBalances.tsx
 * 
 * Opening Balances entry screen — lets Finance post the starting balances
 * for every account at the beginning of a fiscal year.
 *
 * Flow:
 *  1. Select fiscal year (only draft/open years allowed)
 *  2. Enter DR / CR amounts per account
 *  3. System validates debits = credits
 *  4. "Post Opening Balances" creates one journal entry (source_type='opening_balance')
 *     in acct_journal_entries + one acct_journal_line per account row
 *  5. Posted entries are locked (read-only); re-open requires reversal
 */

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, Trash2, CheckCircle2, AlertTriangle, Upload, Download, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { downloadCsv, formatNumber } from '@/lib/accountingFormat';
import { useAccountingCountry } from '@/hooks/use-accounting-country';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';

interface Account { id: string; code: string; name_en: string; name_ar: string; account_type: string }
interface FiscalYear { id: string; code: string; status: string; start_date: string; end_date: string }
interface FiscalPeriod { id: string; period_no: number; start_date: string; end_date: string; fiscal_year_id: string }
interface OBEntry { id: string; account_id: string; debit_amount: number; credit_amount: number; notes: string }
interface BalanceLine {
  key: string;
  account_id: string;
  debit: string;
  credit: string;
  notes: string;
}

function newLine(): BalanceLine {
  return { key: crypto.randomUUID(), account_id: '', debit: '', credit: '', notes: '' };
}

export default function AccountingOpeningBalances() {
  const { hasAnyRole, isAuthenticated } = useAuthorization();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant']);
  const { countryId } = useAccountingCountry();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [years, setYears] = useState<FiscalYear[]>([]);
  const [periods, setPeriods] = useState<FiscalPeriod[]>([]);
  const [posted, setPosted] = useState<OBEntry[]>([]);
  const [yearId, setYearId] = useState('');
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [lines, setLines] = useState<BalanceLine[]>([newLine()]);
  const [search, setSearch] = useState('');

  // bootstrap
  useEffect(() => {
    if (!isAuthenticated) return;
    (async () => {
      setLoading(true);
      const [ar, yr, pr] = await Promise.all([
        supabase.from('acct_accounts').select('id,code,name_en,name_ar,account_type').eq('is_postable', true).order('code'),
        supabase.from('acct_fiscal_years').select('id,code,status,start_date,end_date').order('code', { ascending: false }),
        supabase.from('acct_fiscal_periods').select('id,period_no,start_date,end_date,fiscal_year_id').order('period_no'),
      ]);
      setAccounts((ar.data ?? []) as Account[]);
      setYears((yr.data ?? []) as FiscalYear[]);
      setPeriods((pr.data ?? []) as FiscalPeriod[]);
      setLoading(false);
    })();
  }, [isAuthenticated]);

  // Load already-posted opening balances for selected year
  useEffect(() => {
    if (!yearId) { setPosted([]); return; }
    (async () => {
      const { data } = await supabase
        .from('acct_opening_balances')
        .select('id,account_id,debit_amount,credit_amount,notes')
        .eq('fiscal_year_id', yearId)
        .order('id');
      setPosted((data ?? []) as OBEntry[]);
    })();
  }, [yearId]);

  const accountMap = useMemo(() => {
    const m: Record<string, Account> = {};
    accounts.forEach(a => { m[a.id] = a; });
    return m;
  }, [accounts]);

  const filteredAccounts = useMemo(() => {
    if (!search) return accounts;
    const s = search.toLowerCase();
    return accounts.filter(a => a.code.toLowerCase().includes(s) || a.name_en.toLowerCase().includes(s));
  }, [accounts, search]);

  const totalDebit  = useMemo(() => lines.reduce((s, l) => s + (parseFloat(l.debit)  || 0), 0), [lines]);
  const totalCredit = useMemo(() => lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0), [lines]);
  const isBalanced  = Math.abs(totalDebit - totalCredit) < 0.01;
  const firstPeriod = periods.find(p => p.fiscal_year_id === yearId && p.period_no === 1);
  const selectedYear = years.find(y => y.id === yearId);
  const alreadyPosted = posted.length > 0;

  function setLine(key: string, field: keyof BalanceLine, value: string) {
    setLines(prev => prev.map(l => l.key === key ? { ...l, [field]: value } : l));
  }
  function removeLine(key: string) {
    setLines(prev => prev.length > 1 ? prev.filter(l => l.key !== key) : prev);
  }

  async function handlePost() {
    if (!yearId || !firstPeriod) { toast.error('Select a fiscal year with at least one period'); return; }
    if (!isBalanced) { toast.error('Debits must equal credits before posting'); return; }
    const validLines = lines.filter(l => l.account_id && (parseFloat(l.debit) > 0 || parseFloat(l.credit) > 0));
    if (validLines.length === 0) { toast.error('Add at least one line with an amount'); return; }

    setPosting(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const userId = sess?.session?.user?.id;

      // 1. Create journal entry header
      const { data: entry, error: entryErr } = await supabase
        .from('acct_journal_entries')
        .insert({
          period_id: firstPeriod.id,
          posting_date: firstPeriod.start_date,
          description_en: `Opening Balances — Fiscal Year ${selectedYear?.code}`,
          description_ar: `أرصدة افتتاحية — السنة المالية ${selectedYear?.code}`,
          source_type: 'opening_balance',
          source_id: yearId,
          status: 'posted',
          posted_at: new Date().toISOString(),
          posted_by: userId,
          created_by: userId,
          idempotency_key: `ob_${yearId}`,
        })
        .select('id')
        .single();

      if (entryErr) throw entryErr;

      // 2. Insert journal lines
      const jlines = validLines.map((l, i) => ({
        entry_id: entry.id,
        line_no: i + 1,
        account_id: l.account_id,
        debit_credit: parseFloat(l.debit) > 0 ? 'DR' : 'CR',
        functional_amount: parseFloat(l.debit) > 0 ? parseFloat(l.debit) : parseFloat(l.credit),
        original_amount:   parseFloat(l.debit) > 0 ? parseFloat(l.debit) : parseFloat(l.credit),
        original_currency: 'SDG',
        functional_currency: 'SDG',
        fx_rate: 1,
        description: l.notes || 'Opening balance',
      }));
      const { error: linesErr } = await supabase.from('acct_journal_lines').insert(jlines);
      if (linesErr) throw linesErr;

      // 3. Store in acct_opening_balances for quick display
      const obRows = validLines.map(l => ({
        fiscal_year_id: yearId,
        account_id: l.account_id,
        debit_amount:  parseFloat(l.debit)  || 0,
        credit_amount: parseFloat(l.credit) || 0,
        notes: l.notes,
        journal_entry_id: entry.id,
        posted_by: userId,
        posted_at: new Date().toISOString(),
      }));
      await supabase.from('acct_opening_balances').upsert(obRows, { onConflict: 'fiscal_year_id,account_id' });

      toast.success('Opening balances posted successfully');
      // Reload posted
      const { data: newPosted } = await supabase
        .from('acct_opening_balances')
        .select('id,account_id,debit_amount,credit_amount,notes')
        .eq('fiscal_year_id', yearId);
      setPosted((newPosted ?? []) as OBEntry[]);
      setLines([newLine()]);
    } catch (err: any) {
      toast.error(`Failed to post: ${err.message}`);
    } finally {
      setPosting(false);
    }
  }

  function handleImportCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      const rows = text.split('\n').slice(1).filter(r => r.trim());
      const imported: BalanceLine[] = rows.map(row => {
        const [code, , debit, credit, notes] = row.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        const acct = accounts.find(a => a.code === code);
        return { key: crypto.randomUUID(), account_id: acct?.id ?? '', debit: debit || '', credit: credit || '', notes: notes || '' };
      }).filter(l => l.account_id);
      if (imported.length) { setLines(imported); toast.success(`Imported ${imported.length} lines`); }
      else toast.error('No matching account codes found');
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function downloadTemplate() {
    downloadCsv('opening_balances_template.csv', [
      ['Account Code', 'Account Name', 'Debit', 'Credit', 'Notes'],
      ...accounts.slice(0, 5).map(a => [a.code, a.name_en, '', '', '']),
    ]);
  }

  if (!isAuthenticated || !allowed) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <AlertTriangle className="h-5 w-5 mr-2" />
        You don't have permission to manage opening balances.
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Opening Balances</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Post starting account balances at the beginning of a fiscal year. Debits must equal credits.
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
            <Download className="h-4 w-4 mr-1" /> CSV Template
          </Button>
          <label>
            <Button type="button" variant="outline" size="sm" asChild>
              <span><Upload className="h-4 w-4 mr-1" /> Import CSV</span>
            </Button>
            <input type="file" accept=".csv" className="hidden" onChange={handleImportCSV} />
          </label>
        </div>
      </div>

      {/* Year selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Fiscal Year</CardTitle>
          <CardDescription>Select the year you are entering opening balances for.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <Select value={yearId} onValueChange={setYearId}>
              <SelectTrigger className="w-72">
                <SelectValue placeholder="Select fiscal year…" />
              </SelectTrigger>
              <SelectContent>
                {years.map(y => (
                  <SelectItem key={y.id} value={y.id}>
                    {y.code}
                    <span className="ml-2 text-xs text-muted-foreground">{y.status}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>

      {/* Already-posted view */}
      {yearId && alreadyPosted && (
        <Card className="border-green-200 bg-green-50 dark:bg-green-950/20">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <CardTitle className="text-base text-green-800 dark:text-green-300">
                Opening Balances Posted ({posted.length} accounts)
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b">
                    <th className="text-left pb-2 pr-4">Account</th>
                    <th className="text-right pb-2 pr-4">Debit</th>
                    <th className="text-right pb-2 pr-4">Credit</th>
                    <th className="text-left pb-2">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {posted.map(p => {
                    const acct = accountMap[p.account_id];
                    return (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="py-1.5 pr-4 font-mono text-xs">{acct ? `${acct.code} — ${acct.name_en}` : p.account_id}</td>
                        <td className="py-1.5 pr-4 text-right">{p.debit_amount ? formatNumber(p.debit_amount) : '—'}</td>
                        <td className="py-1.5 pr-4 text-right">{p.credit_amount ? formatNumber(p.credit_amount) : '—'}</td>
                        <td className="py-1.5 text-muted-foreground text-xs">{p.notes}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="font-semibold border-t">
                    <td className="pt-2 pr-4">Total</td>
                    <td className="pt-2 pr-4 text-right">{formatNumber(posted.reduce((s, p) => s + p.debit_amount, 0))}</td>
                    <td className="pt-2 pr-4 text-right">{formatNumber(posted.reduce((s, p) => s + p.credit_amount, 0))}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              To amend posted opening balances, post a manual journal entry (reverse + re-enter).
            </p>
          </CardContent>
        </Card>
      )}

      {/* Entry grid */}
      {yearId && !alreadyPosted && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Balance Entry</CardTitle>
                <CardDescription>Enter debit OR credit for each account. Leave the other as 0.</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Search accounts…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-48 h-8 text-sm"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Totals bar */}
            <div className={`flex gap-6 text-sm px-3 py-2 rounded-md ${isBalanced ? 'bg-green-50 dark:bg-green-950/20' : 'bg-red-50 dark:bg-red-950/20'}`}>
              <span>Total Debits: <strong>{formatNumber(totalDebit)}</strong></span>
              <span>Total Credits: <strong>{formatNumber(totalCredit)}</strong></span>
              {!isBalanced && (
                <span className="text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Difference: {formatNumber(Math.abs(totalDebit - totalCredit))}
                </span>
              )}
              {isBalanced && totalDebit > 0 && (
                <span className="text-green-700 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Balanced
                </span>
              )}
            </div>

            {/* Lines */}
            <div className="space-y-2">
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 text-xs font-medium text-muted-foreground px-1">
                <span>Account</span><span>Debit</span><span>Credit</span><span>Notes</span><span />
              </div>
              {lines.map(line => (
                <div key={line.key} className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 items-center">
                  <Select value={line.account_id} onValueChange={v => setLine(line.key, 'account_id', v)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select account…" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredAccounts.map(a => (
                        <SelectItem key={a.id} value={a.id} className="text-xs">
                          <span className="font-mono">{a.code}</span> — {a.name_en}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number" min="0" step="0.01" placeholder="0.00"
                    value={line.debit}
                    onChange={e => { setLine(line.key, 'debit', e.target.value); if (e.target.value) setLine(line.key, 'credit', ''); }}
                    className="h-8 text-xs text-right"
                  />
                  <Input
                    type="number" min="0" step="0.01" placeholder="0.00"
                    value={line.credit}
                    onChange={e => { setLine(line.key, 'credit', e.target.value); if (e.target.value) setLine(line.key, 'debit', ''); }}
                    className="h-8 text-xs text-right"
                  />
                  <Input
                    placeholder="Notes…"
                    value={line.notes}
                    onChange={e => setLine(line.key, 'notes', e.target.value)}
                    className="h-8 text-xs"
                  />
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeLine(line.key)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>

            <Button type="button" variant="outline" size="sm" onClick={() => setLines(p => [...p, newLine()])}>
              <Plus className="h-4 w-4 mr-1" /> Add Line
            </Button>

            <Separator />

            {!firstPeriod && (
              <Alert variant="destructive">
                <AlertDescription>
                  The selected fiscal year has no periods. Create at least Period 1 in Fiscal Years before posting.
                </AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end">
              <Button
                onClick={handlePost}
                disabled={posting || !isBalanced || totalDebit === 0 || !firstPeriod}
                className="min-w-40"
              >
                {posting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Post Opening Balances
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
