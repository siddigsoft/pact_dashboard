import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Edit, X, Loader2, Users, Heart, ShieldCheck, Baby, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Dependent {
  id?: string;
  full_name: string;
  relationship: string;
  date_of_birth?: string;
  gender?: string;
  national_id_no?: string;
  is_beneficiary: boolean;
  health_insurance: boolean;
  notes?: string;
}

const EMPTY_DEP: Dependent = {
  full_name: '', relationship: 'child', date_of_birth: '',
  gender: '', national_id_no: '', is_beneficiary: false,
  health_insurance: false, notes: '',
};

const REL_LABELS: Record<string, string> = {
  spouse: 'Spouse', child: 'Child', parent: 'Parent', sibling: 'Sibling', other: 'Other',
};
const REL_ICONS: Record<string, React.ReactNode> = {
  spouse: <Heart className="h-3.5 w-3.5 text-pink-500" />,
  child:  <Baby className="h-3.5 w-3.5 text-blue-500" />,
  parent: <Users className="h-3.5 w-3.5 text-purple-500" />,
  sibling: <Users className="h-3.5 w-3.5 text-indigo-500" />,
  other:  <Users className="h-3.5 w-3.5 text-gray-400" />,
};

function calcAge(dob?: string) {
  if (!dob) return null;
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
}

