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
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Search, Download, RefreshCw, MapPin, Pencil, Trash2 } from 'lucide-react';
import { exportToExcel } from '@/utils/report-export';

interface PerDiem {
  id: string; country_id: string | null; city: string | null; rate_usd: number;
  accommodation_usd: number | null; meals_usd: number | null; transport_usd: number | null;
  effective_date: string; end_date: string | null; is_active: boolean; notes: string | null;
  countries?: { name_en: string; flag_emoji: string };
}
interface Country { id: string; name_en: string; flag_emoji: string }

const fmt = (n: number | null) => n != null ? `$${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(n)}` : '—';

export default function AccountingPerDiemRates() {
  const { hasAnyRole, isAuthenticated } = useAuthorization();
  const { authReady } = useAppContext();
  const { toast } = useToast();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);
  const canManage = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin']);

  const [rows, setRows] = useState<PerDiem[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PerDiem | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PerDiem | null>(null);

  const BLANK = { country_id: '', city: '', rate_usd: '', accommodation_usd: '', meals_usd: '', transport_usd: '', effective_date: new Date().toISOString().slice(0, 10), end_date: '', notes: '', is_active: 'true' };
  const [form, setForm] = useState<Record<string, string>>(BLANK);
  const sf = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const load = async () => {
    setLoading(true);
    const [pdRes, ctRes] = await Promise.all([
      supabase.from('acct_per_diem_rates' as any).select('*, countries(name_en, flag_emoji)').order('effective_date', { ascending: false }),
      supabase.from('countries').select('id, name_en, flag_emoji').eq('is_active', true).order('name_en'),
    ]);
    setRows((pdRes.data ?? []) as PerDiem[]);
    setCountries((ctRes.data ?? []) as Country[]);
    setLoading(false);
  };

  useEffect(() => { if (allowed) void load(); }, [allowed]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter(r => {
      if (q) return (r.city ?? '').toLowerCase().includes(q) || ((r.countries as any)?.name_en ?? '').toLowerCase().includes(q);
      return true;
    });
  }, [rows, search]);

  const openAdd = () => { setEditTarget(null); setForm(BLANK); setFormOpen(true); };
  const openEdit = (r: PerDiem) => {
    setEditTarget(r);
    setForm({ country_id: r.country_id ?? '', city: r.city ?? '', rate_usd: String(r.rate_usd), accommodation_usd: r.accommodation_usd != null ? String(r.accommodation_usd) : '', meals_usd: r.meals_usd != null ? String(r.meals_usd) : '', transport_usd: r.transport_usd != null ? String(r.transport_usd) : '', effective_date: r.effective_date, end_date: r.end_date ?? '', notes: r.notes ?? '', is_active: String(r.is_active) });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.rate_usd) { toast({ title: 'Rate is required', variant: 'destructive' }); return; }
    setSaving(true);
    const payload = { country_id: form.country_id || null, city: form.city || null, rate_usd: parseFloat(form.rate_usd), accommodation_usd: form.accommodation_usd ? parseFloat(form.accommodation_usd) : null, meals_usd: form.meals_usd ? parseFloat(form.meals_usd) : null, transport_usd: form.transport_usd ? parseFloat(form.transport_usd) : null, effective_date: form.effective_date, end_date: form.end_date || null, notes: form.notes || null, is_active: form.is_active === 'true' };
    const { error } = editTarget
      ? await supabase.from('acct_per_diem_rates' as any).update(payload).eq('id', editTarget.id)
      : await supabase.from('acct_per_diem_rates' as any).insert(payload);
    if (error) toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Saved' }); setFormOpen(false); void load(); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await supabase.from('acct_per_diem_rates' as any).delete().eq('id', deleteTarget.id);
    toast({ title: 'Deleted' }); setDeleteTarget(null); void load();
  };

  if (!authReady || !isAuthenticated) return <PageLoader label="Checking session…" />;
  if (!allowed) return <Navigate to="/" replace />;

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><MapPin className="w-6 h-6 text-blue-600" /> Per Diem Rates</h1>
          <p className="text-sm text-muted-foreground mt-1">Country and city daily allowance rates — used in expense reports</p>
        </div>
        <div className="flex gap-2">
          {canManage && <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> Add Rate</Button>}
          <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
          <Button variant="outline" size="sm" onClick={() => exportToExcel(filtered, 'per-diem-rates')} disabled={!filtered.length}><Download className="w-4 h-4 mr-1" /> Excel</Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Rates ({filtered.length})</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-48"><Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" /><Input placeholder="Search country, city…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8" /></div>
          </div>

          {loading ? <PageLoader compact />
          : filtered.length === 0 ? <div className="text-center py-10 text-muted-foreground text-sm">No per diem rates configured.</div>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2 text-left">Country</th><th className="px-3 py-2 text-left">City</th>
                  <th className="px-3 py-2 text-right">Total/Day</th><th className="px-3 py-2 text-right">Accommodation</th>
                  <th className="px-3 py-2 text-right">Meals</th><th className="px-3 py-2 text-right">Transport</th>
                  <th className="px-3 py-2 text-left">Effective</th><th className="px-3 py-2"></th>
                </tr></thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id} className={`border-b hover:bg-muted/30 group ${!r.is_active ? 'opacity-50' : ''}`} data-testid={`row-perdiem-${r.id}`}>
                      <td className="px-3 py-2">{(r.countries as any)?.flag_emoji} {(r.countries as any)?.name_en ?? '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.city ?? 'All cities'}</td>
                      <td className="px-3 py-2 text-right font-bold text-emerald-700">{fmt(r.rate_usd)}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{fmt(r.accommodation_usd)}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{fmt(r.meals_usd)}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{fmt(r.transport_usd)}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{r.effective_date}{r.end_date ? ` → ${r.end_date}` : ''}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {canManage && <button onClick={() => openEdit(r)} className="p-1 rounded hover:bg-blue-50 text-blue-600"><Pencil className="w-3.5 h-3.5" /></button>}
                          {canManage && <button onClick={() => setDeleteTarget(r)} className="p-1 rounded hover:bg-rose-50 text-rose-600"><Trash2 className="w-3.5 h-3.5" /></button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editTarget ? 'Edit Per Diem Rate' : 'New Per Diem Rate'}</DialogTitle><DialogDescription>Rates are in USD. Leave breakdown blank to use total only.</DialogDescription></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Country</Label>
                <Select value={form.country_id || '__none__'} onValueChange={v => sf('country_id', v === '__none__' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Select country" /></SelectTrigger>
                  <SelectContent><SelectItem value="__none__">— Global —</SelectItem>{countries.map(c => <SelectItem key={c.id} value={c.id}>{c.flag_emoji} {c.name_en}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>City (optional)</Label><Input value={form.city} onChange={e => sf('city', e.target.value)} placeholder="Leave blank = all cities" /></div>
            </div>
            <div className="space-y-1"><Label>Total Daily Rate (USD) *</Label><Input type="number" value={form.rate_usd} onChange={e => sf('rate_usd', e.target.value)} placeholder="0.00" /></div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1"><Label className="text-xs">Accommodation</Label><Input type="number" value={form.accommodation_usd} onChange={e => sf('accommodation_usd', e.target.value)} placeholder="0.00" /></div>
              <div className="space-y-1"><Label className="text-xs">Meals</Label><Input type="number" value={form.meals_usd} onChange={e => sf('meals_usd', e.target.value)} placeholder="0.00" /></div>
              <div className="space-y-1"><Label className="text-xs">Transport</Label><Input type="number" value={form.transport_usd} onChange={e => sf('transport_usd', e.target.value)} placeholder="0.00" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Effective Date</Label><Input type="date" value={form.effective_date} onChange={e => sf('effective_date', e.target.value)} /></div>
              <div className="space-y-1"><Label>End Date</Label><Input type="date" value={form.end_date} onChange={e => sf('end_date', e.target.value)} /></div>
            </div>
            <div className="space-y-1"><Label>Notes</Label><Input value={form.notes} onChange={e => sf('notes', e.target.value)} placeholder="Source: UNDP rate table 2026" /></div>
            <div className="flex items-center gap-2"><Switch checked={form.is_active === 'true'} onCheckedChange={v => sf('is_active', String(v))} /><Label>Active</Label></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={() => void handleSave()} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Rate</DialogTitle><DialogDescription>Delete per diem rate for {deleteTarget?.city ?? 'all cities'} in {(deleteTarget?.countries as any)?.name_en ?? 'unknown'}?</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button><Button variant="destructive" onClick={() => void handleDelete()}>Delete</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
