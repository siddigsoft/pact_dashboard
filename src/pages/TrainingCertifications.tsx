import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Award, Plus, Edit2, Trash2, Loader2, Search, AlertTriangle, Clock, ExternalLink } from 'lucide-react';
import { format, parseISO, differenceInDays, isAfter } from 'date-fns';
import { cn } from '@/lib/utils';

interface Record_ {
  id: string;
  user_id: string;
  title: string;
  category: string;
  provider: string | null;
  issued_on: string | null;
  expires_on: string | null;
  status: string;
  cost: number | null;
  currency: string | null;
  evidence_url: string | null;
  notes: string | null;
}
interface Profile { id: string; full_name: string; }

const CATEGORIES = [
  { value: 'training', label: 'Training' },
  { value: 'certification', label: 'Certification' },
  { value: 'license', label: 'License' },
  { value: 'workshop', label: 'Workshop' },
  { value: 'conference', label: 'Conference' },
];

const CAT_COLOR: Record<string, string> = {
  training: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40',
  certification: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40',
  license: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40',
  workshop: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40',
  conference: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40',
};

const BLANK = {
  user_id: '', title: '', category: 'training', provider: '',
  issued_on: '', expires_on: '', status: 'active',
  cost: '', currency: 'USD', evidence_url: '', notes: '',
};

