import { useEffect, useMemo, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useAccountingCountry } from '@/hooks/use-accounting-country';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Loader2, Landmark, Plus, Download, RefreshCw, Link2, CheckCircle2, XCircle, Search, Upload, Pencil, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { formatNumber, downloadCsv } from '@/lib/accountingFormat';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';

interface BankAccount {
  id: string; account_name: string; bank_name: string; account_number: string | null;
  currency: string; country_id: string | null; gl_account_id: string | null;
  is_active: boolean; notes: string | null; created_at: string;
}
interface StatementLine {
  id: string; bank_account_id: string; statement_date: string; description: string | null;
  reference: string | null; amount: number; running_balance: number | null;
  currency: string; is_matched: boolean; is_excluded: boolean;
  matched_journal_entry_id: string | null; matched_at: string | null; match_note: string | null;
}
interface JournalEntry {
  id: string; entry_no: number; posting_date: string; description_en: string;
  description_ar: string | null; status: string; source_type: string;
}
interface GLAccount { id: string; code: string; name_en: string }
interface Country { id: string; code: string; name_en: string; flag_emoji: string | null; currency_code: string }

const BLANK_BANK = { account_name: '', bank_name: '', account_number: '', currency: 'USD', country_id: '', gl_account_id: '', notes: '' };
const BLANK_LINE = { statement_date: '', description: '', reference: '', amount: '', running_balance: '', currency: 'USD' };

