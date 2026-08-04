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
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Search, RefreshCw, Tag, Pencil, Trash2 } from 'lucide-react';

interface ExpCat {
  id: string; name_en: string; name_ar: string | null; code: string | null;
  requires_receipt: boolean; max_amount: number | null; is_active: boolean;
  parent_id: string | null;
}

export default function AccountingExpenseCategories() {
  const { hasAnyRole, isAuthenticated } = useAuthorization();
  const { authReady } = useAppContext();
  const { toast } = useToast();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);
  const canManage = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin']);

  const [rows, setRows] = useState<ExpCat[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ExpCat | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ExpCat | null>(null);

  const BLANK = { name_en: '', name_ar: '', code: '', requires_receipt: 'true', max_amount: '', is_active: 'true', parent_id: '' };
  const [form, setForm] = useState<Record<string, string>>(BLANK);
  const sf = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('acct_expense_categories' as any).select('*').order('name_en');
    setRows((data ?? []) as ExpCat[]);
    setLoading(false);
  };

  useEffect(() => { if (allowed) void load(); }, [allowed]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter(r => !q || r.name_en.toLowerCase().includes(q) || (r.code ?? '').toLowerCase().includes(q) || (r.name_ar ?? '').includes(q));
  }, [rows, search]);

  const openAdd = () => { setEditTarget(null); setForm(BLANK); setFormOpen(true); };
  const openEdit = (r: ExpCat) => {
    setEditTarget(r);
    setForm({ name_en: r.name_en, name_ar: r.name_ar ?? '', code: r.code ?? '', requires_receipt: String(r.requires_receipt), max_amount: r.max_amount != null ? String(r.max_amount) : '', is_active: String(r.is_active), parent_id: r.parent_id ?? '' });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.name_en.trim()) { toast({ title: 'Name required', variant: 'destructive' }); return; }
    setSaving(true);
    const payload = { name_en: form.name_en.trim(), name_ar: form.name_ar || null, code: form.code || null, requires_receipt: form.requires_receipt === 'true', max_amount: form.max_amount ? parseFloat(form.max_amount) : null, is_active: form.is_active === 'true', parent_id: form.parent_id || null };
    const { error } = editTarget
      ? await supabase.from('acct_expense_categories' as any).update(payload).eq('id', editTarget.id)
      : await supabase.from('acct_expense_categories' as any).insert(payload);
    if (error) toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Saved' }); setFormOpen(false); void load(); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from('acct_expense_categories' as any).delete().eq('id', deleteTarget.id);
    if (error) toast({ title: 'Delete failed — category may be in use', variant: 'destructive' });
    else { toast({ title: 'Deleted' }); setDeleteTarget(null); void load(); }
  };

  if (!authReady || !isAuthenticated) return <PageLoader label="Checking session…" />;
  if (!allowed) return <Navigate to="/" replace />;

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Tag className="w-6 h-6 text-teal-600" /> Expense Categories</h1>
          <p className="text-sm text-muted-foreground mt-1">Configurable categories for expense reports and petty cash</p>
        </div>
        <div className="flex gap-2">
          {canManage && <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> Add Category</Button>}
          <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Categories ({filtered.length})</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="relative"><Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" /><Input placeholder="Search categories…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8" /></div>

          {loading ? <PageLoader compact />
          : filtered.length === 0 ? <div className="text-center py-10 text-muted-foreground text-sm">No categories found.</div>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2 text-left">Code</th><th className="px-3 py-2 text-left">Name (EN)</th>
                  <th className="px-3 py-2 text-left">Name (AR)</th><th className="px-3 py-2 text-center">Receipt</th>
                  <th className="px-3 py-2 text-right">Max Amount</th><th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2"></th>
                </tr></thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id} className={`border-b hover:bg-muted/30 group ${!r.is_active ? 'opacity-50' : ''}`} data-testid={`row-expcat-${r.id}`}>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{r.code ?? '—'}</td>
                      <td className="px-3 py-2 font-medium">{r.name_en}</td>
                      <td className="px-3 py-2 text-muted-foreground" dir="rtl">{r.name_ar ?? '—'}</td>
                      <td className="px-3 py-2 text-center">{r.requires_receipt ? '✅' : '—'}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{r.max_amount != null ? `$${r.max_amount}` : '—'}</td>
                      <td className="px-3 py-2 text-center"><Badge variant="outline" className={r.is_active ? 'text-emerald-700 border-emerald-300' : 'text-zinc-500'}>{r.is_active ? 'Active' : 'Inactive'}</Badge></td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100">
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
          <DialogHeader><DialogTitle>{editTarget ? 'Edit Category' : 'New Expense Category'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Name (English) *</Label><Input value={form.name_en} onChange={e => sf('name_en', e.target.value)} placeholder="e.g. Transportation" /></div>
              <div className="space-y-1"><Label>Name (Arabic)</Label><Input value={form.name_ar} onChange={e => sf('name_ar', e.target.value)} placeholder="مواصلات" dir="rtl" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Code</Label><Input value={form.code} onChange={e => sf('code', e.target.value)} placeholder="TRANS" /></div>
              <div className="space-y-1"><Label>Max Amount (USD)</Label><Input type="number" value={form.max_amount} onChange={e => sf('max_amount', e.target.value)} placeholder="No limit" /></div>
            </div>
            <div className="space-y-1"><Label>Parent Category</Label>
              <select value={form.parent_id || '__none__'} onChange={e => sf('parent_id', e.target.value === '__none__' ? '' : e.target.value)} className="w-full border rounded px-3 py-2 text-sm bg-background">
                <option value="__none__">— Top level —</option>
                {rows.filter(r => r.id !== editTarget?.id).map(r => <option key={r.id} value={r.id}>{r.name_en}</option>)}
              </select>
            </div>
            <div className="flex gap-6">
              <div className="flex items-center gap-2"><Switch checked={form.requires_receipt === 'true'} onCheckedChange={v => sf('requires_receipt', String(v))} /><Label>Receipt Required</Label></div>
              <div className="flex items-center gap-2"><Switch checked={form.is_active === 'true'} onCheckedChange={v => sf('is_active', String(v))} /><Label>Active</Label></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={() => void handleSave()} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Category</DialogTitle><DialogDescription>Delete "{deleteTarget?.name_en}"? This will fail if the category is in use.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button><Button variant="destructive" onClick={() => void handleDelete()}>Delete</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
