import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Trash2, Loader2, GraduationCap, Briefcase,
  Edit, Save, X, Calendar, Building2, MapPin, Tag,
} from "lucide-react";

interface EduEntry {
  id?: string;
  degree_level: string;
  institution: string;
  field_of_study?: string;
  graduation_year?: number | null;
  country?: string;
  grade?: string;
}

interface ExpEntry {
  id?: string;
  employer: string;
  job_title: string;
  start_date: string;
  end_date?: string;
  is_current: boolean;
  description?: string;
  location?: string;
  sector?: string;
}

const DEGREE_LABELS: Record<string, string> = {
  high_school:      'High School',
  vocational:       'Vocational Training',
  college_diploma:  'College Diploma / Technical Certificate',
  diploma:          'Diploma',
  bachelor:         "Bachelor's Degree",
  postgrad_diploma: 'Postgraduate Diploma / Higher Diploma',
  master:           "Master's Degree",
  phd:              'PhD / Doctorate',
  professional:     'Professional Certification',
  other:            'Other',
};

const DEGREE_COLORS: Record<string, string> = {
  phd: 'bg-purple-100 text-purple-700 border-purple-200',
  master: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  postgrad_diploma: 'bg-blue-100 text-blue-700 border-blue-200',
  bachelor: 'bg-sky-100 text-sky-700 border-sky-200',
  college_diploma: 'bg-teal-100 text-teal-700 border-teal-200',
  diploma: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  vocational: 'bg-green-100 text-green-700 border-green-200',
  high_school: 'bg-gray-100 text-gray-700 border-gray-200',
  professional: 'bg-amber-100 text-amber-700 border-amber-200',
  other: 'bg-slate-100 text-slate-700 border-slate-200',
};

const SECTORS = [
  'Health', 'Education', 'Finance & Accounting', 'Humanitarian / WASH',
  'Food Security & Livelihoods', 'Protection', 'Shelter & NFI',
  'Logistics & Supply Chain', 'IT & Technology', 'HR & Administration',
  'Project Management', 'Monitoring & Evaluation', 'Legal & Compliance',
  'Communications & Media', 'Engineering & Infrastructure',
  'Research & Development', 'Other',
];

const EMPTY_EDU: EduEntry = {
  degree_level: 'bachelor', institution: '', field_of_study: '', graduation_year: null, country: '', grade: '',
};
const EMPTY_EXP: ExpEntry = {
  employer: '', job_title: '', start_date: '', end_date: '', is_current: false, description: '', location: '', sector: '',
};

