import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Edit, Save, X, User, Globe, Heart, Droplets, MapPin, CreditCard,
  Calendar, Phone, Mail, AlertCircle, Home, Loader2,
} from "lucide-react";

interface PersonalData {
  id?: string;
  date_of_birth?: string;
  gender?: string;
  nationality?: string;
  marital_status?: string;
  blood_type?: string;
  id_type?: string;
  national_id_no?: string;
  passport_no?: string;
  passport_expiry?: string;
  secondary_phone?: string;
  personal_email?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relationship?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  permanent_state?: string;
  country?: string;
  residential_address_line1?: string;
  residential_address_line2?: string;
  residential_city?: string;
  residential_country?: string;
}

const EMPTY: PersonalData = {
  date_of_birth: '', gender: '', nationality: '', marital_status: '',
  blood_type: '', id_type: '', national_id_no: '', passport_no: '',
  passport_expiry: '', secondary_phone: '', personal_email: '',
  emergency_contact_name: '', emergency_contact_phone: '',
  emergency_contact_relationship: '',
  address_line1: '', address_line2: '', city: '', permanent_state: '', country: 'Sudan',
  residential_address_line1: '', residential_address_line2: '',
  residential_city: '', residential_country: '',
};

const ID_TYPES = [
  { value: 'national_id', label: 'National ID Card' },
  { value: 'passport', label: 'Passport' },
  { value: 'refugee_card', label: 'Refugee Card' },
  { value: 'drivers_license', label: "Driver's License" },
  { value: 'residence_permit', label: 'Residence Permit' },
  { value: 'other', label: 'Other' },
];

const RELATIONSHIPS = ['Spouse', 'Parent', 'Sibling', 'Child', 'Friend', 'Colleague', 'Other'];

const SectionHead = ({ icon, label }: { icon: React.ReactNode; label: string }) => (
  <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
    {icon} {label}
  </h4>
);

const Field = ({ label, icon, value, editMode, children }: {
  label: string; icon: React.ReactNode; value?: string; editMode: boolean; children?: React.ReactNode;
}) => (
  <div className="bg-muted/20 rounded-xl p-4 space-y-1.5 border border-border/40 hover:border-border/60 transition-colors">
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground">{icon}</span>
      <h3 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-widest">{label}</h3>
    </div>
    {editMode ? children : (
      <p className="font-medium text-sm">{value || <span className="text-muted-foreground italic text-xs">Not set</span>}</p>
    )}
  </div>
);

