import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import {
  format, getISOWeek, startOfISOWeek, endOfISOWeek,
  parseISO, isValid, subWeeks, differenceInDays,
} from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Project } from '@/types/project';
import { getEffectiveStages, getProjectStageProgress } from '@/config/projectFlows';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, LabelList,
  BarChart, Bar,
} from 'recharts';
import {
  Target, AlertTriangle, CheckCircle, TrendingUp, Clock3,
  ShieldAlert, Headphones, Users, ClipboardList, CalendarClock,
  RefreshCw, CalendarCheck, ShieldCheck, Wallet, Printer,
  Activity, Milestone, Layers, Link2, CheckSquare, Square,
  GitBranch, ExternalLink, Briefcase, MapPin, DollarSign,
  Calendar, LayoutDashboard, BarChart2, TriangleAlert,
  Plus, Edit2, Trash2, Loader2, Flame, ChevronDown, ChevronUp, Zap,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/context/user/UserContext';
import { cn } from '@/lib/utils';

/* ─── Types ──────────────────────────────────────────────────────────── */
interface Risk {
  id: string; title: string; category: string; risk_score: number;
  likelihood: string | null; impact: string | null;
  status: string; owner_id: string | null; mitigation_plan: string | null;
  contingency_plan: string | null; due_date: string | null; updated_at: string;
  responsible_unit: string | null; resolution_date: string | null;
}
interface MilestoneLite { id: string; title: string; status: string; due_date: string | null; }
interface MmpLite { id: string; name?: string; status?: string; }
interface CrmOppty { id: string; title: string; stage: string; value_usd: number | null; expected_close_date: string | null; }

interface Props {
  project: Project;
  currentFlowStageId?: string;
}

type TabId = 'overview' | 'timeline' | 'team' | 'risks';

/* ─── Helpers ────────────────────────────────────────────────────────── */
function getRiskMeta(score: number) {
  if (score >= 17) return { label: 'Critical', color: 'text-red-600 dark:text-red-400',      bg: 'bg-red-50 dark:bg-red-950/40',       border: 'border-red-200 dark:border-red-800',    dot: 'bg-red-500',    bar: '#ef4444' };
  if (score >= 10) return { label: 'High',     color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-950/40',  border: 'border-orange-200 dark:border-orange-800', dot: 'bg-orange-500', bar: '#f97316' };
  if (score >= 5)  return { label: 'Medium',   color: 'text-amber-600 dark:text-amber-400',   bg: 'bg-amber-50 dark:bg-amber-950/40',    border: 'border-amber-200 dark:border-amber-800',  dot: 'bg-amber-500',  bar: '#f59e0b' };
  return              { label: 'Low',      color: 'text-green-600 dark:text-green-400',   bg: 'bg-green-50 dark:bg-green-950/40',    border: 'border-green-200 dark:border-green-800',  dot: 'bg-green-500',  bar: '#22c55e' };
}
const STATUS_META: Record<string, { label: string; color: string; dot: string }> = {
  draft:     { label: 'Draft',     color: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',        dot: 'bg-slate-400' },
  active:    { label: 'Active',    color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300', dot: 'bg-emerald-500' },
  onHold:    { label: 'On Hold',   color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',      dot: 'bg-amber-500' },
  completed: { label: 'Completed', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300',  dot: 'bg-indigo-500' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',              dot: 'bg-red-500' },
};
const CRM_STAGE_META: Record<string, { label: string; color: string }> = {
  prospect:    { label: 'Prospect',    color: 'text-slate-600 dark:text-slate-400' },
  proposal:    { label: 'Proposal',    color: 'text-blue-600 dark:text-blue-400' },
  negotiation: { label: 'Negotiation', color: 'text-amber-600 dark:text-amber-400' },
  won:         { label: 'Won ✓',       color: 'text-emerald-600 dark:text-emerald-400' },
  lost:        { label: 'Lost',        color: 'text-red-600 dark:text-red-400' },
};
const FOLLOW_UP_LABELS: Record<string, string> = {
  open: 'In Progress', mitigated: 'Mitigated', accepted: 'Accepted', closed: 'Resolved',
};
const RISK_CATEGORIES = ['operational','financial','technical','schedule','resource','external','compliance','security'];
const LIKELIHOOD_OPTS = [
  { value: 'very_low', label: 'Very Low', score: 1 },
  { value: 'low',      label: 'Low',      score: 2 },
  { value: 'medium',   label: 'Medium',   score: 3 },
  { value: 'high',     label: 'High',     score: 4 },
  { value: 'very_high',label: 'Very High',score: 5 },
];
const IMPACT_OPTS = [
  { value: 'negligible', label: 'Negligible', score: 1 },
  { value: 'minor',      label: 'Minor',      score: 2 },
  { value: 'moderate',   label: 'Moderate',   score: 3 },
  { value: 'major',      label: 'Major',      score: 4 },
  { value: 'critical',   label: 'Critical',   score: 5 },
];
const RISK_STATUS_CFG: Record<string, { label: string; badge: string }> = {
  open:      { label: 'Open',      badge: 'bg-red-100 text-red-700 dark:bg-red-900/40' },
  mitigated: { label: 'Mitigated', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40' },
  closed:    { label: 'Closed',    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40' },
  accepted:  { label: 'Accepted',  badge: 'bg-gray-100 text-gray-700 dark:bg-gray-800' },
};
const BLANK_RISK = {
  title: '', description: '', category: 'operational', likelihood: 'medium',
  impact: 'moderate', status: 'open', mitigation_plan: '', contingency_plan: '',
  due_date: '', responsible_unit: '',
};
function healthMeta(score: number) {
  if (score >= 80) return { label: 'Excellent', color: '#10b981', ring: 'text-emerald-500', bg: 'bg-emerald-500', track: 'bg-emerald-100 dark:bg-emerald-950/40' };
  if (score >= 65) return { label: 'Good',      color: '#6366f1', ring: 'text-indigo-500',  bg: 'bg-indigo-500',  track: 'bg-indigo-100 dark:bg-indigo-950/40' };
  if (score >= 45) return { label: 'Fair',      color: '#f59e0b', ring: 'text-amber-500',   bg: 'bg-amber-500',   track: 'bg-amber-100 dark:bg-amber-950/40' };
  if (score >= 25) return { label: 'At Risk',   color: '#f97316', ring: 'text-orange-500',  bg: 'bg-orange-500',  track: 'bg-orange-100 dark:bg-orange-950/40' };
  return                   { label: 'Critical', color: '#ef4444', ring: 'text-red-500',     bg: 'bg-red-500',     track: 'bg-red-100 dark:bg-red-950/40' };
}
function safeParseISO(s: string | null | undefined): Date | null {
  if (!s) return null;
  try { const d = parseISO(s); return isValid(d) ? d : null; } catch { return null; }
}
function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

/* ── SVG health ring ── */
function HealthRing({ score, size = 76 }: { score: number; size?: number }) {
  const meta   = healthMeta(score);
  const r      = (size - 10) / 2;
  const circ   = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="currentColor" strokeWidth={8} className="text-muted/30" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={meta.color} strokeWidth={8} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-lg font-black leading-none ${meta.ring}`}>{score}</span>
        <span className="text-[8px] text-muted-foreground font-medium">/ 100</span>
      </div>
    </div>
  );
}

/* ── Stat Pill ── */
function StatPill({
  icon, label, value, sub, accent = '', warn = false, danger = false,
}: {
  icon: React.ReactNode; label: string; value: string | number;
  sub?: string; accent?: string; warn?: boolean; danger?: boolean;
}) {
  const bg = danger ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'
           : warn   ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'
           : 'bg-card border';
  const valCls = danger ? 'text-red-600 dark:text-red-400'
               : warn   ? 'text-amber-600 dark:text-amber-400'
               : accent || 'text-foreground';
  return (
    <div className={`rounded-xl border px-3 py-2.5 flex items-center gap-2.5 ${bg}`}>
      <div className={`p-1.5 rounded-lg bg-muted/60 flex-shrink-0 ${valCls}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className={`text-sm font-black leading-none mt-0.5 ${valCls}`}>{value}</p>
        {sub && <p className="text-[9px] text-muted-foreground mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  );
}

/* ─── Component ──────────────────────────────────────────────────────── */
export function ProjectWeeklyDashboard({ project, currentFlowStageId }: Props) {
  const navigate = useNavigate();

  const { toast } = useToast();
  const { currentUser } = useUser();

  const [risks, setRisks]           = useState<Risk[]>([]);
  const [milestones, setMilestones] = useState<MilestoneLite[]>([]);
  const [mmps, setMmps]             = useState<MmpLite[]>([]);
  const [crmOppty, setCrmOppty]     = useState<CrmOppty | null>(null);
  const [loading, setLoading]       = useState(true);
  const [activeTab, setActiveTab]   = useState<TabId>('overview');
  const [includeSubActs, setIncludeSubActs] = useState(false);
  const dashRef = useRef<HTMLDivElement>(null);

  // Risk management state
  const [riskDialogOpen, setRiskDialogOpen] = useState(false);
  const [riskEditing, setRiskEditing] = useState<Risk | null>(null);
  const [riskForm, setRiskForm] = useState({ ...BLANK_RISK });
  const [riskSaving, setRiskSaving] = useState(false);
  const [riskDeleting, setRiskDeleting] = useState<string | null>(null);
  const [riskStatusFilter, setRiskStatusFilter] = useState('all');
  const [expandedRiskId, setExpandedRiskId] = useState<string | null>(null);
  const [selectedRiskIds, setSelectedRiskIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState('closed');
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const hasAutoDetectedRef = useRef<string | null>(null);

  const refreshRisks = useCallback(async () => {
    const { data } = await supabase
      .from('project_risks')
      .select('id,title,category,risk_score,likelihood,impact,status,owner_id,mitigation_plan,contingency_plan,due_date,updated_at,responsible_unit,resolution_date')
      .eq('project_id', project.id)
      .order('risk_score', { ascending: false });
    if (data) setRisks(data as Risk[]);
  }, [project.id]);

  function openNewRisk() {
    setRiskEditing(null);
    setRiskForm({ ...BLANK_RISK });
    setRiskDialogOpen(true);
  }

  function openEditRisk(r: Risk) {
    setRiskEditing(r);
    setRiskForm({
      title: r.title,
      description: '',
      category: r.category,
      likelihood: r.likelihood ?? 'medium',
      impact: r.impact ?? 'moderate',
      status: r.status,
      mitigation_plan: r.mitigation_plan ?? '',
      contingency_plan: r.contingency_plan ?? '',
      due_date: r.due_date ?? '',
      responsible_unit: r.responsible_unit ?? '',
    });
    setRiskDialogOpen(true);
  }

  function dispatchRiskNotification(eventType: 'project_risk_added' | 'project_risk_updated', riskPayload: any) {
    const uuidRx = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const teamRaw: string[] = [
      (project.team as any)?.projectManager,
      ...((project.team as any)?.members ?? []),
    ].filter((v): v is string => !!v && uuidRx.test(v));
    const recipientIds = [...new Set(teamRaw)].filter(id => id !== currentUser?.id);
    if (!recipientIds.length) return;

    const isAdd = eventType === 'project_risk_added';
    supabase.functions.invoke('dispatch-notification', {
      body: {
        event_type: eventType,
        entity_type: 'project',
        entity_id: project.id,
        priority: isAdd ? 'high' : 'normal',
        recipient_ids: recipientIds,
        title_en: isAdd ? `New Risk Logged: ${project.name}` : `Risk Updated: ${project.name}`,
        title_ar: isAdd ? `تم تسجيل مخاطرة جديدة: ${project.name}` : `تم تحديث مخاطرة: ${project.name}`,
        message_en: isAdd
          ? `${currentUser?.fullName ?? 'A team member'} logged a new ${riskPayload.category} risk "${riskPayload.title}" (score: ${riskPayload.risk_score}) in "${project.name}"`
          : `${currentUser?.fullName ?? 'A team member'} updated risk "${riskPayload.title}" — status: ${riskPayload.status} in "${project.name}"`,
        message_ar: isAdd
          ? `سجّل ${currentUser?.fullName ?? 'أحد أعضاء الفريق'} مخاطرة جديدة "${riskPayload.title}" (درجة: ${riskPayload.risk_score}) في مشروع "${project.name}"`
          : `حدّث ${currentUser?.fullName ?? 'أحد أعضاء الفريق'} المخاطرة "${riskPayload.title}" — الحالة: ${riskPayload.status} في مشروع "${project.name}"`,
        triggered_by: currentUser?.id,
        triggered_by_name: currentUser?.fullName,
        action_url: `/projects/${project.id}`,
        send_email: true,
        metadata: {
          project_name: project.name,
          risk_title: riskPayload.title,
          category: riskPayload.category,
          risk_score: riskPayload.risk_score,
          status: riskPayload.status,
          due_date: riskPayload.due_date ?? undefined,
          responsible_unit: riskPayload.responsible_unit ?? undefined,
        },
      },
    }).catch(() => {});
  }

  async function handleSaveRisk() {
    if (!riskForm.title.trim()) return;
    setRiskSaving(true);
    const lScore = LIKELIHOOD_OPTS.find(o => o.value === riskForm.likelihood)?.score ?? 3;
    const iScore = IMPACT_OPTS.find(o => o.value === riskForm.impact)?.score ?? 3;
    const payload: any = {
      project_id: project.id,
      title: riskForm.title.trim(),
      category: riskForm.category,
      likelihood: riskForm.likelihood,
      impact: riskForm.impact,
      risk_score: lScore * iScore,
      status: riskForm.status,
      mitigation_plan: riskForm.mitigation_plan || null,
      contingency_plan: riskForm.contingency_plan || null,
      due_date: riskForm.due_date || null,
      responsible_unit: riskForm.responsible_unit || null,
      created_by: currentUser?.id ?? null,
      updated_at: new Date().toISOString(),
    };
    if (riskEditing) {
      const { error } = await supabase.from('project_risks').update(payload).eq('id', riskEditing.id);
      if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); }
      else {
        toast({ title: 'Risk updated' });
        setRiskDialogOpen(false);
        refreshRisks();
        dispatchRiskNotification('project_risk_updated', payload);
      }
    } else {
      const { error } = await supabase.from('project_risks').insert(payload);
      if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); }
      else {
        toast({ title: 'Risk added' });
        setRiskDialogOpen(false);
        refreshRisks();
        dispatchRiskNotification('project_risk_added', payload);
      }
    }
    setRiskSaving(false);
  }

  async function handleDeleteRisk(id: string) {
    setRiskDeleting(id);
    await supabase.from('project_risks').delete().eq('id', id);
    toast({ title: 'Risk deleted' });
    setRisks(p => p.filter(r => r.id !== id));
    setSelectedRiskIds(p => { const n = new Set(p); n.delete(id); return n; });
    setRiskDeleting(null);
  }

  async function handleBulkStatus() {
    if (selectedRiskIds.size === 0) return;
    setBulkUpdating(true);
    const ids = [...selectedRiskIds];
    await supabase.from('project_risks')
      .update({ status: bulkStatus, updated_at: new Date().toISOString() })
      .in('id', ids);
    toast({ title: `${ids.length} risk${ids.length > 1 ? 's' : ''} updated to "${RISK_STATUS_CFG[bulkStatus]?.label ?? bulkStatus}"` });
    setSelectedRiskIds(new Set());
    setBulkUpdating(false);
    refreshRisks();
  }

  function toggleSelectRisk(id: string) {
    setSelectedRiskIds(p => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  function toggleSelectAll(riskIds: string[]) {
    if (riskIds.every(id => selectedRiskIds.has(id))) {
      setSelectedRiskIds(new Set());
    } else {
      setSelectedRiskIds(new Set(riskIds));
    }
  }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const relatedMMPs = (project as any).relatedMMPs ?? [];
    const crmId = (project as any).crmOpportunityId;
    Promise.all([
      supabase.from('project_risks')
        .select('id,title,category,risk_score,likelihood,impact,status,owner_id,mitigation_plan,contingency_plan,due_date,updated_at,responsible_unit,resolution_date')
        .eq('project_id', project.id).order('risk_score', { ascending: false }),
      supabase.from('project_milestones')
        .select('id,title,status,due_date')
        .eq('project_id', project.id).order('due_date', { ascending: true, nullsFirst: false }),
      relatedMMPs.length > 0
        ? supabase.from('mmp_files').select('id,name,status').in('id', relatedMMPs.slice(0, 50))
        : Promise.resolve({ data: [] }),
      crmId
        ? supabase.from('crm_opportunities').select('id,title,stage,value_usd,expected_close_date').eq('id', crmId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]).then(([r, m, mmpRes, crmRes]) => {
      if (!alive) return;
      setRisks((r.data || []) as Risk[]);
      setMilestones((m.data || []) as MilestoneLite[]);
      setMmps((mmpRes.data || []) as MmpLite[]);
      setCrmOppty(crmRes.data as CrmOppty | null);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [project.id]);

  /* ── Auto-risk detection ────────────────────────────────────────────── */
  useEffect(() => {
    if (loading || hasAutoDetectedRef.current === project.id) return;
    hasAutoDetectedRef.current = project.id;

    const now2 = new Date();

    // Derive values needed for rules
    const acts: any[] = (project as any).activities || [];
    const overdueActsCount = acts.filter((a: any) => {
      if (a.status === 'completed' || a.status === 'cancelled') return false;
      const e = a.endDate ? new Date(a.endDate) : null;
      return e ? e < now2 : false;
    }).length;

    const overdueMsCount = milestones.filter(m =>
      m.status !== 'completed' && m.due_date && new Date(m.due_date) < now2
    ).length;

    const bTotal = (project as any).budget?.total ?? 0;
    const bAlloc = (project as any).budget?.allocated ?? 0;
    const bPct   = bTotal > 0 ? Math.round((bAlloc / bTotal) * 100) : 0;

    const projEnd = (project as any).endDate ? new Date((project as any).endDate) : null;
    const daysLeft = projEnd
      ? Math.ceil((projEnd.getTime() - now2.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    const tCount = (project as any).team?.teamComposition?.length ||
                   (project as any).team?.members?.length || 0;

    // Build triggered rules
    const triggered: Array<{ category: string; title: string; score: number; mitigation: string }> = [];

    // Rule 1 — Schedule: deadline approaching within 14 days
    if (
      daysLeft !== null && daysLeft >= 0 && daysLeft <= 14 &&
      (project as any).status !== 'completed' && (project as any).status !== 'cancelled'
    ) {
      triggered.push({
        category: 'schedule',
        title: `Project deadline in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
        score: daysLeft <= 3 ? 20 : daysLeft <= 7 ? 15 : 9,
        mitigation: 'Review remaining activities and milestones. Escalate any blockers immediately to project leadership.',
      });
    }

    // Rule 2 — Financial: high budget utilization
    if (bTotal > 0 && bPct >= 85) {
      triggered.push({
        category: 'financial',
        title: `Budget at ${bPct}% utilization`,
        score: bPct >= 95 ? 20 : 12,
        mitigation: 'Review expenditure against remaining deliverables. Seek budget extension or reduce remaining scope.',
      });
    }

    // Rule 3 — Delivery: 3+ overdue activities
    if (overdueActsCount >= 3) {
      triggered.push({
        category: 'operational',
        title: `${overdueActsCount} activities are overdue`,
        score: overdueActsCount >= 7 ? 16 : 10,
        mitigation: 'Review overdue activities with activity owners. Reassign or reprioritize tasks to recover the schedule.',
      });
    }

    // Rule 4 — Milestone: any overdue milestone
    if (overdueMsCount >= 1) {
      triggered.push({
        category: 'external',
        title: `${overdueMsCount} milestone${overdueMsCount > 1 ? 's are' : ' is'} past due`,
        score: 15,
        mitigation: 'Review overdue milestones with stakeholders. Update milestone dates or accelerate delivery.',
      });
    }

    // Rule 5 — Resource: no team on active project
    if (tCount === 0 && (project as any).status === 'active') {
      triggered.push({
        category: 'resource',
        title: 'No team members assigned to this project',
        score: 12,
        mitigation: 'Assign team members via the Team tab to ensure project accountability and task ownership.',
      });
    }

    if (triggered.length === 0) return;

    // Dedup — skip categories already auto-flagged (any status)
    const autoCategories = new Set(
      risks.filter((r: Risk) => r.responsible_unit === '__auto__').map((r: Risk) => r.category)
    );
    const toCreate = triggered.filter(r => !autoCategories.has(r.category));
    if (toCreate.length === 0) return;

    supabase.from('project_risks').insert(
      toCreate.map(r => ({
        project_id: project.id,
        title: r.title,
        category: r.category,
        risk_score: r.score,
        likelihood: null,
        impact: null,
        status: 'open',
        mitigation_plan: r.mitigation,
        contingency_plan: null,
        due_date: null,
        responsible_unit: '__auto__',
        created_by: null,
        updated_at: new Date().toISOString(),
      }))
    ).then(({ error }) => {
      if (!error) {
        refreshRisks();
        toast({
          title: `${toCreate.length} risk${toCreate.length > 1 ? 's' : ''} auto-detected`,
          description: toCreate.map(r => r.title).join(' · '),
        });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, project.id]);

  const now = useMemo(() => new Date(), []);
  const weekNumber  = getISOWeek(now);
  const weekStart   = startOfISOWeek(now);
  const weekEnd     = endOfISOWeek(now);

  /* ── Activities ── */
  const activities      = project.activities || [];
  const totalActs       = activities.length;
  const completedActs   = activities.filter((a: any) => a.status === 'completed').length;
  const inProgressActs  = activities.filter((a: any) => a.status === 'inProgress').length;
  const allSubActs      = activities.flatMap((a: any) => a.subActivities || []);
  const completedSubActs   = allSubActs.filter((s: any) => s.status === 'completed').length;
  const inProgressSubActs  = allSubActs.filter((s: any) => s.status === 'inProgress').length;
  const totalCount      = includeSubActs ? totalActs + allSubActs.length : totalActs;
  const completedCount  = includeSubActs ? completedActs + completedSubActs : completedActs;
  const inProgressCount = includeSubActs ? inProgressActs + inProgressSubActs : inProgressActs;
  const notStartedCount = Math.max(totalCount - completedCount - inProgressCount, 0);
  const overallProgress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const pct = (n: number) => totalCount > 0 ? Math.round((n / totalCount) * 100) : 0;

  const overdueActs = activities.filter((a: any) => {
    if (a.status === 'completed' || a.status === 'cancelled') return false;
    const e = safeParseISO(a.endDate); return e ? e < now : false;
  }).length;
  const thisWeekDue = activities.filter((a: any) => {
    if (a.status === 'completed' || a.status === 'cancelled') return false;
    const e = safeParseISO(a.endDate); return e ? e >= weekStart && e <= weekEnd : false;
  }).length;

  /* ── Milestones ── */
  const totalMilestones     = milestones.length;
  const completedMilestones = milestones.filter(m => m.status === 'completed').length;
  const overdueMilestones   = milestones.filter(m => m.status !== 'completed' && safeParseISO(m.due_date) && safeParseISO(m.due_date)! < now).length;
  const milestonePercent    = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;
  const nextMilestone       = milestones.find(m => m.status !== 'completed' && m.due_date) ?? null;
  const nextMilestoneDays   = nextMilestone?.due_date
    ? (() => { const e = safeParseISO(nextMilestone.due_date); return e ? differenceInDays(e, now) : null; })() : null;

  /* ── Risks ── */
  const openRisks   = risks.filter(r => r.status === 'open');
  const topRisk     = openRisks[0] ?? null;
  const topRiskMeta = topRisk ? getRiskMeta(topRisk.risk_score)
    : { label: 'None', color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-950/30',
        border: 'border-green-200 dark:border-green-800', dot: 'bg-green-500', bar: '#22c55e' };

  /* ── Budget ── */
  const budget          = (project as any).budget ?? null;
  const budgetTotal     = budget?.total ?? 0;
  const budgetAllocated = budget?.allocated ?? 0;
  const budgetCurrency  = budget?.currency ?? 'USD';
  const budgetRemaining = budget?.remaining ?? (budgetTotal - budgetAllocated);
  const budgetUsedPct   = budgetTotal > 0 ? Math.round((budgetAllocated / budgetTotal) * 100) : 0;

  /* ── Days remaining ── */
  const daysRemaining = useMemo(() => {
    const e = safeParseISO(project.endDate);
    return e ? differenceInDays(e, now) : null;
  }, [project.endDate, now]);

  /* ── Team ── */
  const teamComposition: any[] = (project as any).team?.teamComposition ?? [];
  const teamMembers: string[]  = (project as any).team?.members ?? [];
  const teamCount = teamComposition.length || teamMembers.length;
  const workloadData = useMemo(() =>
    teamComposition
      .filter(m => m.name && (m.workload ?? 0) > 0)
      .map(m => ({ name: m.name.split(' ')[0], workload: m.workload, role: m.role ?? '' }))
      .sort((a, b) => b.workload - a.workload).slice(0, 10),
  [teamComposition]);

  /* ── Deliverables ── */
  const deliverablesState: Record<string, boolean> = (project as any).team?.deliverablesState ?? {};
  const deliverableEntries = Object.entries(deliverablesState);
  const deliverablesDone   = deliverableEntries.filter(([, v]) => v).length;

  /* ── Stage pipeline ── */
  const resolvedFlowStageId = currentFlowStageId ?? project.currentFlowStage;
  const effectiveStages = useMemo(() =>
    getEffectiveStages(project.projectType ?? 'tpm', (project as any).customFlowStages ?? null),
  [project.projectType, project.customFlowStages]);
  const stageProgress = useMemo(() =>
    getProjectStageProgress(project.projectType ?? 'tpm', resolvedFlowStageId, (project as any).customFlowStages ?? null),
  [project.projectType, resolvedFlowStageId, project.customFlowStages]);
  const currentStageIdx = stageProgress?.stageIdx ?? 0;

  /* ── Health score ── */
  const healthScore = useMemo(() => {
    const actScore  = totalCount > 0 ? (completedCount / totalCount) * 40 : 20;
    const riskScore = openRisks.length === 0 ? 30 : Math.max(0, 30 - openRisks.length * 5);
    const msScore   = totalMilestones > 0 ? (completedMilestones / totalMilestones) * 30 : 15;
    return Math.min(100, Math.round(actScore + riskScore + msScore));
  }, [totalCount, completedCount, openRisks.length, totalMilestones, completedMilestones]);
  const health = healthMeta(healthScore);

  /* ── Progress over time ── */
  const progressOverTime = useMemo(() =>
    Array.from({ length: 6 }, (_, i) => {
      const ref  = subWeeks(now, 5 - i);
      const wEnd = endOfISOWeek(ref);
      const done = activities.filter((a: any) => {
        if (a.status !== 'completed') return false;
        const d = safeParseISO(a.endDate || a.updatedAt);
        return d ? d <= wEnd : true;
      }).length;
      return { week: `W${getISOWeek(ref)}`, progress: totalActs > 0 ? Math.round((done / totalActs) * 100) : 0 };
    }),
  [activities, totalActs, now]);

  /* ── Gantt ── */
  const ganttScale = useMemo(() => {
    const dates: Date[] = [];
    activities.forEach((a: any) => {
      const s = safeParseISO(a.startDate); const e = safeParseISO(a.endDate);
      if (s) dates.push(s); if (e) dates.push(e);
    });
    const ps = safeParseISO(project.startDate); const pe = safeParseISO(project.endDate);
    if (ps) dates.push(ps); if (pe) dates.push(pe);
    if (dates.length < 2) return null;
    const min = dates.reduce((a, b) => a < b ? a : b);
    const max = dates.reduce((a, b) => a > b ? a : b);
    return { min, max, span: Math.max(differenceInDays(max, min), 1) };
  }, [activities, project.startDate, project.endDate]);

  const gradId     = `pgGrad-${project.id}`;
  const statusMeta = STATUS_META[project.status ?? ''] ?? STATUS_META['draft'];
  const relatedMMPs: string[]       = (project as any).relatedMMPs ?? [];
  const relatedSiteVisits: string[] = (project as any).relatedSiteVisits ?? [];
  const donutData = [
    { name: 'Completed',   value: completedCount,  color: '#6366f1' },
    { name: 'In Progress', value: inProgressCount,  color: '#8b5cf6' },
    { name: 'Not Started', value: notStartedCount,  color: '#e2e8f0' },
  ].filter(d => d.value > 0);

  /* ── Tabs config ── */
  const tabs: { id: TabId; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'overview',  label: 'Overview',  icon: <LayoutDashboard className="h-3.5 w-3.5" /> },
    { id: 'timeline',  label: 'Timeline',  icon: <CalendarClock className="h-3.5 w-3.5" />, badge: activities.length || undefined },
    { id: 'team',      label: 'Team',      icon: <Users className="h-3.5 w-3.5" />, badge: teamCount || undefined },
    { id: 'risks',     label: 'Risks',     icon: <ShieldAlert className="h-3.5 w-3.5" />, badge: openRisks.length || undefined },
  ];

  /* ── Skeleton ── */
  if (loading) {
    return (
      <div className="rounded-2xl border bg-card shadow-sm overflow-hidden animate-pulse">
        <div className="h-12 bg-[#0F2041]/20" />
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-5 gap-2">{[0,1,2,3,4].map(i => <div key={i} className="h-16 bg-muted rounded-xl" />)}</div>
          <div className="h-14 bg-muted rounded-xl" />
          <div className="grid grid-cols-3 gap-3">{[0,1,2].map(i => <div key={i} className="h-48 bg-muted rounded-xl" />)}</div>
        </div>
      </div>
    );
  }

  // Pre-compute filtered risks (avoids IIFE in JSX which confuses esbuild)
  const riskFiltered = riskStatusFilter === 'all' ? risks : risks.filter(r => r.status === riskStatusFilter);

  /* ════════════════════════════════════════════════════════════════════ */
  return (
    <>
    <div ref={dashRef} className="rounded-2xl border bg-card shadow-sm overflow-hidden print:shadow-none"
      data-testid="project-weekly-dashboard">

      {/* ══════════════════════════════════════════════════════════════
          A  HEADER BAR
          ══════════════════════════════════════════════════════════════ */}
      <div className="bg-gradient-to-r from-[#0F2041] to-[#1a3560] px-5 py-3 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <BarChart2 className="h-4 w-4 text-indigo-300 flex-shrink-0" />
          <span className="text-white font-bold text-sm tracking-tight">Project Dashboard</span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${statusMeta.color}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${statusMeta.dot}`} />
            {statusMeta.label}
          </span>
        </div>
        <div className="flex items-center gap-2 text-white/60 text-xs">
          <Calendar className="h-3.5 w-3.5" />
          <span>Week {weekNumber} · {format(weekStart, 'd MMM')}–{format(weekEnd, 'd MMM yyyy')}</span>
        </div>
        <Button size="sm" variant="ghost" onClick={() => window.print()}
          className="h-7 px-2.5 text-white/60 hover:text-white hover:bg-white/10 border border-white/10 rounded-lg print:hidden"
          data-testid="dashboard-print-btn">
          <Printer className="h-3.5 w-3.5 mr-1.5" /><span className="text-xs">Export</span>
        </Button>
      </div>

      <div className="p-4 space-y-4">

        {/* ══════════════════════════════════════════════════════════════
            B  HERO ROW — health ring + 5 stat pills
            ══════════════════════════════════════════════════════════════ */}
        <div className="flex items-stretch gap-3">
          {/* Health ring card */}
          <div className={`rounded-xl border px-4 py-3 flex flex-col items-center justify-center gap-1.5 flex-shrink-0 ${health.track}`}>
            <HealthRing score={healthScore} size={72} />
            <span className={`text-[10px] font-black uppercase tracking-widest ${health.ring}`}>
              {health.label}
            </span>
            <span className="text-[9px] text-muted-foreground">Health Score</span>
          </div>
          {/* 5 stat pills */}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2 flex-1">
            <StatPill
              icon={<TrendingUp className="h-3.5 w-3.5" />}
              label="Progress" value={`${overallProgress}%`}
              sub={totalCount > 0 ? `${completedCount}/${totalCount} tasks` : 'No activities'}
              accent="text-indigo-600 dark:text-indigo-400"
            />
            <StatPill
              icon={<Target className="h-3.5 w-3.5" />}
              label="Milestones" value={`${completedMilestones}/${totalMilestones}`}
              sub={nextMilestoneDays !== null
                ? `Next in ${Math.abs(nextMilestoneDays)}d`
                : totalMilestones === 0 ? 'None set' : 'All done'}
              warn={overdueMilestones > 0}
              danger={overdueMilestones > 1}
              accent="text-violet-600 dark:text-violet-400"
            />
            <StatPill
              icon={<Calendar className="h-3.5 w-3.5" />}
              label={daysRemaining !== null && daysRemaining < 0 ? 'Days Overdue' : 'Days Remaining'}
              value={daysRemaining !== null ? Math.abs(daysRemaining) : '—'}
              sub={project.endDate ? format(parseISO(project.endDate), 'd MMM yyyy') : 'No end date'}
              warn={daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= 14}
              danger={daysRemaining !== null && daysRemaining < 0}
            />
            <StatPill
              icon={<Wallet className="h-3.5 w-3.5" />}
              label="Budget Used" value={budgetTotal > 0 ? `${budgetUsedPct}%` : '—'}
              sub={budgetTotal > 0 ? `${fmtNum(budgetRemaining)} ${budgetCurrency} left` : 'No budget set'}
              warn={budgetUsedPct > 75 && budgetUsedPct <= 90}
              danger={budgetUsedPct > 90}
              accent="text-indigo-600 dark:text-indigo-400"
            />
            <StatPill
              icon={<ShieldAlert className="h-3.5 w-3.5" />}
              label="Open Risks" value={openRisks.length}
              sub={openRisks.length > 0 ? `Highest: ${topRiskMeta.label}` : 'No open risks'}
              warn={openRisks.length > 0 && openRisks.length <= 3}
              danger={openRisks.length > 3}
            />
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════
            C  STAGE PIPELINE — full width
            ══════════════════════════════════════════════════════════════ */}
        {effectiveStages.length > 0 && (
          <div className="rounded-xl border bg-muted/20 overflow-hidden">
            <div className="px-4 py-2.5 border-b bg-muted/30 flex items-center gap-2 flex-wrap">
              <GitBranch className="h-3.5 w-3.5 text-indigo-500 flex-shrink-0" />
              <span className="text-xs font-bold text-foreground tracking-tight">Stage Pipeline</span>
              {stageProgress && (
                <>
                  <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                    · {stageProgress.stageName}
                  </span>
                  <div className="ml-auto flex items-center gap-3">
                    <div className="hidden sm:flex items-center gap-1.5 w-32">
                      <Progress value={stageProgress.pct} className="h-1.5 flex-1" />
                      <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 w-8 text-right">
                        {stageProgress.pct}%
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground font-medium">
                      {stageProgress.stageIdx + 1} of {stageProgress.totalStages}
                    </span>
                  </div>
                </>
              )}
            </div>
            <div className="px-4 py-3 overflow-x-auto">
              <div className="flex items-center gap-1.5 min-w-max">
                {effectiveStages.map((stage, idx) => {
                  const isPast    = idx < currentStageIdx;
                  const isCurrent = idx === currentStageIdx;
                  return (
                    <div key={stage.id} className="flex items-center">
                      <div className={`flex flex-col items-center gap-0.5 px-2.5 py-2 rounded-xl border text-center
                        min-w-[86px] max-w-[108px] transition-all duration-200 ${
                        isCurrent ? 'bg-indigo-600 border-indigo-700 text-white shadow-md scale-105 z-10' :
                        isPast    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400' :
                        'bg-card border-border text-muted-foreground'}`}>
                        <span className="text-[9px] font-black">
                          {isPast ? '✓ Done' : isCurrent ? '▶ Active' : String(idx + 1)}
                        </span>
                        <span className="text-[10px] font-semibold leading-tight line-clamp-2 mt-0.5">{stage.label}</span>
                      </div>
                      {idx < effectiveStages.length - 1 && (
                        <div className={`h-px w-3 flex-shrink-0 ${isPast || isCurrent ? 'bg-emerald-400' : 'bg-border'}`} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            D  TAB BAR
            ══════════════════════════════════════════════════════════════ */}
        <div className="flex items-center gap-1 p-1 bg-muted/40 rounded-xl border">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex-1 justify-center ${
                activeTab === tab.id
                  ? 'bg-card text-foreground shadow-sm border'
                  : 'text-muted-foreground hover:text-foreground hover:bg-card/50'}`}
              data-testid={`tab-${tab.id}`}>
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                  activeTab === tab.id ? 'bg-indigo-600 text-white' : 'bg-muted text-muted-foreground'}`}>
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════════════
            E  TAB CONTENT
            ══════════════════════════════════════════════════════════════ */}

        {/* ── OVERVIEW TAB ── */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

            {/* E1. Activity breakdown */}
            <Card className="border bg-muted/20 rounded-xl">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold text-foreground">Activity Status</p>
                  {allSubActs.length > 0 && (
                    <button onClick={() => setIncludeSubActs(p => !p)}
                      className="flex items-center gap-1 text-[9px] font-semibold text-indigo-500 border border-indigo-200 dark:border-indigo-800 rounded-lg px-2 py-1"
                      data-testid="include-sub-toggle">
                      <Layers className="h-2.5 w-2.5" />
                      {includeSubActs ? 'Sub-tasks on' : 'Top-level'}
                    </button>
                  )}
                </div>
                {totalCount === 0 ? (
                  <div className="flex flex-col items-center py-8 text-muted-foreground gap-2">
                    <CheckCircle className="h-10 w-10 text-muted/50" />
                    <p className="text-xs">No activities yet</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-4 mb-4">
                      <div className="relative h-[88px] w-[88px] flex-shrink-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={donutData} innerRadius="60%" outerRadius="82%"
                              dataKey="value" strokeWidth={0} startAngle={90} endAngle={-270}>
                              {donutData.map((e, i) => <Cell key={i} fill={e.color} />)}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-xl font-black leading-none text-indigo-600 dark:text-indigo-400">{overallProgress}%</span>
                          <span className="text-[8px] text-muted-foreground">complete</span>
                        </div>
                      </div>
                      <div className="space-y-2.5 flex-1">
                        {[
                          { label: 'Completed',   n: completedCount,  color: 'bg-indigo-500' },
                          { label: 'In Progress', n: inProgressCount, color: 'bg-violet-500' },
                          { label: 'Not Started', n: notStartedCount, color: 'bg-slate-200 dark:bg-slate-700' },
                        ].map(row => (
                          <div key={row.label}>
                            <div className="flex items-center justify-between mb-0.5">
                              <div className="flex items-center gap-1.5">
                                <span className={`h-2 w-2 rounded-full ${row.color}`} />
                                <span className="text-[10px] text-muted-foreground">{row.label}</span>
                              </div>
                              <span className="text-[10px] font-bold">{row.n} <span className="text-muted-foreground font-normal">({pct(row.n)}%)</span></span>
                            </div>
                            <div className="h-1 rounded-full bg-muted overflow-hidden">
                              <div className={`h-full rounded-full ${row.color}`} style={{ width: `${pct(row.n)}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {/* Mini alert strip */}
                    <div className="grid grid-cols-3 gap-1.5 pt-3 border-t">
                      {[
                        { icon: <TriangleAlert className="h-3.5 w-3.5" />, v: overdueActs,  l: 'Overdue',   c: overdueActs > 0  ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30'  : 'text-muted-foreground bg-muted/30' },
                        { icon: <CalendarClock className="h-3.5 w-3.5" />, v: thisWeekDue,  l: 'This week', c: thisWeekDue > 0  ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30' : 'text-muted-foreground bg-muted/30' },
                        { icon: <CheckCircle className="h-3.5 w-3.5" />,   v: completedActs,l: 'Done',       c: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30' },
                      ].map(s => (
                        <div key={s.l} className={`rounded-lg p-1.5 flex flex-col items-center ${s.c}`}>
                          {s.icon}
                          <span className="text-base font-black leading-none mt-1">{s.v}</span>
                          <span className="text-[9px] font-medium">{s.l}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* E2. Progress chart */}
            <Card className="border bg-muted/20 rounded-xl">
              <CardContent className="p-4">
                <p className="text-xs font-bold text-foreground mb-3">Progress Trend (6 weeks)</p>
                <ResponsiveContainer width="100%" height={174}>
                  <AreaChart data={progressOverTime} margin={{ top: 24, right: 8, left: -24, bottom: 0 }}>
                    <defs>
                      <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
                    <XAxis dataKey="week" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 9 }}
                      axisLine={false} tickLine={false} ticks={[0, 50, 100]} />
                    <Tooltip formatter={(v: number) => [`${v}%`, 'Progress']} contentStyle={{ fontSize: 11, borderRadius: 10, border: '1px solid #e2e8f0' }} />
                    <Area type="monotone" dataKey="progress" stroke="#6366f1" strokeWidth={2.5}
                      fill={`url(#${gradId})`}
                      dot={(props: any) => {
                        const last = props.index === progressOverTime.length - 1;
                        return <circle key={props.index} cx={props.cx} cy={props.cy}
                          r={last ? 5 : 3} fill="#6366f1"
                          stroke={last ? '#fff' : 'none'} strokeWidth={last ? 2 : 0} />;
                      }}
                      activeDot={{ r: 5, strokeWidth: 0 }}>
                      <LabelList dataKey="progress" content={(props: any) => {
                        const { x, y, value, index } = props;
                        if (index !== progressOverTime.length - 1 || value === 0) return null;
                        return (
                          <g key={index}>
                            <rect x={x - 18} y={y - 24} width={36} height={18} rx={6} fill="#6366f1" />
                            <text x={x} y={y - 11} textAnchor="middle" fill="#fff" fontSize={10} fontWeight={800}>{value}%</text>
                          </g>
                        );
                      }} />
                    </Area>
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* E3. Budget + Milestones */}
            <Card className="border bg-muted/20 rounded-xl">
              <CardContent className="p-4 space-y-4">
                {/* Budget */}
                {budgetTotal > 0 ? (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Wallet className="h-3.5 w-3.5 text-indigo-500" />
                      <span className="text-xs font-bold text-foreground">Budget</span>
                      <span className={`ml-auto text-sm font-black ${
                        budgetUsedPct > 90 ? 'text-red-600 dark:text-red-400' :
                        budgetUsedPct > 75 ? 'text-amber-600 dark:text-amber-400' : 'text-indigo-600 dark:text-indigo-400'}`}>
                        {budgetUsedPct}%
                      </span>
                    </div>
                    <div className="relative h-3 bg-muted rounded-full overflow-hidden mb-2">
                      <div className={`absolute inset-y-0 left-0 rounded-full transition-all ${
                        budgetUsedPct > 90 ? 'bg-red-500' : budgetUsedPct > 75 ? 'bg-amber-500' : 'bg-indigo-500'}`}
                        style={{ width: `${Math.min(budgetUsedPct, 100)}%` }} />
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                      {[
                        { l: 'Total Budget', v: `${fmtNum(budgetTotal)} ${budgetCurrency}`, c: '' },
                        { l: 'Allocated',    v: `${fmtNum(budgetAllocated)} ${budgetCurrency}`, c: '' },
                        { l: 'Remaining',    v: `${fmtNum(budgetRemaining)} ${budgetCurrency}`,
                          c: budgetRemaining < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400' },
                      ].map(r => (
                        <div key={r.l}>
                          <p className="text-[9px] text-muted-foreground">{r.l}</p>
                          <p className={`text-[11px] font-bold ${r.c}`}>{r.v}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 py-2 text-muted-foreground text-xs">
                    <Wallet className="h-4 w-4" /> No budget configured
                  </div>
                )}

                {budgetTotal > 0 && totalMilestones > 0 && <div className="border-t" />}

                {/* Milestones */}
                {totalMilestones > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Target className="h-3.5 w-3.5 text-violet-500" />
                      <span className="text-xs font-bold text-foreground">Milestones</span>
                      <span className="ml-auto text-sm font-black text-violet-600 dark:text-violet-400">
                        {milestonePercent}%
                      </span>
                    </div>
                    <div className="relative h-2 bg-muted rounded-full overflow-hidden mb-2">
                      <div className="absolute inset-y-0 left-0 rounded-full bg-violet-500"
                        style={{ width: `${milestonePercent}%` }} />
                    </div>
                    <div className="space-y-1">
                      {milestones.slice(0, 5).map(m => {
                        const dLeft = m.due_date && safeParseISO(m.due_date)
                          ? differenceInDays(safeParseISO(m.due_date)!, now) : null;
                        const isOverdue = dLeft !== null && dLeft < 0 && m.status !== 'completed';
                        return (
                          <div key={m.id} className={`flex items-center gap-2 px-2 py-1 rounded-lg ${
                            m.status === 'completed' ? 'bg-emerald-50 dark:bg-emerald-950/20' :
                            isOverdue ? 'bg-red-50 dark:bg-red-950/20' : 'bg-muted/30'}`}>
                            {m.status === 'completed'
                              ? <CheckCircle className="h-3 w-3 text-emerald-500 flex-shrink-0" />
                              : <Milestone className={`h-3 w-3 flex-shrink-0 ${isOverdue ? 'text-red-500' : dLeft !== null && dLeft <= 7 ? 'text-amber-500' : 'text-muted-foreground'}`} />}
                            <span className={`text-[10px] flex-1 leading-tight line-clamp-1 ${
                              m.status === 'completed' ? 'line-through text-muted-foreground' : ''}`}>
                              {m.title}
                            </span>
                            {dLeft !== null && m.status !== 'completed' && (
                              <span className={`text-[9px] font-bold flex-shrink-0 ${isOverdue ? 'text-red-500' : dLeft <= 7 ? 'text-amber-500' : 'text-muted-foreground'}`}>
                                {isOverdue ? `${Math.abs(dLeft)}d late` : `${dLeft}d`}
                              </span>
                            )}
                          </div>
                        );
                      })}
                      {totalMilestones > 5 && (
                        <p className="text-[9px] text-muted-foreground text-center pt-1">
                          +{totalMilestones - 5} more
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── OVERVIEW: Top Challenge Block (always visible, matches reference design) ── */}
        {activeTab === 'overview' && topRisk && (
          <div className={`rounded-xl border overflow-hidden ${topRiskMeta.bg} ${topRiskMeta.border}`}>
            {/* Block header */}
            <div className="px-4 py-2.5 border-b border-current/10 flex items-center gap-2">
              <AlertTriangle className={`h-4 w-4 flex-shrink-0 ${topRiskMeta.color}`} />
              <span className="text-xs font-bold text-foreground">Top Challenge</span>
              <Badge variant="outline" className={`ml-1 text-[9px] font-bold ${topRiskMeta.color} border-current`}>
                {topRiskMeta.label} · Score {topRisk.risk_score}
              </Badge>
              <div className="ml-auto flex items-center gap-2">
                {openRisks.length > 1 && (
                  <button onClick={() => setActiveTab('risks')}
                    className={`text-[10px] font-semibold ${topRiskMeta.color} hover:underline flex items-center gap-0.5`}>
                    +{openRisks.length - 1} more →
                  </button>
                )}
                <Button size="icon" variant="ghost" className="h-6 w-6"
                  onClick={() => openEditRisk(topRisk)} title="Edit this risk">
                  <Edit2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
            {/* 8-field grid — exactly matching the reference design */}
            <div className="p-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: 'Challenge Identified', value: topRisk.title,                            icon: <AlertTriangle className="h-3 w-3" /> },
                { label: 'Support Needed',        value: topRisk.contingency_plan || '—',          icon: <Headphones className="h-3 w-3" /> },
                { label: 'Responsible Unit',       value: topRisk.responsible_unit || '—',          icon: <Users className="h-3 w-3" /> },
                { label: 'Action Required',        value: topRisk.mitigation_plan || '—',           icon: <ClipboardList className="h-3 w-3" /> },
                { label: 'Deadline',               value: topRisk.due_date && safeParseISO(topRisk.due_date)
                    ? format(parseISO(topRisk.due_date), 'd MMM yyyy') : '—',                      icon: <Calendar className="h-3 w-3" /> },
                { label: 'Follow-up Status',       value: FOLLOW_UP_LABELS[topRisk.status] ?? topRisk.status, icon: <RefreshCw className="h-3 w-3" />, highlight: true },
                { label: 'Resolution Date',        value: topRisk.resolution_date && safeParseISO(topRisk.resolution_date)
                    ? format(parseISO(topRisk.resolution_date), 'd MMM yyyy') : 'Pending',         icon: <CalendarCheck className="h-3 w-3" /> },
                { label: 'Risk Level',             value: topRiskMeta.label,                       icon: <ShieldAlert className="h-3 w-3" />, highlight: true },
              ].map(cell => (
                <div key={cell.label}
                  className="bg-white/60 dark:bg-black/20 rounded-lg px-3 py-2 border border-white/40 dark:border-white/10">
                  <div className={`flex items-center gap-1 mb-1 ${topRiskMeta.color} opacity-70`}>
                    {cell.icon}
                    <p className="text-[9px] font-bold uppercase tracking-wider">{cell.label}</p>
                  </div>
                  <p className={`text-xs font-bold leading-snug line-clamp-2 ${
                    (cell as any).highlight ? topRiskMeta.color : 'text-foreground'}`}>
                    {cell.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── TIMELINE TAB ── */}
        {activeTab === 'timeline' && (
          <div className="rounded-xl border bg-muted/20 overflow-hidden">
            {!ganttScale || activities.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-muted-foreground gap-2">
                <CalendarClock className="h-10 w-10 text-muted/40" />
                <p className="text-sm font-medium">No activity timeline data</p>
                <p className="text-xs">Add activities with start and end dates to see the Gantt chart</p>
              </div>
            ) : (
              <div className="p-4 overflow-x-auto">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <CalendarClock className="h-3.5 w-3.5 text-violet-500" />
                    <span className="text-xs font-bold">Activity Timeline</span>
                    <Badge variant="outline" className="text-[9px] px-1.5">{activities.length} activities</Badge>
                  </div>
                  <div className="flex items-center gap-3">
                    {[
                      { color: 'bg-indigo-500', label: 'Completed' },
                      { color: 'bg-violet-500', label: 'In Progress' },
                      { color: 'bg-red-500',    label: 'Overdue' },
                      { color: 'bg-slate-300 dark:bg-slate-600', label: 'Not Started' },
                    ].map(l => (
                      <span key={l.label} className="flex items-center gap-1 text-[9px] text-muted-foreground">
                        <span className={`h-2 w-4 rounded-sm ${l.color} opacity-80`} />{l.label}
                      </span>
                    ))}
                    <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
                      <span className="h-3 w-px bg-orange-400 inline-block" /> Today
                    </span>
                  </div>
                </div>
                <div className="flex justify-between text-[9px] text-muted-foreground mb-2 px-[124px]">
                  <span>{format(ganttScale!.min, 'd MMM yyyy')}</span>
                  <span>{format(ganttScale!.max, 'd MMM yyyy')}</span>
                </div>
                <div className="space-y-1.5">
                  {activities.slice(0, 20).map((a: any) => {
                    const s = safeParseISO(a.startDate) ?? ganttScale!.min;
                    const e = safeParseISO(a.endDate)   ?? ganttScale!.max;
                    const leftPct  = Math.max(0, (differenceInDays(s, ganttScale!.min) / ganttScale!.span) * 100);
                    const widthPct = Math.max(2, (differenceInDays(e, s) / ganttScale!.span) * 100);
                    const isOverdue = a.status !== 'completed' && a.status !== 'cancelled'
                      && safeParseISO(a.endDate) && safeParseISO(a.endDate)! < now;
                    const barColor = a.status === 'completed' ? 'bg-indigo-500' :
                                     isOverdue                ? 'bg-red-500' :
                                     a.status === 'inProgress' ? 'bg-violet-500' : 'bg-slate-300 dark:bg-slate-600';
                    const todayPct = Math.max(0, Math.min(100, (differenceInDays(now, ganttScale!.min) / ganttScale!.span) * 100));
                    return (
                      <div key={a.id} className="flex items-center gap-2 group">
                        <div className="w-[120px] flex-shrink-0">
                          <p className="text-[10px] font-semibold truncate leading-none group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{a.name}</p>
                          <p className={`text-[8px] capitalize mt-0.5 ${
                            a.status === 'completed' ? 'text-indigo-500' :
                            isOverdue ? 'text-red-500 font-semibold' : 'text-muted-foreground'}`}>
                            {isOverdue ? '⚠ overdue' : a.status}
                          </p>
                        </div>
                        <div className="flex-1 relative h-5 bg-muted/50 rounded overflow-hidden">
                          <div className={`absolute top-0.5 bottom-0.5 rounded ${barColor} opacity-85 transition-all`}
                            style={{ left: `${leftPct}%`, width: `${Math.min(widthPct, 100 - leftPct)}%` }} />
                          <div className="absolute top-0 bottom-0 w-px bg-orange-400/80 z-10"
                            style={{ left: `${todayPct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  {activities.length > 20 && (
                    <p className="text-[10px] text-muted-foreground text-center pt-2">
                      Showing 20 of {activities.length} activities
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TEAM TAB ── */}
        {activeTab === 'team' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Workload */}
            <Card className="border bg-muted/20 rounded-xl">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Users className="h-3.5 w-3.5 text-blue-500" />
                  <span className="text-xs font-bold">Team Workload</span>
                  {teamCount > 0 && <Badge variant="outline" className="ml-auto text-[9px] px-1.5">{teamCount} members</Badge>}
                </div>
                {workloadData.length === 0 ? (
                  <div className="flex flex-col items-center py-8 text-muted-foreground gap-2">
                    <Users className="h-10 w-10 text-muted/40" />
                    <p className="text-sm">No workload data</p>
                  </div>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={Math.max(100, workloadData.length * 30)}>
                      <BarChart data={workloadData} layout="vertical"
                        margin={{ top: 0, right: 36, left: 4, bottom: 0 }}>
                        <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`}
                          tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }}
                          axisLine={false} tickLine={false} width={60} />
                        <Tooltip formatter={(v: number) => [`${v}%`, 'Workload']}
                          contentStyle={{ fontSize: 11, borderRadius: 10 }} />
                        <Bar dataKey="workload" radius={[0, 4, 4, 0]} maxBarSize={16}>
                          {workloadData.map((d, i) => (
                            <Cell key={i} fill={d.workload >= 90 ? '#ef4444' : d.workload >= 70 ? '#f59e0b' : '#6366f1'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="flex items-center gap-4 mt-2 pt-2 border-t flex-wrap">
                      {[{ c:'bg-red-400', l:'≥90% overloaded'}, { c:'bg-amber-400', l:'≥70% high'}, { c:'bg-indigo-400', l:'Normal'}].map(l => (
                        <span key={l.l} className="flex items-center gap-1 text-[9px] text-muted-foreground">
                          <span className={`h-2 w-2 rounded-full ${l.c}`} />{l.l}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Deliverables + Linked Systems */}
            <div className="space-y-3">
              {/* Deliverables */}
              {deliverableEntries.length > 0 && (
                <Card className="border bg-muted/20 rounded-xl">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <ClipboardList className="h-3.5 w-3.5 text-teal-500" />
                      <span className="text-xs font-bold">Deliverables</span>
                      <span className="ml-auto text-xs font-bold text-teal-600 dark:text-teal-400">
                        {deliverablesDone}/{deliverableEntries.length}
                      </span>
                    </div>
                    <Progress value={deliverableEntries.length > 0 ? Math.round((deliverablesDone / deliverableEntries.length) * 100) : 0}
                      className="h-1.5 mb-2" />
                    <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                      {deliverableEntries.map(([key, done]) => (
                        <div key={key} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${
                          done ? 'bg-emerald-50 dark:bg-emerald-950/20' : 'bg-muted/30'}`}>
                          {done
                            ? <CheckSquare className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                            : <Square className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
                          <span className={`text-[10px] leading-snug ${
                            done ? 'text-emerald-700 dark:text-emerald-300 line-through decoration-emerald-400/60' : 'text-muted-foreground'}`}>
                            {key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Linked Systems */}
              {(relatedMMPs.length > 0 || relatedSiteVisits.length > 0 || !!crmOppty) && (
                <Card className="border bg-muted/20 rounded-xl">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Link2 className="h-3.5 w-3.5 text-indigo-500" />
                      <span className="text-xs font-bold">Linked Systems</span>
                    </div>
                    {mmps.length > 0 && (
                      <div>
                        <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
                          <MapPin className="h-2.5 w-2.5" /> Monitoring Plans ({mmps.length})
                        </p>
                        {mmps.slice(0, 3).map(m => (
                          <button key={m.id} onClick={() => navigate(`/mmp/${m.id}/view`)}
                            className="w-full flex items-center gap-2 text-[10px] text-left hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors group py-1 border-b border-muted/50 last:border-0">
                            <ExternalLink className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 flex-shrink-0 text-indigo-500" />
                            <span className="truncate flex-1">{m.name ?? m.id.slice(0, 8)}</span>
                            {m.status && <Badge variant="outline" className="text-[8px] px-1.5 capitalize">{m.status}</Badge>}
                          </button>
                        ))}
                      </div>
                    )}
                    {relatedSiteVisits.length > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <Activity className="h-3 w-3 text-violet-500" />
                          {relatedSiteVisits.length} site visits linked
                        </span>
                        <button onClick={() => navigate('/site-visits')}
                          className="text-[9px] text-violet-500 hover:underline flex items-center gap-0.5">
                          View <ExternalLink className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    )}
                    {crmOppty && (
                      <div className="border-t pt-2">
                        <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
                          <Briefcase className="h-2.5 w-2.5" /> CRM Opportunity
                        </p>
                        <p className="text-[10px] font-semibold line-clamp-1 mb-1">{crmOppty.title}</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          {CRM_STAGE_META[crmOppty.stage] && (
                            <span className={`text-[10px] font-bold ${CRM_STAGE_META[crmOppty.stage].color}`}>
                              {CRM_STAGE_META[crmOppty.stage].label}
                            </span>
                          )}
                          {crmOppty.value_usd && (
                            <span className="text-[10px] text-muted-foreground">
                              ${fmtNum(crmOppty.value_usd)} USD
                            </span>
                          )}
                          <button onClick={() => navigate('/crm/opportunities')}
                            className="text-[9px] text-emerald-600 hover:underline flex items-center gap-0.5 ml-auto">
                            Open CRM <ExternalLink className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}

        {/* ── RISKS TAB ── */}
        {activeTab === 'risks' && (
          <div className="space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-sm flex items-center gap-1.5">
                  <ShieldAlert className="h-4 w-4 text-red-500" /> Risk Register
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">Identify, assess and track project risks</p>
              </div>
              <Button size="sm" onClick={openNewRisk} data-testid="btn-add-risk-dashboard">
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Risk
              </Button>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'Total',     value: risks.length,                                    icon: <Activity className="h-3.5 w-3.5" />, color: 'text-blue-600',    bg: 'bg-blue-50 dark:bg-blue-900/20' },
                { label: 'Open',      value: risks.filter(r=>r.status==='open').length,        icon: <AlertTriangle className="h-3.5 w-3.5" />, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/20' },
                { label: 'High+',     value: risks.filter(r=>r.risk_score>=10).length,         icon: <Flame className="h-3.5 w-3.5" />, color: 'text-orange-600',    bg: 'bg-orange-50 dark:bg-orange-900/20' },
                { label: 'Mitigated', value: risks.filter(r=>r.status==='mitigated').length,   icon: <ShieldCheck className="h-3.5 w-3.5" />, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
              ].map(s => (
                <div key={s.label} className={cn('rounded-lg p-2 flex items-center gap-2', s.bg)}>
                  <span className={s.color}>{s.icon}</span>
                  <div>
                    <p className={cn('text-base font-black leading-none', s.color)}>{s.value}</p>
                    <p className="text-[9px] text-muted-foreground">{s.label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Filter chips */}
            <div className="flex gap-1.5 flex-wrap">
              {(['all','open','mitigated','accepted','closed'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setRiskStatusFilter(s)}
                  className={cn(
                    'text-[10px] px-2.5 py-1 rounded-full border font-medium transition-colors capitalize',
                    riskStatusFilter === s
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border hover:bg-muted'
                  )}
                >
                  {s === 'all' ? 'All' : RISK_STATUS_CFG[s]?.label ?? s}
                </button>
              ))}
            </div>

            {/* Risk list */}
            {risks.length === 0 ? (
              <div className="rounded-xl border bg-emerald-50 dark:bg-emerald-950/20 p-8 flex flex-col items-center gap-3">
                <ShieldCheck className="h-12 w-12 text-emerald-500" />
                <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">No risks logged yet</p>
                <p className="text-xs text-muted-foreground text-center">Click <strong>Add Risk</strong> above to log the first risk for this project.</p>
                <Button size="sm" onClick={openNewRisk} className="mt-1">
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add First Risk
                </Button>
              </div>
            ) : riskFiltered.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-xs">No risks match this filter.</div>
            ) : (
                <div className="rounded-xl border overflow-hidden">
                  {/* List header with select-all */}
                  <div className="px-4 py-2.5 bg-muted/30 border-b flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded cursor-pointer accent-primary"
                      checked={riskFiltered.length > 0 && riskFiltered.every(r => selectedRiskIds.has(r.id))}
                      onChange={() => toggleSelectAll(riskFiltered.map(r => r.id))}
                      title="Select all"
                    />
                    <ShieldAlert className="h-3.5 w-3.5 text-orange-500" />
                    <span className="text-xs font-bold">{riskStatusFilter === 'all' ? 'All Risks' : `${RISK_STATUS_CFG[riskStatusFilter]?.label ?? riskStatusFilter} Risks`}</span>
                    <Badge variant="outline" className="ml-auto text-[9px] px-1.5">{riskFiltered.length}</Badge>
                  </div>

                  {/* Bulk action bar — shown when any rows are checked */}
                  {selectedRiskIds.size > 0 && (
                    <div className="px-4 py-2 bg-primary/5 border-b flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-semibold text-primary">{selectedRiskIds.size} selected</span>
                      <span className="text-[10px] text-muted-foreground">→ set status to</span>
                      <Select value={bulkStatus} onValueChange={setBulkStatus}>
                        <SelectTrigger className="h-6 text-[10px] w-28 px-2">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(RISK_STATUS_CFG).map(([k, v]) => (
                            <SelectItem key={k} value={k} className="text-xs">{v.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button size="sm" className="h-6 text-[10px] px-3" onClick={handleBulkStatus} disabled={bulkUpdating}>
                        {bulkUpdating ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Apply'}
                      </Button>
                      <button className="text-[10px] text-muted-foreground hover:text-foreground ml-auto"
                        onClick={() => setSelectedRiskIds(new Set())}>Clear</button>
                    </div>
                  )}

                  {/* Risk rows */}
                  <div className="divide-y">
                    {riskFiltered.map(r => {
                      const meta = getRiskMeta(r.risk_score);
                      const statusCfg = RISK_STATUS_CFG[r.status] ?? RISK_STATUS_CFG.open;
                      const isExpanded = expandedRiskId === r.id;
                      const isSelected = selectedRiskIds.has(r.id);
                      return (
                        <div key={r.id} className={cn('transition-colors', isSelected && 'bg-primary/5')}>
                          {/* Main row */}
                          <div
                            className="px-4 py-3 flex items-start gap-3 hover:bg-muted/20 cursor-pointer"
                            onClick={() => setExpandedRiskId(isExpanded ? null : r.id)}
                          >
                            {/* Checkbox */}
                            <input
                              type="checkbox"
                              className="h-3.5 w-3.5 rounded cursor-pointer accent-primary mt-1 flex-shrink-0"
                              checked={isSelected}
                              onChange={e => { e.stopPropagation(); toggleSelectRisk(r.id); }}
                              onClick={e => e.stopPropagation()}
                            />
                            {/* Score badge */}
                            <div className={cn('min-w-[2rem] h-9 rounded-md flex flex-col items-center justify-center text-xs font-black flex-shrink-0', meta.bg, meta.color)}>
                              <span>{r.risk_score}</span>
                              <span className="text-[8px] font-normal">{meta.label}</span>
                            </div>
                            {/* Title + meta */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="text-xs font-semibold leading-snug">{r.title}</p>
                                {r.responsible_unit === '__auto__' && (
                                  <span className="inline-flex items-center gap-0.5 text-[8px] font-bold bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 rounded-full px-1.5 py-0.5 flex-shrink-0">
                                    <Zap className="h-2 w-2" /> Auto
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <span className="text-[9px] capitalize text-muted-foreground border rounded px-1.5 py-0.5">{r.category}</span>
                                <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full font-medium', statusCfg.badge)}>{statusCfg.label}</span>
                                {r.due_date && safeParseISO(r.due_date) && (
                                  <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                                    <CalendarClock className="h-2.5 w-2.5" /> {format(parseISO(r.due_date), 'd MMM yyyy')}
                                  </span>
                                )}
                              </div>
                            </div>
                            {/* Actions + chevron */}
                            <div className="flex items-center gap-0.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openEditRisk(r)} title="Edit risk">
                                <Edit2 className="h-3 w-3" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => handleDeleteRisk(r.id)} disabled={riskDeleting === r.id} title="Delete risk">
                                {riskDeleting === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                              </Button>
                            </div>
                            <div className="text-muted-foreground flex-shrink-0 mt-0.5">
                              {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            </div>
                          </div>

                          {/* Expanded detail panel */}
                          {isExpanded && (
                            <div className="px-4 pb-4 border-t bg-muted/10">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
                                {r.mitigation_plan && (
                                  <div>
                                    <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1 mb-1">
                                      <ClipboardList className="h-3 w-3" /> Mitigation Plan
                                    </p>
                                    <p className="text-xs leading-relaxed text-foreground">{r.mitigation_plan}</p>
                                  </div>
                                )}
                                {r.contingency_plan && (
                                  <div>
                                    <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1 mb-1">
                                      <Headphones className="h-3 w-3" /> Contingency / Support Needed
                                    </p>
                                    <p className="text-xs leading-relaxed text-foreground">{r.contingency_plan}</p>
                                  </div>
                                )}
                                {r.responsible_unit && (
                                  <div>
                                    <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1 mb-1">
                                      <Users className="h-3 w-3" /> Responsible Unit
                                    </p>
                                    <p className="text-xs font-semibold">{r.responsible_unit}</p>
                                  </div>
                                )}
                                <div>
                                  <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1 mb-1">
                                    <CalendarCheck className="h-3 w-3" /> Last Updated
                                  </p>
                                  <p className="text-xs">{safeParseISO(r.updated_at) ? format(parseISO(r.updated_at), 'd MMM yyyy') : '—'}</p>
                                </div>
                                {!r.mitigation_plan && !r.contingency_plan && !r.responsible_unit && (
                                  <p className="text-xs text-muted-foreground col-span-2 italic">No additional details. Click Edit to add a mitigation plan.</p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
            )}
          </div>
        )}

      </div>
    </div>

    {/* ── Add / Edit Risk Dialog ── */}
    <Dialog open={riskDialogOpen} onOpenChange={setRiskDialogOpen}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-red-500" />
            {riskEditing ? 'Edit Risk' : 'Add Risk'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="risk-title">Risk Title <span className="text-destructive">*</span></Label>
            <Input
              id="risk-title"
              placeholder="Describe the risk…"
              value={riskForm.title}
              onChange={e => setRiskForm(p => ({ ...p, title: e.target.value }))}
              data-testid="input-risk-title"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={riskForm.category} onValueChange={v => setRiskForm(p => ({ ...p, category: v }))}>
                <SelectTrigger data-testid="select-risk-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RISK_CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={riskForm.status} onValueChange={v => setRiskForm(p => ({ ...p, status: v }))}>
                <SelectTrigger data-testid="select-risk-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(RISK_STATUS_CFG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Likelihood</Label>
              <Select value={riskForm.likelihood} onValueChange={v => setRiskForm(p => ({ ...p, likelihood: v }))}>
                <SelectTrigger data-testid="select-risk-likelihood"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LIKELIHOOD_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Impact</Label>
              <Select value={riskForm.impact} onValueChange={v => setRiskForm(p => ({ ...p, impact: v }))}>
                <SelectTrigger data-testid="select-risk-impact"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {IMPACT_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {(() => {
            const lScore = LIKELIHOOD_OPTS.find(o => o.value === riskForm.likelihood)?.score ?? 3;
            const iScore = IMPACT_OPTS.find(o => o.value === riskForm.impact)?.score ?? 3;
            const score = lScore * iScore;
            const meta = getRiskMeta(score);
            return (
              <div className={`rounded-lg px-3 py-2 flex items-center gap-2 text-xs font-medium ${meta.bg} border ${meta.border}`}>
                <AlertTriangle className={`h-3.5 w-3.5 ${meta.color}`} />
                <span className={meta.color}>Calculated Risk Score: <strong>{score}</strong> — {meta.label}</span>
              </div>
            );
          })()}

          <div className="space-y-1.5">
            <Label>Mitigation Plan</Label>
            <Textarea
              placeholder="How will this risk be mitigated?"
              value={riskForm.mitigation_plan}
              onChange={e => setRiskForm(p => ({ ...p, mitigation_plan: e.target.value }))}
              rows={3}
              data-testid="textarea-risk-mitigation"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Contingency / Support Needed</Label>
            <Textarea
              placeholder="Fallback plan if mitigation fails…"
              value={riskForm.contingency_plan}
              onChange={e => setRiskForm(p => ({ ...p, contingency_plan: e.target.value }))}
              rows={2}
              data-testid="textarea-risk-contingency"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Due Date</Label>
              <Input
                type="date"
                value={riskForm.due_date}
                onChange={e => setRiskForm(p => ({ ...p, due_date: e.target.value }))}
                data-testid="input-risk-due-date"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Responsible Unit</Label>
              <Input
                placeholder="Team / Unit…"
                value={riskForm.responsible_unit}
                onChange={e => setRiskForm(p => ({ ...p, responsible_unit: e.target.value }))}
                data-testid="input-risk-responsible-unit"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setRiskDialogOpen(false)} disabled={riskSaving}>Cancel</Button>
          <Button onClick={handleSaveRisk} disabled={riskSaving || !riskForm.title.trim()} data-testid="btn-save-risk">
            {riskSaving ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Saving…</> : (riskEditing ? 'Update Risk' : 'Add Risk')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