export default function AccountingBankRecon() {
  const { hasAnyRole, loading: authLoading } = useAuthorization();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);
  const canEdit = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant']);
  const { countryId: defaultCountryId, loading: acctLoading } = useAccountingCountry();
  const { toast } = useToast();

  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [selectedBankId, setSelectedBankId] = useState<string>('');
  const [statementLines, setStatementLines] = useState<StatementLine[]>([]);
  const [unmatchedJEs, setUnmatchedJEs] = useState<JournalEntry[]>([]);
  const [glAccounts, setGlAccounts] = useState<GLAccount[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(false);
  const [bootstrap, setBootstrap] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Bank account dialog
  const [bankDialog, setBankDialog] = useState(false);
  const [editingBank, setEditingBank] = useState<BankAccount | null>(null);
  const [bankForm, setBankForm] = useState(BLANK_BANK);
  const [savingBank, setSavingBank] = useState(false);

  // Statement line dialog
  const [lineDialog, setLineDialog] = useState(false);
  const [lineForm, setLineForm] = useState(BLANK_LINE);
  const [savingLine, setSavingLine] = useState(false);

  // Match dialog
  const [matchDialog, setMatchDialog] = useState(false);
  const [matchingLine, setMatchingLine] = useState<StatementLine | null>(null);
  const [jeSearch, setJeSearch] = useState('');
  const [matchNote, setMatchNote] = useState('');
  const [matching, setMatching] = useState(false);

  // CSV import
  const [importDialog, setImportDialog] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [importing, setImporting] = useState(false);

  // Filter
  const [filterMatch, setFilterMatch] = useState<'all' | 'matched' | 'unmatched'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    (async () => {
      const [baRes, glRes, cRes] = await Promise.all([
        supabase.from('acct_bank_accounts').select('*').order('account_name'),
        supabase.from('acct_accounts').select('id, code, name_en').eq('is_active', true).eq('is_postable', true).order('code'),
        supabase.from('countries').select('id, code, name_en, flag_emoji, currency_code').eq('is_active', true).order('name_en'),
      ]);
      setBankAccounts((baRes.data ?? []) as BankAccount[]);
      setGlAccounts((glRes.data ?? []) as GLAccount[]);
      setCountries((cRes.data ?? []) as Country[]);
      if ((baRes.data ?? []).length > 0) setSelectedBankId((baRes.data![0] as BankAccount).id);
      setBootstrap(false);
    })();
  }, []);

  const loadStatements = useCallback(async () => {
    if (!selectedBankId) return;
    setLoading(true);
    setError(null);
    const [slRes, jeRes] = await Promise.all([
      supabase.from('acct_bank_statement_lines')
        .select('*').eq('bank_account_id', selectedBankId).order('statement_date').order('created_at'),
      supabase.from('acct_journal_entries')
        .select('id, entry_no, posting_date, description_en, description_ar, status, source_type')
        .eq('status', 'posted').order('posting_date', { ascending: false }).limit(200),
    ]);
    if (slRes.error) setError(slRes.error.message);
    setStatementLines((slRes.data ?? []) as StatementLine[]);
    setUnmatchedJEs((jeRes.data ?? []) as JournalEntry[]);
    setLoading(false);
  }, [selectedBankId]);

  useEffect(() => { if (!bootstrap && selectedBankId) void loadStatements(); }, [selectedBankId, bootstrap]);

  const selectedBank = useMemo(() => bankAccounts.find(b => b.id === selectedBankId), [bankAccounts, selectedBankId]);

  const filtered = useMemo(() => {
    return statementLines.filter(l => {
      if (filterMatch === 'matched' && !l.is_matched) return false;
      if (filterMatch === 'unmatched' && (l.is_matched || l.is_excluded)) return false;
      if (dateFrom && l.statement_date < dateFrom) return false;
      if (dateTo && l.statement_date > dateTo) return false;
      return true;
    });
  }, [statementLines, filterMatch, dateFrom, dateTo]);

  const stats = useMemo(() => {
    const total = statementLines.length;
    const matched = statementLines.filter(l => l.is_matched).length;
    const excluded = statementLines.filter(l => l.is_excluded).length;
    const unmatched = total - matched - excluded;
    const totalIn = statementLines.filter(l => l.amount > 0).reduce((s, l) => s + l.amount, 0);
    const totalOut = statementLines.filter(l => l.amount < 0).reduce((s, l) => s + Math.abs(l.amount), 0);
    const bankBalance = statementLines.length > 0 ? (statementLines[statementLines.length - 1].running_balance ?? 0) : 0;
    return { total, matched, excluded, unmatched, totalIn, totalOut, bankBalance };
  }, [statementLines]);

  const filteredJEs = useMemo(() => {
    if (!jeSearch) return unmatchedJEs;
    const q = jeSearch.toLowerCase();
    return unmatchedJEs.filter(e =>
      String(e.entry_no).includes(q) || e.description_en.toLowerCase().includes(q) || e.posting_date.includes(q)
    );
  }, [unmatchedJEs, jeSearch]);

  // ── Bank account CRUD ──
  const openBankDialog = (bank?: BankAccount) => {
    if (bank) { setEditingBank(bank); setBankForm({ account_name: bank.account_name, bank_name: bank.bank_name, account_number: bank.account_number ?? '', currency: bank.currency, country_id: bank.country_id ?? '', gl_account_id: bank.gl_account_id ?? '', notes: bank.notes ?? '' }); }
    else { setEditingBank(null); setBankForm(BLANK_BANK); }
    setBankDialog(true);
  };

  const saveBank = async () => {
    if (!bankForm.account_name || !bankForm.bank_name) return;
    setSavingBank(true);
    const payload = { account_name: bankForm.account_name, bank_name: bankForm.bank_name, account_number: bankForm.account_number || null, currency: bankForm.currency, country_id: bankForm.country_id || null, gl_account_id: bankForm.gl_account_id || null, notes: bankForm.notes || null };
    let err: any;
    if (editingBank) {
      ({ error: err } = await supabase.from('acct_bank_accounts').update(payload).eq('id', editingBank.id));
    } else {
      ({ error: err } = await supabase.from('acct_bank_accounts').insert(payload));
    }
    if (err) { toast({ title: 'Error', description: err.message, variant: 'destructive' }); setSavingBank(false); return; }
    toast({ title: editingBank ? 'Bank account updated' : 'Bank account created' });
    setBankDialog(false);
    const { data } = await supabase.from('acct_bank_accounts').select('*').order('account_name');
    setBankAccounts((data ?? []) as BankAccount[]);
    setSavingBank(false);
  };

  // ── Statement line add ──
  const saveLine = async () => {
    if (!lineForm.statement_date || !lineForm.amount || !selectedBankId) return;
    setSavingLine(true);
    const { error: err } = await supabase.from('acct_bank_statement_lines').insert({
      bank_account_id: selectedBankId,
      statement_date: lineForm.statement_date,
      description: lineForm.description || null,
      reference: lineForm.reference || null,
      amount: Number(lineForm.amount),
      running_balance: lineForm.running_balance ? Number(lineForm.running_balance) : null,
      currency: lineForm.currency || selectedBank?.currency || 'USD',
    });
    if (err) { toast({ title: 'Error', description: err.message, variant: 'destructive' }); setSavingLine(false); return; }
    toast({ title: 'Statement line added' });
    setLineDialog(false);
    setLineForm(BLANK_LINE);
    void loadStatements();
    setSavingLine(false);
  };

  // ── Match ──
  const matchToJE = async (je: JournalEntry) => {
    if (!matchingLine) return;
    setMatching(true);
    const { error: err } = await supabase.from('acct_bank_statement_lines').update({
      matched_journal_entry_id: je.id,
      matched_at: new Date().toISOString(),
      match_note: matchNote || null,
      is_matched: true,
    }).eq('id', matchingLine.id);
    if (err) { toast({ title: 'Error', description: err.message, variant: 'destructive' }); setMatching(false); return; }
    toast({ title: 'Line matched to JE-' + String(je.entry_no).padStart(4, '0') });
    setMatchDialog(false);
    setMatchingLine(null);
    setMatchNote('');
    void loadStatements();
    setMatching(false);
  };

  const unmatch = async (line: StatementLine) => {
    const { error: err } = await supabase.from('acct_bank_statement_lines').update({ matched_journal_entry_id: null, matched_at: null, match_note: null, is_matched: false }).eq('id', line.id);
    if (err) { toast({ title: 'Error', description: err.message, variant: 'destructive' }); return; }
    toast({ title: 'Match removed' });
    void loadStatements();
  };

  const toggleExclude = async (line: StatementLine) => {
    const { error: err } = await supabase.from('acct_bank_statement_lines').update({ is_excluded: !line.is_excluded }).eq('id', line.id);
    if (err) { toast({ title: 'Error', description: err.message, variant: 'destructive' }); return; }
    toast({ title: line.is_excluded ? 'Line included' : 'Line excluded' });
    void loadStatements();
  };

  const deleteLine = async (id: string) => {
    if (!confirm('Delete this statement line?')) return;
    const { error: err } = await supabase.from('acct_bank_statement_lines').delete().eq('id', id);
    if (err) { toast({ title: 'Error', description: err.message, variant: 'destructive' }); return; }
    toast({ title: 'Statement line deleted' });
    void loadStatements();
  };

  // ── CSV Import ──
  const importCsv = async () => {
    if (!csvText.trim() || !selectedBankId) return;
    setImporting(true);
    const lines = csvText.trim().split('\n').filter(l => l.trim());
    // Skip header if present (detect by checking if amount is NaN)
    const rows = lines.filter(l => {
      const parts = l.split(',');
      return !isNaN(Number((parts[2] ?? '').trim().replace(/"/g, '')));
    });
    const toInsert = rows.map(row => {
      const parts = row.split(',').map(p => p.trim().replace(/^"|"$/g, ''));
      return {
        bank_account_id: selectedBankId,
        statement_date: parts[0] ?? '',
        description: parts[1] || null,
        amount: Number(parts[2] ?? '0'),
        running_balance: parts[3] ? Number(parts[3]) : null,
        reference: parts[4] || null,
        currency: selectedBank?.currency ?? 'USD',
      };
    }).filter(r => r.statement_date);

    if (toInsert.length === 0) { toast({ title: 'No valid rows found. Use format: date,description,amount,balance,reference' }); setImporting(false); return; }
    const { error: err } = await supabase.from('acct_bank_statement_lines').insert(toInsert);
    if (err) { toast({ title: 'Import error', description: err.message, variant: 'destructive' }); setImporting(false); return; }
    toast({ title: `Imported ${toInsert.length} statement lines` });
    setImportDialog(false);
    setCsvText('');
    void loadStatements();
    setImporting(false);
  };

  const exportCsv = () => {
    const header = ['Date', 'Description', 'Reference', 'Amount', 'Running Balance', 'Matched', 'Matched JE'];
    const rows = statementLines.map(l => [l.statement_date, l.description ?? '', l.reference ?? '', l.amount.toFixed(2), l.running_balance?.toFixed(2) ?? '', l.is_matched ? 'Yes' : 'No', l.matched_journal_entry_id ?? '']);
    downloadCsv(`bank-statement-${selectedBank?.account_name ?? 'recon'}-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows]);
  };

  if (authLoading) return <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!allowed) return <Navigate to="/" replace />;

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl" data-testid="bank-recon-page">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-teal-600 text-white shrink-0">
            <Landmark className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Bank Reconciliation</h1>
            <p className="text-muted-foreground text-sm">تسوية البنك — Match bank statement lines to posted journal entries</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => loadStatements()} disabled={loading} data-testid="button-refresh">
            <RefreshCw className={cn('h-4 w-4 mr-1', loading && 'animate-spin')} /> Refresh
          </Button>
          {canEdit && selectedBankId && (
            <>
              <Button variant="outline" size="sm" onClick={() => setImportDialog(true)} data-testid="button-import">
                <Upload className="h-4 w-4 mr-1" /> Import CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setLineForm(BLANK_LINE); setLineDialog(true); }} data-testid="button-add-line">
                <Plus className="h-4 w-4 mr-1" /> Add Line
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!statementLines.length} data-testid="button-export">
            <Download className="h-4 w-4 mr-1" /> Export
          </Button>
        </div>
      </div>

      <PageInfoBanner
        title="Bank Reconciliation"
        description="Upload your bank statement lines (via CSV import or manual entry), then match each line to a posted journal entry. The system shows matched vs. unmatched items and highlights any balance differences between your GL and the bank. Run the migration supabase/bank_recon_migration.sql first if the page shows an error."
        descriptionAr="قم بتحميل بنود كشف الحساب المصرفي (عبر استيراد CSV أو إدخال يدوي)، ثم طابق كل بند مع إدخال دفتر يومية مرحّل. يعرض النظام البنود المطابقة وغير المطابقة ويبرز أي فروقات بين دفتر الأستاذ والبنك."
      />

      {/* Top: Bank selector + manage */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="flex-1 min-w-48">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Bank Account</label>
          <Select value={selectedBankId} onValueChange={setSelectedBankId}>
            <SelectTrigger data-testid="select-bank-account"><SelectValue placeholder="Select bank account" /></SelectTrigger>
            <SelectContent>
              {bankAccounts.map(b => (
                <SelectItem key={b.id} value={b.id}>
                  <div className="flex items-center gap-2">
                    <Landmark className="h-3.5 w-3.5 text-muted-foreground" />
                    {b.account_name} — {b.bank_name} <Badge variant="outline" className="ml-1 text-[10px]">{b.currency}</Badge>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => openBankDialog()} data-testid="button-add-bank">
              <Plus className="h-4 w-4 mr-1" /> Add Bank Account
            </Button>
            {selectedBank && (
              <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => openBankDialog(selectedBank)} data-testid="button-edit-bank">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}
      </div>

      {!selectedBankId ? (
        <div className="text-center text-muted-foreground py-16 text-sm">
          Add a bank account to begin reconciliation.
          {canEdit && <><br /><Button className="mt-3" onClick={() => openBankDialog()}>Add Bank Account</Button></>}
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
            {[
              { label: 'Total Lines', value: stats.total, color: 'text-slate-700' },
              { label: 'Matched', value: stats.matched, color: 'text-emerald-700' },
              { label: 'Unmatched', value: stats.unmatched, color: stats.unmatched > 0 ? 'text-rose-700' : 'text-slate-500' },
              { label: 'Excluded', value: stats.excluded, color: 'text-slate-500' },
              { label: 'Total In', value: formatNumber(stats.totalIn), color: 'text-emerald-700', small: true },
              { label: 'Total Out', value: formatNumber(stats.totalOut), color: 'text-rose-700', small: true },
            ].map(s => (
              <Card key={s.label}>
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground">{s.label}</div>
                  <div className={cn('font-bold mt-1', s.small ? 'text-base' : 'text-2xl', s.color)} data-testid={`text-${s.label.toLowerCase().replace(/ /g, '-')}`}>{s.value}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Show</label>
              <div className="flex gap-1">
                {(['all', 'matched', 'unmatched'] as const).map(v => (
                  <Button key={v} variant={filterMatch === v ? 'default' : 'outline'} size="sm" className="capitalize" onClick={() => setFilterMatch(v)} data-testid={`filter-${v}`}>{v}</Button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Date From</label>
              <Input type="date" className="h-9 text-sm w-36" value={dateFrom} onChange={e => setDateFrom(e.target.value)} data-testid="input-date-from" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Date To</label>
              <Input type="date" className="h-9 text-sm w-36" value={dateTo} onChange={e => setDateTo(e.target.value)} data-testid="input-date-to" />
            </div>
          </div>

          {error && <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive mb-4">{error}</div>}

          {loading ? (
            <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <Card>
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-sm">{filtered.length} statement line{filtered.length !== 1 ? 's' : ''}</CardTitle>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground w-24">Date</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground">Description / Ref</th>
                        <th className="text-right px-4 py-2 font-medium text-muted-foreground w-28">Amount</th>
                        <th className="text-right px-4 py-2 font-medium text-muted-foreground w-28">Balance</th>
                        <th className="text-center px-4 py-2 font-medium text-muted-foreground w-24">Status</th>
                        <th className="text-center px-4 py-2 font-medium text-muted-foreground w-32">Match</th>
                        {canEdit && <th className="px-4 py-2 w-20" />}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr><td colSpan={7} className="text-center text-muted-foreground py-10">No statement lines found. Import a CSV or add lines manually.</td></tr>
                      ) : filtered.map((line, i) => (
                        <tr key={line.id} className={cn('border-b hover:bg-muted/20', i % 2 === 0 ? '' : 'bg-muted/10', line.is_excluded && 'opacity-50')}>
                          <td className="px-4 py-2">{format(parseISO(line.statement_date), 'MMM d, yyyy')}</td>
                          <td className="px-4 py-2">
                            <div className="font-medium">{line.description ?? '—'}</div>
                            {line.reference && <div className="text-muted-foreground">{line.reference}</div>}
                            {line.match_note && <div className="text-indigo-600 dark:text-indigo-400 italic">{line.match_note}</div>}
                          </td>
                          <td className={cn('px-4 py-2 text-right tabular-nums font-medium', line.amount >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400')}>
                            {line.amount >= 0 ? '+' : ''}{formatNumber(line.amount)}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{line.running_balance != null ? formatNumber(line.running_balance) : '—'}</td>
                          <td className="px-4 py-2 text-center">
                            {line.is_excluded ? (
                              <Badge variant="outline" className="text-[10px] border-slate-300 text-slate-500">Excluded</Badge>
                            ) : line.is_matched ? (
                              <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30">
                                <CheckCircle2 className="h-3 w-3 mr-1" />Matched
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] border-rose-300 text-rose-700 bg-rose-50 dark:bg-rose-950/30">
                                <XCircle className="h-3 w-3 mr-1" />Unmatched
                              </Badge>
                            )}
                          </td>
                          <td className="px-4 py-2 text-center">
                            {!line.is_excluded && canEdit && (
                              line.is_matched ? (
                                <Button variant="ghost" size="sm" className="h-7 text-xs text-slate-600" onClick={() => unmatch(line)} data-testid={`button-unmatch-${line.id}`}>
                                  Unmatch
                                </Button>
                              ) : (
                                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setMatchingLine(line); setJeSearch(''); setMatchNote(''); setMatchDialog(true); }} data-testid={`button-match-${line.id}`}>
                                  <Link2 className="h-3 w-3 mr-1" />Match
                                </Button>
                              )
                            )}
                          </td>
                          {canEdit && (
                            <td className="px-4 py-2">
                              <div className="flex gap-1 justify-center">
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" onClick={() => toggleExclude(line)} title={line.is_excluded ? 'Include' : 'Exclude'} data-testid={`button-exclude-${line.id}`}>
                                  {line.is_excluded ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
                                </Button>
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => deleteLine(line.id)} data-testid={`button-delete-line-${line.id}`}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ── Bank Account Dialog ── */}
      <Dialog open={bankDialog} onOpenChange={setBankDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingBank ? 'Edit' : 'Add'} Bank Account</DialogTitle>
            <DialogDescription>Register a bank account for reconciliation.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {[
              { label: 'Account Name *', field: 'account_name', placeholder: 'e.g. Operations Current Account' },
              { label: 'Bank Name *', field: 'bank_name', placeholder: 'e.g. Commercial Bank of Ethiopia' },
              { label: 'Account Number', field: 'account_number', placeholder: '1234567890' },
            ].map(f => (
              <div key={f.field}>
                <Label className="text-xs mb-1">{f.label}</Label>
                <Input className="h-9" placeholder={f.placeholder} value={(bankForm as any)[f.field]} onChange={e => setBankForm(p => ({ ...p, [f.field]: e.target.value }))} data-testid={`input-bank-${f.field}`} />
              </div>
            ))}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1">Currency</Label>
                <Input className="h-9" value={bankForm.currency} onChange={e => setBankForm(p => ({ ...p, currency: e.target.value.toUpperCase().slice(0, 3) }))} data-testid="input-bank-currency" />
              </div>
              <div>
                <Label className="text-xs mb-1">Country</Label>
                <Select value={bankForm.country_id} onValueChange={v => setBankForm(p => ({ ...p, country_id: v }))}>
                  <SelectTrigger className="h-9" data-testid="select-bank-country"><SelectValue placeholder="Select country" /></SelectTrigger>
                  <SelectContent>{countries.map(c => <SelectItem key={c.id} value={c.id}>{c.flag_emoji ?? ''} {c.name_en}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs mb-1">Linked GL Account (optional)</Label>
              <Select value={bankForm.gl_account_id} onValueChange={v => setBankForm(p => ({ ...p, gl_account_id: v }))}>
                <SelectTrigger className="h-9" data-testid="select-bank-gl"><SelectValue placeholder="Select GL account" /></SelectTrigger>
                <SelectContent>{glAccounts.map(a => <SelectItem key={a.id} value={a.id}>{a.code} — {a.name_en}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBankDialog(false)}>Cancel</Button>
            <Button onClick={saveBank} disabled={savingBank || !bankForm.account_name || !bankForm.bank_name} data-testid="button-save-bank">
              {savingBank ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}{editingBank ? 'Update' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Statement Line Dialog ── */}
      <Dialog open={lineDialog} onOpenChange={setLineDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Statement Line</DialogTitle>
            <DialogDescription>Manually enter a bank statement transaction.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs mb-1">Date *</Label>
              <Input type="date" className="h-9" value={lineForm.statement_date} onChange={e => setLineForm(p => ({ ...p, statement_date: e.target.value }))} data-testid="input-line-date" />
            </div>
            <div>
              <Label className="text-xs mb-1">Description</Label>
              <Input className="h-9" placeholder="Transaction description" value={lineForm.description} onChange={e => setLineForm(p => ({ ...p, description: e.target.value }))} data-testid="input-line-description" />
            </div>
            <div>
              <Label className="text-xs mb-1">Reference</Label>
              <Input className="h-9" placeholder="Cheque no / wire ref" value={lineForm.reference} onChange={e => setLineForm(p => ({ ...p, reference: e.target.value }))} data-testid="input-line-reference" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1">Amount * (+ deposit / − withdrawal)</Label>
                <Input type="number" className="h-9" placeholder="e.g. 5000 or -1200" value={lineForm.amount} onChange={e => setLineForm(p => ({ ...p, amount: e.target.value }))} data-testid="input-line-amount" />
              </div>
              <div>
                <Label className="text-xs mb-1">Running Balance</Label>
                <Input type="number" className="h-9" placeholder="Statement balance" value={lineForm.running_balance} onChange={e => setLineForm(p => ({ ...p, running_balance: e.target.value }))} data-testid="input-line-balance" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLineDialog(false)}>Cancel</Button>
            <Button onClick={saveLine} disabled={savingLine || !lineForm.statement_date || !lineForm.amount} data-testid="button-save-line">
              {savingLine ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Add Line
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Match Dialog ── */}
      <Dialog open={matchDialog} onOpenChange={setMatchDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Match to Journal Entry</DialogTitle>
            <DialogDescription>
              {matchingLine && `${format(parseISO(matchingLine.statement_date), 'MMM d, yyyy')} · ${matchingLine.description ?? ''} · ${matchingLine.amount >= 0 ? '+' : ''}${formatNumber(matchingLine.amount)} ${matchingLine.currency}`}
            </DialogDescription>
          </DialogHeader>
          <div className="relative mb-3">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search by entry number, description, or date..." value={jeSearch} onChange={e => setJeSearch(e.target.value)} data-testid="input-je-search" />
          </div>
          <div className="border rounded-md max-h-60 overflow-y-auto">
            {filteredJEs.length === 0 ? (
              <div className="text-center text-muted-foreground py-6 text-sm">No matching journal entries found</div>
            ) : filteredJEs.map(je => (
              <div key={je.id} className="flex items-center justify-between px-3 py-2 border-b last:border-b-0 hover:bg-muted/30">
                <div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-mono text-indigo-700 dark:text-indigo-400 font-semibold">JE-{String(je.entry_no).padStart(4, '0')}</span>
                    <span className="text-muted-foreground text-xs">{format(parseISO(je.posting_date), 'MMM d, yyyy')}</span>
                    <Badge variant="outline" className="text-[10px]">{je.source_type}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{je.description_en}</div>
                </div>
                <Button size="sm" onClick={() => matchToJE(je)} disabled={matching} data-testid={`button-select-je-${je.id}`}>
                  {matching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Select'}
                </Button>
              </div>
            ))}
          </div>
          <div>
            <Label className="text-xs mb-1">Match Note (optional)</Label>
            <Input className="h-9" placeholder="e.g. Verified against bank statement" value={matchNote} onChange={e => setMatchNote(e.target.value)} data-testid="input-match-note" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMatchDialog(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── CSV Import Dialog ── */}
      <Dialog open={importDialog} onOpenChange={setImportDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import CSV Statement</DialogTitle>
            <DialogDescription>
              Paste your CSV data below. Expected columns (in order): <code className="font-mono text-xs bg-muted px-1 rounded">date, description, amount, running_balance, reference</code>. Header row is automatically skipped if present.
            </DialogDescription>
          </DialogHeader>
          <textarea
            className="w-full border rounded-md p-2 text-xs font-mono min-h-[160px] bg-background resize-y"
            placeholder={`2024-01-15,Transfer from donor,5000.00,25000.00,REF-001\n2024-01-18,Office rent,-1200.00,23800.00,CHQ-2024-01`}
            value={csvText}
            onChange={e => setCsvText(e.target.value)}
            data-testid="input-csv"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialog(false)}>Cancel</Button>
            <Button onClick={importCsv} disabled={importing || !csvText.trim()} data-testid="button-import-submit">
              {importing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