export default function EmployeePersonalTab({ userId, isAdmin }: { userId: string; isAdmin: boolean }) {
  const { toast } = useToast();
  const [data, setData] = useState<PersonalData>(EMPTY);
  const [form, setForm] = useState<PersonalData>(EMPTY);
  const [editMode, setEditMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showResidential, setShowResidential] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: row } = await supabase
        .from('hr_employee_personal')
        .select('*')
        .eq('profile_id', userId)
        .maybeSingle();
      if (row) {
        setData(row);
        setForm(row);
        const hasResidential = !!(row.residential_address_line1 || row.residential_city || row.residential_country);
        setShowResidential(hasResidential);
      }
      setLoading(false);
    };
    load();
  }, [userId]);

  const f = (key: keyof PersonalData) => (v: string) => setForm(p => ({ ...p, [key]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { ...form, profile_id: userId, updated_at: new Date().toISOString() };
      if (data.id) {
        const { error } = await supabase.from('hr_employee_personal').update(payload).eq('id', data.id);
        if (error) throw error;
      } else {
        const { data: inserted, error } = await supabase.from('hr_employee_personal').insert(payload).select().single();
        if (error) throw error;
        setData(inserted);
        setForm(inserted);
        setSaving(false);
        setEditMode(false);
        toast({ title: 'Personal details saved' });
        return;
      }
      setData({ ...form });
      setEditMode(false);
      toast({ title: 'Personal details saved' });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const GENDER_LABELS: Record<string, string> = {
    male: 'Male', female: 'Female', other: 'Other', prefer_not_to_say: 'Prefer Not to Say',
  };
  const MARITAL_LABELS: Record<string, string> = {
    single: 'Single', married: 'Married', divorced: 'Divorced', widowed: 'Widowed', other: 'Other',
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-base">Personal Information</h3>
          <p className="text-xs text-muted-foreground">Identity, contact, and personal details</p>
        </div>
        {isAdmin && !editMode && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setForm(data); setEditMode(true); }} data-testid="button-edit-personal">
            <Edit className="h-3.5 w-3.5" /> Edit
          </Button>
        )}
        {editMode && (
          <div className="flex gap-2">
            <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={saving} data-testid="button-save-personal">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setForm(data); setEditMode(false); }} data-testid="button-cancel-personal">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* ── 1. Identity ───────────────────────────────────────────────────── */}
      <div>
        <SectionHead icon={<User className="h-3.5 w-3.5" />} label="Identity" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Field label="Date of Birth" icon={<Calendar className="h-3 w-3" />} value={form.date_of_birth || ''} editMode={editMode}>
            <Input type="date" value={form.date_of_birth || ''} onChange={e => f('date_of_birth')(e.target.value)} className="h-9 text-sm" />
          </Field>
          <Field label="Gender" icon={<User className="h-3 w-3" />} value={GENDER_LABELS[form.gender || ''] || form.gender || ''} editMode={editMode}>
            <Select value={form.gender || ''} onValueChange={f('gender')}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="other">Other</SelectItem>
                <SelectItem value="prefer_not_to_say">Prefer Not to Say</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Nationality" icon={<Globe className="h-3 w-3" />} value={form.nationality || ''} editMode={editMode}>
            <Input value={form.nationality || ''} onChange={e => f('nationality')(e.target.value)} placeholder="e.g. Sudanese" className="h-9 text-sm" />
          </Field>
          <Field label="Marital Status" icon={<Heart className="h-3 w-3" />} value={MARITAL_LABELS[form.marital_status || ''] || form.marital_status || ''} editMode={editMode}>
            <Select value={form.marital_status || ''} onValueChange={f('marital_status')}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="single">Single</SelectItem>
                <SelectItem value="married">Married</SelectItem>
                <SelectItem value="divorced">Divorced</SelectItem>
                <SelectItem value="widowed">Widowed</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Blood Type" icon={<Droplets className="h-3 w-3" />} value={form.blood_type === 'unknown' ? 'Unknown' : (form.blood_type || '')} editMode={editMode}>
            <Select value={form.blood_type || ''} onValueChange={f('blood_type')}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                <SelectItem value="unknown">Unknown</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      </div>

      {/* ── 2. ID Documents ───────────────────────────────────────────────── */}
      <div>
        <SectionHead icon={<CreditCard className="h-3.5 w-3.5" />} label="ID Documents" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Field label="Primary ID Type" icon={<CreditCard className="h-3 w-3" />} value={ID_TYPES.find(t => t.value === form.id_type)?.label || form.id_type || ''} editMode={editMode}>
            <Select value={form.id_type || ''} onValueChange={f('id_type')}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select ID type…" /></SelectTrigger>
              <SelectContent>
                {ID_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="National ID Number" icon={<CreditCard className="h-3 w-3" />} value={form.national_id_no || ''} editMode={editMode}>
            <Input value={form.national_id_no || ''} onChange={e => f('national_id_no')(e.target.value)} placeholder="National ID No." className="h-9 text-sm font-mono" />
          </Field>
          <Field label="Passport Number" icon={<CreditCard className="h-3 w-3" />} value={form.passport_no || ''} editMode={editMode}>
            <Input value={form.passport_no || ''} onChange={e => f('passport_no')(e.target.value)} placeholder="Passport No." className="h-9 text-sm font-mono" />
          </Field>
          <Field label="Passport Expiry" icon={<Calendar className="h-3 w-3" />} value={form.passport_expiry || ''} editMode={editMode}>
            <Input type="date" value={form.passport_expiry || ''} onChange={e => f('passport_expiry')(e.target.value)} className="h-9 text-sm" />
          </Field>
        </div>
      </div>

      {/* ── 3. Contact & Emergency ────────────────────────────────────────── */}
      <div>
        <SectionHead icon={<Phone className="h-3.5 w-3.5" />} label="Contact & Emergency Information" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Field label="Secondary Phone Number" icon={<Phone className="h-3 w-3" />} value={form.secondary_phone || ''} editMode={editMode}>
            <Input value={form.secondary_phone || ''} onChange={e => f('secondary_phone')(e.target.value)} placeholder="+249 XX XXX XXXX" className="h-9 text-sm" />
          </Field>
          <Field label="Personal Email" icon={<Mail className="h-3 w-3" />} value={form.personal_email || ''} editMode={editMode}>
            <Input type="email" value={form.personal_email || ''} onChange={e => f('personal_email')(e.target.value)} placeholder="personal@email.com" className="h-9 text-sm" />
          </Field>

          {/* Emergency divider */}
          <div className="sm:col-span-2 lg:col-span-3 mt-1">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">Emergency Contact</span>
              <div className="flex-1 h-px bg-amber-200 dark:bg-amber-800/50" />
            </div>
          </div>

          <Field label="Emergency Contact Name" icon={<User className="h-3 w-3" />} value={form.emergency_contact_name || ''} editMode={editMode}>
            <Input value={form.emergency_contact_name || ''} onChange={e => f('emergency_contact_name')(e.target.value)} placeholder="Full name" className="h-9 text-sm" />
          </Field>
          <Field label="Emergency Contact Number" icon={<Phone className="h-3 w-3" />} value={form.emergency_contact_phone || ''} editMode={editMode}>
            <Input value={form.emergency_contact_phone || ''} onChange={e => f('emergency_contact_phone')(e.target.value)} placeholder="+249 XX XXX XXXX" className="h-9 text-sm" />
          </Field>
          <Field label="Relationship" icon={<Heart className="h-3 w-3" />} value={form.emergency_contact_relationship || ''} editMode={editMode}>
            <Select value={form.emergency_contact_relationship || ''} onValueChange={f('emergency_contact_relationship')}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                {RELATIONSHIPS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </div>

      {/* ── 4. Permanent Address ──────────────────────────────────────────── */}
      <div>
        <SectionHead icon={<Home className="h-3.5 w-3.5" />} label="Permanent Address" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Address Line 1" icon={<MapPin className="h-3 w-3" />} value={form.address_line1 || ''} editMode={editMode}>
            <Input value={form.address_line1 || ''} onChange={e => f('address_line1')(e.target.value)} placeholder="Street / Block / Area" className="h-9 text-sm" />
          </Field>
          <Field label="Address Line 2" icon={<MapPin className="h-3 w-3" />} value={form.address_line2 || ''} editMode={editMode}>
            <Input value={form.address_line2 || ''} onChange={e => f('address_line2')(e.target.value)} placeholder="Apartment / Building (optional)" className="h-9 text-sm" />
          </Field>
          <Field label="City" icon={<MapPin className="h-3 w-3" />} value={form.city || ''} editMode={editMode}>
            <Input value={form.city || ''} onChange={e => f('city')(e.target.value)} placeholder="City" className="h-9 text-sm" />
          </Field>
          <Field label="State / Province" icon={<MapPin className="h-3 w-3" />} value={form.permanent_state || ''} editMode={editMode}>
            <Input value={form.permanent_state || ''} onChange={e => f('permanent_state')(e.target.value)} placeholder="State / Province" className="h-9 text-sm" />
          </Field>
          <Field label="Country" icon={<Globe className="h-3 w-3" />} value={form.country || ''} editMode={editMode}>
            <Input value={form.country || ''} onChange={e => f('country')(e.target.value)} placeholder="Country" className="h-9 text-sm" />
          </Field>
        </div>
      </div>

      {/* ── 5. Residential Address (optional) ────────────────────────────── */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <SectionHead icon={<MapPin className="h-3.5 w-3.5" />} label="Current Residential Address" />
          {editMode && (
            <button
              type="button"
              onClick={() => setShowResidential(v => !v)}
              className="text-xs text-primary underline underline-offset-2 hover:opacity-80 ml-auto"
            >
              {showResidential ? 'Remove' : '+ Add (if different from permanent)'}
            </button>
          )}
          {!editMode && !showResidential && (
            <span className="text-xs text-muted-foreground italic ml-auto">Same as permanent</span>
          )}
        </div>

        {showResidential ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Address Line 1" icon={<MapPin className="h-3 w-3" />} value={form.residential_address_line1 || ''} editMode={editMode}>
              <Input value={form.residential_address_line1 || ''} onChange={e => f('residential_address_line1')(e.target.value)} placeholder="Street / Block / Area" className="h-9 text-sm" />
            </Field>
            <Field label="Address Line 2" icon={<MapPin className="h-3 w-3" />} value={form.residential_address_line2 || ''} editMode={editMode}>
              <Input value={form.residential_address_line2 || ''} onChange={e => f('residential_address_line2')(e.target.value)} placeholder="Apartment / Building (optional)" className="h-9 text-sm" />
            </Field>
            <Field label="City" icon={<MapPin className="h-3 w-3" />} value={form.residential_city || ''} editMode={editMode}>
              <Input value={form.residential_city || ''} onChange={e => f('residential_city')(e.target.value)} placeholder="City" className="h-9 text-sm" />
            </Field>
            <Field label="Country" icon={<Globe className="h-3 w-3" />} value={form.residential_country || ''} editMode={editMode}>
              <Input value={form.residential_country || ''} onChange={e => f('residential_country')(e.target.value)} placeholder="Country" className="h-9 text-sm" />
            </Field>
          </div>
        ) : !editMode ? null : null}
      </div>
    </div>
  );
}
