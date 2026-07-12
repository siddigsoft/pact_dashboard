import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useAppContext } from '@/context/AppContext';
import { Navigate as Nav } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Search, Download, RefreshCw, LayoutTemplate, Pencil, Trash2, Copy } from 'lucide-react';
import { exportToExcel } from '@/utils/report-export';

interface JTemplate {
  id: string; name: string; description: string | null; journal_type: string;
  tags: string[]; is_active: boolean; use_count: number; created_at: string;
}

export default function AccountingJournalTemplates() {
  const { hasAnyRole, isAuthenticated } = useAuthorization();
  const { authReady } = useAppContext();
  const { toast } = useToast();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);
  const canManage = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant']);

  const [rows, setRows] = useState<JTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<JTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<JTemplate | null>(null);

  const BLANK = { name: '', description: '', journal_type: 'general', tags: '' };
  const [form, setForm] = useState<Record<string, string>>(BLANK);
  const sf = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('acct_journal_templates' as any).select('*').order('use_count', { ascending: false });
    setRows((data ?? []) as JTemplate[]);
    setLoading(false);
  };

  useEffect(() => { if (allowed) void load(); }, [allowed]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter(r => !q || r.name.toLowerCase().includes(q) || (r.description ?? '').toLowerCase().includes(q));
  }, [rows, search]);

  const openAdd = () => { setEditTarget(null); setForm(BLANK); setFormOpen(true); };
  const openEdit = (r: JTemplate) => { setEditTarget(r); setForm({ name: r.name, description: r.description ?? '', journal_type: r.journal_type, tags: (r.tags ?? []).join(', ') }); setFormOpen(true); };

  const handleSave = async () => {
    if (!form.name.trim()) { toast({ title: 'Name required', variant: 'destructive' }); return; }
    setSaving(true);
    const payload = { name: form.name.trim(), description: form.description || null, journal_type: form.journal_type, tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [], is_active: true };
    const { error } = editTarget
      ? await supabase.from('acct_journal_templates' as any).update(payload).eq('id', editTarget.id)
      : await supabase.from('acct_journal_templates' as any).insert({ ...payload, use_count: 0 });
    if (error) toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Saved' }); setFormOpen(false); void load(); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await supabase.from('acct_journal_templates' as any).delete().eq('id', deleteTarget.id);
    toast({ title: 'Deleted' }); setDeleteTarget(null); void load();
  };

  const duplicate = async (r: JTemplate) => {
    const { error } = await supabase.from('acct_journal_templates' as any).insert({ name: `${r.name} (Copy)`, description: r.description, journal_type: r.journal_type, tags: r.tags, is_active: true, use_count: 0 });
    if (!error) { toast({ title: 'Duplicated' }); void load(); }
  };

  if (!authReady || !isAuthenticated) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!allowed) return <Nav to="/" replace />;

  const TYPE_COLORS: Record<string, string> = { general: 'bg-blue-50 text-blue-700', bank: 'bg-emerald-50 text-emerald-700', cash: 'bg-amber-50 text-amber-700', sale: 'bg-purple-50 text-purple-700', purchase: 'bg-rose-50 text-rose-700' };

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><LayoutTemplate className="w-6 h-6 text-indigo-600" /> Journal Entry Templates</h1>
          <p className="text-sm text-muted-foreground mt-1">Save common multi-line journal entries as reusable templates</p>
        </div>
        <div className="flex gap-2">
          {canManage && <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> New Template</Button>}
          <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
          <Button variant="outline" size="sm" onClick={() => exportToExcel(filtered, 'journal-templates')} disabled={!filtered.length}><Download className="w-4 h-4 mr-1" /> Excel</Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Templates ({filtered.length})</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="relative"><Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" /><Input placeholder="Search templates…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8" /></div>

          {loading ? <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…</div>
          : filtered.length === 0 ? <div className="text-center py-10 text-muted-foreground text-sm">No templates yet. Create one to speed up journal posting.</div>
          : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filtered.map(r => (
                <div key={r.id} className="border rounded-lg p-4 flex flex-col gap-2 hover:shadow-sm transition-shadow" data-testid={`card-jtemplate-${r.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{r.name}</div>
                      {r.description && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{r.description}</div>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {canManage && <button onClick={() => void duplicate(r)} className="p-1.5 rounded hover:bg-muted text-muted-foreground" title="Duplicate"><Copy className="w-3.5 h-3.5" /></button>}
                      {canManage && <button onClick={() => openEdit(r)} className="p-1.5 rounded hover:bg-blue-50 text-blue-600" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>}
                      {canManage && <button onClick={() => setDeleteTarget(r)} className="p-1.5 rounded hover:bg-rose-50 text-rose-600" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className={`text-[10px] ${TYPE_COLORS[r.journal_type] ?? ''}`}>{r.journal_type}</Badge>
                    {(r.tags ?? []).map(t => <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>)}
                  </div>
                  <div className="text-xs text-muted-foreground">Used {r.use_count} time{r.use_count !== 1 ? 's' : ''}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editTarget ? 'Edit Template' : 'New Journal Template'}</DialogTitle><DialogDescription>Template lines can be added after saving.</DialogDescription></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1"><Label>Name *</Label><Input value={form.name} onChange={e => sf('name', e.target.value)} placeholder="e.g. Monthly Rent Payment" /></div>
            <div className="space-y-1"><Label>Description</Label><Input value={form.description} onChange={e => sf('description', e.target.value)} placeholder="When to use this template" /></div>
            <div className="space-y-1"><Label>Journal Type</Label>
              <Select value={form.journal_type} onValueChange={v => sf('journal_type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{['general','bank','cash','sale','purchase'].map(t => <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Tags (comma separated)</Label><Input value={form.tags} onChange={e => sf('tags', e.target.value)} placeholder="rent, monthly, expense" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={() => void handleSave()} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Template</DialogTitle><DialogDescription>Delete "{deleteTarget?.name}"?</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button><Button variant="destructive" onClick={() => void handleDelete()}>Delete</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
