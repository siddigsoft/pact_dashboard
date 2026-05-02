import { useEffect, useMemo, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Loader2, Package, Plus, Download, RefreshCw, Pencil, Search, Trash2, TrendingDown, Calendar, AlertTriangle, X, Banknote, FileX2, TableProperties } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { format, parseISO, differenceInMonths, addMonths } from 'date-fns';
import { formatNumber, downloadCsv } from '@/lib/accountingFormat';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';

interface Asset {
  id: string; asset_tag: string | null; name_en: string; name_ar: string | null; category: string;
  country_id: string | null; location: string | null; acquisition_date: string;
  acquisition_cost: number; currency: string; useful_life_months: number; salvage_value: number;
  depreciation_method: string; status: string; disposal_date: string | null;
  disposal_proceeds: number | null; notes: string | null; serial_number: string | null;
  supplier: string | null; warranty_expiry: string | null; created_at: string;
}
interface Country { id: string; code: string; name_en: string; flag_emoji: string | null }

const CATEGORIES = ['equipment', 'furniture', 'vehicle', 'building', 'it_hardware', 'software', 'other'];
const DEP_METHODS = [{ v: 'straight_line', l: 'Straight Line' }, { v: 'declining_balance', l: 'Declining Balance (20%)' }];
const STATUS_OPTIONS = ['active', 'disposed', 'written_off', 'under_repair', 'transferred'];

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30',
  disposed: 'bg-slate-100 text-slate-600',
  written_off: 'bg-rose-100 text-rose-800',
  under_repair: 'bg-amber-100 text-amber-800',
  transferred: 'bg-blue-100 text-blue-800',
};
const CAT_ICONS: Record<string, string> = { vehicle: '🚗', building: '🏢', it_hardware: '💻', software: '💿', equipment: '⚙️', furniture: '🪑', other: '📦' };

function calcDepreciation(asset: Asset, asOfDate: Date): { monthlyDep: number; accumulated: number; bookValue: number; depreciationPct: number } {
  const cost = Number(asset.acquisition_cost);
  const salvage = Number(asset.salvage_value);
  const life = asset.useful_life_months;
  const acquired = new Date(asset.acquisition_date);
  const monthsElapsed = Math.min(Math.max(0, differenceInMonths(asOfDate, acquired)), life);

  let accumulated = 0;
  let monthlyDep = 0;

  if (asset.depreciation_method === 'straight_line') {
    monthlyDep = (cost - salvage) / life;
    accumulated = monthlyDep * monthsElapsed;
  } else if (asset.depreciation_method === 'declining_balance') {
    const rate = 0.20 / 12;
    let bv = cost;
    for (let m = 0; m < monthsElapsed; m++) {
      const dep = bv * rate;
      accumulated += dep;
      bv -= dep;
      if (bv <= salvage) { accumulated = cost - salvage; break; }
    }
    monthlyDep = (cost - salvage) / life;
  }

  accumulated = Math.min(accumulated, cost - salvage);
  const bookValue = Math.max(cost - accumulated, salvage);
  const depreciationPct = cost > 0 ? Math.round((accumulated / (cost - salvage)) * 100) : 0;
  return { monthlyDep, accumulated, bookValue, depreciationPct };
}

const BLANK: Partial<Asset> = { name_en: '', name_ar: '', category: 'equipment', currency: 'USD', acquisition_date: new Date().toISOString().slice(0, 10), acquisition_cost: 0, useful_life_months: 60, salvage_value: 0, depreciation_method: 'straight_line', status: 'active', location: '', serial_number: '', supplier: '', notes: '' };