function SectionHeader({
  icon, title, subtitle, action,
}: { icon: React.ReactNode; title: string; subtitle: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-5">
      <div className="flex items-center gap-3">
        <span className="flex items-center justify-center h-9 w-9 rounded-xl bg-primary/10 text-primary shrink-0">{icon}</span>
        <div>
          <h3 className="font-bold text-sm">{title}</h3>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

function FormRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>;
}

function FormField({ label, required, span, children }: {
  label: string; required?: boolean; span?: 'full'; children: React.ReactNode;
}) {
  return (
    <div className={span === 'full' ? 'sm:col-span-2' : ''}>
      <label className="block text-xs font-semibold text-foreground/70 mb-1.5">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

export default function EmployeeEducationTab({ userId, isAdmin }: { userId: string; isAdmin: boolean }) {
  const { toast } = useToast();
  const [edu, setEdu] = useState<EduEntry[]>([]);
  const [exp, setExp] = useState<ExpEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [eduForm, setEduForm] = useState<EduEntry | null>(null);
  const [eduSaving, setEduSaving] = useState(false);
  const [expForm, setExpForm] = useState<ExpEntry | null>(null);
  const [expSaving, setExpSaving] = useState(false);

  useEffect(() => {
    if (!userId) return;
    const load = async () => {
      setLoading(true);
      const [{ data: e, error: eErr }, { data: x, error: xErr }] = await Promise.all([
        supabase.from('hr_employee_education').select('*').eq('profile_id', userId).order('graduation_year', { ascending: false }),
        supabase.from('hr_employee_experience').select('*').eq('profile_id', userId).order('start_date', { ascending: false }),
      ]);
      if (eErr) console.warn('[EmployeeEducationTab] education fetch error:', eErr.message);
      if (xErr) console.warn('[EmployeeEducationTab] experience fetch error:', xErr.message);
      setEdu(e || []);
      setExp(x || []);
      setLoading(false);
    };
    load();
  }, [userId]);

  const openEduForm = (entry?: EduEntry) => {
    setEduForm(entry ? { ...entry } : { ...EMPTY_EDU });
  };

  const openExpForm = (entry?: ExpEntry) => {
    setExpForm(entry ? { ...entry } : { ...EMPTY_EXP });
  };

  const saveEdu = async () => {
    if (!eduForm) return;
    if (!eduForm.degree_level || !eduForm.institution.trim()) {
      toast({ title: 'Required fields missing', description: 'Please fill in Degree Level and Institution Name', variant: 'destructive' });
      return;
    }
    setEduSaving(true);
    try {
      const yr = eduForm.graduation_year;
      if (yr !== null && yr !== undefined && (isNaN(yr) || yr < 1950 || yr > 2099)) {
        toast({ title: 'Invalid graduation year', description: 'Please enter a year between 1950 and 2099', variant: 'destructive' });
        setEduSaving(false); return;
      }
      const payload = { ...eduForm, graduation_year: yr && !isNaN(yr) ? yr : null, profile_id: userId };
      if (eduForm.id) {
        const { error } = await supabase.from('hr_employee_education').update(payload).eq('id', eduForm.id);
        if (error) throw error;
        setEdu(p => p.map(r => r.id === eduForm.id ? { ...r, ...eduForm } : r));
      } else {
        const { data: ins, error } = await supabase.from('hr_employee_education').insert(payload).select().single();
        if (error) throw error;
        setEdu(p => [ins, ...p]);
      }
      setEduForm(null);
      toast({ title: 'Education entry saved' });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally { setEduSaving(false); }
  };

  const deleteEdu = async (id: string) => {
    const { error } = await supabase.from('hr_employee_education').delete().eq('id', id);
    if (error) { toast({ title: 'Delete failed', description: error.message, variant: 'destructive' }); return; }
    setEdu(p => p.filter(r => r.id !== id));
  };

  const saveExp = async () => {
    if (!expForm) return;
    const missingExp: string[] = [];
    if (!expForm.employer.trim()) missingExp.push('Employer / Organisation');
    if (!expForm.job_title.trim()) missingExp.push('Job Title');
    if (!expForm.start_date) missingExp.push('Start Date');
    if (missingExp.length > 0) {
      toast({ title: 'Required fields missing', description: `Please fill in: ${missingExp.join(', ')}`, variant: 'destructive' });
      return;
    }
    setExpSaving(true);
    try {
      const payload = { ...expForm, profile_id: userId, end_date: expForm.is_current ? null : expForm.end_date || null };
      if (expForm.id) {
        const { error } = await supabase.from('hr_employee_experience').update(payload).eq('id', expForm.id);
        if (error) throw error;
        setExp(p => p.map(r => r.id === expForm.id ? { ...r, ...expForm } : r));
      } else {
        const { data: ins, error } = await supabase.from('hr_employee_experience').insert(payload).select().single();
        if (error) throw error;
        setExp(p => [ins, ...p]);
      }
      setExpForm(null);
      toast({ title: 'Experience entry saved' });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally { setExpSaving(false); }
  };

  const deleteExp = async (id: string) => {
    const { error } = await supabase.from('hr_employee_experience').delete().eq('id', id);
    if (error) { toast({ title: 'Delete failed', description: error.message, variant: 'destructive' }); return; }
    setExp(p => p.filter(r => r.id !== id));
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-8">

      {/* ── Education History ────────────────────────────────────────────── */}
      <div>
        <SectionHeader
          icon={<GraduationCap className="h-5 w-5" />}
          title="Education History"
          subtitle={`${edu.length} academic qualification${edu.length !== 1 ? 's' : ''} on record`}
          action={isAdmin ? (
            <Button
              type="button"
              size="sm"
              variant={eduForm ? "ghost" : "outline"}
              className={`h-8 gap-1.5 text-xs ${eduForm ? 'text-muted-foreground hover:text-foreground' : ''}`}
              onClick={() => eduForm ? setEduForm(null) : openEduForm()}
              data-testid="button-add-education"
            >
              {eduForm ? <><X className="h-3 w-3" /> Cancel</> : <><Plus className="h-3 w-3" /> Add Qualification</>}
            </Button>
          ) : undefined}
        />

        {/* Add / Edit form */}
        {eduForm && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 mb-4 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold">{eduForm.id ? 'Edit Qualification' : 'Add New Qualification'}</h4>
              <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEduForm(null)}><X className="h-3.5 w-3.5" /></Button>
            </div>
            <FormRow>
              <FormField label="Degree / Qualification Level" required>
                <Select value={eduForm.degree_level} onValueChange={v => setEduForm(p => p ? { ...p, degree_level: v } : p)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(DEGREE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Institution Name" required>
                <Input value={eduForm.institution} onChange={e => setEduForm(p => p ? { ...p, institution: e.target.value } : p)} placeholder="University / School name" className="h-9 text-sm" />
              </FormField>
              <FormField label="Field of Study">
                <Input value={eduForm.field_of_study || ''} onChange={e => setEduForm(p => p ? { ...p, field_of_study: e.target.value } : p)} placeholder="e.g. Computer Science" className="h-9 text-sm" />
              </FormField>
              <FormField label="Graduation Year">
                <Input type="number" min="1950" max="2099" value={eduForm.graduation_year || ''} onChange={e => setEduForm(p => p ? { ...p, graduation_year: e.target.value ? parseInt(e.target.value) : null } : p)} placeholder="YYYY" className="h-9 text-sm" />
              </FormField>
              <FormField label="Country">
                <Input value={eduForm.country || ''} onChange={e => setEduForm(p => p ? { ...p, country: e.target.value } : p)} placeholder="Country" className="h-9 text-sm" />
              </FormField>
              <FormField label="Grade / GPA">
                <Input value={eduForm.grade || ''} onChange={e => setEduForm(p => p ? { ...p, grade: e.target.value } : p)} placeholder="e.g. 3.8 / 4.0 or Distinction" className="h-9 text-sm" />
              </FormField>
            </FormRow>
            <div className="flex gap-2 pt-1 border-t border-border/40">
              <Button type="button" size="sm" onClick={saveEdu} disabled={eduSaving || !eduForm.institution} className="gap-1.5">
                {eduSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Save
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setEduForm(null)}>Cancel</Button>
            </div>
          </div>
        )}

        {/* Education list */}
        {edu.length === 0 && !eduForm ? (
          <div className="text-center py-10 border rounded-xl border-dashed bg-muted/5">
            <GraduationCap className="h-7 w-7 mx-auto mb-2 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No education history recorded yet.</p>
            {isAdmin && (
              <Button type="button" size="sm" variant="outline" className="mt-3 gap-1.5 text-xs" onClick={() => openEduForm()} data-testid="button-add-education-empty">
                <Plus className="h-3 w-3" /> Add First Qualification
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {edu.map((e, i) => (
              <div key={e.id || i} className="flex items-stretch gap-0 rounded-xl border border-border/40 overflow-hidden hover:border-border/70 hover:shadow-sm transition-all bg-background">
                <div className="w-1 shrink-0 bg-primary/20" />
                <div className="flex items-center gap-4 px-4 py-3.5 flex-1 min-w-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-sm">{e.institution}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${DEGREE_COLORS[e.degree_level] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                        {DEGREE_LABELS[e.degree_level] || e.degree_level}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      {e.field_of_study && <span>{e.field_of_study}</span>}
                      {e.country && <span className="flex items-center gap-0.5"><MapPin className="h-3 w-3" />{e.country}</span>}
                      {e.graduation_year && <span className="flex items-center gap-0.5"><Calendar className="h-3 w-3" />{e.graduation_year}</span>}
                      {e.grade && <span className="font-medium text-foreground/60">Grade: {e.grade}</span>}
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-1 shrink-0">
                      <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={() => openEduForm(e)} data-testid={`button-edit-edu-${e.id}`}><Edit className="h-3 w-3" /></Button>
                      <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600" onClick={() => e.id && deleteEdu(e.id)} data-testid={`button-delete-edu-${e.id}`}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Employment History ───────────────────────────────────────────── */}
      <div>
        <SectionHeader
          icon={<Briefcase className="h-5 w-5" />}
          title="Employment History"
          subtitle={`${exp.length} position${exp.length !== 1 ? 's' : ''} on record`}
          action={isAdmin ? (
            <Button
              type="button"
              size="sm"
              variant={expForm ? "ghost" : "outline"}
              className={`h-8 gap-1.5 text-xs ${expForm ? 'text-muted-foreground hover:text-foreground' : ''}`}
              onClick={() => expForm ? setExpForm(null) : openExpForm()}
              data-testid="button-add-experience"
            >
              {expForm ? <><X className="h-3 w-3" /> Cancel</> : <><Plus className="h-3 w-3" /> Add Position</>}
            </Button>
          ) : undefined}
        />

        {/* Add / Edit form */}
        {expForm && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 mb-4 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold">{expForm.id ? 'Edit Position' : 'Add New Position'}</h4>
              <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setExpForm(null)}><X className="h-3.5 w-3.5" /></Button>
            </div>
            <FormRow>
              <FormField label="Employer / Organisation" required>
                <Input value={expForm.employer} onChange={e => setExpForm(p => p ? { ...p, employer: e.target.value } : p)} placeholder="Organisation name" className="h-9 text-sm" />
              </FormField>
              <FormField label="Job Title / Position" required>
                <Input value={expForm.job_title} onChange={e => setExpForm(p => p ? { ...p, job_title: e.target.value } : p)} placeholder="Position / Role" className="h-9 text-sm" />
              </FormField>
              <FormField label="Experience Area / Sector">
                <Select value={expForm.sector || ''} onValueChange={v => setExpForm(p => p ? { ...p, sector: v } : p)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select sector…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">— None —</SelectItem>
                    {SECTORS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Location">
                <Input value={expForm.location || ''} onChange={e => setExpForm(p => p ? { ...p, location: e.target.value } : p)} placeholder="City, Country" className="h-9 text-sm" />
              </FormField>
              <FormField label="Start Date" required>
                <Input type="date" value={expForm.start_date} onChange={e => setExpForm(p => p ? { ...p, start_date: e.target.value } : p)} className="h-9 text-sm" />
              </FormField>
              <FormField label="End Date">
                <Input type="date" value={expForm.end_date || ''} disabled={expForm.is_current} onChange={e => setExpForm(p => p ? { ...p, end_date: e.target.value } : p)} className="h-9 text-sm disabled:opacity-40" />
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer mt-1.5">
                  <input type="checkbox" checked={expForm.is_current} onChange={e => setExpForm(p => p ? { ...p, is_current: e.target.checked, end_date: e.target.checked ? '' : p.end_date } : p)} className="rounded" />
                  Currently working here
                </label>
              </FormField>
              <FormField label="Key Responsibilities / Description" span="full">
                <textarea value={expForm.description || ''} onChange={e => setExpForm(p => p ? { ...p, description: e.target.value } : p)} placeholder="Describe key responsibilities and achievements…" rows={3} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring" />
              </FormField>
            </FormRow>
            <div className="flex gap-2 pt-1 border-t border-border/40">
              <Button type="button" size="sm" onClick={saveExp} disabled={expSaving || !expForm.employer || !expForm.job_title || !expForm.start_date} className="gap-1.5">
                {expSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Save
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setExpForm(null)}>Cancel</Button>
            </div>
          </div>
        )}

        {/* Experience list */}
        {exp.length === 0 && !expForm ? (
          <div className="text-center py-10 border rounded-xl border-dashed bg-muted/5">
            <Briefcase className="h-7 w-7 mx-auto mb-2 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No employment history recorded yet.</p>
            {isAdmin && (
              <Button type="button" size="sm" variant="outline" className="mt-3 gap-1.5 text-xs" onClick={() => openExpForm()} data-testid="button-add-experience-empty">
                <Plus className="h-3 w-3" /> Add First Position
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {exp.map((e, i) => (
              <div key={e.id || i} className="flex items-stretch gap-0 rounded-xl border border-border/40 overflow-hidden hover:border-border/70 hover:shadow-sm transition-all bg-background">
                <div className={`w-1 shrink-0 ${e.is_current ? 'bg-green-500' : 'bg-muted-foreground/20'}`} />
                <div className="flex items-start gap-4 px-4 py-3.5 flex-1 min-w-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-sm">{e.job_title}</span>
                      {e.is_current && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-green-100 text-green-700 border-green-200">
                          Current
                        </span>
                      )}
                      {e.sector && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-blue-50 text-blue-700 border-blue-200">
                          <Tag className="h-2.5 w-2.5" />{e.sector}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground flex items-center gap-1.5 flex-wrap">
                      <Building2 className="h-3.5 w-3.5 shrink-0" />
                      <span className="font-medium text-foreground/80">{e.employer}</span>
                      {e.location && <><span className="text-muted-foreground/40">·</span><MapPin className="h-3 w-3" />{e.location}</>}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {e.start_date} — {e.is_current ? <span className="text-green-600 font-medium">Present</span> : (e.end_date || 'N/A')}
                    </p>
                    {e.description && <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2 italic">{e.description}</p>}
                  </div>
                  {isAdmin && (
                    <div className="flex gap-1 shrink-0">
                      <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={() => openExpForm(e)} data-testid={`button-edit-exp-${e.id}`}><Edit className="h-3 w-3" /></Button>
                      <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600" onClick={() => e.id && deleteExp(e.id)} data-testid={`button-delete-exp-${e.id}`}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
