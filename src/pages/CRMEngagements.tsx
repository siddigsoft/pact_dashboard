import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';
import { format, parseISO } from 'date-fns';
import {
  MessageSquare, Plus, Search, Filter, Phone, Mail,
  Edit2, Trash2, Loader2, RefreshCw, CalendarDays, Building2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

interface Engagement {
  id: string;
  partner_id: string | null;
  type: string;
  subject: string;
  notes: string | null;
  date: string;
  created_by: string | null;
  created_at: string;
  partner_name?: string;
}

interface Partner { id: string; name: string; }

const ENGAGEMENT_TYPES = [
  { value: 'meeting', label: 'Meeting', emoji: '🤝' },
  { value: 'call', label: 'Phone Call', emoji: '📞' },
  { value: 'email', label: 'Email', emoji: '✉️' },
  { value: 'visit', label: 'Site Visit', emoji: '🏢' },
  { value: 'report', label: 'Report Submission', emoji: '📋' },
  { value: 'proposal', label: 'Proposal', emoji: '📄' },
];

const TYPE_BADGE: Record<string, string> = {
  meeting: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30',
  call: 'bg-green-100 text-green-700 dark:bg-green-900/30',
  email: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30',
  visit: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30',
  report: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30',
  proposal: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30',
};

const BLANK = { partner_id: null as string | null, type: 'meeting', subject: '', notes: null as string | null, date: new Date().toISOString().split('T')[0] };

export default function CRMEngagements() {
  const { currentUser } = useAppContext();
  const { toast } = useToast();
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [partnerFilter, setPartnerFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Engagement | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...BLANK });

  const load = async () => {
    setLoading(true);
    const [{ data: es }, { data: ps }] = await Promise.all([
      supabase.from('crm_engagements').select('*').order('date', { ascending: false }),
      supabase.from('crm_partners').select('id, name').order('name'),
    ]);
    const pMap: Record<string, string> = {};
    (ps || []).forEach((p: any) => { pMap[p.id] = p.name; });
    setEngagements((es || []).map((e: any) => ({ ...e, partner_name: e.partner_id ? pMap[e.partner_id] : null })));
    setPartners(ps || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let res = engagements;
    if (typeFilter !== 'all') res = res.filter(e => e.type === typeFilter);
    if (partnerFilter !== 'all') res = res.filter(e => e.partner_id === partnerFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      res = res.filter(e =>
        e.subject.toLowerCase().includes(q) ||
        (e.notes || '').toLowerCase().includes(q) ||
        (e.partner_name || '').toLowerCase().includes(q)
      );
    }
    return res;
  }, [engagements, search, typeFilter, partnerFilter]);

  const openNew = () => { setEditing(null); setForm({ ...BLANK }); setDialogOpen(true); };
  const openEdit = (e: Engagement) => { setEditing(e); setForm({ partner_id: e.partner_id, type: e.type, subject: e.subject, notes: e.notes, date: e.date }); setDialogOpen(true); };

  const save = async () => {
    if (!form.subject.trim()) { toast({ title: 'Subject is required', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const payload = { ...form, partner_id: form.partner_id || null };
      if (editing) {
        const { error } = await supabase.from('crm_engagements').update(payload).eq('id', editing.id);
        if (error) throw error;
        toast({ title: 'Engagement updated' });
      } else {
        const { error } = await supabase.from('crm_engagements').insert({ ...payload, created_by: currentUser?.id });
        if (error) throw error;
        toast({ title: 'Engagement logged' });
      }
      setDialogOpen(false);
      load();
    } catch (e: any) {
      toast({ title: 'Error saving', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this engagement?')) return;
    const { error } = await supabase.from('crm_engagements').delete().eq('id', id);
    if (error) toast({ title: 'Error deleting', variant: 'destructive' });
    else { toast({ title: 'Engagement deleted' }); load(); }
  };

  const setF = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const grouped = useMemo(() => {
    const byMonth: Record<string, Engagement[]> = {};
    filtered.forEach(e => {
      const key = format(parseISO(e.date), 'MMMM yyyy');
      if (!byMonth[key]) byMonth[key] = [];
      byMonth[key].push(e);
    });
    return Object.entries(byMonth);
  }, [filtered]);

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-gradient-to-r from-[#0F2041] to-[#1D3461] text-white px-6 py-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Engagements</h1>
              <p className="text-blue-200 text-sm">{engagements.length} engagement{engagements.length !== 1 ? 's' : ''} logged</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}
              className="border-white/30 text-white hover:bg-white/10">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
            <Button size="sm" onClick={openNew} className="bg-white text-[#0F2041] hover:bg-blue-50">
              <Plus className="h-4 w-4 mr-1" /> Log Engagement
            </Button>
          </div>
        </div>
      </div>

      <div className="p-6">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search engagements..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {ENGAGEMENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.emoji} {t.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={partnerFilter} onValueChange={setPartnerFilter}>
            <SelectTrigger className="w-full sm:w-52">
              <SelectValue placeholder="All partners" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Partners</SelectItem>
              {partners.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">{engagements.length === 0 ? 'No engagements logged yet' : 'No engagements match your search'}</p>
            {engagements.length === 0 && (
              <Button className="mt-4" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Log first engagement</Button>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            {grouped.map(([month, items]) => (
              <div key={month}>
                <div className="flex items-center gap-3 mb-3">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-muted-foreground">{month}</h3>
                  <div className="flex-1 border-b border-border" />
                  <span className="text-xs text-muted-foreground">{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.map(e => {
                    const et = ENGAGEMENT_TYPES.find(t => t.value === e.type);
                    return (
                      <Card key={e.id} className="hover:shadow-sm transition-shadow">
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <span className="text-xl shrink-0 mt-0.5">{et?.emoji || '📌'}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2 flex-wrap">
                                <div>
                                  <p className="font-semibold text-sm">{e.subject}</p>
                                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_BADGE[e.type] || 'bg-gray-100 text-gray-700'}`}>
                                      {et?.label || e.type}
                                    </span>
                                    {e.partner_name && (
                                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                        <Building2 className="h-3 w-3" /> {e.partner_name}
                                      </span>
                                    )}
                                    <span className="text-xs text-muted-foreground">{format(parseISO(e.date), 'MMM d, yyyy')}</span>
                                  </div>
                                  {e.notes && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{e.notes}</p>}
                                </div>
                                <div className="flex gap-1 shrink-0">
                                  <button onClick={() => openEdit(e)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                                    <Edit2 className="h-3.5 w-3.5" />
                                  </button>
                                  <button onClick={() => remove(e.id)} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Engagement' : 'Log Engagement'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Type</Label>
              <Select value={form.type} onValueChange={v => setF('type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ENGAGEMENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.emoji} {t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Subject *</Label>
              <Input value={form.subject} onChange={e => setF('subject', e.target.value)} placeholder="Q2 coordination meeting" />
            </div>
            <div>
              <Label>Partner</Label>
              <Select value={form.partner_id || 'none'} onValueChange={v => setF('partner_id', v === 'none' ? null : v)}>
                <SelectTrigger><SelectValue placeholder="Select partner" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No partner</SelectItem>
                  {partners.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={form.date} onChange={e => setF('date', e.target.value)} />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea rows={4} value={form.notes || ''} onChange={e => setF('notes', e.target.value)} placeholder="Key outcomes, action items..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editing ? 'Update' : 'Log Engagement'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