export default function AccountingFixedAssets() {
  const { hasAnyRole, loading: authLoading } = useAuthorization();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);
  const canEdit = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant']);
  const { toast } = useToast();

  const [assets, setAssets] = useState<Asset[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('active');
  const [countryFilter, setCountryFilter] = useState('all');
  const [dialog, setDialog] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [form, setForm] = useState<Partial<Asset>>(BLANK);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Asset | null>(null);
  const [depRunDialog, setDepRunDialog] = useState(false);
  const [depRunBusy, setDepRunBusy] = useState(false);
  const [depRunStart, setDepRunStart] = useState(() => new Date().toISOString().slice(0, 7) + '-01');
  const [depRunEnd, setDepRunEnd] = useState(() => { const d = new Date(); d.setDate(new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()); return d.toISOString().slice(0, 10); });
  const [depRunResults, setDepRunResults] = useState<{ asset: string; amount: number; entryId: string | null; error: string | null }[]>([]);
  const [disposeDialog, setDisposeDialog] = useState(false);
  const [disposeTarget, setDisposeTarget] = useState<Asset | null>(null);
  const [disposeForm, setDisposeForm] = useState({ date: '', method: 'scrap', proceeds: '0', notes: '' });
  const [disposing, setDisposing] = useState(false);
  const [writeOffDialog, setWriteOffDialog] = useState(false);
  const [writeOffTarget, setWriteOffTarget] = useState<Asset | null>(null);
  const [writeOffReason, setWriteOffReason] = useState('');
  const [writingOff, setWritingOff] = useState(false);
  const [assetDetailTab, setAssetDetailTab] = useState<'details' | 'schedule'>('details');
  const today = useMemo(() => new Date(), []);

  const loadAssets = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [aRes, cRes] = await Promise.all([
      supabase.from('acct_fixed_assets').select('*').order('acquisition_date', { ascending: false }),
      supabase.from('countries').select('id, code, name_en, flag_emoji').eq('is_active', true).order('name_en'),
    ]);
    if (aRes.error && aRes.error.code !== '42P01') setError(aRes.error.message);
    setAssets((aRes.data ?? []) as Asset[]);
    setCountries((cRes.data ?? []) as Country[]);
    setLoading(false);
  }, []);

  useEffect(() => { void loadAssets(); }, [loadAssets]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return assets.filter(a => {
      if (catFilter !== 'all' && a.category !== catFilter) return false;
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (countryFilter !== 'all' && a.country_id !== countryFilter) return false;
      if (q) return a.name_en.toLowerCase().includes(q) || (a.asset_tag ?? '').toLowerCase().includes(q) || (a.serial_number ?? '').toLowerCase().includes(q);
      return true;
    });
  }, [assets, search, catFilter, statusFilter, countryFilter]);

  const summaryStats = useMemo(() => {
    const active = assets.filter(a => a.status === 'active');
    const totalCost = active.reduce((s, a) => s + Number(a.acquisition_cost), 0);
    const totalAccumDep = active.reduce((s, a) => { const { accumulated } = calcDepreciation(a, today); return s + accumulated; }, 0);
    const totalBookValue = active.reduce((s, a) => { const { bookValue } = calcDepreciation(a, today); return s + bookValue; }, 0);
    const nearingEnd = active.filter(a => { const end = addMonths(new Date(a.acquisition_date), a.useful_life_months); return differenceInMonths(end, today) <= 3 && differenceInMonths(end, today) >= 0; }).length;
    return { count: active.length, totalCost, totalAccumDep, totalBookValue, nearingEnd };
  }, [assets, today]);

  const catChartData = useMemo(() => {
    const m: Record<string, number> = {};
    assets.filter(a => a.status === 'active').forEach(a => {
      const { bookValue } = calcDepreciation(a, today);
      m[a.category] = (m[a.category] ?? 0) + bookValue;
    });
    return Object.entries(m).map(([cat, v]) => ({ name: cat.replace('_', ' '), value: Math.round(v) })).sort((a, b) => b.value - a.value);
  }, [assets, today]);

  const openDialog = (a?: Asset) => {
    setEditingAsset(a ?? null);
    setForm(a ? { ...a } : { ...BLANK, country_id: '' });
    setDialog(true);
  };

  const save = async () => {
    if (!form.name_en || !form.acquisition_date) return;
    setSaving(true);
    const payload: any = { name_en: form.name_en, name_ar: form.name_ar || null, category: form.category ?? 'equipment', country_id: form.country_id || null, location: form.location || null, acquisition_date: form.acquisition_date, acquisition_cost: Number(form.acquisition_cost ?? 0), currency: form.currency || 'USD', useful_life_months: Number(form.useful_life_months ?? 60), salvage_value: Number(form.salvage_value ?? 0), depreciation_method: form.depreciation_method ?? 'straight_line', status: form.status ?? 'active', serial_number: form.serial_number || null, supplier: form.supplier || null, warranty_expiry: form.warranty_expiry || null, notes: form.notes || null };
    const { error: err } = editingAsset
      ? await supabase.from('acct_fixed_assets').update(payload).eq('id', editingAsset.id)
      : await supabase.from('acct_fixed_assets').insert(payload);
    if (err) { toast({ title: 'Error', description: err.message, variant: 'destructive' }); setSaving(false); return; }
    toast({ title: editingAsset ? 'Asset updated' : 'Asset added' });
    setDialog(false);
    await loadAssets();
    setSaving(false);
  };

  const runDepreciation = async () => {
    const active = assets.filter(a => a.status === 'active');
    if (!active.length) { toast({ title: 'No active assets found', variant: 'destructive' }); return; }
    setDepRunBusy(true);
    setDepRunResults([]);
    const periodStart = new Date(depRunStart);
    const periodEnd = new Date(depRunEnd);
    const monthsFraction = Math.max(0.01, (periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
    const results: typeof depRunResults = [];
    for (const asset of active) {
      try {
        const { monthlyDep } = calcDepreciation(asset, today);
        const depAmount = Math.round(monthlyDep * monthsFraction * 100) / 100;
        if (depAmount < 0.01) { results.push({ asset: asset.name_en, amount: 0, entryId: null, error: 'Zero depreciation — fully depreciated or zero cost' }); continue; }
        const { data: entry, error: eErr } = await supabase.from('acct_journal_entries').insert({
          description_en: `Depreciation — ${asset.name_en} (${depRunStart.slice(0, 7)})`,
          description_ar: `استهلاك — ${asset.name_ar ?? asset.name_en}`,
          entry_date: depRunStart,
          posting_date: depRunEnd,
          status: 'draft',
          total_debit: depAmount,
          total_credit: depAmount,
        }).select('id').single();
        if (eErr) throw new Error(eErr.message);
        if (entry && asset.dep_account_id) {
          await supabase.from('acct_journal_lines').insert([
            { journal_entry_id: entry.id, account_id: asset.dep_account_id, debit_credit: 'DR', amount: depAmount, functional_amount: depAmount, functional_currency: asset.currency, description: `Dep expense — ${asset.name_en}` },
            { journal_entry_id: entry.id, account_id: asset.dep_account_id, debit_credit: 'CR', amount: depAmount, functional_amount: depAmount, functional_currency: asset.currency, description: `Accum dep — ${asset.name_en}` },
          ]);
        }
        results.push({ asset: asset.name_en, amount: depAmount, entryId: entry?.id ?? null, error: null });
      } catch (e: any) { results.push({ asset: asset.name_en, amount: 0, entryId: null, error: e.message }); }
    }
    setDepRunResults(results);
    setDepRunBusy(false);
    const ok = results.filter(r => !r.error).length;
    toast({ title: `Depreciation run complete — ${ok}/${active.length} entries created` });
  };

  const exportCsv = () => {
    const header = ['Tag', 'Name', 'Category', 'Acquisition Date', 'Cost', 'Currency', 'Book Value', 'Dep %', 'Status', 'Location'];
    const rows = filtered.map(a => {
      const { bookValue, depreciationPct } = calcDepreciation(a, today);
      return [a.asset_tag ?? '', a.name_en, a.category, a.acquisition_date, a.acquisition_cost.toFixed(2), a.currency, bookValue.toFixed(2), `${depreciationPct}%`, a.status, a.location ?? ''];
    });
    downloadCsv(`fixed-assets-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows]);
  };

  const openDispose = (a: Asset, e: React.MouseEvent) => {
    e.stopPropagation();
    setDisposeTarget(a);
    setDisposeForm({ date: new Date().toISOString().slice(0, 10), method: 'scrap', proceeds: '0', notes: '' });
    setDisposeDialog(true);
  };

  const handleDispose = async () => {
    if (!disposeTarget) return;
    setDisposing(true);
    const addedNote = `Disposal (${disposeForm.method})${disposeForm.notes ? ': ' + disposeForm.notes : ''}`;
    const notes = [disposeTarget.notes, addedNote].filter(Boolean).join('\n');
    const { error } = await supabase.from('acct_fixed_assets').update({
      status: 'disposed',
      disposal_date: disposeForm.date,
      disposal_proceeds: Number(disposeForm.proceeds) || null,
      notes,
    }).eq('id', disposeTarget.id);
    if (error) {
      toast({ title: 'Disposal failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Asset disposed', description: `${disposeTarget.name_en} marked as disposed` });
      setDisposeDialog(false);
      setDisposeTarget(null);
      if (selected?.id === disposeTarget.id) setSelected(null);
      void loadAssets();
    }
    setDisposing(false);
  };

  const openWriteOff = (a: Asset, e: React.MouseEvent) => {
    e.stopPropagation();
    setWriteOffTarget(a);
    setWriteOffReason('');
    setWriteOffDialog(true);
  };

  const handleWriteOff = async () => {
    if (!writeOffTarget) return;
    setWritingOff(true);
    const notes = [writeOffTarget.notes, `Written off${writeOffReason ? ': ' + writeOffReason : ''}`].filter(Boolean).join('\n');
    const { error } = await supabase.from('acct_fixed_assets').update({ status: 'written_off', notes }).eq('id', writeOffTarget.id);
    if (error) {
      toast({ title: 'Write-off failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Asset written off', description: writeOffTarget.name_en });
      setWriteOffDialog(false);
      setWriteOffTarget(null);
      if (selected?.id === writeOffTarget.id) setSelected(null);
      void loadAssets();
    }
    setWritingOff(false);
  };

  function generateDepSchedule(asset: Asset) {
    const cost = Number(asset.acquisition_cost);
    const salvage = Number(asset.salvage_value);
    const life = asset.useful_life_months;
    const acquired = new Date(asset.acquisition_date);
    const rows: { label: string; dep: number; accum: number; bookValue: number }[] = [];
    let accumulated = 0;
    for (let m = 0; m < life; m++) {
      let dep = 0;
      if (asset.depreciation_method === 'straight_line') {
        dep = (cost - salvage) / life;
      } else {
        dep = Math.max(0, (cost - accumulated) * (0.20 / 12));
      }
      dep = Math.min(dep, Math.max(0, cost - salvage - accumulated));
      accumulated = Math.round((accumulated + dep) * 100) / 100;
      const bv = Math.max(Math.round((cost - accumulated) * 100) / 100, salvage);
      const date = addMonths(acquired, m + 1);
      rows.push({ label: format(date, 'MMM yyyy'), dep: Math.round(dep * 100) / 100, accum: accumulated, bookValue: bv });
      if (accumulated >= cost - salvage - 0.01) break;
    }
    return rows;
  }

  if (authLoading) return <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!allowed) return <Navigate to="/" replace />;

  const DepBar = ({ asset }: { asset: Asset }) => {
    const { depreciationPct, bookValue, accumulated, monthlyDep } = calcDepreciation(asset, today);
    const color = depreciationPct >= 90 ? 'bg-rose-500' : depreciationPct >= 70 ? 'bg-amber-500' : 'bg-emerald-500';
    return (
      <div>
        <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
          <span>Book Value: {formatNumber(bookValue)} {asset.currency}</span>
          <span>{depreciationPct}% depreciated</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${Math.min(depreciationPct, 100)}%` }} />
        </div>
        <div className="text-[10px] text-muted-foreground mt-1">Monthly: {formatNumber(monthlyDep)} · Accumulated: {formatNumber(accumulated)}</div>
      </div>
    );
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl" data-testid="fixed-assets-page">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-slate-700 text-white shrink-0">
            <Package className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Fixed Assets Register</h1>
            <p className="text-muted-foreground text-sm">سجل الأصول الثابتة — Asset tracking and depreciation</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadAssets} disabled={loading} data-testid="button-refresh"><RefreshCw className={cn('h-4 w-4 mr-1', loading && 'animate-spin')} />Refresh</Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered.length} data-testid="button-export"><Download className="h-4 w-4 mr-1" />CSV</Button>
          {canEdit && <Button variant="outline" size="sm" onClick={() => { setDepRunResults([]); setDepRunDialog(true); }} disabled={assets.filter(a => a.status === 'active').length === 0} data-testid="button-run-dep"><TrendingDown className="h-4 w-4 mr-1" />Run Depreciation</Button>}
          {canEdit && <Button size="sm" onClick={() => openDialog()} data-testid="button-add"><Plus className="h-4 w-4 mr-1" />Add Asset</Button>}
        </div>
      </div>

      <PageInfoBanner
        title="Fixed Assets Register"
        description="Track organizational assets with automatic depreciation calculation (straight-line or declining balance). Book value updates in real time. Run supabase/fixed_assets_migration.sql to activate this page."
        descriptionAr="تتبع أصول المنظمة مع احتساب الاستهلاك تلقائياً (القسط الثابت أو المتناقص). تتحدث القيمة الدفترية في الوقت الفعلي."
      />

      {error && <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive mb-4">{error}</div>}

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Active Assets', v: summaryStats.count, suffix: 'assets', color: 'text-slate-700' },
          { label: 'Total Acquisition Cost', v: summaryStats.totalCost, suffix: '', color: 'text-slate-700' },
          { label: 'Total Book Value', v: summaryStats.totalBookValue, suffix: '', color: 'text-indigo-700' },
          { label: 'Nearing End of Life', v: summaryStats.nearingEnd, suffix: '≤3 months', color: summaryStats.nearingEnd > 0 ? 'text-amber-700' : 'text-muted-foreground' },
        ].map(s => (
          <Card key={s.label}><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">{s.label}</div>
            <div className={cn('font-bold text-lg tabular-nums mt-0.5', s.color)}>
              {typeof s.v === 'number' && s.label !== 'Active Assets' && s.label !== 'Nearing End of Life' ? formatNumber(s.v) : s.v}
              {s.suffix && <span className="text-xs font-normal text-muted-foreground ml-1">{s.suffix}</span>}
            </div>
          </CardContent></Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="mb-4">
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="relative flex-1 min-w-40">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input className="pl-8 h-9 text-sm" placeholder="Search name, tag, serial..." value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search" />
            </div>
            <Select value={catFilter} onValueChange={setCatFilter}>
              <SelectTrigger className="w-36 h-9" data-testid="select-category"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {CATEGORIES.map(c => <SelectItem key={c} value={c}>{CAT_ICONS[c]} {c.replace('_', ' ')}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36 h-9" data-testid="select-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={countryFilter} onValueChange={setCountryFilter}>
              <SelectTrigger className="w-40 h-9" data-testid="select-country"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Countries</SelectItem>
                {countries.map(c => <SelectItem key={c.id} value={c.id}>{c.flag_emoji ?? ''} {c.name_en}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Asset list */}
        <div className="lg:col-span-2 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center h-40"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-muted-foreground py-10 text-sm">
              {assets.length === 0 ? 'No assets found. Run fixed_assets_migration.sql first, then add your first asset.' : 'No assets match the current filters.'}
            </div>
          ) : filtered.map(asset => {
            const { bookValue, depreciationPct } = calcDepreciation(asset, today);
            const endDate = addMonths(new Date(asset.acquisition_date), asset.useful_life_months);
            const isNearingEnd = differenceInMonths(endDate, today) <= 3 && asset.status === 'active';
            return (
              <div key={asset.id} onClick={() => setSelected(asset.id === selected?.id ? null : asset)} className={cn('border rounded-lg p-3 cursor-pointer transition-all hover:shadow-sm', selected?.id === asset.id ? 'border-slate-500 bg-slate-50 dark:bg-slate-900/30' : 'hover:border-slate-300')} data-testid={`asset-card-${asset.id}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold">{CAT_ICONS[asset.category]} {asset.name_en}</span>
                      {asset.asset_tag && <span className="text-[10px] font-mono text-muted-foreground">{asset.asset_tag}</span>}
                      {isNearingEnd && <Badge className="text-[10px] bg-amber-100 text-amber-800 border-amber-200"><AlertTriangle className="h-2.5 w-2.5 mr-0.5" />End of life</Badge>}
                    </div>
                    {asset.name_ar && <div className="text-[11px] text-muted-foreground" dir="rtl">{asset.name_ar}</div>}
                    <div className="flex items-center gap-2 mt-1 flex-wrap text-[10px] text-muted-foreground">
                      <span>{format(parseISO(asset.acquisition_date), 'MMM yyyy')}</span>
                      <span>{formatNumber(asset.acquisition_cost)} {asset.currency}</span>
                      {asset.location && <span>📍 {asset.location}</span>}
                    </div>
                    <div className="mt-2"><DepBar asset={asset} /></div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge className={cn('text-[10px]', STATUS_BADGE[asset.status] ?? '')}>{asset.status}</Badge>
                    <div className="flex gap-0.5">
                      {canEdit && <Button variant="ghost" size="icon" className="h-6 w-6" onClick={e => { e.stopPropagation(); openDialog(asset); }} data-testid={`button-edit-${asset.id}`}><Pencil className="h-3 w-3" /></Button>}
                      {canEdit && asset.status === 'active' && (
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-amber-600 hover:text-amber-700 hover:bg-amber-50" onClick={e => openDispose(asset, e)} title="Dispose asset" data-testid={`button-dispose-${asset.id}`}><Banknote className="h-3 w-3" /></Button>
                      )}
                      {canEdit && asset.status === 'active' && (
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-rose-600 hover:text-rose-700 hover:bg-rose-50" onClick={e => openWriteOff(asset, e)} title="Write off asset" data-testid={`button-writeoff-${asset.id}`}><FileX2 className="h-3 w-3" /></Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground text-center pt-1">{filtered.length} asset{filtered.length !== 1 ? 's' : ''}</p>
        </div>

        {/* Right panel: chart or asset detail */}
        <div className="space-y-4">
          {selected ? (
            <Card>
              <CardHeader className="pb-0 pt-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-sm">{CAT_ICONS[selected.category]} {selected.name_en}</CardTitle>
                  <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                </div>
              </CardHeader>
              <CardContent className="pt-2 pb-3">
                <Tabs value={assetDetailTab} onValueChange={v => setAssetDetailTab(v as any)}>
                  <TabsList className="w-full mb-3 h-8">
                    <TabsTrigger value="details" className="flex-1 text-xs h-7">Details</TabsTrigger>
                    <TabsTrigger value="schedule" className="flex-1 text-xs h-7"><TableProperties className="h-3 w-3 mr-1" />Schedule</TabsTrigger>
                  </TabsList>
                  <TabsContent value="details" className="mt-0">
                    <div className="text-xs space-y-2">
                      {[
                        { l: 'Tag', v: selected.asset_tag ?? '—' },
                        { l: 'Serial No.', v: selected.serial_number ?? '—' },
                        { l: 'Supplier', v: selected.supplier ?? '—' },
                        { l: 'Acquired', v: format(parseISO(selected.acquisition_date), 'dd MMM yyyy') },
                        { l: 'Cost', v: `${formatNumber(selected.acquisition_cost)} ${selected.currency}` },
                        { l: 'Salvage Value', v: `${formatNumber(selected.salvage_value)} ${selected.currency}` },
                        { l: 'Useful Life', v: `${selected.useful_life_months} months` },
                        { l: 'Method', v: DEP_METHODS.find(d => d.v === selected.depreciation_method)?.l ?? selected.depreciation_method },
                        { l: 'Warranty', v: selected.warranty_expiry ? format(parseISO(selected.warranty_expiry), 'dd MMM yyyy') : '—' },
                        { l: 'Location', v: selected.location ?? '—' },
                        { l: 'Status', v: selected.status },
                      ].map(r => (
                        <div key={r.l} className="flex justify-between border-b pb-1">
                          <span className="text-muted-foreground">{r.l}</span>
                          <span className="font-medium">{r.v}</span>
                        </div>
                      ))}
                      <div className="pt-1"><DepBar asset={selected} /></div>
                      {selected.notes && <div className="text-muted-foreground italic pt-1 text-[10px]">{selected.notes}</div>}
                      {canEdit && selected.status === 'active' && (
                        <div className="flex gap-2 pt-2">
                          <Button size="sm" variant="outline" className="flex-1 h-7 text-[10px] text-amber-700 border-amber-200 hover:bg-amber-50" onClick={e => openDispose(selected, e)} data-testid="button-panel-dispose"><Banknote className="h-3 w-3 mr-1" />Dispose</Button>
                          <Button size="sm" variant="outline" className="flex-1 h-7 text-[10px] text-rose-700 border-rose-200 hover:bg-rose-50" onClick={e => openWriteOff(selected, e)} data-testid="button-panel-writeoff"><FileX2 className="h-3 w-3 mr-1" />Write Off</Button>
                        </div>
                      )}
                    </div>
                  </TabsContent>
                  <TabsContent value="schedule" className="mt-0">
                    <div className="text-xs overflow-y-auto max-h-[400px]">
                      <table className="w-full text-[10px]">
                        <thead className="sticky top-0 bg-card">
                          <tr className="border-b text-muted-foreground">
                            <th className="text-left py-1 pr-2">Month</th>
                            <th className="text-right py-1 pr-2">Dep.</th>
                            <th className="text-right py-1 pr-2">Accum.</th>
                            <th className="text-right py-1">Book Val.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {generateDepSchedule(selected).map((row, i) => {
                            const isCurrentMonth = row.label === format(today, 'MMM yyyy');
                            return (
                              <tr key={i} className={cn('border-b last:border-0 tabular-nums', isCurrentMonth && 'bg-blue-50/60 dark:bg-blue-900/20 font-semibold')}>
                                <td className="py-0.5 pr-2 text-muted-foreground">{row.label}</td>
                                <td className="py-0.5 pr-2 text-right">{formatNumber(row.dep)}</td>
                                <td className="py-0.5 pr-2 text-right">{formatNumber(row.accum)}</td>
                                <td className="py-0.5 text-right">{formatNumber(row.bookValue)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          ) : (
            catChartData.length > 0 && (
              <Card>
                <CardHeader className="pb-1 pt-3"><CardTitle className="text-sm">Book Value by Category</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={catChartData} layout="vertical" margin={{ top: 4, right: 20, left: 50, bottom: 4 }}>
                      <XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={v => formatNumber(v)} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={50} />
                      <Tooltip formatter={(v: number) => formatNumber(v)} />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                        {catChartData.map((_, i) => <Cell key={i} fill={['#6366f1', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#22c55e', '#64748b'][i % 7]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )
          )}
        </div>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingAsset ? 'Edit' : 'Add'} Fixed Asset</DialogTitle>
            <DialogDescription>Register a new fixed asset for depreciation tracking.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label className="text-xs mb-1">Name (English) *</Label><Input className="h-9" value={form.name_en ?? ''} onChange={e => setForm(p => ({ ...p, name_en: e.target.value }))} data-testid="input-name-en" /></div>
            <div className="col-span-2"><Label className="text-xs mb-1">Name (Arabic)</Label><Input className="h-9" value={form.name_ar ?? ''} onChange={e => setForm(p => ({ ...p, name_ar: e.target.value }))} dir="rtl" data-testid="input-name-ar" /></div>
            <div><Label className="text-xs mb-1">Category</Label>
              <Select value={form.category ?? 'equipment'} onValueChange={v => setForm(p => ({ ...p, category: v }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{CAT_ICONS[c]} {c.replace('_', ' ')}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs mb-1">Country</Label>
              <Select value={form.country_id ?? ''} onValueChange={v => setForm(p => ({ ...p, country_id: v }))}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select country" /></SelectTrigger>
                <SelectContent>{countries.map(c => <SelectItem key={c.id} value={c.id}>{c.flag_emoji ?? ''} {c.name_en}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs mb-1">Acquisition Date *</Label><Input type="date" className="h-9" value={form.acquisition_date ?? ''} onChange={e => setForm(p => ({ ...p, acquisition_date: e.target.value }))} /></div>
            <div><Label className="text-xs mb-1">Acquisition Cost *</Label><Input type="number" className="h-9" value={form.acquisition_cost ?? 0} onChange={e => setForm(p => ({ ...p, acquisition_cost: Number(e.target.value) }))} /></div>
            <div><Label className="text-xs mb-1">Currency</Label><Input className="h-9" value={form.currency ?? 'USD'} onChange={e => setForm(p => ({ ...p, currency: e.target.value.toUpperCase().slice(0, 3) }))} /></div>
            <div><Label className="text-xs mb-1">Salvage Value</Label><Input type="number" className="h-9" value={form.salvage_value ?? 0} onChange={e => setForm(p => ({ ...p, salvage_value: Number(e.target.value) }))} /></div>
            <div><Label className="text-xs mb-1">Useful Life (months)</Label><Input type="number" className="h-9" value={form.useful_life_months ?? 60} onChange={e => setForm(p => ({ ...p, useful_life_months: Number(e.target.value) }))} /></div>
            <div><Label className="text-xs mb-1">Depreciation Method</Label>
              <Select value={form.depreciation_method ?? 'straight_line'} onValueChange={v => setForm(p => ({ ...p, depreciation_method: v }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{DEP_METHODS.map(d => <SelectItem key={d.v} value={d.v}>{d.l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs mb-1">Status</Label>
              <Select value={form.status ?? 'active'} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs mb-1">Location</Label><Input className="h-9" value={form.location ?? ''} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} /></div>
            <div><Label className="text-xs mb-1">Serial Number</Label><Input className="h-9" value={form.serial_number ?? ''} onChange={e => setForm(p => ({ ...p, serial_number: e.target.value }))} /></div>
            <div><Label className="text-xs mb-1">Supplier</Label><Input className="h-9" value={form.supplier ?? ''} onChange={e => setForm(p => ({ ...p, supplier: e.target.value }))} /></div>
            <div><Label className="text-xs mb-1">Warranty Expiry</Label><Input type="date" className="h-9" value={form.warranty_expiry ?? ''} onChange={e => setForm(p => ({ ...p, warranty_expiry: e.target.value }))} /></div>
            <div className="col-span-2"><Label className="text-xs mb-1">Notes</Label><Input className="h-9" value={form.notes ?? ''} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !form.name_en} data-testid="button-save">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}{editingAsset ? 'Update' : 'Add Asset'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disposal Dialog */}
      <Dialog open={disposeDialog} onOpenChange={v => { if (!disposing) setDisposeDialog(v); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Banknote className="h-5 w-5 text-amber-600" />Dispose Asset</DialogTitle>
            <DialogDescription>{disposeTarget?.name_en} — Mark this asset as disposed and record proceeds.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1">Disposal Date *</Label>
                <Input type="date" className="h-9" value={disposeForm.date} onChange={e => setDisposeForm(p => ({ ...p, date: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs mb-1">Method</Label>
                <Select value={disposeForm.method} onValueChange={v => setDisposeForm(p => ({ ...p, method: v }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sale">Sale</SelectItem>
                    <SelectItem value="donation">Donation</SelectItem>
                    <SelectItem value="scrap">Scrap</SelectItem>
                    <SelectItem value="transfer">Transfer</SelectItem>
                    <SelectItem value="loss">Loss / Theft</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs mb-1">Proceeds / Residual Value ({disposeTarget?.currency ?? 'USD'})</Label>
              <Input type="number" className="h-9" min="0" step="0.01" value={disposeForm.proceeds} onChange={e => setDisposeForm(p => ({ ...p, proceeds: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs mb-1">Notes</Label>
              <Textarea className="text-xs" rows={2} placeholder="Reason for disposal, buyer, certificate no…" value={disposeForm.notes} onChange={e => setDisposeForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
            {disposeTarget && (() => {
              const { bookValue } = calcDepreciation(disposeTarget, today);
              const proceeds = Number(disposeForm.proceeds) || 0;
              const gainLoss = proceeds - bookValue;
              return (
                <div className="rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-xs">
                  <div className="flex justify-between mb-1"><span className="text-muted-foreground">Current Book Value</span><span className="font-semibold">{formatNumber(bookValue)} {disposeTarget.currency}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Gain / (Loss) on Disposal</span><span className={cn('font-semibold', gainLoss >= 0 ? 'text-emerald-700' : 'text-rose-700')}>{gainLoss >= 0 ? '+' : ''}{formatNumber(gainLoss)}</span></div>
                </div>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisposeDialog(false)} disabled={disposing}>Cancel</Button>
            <Button onClick={handleDispose} disabled={disposing || !disposeForm.date} className="bg-amber-600 hover:bg-amber-700 text-white" data-testid="button-confirm-dispose">
              {disposing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Banknote className="h-4 w-4 mr-2" />}
              {disposing ? 'Disposing…' : 'Confirm Disposal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Write-off Dialog */}
      <Dialog open={writeOffDialog} onOpenChange={v => { if (!writingOff) setWriteOffDialog(v); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileX2 className="h-5 w-5 text-rose-600" />Write Off Asset</DialogTitle>
            <DialogDescription>{writeOffTarget?.name_en} — Mark this asset as fully written off (zero book value).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs mb-1">Reason / Notes</Label>
              <Textarea className="text-xs" rows={3} placeholder="Reason for write-off (obsolescence, damage, loss…)" value={writeOffReason} onChange={e => setWriteOffReason(e.target.value)} />
            </div>
            {writeOffTarget && (() => {
              const { bookValue, accumulated } = calcDepreciation(writeOffTarget, today);
              return (
                <div className="rounded bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 p-3 text-xs space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">Book Value to Write Off</span><span className="font-semibold text-rose-700">{formatNumber(bookValue)} {writeOffTarget.currency}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Accumulated Dep.</span><span className="font-medium">{formatNumber(accumulated)}</span></div>
                  <p className="text-muted-foreground pt-1">A journal entry (Expense DR / Asset CR) should be posted manually or via the Run Depreciation workflow.</p>
                </div>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWriteOffDialog(false)} disabled={writingOff}>Cancel</Button>
            <Button onClick={handleWriteOff} disabled={writingOff} variant="destructive" data-testid="button-confirm-writeoff">
              {writingOff ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileX2 className="h-4 w-4 mr-2" />}
              {writingOff ? 'Writing off…' : 'Write Off Asset'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Depreciation Journal Run Dialog */}
      <Dialog open={depRunDialog} onOpenChange={v => { if (!depRunBusy) setDepRunDialog(v); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><TrendingDown className="h-5 w-5 text-slate-600" />Run Period Depreciation</DialogTitle>
            <DialogDescription>Creates draft journal entries for all active assets for the selected period. Review and post them in Journal Entries afterwards.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs mb-1">Period Start</Label><Input type="date" className="h-9" value={depRunStart} onChange={e => setDepRunStart(e.target.value)} /></div>
              <div><Label className="text-xs mb-1">Period End</Label><Input type="date" className="h-9" value={depRunEnd} onChange={e => setDepRunEnd(e.target.value)} /></div>
            </div>
            <div className="rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-200">
              <AlertTriangle className="h-3.5 w-3.5 inline mr-1" />
              {assets.filter(a => a.status === 'active').length} active asset(s) will be processed. Entries are created in <strong>draft</strong> status — no GL impact until you post them. Assign Depreciation Expense and Accumulated Depreciation accounts in each asset record for line-level detail.
            </div>
            {depRunResults.length > 0 && (
              <div className="border rounded max-h-40 overflow-y-auto">
                {depRunResults.map((r, i) => (
                  <div key={i} className={cn('flex items-center justify-between px-3 py-1.5 text-xs border-b last:border-b-0', r.error ? 'text-rose-700' : 'text-emerald-700')}>
                    <span className="truncate">{r.asset}</span>
                    {r.error ? <span className="text-rose-500 text-[10px] ml-2">{r.error.slice(0, 40)}</span> : <span className="tabular-nums font-medium">{formatNumber(r.amount)}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDepRunDialog(false)} disabled={depRunBusy}>Close</Button>
            {depRunResults.length === 0 && (
              <Button onClick={runDepreciation} disabled={depRunBusy || !depRunStart || !depRunEnd} data-testid="button-confirm-dep">
                {depRunBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <TrendingDown className="h-4 w-4 mr-2" />}
                {depRunBusy ? 'Processing…' : `Run for ${assets.filter(a => a.status === 'active').length} Asset(s)`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
