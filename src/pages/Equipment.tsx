import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { ensureValidSession } from '@/lib/session-health';
import { useAppContext } from '@/context/AppContext';
import { Package, Plus, Search, RefreshCw, X, Wrench, CheckCircle, AlertTriangle, Filter } from 'lucide-react';

interface Equipment {
  id: string;
  name: string;
  type: string;
  serial_number: string;
  status: 'available' | 'assigned' | 'maintenance' | 'damaged' | 'lost';
  condition: 'good' | 'fair' | 'poor';
  assigned_to?: string;
  assigned_to_name?: string;
  location?: string;
  notes?: string;
  last_checked?: string;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  available: 'bg-green-100 text-green-800',
  assigned: 'bg-blue-100 text-blue-800',
  maintenance: 'bg-yellow-100 text-yellow-800',
  damaged: 'bg-orange-100 text-orange-800',
  lost: 'bg-red-100 text-red-800',
};
const CONDITION_COLORS: Record<string, string> = {
  good: 'bg-green-100 text-green-800',
  fair: 'bg-yellow-100 text-yellow-800',
  poor: 'bg-red-100 text-red-800',
};

const EQUIPMENT_TYPES = ['Vehicle', 'Laptop', 'Tablet', 'Phone', 'GPS Device', 'Camera', 'Radio', 'Generator', 'Medical Kit', 'Safety Equipment', 'Survey Tool', 'Other'];

