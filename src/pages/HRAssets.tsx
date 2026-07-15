import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/context/user/UserContext';
import { useToast } from '@/hooks/use-toast';
import { exportMultiSheetExcel } from '@/utils/report-export';
import { NotificationTriggerService } from '@/services/NotificationTriggerService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Laptop, Phone, CreditCard, Car, Tablet, Camera, Radio,
  Package, Loader2, Plus, Edit2, RotateCcw, UserCheck,
  Search, FileDown, Wrench, Archive, Filter,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────
type AssetType = 'laptop'|'phone'|'access_card'|'sim_card'|'software_license'|'vehicle'|'tablet'|'camera'|'radio'|'generator'|'other';
type AssetStatus = 'available'|'assigned'|'maintenance'|'retired';
type Condition = 'excellent'|'good'|'fair'|'damaged';

interface Asset {
  id: string;
  asset_type: AssetType;
  name: string;
  serial_number: string | null;
  model: string | null;
  purchase_date: string | null;
  purchase_value: number | null;
  current_condition: Condition | null;
  status: AssetStatus;
  notes: string | null;
  hub_id: string | null;
  created_at: string;
  // joined
  assigned_to_name?: string | null;
  assigned_to_id?: string | null;
  assignment_id?: string | null;
  assigned_date?: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const ASSET_TYPE_ICONS: Record<string, React.ElementType> = {
  laptop: Laptop, phone: Phone, access_card: CreditCard, sim_card: Package,
  vehicle: Car, tablet: Tablet, camera: Camera, radio: Radio,
  software_license: Package, generator: Package, other: Package,
};

const ASSET_TYPES: { value: AssetType; label: string }[] = [
  { value: 'laptop', label: 'Laptop' }, { value: 'phone', label: 'Phone' },
  { value: 'access_card', label: 'Access Card' }, { value: 'sim_card', label: 'SIM Card' },
  { value: 'software_license', label: 'Software License' }, { value: 'vehicle', label: 'Vehicle' },
  { value: 'tablet', label: 'Tablet' }, { value: 'camera', label: 'Camera' },
  { value: 'radio', label: 'Radio' }, { value: 'generator', label: 'Generator' },
  { value: 'other', label: 'Other' },
];

const STATUS_META: Record<AssetStatus, { label: string; cls: string }> = {
  available:   { label: 'Available',   cls: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
  assigned:    { label: 'Assigned',    cls: 'bg-blue-100 text-blue-700 border-blue-300' },
  maintenance: { label: 'Maintenance', cls: 'bg-amber-100 text-amber-700 border-amber-300' },
  retired:     { label: 'Retired',     cls: 'bg-gray-100 text-gray-600 border-gray-300' },
};

const CONDITION_META: Record<Condition, { label: string; cls: string }> = {
  excellent: { label: 'Excellent', cls: 'bg-emerald-100 text-emerald-700' },
  good:      { label: 'Good',      cls: 'bg-blue-100 text-blue-700' },
  fair:      { label: 'Fair',      cls: 'bg-amber-100 text-amber-700' },
  damaged:   { label: 'Damaged',   cls: 'bg-red-100 text-red-700' },
};

const CONDITIONS: Condition[] = ['excellent', 'good', 'fair', 'damaged'];

const BLANK_ASSET = {
  asset_type: 'laptop' as AssetType, name: '', serial_number: '', model: '',
  purchase_date: '', purchase_value: '', current_condition: 'good' as Condition,
  status: 'available' as AssetStatus, notes: '',
};

const BLANK_ASSIGN = { userId: '', condition: 'good' as Condition, assignedDate: new Date().toISOString().slice(0, 10), notes: '' };
const BLANK_RETURN = { condition: 'good' as Condition, notes: '' };

const isHrAdmin = (role?: string | null) => {
  const r = (role ?? '').toLowerCase().replace('_', '');
  return ['admin', 'superadmin', 'hradmin', 'ict'].some(x => r.includes(x));
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function HRAssets() {
  const { profile, user } = useUser();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isAdmin = isHrAdmin(profile?.role);

  // Filters
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [assignedToFilter, setAssignedToFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');

  // Dialogs
  const [assetDialog, setAssetDialog] = useState<{ mode: 'add' | 'edit'; asset?: Asset } | null>(null);
  const [assignDialog, setAssignDialog] = useState<Asset | null>(null);
  const [returnDialog, setReturnDialog] = useState<Asset | null>(null);
  const [assetForm, setAssetForm] = useState(BLANK_ASSET);
  const [assignForm, setAssignForm] = useState(BLANK_ASSIGN);
  const [returnForm, setReturnForm] = useState(BLANK_RETURN);
  const [saving, setSaving] = useState(false);

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: assets = [], isLoading } = useQuery<Asset[]>({
    queryKey: ['hr-assets'],
    queryFn: async () => {
      const { data, error } = await supabase.from('hr_assets').select('*').order('name');
      if (error) throw error;
      const assetIds = (data ?? []).map((a: any) => a.id);
      if (assetIds.length === 0) return [];
      // Active assignments
      const { data: assigns } = await supabase
        .from('hr_asset_assignments')
        .select('id, asset_id, user_id, assigned_date, assigned_by')
        .is('returned_date', null)
        .in('asset_id', assetIds);
      const userIds = [...new Set((assigns ?? []).map((a: any) => a.user_id))];
      let nameMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', userIds);
        (profs ?? []).forEach((p: any) => { nameMap[p.id] = p.full_name; });
      }
      const assignMap = new Map<string, any>();
      (assigns ?? []).forEach((a: any) => assignMap.set(a.asset_id, a));
      return (data ?? []).map((a: any) => {
        const asgn = assignMap.get(a.id);
        return {
          ...a,
          assigned_to_id: asgn?.user_id ?? null,
          assigned_to_name: asgn ? (nameMap[asgn.user_id] ?? 'Unknown') : null,
          assignment_id: asgn?.id ?? null,
          assigned_date: asgn?.assigned_date ?? null,
        };
      });
    },
  });

  const { data: employees = [] } = useQuery<{ id: string; full_name: string; department_id: string | null }[]>({
    queryKey: ['hr-assets-employees'],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, full_name, department_id').eq('is_active', true).order('full_name');
      if (error) throw error;
      return (data ?? []) as { id: string; full_name: string; department_id: string | null }[];
    },
  });

  const { data: departments = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['hr-assets-departments'],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from('departments').select('id, name').order('name');
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const invalidate = useCallback(() => qc.invalidateQueries({ queryKey: ['hr-assets'] }), [qc]);

  // ── Filters ──────────────────────────────────────────────────────────────
  const empDeptMap = Object.fromEntries(employees.map(e => [e.id, e.department_id]));

  const filtered = assets.filter(a => {
    if (typeFilter !== 'all' && a.asset_type !== typeFilter) return false;
    if (statusFilter !== 'all' && a.status !== statusFilter) return false;
    if (assignedToFilter !== 'all') {
      if (assignedToFilter === 'unassigned') {
        if (a.assigned_to_id) return false;
      } else {
        if (a.assigned_to_id !== assignedToFilter) return false;
      }
    }
    if (deptFilter !== 'all') {
      const assignedDept = a.assigned_to_id ? empDeptMap[a.assigned_to_id] : null;
      if (assignedDept !== deptFilter) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      return a.name.toLowerCase().includes(q) ||
        (a.serial_number ?? '').toLowerCase().includes(q) ||
        (a.model ?? '').toLowerCase().includes(q) ||
        (a.assigned_to_name ?? '').toLowerCase().includes(q);
    }
    return true;
  });

  const stats = {
    total: assets.length,
    available: assets.filter(a => a.status === 'available').length,
    assigned: assets.filter(a => a.status === 'assigned').length,
    maintenance: assets.filter(a => a.status === 'maintenance').length,
  };

  // ── Save Asset ────────────────────────────────────────────────────────────
  const handleSaveAsset = async () => {
    if (!assetForm.name.trim()) { toast({ title: 'Asset name required', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        asset_type: assetForm.asset_type,
        name: assetForm.name.trim(),
        serial_number: assetForm.serial_number?.trim() || null,
        model: assetForm.model?.trim() || null,
        purchase_date: assetForm.purchase_date || null,
        purchase_value: assetForm.purchase_value ? Number(assetForm.purchase_value) : null,
        current_condition: assetForm.current_condition,
        status: assetForm.status,
        notes: assetForm.notes?.trim() || null,
        updated_at: new Date().toISOString(),
      };
      if (assetDialog?.mode === 'add') {
        payload.created_by = user?.id ?? null;
        const { error } = await supabase.from('hr_assets').insert(payload);
        if (error) throw error;
        toast({ title: 'Asset added' });
      } else if (assetDialog?.asset) {
        const { error } = await supabase.from('hr_assets').update(payload).eq('id', assetDialog.asset.id);
        if (error) throw error;
        toast({ title: 'Asset updated' });
      }
      setAssetDialog(null);
      invalidate();
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  // ── Assign ────────────────────────────────────────────────────────────────
  const handleAssign = async () => {
    if (!assignDialog || !assignForm.userId) { toast({ title: 'Select an employee', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const { error: aErr } = await supabase.from('hr_asset_assignments').insert({
        asset_id: assignDialog.id,
        user_id: assignForm.userId,
        assigned_date: assignForm.assignedDate,
        condition_at_assignment: assignForm.condition,
        notes: assignForm.notes || null,
        assigned_by: user?.id ?? null,
      });
      if (aErr) throw aErr;
      const { error: sErr } = await supabase.from('hr_assets').update({ status: 'assigned', current_condition: assignForm.condition, updated_at: new Date().toISOString() }).eq('id', assignDialog.id);
      if (sErr) throw sErr;
      // Notify the employee
      try {
        const typeName = ASSET_TYPES.find(t => t.value === assignDialog.asset_type)?.label ?? assignDialog.asset_type;
        await NotificationTriggerService.send({
          userId: assignForm.userId,
          title: 'Equipment issued to you',
          titleAr: 'تم إصدار معدات باسمك',
          message: `${typeName} "${assignDialog.name}" has been issued to you by HR. Please confirm receipt.`,
          messageAr: `تم إصدار ${typeName} "${assignDialog.name}" باسمك من قِبل الموارد البشرية. يُرجى تأكيد الاستلام.`,
          type: 'info',
          category: 'system',
          priority: 'normal',
          link: '/profile',
        });
      } catch (e) { console.error('Assignment notification failed', e); }
      toast({ title: 'Asset assigned' });
      setAssignDialog(null);
      invalidate();
    } catch (e: any) {
      toast({ title: 'Assign failed', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  // ── Return ────────────────────────────────────────────────────────────────
  const handleReturn = async () => {
    if (!returnDialog?.assignment_id) return;
    setSaving(true);
    try {
      const { error: rErr } = await supabase.from('hr_asset_assignments').update({
        returned_date: new Date().toISOString().slice(0, 10),
        condition_at_return: returnForm.condition,
        notes: returnForm.notes || null,
        updated_at: new Date().toISOString(),
      }).eq('id', returnDialog.assignment_id);
      if (rErr) throw rErr;
      const { error: sErr } = await supabase.from('hr_assets').update({ status: 'available', current_condition: returnForm.condition, updated_at: new Date().toISOString() }).eq('id', returnDialog.id);
      if (sErr) throw sErr;
      toast({ title: 'Asset marked returned' });
      setReturnDialog(null);
      invalidate();
    } catch (e: any) {
      toast({ title: 'Return failed', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  // ── Excel Export (multi-sheet: Assets + Assignment History) ──────────────
  const handleExport = async () => {
    const assetRows = filtered.map(a => ({
      'Asset Name': a.name,
      'Type': ASSET_TYPES.find(t => t.value === a.asset_type)?.label ?? a.asset_type,
      'Serial Number': a.serial_number ?? '',
      'Model': a.model ?? '',
      'Status': STATUS_META[a.status]?.label ?? a.status,
      'Condition': a.current_condition ? (a.current_condition.charAt(0).toUpperCase() + a.current_condition.slice(1)) : '',
      'Currently Assigned To': a.assigned_to_name ?? '',
      'Assignment Date': a.assigned_date ?? '',
      'Purchase Date': a.purchase_date ?? '',
      'Purchase Value': a.purchase_value ?? '',
      'Notes': a.notes ?? '',
    }));

    // Fetch full assignment history for the visible asset set
    const assetIds = filtered.map(a => a.id);
    let historyRows: Record<string, string | number>[] = [];
    if (assetIds.length > 0) {
      const { data: hist } = await supabase
        .from('hr_asset_assignments')
        .select('id, asset_id, user_id, assigned_date, returned_date, condition_at_assignment, condition_at_return, notes, asset:hr_assets(name, asset_type), employee:profiles!user_id(full_name), assigner:profiles!assigned_by(full_name)')
        .in('asset_id', assetIds)
        .order('assigned_date', { ascending: false });
      const capitalize = (s: string | null) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
      historyRows = (hist ?? []).map((h: any) => ({
        'Asset Name': h.asset?.name ?? '',
        'Asset Type': ASSET_TYPES.find(t => t.value === h.asset?.asset_type)?.label ?? (h.asset?.asset_type ?? ''),
        'Employee': h.employee?.full_name ?? '',
        'Assigned Date': h.assigned_date ?? '',
        'Returned Date': h.returned_date ?? 'Outstanding',
        'Condition at Assignment': capitalize(h.condition_at_assignment),
        'Condition at Return': capitalize(h.condition_at_return),
        'Assigned By': h.assigner?.full_name ?? '',
        'Notes': h.notes ?? '',
      }));
    }

    exportMultiSheetExcel([
      { name: 'Assets', data: assetRows },
      { name: 'Assignment History', data: historyRows },
    ], `hr-assets-${new Date().toISOString().slice(0, 10)}`);
    toast({ title: 'Excel exported', description: `${assetRows.length} assets · ${historyRows.length} assignment records` });
  };

  // ── Retire ────────────────────────────────────────────────────────────────
  const handleRetire = async (asset: Asset) => {
    if (!confirm(`Retire "${asset.name}"? It will no longer appear as available.`)) return;
    const { error } = await supabase.from('hr_assets').update({ status: 'retired', updated_at: new Date().toISOString() }).eq('id', asset.id);
    if (error) toast({ title: 'Retire failed', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Asset retired' }); invalidate(); }
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-orange-100 dark:bg-orange-950/30 flex items-center justify-center">
            <Package className="h-5 w-5 text-orange-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Equipment & Assets</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Track issued equipment, assignment history, and returns</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5 h-8 text-xs" data-testid="button-export-assets">
            <FileDown className="h-3.5 w-3.5" /> Export Excel
          </Button>
          {isAdmin && (
            <Button size="sm" onClick={() => { setAssetForm({ ...BLANK_ASSET }); setAssetDialog({ mode: 'add' }); }} className="gap-1.5 h-8 text-xs" data-testid="button-add-asset">
              <Plus className="h-3.5 w-3.5" /> Add Asset
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Assets', value: stats.total, color: 'text-gray-800 dark:text-gray-200' },
          { label: 'Available', value: stats.available, color: 'text-emerald-700' },
          { label: 'Assigned', value: stats.assigned, color: 'text-blue-700' },
          { label: 'In Maintenance', value: stats.maintenance, color: 'text-amber-700' },
        ].map(s => (
          <div key={s.label} className="bg-card border rounded-xl p-4 text-center">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Search by name, serial, employee…" className="pl-8 h-8 text-sm" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-assets" />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40 h-8 text-xs"><Filter className="h-3 w-3 mr-1" /><SelectValue placeholder="All Types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {ASSET_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {Object.entries(STATUS_META).map(([v, m]) => <SelectItem key={v} value={v}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={assignedToFilter} onValueChange={setAssignedToFilter}>
          <SelectTrigger className="w-44 h-8 text-xs"><SelectValue placeholder="Assigned To" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Employees</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
          </SelectContent>
        </Select>
        {departments.length > 0 && (
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="w-44 h-8 text-xs"><SelectValue placeholder="Department" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Asset Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">{[1,2,3,4].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center mb-3">
                <Package className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="font-medium text-muted-foreground">No assets found.</p>
              {isAdmin && <Button className="mt-4" size="sm" onClick={() => { setAssetForm({ ...BLANK_ASSET }); setAssetDialog({ mode: 'add' }); }}><Plus className="h-3.5 w-3.5 mr-1" />Add First Asset</Button>}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Asset</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Serial / Model</TableHead>
                    <TableHead>Condition</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Assigned To</TableHead>
                    {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(asset => {
                    const Icon = ASSET_TYPE_ICONS[asset.asset_type] ?? Package;
                    const sm = STATUS_META[asset.status] ?? { label: asset.status, cls: 'bg-gray-100' };
                    const cm = asset.current_condition ? CONDITION_META[asset.current_condition] : null;
                    return (
                      <TableRow key={asset.id} data-testid={`row-asset-${asset.id}`}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-lg bg-orange-50 dark:bg-orange-950/20 flex items-center justify-center shrink-0">
                              <Icon className="h-4 w-4 text-orange-500" />
                            </div>
                            <span className="font-medium text-sm">{asset.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {ASSET_TYPES.find(t => t.value === asset.asset_type)?.label ?? asset.asset_type}
                        </TableCell>
                        <TableCell className="text-xs">
                          {asset.serial_number && <div className="font-mono">{asset.serial_number}</div>}
                          {asset.model && <div className="text-muted-foreground">{asset.model}</div>}
                        </TableCell>
                        <TableCell>
                          {cm && <Badge className={`text-[11px] px-2 border-0 ${cm.cls}`}>{cm.label}</Badge>}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[11px] px-2 ${sm.cls}`}>{sm.label}</Badge>
                        </TableCell>
                        <TableCell>
                          {asset.assigned_to_name ? (
                            <div className="text-sm">
                              <div className="font-medium">{asset.assigned_to_name}</div>
                              {asset.assigned_date && <div className="text-xs text-muted-foreground">{new Date(asset.assigned_date).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}</div>}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        {isAdmin && (
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Edit" onClick={() => { setAssetForm({ asset_type: asset.asset_type, name: asset.name, serial_number: asset.serial_number ?? '', model: asset.model ?? '', purchase_date: asset.purchase_date ?? '', purchase_value: String(asset.purchase_value ?? ''), current_condition: asset.current_condition ?? 'good', status: asset.status, notes: asset.notes ?? '' }); setAssetDialog({ mode: 'edit', asset }); }} data-testid={`button-edit-${asset.id}`}>
                                <Edit2 className="h-3.5 w-3.5" />
                              </Button>
                              {asset.status === 'available' && (
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-blue-600" title="Assign" onClick={() => { setAssignForm({ ...BLANK_ASSIGN }); setAssignDialog(asset); }} data-testid={`button-assign-${asset.id}`}>
                                  <UserCheck className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {asset.status === 'assigned' && (
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-amber-600" title="Mark Returned" onClick={() => { setReturnForm({ ...BLANK_RETURN }); setReturnDialog(asset); }} data-testid={`button-return-${asset.id}`}>
                                  <RotateCcw className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {asset.status !== 'retired' && asset.status !== 'assigned' && (
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" title="Retire" onClick={() => handleRetire(asset)} data-testid={`button-retire-${asset.id}`}>
                                  <Archive className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {asset.status !== 'maintenance' && asset.status !== 'retired' && asset.status !== 'assigned' && (
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-amber-600" title="Send for Maintenance" onClick={async () => { await supabase.from('hr_assets').update({ status: 'maintenance', updated_at: new Date().toISOString() }).eq('id', asset.id); invalidate(); }} data-testid={`button-maintenance-${asset.id}`}>
                                  <Wrench className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit Asset Dialog */}
      <Dialog open={!!assetDialog} onOpenChange={v => !v && setAssetDialog(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="dialog-asset-form">
          <DialogHeader>
            <DialogTitle>{assetDialog?.mode === 'add' ? 'Add New Asset' : 'Edit Asset'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Asset Type *</label>
                <Select value={assetForm.asset_type} onValueChange={v => setAssetForm(p => ({ ...p, asset_type: v as AssetType }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>{ASSET_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Status</label>
                <Select value={assetForm.status} onValueChange={v => setAssetForm(p => ({ ...p, status: v as AssetStatus }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(STATUS_META).filter(([k]) => k !== 'assigned').map(([v, m]) => <SelectItem key={v} value={v}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Asset Name *</label>
              <Input value={assetForm.name} onChange={e => setAssetForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Dell Latitude 5420 #3" className="h-9" data-testid="input-asset-name" />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Serial Number</label>
                <Input value={assetForm.serial_number} onChange={e => setAssetForm(p => ({ ...p, serial_number: e.target.value }))} placeholder="Manufacturer serial" className="h-9" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Model</label>
                <Input value={assetForm.model} onChange={e => setAssetForm(p => ({ ...p, model: e.target.value }))} placeholder="e.g. Latitude 5420" className="h-9" />
              </div>
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Condition</label>
                <Select value={assetForm.current_condition} onValueChange={v => setAssetForm(p => ({ ...p, current_condition: v as Condition }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>{CONDITIONS.map(c => <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Purchase Date</label>
                <Input type="date" value={assetForm.purchase_date} onChange={e => setAssetForm(p => ({ ...p, purchase_date: e.target.value }))} className="h-9" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Purchase Value</label>
                <Input type="number" min="0" step="0.01" value={assetForm.purchase_value} onChange={e => setAssetForm(p => ({ ...p, purchase_value: e.target.value }))} placeholder="0.00" className="h-9" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Notes</label>
              <Textarea value={assetForm.notes} onChange={e => setAssetForm(p => ({ ...p, notes: e.target.value }))} rows={2} className="resize-none" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssetDialog(null)}>Cancel</Button>
            <Button onClick={handleSaveAsset} disabled={saving} data-testid="button-save-asset">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              {assetDialog?.mode === 'add' ? 'Add Asset' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Dialog */}
      <Dialog open={!!assignDialog} onOpenChange={v => !v && setAssignDialog(null)}>
        <DialogContent className="max-w-md" data-testid="dialog-assign-asset">
          <DialogHeader><DialogTitle>Assign Asset</DialogTitle></DialogHeader>
          {assignDialog && (
            <div className="space-y-3">
              <div className="p-3 bg-muted rounded-lg text-sm">
                <p className="font-medium">{assignDialog.name}</p>
                {assignDialog.serial_number && <p className="text-xs text-muted-foreground font-mono mt-0.5">S/N: {assignDialog.serial_number}</p>}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Assign To *</label>
                <Select value={assignForm.userId} onValueChange={v => setAssignForm(p => ({ ...p, userId: v }))}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select employee…" /></SelectTrigger>
                  <SelectContent>{employees.map(e => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Condition at Assignment</label>
                  <Select value={assignForm.condition} onValueChange={v => setAssignForm(p => ({ ...p, condition: v as Condition }))}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>{CONDITIONS.map(c => <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Assignment Date</label>
                  <Input type="date" value={assignForm.assignedDate} onChange={e => setAssignForm(p => ({ ...p, assignedDate: e.target.value }))} className="h-9" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
                <Input value={assignForm.notes} onChange={e => setAssignForm(p => ({ ...p, notes: e.target.value }))} placeholder="Handover notes…" className="h-9" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialog(null)}>Cancel</Button>
            <Button onClick={handleAssign} disabled={saving || !assignForm.userId} data-testid="button-confirm-assign">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null} Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Return Dialog */}
      <Dialog open={!!returnDialog} onOpenChange={v => !v && setReturnDialog(null)}>
        <DialogContent className="max-w-md" data-testid="dialog-return-asset">
          <DialogHeader><DialogTitle>Mark Asset Returned</DialogTitle></DialogHeader>
          {returnDialog && (
            <div className="space-y-3">
              <div className="p-3 bg-muted rounded-lg text-sm">
                <p className="font-medium">{returnDialog.name}</p>
                {returnDialog.assigned_to_name && <p className="text-xs text-muted-foreground mt-0.5">Currently assigned to: {returnDialog.assigned_to_name}</p>}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Condition at Return</label>
                <Select value={returnForm.condition} onValueChange={v => setReturnForm(p => ({ ...p, condition: v as Condition }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>{CONDITIONS.map(c => <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
                <Input value={returnForm.notes} onChange={e => setReturnForm(p => ({ ...p, notes: e.target.value }))} placeholder="Any damage or notes…" className="h-9" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnDialog(null)}>Cancel</Button>
            <Button onClick={handleReturn} disabled={saving} data-testid="button-confirm-return">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null} Confirm Return
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
