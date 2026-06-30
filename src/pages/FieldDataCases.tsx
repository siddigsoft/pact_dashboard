import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/context/user/UserContext';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO } from 'date-fns';
import {
  ClipboardList, Plus, Trash2, Loader2, Search, RefreshCw,
  CalendarDays, StickyNote, LayoutGrid, User, CheckCircle,
  Clock, AlertCircle, XCircle, ChevronRight, FileText, Eye,
  MessageSquare, ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type TabId = 'registry' | 'visits' | 'notes' | 'status';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'registry', label: 'Case Registry',    icon: <ClipboardList className="w-3.5 h-3.5" /> },
  { id: 'visits',   label: 'Visit Schedule',   icon: <CalendarDays className="w-3.5 h-3.5" /> },
  { id: 'notes',    label: 'Case Notes',        icon: <StickyNote className="w-3.5 h-3.5" /> },
  { id: 'status',   label: 'Status Board',      icon: <LayoutGrid className="w-3.5 h-3.5" /> },
];

const CASE_STATUSES = ['open', 'active', 'follow_up', 'closed', 'rejected'] as const;
const STATUS_CFG: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  open:      { label: 'Open',      cls: 'bg-blue-100 text-blue-700',    icon: <Clock className="w-3 h-3" /> },
  active:    { label: 'Active',    cls: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle className="w-3 h-3" /> },
  follow_up: { label: 'Follow-up', cls: 'bg-amber-100 text-amber-700',  icon: <AlertCircle className="w-3 h-3" /> },
  closed:    { label: 'Closed',    cls: 'bg-slate-100 text-slate-500',  icon: <XCircle className="w-3 h-3" /> },
  rejected:  { label: 'Rejected',  cls: 'bg-red-100 text-red-600',     icon: <XCircle className="w-3 h-3" /> },
};
const VISIT_STATUSES = ['scheduled', 'attempted', 'completed', 'not_found', 'refused', 'rescheduled'];
const VISIT_STATUS_CFG: Record<string, { label: string; cls: string }> = {
  scheduled:  { label: 'Scheduled',  cls: 'bg-blue-100 text-blue-700' },
  attempted:  { label: 'Attempted',  cls: 'bg-amber-100 text-amber-700' },
  completed:  { label: 'Completed',  cls: 'bg-emerald-100 text-emerald-700' },
  not_found:  { label: 'Not Found',  cls: 'bg-red-100 text-red-600' },
  refused:    { label: 'Refused',    cls: 'bg-red-100 text-red-600' },
  rescheduled:{ label: 'Rescheduled',cls: 'bg-purple-100 text-purple-700' },
};

interface FdForm { id: string; name: string; }
interface FdCase {
  id: string; form_id: string | null; case_ref: string; case_type: string | null;
  subject_name: string | null; subject_id: string | null;
  status: string; assignee_name: string | null;
  opened_at: string; closed_at: string | null; last_contact_at: string | null;
  priority: string; created_at: string;
}
interface FdVisit {
  id: string; case_id: string; scheduled_date: string; scheduled_time: string | null;
  enumerator_name: string | null; location: string | null;
  status: string; outcome_notes: string | null; created_at: string;
  fd_cases?: { case_ref: string; subject_name: string | null } | null;
}
interface FdNote {
  id: string; case_id: string; note_text: string;
  author_name: string | null; created_at: string;
  fd_cases?: { case_ref: string } | null;
}

const PRIORITY_CFG: Record<string, string> = {
  low:    'bg-slate-100 text-slate-500',
  medium: 'bg-blue-100 text-blue-600',
  high:   'bg-amber-100 text-amber-700',
  urgent: 'bg-red-100 text-red-600',
};

