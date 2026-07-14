import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Loader2, GraduationCap, Briefcase, Edit, Save, X, Calendar, Building, MapPin, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface EduEntry {
  id?: string;
  degree_level: string;
  institution: string;
  field_of_study?: string;
  graduation_year?: number | null;
  country?: string;
  grade?: string;
  notes?: string;
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

const SECTORS = [
  'Health', 'Education', 'Finance & Accounting', 'Humanitarian / WASH',
  'Food Security & Livelihoods', 'Protection', 'Shelter & NFI',
  'Logistics & Supply Chain', 'IT & Technology', 'HR & Administration',
  'Project Management', 'Monitoring & Evaluation', 'Legal & Compliance',
  'Communications & Media', 'Engineering & Infrastructure',
  'Research & Development', 'Other',
];

const EMPTY_EDU: EduEntry = {
  degree_level: 'bachelor', institution: '', field_of_study: '',
  graduation_year: null, country: '', grade: '',
};
const EMPTY_EXP: ExpEntry = {
  employer: '', job_title: '', start_date: '', end_date: '',
  is_current: false, description: '', location: '', sector: '',
};

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
    const load = async () => {
      setLoading(true);
      const [{ data: e }, { data: x }] = await Promise.all([
        supabase.from('hr_employee_education').select('*').eq('profile_id', userId).order('graduation_year', { ascending: false }),
        supabase.from('hr_employee_experience').select('*').eq('profile_id', userId).order('start_date', { ascending: false }),
      ]);
      setEdu(e || []);
      setExp(x || []);
      setLoading(false);
    };
    load();
  }, [userId]);

  const saveEdu = async () => {
    if (!eduForm) return;
    setEduSaving(true);
    try {
      const payload = { ...eduForm, profile_id: userId };
      if (eduForm.id) {
        const { error } = await supabase.from('hr_employee_education').update(payload).eq('id', eduForm.id);
        if (error) throw error;
        setEdu(p => p.map(r => r.id === eduForm.id ? { ...r, ...eduForm } : r));
      } else {
        const { data: inserted, error } = await supabase.from('hr_employee_education').insert(payload).select().single();
        if (error) throw error;
        setEdu(p => [inserted, ...p]);
      }
      setEduForm(null);
      toast({ title: 'Education entry saved' });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setEduSaving(false);
    }
  };

  const deleteEdu = async (id: string) => {
    const { error } = await supabase.from('hr_employee_education').delete().eq('id', id);
    if (error) { toast({ title: 'Delete failed', description: error.message, variant: 'destructive' }); return; }
    setEdu(p => p.filter(r => r.id !== id));
    toast({ title: 'Entry deleted' });
  };

  const saveExp = async () => {
    if (!expForm) return;
    setExpSaving(true);
    try {
      const payload = { ...expForm, profile_id: userId, end_date: expForm.is_current ? null : expForm.end_date || null };
      if (expForm.id) {
        const { error } = await supabase.from('hr_employee_experience').update(payload).eq('id', expForm.id);
        if (error) throw error;
        setExp(p => p.map(r => r.id === expForm.id ? { ...r, ...expForm } : r));
      } else {
        const { data: inserted, error } = await supabase.from('hr_employee_experience').insert(payload).select().single();
        if (error) throw error;
        setExp(p => [inserted, ...p]);
      }
      setExpForm(null);
      toast({ title: 'Experience entry saved' });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setExpSaving(false);
    }
  };

  const deleteExp = async (id: string) => {
    const { error } = await supabase.from('hr_employee_experience').delete().eq('id', id);
    if (error) { toast({ title: 'Delete failed', description: error.message, variant: 'destructive' }); return; }
    setExp(p => p.filter(r => r.id !== id));
    toast({ title: 'Entry deleted' });
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-8">

      {/* ── Education ─────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-base flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-primary" /> Education History
            </h3>
            <p className="text-xs text-muted-foreground">Degrees, diplomas, and academic credentials</p>
          </div>
          {isAdmin && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEduForm({ ...EMPTY_EDU })} data-testid="button-add-education">
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          )}
        </div>

        {eduForm && (
          <div className="border rounded-xl p-4 mb-4 bg-muted/10 space-y-3">
            <h4 className="text-sm font-semibold">{eduForm.id ? 'Edit' : 'New'} Education Entry</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Degree Level *</label>
                <Select value={eduForm.degree_level} onValueChange={v => setEduForm(p => p ? { ...p, degree_level: v } : p)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(DEGREE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Institution *</label>
                <Input value={eduForm.institution} onChange={e => setEduForm(p => p ? { ...p, institution: e.target.value } : p)} placeholder="University / School name" className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Field of Study</label>
                <Input value={eduForm.field_of_study || ''} onChange={e => setEduForm(p => p ? { ...p, field_of_study: e.target.value } : p)} placeholder="e.g. Computer Science" className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Graduation Year</label>
                <Input type="number" min="1950" max="2099" value={eduForm.graduation_year || ''} onChange={e => setEduForm(p => p ? { ...p, graduation_year: e.target.value ? parseInt(e.target.value) : null } : p)} placeholder="YYYY" className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Country</label>
                <Input value={eduForm.country || ''} onChange={e => setEduForm(p => p ? { ...p, country: e.target.value } : p)} placeholder="Country" className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Grade / GPA</label>
                <Input value={eduForm.grade || ''} onChange={e => setEduForm(p => p ? { ...p, grade: e.target.value } : p)} placeholder="e.g. 3.8 / 4.0 or Distinction" className="h-9 text-sm" />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={saveEdu} disabled={eduSaving || !eduForm.institution} className="gap-1.5">
                {eduSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEduForm(null)}><X className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {edu.length === 0 && !eduForm && (
            <div className="text-center py-8 text-muted-foreground text-sm border rounded-xl border-dashed bg-muted/5">
              No education history added yet.
            </div>
          )}
          {edu.map(e => (
            <div key={e.id} className="flex items-start gap-3 p-4 rounded-xl border border-border/40 bg-background hover:border-border/70 transition-colors">
              <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                <GraduationCap className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{e.institution}</span>
                  <Badge variant="secondary" className="text-xs">{DEGREE_LABELS[e.degree_level] || e.degree_level}</Badge>
                  {e.graduation_year && <span className="text-xs text-muted-foreground flex items-center gap-0.5"><Calendar className="h-3 w-3" /> {e.graduation_year}</span>}
                </div>
                {e.field_of_study && <p className="text-sm text-muted-foreground mt-0.5">{e.field_of_study}{e.country ? ` • ${e.country}` : ''}</p>}
                {e.grade && <p className="text-xs text-muted-foreground mt-0.5">Grade: {e.grade}</p>}
              </div>
              {isAdmin && (
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEduForm({ ...e })} data-testid={`button-edit-edu-${e.id}`}><Edit className="h-3 w-3" /></Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600" onClick={() => e.id && deleteEdu(e.id)} data-testid={`button-delete-edu-${e.id}`}><Trash2 className="h-3 w-3" /></Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Work Experience ────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-base flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-primary" /> Employment History
            </h3>
            <p className="text-xs text-muted-foreground">Previous and current employment positions</p>
          </div>
          {isAdmin && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setExpForm({ ...EMPTY_EXP })} data-testid="button-add-experience">
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          )}
        </div>

        {expForm && (
          <div className="border rounded-xl p-4 mb-4 bg-muted/10 space-y-3">
            <h4 className="text-sm font-semibold">{expForm.id ? 'Edit' : 'New'} Experience Entry</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Employer *</label>
                <Input value={expForm.employer} onChange={e => setExpForm(p => p ? { ...p, employer: e.target.value } : p)} placeholder="Organization name" className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Job Title *</label>
                <Input value={expForm.job_title} onChange={e => setExpForm(p => p ? { ...p, job_title: e.target.value } : p)} placeholder="Position / Role" className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Experience Area / Sector</label>
                <Select value={expForm.sector || ''} onValueChange={v => setExpForm(p => p ? { ...p, sector: v } : p)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select sector…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {SECTORS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Location</label>
                <Input value={expForm.location || ''} onChange={e => setExpForm(p => p ? { ...p, location: e.target.value } : p)} placeholder="City, Country" className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Start Date *</label>
                <Input type="date" value={expForm.start_date} onChange={e => setExpForm(p => p ? { ...p, start_date: e.target.value } : p)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">End Date</label>
                <Input type="date" value={expForm.end_date || ''} disabled={expForm.is_current} onChange={e => setExpForm(p => p ? { ...p, end_date: e.target.value } : p)} className="h-9 text-sm disabled:opacity-40" />
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer mt-1">
                  <input type="checkbox" checked={expForm.is_current} onChange={e => setExpForm(p => p ? { ...p, is_current: e.target.checked, end_date: e.target.checked ? '' : p.end_date } : p)} className="rounded" />
                  Currently working here
                </label>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs text-muted-foreground">Description</label>
                <textarea value={expForm.description || ''} onChange={e => setExpForm(p => p ? { ...p, description: e.target.value } : p)} placeholder="Key responsibilities and achievements" rows={3} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={saveExp} disabled={expSaving || !expForm.employer || !expForm.job_title || !expForm.start_date} className="gap-1.5">
                {expSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setExpForm(null)}><X className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {exp.length === 0 && !expForm && (
            <div className="text-center py-8 text-muted-foreground text-sm border rounded-xl border-dashed bg-muted/5">
              No employment history added yet.
            </div>
          )}
          {exp.map(e => (
            <div key={e.id} className="flex items-start gap-3 p-4 rounded-xl border border-border/40 bg-background hover:border-border/70 transition-colors">
              <div className="p-2 rounded-lg bg-blue-500/10 shrink-0">
                <Briefcase className="h-4 w-4 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{e.job_title}</span>
                  {e.is_current && <Badge className="text-xs bg-green-100 text-green-800 border-green-200">Current</Badge>}
                  {e.sector && e.sector !== 'none' && (
                    <Badge variant="outline" className="text-xs gap-1">
                      <Tag className="h-2.5 w-2.5" />{e.sector}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1">
                  <Building className="h-3 w-3" /> {e.employer}
                  {e.location && <><MapPin className="h-3 w-3 ml-1" /> {e.location}</>}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {e.start_date} — {e.is_current ? 'Present' : (e.end_date || 'N/A')}
                </p>
                {e.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{e.description}</p>}
              </div>
              {isAdmin && (
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setExpForm({ ...e })} data-testid={`button-edit-exp-${e.id}`}><Edit className="h-3 w-3" /></Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600" onClick={() => e.id && deleteExp(e.id)} data-testid={`button-delete-exp-${e.id}`}><Trash2 className="h-3 w-3" /></Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
