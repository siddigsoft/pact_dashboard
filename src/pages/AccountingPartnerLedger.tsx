import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Download, RefreshCw, Users, Search, ChevronDown, ChevronRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { exportToExcel } from '@/utils/report-export';
import { formatNumber } from '@/lib/accountingFormat';

interface JournalLine {
  id: string; entry_id: string; account_id: string; account_code: string; account_name: string;
  debit_credit: 'DR'|'CR'; functional_amount: number; description: string | null;
  posting_date: string; entry_no: number; source_type: string | null; source_id: string | null;
  partner_name: string | null;
}

interface PartnerGroup { name: string; lines: JournalLine[]; totalDebit: number; totalCredit: number; balance: number }

export default function AccountingPartnerLedger() {
  const { hasAnyRole } = useAuthorization();
  const allowed = hasAnyRole(['super_admin','admin','finance','financialAdmin','accountant','auditor']);

  const [lines, setLines]       = useState<JournalLine[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [accType, setAccType]   = useState('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from('acct_journal_lines' as any)
      .select(`
        id, entry_id, account_id, debit_credit, functional_amount, description,
        acct_accounts!inner(code, name_en, account_type),
        acct_journal_entries!inner(entry_no, posting_date, source_type, source_id, status)
      `)
      .in('acct_journal_entries.status' as any, ['posted'])
      .in('acct_accounts.account_type' as any, ['asset','liability'])
      .order('acct_journal_entries.posting_date' as any, { ascending: false })
      .limit(2000);
    const { data } = await q;
    const mapped: JournalLine[] = (data ?? []).map((l: any) => ({
      id: l.id, entry_id: l.entry_id, account_id: l.account_id,
      account_code: l.acct_accounts?.code ?? '—',
      account_name: l.acct_accounts?.name_en ?? '—',
      debit_credit: l.debit_credit,
      functional_amount: Number(l.functional_amount ?? 0),
      description: l.description,
      posting_date: l.acct_journal_entries?.posting_date ?? '',
      entry_no: l.acct_journal_entries?.entry_no ?? 0,
      source_type: l.acct_journal_entries?.source_type ?? null,
      source_id: l.acct_journal_entries?.source_id ?? null,
      partner_name: l.description ? extractPartner(l.description) : null,
    }));
    setLines(mapped);
    setLoading(false);
  };
  useEffect(() => { if (allowed) void load(); }, [allowed]);

  function extractPartner(desc: string | null): string {
    if (!desc) return 'Unknown Partner';
    const m = desc.match(/(?:vendor|partner|supplier|customer|payee):\s*([^,\n|]+)/i);
    return m ? m[1].trim() : desc.split(/[,|]/)[0].trim().slice(0, 40);
  }

  const filtered = useMemo(() => {
    return lines.filter(l => {
      if (dateFrom && l.posting_date < dateFrom) return false;
      if (dateTo   && l.posting_date > dateTo)   return false;
      if (search) {
        const q = search.toLowerCase();
        if (!l.partner_name?.toLowerCase().includes(q) && !l.account_name.toLowerCase().includes(q) && !l.account_code.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [lines, search, dateFrom, dateTo]);

  const grouped = useMemo((): PartnerGroup[] => {
    const map = new Map<string, JournalLine[]>();
    for (const l of filtered) {
      const key = l.partner_name || 'Unknown Partner';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(l);
    }
    return [...map.entries()].map(([name, ls]) => {
      const totalDebit  = ls.filter(l=>l.debit_credit==='DR').reduce((s,l)=>s+l.functional_amount,0);
      const totalCredit = ls.filter(l=>l.debit_credit==='CR').reduce((s,l)=>s+l.functional_amount,0);
      return { name, lines: ls, totalDebit, totalCredit, balance: totalDebit - totalCredit };
    }).sort((a,b) => Math.abs(b.balance) - Math.abs(a.balance));
  }, [filtered]);

  const toggle = (name: string) => setExpanded(prev => { const s = new Set(prev); s.has(name)?s.delete(name):s.add(name); return s; });

  const exportData = () => exportToExcel(
    filtered.map(l => ({
      'Partner': l.partner_name??'Unknown','Account Code':l.account_code,'Account':l.account_name,
      'Date':l.posting_date,'JE#':l.entry_no,'Description':l.description??'',
      'DR/CR':l.debit_credit,'Amount':l.functional_amount,
    })), 'Partner Ledger', 'partner-ledger.xlsx'
  );

  if (!allowed) return null;

  return (
    <div className="space-y-4 p-1">
      <div className="flex flex-wrap items-center gap-2">
        <Users className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Partner Ledger</h2>
        <Badge variant="outline">{grouped.length} partners</Badge>
        <div className="flex-1" />
        <Input value={dateFrom} onChange={e=>setDateFrom(e.target.value)} type="date" className="w-36 h-8 text-sm" placeholder="From" />
        <Input value={dateTo}   onChange={e=>setDateTo(e.target.value)}   type="date" className="w-36 h-8 text-sm" placeholder="To" />
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search partner…" className="pl-7 w-48 h-8 text-sm" />
        </div>
        <Button size="sm" variant="outline" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
        <Button size="sm" variant="outline" onClick={exportData}><Download className="h-4 w-4 mr-1" />Export</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : grouped.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border border-dashed rounded-lg">
          <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p>No partner ledger entries found</p>
          <p className="text-sm mt-1">Partner ledger shows receivable/payable accounts with partner info extracted from journal descriptions.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {grouped.map(g => (
            <Card key={g.name} className="overflow-hidden">
              <div
                className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => toggle(g.name)}
              >
                {expanded.has(g.name) ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                <div className="flex-1 font-medium text-sm">{g.name}</div>
                <div className="flex gap-6 text-xs">
                  <span className="text-muted-foreground">Debit: <span className="font-mono font-medium text-foreground">{formatNumber(g.totalDebit)}</span></span>
                  <span className="text-muted-foreground">Credit: <span className="font-mono font-medium text-foreground">{formatNumber(g.totalCredit)}</span></span>
                  <span className={`font-mono font-bold ${g.balance >= 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    Balance: {formatNumber(Math.abs(g.balance))} {g.balance >= 0 ? 'DR' : 'CR'}
                  </span>
                </div>
                <Badge variant="outline" className="text-[10px]">{g.lines.length} entries</Badge>
              </div>
              {expanded.has(g.name) && (
                <div className="border-t">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/20">
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-xs">JE#</TableHead>
                        <TableHead className="text-xs">Account</TableHead>
                        <TableHead className="text-xs">Description</TableHead>
                        <TableHead className="text-xs text-right">Debit</TableHead>
                        <TableHead className="text-xs text-right">Credit</TableHead>
                        <TableHead className="text-xs text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(() => {
                        let running = 0;
                        return [...g.lines].sort((a,b)=>a.posting_date.localeCompare(b.posting_date)).map(l => {
                          const dr = l.debit_credit==='DR'?l.functional_amount:0;
                          const cr = l.debit_credit==='CR'?l.functional_amount:0;
                          running += dr - cr;
                          return (
                            <TableRow key={l.id} className="text-xs">
                              <TableCell className="py-1.5">{l.posting_date}</TableCell>
                              <TableCell className="py-1.5 font-mono">#{l.entry_no}</TableCell>
                              <TableCell className="py-1.5 font-mono">{l.account_code}</TableCell>
                              <TableCell className="py-1.5 max-w-[200px] truncate text-muted-foreground">{l.description??'—'}</TableCell>
                              <TableCell className="py-1.5 text-right tabular-nums">{dr>0?formatNumber(dr):''}</TableCell>
                              <TableCell className="py-1.5 text-right tabular-nums">{cr>0?formatNumber(cr):''}</TableCell>
                              <TableCell className={`py-1.5 text-right tabular-nums font-medium ${running>=0?'text-red-600':'text-emerald-600'}`}>{formatNumber(Math.abs(running))}{running>=0?' DR':' CR'}</TableCell>
                            </TableRow>
                          );
                        });
                      })()}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
