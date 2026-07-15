import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import {
  Edit, Save, X, User, Globe, Heart, Droplets, MapPin, CreditCard,
  Calendar, Phone, Mail, AlertCircle, Home, Loader2, CheckCircle2, FileText,
} from "lucide-react";

interface PersonalData {
  id?: string;
  professional_summary?: string;
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
  professional_summary: '',
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
const GENDER_LABELS: Record<string, string> = {
  male: 'Male', female: 'Female', other: 'Other', prefer_not_to_say: 'Prefer Not to Say',
};
const MARITAL_LABELS: Record<string, string> = {
  single: 'Single', married: 'Married', divorced: 'Divorced', widowed: 'Widowed', other: 'Other',
};

/* ── shared primitives ─────────────────────────────────────────────────────── */

function SectionCard({
  accent, iconBg, icon, title, action, children,
}: {
  accent: string; iconBg: string; icon: React.ReactNode;
  title: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/50 overflow-hidden shadow-sm">
      <div className={`flex items-center gap-3 px-5 py-3.5 border-b border-border/40 border-l-4 ${accent} bg-muted/25`}>
        <span className={`flex items-center justify-center h-7 w-7 rounded-lg ${iconBg}`}>{icon}</span>
        <h3 className="font-semibold text-sm">{title}</h3>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      <div className="p-5 bg-background">{children}</div>
    </div>
  );
}

function InfoGrid({ children, cols = 3 }: { children: React.ReactNode; cols?: 2 | 3 }) {
  return (
    <div className={`grid grid-cols-2 ${cols === 3 ? 'lg:grid-cols-3' : ''} gap-x-8 gap-y-5`}>
      {children}
    </div>
  );
}

function InfoField({ label, value, mono, span }: {
  label: string; value?: string; mono?: boolean; span?: 'full' | 2;
}) {
  return (
    <div className={span === 'full' ? 'col-span-full' : span === 2 ? 'col-span-2' : ''}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
      {value
        ? <p className={`text-sm font-medium text-foreground leading-snug ${mono ? 'font-mono' : ''}`}>{value}</p>
        : <p className="text-sm text-muted-foreground/50 italic">—</p>
      }
    </div>
  );
}

function FormGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{children}</div>;
}

