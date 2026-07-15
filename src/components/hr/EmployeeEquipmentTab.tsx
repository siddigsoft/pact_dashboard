import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Laptop, Phone, CreditCard, Car, Tablet, Camera, Radio, Package, Loader2, AlertTriangle, Plus, RotateCcw } from "lucide-react";
import { NotificationTriggerService } from "@/services/NotificationTriggerService";

const ASSET_TYPE_ICONS: Record<string, React.ElementType> = {
  laptop: Laptop, phone: Phone, access_card: CreditCard, sim_card: Package,
  vehicle: Car, tablet: Tablet, camera: Camera, radio: Radio,
};
const ASSET_TYPE_LABELS: Record<string, string> = {
  laptop: 'Laptop', phone: 'Phone', access_card: 'Access Card', sim_card: 'SIM Card',
  software_license: 'Software License', vehicle: 'Vehicle', tablet: 'Tablet',
  camera: 'Camera', radio: 'Radio', generator: 'Generator', other: 'Other',
};
const CONDITION_COLORS: Record<string, string> = {
  excellent: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  good:      'bg-blue-100 text-blue-700 border-blue-200',
  fair:      'bg-amber-100 text-amber-700 border-amber-200',
  damaged:   'bg-red-100 text-red-700 border-red-200',
};

interface Assignment {
  id: string;
  asset_id: string;
  assigned_date: string;
  returned_date: string | null;
  condition_at_assignment: string | null;
  notes: string | null;
  asset: {
    id: string;
    name: string;
    asset_type: string;
    serial_number: string | null;
    model: string | null;
    current_condition: string | null;
  } | null;
}

interface AvailableAsset {
  id: string;
  name: string;
  asset_type: string;
  serial_number: string | null;
  model: string | null;
  current_condition: string | null;
}

interface ReturnForm {
  assignmentId: string;
  assetName: string;
  condition: string;
  notes: string;
}

interface AssignForm {
  assetId: string;
  condition: string;
  assignedDate: string;
  notes: string;
}