export default function EquipmentPage() {
  const { user } = useAppContext();
  const { toast } = useToast();
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    name: '',
    type: '',
    serial_number: '',
    status: 'available' as const,
    condition: 'good' as const,
    location: '',
    notes: '',
  });

  useEffect(() => { fetchEquipment(); }, []);

  async function fetchEquipment() {
    setLoading(true);
    try {
      const { data } = await supabase.from('equipment').select('*').order('created_at', { ascending: false });
      if (data) setEquipment(data as Equipment[]);
    } catch {
      // table may not exist yet
    } finally {
      setLoading(false);
    }
  }

  async function submitEquipment() {
    if (!form.name || !form.type) {
      toast({ title: 'Name and type are required', variant: 'destructive' });
      return;
    }
    const session = await ensureValidSession();
    if (!session.success) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from('equipment').insert({ ...form, created_by: user?.id });
      if (error) throw error;
      toast({ title: 'Equipment added successfully' });
      setShowForm(false);
      setForm({ name: '', type: '', serial_number: '', status: 'available', condition: 'good', location: '', notes: '' });
      fetchEquipment();
    } catch (e: any) {
      toast({ title: 'Failed to add equipment', description: e.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    const session = await ensureValidSession();
    if (!session.success) return;
    try {
      const { error } = await supabase.from('equipment').update({ status, last_checked: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
      toast({ title: 'Status updated' });
      fetchEquipment();
    } catch (e: any) {
      toast({ title: 'Failed to update', description: e.message, variant: 'destructive' });
    }
  }

  const uniqueTypes = [...new Set(equipment.map(e => e.type).filter(Boolean))];
  const filtered = equipment.filter(e => {
    const matchSearch = e.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.serial_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.location?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchStatus = filterStatus === 'all' || e.status === filterStatus;
    const matchType = filterType === 'all' || e.type === filterType;
    return matchSearch && matchStatus && matchType;
  });

  const stats = {
    total: equipment.length,
    available: equipment.filter(e => e.status === 'available').length,
    assigned: equipment.filter(e => e.status === 'assigned').length,
    maintenance: equipment.filter(e => e.status === 'maintenance' || e.status === 'damaged').length,
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="w-7 h-7 text-blue-600" />
            Equipment Tracking
          </h1>
          <p className="text-muted-foreground mt-1">Manage and track all field equipment inventory</p>
        </div>
        <Button onClick={() => setShowForm(true)} data-testid="button-add-equipment">
          <Plus className="w-4 h-4 mr-2" /> Add Equipment
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: stats.total, icon: Package, color: 'text-foreground' },
          { label: 'Available', value: stats.available, icon: CheckCircle, color: 'text-green-600' },
          { label: 'Assigned', value: stats.assigned, icon: Wrench, color: 'text-blue-600' },
          { label: 'Needs Attention', value: stats.maintenance, icon: AlertTriangle, color: 'text-orange-600' },
        ].map(stat => (
          <Card key={stat.label}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <stat.icon className={`w-6 h-6 ${stat.color}`} />
                <div>
                  <div className={`text-xl font-bold ${stat.color}`}>{stat.value}</div>
                  <div className="text-xs text-muted-foreground">{stat.label}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {showForm && (
        <Card className="border-blue-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Add Equipment</CardTitle>
            <Button variant="ghost" size="icon" onClick={() => setShowForm(false)}><X className="w-4 h-4" /></Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input placeholder="e.g. Toyota Land Cruiser" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} data-testid="input-equipment-name" />
              </div>
              <div className="space-y-2">
                <Label>Type *</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger data-testid="select-type"><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>{EQUIPMENT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Serial / ID Number</Label>
                <Input placeholder="Serial number or asset ID" value={form.serial_number} onChange={e => setForm(f => ({ ...f, serial_number: e.target.value }))} data-testid="input-serial" />
              </div>
              <div className="space-y-2">
                <Label>Current Location</Label>
                <Input placeholder="Hub or field location" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} data-testid="input-location" />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as any }))}>
                  <SelectTrigger data-testid="select-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="assigned">Assigned</SelectItem>
                    <SelectItem value="maintenance">Under Maintenance</SelectItem>
                    <SelectItem value="damaged">Damaged</SelectItem>
                    <SelectItem value="lost">Lost</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Condition</Label>
                <Select value={form.condition} onValueChange={v => setForm(f => ({ ...f, condition: v as any }))}>
                  <SelectTrigger data-testid="select-condition"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="good">Good</SelectItem>
                    <SelectItem value="fair">Fair</SelectItem>
                    <SelectItem value="poor">Poor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea rows={2} placeholder="Additional notes..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} data-testid="textarea-notes" />
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button onClick={submitEquipment} disabled={submitting} data-testid="button-submit-equipment">
                {submitting ? 'Saving...' : 'Add Equipment'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search equipment..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} data-testid="input-search" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36" data-testid="select-filter-status"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="available">Available</SelectItem>
            <SelectItem value="assigned">Assigned</SelectItem>
            <SelectItem value="maintenance">Maintenance</SelectItem>
            <SelectItem value="damaged">Damaged</SelectItem>
            <SelectItem value="lost">Lost</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-36" data-testid="select-filter-type"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {[...new Set([...EQUIPMENT_TYPES, ...uniqueTypes])].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={fetchEquipment} data-testid="button-refresh"><RefreshCw className="w-4 h-4" /></Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading equipment...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Package className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">{equipment.length === 0 ? 'No equipment added yet.' : 'No equipment matches your filters.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(item => (
            <Card key={item.id} data-testid={`card-equipment-${item.id}`}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold">{item.name}</p>
                    <p className="text-sm text-muted-foreground">{item.type}</p>
                  </div>
                  <Badge className={STATUS_COLORS[item.status] || ''}>{item.status}</Badge>
                </div>
                <div className="space-y-1 text-sm">
                  {item.serial_number && <p className="text-muted-foreground">S/N: {item.serial_number}</p>}
                  {item.location && <p className="text-muted-foreground flex items-center gap-1">📍 {item.location}</p>}
                  {item.assigned_to_name && <p className="text-muted-foreground">👤 {item.assigned_to_name}</p>}
                  {item.condition && <Badge variant="outline" className={`text-xs ${CONDITION_COLORS[item.condition] || ''}`}>{item.condition} condition</Badge>}
                </div>
                {item.status === 'available' && (
                  <Button size="sm" variant="outline" className="mt-3 w-full text-yellow-700 border-yellow-300" onClick={() => updateStatus(item.id, 'maintenance')} data-testid={`button-maintenance-${item.id}`}>
                    Mark for Maintenance
                  </Button>
                )}
                {item.status === 'maintenance' && (
                  <Button size="sm" variant="outline" className="mt-3 w-full text-green-700 border-green-300" onClick={() => updateStatus(item.id, 'available')} data-testid={`button-available-${item.id}`}>
                    Mark Available
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
