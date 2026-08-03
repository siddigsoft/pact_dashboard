/**
 * AccountingBankStatementImport.tsx
 *
 * Bank Statement CSV Import — completes the Bank Reconciliation workflow.
 * Lets Finance upload a bank statement CSV, preview the lines, match them
 * to journal lines, and mark the reconciliation as complete.
 *
 * Expected CSV columns (flexible header detection):
 *   Date, Description, Debit, Credit, Reference  (any order, case-insensitive)
 */

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Upload, CheckCircle2, AlertTriangle, Download, RefreshCw, Link2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { formatNumber, downloadCsv } from '@/lib/accountingFormat';

interface Account { id: string; code: string; name_en: string }
interface ParsedLine { date: string; description: string; debit: number; credit: number; reference: string; status: 'unmatched' | 'matched' }
interface SavedStatement { id: string; account_id: string; statement_date: string; opening_balance: number; closing_balance: number; imported_at: string }
interface SavedLine { id: string; statement_id: string; transaction_date: string; description: string; debit: number; credit: number; reference: string | null; status: string }

function parseCSV(text: string): ParsedLine[] {
  const rows = text.trim().split('\n');
  if (rows.length < 2) return [];
  const headers = rows[0].split(',').map(h => h.trim().toLowerCase().replace(/^"|"$/g, ''));
  const idx = (names: string[]) => names.map(n => headers.indexOf(n)).find(i => i >= 0) ?? -1;
  const dateIdx   = idx(['date', 'transaction date', 'value date']);
  const descIdx   = idx(['description', 'narration', 'particulars', 'details']);
  const debitIdx  = idx(['debit', 'dr', 'withdrawal', 'debit amount']);
  const creditIdx = idx(['credit', 'cr', 'deposit', 'credit amount']);
  const refIdx    = idx(['reference', 'ref', 'cheque no', 'transaction id']);

  return rows.slice(1).map(row => {
    const cols = row.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    const rawDate = dateIdx >= 0 ? cols[dateIdx] : '';
    let parsedDate = '';
    if (rawDate) {
      const d = new Date(rawDate);
      parsedDate = isNaN(d.getTime()) ? rawDate : d.toISOString().slice(0, 10);
    }
    return {
      date: parsedDate,
      description: descIdx >= 0 ? cols[descIdx] : '',
      debit:  debitIdx  >= 0 ? parseFloat(cols[debitIdx]?.replace(/[^0-9.]/g, '')) || 0 : 0,
      credit: creditIdx >= 0 ? parseFloat(cols[creditIdx]?.replace(/[^0-9.]/g, '')) || 0 : 0,
      reference: refIdx >= 0 ? cols[refIdx] : '',
      status: 'unmatched' as const,
    };
  }).filter(l => l.date && (l.debit > 0 || l.credit > 0));
}

