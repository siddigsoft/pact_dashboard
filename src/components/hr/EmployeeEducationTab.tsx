import { useState, useEffect, memo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Trash2, Loader2, GraduationCap, Briefcase,
  Edit, Save, X, Calendar, MapPin, AlertTriangle,
  Building2, Tag, UserCheck, Phone, ChevronDown, ChevronUp,
  Info,
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
  employment_type?: string;
  sector?: string;
  location?: string;
  start_date: string;
  end_date?: string;
  is_current: boolean;
  description?: string;
  achievements?: string;
  supervisor_name?: string;
  reason_for_leaving?: string;
  reference_available?: boolean;
  reference_name?: string;
  reference_contact?: string;
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

const EMP_TYPES = [
  'Full-time', 'Part-time', 'Consultant / Contract', 'Internship',
  'Volunteer', 'Secondment', 'Temporary', 'Casual / Daily', 'Other',
];

const SECTORS = [
  'Health', 'Education', 'Finance & Accounting', 'Humanitarian / WASH',
  'Food Security & Livelihoods', 'Protection', 'Shelter & NFI',
  'Logistics & Supply Chain', 'IT & Technology', 'HR & Administration',
  'Project Management', 'Monitoring & Evaluation', 'Legal & Compliance',
  'Communications & Media', 'Engineering & Infrastructure',
  'Research & Development', 'Agriculture', 'Environment & Climate',
  'Governance & Peacebuilding', 'Other',
];

const REASONS_FOR_LEAVING = [
  'End of contract', 'Resignation', 'Redundancy / Downsizing',
  'Better opportunity', 'Relocation', 'Personal reasons',
  'Organisation closure', 'Mutual agreement', 'Retirement',
  'Still employed', 'Other',
];

const EMPTY_EDU: EduEntry = {
  degree_level: 'bachelor', institution: '', field_of_study: '',
  graduation_year: null, country: '', grade: '',
};

const EMPTY_EXP: ExpEntry = {
  employer: '', job_title: '', employment_type: 'Full-time',
  sector: '', location: '',
  start_date: '', end_date: '', is_current: false,
  description: '', achievements: '', supervisor_name: '',
  reason_for_leaving: '', reference_available: false,
  reference_name: '', reference_contact: '',
};

const SQL_HINT = 'supabase/migrations/20260723_hr_education_experience_complete.sql';

// ── Error classifiers ──────────────────────────────────────────────────────────
function isTableMissing(msg: string) {
  return msg.includes('relation') && (msg.includes('does not exist') || msg.includes("doesn't exist"));
}
function isRlsError(msg: string) {
  return msg.includes('row-level security') || msg.includes('permission denied') || msg.includes('violates');
}
function isColumnMissing(msg: string) {
  // PostgreSQL error: "column X of relation Y does not exist"
  // PostgREST error:  "Could not find the 'X' column of 'Y' in the schema cache"
  return (
    (msg.includes('column') && msg.includes('does not exist')) ||
    msg.includes('schema cache') ||
    (msg.includes('Could not find') && msg.includes('column'))
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────
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

function DbSetupBanner({ error }: { error: string }) {
  const isTable  = isTableMissing(error);
  const isRls    = isRlsError(error);
  const isColumn = isColumnMissing(error);
  const title = isTable
    ? 'Database tables not set up yet'
    : isRls
      ? 'Permission denied by database policy'
      : isColumn
        ? 'Extended columns not yet added to the experience table'
        : 'Database error';
  const body = isTable
    ? 'The Education & Experience tables need to be created in Supabase before records can be saved.'
    : isRls
      ? 'Row-level security is blocking access. The RLS policies need to be fixed.'
      : isColumn
        ? 'The experience table exists but is missing the new extended columns. Basic saves still work — run the migration to enable all fields.'
        : error;
  return (
    <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-4 flex gap-3">
      <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
      <div className="text-sm">
        <p className="font-bold text-amber-800 dark:text-amber-300 mb-1">{title}</p>
        <p className="text-amber-700 dark:text-amber-400 mb-2">{body}</p>
        <p className="text-xs text-amber-600 dark:text-amber-500 font-mono bg-amber-100 dark:bg-amber-900/40 rounded px-2 py-1 inline-block">
          Run in Supabase SQL Editor: {SQL_HINT}
        </p>
      </div>
    </div>
  );
}

function MigrationNotice() {
  return (
    <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800 p-3 flex gap-2 items-start">
      <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
      <p className="text-xs text-blue-700 dark:text-blue-400">
        <span className="font-semibold">Extended fields not yet available.</span>{' '}
        Basic employment details (employer, title, dates) can still be saved.
        To enable Employment Type, Sector, Achievements, Supervisor &amp; Reference fields,
        run the updated migration: <span className="font-mono">{SQL_HINT}</span>
      </p>
    </div>
  );
}

// ── Base payload (columns that existed from the very first migration) ──────────
function buildBaseExpPayload(form: ExpEntry, userId: string) {
  return {
    profile_id: userId,
    employer:    form.employer,
    job_title:   form.job_title,
    start_date:  form.start_date,
    end_date:    form.is_current ? null : form.end_date || null,
    is_current:  form.is_current,
    description: form.description || null,
    location:    form.location || null,
    sector:      form.sector || null,
  };
}

// ── Full payload (includes all new columns) ────────────────────────────────────
function buildFullExpPayload(form: ExpEntry, userId: string) {
  return {
    ...buildBaseExpPayload(form, userId),
    employment_type:     form.employment_type || null,
    achievements:        form.achievements || null,
    supervisor_name:     form.supervisor_name || null,
    reason_for_leaving:  form.reason_for_leaving || null,
    reference_available: form.reference_available ?? false,
    reference_name:      form.reference_name || null,
    reference_contact:   form.reference_contact || null,
  };
}

// ── Main Component ─────────────────────────────────────────────────────────────
function EmployeeEducationTab({ userId, isAdmin }: { userId: string; isAdmin: boolean }) {
  const { toast } = useToast();

  const [edu, setEdu]             = useState<EduEntry[]>([]);
  const [exp, setExp]             = useState<ExpEntry[]>([]);
  const [loading, setLoading]     = useState(false);
  const [dbError, setDbError]     = useState<string | null>(null);
  const [extendedColsMissing, setExtendedColsMissing] = useState(false);

  const [eduForm, setEduForm]     = useState<EduEntry | null>(null);
  const [eduSaving, setEduSaving] = useState(false);

  const [expForm, setExpForm]     = useState<ExpEntry | null>(null);
  const [expSaving, setExpSaving] = useState(false);
  const [expExpanded, setExpExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setEduForm(null);
    setExpForm(null);
    const load = async () => {
      setLoading(true);
      setDbError(null);
      const [{ data: e, error: eErr }, { data: x, error: xErr }] = await Promise.all([
        supabase.from('hr_employee_education').select('*').eq('profile_id', userId).order('graduation_year', { ascending: false }),
        supabase.from('hr_employee_experience').select('*').eq('profile_id', userId).order('start_date', { ascending: false }),
      ]);
      if (cancelled) return;
      const firstError = eErr || xErr;
      if (firstError) setDbError(firstError.message);
      setEdu(e || []);
      setExp(x || []);
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [userId]);

  // Open forms inline (no scroll jump — same behaviour as Education History)
  const openEduForm = (entry?: EduEntry) => setEduForm(entry ? { ...entry } : { ...EMPTY_EDU });
  const openExpForm = (entry?: ExpEntry) => setExpForm(entry ? { ...entry } : { ...EMPTY_EXP });

  const saveEdu = async () => {
    if (!eduForm) return;
    if (!eduForm.degree_level || !eduForm.institution.trim()) {
      toast({ title: 'Required fields missing', description: 'Please fill in Degree Level and Institution Name', variant: 'destructive' });
      return;
    }
    const yr = eduForm.graduation_year;
    if (yr !== null && yr !== undefined && (isNaN(yr) || yr < 1950 || yr > 2099)) {
      toast({ title: 'Invalid graduation year', description: 'Please enter a year between 1950 and 2099', variant: 'destructive' });
      return;
    }
    setEduSaving(true);
    try {
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
      const msg: string = e?.message || String(e);
      if (isTableMissing(msg) || isRlsError(msg)) setDbError(msg);
      toast({ title: 'Save failed', description: msg, variant: 'destructive' });
    } finally {
      setEduSaving(false);
    }
  };

  const deleteEdu = async (id: string) => {
    const { error } = await supabase.from('hr_employee_education').delete().eq('id', id);
    if (error) { toast({ title: 'Delete failed', description: error.message, variant: 'destructive' }); return; }
    setEdu(p => p.filter(r => r.id !== id));
  };

  const saveExp = async () => {
    if (!expForm) return;
    const missing: string[] = [];
    if (!expForm.employer.trim()) missing.push('Employer');
    if (!expForm.job_title.trim()) missing.push('Job Title');
    if (!expForm.start_date) missing.push('Start Date');
    if (missing.length > 0) {
      toast({ title: 'Required fields missing', description: `Please fill in: ${missing.join(', ')}`, variant: 'destructive' });
      return;
    }
    setExpSaving(true);
    try {
      // Try full payload first; fall back to base if new columns are missing
      const fullPayload = buildFullExpPayload(expForm, userId);
      const basePayload = buildBaseExpPayload(expForm, userId);

      const tryInsert = async (payload: Record<string, unknown>) => {
        if (expForm.id) {
          return supabase.from('hr_employee_experience').update(payload).eq('id', expForm.id);
        }
        return supabase.from('hr_employee_experience').insert(payload).select().single();
      };

      let { data: ins, error } = await tryInsert(fullPayload) as any;

      // If new columns don't exist, retry with base columns only
      if (error && isColumnMissing(error.message)) {
        setExtendedColsMissing(true);
        const retry = await tryInsert(basePayload) as any;
        ins   = retry.data;
        error = retry.error;
        if (!error) {
          toast({
            title: 'Saved with basic fields only',
            description: 'Extended fields (Employment Type, Sector, Achievements, Supervisor & Reference) require the updated migration. Basic details were saved successfully.',
          });
        }
      }

      if (error) throw error;

      if (expForm.id) {
        setExp(p => p.map(r => r.id === expForm.id ? { ...r, ...expForm } : r));
      } else {
        setExp(p => [ins as ExpEntry, ...p]);
      }
      setExpForm(null);
      if (!extendedColsMissing) toast({ title: 'Employment record saved' });
    } catch (e: any) {
      const msg: string = e?.message || String(e);
      if (isTableMissing(msg)) {
        setDbError(msg);
        toast({ title: 'Cannot save — table missing', description: `Run the migration SQL first: ${SQL_HINT}`, variant: 'destructive' });
      } else if (isRlsError(msg)) {
        setDbError(msg);
        toast({ title: 'Cannot save — permission denied', description: `Run: ${SQL_HINT}`, variant: 'destructive' });
      } else {
        toast({ title: 'Save failed', description: msg, variant: 'destructive' });
      }
    } finally {
      setExpSaving(false);
    }
  };

  const deleteExp = async (id: string) => {
    const { error } = await supabase.from('hr_employee_experience').delete().eq('id', id);
    if (error) { toast({ title: 'Delete failed', description: error.message, variant: 'destructive' }); return; }
    setExp(p => p.filter(r => r.id !== id));
  };

  if (loading) return (
    <div className="flex justify-center py-16">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="space-y-8">

      {dbError && <DbSetupBanner error={dbError} />}

      {/* ── Education History ─────────────────────────────────────────── */}
      <div>
        <SectionHeader
          icon={<GraduationCap className="h-5 w-5" />}
          title="Education History"
          subtitle={`${edu.length} academic qualification${edu.length !== 1 ? 's' : ''} on record`}
          action={isAdmin ? (
            <Button
              type="button" size="sm"
              variant={eduForm ? "ghost" : "outline"}
              className={`h-8 gap-1.5 text-xs ${eduForm ? 'text-muted-foreground hover:text-foreground' : ''}`}
              onClick={() => eduForm ? setEduForm(null) : openEduForm()}
              data-testid="button-add-education"
            >
              {eduForm ? <><X className="h-3 w-3" /> Cancel</> : <><Plus className="h-3 w-3" /> Add Qualification</>}
            </Button>
          ) : undefined}
        />

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
              <Button type="button" size="sm" onClick={saveEdu} disabled={eduSaving || !eduForm.institution.trim()} className="gap-1.5">
                {eduSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Save
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setEduForm(null)}>Cancel</Button>
            </div>
          </div>
        )}

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

      {/* ── Employment History ───────────────────────────────────────── */}
      <div>
        <SectionHeader
          icon={<Briefcase className="h-5 w-5" />}
          title="Employment History"
          subtitle={`${exp.length} position${exp.length !== 1 ? 's' : ''} on record`}
          action={isAdmin ? (
            <Button
              type="button" size="sm"
              variant={expForm ? "ghost" : "outline"}
              className={`h-8 gap-1.5 text-xs ${expForm ? 'text-muted-foreground hover:text-foreground' : ''}`}
              onClick={() => expForm ? setExpForm(null) : openExpForm()}
              data-testid="button-add-experience"
            >
              {expForm ? <><X className="h-3 w-3" /> Cancel</> : <><Plus className="h-3 w-3" /> Add Position</>}
            </Button>
          ) : undefined}
        />

        {extendedColsMissing && <MigrationNotice />}

        {/* ── Add / Edit Form ── */}
        {expForm && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 mb-4 space-y-5">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold">{expForm.id ? 'Edit Employment Record' : 'Add Employment Record'}</h4>
              <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setExpForm(null)}><X className="h-3.5 w-3.5" /></Button>
            </div>

            {/* Section A — Position Details */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Position Details</p>
              <FormRow>
                <FormField label="Employer / Organisation" required>
                  <Input
                    value={expForm.employer}
                    onChange={e => setExpForm(p => p ? { ...p, employer: e.target.value } : p)}
                    placeholder="Organisation name"
                    className="h-9 text-sm"
                    data-testid="input-exp-employer"
                  />
                </FormField>
                <FormField label="Job Title / Position" required>
                  <Input
                    value={expForm.job_title}
                    onChange={e => setExpForm(p => p ? { ...p, job_title: e.target.value } : p)}
                    placeholder="Position / Role"
                    className="h-9 text-sm"
                    data-testid="input-exp-job-title"
                  />
                </FormField>
                <FormField label="Employment Type">
                  <Select
                    value={expForm.employment_type || 'Full-time'}
                    onValueChange={v => setExpForm(p => p ? { ...p, employment_type: v } : p)}
                  >
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select type…" /></SelectTrigger>
                    <SelectContent>
                      {EMP_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Experience Area / Sector">
                  <Select
                    value={expForm.sector || 'none'}
                    onValueChange={v => setExpForm(p => p ? { ...p, sector: v === 'none' ? '' : v } : p)}
                  >
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select sector…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None —</SelectItem>
                      {SECTORS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Location (City, Country)">
                  <Input
                    value={expForm.location || ''}
                    onChange={e => setExpForm(p => p ? { ...p, location: e.target.value } : p)}
                    placeholder="e.g. Khartoum, Sudan"
                    className="h-9 text-sm"
                  />
                </FormField>
              </FormRow>
            </div>

            {/* Section B — Duration */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Duration</p>
              <FormRow>
                <FormField label="Start Date" required>
                  <Input
                    type="date"
                    value={expForm.start_date}
                    onChange={e => setExpForm(p => p ? { ...p, start_date: e.target.value } : p)}
                    className="h-9 text-sm"
                    data-testid="input-exp-start-date"
                  />
                </FormField>
                <FormField label="End Date">
                  <Input
                    type="date"
                    value={expForm.end_date || ''}
                    disabled={expForm.is_current}
                    onChange={e => setExpForm(p => p ? { ...p, end_date: e.target.value } : p)}
                    className="h-9 text-sm disabled:opacity-40"
                  />
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer mt-1.5">
                    <input
                      type="checkbox"
                      checked={expForm.is_current}
                      onChange={e => setExpForm(p => p ? { ...p, is_current: e.target.checked, end_date: e.target.checked ? '' : p.end_date } : p)}
                      className="rounded"
                    />
                    Currently working here
                  </label>
                </FormField>
                {!expForm.is_current && (
                  <FormField label="Reason for Leaving">
                    <Select
                      value={expForm.reason_for_leaving || 'not_specified'}
                      onValueChange={v => setExpForm(p => p ? { ...p, reason_for_leaving: v === 'not_specified' ? '' : v } : p)}
                    >
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select reason…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="not_specified">— Not specified —</SelectItem>
                        {REASONS_FOR_LEAVING.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormField>
                )}
              </FormRow>
            </div>

            {/* Section C — Role Description */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Role Description</p>
              <div className="space-y-3">
                <FormField label="Key Responsibilities" span="full">
                  <textarea
                    value={expForm.description || ''}
                    onChange={e => setExpForm(p => p ? { ...p, description: e.target.value } : p)}
                    placeholder="Describe main duties and responsibilities…"
                    rows={3}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </FormField>
                <FormField label="Key Achievements" span="full">
                  <textarea
                    value={expForm.achievements || ''}
                    onChange={e => setExpForm(p => p ? { ...p, achievements: e.target.value } : p)}
                    placeholder="Notable accomplishments, projects delivered, impact made…"
                    rows={2}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </FormField>
              </div>
            </div>

            {/* Section D — Supervisor & Reference */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Supervisor & Reference</p>
              <FormRow>
                <FormField label="Direct Supervisor / Line Manager">
                  <Input
                    value={expForm.supervisor_name || ''}
                    onChange={e => setExpForm(p => p ? { ...p, supervisor_name: e.target.value } : p)}
                    placeholder="Supervisor name & title"
                    className="h-9 text-sm"
                  />
                </FormField>
                <FormField label="Reference Available?">
                  <div className="flex items-center gap-4 h-9">
                    <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name={`ref-avail-${expForm.id || 'new'}`}
                        checked={expForm.reference_available === true}
                        onChange={() => setExpForm(p => p ? { ...p, reference_available: true } : p)}
                        className="accent-primary"
                      /> Yes
                    </label>
                    <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name={`ref-avail-${expForm.id || 'new'}`}
                        checked={!expForm.reference_available}
                        onChange={() => setExpForm(p => p ? { ...p, reference_available: false } : p)}
                        className="accent-primary"
                      /> No
                    </label>
                  </div>
                </FormField>
                {expForm.reference_available && (
                  <>
                    <FormField label="Reference Name">
                      <Input
                        value={expForm.reference_name || ''}
                        onChange={e => setExpForm(p => p ? { ...p, reference_name: e.target.value } : p)}
                        placeholder="Full name & designation"
                        className="h-9 text-sm"
                      />
                    </FormField>
                    <FormField label="Reference Contact">
                      <Input
                        value={expForm.reference_contact || ''}
                        onChange={e => setExpForm(p => p ? { ...p, reference_contact: e.target.value } : p)}
                        placeholder="Email or phone number"
                        className="h-9 text-sm"
                      />
                    </FormField>
                  </>
                )}
              </FormRow>
            </div>

            <div className="flex gap-2 pt-1 border-t border-border/40">
              <Button
                type="button" size="sm" onClick={saveExp}
                disabled={expSaving || !expForm.employer.trim() || !expForm.job_title.trim() || !expForm.start_date}
                className="gap-1.5"
                data-testid="button-save-experience"
              >
                {expSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Save Record
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setExpForm(null)}>Cancel</Button>
            </div>
          </div>
        )}

        {/* ── Empty state ── */}
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
          <div className="space-y-3">
            {exp.map((e, i) => {
              const cardKey = e.id || String(i);
              const isOpen = expExpanded === cardKey;
              const duration = (() => {
                if (!e.start_date) return '';
                const start = new Date(e.start_date);
                const end = e.is_current ? new Date() : (e.end_date ? new Date(e.end_date) : null);
                if (!end) return e.start_date;
                const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
                const yrs = Math.floor(months / 12);
                const mos = months % 12;
                return [yrs > 0 ? `${yrs}y` : '', mos > 0 ? `${mos}m` : ''].filter(Boolean).join(' ') || '<1m';
              })();
              const hasDetail = !!(e.description || e.achievements || e.supervisor_name || e.reference_available);
              return (
                <div key={cardKey} className="rounded-xl border border-border/40 overflow-hidden hover:border-border/60 transition-all bg-background shadow-sm">
                  {/* Main row */}
                  <div className="flex items-stretch gap-0">
                    <div className={`w-1.5 shrink-0 ${e.is_current ? 'bg-green-500' : 'bg-muted-foreground/20'}`} />
                    <div className="flex items-start gap-3 px-4 py-3.5 flex-1 min-w-0">
                      <div className="flex-1 min-w-0">
                        {/* Title row */}
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-semibold text-sm">{e.job_title}</span>
                          {e.is_current && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border bg-green-100 text-green-700 border-green-200">● Current</span>
                          )}
                          {e.employment_type && e.employment_type !== 'Full-time' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-orange-50 text-orange-700 border-orange-200">{e.employment_type}</span>
                          )}
                          {e.sector && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-blue-50 text-blue-700 border-blue-200">
                              <Tag className="h-2.5 w-2.5" />{e.sector}
                            </span>
                          )}
                        </div>
                        {/* Employer + location */}
                        <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap mb-1">
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3.5 w-3.5 shrink-0" />
                            <span className="font-medium text-foreground/80">{e.employer}</span>
                          </span>
                          {e.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{e.location}</span>}
                        </div>
                        {/* Dates & duration */}
                        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                          <Calendar className="h-3 w-3" />
                          <span>
                            {e.start_date}
                            {' — '}
                            {e.is_current
                              ? <span className="text-green-600 font-medium">Present</span>
                              : (e.end_date || '—')}
                          </span>
                          {duration && <span className="text-muted-foreground/60 text-[11px]">({duration})</span>}
                          {e.reason_for_leaving && !e.is_current && (
                            <span className="ml-1 text-[11px] text-muted-foreground/50">· Left: {e.reason_for_leaving}</span>
                          )}
                        </div>
                      </div>
                      {/* Action buttons */}
                      <div className="flex gap-1 shrink-0 items-center">
                        {hasDetail && (
                          <Button
                            type="button" variant="ghost" size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                            onClick={() => setExpExpanded(isOpen ? null : cardKey)}
                            data-testid={`button-expand-exp-${e.id}`}
                          >
                            {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          </Button>
                        )}
                        {isAdmin && (
                          <>
                            <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={() => openExpForm(e)} data-testid={`button-edit-exp-${e.id}`}><Edit className="h-3 w-3" /></Button>
                            <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600" onClick={() => e.id && deleteExp(e.id)} data-testid={`button-delete-exp-${e.id}`}><Trash2 className="h-3 w-3" /></Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expandable detail panel */}
                  {isOpen && (
                    <div className="border-t border-border/30 bg-muted/20 px-5 py-4 space-y-3 text-sm">
                      {e.description && (
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Key Responsibilities</p>
                          <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">{e.description}</p>
                        </div>
                      )}
                      {e.achievements && (
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Key Achievements</p>
                          <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">{e.achievements}</p>
                        </div>
                      )}
                      {(e.supervisor_name || e.reference_available) && (
                        <div className="flex flex-wrap gap-4 pt-1 border-t border-border/20">
                          {e.supervisor_name && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <UserCheck className="h-3.5 w-3.5" />
                              <span className="font-medium">Supervisor:</span> {e.supervisor_name}
                            </div>
                          )}
                          {e.reference_available && (
                            <div className="flex items-center gap-1.5 text-xs text-green-700">
                              <Phone className="h-3.5 w-3.5" />
                              <span className="font-medium">Reference available</span>
                              {e.reference_name && <span>· {e.reference_name}</span>}
                              {e.reference_contact && <span className="text-muted-foreground">({e.reference_contact})</span>}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}

export default memo(EmployeeEducationTab);
