import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Briefcase, Plus, Loader2, Users, Star, Trash2, Edit2, Search, FileDown } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { NotificationTriggerService } from '@/services/NotificationTriggerService';
import * as XLSX from 'xlsx';

interface JobPosting {
  id: string; title: string; department_id: string | null; employment_type: string;
  status: 'open' | 'on_hold' | 'closed'; headcount_needed: number; description: string | null;
  requirements: string | null; opened_at: string; closed_at: string | null;
}
interface Candidate {
  id: string; job_posting_id: string; full_name: string; email: string | null; phone: string | null;
  resume_url: string | null; source: string | null;
  stage: 'applied' | 'screening' | 'interview' | 'offer' | 'hired' | 'rejected';
  rating: number | null; interview_date: string | null; interviewer_id: string | null;
  notes: string | null; applied_at: string;
}
interface Dept { id: string; name: string; }
interface Profile { id: string; full_name: string; }

const STAGE_CFG: Record<Candidate['stage'], { label: string; class: string }> = {
  applied:   { label: 'Applied',    class: 'bg-gray-100 text-gray-700 dark:bg-gray-800' },
  screening: { label: 'Screening',  class: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40' },
  interview: { label: 'Interview',  class: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40' },
  offer:     { label: 'Offer',      class: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40' },
  hired:     { label: 'Hired',      class: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40' },
  rejected:  { label: 'Rejected',   class: 'bg-red-100 text-red-700 dark:bg-red-900/40' },
};
const STAGES: Candidate['stage'][] = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'];

const BLANK_JOB = { title: '', department_id: '', employment_type: 'full_time', status: 'open' as JobPosting['status'], headcount_needed: '1', description: '', requirements: '' };
const BLANK_CANDIDATE = { full_name: '', email: '', phone: '', resume_url: '', source: '', stage: 'applied' as Candidate['stage'], interview_date: '', interviewer_id: '', notes: '' };

export default function Recruitment() {
  const { currentUser } = useAppContext();
  const { hasAnyRole } = useAuthorization();
  const { toast } = useToast();
  const isAdmin = hasAnyRole(['super_admin', 'admin', 'hr', 'hr_manager']);

  const [postings, setPostings] = useState<JobPosting[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedPosting, setSelectedPosting] = useState<string | null>(null);
  const [jobDialogOpen, setJobDialogOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<JobPosting | null>(null);
  const [jobForm, setJobForm] = useState({ ...BLANK_JOB });
  const [candDialogOpen, setCandDialogOpen] = useState(false);
  const [editingCand, setEditingCand] = useState<Candidate | null>(null);
  const [candForm, setCandForm] = useState({ ...BLANK_CANDIDATE });
  const [missingTable, setMissingTable] = useState(false);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [jobsRes, candRes, deptRes, profRes] = await Promise.all([
      supabase.from('hr_job_postings' as any).select('*').order('opened_at', { ascending: false }),
      supabase.from('hr_candidates' as any).select('*').order('applied_at', { ascending: false }),
      supabase.from('departments').select('id, name').order('name'),
      supabase.from('profiles').select('id, full_name').order('full_name'),
    ]);
    if (jobsRes.error?.code === '42P01') { setMissingTable(true); setLoading(false); return; }
    if (jobsRes.data) setPostings(jobsRes.data as unknown as JobPosting[]);
    if (candRes.data) setCandidates(candRes.data as unknown as Candidate[]);
    if (deptRes.data) setDepts(deptRes.data as Dept[]);
    if (profRes.data) setProfiles(profRes.data as Profile[]);
    setLoading(false);
  }

  const filteredPostings = useMemo(() => postings.filter(p => p.title.toLowerCase().includes(search.toLowerCase())), [postings, search]);
  const candidatesFor = (jobId: string) => candidates.filter(c => c.job_posting_id === jobId);

  function openNewJob() { setEditingJob(null); setJobForm({ ...BLANK_JOB }); setJobDialogOpen(true); }
  function openEditJob(p: JobPosting) {
    setEditingJob(p);
    setJobForm({
      title: p.title, department_id: p.department_id ?? '', employment_type: p.employment_type,
      status: p.status, headcount_needed: String(p.headcount_needed), description: p.description ?? '', requirements: p.requirements ?? '',
    });
    setJobDialogOpen(true);
  }

  async function saveJob() {
    if (!jobForm.title.trim()) { toast({ title: 'Title is required', variant: 'destructive' }); return; }
    setSaving(true);
    const payload: any = {
      title: jobForm.title.trim(), department_id: jobForm.department_id || null,
      employment_type: jobForm.employment_type, status: jobForm.status,
      headcount_needed: parseInt(jobForm.headcount_needed, 10) || 1,
      description: jobForm.description || null, requirements: jobForm.requirements || null,
      closed_at: jobForm.status === 'closed' ? new Date().toISOString().slice(0, 10) : null,
    };
    const { error } = editingJob
      ? await supabase.from('hr_job_postings' as any).update(payload).eq('id', editingJob.id)
      : await supabase.from('hr_job_postings' as any).insert({ ...payload, created_by: currentUser?.id ?? null });
    setSaving(false);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { toast({ title: editingJob ? 'Posting updated' : 'Posting created' }); setJobDialogOpen(false); fetchAll(); }
  }

  async function deleteJob(p: JobPosting) {
    if (!confirm(`Delete posting "${p.title}"? This also removes its candidates.`)) return;
    const { error } = await supabase.from('hr_job_postings' as any).delete().eq('id', p.id);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Posting deleted' }); if (selectedPosting === p.id) setSelectedPosting(null); fetchAll(); }
  }

  function openNewCandidate() { setEditingCand(null); setCandForm({ ...BLANK_CANDIDATE }); setCandDialogOpen(true); }
  function openEditCandidate(c: Candidate) {
    setEditingCand(c);
    setCandForm({
      full_name: c.full_name, email: c.email ?? '', phone: c.phone ?? '', resume_url: c.resume_url ?? '',
      source: c.source ?? '', stage: c.stage, interview_date: c.interview_date ? c.interview_date.slice(0, 16) : '',
      interviewer_id: c.interviewer_id ?? '', notes: c.notes ?? '',
    });
    setCandDialogOpen(true);
  }

  async function saveCandidate() {
    if (!selectedPosting) return;
    if (!candForm.full_name.trim()) { toast({ title: 'Candidate name is required', variant: 'destructive' }); return; }
    setSaving(true);
    const payload: any = {
      job_posting_id: selectedPosting, full_name: candForm.full_name.trim(), email: candForm.email || null,
      phone: candForm.phone || null, resume_url: candForm.resume_url || null, source: candForm.source || null,
      stage: candForm.stage, interview_date: candForm.interview_date ? new Date(candForm.interview_date).toISOString() : null,
      interviewer_id: candForm.interviewer_id || null, notes: candForm.notes || null,
    };
    const { error } = editingCand
      ? await supabase.from('hr_candidates' as any).update(payload).eq('id', editingCand.id)
      : await supabase.from('hr_candidates' as any).insert({ ...payload, created_by: currentUser?.id ?? null });
    setSaving(false);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: editingCand ? 'Candidate updated' : 'Candidate added' });
    setCandDialogOpen(false);
    if (payload.interviewer_id && payload.interview_date && payload.interviewer_id !== editingCand?.interviewer_id) {
      try {
        await NotificationTriggerService.send({
          userId: payload.interviewer_id,
          title: 'Interview Scheduled',
          message: `You have been scheduled to interview ${payload.full_name} on ${format(new Date(payload.interview_date), 'MMM d, yyyy HH:mm')}.`,
          type: 'info',
          category: 'assignments',
          priority: 'high',
          link: '/recruitment',
        });
      } catch (e) { console.warn('[Recruitment] interview notification failed:', e); }
    }
    fetchAll();
  }

  async function deleteCandidate(c: Candidate) {
    if (!confirm(`Remove candidate "${c.full_name}"?`)) return;
    const { error } = await supabase.from('hr_candidates' as any).delete().eq('id', c.id);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Candidate removed' }); fetchAll(); }
  }

  async function quickSetStage(c: Candidate, stage: Candidate['stage']) {
    const { error } = await supabase.from('hr_candidates' as any).update({ stage }).eq('id', c.id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    if (stage === 'hired') {
      try {
        await NotificationTriggerService.sendToRoles(['super_admin', 'admin', 'hr', 'hr_manager'], {
          title: 'Candidate Hired',
          message: `${c.full_name} has been marked as hired for "${postings.find(p => p.id === c.job_posting_id)?.title ?? 'a role'}". Start onboarding.`,
          type: 'success',
          category: 'team',
          priority: 'normal',
          link: '/recruitment',
        });
      } catch (e) { console.warn('[Recruitment] hired notification failed:', e); }
    }
    fetchAll();
  }

  function exportToExcel() {
    const rows = candidates.map(c => ({
      'Job Posting': postings.find(p => p.id === c.job_posting_id)?.title ?? '',
      'Candidate': c.full_name, Email: c.email ?? '', Phone: c.phone ?? '', Source: c.source ?? '',
      Stage: STAGE_CFG[c.stage].label, Rating: c.rating ?? '',
      'Interview Date': c.interview_date ? format(new Date(c.interview_date), 'yyyy-MM-dd HH:mm') : '',
      'Applied At': format(new Date(c.applied_at), 'yyyy-MM-dd'),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Candidates');
    XLSX.writeFile(wb, `Recruitment_Candidates_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  if (missingTable) {
    return (
      <Card className="border-dashed border-amber-300 bg-amber-50/50 dark:bg-amber-950/10">
        <CardContent className="py-10 text-center text-sm text-amber-700 dark:text-amber-400">
          Apply <code className="font-mono text-xs">supabase/migrations/20260705_hr_recruitment_disciplinary_benefits_headcount.sql</code> to enable Recruitment / ATS.
        </CardContent>
      </Card>
    );
  }

  const activePosting = postings.find(p => p.id === selectedPosting) ?? null;

  return (
    <div className="space-y-4" data-testid="page-recruitment">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search postings..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-postings" />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportToExcel} data-testid="button-export-candidates"><FileDown className="h-4 w-4 mr-1" />Export</Button>
          {isAdmin && <Button onClick={openNewJob} data-testid="button-new-posting"><Plus className="h-4 w-4 mr-1" />New Job Posting</Button>}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-1 space-y-2">
          {filteredPostings.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">No job postings yet.</p>}
          {filteredPostings.map(p => (
            <Card key={p.id} onClick={() => setSelectedPosting(p.id)} data-testid={`card-posting-${p.id}`}
              className={cn('cursor-pointer hover:border-primary/50 transition-colors', selectedPosting === p.id && 'border-primary ring-1 ring-primary/30')}>
              <CardContent className="py-3 px-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm">{p.title}</p>
                    <p className="text-xs text-muted-foreground">{depts.find(d => d.id === p.department_id)?.name ?? 'Unassigned dept'} · {p.employment_type.replace('_', ' ')}</p>
                  </div>
                  <Badge variant="outline" className={cn(p.status === 'open' && 'border-emerald-300 text-emerald-700', p.status === 'closed' && 'border-gray-300 text-gray-500', p.status === 'on_hold' && 'border-amber-300 text-amber-700')}>
                    {p.status.replace('_', ' ')}
                  </Badge>
                </div>
                <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                  <Users className="h-3 w-3" />{candidatesFor(p.id).length} candidate{candidatesFor(p.id).length === 1 ? '' : 's'} · needs {p.headcount_needed}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="md:col-span-2">
          {!activePosting ? (
            <Card className="h-full"><CardContent className="py-16 text-center text-sm text-muted-foreground">Select a job posting to view its candidate pipeline.</CardContent></Card>
          ) : (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-base flex items-center gap-2"><Briefcase className="h-4 w-4" />{activePosting.title}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">Opened {format(new Date(activePosting.opened_at), 'MMM d, yyyy')}</p>
                </div>
                <div className="flex gap-2">
                  {isAdmin && <Button size="sm" variant="outline" onClick={() => openEditJob(activePosting)} data-testid="button-edit-posting"><Edit2 className="h-3.5 w-3.5" /></Button>}
                  {isAdmin && <Button size="sm" variant="outline" className="text-red-600" onClick={() => deleteJob(activePosting)} data-testid="button-delete-posting"><Trash2 className="h-3.5 w-3.5" /></Button>}
                  {isAdmin && <Button size="sm" onClick={openNewCandidate} data-testid="button-add-candidate"><Plus className="h-3.5 w-3.5 mr-1" />Add Candidate</Button>}
                </div>
              </CardHeader>
              <CardContent>
                {activePosting.description && <p className="text-sm text-muted-foreground mb-4">{activePosting.description}</p>}
                <div className="space-y-2">
                  {candidatesFor(activePosting.id).length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">No candidates yet.</p>}
                  {candidatesFor(activePosting.id).map(c => (
                    <div key={c.id} className="border rounded-lg p-3 flex items-start justify-between gap-3" data-testid={`row-candidate-${c.id}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm">{c.full_name}</p>
                          {c.rating && <span className="flex items-center text-xs text-amber-600"><Star className="h-3 w-3 fill-amber-500 text-amber-500 mr-0.5" />{c.rating}</span>}
                        </div>
                        <p className="text-xs text-muted-foreground">{c.email} {c.phone ? `· ${c.phone}` : ''}</p>
                        {c.interview_date && <p className="text-xs text-muted-foreground mt-1">Interview: {format(new Date(c.interview_date), 'MMM d, yyyy HH:mm')}{c.interviewer_id ? ` with ${profiles.find(p => p.id === c.interviewer_id)?.full_name ?? ''}` : ''}</p>}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Select value={c.stage} onValueChange={(v) => quickSetStage(c, v as Candidate['stage'])} disabled={!isAdmin}>
                          <SelectTrigger className={cn('h-7 text-xs w-32', STAGE_CFG[c.stage].class)} data-testid={`select-stage-${c.id}`}><SelectValue /></SelectTrigger>
                          <SelectContent>{STAGES.map(s => <SelectItem key={s} value={s}>{STAGE_CFG[s].label}</SelectItem>)}</SelectContent>
                        </Select>
                        {isAdmin && (
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openEditCandidate(c)}><Edit2 className="h-3 w-3" /></Button>
                            <Button size="icon" variant="ghost" className="h-6 w-6 text-red-600" onClick={() => deleteCandidate(c)}><Trash2 className="h-3 w-3" /></Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={jobDialogOpen} onOpenChange={setJobDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingJob ? 'Edit Job Posting' : 'New Job Posting'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Title</Label><Input value={jobForm.title} onChange={e => setJobForm(f => ({ ...f, title: e.target.value }))} data-testid="input-job-title" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Department</Label>
                <Select value={jobForm.department_id} onValueChange={v => setJobForm(f => ({ ...f, department_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{depts.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Employment Type</Label>
                <Select value={jobForm.employment_type} onValueChange={v => setJobForm(f => ({ ...f, employment_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full_time">Full time</SelectItem>
                    <SelectItem value="part_time">Part time</SelectItem>
                    <SelectItem value="contract">Contract</SelectItem>
                    <SelectItem value="intern">Intern</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Status</Label>
                <Select value={jobForm.status} onValueChange={v => setJobForm(f => ({ ...f, status: v as JobPosting['status'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="on_hold">On hold</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Headcount Needed</Label><Input type="number" min={1} value={jobForm.headcount_needed} onChange={e => setJobForm(f => ({ ...f, headcount_needed: e.target.value }))} /></div>
            </div>
            <div><Label>Description</Label><Textarea rows={3} value={jobForm.description} onChange={e => setJobForm(f => ({ ...f, description: e.target.value }))} /></div>
            <div><Label>Requirements</Label><Textarea rows={3} value={jobForm.requirements} onChange={e => setJobForm(f => ({ ...f, requirements: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button onClick={saveJob} disabled={saving} data-testid="button-save-posting">{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={candDialogOpen} onOpenChange={setCandDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingCand ? 'Edit Candidate' : 'Add Candidate'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Full Name</Label><Input value={candForm.full_name} onChange={e => setCandForm(f => ({ ...f, full_name: e.target.value }))} data-testid="input-candidate-name" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Email</Label><Input value={candForm.email} onChange={e => setCandForm(f => ({ ...f, email: e.target.value }))} /></div>
              <div><Label>Phone</Label><Input value={candForm.phone} onChange={e => setCandForm(f => ({ ...f, phone: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Resume URL</Label><Input value={candForm.resume_url} onChange={e => setCandForm(f => ({ ...f, resume_url: e.target.value }))} /></div>
              <div><Label>Source</Label><Input placeholder="Referral, LinkedIn..." value={candForm.source} onChange={e => setCandForm(f => ({ ...f, source: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Stage</Label>
                <Select value={candForm.stage} onValueChange={v => setCandForm(f => ({ ...f, stage: v as Candidate['stage'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STAGES.map(s => <SelectItem key={s} value={s}>{STAGE_CFG[s].label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Interview Date/Time</Label><Input type="datetime-local" value={candForm.interview_date} onChange={e => setCandForm(f => ({ ...f, interview_date: e.target.value }))} /></div>
            </div>
            <div>
              <Label>Interviewer</Label>
              <Select value={candForm.interviewer_id} onValueChange={v => setCandForm(f => ({ ...f, interviewer_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Notes</Label><Textarea rows={2} value={candForm.notes} onChange={e => setCandForm(f => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button onClick={saveCandidate} disabled={saving} data-testid="button-save-candidate">{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