export default function FieldDataCases() {
  const { user } = useUser();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [tab, setTab] = useState<TabId>('registry');
  const [selectedForm, setSelectedForm] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selectedCase, setSelectedCase] = useState<string | null>(null);

  // Case dialog
  const [caseDialog, setCaseDialog] = useState(false);
  const [cRef, setCRef] = useState('');
  const [cType, setCType] = useState('');
  const [cSubjectName, setCSubjectName] = useState('');
  const [cSubjectId, setCSubjectId] = useState('');
  const [cAssignee, setCAssignee] = useState('');
  const [cPriority, setCPriority] = useState('medium');
  const [cFormId, setCFormId] = useState('');
  const [deleteCaseId, setDeleteCaseId] = useState<string | null>(null);

  // Visit dialog
  const [visitDialog, setVisitDialog] = useState(false);
  const [vCaseId, setVCaseId] = useState('');
  const [vDate, setVDate] = useState('');
  const [vTime, setVTime] = useState('');
  const [vEnumerator, setVEnumerator] = useState('');
  const [vLocation, setVLocation] = useState('');

  // Note dialog
  const [noteDialog, setNoteDialog] = useState(false);
  const [nCaseId, setNCaseId] = useState('');
  const [nText, setNText] = useState('');

  const { data: forms = [] } = useQuery<FdForm[]>({
    queryKey: ['fd_forms_cases'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('field_data_forms').select('id,name').order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: cases = [], isLoading: casesLoading, refetch: refetchCases } = useQuery<FdCase[]>({
    queryKey: ['fd_cases', selectedForm],
    queryFn: async () => {
      let q = (supabase as any).from('fd_cases').select('*').order('opened_at', { ascending: false }).limit(200);
      if (selectedForm !== 'all') q = q.eq('form_id', selectedForm);
      const { data, error } = await q;
      if (error && error.code !== '42P01') throw error;
      return data ?? [];
    },
  });

  const { data: visits = [], isLoading: visitsLoading, refetch: refetchVisits } = useQuery<FdVisit[]>({
    queryKey: ['fd_case_visits', selectedForm, selectedCase],
    queryFn: async () => {
      let q = (supabase as any).from('fd_case_visits')
        .select('*, fd_cases(case_ref, subject_name)')
        .order('scheduled_date', { ascending: true }).limit(200);
      if (selectedCase) q = q.eq('case_id', selectedCase);
      else if (selectedForm !== 'all') {
        const caseIds = cases.filter(c => c.form_id === selectedForm).map(c => c.id);
        if (caseIds.length > 0) q = q.in('case_id', caseIds);
      }
      const { data, error } = await q;
      if (error && error.code !== '42P01') throw error;
      return data ?? [];
    },
    enabled: cases.length >= 0,
  });

  const { data: notes = [], isLoading: notesLoading, refetch: refetchNotes } = useQuery<FdNote[]>({
    queryKey: ['fd_case_notes', selectedCase],
    queryFn: async () => {
      let q = (supabase as any).from('fd_case_notes')
        .select('*, fd_cases(case_ref)')
        .order('created_at', { ascending: false }).limit(200);
      if (selectedCase) q = q.eq('case_id', selectedCase);
      const { data, error } = await q;
      if (error && error.code !== '42P01') throw error;
      return data ?? [];
    },
  });

  const filteredCases = cases.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (c.case_ref ?? '').toLowerCase().includes(q)
      || (c.subject_name ?? '').toLowerCase().includes(q)
      || (c.case_type ?? '').toLowerCase().includes(q)
      || (c.assignee_name ?? '').toLowerCase().includes(q);
  });

  const casesByStatus = CASE_STATUSES.reduce((acc, st) => {
    acc[st] = cases.filter(c => c.status === st);
    return acc;
  }, {} as Record<string, FdCase[]>);

  const createCaseMutation = useMutation({
    mutationFn: async () => {
      if (!cRef.trim()) throw new Error('Case reference is required.');
      const { error } = await (supabase as any).from('fd_cases').insert({
        form_id: cFormId || null,
        case_ref: cRef.trim(),
        case_type: cType.trim() || null,
        subject_name: cSubjectName.trim() || null,
        subject_id: cSubjectId.trim() || null,
        assignee_name: cAssignee.trim() || null,
        priority: cPriority,
        status: 'open',
        opened_at: new Date().toISOString(),
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fd_cases'] });
      setCaseDialog(false);
      setCRef(''); setCType(''); setCSubjectName(''); setCSubjectId('');
      setCAssignee(''); setCPriority('medium'); setCFormId('');
      toast({ title: 'Case created' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteCaseMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('fd_cases').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fd_cases'] });
      if (selectedCase === deleteCaseId) setSelectedCase(null);
      setDeleteCaseId(null);
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const updateCaseStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await (supabase as any).from('fd_cases')
        .update({ status, closed_at: status === 'closed' ? new Date().toISOString() : null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fd_cases'] }),
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const createVisitMutation = useMutation({
    mutationFn: async () => {
      if (!vCaseId || !vDate) throw new Error('Case and date are required.');
      const { error } = await (supabase as any).from('fd_case_visits').insert({
        case_id: vCaseId,
        scheduled_date: vDate,
        scheduled_time: vTime || null,
        enumerator_name: vEnumerator.trim() || null,
        location: vLocation.trim() || null,
        status: 'scheduled',
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fd_case_visits'] });
      setVisitDialog(false);
      setVCaseId(''); setVDate(''); setVTime(''); setVEnumerator(''); setVLocation('');
      toast({ title: 'Visit scheduled' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const updateVisitStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await (supabase as any).from('fd_case_visits').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fd_case_visits'] }),
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const createNoteMutation = useMutation({
    mutationFn: async () => {
      if (!nCaseId || !nText.trim()) throw new Error('Case and note text required.');
      const { error } = await (supabase as any).from('fd_case_notes').insert({
        case_id: nCaseId,
        note_text: nText.trim(),
        author_name: (user as any)?.full_name ?? user?.email ?? 'Unknown',
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fd_case_notes'] });
      setNoteDialog(false); setNCaseId(''); setNText('');
      toast({ title: 'Note added' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const openCount = cases.filter(c => c.status === 'open').length;
  const activeCount = cases.filter(c => c.status === 'active').length;
  const followUpCount = cases.filter(c => c.status === 'follow_up').length;
  const upcomingVisits = visits.filter(v => v.status === 'scheduled').length;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-teal-50 dark:bg-teal-900/30 rounded-lg">
                <ClipboardList className="w-5 h-5 text-teal-600 dark:text-teal-400" />
              </div>
              <div>
                <h1 className="font-semibold text-slate-800 dark:text-slate-100">Case Management</h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Registry · visits · notes · status tracking
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Select value={selectedForm} onValueChange={setSelectedForm}>
                <SelectTrigger className="w-52 text-sm" data-testid="select-cases-form">
                  <SelectValue placeholder="All forms" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All forms</SelectItem>
                  {forms.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="icon"
                onClick={() => { refetchCases(); refetchVisits(); refetchNotes(); }}
                data-testid="button-refresh-cases">
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Stats strip */}
          <div className="flex flex-wrap items-center gap-6 pb-3 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-blue-500" />
              <span className="font-medium text-blue-700">{openCount}</span> open
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
              <span className="font-medium text-emerald-700">{activeCount}</span> active
            </span>
            <span className="flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
              <span className="font-medium text-amber-700">{followUpCount}</span> follow-up
            </span>
            <span className="flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5 text-purple-500" />
              <span className="font-medium text-slate-700">{upcomingVisits}</span> upcoming visits
            </span>
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 overflow-x-auto scrollbar-hide -mb-px">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors',
                  tab === t.id
                    ? 'border-teal-600 text-teal-700 dark:text-teal-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700',
                )}
                data-testid={`tab-cases-${t.id}`}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">

        {/* ══════════════════════════ REGISTRY ═══════════════════════════════ */}
        {tab === 'registry' && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3 items-center justify-between">
              <h2 className="font-medium text-slate-800 dark:text-slate-100">
                Case Registry
                <span className="ml-2 text-sm font-normal text-slate-400">({filteredCases.length})</span>
              </h2>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input placeholder="Search cases…" className="pl-9 w-48 text-sm" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-cases" />
                </div>
                <Button size="sm" className="gap-1.5" onClick={() => setCaseDialog(true)} data-testid="button-open-case">
                  <Plus className="w-4 h-4" /> Open Case
                </Button>
              </div>
            </div>

            {casesLoading ? (
              <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
            ) : filteredCases.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
                <ClipboardList className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">No cases yet</p>
                <p className="text-sm text-slate-400 mb-4">Cases link field data collection to specific individuals, households, or units that need follow-up.</p>
                <Button size="sm" className="gap-1.5" onClick={() => setCaseDialog(true)}>
                  <Plus className="w-4 h-4" /> Open Case
                </Button>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      {['Case Ref', 'Type', 'Subject', 'Assignee', 'Priority', 'Status', 'Opened', ''].map(h => (
                        <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCases.map((c, i) => {
                      const st = STATUS_CFG[c.status] ?? STATUS_CFG.open;
                      const pr = PRIORITY_CFG[c.priority] ?? PRIORITY_CFG.medium;
                      return (
                        <tr key={c.id} className={cn('border-b border-slate-50 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50', i % 2 === 1 && 'bg-slate-50/30 dark:bg-slate-800/10')} data-testid={`row-case-${c.id}`}>
                          <td className="px-4 py-3 font-mono text-sm font-semibold text-indigo-700 dark:text-indigo-400"
                            onClick={() => { setSelectedCase(c.id); setTab('visits'); }}>
                            {c.case_ref}
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-xs">{c.case_type ?? '—'}</td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-700 dark:text-slate-200">{c.subject_name ?? '—'}</div>
                            {c.subject_id && <div className="text-xs text-slate-400 font-mono">{c.subject_id}</div>}
                          </td>
                          <td className="px-4 py-3 text-slate-500">{c.assignee_name ?? '—'}</td>
                          <td className="px-4 py-3">
                            <Badge variant="secondary" className={cn('text-xs capitalize', pr)}>{c.priority}</Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="secondary" className={cn('text-xs flex items-center gap-1 w-fit', st.cls)}>
                              {st.icon}{st.label}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-400">
                            {format(parseISO(c.opened_at), 'dd MMM yy')}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-500" title="Schedule visit"
                                onClick={() => { setVCaseId(c.id); setVisitDialog(true); setTab('visits'); }}
                                data-testid={`button-schedule-visit-${c.id}`}>
                                <CalendarDays className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400" title="Add note"
                                onClick={() => { setNCaseId(c.id); setNoteDialog(true); setTab('notes'); }}
                                data-testid={`button-add-note-${c.id}`}>
                                <MessageSquare className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400"
                                onClick={() => setDeleteCaseId(c.id)}
                                data-testid={`button-delete-case-${c.id}`}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════ VISITS ══════════════════════════════ */}
        {tab === 'visits' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-medium text-slate-800 dark:text-slate-100">Visit Schedule</h2>
                <p className="text-xs text-slate-500 mt-0.5">Scheduled → Attempted → Completed / Not found / Refused</p>
              </div>
              <Button size="sm" className="gap-1.5" onClick={() => setVisitDialog(true)} data-testid="button-schedule-visit">
                <Plus className="w-4 h-4" /> Schedule Visit
              </Button>
            </div>

            {selectedCase && (
              <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg px-4 py-2 text-sm text-indigo-700 flex items-center justify-between">
                <span>Showing visits for case: <strong>{cases.find(c => c.id === selectedCase)?.case_ref}</strong></span>
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setSelectedCase(null)}>
                  Show all
                </Button>
              </div>
            )}

            {visitsLoading ? (
              <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
            ) : visits.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
                <CalendarDays className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">No visits scheduled</p>
                <p className="text-sm text-slate-400 mb-4">Schedule a follow-up visit for any case to track field outreach.</p>
                <Button size="sm" className="gap-1.5" onClick={() => setVisitDialog(true)}><Plus className="w-4 h-4" /> Schedule Visit</Button>
              </div>
            ) : (
              <div className="space-y-2">
                {visits.map(v => {
                  const vs = VISIT_STATUS_CFG[v.status] ?? VISIT_STATUS_CFG.scheduled;
                  return (
                    <div key={v.id} className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-3.5 flex flex-wrap items-center gap-3" data-testid={`row-visit-${v.id}`}>
                      <div className="w-20 shrink-0 text-center">
                        <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
                          {format(parseISO(v.scheduled_date), 'dd MMM')}
                        </div>
                        {v.scheduled_time && <div className="text-xs text-slate-400">{v.scheduled_time}</div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-sm font-semibold text-indigo-600">{v.fd_cases?.case_ref ?? '—'}</span>
                          {v.fd_cases?.subject_name && <span className="text-sm text-slate-600">{v.fd_cases.subject_name}</span>}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {v.enumerator_name && <span>Enumerator: {v.enumerator_name}</span>}
                          {v.location && <span className="ml-3">📍 {v.location}</span>}
                        </div>
                        {v.outcome_notes && <p className="text-xs text-slate-500 mt-1 italic">{v.outcome_notes}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="secondary" className={cn('text-xs', vs.cls)}>{vs.label}</Badge>
                        {v.status === 'scheduled' && (
                          <Select value={v.status} onValueChange={(s) => updateVisitStatus.mutate({ id: v.id, status: s })}>
                            <SelectTrigger className="h-7 text-xs w-32" data-testid={`select-visit-status-${v.id}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {VISIT_STATUSES.map(s => (
                                <SelectItem key={s} value={s}>{VISIT_STATUS_CFG[s]?.label ?? s}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════ NOTES ════════════════════════════════ */}
        {tab === 'notes' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-medium text-slate-800 dark:text-slate-100">Case Notes</h2>
                <p className="text-xs text-slate-500 mt-0.5">Free-text observations and follow-up notes per case.</p>
              </div>
              <Button size="sm" className="gap-1.5" onClick={() => setNoteDialog(true)} data-testid="button-add-case-note">
                <Plus className="w-4 h-4" /> Add Note
              </Button>
            </div>

            {notesLoading ? (
              <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
            ) : notes.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
                <StickyNote className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">No case notes yet</p>
                <p className="text-sm text-slate-400 mb-4">Add observations, call outcomes, or field notes directly to any case.</p>
                <Button size="sm" className="gap-1.5" onClick={() => setNoteDialog(true)}><Plus className="w-4 h-4" /> Add Note</Button>
              </div>
            ) : (
              <div className="space-y-3">
                {notes.map(n => (
                  <div key={n.id} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4" data-testid={`card-note-${n.id}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-indigo-600">{n.fd_cases?.case_ref ?? '—'}</span>
                        <span className="text-xs text-slate-400">•</span>
                        <span className="text-xs text-slate-500">{n.author_name ?? 'Unknown'}</span>
                      </div>
                      <span className="text-xs text-slate-400">{format(parseISO(n.created_at), 'HH:mm dd MMM yyyy')}</span>
                    </div>
                    <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">{n.note_text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════ STATUS BOARD ════════════════════════════ */}
        {tab === 'status' && (
          <div className="space-y-4">
            <div>
              <h2 className="font-medium text-slate-800 dark:text-slate-100">Status Board</h2>
              <p className="text-xs text-slate-500 mt-0.5">Cases grouped by status. Click a status to move a case.</p>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              {CASE_STATUSES.map(st => {
                const cfg = STATUS_CFG[st];
                const cols = casesByStatus[st] ?? [];
                return (
                  <div key={st} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <div className={cn('px-3 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between')}>
                      <div className="flex items-center gap-1.5">
                        <span className={cn('flex items-center gap-1 text-xs font-semibold capitalize px-2 py-0.5 rounded-full', cfg.cls)}>
                          {cfg.icon} {cfg.label}
                        </span>
                      </div>
                      <span className="text-xs font-bold text-slate-500">{cols.length}</span>
                    </div>
                    <div className="p-2 space-y-2 min-h-[120px] max-h-[480px] overflow-y-auto">
                      {cols.length === 0 && (
                        <div className="text-xs text-slate-300 text-center py-4">No cases</div>
                      )}
                      {cols.map(c => {
                        const pr = PRIORITY_CFG[c.priority] ?? PRIORITY_CFG.medium;
                        return (
                          <div key={c.id} className="bg-slate-50 dark:bg-slate-800 rounded-lg p-2.5 text-xs space-y-1.5" data-testid={`card-status-${c.id}`}>
                            <div className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{c.case_ref}</div>
                            <div className="text-slate-600 dark:text-slate-300 truncate">{c.subject_name ?? '—'}</div>
                            <div className="flex items-center justify-between gap-1">
                              <Badge variant="secondary" className={cn('text-xs py-0', pr)}>{c.priority}</Badge>
                              {st !== 'closed' && st !== 'rejected' && (
                                <Select
                                  value={c.status}
                                  onValueChange={(s) => updateCaseStatus.mutate({ id: c.id, status: s })}
                                >
                                  <SelectTrigger className="h-5 text-xs w-[90px] px-1.5 py-0" data-testid={`select-case-status-${c.id}`}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {CASE_STATUSES.map(s => (
                                      <SelectItem key={s} value={s}>{STATUS_CFG[s]?.label ?? s}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>

      {/* ── Open Case Dialog ─────────────────────────────────────────────── */}
      <Dialog open={caseDialog} onOpenChange={setCaseDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Open New Case</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Case Reference <span className="text-red-500">*</span></Label>
                <Input className="mt-1" placeholder="e.g. CASE-00142" value={cRef} onChange={e => setCRef(e.target.value)} data-testid="input-case-ref" />
              </div>
              <div>
                <Label>Case Type</Label>
                <Input className="mt-1" placeholder="e.g. Household, Health" value={cType} onChange={e => setCType(e.target.value)} data-testid="input-case-type" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Subject Name</Label>
                <Input className="mt-1" placeholder="Full name" value={cSubjectName} onChange={e => setCSubjectName(e.target.value)} data-testid="input-subject-name" />
              </div>
              <div>
                <Label>Subject ID</Label>
                <Input className="mt-1" placeholder="e.g. HH-00142" value={cSubjectId} onChange={e => setCSubjectId(e.target.value)} data-testid="input-subject-id" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Assignee</Label>
                <Input className="mt-1" placeholder="Staff name" value={cAssignee} onChange={e => setCAssignee(e.target.value)} data-testid="input-case-assignee" />
              </div>
              <div>
                <Label>Priority</Label>
                <Select value={cPriority} onValueChange={setCPriority}>
                  <SelectTrigger className="mt-1" data-testid="select-case-priority"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['low', 'medium', 'high', 'urgent'].map(p => (
                      <SelectItem key={p} value={p} className="capitalize">{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Linked Form (optional)</Label>
              <Select value={cFormId} onValueChange={setCFormId}>
                <SelectTrigger className="mt-1" data-testid="select-case-form"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {forms.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCaseDialog(false)}>Cancel</Button>
            <Button onClick={() => createCaseMutation.mutate()} disabled={!cRef.trim() || createCaseMutation.isPending} data-testid="button-save-case">
              {createCaseMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Open Case
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Schedule Visit Dialog ─────────────────────────────────────────── */}
      <Dialog open={visitDialog} onOpenChange={setVisitDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Schedule Visit</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Case <span className="text-red-500">*</span></Label>
              <Select value={vCaseId} onValueChange={setVCaseId}>
                <SelectTrigger className="mt-1" data-testid="select-visit-case"><SelectValue placeholder="Select case…" /></SelectTrigger>
                <SelectContent>
                  {cases.map(c => <SelectItem key={c.id} value={c.id}>{c.case_ref}{c.subject_name ? ` — ${c.subject_name}` : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date <span className="text-red-500">*</span></Label>
                <Input className="mt-1" type="date" value={vDate} onChange={e => setVDate(e.target.value)} data-testid="input-visit-date" />
              </div>
              <div>
                <Label>Time</Label>
                <Input className="mt-1" type="time" value={vTime} onChange={e => setVTime(e.target.value)} data-testid="input-visit-time" />
              </div>
            </div>
            <div>
              <Label>Enumerator</Label>
              <Input className="mt-1" placeholder="Name of field staff" value={vEnumerator} onChange={e => setVEnumerator(e.target.value)} data-testid="input-visit-enumerator" />
            </div>
            <div>
              <Label>Location / Address</Label>
              <Input className="mt-1" placeholder="Optional location details" value={vLocation} onChange={e => setVLocation(e.target.value)} data-testid="input-visit-location" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVisitDialog(false)}>Cancel</Button>
            <Button onClick={() => createVisitMutation.mutate()} disabled={!vCaseId || !vDate || createVisitMutation.isPending} data-testid="button-save-visit">
              {createVisitMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Note Dialog ───────────────────────────────────────────────── */}
      <Dialog open={noteDialog} onOpenChange={setNoteDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Case Note</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Case <span className="text-red-500">*</span></Label>
              <Select value={nCaseId} onValueChange={setNCaseId}>
                <SelectTrigger className="mt-1" data-testid="select-note-case"><SelectValue placeholder="Select case…" /></SelectTrigger>
                <SelectContent>
                  {cases.map(c => <SelectItem key={c.id} value={c.id}>{c.case_ref}{c.subject_name ? ` — ${c.subject_name}` : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Note <span className="text-red-500">*</span></Label>
              <Textarea className="mt-1" rows={5} placeholder="Observations, outcomes, next steps…" value={nText} onChange={e => setNText(e.target.value)} data-testid="input-note-text" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteDialog(false)}>Cancel</Button>
            <Button onClick={() => createNoteMutation.mutate()} disabled={!nCaseId || !nText.trim() || createNoteMutation.isPending} data-testid="button-save-note">
              {createNoteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Add Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ────────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteCaseId} onOpenChange={v => !v && setDeleteCaseId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete case?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the case along with all its visits and notes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteCaseId && deleteCaseMutation.mutate(deleteCaseId)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
