/**
 * UnifiedAssetMaster.tsx
 *
 * Single register for ALL organisation assets:
 *   - HR assets (laptops, phones, SIMs, access cards, …)
 *   - Field equipment (generators, cameras, radios, …)
 *   - Fixed assets (vehicles, furniture, leasehold improvements, …)
 *
 * Features:
 *   • Create / edit / retire assets
 *   • Assign to staff with immutable assignment log
 *   • Depreciation fields (method, useful life, accumulated dep.)
 *   • Disposal workflow (sale / write-off / loss) → posts journal entry
 *   • CSV export
 */

import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useAppContext } from '@/context/AppContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Loader2, Plus, Search, Download, Archive, RefreshCw,
  UserCheck, Trash2, AlertTriangle, RotateCcw, CalendarDays, Info,
  CheckCircle2, TrendingDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { downloadCsv, formatNumber } from '@/lib/accountingFormat';
import { cn } from '@/lib/utils';

type AssetType = 'hr' | 'field_equipment' | 'fixed_asset';
type DepMethod = 'straight_line' | 'declining_balance';

interface FiscalPeriod { id: string; period_label: string; start_date: string; end_date: string; status: string }
interface DepPreview {
  asset_id: string; asset_code: string; asset_name: string;
  depreciation_method: string; purchase_value: number;
  accumulated_dep: number; nbv: number; period_charge: number;
  already_fully_dep: boolean;
}
interface DepRun {
  id: string; period_label: string; periods_per_year: number; run_date: string;
  asset_count: number; total_depreciation: number; skipped_count: number;
  error_count: number; status: string; created_at: string;
}

interface Asset {
  id: string; asset_code: string; name: string; asset_type: AssetType; category: string;
  serial_number: string | null; model: string | null; purchase_date: string | null;
  purchase_value: number | null; currency: string; useful_life_years: number | null;
  depreciation_method: DepMethod | null; accumulated_depreciation: number;
  status: string; condition: string | null; hub: string | null; location: string | null;
  custodian_name: string | null; assigned_to_id: string | null;
  warranty_expiry: string | null; notes: string | null; created_at: string;
}

interface AssignLog {
  id: string; asset_id: string; assigned_to_name: string; assigned_date: string;
  returned_date: string | null; condition_on_assignment: string | null; condition_on_return: string | null; notes: string | null;
}

interface Profile { id: string; full_name: string | null; email: string }

const ASSET_TYPES: { value: AssetType; label: string }[] = [
  { value: 'hr',             label: 'HR Asset (laptop, phone, SIM…)' },
  { value: 'field_equipment',label: 'Field Equipment (generator, camera…)' },
  { value: 'fixed_asset',    label: 'Fixed Asset (vehicle, furniture…)' },
];
const CATEGORIES: Record<AssetType, string[]> = {
  hr:             ['Laptop', 'Phone', 'SIM Card', 'Access Card', 'Software License', 'Tablet', 'Other HR'],
  field_equipment:['Camera', 'Generator', 'Radio', 'Vehicle', 'Survey Equipment', 'Other Field'],
  fixed_asset:    ['Vehicle', 'Furniture', 'Computer Equipment', 'Leasehold Improvement', 'Machinery', 'Other Fixed'],
};
const HUBS = ['Blue Nile', 'South Kordofan', 'North Kordofan', 'East Sudan', 'Khartoum', 'Kassala', 'Gadaref', 'HQ', 'Other'];
const STATUSES = ['available', 'assigned', 'maintenance', 'retired', 'lost', 'disposed'];
const CONDITIONS = ['excellent', 'good', 'fair', 'poor', 'beyond_repair'];
const DEP_METHODS = [{ value: 'straight_line', label: 'Straight Line' }, { value: 'declining_balance', label: 'Declining Balance' }];

function emptyForm() {
  return {
    name: '', asset_type: 'hr' as AssetType, category: '', serial_number: '', model: '',
    purchase_date: '', purchase_value: '', currency: 'SDG', useful_life_years: '',
    depreciation_method: 'straight_line' as DepMethod, accumulated_depreciation: '0',
    status: 'available', condition: 'good', hub: '', location: '', notes: '', warranty_expiry: '',
  };
}

