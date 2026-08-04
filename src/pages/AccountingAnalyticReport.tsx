import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageLoader } from '@/components/ui/page-loader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Download, RefreshCw, BarChart2, Filter } from 'lucide-react';
import { exportToExcel } from '@/utils/report-export';
import { formatNumber } from '@/lib/accountingFormat';

interface Fund { id: string; code: string; name_en: string; restriction_type: string }
interface Project { id: string; name: string }
interface AnalyticLine {
  account_type: string; account_code: string; account_name: string;
  fund_id: string | null; project_id: string | null; function: string | null;
  debit_credit: 'DR'|'CR'; functional_amount: number; posting_date: string;
}
interface GroupRow { label: string; revenue: number; expense: number; net: number }

const FUNCTIONS = ['program','management','fundraising','operations','overhead','other'];

export default function AccountingAnalyticReport() {
  const { hasAnyRole } = useAuthorization();
  const allowed = hasAnyRole(['super_admin','admin','finance','financialAdmin','accountant','auditor']);

  const [lines, setLines]       = useState<AnalyticLine[]>([]);
  const [funds, setFunds]       = useState<Fund[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading]   = useState(true);
  const [dateFrom, setDateFrom] = useState(new Date(new Date().getFullYear(),0,1).toISOString().slice(0,10));
  const [dateTo, setDateTo]     = useState(new Date().toISOString().slice(0,10));
  const [groupBy, setGroupBy]   = useState<'fund'|'project'|'function'>('fund');
  const [fundFilter, setFundFilter]     = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [funcFilter, setFuncFilter]     = useState('all');

  const load = async () => {
    setLoading(true);
    const [lRes, fRes, pRes] = await Promise.all([
      supabase.from('acct_journal_lines' as any)
        .select(`fund_id, project_id, function, debit_credit, functional_amount, acct_accounts(account_type, code, name_en), acct_journal_entries!inner(posting_date, status)`)
        .eq('acct_journal_entries.status' as any, 'posted')
        .gte('acct_journal_entries.posting_date' as any, dateFrom)
        .lte('acct_journal_entries.posting_date' as any, dateTo)
        .limit(5000),
      supabase.from('acct_funds' as any).select('id,code,name_en,restriction_type').order('name_en').limit(200),
      supabase.from('projects').select('id,name').order('name').limit(300),
    ]);
    setLines(((lRes.data??[]) as any[]).map((l:any)=>({
      account_type: l.acct_accounts?.account_type??'',
      account_code: l.acct_accounts?.code??'',
      account_name: l.acct_accounts?.name_en??'',
      fund_id: l.fund_id, project_id: l.project_id,
      function: l.function,
      debit_credit: l.debit_credit,
      functional_amount: Number(l.functional_amount??0),
      posting_date: l.acct_journal_entries?.posting_date??'',
    })));
    setFunds((fRes.data??[]) as Fund[]);
    setProjects((pRes.data??[]) as Project[]);
    setLoading(false);
  };
  useEffect(() => { if (allowed) void load(); }, [allowed]);

  const filtered = useMemo(() => lines.filter(l => {
    if (fundFilter !== 'all' && l.fund_id !== fundFilter) return false;
    if (projectFilter !== 'all' && l.project_id !== projectFilter) return false;
    if (funcFilter !== 'all' && (l.function??'other') !== funcFilter) return false;
    return true;
  }), [lines, fundFilter, projectFilter, funcFilter]);

  const grouped = useMemo((): GroupRow[] => {
    const map = new Map<string, { revenue:number; expense:number }>();
    for (const l of filtered) {
      let key: string;
      if (groupBy === 'fund')     key = funds.find(f=>f.id===l.fund_id)?.name_en ?? 'Unallocated';
      else if (groupBy === 'project') key = projects.find(p=>p.id===l.project_id)?.name ?? 'No Project';
      else key = l.function ?? 'other';
      if (!map.has(key)) map.set(key, { revenue:0, expense:0 });
      const row = map.get(key)!;
      const isIncome  = ['revenue','income'].includes(l.account_type);
      const isExpense = l.account_type === 'expense';
      const signed = l.debit_credit==='CR' ? l.functional_amount : -l.functional_amount;
      if (isIncome)  row.revenue += signed;
      if (isExpense) row.expense += -signed;
    }
    return [...map.entries()].map(([label,r])=>({
      label, revenue:r.revenue, expense:r.expense, net:r.revenue-r.expense,
    })).sort((a,b)=>Math.abs(b.net)-Math.abs(a.net));
  }, [filtered, groupBy, funds, projects]);

  const totals = useMemo(()=>grouped.reduce((a,r)=>({revenue:a.revenue+r.revenue,expense:a.expense+r.expense,net:a.net+r.net}),{revenue:0,expense:0,net:0}),[grouped]);

  const exportData = () => exportToExcel(
    grouped.map(r=>({ [groupBy.toUpperCase()]:r.label, Revenue:r.revenue.toFixed(2), Expense:r.expense.toFixed(2), 'Net':r.net.toFixed(2) })),
    'Analytic Report','analytic-report.xlsx'
  );

  if (!allowed) return null;

  return (
    <div className="space-y-4 p-1">
      <div className="flex flex-wrap items-center gap-2">
        <BarChart2 className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Analytic Report</h2>
        <div className="flex-1" />
        <Input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} className="w-36 h-8 text-sm" />
        <Input type="date" value={dateTo}   onChange={e=>setDateTo(e.target.value)}   className="w-36 h-8 text-sm" />
        <Select value={groupBy} onValueChange={v=>setGroupBy(v as any)}>
          <SelectTrigger className="w-36 h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="fund">By Fund</SelectItem>
            <SelectItem value="project">By Project</SelectItem>
            <SelectItem value="function">By Function</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
        <Button size="sm" variant="outline" onClick={exportData}><Download className="h-4 w-4 mr-1" />Export</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Filter className="h-4 w-4 text-muted-foreground self-center" />
        <Select value={fundFilter} onValueChange={setFundFilter}>
          <SelectTrigger className="w-44 h-8 text-xs"><SelectValue placeholder="All Funds" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Funds</SelectItem>
            {funds.map(f=><SelectItem key={f.id} value={f.id}>{f.name_en}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-44 h-8 text-xs"><SelectValue placeholder="All Projects" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            {projects.map(p=><SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={funcFilter} onValueChange={setFuncFilter}>
          <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="All Functions" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Functions</SelectItem>
            {FUNCTIONS.map(f=><SelectItem key={f} value={f}>{f.charAt(0).toUpperCase()+f.slice(1)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label:'Total Revenue',  val:totals.revenue, cls:'text-emerald-700 bg-emerald-50 border-emerald-200' },
          { label:'Total Expenses', val:totals.expense, cls:'text-red-700 bg-red-50 border-red-200' },
          { label:'Net Surplus / Deficit', val:totals.net, cls:totals.net>=0?'text-emerald-700 bg-emerald-50 border-emerald-200':'text-red-700 bg-red-50 border-red-200' },
        ].map(k=>(
          <Card key={k.label} className={`border ${k.cls}`}><CardContent className="p-3">
            <p className="text-xs opacity-80">{k.label}</p>
            <p className="text-lg font-bold mt-0.5">{formatNumber(k.val)}</p>
          </CardContent></Card>
        ))}
      </div>

      {loading ? (
        <PageLoader compact />
      ) : (
        <Card><CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead>{groupBy === 'fund' ? 'Fund' : groupBy === 'project' ? 'Project' : 'Function'}</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Expenses</TableHead>
                <TableHead className="text-right font-bold">Net</TableHead>
                <TableHead className="text-right w-24">% Rev.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grouped.map((r,i)=>(
                <TableRow key={r.label} className={i%2!==0?'bg-muted/5':''}>
                  <TableCell className="font-medium capitalize">{r.label}</TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-700">{formatNumber(r.revenue)}</TableCell>
                  <TableCell className="text-right tabular-nums text-red-700">{formatNumber(r.expense)}</TableCell>
                  <TableCell className={`text-right tabular-nums font-bold ${r.net>=0?'text-emerald-700':'text-red-700'}`}>{formatNumber(r.net)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground text-xs">
                    {totals.revenue>0?(r.revenue/totals.revenue*100).toFixed(1)+'%':'—'}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/40 font-bold border-t-2">
                <TableCell>TOTAL</TableCell>
                <TableCell className="text-right tabular-nums text-emerald-700">{formatNumber(totals.revenue)}</TableCell>
                <TableCell className="text-right tabular-nums text-red-700">{formatNumber(totals.expense)}</TableCell>
                <TableCell className={`text-right tabular-nums ${totals.net>=0?'text-emerald-700':'text-red-700'}`}>{formatNumber(totals.net)}</TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </CardContent></Card>
      )}
    </div>
  );
}
