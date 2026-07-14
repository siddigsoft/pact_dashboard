import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Edit, Save, X, User, Globe, Heart, Droplets, MapPin, CreditCard, Calendar } from "lucide-react";
import { Loader2 } from "lucide-react";

interface PersonalData {
  id?: string;
  date_of_birth?: string;
  gender?: string;
  nationality?: string;
  marital_status?: string;
  national_id_no?: string;
  passport_no?: string;
  passport_expiry?: string;
  blood_type?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  country?: string;
}

const EMPTY: PersonalData = {
  date_of_birth: '', gender: '', nationality: '', marital_status: '',
  national_id_no: '', passport_no: '', passport_expiry: '',
  blood_type: '', address_line1: '', address_line2: '', city: '', country: 'Sudan',
};

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

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: row } = await supabase
        .from('hr_employee_personal')
        .select('*')
        .eq('profile_id', userId)
        .maybeSingle();
      if (row) { setData(row); setForm(row); }
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
      }
      setData(form);
      setEditMode(false);
      toast({ title: 'Personal details saved' });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-5">
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

      {/* Identity */}
      <div>
        <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
          <User className="h-3.5 w-3.5" /> Identity
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Field label="Date of Birth" icon={<Calendar className="h-3 w-3" />} value={form.date_of_birth || ''} editMode={editMode}>
            <Input type="date" value={form.date_of_birth || ''} onChange={e => f('date_of_birth')(e.target.value)} className="h-9 text-sm" />
          </Field>
          <Field label="Gender" icon={<User className="h-3 w-3" />} value={form.gender ? ({ male:'Male', female:'Female', other:'Other', prefer_not_to_say:'Prefer Not to Say' }[form.gender] || form.gender) : ''} editMode={editMode}>
            <Select value={form.gender || ''} onValueChange={f('gender')}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
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
          <Field label="Marital Status" icon={<Heart className="h-3 w-3" />} value={form.marital_status ? ({ single:'Single', married:'Married', divorced:'Divorced', widowed:'Widowed', other:'Other' }[form.marital_status] || form.marital_status) : ''} editMode={editMode}>
            <Select value={form.marital_status || ''} onValueChange={f('marital_status')}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
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
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>
                {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                <SelectItem value="unknown">Unknown</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      </div>

      {/* ID Documents */}
      <div>
        <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
          <CreditCard className="h-3.5 w-3.5" /> ID Documents
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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

      {/* Address */}
      <div>
        <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5" /> Home Address
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Address Line 1" icon={<MapPin className="h-3 w-3" />} value={form.address_line1 || ''} editMode={editMode}>
            <Input value={form.address_line1 || ''} onChange={e => f('address_line1')(e.target.value)} placeholder="Street / Block / Area" className="h-9 text-sm" />
          </Field>
          <Field label="Address Line 2" icon={<MapPin className="h-3 w-3" />} value={form.address_line2 || ''} editMode={editMode}>
            <Input value={form.address_line2 || ''} onChange={e => f('address_line2')(e.target.value)} placeholder="Apartment / Building" className="h-9 text-sm" />
          </Field>
          <Field label="City" icon={<MapPin className="h-3 w-3" />} value={form.city || ''} editMode={editMode}>
            <Input value={form.city || ''} onChange={e => f('city')(e.target.value)} placeholder="City" className="h-9 text-sm" />
          </Field>
          <Field label="Country" icon={<Globe className="h-3 w-3" />} value={form.country || ''} editMode={editMode}>
            <Input value={form.country || ''} onChange={e => f('country')(e.target.value)} placeholder="Country" className="h-9 text-sm" />
          </Field>
        </div>
      </div>
    </div>
  );
}
