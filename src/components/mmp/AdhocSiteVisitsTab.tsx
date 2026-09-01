import { useState, useEffect, useMemo, useRef, useCallback, type ChangeEvent, type DragEvent } from 'react';
import * as XLSX from 'xlsx';
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
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Upload, FileSpreadsheet, PlusCircle, Trash2, Pencil, XCircle,
  Loader2, Download, CheckCircle2, Users, AlertTriangle, RefreshCw,
  FolderOpen, Activity, Calculator, Info
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DataCollector {
  id: string;
  full_name?: string | null;
  username?: string | null;
  email?: string | null;
}

interface ProjectOption {
  id: string;
  name: string;
}

interface ProjectMmp {
  id: string;
  name: string;
  month: string;
  mmp_id: string;
  site_count: number;
}

interface ProjectActivity {
  id: string;
  title: string;
  activity_type: string;
  custom_type_label?: string | null;
}

type FeeMode = 'flat' | 'per_hh';

interface AdhocRow {
  siteName: string;
  siteCode: string;
  state: string;
  locality: string;
  phoneNumber: string;
  transportFee: string;
  feeMode: FeeMode;
  enumeratorFee: string;       // flat total OR calculated (rate × HH)
  enumeratorFeeRate: string;   // rate per HH (per_hh mode only)
  assignToId: string;
  assignToName: string;
  dueDate: string;
  // Activity
  activityId: string;
  activityName: string;
  activityType: string;
  // Monitoring metrics
  hhTarget: string;
  hhCompleted: string;
  beneficiaries: string;
  pdmQuestionnaires: string;
  maleCount: string;
  femaleCount: string;
  _errors?: string[];
}