function emptyDisposalForm() {
  return { disposal_type: 'write_off', disposal_date: '', proceeds: '0', currency: 'SDG', reason: '' };
}

export default function UnifiedAssetMaster() {
  const { hasAnyRole, isAuthenticated } = useAuthorization();
  const { currentUser } = useAppContext();
  const canEdit    = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'hr_admin', 'ict']);
  const canDispose = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin']);
  const canRunDep  = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant']);

  const [mainTab, setMainTab] = useState<'register' | 'depreciation'>('register');

  // ── Register state ────────────────────────────────────────────────────────
  const [assets, setAssets] = useState<Asset[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [assignLogs, setAssignLogs] = useState<AssignLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterHub, setFilterHub] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Dialogs
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [editAsset, setEditAsset] = useState<Asset | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignAsset, setAssignAsset] = useState<Asset | null>(null);
  const [assignUserId, setAssignUserId] = useState('');
  const [disposeAsset, setDisposeAsset] = useState<Asset | null>(null);
  const [disposalForm, setDisposalForm] = useState(emptyDisposalForm());
  const [logAsset, setLogAsset] = useState<Asset | null>(null);

  // ── Depreciation tab state ────────────────────────────────────────────────
  const [fiscalPeriods, setFiscalPeriods] = useState<FiscalPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
  const [periodsPerYear, setPeriodsPerYear] = useState<string>('12');
  const [preview, setPreview] = useState<DepPreview[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [depRuns, setDepRuns] = useState<DepRun[]>([]);
  const [depRunsLoading, setDepRunsLoading] = useState(false);
  const [runningDep, setRunningDep] = useState(false);
  const [depConfirmOpen, setDepConfirmOpen] = useState(false);

  async function load() {
    setLoading(true);
    const [aRes, pRes] = await Promise.all([
      supabase.from('unified_assets').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id,full_name,email').order('full_name'),
    ]);
    setAssets((aRes.data ?? []) as Asset[]);
    setProfiles((pRes.data ?? []) as Profile[]);
    setLoading(false);
  }

  const loadDepData = useCallback(async () => {
    setDepRunsLoading(true);
    const [periodRes, runRes] = await Promise.all([
      supabase
        .from('acct_fiscal_periods')
        .select('id,period_label,start_date,end_date,status')
        .eq('status', 'open')
        .order('start_date', { ascending: false })
        .limit(24),
      supabase
        .from('asset_depreciation_runs' as any)
        .select('id,period_label,periods_per_year,run_date,asset_count,total_depreciation,skipped_count,error_count,status,created_at')
        .order('created_at', { ascending: false })
        .limit(50),
    ]);
    const periods = (periodRes.data ?? []) as FiscalPeriod[];
    setFiscalPeriods(periods);
    if (periods.length > 0 && !selectedPeriodId) setSelectedPeriodId(periods[0].id);
    setDepRuns((runRes.data ?? []) as DepRun[]);
    setDepRunsLoading(false);
  }, [selectedPeriodId]);

  const loadPreview = useCallback(async () => {
    setPreviewLoading(true);
    try {
      const { data, error } = await supabase.rpc(
        'preview_asset_depreciation' as any,
        { p_periods_per_year: parseInt(periodsPerYear) || 12 }
      );
      if (error) throw error;
      setPreview((data ?? []) as DepPreview[]);
    } catch (err: any) {
      toast.error(`Preview failed: ${err.message}`);
    } finally {
      setPreviewLoading(false);
    }
  }, [periodsPerYear]);

  async function runDepreciation() {
    if (!selectedPeriodId) { toast.error('Select a fiscal period'); return; }
    setRunningDep(true);
    setDepConfirmOpen(false);
    try {
      const { data, error } = await supabase.rpc(
        'post_asset_depreciation_to_gl' as any,
        { p_fiscal_period_id: selectedPeriodId, p_periods_per_year: parseInt(periodsPerYear) || 12 }
      );
      if (error) throw error;
      const res = data as { posted: number; skipped: number; errors: number; total_depreciation: number } | null;
      toast.success(
        `Depreciation run complete — Posted: ${res?.posted ?? 0}, Skipped: ${res?.skipped ?? 0}, ` +
        `Errors: ${res?.errors ?? 0}, Total: ${formatNumber(res?.total_depreciation ?? 0)}`
      );
      await Promise.all([load(), loadDepData(), loadPreview()]);
    } catch (err: any) {
      toast.error(`Run failed: ${err.message}`);
    } finally {
      setRunningDep(false);
    }
  }

  async function loadLogs(assetId: string) {
    const { data } = await supabase
      .from('asset_assignment_logs')
      .select('id,asset_id,assigned_to_name,assigned_date,returned_date,condition_on_assignment,condition_on_return,notes')
      .eq('asset_id', assetId)
      .order('assigned_date', { ascending: false });
    setAssignLogs((data ?? []) as AssignLog[]);
  }

  useEffect(() => { if (isAuthenticated) load(); }, [isAuthenticated]);
  useEffect(() => {
    if (isAuthenticated && mainTab === 'depreciation') {
      loadDepData();
      loadPreview();
    }
  }, [isAuthenticated, mainTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    let list = assets;
    if (filterType !== 'all') list = list.filter(a => a.asset_type === filterType);
    if (filterHub  !== 'all') list = list.filter(a => a.hub === filterHub);
    if (filterStatus !== 'all') list = list.filter(a => a.status === filterStatus);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(a => a.name.toLowerCase().includes(s) || a.asset_code.toLowerCase().includes(s) || (a.serial_number ?? '').toLowerCase().includes(s));
    }
    return list;
  }, [assets, filterType, filterHub, filterStatus, search]);

  function nbv(a: Asset) {
    if (!a.purchase_value) return null;
    return Math.max(0, a.purchase_value - a.accumulated_depreciation);
  }

  function setF(field: string, value: string) { setForm(f => ({ ...f, [field]: value })); }

  async function createAsset() {
    if (!form.name || !form.category) { toast.error('Name and category are required'); return; }
    setSaving(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const code = `ASSET-${Date.now().toString(36).toUpperCase()}`;
      const { error } = await supabase.from('unified_assets').insert({
        asset_code: code,
        name: form.name,
        asset_type: form.asset_type,
        category: form.category,
        serial_number: form.serial_number || null,
        model: form.model || null,
        purchase_date: form.purchase_date || null,
        purchase_value: form.purchase_value ? parseFloat(form.purchase_value) : null,
        currency: form.currency,
        useful_life_years: form.useful_life_years ? parseInt(form.useful_life_years) : null,
        depreciation_method: form.depreciation_method,
        accumulated_depreciation: parseFloat(form.accumulated_depreciation) || 0,
        status: form.status,
        condition: form.condition,
        hub: form.hub || null,
        location: form.location || null,
        warranty_expiry: form.warranty_expiry || null,
        notes: form.notes || null,
        created_by: sess?.session?.user?.id,
      });
      if (error) throw error;
      toast.success('Asset created');
      setCreateOpen(false);
      setForm(emptyForm());
      await load();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  }

  async function assignAssetToUser() {
    if (!assignAsset || !assignUserId) { toast.error('Select a user'); return; }
    setSaving(true);
    try {
      const profile = profiles.find(p => p.id === assignUserId);
      await supabase.from('unified_assets').update({ assigned_to_id: assignUserId, status: 'assigned', custodian_name: profile?.full_name ?? profile?.email }).eq('id', assignAsset.id);
      await supabase.from('asset_assignment_logs').insert({
        asset_id: assignAsset.id,
        assigned_to_id: assignUserId,
        assigned_to_name: profile?.full_name ?? profile?.email ?? assignUserId,
        assigned_by_id: currentUser?.id,
        assigned_date: new Date().toISOString().slice(0, 10),
        condition_on_assignment: assignAsset.condition,
      });
      toast.success('Asset assigned');
      setAssignOpen(false); setAssignAsset(null); setAssignUserId('');
      await load();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  }

  async function disposeAssetFn() {
    if (!disposeAsset || !disposalForm.disposal_date || !disposalForm.reason) { toast.error('Date and reason required'); return; }
    setSaving(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const { error } = await supabase.from('asset_disposals').insert({
        asset_id: disposeAsset.id,
        disposal_type: disposalForm.disposal_type,
        disposal_date: disposalForm.disposal_date,
        proceeds: parseFloat(disposalForm.proceeds) || 0,
        currency: disposalForm.currency,
        reason: disposalForm.reason,
        approved_by: sess?.session?.user?.id,
        created_by: sess?.session?.user?.id,
        created_at: new Date().toISOString(),
      });
      if (error) throw error;
      await supabase.from('unified_assets').update({ status: 'disposed' }).eq('id', disposeAsset.id);
      toast.success('Asset marked as disposed. A manual journal entry is required for GL posting.');
      setDisposeAsset(null); setDisposalForm(emptyDisposalForm());
      await load();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  }

  const statusColor: Record<string, string> = {
    available: 'bg-green-100 text-green-700', assigned: 'bg-blue-100 text-blue-700',
    maintenance: 'bg-yellow-100 text-yellow-700', retired: 'bg-gray-100 text-gray-500',
    lost: 'bg-red-100 text-red-700', disposed: 'bg-slate-100 text-slate-500',
  };

  // ── Depreciation preview helpers ──────────────────────────────────────────
  const eligibleForDep = preview.filter(p => !p.already_fully_dep && p.period_charge > 0);
  const totalPeriodCharge = eligibleForDep.reduce((s, p) => s + p.period_charge, 0);

  const selectedPeriod = fiscalPeriods.find(p => p.id === selectedPeriodId);

  return (
    <div className="space-y-4 p-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Unified Asset Register</h2>
          <p className="text-muted-foreground text-sm mt-1">All HR, field equipment, and fixed assets in one place.</p>
        </div>
      </div>

      {/* Top-level tabs: Register | Depreciation */}
      <Tabs value={mainTab} onValueChange={v => setMainTab(v as typeof mainTab)}>
        <TabsList>
          <TabsTrigger value="register">Asset Register</TabsTrigger>
          <TabsTrigger value="depreciation">
            <TrendingDown className="h-4 w-4 mr-1.5" />
            Depreciation
          </TabsTrigger>
        </TabsList>

        {/* ── REGISTER TAB ──────────────────────────────────────────────────── */}
        <TabsContent value="register" className="space-y-4 mt-4">
          {/* Header actions */}
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" size="sm" onClick={() => downloadCsv('assets.csv', [
              ['Code','Name','Type','Category','Serial','Hub','Status','Purchase Value','NBV','Currency','Custodian'],
              ...assets.map(a => [a.asset_code, a.name, a.asset_type, a.category, a.serial_number??'', a.hub??'', a.status, a.purchase_value??'', nbv(a)??'', a.currency, a.custodian_name??'']),
            ])}>
              <Download className="h-4 w-4 mr-1" /> Export
            </Button>
            {canEdit && (
              <Button size="sm" onClick={() => { setForm(emptyForm()); setCreateOpen(true); }}>
                <Plus className="h-4 w-4 mr-1" /> New Asset
              </Button>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Assets', value: assets.length },
              { label: 'Assigned', value: assets.filter(a => a.status === 'assigned').length },
              { label: 'Available', value: assets.filter(a => a.status === 'available').length },
              { label: 'Total Cost', value: formatNumber(assets.reduce((s, a) => s + (a.purchase_value ?? 0), 0)) },
            ].map(s => (
              <Card key={s.label}><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{s.label}</p><p className="text-2xl font-bold">{s.value}</p></CardContent></Card>
            ))}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8 w-56" />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Asset type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {ASSET_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterHub} onValueChange={setFilterHub}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Hub" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All hubs</SelectItem>
                {HUBS.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <Card>
            <CardContent className="pt-4">
              {loading ? <Loader2 className="h-6 w-6 animate-spin mx-auto my-8" /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-muted-foreground border-b text-xs">
                        <th className="text-left pb-2 pr-3">Code</th>
                        <th className="text-left pb-2 pr-3">Name / Category</th>
                        <th className="text-left pb-2 pr-3">Hub</th>
                        <th className="text-left pb-2 pr-3">Custodian</th>
                        <th className="text-right pb-2 pr-3">Cost</th>
                        <th className="text-right pb-2 pr-3">NBV</th>
                        <th className="text-left pb-2 pr-3">Status</th>
                        <th className="text-left pb-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(a => (
                        <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-2 pr-3 font-mono text-xs">{a.asset_code}</td>
                          <td className="py-2 pr-3">
                            <div className="font-medium">{a.name}</div>
                            <div className="text-xs text-muted-foreground">{a.category}{a.serial_number ? ` • ${a.serial_number}` : ''}</div>
                          </td>
                          <td className="py-2 pr-3 text-xs">{a.hub ?? '—'}</td>
                          <td className="py-2 pr-3 text-xs">{a.custodian_name ?? '—'}</td>
                          <td className="py-2 pr-3 text-right font-mono text-xs">{a.purchase_value ? formatNumber(a.purchase_value) : '—'}</td>
                          <td className="py-2 pr-3 text-right font-mono text-xs">{nbv(a) !== null ? formatNumber(nbv(a)!) : '—'}</td>
                          <td className="py-2 pr-3"><Badge className={`text-xs ${statusColor[a.status] ?? ''}`}>{a.status}</Badge></td>
                          <td className="py-2">
                            <div className="flex gap-1">
                              {canEdit && a.status !== 'disposed' && (
                                <Button type="button" size="icon" variant="ghost" className="h-7 w-7" title="Assign" onClick={() => { setAssignAsset(a); setAssignOpen(true); }}>
                                  <UserCheck className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              <Button type="button" size="icon" variant="ghost" className="h-7 w-7" title="History" onClick={() => { setLogAsset(a); loadLogs(a.id); }}>
                                <Archive className="h-3.5 w-3.5" />
                              </Button>
                              {canDispose && a.status !== 'disposed' && (
                                <Button type="button" size="icon" variant="ghost" className="h-7 w-7 hover:text-destructive" title="Dispose" onClick={() => { setDisposeAsset(a); setDisposalForm(emptyDisposalForm()); }}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filtered.length === 0 && (
                        <tr><td colSpan={8} className="py-8 text-center text-muted-foreground text-sm">No assets found.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── DEPRECIATION TAB ──────────────────────────────────────────────── */}
        <TabsContent value="depreciation" className="space-y-5 mt-4">
          {/* Info banner */}
          <div className="flex gap-3 p-3 rounded-lg bg-blue-50 border border-blue-100 text-blue-800 text-sm">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <span className="font-medium">How depreciation posting works:</span>{' '}
              Select an open fiscal period, choose the frequency (monthly/quarterly/annual), preview the charges,
              then click "Run Depreciation". The RPC posts one journal entry per asset
              (DR Depreciation Expense / CR Accumulated Depreciation), updates each asset's accumulated
              depreciation balance, and logs to the GL bridge log. Runs are idempotent — re-running for
              the same period + asset is safely skipped. GL accounts are configured in{' '}
              <strong>GL Bridge Settings → asset_depreciation</strong>.
            </div>
          </div>

          {/* Controls */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarDays className="h-4 w-4" /> Run Configuration
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4 items-end">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Fiscal Period</label>
                  {depRunsLoading ? (
                    <div className="flex items-center gap-2 h-9 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading periods…</div>
                  ) : fiscalPeriods.length === 0 ? (
                    <p className="text-sm text-amber-600">No open fiscal periods found. Open a period in Fiscal Years first.</p>
                  ) : (
                    <Select value={selectedPeriodId} onValueChange={setSelectedPeriodId}>
                      <SelectTrigger className="w-56">
                        <SelectValue placeholder="Select period…" />
                      </SelectTrigger>
                      <SelectContent>
                        {fiscalPeriods.map(p => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.period_label} ({p.start_date} → {p.end_date})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Frequency</label>
                  <Select value={periodsPerYear} onValueChange={v => setPeriodsPerYear(v)}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="12">Monthly (12/yr)</SelectItem>
                      <SelectItem value="4">Quarterly (4/yr)</SelectItem>
                      <SelectItem value="1">Annual (1/yr)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={loadPreview} disabled={previewLoading}>
                    <RefreshCw className={cn('h-4 w-4 mr-1', previewLoading && 'animate-spin')} />
                    Preview
                  </Button>
                  {canRunDep && (
                    <Button
                      size="sm"
                      disabled={runningDep || !selectedPeriodId || eligibleForDep.length === 0}
                      onClick={() => setDepConfirmOpen(true)}
                      className="gap-2"
                    >
                      {runningDep ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                      Run Depreciation ({eligibleForDep.length} assets)
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Preview table */}
          {preview.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Preview — Period Charges</CardTitle>
                <CardDescription>
                  {eligibleForDep.length} of {preview.length} assets will be charged •{' '}
                  Total: <strong>{formatNumber(totalPeriodCharge)}</strong>
                </CardDescription>
              </CardHeader>
              <CardContent>
                {previewLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-muted-foreground border-b">
                          <th className="text-left pb-2 pr-3">Code</th>
                          <th className="text-left pb-2 pr-3">Name</th>
                          <th className="text-left pb-2 pr-3">Method</th>
                          <th className="text-right pb-2 pr-3">Cost</th>
                          <th className="text-right pb-2 pr-3">Accum. Dep</th>
                          <th className="text-right pb-2 pr-3">NBV</th>
                          <th className="text-right pb-2 pr-3">Period Charge</th>
                          <th className="text-left pb-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.map(p => (
                          <tr key={p.asset_id} className={cn('border-b last:border-0 hover:bg-muted/20', p.already_fully_dep && 'opacity-50')}>
                            <td className="py-1.5 pr-3 font-mono">{p.asset_code}</td>
                            <td className="py-1.5 pr-3">{p.asset_name}</td>
                            <td className="py-1.5 pr-3">{p.depreciation_method.replace('_',' ')}</td>
                            <td className="py-1.5 pr-3 text-right font-mono">{formatNumber(p.purchase_value)}</td>
                            <td className="py-1.5 pr-3 text-right font-mono text-muted-foreground">{formatNumber(p.accumulated_dep)}</td>
                            <td className="py-1.5 pr-3 text-right font-mono">{formatNumber(p.nbv)}</td>
                            <td className={cn('py-1.5 pr-3 text-right font-mono font-medium', p.already_fully_dep ? 'text-muted-foreground' : 'text-rose-600')}>
                              {p.already_fully_dep ? '—' : formatNumber(p.period_charge)}
                            </td>
                            <td className="py-1.5">
                              {p.already_fully_dep
                                ? <Badge className="text-xs bg-gray-100 text-gray-500">Fully Dep.</Badge>
                                : <Badge className="text-xs bg-green-100 text-green-700"><CheckCircle2 className="h-3 w-3 mr-1" />Eligible</Badge>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 bg-muted/20 font-semibold">
                          <td className="py-1.5 pr-3 font-mono" colSpan={6}>TOTAL ({eligibleForDep.length} eligible)</td>
                          <td className="py-1.5 pr-3 text-right font-mono text-rose-600">{formatNumber(totalPeriodCharge)}</td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Run history */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Run History</CardTitle>
                <Button type="button" variant="ghost" size="sm" onClick={loadDepData} disabled={depRunsLoading}>
                  <RefreshCw className={cn('h-4 w-4', depRunsLoading && 'animate-spin')} />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {depRunsLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : depRuns.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No depreciation runs yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground border-b">
                        <th className="text-left pb-2 pr-3">Run Date</th>
                        <th className="text-left pb-2 pr-3">Period</th>
                        <th className="text-left pb-2 pr-3">Frequency</th>
                        <th className="text-right pb-2 pr-3">Assets</th>
                        <th className="text-right pb-2 pr-3">Skipped</th>
                        <th className="text-right pb-2 pr-3">Errors</th>
                        <th className="text-right pb-2 pr-3">Total Dep</th>
                        <th className="text-left pb-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {depRuns.map(r => (
                        <tr key={r.id} className="border-b last:border-0 hover:bg-muted/20">
                          <td className="py-1.5 pr-3">{r.run_date}</td>
                          <td className="py-1.5 pr-3">{r.period_label}</td>
                          <td className="py-1.5 pr-3">{r.periods_per_year === 12 ? 'Monthly' : r.periods_per_year === 4 ? 'Quarterly' : 'Annual'}</td>
                          <td className="py-1.5 pr-3 text-right">{r.asset_count}</td>
                          <td className="py-1.5 pr-3 text-right text-muted-foreground">{r.skipped_count}</td>
                          <td className={cn('py-1.5 pr-3 text-right', r.error_count > 0 ? 'text-red-600 font-medium' : 'text-muted-foreground')}>{r.error_count}</td>
                          <td className="py-1.5 pr-3 text-right font-mono font-medium text-rose-600">{formatNumber(r.total_depreciation)}</td>
                          <td className="py-1.5">
                            <Badge className={cn('text-xs', {
                              'bg-green-100 text-green-700': r.status === 'completed',
                              'bg-yellow-100 text-yellow-700': r.status === 'partial',
                              'bg-red-100 text-red-700': r.status === 'error',
                            })}>
                              {r.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── DIALOGS (shared across tabs) ────────────────────────────────────── */}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Asset</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="font-medium">Name *</label><Input value={form.name} onChange={e => setF('name', e.target.value)} /></div>
              <div>
                <label className="font-medium">Type *</label>
                <Select value={form.asset_type} onValueChange={v => setF('asset_type', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ASSET_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="font-medium">Category *</label>
                <Select value={form.category} onValueChange={v => setF('category', v)}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>{(CATEGORIES[form.asset_type] ?? []).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><label className="font-medium">Serial Number</label><Input value={form.serial_number} onChange={e => setF('serial_number', e.target.value)} /></div>
              <div><label className="font-medium">Model</label><Input value={form.model} onChange={e => setF('model', e.target.value)} /></div>
              <div><label className="font-medium">Purchase Date</label><Input type="date" value={form.purchase_date} onChange={e => setF('purchase_date', e.target.value)} /></div>
              <div><label className="font-medium">Purchase Value</label><Input type="number" value={form.purchase_value} onChange={e => setF('purchase_value', e.target.value)} /></div>
              <div>
                <label className="font-medium">Currency</label>
                <Select value={form.currency} onValueChange={v => setF('currency', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{['SDG','USD','EUR','GBP'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><label className="font-medium">Useful Life (years)</label><Input type="number" value={form.useful_life_years} onChange={e => setF('useful_life_years', e.target.value)} /></div>
              <div className="col-span-2">
                <label className="font-medium">Depreciation Method</label>
                <Select value={form.depreciation_method} onValueChange={v => setF('depreciation_method', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DEP_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><label className="font-medium">Accum. Depreciation</label><Input type="number" value={form.accumulated_depreciation} onChange={e => setF('accumulated_depreciation', e.target.value)} /></div>
              <div>
                <label className="font-medium">Hub</label>
                <Select value={form.hub} onValueChange={v => setF('hub', v)}>
                  <SelectTrigger><SelectValue placeholder="Select hub" /></SelectTrigger>
                  <SelectContent>{HUBS.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="col-span-2"><label className="font-medium">Location</label><Input value={form.location} onChange={e => setF('location', e.target.value)} /></div>
              <div>
                <label className="font-medium">Condition</label>
                <Select value={form.condition} onValueChange={v => setF('condition', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CONDITIONS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><label className="font-medium">Warranty Expiry</label><Input type="date" value={form.warranty_expiry} onChange={e => setF('warranty_expiry', e.target.value)} /></div>
              <div className="col-span-2"><label className="font-medium">Notes</label><Input value={form.notes} onChange={e => setF('notes', e.target.value)} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={createAsset} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Create Asset</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign dialog */}
      <Dialog open={assignOpen} onOpenChange={v => { setAssignOpen(v); if (!v) setAssignAsset(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Assign {assignAsset?.name}</DialogTitle></DialogHeader>
          <div className="py-2">
            <label className="text-sm font-medium">Assign to</label>
            <Select value={assignUserId} onValueChange={setAssignUserId}>
              <SelectTrigger><SelectValue placeholder="Select staff member" /></SelectTrigger>
              <SelectContent>
                {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name ?? p.email}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button onClick={assignAssetToUser} disabled={saving || !assignUserId}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Assign</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disposal dialog */}
      <Dialog open={!!disposeAsset} onOpenChange={v => { if (!v) setDisposeAsset(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" /> Dispose Asset: {disposeAsset?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm">
            <div>
              <label className="font-medium">Disposal Type</label>
              <Select value={disposalForm.disposal_type} onValueChange={v => setDisposalForm(f => ({ ...f, disposal_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['sale','write_off','donation','loss','stolen','destroyed'].map(t => <SelectItem key={t} value={t}>{t.replace('_',' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><label className="font-medium">Disposal Date *</label><Input type="date" value={disposalForm.disposal_date} onChange={e => setDisposalForm(f => ({ ...f, disposal_date: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="font-medium">Proceeds</label><Input type="number" value={disposalForm.proceeds} onChange={e => setDisposalForm(f => ({ ...f, proceeds: e.target.value }))} /></div>
              <div>
                <label className="font-medium">Currency</label>
                <Select value={disposalForm.currency} onValueChange={v => setDisposalForm(f => ({ ...f, currency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{['SDG','USD'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><label className="font-medium">Reason *</label><Input value={disposalForm.reason} onChange={e => setDisposalForm(f => ({ ...f, reason: e.target.value }))} /></div>
            <p className="text-xs text-muted-foreground bg-yellow-50 dark:bg-yellow-950/20 p-2 rounded">Post the corresponding disposal journal entry manually in Journal Entries after saving.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisposeAsset(null)}>Cancel</Button>
            <Button variant="destructive" onClick={disposeAssetFn} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Dispose Asset</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assignment log dialog */}
      <Dialog open={!!logAsset} onOpenChange={v => { if (!v) { setLogAsset(null); setAssignLogs([]); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Assignment History — {logAsset?.name}</DialogTitle></DialogHeader>
          <div className="overflow-y-auto max-h-96">
            {assignLogs.length === 0 ? <p className="text-sm text-muted-foreground py-4">No assignment history.</p> : (
              <table className="w-full text-xs">
                <thead><tr className="border-b text-muted-foreground"><th className="text-left pb-2 pr-3">Assigned To</th><th className="pb-2 pr-3">From</th><th className="pb-2 pr-3">To</th><th className="pb-2">Condition</th></tr></thead>
                <tbody>
                  {assignLogs.map(l => (
                    <tr key={l.id} className="border-b last:border-0">
                      <td className="py-1.5 pr-3">{l.assigned_to_name}</td>
                      <td className="py-1.5 pr-3">{l.assigned_date}</td>
                      <td className="py-1.5 pr-3">{l.returned_date ?? <span className="text-blue-500">Active</span>}</td>
                      <td className="py-1.5">{l.condition_on_assignment ?? '—'}{l.condition_on_return ? ` → ${l.condition_on_return}` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setLogAsset(null)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Depreciation run confirmation dialog */}
      <Dialog open={depConfirmOpen} onOpenChange={setDepConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-rose-500" /> Confirm Depreciation Run
            </DialogTitle>
            <DialogDescription>
              This will post journal entries and update accumulated depreciation balances.
              This action is idempotent — safe to re-run, but the first successful run is permanent.
            </DialogDescription>
          </DialogHeader>
          <div className="py-3 space-y-2">
            <div className="rounded-lg bg-muted/40 p-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fiscal period</span>
                <span className="font-semibold">{selectedPeriod?.period_label ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Assets to post</span>
                <span className="font-semibold">{eligibleForDep.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total charge</span>
                <span className="font-semibold text-rose-600">{formatNumber(totalPeriodCharge)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Frequency</span>
                <span className="font-semibold">{periodsPerYear === '12' ? 'Monthly' : periodsPerYear === '4' ? 'Quarterly' : 'Annual'}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDepConfirmOpen(false)}>Cancel</Button>
            <Button onClick={runDepreciation} disabled={runningDep} className="gap-2">
              {runningDep ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              Post Depreciation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