export default function EmployeeEquipmentTab({ userId, isAdmin }: { userId: string; isAdmin: boolean }) {
  const { toast } = useToast();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [returnDialog, setReturnDialog] = useState<ReturnForm | null>(null);
  const [assignDialog, setAssignDialog] = useState(false);
  const [availableAssets, setAvailableAssets] = useState<AvailableAsset[]>([]);
  const [assignForm, setAssignForm] = useState<AssignForm>({ assetId: '', condition: 'good', assignedDate: new Date().toISOString().slice(0, 10), notes: '' });
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('hr_asset_assignments')
      .select('id, asset_id, assigned_date, returned_date, condition_at_assignment, notes, asset:hr_assets(id, name, asset_type, serial_number, model, current_condition)')
      .eq('user_id', userId)
      .order('assigned_date', { ascending: false });
    if (error) toast({ title: 'Failed to load equipment', description: error.message, variant: 'destructive' });
    else setAssignments((data ?? []) as Assignment[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const openAssignDialog = async () => {
    const { data } = await supabase.from('hr_assets').select('id, name, asset_type, serial_number, model, current_condition').eq('status', 'available').order('name');
    setAvailableAssets((data ?? []) as AvailableAsset[]);
    setAssignForm({ assetId: '', condition: 'good', assignedDate: new Date().toISOString().slice(0, 10), notes: '' });
    setAssignDialog(true);
  };

  const handleAssign = async () => {
    if (!assignForm.assetId) { toast({ title: 'Select an asset', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const { error: assignErr } = await supabase.from('hr_asset_assignments').insert({
        asset_id: assignForm.assetId,
        user_id: userId,
        assigned_date: assignForm.assignedDate,
        condition_at_assignment: assignForm.condition,
        notes: assignForm.notes || null,
      });
      if (assignErr) throw assignErr;
      const selectedAsset = availableAssets.find(a => a.id === assignForm.assetId);
      const { error: statusErr } = await supabase.from('hr_assets').update({ status: 'assigned', current_condition: assignForm.condition, updated_at: new Date().toISOString() }).eq('id', assignForm.assetId);
      if (statusErr) throw statusErr;
      // Notify the employee that equipment was issued to them
      if (selectedAsset) {
        try {
          const typeLabel = ASSET_TYPE_LABELS[selectedAsset.asset_type] ?? selectedAsset.asset_type;
          await NotificationTriggerService.send({
            userId,
            title: 'Equipment issued to you',
            titleAr: 'تم إصدار معدات باسمك',
            message: `${typeLabel} "${selectedAsset.name}" has been issued to you by HR. Please confirm receipt.`,
            messageAr: `تم إصدار ${typeLabel} "${selectedAsset.name}" باسمك من قِبل الموارد البشرية. يُرجى تأكيد الاستلام.`,
            type: 'info',
            category: 'system',
            priority: 'normal',
            link: '/profile',
          });
        } catch (e) { console.error('Assignment notification failed', e); }
      }
      toast({ title: 'Asset assigned' });
      setAssignDialog(false);
      load();
    } catch (e: any) {
      toast({ title: 'Failed to assign', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const handleReturn = async () => {
    if (!returnDialog) return;
    setSaving(true);
    try {
      const returnDate = new Date().toISOString().slice(0, 10);
      const { data: asgn } = await supabase.from('hr_asset_assignments').select('asset_id').eq('id', returnDialog.assignmentId).single();
      const { error: retErr } = await supabase.from('hr_asset_assignments').update({
        returned_date: returnDate,
        condition_at_return: returnDialog.condition,
        notes: returnDialog.notes || null,
        updated_at: new Date().toISOString(),
      }).eq('id', returnDialog.assignmentId);
      if (retErr) throw retErr;
      if (asgn?.asset_id) {
        await supabase.from('hr_assets').update({ status: 'available', current_condition: returnDialog.condition, updated_at: new Date().toISOString() }).eq('id', asgn.asset_id);
      }
      toast({ title: 'Asset returned' });
      setReturnDialog(null);
      load();
    } catch (e: any) {
      toast({ title: 'Failed to mark returned', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const activeAssignments = assignments.filter(a => !a.returned_date);
  const historyAssignments = assignments.filter(a => !!a.returned_date);
  const displayed = showHistory ? assignments : activeAssignments;

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-orange-500" /> Assigned Equipment
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {activeAssignments.length} active assignment{activeAssignments.length !== 1 ? 's' : ''}
            {historyAssignments.length > 0 && ` · ${historyAssignments.length} returned`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {historyAssignments.length > 0 && (
            <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => setShowHistory(v => !v)}>
              {showHistory ? 'Hide history' : 'Show history'}
            </Button>
          )}
          {isAdmin && (
            <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={openAssignDialog} data-testid="button-assign-asset">
              <Plus className="h-3 w-3" /> Assign Asset
            </Button>
          )}
        </div>
      </div>

      {displayed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
            <Package className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">No equipment assigned.</p>
          {isAdmin && <p className="text-xs text-muted-foreground mt-1">Click "Assign Asset" to track issued equipment.</p>}
        </div>
      ) : (
        <div className="space-y-2.5">
          {displayed.map(a => {
            const asset = a.asset;
            if (!asset) return null;
            const Icon = ASSET_TYPE_ICONS[asset.asset_type] ?? Package;
            const isReturned = !!a.returned_date;
            const condition = a.condition_at_assignment || asset.current_condition || '';
            return (
              <div
                key={a.id}
                className={`flex items-start gap-3 p-4 rounded-xl border transition-colors ${isReturned ? 'border-border/30 bg-muted/20 opacity-70' : 'border-border/50 bg-background hover:border-border/80'}`}
                data-testid={`equipment-card-${a.id}`}
              >
                <div className={`flex items-center justify-center h-10 w-10 rounded-lg shrink-0 ${isReturned ? 'bg-muted' : 'bg-orange-50 dark:bg-orange-950/30'}`}>
                  <Icon className={`h-5 w-5 ${isReturned ? 'text-muted-foreground' : 'text-orange-500'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm">{asset.name}</p>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">{ASSET_TYPE_LABELS[asset.asset_type] || asset.asset_type}</Badge>
                    {condition && (
                      <Badge className={`text-[10px] px-1.5 py-0 border ${CONDITION_COLORS[condition] || ''}`}>
                        {condition.charAt(0).toUpperCase() + condition.slice(1)}
                      </Badge>
                    )}
                    {isReturned && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Returned</Badge>}
                  </div>
                  <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                    {asset.serial_number && <span className="font-mono">S/N: {asset.serial_number}</span>}
                    {asset.model && <span>{asset.model}</span>}
                    <span>Assigned: {new Date(a.assigned_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                    {isReturned && a.returned_date && <span>Returned: {new Date(a.returned_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>}
                  </div>
                  {a.notes && <p className="text-xs text-muted-foreground mt-0.5 italic">{a.notes}</p>}
                </div>
                {isAdmin && !isReturned && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 h-7 text-xs gap-1.5"
                    onClick={() => setReturnDialog({ assignmentId: a.id, assetName: asset.name, condition: asset.current_condition || 'good', notes: '' })}
                    data-testid={`button-return-asset-${a.id}`}
                  >
                    <RotateCcw className="h-3 w-3" /> Return
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Assign Dialog */}
      <Dialog open={assignDialog} onOpenChange={setAssignDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Assign Asset to Employee</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Asset (available only) *</label>
              {availableAssets.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 rounded-lg p-3 border border-amber-200">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  No available assets. Add assets in the Equipment registry first.
                </div>
              ) : (
                <Select value={assignForm.assetId} onValueChange={v => setAssignForm(p => ({ ...p, assetId: v }))}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select asset…" /></SelectTrigger>
                  <SelectContent>
                    {availableAssets.map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}{a.serial_number ? ` — ${a.serial_number}` : ''} ({ASSET_TYPE_LABELS[a.asset_type] || a.asset_type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Condition at Assignment</label>
                <Select value={assignForm.condition} onValueChange={v => setAssignForm(p => ({ ...p, condition: v }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['excellent','good','fair','damaged'].map(c => <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Assignment Date</label>
                <Input type="date" value={assignForm.assignedDate} onChange={e => setAssignForm(p => ({ ...p, assignedDate: e.target.value }))} className="h-9" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
              <Input value={assignForm.notes} onChange={e => setAssignForm(p => ({ ...p, notes: e.target.value }))} placeholder="Handover notes…" className="h-9" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialog(false)}>Cancel</Button>
            <Button onClick={handleAssign} disabled={saving || !assignForm.assetId || availableAssets.length === 0} data-testid="button-confirm-assign">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null} Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Return Dialog */}
      <Dialog open={!!returnDialog} onOpenChange={v => !v && setReturnDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Mark Asset Returned</DialogTitle></DialogHeader>
          {returnDialog && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Recording return of <strong>{returnDialog.assetName}</strong>.</p>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Condition at Return</label>
                <Select value={returnDialog.condition} onValueChange={v => setReturnDialog(p => p ? { ...p, condition: v } : p)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['excellent','good','fair','damaged'].map(c => <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
                <Input value={returnDialog.notes} onChange={e => setReturnDialog(p => p ? { ...p, notes: e.target.value } : p)} placeholder="Any damage or notes…" className="h-9" />
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