export default function EmployeeDependentsTab({ userId, isAdmin }: { userId: string; isAdmin: boolean }) {
  const { toast } = useToast();
  const [deps, setDeps] = useState<Dependent[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Dependent | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('hr_employee_dependents').select('*')
      .eq('profile_id', userId).order('relationship').order('full_name');
    setDeps(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [userId]);

  const f = (key: keyof Dependent) => (v: any) => setForm(p => p ? { ...p, [key]: v } : p);

  const handleSave = async () => {
    if (!form?.full_name || !form?.relationship) return;
    setSaving(true);
    try {
      const payload = { ...form, profile_id: userId, updated_at: new Date().toISOString() };
      if (form.id) {
        const { error } = await supabase.from('hr_employee_dependents').update(payload).eq('id', form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('hr_employee_dependents').insert(payload);
        if (error) throw error;
      }
      await load();
      setForm(null);
      toast({ title: 'Dependent saved' });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const handleDelete = async (id?: string) => {
    if (!id) return;
    const { error } = await supabase.from('hr_employee_dependents').delete().eq('id', id);
    if (error) { toast({ title: 'Delete failed', description: error.message, variant: 'destructive' }); return; }
    setDeps(p => p.filter(d => d.id !== id));
    toast({ title: 'Dependent removed' });
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const beneficiaries = deps.filter(d => d.is_beneficiary);

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-pink-500" /> Dependents & Beneficiaries
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Family members, dependents, and designated insurance/benefit beneficiaries.
          </p>
        </div>
        {isAdmin && !form && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setForm({ ...EMPTY_DEP })} data-testid="button-add-dependent">
            <Plus className="h-3.5 w-3.5" /> Add Dependent
          </Button>
        )}
      </div>

      {/* Summary chips */}
      {deps.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="text-xs">{deps.length} dependent{deps.length !== 1 ? 's' : ''}</Badge>
          {beneficiaries.length > 0 && (
            <Badge className="text-xs bg-green-100 text-green-800 border-green-200">
              <ShieldCheck className="h-3 w-3 mr-1" />{beneficiaries.length} beneficiar{beneficiaries.length !== 1 ? 'ies' : 'y'}
            </Badge>
          )}
        </div>
      )}

      {/* Inline form */}
      {form && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            {form.id ? 'Edit Dependent' : 'New Dependent'}
          </p>

          {/* Info banner */}
          <div className="flex gap-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 px-3.5 py-3 text-xs text-blue-800 dark:text-blue-300">
            <Info className="h-4 w-4 shrink-0 mt-0.5 text-blue-500" />
            <span>
              Add family members who depend on this employee financially.
              Use the checkboxes below to mark who should receive benefits or be enrolled in health insurance.
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="space-y-1 sm:col-span-2 lg:col-span-1">
              <label className="text-xs font-medium text-muted-foreground">Full Name *</label>
              <Input value={form.full_name} onChange={e => f('full_name')(e.target.value)} placeholder="Full legal name" className="h-9" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Relationship *</label>
              <Select value={form.relationship} onValueChange={f('relationship')}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(REL_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Date of Birth</label>
              <Input type="date" value={form.date_of_birth || ''} onChange={e => f('date_of_birth')(e.target.value)} className="h-9" />
              <p className="text-[10px] text-muted-foreground">Used to calculate age and insurance eligibility.</p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Gender</label>
              <Select value={form.gender || ''} onValueChange={f('gender')}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">National ID / Document No.</label>
              <Input value={form.national_id_no || ''} onChange={e => f('national_id_no')(e.target.value)} placeholder="ID number" className="h-9 font-mono" />
              <p className="text-[10px] text-muted-foreground">Passport, national card, or birth certificate number.</p>
            </div>
            <div className="space-y-1 sm:col-span-2 lg:col-span-3">
              <label className="text-xs font-medium text-muted-foreground">Notes</label>
              <Input value={form.notes || ''} onChange={e => f('notes')(e.target.value)} placeholder="e.g. special circumstances, contact info…" className="h-9" />
            </div>

            {/* Checkboxes with explanations */}
            <div className="sm:col-span-2 lg:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">

              {/* Designated Beneficiary */}
              <label className="flex gap-3 cursor-pointer select-none rounded-lg border border-border/50 bg-background p-3.5 hover:border-green-400/60 hover:bg-green-50/40 dark:hover:bg-green-950/20 transition-colors">
                <input
                  type="checkbox"
                  checked={!!form.is_beneficiary}
                  onChange={e => f('is_beneficiary')(e.target.checked)}
                  className="h-4 w-4 mt-0.5 rounded accent-primary shrink-0"
                  data-testid="checkbox-is-beneficiary"
                />
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-green-600" />
                    <span className="text-sm font-semibold">Designated Beneficiary</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    This person will receive the employee's financial entitlements (EOSB, gratuity, life insurance payout) in case of death or end of service.
                    Tick this for the primary financial heir — usually a spouse or parent.
                  </p>
                </div>
              </label>

              {/* Covered by Health Insurance */}
              <label className="flex gap-3 cursor-pointer select-none rounded-lg border border-border/50 bg-background p-3.5 hover:border-blue-400/60 hover:bg-blue-50/40 dark:hover:bg-blue-950/20 transition-colors">
                <input
                  type="checkbox"
                  checked={!!form.health_insurance}
                  onChange={e => f('health_insurance')(e.target.checked)}
                  className="h-4 w-4 mt-0.5 rounded accent-primary shrink-0"
                  data-testid="checkbox-health-insurance"
                />
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <Heart className="h-3.5 w-3.5 text-blue-500" />
                    <span className="text-sm font-semibold">Covered by Health Insurance</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    This dependent is enrolled in the organisation's medical insurance plan.
                    Their healthcare costs will be covered under the employee's policy.
                    Tick this for children and spouses on the company's insurance roster.
                  </p>
                </div>
              </label>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={handleSave} disabled={saving || !form.full_name} className="gap-1.5" data-testid="button-save-dependent">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setForm(null)} data-testid="button-cancel-dependent">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Dependents list */}
      {deps.length === 0 && !form ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
            <Users className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">No dependents recorded.</p>
          {isAdmin && <p className="text-xs text-muted-foreground mt-1">Click "Add Dependent" to add family members or beneficiaries.</p>}
        </div>
      ) : (
        <div className="space-y-2">
          {deps.map(d => {
            const age = calcAge(d.date_of_birth);
            return (
              <div key={d.id} className="flex items-start gap-3 p-4 rounded-xl border border-border/40 bg-background hover:border-border/70 transition-colors" data-testid={`dep-card-${d.id}`}>
                <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-muted shrink-0">
                  {REL_ICONS[d.relationship] || <Users className="h-3.5 w-3.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm">{d.full_name}</p>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">{REL_LABELS[d.relationship] || d.relationship}</Badge>
                    {d.is_beneficiary && <Badge className="text-[10px] px-1.5 py-0 bg-green-100 text-green-800 border-green-200"><ShieldCheck className="h-2.5 w-2.5 mr-0.5" />Beneficiary</Badge>}
                    {d.health_insurance && <Badge className="text-[10px] px-1.5 py-0 bg-blue-100 text-blue-700 border-blue-200">Health Ins.</Badge>}
                  </div>
                  <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                    {d.date_of_birth && <span>{new Date(d.date_of_birth).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}{age !== null ? ` (${age} yrs)` : ''}</span>}
                    {d.gender && <span className="capitalize">{d.gender}</span>}
                    {d.national_id_no && <span className="font-mono">{d.national_id_no}</span>}
                  </div>
                  {d.notes && <p className="text-xs text-muted-foreground mt-0.5 italic">{d.notes}</p>}
                </div>
                {isAdmin && (
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setForm({ ...d })} data-testid={`button-edit-dep-${d.id}`}><Edit className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600" onClick={() => handleDelete(d.id)} data-testid={`button-delete-dep-${d.id}`}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
