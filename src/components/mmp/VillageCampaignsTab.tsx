import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { format, parseISO } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { sudanStates } from '@/data/sudanStates';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Plus, Pencil, Trash2, Loader2, ChevronLeft, MapPin, Users, Target,
  BarChart3, Calendar, ClipboardList, CheckCircle2, AlertCircle,
  Download, Eye, RefreshCw, Home, Building2, UserCheck, FileText,
  ArrowRight, TrendingUp, Activity, Camera, ImageIcon, X, ChevronDown, ChevronUp,
  DollarSign, Wallet, CreditCard, Truck, BadgeDollarSign, Send, Upload, FileSpreadsheet
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProfileOption {
  id: string;
  full_name?: string | null;
  username?: string | null;
  role?: string | null;
}

interface ProjectOption { id: string; name: string; }

interface Campaign {
  id: string;
  campaign_name: string;
  state?: string;
  locality?: string;
  start_date?: string;
  end_date?: string;
  status: 'draft' | 'active' | 'completed' | 'archived';
  project_id?: string;
  mmp_file_id?: string;
  coordinator_id?: string;
  supervisor_id?: string;
  created_by?: string;
  created_at: string;
  // Joined
  coordinator_name?: string;
  supervisor_name?: string;
  project_name?: string;
}

interface Cluster {
  id: string;
  campaign_id: string;
  cluster_name: string;
  cluster_code: string;
  state?: string;
  locality?: string;
  created_at: string;
}

interface Village {
  id: string;
  campaign_id: string;
  village_name: string;
  village_code: string;
  hh_target: number;
  state?: string;
  locality?: string;
  cluster_id?: string | null;
  status: 'pending' | 'in_progress' | 'completed';
  // Derived
  hh_covered?: number;
  team_count?: number;
  cluster_name?: string;
}

interface Team {
  id: string;
  team_name: string;
  team_code: string;
  team_lead_id?: string;
  member_count: number;
  notes?: string;
  is_active: boolean;
  // Joined
  team_lead_name?: string;
}

interface VillageTeam {
  id: string;
  campaign_id: string;
  village_id: string;
  team_id: string;
  hh_target_for_team?: number;
  status: 'active' | 'completed' | 'withdrawn';
  assigned_at: string;
  activity_name?: string | null;
  activity_type?: string | null;
  // Joined
  team_name?: string;
  team_code?: string;
  team_lead_name?: string;
  member_count?: number;
  village_name?: string;
  hh_covered?: number;
}

interface DailyLog {
  id: string;
  assignment_id: string;
  campaign_id: string;
  village_id: string;
  team_id: string;
  report_date: string;
  hh_covered: number;
  male_count: number;
  female_count: number;
  beneficiaries: number;
  notes?: string;
  gps_lat?: number;
  gps_lng?: number;
  submitted_by?: string;
  submitted_at: string;
  source: string;
  // Joined
  village_name?: string;
  team_name?: string;
  team_code?: string;
  submitted_by_name?: string;
}

interface SiteEntry {
  id: string;
  site_name: string;
  site_code?: string;
  transport_fee: number;
  enumerator_fee: number;
  fee_paid_status?: string | null;
  fee_paid_amount?: number | null;
  fee_paid_at?: string | null;
  fee_paid_by?: string | null;
  fee_payment_method?: string | null;
  fee_payment_notes?: string | null;
  status: string;
  dispatched_at?: string | null;
  dispatched_by?: string | null;
  additional_data?: Record<string, any>;
}

interface AdvanceRequest {
  id: string;
  site_name?: string | null;
  requested_amount: number;
  total_paid_amount?: number | null;
  status: string;
  created_at: string;
  description?: string | null;
  expense_category?: string | null;
  // Legacy single-tier fields (still written by Mark Paid)
  approved_by?: string | null;
  approved_at?: string | null;
  paid_by?: string | null;
  paid_at?: string | null;
  // Two-tier fields
  tier1_status?: string | null;
  tier1_approved_by?: string | null;
  tier1_approved_at?: string | null;
  tier1_notes?: string | null;
  tier2_status?: string | null;
  tier2_approved_by?: string | null;
  tier2_approved_at?: string | null;
  tier2_notes?: string | null;
  rejection_reason?: string | null;
}

// ── Excel import row ──────────────────────────────────────────────────────────

interface ImportRow {
  state: string;
  locality: string;
  cluster_name: string;
  cluster_code: string;
  village_name: string;
  village_code: string;
  hh_target: string;
  activity_name: string;
  activity_type: string;
  team_code: string;
  transport_fee: string;
  enumerator_fee: string;
  /** Validation messages. Empty = valid row. */
  _errors: string[];
  /** Resolved team id (set during validation) */
  _teamId?: string;
  /** 1-based row number from the file */
  _rowNum: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(covered: number, target: number) {
  if (!target) return 0;
  return Math.min(100, Math.round((covered / target) * 100));
}

function fmtDate(d?: string) {
  if (!d) return '—';
  try { return format(parseISO(d), 'dd MMM yyyy'); } catch { return d; }
}

function autoVillageCode(idx: number) {
  return `VLG-${String(idx + 1).padStart(2, '0')}`;
}

function autoTeamCode(existing: Team[]) {
  const nums = existing
    .map(t => { const m = t.team_code.match(/(\d+)$/); return m ? parseInt(m[1]) : 0; })
    .filter(n => n > 0);
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `TM-${String(next).padStart(3, '0')}`;
}

function statusColor(s: string) {
  const map: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-700',
    active: 'bg-emerald-100 text-emerald-700',
    completed: 'bg-blue-100 text-blue-700',
    archived: 'bg-gray-100 text-gray-500',
    pending: 'bg-amber-100 text-amber-700',
    in_progress: 'bg-purple-100 text-purple-700',
  };
  return map[s] || 'bg-gray-100 text-gray-600';
}

