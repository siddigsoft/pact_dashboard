import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useAppContext } from '@/context/AppContext';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageLoader } from '@/components/ui/page-loader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Plus, Download, RefreshCw, Package, TrendingUp, TrendingDown, Pencil } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { exportToExcel } from '@/utils/report-export';
import { cn } from '@/lib/utils';

interface Reval {
  id: string; asset_id: string; revaluation_date: string;
  previous_cost: number; new_cost: number;
  previous_accumulated_dep: number; new_accumulated_dep: number;
  gain_loss: number; reason: string | null;
  approved_by: string | null; created_at: string;
  profiles?: { full_name: string };
}

const fmt = (n: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(n ?? 0);

export default function AccountingAssetRevaluation() {
  const { hasAnyRole, isAuthenticated } = useAuthorization();
  const { authReady } = useAppContext();
  const { toast } = useToast();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);
  const canManage = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant']);

  const [rows, setRows] = useState<Reval[]>([]);
  const [assets, setAssets] = useState<{ id: string; asset_name: string; asset_code: string; cost: number; accumulated_depreciation: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const BLANK = { asset_id: '', revaluation_date: new Date().toISOString().slice(0, 10), new_cost: '', new_accumulated_dep: '', reason: '' };
  const [form, setForm] = useState<Record<string, string>>(BLANK);
  const sf = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const selectedAsset = useMemo(() => assets.find(a => a.id === form.asset_id), [assets, form.asset_id]);

  const load = async () => {
    setLoading(true);
    const [rvRes, asRes] = await Promise.all([
      supabase.from('acct_asset_revaluations' as any).select('*, profiles(full_name)').order('revaluation_date', { ascending: false }),
      supabase.from('acct_fixed_assets' as any).select('id, asset_name, asset_code, cost, accumulated_depreciation').eq('status', 'active').order('asset_name'),
    ]);
    setRows((rvRes.data ?? []) as Reval[]);
    setAssets((asRes.data ?? []) as any[]);
    setLoading(false);
  };

  useEffect(() => { if (allowed) void load(); }, [allowed]);

  const totals = useMemo(() => ({
    gains: rows.filter(r => r.gain_loss > 0).reduce((s, r) => s + r.gain_loss, 0),
    losses: rows.filter(r => r.gain_loss < 0).reduce((s, r) => s + Math.abs(r.gain_loss), 0),
  }), [rows]);

  const handleSave = async () => {
    if (!form.asset_id || !form.new_cost) { toast({ title: 'Asset and new cost required', variant: 'destructive' }); return; }
    setSaving(true);
    const payload = {
      asset_id: form.asset_id,
      revaluation_date: form.revaluation_date,
      previous_cost: selectedAsset?.cost ?? 0,
      new_cost: parseFloat(form.new_cost),
      previous_accumulated_dep: selectedAsset?.accumulated_depreciation ?? 0,
      new_accumulated_dep: parseFloat(form.new_accumulated_dep) || (selectedAsset?.accumulated_depreciation ?? 0),
      reason: form.reason || null,
    };
    const { error } = await supabase.from('acct_asset_revaluations' as any).insert(payload);
    if (error) toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    else {
      // Update asset cost
      await supabase.from('acct_fixed_assets' as any).update({ cost: payload.new_cost, accumulated_depreciation: payload.new_accumulated_dep }).eq('id', form.asset_id);
      toast({ title: 'Revaluation recorded' }); setFormOpen(false); void load();
    }
    setSaving(false);
  };

  if (!authReady || !isAuthenticated) return <PageLoader label="Checking session…" />;
  if (!allowed) return <Navigate to="/" replace />;

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Package className="w-6 h-6 text-orange-600" /> Asset Revaluations</h1>
          <p className="text-sm text-muted-foreground mt-1">Revalue fixed assets to fair market value with gain/loss tracking</p>
        </div>
        <div className="flex gap-2">
          {canManage && <Button size="sm" onClick={() => { setForm(BLANK); setFormOpen(true); }}><Plus className="w-4 h-4 mr-1" /> New Revaluation</Button>}
          <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
          <Button variant="outline" size="sm" onClick={() => exportToExcel(rows, 'asset-revaluations')} disabled={!rows.length}><Download className="w-4 h-4 mr-1" /> Excel</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card><CardContent className="p-4 flex items-center gap-3"><TrendingUp className="w-7 h-7 text-emerald-600" /><div><div className="text-xs text-muted-foreground">Total Revaluation Gains</div><div className="text-xl font-bold text-emerald-700">{fmt(totals.gains)}</div></div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><TrendingDown className="w-7 h-7 text-rose-600" /><div><div className="text-xs text-muted-foreground">Total Revaluation Losses</div><div className="text-xl font-bold text-rose-700">{fmt(totals.losses)}</div></div></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Revaluation History ({rows.length})</CardTitle></CardHeader>
        <CardContent>
          {loading ? <PageLoader compact />
          : rows.length === 0 ? <div className="text-center py-10 text-muted-foreground text-sm">No revaluations recorded yet.</div>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Asset</th>
                  <th className="px-3 py-2 text-right">Prev Cost</th><th className="px-3 py-2 text-right">New Cost</th>
                  <th className="px-3 py-2 text-right">Prev NBV</th><th className="px-3 py-2 text-right">New NBV</th>
                  <th className="px-3 py-2 text-right">Gain / Loss</th><th className="px-3 py-2 text-left">Reason</th>
                </tr></thead>
                <tbody>
                  {rows.map(r => {
                    const prevNBV = r.previous_cost - r.previous_accumulated_dep;
                    const newNBV = r.new_cost - r.new_accumulated_dep;
                    return (
                      <tr key={r.id} className="border-b hover:bg-muted/30" data-testid={`row-reval-${r.id}`}>
                        <td className="px-3 py-2 text-muted-foreground">{r.revaluation_date}</td>
                        <td className="px-3 py-2 font-medium">{r.asset_id.slice(0, 8)}…</td>
                        <td className="px-3 py-2 text-right text-muted-foreground">{fmt(r.previous_cost)}</td>
                        <td className="px-3 py-2 text-right font-medium">{fmt(r.new_cost)}</td>
                        <td className="px-3 py-2 text-right text-muted-foreground">{fmt(prevNBV)}</td>
                        <td className="px-3 py-2 text-right font-medium">{fmt(newNBV)}</td>
                        <td className={cn('px-3 py-2 text-right font-bold', r.gain_loss >= 0 ? 'text-emerald-700' : 'text-rose-700')}>
                          {r.gain_loss >= 0 ? '+' : ''}{fmt(r.gain_loss)}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{r.reason ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Asset Revaluation</DialogTitle><DialogDescription>Adjust asset carrying value to fair market value.</DialogDescription></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1"><Label>Asset *</Label>
              <select value={form.asset_id} onChange={e => sf('asset_id', e.target.value)} className="w-full border rounded px-3 py-2 text-sm bg-background">
                <option value="">— Select asset —</option>
                {assets.map(a => <option key={a.id} value={a.id}>{a.asset_code} — {a.asset_name}</option>)}
              </select>
            </div>
            {selectedAsset && (
              <div className="p-3 rounded bg-muted/50 text-xs space-y-1">
                <div className="flex justify-between"><span>Current Cost:</span><strong>{fmt(selectedAsset.cost)}</strong></div>
                <div className="flex justify-between"><span>Accum. Dep:</span><strong>{fmt(selectedAsset.accumulated_depreciation)}</strong></div>
                <div className="flex justify-between"><span>Net Book Value:</span><strong>{fmt(selectedAsset.cost - selectedAsset.accumulated_depreciation)}</strong></div>
              </div>
            )}
            <div className="space-y-1"><Label>Revaluation Date</Label><Input type="date" value={form.revaluation_date} onChange={e => sf('revaluation_date', e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>New Cost *</Label><Input type="number" value={form.new_cost} onChange={e => sf('new_cost', e.target.value)} placeholder="0.00" /></div>
              <div className="space-y-1"><Label>New Accum. Dep</Label><Input type="number" value={form.new_accumulated_dep} onChange={e => sf('new_accumulated_dep', e.target.value)} placeholder="Keep unchanged if blank" /></div>
            </div>
            {form.new_cost && selectedAsset && (
              <div className={cn('p-2 rounded text-sm font-medium text-center', parseFloat(form.new_cost) >= selectedAsset.cost ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700')}>
                Gain / Loss: {parseFloat(form.new_cost) >= selectedAsset.cost ? '+' : ''}{fmt(parseFloat(form.new_cost) - selectedAsset.cost)}
              </div>
            )}
            <div className="space-y-1"><Label>Reason</Label><Input value={form.reason} onChange={e => sf('reason', e.target.value)} placeholder="e.g. Annual fair value assessment" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={() => void handleSave()} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Record Revaluation</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