export default function AccountingBankStatementImport() {
  const { hasAnyRole, isAuthenticated } = useAuthorization();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant']);
  const fileRef = useRef<HTMLInputElement>(null);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [statements, setStatements] = useState<SavedStatement[]>([]);
  const [selectedStmt, setSelectedStmt] = useState<SavedStatement | null>(null);
  const [stmtLines, setStmtLines] = useState<SavedLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Import form
  const [accountId, setAccountId] = useState('');
  const [openingBal, setOpeningBal] = useState('');
  const [closingBal, setClosingBal] = useState('');
  const [stmtDate, setStmtDate] = useState('');
  const [parsed, setParsed] = useState<ParsedLine[]>([]);
  const [fileName, setFileName] = useState('');

  async function load() {
    setLoading(true);
    const [aRes, sRes] = await Promise.all([
      supabase.from('acct_accounts').select('id,code,name_en').ilike('account_type', '%asset%').order('code'),
      supabase.from('bank_statements').select('id,account_id,statement_date,opening_balance,closing_balance,imported_at').order('imported_at', { ascending: false }).limit(50),
    ]);
    setAccounts((aRes.data ?? []) as Account[]);
    setStatements((sRes.data ?? []) as SavedStatement[]);
    setLoading(false);
  }

  async function loadLines(stmtId: string) {
    const { data } = await supabase.from('bank_statement_lines').select('*').eq('statement_id', stmtId).order('transaction_date');
    setStmtLines((data ?? []) as SavedLine[]);
  }

  useEffect(() => { if (isAuthenticated && allowed) load(); }, [isAuthenticated]);
  useEffect(() => { if (selectedStmt) loadLines(selectedStmt.id); else setStmtLines([]); }, [selectedStmt]);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = ev => {
      const lines = parseCSV(ev.target?.result as string);
      if (!lines.length) { toast.error('No valid lines found. Check the CSV format.'); return; }
      setParsed(lines);
      // Auto-detect statement date from last transaction
      const dates = lines.map(l => l.date).filter(Boolean).sort();
      if (dates.length) setStmtDate(dates[dates.length - 1]);
      toast.success(`Parsed ${lines.length} transactions`);
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  async function importStatement() {
    if (!accountId || !stmtDate || !parsed.length) { toast.error('Account, date, and file are required'); return; }
    setSaving(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const { data: stmt, error: stmtErr } = await supabase
        .from('bank_statements')
        .insert({
          account_id: accountId,
          statement_date: stmtDate,
          opening_balance: parseFloat(openingBal) || 0,
          closing_balance: parseFloat(closingBal) || 0,
          currency: 'SDG',
          imported_at: new Date().toISOString(),
          imported_by: sess?.session?.user?.id,
        })
        .select('id')
        .single();
      if (stmtErr) throw stmtErr;

      const lineRows = parsed.map(l => ({
        statement_id: stmt.id,
        transaction_date: l.date,
        description: l.description,
        debit: l.debit,
        credit: l.credit,
        reference: l.reference || null,
        status: 'unmatched',
      }));
      const { error: lErr } = await supabase.from('bank_statement_lines').insert(lineRows);
      if (lErr) throw lErr;

      toast.success(`Imported ${parsed.length} lines successfully`);
      setParsed([]); setFileName(''); setOpeningBal(''); setClosingBal(''); setStmtDate('');
      await load();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  }

  async function markMatched(lineId: string) {
    await supabase.from('bank_statement_lines').update({ status: 'matched' }).eq('id', lineId);
    setStmtLines(prev => prev.map(l => l.id === lineId ? { ...l, status: 'matched' } : l));
  }

  async function markCleared(stmtId: string) {
    await supabase.from('bank_statements').update({ status: 'cleared' } as any).eq('id', stmtId);
    toast.success('Statement marked as cleared');
    await load();
  }

  const unmatchedCount = stmtLines.filter(l => l.status === 'unmatched').length;

  if (!isAuthenticated || !allowed) {
    return <div className="flex items-center justify-center py-24 text-muted-foreground"><AlertTriangle className="h-5 w-5 mr-2" />Access restricted.</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Bank Statement Import</h2>
          <p className="text-muted-foreground text-sm mt-1">Upload bank statement CSV files and reconcile against journal entries.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Import form */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Import New Statement</CardTitle>
            <CardDescription>Supported format: CSV with Date, Description, Debit, Credit, Reference columns.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-sm font-medium">Bank Account</label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger><SelectValue placeholder="Select account…" /></SelectTrigger>
                <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.code} — {a.name_en}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="text-sm font-medium">Statement Date</label><Input type="date" value={stmtDate} onChange={e => setStmtDate(e.target.value)} /></div>
              <div><label className="text-sm font-medium">Opening Balance</label><Input type="number" placeholder="0.00" value={openingBal} onChange={e => setOpeningBal(e.target.value)} /></div>
              <div><label className="text-sm font-medium">Closing Balance</label><Input type="number" placeholder="0.00" value={closingBal} onChange={e => setClosingBal(e.target.value)} /></div>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">CSV File</label>
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4 mr-1" /> {fileName || 'Choose CSV…'}
              </Button>
              <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFile} />
            </div>
            {parsed.length > 0 && (
              <div className="bg-blue-50 dark:bg-blue-950/20 rounded p-3 text-sm">
                <p className="font-medium text-blue-700 dark:text-blue-300">{parsed.length} transactions parsed</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Total debits: {formatNumber(parsed.reduce((s,l)=>s+l.debit,0))} | 
                  Total credits: {formatNumber(parsed.reduce((s,l)=>s+l.credit,0))}
                </p>
                <div className="mt-2 max-h-32 overflow-y-auto space-y-1">
                  {parsed.slice(0,5).map((l,i) => (
                    <div key={i} className="text-xs flex justify-between">
                      <span>{l.date} {l.description.slice(0,40)}</span>
                      <span className="font-mono">{l.debit > 0 ? `-${formatNumber(l.debit)}` : `+${formatNumber(l.credit)}`}</span>
                    </div>
                  ))}
                  {parsed.length > 5 && <p className="text-xs text-muted-foreground">…and {parsed.length-5} more</p>}
                </div>
              </div>
            )}
            <Button className="w-full" onClick={importStatement} disabled={saving || !parsed.length || !accountId}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
              Import {parsed.length > 0 ? `${parsed.length} Lines` : 'Statement'}
            </Button>
          </CardContent>
        </Card>

        {/* Saved statements */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Imported Statements</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : statements.length === 0 ? (
              <p className="text-sm text-muted-foreground">No statements imported yet.</p>
            ) : (
              <div className="space-y-2">
                {statements.map(s => {
                  const acct = accounts.find(a => a.id === s.account_id);
                  return (
                    <div key={s.id} className={`flex items-center justify-between p-3 rounded border cursor-pointer hover:border-primary transition-colors ${selectedStmt?.id === s.id ? 'border-primary ring-1 ring-primary' : ''}`} onClick={() => setSelectedStmt(s)}>
                      <div>
                        <p className="font-medium text-sm">{acct?.name_en ?? acct?.code ?? 'Unknown Account'}</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(s.statement_date), 'dd MMM yyyy')} • {format(new Date(s.imported_at), 'dd MMM HH:mm')}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-mono">{formatNumber(s.closing_balance)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Reconciliation view */}
      {selectedStmt && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Reconcile Statement</CardTitle>
                <CardDescription>{stmtLines.length} lines • {unmatchedCount} unmatched remaining</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => downloadCsv('statement_lines.csv', [
                  ['Date','Description','Debit','Credit','Reference','Status'],
                  ...stmtLines.map(l => [l.transaction_date, l.description, l.debit, l.credit, l.reference??'', l.status]),
                ])}><Download className="h-4 w-4 mr-1" /> Export</Button>
                {unmatchedCount === 0 && (
                  <Button size="sm" onClick={() => markCleared(selectedStmt.id)}>
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Mark Cleared
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-xs">
                    <th className="text-left pb-2 pr-3">Date</th>
                    <th className="text-left pb-2 pr-3">Description</th>
                    <th className="text-left pb-2 pr-3">Reference</th>
                    <th className="text-right pb-2 pr-3">Debit</th>
                    <th className="text-right pb-2 pr-3">Credit</th>
                    <th className="text-left pb-2 pr-3">Status</th>
                    <th className="text-left pb-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {stmtLines.map(l => (
                    <tr key={l.id} className={`border-b last:border-0 ${l.status === 'matched' ? 'opacity-60' : ''}`}>
                      <td className="py-1.5 pr-3 text-xs">{l.transaction_date}</td>
                      <td className="py-1.5 pr-3 text-xs max-w-[200px] truncate">{l.description}</td>
                      <td className="py-1.5 pr-3 text-xs font-mono">{l.reference ?? '—'}</td>
                      <td className="py-1.5 pr-3 text-right font-mono text-xs">{l.debit > 0 ? formatNumber(l.debit) : '—'}</td>
                      <td className="py-1.5 pr-3 text-right font-mono text-xs">{l.credit > 0 ? formatNumber(l.credit) : '—'}</td>
                      <td className="py-1.5 pr-3">
                        <Badge variant="outline" className={`text-xs ${l.status === 'matched' ? 'text-green-600 border-green-300' : 'text-yellow-600 border-yellow-300'}`}>{l.status}</Badge>
                      </td>
                      <td className="py-1.5">
                        {l.status === 'unmatched' && (
                          <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => markMatched(l.id)}>
                            <Link2 className="h-3.5 w-3.5 mr-1" /> Match
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
