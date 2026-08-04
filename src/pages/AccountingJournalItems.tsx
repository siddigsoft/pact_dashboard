import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { Card, CardContent } from '@/components/ui/card';
import { PageLoader } from '@/components/ui/page-loader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Download, RefreshCw, List, Search, Filter } from 'lucide-react';
import { exportToExcel } from '@/utils/report-export';
import { formatNumber } from '@/lib/accountingFormat';

interface LineItem {
  id: string; entry_id: string; line_no: number; account_id: string;
  account_code: string; account_name: string; account_type: string;
  debit_credit: 'DR'|'CR'; functional_amount: number; original_amount: number;
  original_currency: string; fx_rate: number; description: string | null;
  entry_no: number; posting_date: string; source_type: string | null; entry_status: string;
  fund_id: string | null;
}

const PAGE_SIZE = 100;

export default function AccountingJournalItems() {
  const { hasAnyRole } = useAuthorization();
  const allowed = hasAnyRole(['super_admin','admin','finance','financialAdmin','accountant','auditor']);

  const [items, setItems]         = useState<LineItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [page, setPage]           = useState(0);
  const [total, setTotal]         = useState(0);
  const [search, setSearch]       = useState('');
  const [dateFrom, setDateFrom]   = useState('');
  const [dateTo, setDateTo]       = useState('');
  const [dcFilter, setDcFilter]   = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('posted');

  const load = useCallback(async () => {
    setLoading(true);
    let q = (supabase
      .from('acct_journal_lines' as any)
      .select(`
        id, entry_id, line_no, account_id, debit_credit, functional_amount,
        original_amount, original_currency, fx_rate, description,
        acct_accounts(code, name_en, account_type),
        acct_journal_entries!inner(entry_no, posting_date, source_type, status)
      `, { count: 'exact' }) as any)
      .order('acct_journal_entries.posting_date', { ascending: false })
      .order('entry_id')
      .order('line_no')
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (statusFilter !== 'all') q = q.eq('acct_journal_entries.status' as any, statusFilter);
    if (dcFilter !== 'all') q = q.eq('debit_credit', dcFilter);
    if (dateFrom) q = q.gte('acct_journal_entries.posting_date' as any, dateFrom);
    if (dateTo)   q = q.lte('acct_journal_entries.posting_date' as any, dateTo);

    const { data, count } = await q;
    const mapped: LineItem[] = (data ?? []).map((l: any) => ({
      id: l.id, entry_id: l.entry_id, line_no: l.line_no, account_id: l.account_id,
      account_code: l.acct_accounts?.code ?? '—',
      account_name: l.acct_accounts?.name_en ?? '—',
      account_type: l.acct_accounts?.account_type ?? '—',
      debit_credit: l.debit_credit,
      functional_amount: Number(l.functional_amount ?? 0),
      original_amount: Number(l.original_amount ?? 0),
      original_currency: l.original_currency ?? 'USD',
      fx_rate: Number(l.fx_rate ?? 1),
      description: l.description,
      entry_no: l.acct_journal_entries?.entry_no ?? 0,
      posting_date: l.acct_journal_entries?.posting_date ?? '',
      source_type: l.acct_journal_entries?.source_type ?? null,
      entry_status: l.acct_journal_entries?.status ?? '',
      fund_id: null,
    }));
    setItems(mapped);
    setTotal(count ?? 0);
    setLoading(false);
  }, [page, statusFilter, dcFilter, dateFrom, dateTo]);

  useEffect(() => { if (allowed) void load(); }, [allowed, load]);
  useEffect(() => { setPage(0); }, [search, dateFrom, dateTo, dcFilter, statusFilter]);

  const filtered = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter(l =>
      l.account_code.toLowerCase().includes(q) ||
      l.account_name.toLowerCase().includes(q) ||
      (l.description ?? '').toLowerCase().includes(q) ||
      String(l.entry_no).includes(q)
    );
  }, [items, search]);

  const exportData = () => exportToExcel(
    filtered.map(l => ({
      Date:l.posting_date, 'JE#':l.entry_no, 'Account':l.account_code,
      'Account Name':l.account_name, 'DR/CR':l.debit_credit,
      'Amount':l.functional_amount, 'Orig Amount':l.original_amount,
      'Orig Currency':l.original_currency, 'FX Rate':l.fx_rate,
      Description:l.description??'', 'Source':l.source_type??'',
    })), 'Journal Items', 'journal-items.xlsx'
  );

  const totalDR = filtered.filter(l=>l.debit_credit==='DR').reduce((s,l)=>s+l.functional_amount,0);
  const totalCR = filtered.filter(l=>l.debit_credit==='CR').reduce((s,l)=>s+l.functional_amount,0);

  if (!allowed) return null;

  return (
    <div className="space-y-4 p-1">
      <div className="flex flex-wrap items-center gap-2">
        <List className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Journal Items</h2>
        <Badge variant="outline">{total.toLocaleString()} total lines</Badge>
        <div className="flex-1" />
        <Input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} className="w-36 h-8 text-sm" />
        <Input type="date" value={dateTo}   onChange={e=>setDateTo(e.target.value)}   className="w-36 h-8 text-sm" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="posted">Posted</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="reversed">Reversed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={dcFilter} onValueChange={setDcFilter}>
          <SelectTrigger className="w-24 h-8"><SelectValue placeholder="DR/CR" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="DR">Debit</SelectItem>
            <SelectItem value="CR">Credit</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" className="pl-7 w-44 h-8 text-sm" />
        </div>
        <Button size="sm" variant="outline" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
        <Button size="sm" variant="outline" onClick={exportData}><Download className="h-4 w-4 mr-1" />Export</Button>
      </div>

      {/* DR/CR summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label:'Total Debits',  val:totalDR, cls:'text-indigo-700' },
          { label:'Total Credits', val:totalCR, cls:'text-slate-700' },
          { label:'Net Balance',   val:totalDR-totalCR, cls:totalDR-totalCR>=0?'text-red-600':'text-emerald-600' },
        ].map(k => (
          <Card key={k.label}><CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{k.label}</p>
            <p className={`text-base font-bold mt-0.5 ${k.cls}`}>{formatNumber(Math.abs(k.val))}</p>
          </CardContent></Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <PageLoader compact />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-xs w-24">Date</TableHead>
                  <TableHead className="text-xs w-16">JE#</TableHead>
                  <TableHead className="text-xs w-24">Account</TableHead>
                  <TableHead className="text-xs">Account Name</TableHead>
                  <TableHead className="text-xs">Description</TableHead>
                  <TableHead className="text-xs w-16">Source</TableHead>
                  <TableHead className="text-xs w-16 text-center">DR/CR</TableHead>
                  <TableHead className="text-xs w-28 text-right">Amount</TableHead>
                  <TableHead className="text-xs w-20 text-right">Orig. Curr.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((l,i) => (
                  <TableRow key={l.id} className={`text-xs ${i%2!==0?'bg-muted/10':''}`} data-testid={`row-jitem-${l.id}`}>
                    <TableCell className="py-1.5 whitespace-nowrap">{l.posting_date}</TableCell>
                    <TableCell className="py-1.5 font-mono">#{l.entry_no}</TableCell>
                    <TableCell className="py-1.5 font-mono">{l.account_code}</TableCell>
                    <TableCell className="py-1.5 max-w-[140px] truncate">{l.account_name}</TableCell>
                    <TableCell className="py-1.5 max-w-[160px] truncate text-muted-foreground">{l.description??'—'}</TableCell>
                    <TableCell className="py-1.5">
                      {l.source_type && <Badge variant="outline" className="text-[9px] px-1">{l.source_type.replace(/_/g,' ')}</Badge>}
                    </TableCell>
                    <TableCell className="py-1.5 text-center">
                      <span className={`font-bold ${l.debit_credit==='DR'?'text-indigo-600':'text-slate-500'}`}>{l.debit_credit}</span>
                    </TableCell>
                    <TableCell className="py-1.5 text-right tabular-nums font-medium">{formatNumber(l.functional_amount)}</TableCell>
                    <TableCell className="py-1.5 text-right text-muted-foreground tabular-nums">
                      {l.original_currency !== 'USD' ? `${l.original_currency} ${formatNumber(l.original_amount)}` : ''}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Showing {page*PAGE_SIZE+1}–{Math.min((page+1)*PAGE_SIZE, total)} of {total}</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page===0} onClick={()=>setPage(p=>p-1)}>Previous</Button>
          <Button size="sm" variant="outline" disabled={(page+1)*PAGE_SIZE>=total} onClick={()=>setPage(p=>p+1)}>Next</Button>
        </div>
      </div>
    </div>
  );
}