interface ExistingEntry {
  id: string;
  mmp_file_id?: string;
  mmp_name?: string;
  site_name: string;
  site_code?: string;
  state?: string;
  locality?: string;
  status: string;
  accepted_by?: string;
  preferred_assignee_id?: string;
  assignedToName?: string;
  phone_number?: string;
  transport_fee?: number;
  enumerator_fee?: number;
  fee_mode?: FeeMode;
  enumerator_fee_rate?: number;
  visit_date?: string;
  created_at?: string;
  dispatched_at?: string;
  // Monitoring
  activity_name?: string;
  activity_type?: string;
  hh_target?: number;
  hh_completed?: number;
  beneficiaries?: number;
  pdm_questionnaires?: number;
  male_count?: number;
  female_count?: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  dispatched: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  assigned: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  accepted: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  claimed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  ongoing: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  completed: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  recalled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

const FILTER_STATUSES = ['all', 'pending', 'dispatched', 'assigned', 'claimed', 'completed'] as const;

const CREATE_PROJECT_MMP_VALUE = '__create_project_mmp__';

interface MmpLifecycleRecord {
  status?: string | null;
  cycle_status?: string | null;
}

const normalizeMmpLifecycleStatus = (value?: string | null) =>
  (value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');

const isOpenProjectMmp = (mmp: MmpLifecycleRecord): boolean => {
  const status = normalizeMmpLifecycleStatus(mmp.status);
  const cycleStatus = normalizeMmpLifecycleStatus(mmp.cycle_status);
  return !['archived', 'cancelled', 'closed', 'deleted', 'rejected'].includes(status)
    && !['archived', 'closed', 'final_closed', 'soft_closed'].includes(cycleStatus);
};

const emptyRow = (): AdhocRow => ({
  siteName: '', siteCode: '', state: '', locality: '',
  phoneNumber: '', transportFee: '', feeMode: 'flat', enumeratorFee: '', enumeratorFeeRate: '',
  assignToId: '', assignToName: '', dueDate: '',
  activityId: '', activityName: '', activityType: '',
  hhTarget: '', hhCompleted: '', beneficiaries: '', pdmQuestionnaires: '', maleCount: '', femaleCount: '',
});

/** Calculate enumerator fee for per-HH mode. Uses HH Completed if available, else HH Target. */
const calcPerHhFee = (rate: string, hhCompleted: string, hhTarget: string): string => {
  const r = parseFloat(rate);
  const hh = parseFloat(hhCompleted) || parseFloat(hhTarget) || 0;
  if (!r || !hh) return '';
  return String(Math.round(r * hh * 100) / 100);
};

const validateRow = (row: AdhocRow): string[] => {
  const errors: string[] = [];
  if (!row.siteName.trim()) errors.push('Site Name required');
  if (!row.state.trim()) errors.push('State required');
  if (!row.activityName.trim()) errors.push('Activity required');
  return errors;
};

const normalizePhoneNumbers = (raw: string): string[] => {
  if (!raw?.trim()) return [];
  return raw
    .split(/\s*-\s*|\s*\/\s*|\s*,\s*|\s*;\s*/)
    .map((part) => part.replace(/\s+/g, '').replace(/[^\d+]/g, '').trim())
    .filter((part) => part.length >= 7);
};

// ── Project MMP fallback (used only when a project has no open MMP) ───────────

const getOrCreateAdhocMMPFile = async (
  projectId: string,
  projectName: string
): Promise<string> => {
  const now = new Date();
  const monthYear = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const baseMmpId = `adhoc-tasks-${projectId}-${monthKey}`;

  const { data: existing } = await supabase
    .from('mmp_files')
    .select('id, status, cycle_status')
    .eq('mmp_id', baseMmpId)
    .single();

  if (existing && isOpenProjectMmp(existing)) return existing.id;

  const mmpId = existing
    ? `${baseMmpId}-${Date.now().toString(36)}`
    : baseMmpId;
  const mmpName = `Ad-hoc Tasks — ${projectName} — ${monthYear}`;

  const { data: newMMP, error } = await supabase
    .from('mmp_files')
    .insert({
      mmp_id: mmpId,
      name: mmpName,
      status: 'Approved',
      month: now.toISOString().slice(0, 7),
      project_id: projectId,
      uploaded_by: 'system',
      uploaded_at: now.toISOString(),
      approved_by: 'system',
      approved_at: now.toISOString(),
      file_path: `system/${mmpId}`,
    })
    .select('id')
    .single();

  if (error || !newMMP) throw error || new Error('Failed to create adhoc MMP file');
  return newMMP.id;
};

const loadOpenProjectMmps = async (projectId: string): Promise<ProjectMmp[]> => {
  const { data, error } = await supabase
    .from('mmp_files')
    .select('id, name, month, mmp_id, status, cycle_status, created_at')
    .eq('project_id', projectId)
    .order('month', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw error;

  const openMmps = ((data || []) as Array<MmpLifecycleRecord & {
    id: string;
    name: string | null;
    month: string | null;
    mmp_id: string | null;
    created_at: string | null;
  }>).filter(isOpenProjectMmp);
  const ids = openMmps.map(mmp => mmp.id);
  const { data: counts, error: countsError } = ids.length
    ? await supabase
        .from('mmp_site_entries')
        .select('mmp_file_id')
        .in('mmp_file_id', ids)
    : { data: [], error: null };

  if (countsError) throw countsError;

  const countMap: Record<string, number> = {};
  (counts || []).forEach((row: { mmp_file_id: string | null }) => {
    if (!row.mmp_file_id) return;
    countMap[row.mmp_file_id] = (countMap[row.mmp_file_id] || 0) + 1;
  });

  return openMmps.map(mmp => ({
    id: mmp.id,
    name: mmp.name || mmp.mmp_id || mmp.id,
    month: mmp.month || '',
    mmp_id: mmp.mmp_id || mmp.id,
    site_count: countMap[mmp.id] || 0,
  }));
};

// ── Column-mapping ────────────────────────────────────────────────────────────

interface ColumnMap {
  siteName: string;
  state: string;
  locality: string;
  siteCode: string;
  phoneNumber: string;
  transportFee: string;
  feeMode: string;
  enumeratorFee: string;
  enumeratorFeeRate: string;
  assignTo: string;
  dueDate: string;
  activity: string;
  hhTarget: string;
  hhCompleted: string;
  beneficiaries: string;
  pdmQuestionnaires: string;
  maleCount: string;
  femaleCount: string;
}

const COL_ALIASES: Record<keyof ColumnMap, string[]> = {
  siteName:          ['site name','sitename','name','trdname','tradername','trader name','school name','market name','distribution point','site','market','location name','beneficiary site','pdm site','retailer name','retailer','trader'],
  state:             ['state','location','admin1name','admin1 name','province','governorate','region','wilaya'],
  locality:          ['locality','location','admin2name','admin2 name','district','county','sub-district','sub district','mahalia','locality name'],
  siteCode:          ['site code','sitecode','code','id','site id','trdid','school code','pdm code','retailer code','site_code'],
  phoneNumber:       ['phone number','phone','mobile','tel','telephone','contact number','contact'],
  transportFee:      ['transport fee','transportfee','transport','transport cost','travel fee','travel cost'],
  feeMode:           ['fee mode','feemode','payment mode','fee type','fee_mode'],
  enumeratorFee:     ['enumerator fee','enumeratorfee','fee','monitor fee','enumerator fee (sdg)','enum fee','data collector fee','flat fee'],
  enumeratorFeeRate: ['rate per hh','rate/hh','hh rate','per hh rate','enumerator rate','enum rate','fee rate','rate_per_hh'],
  assignTo:          ['assign to','assignto','enumerator','monitor','data collector','collector','assigned to','assigned_to'],
  dueDate:           ['due date','duedate','due','visit date','collection date','survey date','date'],
  activity:          ['activity','activity name','activity type','activityname','activitytype','main activity','tpm activity'],
  hhTarget:          ['hh target','hhtarget','target hhs','target households','planned hhs','hh planned','hhs to interview','target_hh'],
  hhCompleted:       ['hh completed','hhcompleted','actual hhs','actual households','completed hhs','hhs interviewed','hh_completed'],
  beneficiaries:     ['beneficiaries','total beneficiaries','beneficiary count','beneficiaries reached'],
  pdmQuestionnaires: ['pdm questionnaires','pdm count','questionnaires','pdm forms','pdm_questionnaires'],
  maleCount:         ['male','male count','males','male hhs','male_count'],
  femaleCount:       ['female','female count','females','female hhs','female_count'],
};

const autoDetectColumn = (headers: string[], field: keyof ColumnMap): string => {
  const lower = headers.map(h => h.toLowerCase());
  for (const alias of COL_ALIASES[field]) {
    const idx = lower.indexOf(alias);
    if (idx >= 0) return headers[idx];
  }
  return '';
};

const emptyColumnMap = (): ColumnMap => ({
  siteName: '', state: '', locality: '', siteCode: '', phoneNumber: '',
  transportFee: '', enumeratorFee: '', assignTo: '', dueDate: '',
  activity: '', hhTarget: '', hhCompleted: '', beneficiaries: '',
  pdmQuestionnaires: '', maleCount: '', femaleCount: '',
});

// ── Component ─────────────────────────────────────────────────────────────────

interface AdhocSiteVisitsTabProps {
  canManage: boolean;
}

export default function AdhocSiteVisitsTab({ canManage }: AdhocSiteVisitsTabProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Core data
  const [collectors, setCollectors] = useState<DataCollector[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');

  // MMP & Activity pickers
  const [projectMmps, setProjectMmps] = useState<ProjectMmp[]>([]);
  const [selectedMmpId, setSelectedMmpId] = useState<string>('');
  const [loadingMmps, setLoadingMmps] = useState(false);
  const [projectActivities, setProjectActivities] = useState<ProjectActivity[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [showAddActivity, setShowAddActivity] = useState(false);
  const [newActivityName, setNewActivityName] = useState('');
  const [newActivityType, setNewActivityType] = useState('field_assessment');
  const [creatingActivity, setCreatingActivity] = useState(false);

  // Create mode
  const [createMode, setCreateMode] = useState<'upload' | 'manual'>('manual');

  // Upload state
  const [uploadedRows, setUploadedRows] = useState<AdhocRow[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [rawFileHeaders, setRawFileHeaders] = useState<string[]>([]);
  const [rawFileRows, setRawFileRows] = useState<(string | number)[][]>([]);
  const [showColumnMapper, setShowColumnMapper] = useState(false);
  const [columnMap, setColumnMap] = useState<ColumnMap>(emptyColumnMap());

  // Manual entry state
  const [manualRows, setManualRows] = useState<AdhocRow[]>([]);
  const [formRow, setFormRow] = useState<AdhocRow>(emptyRow());
  const [collectorSearch, setCollectorSearch] = useState('');
  const [showCollectorDropdown, setShowCollectorDropdown] = useState(false);

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<{ assigned: number; open: number } | null>(null);

  // Existing entries
  const [existingEntries, setExistingEntries] = useState<ExistingEntry[]>([]);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Edit / Recall
  const [editEntry, setEditEntry] = useState<ExistingEntry | null>(null);
  const [editForm, setEditForm] = useState<Partial<ExistingEntry>>({});
  const [saving, setSaving] = useState(false);
  const [recallEntry, setRecallEntry] = useState<ExistingEntry | null>(null);
  const [recalling, setRecalling] = useState(false);

  // ── Load collectors ──────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, username, email, role')
        .order('full_name', { ascending: true });
      if (data) {
        const rolePatterns = ['datacollector', 'data collector', 'collector', 'enumerator', 'coordinator'];
        setCollectors(
          data.filter(p => {
            const r = (p.role || '').toLowerCase().replace(/\s+/g, '');
            return rolePatterns.some(pat => r.includes(pat.replace(/\s+/g, '')));
          })
        );
      }
    })();
  }, []);

  // ── Load projects ────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name')
        .order('name', { ascending: true });
      if (error) { console.error('Failed to load projects for ad-hoc sites:', error); return; }
      setProjects((data || []).map((p: any) => ({ id: p.id, name: p.name || p.id })));
    })();
  }, []);

  // ── Load MMPs + Activities when project changes ──────────────────────────

  useEffect(() => {
    if (!selectedProjectId) {
      setProjectMmps([]);
      setProjectActivities([]);
      setSelectedMmpId('');
      setLoadingMmps(false);
      setLoadingActivities(false);
      return;
    }

    let isCurrentProject = true;

    // Load MMPs for this project
    setLoadingMmps(true);
    (async () => {
      try {
        const openMmps = await loadOpenProjectMmps(selectedProjectId);
        if (!isCurrentProject) return;
        setProjectMmps(openMmps);
        setSelectedMmpId(current =>
          openMmps.some(mmp => mmp.id === current)
            ? current
            : (openMmps[0]?.id ?? CREATE_PROJECT_MMP_VALUE),
        );
      } catch (error) {
        if (!isCurrentProject) return;
        console.error('Failed to load open MMPs for ad-hoc sites:', error);
        setProjectMmps([]);
        setSelectedMmpId(CREATE_PROJECT_MMP_VALUE);
        toast({
          title: 'Could not load project MMPs',
          description: 'No site visits can be created until the available MMPs can be checked.',
          variant: 'destructive',
        });
      } finally {
        if (isCurrentProject) setLoadingMmps(false);
      }
    })();

    // Load activities for this project
    setLoadingActivities(true);
    (async () => {
      const { data } = await supabase
        .from('project_activities')
        .select('id, title, activity_type, custom_type_label')
        .eq('project_id', selectedProjectId)
        .order('title', { ascending: true });
      if (isCurrentProject) {
        setProjectActivities((data || []) as ProjectActivity[]);
        setLoadingActivities(false);
      }
    })();

    return () => {
      isCurrentProject = false;
    };
  }, [selectedProjectId, toast]);

  // ── Load existing ad-hoc entries ─────────────────────────────────────────
  // New entries carry additional_data.source='adhoc', so they remain visible
  // even after a page reload when they are inside a real project MMP. Retain
  // the generated-bucket lookup to include older entries created before that
  // marker was consistently available.

  const loadExisting = useCallback(async () => {
    setLoadingExisting(true);
    try {
      const entrySelect = 'id, mmp_file_id, site_name, site_code, state, locality, status, accepted_by, additional_data, transport_fee, enumerator_fee, visit_date, created_at, dispatched_at';
      const [adhocFilesResult, markedEntriesResult] = await Promise.all([
        supabase
          .from('mmp_files')
          .select('id, name')
          .ilike('mmp_id', 'adhoc-tasks-%'),
        supabase
          .from('mmp_site_entries')
          .select(entrySelect)
          .contains('additional_data', { source: 'adhoc' })
          .order('created_at', { ascending: false })
          .limit(500),
      ]);

      const adhocFiles = adhocFilesResult.data ?? [];
      const adhocFileIds = (adhocFiles || []).map((f: any) => f.id as string);
      const mmpNameMap: Record<string, string> = {};
      (adhocFiles || []).forEach((f: any) => { mmpNameMap[f.id] = f.name; });

      const bucketEntriesResult = adhocFileIds.length
        ? await supabase
            .from('mmp_site_entries')
            .select(entrySelect)
            .in('mmp_file_id', adhocFileIds)
            .order('created_at', { ascending: false })
            .limit(500)
        : { data: [], error: null };

      if (markedEntriesResult.error) {
        console.error('Failed to load ad-hoc entries from project MMPs:', markedEntriesResult.error);
      }
      if (bucketEntriesResult.error) {
        console.error('Failed to load generated ad-hoc MMP entries:', bucketEntriesResult.error);
      }

      const entriesById = new Map<string, any>();
      [...(markedEntriesResult.data || []), ...(bucketEntriesResult.data || [])]
        .forEach((entry: any) => entriesById.set(entry.id, entry));
      const allEntries = [...entriesById.values()]
        .sort((left, right) => String(right.created_at || '').localeCompare(String(left.created_at || '')));

      const mmpIds = [...new Set(allEntries.map(entry => entry.mmp_file_id).filter(Boolean))] as string[];
      if (mmpIds.length > 0) {
        const { data: mmpNames, error: mmpNamesError } = await supabase
          .from('mmp_files')
          .select('id, name')
          .in('id', mmpIds);
        if (mmpNamesError) {
          console.error('Failed to resolve MMP names for ad-hoc entries:', mmpNamesError);
        }
        (mmpNames || []).forEach((m: any) => { mmpNameMap[m.id] = m.name; });
      }

      // Step 3: Resolve assignee names
      const assignedIds = [...new Set(allEntries.flatMap((e: any) => {
        return [e.additional_data?.assigned_to, e.accepted_by].filter(Boolean);
      }))] as string[];

      let namesMap: Record<string, string> = {};
      if (assignedIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, username, email')
          .in('id', assignedIds);
        (profiles || []).forEach((p: any) => {
          namesMap[p.id] = p.full_name || p.username || p.email || p.id;
        });
      }

      setExistingEntries(allEntries.map((e: any) => {
        const ad = e.additional_data || {};
        return {
          id: e.id,
          mmp_file_id: e.mmp_file_id,
          mmp_name: mmpNameMap[e.mmp_file_id] || 'Containing MMP unavailable',
          site_name: e.site_name || '',
          site_code: e.site_code,
          state: e.state,
          locality: e.locality,
          status: e.status || 'pending',
          accepted_by: e.accepted_by,
          preferred_assignee_id: ad.assigned_to,
          phone_number: e.phone_number || ad.phone_number_raw || ad.phone_number || ad['Phone Number'] || undefined,
          transport_fee: e.transport_fee,
          enumerator_fee: e.enumerator_fee,
          visit_date: e.visit_date,
          created_at: e.created_at,
          dispatched_at: e.dispatched_at,
          assignedToName: e.accepted_by
            ? (namesMap[e.accepted_by] || e.accepted_by)
            : (ad.assigned_to ? (namesMap[ad.assigned_to] || ad.assigned_to) : undefined),
          fee_mode: (ad.fee_mode as FeeMode) || 'flat',
          enumerator_fee_rate: ad.enumerator_fee_rate ? Number(ad.enumerator_fee_rate) : undefined,
          activity_name: ad.activity_name || ad.main_activity || undefined,
          activity_type: ad.activity_type || undefined,
          hh_target: ad.hh_target ? Number(ad.hh_target) : undefined,
          hh_completed: ad.hh_completed ? Number(ad.hh_completed) : undefined,
          beneficiaries: ad.beneficiaries ? Number(ad.beneficiaries) : undefined,
          pdm_questionnaires: ad.pdm_questionnaires ? Number(ad.pdm_questionnaires) : undefined,
          male_count: ad.male_count ? Number(ad.male_count) : undefined,
          female_count: ad.female_count ? Number(ad.female_count) : undefined,
        } as ExistingEntry;
      }));
    } catch (err) {
      console.error('Failed to load adhoc entries:', err);
    } finally {
      setLoadingExisting(false);
    }
  }, []);

  useEffect(() => { loadExisting(); }, [loadExisting, refreshTrigger]);

  // ── Derived ──────────────────────────────────────────────────────────────

  const localities = useMemo(() => {
    if (!formRow.state) return [];
    return sudanStates.find(s => s.name === formRow.state)?.localities || [];
  }, [formRow.state]);

  const filteredCollectors = useMemo(() => {
    const q = collectorSearch.trim().toLowerCase();
    if (!q) return collectors.slice(0, 30);
    return collectors.filter(c =>
      (c.full_name || '').toLowerCase().includes(q) ||
      (c.username || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q)
    ).slice(0, 20);
  }, [collectors, collectorSearch]);

  const filteredExisting = useMemo(() => {
    if (statusFilter === 'all') return existingEntries;
    const s = statusFilter.toLowerCase();
    return existingEntries.filter(e => {
      const es = (e.status || '').toLowerCase();
      if (s === 'claimed') return es === 'claimed' || es === 'accepted';
      return es === s;
    });
  }, [existingEntries, statusFilter]);

  const canEdit = (entry: ExistingEntry) => {
    const s = (entry.status || '').toLowerCase();
    return s === 'pending' || s === 'dispatched' || s === 'assigned';
  };

  const selectedMmpLabel = useMemo(() => {
    if (!selectedProjectId) return 'Select a project first';
    if (loadingMmps) return 'Checking open MMPs…';
    if (projectMmps.length === 0) return 'New project MMP';
    const m = projectMmps.find(m => m.id === selectedMmpId);
    return m ? `${m.name} (${m.site_count} sites)` : 'Select an open MMP';
  }, [selectedMmpId, projectMmps, selectedProjectId, loadingMmps]);

  // ── File upload helpers ──────────────────────────────────────────────────

  const buildRowsFromMap = useCallback((headers: string[], rows: (string | number)[][], map: ColumnMap): AdhocRow[] => {
    const get = (row: (string | number)[], col: string) => {
      if (!col) return '';
      const idx = headers.indexOf(col);
      if (idx < 0 || row[idx] === undefined || row[idx] === '') return '';
      return String(row[idx]).trim();
    };
    return rows.map(row => {
      const assignToName = get(row, map.assignTo);
      const stateRaw = get(row, map.state);
      const localityRaw = get(row, map.locality);
      const activityRaw = get(row, map.activity);
      const feeModeRaw = get(row, map.feeMode).toLowerCase();
      const feeMode: FeeMode = feeModeRaw === 'per_hh' || feeModeRaw === 'per hh' || feeModeRaw === 'perhh' ? 'per_hh' : 'flat';
      const hhTarget = get(row, map.hhTarget);
      const hhCompleted = get(row, map.hhCompleted);
      const enumeratorFeeRate = get(row, map.enumeratorFeeRate);
      const flatFee = get(row, map.enumeratorFee);
      const enumeratorFee = feeMode === 'per_hh'
        ? calcPerHhFee(enumeratorFeeRate, hhCompleted, hhTarget)
        : flatFee;
      const matchedCollector = collectors.find(c =>
        (c.full_name || '').toLowerCase() === assignToName.toLowerCase() ||
        (c.email || '').toLowerCase() === assignToName.toLowerCase()
      );
      const unmatchedAssignee = assignToName && !matchedCollector;
      const r: AdhocRow = {
        siteName:          get(row, map.siteName),
        siteCode:          get(row, map.siteCode),
        state:             stateRaw,
        locality:          localityRaw || stateRaw,
        phoneNumber:       get(row, map.phoneNumber),
        transportFee:      get(row, map.transportFee),
        feeMode,
        enumeratorFee,
        enumeratorFeeRate,
        assignToId:        matchedCollector?.id || '',
        assignToName:      assignToName || (matchedCollector ? (matchedCollector.full_name || '') : ''),
        dueDate:           get(row, map.dueDate),
        activityId:        '',
        activityName:      activityRaw,
        activityType:      '',
        hhTarget,
        hhCompleted,
        beneficiaries:     get(row, map.beneficiaries),
        pdmQuestionnaires: get(row, map.pdmQuestionnaires),
        maleCount:         get(row, map.maleCount),
        femaleCount:       get(row, map.femaleCount),
      };
      r._errors = validateRow(r);
      if (unmatchedAssignee) {
        r._errors = [...(r._errors || []), `Enumerator "${assignToName}" not found — left open for claim`];
      }
      return r;
    }).filter(r => r.siteName || r.state || r.locality);
  }, [collectors]);

  const parseFile = (file: File) => {
    setUploadedFileName(file.name);
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
        const headers = raw[0].map(h => String(h).trim());
        const dataRows = raw.slice(1);
        const detected: ColumnMap = Object.fromEntries(
          (Object.keys(emptyColumnMap()) as (keyof ColumnMap)[]).map(f => [f, autoDetectColumn(headers, f)])
        ) as ColumnMap;

        if (!detected.siteName || !detected.state || !detected.activity) {
          setRawFileHeaders(headers);
          setRawFileRows(dataRows);
          setColumnMap(detected);
          setShowColumnMapper(true);
        } else {
          setUploadedRows(buildRowsFromMap(headers, dataRows, detected));
        }
      } catch {
        toast({ title: 'Parse error', description: 'Could not read the file.', variant: 'destructive' });
      }
    };
    reader.readAsBinaryString(file);
  };

  const applyColumnMap = () => {
    if (!columnMap.siteName || !columnMap.state || !columnMap.activity) {
      toast({ title: 'Required fields missing', description: 'Please map Site Name, State, and Activity before continuing.', variant: 'destructive' });
      return;
    }
    setUploadedRows(buildRowsFromMap(rawFileHeaders, rawFileRows, columnMap));
    setShowColumnMapper(false);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) parseFile(f);
    e.target.value = '';
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) parseFile(f);
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      [
        'Site Name', 'Site Code', 'State', 'Locality', 'Phone Number',
        'Transport Fee', 'Fee Mode', 'Enumerator Fee', 'Rate per HH', 'Assign To', 'Due Date',
        'Activity', 'HH Target', 'HH Completed', 'Beneficiaries',
        'PDM Questionnaires', 'Male', 'Female',
      ],
      [
        // Example row with tooltip hints
        '', '', '', '', '',
        '', 'flat (or per_hh)', '', '(if Fee Mode=per_hh)', '', '',
        '', '', '', '', '', '', '',
      ],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ad-hoc Sites Template');
    XLSX.writeFile(wb, 'adhoc-sites-template.xlsx');
  };

  // ── Manual row helpers ───────────────────────────────────────────────────

  const createProjectActivity = async () => {
    const title = newActivityName.trim();
    if (!selectedProjectId) {
      toast({ title: 'Project required', description: 'Select a project before adding an activity.', variant: 'destructive' });
      return;
    }
    if (!title) {
      toast({ title: 'Activity name required', variant: 'destructive' });
      return;
    }

    setCreatingActivity(true);
    try {
      const { data, error } = await supabase
        .from('project_activities')
        .insert({
          project_id: selectedProjectId,
          title,
          activity_type: newActivityType,
          status: 'open',
        })
        .select('id, title, activity_type, custom_type_label')
        .single();
      if (error) throw error;

      const created = data as ProjectActivity;
      setProjectActivities(current =>
        [...current, created].sort((left, right) => left.title.localeCompare(right.title)),
      );
      setFormRow(current => ({
        ...current,
        activityId: created.id,
        activityName: created.title,
        activityType: created.activity_type,
      }));
      setNewActivityName('');
      setNewActivityType('field_assessment');
      setShowAddActivity(false);
      toast({ title: 'Activity added', description: `${created.title} is selected for the new site.` });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not create the activity.';
      toast({ title: 'Failed to add activity', description: message, variant: 'destructive' });
    } finally {
      setCreatingActivity(false);
    }
  };

  const addManualRow = () => {
    const errors = validateRow(formRow);
    if (errors.length > 0) {
      toast({ title: 'Missing required fields', description: errors.join(', '), variant: 'destructive' });
      return;
    }
    setManualRows(prev => [...prev, { ...formRow, _errors: [] }]);
    setFormRow(emptyRow());
    setCollectorSearch('');
  };

  const removeManualRow = (idx: number) => setManualRows(prev => prev.filter((_, i) => i !== idx));
  const removeUploadRow = (idx: number) => setUploadedRows(prev => prev.filter((_, i) => i !== idx));

  // ── Submission ───────────────────────────────────────────────────────────

  const submitRows = async (rows: AdhocRow[]) => {
    const validRows = rows.filter(r => !r._errors?.length);
    if (validRows.length === 0) {
      toast({ title: 'No valid rows', description: 'Please fix validation errors before submitting.', variant: 'destructive' });
      return;
    }
    if (!selectedProjectId) {
      toast({ title: 'Project required', description: 'Please select the project for these ad-hoc sites.', variant: 'destructive' });
      return;
    }
    if (loadingMmps) {
      toast({ title: 'Checking project MMPs', description: 'Please wait until the available MMPs have loaded.' });
      return;
    }
    const selectedProjectMmp = projectMmps.find(mmp => mmp.id === selectedMmpId);
    if (projectMmps.length > 0 && !selectedProjectMmp) {
      toast({
        title: 'Select an open MMP',
        description: 'This project already has open MMPs, so ad-hoc visits must be added to one of them.',
        variant: 'destructive',
      });
      return;
    }
    setSubmitting(true);
    try {
      let mmpFileId: string;
      let destinationMmp = selectedProjectMmp;
      if (selectedProjectMmp) {
        const { data: currentMmp, error: currentMmpError } = await supabase
          .from('mmp_files')
          .select('id, status, cycle_status')
          .eq('id', selectedProjectMmp.id)
          .single();
        if (currentMmpError || !currentMmp || !isOpenProjectMmp(currentMmp)) {
          throw new Error('The selected MMP is no longer open. Choose another open MMP before creating site visits.');
        }
        mmpFileId = currentMmp.id;
      } else {
        // Check once more before creating a project MMP, so a concurrently
        // created open MMP is used instead of producing a parallel one.
        const newlyAvailableMmp = (await loadOpenProjectMmps(selectedProjectId))[0];
        if (newlyAvailableMmp) {
          destinationMmp = newlyAvailableMmp;
          mmpFileId = newlyAvailableMmp.id;
        } else {
          const selectedProject = projects.find((p) => p.id === selectedProjectId);
          mmpFileId = await getOrCreateAdhocMMPFile(selectedProjectId, selectedProject?.name || 'Project');
        }
      }

      let assigned = 0, open = 0;
      const entries = validRows.map(row => {
        const hasAssignee = !!row.assignToId;
        if (hasAssignee) assigned++; else open++;
        // For per-HH mode, (re)calculate the fee from rate × HH;
        // completed takes priority over target during planning.
        const isPerHh = row.feeMode === 'per_hh';
        const calculatedFee = isPerHh
          ? calcPerHhFee(row.enumeratorFeeRate, row.hhCompleted, row.hhTarget)
          : row.enumeratorFee;
        return {
          mmp_file_id: mmpFileId,
          site_name: row.siteName.trim(),
          site_code: row.siteCode.trim() || null,
          state: row.state.trim(),
          locality: row.locality.trim() || row.state.trim(),
          main_activity: row.activityName.trim(),
          activity_at_site: row.activityType || row.activityName.trim(),
          transport_fee: row.transportFee ? Number(row.transportFee) : null,
          enumerator_fee: calculatedFee ? Number(calculatedFee) : null,
          accepted_by: null,
          status: 'pending',
          visit_date: row.dueDate || null,
          additional_data: {
            source: 'adhoc',
            assigned_to: row.assignToId || null,
            phone_number_raw: row.phoneNumber || null,
            phone_numbers: normalizePhoneNumbers(row.phoneNumber || ''),
            fee_mode: row.feeMode,
            enumerator_fee_rate: isPerHh && row.enumeratorFeeRate ? Number(row.enumeratorFeeRate) : null,
            enumerator_fee_basis: isPerHh ? (row.hhCompleted ? 'hh_completed' : 'hh_target') : null,
            activity_id: row.activityId || null,
            activity_name: row.activityName || null,
            activity_type: row.activityType || null,
            hh_target: row.hhTarget ? Number(row.hhTarget) : null,
            hh_completed: row.hhCompleted ? Number(row.hhCompleted) : null,
            beneficiaries: row.beneficiaries ? Number(row.beneficiaries) : null,
            pdm_questionnaires: row.pdmQuestionnaires ? Number(row.pdmQuestionnaires) : null,
            male_count: row.maleCount ? Number(row.maleCount) : null,
            female_count: row.femaleCount ? Number(row.femaleCount) : null,
          },
        };
      });

      const { error } = await supabase.from('mmp_site_entries').insert(entries);
      if (error) throw error;

      // Sync the live count back to mmp_files.entries so the list card stays accurate
      const { count: liveCount } = await supabase
        .from('mmp_site_entries')
        .select('*', { count: 'exact', head: true })
        .eq('mmp_file_id', mmpFileId);
      if (liveCount !== null) {
        await supabase
          .from('mmp_files')
          .update({ entries: liveCount })
          .eq('id', mmpFileId);
      }

      const destLabel = destinationMmp
        ? `into ${destinationMmp.name} (${destinationMmp.site_count} sites)`
        : 'into a new project MMP';
      toast({
        title: `${validRows.length} site visit${validRows.length !== 1 ? 's' : ''} created`,
        description: `${destLabel} · ${assigned} pre-assigned · ${open} open for claim`,
      });
      setLastResult({ assigned, open });
      if (createMode === 'upload') { setUploadedRows([]); setUploadedFileName(''); }
      else setManualRows([]);
      setRefreshTrigger(t => t + 1);
      // Refresh MMP site counts
      if (selectedProjectId) {
        setLoadingMmps(true);
        try {
          const openMmps = await loadOpenProjectMmps(selectedProjectId);
          setProjectMmps(openMmps);
          setSelectedMmpId(current =>
            openMmps.some(mmp => mmp.id === current)
              ? current
              : (openMmps[0]?.id ?? CREATE_PROJECT_MMP_VALUE),
          );
        } catch (error) {
          console.error('Failed to refresh open MMPs for ad-hoc sites:', error);
        } finally {
          setLoadingMmps(false);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast({ title: 'Failed to create site visits', description: msg, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Edit / Recall ────────────────────────────────────────────────────────

  const openEdit = (entry: ExistingEntry) => {
    setEditEntry(entry);
    setEditForm({
      transport_fee: entry.transport_fee,
      enumerator_fee: entry.enumerator_fee,
      fee_mode: entry.fee_mode || 'flat',
      enumerator_fee_rate: entry.enumerator_fee_rate,
      preferred_assignee_id: entry.preferred_assignee_id,
      phone_number: entry.phone_number,
      visit_date: entry.visit_date,
      hh_target: entry.hh_target,
      hh_completed: entry.hh_completed,
      beneficiaries: entry.beneficiaries,
      pdm_questionnaires: entry.pdm_questionnaires,
      male_count: entry.male_count,
      female_count: entry.female_count,
      activity_name: entry.activity_name,
      activity_type: entry.activity_type,
    });
    setCollectorSearch(entry.assignedToName || '');
  };

  /** Recalculate enumerator_fee for per-HH entries using current HH Completed (or Target as fallback) */
  const recalcPerHhFee = () => {
    const rate = String(editForm.enumerator_fee_rate || '');
    const completed = String(editForm.hh_completed ?? '');
    const target = String(editForm.hh_target ?? '');
    const calc = calcPerHhFee(rate, completed, target);
    if (calc) {
      setEditForm(f => ({
        ...f,
        enumerator_fee: Number(calc),
        enumerator_fee_basis: completed ? 'hh_completed' : 'hh_target',
      } as any));
      toast({ title: 'Fee recalculated', description: `SDG ${calc} = ${rate} × ${completed || target} HH` });
    }
  };

  const saveEdit = async () => {
    if (!editEntry) return;
    setSaving(true);
    try {
      const { data: currentRow } = await supabase
        .from('mmp_site_entries')
        .select('additional_data')
        .eq('id', editEntry.id)
        .single();

      const nextAdditionalData = {
        ...((currentRow as any)?.additional_data || {}),
        source: 'adhoc',
        assigned_to: editForm.preferred_assignee_id || null,
        phone_number_raw: editForm.phone_number || null,
        phone_numbers: normalizePhoneNumbers(String(editForm.phone_number || '')),
        fee_mode: (editForm as any).fee_mode || 'flat',
        enumerator_fee_rate: (editForm as any).enumerator_fee_rate ?? null,
        enumerator_fee_basis: (editForm as any).enumerator_fee_basis ?? null,
        activity_name: editForm.activity_name || null,
        activity_type: editForm.activity_type || null,
        hh_target: editForm.hh_target ?? null,
        hh_completed: editForm.hh_completed ?? null,
        beneficiaries: editForm.beneficiaries ?? null,
        pdm_questionnaires: editForm.pdm_questionnaires ?? null,
        male_count: editForm.male_count ?? null,
        female_count: editForm.female_count ?? null,
      };

      const { error } = await supabase
        .from('mmp_site_entries')
        .update({
          transport_fee: editForm.transport_fee ?? null,
          enumerator_fee: editForm.enumerator_fee ?? null,
          visit_date: editForm.visit_date || null,
          main_activity: editForm.activity_name || null,
          activity_at_site: editForm.activity_type || editForm.activity_name || null,
          additional_data: nextAdditionalData,
        })
        .eq('id', editEntry.id);
      if (error) throw error;
      toast({ title: 'Updated successfully' });
      setEditEntry(null);
      setRefreshTrigger(t => t + 1);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Update failed';
      toast({ title: 'Update failed', description: msg, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const confirmRecall = async () => {
    if (!recallEntry) return;
    setRecalling(true);
    try {
      const { error } = await supabase
        .from('mmp_site_entries')
        .update({ status: 'recalled' })
        .eq('id', recallEntry.id);
      if (error) throw error;
      toast({ title: 'Site recalled', description: `"${recallEntry.site_name}" removed from enumerators' view.` });
      setRecallEntry(null);
      setRefreshTrigger(t => t + 1);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Recall failed';
      toast({ title: 'Recall failed', description: msg, variant: 'destructive' });
    } finally {
      setRecalling(false);
    }
  };

  // ── Helpers ──────────────────────────────────────────────────────────────

  const activeRows = createMode === 'upload' ? uploadedRows : manualRows;
  const validCount = activeRows.filter(r => !r._errors?.length).length;
  const hasSelectedOpenMmp = projectMmps.some(mmp => mmp.id === selectedMmpId);

  const activityLabel = (a: ProjectActivity) => {
    const typeLabel = a.custom_type_label || a.activity_type?.replace(/_/g, ' ').toUpperCase() || '';
    return typeLabel ? `[${typeLabel}] ${a.title}` : a.title;
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── CREATE SECTION ── */}
      {canManage && (
        <Card className="border border-gray-200 dark:border-gray-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <PlusCircle className="h-4 w-4 text-teal-500" />
              Create Ad-hoc Site Visits
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={createMode} onValueChange={(v) => setCreateMode(v as 'manual' | 'upload')}>
              <TabsList className="mb-4">
                <TabsTrigger value="manual"><PlusCircle className="h-3.5 w-3.5 mr-1.5" />Select Manually</TabsTrigger>
                <TabsTrigger value="upload"><Upload className="h-3.5 w-3.5 mr-1.5" />Upload File</TabsTrigger>
              </TabsList>

              {/* ── Project + MMP pickers ── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <div className="space-y-1">
                  <Label className="text-xs">Project *</Label>
                  <Select value={selectedProjectId} onValueChange={v => { setSelectedProjectId(v); setSelectedMmpId(''); }}>
                    <SelectTrigger className="h-8 text-xs" data-testid="select-adhoc-project">
                      <SelectValue placeholder="Select project" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {!selectedProjectId && (
                    <p className="text-[11px] text-red-600">Project selection is compulsory before creating ad-hoc sites.</p>
                  )}
                </div>

                {selectedProjectId && (
                  <div className="space-y-1">
                    <Label className="text-xs flex items-center gap-1">
                      <FolderOpen className="h-3 w-3 text-teal-500" />
                      Open MMP
                    </Label>
                    {loadingMmps ? (
                      <div className="h-8 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" /> Loading MMPs…
                      </div>
                    ) : projectMmps.length === 0 ? (
                      <div className="min-h-8 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
                        No open MMP exists for this project. A new project MMP will be created for these visits.
                      </div>
                    ) : (
                      <Select value={selectedMmpId} onValueChange={setSelectedMmpId}>
                        <SelectTrigger className="h-8 text-xs" data-testid="select-target-mmp">
                          <SelectValue placeholder="Select an open MMP" />
                        </SelectTrigger>
                        <SelectContent>
                          {projectMmps.map(m => (
                            <SelectItem key={m.id} value={m.id}>
                              <span className="font-medium">{m.name}</span>
                              <span className="ml-1.5 text-muted-foreground text-[10px]">
                                {m.month} · {m.site_count} sites
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {hasSelectedOpenMmp && (
                      <p className="text-[10px] text-teal-600 dark:text-teal-400">
                        ✓ Sites will be added to this MMP, included in its Cycle Close, and counted in its total
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* ── MANUAL ENTRY ── */}
              <TabsContent value="manual" className="mt-0 space-y-4">
                {/* Location + logistics */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {/* State */}
                  <div className="space-y-1">
                    <Label className="text-xs">State *</Label>
                    <Select value={formRow.state} onValueChange={v => setFormRow(r => ({ ...r, state: v, locality: '' }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select state" /></SelectTrigger>
                      <SelectContent>
                        {sudanStates.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Locality */}
                  <div className="space-y-1">
                    <Label className="text-xs">Locality</Label>
                    <Select value={formRow.locality} onValueChange={v => setFormRow(r => ({ ...r, locality: v }))} disabled={!formRow.state}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select locality" /></SelectTrigger>
                      <SelectContent>
                        {localities.map(l => <SelectItem key={l.id} value={l.name}>{l.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Site Name */}
                  <div className="space-y-1">
                    <Label className="text-xs">Site Name *</Label>
                    <Input className="h-8 text-xs" placeholder="e.g. Al Nour School" value={formRow.siteName}
                      onChange={e => setFormRow(r => ({ ...r, siteName: e.target.value }))} />
                  </div>
                  {/* Site Code */}
                  <div className="space-y-1">
                    <Label className="text-xs">Site Code</Label>
                    <Input className="h-8 text-xs" placeholder="Optional" value={formRow.siteCode}
                      onChange={e => setFormRow(r => ({ ...r, siteCode: e.target.value }))} />
                  </div>
                  {/* Phone */}
                  <div className="space-y-1">
                    <Label className="text-xs">Phone Number</Label>
                    <Input className="h-8 text-xs" placeholder="e.g. 0912345678" value={formRow.phoneNumber}
                      onChange={e => setFormRow(r => ({ ...r, phoneNumber: e.target.value }))} />
                  </div>
                  {/* Transport Fee */}
                  <div className="space-y-1">
                    <Label className="text-xs">Transport Fee (SDG)</Label>
                    <Input className="h-8 text-xs" type="number" min="0" placeholder="0" value={formRow.transportFee}
                      onChange={e => setFormRow(r => ({ ...r, transportFee: e.target.value }))} />
                  </div>
                  {/* Fee Mode toggle + conditional fee fields */}
                  <div className="space-y-1 col-span-2 sm:col-span-1">
                    <Label className="text-xs flex items-center gap-1.5">
                      Enumerator Fee
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[200px] text-xs">
                            <strong>Flat:</strong> fixed amount per site.<br />
                            <strong>Per HH:</strong> Rate × HH collected. Fee auto-calculates from HH Target (estimate) and updates when HH Completed is entered.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </Label>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[11px] ${formRow.feeMode === 'flat' ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>Flat</span>
                      <Switch
                        checked={formRow.feeMode === 'per_hh'}
                        onCheckedChange={checked => setFormRow(r => ({
                          ...r,
                          feeMode: checked ? 'per_hh' : 'flat',
                          enumeratorFee: checked ? calcPerHhFee(r.enumeratorFeeRate, r.hhCompleted, r.hhTarget) : r.enumeratorFee,
                        }))}
                      />
                      <span className={`text-[11px] flex items-center gap-0.5 ${formRow.feeMode === 'per_hh' ? 'text-teal-600 dark:text-teal-400 font-medium' : 'text-muted-foreground'}`}>
                        <Calculator className="h-3 w-3" /> Per HH
                      </span>
                    </div>
                    {formRow.feeMode === 'flat' ? (
                      <Input className="h-8 text-xs" type="number" min="0" placeholder="0"
                        value={formRow.enumeratorFee}
                        onChange={e => setFormRow(r => ({ ...r, enumeratorFee: e.target.value }))} />
                    ) : (
                      <div className="space-y-1">
                        <Input className="h-8 text-xs" type="number" min="0" placeholder="Rate per HH (SDG)"
                          value={formRow.enumeratorFeeRate}
                          onChange={e => setFormRow(r => {
                            const rate = e.target.value;
                            return { ...r, enumeratorFeeRate: rate, enumeratorFee: calcPerHhFee(rate, r.hhCompleted, r.hhTarget) };
                          })} />
                        {formRow.enumeratorFeeRate && (
                          <p className="text-[10px] text-teal-600 dark:text-teal-400">
                            ≈ SDG {formRow.enumeratorFee || '0'}
                            {' '}({formRow.enumeratorFeeRate} × {formRow.hhCompleted || formRow.hhTarget || '0'} HH
                            {!formRow.hhCompleted && formRow.hhTarget ? ' — estimate' : ''})
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Assign To */}
                  <div className="space-y-1 relative">
                    <Label className="text-xs">Assign To (optional)</Label>
                    <Input className="h-8 text-xs" placeholder="Search enumerator..."
                      value={collectorSearch}
                      onChange={e => { setCollectorSearch(e.target.value); setShowCollectorDropdown(true); setFormRow(r => ({ ...r, assignToId: '', assignToName: '' })); }}
                      onFocus={() => setShowCollectorDropdown(true)}
                      onBlur={() => setTimeout(() => setShowCollectorDropdown(false), 150)} />
                    {showCollectorDropdown && filteredCollectors.length > 0 && (
                      <div className="absolute z-50 top-full mt-1 w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg max-h-40 overflow-y-auto">
                        <div className="p-1 border-b border-gray-100 dark:border-gray-800">
                          <button className="w-full text-left text-xs px-2 py-1 text-muted-foreground hover:bg-gray-50 dark:hover:bg-gray-800 rounded"
                            onMouseDown={() => { setFormRow(r => ({ ...r, assignToId: '', assignToName: '' })); setCollectorSearch(''); setShowCollectorDropdown(false); }}>
                            Clear (open for claim)
                          </button>
                        </div>
                        {filteredCollectors.map(c => (
                          <button key={c.id}
                            className="w-full text-left text-xs px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800 flex flex-col"
                            onMouseDown={() => {
                              const name = c.full_name || c.username || c.email || '';
                              setFormRow(r => ({ ...r, assignToId: c.id, assignToName: name }));
                              setCollectorSearch(name);
                              setShowCollectorDropdown(false);
                            }}>
                            <span className="font-medium">{c.full_name || c.username}</span>
                            {c.email && <span className="text-muted-foreground">{c.email}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Due Date */}
                  <div className="space-y-1">
                    <Label className="text-xs">Due Date</Label>
                    <Input className="h-8 text-xs" type="date" value={formRow.dueDate}
                      onChange={e => setFormRow(r => ({ ...r, dueDate: e.target.value }))} />
                  </div>
                </div>

                {/* ── Activity & Monitoring section ── */}
                <div className="rounded-lg border border-dashed border-teal-200 dark:border-teal-800 bg-teal-50/40 dark:bg-teal-950/10 p-3 space-y-3">
                  <p className="text-xs font-semibold text-teal-700 dark:text-teal-400 flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5" />
                    Activity &amp; Monitoring Targets
                  </p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {/* Activity picker */}
                    <div className="space-y-1 sm:col-span-2">
                      <div className="flex items-center justify-between gap-2">
                        <Label className="text-xs">Activity *</Label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[10px] text-teal-700"
                          disabled={!selectedProjectId}
                          onClick={() => setShowAddActivity(true)}
                        >
                          <PlusCircle className="h-3 w-3 mr-1" />
                          Add Activity
                        </Button>
                      </div>
                      {loadingActivities ? (
                        <div className="h-8 flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading…</div>
                      ) : projectActivities.length > 0 ? (
                        <Select
                          value={formRow.activityId || '__freetext__'}
                          onValueChange={v => {
                            if (v === '__freetext__') {
                              setFormRow(r => ({ ...r, activityId: '', activityName: '', activityType: '' }));
                            } else {
                              const a = projectActivities.find(a => a.id === v);
                              setFormRow(r => ({ ...r, activityId: v, activityName: a?.title || '', activityType: a?.activity_type || '' }));
                            }
                          }}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select activity…" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__freetext__"><span className="text-muted-foreground italic">Type manually below…</span></SelectItem>
                            {projectActivities.map(a => (
                              <SelectItem key={a.id} value={a.id}>{activityLabel(a)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : !selectedProjectId ? (
                        <div className="h-8 flex items-center text-xs text-muted-foreground">Select a project first</div>
                      ) : (
                        <div className="min-h-8 flex items-center text-xs text-muted-foreground">
                          No activities found — add one above or type manually below
                        </div>
                      )}
                      {/* Free-text fallback */}
                      {(!formRow.activityId) && (
                        <Input className="h-8 text-xs mt-1" placeholder="Activity name (e.g. GFA, AIM, DM…)"
                          value={formRow.activityName}
                          onChange={e => setFormRow(r => ({ ...r, activityName: e.target.value }))} />
                      )}
                    </div>

                    {/* HH Target — also drives per-HH estimate */}
                    <div className="space-y-1">
                      <Label className="text-xs">HH Target</Label>
                      <Input className="h-8 text-xs" type="number" min="0" placeholder="0"
                        value={formRow.hhTarget}
                        onChange={e => setFormRow(r => {
                          const hhTarget = e.target.value;
                          const fee = r.feeMode === 'per_hh' ? calcPerHhFee(r.enumeratorFeeRate, r.hhCompleted, hhTarget) : r.enumeratorFee;
                          return { ...r, hhTarget, enumeratorFee: fee };
                        })} />
                    </div>
                    {/* HH Completed — overrides target for per-HH calculation */}
                    <div className="space-y-1">
                      <Label className="text-xs">HH Completed</Label>
                      <Input className="h-8 text-xs" type="number" min="0" placeholder="0 (after visit)"
                        value={formRow.hhCompleted}
                        onChange={e => setFormRow(r => {
                          const hhCompleted = e.target.value;
                          const fee = r.feeMode === 'per_hh' ? calcPerHhFee(r.enumeratorFeeRate, hhCompleted, r.hhTarget) : r.enumeratorFee;
                          return { ...r, hhCompleted, enumeratorFee: fee };
                        })} />
                    </div>
                    {/* Beneficiaries */}
                    <div className="space-y-1">
                      <Label className="text-xs">Total Beneficiaries</Label>
                      <Input className="h-8 text-xs" type="number" min="0" placeholder="0"
                        value={formRow.beneficiaries}
                        onChange={e => setFormRow(r => ({ ...r, beneficiaries: e.target.value }))} />
                    </div>
                    {/* PDM */}
                    <div className="space-y-1">
                      <Label className="text-xs">PDM Questionnaires</Label>
                      <Input className="h-8 text-xs" type="number" min="0" placeholder="0"
                        value={formRow.pdmQuestionnaires}
                        onChange={e => setFormRow(r => ({ ...r, pdmQuestionnaires: e.target.value }))} />
                    </div>
                    {/* Male */}
                    <div className="space-y-1">
                      <Label className="text-xs">Male</Label>
                      <Input className="h-8 text-xs" type="number" min="0" placeholder="0"
                        value={formRow.maleCount}
                        onChange={e => setFormRow(r => ({ ...r, maleCount: e.target.value }))} />
                    </div>
                    {/* Female */}
                    <div className="space-y-1">
                      <Label className="text-xs">Female</Label>
                      <Input className="h-8 text-xs" type="number" min="0" placeholder="0"
                        value={formRow.femaleCount}
                        onChange={e => setFormRow(r => ({ ...r, femaleCount: e.target.value }))} />
                    </div>
                  </div>
                </div>

                <Button size="sm" variant="outline" onClick={addManualRow} className="flex items-center gap-1.5">
                  <PlusCircle className="h-3.5 w-3.5" />
                  Add Site
                </Button>

                {/* Pending rows */}
                {manualRows.length > 0 && (
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <div className="bg-gray-50 dark:bg-gray-800/50 px-3 py-2 text-xs font-medium text-muted-foreground flex justify-between">
                      <span>{manualRows.length} row{manualRows.length !== 1 ? 's' : ''} ready</span>
                    </div>
                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                      {manualRows.map((row, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-3 px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-800/30">
                          <div className="flex-1 min-w-0 flex flex-wrap gap-x-2 gap-y-0.5">
                            <span className="font-medium">{row.siteName}</span>
                            <span className="text-muted-foreground">{row.state} › {row.locality}</span>
                            {row.siteCode && <span className="text-muted-foreground">({row.siteCode})</span>}
                            {row.activityName && <Badge variant="outline" className="text-[9px] h-4 px-1">{row.activityName}</Badge>}
                            {row.hhTarget && <span className="text-muted-foreground">HH: {row.hhTarget}</span>}
                            {row.assignToName && <span className="text-amber-600 dark:text-amber-400">→ {row.assignToName}</span>}
                          </div>
                          <button onClick={() => removeManualRow(idx)} className="text-red-500 hover:text-red-700 flex-shrink-0">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* ── UPLOAD FILE ── */}
              <TabsContent value="upload" className="mt-0 space-y-4">
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={downloadTemplate} className="flex items-center gap-1.5">
                    <Download className="h-3.5 w-3.5" />
                    Download Template
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5">
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    Browse File
                  </Button>
                  <input ref={fileInputRef} type="file" accept=".xlsx,.csv,.xls" className="hidden" onChange={handleFileChange} />
                </div>

                <div
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${isDragOver ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/20' : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600'}`}
                  onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleDrop}
                >
                  <Upload className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                  <p className="text-sm text-muted-foreground">
                    {uploadedFileName ? `Loaded: ${uploadedFileName}` : 'Drag & drop an .xlsx or .csv file here, or use "Browse File"'}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Template includes: Site Name, State, Locality, Activity, HH Target, HH Completed, Beneficiaries, PDM, Male, Female
                  </p>
                </div>

                {uploadedRows.length > 0 && (
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <div className="bg-gray-50 dark:bg-gray-800/50 px-3 py-2 text-xs font-medium text-muted-foreground flex justify-between">
                      <span>{uploadedRows.length} rows parsed · {validCount} valid</span>
                      <span className="text-red-500">{uploadedRows.length - validCount} error{uploadedRows.length - validCount !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="overflow-x-auto max-h-60">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 dark:bg-gray-800/30">
                          <tr>
                            {['Site Name', 'Code', 'State', 'Locality', 'Activity', 'HH Target', 'Phone', 'Assign To', 'Due Date', ''].map(h => (
                              <th key={h} className="px-2 py-1.5 text-left text-muted-foreground font-medium whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                          {uploadedRows.map((row, idx) => (
                            <tr key={idx} className={row._errors?.length ? 'bg-red-50 dark:bg-red-950/20' : ''}>
                              <td className="px-2 py-1.5"><span className={row._errors?.includes('Site Name required') ? 'text-red-500' : ''}>{row.siteName || <span className="text-red-400 italic">required</span>}</span></td>
                              <td className="px-2 py-1.5 text-muted-foreground">{row.siteCode}</td>
                              <td className="px-2 py-1.5"><span className={row._errors?.includes('State required') ? 'text-red-500' : ''}>{row.state || <span className="text-red-400 italic">required</span>}</span></td>
                              <td className="px-2 py-1.5 text-muted-foreground">{row.locality || '—'}</td>
                              <td className="px-2 py-1.5 text-muted-foreground">
                                <span className={row._errors?.includes('Activity required') ? 'text-red-500' : ''}>
                                  {row.activityName || <span className="text-red-400 italic">required</span>}
                                </span>
                              </td>
                              <td className="px-2 py-1.5 text-muted-foreground">{row.hhTarget || '—'}</td>
                              <td className="px-2 py-1.5 text-muted-foreground">{row.phoneNumber || '—'}</td>
                              <td className="px-2 py-1.5 text-muted-foreground">{row.assignToName || '—'}</td>
                              <td className="px-2 py-1.5 text-muted-foreground">{row.dueDate || '—'}</td>
                              <td className="px-2 py-1.5">
                                <button onClick={() => removeUploadRow(idx)} className="text-red-500 hover:text-red-700">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>

            {/* ── Submit (shared) ── */}
            {activeRows.length > 0 && (
              <div className="flex items-center gap-3 pt-4 border-t border-gray-100 dark:border-gray-800 mt-4">
                <div className="flex-1 text-xs text-muted-foreground">
                  {loadingMmps
                    ? <span>→ Checking open MMPs for this project…</span>
                    : hasSelectedOpenMmp
                    ? <span className="text-teal-600 dark:text-teal-400 font-medium">→ Will be added to: {selectedMmpLabel}</span>
                    : <span>→ A new project MMP will be created because no open MMP is available</span>
                  }
                </div>
                {lastResult && (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Last batch: {lastResult.assigned} pre-assigned · {lastResult.open} open
                  </div>
                )}
                <Button
                  onClick={() => submitRows(activeRows)}
                  disabled={submitting || loadingMmps || validCount === 0 || !selectedProjectId || (projectMmps.length > 0 && !hasSelectedOpenMmp)}
                  className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white"
                >
                  {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Create {validCount} Site Visit{validCount !== 1 ? 's' : ''}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── EXISTING ENTRIES ── */}
      <Card className="border border-gray-200 dark:border-gray-800">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-teal-500" />
              Ad-hoc Site Visits
              <Badge variant="outline" className="text-xs">{filteredExisting.length}</Badge>
            </CardTitle>
            <button onClick={() => setRefreshTrigger(t => t + 1)} className="text-muted-foreground hover:text-foreground transition-colors">
              <RefreshCw className={`h-4 w-4 ${loadingExisting ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="flex gap-1.5 flex-wrap pt-2">
            {FILTER_STATUSES.map(s => (
              <button key={s}
                onClick={() => setStatusFilter(s)}
                className={`text-xs px-2.5 py-1 rounded-full border capitalize transition-colors ${statusFilter === s ? 'bg-teal-600 text-white border-teal-600' : 'border-gray-300 dark:border-gray-600 text-muted-foreground hover:border-gray-400'}`}>
                {s === 'all' ? `All (${existingEntries.length})` : s}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {loadingExisting ? (
            <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading…</span>
            </div>
          ) : filteredExisting.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No ad-hoc site visits found.</p>
              {canManage && <p className="text-xs mt-1">Use the form above to create some.</p>}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    {['Site Name', 'MMP', 'Activity', 'State', 'Status', 'HH Target', 'HH Done', 'Enum. Fee', 'Beneficiaries', 'M / F', 'Assigned To', 'Visit Date', ''].map(h => (
                      <th key={h} className="px-2 py-2 text-left text-muted-foreground font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {filteredExisting.map(entry => {
                    const editable = canEdit(entry) && canManage;
                    const recallable = canEdit(entry) && canManage;
                    const statusKey = (entry.status || '').toLowerCase();
                    return (
                      <tr key={entry.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                        <td className="px-2 py-2 font-medium max-w-[140px] truncate" title={entry.site_name}>{entry.site_name}</td>
                        <td className="px-2 py-2 text-muted-foreground max-w-[120px] truncate text-[10px]" title={entry.mmp_name}>{entry.mmp_name || '—'}</td>
                        <td className="px-2 py-2">
                          {entry.activity_name
                            ? <Badge variant="outline" className="text-[9px] h-4 px-1 whitespace-nowrap">{entry.activity_name}</Badge>
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-2 py-2 text-muted-foreground">{entry.state || '—'}</td>
                        <td className="px-2 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${STATUS_COLORS[statusKey] || 'bg-gray-100 text-gray-600'}`}>
                            {entry.status}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-muted-foreground text-right">{entry.hh_target ?? '—'}</td>
                        <td className="px-2 py-2 text-muted-foreground text-right">{entry.hh_completed ?? '—'}</td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          {entry.enumerator_fee != null ? (
                            <span className="flex items-center gap-1">
                              <span className="text-muted-foreground">{entry.enumerator_fee.toLocaleString()}</span>
                              {entry.fee_mode === 'per_hh' && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="inline-flex items-center gap-0.5 text-[9px] bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 px-1 py-0.5 rounded cursor-help">
                                        <Calculator className="h-2.5 w-2.5" />×HH
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-xs">
                                      Per-HH · Rate: {entry.enumerator_fee_rate ?? '?'} SDG/HH
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-2 py-2 text-muted-foreground text-right">{entry.beneficiaries ?? '—'}</td>
                        <td className="px-2 py-2 text-muted-foreground whitespace-nowrap">
                          {(entry.male_count != null || entry.female_count != null)
                            ? `${entry.male_count ?? 0} / ${entry.female_count ?? 0}`
                            : '—'}
                        </td>
                        <td className="px-2 py-2 text-muted-foreground max-w-[110px] truncate">
                          {entry.assignedToName || <span className="text-blue-500 text-[10px]">Open</span>}
                        </td>
                        <td className="px-2 py-2 text-muted-foreground whitespace-nowrap">{entry.visit_date || '—'}</td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-1.5">
                            {editable && (
                              <button onClick={() => openEdit(entry)} className="text-blue-500 hover:text-blue-700 transition-colors" title="Edit">
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {recallable && (
                              <button onClick={() => setRecallEntry(entry)} className="text-red-500 hover:text-red-700 transition-colors" title="Recall">
                                <XCircle className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── COLUMN MAPPER DIALOG ── */}
      <Dialog open={showColumnMapper} onOpenChange={open => { if (!open) setShowColumnMapper(false); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-teal-500" />
              Map File Columns
            </DialogTitle>
            <DialogDescription className="text-xs">
              Some required columns couldn't be detected in <strong>{uploadedFileName}</strong>. Map each field to the correct column.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 overflow-y-auto flex-1 pr-1">
            {([
              { field: 'siteName' as keyof ColumnMap,         label: 'Site Name',          required: true },
              { field: 'state' as keyof ColumnMap,            label: 'State',               required: true },
              { field: 'locality' as keyof ColumnMap,         label: 'Locality',            required: false },
              { field: 'siteCode' as keyof ColumnMap,         label: 'Site Code',           required: false },
              { field: 'phoneNumber' as keyof ColumnMap,      label: 'Phone Number',        required: false },
              { field: 'transportFee' as keyof ColumnMap,      label: 'Transport Fee',         required: false },
              { field: 'feeMode' as keyof ColumnMap,          label: 'Fee Mode (flat/per_hh)',required: false },
              { field: 'enumeratorFee' as keyof ColumnMap,    label: 'Enumerator Fee (flat)', required: false },
              { field: 'enumeratorFeeRate' as keyof ColumnMap,label: 'Rate per HH (per_hh)',  required: false },
              { field: 'assignTo' as keyof ColumnMap,         label: 'Assign To',             required: false },
              { field: 'dueDate' as keyof ColumnMap,          label: 'Due Date',            required: false },
              { field: 'activity' as keyof ColumnMap,         label: 'Activity',            required: true },
              { field: 'hhTarget' as keyof ColumnMap,         label: 'HH Target',           required: false },
              { field: 'hhCompleted' as keyof ColumnMap,      label: 'HH Completed',        required: false },
              { field: 'beneficiaries' as keyof ColumnMap,    label: 'Beneficiaries',       required: false },
              { field: 'pdmQuestionnaires' as keyof ColumnMap,label: 'PDM Questionnaires',  required: false },
              { field: 'maleCount' as keyof ColumnMap,        label: 'Male Count',          required: false },
              { field: 'femaleCount' as keyof ColumnMap,      label: 'Female Count',        required: false },
            ]).map(({ field, label, required }) => (
              <div key={field} className="grid grid-cols-2 items-center gap-3">
                <Label className="text-xs text-right">
                  {label}{required && <span className="text-red-500 ml-0.5">*</span>}
                </Label>
                <Select
                  value={columnMap[field] || '__skip__'}
                  onValueChange={v => setColumnMap(m => ({ ...m, [field]: v === '__skip__' ? '' : v }))}
                >
                  <SelectTrigger className={`h-8 text-xs ${required && !columnMap[field] ? 'border-red-400' : ''}`}>
                    <SelectValue placeholder="(skip)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__skip__">(skip / not in file)</SelectItem>
                    {rawFileHeaders.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          {rawFileHeaders.length > 0 && (
            <div className="text-xs text-muted-foreground bg-gray-50 dark:bg-gray-800/50 rounded p-2 shrink-0">
              <strong>Detected columns:</strong> {rawFileHeaders.join(', ')}
            </div>
          )}
          <DialogFooter className="shrink-0">
            <Button variant="outline" size="sm" onClick={() => setShowColumnMapper(false)}>Cancel</Button>
            <Button size="sm" onClick={applyColumnMap} disabled={!columnMap.siteName || !columnMap.state || !columnMap.activity}
              className="bg-teal-600 hover:bg-teal-700 text-white">
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
              Apply Mapping
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── ADD PROJECT ACTIVITY ── */}
      <Dialog open={showAddActivity} onOpenChange={setShowAddActivity}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Project Activity</DialogTitle>
            <DialogDescription>
              Create an activity for the selected project, then use it when adding one or more MMP sites.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="adhoc-activity-name">Activity Name *</Label>
              <Input
                id="adhoc-activity-name"
                value={newActivityName}
                onChange={event => setNewActivityName(event.target.value)}
                placeholder="e.g. General Food Assistance"
                disabled={creatingActivity}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Activity Type</Label>
              <Select value={newActivityType} onValueChange={setNewActivityType} disabled={creatingActivity}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="field_assessment">Field Assessment</SelectItem>
                  <SelectItem value="monitoring">Monitoring</SelectItem>
                  <SelectItem value="distribution_monitoring">Distribution Monitoring</SelectItem>
                  <SelectItem value="post_distribution_monitoring">Post-Distribution Monitoring</SelectItem>
                  <SelectItem value="market_monitoring">Market Monitoring</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddActivity(false)} disabled={creatingActivity}>
              Cancel
            </Button>
            <Button onClick={createProjectActivity} disabled={creatingActivity || !newActivityName.trim() || !selectedProjectId}>
              {creatingActivity && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add and Select Activity
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── EDIT DIALOG ── */}
      <Dialog open={!!editEntry} onOpenChange={open => !open && setEditEntry(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>Edit Ad-hoc Visit</DialogTitle>
            <DialogDescription className="text-xs">
              {editEntry?.site_name} · {editEntry?.state} › {editEntry?.locality}
              {editEntry?.mmp_name && <span className="ml-1 text-teal-600">· {editEntry.mmp_name}</span>}
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 pr-1 space-y-4">
            {/* Logistics */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Transport Fee (SDG)</Label>
                <Input type="number" min="0" className="h-8 text-xs"
                  value={editForm.transport_fee ?? ''}
                  onChange={e => setEditForm(f => ({ ...f, transport_fee: e.target.value ? Number(e.target.value) : undefined }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1.5">
                  Enumerator Fee
                  <span className="flex items-center gap-1 ml-auto">
                    <span className={`text-[10px] ${(editForm as any).fee_mode !== 'per_hh' ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>Flat</span>
                    <Switch
                      checked={(editForm as any).fee_mode === 'per_hh'}
                      onCheckedChange={checked => setEditForm(f => ({ ...f, fee_mode: checked ? 'per_hh' : 'flat' } as any))}
                    />
                    <span className={`text-[10px] flex items-center gap-0.5 ${(editForm as any).fee_mode === 'per_hh' ? 'font-semibold text-teal-600 dark:text-teal-400' : 'text-muted-foreground'}`}>
                      <Calculator className="h-3 w-3" />Per HH
                    </span>
                  </span>
                </Label>
                {(editForm as any).fee_mode === 'per_hh' ? (
                  <div className="space-y-1">
                    <Input type="number" min="0" className="h-8 text-xs" placeholder="Rate per HH (SDG)"
                      value={(editForm as any).enumerator_fee_rate ?? ''}
                      onChange={e => setEditForm(f => ({ ...f, enumerator_fee_rate: e.target.value ? Number(e.target.value) : undefined } as any))} />
                    <div className="flex items-center gap-1.5">
                      <Input type="number" min="0" className="h-8 text-xs flex-1" placeholder="Calculated total"
                        value={editForm.enumerator_fee ?? ''}
                        onChange={e => setEditForm(f => ({ ...f, enumerator_fee: e.target.value ? Number(e.target.value) : undefined }))} />
                      <Button type="button" size="sm" variant="outline" className="h-8 text-xs shrink-0 gap-1 text-teal-600 border-teal-300"
                        onClick={recalcPerHhFee}>
                        <Calculator className="h-3 w-3" /> Recalc
                      </Button>
                    </div>
                    {(editForm as any).enumerator_fee_rate && (
                      <p className="text-[10px] text-amber-600 dark:text-amber-400">
                        {editForm.hh_completed
                          ? `Using actual HH Completed (${editForm.hh_completed})`
                          : `Using HH Target (${editForm.hh_target ?? '?'}) — estimate`}
                        . Click Recalc after updating HH.
                      </p>
                    )}
                  </div>
                ) : (
                  <Input type="number" min="0" className="h-8 text-xs"
                    value={editForm.enumerator_fee ?? ''}
                    onChange={e => setEditForm(f => ({ ...f, enumerator_fee: e.target.value ? Number(e.target.value) : undefined }))} />
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Phone Number</Label>
                <Input className="h-8 text-xs"
                  value={editForm.phone_number || ''}
                  onChange={e => setEditForm(f => ({ ...f, phone_number: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Due Date</Label>
                <Input type="date" className="h-8 text-xs"
                  value={editForm.visit_date || ''}
                  onChange={e => setEditForm(f => ({ ...f, visit_date: e.target.value }))} />
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Assign To</Label>
                <Select value={editForm.preferred_assignee_id || '__open__'}
                  onValueChange={v => setEditForm(f => ({ ...f, preferred_assignee_id: v === '__open__' ? undefined : v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Open for claim" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__open__">Open for claim</SelectItem>
                    {collectors.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.full_name || c.username || c.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Activity & Monitoring */}
            <div className="rounded-lg border border-dashed border-teal-200 dark:border-teal-800 bg-teal-50/40 dark:bg-teal-950/10 p-3 space-y-3">
              <p className="text-xs font-semibold text-teal-700 dark:text-teal-400 flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5" />
                Activity &amp; Monitoring
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1 col-span-2">
                  <Label className="text-xs">Activity Name</Label>
                  <Input className="h-8 text-xs" placeholder="e.g. GFA, AIM, DM…"
                    value={editForm.activity_name || ''}
                    onChange={e => setEditForm(f => ({ ...f, activity_name: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">HH Target</Label>
                  <Input type="number" min="0" className="h-8 text-xs"
                    value={editForm.hh_target ?? ''}
                    onChange={e => setEditForm(f => ({ ...f, hh_target: e.target.value ? Number(e.target.value) : undefined }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">HH Completed</Label>
                  <Input type="number" min="0" className="h-8 text-xs"
                    value={editForm.hh_completed ?? ''}
                    onChange={e => setEditForm(f => ({ ...f, hh_completed: e.target.value ? Number(e.target.value) : undefined }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Total Beneficiaries</Label>
                  <Input type="number" min="0" className="h-8 text-xs"
                    value={editForm.beneficiaries ?? ''}
                    onChange={e => setEditForm(f => ({ ...f, beneficiaries: e.target.value ? Number(e.target.value) : undefined }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">PDM Questionnaires</Label>
                  <Input type="number" min="0" className="h-8 text-xs"
                    value={editForm.pdm_questionnaires ?? ''}
                    onChange={e => setEditForm(f => ({ ...f, pdm_questionnaires: e.target.value ? Number(e.target.value) : undefined }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Male</Label>
                  <Input type="number" min="0" className="h-8 text-xs"
                    value={editForm.male_count ?? ''}
                    onChange={e => setEditForm(f => ({ ...f, male_count: e.target.value ? Number(e.target.value) : undefined }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Female</Label>
                  <Input type="number" min="0" className="h-8 text-xs"
                    value={editForm.female_count ?? ''}
                    onChange={e => setEditForm(f => ({ ...f, female_count: e.target.value ? Number(e.target.value) : undefined }))} />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => setEditEntry(null)} disabled={saving}>Cancel</Button>
            <Button onClick={saveEdit} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── RECALL CONFIRM ── */}
      <Dialog open={!!recallEntry} onOpenChange={open => !open && setRecallEntry(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Recall Site Visit?</DialogTitle>
            <DialogDescription>
              This will remove <strong>{recallEntry?.site_name}</strong> from the enumerators' available sites list immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecallEntry(null)} disabled={recalling}>Cancel</Button>
            <Button variant="destructive" onClick={confirmRecall} disabled={recalling}>
              {recalling ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <XCircle className="h-3.5 w-3.5 mr-1" />}
              Recall Site
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