function FormField({ label, required, span, children }: {
  label: string; required?: boolean; span?: 'full' | 2; children: React.ReactNode;
}) {
  return (
    <div className={span === 'full' ? 'sm:col-span-2 lg:col-span-3' : span === 2 ? 'sm:col-span-2' : ''}>
      <label className="block text-xs font-semibold text-foreground/70 mb-1.5">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

/* ── component ─────────────────────────────────────────────────────────────── */

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
        .from('hr_employee_personal').select('*').eq('profile_id', userId).maybeSingle();
      if (row) {
        setData(row); setForm(row);
        setShowResidential(!!(row.residential_address_line1 || row.residential_city));
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
        setData({ ...form });
      } else {
        const { data: inserted, error } = await supabase.from('hr_employee_personal').insert(payload).select().single();
        if (error) throw error;
        setData(inserted); setForm(inserted);
      }
      setEditMode(false);
      toast({ title: 'Personal details saved' });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  // Profile completeness score
  const completeness = useMemo(() => {
    const tracked: (keyof PersonalData)[] = [
      'date_of_birth', 'gender', 'nationality', 'marital_status', 'blood_type',
      'id_type', 'national_id_no', 'secondary_phone', 'personal_email',
      'emergency_contact_name', 'emergency_contact_phone',
      'address_line1', 'city', 'country',
    ];
    const filled = tracked.filter(k => !!data[k]).length;
    return Math.round((filled / tracked.length) * 100);
  }, [data]);

  const editBtn = isAdmin && (
    !editMode
      ? <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => { setForm(data); setEditMode(true); }} data-testid="button-edit-personal">
          <Edit className="h-3 w-3" /> Edit
        </Button>
      : <div className="flex gap-1.5">
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={handleSave} disabled={saving} data-testid="button-save-personal">
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Save
          </Button>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => { setForm(data); setEditMode(false); }} data-testid="button-cancel-personal">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
  );

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">

      {/* ── Profile Completeness Bar ─────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-1">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-muted-foreground">Profile Completeness</span>
            <span className={`text-xs font-bold ${completeness >= 80 ? 'text-green-600' : completeness >= 50 ? 'text-amber-600' : 'text-muted-foreground'}`}>{completeness}%</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${completeness >= 80 ? 'bg-green-500' : completeness >= 50 ? 'bg-amber-500' : 'bg-muted-foreground/40'}`}
              style={{ width: `${completeness}%` }}
            />
          </div>
        </div>
        {completeness === 100 && (
          <span className="flex items-center gap-1 text-xs font-semibold text-green-600">
            <CheckCircle2 className="h-3.5 w-3.5" /> Complete
          </span>
        )}
      </div>

      {/* ── 0. Professional Summary / Background ─────────────────────────── */}
      <SectionCard accent="border-l-violet-500" iconBg="bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400" icon={<FileText className="h-3.5 w-3.5" />} title="Professional Summary / Background" action={editBtn}>
        {editMode ? (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Write a 2–4 sentence professional bio. This appears at the top of the exported CV (UN P11 / World Bank format).</p>
            <Textarea
              value={form.professional_summary || ''}
              onChange={e => f('professional_summary')(e.target.value)}
              placeholder="e.g. Humanitarian professional with over 8 years of experience in field coordination, monitoring & evaluation, and logistics management across East Africa and the Horn of Africa. Proven track record in managing complex multi-donor programs and leading cross-functional teams in challenging environments."
              rows={5}
              className="resize-none text-sm leading-relaxed"
            />
            <p className="text-xs text-muted-foreground text-right">{(form.professional_summary || '').length} characters</p>
          </div>
        ) : data.professional_summary ? (
          <p className="text-sm leading-relaxed text-foreground/90">{data.professional_summary}</p>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground/60 italic">
            <FileText className="h-4 w-4 shrink-0" />
            <span>No professional summary added yet.{isAdmin ? ' Click Edit to add one.' : ''}</span>
          </div>
        )}
      </SectionCard>

      {/* ── 1. Personal Identity ─────────────────────────────────────────── */}
      <SectionCard accent="border-l-blue-500" iconBg="bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400" icon={<User className="h-3.5 w-3.5" />} title="Personal Identity" action={editBtn}>
        {editMode ? (
          <FormGrid>
            <FormField label="Date of Birth"><Input type="date" value={form.date_of_birth || ''} onChange={e => f('date_of_birth')(e.target.value)} className="h-9" /></FormField>
            <FormField label="Gender">
              <Select value={form.gender || ''} onValueChange={f('gender')}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(GENDER_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Nationality"><Input value={form.nationality || ''} onChange={e => f('nationality')(e.target.value)} placeholder="e.g. Sudanese" className="h-9" /></FormField>
            <FormField label="Marital Status">
              <Select value={form.marital_status || ''} onValueChange={f('marital_status')}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(MARITAL_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Blood Type">
              <Select value={form.blood_type || ''} onValueChange={f('blood_type')}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  <SelectItem value="unknown">Unknown</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          </FormGrid>
        ) : (
          <InfoGrid>
            <InfoField label="Date of Birth" value={data.date_of_birth ? new Date(data.date_of_birth).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : ''} />
            <InfoField label="Gender" value={GENDER_LABELS[data.gender || ''] || data.gender} />
            <InfoField label="Nationality" value={data.nationality} />
            <InfoField label="Marital Status" value={MARITAL_LABELS[data.marital_status || ''] || data.marital_status} />
            <InfoField label="Blood Type" value={data.blood_type === 'unknown' ? 'Unknown' : data.blood_type} />
          </InfoGrid>
        )}
      </SectionCard>

      {/* ── 2. ID Documents ──────────────────────────────────────────────── */}
      <SectionCard accent="border-l-indigo-500" iconBg="bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400" icon={<CreditCard className="h-3.5 w-3.5" />} title="ID Documents">
        {editMode ? (
          <FormGrid>
            <FormField label="Primary ID Type">
              <Select value={form.id_type || ''} onValueChange={f('id_type')}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select ID type…" /></SelectTrigger>
                <SelectContent>
                  {ID_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="National ID Number"><Input value={form.national_id_no || ''} onChange={e => f('national_id_no')(e.target.value)} placeholder="ID number" className="h-9 font-mono" /></FormField>
            <FormField label="Passport Number"><Input value={form.passport_no || ''} onChange={e => f('passport_no')(e.target.value)} placeholder="Passport number" className="h-9 font-mono" /></FormField>
            <FormField label="Passport Expiry Date"><Input type="date" value={form.passport_expiry || ''} onChange={e => f('passport_expiry')(e.target.value)} className="h-9" /></FormField>
          </FormGrid>
        ) : (
          <InfoGrid>
            <InfoField label="Primary ID Type" value={ID_TYPES.find(t => t.value === data.id_type)?.label || data.id_type} />
            <InfoField label="National ID Number" value={data.national_id_no} mono />
            <InfoField label="Passport Number" value={data.passport_no} mono />
            <InfoField label="Passport Expiry" value={data.passport_expiry ? new Date(data.passport_expiry).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : ''} />
          </InfoGrid>
        )}
      </SectionCard>

      {/* ── 3. Contact Information ────────────────────────────────────────── */}
      <SectionCard accent="border-l-teal-500" iconBg="bg-teal-100 text-teal-600 dark:bg-teal-900/40 dark:text-teal-400" icon={<Phone className="h-3.5 w-3.5" />} title="Contact Information">
        {editMode ? (
          <FormGrid>
            <FormField label="Secondary Phone Number"><Input value={form.secondary_phone || ''} onChange={e => f('secondary_phone')(e.target.value)} placeholder="+249 XX XXX XXXX" className="h-9" /></FormField>
            <FormField label="Personal Email"><Input type="email" value={form.personal_email || ''} onChange={e => f('personal_email')(e.target.value)} placeholder="personal@email.com" className="h-9" /></FormField>
          </FormGrid>
        ) : (
          <InfoGrid cols={2}>
            <InfoField label="Secondary Phone" value={data.secondary_phone} />
            <InfoField label="Personal Email" value={data.personal_email} />
          </InfoGrid>
        )}
      </SectionCard>

      {/* ── 4. Emergency Contact ──────────────────────────────────────────── */}
      <div className="rounded-xl border border-amber-200 dark:border-amber-800/50 overflow-hidden shadow-sm">
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-amber-200 dark:border-amber-800/50 border-l-4 border-l-amber-500 bg-amber-50/60 dark:bg-amber-950/20">
          <span className="flex items-center justify-center h-7 w-7 rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400">
            <AlertCircle className="h-3.5 w-3.5" />
          </span>
          <h3 className="font-semibold text-sm">Emergency Contact</h3>
          <span className="ml-1 text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 rounded-full">Required</span>
        </div>
        <div className="p-5 bg-background">
          {editMode ? (
            <FormGrid>
              <FormField label="Contact Full Name" required><Input value={form.emergency_contact_name || ''} onChange={e => f('emergency_contact_name')(e.target.value)} placeholder="Full name" className="h-9" /></FormField>
              <FormField label="Contact Phone Number" required><Input value={form.emergency_contact_phone || ''} onChange={e => f('emergency_contact_phone')(e.target.value)} placeholder="+249 XX XXX XXXX" className="h-9" /></FormField>
              <FormField label="Relationship">
                <Select value={form.emergency_contact_relationship || ''} onValueChange={f('emergency_contact_relationship')}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {RELATIONSHIPS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>
            </FormGrid>
          ) : (
            <InfoGrid cols={3}>
              <InfoField label="Contact Name" value={data.emergency_contact_name} />
              <InfoField label="Phone Number" value={data.emergency_contact_phone} />
              <InfoField label="Relationship" value={data.emergency_contact_relationship} />
            </InfoGrid>
          )}
        </div>
      </div>

      {/* ── 5. Permanent Address ─────────────────────────────────────────── */}
      <SectionCard accent="border-l-green-500" iconBg="bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400" icon={<Home className="h-3.5 w-3.5" />} title="Permanent Address">
        {editMode ? (
          <FormGrid>
            <FormField label="Address Line 1" span={2}><Input value={form.address_line1 || ''} onChange={e => f('address_line1')(e.target.value)} placeholder="Street / Block / Area" className="h-9" /></FormField>
            <FormField label="Address Line 2"><Input value={form.address_line2 || ''} onChange={e => f('address_line2')(e.target.value)} placeholder="Apartment / Building (optional)" className="h-9" /></FormField>
            <FormField label="City"><Input value={form.city || ''} onChange={e => f('city')(e.target.value)} placeholder="City" className="h-9" /></FormField>
            <FormField label="State / Province"><Input value={form.permanent_state || ''} onChange={e => f('permanent_state')(e.target.value)} placeholder="State / Province" className="h-9" /></FormField>
            <FormField label="Country"><Input value={form.country || ''} onChange={e => f('country')(e.target.value)} placeholder="Country" className="h-9" /></FormField>
          </FormGrid>
        ) : (
          <div className="space-y-4">
            {(data.address_line1 || data.address_line2) && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Street Address</p>
                <p className="text-sm font-medium">{[data.address_line1, data.address_line2].filter(Boolean).join(', ')}</p>
              </div>
            )}
            <InfoGrid cols={3}>
              <InfoField label="City" value={data.city} />
              <InfoField label="State / Province" value={data.permanent_state} />
              <InfoField label="Country" value={data.country} />
            </InfoGrid>
          </div>
        )}
      </SectionCard>

      {/* ── 6. Residential Address (optional) ────────────────────────────── */}
      <div className="rounded-xl border border-border/50 overflow-hidden shadow-sm">
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border/40 border-l-4 border-l-purple-400 bg-muted/25">
          <span className="flex items-center justify-center h-7 w-7 rounded-lg bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400">
            <MapPin className="h-3.5 w-3.5" />
          </span>
          <h3 className="font-semibold text-sm">Current Residential Address</h3>
          <span className="text-[10px] text-muted-foreground italic ml-1">Optional — if different from permanent</span>
          {editMode && (
            <button type="button" onClick={() => setShowResidential(v => !v)} className="ml-auto text-xs text-primary font-semibold hover:underline">
              {showResidential ? '− Remove' : '+ Add'}
            </button>
          )}
        </div>
        <div className="p-5 bg-background">
          {showResidential ? (
            editMode ? (
              <FormGrid>
                <FormField label="Address Line 1" span={2}><Input value={form.residential_address_line1 || ''} onChange={e => f('residential_address_line1')(e.target.value)} placeholder="Street / Block / Area" className="h-9" /></FormField>
                <FormField label="Address Line 2"><Input value={form.residential_address_line2 || ''} onChange={e => f('residential_address_line2')(e.target.value)} placeholder="Apartment / Building" className="h-9" /></FormField>
                <FormField label="City"><Input value={form.residential_city || ''} onChange={e => f('residential_city')(e.target.value)} placeholder="City" className="h-9" /></FormField>
                <FormField label="Country"><Input value={form.residential_country || ''} onChange={e => f('residential_country')(e.target.value)} placeholder="Country" className="h-9" /></FormField>
              </FormGrid>
            ) : (
              <div className="space-y-4">
                {(data.residential_address_line1 || data.residential_address_line2) && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Street Address</p>
                    <p className="text-sm font-medium">{[data.residential_address_line1, data.residential_address_line2].filter(Boolean).join(', ')}</p>
                  </div>
                )}
                <InfoGrid cols={2}>
                  <InfoField label="City" value={data.residential_city} />
                  <InfoField label="Country" value={data.residential_country} />
                </InfoGrid>
              </div>
            )
          ) : (
            <p className="text-sm text-muted-foreground italic text-center py-3">
              {editMode ? 'Click + Add to enter a different residential address.' : 'Same as permanent address.'}
            </p>
          )}
        </div>
      </div>

    </div>
  );
}