function fmtPayMethod(m?: string | null) {
  const labels: Record<string, string> = {
    cash: 'Cash', bank_transfer: 'Bank Transfer',
    mobile_money: 'Mobile Money', wallet: 'App Wallet', other: 'Other',
  };
  return m ? (labels[m] || m) : null;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface VillageCampaignsTabProps {
  canManage: boolean;
  /** Only Super Admins may permanently delete campaigns or teams */
  canDelete?: boolean;
  /** FOM / Admin / Super Admin — can perform Tier 1 advance approval */
  canApproveAdvance?: boolean;
  /** Admin / Super Admin only — can perform Tier 2 advance approval (and Mark Paid) */
  canTier2Approve?: boolean;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function VillageCampaignsTab({ canManage, canDelete = false, canApproveAdvance = false, canTier2Approve = false }: VillageCampaignsTabProps) {
  const { toast } = useToast();

  // ── Reference data ────────────────────────────────────────────────────────
  const [profiles, setProfiles]   = useState<ProfileOption[]>([]);
  const [projects, setProjects]   = useState<ProjectOption[]>([]);
  const [allTeams, setAllTeams]   = useState<Team[]>([]);
  const [loading, setLoading]     = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ── Campaigns ─────────────────────────────────────────────────────────────
  const [campaigns, setCampaigns]       = useState<Campaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [campaignTab, setCampaignTab]   = useState('overview');

  // ── Villages & assignments for selected campaign ──────────────────────────
  const [villages, setVillages]         = useState<Village[]>([]);
  const [clusters, setClusters]         = useState<Cluster[]>([]);
  const [assignments, setAssignments]   = useState<VillageTeam[]>([]);
  const [dailyLogs, setDailyLogs]       = useState<DailyLog[]>([]);

  // ── Dialogs ───────────────────────────────────────────────────────────────
  const [showCreateCampaign, setShowCreateCampaign] = useState(false);
  const [showTeamRegistry,   setShowTeamRegistry]   = useState(false);
  const [showAddVillage,     setShowAddVillage]     = useState(false);
  const [showAssignTeam,     setShowAssignTeam]     = useState(false);
  const [showDailyLog,       setShowDailyLog]       = useState(false);
  const [showCreateTeam,     setShowCreateTeam]     = useState(false);
  const [showAddCluster,     setShowAddCluster]     = useState(false);
  const [clusterForm, setClusterForm] = useState({ cluster_name: '', cluster_code: '', state: '', locality: '' });
  const [clusterSaving, setClusterSaving] = useState(false);

  // ── Form state — campaign wizard ──────────────────────────────────────────
  const [wizardStep, setWizardStep] = useState(1);
  const [campaignForm, setCampaignForm] = useState({
    campaign_name: '', start_date: '', end_date: '',
    status: 'active' as Campaign['status'],
    project_id: '', mmp_file_id: '',
    coordinator_id: '', supervisor_id: '',
  });
  // Multi-state/locality: each row is one state + one locality pair
  const [coverageAreas, setCoverageAreas] = useState<{ state: string; locality: string }[]>([
    { state: '', locality: '' },
  ]);
  const [wizardVillages, setWizardVillages] = useState<{ village_name: string; village_code: string; hh_target: string; state: string; locality: string; cluster_id: string; activity_name: string; activity_type: string }[]>([
    { village_name: '', village_code: 'VLG-01', hh_target: '', state: '', locality: '', cluster_id: '', activity_name: '', activity_type: '' },
  ]);
  const [wizardTeams, setWizardTeams] = useState<{ team_id: string; village_ids: string[]; hh_target_for_team: string }[]>([]);

  // ── Form state — add village ──────────────────────────────────────────────
  const [villageForm, setVillageForm] = useState({ village_name: '', village_code: '', hh_target: '', state: '', locality: '', cluster_id: '' });

  // ── Form state — assign team ──────────────────────────────────────────────
  const [assignForm, setAssignForm] = useState({ team_id: '', village_id: '', hh_target_for_team: '', activity_name: '', activity_type: '' });

  // ── Form state — daily log ────────────────────────────────────────────────
  const [logForm, setLogForm] = useState({
    assignment_id: '', report_date: format(new Date(), 'yyyy-MM-dd'),
    hh_covered: '', male_count: '', female_count: '', beneficiaries: '', notes: '',
  });

  // ── Photo upload — daily log dialog ──────────────────────────────────────
  const [logPhotos, setLogPhotos] = useState<File[]>([]);
  const logPhotoInputRef = useRef<HTMLInputElement>(null);

  // ── Photos fetched for existing logs (keyed by log id) ───────────────────
  const [photosByLogId, setPhotosByLogId] = useState<Record<string, { photo_url: string; storage_path?: string; caption?: string }[]>>({});

  // ── Expanded log row in the Daily Logs table ─────────────────────────────
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // ── Form state — team ─────────────────────────────────────────────────────
  const [teamForm, setTeamForm] = useState({ team_name: '', team_code: '', team_lead_id: '', member_count: '', notes: '' });

  // ── Submitting ────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);

  // ── Filters ───────────────────────────────────────────────────────────────
  const [logFilterTeam, setLogFilterTeam]     = useState('all');
  const [logFilterVillage, setLogFilterVillage] = useState('all');
  const [campaignStatusFilter, setCampaignStatusFilter] = useState('all');

  // ── Costs & Fees state ────────────────────────────────────────────────────
  const [siteEntries, setSiteEntries] = useState<SiteEntry[]>([]);
  const [feeEdits, setFeeEdits] = useState<Record<string, { transport_fee: string; enumerator_fee: string }>>({});
  const [feesSaving, setFeesSaving] = useState<Record<string, boolean>>({});
  const [dispatching, setDispatching] = useState<Record<string, boolean>>({});
  const [dispatchingAll, setDispatchingAll] = useState(false);

  // ── Advances state ────────────────────────────────────────────────────────
  const [advances, setAdvances] = useState<AdvanceRequest[]>([]);
  const [showNewAdvance, setShowNewAdvance] = useState(false);
  const [advanceSaving, setAdvanceSaving] = useState(false);
  const [advanceForm, setAdvanceForm] = useState({ requested_amount: '', description: '', expense_category: 'transport', site_name: '' });

  // ── Advance reject dialog ─────────────────────────────────────────────────
  const [rejectDialog, setRejectDialog] = useState<{ open: boolean; advance: AdvanceRequest | null; tier: 1 | 2 }>({ open: false, advance: null, tier: 1 });
  const [rejectNote, setRejectNote]   = useState('');
  const [rejecting, setRejecting]     = useState(false);

  // ── Mark Paid state ───────────────────────────────────────────────────────
  const [payDialog, setPayDialog] = useState<{ open: boolean; entry: SiteEntry | null }>({ open: false, entry: null });
  const [payForm, setPayForm]   = useState({ amount: '', notes: '', method: 'cash' });
  const [paying, setPaying]     = useState(false);
  const [payingAll, setPayingAll] = useState(false);

  // ── Excel import state ────────────────────────────────────────────────────
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importRows, setImportRows]             = useState<ImportRow[]>([]);
  const [importing, setImporting]               = useState(false);
  const [importFileName, setImportFileName]     = useState('');
  const importFileRef = useRef<HTMLInputElement>(null);

  // ── Approval state ────────────────────────────────────────────────────────
  const [approving, setApproving] = useState<Record<string, boolean>>({});
  const [approvingAll, setApprovingAll] = useState(false);
  const [advanceApproving, setAdvanceApproving] = useState<Record<string, boolean>>({});

  // ── Costs sub-tab (Pending / Approved & Costed / Dispatched) ─────────────
  const [costsSubTab, setCostsSubTab] = useState<'pending' | 'approved' | 'dispatched'>('pending');

  // ── Load reference data ───────────────────────────────────────────────────

  const loadProfiles = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, username, role')
      .order('full_name', { ascending: true });
    setProfiles((data || []) as ProfileOption[]);
  }, []);

  const loadProjects = useCallback(async () => {
    const { data } = await supabase
      .from('projects')
      .select('id, name')
      .order('name', { ascending: true });
    setProjects((data || []) as ProjectOption[]);
  }, []);

  const loadTeams = useCallback(async () => {
    const { data } = await supabase
      .from('adhoc_teams')
      .select('id, team_name, team_code, team_lead_id, member_count, notes, is_active, profiles:team_lead_id(full_name)')
      .eq('is_active', true)
      .order('team_code', { ascending: true });
    setAllTeams(
      (data || []).map((t: any) => ({
        ...t,
        team_lead_name: t.profiles?.full_name || '—',
      }))
    );
  }, []);

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from('adhoc_campaigns')
        .select('*, coordinator:coordinator_id(full_name), supervisor:supervisor_id(full_name), project:project_id(name)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setCampaigns(
        (data || []).map((c: any) => ({
          ...c,
          coordinator_name: c.coordinator?.full_name || '—',
          supervisor_name:  c.supervisor?.full_name  || '—',
          project_name:     c.project?.name          || '—',
        }))
      );
    } catch (e: any) {
      const msg = e?.message || String(e);
      // Surface migration-not-applied errors clearly
      if (msg.includes('does not exist') || msg.includes('relation') || msg.includes('undefined_table')) {
        setLoadError('Database tables for Village Campaigns are not yet created. An admin must apply the migration in the Supabase SQL Editor — see supabase/RUNBOOK_village_campaigns.md for instructions.');
      } else {
        setLoadError(`Failed to load campaigns: ${msg}`);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Load campaign detail ──────────────────────────────────────────────────

  const loadCampaignDetail = useCallback(async (campaignId: string) => {
    // Parallel load: clusters + villages + assignments + daily logs
    const [clusterRes, vilRes, assignRes, logRes] = await Promise.all([
      supabase
        .from('adhoc_clusters')
        .select('*')
        .eq('campaign_id', campaignId)
        .order('cluster_code', { ascending: true }),
      supabase
        .from('adhoc_villages')
        .select('*')
        .eq('campaign_id', campaignId)
        .order('village_code', { ascending: true }),
      supabase
        .from('adhoc_village_teams')
        .select('*, team:team_id(team_name, team_code, member_count, profiles:team_lead_id(full_name)), village:village_id(village_name)')
        .eq('campaign_id', campaignId)
        .order('assigned_at', { ascending: true }),
      supabase
        .from('adhoc_daily_logs')
        .select('*, village:village_id(village_name), team:team_id(team_name, team_code), submitter:submitted_by(full_name)')
        .eq('campaign_id', campaignId)
        .order('report_date', { ascending: false }),
    ]);

    const loadedClusters: Cluster[] = (clusterRes.data || []) as Cluster[];
    setClusters(loadedClusters);

    // Load photos for all logs in parallel
    const logIds = (logRes.data || []).map((l: any) => l.id);
    let fetchedPhotos: Record<string, { photo_url: string; storage_path?: string; caption?: string }[]> = {};
    if (logIds.length > 0) {
      const { data: photoRows } = await supabase
        .from('adhoc_daily_log_photos')
        .select('log_id, photo_url, storage_path, caption')
        .in('log_id', logIds)
        .order('created_at', { ascending: true });
      for (const p of (photoRows || [])) {
        const lid = p.log_id as string;
        fetchedPhotos[lid] = fetchedPhotos[lid] || [];
        fetchedPhotos[lid].push({ photo_url: p.photo_url, storage_path: p.storage_path ?? undefined, caption: p.caption ?? undefined });
      }
    }
    setPhotosByLogId(fetchedPhotos);

    const logs: DailyLog[] = (logRes.data || []).map((l: any) => ({
      ...l,
      village_name: l.village?.village_name || '—',
      team_name:    l.team?.team_name       || '—',
      team_code:    l.team?.team_code       || '—',
      submitted_by_name: l.submitter?.full_name || '—',
    }));

    const assigns: VillageTeam[] = (assignRes.data || []).map((a: any) => {
      const teamLogs = logs.filter(l => l.assignment_id === a.id);
      const hh_covered = teamLogs.reduce((s, l) => s + (l.hh_covered || 0), 0);
      return {
        ...a,
        team_name:      a.team?.team_name                   || '—',
        team_code:      a.team?.team_code                   || '—',
        team_lead_name: a.team?.profiles?.full_name         || '—',
        member_count:   a.team?.member_count                || 0,
        village_name:   a.village?.village_name             || '—',
        activity_name:  a.activity_name                     || null,
        activity_type:  a.activity_type                     || null,
        hh_covered,
      };
    });

    const vils: Village[] = (vilRes.data || []).map((v: any) => {
      const vilAssigns = assigns.filter(a => a.village_id === v.id);
      const hh_covered = vilAssigns.reduce((s, a) => s + (a.hh_covered || 0), 0);
      const cluster = loadedClusters.find(c => c.id === v.cluster_id);
      return { ...v, hh_covered, team_count: vilAssigns.length, cluster_name: cluster?.cluster_name };
    });

    setVillages(vils);
    setAssignments(assigns);
    setDailyLogs(logs);

    // ── Load site entries for this campaign (fee/dispatch data) ───────────────
    const { data: seRows } = await supabase
      .from('mmp_site_entries')
      .select('id, site_name, site_code, transport_fee, enumerator_fee, fee_paid_status, fee_paid_amount, fee_paid_at, fee_paid_by, fee_payment_method, fee_payment_notes, status, dispatched_at, dispatched_by, additional_data')
      .filter('additional_data->>campaign_id', 'eq', campaignId);
    setSiteEntries((seRows || []) as SiteEntry[]);
    // Initialize fee edit inputs from current values
    const initEdits: Record<string, { transport_fee: string; enumerator_fee: string }> = {};
    for (const e of (seRows || [])) {
      initEdits[e.id] = { transport_fee: String(e.transport_fee ?? 0), enumerator_fee: String(e.enumerator_fee ?? 0) };
    }
    setFeeEdits(initEdits);
  }, []);

  // ── Load advance requests for this campaign ───────────────────────────────
  const loadAdvances = useCallback(async (projectId?: string, campaignId?: string) => {
    if (!projectId && !campaignId) { setAdvances([]); return; }
    // Fetch both:
    //   a) Rows attributed to this campaign via the campaign_id FK (new rows + backfilled)
    //   b) Legacy rows that predate the campaign_id column: campaign_id IS NULL
    //      and project_id matches — these are shown until manually resolved
    // The OR filter covers both cases in one query.
    const orParts: string[] = [];
    if (campaignId)  orParts.push(`campaign_id.eq.${campaignId}`);
    if (projectId)   orParts.push(`and(campaign_id.is.null,project_id.eq.${projectId})`);

    const { data } = await supabase
      .from('advance_requests')
      .select('id, site_name, requested_amount, total_paid_amount, status, created_at, description, expense_category, approved_by, approved_at, paid_by, paid_at, tier1_status, tier1_approved_by, tier1_approved_at, tier1_notes, tier2_status, tier2_approved_by, tier2_approved_at, tier2_notes, rejection_reason')
      .or(orParts.join(','))
      .order('created_at', { ascending: false });
    setAdvances((data || []) as AdvanceRequest[]);
  }, []);

  useEffect(() => {
    loadProfiles();
    loadProjects();
    loadTeams();
    loadCampaigns();
  }, [loadProfiles, loadProjects, loadTeams, loadCampaigns]);

  useEffect(() => {
    // Reset all campaign-specific state before loading new data so stale values
    // from the previous campaign never bleed through on a fast switch.
    setSiteEntries([]);
    setAdvances([]);
    setClusters([]);
    setFeeEdits({});
    setFeesSaving({});
    setDispatching({});
    setApproving({});
    setAdvanceApproving({});
    setDispatchingAll(false);
    setApprovingAll(false);
    setPayingAll(false);
    setCostsSubTab('pending');
    setPayDialog({ open: false, entry: null });
    setPayForm({ amount: '', notes: '', method: 'cash' });
    setShowNewAdvance(false);
    setAdvanceForm({ requested_amount: '', description: '', expense_category: 'transport', site_name: '' });
    setRejectDialog({ open: false, advance: null, tier: 1 });
    setRejectNote('');

    if (selectedCampaign) {
      loadCampaignDetail(selectedCampaign.id);
      // Pass campaign_id as the primary filter; project_id as legacy fallback
      loadAdvances(selectedCampaign.project_id, selectedCampaign.id);
    }
  }, [selectedCampaign, loadCampaignDetail, loadAdvances]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const profileName = (id?: string) => {
    if (!id) return '—';
    const p = profiles.find(p => p.id === id);
    return p?.full_name || p?.username || '—';
  };

  // Localities for a given state (reusable helper)
  const localitiesForState = useCallback((stateName: string) =>
    sudanStates.find(s => s.name === stateName)?.localities.map(l => l.name) || [],
  []);

  // Distinct states selected across all coverage areas (for village dropdowns in Step 2)
  const coverageStates = useMemo(() =>
    [...new Set(coverageAreas.map(a => a.state).filter(Boolean))],
  [coverageAreas]);

  // Supervisors: filter to supervisor-role users only
  const supervisors = useMemo(() =>
    profiles.filter(p => p.role && (
      p.role.toLowerCase() === 'supervisor' ||
      p.role.toLowerCase().includes('supervisor') ||
      p.role.toLowerCase() === 'field_supervisor'
    )),
  [profiles]);

  const filteredLogs = useMemo(() => dailyLogs.filter(l => {
    if (logFilterTeam !== 'all' && l.team_id !== logFilterTeam) return false;
    if (logFilterVillage !== 'all' && l.village_id !== logFilterVillage) return false;
    return true;
  }), [dailyLogs, logFilterTeam, logFilterVillage]);

  const filteredCampaigns = useMemo(() =>
    campaigns.filter(c => campaignStatusFilter === 'all' || c.status === campaignStatusFilter),
    [campaigns, campaignStatusFilter]
  );

  // ── Costs & Dispatch sub-tab derived lists ────────────────────────────────
  // pendingEntries strictly matches status='pending' (the DB-inserted initial value)
  // to mirror the approve_campaign_site_entry RPC which also requires status='pending'.
  // Non-pending/non-approved statuses (e.g. 'rejected') will not appear in any pill.
  const pendingEntries   = useMemo(() => siteEntries.filter(e => e.status === 'pending'), [siteEntries]);
  const approvedEntries  = useMemo(() => siteEntries.filter(e => e.status === 'Approved and Costed' && !e.dispatched_at), [siteEntries]);
  const dispatchedEntries = useMemo(() => siteEntries.filter(e => !!e.dispatched_at), [siteEntries]);
  const filteredCostEntries = useMemo(() => {
    if (costsSubTab === 'pending') return pendingEntries;
    if (costsSubTab === 'approved') return approvedEntries;
    return dispatchedEntries;
  }, [costsSubTab, pendingEntries, approvedEntries, dispatchedEntries]);

  const campaignTotals = useMemo(() => {
    const totalTarget  = villages.reduce((s, v) => s + (v.hh_target || 0), 0);
    const totalCovered = villages.reduce((s, v) => s + (v.hh_covered || 0), 0);
    return { totalTarget, totalCovered };
  }, [villages]);

  // ── Campaign creation wizard ───────────────────────────────────────────────

  const submitCampaign = async () => {
    if (!campaignForm.campaign_name.trim()) {
      toast({ title: 'Campaign name required', variant: 'destructive' }); return;
    }
    setSaving(true);
    try {
      // 1. Insert campaign
      // Derive state/locality summary from coverage areas for the campaign row
      const validAreas = coverageAreas.filter(a => a.state);
      const primaryState    = validAreas[0]?.state    || null;
      const primaryLocality = validAreas[0]?.locality || null;
      // Store all states as a comma-joined string if multiple (backward compat with text column)
      const allStates    = validAreas.length > 1 ? validAreas.map(a => a.state).join(', ')    : primaryState;
      const allLocalities = validAreas.length > 1 ? validAreas.map(a => a.locality).filter(Boolean).join(', ') : primaryLocality;
      const { data: camp, error: campErr } = await supabase
        .from('adhoc_campaigns')
        .insert({
          campaign_name:  campaignForm.campaign_name.trim(),
          state:          allStates,
          locality:       allLocalities,
          start_date:     campaignForm.start_date || null,
          end_date:       campaignForm.end_date   || null,
          status:         campaignForm.status,
          project_id:     (campaignForm.project_id && campaignForm.project_id !== '__none__') ? campaignForm.project_id : null,
          mmp_file_id:    campaignForm.mmp_file_id    || null,
          coordinator_id: campaignForm.coordinator_id || null,
          supervisor_id:  campaignForm.supervisor_id  || null,
        })
        .select('id')
        .single();
      if (campErr) throw campErr;

      // 2. Insert villages
      const validVillages = wizardVillages.filter(v => v.village_name.trim());
      if (validVillages.length > 0) {
        // Derive primary state/locality from coverage areas for fallback
        const primaryFallbackState    = coverageAreas.find(a => a.state)?.state    || null;
        const primaryFallbackLocality = coverageAreas.find(a => a.state)?.locality || null;
        const { data: vils, error: vilErr } = await supabase
          .from('adhoc_villages')
          .insert(validVillages.map(v => ({
            campaign_id:  camp.id,
            village_name: v.village_name.trim(),
            village_code: v.village_code.trim() || autoVillageCode(0),
            hh_target:    v.hh_target ? parseInt(v.hh_target) : 0,
            state:        v.state || primaryFallbackState,
            locality:     v.locality || primaryFallbackLocality,
            cluster_id:   v.cluster_id || null,
          })))
          .select('id, village_code');
        if (vilErr) throw vilErr;

        // 3. Insert team assignments (step 3 of wizard)
        const teamInserts: any[] = [];
        for (const ta of wizardTeams) {
          if (!ta.team_id) continue;
          const villageIds = ta.village_ids.length
            ? ta.village_ids
            : (vils || []).map((v: any) => v.id);
          for (const vid of villageIds) {
            // Find the village form entry to grab activity fields (if specified per-village)
            const vilObj = (vils || []).find((v: any) => v.id === vid);
            const vilForm = vilObj ? validVillages.find(v => v.village_code === (vilObj as any)?.village_code) : null;
            teamInserts.push({
              campaign_id:         camp.id,
              village_id:          vid,
              team_id:             ta.team_id,
              hh_target_for_team:  ta.hh_target_for_team ? parseInt(ta.hh_target_for_team) : null,
              activity_name:       vilForm?.activity_name || null,
              activity_type:       vilForm?.activity_type || null,
            });
          }
        }
        if (teamInserts.length > 0) {
          const { data: insertedAssignments } = await supabase
            .from('adhoc_village_teams')
            .insert(teamInserts)
            .select('id, village_id, team_id');
          // Auto-create mmp_site_entries so each assignment participates in fee/dispatch flow
          for (const asn of (insertedAssignments || [])) {
            const vil = (vils || []).find((v: any) => v.id === asn.village_id);
            const vilForm = validVillages.find(v => v.village_code === (vil as any)?.village_code);
            const team = allTeams.find(t => t.id === asn.team_id);
            await createSiteEntryForAssignment({
              assignmentId:     asn.id,
              campaignId:       camp.id,
              campaignName:     campaignForm.campaign_name.trim(),
              mmpFileId:        campaignForm.mmp_file_id || null,
              projectId:        (campaignForm.project_id && campaignForm.project_id !== '__none__') ? campaignForm.project_id : null,
              villageId:        asn.village_id,
              villageName:      vilForm?.village_name || (vil as any)?.village_code || asn.village_id,
              villageCode:      vilForm?.village_code,
              villageState:     vilForm?.state || primaryFallbackState || undefined,
              villageLocality:  vilForm?.locality || primaryFallbackLocality || undefined,
              teamId:           asn.team_id,
              teamName:         team?.team_name,
              activityName:     vilForm?.activity_name || null,
              activityType:     vilForm?.activity_type || null,
            });
          }
        }
      }

      toast({ title: 'Campaign created', description: campaignForm.campaign_name });
      setShowCreateCampaign(false);
      resetWizard();
      await loadCampaigns();
    } catch (e: any) {
      toast({ title: 'Error creating campaign', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const resetWizard = () => {
    setWizardStep(1);
    setCampaignForm({ campaign_name:'', start_date:'', end_date:'', status:'active', project_id:'', mmp_file_id:'', coordinator_id:'', supervisor_id:'' });
    setCoverageAreas([{ state:'', locality:'' }]);
    setWizardVillages([{ village_name:'', village_code:'VLG-01', hh_target:'', state:'', locality:'', cluster_id:'', activity_name:'', activity_type:'' }]);
    setWizardTeams([]);
  };

  // ── Create mmp_site_entry for a village-team assignment ───────────────────
  /** Inserts an mmp_site_entries row so the assignment participates in the
   *  existing fee / dispatch / payment-tracking flow, then links it back via
   *  adhoc_village_teams.site_entry_id. */
  const createSiteEntryForAssignment = async (params: {
    assignmentId: string;
    campaignId: string;
    campaignName: string;
    mmpFileId?: string | null;
    projectId?: string | null;
    villageId: string;
    villageName: string;
    villageCode?: string;
    villageState?: string;
    villageLocality?: string;
    teamId: string;
    teamName?: string;
    activityName?: string | null;
    activityType?: string | null;
    clusterId?: string | null;
    clusterName?: string | null;
  }) => {
    // Build a descriptive site_name that includes activity when present
    const siteName = params.activityName
      ? `${params.villageName} — ${params.activityName}`
      : params.villageName;

    const { data: entry, error } = await supabase
      .from('mmp_site_entries')
      .insert({
        mmp_file_id:    params.mmpFileId    || null,
        site_name:      siteName,
        site_code:      params.villageCode  || null,
        state:          params.villageState  || null,
        locality:       params.villageLocality || null,
        transport_fee:  0,
        enumerator_fee: 0,
        status:         'pending',
        additional_data: {
          source:         'village_campaign',
          campaign_id:    params.campaignId,
          campaign_name:  params.campaignName,
          village_id:     params.villageId,
          village_name:   params.villageName,
          team_id:        params.teamId,
          team_name:      params.teamName || null,
          assignment_id:  params.assignmentId,
          activity_name:  params.activityName || null,
          activity_type:  params.activityType || null,
          cluster_id:     params.clusterId    || null,
          cluster_name:   params.clusterName  || null,
        },
      })
      .select('id')
      .single();
    if (error) {
      // 23502 = NOT NULL violation — the DB still has the old schema.
      // Show a clear, copy-paste-ready fix so the admin knows exactly what to run.
      if ((error as any).code === '23502' && error.message?.includes('mmp_file_id')) {
        toast({
          title: 'Database setup required',
          description: 'Village Campaigns need a one-time schema fix. Run this in Supabase SQL Editor:\n\nALTER TABLE public.mmp_site_entries ALTER COLUMN mmp_file_id DROP NOT NULL;',
          variant: 'destructive',
          duration: 20000,
        });
      }
      console.error('[site_entry] create error:', error.message);
      return;
    }
    if (entry?.id) {
      await supabase
        .from('adhoc_village_teams')
        .update({ site_entry_id: entry.id })
        .eq('id', params.assignmentId);
    }
  };

  // ── Save fee edits for a site entry ──────────────────────────────────────
  const saveFee = async (entryId: string) => {
    const edit = feeEdits[entryId];
    if (!edit) return;
    setFeesSaving(s => ({ ...s, [entryId]: true }));
    try {
      const { error } = await supabase
        .from('mmp_site_entries')
        .update({
          transport_fee:  parseFloat(edit.transport_fee)  || 0,
          enumerator_fee: parseFloat(edit.enumerator_fee) || 0,
        })
        .eq('id', entryId);
      if (error) throw error;
      setSiteEntries(es => es.map(e => e.id === entryId
        ? { ...e, transport_fee: parseFloat(edit.transport_fee)||0, enumerator_fee: parseFloat(edit.enumerator_fee)||0 }
        : e
      ));
      toast({ title: 'Fees updated' });
    } catch (e: any) {
      toast({ title: 'Error saving fees', description: e.message, variant: 'destructive' });
    } finally {
      setFeesSaving(s => ({ ...s, [entryId]: false }));
    }
  };

  // ── Dispatch site entry to field team pickup queue ────────────────────────
  // Routes through a security-definer RPC that enforces coordinator/admin
  // authorization server-side and guards against re-dispatching already-
  // dispatched entries (dispatched_at IS NULL check in the UPDATE WHERE clause).
  const dispatchEntry = async (entry: SiteEntry) => {
    // Lifecycle guard: must be Approved and Costed before dispatch (mirrors RPC)
    if (entry.status !== 'Approved and Costed') {
      toast({ title: 'Approve entry first', description: 'Entry must be Approved & Costed before it can be dispatched.', variant: 'destructive' });
      return;
    }
    if (entry.dispatched_at) {
      toast({ title: 'Already dispatched', description: entry.site_name });
      return;
    }
    setDispatching(d => ({ ...d, [entry.id]: true }));
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const now = new Date().toISOString();
      const additionalData = {
        ...(entry.additional_data || {}),
        cost_status: 'dispatched',
        dispatched_at: now,
        dispatched_by: user.id,
      };
      const { data, error } = await supabase.rpc('dispatch_campaign_site_entry', {
        p_site_id: entry.id,
        p_additional_data: additionalData,
      });
      if (error) throw error;

      // RPC returns success:false with 'Already dispatched' when another user
      // beat us to it (dispatched_at IS NULL guard fired). Fetch the winner's
      // record, sync local state, and show a friendly toast instead of an error.
      if (!data?.success) {
        if (data?.message === 'Already dispatched') {
          const { data: fresh } = await supabase
            .from('mmp_site_entries')
            .select('status, dispatched_at, dispatched_by, additional_data')
            .eq('id', entry.id)
            .single();
          if (fresh) {
            setSiteEntries(es => es.map(e => e.id === entry.id ? { ...e, ...fresh } : e));
            const dispatcher = profileName((fresh as any).dispatched_by ?? undefined);
            toast({
              title: 'Already dispatched',
              description: `${entry.site_name} was already dispatched by ${dispatcher} — local view refreshed.`,
              variant: 'destructive',
            });
          }
          return;
        }
        throw new Error(data?.message || 'Server rejected dispatch');
      }

      // Use server-returned dispatched_at for accuracy
      const serverAt: string = data.dispatched_at ?? now;
      setSiteEntries(es => es.map(e => e.id === entry.id
        ? { ...e, status: 'Dispatched', dispatched_at: serverAt, dispatched_by: user.id, additional_data: additionalData }
        : e
      ));
      toast({ title: 'Dispatched', description: `${entry.site_name} is now in the field team pickup queue.` });
    } catch (e: any) {
      toast({ title: 'Dispatch failed', description: e.message, variant: 'destructive' });
    } finally {
      setDispatching(d => ({ ...d, [entry.id]: false }));
    }
  };

  const dispatchAll = async () => {
    // Only target entries that are Approved & Costed and not yet dispatched.
    // Entries still in 'pending' status must be approved first before dispatch.
    const pending = siteEntries.filter(e => !e.dispatched_at && e.status === 'Approved and Costed');
    if (!pending.length) { toast({ title: 'All entries already dispatched' }); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setDispatchingAll(true);
    try {
      const now = new Date().toISOString();
      // Call the security-definer RPC for each entry. The RPC re-checks
      // dispatched_at IS NULL server-side so concurrent dispatches are safe.
      // Supabase resolves (not rejects) on logic failures, so we must inspect
      // both the error field AND data.success before counting a win.
      type SuccessPayload = { id: string; dispatched_at: string; additionalData: Record<string, any>; skipped: boolean };
      const results = await Promise.allSettled(
        pending.map(async (e): Promise<SuccessPayload> => {
          const additionalData = { ...(e.additional_data || {}), cost_status: 'dispatched', dispatched_at: now, dispatched_by: user.id };
          const { data, error } = await supabase.rpc('dispatch_campaign_site_entry', {
            p_site_id: e.id,
            p_additional_data: additionalData,
          });
          if (error) throw error;
          // RPC returns success:false + 'Already dispatched' when another user
          // won the race — count as skipped (not a failure), sync state below.
          if (!data?.success) {
            if (data?.message === 'Already dispatched') {
              return { id: e.id, dispatched_at: now, additionalData, skipped: true };
            }
            throw new Error(data?.message || 'Server rejected dispatch');
          }
          return { id: e.id, dispatched_at: data.dispatched_at ?? now, additionalData, skipped: false };
        })
      );

      // Separate confirmed dispatches from skipped (already dispatched by someone else)
      const fulfilled = results
        .filter((r): r is PromiseFulfilledResult<SuccessPayload> => r.status === 'fulfilled')
        .map(r => r.value);
      const successes = fulfilled.filter(r => !r.skipped);
      const skipped   = fulfilled.filter(r =>  r.skipped).length;
      const failCount = results.filter(r => r.status === 'rejected').length;

      // Update local state for confirmed dispatches only
      if (successes.length > 0) {
        const successMap = new Map(successes.map(s => [s.id, s]));
        setSiteEntries(es => es.map(e => {
          const s = successMap.get(e.id);
          if (!s) return e;
          return { ...e, status: 'Dispatched', dispatched_at: s.dispatched_at, dispatched_by: user.id, additional_data: s.additionalData };
        }));
      }
      // For skipped rows, refresh from DB to get the winner's dispatched_by
      if (skipped > 0) {
        const skippedIds = fulfilled.filter(r => r.skipped).map(r => r.id);
        const { data: freshRows } = await supabase
          .from('mmp_site_entries')
          .select('id, status, dispatched_at, dispatched_by, additional_data')
          .in('id', skippedIds);
        if (freshRows && freshRows.length > 0) {
          const freshMap = new Map(freshRows.map((r: any) => [r.id, r]));
          setSiteEntries(es => es.map(e => {
            const f = freshMap.get(e.id);
            return f ? { ...e, ...f } : e;
          }));
        }
      }

      const parts: string[] = [];
      if (successes.length > 0) parts.push(`${successes.length} dispatched`);
      if (skipped > 0)          parts.push(`${skipped} already dispatched by another user`);
      if (failCount > 0)        parts.push(`${failCount} failed`);

      if (failCount > 0 && successes.length === 0 && skipped === 0) {
        toast({ title: 'Dispatch All failed', description: `All ${failCount} update${failCount !== 1 ? 's' : ''} were rejected by the server.`, variant: 'destructive' });
      } else if (failCount > 0) {
        toast({ title: parts.join(', '), description: 'Failed rows remain pending — check permissions and retry.', variant: 'destructive' });
      } else if (skipped > 0 && successes.length === 0) {
        toast({ title: 'All already dispatched', description: 'Every entry was dispatched by another user — local view refreshed.' });
      } else {
        toast({ title: parts.join(', '), description: successes.length > 0 ? 'Field teams can now pick them up from the mobile queue.' : undefined });
      }
    } catch (e: any) {
      toast({ title: 'Dispatch All failed', description: e.message, variant: 'destructive' });
    } finally {
      setDispatchingAll(false);
    }
  };

  // ── Approve entry (Pending → Approved and Costed) ─────────────────────────
  // Uses a SECURITY DEFINER RPC that enforces admin/FOM/superAdmin role
  // server-side and rejects concurrent lifecycle overwrites (dispatched rows
  // cannot be re-approved, already-approved rows return success:false).
  const approveEntry = async (entry: SiteEntry) => {
    // Only approve entries in the 'pending' state — matches the server-side RPC precondition
    if (entry.status !== 'pending') {
      toast({ title: entry.status === 'Approved and Costed' ? 'Already approved' : 'Cannot approve — entry is not in pending state' }); return;
    }
    setApproving(a => ({ ...a, [entry.id]: true }));
    try {
      const { data, error } = await supabase.rpc('approve_campaign_site_entry', {
        p_site_id: entry.id,
      });
      if (error) throw error;
      if (!data?.success) {
        throw new Error(data?.message || 'Server rejected approval');
      }
      setSiteEntries(es => es.map(e => e.id === entry.id ? { ...e, status: 'Approved and Costed' } : e));
      toast({ title: 'Approved & Costed', description: entry.site_name });
    } catch (e: any) {
      toast({ title: 'Approval failed', description: e.message, variant: 'destructive' });
    } finally {
      setApproving(a => ({ ...a, [entry.id]: false }));
    }
  };

  // ── Bulk approve all pending entries ──────────────────────────────────────
  // Each call goes through the server-side RPC so authorization is enforced
  // per-row. Rows that return success:false (already approved, dispatched, or
  // unauthorized) are counted as skipped rather than failures.
  const approveAll = async () => {
    const toApprove = pendingEntries; // already filtered: not approved, not dispatched
    if (!toApprove.length) { toast({ title: 'All entries already approved' }); return; }
    setApprovingAll(true);
    try {
      type ApproveResult = { id: string; skipped: boolean };
      const results = await Promise.allSettled(
        toApprove.map(async (e): Promise<ApproveResult> => {
          const { data, error } = await supabase.rpc('approve_campaign_site_entry', {
            p_site_id: e.id,
          });
          if (error) throw error;
          // success:false with 'Already approved' → skipped, not a failure
          if (!data?.success) {
            if (data?.message === 'Already approved') return { id: e.id, skipped: true };
            throw new Error(data?.message || 'Server rejected approval');
          }
          return { id: e.id, skipped: false };
        })
      );
      const successes = results
        .filter((r): r is PromiseFulfilledResult<ApproveResult> => r.status === 'fulfilled' && !r.value.skipped)
        .map(r => r.value.id);
      const skipped   = results.filter((r): r is PromiseFulfilledResult<ApproveResult> => r.status === 'fulfilled' && r.value.skipped).length;
      const failCount = results.filter(r => r.status === 'rejected').length;

      if (successes.length > 0) {
        setSiteEntries(es => es.map(e => successes.includes(e.id) ? { ...e, status: 'Approved and Costed' } : e));
      }

      if (failCount > 0 && successes.length === 0 && skipped === 0) {
        toast({ title: 'Approve All failed', description: `All ${failCount} entries were rejected.`, variant: 'destructive' });
      } else if (failCount > 0) {
        toast({ title: `${successes.length} approved, ${failCount} failed`, variant: 'destructive' });
      } else {
        toast({ title: `${successes.length} entr${successes.length !== 1 ? 'ies' : 'y'} approved${skipped ? ` (${skipped} already approved)` : ''}` });
      }
    } catch (e: any) {
      toast({ title: 'Approve All failed', description: e.message, variant: 'destructive' });
    } finally {
      setApprovingAll(false);
    }
  };

  // ── Approve advance — Tier 1 (pending → under_review) ───────────────────
  const approveAdvanceTier1 = async (advance: AdvanceRequest) => {
    setAdvanceApproving(a => ({ ...a, [advance.id]: true }));
    try {
      const { error } = await supabase.rpc('approve_campaign_advance_tier1', { p_advance_id: advance.id, p_notes: null });
      if (error) throw error;
      setAdvances(avs => avs.map(a => a.id === advance.id
        ? { ...a, status: 'under_review', tier1_status: 'approved' }
        : a));
      toast({ title: 'Tier 1 approved', description: `SDG ${Number(advance.requested_amount).toLocaleString()} — awaiting Tier 2 approval` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setAdvanceApproving(a => ({ ...a, [advance.id]: false }));
    }
  };

  // ── Approve advance — Tier 2 (under_review → approved) ───────────────────
  const approveAdvanceTier2 = async (advance: AdvanceRequest) => {
    setAdvanceApproving(a => ({ ...a, [advance.id]: true }));
    try {
      const { error } = await supabase.rpc('approve_campaign_advance_tier2', { p_advance_id: advance.id, p_notes: null });
      if (error) throw error;
      setAdvances(avs => avs.map(a => a.id === advance.id
        ? { ...a, status: 'approved', tier2_status: 'approved' }
        : a));
      toast({ title: 'Tier 2 approved', description: `SDG ${Number(advance.requested_amount).toLocaleString()} — ready for payment` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setAdvanceApproving(a => ({ ...a, [advance.id]: false }));
    }
  };

  // ── Reject advance (either tier) ──────────────────────────────────────────
  const rejectAdvance = async () => {
    const { advance, tier } = rejectDialog;
    if (!advance) return;
    setRejecting(true);
    try {
      const { error } = await supabase.rpc('reject_campaign_advance', {
        p_advance_id: advance.id,
        p_tier:       tier,
        p_reason:     rejectNote.trim() || 'Rejected',
      });
      if (error) throw error;
      const reason = rejectNote.trim() || 'Rejected';
      setAdvances(avs => avs.map(a => a.id === advance.id
        ? {
            ...a,
            status:           'rejected',
            rejection_reason: reason,
            ...(tier === 1 ? { tier1_status: 'rejected', tier1_notes: reason } : {}),
            ...(tier === 2 ? { tier2_status: 'rejected', tier2_notes: reason } : {}),
          }
        : a));
      toast({ title: `Tier ${tier} rejected`, description: reason });
      setRejectDialog({ open: false, advance: null, tier: 1 });
      setRejectNote('');
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setRejecting(false);
    }
  };

  // ── Mark advance request as paid (tier2-approved → paid) — via RPC ────────
  // All payment state writes are gated by the mark_campaign_advance_paid SECURITY
  // DEFINER RPC. Direct REST updates to status/paid_by/paid_at are blocked by RLS.
  const markAdvancePaid = async (advance: AdvanceRequest) => {
    setAdvanceApproving(a => ({ ...a, [advance.id]: true }));
    try {
      const { error } = await supabase.rpc('mark_campaign_advance_paid', {
        p_advance_id:  advance.id,
        p_paid_amount: advance.requested_amount,
      });
      if (error) throw error;
      setAdvances(avs => avs.map(a => a.id === advance.id ? { ...a, status: 'paid', total_paid_amount: advance.requested_amount } : a));
      toast({ title: 'Advance marked paid', description: `SDG ${Number(advance.requested_amount).toLocaleString()}` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setAdvanceApproving(a => ({ ...a, [advance.id]: false }));
    }
  };

  // ── Mark fee as paid ─────────────────────────────────────────────────────
  // The UPDATE includes .eq('fee_paid_status', 'unpaid') as an optimistic lock.
  // If another Finance user paid first the WHERE clause matches 0 rows; we fetch
  // the fresh DB record and surface an "Already recorded by [name]" toast instead
  // of silently overwriting their entry.
  const markPaid = async () => {
    const entry = payDialog.entry;
    if (!entry) return;
    const amount = parseFloat(payForm.amount);
    if (!amount || amount <= 0) {
      toast({ title: 'Enter a valid amount', variant: 'destructive' }); return;
    }
    setPaying(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const now = new Date().toISOString();
      const { data: updated, error } = await supabase
        .from('mmp_site_entries')
        .update({
          fee_paid_status:    'paid',
          fee_paid_amount:    amount,
          fee_paid_at:        now,
          fee_paid_by:        user.id,
          fee_payment_method: payForm.method || 'cash',
          fee_payment_notes:  payForm.notes || null,
        })
        .eq('id', entry.id)
        .eq('fee_paid_status', 'unpaid')   // optimistic lock — 0 rows if already paid
        .select('id');
      if (error) throw error;

      if (!updated || updated.length === 0) {
        // Another user already recorded payment — fetch the winner's record
        const { data: fresh } = await supabase
          .from('mmp_site_entries')
          .select('fee_paid_status, fee_paid_amount, fee_paid_at, fee_paid_by, fee_payment_method, fee_payment_notes')
          .eq('id', entry.id)
          .single();
        if (fresh) {
          setSiteEntries(es => es.map(e => e.id === entry.id ? { ...e, ...fresh } : e));
          const recorder = profileName((fresh as any).fee_paid_by ?? undefined);
          toast({
            title: 'Already recorded',
            description: `This entry was already marked paid by ${recorder} — local view refreshed.`,
            variant: 'destructive',
          });
        }
        setPayDialog({ open: false, entry: null });
        return;
      }

      setSiteEntries(es => es.map(e => e.id === entry.id
        ? { ...e, fee_paid_status: 'paid', fee_paid_amount: amount, fee_paid_at: now, fee_paid_by: user.id, fee_payment_method: payForm.method, fee_payment_notes: payForm.notes || null }
        : e
      ));
      toast({ title: 'Payment recorded', description: `${entry.site_name} — SDG ${amount.toLocaleString()}` });
      setPayDialog({ open: false, entry: null });
    } catch (e: any) {
      toast({ title: 'Error recording payment', description: e.message, variant: 'destructive' });
    } finally {
      setPaying(false);
    }
  };

  // ── Mark all unpaid entries as paid (bulk) ────────────────────────────────
  // Each UPDATE is guarded by .eq('fee_paid_status', 'unpaid') so concurrent
  // clicks from two Finance users can't double-record. Rows that return 0
  // updated are counted as "skipped" (already paid) rather than failures.
  // `subset` limits the operation to a specific list of entries (e.g. only
  // dispatched ones from the Dispatched sub-tab), preventing payment of
  // entries that have not been dispatched yet.
  const markAllPaid = async (subset?: SiteEntry[]) => {
    const pool   = subset ?? siteEntries;
    const unpaid = pool.filter(e => e.fee_paid_status !== 'paid');
    if (!unpaid.length) { toast({ title: 'All entries already paid' }); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setPayingAll(true);
    try {
      const now = new Date().toISOString();
      type Result = { id: string; amount: number; skipped: boolean };
      const results = await Promise.allSettled(
        unpaid.map(async (e): Promise<Result> => {
          const total = (e.transport_fee || 0) + (e.enumerator_fee || 0);
          const { data: updated, error } = await supabase
            .from('mmp_site_entries')
            .update({
              fee_paid_status: 'paid',
              fee_paid_amount: total,
              fee_paid_at: now,
              fee_paid_by: user.id,
              fee_payment_method: 'cash',
            })
            .eq('id', e.id)
            .eq('fee_paid_status', 'unpaid')  // optimistic lock
            .select('id');
          if (error) throw error;
          // 0 rows → already paid by another user; not an error, just skip
          return { id: e.id, amount: total, skipped: !updated || updated.length === 0 };
        })
      );

      const successes = results
        .filter((r): r is PromiseFulfilledResult<Result> => r.status === 'fulfilled' && !r.value.skipped)
        .map(r => r.value);
      const skipped = results
        .filter((r): r is PromiseFulfilledResult<Result> => r.status === 'fulfilled' && r.value.skipped)
        .length;
      const failCount = results.filter(r => r.status === 'rejected').length;

      if (successes.length > 0) {
        const successMap = new Map(successes.map(s => [s.id, s]));
        setSiteEntries(es => es.map(e => {
          const s = successMap.get(e.id);
          if (!s) return e;
          return { ...e, fee_paid_status: 'paid', fee_paid_amount: s.amount, fee_paid_at: now, fee_paid_by: user.id };
        }));
      }

      if (failCount > 0 && successes.length === 0 && skipped === 0) {
        toast({ title: 'Mark All Paid failed', description: `All ${failCount} updates failed.`, variant: 'destructive' });
      } else if (failCount > 0) {
        toast({ title: `${successes.length} marked paid, ${failCount} failed`, description: skipped ? `${skipped} already paid by another user.` : undefined, variant: 'destructive' });
      } else if (skipped > 0 && successes.length === 0) {
        toast({ title: 'Already paid', description: `All ${skipped} entr${skipped !== 1 ? 'ies' : 'y'} were already recorded by another user.`, variant: 'destructive' });
      } else if (skipped > 0) {
        toast({ title: `${successes.length} marked paid`, description: `${skipped} were already recorded by another user.` });
      } else {
        toast({ title: `${successes.length} entr${successes.length !== 1 ? 'ies' : 'y'} marked paid` });
      }
    } catch (e: any) {
      toast({ title: 'Mark All Paid failed', description: e.message, variant: 'destructive' });
    } finally {
      setPayingAll(false);
    }
  };

  // ── Revert paid entry back to unpaid ─────────────────────────────────────
  const revertPaid = async (entryId: string) => {
    try {
      const { error } = await supabase
        .from('mmp_site_entries')
        .update({ fee_paid_status: 'unpaid', fee_paid_amount: null, fee_paid_at: null, fee_paid_by: null, fee_payment_method: null, fee_payment_notes: null })
        .eq('id', entryId);
      if (error) throw error;
      setSiteEntries(es => es.map(e => e.id === entryId
        ? { ...e, fee_paid_status: 'unpaid', fee_paid_amount: null, fee_paid_at: null, fee_paid_by: null, fee_payment_method: null, fee_payment_notes: null }
        : e
      ));
      toast({ title: 'Payment reverted to unpaid' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  // ── Export Costs & Fees to Excel ─────────────────────────────────────────
  const exportFeesExcel = () => {
    if (!siteEntries.length || !selectedCampaign) return;
    const headers = [
      'Village / Site', 'Team', 'Transport Fee (SDG)', 'Enumerator Fee (SDG)',
      'Total Due (SDG)', 'Paid Status', 'Paid Amount (SDG)', 'Payment Date',
      'Payment Method', 'Notes', 'Recorded By', 'Dispatch Status',
    ];
    const rows = siteEntries.map(e => [
      e.site_name,
      e.additional_data?.team_name || '',
      e.transport_fee ?? 0,
      e.enumerator_fee ?? 0,
      (e.transport_fee ?? 0) + (e.enumerator_fee ?? 0),
      e.fee_paid_status || 'unpaid',
      e.fee_paid_status === 'paid' ? (e.fee_paid_amount ?? '') : '',
      e.fee_paid_at ? fmtDate(e.fee_paid_at) : '',
      fmtPayMethod(e.fee_payment_method) || '',
      e.fee_payment_notes || '',
      profileName(e.fee_paid_by ?? undefined),
      e.dispatched_at ? 'Dispatched' : 'Pending',
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = [
      { wch: 26 }, { wch: 20 }, { wch: 18 }, { wch: 18 },
      { wch: 15 }, { wch: 12 }, { wch: 16 }, { wch: 14 },
      { wch: 16 }, { wch: 32 }, { wch: 24 }, { wch: 14 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Fee Payments');
    const dateStr = format(new Date(), 'yyyyMMdd');
    const safeName = selectedCampaign.campaign_name.replace(/[^\w-]/g, '_');
    XLSX.writeFile(wb, `${safeName}_fees_${dateStr}.xlsx`);
  };

  // ── Submit new advance request ────────────────────────────────────────────
  const submitAdvance = async () => {
    if (!selectedCampaign?.project_id || !advanceForm.requested_amount) {
      toast({ title: 'Amount required', variant: 'destructive' }); return;
    }
    setAdvanceSaving(true);
    try {
      // Build a description that stamps the campaign name so Finance Hub staff
      // can identify which campaign originated this advance request.
      const descParts = [
        `[Campaign: ${selectedCampaign.campaign_name}]`,
        advanceForm.description?.trim(),
      ].filter(Boolean);

      const { error } = await supabase.from('advance_requests').insert({
        campaign_id:      selectedCampaign.id,          // authoritative FK — unique per campaign
        project_id:       selectedCampaign.project_id,  // kept for legacy queries
        site_name:        advanceForm.site_name || selectedCampaign.campaign_name,
        requested_amount: parseFloat(advanceForm.requested_amount),
        description:      descParts.join(' — '),
        expense_category: advanceForm.expense_category || 'transport',
        status:           'pending',
      });
      if (error) throw error;
      toast({ title: 'Advance request submitted' });
      setShowNewAdvance(false);
      await loadAdvances(selectedCampaign.project_id, selectedCampaign.id);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setAdvanceSaving(false);
    }
  };

  // ── Add village to existing campaign ─────────────────────────────────────

  const submitAddVillage = async () => {
    if (!selectedCampaign || !villageForm.village_name.trim()) {
      toast({ title: 'Village name required', variant: 'destructive' }); return;
    }
    setSaving(true);
    try {
      const code = villageForm.village_code.trim() || autoVillageCode(villages.length);
      const { error } = await supabase.from('adhoc_villages').insert({
        campaign_id:  selectedCampaign.id,
        village_name: villageForm.village_name.trim(),
        village_code: code,
        hh_target:    villageForm.hh_target ? parseInt(villageForm.hh_target) : 0,
        state:        villageForm.state || selectedCampaign.state || null,
        locality:     villageForm.locality || selectedCampaign.locality || null,
        cluster_id:   villageForm.cluster_id || null,
      });
      if (error) throw error;
      toast({ title: 'Village added', description: villageForm.village_name });
      setShowAddVillage(false);
      setVillageForm({ village_name:'', village_code:'', hh_target:'', state:'', locality:'', cluster_id:'' });
      await loadCampaignDetail(selectedCampaign.id);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  // ── Assign team to village ────────────────────────────────────────────────

  const submitAssignTeam = async () => {
    if (!selectedCampaign || !assignForm.team_id || !assignForm.village_id) {
      toast({ title: 'Team and village required', variant: 'destructive' }); return;
    }
    // Activity type without a name would create an ambiguous identity for the uniqueness key.
    // Require a name whenever the user picks a non-general type.
    if (assignForm.activity_type && !assignForm.activity_name.trim()) {
      toast({ title: 'Activity name required', description: 'Please enter an activity name (e.g. "Nutrition") when an activity type is selected.', variant: 'destructive' }); return;
    }
    setSaving(true);
    try {
      const { data: assignment, error } = await supabase
        .from('adhoc_village_teams')
        .insert({
          campaign_id:        selectedCampaign.id,
          village_id:         assignForm.village_id,
          team_id:            assignForm.team_id,
          hh_target_for_team: assignForm.hh_target_for_team ? parseInt(assignForm.hh_target_for_team) : null,
          activity_name:      assignForm.activity_name || null,
          activity_type:      assignForm.activity_type || null,
        })
        .select('id')
        .single();
      if (error) throw error;
      // Auto-create mmp_site_entry so assignment participates in fee/dispatch flow
      const vil = villages.find(v => v.id === assignForm.village_id);
      const team = allTeams.find(t => t.id === assignForm.team_id);
      const cluster = clusters.find(c => c.id === vil?.cluster_id);
      if (assignment?.id && vil) {
        await createSiteEntryForAssignment({
          assignmentId:    assignment.id,
          campaignId:      selectedCampaign.id,
          campaignName:    selectedCampaign.campaign_name,
          mmpFileId:       selectedCampaign.mmp_file_id,
          projectId:       selectedCampaign.project_id,
          villageId:       vil.id,
          villageName:     vil.village_name,
          villageCode:     vil.village_code,
          villageState:    vil.state,
          villageLocality: vil.locality,
          teamId:          assignForm.team_id,
          teamName:        team?.team_name,
          activityName:    assignForm.activity_name || null,
          activityType:    assignForm.activity_type || null,
          clusterId:       vil.cluster_id || null,
          clusterName:     cluster?.cluster_name || null,
        });
      }
      toast({ title: 'Team assigned' });
      setShowAssignTeam(false);
      setAssignForm({ team_id:'', village_id:'', hh_target_for_team:'', activity_name:'', activity_type:'' });
      await loadCampaignDetail(selectedCampaign.id);
    } catch (e: any) {
      // Unique-constraint violation means this team/village/activity combo already exists
      const isDuplicate = e?.code === '23505' || e?.message?.includes('unique');
      toast({
        title: isDuplicate ? 'Duplicate assignment' : 'Error',
        description: isDuplicate
          ? 'This team is already assigned to that village for the same activity. Use a different activity name to add a second assignment.'
          : e.message,
        variant: 'destructive',
      });
    } finally { setSaving(false); }
  };

  // ── Cluster CRUD ──────────────────────────────────────────────────────────

  function autoClusterCode(existing: Cluster[]) {
    const nums = existing
      .map(c => { const m = c.cluster_code.match(/(\d+)$/); return m ? parseInt(m[1]) : 0; })
      .filter(n => n > 0);
    const next = nums.length ? Math.max(...nums) + 1 : 1;
    return `CLU-${String(next).padStart(2, '0')}`;
  }

  const submitAddCluster = async () => {
    if (!selectedCampaign || !clusterForm.cluster_name.trim()) {
      toast({ title: 'Cluster name required', variant: 'destructive' }); return;
    }
    setClusterSaving(true);
    try {
      const code = clusterForm.cluster_code.trim() || autoClusterCode(clusters);
      const { error } = await supabase.from('adhoc_clusters').insert({
        campaign_id:  selectedCampaign.id,
        cluster_name: clusterForm.cluster_name.trim(),
        cluster_code: code,
        state:        clusterForm.state || null,
        locality:     clusterForm.locality || null,
      });
      if (error) throw error;
      toast({ title: 'Cluster added', description: clusterForm.cluster_name });
      setShowAddCluster(false);
      setClusterForm({ cluster_name:'', cluster_code:'', state:'', locality:'' });
      await loadCampaignDetail(selectedCampaign.id);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setClusterSaving(false); }
  };

  const deleteCluster = async (id: string) => {
    if (!selectedCampaign) return;
    try {
      const { error } = await supabase.from('adhoc_clusters').delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Cluster removed' });
      await loadCampaignDetail(selectedCampaign.id);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  // ── Excel bulk import ─────────────────────────────────────────────────────

  /** Download a pre-formatted XLSX template with a Team Registry sheet. */
  const downloadVillageTemplate = () => {
    if (!selectedCampaign) return;
    const headers = [
      'State', 'Locality', 'Cluster Name', 'Cluster Code',
      'Village Name', 'Village Code', 'HH Target',
      'Activity Name', 'Activity Type',
      'Team Code', 'Transport Fee (SDG)', 'Enumerator Fee (SDG)',
    ];
    const ex1 = ['Central Darfur', 'Zalingei', 'North Cluster', 'CLU-01', 'Al Geneina Village', 'VLG-01', '150', 'Nutrition', 'nutrition', allTeams[0]?.team_code || 'TM-001', '500', '1500'];
    const ex2 = ['Central Darfur', 'Zalingei', 'North Cluster', 'CLU-01', 'Al Geneina Village', 'VLG-01', '', 'WASH', 'wash', allTeams[1]?.team_code || 'TM-002', '500', '1500'];
    const ex3 = ['North Darfur', 'Kabkabiya', 'East Cluster', 'CLU-02', 'Kabkabiya Centre', 'VLG-02', '200', '', '', allTeams[0]?.team_code || 'TM-001', '600', '1200'];
    const ws = XLSX.utils.aoa_to_sheet([headers, ex1, ex2, ex3]);
    ws['!cols'] = [20, 16, 22, 14, 24, 14, 10, 18, 14, 12, 18, 18].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Village Import');

    // Sheet 2: current teams so admins can copy valid codes
    const teamHeaders = ['Team Code', 'Team Name', 'Team Lead', 'Members'];
    const teamRows = allTeams.map(t => [t.team_code, t.team_name, t.team_lead_name || '—', t.member_count]);
    const ws2 = XLSX.utils.aoa_to_sheet([teamHeaders, ...teamRows]);
    ws2['!cols'] = [14, 24, 24, 10].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws2, 'Team Registry');

    const safeName = selectedCampaign.campaign_name.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    XLSX.writeFile(wb, `village-import-${safeName}.xlsx`);
  };

  /** Column aliases for auto-detection — normalise both sides to lowercase+letters+digits */
  const normaliseHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');
  const COL_ALIASES: Record<keyof Omit<ImportRow, '_errors' | '_teamId' | '_rowNum'>, string[]> = {
    state:          ['state', 'stateprovince'],
    locality:       ['locality', 'district', 'county', 'localitydistrict'],
    cluster_name:   ['clustername', 'cluster'],
    cluster_code:   ['clustercode', 'clucode', 'clusterid'],
    village_name:   ['villagename', 'village'],
    village_code:   ['villagecode', 'villcode'],
    hh_target:      ['hhtarget', 'targethh', 'target', 'households', 'hh'],
    activity_name:  ['activityname', 'activity'],
    activity_type:  ['activitytype', 'type'],
    team_code:      ['teamcode', 'team'],
    transport_fee:  ['transportfeesdg', 'transportfee', 'transport', 'travelfee'],
    enumerator_fee: ['enumeratorfeesdg', 'enumeratorfee', 'enumfee', 'fee'],
  };

  const VALID_ACTIVITY_TYPES = new Set(['nutrition','wash','protection','health','education','livelihoods','shelter','other','']);

  /** Parse an XLSX file and populate importRows with validated ImportRow objects. */
  const parseVillageImportFile = (file: File) => {
    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'binary', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as (string | number)[][];
        if (raw.length < 2) {
          toast({ title: 'Empty file', description: 'No data rows found.', variant: 'destructive' });
          return;
        }
        const headers = raw[0].map(h => normaliseHeader(String(h)));
        const dataRows = raw.slice(1);

        // Build column-index map
        const fieldMap: Partial<Record<keyof Omit<ImportRow, '_errors' | '_teamId' | '_rowNum'>, number>> = {};
        for (const [field, aliases] of Object.entries(COL_ALIASES) as [keyof typeof COL_ALIASES, string[]][]) {
          for (const alias of aliases) {
            const idx = headers.indexOf(alias);
            if (idx >= 0) { fieldMap[field] = idx; break; }
          }
        }

        const get = (row: (string | number)[], field: keyof typeof COL_ALIASES) => {
          const idx = fieldMap[field];
          if (idx === undefined) return '';
          const v = row[idx];
          return v === undefined || v === null ? '' : String(v).trim();
        };

        // Strict numeric validators used during row parsing.
        // Number() is stricter than parseInt/parseFloat:  Number("100kg") → NaN.
        const strictNonNegInt = (raw: string, label: string): string | null => {
          if (!raw.trim()) return null;               // blank → allowed as 0
          const n = Number(raw);
          if (!isFinite(n))         return `${label} "${raw}" is not a valid number`;
          if (n < 0)                return `${label} must be ≥ 0 (got ${raw})`;
          if (!Number.isInteger(n)) return `${label} must be a whole number (got ${raw})`;
          return null;
        };
        const strictNonNegFee = (raw: string, label: string): string | null => {
          if (!raw.trim()) return null;               // blank → treated as 0
          const n = Number(raw);
          if (!isFinite(n)) return `${label} "${raw}" is not a valid number`;
          if (n < 0)        return `${label} must be ≥ 0 (got ${raw})`;
          return null;
        };

        const rows: ImportRow[] = dataRows
          .map((row, i) => {
            const village_name   = get(row, 'village_name');
            const activity_type  = get(row, 'activity_type').toLowerCase();
            const team_code      = get(row, 'team_code');
            const hh_raw         = get(row, 'hh_target');
            const tf_raw         = get(row, 'transport_fee');
            const ef_raw         = get(row, 'enumerator_fee');

            const errors: string[] = [];
            if (!village_name) errors.push('Village Name is required');

            // Strict numeric validation — catches "100kg", -5, 150.7, etc.
            const hhErr = strictNonNegInt(hh_raw,  'HH Target');
            if (hhErr) errors.push(hhErr);
            const tfErr = strictNonNegFee(tf_raw,  'Transport Fee');
            if (tfErr) errors.push(tfErr);
            const efErr = strictNonNegFee(ef_raw,  'Enumerator Fee');
            if (efErr) errors.push(efErr);

            if (activity_type && !VALID_ACTIVITY_TYPES.has(activity_type)) {
              errors.push(`Unknown activity type "${activity_type}". Valid: nutrition, wash, protection, health, education, livelihoods, shelter, other`);
            }
            let _teamId: string | undefined;
            if (team_code) {
              const match = allTeams.find(t => t.team_code.toLowerCase() === team_code.toLowerCase());
              if (!match) errors.push(`Team code "${team_code}" not found in Team Registry`);
              else _teamId = match.id;
            }

            return {
              state:          get(row, 'state'),
              locality:       get(row, 'locality'),
              cluster_name:   get(row, 'cluster_name'),
              cluster_code:   get(row, 'cluster_code'),
              village_name,
              village_code:   get(row, 'village_code'),
              hh_target:      hh_raw,
              activity_name:  get(row, 'activity_name'),
              activity_type,
              team_code,
              transport_fee:  tf_raw,
              enumerator_fee: ef_raw,
              _errors: errors,
              _teamId,
              _rowNum: i + 2,   // 1-based; row 1 is the header
            } as ImportRow;
          })
          .filter(r => r.village_name || r.cluster_name || r.team_code);  // skip fully empty rows

        if (rows.length === 0) {
          toast({ title: 'No data', description: 'All rows were empty.', variant: 'destructive' });
          return;
        }
        setImportRows(rows);
      } catch {
        toast({ title: 'Parse error', description: 'Could not read the file. Make sure it is a valid .xlsx file.', variant: 'destructive' });
      }
    };
    reader.readAsBinaryString(file);
  };

  /** Run the idempotent import for all valid rows. */
  /** Idempotent import: each valid row is handled by a single Supabase RPC that
   *  atomically upserts the cluster → village → assignment → site-entry → back-link
   *  in one server-side transaction.  No partial state can be created.  A retry after
   *  any failure is always safe (ON CONFLICT upserts for clusters/villages; ON CONFLICT
   *  DO NOTHING for assignments, with site-entry repair for null site_entry_id rows). */
  const runVillageImport = async () => {
    if (!selectedCampaign) return;
    const validRows = importRows.filter(r => r._errors.length === 0);
    if (validRows.length === 0) {
      toast({ title: 'No valid rows', description: 'Fix all errors before importing.', variant: 'destructive' });
      return;
    }
    setImporting(true);

    // Counters populated from RPC response actions
    let created = 0, repaired = 0, skipped = 0;

    try {
      const campaignId = selectedCampaign.id;

      // ── Pre-generate collision-free cluster codes for rows that lack one ───────
      // Load existing cluster codes so we never reuse one already in the campaign.
      const { data: existingClustersForImport } = await supabase
        .from('adhoc_clusters').select('cluster_name, cluster_code').eq('campaign_id', campaignId);
      const existingClusterCodeSet = new Set((existingClustersForImport || []).map(c => c.cluster_code));
      const existingClusterNameToCode = Object.fromEntries(
        (existingClustersForImport || []).map(c => [c.cluster_name.toLowerCase(), c.cluster_code])
      );

      // Map: cluster_name (lower) → code to use in the RPC call
      const clusterCodeForRow: Record<string, string> = { ...existingClusterNameToCode };
      let cluSeq = existingClustersForImport?.length ?? 0;

      for (const row of validRows) {
        if (!row.cluster_name) continue;
        const key = row.cluster_name.toLowerCase();
        if (clusterCodeForRow[key]) continue;    // already have a code for this name

        if (row.cluster_code && !existingClusterCodeSet.has(row.cluster_code)) {
          // Spreadsheet provided a code and it's not taken
          clusterCodeForRow[key] = row.cluster_code;
          existingClusterCodeSet.add(row.cluster_code);
        } else {
          // Generate a unique code that doesn't collide with existing ones
          let code: string;
          do {
            cluSeq++;
            code = `CLU-${String(cluSeq).padStart(2, '0')}`;
          } while (existingClusterCodeSet.has(code));
          clusterCodeForRow[key] = code;
          existingClusterCodeSet.add(code);
        }
      }

      for (const row of validRows) {
        const resolvedClusterCode = row.cluster_name
          ? (clusterCodeForRow[row.cluster_name.toLowerCase()] ?? null)
          : null;

        const { data, error } = await supabase.rpc('import_village_campaign_row', {
          p_campaign_id:      campaignId,
          p_campaign_name:    selectedCampaign.campaign_name,
          p_mmp_file_id:      selectedCampaign.mmp_file_id  || null,
          p_cluster_name:     row.cluster_name               || null,
          p_cluster_code:     resolvedClusterCode,
          p_cluster_state:    row.state                      || null,
          p_cluster_locality: row.locality                   || null,
          p_village_name:     row.village_name,
          p_village_code:     row.village_code               || null,
          p_hh_target:        row.hh_target ? Number(row.hh_target) : 0,
          p_village_state:    row.state                      || null,
          p_village_locality: row.locality                   || null,
          p_team_id:          row._teamId                    || null,
          p_activity_name:    row.activity_name              || null,
          p_activity_type:    row.activity_type              || null,
          p_transport_fee:    row.transport_fee  ? Number(row.transport_fee)  : 0,
          p_enumerator_fee:   row.enumerator_fee ? Number(row.enumerator_fee) : 0,
        });

        if (error) throw new Error(`Row ${row._rowNum} (${row.village_name}): ${error.message}`);

        const action = (data as any)?.action as string | undefined;
        if (action === 'created')      created++;
        else if (action === 'repaired') repaired++;
        else if (action === 'skipped' || action === 'village_only') skipped++;
      }

      toast({
        title: 'Import complete',
        description: [
          created  && `${created} row${created   !== 1 ? 's' : ''} imported`,
          repaired && `${repaired} missing fee record${repaired !== 1 ? 's' : ''} repaired`,
          skipped  && `${skipped} duplicate${skipped  !== 1 ? 's' : ''} skipped`,
        ].filter(Boolean).join(' · ') || 'Nothing new to import — all rows were already present',
      });
      setShowImportDialog(false);
      setImportRows([]);
      setImportFileName('');
      await loadCampaignDetail(campaignId);
    } catch (e: any) {
      toast({ title: 'Import failed', description: e.message, variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  // ── Submit daily log ──────────────────────────────────────────────────────

  const submitDailyLog = async () => {
    if (!logForm.assignment_id || !logForm.report_date) {
      toast({ title: 'Assignment and date required', variant: 'destructive' }); return;
    }
    const assignment = assignments.find(a => a.id === logForm.assignment_id);
    if (!assignment || !selectedCampaign) return;
    setSaving(true);
    try {
      // Upsert the log row; we need the id to attach photos
      const { data: logRow, error } = await supabase.from('adhoc_daily_logs').upsert({
        assignment_id: logForm.assignment_id,
        campaign_id:   selectedCampaign.id,
        village_id:    assignment.village_id,
        team_id:       assignment.team_id,
        report_date:   logForm.report_date,
        hh_covered:    parseInt(logForm.hh_covered)    || 0,
        male_count:    parseInt(logForm.male_count)    || 0,
        female_count:  parseInt(logForm.female_count)  || 0,
        beneficiaries: parseInt(logForm.beneficiaries) || 0,
        notes:         logForm.notes || null,
        source:        'web',
      }, { onConflict: 'assignment_id,report_date' }).select('id').single();
      if (error) throw error;

      // Upload any attached photos and record them in adhoc_daily_log_photos
      if (logPhotos.length > 0 && logRow?.id) {
        const logId = logRow.id as string;
        const photoInserts: { log_id: string; photo_url: string; storage_path: string }[] = [];

        for (const file of logPhotos) {
          const ext = file.name.split('.').pop() || 'jpg';
          const storagePath = `village-campaign-logs/${logId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
          const { error: uploadErr } = await supabase.storage
            .from('site-visit-photos')
            .upload(storagePath, file, { upsert: false });

          if (uploadErr) {
            // Non-fatal: log and continue with remaining photos
            console.error('Photo upload error:', uploadErr.message);
            continue;
          }

          const { data: urlData } = supabase.storage
            .from('site-visit-photos')
            .getPublicUrl(storagePath);

          if (urlData?.publicUrl) {
            photoInserts.push({ log_id: logId, photo_url: urlData.publicUrl, storage_path: storagePath });
          }
        }

        if (photoInserts.length > 0) {
          const { error: photoErr } = await supabase.from('adhoc_daily_log_photos').insert(photoInserts);
          if (photoErr) console.error('Photo record insert error:', photoErr.message);
        }
      }

      toast({ title: 'Daily log saved', description: fmtDate(logForm.report_date) });
      setShowDailyLog(false);
      setLogForm({ assignment_id:'', report_date: format(new Date(), 'yyyy-MM-dd'), hh_covered:'', male_count:'', female_count:'', beneficiaries:'', notes:'' });
      setLogPhotos([]);
      await loadCampaignDetail(selectedCampaign.id);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  // ── Create team ───────────────────────────────────────────────────────────

  const submitCreateTeam = async () => {
    if (!teamForm.team_name.trim() || !teamForm.team_code.trim()) {
      toast({ title: 'Team name and code required', variant: 'destructive' }); return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('adhoc_teams').insert({
        team_name:    teamForm.team_name.trim(),
        team_code:    teamForm.team_code.trim(),
        team_lead_id: teamForm.team_lead_id || null,
        member_count: parseInt(teamForm.member_count) || 0,
        notes:        teamForm.notes || null,
      });
      if (error) throw error;
      toast({ title: 'Team created', description: teamForm.team_code });
      setShowCreateTeam(false);
      setTeamForm({ team_name:'', team_code:'', team_lead_id:'', member_count:'', notes:'' });
      await loadTeams();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const deleteTeam = async (id: string) => {
    await supabase.from('adhoc_teams').update({ is_active: false }).eq('id', id);
    await loadTeams();
    toast({ title: 'Team deactivated' });
  };

  const deleteCampaign = async (id: string) => {
    await supabase.from('adhoc_campaigns').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    await loadCampaigns();
    if (selectedCampaign?.id === id) setSelectedCampaign(null);
    toast({ title: 'Campaign deleted' });
  };

  // ── Completion report export ──────────────────────────────────────────────

  const exportCompletion = () => {
    if (!selectedCampaign) return;
    const wb = XLSX.utils.book_new();

    // Sheet 1: By Village
    const vilRows = villages.map(v => ({
      'Village Code':   v.village_code,
      'Village Name':   v.village_name,
      'State':          v.state || '—',
      'Locality':       v.locality || '—',
      'HH Target':      v.hh_target,
      'HH Covered':     v.hh_covered || 0,
      'Progress %':     pct(v.hh_covered || 0, v.hh_target),
      'Teams Assigned': v.team_count || 0,
      'Status':         v.status,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(vilRows), 'By Village');

    // Sheet 2: By Team
    const teamSummary: Record<string, { team_name: string; team_code: string; lead: string; villages: string[]; total_hh: number; total_beneficiaries: number }> = {};
    for (const a of assignments) {
      if (!teamSummary[a.team_id]) {
        teamSummary[a.team_id] = { team_name: a.team_name||'', team_code: a.team_code||'', lead: a.team_lead_name||'', villages: [], total_hh: 0, total_beneficiaries: 0 };
      }
      teamSummary[a.team_id].villages.push(a.village_name || '');
      teamSummary[a.team_id].total_hh += a.hh_covered || 0;
    }
    for (const l of dailyLogs) {
      if (teamSummary[l.team_id]) teamSummary[l.team_id].total_beneficiaries += l.beneficiaries || 0;
    }
    const teamRows = Object.values(teamSummary).map(t => ({
      'Team Code':   t.team_code,
      'Team Name':   t.team_name,
      'Team Lead':   t.lead,
      'Villages Worked': t.villages.join(', '),
      'Total HH Covered': t.total_hh,
      'Total Beneficiaries': t.total_beneficiaries,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(teamRows), 'By Team');

    // Sheet 3: Daily Logs
    const logRows = dailyLogs.map(l => ({
      'Date':          l.report_date,
      'Village':       l.village_name,
      'Team Code':     l.team_code,
      'Team Name':     l.team_name,
      'HH Covered':    l.hh_covered,
      'Male':          l.male_count,
      'Female':        l.female_count,
      'Beneficiaries': l.beneficiaries,
      'Notes':         l.notes || '',
      'Submitted By':  l.submitted_by_name,
      'Source':        l.source,
      'Submitted At':  fmtDate(l.submitted_at),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(logRows), 'Daily Logs');

    XLSX.writeFile(wb, `${selectedCampaign.campaign_name.replace(/\s+/g, '_')}_completion_report.xlsx`);
    toast({ title: 'Report exported' });
  };

  // ── Campaign List View ────────────────────────────────────────────────────

  if (!selectedCampaign) {
    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Home className="h-5 w-5 text-primary" />
              Village Campaigns
            </h2>
            <p className="text-sm text-muted-foreground">Coordinate multi-team coverage of villages with daily progress tracking</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={campaignStatusFilter} onValueChange={setCampaignStatusFilter}>
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
            {canManage && (
              <>
                <Button variant="outline" size="sm" onClick={() => setShowTeamRegistry(true)} className="h-8 gap-1.5">
                  <Users className="h-3.5 w-3.5" /> Teams
                </Button>
                <Button size="sm" onClick={() => { resetWizard(); setShowCreateCampaign(true); }} className="h-8 gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> New Campaign
                </Button>
              </>
            )}
            <Button variant="ghost" size="sm" onClick={loadCampaigns} className="h-8 w-8 p-0">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Campaign Cards */}
        {loadError ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 space-y-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="font-semibold text-sm text-destructive">Village Campaigns tables not found</p>
                <p className="text-sm text-muted-foreground">{loadError}</p>
              </div>
            </div>
            <div className="pl-8 text-xs text-muted-foreground space-y-1">
              <p className="font-medium">To fix:</p>
              <ol className="list-decimal list-inside space-y-0.5">
                <li>Open <strong>Supabase Dashboard → SQL Editor</strong></li>
                <li>Paste and run <code className="bg-muted px-1 rounded">supabase/migrations/20260812_village_campaigns_safe_rerun.sql</code></li>
                <li>Then run <code className="bg-muted px-1 rounded">supabase/migrations/20260813_village_campaigns_rls_patch.sql</code></li>
                <li>Then run <code className="bg-muted px-1 rounded">supabase/migrations/20260813_village_campaign_site_entries.sql</code></li>
                <li>Then run <code className="bg-muted px-1 rounded">supabase/migrations/20260813_advance_requests_campaign_id.sql</code></li>
                <li>Then run <code className="bg-muted px-1 rounded">supabase/migrations/20260814_mmp_site_entries_nullable_mmp_file_id.sql</code></li>
              </ol>
              <p className="pt-1">Full instructions: <code className="bg-muted px-1 rounded">supabase/RUNBOOK_village_campaigns.md</code></p>
            </div>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading campaigns…
          </div>
        ) : filteredCampaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <Building2 className="h-10 w-10 opacity-30" />
            <p className="font-medium">No campaigns yet</p>
            {canManage && <Button size="sm" onClick={() => { resetWizard(); setShowCreateCampaign(true); }}><Plus className="h-3.5 w-3.5 mr-1.5" />Create first campaign</Button>}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredCampaigns.map(c => (
              <Card key={c.id} className="hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-primary/40" onClick={() => { setSelectedCampaign(c); setCampaignTab('overview'); }}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm leading-tight">{c.campaign_name}</p>
                      {c.state && <p className="text-xs text-muted-foreground mt-0.5">{c.state}{c.locality ? ` › ${c.locality}` : ''}</p>}
                    </div>
                    <Badge className={`text-[10px] ${statusColor(c.status)} border-0 shrink-0`}>{c.status}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    {c.start_date && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{fmtDate(c.start_date)}</span>}
                    {c.coordinator_name && c.coordinator_name !== '—' && <span className="flex items-center gap-1"><UserCheck className="h-3 w-3" />{c.coordinator_name}</span>}
                    {c.project_name && c.project_name !== '—' && <span className="flex items-center gap-1 col-span-2"><ClipboardList className="h-3 w-3" />{c.project_name}</span>}
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t">
                    <span className="text-xs text-muted-foreground">View details</span>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ── Create Campaign Wizard ────────────────────────────────────────── */}
        <Dialog open={showCreateCampaign} onOpenChange={setShowCreateCampaign}>
          <DialogContent
            className="max-w-2xl max-h-[90vh] overflow-y-auto"
            onPointerDownOutside={e => {
              // Prevent Radix Select portals from triggering dialog close
              const target = e.target as Element;
              if (target?.closest?.('[data-radix-popper-content-wrapper]')) e.preventDefault();
            }}
          >
            <DialogHeader>
              <DialogTitle>Create Village Campaign — Step {wizardStep} of 3</DialogTitle>
              <DialogDescription>
                {wizardStep === 1 && 'Campaign details, dates and personnel'}
                {wizardStep === 2 && 'Add the villages to be covered (with HH targets)'}
                {wizardStep === 3 && 'Optionally assign teams to villages now'}
              </DialogDescription>
            </DialogHeader>

            {/* Step 1: Campaign details */}
            {wizardStep === 1 && (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Label>Campaign Name *</Label>
                    <Input value={campaignForm.campaign_name} onChange={e => setCampaignForm(f => ({ ...f, campaign_name: e.target.value }))} placeholder="e.g. North Darfur HH Survey Wave 3" />
                  </div>
                  <div>
                    <Label>Status</Label>
                    <Select value={campaignForm.status} onValueChange={v => setCampaignForm(f => ({ ...f, status: v as Campaign['status'] }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Start Date</Label>
                    <Input type="date" value={campaignForm.start_date} onChange={e => setCampaignForm(f => ({ ...f, start_date: e.target.value }))} />
                  </div>
                  <div>
                    <Label>End Date</Label>
                    <Input type="date" value={campaignForm.end_date} onChange={e => setCampaignForm(f => ({ ...f, end_date: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Coordinator</Label>
                    <Select value={campaignForm.coordinator_id} onValueChange={v => setCampaignForm(f => ({ ...f, coordinator_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select coordinator" /></SelectTrigger>
                      <SelectContent>{profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name || p.username}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Supervisor</Label>
                    <Select value={campaignForm.supervisor_id} onValueChange={v => setCampaignForm(f => ({ ...f, supervisor_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select supervisor" /></SelectTrigger>
                      <SelectContent>
                        {supervisors.length === 0
                          ? <div className="px-3 py-2 text-xs text-muted-foreground">No supervisor-role users found</div>
                          : supervisors.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name || p.username}</SelectItem>)
                        }
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Linked Project (optional)</Label>
                    <Select value={campaignForm.project_id} onValueChange={v => setCampaignForm(f => ({ ...f, project_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">None</SelectItem>
                        {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* ── Multi-state/locality coverage areas ── */}
                  <div className="sm:col-span-2">
                    <div className="flex items-center justify-between mb-2">
                      <Label>Coverage Areas <span className="text-[10px] font-normal text-muted-foreground ml-1">(campaign spans these states &amp; localities)</span></Label>
                    </div>
                    <div className="space-y-2">
                      {coverageAreas.map((area, idx) => {
                        const areaLocalities = localitiesForState(area.state);
                        return (
                          <div key={idx} className="flex gap-2 items-center">
                            <div className="flex-1">
                              <Select value={area.state || '__none__'} onValueChange={v => setCoverageAreas(areas => areas.map((a, i) => i === idx ? { state: v === '__none__' ? '' : v, locality: '' } : a))}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select state" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">Select state…</SelectItem>
                                  {sudanStates.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex-1">
                              <Select value={area.locality || '__none__'} onValueChange={v => setCoverageAreas(areas => areas.map((a, i) => i === idx ? { ...a, locality: v === '__none__' ? '' : v } : a))} disabled={!area.state}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select locality" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">Select locality…</SelectItem>
                                  {areaLocalities.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                            {coverageAreas.length > 1 && (
                              <button type="button" className="text-red-400 hover:text-red-600 transition-colors" onClick={() => setCoverageAreas(areas => areas.filter((_, i) => i !== idx))}>
                                <X className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                      <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setCoverageAreas(areas => [...areas, { state:'', locality:'' }])}>
                        <Plus className="h-3 w-3" /> Add Another State / Locality
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Villages */}
            {wizardStep === 2 && (
              <div className="space-y-3">
                {coverageStates.length > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                    <MapPin className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                    <span>Coverage: <strong>{coverageAreas.filter(a => a.state).map(a => a.locality ? `${a.state} › ${a.locality}` : a.state).join(' · ')}</strong> — assign each village to one of these areas.</span>
                  </div>
                )}
                {wizardVillages.map((v, idx) => {
                  const vilageStateLocalities = v.state ? localitiesForState(v.state) : [];
                  // Offer only the states from coverage areas (if defined), otherwise all states
                  const stateOptions = coverageStates.length > 0 ? coverageStates : sudanStates.map(s => s.name);
                  // Pre-fill locality options from coverage areas when state matches
                  const localityOptions = v.state
                    ? (coverageAreas.filter(a => a.state === v.state && a.locality).map(a => a.locality).length > 0
                        ? coverageAreas.filter(a => a.state === v.state && a.locality).map(a => a.locality)
                        : vilageStateLocalities)
                    : [];
                  return (
                    <div key={idx} className="p-3 border rounded-lg bg-muted/20 space-y-2">
                      {/* Row 1: Name, Code, HH Target, Remove */}
                      <div className="grid gap-2 sm:grid-cols-5 items-end">
                        <div className="sm:col-span-2">
                          <Label className="text-xs">Village Name *</Label>
                          <Input value={v.village_name} onChange={e => setWizardVillages(vs => vs.map((r, i) => i === idx ? { ...r, village_name: e.target.value } : r))} placeholder="Village name" />
                        </div>
                        <div>
                          <Label className="text-xs">Code</Label>
                          <Input value={v.village_code} onChange={e => setWizardVillages(vs => vs.map((r, i) => i === idx ? { ...r, village_code: e.target.value } : r))} placeholder="VLG-01" />
                        </div>
                        <div>
                          <Label className="text-xs">HH Target</Label>
                          <Input type="number" min="0" value={v.hh_target} onChange={e => setWizardVillages(vs => vs.map((r, i) => i === idx ? { ...r, hh_target: e.target.value } : r))} placeholder="0" />
                        </div>
                        <div className="flex gap-1 items-end pb-0.5">
                          {wizardVillages.length > 1 && (
                            <Button type="button" variant="ghost" size="sm" className="h-9 w-9 p-0 text-red-500" onClick={() => setWizardVillages(vs => vs.filter((_, i) => i !== idx))}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                      {/* Row 2: State + Locality */}
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">State</Label>
                          <Select
                            value={v.state || '__none__'}
                            onValueChange={val => setWizardVillages(vs => vs.map((r, i) => i === idx ? { ...r, state: val === '__none__' ? '' : val, locality: '' } : r))}
                          >
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select state" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">Select state…</SelectItem>
                              {stateOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Locality</Label>
                          <Select
                            value={v.locality || '__none__'}
                            onValueChange={val => setWizardVillages(vs => vs.map((r, i) => i === idx ? { ...r, locality: val === '__none__' ? '' : val } : r))}
                            disabled={!v.state}
                          >
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select locality" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">Select locality…</SelectItem>
                              {localityOptions.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      {/* Row 3: Activity */}
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">Activity <span className="opacity-60">(optional)</span></Label>
                          <Input
                            value={v.activity_name}
                            onChange={e => setWizardVillages(vs => vs.map((r, i) => i === idx ? { ...r, activity_name: e.target.value } : r))}
                            placeholder="e.g. Nutrition, WASH"
                            className="h-8 text-xs"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Activity Type</Label>
                          <Select
                            value={v.activity_type || '__none__'}
                            onValueChange={val => setWizardVillages(vs => vs.map((r, i) => i === idx ? { ...r, activity_type: val === '__none__' ? '' : val } : r))}
                          >
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select type…" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">General / None</SelectItem>
                              <SelectItem value="nutrition">Nutrition</SelectItem>
                              <SelectItem value="wash">WASH</SelectItem>
                              <SelectItem value="protection">Protection</SelectItem>
                              <SelectItem value="health">Health</SelectItem>
                              <SelectItem value="education">Education</SelectItem>
                              <SelectItem value="livelihoods">Livelihoods</SelectItem>
                              <SelectItem value="shelter">Shelter</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <Button type="button" variant="outline" size="sm" onClick={() => setWizardVillages(vs => [...vs, { village_name:'', village_code: autoVillageCode(vs.length), hh_target:'', state: coverageStates[0] || '', locality:'', cluster_id:'', activity_name:'', activity_type:'' }])}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Village
                </Button>
              </div>
            )}

            {/* Step 3: Team Assignments */}
            {wizardStep === 3 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Assign teams to villages. Teams can work multiple villages. You can also add teams later from the campaign detail.</p>
                {allTeams.length === 0 ? (
                  <div className="text-sm text-muted-foreground border rounded p-4 text-center">
                    No teams in registry yet. <Button variant="link" className="p-0 h-auto text-sm" onClick={() => { setShowCreateCampaign(false); setShowTeamRegistry(true); }}>Create a team first →</Button>
                  </div>
                ) : (
                  <>
                    {wizardTeams.map((ta, idx) => (
                      <div key={idx} className="grid gap-2 sm:grid-cols-3 items-end p-3 border rounded-lg bg-muted/20">
                        <div>
                          <Label className="text-xs">Team</Label>
                          <Select value={ta.team_id} onValueChange={v => setWizardTeams(ts => ts.map((r, i) => i === idx ? { ...r, team_id: v } : r))}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select team" /></SelectTrigger>
                            <SelectContent>{allTeams.map(t => <SelectItem key={t.id} value={t.id}>{t.team_code} — {t.team_name}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Villages (blank = all)</Label>
                          <Select value={ta.village_ids[0] || '__none__'} onValueChange={v => setWizardTeams(ts => ts.map((r, i) => i === idx ? { ...r, village_ids: v && v !== '__none__' ? [v] : [] } : r))}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All villages" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">All villages</SelectItem>
                              {wizardVillages.filter(v => v.village_name).map((v, vi) => <SelectItem key={vi} value={v.village_code}>{v.village_name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex gap-2 items-end">
                          <div className="flex-1">
                            <Label className="text-xs">Team HH Target</Label>
                            <Input type="number" min="0" className="h-8 text-xs" value={ta.hh_target_for_team} onChange={e => setWizardTeams(ts => ts.map((r, i) => i === idx ? { ...r, hh_target_for_team: e.target.value } : r))} placeholder="Optional" />
                          </div>
                          <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500 shrink-0" onClick={() => setWizardTeams(ts => ts.filter((_, i) => i !== idx))}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" onClick={() => setWizardTeams(ts => [...ts, { team_id:'', village_ids:[], hh_target_for_team:'' }])}>
                      <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Team Assignment
                    </Button>
                  </>
                )}
              </div>
            )}

            <DialogFooter className="flex items-center justify-between pt-2">
              <Button variant="ghost" onClick={() => wizardStep > 1 ? setWizardStep(s => s - 1) : setShowCreateCampaign(false)}>
                {wizardStep === 1 ? 'Cancel' : '← Back'}
              </Button>
              {wizardStep < 3 ? (
                <Button onClick={() => setWizardStep(s => s + 1)} disabled={wizardStep === 1 && !campaignForm.campaign_name.trim()}>
                  Next →
                </Button>
              ) : (
                <Button onClick={submitCampaign} disabled={saving}>
                  {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                  Create Campaign
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Team Registry Dialog ──────────────────────────────────────────── */}
        <TeamRegistryDialog
          open={showTeamRegistry}
          onOpenChange={setShowTeamRegistry}
          teams={allTeams}
          profiles={profiles}
          onRefresh={loadTeams}
          canManage={canManage}
          canDelete={canDelete}
          showCreateTeam={showCreateTeam}
          setShowCreateTeam={setShowCreateTeam}
          teamForm={teamForm}
          setTeamForm={setTeamForm}
          onSubmitTeam={submitCreateTeam}
          saving={saving}
          autoCode={() => autoTeamCode(allTeams)}
          onDeleteTeam={deleteTeam}
        />
      </div>
    );
  }

  // ── Campaign Detail View ──────────────────────────────────────────────────

  const totalTarget  = campaignTotals.totalTarget;
  const totalCovered = campaignTotals.totalCovered;

  return (
    <div className="space-y-4">
      {/* Back + header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setSelectedCampaign(null)} className="gap-1.5 h-8">
            <ChevronLeft className="h-3.5 w-3.5" /> Campaigns
          </Button>
          <div>
            <h2 className="text-lg font-bold leading-tight">{selectedCampaign.campaign_name}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge className={`text-[10px] ${statusColor(selectedCampaign.status)} border-0`}>{selectedCampaign.status}</Badge>
              {selectedCampaign.state && <span className="text-xs text-muted-foreground">{selectedCampaign.state}{selectedCampaign.locality ? ` › ${selectedCampaign.locality}` : ''}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={exportCompletion}>
            <Download className="h-3.5 w-3.5" /> Export Report
          </Button>
          {canManage && (
            <>
              <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setShowAddVillage(true)}>
                <MapPin className="h-3.5 w-3.5" /> Add Village
              </Button>
              <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setShowAssignTeam(true)}>
                <Users className="h-3.5 w-3.5" /> Assign Team
              </Button>
              <Button size="sm" className="h-8 gap-1.5" onClick={() => setShowDailyLog(true)}>
                <Plus className="h-3.5 w-3.5" /> Daily Log
              </Button>
            </>
          )}
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => loadCampaignDetail(selectedCampaign.id)}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          {canDelete && (
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500 hover:text-red-600" onClick={() => deleteCampaign(selectedCampaign.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total HH Target', value: totalTarget.toLocaleString(), icon: Target, color: 'text-blue-600' },
          { label: 'HH Covered', value: totalCovered.toLocaleString(), icon: CheckCircle2, color: 'text-emerald-600' },
          { label: 'Villages', value: villages.length, icon: MapPin, color: 'text-amber-600' },
          { label: 'Teams Active', value: new Set(assignments.filter(a => a.status === 'active').map(a => a.team_id)).size, icon: Users, color: 'text-purple-600' },
        ].map(s => (
          <Card key={s.label} className="border-0 shadow-sm">
            <CardContent className="p-3 flex items-center gap-3">
              <s.icon className={`h-8 w-8 ${s.color} opacity-70 shrink-0`} />
              <div>
                <p className="text-xl font-bold tabular-nums">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Progress bar */}
      {totalTarget > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Overall Coverage</span>
            <span className="font-semibold text-foreground">{pct(totalCovered, totalTarget)}%</span>
          </div>
          <Progress value={pct(totalCovered, totalTarget)} className="h-2.5" />
        </div>
      )}

      {/* ── Detail Tabs ──────────────────────────────────────────────────────── */}
      <Tabs value={campaignTab} onValueChange={setCampaignTab}>
        <TabsList className="h-9 flex-wrap">
          <TabsTrigger value="overview" className="text-xs gap-1.5"><BarChart3 className="h-3.5 w-3.5" />Overview</TabsTrigger>
          <TabsTrigger value="clusters" className="text-xs gap-1.5"><Building2 className="h-3.5 w-3.5" />Clusters{clusters.length > 0 && <span className="ml-1 tabular-nums opacity-70">({clusters.length})</span>}</TabsTrigger>
          <TabsTrigger value="villages" className="text-xs gap-1.5"><MapPin className="h-3.5 w-3.5" />Villages</TabsTrigger>
          <TabsTrigger value="teams" className="text-xs gap-1.5"><Users className="h-3.5 w-3.5" />Teams</TabsTrigger>
          <TabsTrigger value="logs" className="text-xs gap-1.5"><Activity className="h-3.5 w-3.5" />Daily Logs</TabsTrigger>
          <TabsTrigger value="costs" className="text-xs gap-1.5"><Truck className="h-3.5 w-3.5" />Costs &amp; Dispatch</TabsTrigger>
          <TabsTrigger value="report" className="text-xs gap-1.5"><FileText className="h-3.5 w-3.5" />Completion</TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="mt-4 space-y-6">
          {villages.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">No villages added yet. <Button variant="link" className="p-0 h-auto" onClick={() => setShowAddVillage(true)}>Add one →</Button></div>
          ) : clusters.length > 0 ? (
            // ── Grouped by cluster ──
            <>
              {/* Unassigned villages first */}
              {(() => {
                const unassigned = villages.filter(v => !v.cluster_id);
                const clusterGroups = clusters.map(cl => ({
                  cluster: cl,
                  vils: villages.filter(v => v.cluster_id === cl.id),
                })).filter(g => g.vils.length > 0);

                return (
                  <>
                    {clusterGroups.map(({ cluster, vils }) => {
                      const clusterTarget  = vils.reduce((s, v) => s + (v.hh_target || 0), 0);
                      const clusterCovered = vils.reduce((s, v) => s + (v.hh_covered || 0), 0);
                      return (
                        <div key={cluster.id}>
                          <div className="flex items-center gap-2 mb-3">
                            <Building2 className="h-4 w-4 text-primary/70" />
                            <h3 className="font-semibold text-sm">{cluster.cluster_name}</h3>
                            <span className="text-xs text-muted-foreground font-mono">{cluster.cluster_code}</span>
                            {cluster.state && <span className="text-xs text-muted-foreground">· {cluster.state}{cluster.locality ? ` › ${cluster.locality}` : ''}</span>}
                            <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{clusterCovered.toLocaleString()} / {clusterTarget.toLocaleString()} HH</span>
                              <span className="font-semibold text-foreground">{pct(clusterCovered, clusterTarget)}%</span>
                            </div>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {vils.map(v => {
                              const vilPct = pct(v.hh_covered || 0, v.hh_target);
                              const vilAssigns = assignments.filter(a => a.village_id === v.id);
                              return (
                                <Card key={v.id} className="border shadow-sm">
                                  <CardContent className="p-4 space-y-3">
                                    <div className="flex items-start justify-between">
                                      <div>
                                        <p className="font-semibold text-sm">{v.village_name}</p>
                                        <p className="text-xs text-muted-foreground">{v.village_code}</p>
                                      </div>
                                      <Badge className={`text-[10px] ${statusColor(v.status)} border-0`}>{v.status.replace('_',' ')}</Badge>
                                    </div>
                                    <div className="space-y-1">
                                      <div className="flex justify-between text-xs">
                                        <span className="text-muted-foreground">{(v.hh_covered||0).toLocaleString()} / {v.hh_target.toLocaleString()} HH</span>
                                        <span className="font-semibold">{vilPct}%</span>
                                      </div>
                                      <Progress value={vilPct} className="h-2" />
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1 border-t">
                                      <span className="flex items-center gap-1"><Users className="h-3 w-3" />{vilAssigns.length} team{vilAssigns.length !== 1 ? 's' : ''}</span>
                                      {v.state && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{v.state}</span>}
                                    </div>
                                  </CardContent>
                                </Card>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                    {unassigned.length > 0 && (
                      <div>
                        <h3 className="font-semibold text-sm text-muted-foreground mb-3 flex items-center gap-2">
                          <MapPin className="h-4 w-4" /> Unassigned to cluster
                        </h3>
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          {unassigned.map(v => {
                            const vilPct = pct(v.hh_covered || 0, v.hh_target);
                            const vilAssigns = assignments.filter(a => a.village_id === v.id);
                            return (
                              <Card key={v.id} className="border shadow-sm">
                                <CardContent className="p-4 space-y-3">
                                  <div className="flex items-start justify-between">
                                    <div>
                                      <p className="font-semibold text-sm">{v.village_name}</p>
                                      <p className="text-xs text-muted-foreground">{v.village_code}</p>
                                    </div>
                                    <Badge className={`text-[10px] ${statusColor(v.status)} border-0`}>{v.status.replace('_',' ')}</Badge>
                                  </div>
                                  <div className="space-y-1">
                                    <div className="flex justify-between text-xs">
                                      <span className="text-muted-foreground">{(v.hh_covered||0).toLocaleString()} / {v.hh_target.toLocaleString()} HH</span>
                                      <span className="font-semibold">{vilPct}%</span>
                                    </div>
                                    <Progress value={vilPct} className="h-2" />
                                  </div>
                                  <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1 border-t">
                                    <span className="flex items-center gap-1"><Users className="h-3 w-3" />{vilAssigns.length} team{vilAssigns.length !== 1 ? 's' : ''}</span>
                                    {v.state && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{v.state}</span>}
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </>
          ) : (
            // ── Flat (no clusters) ──
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {villages.map(v => {
                const vilPct = pct(v.hh_covered || 0, v.hh_target);
                const vilAssigns = assignments.filter(a => a.village_id === v.id);
                return (
                  <Card key={v.id} className="border shadow-sm">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-sm">{v.village_name}</p>
                          <p className="text-xs text-muted-foreground">{v.village_code}</p>
                        </div>
                        <Badge className={`text-[10px] ${statusColor(v.status)} border-0`}>{v.status.replace('_',' ')}</Badge>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{(v.hh_covered||0).toLocaleString()} / {v.hh_target.toLocaleString()} HH</span>
                          <span className="font-semibold">{vilPct}%</span>
                        </div>
                        <Progress value={vilPct} className="h-2" />
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1 border-t">
                        <span className="flex items-center gap-1"><Users className="h-3 w-3" />{vilAssigns.length} team{vilAssigns.length !== 1 ? 's' : ''}</span>
                        {v.state && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{v.state}</span>}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* CLUSTERS TAB */}
        <TabsContent value="clusters" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" />Clusters</p>
              <p className="text-xs text-muted-foreground mt-0.5">Geographic clusters group villages within this campaign (State → Locality → Cluster → Village)</p>
            </div>
            {canManage && (
              <Button size="sm" className="h-8 gap-1.5" onClick={() => {
                setClusterForm({ cluster_name:'', cluster_code: autoClusterCode(clusters), state:'', locality:'' });
                setShowAddCluster(true);
              }}>
                <Plus className="h-3.5 w-3.5" /> Add Cluster
              </Button>
            )}
          </div>

          {clusters.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <Building2 className="h-10 w-10 opacity-25" />
              <p className="font-medium text-sm">No clusters yet</p>
              <p className="text-xs text-center max-w-xs">Clusters organise villages geographically. Create one, then assign villages to it when adding or editing villages.</p>
              {canManage && (
                <Button size="sm" onClick={() => { setClusterForm({ cluster_name:'', cluster_code: autoClusterCode(clusters), state:'', locality:'' }); setShowAddCluster(true); }}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> Add First Cluster
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead>Code</TableHead>
                    <TableHead>Cluster Name</TableHead>
                    <TableHead>State / Locality</TableHead>
                    <TableHead className="text-right">Villages</TableHead>
                    <TableHead className="text-right">HH Target</TableHead>
                    <TableHead className="text-right">HH Covered</TableHead>
                    <TableHead className="text-right">Progress</TableHead>
                    {canDelete && <TableHead />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clusters.map(cl => {
                    const clVils = villages.filter(v => v.cluster_id === cl.id);
                    const clTarget  = clVils.reduce((s, v) => s + (v.hh_target || 0), 0);
                    const clCovered = clVils.reduce((s, v) => s + (v.hh_covered || 0), 0);
                    return (
                      <TableRow key={cl.id}>
                        <TableCell className="font-mono text-xs font-semibold">{cl.cluster_code}</TableCell>
                        <TableCell className="font-medium">{cl.cluster_name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{[cl.state, cl.locality].filter(Boolean).join(' › ') || '—'}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs">{clVils.length}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs">{clTarget.toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs text-emerald-600 font-semibold">{clCovered.toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center gap-2 justify-end">
                            <Progress value={pct(clCovered, clTarget)} className="h-1.5 w-16" />
                            <span className="text-xs tabular-nums w-8">{pct(clCovered, clTarget)}%</span>
                          </div>
                        </TableCell>
                        {canDelete && (
                          <TableCell>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-600"
                              onClick={() => deleteCluster(cl.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* VILLAGES */}
        <TabsContent value="villages" className="mt-4">
          {canManage && (
            <div className="flex justify-end mb-3">
              <Button
                variant="outline" size="sm" className="h-8 gap-1.5"
                onClick={() => { setImportRows([]); setImportFileName(''); setShowImportDialog(true); }}
              >
                <Upload className="h-3.5 w-3.5" /> Import from Excel
              </Button>
            </div>
          )}
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Code</TableHead>
                  <TableHead>Village Name</TableHead>
                  {clusters.length > 0 && <TableHead>Cluster</TableHead>}
                  <TableHead>State / Locality</TableHead>
                  <TableHead className="text-right">HH Target</TableHead>
                  <TableHead className="text-right">HH Covered</TableHead>
                  <TableHead className="text-right">Progress</TableHead>
                  <TableHead>Teams</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {villages.length === 0 ? (
                  <TableRow><TableCell colSpan={clusters.length > 0 ? 9 : 8} className="text-center py-8 text-muted-foreground">No villages yet</TableCell></TableRow>
                ) : villages.map(v => (
                  <TableRow key={v.id}>
                    <TableCell className="font-mono text-xs">{v.village_code}</TableCell>
                    <TableCell className="font-medium">{v.village_name}</TableCell>
                    {clusters.length > 0 && (
                      <TableCell className="text-xs text-muted-foreground">{v.cluster_name || <span className="italic opacity-50">—</span>}</TableCell>
                    )}
                    <TableCell className="text-xs text-muted-foreground">{[v.state, v.locality].filter(Boolean).join(' › ') || '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{v.hh_target.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-600 font-semibold">{(v.hh_covered||0).toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <Progress value={pct(v.hh_covered||0, v.hh_target)} className="h-1.5 w-16" />
                        <span className="text-xs tabular-nums w-8">{pct(v.hh_covered||0, v.hh_target)}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{v.team_count ?? 0}</TableCell>
                    <TableCell><Badge className={`text-[10px] border-0 ${statusColor(v.status)}`}>{v.status.replace('_',' ')}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* TEAMS */}
        <TabsContent value="teams" className="mt-4 space-y-4">
          {/* Per-village breakdown */}
          {villages.map(v => {
            const vilAssigns = assignments.filter(a => a.village_id === v.id);
            return (
              <div key={v.id}>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  {v.village_name} <span className="text-muted-foreground font-normal">({v.village_code})</span>
                  {v.cluster_name && <Badge variant="outline" className="text-[10px] font-normal">{v.cluster_name}</Badge>}
                  <span className="ml-auto text-xs text-muted-foreground font-normal">{(v.hh_covered||0).toLocaleString()} / {v.hh_target.toLocaleString()} HH covered</span>
                </h3>
                <div className="rounded-md border overflow-x-auto mb-4">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead>Team Code</TableHead>
                        <TableHead>Team Name</TableHead>
                        <TableHead>Activity</TableHead>
                        <TableHead>Team Lead</TableHead>
                        <TableHead className="text-right">Members</TableHead>
                        <TableHead className="text-right">Team HH Target</TableHead>
                        <TableHead className="text-right">HH Covered</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vilAssigns.length === 0 ? (
                        <TableRow><TableCell colSpan={8} className="text-center py-4 text-muted-foreground text-xs">No teams assigned to this village yet</TableCell></TableRow>
                      ) : vilAssigns.map(a => (
                        <TableRow key={a.id}>
                          <TableCell className="font-mono text-xs font-semibold">{a.team_code}</TableCell>
                          <TableCell>{a.team_name}</TableCell>
                          <TableCell className="text-xs">
                            {a.activity_name
                              ? <Badge variant="outline" className="text-[10px]">{a.activity_name}</Badge>
                              : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{a.team_lead_name}</TableCell>
                          <TableCell className="text-right tabular-nums">{a.member_count}</TableCell>
                          <TableCell className="text-right tabular-nums">{a.hh_target_for_team?.toLocaleString() || '—'}</TableCell>
                          <TableCell className="text-right tabular-nums text-emerald-600 font-semibold">{(a.hh_covered||0).toLocaleString()}</TableCell>
                          <TableCell><Badge className={`text-[10px] border-0 ${statusColor(a.status)}`}>{a.status}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            );
          })}
        </TabsContent>

        {/* COSTS & DISPATCH */}
        <TabsContent value="costs" className="mt-4 space-y-4">

          {/* ── Summary cards (whole campaign) ─────────────────────────────── */}
          {siteEntries.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card>
                <CardContent className="p-3 text-center">
                  <p className="text-[11px] text-muted-foreground mb-0.5 flex items-center justify-center gap-1"><Truck className="h-3 w-3" />Transport Budget</p>
                  <p className="text-base font-bold text-primary tabular-nums">SDG {siteEntries.reduce((s, e) => s + (e.transport_fee || 0), 0).toLocaleString()}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <p className="text-[11px] text-muted-foreground mb-0.5 flex items-center justify-center gap-1"><BadgeDollarSign className="h-3 w-3" />Enumerator Fees</p>
                  <p className="text-base font-bold text-purple-700 tabular-nums">SDG {siteEntries.reduce((s, e) => s + (e.enumerator_fee || 0), 0).toLocaleString()}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <p className="text-[11px] text-muted-foreground mb-0.5 flex items-center justify-center gap-1"><DollarSign className="h-3 w-3" />Combined Total</p>
                  <p className="text-base font-bold text-emerald-700 tabular-nums">SDG {siteEntries.reduce((s, e) => s + (e.transport_fee || 0) + (e.enumerator_fee || 0), 0).toLocaleString()}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <p className="text-[11px] text-muted-foreground mb-0.5 flex items-center justify-center gap-1"><CreditCard className="h-3 w-3" />Total Paid</p>
                  <p className="text-base font-bold text-emerald-600 tabular-nums">
                    SDG {siteEntries.filter(e => e.fee_paid_status === 'paid').reduce((s, e) => s + (e.fee_paid_amount || 0), 0).toLocaleString()}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{siteEntries.filter(e => e.fee_paid_status === 'paid').length} / {siteEntries.length} entries</p>
                </CardContent>
              </Card>
            </div>
          )}

          {siteEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <DollarSign className="h-10 w-10 opacity-25" />
              <p className="font-medium text-sm">No fee records yet</p>
              <p className="text-xs text-center max-w-xs">Assign a team to a village — a fee record is created automatically for each assignment.</p>
            </div>
          ) : (
            <>
              {/* ── Sub-filter pills + Export ─────────────────────────────── */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {(
                  [
                    { key: 'pending'   as const, label: 'Pending',           count: pendingEntries.length,    activeClass: 'bg-amber-100 text-amber-800 border-amber-300' },
                    { key: 'approved'  as const, label: 'Approved & Costed', count: approvedEntries.length,   activeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
                    { key: 'dispatched'as const, label: 'Dispatched',         count: dispatchedEntries.length, activeClass: 'bg-blue-100 text-blue-800 border-blue-300' },
                  ] satisfies { key: 'pending'|'approved'|'dispatched'; label: string; count: number; activeClass: string }[]
                ).map(pill => (
                  <button
                    key={pill.key}
                    type="button"
                    onClick={() => setCostsSubTab(pill.key)}
                    className={`h-7 px-3 rounded-full text-xs font-medium border transition-colors ${
                      costsSubTab === pill.key
                        ? pill.activeClass
                        : 'bg-background text-muted-foreground border-border hover:border-foreground/40'
                    }`}
                  >
                    {pill.label}
                    <span className="ml-1.5 tabular-nums opacity-75">({pill.count})</span>
                  </button>
                ))}
                <div className="ml-auto">
                  <Button type="button" size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={exportFeesExcel}>
                    <Download className="h-3.5 w-3.5" />Export Excel
                  </Button>
                </div>
              </div>

              {/* ── Context-aware toolbar ─────────────────────────────────── */}
              {canManage && (
                <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/30 rounded-lg px-3 py-2 border min-h-[40px]">
                  {costsSubTab === 'pending' && (
                    <>
                      <span className="text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">{pendingEntries.length}</span> entr{pendingEntries.length !== 1 ? 'ies' : 'y'} pending approval
                      </span>
                      {canApproveAdvance && (
                        <Button
                          type="button" size="sm"
                          className="h-7 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                          disabled={approvingAll || pendingEntries.length === 0}
                          onClick={approveAll}
                        >
                          {approvingAll ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                          Approve All
                        </Button>
                      )}
                    </>
                  )}
                  {costsSubTab === 'approved' && (
                    <>
                      <span className="text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">{approvedEntries.length}</span> entr{approvedEntries.length !== 1 ? 'ies' : 'y'} ready to dispatch
                      </span>
                      <Button
                        type="button" size="sm"
                        className="h-7 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs"
                        disabled={dispatchingAll || approvedEntries.length === 0}
                        onClick={dispatchAll}
                      >
                        {dispatchingAll ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                        Dispatch All
                      </Button>
                    </>
                  )}
                  {costsSubTab === 'dispatched' && (
                    <>
                      <span className="text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">{dispatchedEntries.filter(e => e.fee_paid_status !== 'paid').length}</span> unpaid
                        {' · '}
                        <span className="font-semibold text-foreground">{dispatchedEntries.filter(e => e.fee_paid_status === 'paid').length}</span> paid
                      </span>
                      <Button
                        type="button" size="sm"
                        className="h-7 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                        disabled={payingAll || dispatchedEntries.every(e => e.fee_paid_status === 'paid')}
                        onClick={() => markAllPaid(dispatchedEntries)}
                      >
                        {payingAll ? <Loader2 className="h-3 w-3 animate-spin" /> : <CreditCard className="h-3 w-3" />}
                        Mark All Paid
                      </Button>
                    </>
                  )}
                </div>
              )}

              {/* ── Filtered table ────────────────────────────────────────── */}
              {filteredCostEntries.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
                  <CheckCircle2 className="h-8 w-8 opacity-20" />
                  <p className="text-sm">
                    {costsSubTab === 'pending'    && 'No entries pending approval'}
                    {costsSubTab === 'approved'   && 'No entries awaiting dispatch'}
                    {costsSubTab === 'dispatched' && 'No dispatched entries yet'}
                  </p>
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead>Village / Site</TableHead>
                        {clusters.length > 0 && <TableHead>Cluster</TableHead>}
                        <TableHead>Activity</TableHead>
                        <TableHead>Team</TableHead>
                        <TableHead className="text-right">Transport (SDG)</TableHead>
                        <TableHead className="text-right">Enum Fee (SDG)</TableHead>
                        {costsSubTab === 'dispatched' && (
                          <>
                            <TableHead>Payment Status</TableHead>
                            <TableHead className="text-right">Paid (SDG)</TableHead>
                          </>
                        )}
                        {costsSubTab !== 'dispatched' && (
                          <TableHead>Approval</TableHead>
                        )}
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCostEntries.map(e => {
                        const edit = feeEdits[e.id] || { transport_fee: String(e.transport_fee ?? 0), enumerator_fee: String(e.enumerator_fee ?? 0) };
                        const isSavingFee   = feesSaving[e.id];
                        const isDispatching = dispatching[e.id];
                        const isApproving   = approving[e.id];
                        const payStatus     = e.fee_paid_status;
                        const villageName   = e.additional_data?.village_name || e.site_name;
                        return (
                          <TableRow key={e.id}>
                            <TableCell className="text-xs font-medium">{villageName}</TableCell>
                            {clusters.length > 0 && (
                              <TableCell className="text-xs text-muted-foreground">
                                {e.additional_data?.cluster_name || <span className="italic opacity-40">—</span>}
                              </TableCell>
                            )}
                            <TableCell className="text-xs">
                              {e.additional_data?.activity_name
                                ? <Badge variant="outline" className="text-[10px]">{e.additional_data.activity_name}</Badge>
                                : <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{e.additional_data?.team_name || '—'}</TableCell>

                            {/* Transport fee — editable only on Pending sub-tab */}
                            <TableCell className="text-right">
                              {costsSubTab === 'pending' ? (
                                <Input
                                  type="number" min="0"
                                  value={edit.transport_fee}
                                  onChange={ev => setFeeEdits(f => ({ ...f, [e.id]: { ...edit, transport_fee: ev.target.value } }))}
                                  className="h-7 w-24 text-xs text-right tabular-nums ml-auto"
                                />
                              ) : (
                                <span className="tabular-nums text-xs">{(e.transport_fee || 0).toLocaleString()}</span>
                              )}
                            </TableCell>

                            {/* Enumerator fee — editable only on Pending sub-tab */}
                            <TableCell className="text-right">
                              {costsSubTab === 'pending' ? (
                                <Input
                                  type="number" min="0"
                                  value={edit.enumerator_fee}
                                  onChange={ev => setFeeEdits(f => ({ ...f, [e.id]: { ...edit, enumerator_fee: ev.target.value } }))}
                                  className="h-7 w-24 text-xs text-right tabular-nums ml-auto"
                                />
                              ) : (
                                <span className="tabular-nums text-xs">{(e.enumerator_fee || 0).toLocaleString()}</span>
                              )}
                            </TableCell>

                            {/* Payment status — Dispatched sub-tab only */}
                            {costsSubTab === 'dispatched' && (
                              <>
                                <TableCell>
                                  <div className="flex flex-col gap-0.5">
                                    <Badge className={`text-[10px] border-0 self-start ${payStatus === 'paid' ? 'bg-emerald-100 text-emerald-700' : payStatus === 'partial' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                                      {payStatus || 'unpaid'}
                                    </Badge>
                                    {payStatus === 'paid' && (
                                      <div className="flex flex-col gap-0 leading-tight">
                                        <span className="text-[9px] text-muted-foreground">{profileName(e.fee_paid_by ?? undefined)}</span>
                                        <span className="text-[9px] text-muted-foreground tabular-nums">
                                          {fmtDate(e.fee_paid_at ?? undefined)}
                                          {fmtPayMethod(e.fee_payment_method) && <> · {fmtPayMethod(e.fee_payment_method)}</>}
                                        </span>
                                        {e.fee_payment_notes && (
                                          <span className="text-[9px] text-muted-foreground italic truncate max-w-[160px]" title={e.fee_payment_notes}>
                                            {e.fee_payment_notes}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right tabular-nums text-xs">
                                  {e.fee_paid_amount ? `SDG ${Number(e.fee_paid_amount).toLocaleString()}` : '—'}
                                </TableCell>
                              </>
                            )}

                            {/* Approval badge — Pending & Approved sub-tabs */}
                            {costsSubTab !== 'dispatched' && (
                              <TableCell>
                                {e.status === 'Approved and Costed' ? (
                                  <Badge className="text-[10px] border-0 bg-emerald-100 text-emerald-700">Approved</Badge>
                                ) : (
                                  <Badge className="text-[10px] border-0 bg-amber-100 text-amber-700">Pending</Badge>
                                )}
                              </TableCell>
                            )}

                            {/* Actions column */}
                            <TableCell>
                              <div className="flex items-center gap-1">
                                {/* Pending: Save + Approve */}
                                {costsSubTab === 'pending' && (
                                  <>
                                    <Button type="button" size="sm" variant="outline" className="h-6 text-[10px] px-2"
                                      disabled={isSavingFee} onClick={() => saveFee(e.id)}>
                                      {isSavingFee ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
                                    </Button>
                                    {canApproveAdvance && (
                                      <Button type="button" size="sm"
                                        className="h-6 text-[10px] px-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                                        disabled={isApproving}
                                        onClick={() => approveEntry(e)}>
                                        {isApproving ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                                      </Button>
                                    )}
                                  </>
                                )}

                                {/* Approved & Costed: Dispatch */}
                                {costsSubTab === 'approved' && canManage && (
                                  <Button type="button" size="sm"
                                    className="h-6 text-[10px] px-2 bg-blue-600 hover:bg-blue-700 text-white"
                                    disabled={isDispatching}
                                    onClick={() => dispatchEntry(e)}>
                                    {isDispatching ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Send className="h-3 w-3" /><span className="ml-1">Dispatch</span></>}
                                  </Button>
                                )}

                                {/* Dispatched: Mark Paid / Revert */}
                                {costsSubTab === 'dispatched' && canManage && payStatus !== 'paid' && (
                                  <Button type="button" size="sm"
                                    className="h-6 text-[10px] px-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                                    onClick={() => {
                                      const total = (e.transport_fee || 0) + (e.enumerator_fee || 0);
                                      setPayForm({ amount: String(total), notes: '', method: 'cash' });
                                      setPayDialog({ open: true, entry: e });
                                    }}>
                                    <CreditCard className="h-3 w-3" />
                                  </Button>
                                )}
                                {costsSubTab === 'dispatched' && canManage && payStatus === 'paid' && (
                                  <Button type="button" size="sm" variant="ghost"
                                    className="h-6 text-[10px] px-2 text-muted-foreground hover:text-destructive"
                                    title="Revert to unpaid"
                                    onClick={() => revertPaid(e.id)}>
                                    <X className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}

          {/* ── Advances section ─────────────────────────────────────────────── */}
          <div className="border-t pt-4 space-y-3 mt-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold flex items-center gap-2"><Wallet className="h-4 w-4 text-muted-foreground" />Advance Requests</p>
                {!selectedCampaign?.project_id && (
                  <p className="text-xs text-amber-600 mt-0.5">Link a project to this campaign to create advance requests</p>
                )}
                {(canApproveAdvance || canTier2Approve) && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Approval chain: <span className="font-medium">Tier 1 Review</span> (FOM/Supervisor) →{' '}
                    <span className="font-medium">Tier 2 Approval</span> (Admin) → Paid
                  </p>
                )}
              </div>
              {selectedCampaign?.project_id && canManage && (
                <Button type="button" size="sm" className="h-8 gap-1.5"
                  onClick={() => { setAdvanceForm({ requested_amount:'', description:'', expense_category:'transport', site_name:'' }); setShowNewAdvance(true); }}>
                  <Plus className="h-3.5 w-3.5" /> New Advance Request
                </Button>
              )}
            </div>

            {advances.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
                <Wallet className="h-8 w-8 opacity-20" />
                <p className="text-sm">{selectedCampaign?.project_id ? 'No advance requests yet' : 'No linked project'}</p>
                <p className="text-xs text-center max-w-xs">
                  {selectedCampaign?.project_id
                    ? 'Create the first advance request using the button above.'
                    : 'Edit this campaign and link it to a project to enable advance requests.'}
                </p>
              </div>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>Description</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Site / Village</TableHead>
                      <TableHead className="text-right">Requested (SDG)</TableHead>
                      <TableHead className="text-right">Paid (SDG)</TableHead>
                      <TableHead>Approval Status</TableHead>
                      <TableHead>Date</TableHead>
                      {(canApproveAdvance || canTier2Approve) && <TableHead className="w-48" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {advances.map(adv => {
                      // Resolve effective tier statuses — fall back to legacy single-tier status
                      const t1 = adv.tier1_status || (adv.status === 'pending' ? 'pending' : 'approved');
                      const t2 = adv.tier2_status || (adv.status === 'approved' || adv.status === 'paid' ? 'approved' : 'pending');
                      const isRejected = adv.status === 'rejected';
                      const isPaid     = adv.status === 'paid';
                      const isTier1Pending  = !isRejected && !isPaid && t1 === 'pending';
                      const isTier2Pending  = !isRejected && !isPaid && t1 === 'approved' && t2 === 'pending';
                      const isFullyApproved = !isRejected && !isPaid && t1 === 'approved' && t2 === 'approved';

                      return (
                        <TableRow key={adv.id}>
                          <TableCell className="text-xs">{adv.description || '—'}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px]">{adv.expense_category || '—'}</Badge></TableCell>
                          <TableCell className="text-xs text-muted-foreground">{adv.site_name || '—'}</TableCell>
                          <TableCell className="text-right tabular-nums font-semibold">{Number(adv.requested_amount).toLocaleString()}</TableCell>
                          <TableCell className="text-right tabular-nums text-emerald-600">{adv.total_paid_amount ? Number(adv.total_paid_amount).toLocaleString() : '—'}</TableCell>

                          {/* ── Two-tier status badge ───────────────────────── */}
                          <TableCell>
                            <div className="flex flex-col gap-1 min-w-[130px]">
                              {/* Overall pill */}
                              {isPaid ? (
                                <Badge className="text-[10px] border-0 self-start bg-blue-100 text-blue-700">Paid</Badge>
                              ) : isRejected ? (
                                <Badge className="text-[10px] border-0 self-start bg-red-100 text-red-700">Rejected</Badge>
                              ) : isFullyApproved ? (
                                <Badge className="text-[10px] border-0 self-start bg-emerald-100 text-emerald-700">Tier 2 Approved</Badge>
                              ) : isTier2Pending ? (
                                <Badge className="text-[10px] border-0 self-start bg-purple-100 text-purple-700">Tier 1 Approved</Badge>
                              ) : (
                                <Badge className="text-[10px] border-0 self-start bg-amber-100 text-amber-700">Pending</Badge>
                              )}

                              {/* Tier-by-tier audit trail */}
                              {t1 === 'approved' && adv.tier1_approved_by && (
                                <span className="text-[9px] text-muted-foreground leading-tight">
                                  T1: {profileName(adv.tier1_approved_by)} · {fmtDate(adv.tier1_approved_at ?? undefined)}
                                </span>
                              )}
                              {t2 === 'approved' && adv.tier2_approved_by && (
                                <span className="text-[9px] text-muted-foreground leading-tight">
                                  T2: {profileName(adv.tier2_approved_by)} · {fmtDate(adv.tier2_approved_at ?? undefined)}
                                </span>
                              )}
                              {isPaid && adv.paid_by && (
                                <span className="text-[9px] text-muted-foreground leading-tight">
                                  Paid by {profileName(adv.paid_by)} · {fmtDate(adv.paid_at ?? undefined)}
                                </span>
                              )}
                              {isRejected && adv.rejection_reason && (
                                <span className="text-[9px] text-red-400 leading-tight max-w-[140px] truncate" title={adv.rejection_reason}>
                                  {adv.rejection_reason}
                                </span>
                              )}
                            </div>
                          </TableCell>

                          <TableCell className="text-xs whitespace-nowrap">{fmtDate(adv.created_at)}</TableCell>

                          {/* ── Action buttons ──────────────────────────────── */}
                          {(canApproveAdvance || canTier2Approve) && (
                            <TableCell>
                              <div className="flex items-center gap-1 flex-wrap">
                                {/* Tier 1 Approve — FOM/Supervisor (canApproveAdvance) */}
                                {isTier1Pending && canApproveAdvance && (
                                  <Button type="button" size="sm"
                                    className="h-6 text-[10px] px-2 bg-purple-600 hover:bg-purple-700 text-white"
                                    disabled={!!advanceApproving[adv.id]}
                                    onClick={() => approveAdvanceTier1(adv)}>
                                    {advanceApproving[adv.id] ? <Loader2 className="h-3 w-3 animate-spin" /> : 'T1 Approve'}
                                  </Button>
                                )}
                                {/* Tier 1 Reject — FOM/Supervisor/Admin */}
                                {isTier1Pending && canApproveAdvance && (
                                  <Button type="button" size="sm" variant="outline"
                                    className="h-6 text-[10px] px-2 text-red-600 border-red-200 hover:bg-red-50"
                                    disabled={!!advanceApproving[adv.id]}
                                    onClick={() => { setRejectDialog({ open: true, advance: adv, tier: 1 }); setRejectNote(''); }}>
                                    Reject
                                  </Button>
                                )}

                                {/* Tier 2 Approve — Admin/SuperAdmin only */}
                                {isTier2Pending && canTier2Approve && (
                                  <Button type="button" size="sm"
                                    className="h-6 text-[10px] px-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                                    disabled={!!advanceApproving[adv.id]}
                                    onClick={() => approveAdvanceTier2(adv)}>
                                    {advanceApproving[adv.id] ? <Loader2 className="h-3 w-3 animate-spin" /> : 'T2 Approve'}
                                  </Button>
                                )}
                                {/* Tier 2 Reject — Admin/SuperAdmin only */}
                                {isTier2Pending && canTier2Approve && (
                                  <Button type="button" size="sm" variant="outline"
                                    className="h-6 text-[10px] px-2 text-red-600 border-red-200 hover:bg-red-50"
                                    disabled={!!advanceApproving[adv.id]}
                                    onClick={() => { setRejectDialog({ open: true, advance: adv, tier: 2 }); setRejectNote(''); }}>
                                    Reject
                                  </Button>
                                )}

                                {/* Mark Paid — Admin/SuperAdmin, after both tiers approved */}
                                {isFullyApproved && canTier2Approve && (
                                  <Button type="button" size="sm"
                                    className="h-6 text-[10px] px-2 bg-blue-600 hover:bg-blue-700 text-white"
                                    disabled={!!advanceApproving[adv.id]}
                                    onClick={() => markAdvancePaid(adv)}>
                                    {advanceApproving[adv.id] ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Mark Paid'}
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* DAILY LOGS */}
        <TabsContent value="logs" className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={logFilterVillage} onValueChange={setLogFilterVillage}>
              <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="All villages" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All villages</SelectItem>
                {villages.map(v => <SelectItem key={v.id} value={v.id}>{v.village_name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={logFilterTeam} onValueChange={setLogFilterTeam}>
              <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="All teams" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All teams</SelectItem>
                {[...new Map(assignments.map(a => [a.team_id, a])).values()].map(a => (
                  <SelectItem key={a.team_id} value={a.team_id}>{a.team_code} — {a.team_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground ml-auto">{filteredLogs.length} record{filteredLogs.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-6" />
                  <TableHead>Date</TableHead>
                  <TableHead>Village</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead className="text-right">HH Covered</TableHead>
                  <TableHead className="text-right">Male</TableHead>
                  <TableHead className="text-right">Female</TableHead>
                  <TableHead className="text-right">Beneficiaries</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Submitted By</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-center">Photos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.length === 0 ? (
                  <TableRow><TableCell colSpan={12} className="text-center py-8 text-muted-foreground">No daily logs yet</TableCell></TableRow>
                ) : filteredLogs.map(l => {
                  const photos = photosByLogId[l.id] || [];
                  const isExpanded = expandedLogId === l.id;
                  return (
                    <>
                      <TableRow key={l.id} className={isExpanded ? 'border-b-0' : undefined}>
                        <TableCell className="pr-0">
                          {photos.length > 0 && (
                            <button
                              type="button"
                              className="text-muted-foreground hover:text-foreground transition-colors"
                              onClick={() => setExpandedLogId(isExpanded ? null : l.id)}
                            >
                              {isExpanded
                                ? <ChevronUp className="h-3.5 w-3.5" />
                                : <ChevronDown className="h-3.5 w-3.5" />}
                            </button>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs whitespace-nowrap">{l.report_date}</TableCell>
                        <TableCell className="text-xs">{l.village_name}</TableCell>
                        <TableCell className="text-xs"><span className="font-mono text-[10px] text-muted-foreground">{l.team_code}</span> {l.team_name}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold text-emerald-600">{l.hh_covered.toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs">{l.male_count.toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs">{l.female_count.toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs">{l.beneficiaries.toLocaleString()}</TableCell>
                        <TableCell className="text-xs max-w-[160px] truncate text-muted-foreground">{l.notes || '—'}</TableCell>
                        <TableCell className="text-xs">{l.submitted_by_name}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px]">{l.source}</Badge></TableCell>
                        <TableCell className="text-center">
                          {photos.length > 0 ? (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                              onClick={() => setExpandedLogId(isExpanded ? null : l.id)}
                            >
                              <ImageIcon className="h-3 w-3" />
                              {photos.length}
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>

                      {/* ── Expandable photo strip ── */}
                      {isExpanded && photos.length > 0 && (
                        <TableRow key={`${l.id}-photos`} className="bg-muted/20">
                          <TableCell colSpan={12} className="py-3 px-4">
                            <div className="flex flex-wrap gap-2">
                              {photos.map((p, idx) => (
                                <a
                                  key={idx}
                                  href={p.photo_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block w-20 h-20 rounded overflow-hidden border bg-muted hover:opacity-80 transition-opacity"
                                  title={p.caption || `Photo ${idx + 1}`}
                                >
                                  <img
                                    src={p.photo_url}
                                    alt={p.caption || `Field photo ${idx + 1}`}
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                  />
                                </a>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* COMPLETION REPORT */}
        <TabsContent value="report" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" />Completion Summary</h3>
            <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={exportCompletion}>
              <Download className="h-3.5 w-3.5" /> Export Excel
            </Button>
          </div>

          {/* By Village */}
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground mb-2 tracking-wide">By Village</p>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead>Code</TableHead>
                    <TableHead>Village</TableHead>
                    <TableHead className="text-right">HH Target</TableHead>
                    <TableHead className="text-right">HH Covered</TableHead>
                    <TableHead className="text-right">Progress</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {villages.map(v => (
                    <TableRow key={v.id}>
                      <TableCell className="font-mono text-xs">{v.village_code}</TableCell>
                      <TableCell className="font-medium text-sm">{v.village_name}</TableCell>
                      <TableCell className="text-right tabular-nums">{v.hh_target.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-600 font-bold">{(v.hh_covered||0).toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <Progress value={pct(v.hh_covered||0, v.hh_target)} className="h-1.5 w-16" />
                          <span className="text-xs tabular-nums">{pct(v.hh_covered||0, v.hh_target)}%</span>
                        </div>
                      </TableCell>
                      <TableCell><Badge className={`text-[10px] border-0 ${statusColor(v.status)}`}>{v.status.replace('_',' ')}</Badge></TableCell>
                    </TableRow>
                  ))}
                  {/* Totals row */}
                  {villages.length > 0 && (
                    <TableRow className="bg-muted/40 font-semibold">
                      <TableCell colSpan={2} className="text-right text-xs uppercase tracking-wide text-muted-foreground">TOTAL</TableCell>
                      <TableCell className="text-right tabular-nums">{totalTarget.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-700">{totalCovered.toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <Progress value={pct(totalCovered, totalTarget)} className="h-1.5 w-16" />
                          <span className="text-xs tabular-nums">{pct(totalCovered, totalTarget)}%</span>
                        </div>
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* By Team */}
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground mb-2 tracking-wide">By Team</p>
            {(() => {
              const byTeam: Record<string, { code: string; name: string; lead: string; villages: Set<string>; hh: number; bens: number }> = {};
              for (const a of assignments) {
                if (!byTeam[a.team_id]) byTeam[a.team_id] = { code: a.team_code||'', name: a.team_name||'', lead: a.team_lead_name||'', villages: new Set(), hh: 0, bens: 0 };
                byTeam[a.team_id].villages.add(a.village_name || '');
                byTeam[a.team_id].hh += a.hh_covered || 0;
              }
              for (const l of dailyLogs) {
                if (byTeam[l.team_id]) byTeam[l.team_id].bens += l.beneficiaries || 0;
              }
              const rows = Object.values(byTeam);
              return (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead>Team Code</TableHead>
                        <TableHead>Team Name</TableHead>
                        <TableHead>Team Lead</TableHead>
                        <TableHead>Villages Worked</TableHead>
                        <TableHead className="text-right">Total HH</TableHead>
                        <TableHead className="text-right">Beneficiaries</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No team data yet</TableCell></TableRow>
                      ) : rows.map((t, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-xs font-semibold">{t.code}</TableCell>
                          <TableCell className="font-medium">{t.name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{t.lead}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{[...t.villages].join(', ')}</TableCell>
                          <TableCell className="text-right tabular-nums font-bold text-emerald-600">{t.hh.toLocaleString()}</TableCell>
                          <TableCell className="text-right tabular-nums">{t.bens.toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              );
            })()}
          </div>

          {/* Campaign info */}
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            {[
              ['Campaign', selectedCampaign.campaign_name],
              ['Coordinator', selectedCampaign.coordinator_name || '—'],
              ['Supervisor', selectedCampaign.supervisor_name || '—'],
              ['Period', [fmtDate(selectedCampaign.start_date), fmtDate(selectedCampaign.end_date)].filter(d => d !== '—').join(' → ') || '—'],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{label}:</span> {value}
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Excel Import Dialog ──────────────────────────────────────────────── */}
      <Dialog open={showImportDialog} onOpenChange={o => { setShowImportDialog(o); if (!o) { setImportRows([]); setImportFileName(''); } }}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4" /> Import Villages from Excel
            </DialogTitle>
            <DialogDescription>
              Import villages, clusters, activities, teams, and fees from a spreadsheet. The import is additive only — existing records are never deleted.
            </DialogDescription>
          </DialogHeader>

          {/* Step 1: no file yet — show template download + picker */}
          {importRows.length === 0 && (
            <div className="flex flex-col items-center gap-5 py-8">
              <div className="text-center space-y-1">
                <p className="text-sm text-muted-foreground">Start with the template so your column names are recognised automatically.</p>
                <Button variant="outline" size="sm" className="gap-1.5 mt-2" onClick={downloadVillageTemplate}>
                  <Download className="h-3.5 w-3.5" /> Download Template (.xlsx)
                </Button>
              </div>
              <div
                className="w-full border-2 border-dashed rounded-lg p-10 flex flex-col items-center gap-3 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                onClick={() => importFileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={e => { e.preventDefault(); e.stopPropagation(); const f = e.dataTransfer.files?.[0]; if (f) parseVillageImportFile(f); }}
              >
                <Upload className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium">Click to select an Excel file (.xlsx)</p>
                <p className="text-xs text-muted-foreground">or drag-and-drop here</p>
                <input
                  ref={importFileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) parseVillageImportFile(f); e.target.value = ''; }}
                />
              </div>
            </div>
          )}

          {/* Step 2: file parsed — show preview table */}
          {importRows.length > 0 && (
            <div className="flex flex-col gap-3 min-h-0">
              <div className="flex items-center justify-between flex-shrink-0">
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{importFileName}</span>
                  {' '}— {importRows.length} row{importRows.length !== 1 ? 's' : ''} parsed,{' '}
                  <span className="text-emerald-600 font-medium">{importRows.filter(r => r._errors.length === 0).length} valid</span>
                  {importRows.some(r => r._errors.length > 0) && (
                    <span className="text-destructive font-medium ml-1">· {importRows.filter(r => r._errors.length > 0).length} with errors</span>
                  )}
                </div>
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => { setImportRows([]); setImportFileName(''); }}>
                  <X className="h-3 w-3" /> Change file
                </Button>
              </div>

              <div className="overflow-auto flex-1 rounded-md border text-xs">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="w-8 text-center">#</TableHead>
                      <TableHead>Cluster</TableHead>
                      <TableHead>Village</TableHead>
                      <TableHead>State / Locality</TableHead>
                      <TableHead className="text-right">HH Target</TableHead>
                      <TableHead>Activity</TableHead>
                      <TableHead>Team Code</TableHead>
                      <TableHead className="text-right">T. Fee</TableHead>
                      <TableHead className="text-right">E. Fee</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importRows.map((row, i) => (
                      <TableRow key={i} className={row._errors.length > 0 ? 'bg-red-50 dark:bg-red-950/20' : ''}>
                        <TableCell className="text-center text-muted-foreground">{row._rowNum}</TableCell>
                        <TableCell>{row.cluster_name || <span className="italic opacity-40">—</span>}</TableCell>
                        <TableCell className="font-medium">{row.village_name || <span className="text-red-500">missing</span>}</TableCell>
                        <TableCell className="text-muted-foreground">{[row.state, row.locality].filter(Boolean).join(' › ') || '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.hh_target || '—'}</TableCell>
                        <TableCell>
                          {row.activity_name ? (
                            <span>{row.activity_name}{row.activity_type && <span className="ml-1 text-muted-foreground">({row.activity_type})</span>}</span>
                          ) : <span className="italic opacity-40">—</span>}
                        </TableCell>
                        <TableCell className="font-mono">{row.team_code || <span className="italic opacity-40">—</span>}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.transport_fee || '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.enumerator_fee || '—'}</TableCell>
                        <TableCell>
                          {row._errors.length > 0 ? (
                            <div className="flex items-start gap-1">
                              <AlertCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0 mt-0.5" />
                              <span className="text-destructive leading-tight">{row._errors.join('; ')}</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-emerald-600">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              <span>Valid</span>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {importRows.some(r => r._errors.length > 0) && (
                <p className="text-xs text-muted-foreground flex-shrink-0">
                  Rows with errors will be skipped. Only <strong>{importRows.filter(r => r._errors.length === 0).length} valid row(s)</strong> will be imported.
                </p>
              )}
            </div>
          )}

          <DialogFooter className="flex-shrink-0">
            <Button variant="outline" onClick={() => setShowImportDialog(false)}>Cancel</Button>
            {importRows.length > 0 && (
              <Button
                onClick={runVillageImport}
                disabled={importing || importRows.filter(r => r._errors.length === 0).length === 0}
              >
                {importing && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                Import {importRows.filter(r => r._errors.length === 0).length} valid row{importRows.filter(r => r._errors.length === 0).length !== 1 ? 's' : ''}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Village Dialog ────────────────────────────────────────────────── */}
      <Dialog open={showAddVillage} onOpenChange={setShowAddVillage}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Village</DialogTitle>
            <DialogDescription>Add a new village to {selectedCampaign.campaign_name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Village Name *</Label>
              <Input value={villageForm.village_name} onChange={e => setVillageForm(f => ({ ...f, village_name: e.target.value }))} placeholder="Village name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Village Code</Label>
                <Input value={villageForm.village_code} onChange={e => setVillageForm(f => ({ ...f, village_code: e.target.value }))} placeholder={autoVillageCode(villages.length)} />
              </div>
              <div>
                <Label>HH Target</Label>
                <Input type="number" min="0" value={villageForm.hh_target} onChange={e => setVillageForm(f => ({ ...f, hh_target: e.target.value }))} placeholder="0" />
              </div>
            </div>
            {clusters.length > 0 && (
              <div>
                <Label>Cluster <span className="text-xs text-muted-foreground font-normal">(optional)</span></Label>
                <Select value={villageForm.cluster_id || '__none__'} onValueChange={v => setVillageForm(f => ({ ...f, cluster_id: v === '__none__' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="Assign to cluster…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No cluster</SelectItem>
                    {clusters.map(c => <SelectItem key={c.id} value={c.id}>{c.cluster_code} — {c.cluster_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>State</Label>
                <Select value={villageForm.state || '__none__'} onValueChange={v => setVillageForm(f => ({ ...f, state: v === '__none__' ? '' : v, locality: '' }))}>
                  <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select state…</SelectItem>
                    {sudanStates.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Locality</Label>
                <Select value={villageForm.locality || '__none__'} onValueChange={v => setVillageForm(f => ({ ...f, locality: v === '__none__' ? '' : v }))} disabled={!villageForm.state}>
                  <SelectTrigger><SelectValue placeholder={villageForm.state ? 'Select locality' : 'Select state first'} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select locality…</SelectItem>
                    {localitiesForState(villageForm.state).map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddVillage(false)}>Cancel</Button>
            <Button onClick={submitAddVillage} disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />} Add Village
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Assign Team Dialog ────────────────────────────────────────────────── */}
      <Dialog open={showAssignTeam} onOpenChange={setShowAssignTeam}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Team to Village</DialogTitle>
            <DialogDescription>A team can be assigned to multiple villages and move between them</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Team *</Label>
              <Select value={assignForm.team_id} onValueChange={v => setAssignForm(f => ({ ...f, team_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select team" /></SelectTrigger>
                <SelectContent>
                  {allTeams.length === 0 ? (
                    <div className="px-2 py-3 text-xs text-muted-foreground text-center">No teams. Create one in the Team Registry first.</div>
                  ) : allTeams.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.team_code} — {t.team_name} ({t.member_count} members)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Village *</Label>
              <Select value={assignForm.village_id} onValueChange={v => setAssignForm(f => ({ ...f, village_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select village" /></SelectTrigger>
                <SelectContent>{villages.map(v => <SelectItem key={v.id} value={v.id}>{v.village_code} — {v.village_name}{v.cluster_name ? ` (${v.cluster_name})` : ''}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Activity Name <span className="text-xs text-muted-foreground font-normal">(optional)</span></Label>
                <Input
                  value={assignForm.activity_name}
                  onChange={e => setAssignForm(f => ({ ...f, activity_name: e.target.value }))}
                  placeholder="e.g. Nutrition, WASH"
                />
              </div>
              <div>
                <Label>Activity Type</Label>
                <Select value={assignForm.activity_type || '__none__'} onValueChange={v => setAssignForm(f => ({ ...f, activity_type: v === '__none__' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="General" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">General / None</SelectItem>
                    <SelectItem value="nutrition">Nutrition</SelectItem>
                    <SelectItem value="wash">WASH</SelectItem>
                    <SelectItem value="protection">Protection</SelectItem>
                    <SelectItem value="health">Health</SelectItem>
                    <SelectItem value="education">Education</SelectItem>
                    <SelectItem value="livelihoods">Livelihoods</SelectItem>
                    <SelectItem value="shelter">Shelter</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Team HH Target <span className="text-xs text-muted-foreground font-normal">(optional)</span></Label>
              <Input type="number" min="0" value={assignForm.hh_target_for_team} onChange={e => setAssignForm(f => ({ ...f, hh_target_for_team: e.target.value }))} placeholder="Sub-target for this team in this village" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignTeam(false)}>Cancel</Button>
            <Button onClick={submitAssignTeam} disabled={saving || !assignForm.team_id || !assignForm.village_id}>
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />} Assign Team
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Daily Log Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={showDailyLog} onOpenChange={setShowDailyLog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Daily Progress Log</DialogTitle>
            <DialogDescription>Record today's fieldwork progress for a team</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Team Assignment *</Label>
              <Select value={logForm.assignment_id} onValueChange={v => setLogForm(f => ({ ...f, assignment_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select team → village" /></SelectTrigger>
                <SelectContent>
                  {assignments.filter(a => a.status === 'active').map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.team_code} → {a.village_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Report Date *</Label>
              <Input type="date" value={logForm.report_date} onChange={e => setLogForm(f => ({ ...f, report_date: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>HH Covered Today</Label>
                <Input type="number" min="0" value={logForm.hh_covered} onChange={e => setLogForm(f => ({ ...f, hh_covered: e.target.value }))} placeholder="0" />
              </div>
              <div>
                <Label>Beneficiaries</Label>
                <Input type="number" min="0" value={logForm.beneficiaries} onChange={e => setLogForm(f => ({ ...f, beneficiaries: e.target.value }))} placeholder="0" />
              </div>
              <div>
                <Label>Male</Label>
                <Input type="number" min="0" value={logForm.male_count} onChange={e => setLogForm(f => ({ ...f, male_count: e.target.value }))} placeholder="0" />
              </div>
              <div>
                <Label>Female</Label>
                <Input type="number" min="0" value={logForm.female_count} onChange={e => setLogForm(f => ({ ...f, female_count: e.target.value }))} placeholder="0" />
              </div>
            </div>
            <div>
              <Label>Notes / Observations</Label>
              <Textarea value={logForm.notes} onChange={e => setLogForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any observations, issues, or highlights from today's fieldwork…" rows={3} />
            </div>

            {/* ── Photo upload ─────────────────────────────────── */}
            <div>
              <Label className="flex items-center gap-1.5 mb-1.5">
                <Camera className="h-3.5 w-3.5" /> Field Photos
                <span className="text-xs text-muted-foreground font-normal">(optional)</span>
              </Label>

              {/* Thumbnail preview of selected photos */}
              {logPhotos.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {logPhotos.map((file, idx) => {
                    const src = URL.createObjectURL(file);
                    return (
                      <div key={idx} className="relative group w-16 h-16 rounded overflow-hidden border bg-muted">
                        <img src={src} alt={`photo-${idx}`} className="w-full h-full object-cover" onLoad={() => URL.revokeObjectURL(src)} />
                        <button
                          type="button"
                          className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => setLogPhotos(prev => prev.filter((_, i) => i !== idx))}
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs"
                  onClick={() => logPhotoInputRef.current?.click()}>
                  <ImageIcon className="h-3.5 w-3.5" /> Add Photos
                </Button>
                {logPhotos.length > 0 && (
                  <span className="text-xs text-muted-foreground self-center">
                    {logPhotos.length} photo{logPhotos.length !== 1 ? 's' : ''} selected
                  </span>
                )}
              </div>
              <input
                ref={logPhotoInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => {
                  const files = Array.from(e.target.files || []);
                  setLogPhotos(prev => [...prev, ...files]);
                  // Reset input so same file can be re-selected after removal
                  e.target.value = '';
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowDailyLog(false); setLogPhotos([]); }}>Cancel</Button>
            <Button onClick={submitDailyLog} disabled={saving || !logForm.assignment_id}>
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />} Save Log
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Mark Fee Paid Dialog ──────────────────────────────────────────────── */}
      <Dialog open={payDialog.open} onOpenChange={open => setPayDialog(d => ({ ...d, open }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-emerald-600" /> Record Fee Payment
            </DialogTitle>
            <DialogDescription>
              {payDialog.entry?.site_name} — total due: SDG {((payDialog.entry?.transport_fee || 0) + (payDialog.entry?.enumerator_fee || 0)).toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Amount Paid (SDG) *</Label>
              <Input type="number" min="0" placeholder="0" value={payForm.amount}
                onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div>
              <Label>Payment Method</Label>
              <Select value={payForm.method} onValueChange={v => setPayForm(f => ({ ...f, method: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="mobile_money">Mobile Money</SelectItem>
                  <SelectItem value="wallet">App Wallet</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes <span className="text-[11px] text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea value={payForm.notes}
                onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="e.g. receipt number, batch reference…" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialog({ open: false, entry: null })}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={markPaid} disabled={paying || !payForm.amount}>
              {paying && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Confirm Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Cluster Dialog ───────────────────────────────────────────────── */}
      <Dialog open={showAddCluster} onOpenChange={setShowAddCluster}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Building2 className="h-4 w-4" />Add Cluster</DialogTitle>
            <DialogDescription>Clusters group villages geographically within this campaign</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Cluster Name *</Label>
                <Input value={clusterForm.cluster_name} onChange={e => setClusterForm(f => ({ ...f, cluster_name: e.target.value }))} placeholder="e.g. North Cluster" />
              </div>
              <div>
                <Label>Cluster Code</Label>
                <Input value={clusterForm.cluster_code} onChange={e => setClusterForm(f => ({ ...f, cluster_code: e.target.value }))} placeholder="CLU-01" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>State <span className="text-xs text-muted-foreground font-normal">(optional)</span></Label>
                <Select value={clusterForm.state || '__none__'} onValueChange={v => setClusterForm(f => ({ ...f, state: v === '__none__' ? '' : v, locality: '' }))}>
                  <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Any / None</SelectItem>
                    {sudanStates.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Locality <span className="text-xs text-muted-foreground font-normal">(optional)</span></Label>
                <Select value={clusterForm.locality || '__none__'} onValueChange={v => setClusterForm(f => ({ ...f, locality: v === '__none__' ? '' : v }))} disabled={!clusterForm.state}>
                  <SelectTrigger><SelectValue placeholder={clusterForm.state ? 'Select locality' : 'Select state first'} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select locality…</SelectItem>
                    {localitiesForState(clusterForm.state).map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddCluster(false)}>Cancel</Button>
            <Button onClick={submitAddCluster} disabled={clusterSaving || !clusterForm.cluster_name.trim()}>
              {clusterSaving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />} Add Cluster
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── New Advance Request Dialog ─────────────────────────────────────────── */}
      <Dialog open={showNewAdvance} onOpenChange={setShowNewAdvance}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Advance Request</DialogTitle>
            <DialogDescription>Request a cash advance for campaign field operations</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Amount (SDG) *</Label>
              <Input type="number" min="0" placeholder="0" value={advanceForm.requested_amount}
                onChange={e => setAdvanceForm(f => ({ ...f, requested_amount: e.target.value }))} />
            </div>
            <div>
              <Label>Expense Category</Label>
              <Select value={advanceForm.expense_category} onValueChange={v => setAdvanceForm(f => ({ ...f, expense_category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="transport">Transport / Fuel</SelectItem>
                  <SelectItem value="enumerator_fees">Enumerator Fees</SelectItem>
                  <SelectItem value="accommodation">Accommodation</SelectItem>
                  <SelectItem value="meals">Meal Per Diem</SelectItem>
                  <SelectItem value="supplies">Field Supplies</SelectItem>
                  <SelectItem value="communication">Communication</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Site / Village <span className="text-[11px] text-muted-foreground font-normal">(optional)</span></Label>
              <Select value={advanceForm.site_name || '__none__'}
                onValueChange={v => setAdvanceForm(f => ({ ...f, site_name: v === '__none__' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="All villages / general" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">General (all villages)</SelectItem>
                  {villages.map(v => <SelectItem key={v.id} value={v.village_name}>{v.village_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Description / Justification</Label>
              <Textarea value={advanceForm.description}
                onChange={e => setAdvanceForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Briefly describe what this advance will be used for…" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewAdvance(false)}>Cancel</Button>
            <Button onClick={submitAdvance} disabled={advanceSaving || !advanceForm.requested_amount}>
              {advanceSaving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />} Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reject Advance Dialog ─────────────────────────────────────────────── */}
      <Dialog open={rejectDialog.open} onOpenChange={open => !open && setRejectDialog(d => ({ ...d, open: false }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reject Advance — Tier {rejectDialog.tier}</DialogTitle>
            <DialogDescription>
              {rejectDialog.advance && (
                <>SDG {Number(rejectDialog.advance.requested_amount).toLocaleString()} · {rejectDialog.advance.description || 'No description'}</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Rejection reason <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
              <Textarea
                value={rejectNote}
                onChange={e => setRejectNote(e.target.value)}
                placeholder="Explain why this advance request is being rejected…"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRejectDialog(d => ({ ...d, open: false }))}>Cancel</Button>
            <Button type="button" variant="destructive" onClick={rejectAdvance} disabled={rejecting}>
              {rejecting && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />} Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Team Registry Dialog ──────────────────────────────────────────────────────

function TeamRegistryDialog({
  open, onOpenChange, teams, profiles, onRefresh, canManage, canDelete,
  showCreateTeam, setShowCreateTeam, teamForm, setTeamForm,
  onSubmitTeam, saving, autoCode, onDeleteTeam,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  teams: Team[]; profiles: ProfileOption[];
  onRefresh: () => void; canManage: boolean; canDelete?: boolean;
  showCreateTeam: boolean; setShowCreateTeam: (v: boolean) => void;
  teamForm: { team_name: string; team_code: string; team_lead_id: string; member_count: string; notes: string };
  setTeamForm: (f: any) => void;
  onSubmitTeam: () => void; saving: boolean;
  autoCode: () => string;
  onDeleteTeam: (id: string) => void;
}) {
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Team Registry</DialogTitle>
            <DialogDescription>Global team list — teams can be assigned to any campaign or village</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end mb-2">
            {canManage && (
              <Button size="sm" onClick={() => { setTeamForm({ team_name:'', team_code: autoCode(), team_lead_id:'', member_count:'', notes:'' }); setShowCreateTeam(true); }}>
                <Plus className="h-3.5 w-3.5 mr-1.5" /> New Team
              </Button>
            )}
          </div>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Code</TableHead>
                  <TableHead>Team Name</TableHead>
                  <TableHead>Team Lead</TableHead>
                  <TableHead className="text-right">Members</TableHead>
                  <TableHead>Notes</TableHead>
                  {canDelete && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {teams.length === 0 ? (
                  <TableRow><TableCell colSpan={canDelete ? 6 : 5} className="text-center py-8 text-muted-foreground">No teams yet. Create the first one →</TableCell></TableRow>
                ) : teams.map(t => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-xs font-semibold">{t.team_code}</TableCell>
                    <TableCell className="font-medium">{t.team_name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{t.team_lead_name || '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{t.member_count}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">{t.notes || '—'}</TableCell>
                    {canDelete && (
                      <TableCell>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-600" onClick={() => onDeleteTeam(t.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Team sub-dialog */}
      <Dialog open={showCreateTeam} onOpenChange={setShowCreateTeam}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Team</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Team Name *</Label>
                <Input value={teamForm.team_name} onChange={e => setTeamForm((f: any) => ({ ...f, team_name: e.target.value }))} placeholder="e.g. North Darfur Alpha" />
              </div>
              <div>
                <Label>Team Code *</Label>
                <Input value={teamForm.team_code} onChange={e => setTeamForm((f: any) => ({ ...f, team_code: e.target.value }))} placeholder="TM-001" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Team Lead</Label>
                <Select value={teamForm.team_lead_id} onValueChange={v => setTeamForm((f: any) => ({ ...f, team_lead_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select lead" /></SelectTrigger>
                  <SelectContent>{profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name || p.username}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Member Count</Label>
                <Input type="number" min="0" value={teamForm.member_count} onChange={e => setTeamForm((f: any) => ({ ...f, member_count: e.target.value }))} placeholder="0" />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={teamForm.notes} onChange={e => setTeamForm((f: any) => ({ ...f, notes: e.target.value }))} placeholder="Optional notes about this team…" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateTeam(false)}>Cancel</Button>
            <Button onClick={onSubmitTeam} disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />} Create Team
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  );
}
