import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, Phone, Mail, MapPin, Edit, X, Loader2, Save, Plus, Info, Trash2 } from "lucide-react";

interface Nok {
  id?: string;
  full_name: string;
  relationship: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

const EMPTY: Nok = { full_name: '', relationship: 'other', phone: '', email: '', address: '', notes: '' };

const REL_LABELS: Record<string, string> = {
  spouse: 'Spouse', parent: 'Parent', sibling: 'Sibling',
  child: 'Child', friend: 'Friend / Colleague', other: 'Other',
};

export default function EmployeeNextOfKinSection({ userId, isAdmin }: { userId: string; isAdmin: boolean }) {
  const { toast } = useToast();
  const [nok, setNok] = useState<Nok | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Nok>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('hr_employee_nok').select('*').eq('profile_id', userId).maybeSingle();
    setNok(data as Nok | null);
    setLoading(false);
  };

  useEffect(() => { load(); }, [userId]);

  const openForm = () => {
    setForm(nok ? { ...nok } : EMPTY);
    setEditing(true);
  };

  const f = (key: keyof Nok) => (v: any) => setForm(p => ({ ...p, [key]: v }));

  const handleSave = async () => {
    if (!form.full_name || !form.relationship) return;
    setSaving(true);
    try {
      const payload = { ...form, profile_id: userId, updated_at: new Date().toISOString() };
      if (nok?.id) {
        const { error } = await supabase.from('hr_employee_nok').update(payload).eq('id', nok.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('hr_employee_nok').insert(payload);
        if (error) throw error;
      }
      await load();
      setEditing(false);
      toast({ title: 'Next of Kin saved' });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!nok?.id) return;
    setDeleting(true);
    const { error } = await supabase.from('hr_employee_nok').delete().eq('id', nok.id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    } else {
      setNok(null);
      setEditing(false);
      toast({ title: 'Next of Kin removed' });
    }
    setDeleting(false);
  };

  if (loading) return (
    <div className="flex justify-center py-6">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-base flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-orange-500" />
            Next of Kin / Emergency Contact
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            The person HR contacts first in an emergency. Does not need to be a financial dependent.
          </p>
        </div>
        {isAdmin && !editing && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={openForm} data-testid="button-edit-nok">
            {nok ? <><Edit className="h-3.5 w-3.5" /> Edit</> : <><Plus className="h-3.5 w-3.5" /> Add</>}
          </Button>
        )}
      </div>

      {/* Edit form */}
      {editing && (
        <div className="rounded-xl border-2 border-orange-200 dark:border-orange-800/60 bg-orange-50/40 dark:bg-orange-950/20 p-5 space-y-4">
          <p className="text-xs font-semibold text-orange-700 dark:text-orange-400 uppercase tracking-widest">
            {nok ? 'Edit Next of Kin' : 'Add Next of Kin'}
          </p>

          <div className="flex gap-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 px-3.5 py-3 text-xs text-blue-800 dark:text-blue-300">
            <Info className="h-4 w-4 shrink-0 mt-0.5 text-blue-500" />
            <span>
              This can be anyone — a parent abroad, a sibling, a close friend — not necessarily someone who depends on this employee financially.
              Only one Next of Kin record is allowed per employee.
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Full Name *</label>
              <Input value={form.full_name} onChange={e => f('full_name')(e.target.value)} placeholder="Full legal name" className="h-9" data-testid="input-nok-name" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Relationship *</label>
              <Select value={form.relationship} onValueChange={f('relationship')}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(REL_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Phone className="h-3 w-3" /> Phone Number
              </label>
              <Input value={form.phone || ''} onChange={e => f('phone')(e.target.value)} placeholder="+249 9XX XXX XXX" className="h-9 font-mono" data-testid="input-nok-phone" />
              <p className="text-[10px] text-muted-foreground">Primary number HR will call in an emergency.</p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Mail className="h-3 w-3" /> Email Address
              </label>
              <Input value={form.email || ''} onChange={e => f('email')(e.target.value)} placeholder="name@example.com" className="h-9" type="email" data-testid="input-nok-email" />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <MapPin className="h-3 w-3" /> Address
              </label>
              <Input value={form.address || ''} onChange={e => f('address')(e.target.value)} placeholder="City, Country (optional)" className="h-9" data-testid="input-nok-address" />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Notes</label>
              <Input value={form.notes || ''} onChange={e => f('notes')(e.target.value)} placeholder="e.g. only available after 6pm, speaks Arabic" className="h-9" />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" onClick={handleSave} disabled={saving || !form.full_name} className="gap-1.5" data-testid="button-save-nok">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} data-testid="button-cancel-nok">
              <X className="h-3.5 w-3.5" />
            </Button>
            {nok?.id && isAdmin && (
              <Button size="sm" variant="ghost" className="ml-auto text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5" onClick={handleDelete} disabled={deleting} data-testid="button-delete-nok">
                {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Remove
              </Button>
            )}
          </div>
        </div>
      )}

      {/* NOK display card */}
      {!editing && nok && (
        <div className="rounded-xl border-2 border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-950/30 p-4">
          <div className="flex items-start gap-3">
            <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-orange-100 dark:bg-orange-900/50 shrink-0">
              <AlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <p className="font-semibold text-sm">{nok.full_name}</p>
              <p className="text-xs text-muted-foreground">{REL_LABELS[nok.relationship] || nok.relationship}</p>
              <div className="flex flex-wrap gap-3 mt-2">
                {nok.phone && (
                  <a href={`tel:${nok.phone}`} className="flex items-center gap-1.5 text-xs text-orange-700 dark:text-orange-300 hover:underline font-medium">
                    <Phone className="h-3 w-3" /> {nok.phone}
                  </a>
                )}
                {nok.email && (
                  <a href={`mailto:${nok.email}`} className="flex items-center gap-1.5 text-xs text-orange-700 dark:text-orange-300 hover:underline font-medium">
                    <Mail className="h-3 w-3" /> {nok.email}
                  </a>
                )}
                {nok.address && (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" /> {nok.address}
                  </span>
                )}
              </div>
              {!nok.phone && !nok.email && !nok.address && (
                <p className="text-xs text-muted-foreground italic">No contact details recorded — click Edit to add phone or email.</p>
              )}
              {nok.notes && <p className="text-xs text-muted-foreground italic mt-1">{nok.notes}</p>}
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!editing && !nok && (
        <div className="flex flex-col items-center justify-center py-8 text-center rounded-xl border border-dashed border-orange-200 dark:border-orange-800/40 bg-orange-50/20 dark:bg-orange-950/10">
          <AlertCircle className="h-8 w-8 text-orange-300 mb-2" />
          <p className="text-sm text-muted-foreground">No Next of Kin recorded.</p>
          {isAdmin && <p className="text-xs text-muted-foreground mt-1">Click "Add" to record an emergency contact.</p>}
        </div>
      )}
    </div>
  );
}