export default function TrainingCertificationsPage() {
  const { currentUser } = useAppContext();
  const { hasAnyRole } = useAuthorization();
  const { toast } = useToast();
  const isAdmin = hasAnyRole(['super_admin', 'admin', 'hr']);

  const [records, setRecords] = useState<Record_[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'all' | 'expiring' | 'expired' | 'mine'>(isAdmin ? 'all' : 'mine');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Record_ | null>(null);
  const [form, setForm] = useState({ ...BLANK });

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [r, p] = await Promise.all([
      supabase.from('training_records').select('*').order('issued_on', { ascending: false, nullsFirst: false }),
      supabase.from('profiles').select('id, full_name').order('full_name'),
    ]);
    if (r.data) setRecords(r.data as Record_[]);
    if (p.data) setProfiles(p.data as Profile[]);
    setLoading(false);
  }

  function openNew() {
    setEditing(null);
    setForm({ ...BLANK, user_id: isAdmin ? '' : (currentUser?.id ?? '') });
    setDialogOpen(true);
  }
  function openEdit(r: Record_) {
    setEditing(r);
    setForm({
      user_id: r.user_id,
      title: r.title,
      category: r.category,
      provider: r.provider ?? '',
      issued_on: r.issued_on ?? '',
      expires_on: r.expires_on ?? '',
      status: r.status,
      cost: r.cost != null ? String(r.cost) : '',
      currency: r.currency ?? 'USD',
      evidence_url: r.evidence_url ?? '',
      notes: r.notes ?? '',
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.user_id || !form.title.trim()) { toast({ title: 'User and title are required', variant: 'destructive' }); return; }
    setSaving(true);
    const payload: any = {
      user_id: form.user_id,
      title: form.title.trim(),
      category: form.category,
      provider: form.provider || null,
      issued_on: form.issued_on || null,
      expires_on: form.expires_on || null,
      status: form.status,
      cost: form.cost ? parseFloat(form.cost) : null,
      currency: form.currency || 'USD',
      evidence_url: form.evidence_url || null,
      notes: form.notes || null,
      created_by: currentUser?.id ?? null,
    };
    const { error } = editing
      ? await supabase.from('training_records').update(payload).eq('id', editing.id)
      : await supabase.from('training_records').insert(payload);
    setSaving(false);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { toast({ title: editing ? 'Record updated' : 'Record created' }); setDialogOpen(false); fetchAll(); }
  }
  async function handleDelete(r: Record_) {
    if (!confirm(`Delete "${r.title}"?`)) return;
    const { error } = await supabase.from('training_records').delete().eq('id', r.id);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Record deleted' }); fetchAll(); }
  }

  const profileMap = useMemo(() => Object.fromEntries(profiles.map(p => [p.id, p.full_name])), [profiles]);
  const today = new Date();

  const enriched = useMemo(() => records.map(r => {
    const exp = r.expires_on ? parseISO(r.expires_on) : null;
    const days = exp ? differenceInDays(exp, today) : null;
    const isExpired = exp ? !isAfter(exp, today) : false;
    const isExpiring = days != null && days >= 0 && days <= 60;
    return { r, days, isExpired, isExpiring };
  }), [records]);

  const visible = useMemo(() => {
    let list = enriched;
    if (tab === 'mine')     list = list.filter(x => x.r.user_id === currentUser?.id);
    if (tab === 'expiring') list = list.filter(x => x.isExpiring && !x.isExpired);
    if (tab === 'expired')  list = list.filter(x => x.isExpired);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(x =>
        x.r.title.toLowerCase().includes(q) ||
        (x.r.provider ?? '').toLowerCase().includes(q) ||
        (profileMap[x.r.user_id] ?? '').toLowerCase().includes(q));
    }
    return list;
  }, [enriched, tab, search, currentUser?.id, profileMap]);

  const kpi = useMemo(() => ({
    total: records.length,
    expiring: enriched.filter(x => x.isExpiring && !x.isExpired).length,
    expired: enriched.filter(x => x.isExpired).length,
    mine: records.filter(r => r.user_id === currentUser?.id).length,
  }), [records, enriched, currentUser?.id]);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4" data-testid="page-training">
      <header className="flex flex-wrap items-center gap-3">
        <Award className="h-5 w-5 text-amber-500" />
        <h1 className="text-xl font-semibold">Training & Certifications</h1>
        {isAdmin && (
          <Button size="sm" onClick={openNew} className="ml-auto" data-testid="button-new-training">
            <Plus className="h-4 w-4 mr-1" /> New record
          </Button>
        )}
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Total records" value={kpi.total} />
        <Kpi label="Expiring (≤60 days)" value={kpi.expiring} tone={kpi.expiring ? 'warn' : 'ok'} />
        <Kpi label="Expired" value={kpi.expired} tone={kpi.expired ? 'warn' : 'ok'} />
        <Kpi label="Mine" value={kpi.mine} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={tab} onValueChange={v => setTab(v as any)}>
          <TabsList>
            {isAdmin && <TabsTrigger value="all">All</TabsTrigger>}
            <TabsTrigger value="mine">Mine</TabsTrigger>
            <TabsTrigger value="expiring">Expiring</TabsTrigger>
            <TabsTrigger value="expired">Expired</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input data-testid="input-search-training" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="pl-8 w-56" />
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center"><Loader2 className="h-6 w-6 animate-spin opacity-30" /></div>
      ) : visible.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No records found.</CardContent></Card>
      ) : (
        <Card><CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900 text-xs text-muted-foreground">
              <tr>
                <th className="text-left p-3">Person</th>
                <th className="text-left p-3">Title</th>
                <th className="text-left p-3">Category</th>
                <th className="text-left p-3">Issued</th>
                <th className="text-left p-3">Expires</th>
                <th className="text-left p-3">Status</th>
                <th className="p-3 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map(({ r, days, isExpired, isExpiring }) => (
                <tr key={r.id} className="border-t hover:bg-slate-50 dark:hover:bg-slate-900/50" data-testid={`row-training-${r.id}`}>
                  <td className="p-3 text-xs">{profileMap[r.user_id] ?? 'Unknown'}</td>
                  <td className="p-3">
                    <div className="font-medium">{r.title}</div>
                    {r.provider && <div className="text-xs text-muted-foreground">{r.provider}</div>}
                  </td>
                  <td className="p-3"><Badge variant="outline" className={cn('text-[10px]', CAT_COLOR[r.category])}>{r.category}</Badge></td>
                  <td className="p-3 text-xs">{r.issued_on ? format(parseISO(r.issued_on), 'PP') : '—'}</td>
                  <td className="p-3 text-xs">
                    {r.expires_on ? (
                      <span className={cn(isExpired && 'text-red-600 dark:text-red-400 font-medium', isExpiring && !isExpired && 'text-amber-600 dark:text-amber-400 font-medium')}>
                        {format(parseISO(r.expires_on), 'PP')}
                        {days != null && (
                          <span className="block text-[10px] opacity-70">
                            {isExpired ? `${-days}d ago` : `in ${days}d`}
                          </span>
                        )}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="p-3">
                    {isExpired ? (
                      <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 text-[10px] gap-1"><AlertTriangle className="h-3 w-3" />Expired</Badge>
                    ) : isExpiring ? (
                      <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 text-[10px] gap-1"><Clock className="h-3 w-3" />Expiring</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">{r.status}</Badge>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-1">
                      {r.evidence_url && (
                        <Button asChild size="sm" variant="ghost" data-testid={`link-evidence-${r.id}`}>
                          <a href={r.evidence_url} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a>
                        </Button>
                      )}
                      {(isAdmin || r.user_id === currentUser?.id) && (
                        <Button size="sm" variant="ghost" onClick={() => openEdit(r)} data-testid={`button-edit-${r.id}`}><Edit2 className="h-3.5 w-3.5" /></Button>
                      )}
                      {isAdmin && (
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(r)} data-testid={`button-delete-${r.id}`}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent></Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? 'Edit record' : 'New training/certification'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2">
              <Label>Person *</Label>
              <Select value={form.user_id} onValueChange={v => setForm({ ...form, user_id: v })} disabled={!isAdmin}>
                <SelectTrigger><SelectValue placeholder="Select person" /></SelectTrigger>
                <SelectContent>
                  {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Title *</Label>
              <Input data-testid="input-title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <Label>Category</Label>
              <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Provider</Label>
              <Input value={form.provider} onChange={e => setForm({ ...form, provider: e.target.value })} />
            </div>
            <div>
              <Label>Issued on</Label>
              <Input type="date" value={form.issued_on} onChange={e => setForm({ ...form, issued_on: e.target.value })} />
            </div>
            <div>
              <Label>Expires on</Label>
              <Input type="date" value={form.expires_on} onChange={e => setForm({ ...form, expires_on: e.target.value })} />
            </div>
            <div>
              <Label>Cost</Label>
              <Input type="number" value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} />
            </div>
            <div>
              <Label>Currency</Label>
              <Input value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} maxLength={5} />
            </div>
            <div className="col-span-2">
              <Label>Evidence URL</Label>
              <Input value={form.evidence_url} onChange={e => setForm({ ...form, evidence_url: e.target.value })} placeholder="https://…" />
            </div>
            <div className="col-span-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} data-testid="button-save-training">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: 'warn' | 'ok' }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={cn('text-2xl font-semibold mt-0.5',
          tone === 'warn' && value > 0 && 'text-amber-600 dark:text-amber-400')}>{value}</div>
      </CardContent>
    </Card>
  );
}
