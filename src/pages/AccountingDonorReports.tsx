import { useEffect, useMemo, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Loader2, RefreshCw, Download, Search,
  Heart, AlertTriangle, Info, Scale, Layers,
  TrendingUp, TrendingDown, ArrowUpDown, FileText,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { formatNumber, downloadCsv } from '@/lib/accountingFormat';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, Legend } from 'recharts';

interface Fund {
  id: string; code: string; name_en: string; name_ar: string | null;
  restriction_type: string; donor_partner_id: string | null;
  start_date: string | null; end_date: string | null; is_active: boolean;
}
interface FundActivity {
  fund_id: string; total_debit: number; total_credit: number; line_count: number;
}
interface Partner { id: string; name: string }

const RESTRICTION_CFG: Record<string, { label: string; color: string; short: string }> = {
  without_restriction: { label: 'Unrestricted',      color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30', short: 'UNR' },
  with_restriction:    { label: 'Donor-Restricted',  color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30',   short: 'DR'  },
  board_designated:    { label: 'Board-Designated',  color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30',      short: 'BD'  },
  quasi_endowment:     { label: 'Quasi-Endowment',   color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30', short: 'QE'  },
};

const CHART_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444', '#0ea5e9'];

export default function AccountingDonorReports() {
  const { hasAnyRole, loading: authLoading } = useAuthorization();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);
  const { toast } = useToast();

  const [funds, setFunds]         = useState<Fund[]>([]);
  const [activity, setActivity]   = useState<FundActivity[]>([]);
  const [partners, setPartners]   = useState<Partner[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [tab, setTab]             = useState('funds');

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: fData }, { data: jlData }, { data: pData }] = await Promise.all([
      supabase.from('accounting_funds').select('id, code, name_en, name_ar, restriction_type, donor_partner_id, start_date, end_date, is_active').order('code'),
      supabase.from('acct_journal_entry_lines').select('fund_id, debit_credit, functional_amount'),
      supabase.from('crm_partners').select('id, name').limit(500).catch(() => ({ data: [] })),
    ]);
    setFunds((fData ?? []) as Fund[]);
    setPartners(((pData as any)?.data ?? pData ?? []) as Partner[]);

    const actMap = new Map<string, FundActivity>();
    for (const l of (jlData ?? []) as any[]) {
      if (!l.fund_id) continue;
      const cur = actMap.get(l.fund_id) ?? { fund_id: l.fund_id, total_debit: 0, total_credit: 0, line_count: 0 };
      if (l.debit_credit === 'DR') cur.total_debit += l.functional_amount;
      else cur.total_credit += l.functional_amount;
      cur.line_count++;
      actMap.set(l.fund_id, cur);
    }
    setActivity(Array.from(actMap.values()));
    setLoading(false);
  }, []);

  useEffect(() => { if (allowed) void load(); }, [allowed]);

  const enriched = useMemo(() => funds.map(f => {
    const act = activity.find(a => a.fund_id === f.id) ?? { total_debit: 0, total_credit: 0, line_count: 0 };
    const net = act.total_credit - act.total_debit;
    const partner = partners.find(p => p.id === f.donor_partner_id);
    return { ...f, ...act, net, partner };
  }), [funds, activity, partners]);

  const filtered = useMemo(() => enriched.filter(f => {
    if (typeFilter !== 'all' && f.restriction_type !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!f.code.toLowerCase().includes(q) && !f.name_en.toLowerCase().includes(q) && !(f.partner?.name.toLowerCase().includes(q) ?? false)) return false;
    }
    return true;
  }), [enriched, typeFilter, search]);

  const stats = useMemo(() => {
    const restricted = enriched.filter(f => f.restriction_type !== 'without_restriction');
    return {
      totalFunds: enriched.length,
      restricted: restricted.length,
      unrestricted: enriched.filter(f => f.restriction_type === 'without_restriction').length,
      totalNet: enriched.reduce((s, f) => s + f.net, 0),
    };
  }, [enriched]);

  const chartData = useMemo(() =>
    Object.entries(RESTRICTION_CFG).map(([key, cfg]) => {
      const group = enriched.filter(f => f.restriction_type === key);
      return {
        name: cfg.short,
        label: cfg.label,
        credit: group.reduce((s, f) => s + f.total_credit, 0),
        debit:  group.reduce((s, f) => s + f.total_debit,  0),
        net:    group.reduce((s, f) => s + f.net, 0),
        count:  group.length,
      };
    }).filter(d => d.count > 0),
    [enriched]
  );

  // Inter-fund eliminations: find funds with the same donor that have offsetting entries
  const eliminations = useMemo(() => {
    const byDonor = new Map<string, typeof enriched>();
    for (const f of enriched.filter(f => f.donor_partner_id)) {
      const cur = byDonor.get(f.donor_partner_id!) ?? [];
      cur.push(f);
      byDonor.set(f.donor_partner_id!, cur);
    }
    return Array.from(byDonor.entries())
      .filter(([, fds]) => fds.length > 1)
      .map(([donorId, fds]) => {
        const donor = partners.find(p => p.id === donorId);
        const totalDebit  = fds.reduce((s, f) => s + f.total_debit, 0);
        const totalCredit = fds.reduce((s, f) => s + f.total_credit, 0);
        const elimination = Math.min(totalDebit, totalCredit);
        return { donorId, donor: donor?.name ?? donorId, funds: fds, totalDebit, totalCredit, elimination };
      });
  }, [enriched, partners]);

  const exportCsv = () => {
    downloadCsv('donor_fund_report.csv', [
      ['Code', 'Name', 'Type', 'Donor', 'Total Debit', 'Total Credit', 'Net', 'Active'],
      ...filtered.map(f => [
        f.code, f.name_en, RESTRICTION_CFG[f.restriction_type]?.label ?? f.restriction_type,
        f.partner?.name ?? '', f.total_debit, f.total_credit, f.net, f.is_active ? 'Yes' : 'No',
      ]),
    ]);
  };

  if (authLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!allowed)   return <Navigate to="/" replace />;

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-[1100px]">
      <PageInfoBanner
        title="Donor-Restricted Fund Reporting"
        description="Track revenue and expenditure by fund type (unrestricted, donor-restricted, board-designated, quasi-endowment). Includes inter-fund elimination analysis for consolidated reporting."
        workflowSteps={['Tag Journal Lines to Fund', 'Review Fund Activity', 'Check Restrictions Compliance', 'Generate Elimination Entries']}
      />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Heart className="w-6 h-6 text-rose-600" /> Donor Fund Reports</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Restricted & unrestricted fund activity, compliance, and inter-fund eliminations.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} data-testid="button-refresh-donor"><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
          <Button variant="outline" size="sm" onClick={exportCsv} data-testid="button-export-donor"><Download className="w-4 h-4 mr-1" /> Export</Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Funds',   value: stats.totalFunds,                   color: 'text-blue-600',    bg: 'bg-blue-50 dark:bg-blue-950/30' },
          { label: 'Restricted',    value: stats.restricted,                   color: 'text-amber-600',   bg: 'bg-amber-50 dark:bg-amber-950/30' },
          { label: 'Unrestricted',  value: stats.unrestricted,                 color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
          { label: 'Consolidated Net', value: formatNumber(stats.totalNet),    color: stats.totalNet >= 0 ? 'text-emerald-600' : 'text-rose-600', bg: 'bg-muted/50' },
        ].map(s => (
          <div key={s.label} className={cn('rounded-xl border p-3', s.bg)}>
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={cn('text-2xl font-bold mt-1', s.color)}>{s.value}</p>
          </div>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="funds" data-testid="tab-funds">Fund Activity</TabsTrigger>
          <TabsTrigger value="chart" data-testid="tab-chart">By Restriction</TabsTrigger>
          <TabsTrigger value="eliminations" data-testid="tab-elim">Inter-Fund Eliminations</TabsTrigger>
        </TabsList>

        {/* Fund Activity Tab */}
        <TabsContent value="funds" className="space-y-3 mt-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search fund, code, donor…" className="pl-9 h-9 text-sm" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-donor" />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px] h-9" data-testid="select-type-donor"><SelectValue placeholder="All Types" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {Object.entries(RESTRICTION_CFG).map(([v, c]) => <SelectItem key={v} value={v}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Card className="border shadow-sm">
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" /></div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <Heart className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No funds found. Create funds in the Funds module.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 border-b">
                      <tr>
                        {['Code', 'Fund Name', 'Type', 'Donor', 'Total Debit', 'Total Credit', 'Net Balance', 'Active'].map(h => (
                          <th key={h} className="text-left text-xs font-medium text-muted-foreground px-4 py-2.5">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filtered.map(f => {
                        const rcfg = RESTRICTION_CFG[f.restriction_type] ?? RESTRICTION_CFG.without_restriction;
                        return (
                          <tr key={f.id} className="hover:bg-muted/30" data-testid={`row-donor-${f.id}`}>
                            <td className="px-4 py-3 font-mono text-xs font-semibold">{f.code}</td>
                            <td className="px-4 py-3">
                              <p className="font-medium text-sm">{f.name_en}</p>
                              {f.name_ar && <p className="text-xs text-muted-foreground" dir="rtl">{f.name_ar}</p>}
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className={cn('text-[10px]', rcfg.color)}>{rcfg.label}</Badge>
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">{f.partner?.name ?? '—'}</td>
                            <td className="px-4 py-3 font-mono text-xs text-rose-600">{f.total_debit > 0 ? formatNumber(f.total_debit) : '—'}</td>
                            <td className="px-4 py-3 font-mono text-xs text-emerald-600">{f.total_credit > 0 ? formatNumber(f.total_credit) : '—'}</td>
                            <td className={cn('px-4 py-3 font-mono text-sm font-bold', f.net >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                              {f.line_count > 0 ? formatNumber(f.net) : <span className="text-muted-foreground font-normal text-xs">No activity</span>}
                            </td>
                            <td className="px-4 py-3">
                              {f.is_active
                                ? <span className="text-[10px] text-emerald-600 font-medium">Active</span>
                                : <span className="text-[10px] text-muted-foreground">Inactive</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="border-t bg-muted/20">
                      <tr>
                        <td colSpan={4} className="px-4 py-2 text-xs font-semibold text-muted-foreground">Totals ({filtered.length} funds)</td>
                        <td className="px-4 py-2 font-mono text-xs font-bold text-rose-600">{formatNumber(filtered.reduce((s, f) => s + f.total_debit, 0))}</td>
                        <td className="px-4 py-2 font-mono text-xs font-bold text-emerald-600">{formatNumber(filtered.reduce((s, f) => s + f.total_credit, 0))}</td>
                        <td className={cn('px-4 py-2 font-mono text-sm font-bold', filtered.reduce((s, f) => s + f.net, 0) >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                          {formatNumber(filtered.reduce((s, f) => s + f.net, 0))}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Chart Tab */}
        <TabsContent value="chart" className="mt-3">
          <Card className="border shadow-sm">
            <CardHeader className="p-4 border-b">
              <CardTitle className="text-sm">Fund Activity by Restriction Type</CardTitle>
              <CardDescription className="text-xs">Aggregate debit, credit, and net balance grouped by restriction classification.</CardDescription>
            </CardHeader>
            <CardContent className="p-4">
              {chartData.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground text-sm">No fund activity data to display.</div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={chartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={v => formatNumber(v, 0)} />
                      <Tooltip formatter={(v: number) => formatNumber(v)} labelFormatter={l => `Type: ${l}`} />
                      <Legend />
                      <Bar dataKey="credit" name="Credit (Revenue)" fill="#10b981" radius={[3,3,0,0]} />
                      <Bar dataKey="debit"  name="Debit (Expense)"  fill="#f43f5e" radius={[3,3,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                    {chartData.map((d, i) => (
                      <div key={d.name} className="rounded-xl border p-3 text-center">
                        <p className="text-xs text-muted-foreground">{d.label}</p>
                        <p className={cn('text-lg font-bold mt-1', d.net >= 0 ? 'text-emerald-600' : 'text-rose-600')}>{formatNumber(d.net)}</p>
                        <p className="text-[10px] text-muted-foreground">{d.count} fund{d.count !== 1 ? 's' : ''}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Eliminations Tab */}
        <TabsContent value="eliminations" className="mt-3">
          <Card className="border shadow-sm">
            <CardHeader className="p-4 border-b">
              <CardTitle className="text-sm flex items-center gap-2"><Scale className="w-4 h-4 text-indigo-600" /> Inter-Fund Eliminations</CardTitle>
              <CardDescription className="text-xs">
                Donors with multiple funds. For consolidated reporting, inter-fund transfers between same-donor funds must be eliminated to avoid double-counting.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              {loading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin" /></div>
              ) : eliminations.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Scale className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No inter-fund eliminations required.</p>
                  <p className="text-xs mt-1">Eliminations are needed only when a single donor has multiple funds with offsetting activity.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {eliminations.map(e => (
                    <div key={e.donorId} className="rounded-xl border p-4 space-y-3" data-testid={`row-elim-${e.donorId}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-sm">{e.donor}</p>
                          <p className="text-xs text-muted-foreground">{e.funds.length} funds · Elimination required</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Elimination Amount</p>
                          <p className="text-lg font-bold text-indigo-600">{formatNumber(e.elimination)}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                        <div className="rounded bg-muted/40 p-2">
                          <p className="text-muted-foreground">Total Debit across funds</p>
                          <p className="font-bold text-rose-600 mt-0.5">{formatNumber(e.totalDebit)}</p>
                        </div>
                        <div className="rounded bg-muted/40 p-2">
                          <p className="text-muted-foreground">Total Credit across funds</p>
                          <p className="font-bold text-emerald-600 mt-0.5">{formatNumber(e.totalCredit)}</p>
                        </div>
                        <div className="rounded bg-indigo-50 dark:bg-indigo-950/20 p-2 border border-indigo-100">
                          <p className="text-indigo-600">Elimination entry needed</p>
                          <p className="font-bold text-indigo-700 mt-0.5">{formatNumber(e.elimination)}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {e.funds.map(f => {
                          const rcfg = RESTRICTION_CFG[f.restriction_type] ?? RESTRICTION_CFG.without_restriction;
                          return (
                            <Badge key={f.id} variant="outline" className={cn('text-[10px]', rcfg.color)}>
                              {f.code} · {rcfg.short} · net {formatNumber(f.net)}
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <div className="rounded-xl border border-blue-200 bg-blue-50/40 dark:border-blue-800/50 dark:bg-blue-950/10 p-4">
                    <p className="text-xs font-semibold text-blue-800 dark:text-blue-400 flex items-center gap-1.5 mb-1">
                      <Info className="w-3.5 h-3.5" /> How to post elimination entries
                    </p>
                    <p className="text-xs text-blue-700 dark:text-blue-500">
                      Go to <strong>Journal Entries</strong> and create a new entry with source type <code className="font-mono text-[10px]">inter_fund_elimination</code>.
                      Debit the receiving fund and credit the sending fund for the elimination amount. This removes double-counting in the consolidated income statement.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
