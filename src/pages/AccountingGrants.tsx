import { useEffect, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2, Award, RefreshCw, Download, Plus, AlertTriangle, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { format, parseISO, differenceInDays, isAfter } from 'date-fns';
import { formatNumber, downloadCsv } from '@/lib/accountingFormat';
import { cn } from '@/lib/utils';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';
import { useToast } from '@/hooks/use-toast';

interface Grant {
  id: string; grant_name: string; donor_name: string; reference_number: string | null;
  award_amount: number; currency: string; start_date: string; end_date: string;
  reporting_frequency: string; status: string; description: string | null;
  fund_id: string | null; created_at: string;
}

interface GrantWithSpend extends Grant { spent: number; remaining: number; burnRate: number; daysLeft: number }

const STATUS_BADGE: Record<string, { label: string; class: string; icon: React.ElementType }> = {
  active:        { label: 'Active',         class: 'bg-emerald-100 text-emerald-700 border-emerald-300', icon: CheckCircle2 },
  expiring_soon: { label: 'Expiring Soon',  class: 'bg-amber-100 text-amber-700 border-amber-300',     icon: Clock },
  expired:       { label: 'Expired',        class: 'bg-rose-100 text-rose-700 border-rose-300',         icon: XCircle },
  draft:         { label: 'Draft',          class: 'bg-slate-100 text-slate-600 border-slate-300',      icon: Clock },
  closed:        { label: 'Closed',         class: 'bg-slate-100 text-slate-600 border-slate-300',      icon: XCircle },
};

const MIGRATION_NOTICE = (
  <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/10 p-4 flex items-start gap-3">
    <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
    <div>
      <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Migration required</p>
      <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
        Run <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">supabase/migrations/20260502_acct_phase5_expansion.sql</code> to enable Grant Tracking.
      </p>
    </div>
  </div>
);

export default function AccountingGrants() {
  const { hasAnyRole, loading: authLoading } = useAuthorization();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);
  const canEdit = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin']);
  const { toast } = useToast();

  const [grants, setGrants] = useState<GrantWithSpend[]>([]);
  const [loading, setLoading] = useState(true);
  const [migrationNeeded, setMigrationNeeded] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ grant_name: '', donor_name: '', reference_number: '', award_amount: '', currency: 'USD', start_date: '', end_date: '', reporting_frequency: 'quarterly', status: 'active', description: '' });

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('acct_grants' as any).select('*').order('end_date', { ascending: true }).limit(500);
    if (error?.code === '42P01') { setMigrationNeeded(true); setLoading(false); return; }
    setMigrationNeeded(false);
    const today = new Date();
    const rows: GrantWithSpend[] = ((data ?? []) as Grant[]).map(g => {
      const daysLeft = differenceInDays(parseISO(g.end_date), today);
      let computedStatus = g.status;
      if (g.status === 'active') {
        if (daysLeft < 0) computedStatus = 'expired';
        else if (daysLeft <= 30) computedStatus = 'expiring_soon';
      }
      return { ...g, status: computedStatus, spent: 0, remaining: g.award_amount, burnRate: 0, daysLeft };
    });

    const spendRes = await supabase.from('acct_grant_expenses' as any).select('grant_id, amount').limit(50000).catch(() => ({ data: null, error: null }));
    const spendMap: Record<string, number> = {};
    for (const s of (spendRes.data ?? []) as any[]) spendMap[s.grant_id] = (spendMap[s.grant_id] ?? 0) + Number(s.amount ?? 0);
    const enriched = rows.map(g => {
      const spent = spendMap[g.id] ?? 0;
      const elapsed = Math.max(1, differenceInDays(today, parseISO(g.start_date)));
      const total = Math.max(1, differenceInDays(parseISO(g.end_date), parseISO(g.start_date)));
      const burnRate = g.award_amount > 0 ? Math.round((spent / g.award_amount) * 100) : 0;
      return { ...g, spent, remaining: g.award_amount - spent, burnRate };
    });
    setGrants(enriched);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = grants.filter(g => {
    if (statusFilter !== 'all' && g.status !== statusFilter) return false;
    const q = search.toLowerCase();
    return !q || g.grant_name.toLowerCase().includes(q) || g.donor_name.toLowerCase().includes(q) || (g.reference_number ?? '').toLowerCase().includes(q);
  });

  const totals = { awarded: grants.reduce((s, g) => s + g.award_amount, 0), spent: grants.reduce((s, g) => s + g.spent, 0), active: grants.filter(g => g.status === 'active').length, expiring: grants.filter(g => g.status === 'expiring_soon').length };

  const saveGrant = async () => {
    if (!form.grant_name || !form.donor_name || !form.award_amount || !form.start_date || !form.end_date) {
      toast({ title: 'Required fields missing', variant: 'destructive' }); return;
    }
    setSaving(true);
    const { error } = await supabase.from('acct_grants' as any).insert({ ...form, award_amount: parseFloat(form.award_amount) });
    setSaving(false);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Grant added' });
    setShowAdd(false);
    setForm({ grant_name: '', donor_name: '', reference_number: '', award_amount: '', currency: 'USD', start_date: '', end_date: '', reporting_frequency: 'quarterly', status: 'active', description: '' });
    void load();
  };

  const exportCsv = () => {
    const header = ['Grant Name', 'Donor', 'Reference', 'Award Amount', 'Currency', 'Spent', 'Remaining', 'Burn Rate %', 'Start Date', 'End Date', 'Status'];
    const body = filtered.map(g => [g.grant_name, g.donor_name, g.reference_number ?? '', g.award_amount.toFixed(2), g.currency, g.spent.toFixed(2), g.remaining.toFixed(2), `${g.burnRate}%`, g.start_date, g.end_date, g.status]);
    downloadCsv(`grants-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...body]);
  };

  if (authLoading) return <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!allowed) return <Navigate to="/" replace />;

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl" data-testid="grants-page">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-amber-600 text-white shrink-0"><Award className="h-5 w-5" /></div>
          <div>
            <h1 className="text-2xl font-bold">Grant Tracking</h1>
            <p className="text-muted-foreground text-sm">تتبع المنح — Donor grant registry & spend monitoring</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw className={cn('h-4 w-4 mr-1', loading && 'animate-spin')} />Refresh</Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered.length}><Download className="h-4 w-4 mr-1" />CSV</Button>
          {canEdit && !migrationNeeded && <Button size="sm" onClick={() => setShowAdd(true)} data-testid="button-add-grant"><Plus className="h-4 w-4 mr-1" />Add Grant</Button>}
        </div>
      </div>

      <PageInfoBanner title="Grant Tracking" description="Monitor donor grants: awarded vs spent vs remaining, burn rate, and expiry. Link journal entries to grants via acct_grant_expenses. Expiring Soon = ≤30 days to end date." descriptionAr="مراقبة المنح: المبلغ الممنوح مقابل المنفق والمتبقي ومعدل الصرف." />

      {migrationNeeded ? MIGRATION_NOTICE : loading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            {[
              { label: 'Total Awarded', v: formatNumber(totals.awarded, 0), color: 'text-indigo-700 dark:text-indigo-400' },
              { label: 'Total Spent', v: formatNumber(totals.spent, 0), color: 'text-slate-700 dark:text-slate-300' },
              { label: 'Active Grants', v: String(totals.active), color: 'text-emerald-700 dark:text-emerald-400' },
              { label: 'Expiring Soon', v: String(totals.expiring), color: totals.expiring > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-slate-500' },
            ].map(s => (
              <Card key={s.label}><CardContent className="p-3"><div className="text-xs text-muted-foreground">{s.label}</div><div className={cn('text-lg font-bold mt-1', s.color)}>{s.v}</div></CardContent></Card>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <Input className="h-9 text-sm max-w-xs" placeholder="Search grants..." value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-40" data-testid="select-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="expiring_soon">Expiring Soon</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filtered.length === 0 ? (
            <div className="text-center text-muted-foreground py-16 text-sm">{grants.length === 0 ? 'No grants yet. Add your first grant to start tracking.' : 'No grants match the current filters.'}</div>
          ) : (
            <Card>
              <CardContent className="px-0 pb-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground">Grant / Donor</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground w-24">Reference</th>
                        <th className="text-right px-4 py-2 font-medium text-muted-foreground w-28">Awarded</th>
                        <th className="text-right px-4 py-2 font-medium text-muted-foreground w-28">Spent</th>
                        <th className="text-right px-4 py-2 font-medium text-muted-foreground w-28">Remaining</th>
                        <th className="text-right px-4 py-2 font-medium text-muted-foreground w-20">Burn %</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground w-24">End Date</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground w-28">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((g, i) => {
                        const meta = STATUS_BADGE[g.status] ?? STATUS_BADGE['draft'];
                        const Icon = meta.icon;
                        return (
                          <tr key={g.id} className={cn('border-b hover:bg-muted/20', i % 2 === 0 ? '' : 'bg-muted/10')} data-testid={`row-grant-${g.id}`}>
                            <td className="px-4 py-2.5">
                              <div className="font-medium">{g.grant_name}</div>
                              <div className="text-muted-foreground">{g.donor_name}</div>
                            </td>
                            <td className="px-4 py-2.5 font-mono text-muted-foreground">{g.reference_number ?? '—'}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums font-medium">{formatNumber(g.award_amount, 0)} <span className="text-muted-foreground">{g.currency}</span></td>
                            <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(g.spent, 0)}</td>
                            <td className={cn('px-4 py-2.5 text-right tabular-nums font-medium', g.remaining < 0 ? 'text-rose-700' : 'text-emerald-700')}>{formatNumber(g.remaining, 0)}</td>
                            <td className="px-4 py-2.5 text-right">
                              <span className={cn('font-semibold', g.burnRate > 100 ? 'text-rose-700' : g.burnRate >= 80 ? 'text-amber-700' : 'text-emerald-700')}>{g.burnRate}%</span>
                              <div className="mt-0.5 h-1 w-14 rounded-full bg-muted overflow-hidden inline-block ml-1 align-middle">
                                <div className={cn('h-full rounded-full', g.burnRate > 100 ? 'bg-rose-500' : g.burnRate >= 80 ? 'bg-amber-500' : 'bg-emerald-500')} style={{ width: `${Math.min(g.burnRate, 100)}%` }} />
                              </div>
                            </td>
                            <td className={cn('px-4 py-2.5', g.daysLeft <= 30 && g.daysLeft >= 0 ? 'text-amber-700 font-medium' : g.daysLeft < 0 ? 'text-rose-700' : '')}>
                              {format(parseISO(g.end_date), 'dd MMM yyyy')}
                              {g.daysLeft >= 0 && <div className="text-[10px] text-muted-foreground">{g.daysLeft}d left</div>}
                            </td>
                            <td className="px-4 py-2.5">
                              <Badge variant="outline" className={cn('text-[10px] gap-1', meta.class)}>
                                <Icon className="h-3 w-3" />{meta.label}
                              </Badge>
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
        </>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Grant</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            {[
              { key: 'grant_name', label: 'Grant Name *', span: 2 },
              { key: 'donor_name', label: 'Donor Name *', span: 1 },
              { key: 'reference_number', label: 'Reference No.', span: 1 },
              { key: 'award_amount', label: 'Award Amount *', span: 1, type: 'number' },
              { key: 'currency', label: 'Currency', span: 1 },
              { key: 'start_date', label: 'Start Date *', span: 1, type: 'date' },
              { key: 'end_date', label: 'End Date *', span: 1, type: 'date' },
            ].map(f => (
              <div key={f.key} className={f.span === 2 ? 'col-span-2' : ''}>
                <Label className="text-xs mb-1 block">{f.label}</Label>
                <Input type={f.type ?? 'text'} value={(form as any)[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} className="h-8 text-sm" data-testid={`input-${f.key}`} />
              </div>
            ))}
            <div>
              <Label className="text-xs mb-1 block">Reporting Frequency</Label>
              <Select value={form.reporting_frequency} onValueChange={v => setForm(p => ({ ...p, reporting_frequency: v }))}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="semi_annual">Semi-Annual</SelectItem>
                  <SelectItem value="annual">Annual</SelectItem>
                  <SelectItem value="ad_hoc">Ad Hoc</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Status</Label>
              <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label className="text-xs mb-1 block">Description</Label>
              <Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="h-8 text-sm" data-testid="input-description" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={saveGrant} disabled={saving} data-testid="button-save-grant">
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save Grant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
