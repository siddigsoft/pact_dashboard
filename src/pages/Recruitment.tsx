import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { useToast } from '@/hooks/use-toast';
import { useOutlookCalendar } from '@/hooks/useOutlookCalendar';
import { EmailNotificationService } from '@/services/email-notification.service';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Briefcase, Plus, Loader2, Users, Star, Trash2, Edit2, Search, FileDown,
  CheckCircle2, XCircle, Clock, CalendarPlus, FileText, UserCheck, Link2,
  Video, Phone, MapPin, Award, ChevronRight, AlertTriangle, Mail, Eye,
  Settings2, GripVertical, X as XIcon,
} from 'lucide-react';
import { format, addMinutes } from 'date-fns';
import { cn } from '@/lib/utils';
import { NotificationTriggerService } from '@/services/NotificationTriggerService';
import { exportToExcel } from '@/utils/report-export';
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, Tooltip } from 'recharts';
import jsPDF from 'jspdf';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RubricCategory { id: string; label: string; }

interface JobPosting {
  id: string; title: string; department_id: string | null; employment_type: string;
  status: 'open' | 'on_hold' | 'closed'; headcount_needed: number;
  description: string | null; requirements: string | null;
  opened_at: string; closed_at: string | null; requisition_id: string | null;
  scoring_rubric: RubricCategory[] | null;
}
interface Candidate {
  id: string; job_posting_id: string; full_name: string; email: string | null;
  phone: string | null; resume_url: string | null; source: string | null;
  stage: 'applied' | 'screening' | 'interview' | 'offer' | 'hired' | 'rejected';
  rating: number | null; interview_date: string | null; interviewer_id: string | null;
  notes: string | null; applied_at: string;
  salary_offer: number | null; offer_currency: string | null;
  offer_start_date: string | null; offer_sent_at: string | null;
  linked_profile_id: string | null; onboarding_noted: boolean;
}
interface JobRequisition {
  id: string; title: string; department_id: string | null; hub_id: string | null;
  headcount: number; justification: string | null; salary_band: string | null;
  target_start_date: string | null;
  status: 'draft' | 'pending_manager' | 'pending_hr' | 'approved' | 'rejected' | 'filled';
  requested_by: string | null;
  manager_approved_at: string | null; manager_approved_by: string | null; manager_rejection_note: string | null;
  hr_approved_at: string | null; hr_approved_by: string | null; hr_rejection_note: string | null;
  linked_posting_id: string | null; created_at: string;
}
interface CandidateScore {
  id: string; candidate_id: string; interviewer_id: string;
  rubric_scores: Record<string, number>; overall_score: number | null; notes: string | null;
  submitted_at: string;
}
interface InterviewSlot {
  id: string; candidate_id: string; interviewer_ids: string[];
  scheduled_at: string; duration_minutes: number;
  interview_type: 'in_person' | 'video' | 'phone';
  location: string | null; meeting_link: string | null; notes: string | null;
  created_by: string | null; created_at: string;
}
interface Dept    { id: string; name: string; }
interface Hub     { id: string; name: string; }
interface Profile { id: string; full_name: string; email?: string | null; }

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGE_CFG: Record<Candidate['stage'], { label: string; class: string }> = {
  applied:   { label: 'Applied',   class: 'bg-gray-100 text-gray-700 dark:bg-gray-800' },
  screening: { label: 'Screening', class: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40' },
  interview: { label: 'Interview', class: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40' },
  offer:     { label: 'Offer',     class: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40' },
  hired:     { label: 'Hired',     class: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40' },
  rejected:  { label: 'Rejected',  class: 'bg-red-100 text-red-700 dark:bg-red-900/40' },
};
const STAGES: Candidate['stage'][] = ['applied','screening','interview','offer','hired','rejected'];

const JR_STATUS_CFG: Record<JobRequisition['status'], { label: string; class: string; icon: React.ReactNode }> = {
  draft:           { label: 'Draft',          class: 'border-gray-300 text-gray-600',       icon: <Edit2 className="h-3 w-3" /> },
  pending_manager: { label: 'Pending Manager', class: 'border-amber-300 text-amber-700',    icon: <Clock className="h-3 w-3" /> },
  pending_hr:      { label: 'Pending HR',      class: 'border-blue-300 text-blue-700',      icon: <Clock className="h-3 w-3" /> },
  approved:        { label: 'Approved',        class: 'border-emerald-300 text-emerald-700',icon: <CheckCircle2 className="h-3 w-3" /> },
  rejected:        { label: 'Rejected',        class: 'border-red-300 text-red-600',        icon: <XCircle className="h-3 w-3" /> },
  filled:          { label: 'Filled',          class: 'border-teal-300 text-teal-700',      icon: <UserCheck className="h-3 w-3" /> },
};

const DEFAULT_RUBRIC: RubricCategory[] = [
  { id: 'technical',      label: 'Technical Skills' },
  { id: 'communication',  label: 'Communication'    },
  { id: 'culture_fit',    label: 'Culture Fit'      },
  { id: 'experience',     label: 'Experience'       },
  { id: 'problem_solving',label: 'Problem Solving'  },
];

const BLANK_JOB = {
  title: '', department_id: '', employment_type: 'full_time',
  status: 'open' as JobPosting['status'], headcount_needed: '1', description: '', requirements: '',
};
const BLANK_CAND = {
  full_name: '', email: '', phone: '', resume_url: '', source: '',
  stage: 'applied' as Candidate['stage'], interview_date: '', interviewer_id: '', notes: '',
};
const BLANK_JR = {
  title: '', department_id: '', hub_id: '', headcount: '1',
  justification: '', salary_band: '', target_start_date: '',
};
const BLANK_SLOT = {
  scheduled_at: '', duration_minutes: '60',
  interview_type: 'video' as InterviewSlot['interview_type'],
  location: '', meeting_link: '', notes: '', interviewer_ids: [] as string[],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcOverall(scores: Record<string, number>): number {
  const vals = Object.values(scores).filter(v => v > 0);
  return vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10 : 0;
}

function buildOfferPdf(c: Candidate, posting: JobPosting, deptName: string): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const today = format(new Date(), 'MMMM d, yyyy');
  const margin = 25;
  let y = margin;

  doc.setFillColor(15, 32, 65);
  doc.rect(0, 0, 210, 18, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11); doc.setFont('helvetica', 'bold');
  doc.text('PACT COMMAND CENTER — CONFIDENTIAL OFFER LETTER', margin, 12);

  doc.setTextColor(30, 30, 30);
  y = 32;
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text(today, margin, y);

  y += 12;
  doc.setFontSize(11); doc.setFont('helvetica', 'bold');
  doc.text(c.full_name, margin, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  if (c.email) { y += 6; doc.text(c.email, margin, y); }

  y += 14;
  doc.setFontSize(13); doc.setFont('helvetica', 'bold');
  doc.text(`Offer of Employment: ${posting.title}`, margin, y);

  y += 10;
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text(`Dear ${c.full_name.split(' ')[0]},`, margin, y);

  y += 8;
  const intro = `We are delighted to offer you the position of ${posting.title} within the ${deptName} department at PACT Command Center. This offer reflects our confidence in your qualifications and our excitement about your potential contribution.`;
  const introLines = doc.splitTextToSize(intro, 160);
  doc.text(introLines, margin, y); y += introLines.length * 6;

  y += 8;
  doc.setFont('helvetica', 'bold'); doc.text('Position Details', margin, y);
  doc.setFont('helvetica', 'normal');
  const details: [string, string][] = [
    ['Position Title',   posting.title],
    ['Department',       deptName],
    ['Employment Type',  posting.employment_type.replace('_', ' ')],
    ...(c.offer_start_date ? [['Start Date', format(new Date(c.offer_start_date), 'MMMM d, yyyy')] as [string,string]] : []),
    ...(c.salary_offer    ? [['Monthly Salary', `${c.salary_offer.toLocaleString()} ${c.offer_currency ?? 'SDG'}`] as [string,string]] : []),
  ];
  details.forEach(([k, v]) => {
    y += 7;
    doc.setFont('helvetica', 'bold'); doc.text(`${k}:`, margin, y);
    doc.setFont('helvetica', 'normal'); doc.text(v, margin + 50, y);
  });

  y += 14;
  const conditions = 'This offer is contingent upon successful completion of standard pre-employment verification. Please confirm your acceptance within 7 days of this letter.';
  const condLines = doc.splitTextToSize(conditions, 160);
  doc.text(condLines, margin, y); y += condLines.length * 6;

  y += 14;
  doc.text('Sincerely,', margin, y);
  y += 14;
  doc.setFont('helvetica', 'bold'); doc.text('HR Department', margin, y);
  y += 6; doc.setFont('helvetica', 'normal'); doc.text('PACT Command Center', margin, y);

  doc.setDrawColor(200, 200, 200);
  doc.line(margin, 280, 210 - margin, 280);
  doc.setFontSize(8); doc.setTextColor(150, 150, 150);
  doc.text('This document is confidential and intended solely for the named recipient.', margin, 285);

  return doc;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Recruitment() {
  const { currentUser } = useAppContext();
  const { hasAnyRole } = useAuthorization();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { isConnected: outlookConnected, createEvent: createOutlookEvent } = useOutlookCalendar();
  const isAdmin   = hasAnyRole(['super_admin','admin','hr','hr_admin','hr_manager']);
  const isManager = hasAnyRole(['super_admin','admin','hr','hr_admin','hr_manager','manager']);

  // ── Data
  const [postings,    setPostings]    = useState<JobPosting[]>([]);
  const [candidates,  setCandidates]  = useState<Candidate[]>([]);
  const [requisitions,setRequisitions]= useState<JobRequisition[]>([]);
  const [scores,      setScores]      = useState<CandidateScore[]>([]);
  const [slots,       setSlots]       = useState<InterviewSlot[]>([]);
  const [depts,       setDepts]       = useState<Dept[]>([]);
  const [hubs,        setHubs]        = useState<Hub[]>([]);
  const [profiles,    setProfiles]    = useState<Profile[]>([]);

  // ── UI
  const [loading,         setLoading]         = useState(true);
  const [saving,          setSaving]          = useState(false);
  const [search,          setSearch]          = useState('');
  const [pageTab,         setPageTab]         = useState<'postings'|'requisitions'>('postings');
  const [selectedPosting, setSelectedPosting] = useState<string | null>(null);
  const [missingTable,    setMissingTable]    = useState(false);

  // Job posting dialog
  const [jobDialogOpen, setJobDialogOpen] = useState(false);
  const [editingJob,    setEditingJob]    = useState<JobPosting | null>(null);
  const [jobForm,       setJobForm]       = useState({ ...BLANK_JOB });

  // Rubric config dialog
  const [rubricDialogOpen,    setRubricDialogOpen]    = useState(false);
  const [rubricTargetPosting, setRubricTargetPosting] = useState<JobPosting | null>(null);
  const [rubricDraft,         setRubricDraft]         = useState<RubricCategory[]>([]);
  const [rubricNewLabel,      setRubricNewLabel]      = useState('');

  // Candidate add/edit dialog
  const [candDialogOpen, setCandDialogOpen] = useState(false);
  const [editingCand,    setEditingCand]    = useState<Candidate | null>(null);
  const [candForm,       setCandForm]       = useState({ ...BLANK_CAND });

  // Candidate detail dialog
  const [detailCand, setDetailCand] = useState<Candidate | null>(null);
  const [detailTab,  setDetailTab]  = useState('overview');

  // Scorecard
  const [myScores,   setMyScores]   = useState<Record<string, number>>({});
  const [scoreNotes, setScoreNotes] = useState('');
  const [savingScore,setSavingScore]= useState(false);

  // Interview scheduling
  const [slotDialogOpen, setSlotDialogOpen] = useState(false);
  const [slotCandId,     setSlotCandId]     = useState<string|null>(null);
  const [slotForm,       setSlotForm]       = useState({ ...BLANK_SLOT });

  // Offer preview
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);

  // JR dialogs
  const [jrDialogOpen,  setJrDialogOpen]  = useState(false);
  const [editingJr,     setEditingJr]     = useState<JobRequisition | null>(null);
  const [jrForm,        setJrForm]        = useState({ ...BLANK_JR });
  const [approveDialog, setApproveDialog] = useState<{jr: JobRequisition; action: 'approve'|'reject'; layer: 'manager'|'hr'}|null>(null);
  const [approveNote,   setApproveNote]   = useState('');
  const [savingApprove, setSavingApprove] = useState(false);

  // Hired dialog
  const [hiredDialog,    setHiredDialog]    = useState<Candidate|null>(null);
  const [hiredProfileId, setHiredProfileId] = useState('');

  // Calendar integrations
  const [googleCalConnected, setGoogleCalConnected] = useState(false);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [jobsRes, candRes, jrRes, scoresRes, slotsRes, deptRes, hubRes, profRes, integRes] = await Promise.all([
      supabase.from('hr_job_postings'     as any).select('*').order('opened_at', { ascending: false }),
      supabase.from('hr_candidates'       as any).select('*').order('applied_at', { ascending: false }),
      supabase.from('hr_job_requisitions' as any).select('*').order('created_at', { ascending: false }),
      supabase.from('hr_candidate_scores' as any).select('*'),
      supabase.from('hr_interview_slots'  as any).select('*').order('scheduled_at'),
      supabase.from('departments').select('id, name').order('name'),
      supabase.from('hubs').select('id, name').order('name'),
      supabase.from('profiles').select('id, full_name, email').order('full_name'),
      supabase.from('user_integrations' as any)
        .select('google_calendar_connected')
        .eq('user_id', currentUser?.id ?? '')
        .maybeSingle(),
    ]);
    if (jobsRes.error?.code === '42P01') { setMissingTable(true); setLoading(false); return; }
    if (jobsRes.data)   setPostings(jobsRes.data   as unknown as JobPosting[]);
    if (candRes.data)   setCandidates(candRes.data  as unknown as Candidate[]);
    if (jrRes.data)     setRequisitions(jrRes.data  as unknown as JobRequisition[]);
    if (scoresRes.data) setScores(scoresRes.data    as unknown as CandidateScore[]);
    if (slotsRes.data)  setSlots(slotsRes.data      as unknown as InterviewSlot[]);
    if (deptRes.data)   setDepts(deptRes.data  as Dept[]);
    if (hubRes.data)    setHubs(hubRes.data    as Hub[]);
    if (profRes.data)   setProfiles(profRes.data as Profile[]);
    if (integRes.data)  setGoogleCalConnected(!!(integRes.data as any)?.google_calendar_connected);
    setLoading(false);
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const filteredPostings = useMemo(() =>
    postings.filter(p => p.title.toLowerCase().includes(search.toLowerCase())), [postings, search]);
  const candidatesFor  = (jobId: string) => candidates.filter(c => c.job_posting_id === jobId);
  const candidateScores= (candId: string) => scores.filter(s => s.candidate_id === candId);
  const candidateSlots = (candId: string) => slots.filter(s => s.candidate_id === candId);
  const profileName    = (id: string | null) => profiles.find(p => p.id === id)?.full_name ?? '—';
  const profileEmail   = (id: string | null) => profiles.find(p => p.id === id)?.email ?? null;
  const deptName       = (id: string | null) => depts.find(d => d.id === id)?.name ?? '—';
  const hubName        = (id: string | null) => hubs.find(h => h.id === id)?.name  ?? '—';
  const activePosting  = postings.find(p => p.id === selectedPosting) ?? null;

  function getEffectiveRubric(posting: JobPosting | null): RubricCategory[] {
    if (!posting) return DEFAULT_RUBRIC;
    const custom = posting.scoring_rubric;
    return Array.isArray(custom) && custom.length > 0 ? custom : DEFAULT_RUBRIC;
  }

  // ── Job Posting CRUD ───────────────────────────────────────────────────────
  function openNewJob() { setEditingJob(null); setJobForm({ ...BLANK_JOB }); setJobDialogOpen(true); }
  function openEditJob(p: JobPosting) {
    setEditingJob(p);
    setJobForm({ title: p.title, department_id: p.department_id ?? '', employment_type: p.employment_type,
      status: p.status, headcount_needed: String(p.headcount_needed),
      description: p.description ?? '', requirements: p.requirements ?? '' });
    setJobDialogOpen(true);
  }
  async function saveJob() {
    if (!jobForm.title.trim()) { toast({ title: 'Title required', variant: 'destructive' }); return; }
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
    if (!confirm(`Delete posting "${p.title}"? This removes all candidates.`)) return;
    await supabase.from('hr_job_postings' as any).delete().eq('id', p.id);
    if (selectedPosting === p.id) setSelectedPosting(null);
    fetchAll();
  }

  // ── Rubric config ──────────────────────────────────────────────────────────
  function openRubricDialog(p: JobPosting) {
    setRubricTargetPosting(p);
    setRubricDraft(getEffectiveRubric(p).map(r => ({ ...r })));
    setRubricNewLabel('');
    setRubricDialogOpen(true);
  }
  function addRubricCategory() {
    const label = rubricNewLabel.trim();
    if (!label) return;
    const id = label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (rubricDraft.some(r => r.id === id)) { toast({ title: 'Category already exists', variant: 'destructive' }); return; }
    setRubricDraft(d => [...d, { id, label }]);
    setRubricNewLabel('');
  }
  async function saveRubric() {
    if (!rubricTargetPosting) return;
    const rubric = rubricDraft.length > 0 ? rubricDraft : null;
    await supabase.from('hr_job_postings' as any)
      .update({ scoring_rubric: rubric })
      .eq('id', rubricTargetPosting.id);
    toast({ title: 'Scoring rubric saved' });
    setRubricDialogOpen(false);
    fetchAll();
  }

  // ── Candidate CRUD ─────────────────────────────────────────────────────────
  function openNewCand() { setEditingCand(null); setCandForm({ ...BLANK_CAND }); setCandDialogOpen(true); }
  function openEditCand(c: Candidate) {
    setEditingCand(c);
    setCandForm({
      full_name: c.full_name, email: c.email ?? '', phone: c.phone ?? '',
      resume_url: c.resume_url ?? '', source: c.source ?? '', stage: c.stage,
      interview_date: c.interview_date ? c.interview_date.slice(0, 16) : '',
      interviewer_id: c.interviewer_id ?? '', notes: c.notes ?? '',
    });
    setCandDialogOpen(true);
  }
  async function saveCandidate() {
    if (!selectedPosting || !candForm.full_name.trim()) {
      toast({ title: 'Candidate name required', variant: 'destructive' }); return;
    }
    setSaving(true);
    const payload: any = {
      job_posting_id: selectedPosting, full_name: candForm.full_name.trim(),
      email: candForm.email || null, phone: candForm.phone || null,
      resume_url: candForm.resume_url || null, source: candForm.source || null,
      stage: candForm.stage,
      interview_date: candForm.interview_date ? new Date(candForm.interview_date).toISOString() : null,
      interviewer_id: candForm.interviewer_id || null, notes: candForm.notes || null,
    };
    const { error } = editingCand
      ? await supabase.from('hr_candidates' as any).update(payload).eq('id', editingCand.id)
      : await supabase.from('hr_candidates' as any).insert({ ...payload, created_by: currentUser?.id ?? null });
    setSaving(false);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    if (payload.interviewer_id && payload.interview_date && payload.interviewer_id !== editingCand?.interviewer_id) {
      try {
        await NotificationTriggerService.send({
          userId: payload.interviewer_id, title: 'Interview Scheduled',
          message: `You are scheduled to interview ${payload.full_name} on ${format(new Date(payload.interview_date), 'MMM d, yyyy HH:mm')}.`,
          type: 'info', category: 'assignments', priority: 'high', link: '/recruitment',
        });
      } catch (e) { console.warn('[Recruitment] interview notify failed:', e); }
    }
    toast({ title: editingCand ? 'Candidate updated' : 'Candidate added' });
    setCandDialogOpen(false); fetchAll();
  }
  async function deleteCandidate(c: Candidate) {
    if (!confirm(`Remove "${c.full_name}"?`)) return;
    await supabase.from('hr_candidates' as any).delete().eq('id', c.id);
    fetchAll();
  }

  // ── Stage quick-set + hired dialog ────────────────────────────────────────
  async function quickSetStage(c: Candidate, stage: Candidate['stage']) {
    if (stage === 'hired') { setHiredDialog(c); setHiredProfileId(c.linked_profile_id ?? ''); return; }
    await supabase.from('hr_candidates' as any).update({ stage }).eq('id', c.id);
    if (stage === 'offer') { setDetailCand({ ...c, stage }); setDetailTab('offer'); }
    fetchAll();
  }

  async function confirmHired() {
    if (!hiredDialog) return;
    setSaving(true);
    const posting = postings.find(p => p.id === hiredDialog.job_posting_id);

    // 1. Mark candidate as hired
    const update: any = { stage: 'hired', onboarding_noted: true };
    if (hiredProfileId) update.linked_profile_id = hiredProfileId;
    await supabase.from('hr_candidates' as any).update(update).eq('id', hiredDialog.id);

    // 2. Mark linked JR as 'filled' + sync headcount plan
    if (posting?.requisition_id) {
      const jr = requisitions.find(r => r.id === posting.requisition_id);
      await supabase.from('hr_job_requisitions' as any)
        .update({ status: 'filled' })
        .eq('id', posting.requisition_id)
        .in('status', ['approved']);

      // Increment the headcount plan counter so directors can see planned vs filled
      if (jr?.department_id) {
        try {
          await supabase.rpc('increment_headcount_filled' as any, {
            p_department_id:    jr.department_id,
            p_position_title:   jr.title,
            p_fiscal_year:      new Date().getFullYear(),
            p_hired_candidate:  hiredDialog.full_name,
            p_hired_start_date: hiredDialog.offer_start_date ?? null,
          });
        } catch (e) { console.warn('[Recruitment] headcount sync failed:', e); }
      }
    }

    // 3. Create onboarding record
    await supabase.from('hr_onboarding_records' as any).insert({
      candidate_id:        hiredDialog.id,
      profile_id:          hiredProfileId || null,
      full_name:           hiredDialog.full_name,
      job_title:           posting?.title ?? null,
      department_id:       posting?.department_id ?? null,
      expected_start_date: hiredDialog.offer_start_date ?? null,
      notes:               hiredProfileId ? 'Linked to existing profile' : 'New hire — profile setup required',
      created_by:          currentUser?.id ?? null,
    });

    // 4. Notify HR/admin
    try {
      await NotificationTriggerService.sendToRoles(['super_admin','admin','hr','hr_admin'], {
        title: 'Candidate Hired — Onboarding Required',
        message: `${hiredDialog.full_name} has been hired for "${posting?.title ?? 'a role'}". ${hiredProfileId ? 'Linked to existing profile.' : 'New hire — profile setup needed.'}`,
        type: 'success', category: 'team', priority: 'high', link: '/staff-onboarding',
      });
    } catch (e) { console.warn('[Recruitment] hired notify failed:', e); }

    setSaving(false);
    setHiredDialog(null);
    toast({ title: 'Candidate marked as Hired', description: 'Redirecting to Staff Onboarding…' });
    fetchAll();

    // 5. Navigate HR to Staff Onboarding
    setTimeout(() => navigate('/staff-onboarding'), 1200);
  }

  // ── Scoring ────────────────────────────────────────────────────────────────
  function openDetailForCand(c: Candidate, tab = 'overview') {
    setDetailCand(c);
    setDetailTab(tab);
    const existing = scores.find(s => s.candidate_id === c.id && s.interviewer_id === currentUser?.id);
    if (existing) { setMyScores(existing.rubric_scores ?? {}); setScoreNotes(existing.notes ?? ''); }
    else { setMyScores({}); setScoreNotes(''); }
  }
  async function submitScorecard() {
    if (!detailCand || !currentUser) return;
    setSavingScore(true);
    const overall = calcOverall(myScores);
    const existing = scores.find(s => s.candidate_id === detailCand.id && s.interviewer_id === currentUser.id);
    const payload = { candidate_id: detailCand.id, interviewer_id: currentUser.id,
      rubric_scores: myScores, overall_score: overall, notes: scoreNotes || null };
    const { error } = existing
      ? await supabase.from('hr_candidate_scores' as any).update(payload).eq('id', existing.id)
      : await supabase.from('hr_candidate_scores' as any).insert(payload);
    setSavingScore(false);
    if (error) toast({ title: 'Error saving scorecard', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Scorecard saved' }); fetchAll(); }
  }

  // ── Interview Slots ────────────────────────────────────────────────────────
  function openSlotDialog(candId: string) {
    setSlotCandId(candId);
    setSlotForm({ ...BLANK_SLOT });
    setSlotDialogOpen(true);
  }
  async function saveSlot() {
    if (!slotCandId || !slotForm.scheduled_at) {
      toast({ title: 'Date/time required', variant: 'destructive' }); return;
    }
    setSaving(true);
    const startDt = new Date(slotForm.scheduled_at);
    const durationMin = parseInt(slotForm.duration_minutes, 10) || 60;
    const endDt = addMinutes(startDt, durationMin);
    const payload: any = {
      candidate_id: slotCandId,
      interviewer_ids: slotForm.interviewer_ids,
      scheduled_at: startDt.toISOString(),
      duration_minutes: durationMin,
      interview_type: slotForm.interview_type,
      location: slotForm.location || null,
      meeting_link: slotForm.meeting_link || null,
      notes: slotForm.notes || null,
      created_by: currentUser?.id ?? null,
    };
    const { error } = await supabase.from('hr_interview_slots' as any).insert(payload);
    if (error) { setSaving(false); toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }

    const cand = candidates.find(c => c.id === slotCandId);
    const posting = cand ? postings.find(p => p.id === cand.job_posting_id) : null;
    const subjectLine = `Interview: ${cand?.full_name ?? 'Candidate'} — ${posting?.title ?? 'Position'}`;

    // Collect interviewer emails for calendar invite + in-app notifications
    const attendeeEmails: string[] = [];
    for (const uid of slotForm.interviewer_ids) {
      const email = profileEmail(uid);
      if (email) attendeeEmails.push(email);
      try {
        await NotificationTriggerService.send({
          userId: uid, title: 'Interview Scheduled',
          message: `You have an interview with ${cand?.full_name ?? 'a candidate'} on ${format(startDt, 'MMM d, yyyy HH:mm')} (${slotForm.interview_type.replace('_', ' ')}).`,
          type: 'info', category: 'assignments', priority: 'high', link: '/recruitment',
        });
      } catch (e) { console.warn('[Recruitment] slot notify failed:', e); }
    }

    // ── Calendar events (best-effort; run both providers in parallel) ─────────
    const calendarTasks: Promise<void>[] = [];

    if (outlookConnected) {
      calendarTasks.push(
        createOutlookEvent({
          subject: subjectLine,
          start: startDt.toISOString(),
          end:   endDt.toISOString(),
          location: slotForm.location || slotForm.meeting_link || undefined,
          body: slotForm.notes || `Interview with ${cand?.full_name ?? 'candidate'} for ${posting?.title ?? 'the position'}.`,
          attendeeEmails,
        }).catch(e => console.warn('[Recruitment] Outlook event creation failed:', e))
      );
    }

    if (googleCalConnected) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        calendarTasks.push(
          fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar-event`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`,
                apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
              },
              body: JSON.stringify({
                summary:        subjectLine,
                start:          startDt.toISOString(),
                end:            endDt.toISOString(),
                location:       slotForm.location || slotForm.meeting_link || undefined,
                description:    slotForm.notes || `Interview with ${cand?.full_name ?? 'candidate'} for ${posting?.title ?? 'the position'}.`,
                attendeeEmails,
              }),
            }
          )
            .then(async res => {
              if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                console.warn('[Recruitment] Google Calendar event failed:', err);
              }
            })
            .catch(e => console.warn('[Recruitment] Google Calendar event error:', e))
        );
      }
    }

    if (calendarTasks.length > 0) {
      await Promise.allSettled(calendarTasks);
      const providers: string[] = [];
      if (outlookConnected) providers.push('Outlook');
      if (googleCalConnected) providers.push('Google Calendar');
      toast({ title: 'Interview scheduled', description: `Calendar invite sent via ${providers.join(' & ')}.` });
    } else {
      toast({ title: 'Interview scheduled' });
    }

    setSaving(false);
    setSlotDialogOpen(false);
    fetchAll();
  }

  // ── Offer email send ───────────────────────────────────────────────────────
  async function sendOfferEmail(c: Candidate, posting: JobPosting | undefined) {
    if (!c.email || !posting) {
      toast({ title: 'Candidate has no email address', variant: 'destructive' }); return;
    }
    setSaving(true);
    const startDateStr = c.offer_start_date ? format(new Date(c.offer_start_date), 'MMMM d, yyyy') : 'to be confirmed';
    const salaryStr = c.salary_offer
      ? `${c.salary_offer.toLocaleString()} ${c.offer_currency ?? 'SDG'} per month`
      : 'as discussed';

    const html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
  <div style="background:#0f2041;color:#fff;padding:16px 24px;border-radius:4px 4px 0 0">
    <strong>PACT Command Center — Offer of Employment</strong>
  </div>
  <div style="padding:24px;border:1px solid #e5e7eb;border-top:none">
    <p>Dear ${c.full_name.split(' ')[0]},</p>
    <p>We are delighted to offer you the position of <strong>${posting.title}</strong> at PACT Command Center.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:6px;color:#6b7280;width:140px">Position</td><td style="padding:6px;font-weight:600">${posting.title}</td></tr>
      <tr style="background:#f9fafb"><td style="padding:6px;color:#6b7280">Start Date</td><td style="padding:6px;font-weight:600">${startDateStr}</td></tr>
      <tr><td style="padding:6px;color:#6b7280">Monthly Salary</td><td style="padding:6px;font-weight:600">${salaryStr}</td></tr>
    </table>
    <p>Please confirm your acceptance within 7 days by replying to this email.</p>
    <p>We look forward to welcoming you to our team!</p>
    <p style="margin-top:24px">Warm regards,<br><strong>HR Department</strong><br>PACT Command Center</p>
  </div>
  <div style="padding:8px 24px;font-size:11px;color:#9ca3af;border-top:1px solid #f3f4f6">
    This offer is confidential and intended solely for the named recipient.
  </div>
</div>`;

    try {
      await EmailNotificationService.sendEmail({
        to: c.email,
        subject: `Offer of Employment — ${posting.title} | PACT Command Center`,
        recipientName: c.full_name,
        html,
        text: `Dear ${c.full_name.split(' ')[0]},\n\nWe are delighted to offer you the position of ${posting.title} at PACT Command Center.\n\nStart Date: ${startDateStr}\nMonthly Salary: ${salaryStr}\n\nPlease confirm your acceptance within 7 days.\n\nHR Department, PACT Command Center`,
        priority: 'high',
      });
      await supabase.from('hr_candidates' as any)
        .update({ offer_sent_at: new Date().toISOString() })
        .eq('id', c.id);
      toast({ title: 'Offer letter emailed successfully' });
      // Refresh so offer_sent_at shows
      fetchAll();
    } catch (err: any) {
      toast({ title: 'Email failed', description: err?.message ?? 'Could not send email', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  // ── Job Requisitions ───────────────────────────────────────────────────────
  function openNewJr() { setEditingJr(null); setJrForm({ ...BLANK_JR }); setJrDialogOpen(true); }
  function openEditJr(jr: JobRequisition) {
    setEditingJr(jr);
    setJrForm({
      title: jr.title, department_id: jr.department_id ?? '',
      hub_id: jr.hub_id ?? '', headcount: String(jr.headcount),
      justification: jr.justification ?? '', salary_band: jr.salary_band ?? '',
      target_start_date: jr.target_start_date ?? '',
    });
    setJrDialogOpen(true);
  }
  async function saveJr() {
    if (!jrForm.title.trim()) { toast({ title: 'Title required', variant: 'destructive' }); return; }
    setSaving(true);
    const payload: any = {
      title: jrForm.title.trim(), department_id: jrForm.department_id || null,
      hub_id: jrForm.hub_id || null, headcount: parseInt(jrForm.headcount, 10) || 1,
      justification: jrForm.justification || null, salary_band: jrForm.salary_band || null,
      target_start_date: jrForm.target_start_date || null,
    };
    const { error } = editingJr
      ? await supabase.from('hr_job_requisitions' as any).update(payload).eq('id', editingJr.id)
      : await supabase.from('hr_job_requisitions' as any).insert({
          ...payload, status: 'draft', requested_by: currentUser?.id ?? null });
    setSaving(false);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { toast({ title: editingJr ? 'Requisition updated' : 'Requisition created' }); setJrDialogOpen(false); fetchAll(); }
  }
  async function submitJr(jr: JobRequisition) {
    await supabase.from('hr_job_requisitions' as any).update({ status: 'pending_manager' }).eq('id', jr.id);
    try {
      await NotificationTriggerService.sendToRoles(['super_admin','admin','manager'], {
        title: 'Job Requisition Awaiting Approval',
        message: `A new requisition for "${jr.title}" needs manager approval.`,
        type: 'info', category: 'assignments', priority: 'high', link: '/recruitment',
      });
    } catch (e) { console.warn('[Recruitment] jr notify failed:', e); }
    fetchAll();
    toast({ title: 'Requisition submitted for manager approval' });
  }
  async function handleApproveAction() {
    if (!approveDialog || !currentUser) return;
    const { jr, action, layer } = approveDialog;
    setSavingApprove(true);
    let update: any = {};
    if (action === 'approve') {
      if (layer === 'manager') {
        update = { status: 'pending_hr', manager_approved_at: new Date().toISOString(), manager_approved_by: currentUser.id };
        try { await NotificationTriggerService.sendToRoles(['super_admin','admin','hr','hr_admin'], {
          title: 'JR Needs HR Approval',
          message: `Requisition "${jr.title}" passed manager review — awaiting HR approval.`,
          type: 'info', category: 'assignments', priority: 'high', link: '/recruitment',
        }); } catch (e) { console.warn(e); }
      } else {
        // HR approval — auto-create job posting
        update = { status: 'approved', hr_approved_at: new Date().toISOString(), hr_approved_by: currentUser.id };
        const { data: newPosting } = await supabase.from('hr_job_postings' as any).insert({
          title: jr.title, department_id: jr.department_id,
          employment_type: 'full_time', status: 'open',
          headcount_needed: jr.headcount, description: jr.justification,
          requirements: jr.salary_band ? `Salary band: ${jr.salary_band}` : null,
          opened_at: new Date().toISOString().slice(0, 10),
          created_by: currentUser.id, requisition_id: jr.id,
        }).select('id').single();
        if (newPosting?.id) update.linked_posting_id = newPosting.id;
        toast({ title: 'JR Approved — job posting created automatically' });
      }
    } else {
      update = layer === 'manager'
        ? { status: 'rejected', manager_rejection_note: approveNote || 'Rejected by manager' }
        : { status: 'rejected', hr_rejection_note: approveNote || 'Rejected by HR' };
      toast({ title: 'Requisition rejected', variant: 'destructive' });
    }
    await supabase.from('hr_job_requisitions' as any).update(update).eq('id', jr.id);
    setSavingApprove(false);
    setApproveDialog(null); setApproveNote('');
    fetchAll();
  }
  async function deleteJr(jr: JobRequisition) {
    if (!confirm(`Delete requisition "${jr.title}"?`)) return;
    await supabase.from('hr_job_requisitions' as any).delete().eq('id', jr.id);
    fetchAll();
  }

  // ── Export ─────────────────────────────────────────────────────────────────
  function handleExport() {
    const rows = candidates.map(c => ({
      'Job Posting': postings.find(p => p.id === c.job_posting_id)?.title ?? '',
      Candidate: c.full_name, Email: c.email ?? '', Phone: c.phone ?? '',
      Source: c.source ?? '', Stage: STAGE_CFG[c.stage].label,
      Rating: c.rating ?? '',
      'Avg Score': candidateScores(c.id).length
        ? (candidateScores(c.id).reduce((s, sc) => s + (sc.overall_score ?? 0), 0) / candidateScores(c.id).length).toFixed(1)
        : '',
      'Interview Date': c.interview_date ? format(new Date(c.interview_date), 'yyyy-MM-dd HH:mm') : '',
      'Applied At': format(new Date(c.applied_at), 'yyyy-MM-dd'),
      'Salary Offer': c.salary_offer ?? '',
      'Offer Sent': c.offer_sent_at ? format(new Date(c.offer_sent_at), 'yyyy-MM-dd') : '',
    }));
    exportToExcel(rows, 'Candidates', `Recruitment_Candidates_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
  if (missingTable) return (
    <Card className="border-dashed border-amber-300 bg-amber-50/50 dark:bg-amber-950/10">
      <CardContent className="py-10 text-center text-sm text-amber-700 dark:text-amber-400">
        Apply <code className="font-mono text-xs">20260705_hr_recruitment_disciplinary_benefits_headcount.sql</code> then <code className="font-mono text-xs">20260715_hr_recruitment_jr_scoring.sql</code> to enable this page.
      </CardContent>
    </Card>
  );

  // ── Candidate detail dialog ────────────────────────────────────────────────
  function CandidateDetailDialog() {
    // ── All hooks declared unconditionally (Rules of Hooks) ──────────────────
    const [offerSalary,   setOfferSalary]   = useState('');
    const [offerCurrency, setOfferCurrency] = useState('SDG');
    const [offerStart,    setOfferStart]    = useState('');
    const [savingOffer,   setSavingOffer]   = useState(false);
    const [sendingEmail,  setSendingEmail]  = useState(false);

    const c = detailCand;

    // Sync offer fields whenever a different candidate is opened
    useEffect(() => {
      if (c) {
        setOfferSalary(String(c.salary_offer ?? ''));
        setOfferCurrency(c.offer_currency ?? 'SDG');
        setOfferStart(c.offer_start_date ?? '');
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [c?.id]);

    if (!c) return null;

    const posting = postings.find(p => p.id === c.job_posting_id);
    const rubric  = getEffectiveRubric(posting ?? null);
    const cScores = candidateScores(c.id);
    const cSlots  = candidateSlots(c.id);
    const avgScore = cScores.length
      ? (cScores.reduce((s, sc) => s + (sc.overall_score ?? 0), 0) / cScores.length).toFixed(1)
      : null;
    const myExistingScore = cScores.find(s => s.interviewer_id === currentUser?.id);
    const radarData = rubric.map(r => {
      const withValue = cScores.filter(s => (s.rubric_scores[r.id] ?? 0) > 0);
      const avg = withValue.length
        ? withValue.reduce((sum, s) => sum + (s.rubric_scores[r.id] ?? 0), 0) / withValue.length
        : 0;
      return { subject: r.label, score: Math.round(avg * 10) / 10, fullMark: 5 };
    });

    async function saveOfferDetails() {
      setSavingOffer(true);
      await supabase.from('hr_candidates' as any)
        .update({ salary_offer: parseFloat(offerSalary) || null, offer_currency: offerCurrency, offer_start_date: offerStart || null })
        .eq('id', c.id);
      setSavingOffer(false);
      toast({ title: 'Offer details saved' });
      fetchAll();
    }

    function previewPdf() {
      const updatedCand = { ...c,
        salary_offer: parseFloat(offerSalary) || c.salary_offer,
        offer_currency: offerCurrency,
        offer_start_date: offerStart || c.offer_start_date,
      };
      const doc = buildOfferPdf(updatedCand, posting!, deptName(posting?.department_id ?? null));
      const url = doc.output('bloburl') as unknown as string;
      setPreviewBlobUrl(url);
    }

    function downloadPdf() {
      const updatedCand = { ...c,
        salary_offer: parseFloat(offerSalary) || c.salary_offer,
        offer_currency: offerCurrency,
        offer_start_date: offerStart || c.offer_start_date,
      };
      buildOfferPdf(updatedCand, posting!, deptName(posting?.department_id ?? null))
        .save(`Offer_Letter_${c.full_name.replace(/\s+/g, '_')}.pdf`);
    }

    async function handleSendEmail() {
      setSendingEmail(true);
      const updatedCand = { ...c,
        salary_offer: parseFloat(offerSalary) || c.salary_offer,
        offer_currency: offerCurrency,
        offer_start_date: offerStart || c.offer_start_date,
      };
      await sendOfferEmail(updatedCand, posting);
      setSendingEmail(false);
    }

    return (
      <Dialog open={!!detailCand} onOpenChange={(o) => { if (!o) { setDetailCand(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span>{c.full_name}</span>
              <Badge variant="outline" className={cn('text-xs', STAGE_CFG[c.stage].class)}>{STAGE_CFG[c.stage].label}</Badge>
              {avgScore && (
                <span className="flex items-center gap-1 text-amber-600 text-sm">
                  <Star className="h-3.5 w-3.5 fill-amber-500" />{avgScore} avg
                </span>
              )}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">{posting?.title} · Applied {format(new Date(c.applied_at), 'MMM d, yyyy')}</p>
          </DialogHeader>

          <Tabs value={detailTab} onValueChange={setDetailTab}>
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="scorecards">Scorecards {cScores.length > 0 && `(${cScores.length})`}</TabsTrigger>
              <TabsTrigger value="interviews">Interviews {cSlots.length > 0 && `(${cSlots.length})`}</TabsTrigger>
              <TabsTrigger value="offer" disabled={c.stage !== 'offer' && c.stage !== 'hired'}>Offer Letter</TabsTrigger>
            </TabsList>

            {/* Overview */}
            <TabsContent value="overview" className="space-y-3 pt-2">
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                {([
                  ['Email', c.email],
                  ['Phone', c.phone],
                  ['Source', c.source],
                  ['Interviewer', c.interviewer_id ? profileName(c.interviewer_id) : null],
                  ['Interview Date', c.interview_date ? format(new Date(c.interview_date), 'MMM d, yyyy HH:mm') : null],
                ] as [string, string|null][]).filter(([, v]) => v).map(([k, v]) => (
                  <div key={k}>
                    <p className="text-xs text-muted-foreground">{k}</p>
                    <p className="font-medium">{v}</p>
                  </div>
                ))}
              </div>
              {c.resume_url && (
                <a href={c.resume_url} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
                  <FileText className="h-3.5 w-3.5" />View Resume
                </a>
              )}
              {c.notes && <p className="text-sm text-muted-foreground border-t pt-2">{c.notes}</p>}
              <div className="flex gap-2 pt-2 border-t">
                <Button size="sm" variant="outline" onClick={() => { setDetailCand(null); openEditCand(c); }}>
                  <Edit2 className="h-3.5 w-3.5 mr-1" />Edit
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setDetailCand(null); openSlotDialog(c.id); }}>
                  <CalendarPlus className="h-3.5 w-3.5 mr-1" />Schedule Interview
                </Button>
              </div>
            </TabsContent>

            {/* Scorecards */}
            <TabsContent value="scorecards" className="space-y-4 pt-2">
              {cScores.length > 0 && (
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData}>
                      <PolarGrid />
                      <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10 }} />
                      <Radar name="Avg Score" dataKey="score" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.25} />
                      <Tooltip formatter={(v: any) => [`${v}/5`]} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              )}
              {cScores.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No scorecards submitted yet.</p>
              )}
              <div className="space-y-2">
                {cScores.map(sc => (
                  <Card key={sc.id} className="bg-muted/30">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium">{profileName(sc.interviewer_id)}</p>
                        <div className="flex items-center gap-1 text-amber-600">
                          <Star className="h-3.5 w-3.5 fill-amber-500" />
                          <span className="text-sm font-semibold">{sc.overall_score?.toFixed(1) ?? '—'}/5</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        {rubric.map(r => (
                          <div key={r.id} className="text-xs">
                            <span className="text-muted-foreground">{r.label}: </span>
                            <span className="font-medium">{sc.rubric_scores[r.id] ?? '—'}/5</span>
                          </div>
                        ))}
                      </div>
                      {sc.notes && <p className="text-xs text-muted-foreground mt-2 italic">"{sc.notes}"</p>}
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Submit my scorecard */}
              <div className="border-t pt-3 space-y-3">
                <p className="text-sm font-semibold">{myExistingScore ? 'Update My Scorecard' : 'Submit My Scorecard'}</p>
                <div className="grid grid-cols-1 gap-2">
                  {rubric.map(r => (
                    <div key={r.id} className="flex items-center justify-between gap-3">
                      <Label className="text-xs w-36 shrink-0">{r.label}</Label>
                      <div className="flex gap-1">
                        {[1,2,3,4,5].map(n => (
                          <button key={n} onClick={() => setMyScores(s => ({ ...s, [r.id]: n }))}
                            className={cn('w-8 h-7 rounded text-xs font-semibold border transition-colors',
                              myScores[r.id] === n
                                ? 'bg-purple-600 text-white border-purple-600'
                                : 'border-muted-foreground/30 hover:bg-purple-50 dark:hover:bg-purple-900/20')}>
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <Textarea rows={2} placeholder="Notes (optional)" value={scoreNotes} onChange={e => setScoreNotes(e.target.value)} />
                <Button size="sm" onClick={submitScorecard} disabled={savingScore}>
                  {savingScore && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                  {myExistingScore ? 'Update Scorecard' : 'Submit Scorecard'}
                </Button>
              </div>
            </TabsContent>

            {/* Interviews */}
            <TabsContent value="interviews" className="space-y-3 pt-2">
              {cSlots.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">No interviews scheduled yet.</p>
              )}
              {cSlots.map(sl => (
                <Card key={sl.id} className="bg-muted/30">
                  <CardContent className="p-3 space-y-1">
                    <div className="flex items-center gap-2">
                      {sl.interview_type === 'video'     && <Video  className="h-3.5 w-3.5 text-blue-500" />}
                      {sl.interview_type === 'phone'     && <Phone  className="h-3.5 w-3.5 text-emerald-500" />}
                      {sl.interview_type === 'in_person' && <MapPin className="h-3.5 w-3.5 text-amber-500" />}
                      <span className="font-medium text-sm">{format(new Date(sl.scheduled_at), 'MMM d, yyyy HH:mm')}</span>
                      <Badge variant="outline" className="text-[10px]">{sl.duration_minutes}min</Badge>
                    </div>
                    {sl.interviewer_ids.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Interviewers: {sl.interviewer_ids.map(id => profileName(id)).join(', ')}
                      </p>
                    )}
                    {sl.location && <p className="text-xs text-muted-foreground"><MapPin className="inline h-3 w-3 mr-0.5" />{sl.location}</p>}
                    {sl.meeting_link && <a href={sl.meeting_link} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">{sl.meeting_link}</a>}
                    {sl.notes && <p className="text-xs text-muted-foreground italic">"{sl.notes}"</p>}
                  </CardContent>
                </Card>
              ))}
              <Button size="sm" variant="outline" onClick={() => { setDetailCand(null); openSlotDialog(c.id); }}>
                <CalendarPlus className="h-3.5 w-3.5 mr-1" />Schedule New Interview
              </Button>
            </TabsContent>

            {/* Offer Letter */}
            <TabsContent value="offer" className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Monthly Salary</Label>
                  <Input type="number" value={offerSalary} onChange={e => setOfferSalary(e.target.value)} placeholder="0" />
                </div>
                <div>
                  <Label>Currency</Label>
                  <Select value={offerCurrency} onValueChange={setOfferCurrency}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SDG">SDG</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label>Proposed Start Date</Label>
                  <Input type="date" value={offerStart} onChange={e => setOfferStart(e.target.value)} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={saveOfferDetails} disabled={savingOffer}>
                  {savingOffer && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}Save Details
                </Button>
                <Button size="sm" variant="outline" onClick={previewPdf}>
                  <Eye className="h-3.5 w-3.5 mr-1" />Preview PDF
                </Button>
                <Button size="sm" variant="outline" onClick={downloadPdf} data-testid={`btn-offer-pdf-${c.id}`}>
                  <FileDown className="h-3.5 w-3.5 mr-1" />Download PDF
                </Button>
                {c.email && (
                  <Button size="sm" onClick={handleSendEmail} disabled={sendingEmail || saving}>
                    {(sendingEmail || saving) ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Mail className="h-3.5 w-3.5 mr-1" />}
                    Send via Email
                  </Button>
                )}
              </div>
              {c.offer_sent_at && (
                <p className="text-xs text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />Offer sent {format(new Date(c.offer_sent_at), 'MMM d, yyyy HH:mm')}
                </p>
              )}
              {!c.email && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />No email address on file — email send unavailable
                </p>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4" data-testid="page-recruitment">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Tabs value={pageTab} onValueChange={v => setPageTab(v as any)}>
          <TabsList>
            <TabsTrigger value="postings" data-testid="tab-postings">Job Postings</TabsTrigger>
            <TabsTrigger value="requisitions" data-testid="tab-requisitions">
              Requisitions
              {requisitions.filter(jr => jr.status === 'pending_manager' || jr.status === 'pending_hr').length > 0 && (
                <Badge className="ml-1.5 h-4 px-1.5 text-[9px] bg-amber-500 text-white">
                  {requisitions.filter(jr => jr.status === 'pending_manager' || jr.status === 'pending_hr').length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport} data-testid="button-export-candidates">
            <FileDown className="h-4 w-4 mr-1" />Export
          </Button>
          {pageTab === 'postings' && isAdmin && (
            <Button onClick={openNewJob} data-testid="button-new-posting">
              <Plus className="h-4 w-4 mr-1" />New Posting
            </Button>
          )}
          {pageTab === 'requisitions' && (
            <Button onClick={openNewJr} data-testid="button-new-jr">
              <Plus className="h-4 w-4 mr-1" />New Requisition
            </Button>
          )}
        </div>
      </div>

      {/* ── Job Postings tab ── */}
      {pageTab === 'postings' && (
        <>
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search postings…" className="pl-8" value={search}
              onChange={e => setSearch(e.target.value)} data-testid="input-search-postings" />
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {/* Posting list */}
            <div className="md:col-span-1 space-y-2">
              {filteredPostings.length === 0 && (
                <p className="text-sm text-muted-foreground py-6 text-center">No job postings yet.</p>
              )}
              {filteredPostings.map(p => (
                <Card key={p.id} onClick={() => setSelectedPosting(p.id)}
                  data-testid={`card-posting-${p.id}`}
                  className={cn('cursor-pointer hover:border-primary/50 transition-colors',
                    selectedPosting === p.id && 'border-primary ring-1 ring-primary/30')}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-sm">{p.title}</p>
                        <p className="text-xs text-muted-foreground">{deptName(p.department_id)} · {p.employment_type.replace('_',' ')}</p>
                      </div>
                      <Badge variant="outline" className={cn(
                        p.status === 'open'    && 'border-emerald-300 text-emerald-700',
                        p.status === 'closed'  && 'border-gray-300 text-gray-500',
                        p.status === 'on_hold' && 'border-amber-300 text-amber-700')}>
                        {p.status.replace('_',' ')}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                      <Users className="h-3 w-3" />
                      {candidatesFor(p.id).length} candidate{candidatesFor(p.id).length === 1 ? '' : 's'} · needs {p.headcount_needed}
                    </div>
                    {p.scoring_rubric && Array.isArray(p.scoring_rubric) && p.scoring_rubric.length > 0 && (
                      <p className="text-[10px] text-purple-500 mt-1 flex items-center gap-1">
                        <Settings2 className="h-2.5 w-2.5" />Custom rubric ({p.scoring_rubric.length} categories)
                      </p>
                    )}
                    {p.requisition_id && (
                      <p className="text-[10px] text-blue-500 mt-0.5 flex items-center gap-1">
                        <Link2 className="h-2.5 w-2.5" />From approved requisition
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Candidate pipeline */}
            <div className="md:col-span-2">
              {!activePosting ? (
                <Card className="h-full">
                  <CardContent className="py-16 text-center text-sm text-muted-foreground">
                    Select a job posting to view its candidate pipeline.
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Briefcase className="h-4 w-4" />{activePosting.title}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">
                        Opened {format(new Date(activePosting.opened_at), 'MMM d, yyyy')}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {isAdmin && (
                        <Button size="sm" variant="outline" title="Configure scoring rubric"
                          onClick={() => openRubricDialog(activePosting)} data-testid="button-configure-rubric">
                          <Settings2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {isAdmin && <Button size="sm" variant="outline" onClick={() => openEditJob(activePosting)}><Edit2 className="h-3.5 w-3.5" /></Button>}
                      {isAdmin && <Button size="sm" variant="outline" className="text-red-600" onClick={() => deleteJob(activePosting)}><Trash2 className="h-3.5 w-3.5" /></Button>}
                      {isAdmin && <Button size="sm" onClick={openNewCand} data-testid="button-add-candidate"><Plus className="h-3.5 w-3.5 mr-1" />Add Candidate</Button>}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {activePosting.description && <p className="text-sm text-muted-foreground mb-4">{activePosting.description}</p>}
                    <div className="space-y-2">
                      {candidatesFor(activePosting.id).length === 0 && (
                        <p className="text-sm text-muted-foreground py-6 text-center">No candidates yet.</p>
                      )}
                      {candidatesFor(activePosting.id).map(c => {
                        const cScores = candidateScores(c.id);
                        const avgScore = cScores.length
                          ? (cScores.reduce((s, sc) => s + (sc.overall_score ?? 0), 0) / cScores.length).toFixed(1)
                          : null;
                        return (
                          <div key={c.id} className="border rounded-lg p-3 flex items-start justify-between gap-3 hover:bg-muted/30 transition-colors"
                            data-testid={`row-candidate-${c.id}`}>
                            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openDetailForCand(c)}>
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-medium text-sm">{c.full_name}</p>
                                {avgScore && (
                                  <span className="flex items-center text-xs text-amber-600">
                                    <Star className="h-3 w-3 fill-amber-500 mr-0.5" />{avgScore}
                                  </span>
                                )}
                                {candidateSlots(c.id).length > 0 && (
                                  <Badge variant="outline" className="text-[10px] border-blue-300 text-blue-600">
                                    {candidateSlots(c.id).length} interview{candidateSlots(c.id).length > 1 ? 's' : ''}
                                  </Badge>
                                )}
                                {c.onboarding_noted && (
                                  <Badge variant="outline" className="text-[10px] border-teal-300 text-teal-600">
                                    <UserCheck className="h-2.5 w-2.5 mr-0.5" />Onboarding
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">{c.email}{c.phone ? ` · ${c.phone}` : ''}</p>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <Select value={c.stage} onValueChange={(v) => quickSetStage(c, v as Candidate['stage'])} disabled={!isAdmin}>
                                <SelectTrigger className={cn('h-7 text-xs w-32', STAGE_CFG[c.stage].class)} data-testid={`select-stage-${c.id}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>{STAGES.map(s => <SelectItem key={s} value={s}>{STAGE_CFG[s].label}</SelectItem>)}</SelectContent>
                              </Select>
                              {isAdmin && (
                                <div className="flex gap-1">
                                  <Button size="icon" variant="ghost" className="h-6 w-6" title="Scorecard"
                                    onClick={() => openDetailForCand(c, 'scorecards')}>
                                    <Award className="h-3 w-3 text-purple-500" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-6 w-6" title="Schedule interview"
                                    onClick={() => openSlotDialog(c.id)}>
                                    <CalendarPlus className="h-3 w-3 text-blue-500" />
                                  </Button>
                                  {(c.stage === 'offer' || c.stage === 'hired') && (
                                    <Button size="icon" variant="ghost" className="h-6 w-6" title="Offer Letter"
                                      onClick={() => openDetailForCand(c, 'offer')}>
                                      <FileText className="h-3 w-3 text-emerald-500" />
                                    </Button>
                                  )}
                                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openEditCand(c)}><Edit2 className="h-3 w-3" /></Button>
                                  <Button size="icon" variant="ghost" className="h-6 w-6 text-red-600" onClick={() => deleteCandidate(c)}><Trash2 className="h-3 w-3" /></Button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Requisitions tab ── */}
      {pageTab === 'requisitions' && (
        <div className="space-y-3">
          {requisitions.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="py-16 text-center text-sm text-muted-foreground">
                No job requisitions yet. Create one to start the hiring approval process.
              </CardContent>
            </Card>
          )}
          {requisitions.map(jr => {
            const cfg = JR_STATUS_CFG[jr.status];
            const canManagerApprove = isManager && jr.status === 'pending_manager';
            const canHrApprove      = isAdmin   && jr.status === 'pending_hr';
            return (
              <Card key={jr.id} data-testid={`card-jr-${jr.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="font-semibold text-sm">{jr.title}</p>
                        <Badge variant="outline" className={cn('text-[10px] gap-1', cfg.class)}>
                          {cfg.icon}{cfg.label}
                        </Badge>
                        {jr.headcount > 1 && (
                          <Badge variant="outline" className="text-[10px]">{jr.headcount} headcount</Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {jr.department_id && <span>Dept: {deptName(jr.department_id)}</span>}
                        {jr.hub_id        && <span>Hub: {hubName(jr.hub_id)}</span>}
                        {jr.salary_band   && <span>Band: {jr.salary_band}</span>}
                        {jr.target_start_date && <span>Target start: {format(new Date(jr.target_start_date), 'MMM d, yyyy')}</span>}
                        <span>By {profileName(jr.requested_by)}</span>
                      </div>
                      {jr.justification && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{jr.justification}</p>
                      )}
                      <div className="flex gap-3 mt-2 flex-wrap">
                        {jr.manager_approved_at && (
                          <span className="text-[10px] text-emerald-600 flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" />Manager approved {format(new Date(jr.manager_approved_at), 'MMM d')}
                          </span>
                        )}
                        {jr.manager_rejection_note && (
                          <span className="text-[10px] text-red-500 flex items-center gap-1">
                            <XCircle className="h-3 w-3" />Mgr: {jr.manager_rejection_note}
                          </span>
                        )}
                        {jr.hr_approved_at && (
                          <span className="text-[10px] text-emerald-600 flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" />HR approved {format(new Date(jr.hr_approved_at), 'MMM d')}
                          </span>
                        )}
                        {jr.hr_rejection_note && (
                          <span className="text-[10px] text-red-500 flex items-center gap-1">
                            <XCircle className="h-3 w-3" />HR: {jr.hr_rejection_note}
                          </span>
                        )}
                        {jr.linked_posting_id && (
                          <span className="text-[10px] text-blue-600 flex items-center gap-1 cursor-pointer hover:underline"
                            onClick={() => { setPageTab('postings'); setSelectedPosting(jr.linked_posting_id!); }}>
                            <Link2 className="h-3 w-3" />View job posting <ChevronRight className="h-3 w-3" />
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 flex-wrap shrink-0">
                      {jr.status === 'draft' && jr.requested_by === currentUser?.id && (
                        <Button size="sm" onClick={() => submitJr(jr)} data-testid={`btn-submit-jr-${jr.id}`}>
                          Submit for Approval
                        </Button>
                      )}
                      {canManagerApprove && (
                        <>
                          <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-300"
                            onClick={() => { setApproveDialog({ jr, action: 'approve', layer: 'manager' }); setApproveNote(''); }}
                            data-testid={`btn-mgr-approve-${jr.id}`}>
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Approve
                          </Button>
                          <Button size="sm" variant="outline" className="text-red-500 border-red-300"
                            onClick={() => { setApproveDialog({ jr, action: 'reject', layer: 'manager' }); setApproveNote(''); }}
                            data-testid={`btn-mgr-reject-${jr.id}`}>
                            <XCircle className="h-3.5 w-3.5 mr-1" />Reject
                          </Button>
                        </>
                      )}
                      {canHrApprove && (
                        <>
                          <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-300"
                            onClick={() => { setApproveDialog({ jr, action: 'approve', layer: 'hr' }); setApproveNote(''); }}
                            data-testid={`btn-hr-approve-${jr.id}`}>
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />HR Approve
                          </Button>
                          <Button size="sm" variant="outline" className="text-red-500 border-red-300"
                            onClick={() => { setApproveDialog({ jr, action: 'reject', layer: 'hr' }); setApproveNote(''); }}
                            data-testid={`btn-hr-reject-${jr.id}`}>
                            <XCircle className="h-3.5 w-3.5 mr-1" />HR Reject
                          </Button>
                        </>
                      )}
                      {isAdmin && jr.status === 'draft' && (
                        <Button size="sm" variant="ghost" onClick={() => openEditJr(jr)} data-testid={`btn-edit-jr-${jr.id}`}>
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {isAdmin && (
                        <Button size="sm" variant="ghost" className="text-red-500" onClick={() => deleteJr(jr)}
                          data-testid={`btn-delete-jr-${jr.id}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ════════════════════════════════════ Dialogs ══════════════════════════════ */}

      {/* Candidate detail dialog */}
      <CandidateDetailDialog />

      {/* PDF Preview dialog */}
      <Dialog open={!!previewBlobUrl} onOpenChange={o => { if (!o) { if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl); setPreviewBlobUrl(null); } }}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-4 pb-2 flex flex-row items-center justify-between">
            <DialogTitle>Offer Letter Preview</DialogTitle>
            <Button size="sm" variant="ghost" onClick={() => { if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl); setPreviewBlobUrl(null); }}>
              <XIcon className="h-4 w-4" />
            </Button>
          </DialogHeader>
          {previewBlobUrl && (
            <iframe src={previewBlobUrl} title="Offer Letter Preview" className="flex-1 w-full border-0" />
          )}
        </DialogContent>
      </Dialog>

      {/* Rubric config dialog */}
      <Dialog open={rubricDialogOpen} onOpenChange={setRubricDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-4 w-4" />Configure Scoring Rubric
            </DialogTitle>
            <p className="text-xs text-muted-foreground">{rubricTargetPosting?.title} — customise the scoring categories for this posting</p>
          </DialogHeader>
          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
            {rubricDraft.map((r, i) => (
              <div key={r.id} className="flex items-center gap-2 group">
                <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                <Input value={r.label}
                  onChange={e => setRubricDraft(d => d.map((item, idx) => idx === i ? { ...item, label: e.target.value } : item))}
                  className="flex-1 h-8 text-sm" />
                <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 opacity-0 group-hover:opacity-100"
                  onClick={() => setRubricDraft(d => d.filter((_, idx) => idx !== i))}>
                  <XIcon className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input placeholder="New category name…" value={rubricNewLabel}
              onChange={e => setRubricNewLabel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRubricCategory(); } }}
              className="flex-1 h-8 text-sm" />
            <Button size="sm" variant="outline" onClick={addRubricCategory}>
              <Plus className="h-3.5 w-3.5 mr-1" />Add
            </Button>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
            <AlertTriangle className="h-3 w-3" />
            Existing scorecards will still display their original scores; only new scorecards will use this rubric.
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRubricDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveRubric}>Save Rubric</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Job Posting dialog */}
      <Dialog open={jobDialogOpen} onOpenChange={setJobDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingJob ? 'Edit Job Posting' : 'New Job Posting'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Title</Label><Input value={jobForm.title} onChange={e => setJobForm(f => ({ ...f, title: e.target.value }))} data-testid="input-job-title" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Department</Label>
                <Select value={jobForm.department_id || 'none'} onValueChange={v => setJobForm(f => ({ ...f, department_id: v === 'none' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent><SelectItem value="none">None</SelectItem>{depts.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Employment Type</Label>
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
              <div><Label>Status</Label>
                <Select value={jobForm.status} onValueChange={v => setJobForm(f => ({ ...f, status: v as any }))}>
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
            <div><Label>Requirements</Label><Textarea rows={2} value={jobForm.requirements} onChange={e => setJobForm(f => ({ ...f, requirements: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button onClick={saveJob} disabled={saving} data-testid="button-save-posting">
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Candidate add/edit dialog */}
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
              <div><Label>Source</Label><Input placeholder="Referral, LinkedIn…" value={candForm.source} onChange={e => setCandForm(f => ({ ...f, source: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Stage</Label>
                <Select value={candForm.stage} onValueChange={v => setCandForm(f => ({ ...f, stage: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STAGES.map(s => <SelectItem key={s} value={s}>{STAGE_CFG[s].label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Interview Date/Time</Label><Input type="datetime-local" value={candForm.interview_date} onChange={e => setCandForm(f => ({ ...f, interview_date: e.target.value }))} /></div>
            </div>
            <div><Label>Interviewer</Label>
              <Select value={candForm.interviewer_id || 'none'} onValueChange={v => setCandForm(f => ({ ...f, interviewer_id: v === 'none' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent><SelectItem value="none">None</SelectItem>{profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Notes</Label><Textarea rows={2} value={candForm.notes} onChange={e => setCandForm(f => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button onClick={saveCandidate} disabled={saving} data-testid="button-save-candidate">
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Interview Schedule dialog */}
      <Dialog open={slotDialogOpen} onOpenChange={setSlotDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              <CalendarPlus className="h-4 w-4" />Schedule Interview
              {outlookConnected && (
                <Badge variant="outline" className="text-[10px] border-blue-300 text-blue-600">
                  Outlook ✓
                </Badge>
              )}
              {googleCalConnected && (
                <Badge variant="outline" className="text-[10px] border-green-400 text-green-700">
                  Google Calendar ✓
                </Badge>
              )}
              {(outlookConnected || googleCalConnected) && (
                <span className="text-[10px] text-muted-foreground font-normal">
                  — invite will be sent
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Date & Time</Label><Input type="datetime-local" value={slotForm.scheduled_at} onChange={e => setSlotForm(f => ({ ...f, scheduled_at: e.target.value }))} /></div>
              <div><Label>Duration (minutes)</Label>
                <Select value={slotForm.duration_minutes} onValueChange={v => setSlotForm(f => ({ ...f, duration_minutes: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{['30','45','60','90','120'].map(d => <SelectItem key={d} value={d}>{d} min</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Interview Type</Label>
              <Select value={slotForm.interview_type} onValueChange={v => setSlotForm(f => ({ ...f, interview_type: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="video">Video call</SelectItem>
                  <SelectItem value="phone">Phone</SelectItem>
                  <SelectItem value="in_person">In person</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Location / Room</Label><Input placeholder="e.g. Meeting Room 2" value={slotForm.location} onChange={e => setSlotForm(f => ({ ...f, location: e.target.value }))} /></div>
            <div><Label>Meeting Link</Label><Input placeholder="https://meet.google.com/…" value={slotForm.meeting_link} onChange={e => setSlotForm(f => ({ ...f, meeting_link: e.target.value }))} /></div>
            <div>
              <Label>Interviewers (select multiple)</Label>
              <div className="mt-1 max-h-44 overflow-y-auto border rounded-md p-2 space-y-1">
                {profiles.map(p => (
                  <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/40 rounded px-1 py-0.5">
                    <input type="checkbox" checked={slotForm.interviewer_ids.includes(p.id)}
                      onChange={e => setSlotForm(f => ({
                        ...f, interviewer_ids: e.target.checked
                          ? [...f.interviewer_ids, p.id]
                          : f.interviewer_ids.filter(id => id !== p.id),
                      }))} className="h-3.5 w-3.5" />
                    {p.full_name}{p.email ? ` (${p.email})` : ''}
                  </label>
                ))}
              </div>
            </div>
            <div><Label>Notes</Label><Textarea rows={2} value={slotForm.notes} onChange={e => setSlotForm(f => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSlotDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveSlot} disabled={saving} data-testid="button-save-slot">
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* JR create/edit dialog */}
      <Dialog open={jrDialogOpen} onOpenChange={setJrDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingJr ? 'Edit Requisition' : 'New Job Requisition'}</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
            <div><Label>Role Title *</Label><Input value={jrForm.title} onChange={e => setJrForm(f => ({ ...f, title: e.target.value }))} data-testid="input-jr-title" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Department</Label>
                <Select value={jrForm.department_id || 'none'} onValueChange={v => setJrForm(f => ({ ...f, department_id: v === 'none' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent><SelectItem value="none">None</SelectItem>{depts.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Hub / Location</Label>
                <Select value={jrForm.hub_id || 'none'} onValueChange={v => setJrForm(f => ({ ...f, hub_id: v === 'none' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent><SelectItem value="none">None</SelectItem>{hubs.map(h => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Headcount Needed</Label><Input type="number" min={1} value={jrForm.headcount} onChange={e => setJrForm(f => ({ ...f, headcount: e.target.value }))} /></div>
              <div><Label>Target Start Date</Label><Input type="date" value={jrForm.target_start_date} onChange={e => setJrForm(f => ({ ...f, target_start_date: e.target.value }))} /></div>
            </div>
            <div><Label>Salary Band</Label><Input placeholder="e.g. Grade 5 — SDG 80 000–110 000" value={jrForm.salary_band} onChange={e => setJrForm(f => ({ ...f, salary_band: e.target.value }))} /></div>
            <div><Label>Business Justification</Label><Textarea rows={4} placeholder="Why is this role needed? What gap does it fill?" value={jrForm.justification} onChange={e => setJrForm(f => ({ ...f, justification: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setJrDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveJr} disabled={saving} data-testid="button-save-jr">
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* JR Approve/Reject dialog */}
      <Dialog open={!!approveDialog} onOpenChange={o => { if (!o) setApproveDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {approveDialog?.action === 'approve'
                ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                : <XCircle className="h-4 w-4 text-red-500" />}
              {approveDialog?.action === 'approve' ? 'Approve' : 'Reject'} Requisition
            </DialogTitle>
          </DialogHeader>
          {approveDialog && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {approveDialog.action === 'approve'
                  ? approveDialog.layer === 'manager'
                    ? 'Approving advances this requisition to HR review.'
                    : 'HR approval will automatically create a job posting in the ATS.'
                  : 'The requester will be notified of the rejection.'}
              </p>
              {approveDialog.action === 'reject' && (
                <div>
                  <Label>Rejection reason</Label>
                  <Textarea rows={3} value={approveNote} onChange={e => setApproveNote(e.target.value)} placeholder="Optional note…" />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveDialog(null)}>Cancel</Button>
            <Button
              variant={approveDialog?.action === 'reject' ? 'destructive' : 'default'}
              onClick={handleApproveAction} disabled={savingApprove}
              data-testid="button-confirm-approve">
              {savingApprove && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hired → Onboarding dialog */}
      <Dialog open={!!hiredDialog} onOpenChange={o => { if (!o) setHiredDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-emerald-600" />
              Mark {hiredDialog?.full_name} as Hired
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-md border border-emerald-100 dark:border-emerald-800">
              <AlertTriangle className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <p className="text-xs text-emerald-700 dark:text-emerald-300">
                This will create an onboarding record, mark the requisition as filled, and redirect you to Staff Onboarding.
              </p>
            </div>
            <div>
              <Label>Link to existing staff profile (optional)</Label>
              <Select value={hiredProfileId || 'none'} onValueChange={v => setHiredProfileId(v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="— New hire, no profile yet —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— New hire, no profile yet —</SelectItem>
                  {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHiredDialog(null)}>Cancel</Button>
            <Button onClick={confirmHired} disabled={saving} data-testid="button-confirm-hired">
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Confirm Hired
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
