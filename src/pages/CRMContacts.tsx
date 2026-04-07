import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';
import {
  Users, Plus, Search, Phone, Mail, Building2,
  Edit2, Trash2, Loader2, RefreshCw, Star, X
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

interface Contact {
  id: string;
  partner_id: string | null;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
  notes: string | null;
  created_at: string;
  partner_name?: string;
}

interface Partner { id: string; name: string; }

const BLANK: Omit<Contact, 'id' | 'created_at' | 'partner_name'> = {
  partner_id: null, name: '', title: null, email: null, phone: null, is_primary: false, notes: null,
};

export default function CRMContacts() {
  const { currentUser } = useAppContext();
  const { toast } = useToast();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [partnerFilter, setPartnerFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(BLANK);

  const load = async () => {
    setLoading(true);
    const [{ data: cs }, { data: ps }] = await Promise.all([
      supabase.from('crm_contacts').select('*').order('name'),
      supabase.from('crm_partners').select('id, name').order('name'),
    ]);
    const partnerMap: Record<string, string> = {};
    (ps || []).forEach((p: any) => { partnerMap[p.id] = p.name; });
    setContacts((cs || []).map((c: any) => ({ ...c, partner_name: c.partner_id ? partnerMap[c.partner_id] : null })));
    setPartners(ps || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let res = contacts;
    if (partnerFilter !== 'all') res = res.filter(c => c.partner_id === partnerFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      res = res.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.title || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.partner_name || '').toLowerCase().includes(q)
      );
    }
    return res;
  }, [contacts, search, partnerFilter]);

  const openNew = () => { setEditing(null); setForm(BLANK); setDialogOpen(true); };
  const openEdit = (c: Contact) => { setEditing(c); setForm({ ...c }); setDialogOpen(true); };

  const save = async () => {
    if (!form.name.trim()) { toast({ title: 'Name is required', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const payload = { ...form, partner_id: form.partner_id || null };
      if (editing) {
        const { error } = await supabase.from('crm_contacts').update(payload).eq('id', editing.id);
        if (error) throw error;
        toast({ title: 'Contact updated' });
      } else {
        const { error } = await supabase.from('crm_contacts').insert({ ...payload, created_by: currentUser?.id });
        if (error) throw error;
        toast({ title: 'Contact added' });
      }
      setDialogOpen(false);
      load();
    } catch (e: any) {
      toast({ title: 'Error saving contact', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this contact?')) return;
    const { error } = await supabase.from('crm_contacts').delete().eq('id', id);
    if (error) toast({ title: 'Error deleting', variant: 'destructive' });
    else { toast({ title: 'Contact deleted' }); load(); }
  };

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#0F2041] to-[#1D3461] text-white px-6 py-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Contacts</h1>
              <p className="text-blue-200 text-sm">{contacts.length} contact{contacts.length !== 1 ? 's' : ''} across all partners</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}
              className="border-white/30 text-white hover:bg-white/10">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
            <Button size="sm" onClick={openNew} className="bg-white text-[#0F2041] hover:bg-blue-50">
              <Plus className="h-4 w-4 mr-1" /> Add Contact
            </Button>
          </div>
        </div>
      </div>

      <div className="p-6">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search contacts..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
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
            <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">{contacts.length === 0 ? 'No contacts yet' : 'No contacts match your search'}</p>
            {contacts.length === 0 && (
              <Button className="mt-4" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Add first contact</Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(c => (
              <Card key={c.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-semibold text-sm shrink-0">
                        {c.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-semibold text-sm truncate">{c.name}</p>
                          {c.is_primary && <Star className="h-3 w-3 text-yellow-500 fill-yellow-500 shrink-0" />}
                        </div>
                        {c.title && <p className="text-xs text-muted-foreground truncate">{c.title}</p>}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => openEdit(c)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => remove(c.id)} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {c.partner_name && (
                    <div className="flex items-center gap-1.5 mb-2">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-xs text-muted-foreground truncate">{c.partner_name}</span>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    {c.email && (
                      <a href={`mailto:${c.email}`} className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline truncate">
                        <Mail className="h-3.5 w-3.5 shrink-0" /> {c.email}
                      </a>
                    )}
                    {c.phone && (
                      <a href={`tel:${c.phone}`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground truncate">
                        <Phone className="h-3.5 w-3.5 shrink-0" /> {c.phone}
                      </a>
                    )}
                  </div>

                  {c.is_primary && (
                    <Badge variant="outline" className="mt-2 text-xs border-yellow-400 text-yellow-600">Primary Contact</Badge>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Contact' : 'Add Contact'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Full Name *</Label>
              <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Jane Doe" />
            </div>
            <div>
              <Label>Job Title</Label>
              <Input value={form.title || ''} onChange={e => set('title', e.target.value)} placeholder="Programme Officer" />
            </div>
            <div>
              <Label>Partner / Organisation</Label>
              <Select value={form.partner_id || 'none'} onValueChange={v => set('partner_id', v === 'none' ? null : v)}>
                <SelectTrigger><SelectValue placeholder="Select partner" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No partner</SelectItem>
                  {partners.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Email</Label>
                <Input type="email" value={form.email || ''} onChange={e => set('email', e.target.value)} placeholder="jane@org.com" />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={form.phone || ''} onChange={e => set('phone', e.target.value)} placeholder="+249..." />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea rows={3} value={form.notes || ''} onChange={e => set('notes', e.target.value)} placeholder="Additional notes..." />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_primary} onChange={e => set('is_primary', e.target.checked)} className="rounded" />
              <span className="text-sm">Primary contact for this partner</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editing ? 'Update' : 'Add Contact'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
