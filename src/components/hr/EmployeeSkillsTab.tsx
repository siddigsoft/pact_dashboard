import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Loader2, Zap, Globe, Users, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Skill { id?: string; skill_name: string; skill_level?: string; category?: string; }
interface Lang  { id?: string; language: string; proficiency?: string; }
interface Ref   { id?: string; ref_name: string; ref_title?: string; organization?: string; email?: string; phone?: string; relationship?: string; notes?: string; }

const SKILL_LEVELS = ['beginner','intermediate','advanced','expert'];
const PROFICIENCY  = ['basic','conversational','fluent','native'];
const SKILL_LEVEL_COLOR: Record<string, string> = {
  beginner: 'bg-gray-100 text-gray-700',
  intermediate: 'bg-blue-100 text-blue-700',
  advanced: 'bg-purple-100 text-purple-700',
  expert: 'bg-amber-100 text-amber-800',
};
const PROF_COLOR: Record<string, string> = {
  basic: 'bg-gray-100 text-gray-700',
  conversational: 'bg-blue-100 text-blue-700',
  fluent: 'bg-green-100 text-green-700',
  native: 'bg-emerald-100 text-emerald-800',
};

export default function EmployeeSkillsTab({ userId, isAdmin }: { userId: string; isAdmin: boolean }) {
  const { toast } = useToast();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [langs,  setLangs]  = useState<Lang[]>([]);
  const [refs,   setRefs]   = useState<Ref[]>([]);
  const [loading, setLoading] = useState(true);

  const [skillForm, setSkillForm] = useState<Skill | null>(null);
  const [langForm,  setLangForm]  = useState<Lang | null>(null);
  const [refForm,   setRefForm]   = useState<Ref | null>(null);
  const [saving, setSaving] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [{ data: sk }, { data: la }, { data: re }] = await Promise.all([
        supabase.from('hr_employee_skills').select('*').eq('profile_id', userId),
        supabase.from('hr_employee_languages').select('*').eq('profile_id', userId),
        supabase.from('hr_employee_references').select('*').eq('profile_id', userId),
      ]);
      setSkills(sk || []);
      setLangs(la || []);
      setRefs(re || []);
      setLoading(false);
    };
    load();
  }, [userId]);

  const saveSkill = async () => {
    if (!skillForm?.skill_name) return;
    setSaving('skill');
    try {
      const payload = { ...skillForm, profile_id: userId };
      if (skillForm.id) {
        const { error } = await supabase.from('hr_employee_skills').update(payload).eq('id', skillForm.id);
        if (error) throw error;
        setSkills(p => p.map(s => s.id === skillForm.id ? { ...s, ...skillForm } : s));
      } else {
        const { data: ins, error } = await supabase.from('hr_employee_skills').insert(payload).select().single();
        if (error) throw error;
        setSkills(p => [...p, ins]);
      }
      setSkillForm(null);
      toast({ title: 'Skill saved' });
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    } finally { setSaving(''); }
  };

  const deleteSkill = async (id?: string) => {
    if (!id) return;
    const { error } = await supabase.from('hr_employee_skills').delete().eq('id', id);
    if (error) { toast({ title: 'Delete failed', description: error.message, variant: 'destructive' }); return; }
    setSkills(p => p.filter(s => s.id !== id));
  };

  const saveLang = async () => {
    if (!langForm?.language) return;
    setSaving('lang');
    try {
      const payload = { ...langForm, profile_id: userId };
      if (langForm.id) {
        const { error } = await supabase.from('hr_employee_languages').update(payload).eq('id', langForm.id);
        if (error) throw error;
        setLangs(p => p.map(l => l.id === langForm.id ? { ...l, ...langForm } : l));
      } else {
        const { data: ins, error } = await supabase.from('hr_employee_languages').insert(payload).select().single();
        if (error) throw error;
        setLangs(p => [...p, ins]);
      }
      setLangForm(null);
      toast({ title: 'Language saved' });
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    } finally { setSaving(''); }
  };

  const deleteLang = async (id?: string) => {
    if (!id) return;
    const { error } = await supabase.from('hr_employee_languages').delete().eq('id', id);
    if (error) { toast({ title: 'Delete failed', description: error.message, variant: 'destructive' }); return; }
    setLangs(p => p.filter(l => l.id !== id));
  };

  const saveRef = async () => {
    if (!refForm?.ref_name) return;
    setSaving('ref');
    try {
      const payload = { ...refForm, profile_id: userId };
      if (refForm.id) {
        const { error } = await supabase.from('hr_employee_references').update(payload).eq('id', refForm.id);
        if (error) throw error;
        setRefs(p => p.map(r => r.id === refForm.id ? { ...r, ...refForm } : r));
      } else {
        const { data: ins, error } = await supabase.from('hr_employee_references').insert(payload).select().single();
        if (error) throw error;
        setRefs(p => [...p, ins]);
      }
      setRefForm(null);
      toast({ title: 'Reference saved' });
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    } finally { setSaving(''); }
  };

  const deleteRef = async (id?: string) => {
    if (!id) return;
    const { error } = await supabase.from('hr_employee_references').delete().eq('id', id);
    if (error) { toast({ title: 'Delete failed', description: error.message, variant: 'destructive' }); return; }
    setRefs(p => p.filter(r => r.id !== id));
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-8">

      {/* ── Skills ──────────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-base flex items-center gap-2"><Zap className="h-4 w-4 text-amber-500" /> Skills</h3>
            <p className="text-xs text-muted-foreground">Technical and professional competencies</p>
          </div>
          {isAdmin && <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setSkillForm({ skill_name: '', skill_level: 'intermediate', category: '' })} data-testid="button-add-skill"><Plus className="h-3.5 w-3.5" /> Add</Button>}
        </div>

        {skillForm && (
          <div className="border rounded-xl p-4 mb-4 bg-muted/10 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1 sm:col-span-1">
              <label className="text-xs text-muted-foreground">Skill Name *</label>
              <Input value={skillForm.skill_name} onChange={e => setSkillForm(p => p ? { ...p, skill_name: e.target.value } : p)} placeholder="e.g. Python, Project Management" className="h-9 text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Level</label>
              <Select value={skillForm.skill_level || ''} onValueChange={v => setSkillForm(p => p ? { ...p, skill_level: v } : p)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Level" /></SelectTrigger>
                <SelectContent>{SKILL_LEVELS.map(l => <SelectItem key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Category</label>
              <Input value={skillForm.category || ''} onChange={e => setSkillForm(p => p ? { ...p, category: e.target.value } : p)} placeholder="e.g. Technical, Soft Skills" className="h-9 text-sm" />
            </div>
            <div className="sm:col-span-3 flex gap-2">
              <Button size="sm" onClick={saveSkill} disabled={saving === 'skill' || !skillForm.skill_name} className="gap-1.5">
                {saving === 'skill' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSkillForm(null)}><X className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {skills.length === 0 && !skillForm && <p className="text-sm text-muted-foreground italic py-2">No skills added yet.</p>}
          {skills.map(s => (
            <div key={s.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/50 bg-background text-sm hover:border-border transition-colors">
              <span className="font-medium">{s.skill_name}</span>
              {s.skill_level && <Badge className={`text-[10px] px-1.5 py-0 ${SKILL_LEVEL_COLOR[s.skill_level] || 'bg-gray-100 text-gray-700'}`}>{s.skill_level}</Badge>}
              {isAdmin && <button onClick={() => deleteSkill(s.id)} className="ml-0.5 text-muted-foreground hover:text-red-600 transition-colors" data-testid={`button-delete-skill-${s.id}`}><X className="h-3 w-3" /></button>}
            </div>
          ))}
        </div>
      </div>

      {/* ── Languages ────────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-base flex items-center gap-2"><Globe className="h-4 w-4 text-blue-500" /> Languages</h3>
            <p className="text-xs text-muted-foreground">Spoken and written language proficiency</p>
          </div>
          {isAdmin && <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setLangForm({ language: '', proficiency: 'fluent' })} data-testid="button-add-language"><Plus className="h-3.5 w-3.5" /> Add</Button>}
        </div>

        {langForm && (
          <div className="border rounded-xl p-4 mb-4 bg-muted/10 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Language *</label>
              <Input value={langForm.language} onChange={e => setLangForm(p => p ? { ...p, language: e.target.value } : p)} placeholder="e.g. Arabic, English" className="h-9 text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Proficiency</label>
              <Select value={langForm.proficiency || ''} onValueChange={v => setLangForm(p => p ? { ...p, proficiency: v } : p)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Proficiency" /></SelectTrigger>
                <SelectContent>{PROFICIENCY.map(l => <SelectItem key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2 flex gap-2">
              <Button size="sm" onClick={saveLang} disabled={saving === 'lang' || !langForm.language} className="gap-1.5">
                {saving === 'lang' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setLangForm(null)}><X className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {langs.length === 0 && !langForm && <p className="text-sm text-muted-foreground italic py-2">No languages added yet.</p>}
          {langs.map(l => (
            <div key={l.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/50 bg-background text-sm hover:border-border transition-colors">
              <Globe className="h-3 w-3 text-blue-500" />
              <span className="font-medium">{l.language}</span>
              {l.proficiency && <Badge className={`text-[10px] px-1.5 py-0 ${PROF_COLOR[l.proficiency] || 'bg-gray-100 text-gray-700'}`}>{l.proficiency}</Badge>}
              {isAdmin && <button onClick={() => deleteLang(l.id)} className="ml-0.5 text-muted-foreground hover:text-red-600 transition-colors" data-testid={`button-delete-lang-${l.id}`}><X className="h-3 w-3" /></button>}
            </div>
          ))}
        </div>
      </div>

      {/* ── References ───────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-base flex items-center gap-2"><Users className="h-4 w-4 text-green-600" /> References</h3>
            <p className="text-xs text-muted-foreground">Professional references and contacts</p>
          </div>
          {isAdmin && <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setRefForm({ ref_name: '', ref_title: '', organization: '', email: '', phone: '', relationship: '', notes: '' })} data-testid="button-add-reference"><Plus className="h-3.5 w-3.5" /> Add</Button>}
        </div>

        {refForm && (
          <div className="border rounded-xl p-4 mb-4 bg-muted/10 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { key: 'ref_name',      label: 'Full Name *',     placeholder: "Referee's name" },
                { key: 'ref_title',     label: 'Job Title',        placeholder: "e.g. Director" },
                { key: 'organization',  label: 'Organization',     placeholder: "Company / NGO" },
                { key: 'relationship',  label: 'Relationship',     placeholder: "e.g. Former Manager" },
                { key: 'email',         label: 'Email',            placeholder: 'email@example.com' },
                { key: 'phone',         label: 'Phone',            placeholder: '+249 ...' },
              ].map(f => (
                <div key={f.key} className="space-y-1">
                  <label className="text-xs text-muted-foreground">{f.label}</label>
                  <Input value={(refForm as any)[f.key] || ''} onChange={e => setRefForm(p => p ? { ...p, [f.key]: e.target.value } : p)} placeholder={f.placeholder} className="h-9 text-sm" />
                </div>
              ))}
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs text-muted-foreground">Notes</label>
                <Input value={refForm.notes || ''} onChange={e => setRefForm(p => p ? { ...p, notes: e.target.value } : p)} placeholder="Additional notes" className="h-9 text-sm" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={saveRef} disabled={saving === 'ref' || !refForm.ref_name} className="gap-1.5">
                {saving === 'ref' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRefForm(null)}><X className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {refs.length === 0 && !refForm && <p className="text-sm text-muted-foreground italic py-2">No references added yet.</p>}
          {refs.map(r => (
            <div key={r.id} className="flex items-start gap-3 p-4 rounded-xl border border-border/40 bg-background hover:border-border/70 transition-colors">
              <div className="p-2 rounded-lg bg-green-50 shrink-0"><Users className="h-4 w-4 text-green-600" /></div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{r.ref_name}</p>
                {(r.ref_title || r.organization) && (
                  <p className="text-xs text-muted-foreground">{[r.ref_title, r.organization].filter(Boolean).join(' · ')}</p>
                )}
                <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                  {r.relationship && <span className="italic">{r.relationship}</span>}
                  {r.email && <span>{r.email}</span>}
                  {r.phone && <span>{r.phone}</span>}
                </div>
                {r.notes && <p className="text-xs text-muted-foreground mt-0.5 italic">{r.notes}</p>}
              </div>
              {isAdmin && (
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setRefForm({ ...r })} data-testid={`button-edit-ref-${r.id}`}><Zap className="h-3 w-3" /></Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600" onClick={() => deleteRef(r.id)} data-testid={`button-delete-ref-${r.id}`}><Trash2 className="h-3 w-3" /></Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
