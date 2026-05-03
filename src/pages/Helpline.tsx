import { useState, useEffect } from 'react';
import { useAuthorization } from '@/hooks/use-authorization';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { supabase } from '@/integrations/supabase/client';
import { ensureValidSession } from '@/lib/session-health';
import { useAppContext } from '@/context/AppContext';
import { Phone, Plus, X, Search, RefreshCw, Edit2, Trash2, Shield, Ambulance, Building, User } from 'lucide-react';

interface HelplineContact {
  id: string;
  name: string;
  role: string;
  phone: string;
  category: 'emergency' | 'medical' | 'security' | 'pact' | 'authority' | 'other';
  description?: string;
  is_active: boolean;
  priority: number;
  created_at: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  emergency: 'bg-red-100 text-red-800',
  medical: 'bg-blue-100 text-blue-800',
  security: 'bg-orange-100 text-orange-800',
  pact: 'bg-purple-100 text-purple-800',
  authority: 'bg-yellow-100 text-yellow-800',
  other: 'bg-gray-100 text-gray-800',
};

const CATEGORY_ICONS: Record<string, any> = {
  emergency: Shield,
  medical: Ambulance,
  security: Shield,
  pact: User,
  authority: Building,
  other: Phone,
};

export default function Helpline() {
  const { user, roles } = useAppContext();
  const { toast } = useToast();
  const { hasAnyRole, isSuperAdmin } = useAuthorization();
  const isAdmin = isSuperAdmin() || hasAnyRole(['admin']);
  const [contacts, setContacts] = useState<HelplineContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    name: '',
    role: '',
    phone: '',
    category: 'pact' as const,
    description: '',
    priority: 5,
    is_active: true,
  });

  useEffect(() => { fetchContacts(); }, []);

  async function fetchContacts() {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('support_contacts')
        .select('*')
        .order('priority', { ascending: true })
        .order('name');
      if (data) setContacts(data as HelplineContact[]);
    } catch {
      // table may not exist yet
    } finally {
      setLoading(false);
    }
  }

  async function saveContact() {
    if (!form.name || !form.phone) {
      toast({ title: 'Name and phone are required', variant: 'destructive' });
      return;
    }
    const session = await ensureValidSession();
    if (!session.success) return;
    setSubmitting(true);
    try {
      if (editingId) {
        const { error } = await supabase.from('support_contacts').update(form).eq('id', editingId);
        if (error) throw error;
        toast({ title: 'Contact updated' });
      } else {
        const { error } = await supabase.from('support_contacts').insert({ ...form, created_by: user?.id });
        if (error) throw error;
        toast({ title: 'Contact added' });
      }
      resetForm();
      fetchContacts();
    } catch (e: any) {
      toast({ title: 'Failed to save contact', description: e.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteContact(id: string) {
    const session = await ensureValidSession();
    if (!session.success) return;
    try {
      await supabase.from('support_contacts').delete().eq('id', id);
      toast({ title: 'Contact removed' });
      fetchContacts();
    } catch {
      toast({ title: 'Failed to delete', variant: 'destructive' });
    }
  }

  function confirmDeleteContact(id: string) {
    toast({
      title: 'Delete this contact?',
      description: 'This action cannot be undone.',
      variant: 'destructive',
      action: <ToastAction altText="Confirm deletion" onClick={() => deleteContact(id)}>Delete</ToastAction>,
    });
  }

  async function toggleActive(id: string, current: boolean) {
    const session = await ensureValidSession();
    if (!session.success) return;
    const { error } = await supabase.from('support_contacts').update({ is_active: !current }).eq('id', id);
    if (error) { toast({ title: 'Failed to update contact', description: error.message, variant: 'destructive' }); return; }
    fetchContacts();
  }

  function startEdit(contact: HelplineContact) {
    setEditingId(contact.id);
    setForm({
      name: contact.name,
      role: contact.role,
      phone: contact.phone,
      category: contact.category,
      description: contact.description || '',
      priority: contact.priority,
      is_active: contact.is_active,
    });
    setShowForm(true);
  }

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setForm({ name: '', role: '', phone: '', category: 'pact', description: '', priority: 5, is_active: true });
  }

  const filtered = contacts.filter(c => {
    const matchSearch = c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.role?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone?.includes(searchQuery);
    const matchCategory = filterCategory === 'all' || c.category === filterCategory;
    return matchSearch && matchCategory;
  });

  const grouped = filtered.reduce((acc, c) => {
    const key = c.category || 'other';
    if (!acc[key]) acc[key] = [];
    acc[key].push(c);
    return acc;
  }, {} as Record<string, HelplineContact[]>);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Phone className="w-7 h-7 text-green-600" />
            Helpline & Emergency Contacts
          </h1>
          <p className="text-muted-foreground mt-1">All emergency and support contacts available to field teams</p>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowForm(true)} data-testid="button-add-contact">
            <Plus className="w-4 h-4 mr-2" /> Add Contact
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { category: 'emergency', label: 'Emergency', icon: Shield, color: 'border-red-200 bg-red-50 dark:bg-red-950/20' },
          { category: 'medical', label: 'Medical', icon: Ambulance, color: 'border-blue-200 bg-blue-50 dark:bg-blue-950/20' },
          { category: 'pact', label: 'PACT Team', icon: User, color: 'border-purple-200 bg-purple-50 dark:bg-purple-950/20' },
        ].map(cat => {
          const catContacts = contacts.filter(c => c.category === cat.category && c.is_active);
          const firstContact = catContacts[0];
          return (
            <Card key={cat.category} className={`${cat.color} border`}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3 mb-3">
                  <cat.icon className="w-6 h-6" />
                  <span className="font-semibold">{cat.label}</span>
                  <Badge variant="outline">{catContacts.length}</Badge>
                </div>
                {firstContact ? (
                  <div>
                    <p className="font-medium text-sm">{firstContact.name}</p>
                    <a href={`tel:${firstContact.phone}`} className="text-lg font-bold hover:underline" data-testid={`link-call-quick-${firstContact.id}`}>
                      {firstContact.phone}
                    </a>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No contacts configured</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {showForm && (
        <Card className="border-green-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">{editingId ? 'Edit Contact' : 'Add Contact'}</CardTitle>
            <Button variant="ghost" size="icon" onClick={resetForm}><X className="w-4 h-4" /></Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input placeholder="Contact name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} data-testid="input-contact-name" />
              </div>
              <div className="space-y-2">
                <Label>Role / Title</Label>
                <Input placeholder="e.g. Field Coordinator" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} data-testid="input-role" />
              </div>
              <div className="space-y-2">
                <Label>Phone Number *</Label>
                <Input placeholder="+249 xxx xxx xxxx" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} data-testid="input-phone" />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v as any }))}>
                  <SelectTrigger data-testid="select-category"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="emergency">Emergency</SelectItem>
                    <SelectItem value="medical">Medical</SelectItem>
                    <SelectItem value="security">Security</SelectItem>
                    <SelectItem value="pact">PACT Team</SelectItem>
                    <SelectItem value="authority">Local Authority</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priority (1=highest)</Label>
                <Input type="number" min={1} max={100} value={form.priority} onChange={e => setForm(f => ({ ...f, priority: parseInt(e.target.value) || 5 }))} data-testid="input-priority" />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input placeholder="Brief description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} data-testid="input-description" />
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={resetForm}>Cancel</Button>
              <Button onClick={saveContact} disabled={submitting} data-testid="button-save-contact">
                {submitting ? 'Saving...' : editingId ? 'Update' : 'Add Contact'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search contacts..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} data-testid="input-search" />
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-40" data-testid="select-filter-category"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="emergency">Emergency</SelectItem>
            <SelectItem value="medical">Medical</SelectItem>
            <SelectItem value="security">Security</SelectItem>
            <SelectItem value="pact">PACT Team</SelectItem>
            <SelectItem value="authority">Authority</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={fetchContacts} data-testid="button-refresh"><RefreshCw className="w-4 h-4" /></Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading contacts...</div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="text-center py-16">
          <Phone className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">{contacts.length === 0 ? 'No contacts configured yet.' : 'No contacts match your search.'}</p>
          {isAdmin && contacts.length === 0 && (
            <Button className="mt-4" onClick={() => setShowForm(true)} data-testid="button-add-first">Add First Contact</Button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([category, items]) => {
            const Icon = CATEGORY_ICONS[category] || Phone;
            return (
              <div key={category}>
                <div className="flex items-center gap-2 mb-3">
                  <Icon className="w-4 h-4" />
                  <h3 className="font-semibold capitalize">{category === 'pact' ? 'PACT Team' : category}</h3>
                  <Badge variant="outline">{items.length}</Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {items.map(contact => (
                    <Card key={contact.id} className={!contact.is_active ? 'opacity-50' : ''} data-testid={`card-contact-${contact.id}`}>
                      <CardContent className="pt-4 pb-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{contact.name}</p>
                            <p className="text-sm text-muted-foreground">{contact.role}</p>
                            <a href={`tel:${contact.phone}`} className="text-sm text-green-600 hover:underline font-medium flex items-center gap-1 mt-1" data-testid={`link-call-${contact.id}`}>
                              <Phone className="w-3 h-3" /> {contact.phone}
                            </a>
                            {contact.description && <p className="text-xs text-muted-foreground mt-1">{contact.description}</p>}
                          </div>
                          {isAdmin && (
                            <div className="flex gap-1 ml-2 shrink-0">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(contact)} data-testid={`button-edit-${contact.id}`}><Edit2 className="w-3 h-3" /></Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => confirmDeleteContact(contact.id)} data-testid={`button-delete-${contact.id}`}><Trash2 className="w-3 h-3" /></Button>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <Badge className={CATEGORY_COLORS[contact.category] || ''}>{contact.category}</Badge>
                          {!contact.is_active && <Badge variant="outline" className="text-xs">Inactive</Badge>}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
