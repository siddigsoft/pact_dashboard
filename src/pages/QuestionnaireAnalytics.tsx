import { useState, useCallback, useMemo, Fragment, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Upload, FileSpreadsheet, BarChart3, Download, Search, Filter, X, ChevronDown, ChevronUp, Users, MapPin, Building2, Activity, Layers, FileDown, Save, FolderOpen, Trash2, Clock, Globe, PieChart, Lock, Sparkles, CheckCircle2, AlertCircle, ArrowRight, FileSearch, Mail, FileText, Send, ClipboardList, AlertTriangle, Plus, UserPlus, RotateCcw, Table2, Banknote } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useAuthorization } from '@/hooks/use-authorization';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, parse, isValid } from 'date-fns';
import { hubs, sudanStates } from '@/data/sudanStates';
import { drawPdfHeader, styledAutoTable, addAllFooters, addPageHeader, loadArabicFont, arText, C } from '@/utils/analyticsPdfUtils';
import { exportFormattedExcel, exportFormattedTrackerExcel, exportCoverageTrackerExcel, buildCoverageTrackerWorkbook, exportEnumeratorTrackerExcel, exportEnumeratorTrackerFormattedExcel } from '@/utils/analyticsExcelUtils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart as RechartsPie, Pie, Cell, Legend } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { EmailNotificationService } from '@/services/email-notification.service';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

interface QuestionnaireRow {
  hub: string;
  state: string;
  locality: string;
  activitySite: string;
  activity: string;
  subActivity: string;
  monitoringType: string;
  dataCollector: string;
  deviceId: string;
  supervisor: string;
  date: string;
  siteId: string;
  partner: string;
}

interface SummaryWithSites {
  name: string;
  questionnaires: number;
  sites: number;
  collectors: number;
  percentage: number;
}

interface ActivityBreakdown {
  name: string;
  siteCount: number;
  questionnaireCount: number;
  percentage: number;
  siteList: { name: string; count: number; percentage: number }[];
  byHub: { name: string; count: number; sites: number }[];
  byState: { name: string; count: number; sites: number }[];
  byLocality: { name: string; count: number; sites: number }[];
  byCollector: { name: string; count: number; deviceId: string }[];
}

interface CollectorDetail {
  name: string;
  deviceId: string;
  profileId: string;
  count: number;
  percentage: number;
  activities: { name: string; count: number }[];
  localities: { name: string; count: number }[];
  sites: { name: string; count: number; locality: string; state: string }[];
  hubs: string[];
  states: string[];
  nameVariants: { name: string; count: number }[];
}

interface EnumTrackerEntry {
  collectorId: string;
  collectorName: string;
  hub: string;
  state: string;
  covered: number;
  submitted: number;
  wfpConfirmed: number;
  pending: number;
  rejected: number;
  total: number;
  sites: { siteName: string; locality: string; hub: string; state: string; status: string; date: string; activity: string; mmpFileId: string; mmpName: string }[];
}
interface EnumStateGroup {
  state: string;
  totalSites: number;
  totalCovered: number;
  collectors: EnumTrackerEntry[];
}
interface EnumHubGroup {
  hub: string;
  totalSites: number;
  totalCovered: number;
  states: EnumStateGroup[];
}

interface SavedSession {
  id: string;
  name: string;
  fileName: string;
  savedAt: string;
  rowCount: number;
  data: QuestionnaireRow[];
}

const CHART_COLORS = ['#2563eb', '#16a34a', '#ea580c', '#9333ea', '#0891b2', '#dc2626', '#ca8a04', '#4f46e5', '#0d9488', '#e11d48', '#7c3aed', '#059669'];

const STORAGE_KEY = 'pact_questionnaire_sessions';

const DEFAULT_COLUMN_MAP = {
  hub: 16,
  state: 17,
  locality: 18,
  activitySite: 19,
  activity: 24,
  subActivity: 25,
  monitoringType: 26,
  dataCollector: 11,
  deviceId: 8,
  supervisor: 12,
  date: 10,
  siteId: 21,
  partner: 22,
};

// Keyword lists for every mapped field — ordered most-specific first so exact
// matches win over partial ones.  The parser scans the header row and picks
// the first column whose lowercased header contains any keyword.
// Keywords are ordered most-specific → least-specific (first match wins for
// the column search within each keyword's own pass).
const HEADER_KEYWORDS: Record<string, string[]> = {
  hub:           ['wfp hub', 'hub name', 'hub_name', 'hub', 'sub office', 'sub_office', 'office'],
  state:         ['state name', 'state_name', 'state', 'governorate', 'ولاية', 'region'],
  locality:      ['locality name', 'locality_name', 'locality', 'محلية', 'district', 'sub-district'],
  // 'sitename' / 'fullsitename' must come BEFORE 'activity site' so Feb-format
  // SECTION_1/sitename columns win over the UUID-valued "select activity site" column.
  activitySite:  ['sitename', 'fullsitename', 'site name', 'site_name', 'activity site', 'activity_site', 'site', 'village', 'قرية', 'camp', 'location'],
  // More-specific phrases first so Jan "confirm the activity" / Feb "activity implemented"
  // are matched before the generic 'activity' keyword (which would also match activitySite headers).
  activity:      ['confirm the activity', 'activity implemented', 'what is the activity', 'activity type', 'activity_type', 'نشاط', 'activity'],
  // Jan template: "specific activity you are monitoring"; Feb: "specific sub-activity"
  subActivity:   ['sub activity', 'sub_activity', 'subactivity', 'sub-activity', 'specific sub', 'specific activity', 'you are monitoring'],
  monitoringType: ['what kind of process monitoring', 'process monitoring', 'monitoring type', 'kind of monitoring', 'type of monitoring', 'نوع المراقبة'],
  // Both templates use "Name of interviewer" — add before generic fallbacks.
  dataCollector: ['data collector', 'datacollector', 'enumerator', 'collector name', 'اسم الجامع', 'data_collector', 'name of interviewer', 'interviewer'],
  deviceId:      ['deviceid', 'device_id', 'device id', 'معرف الجهاز', 'device identifier', 'imei'],
  supervisor:    ['field supervisor', 'supervisor name', 'supervisor', 'superviser', 'فيلد سوبرفايزر'],
  date:          ['submission date', 'submitdate', 'submit_date', 'date_time', 'today', 'date', 'start'],
  siteId:        ['site id', 'site_id', 'siteid', '_uuid', 'uuid'],
  partner:       ['implementing partner', 'partner name', 'partner_name', 'ip name', 'ip_name', 'partner'],
};

// ── Known hub-name set ────────────────────────────────────────────────────────
// Used to validate whether a cell value is actually a hub name.  When the file
// has no hub column the parser may default to col 0 (start timestamp) which is
// non-empty and would block the STATE_TO_HUB_NAME fallback without this check.
const KNOWN_HUBS_LC: Set<string> = new Set(hubs.map(h => h.name.toLowerCase()));

// ── State-name → Hub-name lookup ─────────────────────────────────────────────
// Built dynamically from the authoritative hubs/sudanStates data so it never
// drifts out of sync.  Used to auto-fill the hub column when the uploaded file
// doesn't include hub names (new clean-data format).
const STATE_TO_HUB_NAME: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const hub of hubs) {
    for (const stateId of hub.states) {
      const st = sudanStates.find(s => s.id === stateId);
      if (!st) continue;
      // state ID  (e.g. "kassala")
      m.set(stateId.toLowerCase(), hub.name);
      // English name  (e.g. "Kassala")
      m.set(st.name.toLowerCase(), hub.name);
      // Hyphen → space variant  (e.g. "blue-nile" → "blue nile")
      m.set(st.name.toLowerCase().replace(/-/g, ' '), hub.name);
      m.set(stateId.toLowerCase().replace(/-/g, ' '), hub.name);
      // Arabic name
      if (st.nameAr) m.set(st.nameAr.trim(), hub.name);
    }
  }
  return m;
})();

import { isPdmActivity } from '@/utils/pdmMdmUtils';

const DATE_FORMATS = ['yyyy-MM-dd', 'MM/dd/yyyy', 'dd/MM/yyyy', 'yyyy/MM/dd', 'M/d/yyyy', 'd/M/yyyy'];

function computeSummaryFromData(rows: QuestionnaireRow[], allRows: QuestionnaireRow[], fName: string, cleanRes: any) {
  const dates: Date[] = [];
  rows.forEach(r => {
    if (!r.date) return;
    for (const fmt of DATE_FORMATS) {
      const d = parse(r.date, fmt, new Date());
      if (isValid(d)) { dates.push(d); break; }
    }
  });
  let monthCoverage = 'N/A';
  if (dates.length > 0) {
    dates.sort((a, b) => a.getTime() - b.getTime());
    const first = format(dates[0], 'MMMM yyyy');
    const last = format(dates[dates.length - 1], 'MMMM yyyy');
    monthCoverage = first === last ? first : `${first} - ${last}`;
  }

  const supervisorMap = new Map<string, { collectors: { name: string; deviceId: string; count: number }[]; totalQ: number }>();
  const collectorBySup = new Map<string, Map<string, { deviceId: string; count: number }>>();
  rows.forEach(r => {
    const sup = r.supervisor || '(Unassigned)';
    if (!collectorBySup.has(sup)) collectorBySup.set(sup, new Map());
    const cm = collectorBySup.get(sup)!;
    const dc = r.dataCollector || '(Unknown)';
    if (!cm.has(dc)) cm.set(dc, { deviceId: r.deviceId || '', count: 0 });
    cm.get(dc)!.count++;
  });
  collectorBySup.forEach((dcMap, sup) => {
    const collectors = [...dcMap.entries()].map(([name, d]) => ({ name, deviceId: d.deviceId, count: d.count })).sort((a, b) => b.count - a.count);
    supervisorMap.set(sup, { collectors, totalQ: collectors.reduce((s, c) => s + c.count, 0) });
  });
  const teamOverview = [...supervisorMap.entries()].map(([supervisor, d]) => ({
    supervisor, collectors: d.collectors, teamSize: d.collectors.length, totalQ: d.totalQ,
  })).sort((a, b) => b.totalQ - a.totalQ);

  const uniqueSites = new Set(rows.map(r => r.activitySite).filter(Boolean)).size;
  const uniqueHubsSet = new Set(rows.map(r => r.hub).filter(Boolean));
  const uniqueStatesSet = new Set(rows.map(r => r.state).filter(Boolean));
  const uniqueLocalitiesSet = new Set(rows.map(r => r.locality).filter(Boolean));

  const hubBreakdown = Array.from(uniqueHubsSet).map(hub => {
    const hubRows = rows.filter(r => r.hub === hub);
    return { hub, sites: new Set(hubRows.map(r => r.activitySite).filter(Boolean)).size, questionnaires: hubRows.length };
  });

  const activityBreakdown = Array.from(new Set(rows.map(r => r.activity).filter(Boolean))).map(act => {
    return { activity: act, count: rows.filter(r => r.activity === act).length };
  });

  let qualityReport = null;
  if (cleanRes) {
    const qScore = cleanRes.originalCount > 0 ? ((cleanRes.cleanedCount / cleanRes.originalCount) * 100).toFixed(1) : '100.0';
    qualityReport = {
      originalRows: cleanRes.originalCount, cleanRows: cleanRes.cleanedCount,
      duplicatesRemoved: cleanRes.duplicatesRemoved, emptyRowsRemoved: cleanRes.emptyRowsRemoved,
      trimmedFields: cleanRes.trimmedDetails?.length || cleanRes.trimmedFields || 0,
      namesStandardized: cleanRes.nameChanges?.length || cleanRes.namesStandardized || 0,
      qualityScore: qScore,
      duplicateGroups: cleanRes.duplicateGroups || [],
      nameChanges: cleanRes.nameChanges || [],
    };
  }

  return {
    monthCoverage,
    generatedDate: format(new Date(), 'MMMM d, yyyy h:mm a'),
    fileName: fName,
    teamOverview,
    totalQuestionnaires: rows.length,
    originalRows: allRows.length,
    uniqueSites,
    uniqueHubs: uniqueHubsSet.size,
    uniqueStates: uniqueStatesSet.size,
    uniqueLocalities: uniqueLocalitiesSet.size,
    hubBreakdown,
    activityBreakdown,
    qualityReport,
    totalCollectors: new Set(rows.map(r => r.dataCollector).filter(Boolean)).size,
    totalSupervisors: supervisorMap.size,
  };
}

const AccessDenied = () => (
  <div className="flex items-center justify-center h-[60vh]">
    <Card className="max-w-md w-full">
      <CardContent className="pt-6 text-center">
        <Lock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold mb-2">Access Restricted</h2>
        <p className="text-sm text-muted-foreground">Only Super Admins can access the Questionnaire Analytics page.</p>
      </CardContent>
    </Card>
  </div>
);

const QuestionnaireAnalytics = () => {
  const { isSuperAdmin } = useAuthorization();
  const { toast } = useToast();
  const [data, setData] = useState<QuestionnaireRow[]>([]);
  const [originalData, setOriginalData] = useState<QuestionnaireRow[] | null>(null);
  const [cleanedData, setCleanedData] = useState<QuestionnaireRow[] | null>(null);
  const [isCleanedView, setIsCleanedView] = useState(false);
  const [fileName, setFileName] = useState<string>('');
  const [activeTab, setActiveTab] = useState('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterHubs, setFilterHubs] = useState<string[]>([]);
  const [filterStates, setFilterStates] = useState<string[]>([]);
  const [filterActivities, setFilterActivities] = useState<string[]>([]);
  const [filterLocalities, setFilterLocalities] = useState<string[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [currentSessionName, setCurrentSessionName] = useState('');
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [drillExpandedHubs, setDrillExpandedHubs] = useState<Set<string>>(new Set());
  const [drillExpandedStates, setDrillExpandedStates] = useState<Set<string>>(new Set());
  const [drillExpandedActivities, setDrillExpandedActivities] = useState<Set<string>>(new Set());
  const [drillExpandedLocalities, setDrillExpandedLocalities] = useState<Set<string>>(new Set());
  const [showCleanDialog, setShowCleanDialog] = useState(false);
  const [cleanExpandedSection, setCleanExpandedSection] = useState<string | null>(null);
  const [duplicateKeepMap, setDuplicateKeepMap] = useState<Map<number, Set<number>>>(new Map());
  const [cleanResults, setCleanResults] = useState<{
    originalCount: number;
    cleanedCount: number;
    duplicatesRemoved: number;
    emptyRowsRemoved: number;
    trimmedFields: number;
    namesStandardized: number;
    cleanedData: QuestionnaireRow[];
    duplicateGroups: { key: string; rows: { index: number; row: QuestionnaireRow; isKept: boolean }[] }[];
    emptyRows: { index: number; row: QuestionnaireRow }[];
    trimmedDetails: { index: number; field: string; before: string; after: string }[];
    nameChanges: { index: number; deviceId: string; oldName: string; newName: string }[];
  } | null>(null);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [emailToUsers, setEmailToUsers] = useState<{id?: string; name: string; email: string; role?: string; isSystemUser?: boolean}[]>([]);
  const [emailToInput, setEmailToInput] = useState('');
  const [emailToSearchOpen, setEmailToSearchOpen] = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailCcRoles, setEmailCcRoles] = useState<string[]>([]);
  const [emailCcUsers, setEmailCcUsers] = useState<{id?: string; name: string; email: string; role?: string; isSystemUser?: boolean}[]>([]);
  const [emailCcInput, setEmailCcInput] = useState('');
  const [emailCcSearchOpen, setEmailCcSearchOpen] = useState(false);
  const [emailAttachReview, setEmailAttachReview] = useState(true);
  const [emailAttachCleaned, setEmailAttachCleaned] = useState(true);
  const [emailSending, setEmailSending] = useState(false);
  const [emailUsers, setEmailUsers] = useState<{id: string; name: string; email: string; role: string}[]>([]);
  const [emailHighPriority, setEmailHighPriority] = useState(true);
  const [emailType, setEmailType] = useState<'report' | 'coverage' | 'analytics_excel' | 'analytics_pdf' | 'tracker_excel' | 'tracker_all'>('report');
  const [trackerAllFormat, setTrackerAllFormat] = useState<'excel' | 'csv'>('excel');
  const [emailProfilesLoading, setEmailProfilesLoading] = useState(false);
  const [reportIssuesExpanded, setReportIssuesExpanded] = useState(false);

  // ── Enumerator Tracker state ──────────────────────────────────
  const [enumTrackerRows, setEnumTrackerRows] = useState<EnumTrackerEntry[]>([]);
  const [enumHubGroups, setEnumHubGroups] = useState<EnumHubGroup[]>([]);
  const [enumTrackerLoading, setEnumTrackerLoading] = useState(false);
  const [enumHubFilter, setEnumHubFilter] = useState('all');
  const [enumStateFilter, setEnumStateFilter] = useState('all');
  const [enumStatusFilter, setEnumStatusFilter] = useState('all');
  const [enumSearch, setEnumSearch] = useState('');
  const [enumExpandedIds, setEnumExpandedIds] = useState<Set<string>>(new Set());
  const [enumTrackerFetched, setEnumTrackerFetched] = useState(false);
  const [bankAccountByName, setBankAccountByName] = useState<Map<string, string>>(new Map());
  const [csvAccountMap, setCsvAccountMap] = useState<Map<string, string>>(new Map());       // key → account number
  const [csvAccountNameMap, setCsvAccountNameMap] = useState<Map<string, string>>(new Map()); // key → account holder name
  const [enumMmpFilter, setEnumMmpFilter] = useState('all');
  const [csvEnumView, setCsvEnumView] = useState<'hierarchy' | 'table'>('hierarchy');
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentExportType, setPaymentExportType] = useState<'standard' | 'formatted' | 'csvEnum' | 'perHubExcel' | 'perHubFormatted'>('standard');
  const [paymentCostPerSite, setPaymentCostPerSite] = useState('');
  const [paymentExchangeRate, setPaymentExchangeRate] = useState('');
  const [paymentPendingRows, setPaymentPendingRows] = useState<any[]>([]);

  const enumMmpOptions = useMemo(() => {
    const map = new Map<string, string>();
    enumTrackerRows.forEach(r => r.sites.forEach(s => { if (s.mmpFileId) map.set(s.mmpFileId, s.mmpName); }));
    return [...map.entries()].sort(([, a], [, b]) => a.localeCompare(b));
  }, [enumTrackerRows]);

  const fetchEnumTrackerData = async () => {
    setEnumTrackerLoading(true);
    try {
      const { data: entries, error } = await supabase
        .from('mmp_site_entries')
        .select('id, site_name, hub_office, state, locality, status, accepted_by, visit_completed_at, submitted_at, main_activity, activity_at_site, mmp_file_id')
        .not('accepted_by', 'is', null);
      if (error) throw error;

      const collectorIds = [...new Set((entries || []).map((e: any) => e.accepted_by).filter(Boolean))];
      const profileMap = new Map<string, string>();
      if (collectorIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email, username, bank_account')
          .in('id', collectorIds);
        const bankMap = new Map<string, string>();
        (profiles || []).forEach((p: any) => {
          const name = p.full_name || p.username || p.email || p.id;
          profileMap.set(p.id, name);
          if (p.bank_account) {
            let rr: any = p.bank_account;
            if (typeof rr === 'string') { try { rr = JSON.parse(rr); } catch { rr = null; } }
            if (rr && typeof rr === 'object') {
              let a = String(rr.accountNumber ?? rr.account_number ?? rr.accountName ?? rr.account_name ?? '').trim();
              if (!a) { for (const v of Object.values(rr)) { if ((typeof v === 'string' || typeof v === 'number') && String(v).trim()) { a = String(v).trim(); break; } } }
              if (a) bankMap.set(name, a);
            }
          }
        });
        setBankAccountByName(bankMap);
      }
      const mmpFileIds = [...new Set((entries || []).map((e: any) => e.mmp_file_id).filter(Boolean))];
      const mmpNameMap = new Map<string, string>();
      if (mmpFileIds.length > 0) {
        const { data: mmpFiles } = await supabase.from('mmp_files').select('id, name').in('id', mmpFileIds);
        (mmpFiles || []).forEach((m: any) => { mmpNameMap.set(m.id, m.name || m.id); });
      }

      // Key = hub||state||collectorId so one collector can appear under multiple hubs/states
      const hubStateCollectorMap = new Map<string, EnumTrackerEntry>();
      (entries || []).forEach((entry: any) => {
        if (!entry.accepted_by) return;
        const name = profileMap.get(entry.accepted_by) || entry.accepted_by;
        const hub   = entry.hub_office || '—';
        const state = entry.state      || '—';
        const key   = `${hub}||${state}||${entry.accepted_by}`;
        if (!hubStateCollectorMap.has(key)) {
          hubStateCollectorMap.set(key, {
            collectorId: entry.accepted_by,
            collectorName: name,
            hub,
            state,
            covered: 0, submitted: 0, wfpConfirmed: 0, pending: 0, rejected: 0,
            total: 0,
            sites: [],
          });
        }
        const row = hubStateCollectorMap.get(key)!;
        row.total++;
        const st = (entry.status || '').toLowerCase();
        if (st === 'submitted')    { row.submitted++;    row.covered++; }
        else if (st === 'wfp_confirmed') { row.wfpConfirmed++; row.covered++; }
        else if (st === 'rejected')  row.rejected++;
        else                         row.pending++;
        const dateVal = entry.submitted_at || entry.visit_completed_at || '';
        row.sites.push({
          siteName: entry.site_name || '',
          locality: entry.locality  || '',
          hub,
          state,
          status: entry.status || '',
          date: dateVal ? format(new Date(dateVal), 'yyyy-MM-dd') : '',
          activity: entry.main_activity || entry.activity_at_site || '',
          mmpFileId: entry.mmp_file_id || '',
          mmpName: mmpNameMap.get(entry.mmp_file_id) || entry.mmp_file_id || '—',
        });
      });

      // Build Hub → State → Collectors hierarchy
      const hubMap = new Map<string, Map<string, EnumTrackerEntry[]>>();
      for (const entry of hubStateCollectorMap.values()) {
        if (!hubMap.has(entry.hub)) hubMap.set(entry.hub, new Map());
        const sm = hubMap.get(entry.hub)!;
        if (!sm.has(entry.state)) sm.set(entry.state, []);
        sm.get(entry.state)!.push(entry);
      }
      const hubGroups: EnumHubGroup[] = [...hubMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([hub, sm]) => {
          const states: EnumStateGroup[] = [...sm.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([state, collectors]) => ({
              state,
              totalSites:   collectors.reduce((s, c) => s + c.total,   0),
              totalCovered: collectors.reduce((s, c) => s + c.covered, 0),
              collectors: collectors.sort((a, b) => b.covered - a.covered),
            }));
          return {
            hub,
            totalSites:   states.reduce((s, sg) => s + sg.totalSites,   0),
            totalCovered: states.reduce((s, sg) => s + sg.totalCovered, 0),
            states,
          };
        });

      setEnumHubGroups(hubGroups);
      setEnumTrackerRows([...hubStateCollectorMap.values()].sort((a, b) => b.covered - a.covered));
      setEnumTrackerFetched(true);
    } catch (e: any) {
      toast({ title: 'Failed to load enumerator data', description: e.message, variant: 'destructive' });
    } finally {
      setEnumTrackerLoading(false);
    }
  };

  useEffect(() => {
    if ((activeTab === 'tracker' || activeTab === 'enum-tracker') && !enumTrackerFetched) {
      fetchEnumTrackerData();
    }
  }, [activeTab]);



  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const sessions: SavedSession[] = (Array.isArray(parsed) ? parsed : [])
          .filter((s: any) => s && s.id && s.name && Array.isArray(s.data))
          .map((s: any) => ({ ...s, data: s.data || [] }));
        setSavedSessions(sessions);
      }
    } catch {}
  }, []);

  const saveSession = useCallback(() => {
    if (!saveName.trim() || data.length === 0) return;
    const session: SavedSession = {
      id: Date.now().toString(),
      name: saveName.trim(),
      fileName,
      savedAt: new Date().toISOString(),
      rowCount: data.length,
      data,
    };
    const updated = [...savedSessions, session];
    setSavedSessions(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setCurrentSessionName(saveName.trim());
    setShowSaveDialog(false);
    setSaveName('');
  }, [saveName, data, fileName, savedSessions]);

  const loadSession = useCallback((session: SavedSession) => {
    setData(session.data);
    setFileName(session.fileName);
    setCurrentSessionName(session.name);
    setOriginalData(null);
    setCleanedData(null);
    setIsCleanedView(false);
    setFilterHubs([]);
    setFilterStates([]);
    setFilterActivities([]);
    setFilterLocalities([]);
    setSearchQuery('');
    setShowLoadDialog(false);
  }, []);

  const deleteSession = useCallback((id: string) => {
    const updated = savedSessions.filter(s => s.id !== id);
    setSavedSessions(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }, [savedSessions]);

  const cleanExcelData = useCallback(() => {
    if (data.length === 0) return;

    let trimmedFields = 0;
    let namesStandardized = 0;
    let emptyRowsRemoved = 0;
    let duplicatesRemoved = 0;
    const trimmedDetails: { index: number; field: string; before: string; after: string }[] = [];
    const emptyRows: { index: number; row: QuestionnaireRow }[] = [];
    const nameChanges: { index: number; deviceId: string; oldName: string; newName: string }[] = [];

    const trimmed = data.map((row, idx) => {
      const cleaned: QuestionnaireRow = { ...row };
      (Object.keys(cleaned) as (keyof QuestionnaireRow)[]).forEach(key => {
        const val = cleaned[key];
        if (typeof val === 'string') {
          const trimmedVal = val.replace(/\s+/g, ' ').trim();
          if (trimmedVal !== val) {
            trimmedDetails.push({ index: idx, field: key, before: val, after: trimmedVal });
            (cleaned as any)[key] = trimmedVal;
            trimmedFields++;
          }
        }
      });
      return cleaned;
    });

    const indexed = trimmed.map((row, idx) => ({ row, origIdx: idx }));

    const nonEmpty = indexed.filter(({ row, origIdx }) => {
      const hasContent = row.hub || row.state || row.locality || row.activitySite ||
        row.activity || row.dataCollector || row.date;
      if (!hasContent) {
        emptyRowsRemoved++;
        emptyRows.push({ index: origIdx, row: data[origIdx] });
      }
      return hasContent;
    });

    const safe = (v: string | undefined | null) => (v || '').trim();

    const deviceNameCounts = new Map<string, Map<string, number>>();
    nonEmpty.forEach(({ row }) => {
      const devId = safe(row.deviceId);
      if (!devId) return;
      if (!deviceNameCounts.has(devId)) deviceNameCounts.set(devId, new Map());
      const names = deviceNameCounts.get(devId)!;
      const name = safe(row.dataCollector);
      if (!name) return;
      names.set(name, (names.get(name) || 0) + 1);
    });
    const deviceNameMap = new Map<string, string>();
    deviceNameCounts.forEach((names, devId) => {
      if (names.size <= 1) {
        const firstName = names.keys().next().value;
        if (firstName) deviceNameMap.set(devId, firstName);
        return;
      }
      let maxCount = 0;
      let primaryName = '';
      names.forEach((count, name) => {
        if (count > maxCount) { maxCount = count; primaryName = name; }
      });
      deviceNameMap.set(devId, primaryName);
    });

    const standardized = nonEmpty.map(({ row, origIdx }) => {
      const devId = safe(row.deviceId);
      if (!devId) return { row, origIdx };
      const primary = deviceNameMap.get(devId);
      if (primary && safe(row.dataCollector) !== primary) {
        namesStandardized++;
        nameChanges.push({ index: origIdx, deviceId: devId, oldName: safe(row.dataCollector), newName: primary });
        return { row: { ...row, dataCollector: primary }, origIdx };
      }
      return { row, origIdx };
    });

    const keyGroups = new Map<string, { index: number; row: QuestionnaireRow }[]>();
    standardized.forEach(({ row, origIdx }) => {
      const actLower = safe(row.activity).toLowerCase();
      const isPDM = actLower === 'pdm' || actLower.includes('post distribution monitoring');
      if (isPDM) return;
      const key = [safe(row.deviceId), safe(row.dataCollector), safe(row.activitySite), safe(row.activity), safe(row.subActivity), safe(row.date), safe(row.hub), safe(row.state), safe(row.locality)].join('|||');
      if (!keyGroups.has(key)) keyGroups.set(key, []);
      keyGroups.get(key)!.push({ index: origIdx, row });
    });

    const duplicateGroups: { key: string; rows: { index: number; row: QuestionnaireRow; isKept: boolean }[] }[] = [];
    const deduped: QuestionnaireRow[] = [];
    const seen = new Set<string>();

    standardized.forEach(({ row }) => {
      const actLower2 = safe(row.activity).toLowerCase();
      const isPDM = actLower2 === 'pdm' || actLower2.includes('post distribution monitoring');
      if (isPDM) {
        deduped.push(row);
        return;
      }
      const key = [safe(row.deviceId), safe(row.dataCollector), safe(row.activitySite), safe(row.activity), safe(row.subActivity), safe(row.date), safe(row.hub), safe(row.state), safe(row.locality)].join('|||');
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(row);
        const group = keyGroups.get(key);
        if (group && group.length > 1) {
          duplicatesRemoved += group.length - 1;
          duplicateGroups.push({
            key,
            rows: group.map((g, gi) => ({ ...g, isKept: gi === 0 })),
          });
        }
      }
    });

    const defaultKeepMap = new Map<number, Set<number>>();
    duplicateGroups.forEach((group, gi) => {
      defaultKeepMap.set(gi, new Set([0]));
    });
    setDuplicateKeepMap(defaultKeepMap);
    setCleanExpandedSection(null);
    setCleanResults({
      originalCount: data.length,
      cleanedCount: deduped.length,
      duplicatesRemoved,
      emptyRowsRemoved,
      trimmedFields,
      namesStandardized,
      cleanedData: deduped,
      duplicateGroups,
      emptyRows,
      trimmedDetails,
      nameChanges,
    });
    setShowCleanDialog(true);
  }, [data]);

  const getCustomCleanedData = useCallback(() => {
    if (!cleanResults) return [];
    const safe = (v: string | undefined | null) => (v || '').trim();
    const result: QuestionnaireRow[] = [];
    const dupKeyToGroupIdx = new Map<string, number>();
    cleanResults.duplicateGroups.forEach((group, gi) => {
      dupKeyToGroupIdx.set(group.key, gi);
    });
    const processedDupKeys = new Set<string>();
    cleanResults.cleanedData.forEach(row => {
      const key = [safe(row.deviceId), safe(row.dataCollector), safe(row.activitySite), safe(row.activity), safe(row.subActivity), safe(row.date), safe(row.hub), safe(row.state), safe(row.locality)].join('|||');
      const groupIdx = dupKeyToGroupIdx.get(key);
      if (groupIdx !== undefined) {
        if (!processedDupKeys.has(key)) {
          processedDupKeys.add(key);
          const group = cleanResults.duplicateGroups[groupIdx];
          const kept = duplicateKeepMap.get(groupIdx) || new Set([0]);
          group.rows.forEach((r, ri) => {
            if (kept.has(ri)) result.push(r.row);
          });
        }
      } else {
        result.push(row);
      }
    });
    return result;
  }, [cleanResults, duplicateKeepMap]);

  const customDupsRemoved = useMemo(() => {
    if (!cleanResults) return 0;
    let removed = 0;
    cleanResults.duplicateGroups.forEach((group, gi) => {
      const kept = duplicateKeepMap.get(gi) || new Set([0]);
      removed += group.rows.length - kept.size;
    });
    return removed;
  }, [cleanResults, duplicateKeepMap]);

  const customCleanedCount = useMemo(() => {
    if (!cleanResults) return 0;
    return cleanResults.originalCount - cleanResults.emptyRowsRemoved - customDupsRemoved;
  }, [cleanResults, customDupsRemoved]);

  const applyCleanedData = useCallback(() => {
    if (!cleanResults) return;
    const finalData = getCustomCleanedData();

    const rawSnapshot = originalData || [...data];
    setOriginalData(rawSnapshot);
    setCleanedData(finalData);
    setData(finalData);
    setIsCleanedView(true);
    setShowCleanDialog(false);
    setFilterHubs([]);
    setFilterStates([]);
    setFilterActivities([]);
    setFilterLocalities([]);
    setSearchQuery('');

    try {
      const toRow = (r: QuestionnaireRow) => ({
        Hub: r.hub, State: r.state, Locality: r.locality,
        'Activity Site': r.activitySite, Activity: r.activity,
        'Sub Activity': r.subActivity, 'Data Collector': r.dataCollector,
        'Device ID': r.deviceId, Supervisor: r.supervisor,
        Date: r.date, 'Site ID': r.siteId, Partner: r.partner,
      });
      const colWidths = [{ wch: 18 }, { wch: 16 }, { wch: 18 }, { wch: 30 }, { wch: 16 }, { wch: 20 }, { wch: 25 }, { wch: 20 }, { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 20 }];
      const wb = XLSX.utils.book_new();

      const cleanedWs = XLSX.utils.json_to_sheet(finalData.map(toRow));
      cleanedWs['!cols'] = colWidths;
      XLSX.utils.book_append_sheet(wb, cleanedWs, 'Cleaned Data');

      const rawWs = XLSX.utils.json_to_sheet(rawSnapshot.map(toRow));
      rawWs['!cols'] = colWidths;
      XLSX.utils.book_append_sheet(wb, rawWs, 'Raw Data');

      const summaryRows = [
        { Metric: 'Original Rows', Value: cleanResults.originalCount },
        { Metric: 'Cleaned Rows', Value: finalData.length },
        { Metric: 'Duplicates Removed', Value: customDupsRemoved },
        { Metric: 'Empty Rows Removed', Value: cleanResults.emptyRowsRemoved },
        { Metric: 'Fields Trimmed', Value: cleanResults.trimmedFields },
        { Metric: 'Names Standardized', Value: cleanResults.namesStandardized },
        { Metric: 'Applied At', Value: format(new Date(), 'yyyy-MM-dd HH:mm:ss') },
      ];
      const summaryWs = XLSX.utils.json_to_sheet(summaryRows);
      summaryWs['!cols'] = [{ wch: 25 }, { wch: 30 }];
      XLSX.utils.book_append_sheet(wb, summaryWs, 'Cleaning Summary');

      const baseName = fileName ? fileName.replace(/\.[^/.]+$/, '') : 'questionnaire';
      XLSX.writeFile(wb, `${baseName}_cleaned_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);

      toast({ title: 'Cleaning applied', description: `${finalData.length} cleaned rows are now active. File saved with both cleaned and raw data.` });
    } catch (err) {
      console.error('Error saving combined file:', err);
      toast({ title: 'Cleaning applied', description: `${finalData.length} cleaned rows are now active.` });
    }
  }, [cleanResults, getCustomCleanedData, data, originalData, fileName, customDupsRemoved, toast]);

  const downloadCleanedExcel = useCallback(() => {
    if (!cleanResults) return;
    const finalData = getCustomCleanedData();
    const rows = finalData.map(r => ({
      Hub: r.hub,
      State: r.state,
      Locality: r.locality,
      'Activity Site': r.activitySite,
      Activity: r.activity,
      'Sub Activity': r.subActivity,
      'Data Collector': r.dataCollector,
      'Device ID': r.deviceId,
      Supervisor: r.supervisor,
      Date: r.date,
      'Site ID': r.siteId,
      Partner: r.partner,
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 18 }, { wch: 16 }, { wch: 18 }, { wch: 30 }, { wch: 16 }, { wch: 20 }, { wch: 25 }, { wch: 20 }, { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Cleaned Data');

    const reportSummary = computeSummaryFromData(finalData, data, fileName, cleanResults);
    const summaryRows: { Metric: string; Value: string | number }[] = [
      { Metric: 'REPORT INFORMATION', Value: '' },
      { Metric: 'Report Title', Value: 'Data Quality & Coverage Report' },
      { Metric: 'Generated Date', Value: format(new Date(), 'MMMM d, yyyy h:mm a') },
      { Metric: 'File Name', Value: fileName },
      { Metric: 'Month Coverage', Value: reportSummary?.monthCoverage || 'N/A' },
      { Metric: '', Value: '' },
      { Metric: 'CLEANING METRICS', Value: '' },
      { Metric: 'Original Rows', Value: cleanResults.originalCount },
      { Metric: 'Cleaned Rows', Value: finalData.length },
      { Metric: 'Duplicates Removed', Value: customDupsRemoved },
      { Metric: 'Empty Rows Removed', Value: cleanResults.emptyRowsRemoved },
      { Metric: 'Fields Trimmed', Value: cleanResults.trimmedFields },
      { Metric: 'Names Standardized', Value: cleanResults.namesStandardized },
      { Metric: 'Data Quality Score', Value: cleanResults.originalCount > 0 ? ((finalData.length / cleanResults.originalCount) * 100).toFixed(1) + '%' : '100%' },
      { Metric: '', Value: '' },
      { Metric: 'COVERAGE TOTALS', Value: '' },
      { Metric: 'Total Questionnaires', Value: reportSummary?.totalQuestionnaires || finalData.length },
      { Metric: 'Unique Sites', Value: reportSummary?.uniqueSites || 0 },
      { Metric: 'Hubs', Value: reportSummary?.uniqueHubs || 0 },
      { Metric: 'States', Value: reportSummary?.uniqueStates || 0 },
      { Metric: 'Localities', Value: reportSummary?.uniqueLocalities || 0 },
      { Metric: 'Data Collectors', Value: reportSummary?.totalCollectors || 0 },
      { Metric: 'Supervisors', Value: reportSummary?.totalSupervisors || 0 },
    ];
    if (reportSummary) {
      summaryRows.push({ Metric: '', Value: '' });
      summaryRows.push({ Metric: 'TEAM ROSTER', Value: '' });
      reportSummary.teamOverview.forEach(team => {
        summaryRows.push({ Metric: `Supervisor: ${team.supervisor}`, Value: `${team.teamSize} DCs, ${team.totalQ} Q` });
        team.collectors.forEach(dc => {
          summaryRows.push({ Metric: `  ${dc.name}`, Value: `Device: ${dc.deviceId} | ${dc.count} Q` });
        });
      });
      summaryRows.push({ Metric: '', Value: '' });
      summaryRows.push({ Metric: 'HUB COVERAGE', Value: '' });
      reportSummary.hubBreakdown.forEach(h => {
        summaryRows.push({ Metric: h.hub, Value: `${h.questionnaires} Q, ${h.sites} sites` });
      });
    }
    const summaryWs = XLSX.utils.json_to_sheet(summaryRows);
    summaryWs['!cols'] = [{ wch: 35 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Cleaning Summary');

    const baseName = fileName.replace(/\.[^.]+$/, '') || 'questionnaire_data';
    XLSX.writeFile(wb, `${baseName}_cleaned.xlsx`);
  }, [cleanResults, fileName, getCustomCleanedData, customDupsRemoved, data]);

  const downloadReviewExcel = useCallback(async () => {
    if (!cleanResults) return;
    const ExcelJS = (await import('exceljs')).default;
    const safe = (v: string | undefined | null) => (v || '').trim();

    const dupRowIndices = new Set<number>();
    const dupGroupMap = new Map<number, number>();
    cleanResults.duplicateGroups.forEach((group, gi) => {
      group.rows.forEach(r => {
        dupRowIndices.add(r.index);
        dupGroupMap.set(r.index, gi + 1);
      });
    });
    const emptyRowIndices = new Set(cleanResults.emptyRows.map(r => r.index));
    const trimMap = new Map<string, { before: string; after: string }>();
    cleanResults.trimmedDetails.forEach(td => {
      trimMap.set(`${td.index}|${td.field}`, { before: td.before, after: td.after });
    });
    const nameMap = new Map<number, { oldName: string; newName: string }>();
    cleanResults.nameChanges.forEach(nc => {
      nameMap.set(nc.index, { oldName: nc.oldName, newName: nc.newName });
    });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Data Review');

    const headers = ['Row #', 'Issue', 'Hub', 'State', 'Locality', 'Activity Site', 'Activity', 'Sub Activity', 'Data Collector', 'Device ID', 'Supervisor', 'Date', 'Site ID', 'Partner'];
    const fieldKeys: (keyof QuestionnaireRow)[] = ['hub', 'state', 'locality', 'activitySite', 'activity', 'subActivity', 'dataCollector', 'deviceId', 'supervisor', 'date', 'siteId', 'partner'];
    const headerRow = ws.addRow(headers);
    headerRow.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FF374151' } } };
    });

    const redFill: any = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
    const orangeFill: any = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7ED' } };
    const blueFill: any = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
    const purpleFill: any = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F3FF' } };
    const greenFill: any = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDF4' } };

    const redFont: any = { color: { argb: 'FFDC2626' } };
    const orangeFont: any = { color: { argb: 'FFEA580C' } };
    const blueFont: any = { color: { argb: 'FF2563EB' } };
    const purpleFont: any = { color: { argb: 'FF9333EA' } };

    data.forEach((row, idx) => {
      const issues: string[] = [];
      let rowFill: any = null;
      let issueFont: any = {};

      const isDuplicate = dupRowIndices.has(idx);
      const isEmpty = emptyRowIndices.has(idx);
      const hasNameChange = nameMap.has(idx);
      const hasTrim = fieldKeys.some(k => trimMap.has(`${idx}|${k}`));

      if (isDuplicate) {
        const groupNum = dupGroupMap.get(idx);
        issues.push(`DUPLICATE (Group ${groupNum})`);
        rowFill = redFill;
        issueFont = redFont;
      }
      if (isEmpty) {
        issues.push('EMPTY ROW');
        rowFill = orangeFill;
        issueFont = orangeFont;
      }
      if (hasNameChange) {
        const nc = nameMap.get(idx)!;
        issues.push(`NAME: "${nc.oldName}" → "${nc.newName}"`);
        if (!rowFill) { rowFill = purpleFill; issueFont = purpleFont; }
      }
      if (hasTrim) {
        const trimmedFields = fieldKeys.filter(k => trimMap.has(`${idx}|${k}`)).map(k => k);
        issues.push(`TRIMMED: ${trimmedFields.join(', ')}`);
        if (!rowFill) { rowFill = blueFill; issueFont = blueFont; }
      }

      const values = [idx + 1, issues.join(' | ') || '', ...fieldKeys.map(k => row[k] || '')];
      const excelRow = ws.addRow(values);

      if (rowFill) {
        excelRow.eachCell((cell, colNum) => {
          cell.fill = rowFill!;
        });
      }
      if (issues.length > 0) {
        const issueCell = excelRow.getCell(2);
        issueCell.font = { ...issueFont, bold: true, size: 10 };
      }
      if (!issues.length) {
        excelRow.eachCell((cell, colNum) => {
          if (colNum > 2) cell.fill = greenFill;
        });
        const issueCell = excelRow.getCell(2);
        issueCell.value = 'OK';
        issueCell.font = { color: { argb: 'FF16A34A' }, italic: true, size: 10 };
      }

      fieldKeys.forEach((key, ki) => {
        const trimKey = `${idx}|${key}`;
        if (trimMap.has(trimKey)) {
          const td = trimMap.get(trimKey)!;
          const cell = excelRow.getCell(ki + 3);
          cell.note = `Whitespace trimmed:\nBefore: "${td.before}"\nAfter: "${td.after}"`;
          cell.font = { color: { argb: 'FF2563EB' }, italic: true };
        }
      });

      if (hasNameChange) {
        const nc = nameMap.get(idx)!;
        const dcCell = excelRow.getCell(fieldKeys.indexOf('dataCollector') + 3);
        dcCell.note = `Name standardized:\nOriginal: "${nc.oldName}"\nStandard: "${nc.newName}"`;
        dcCell.font = { color: { argb: 'FF9333EA' }, bold: true };
      }

      if (isDuplicate) {
        const groupNum = dupGroupMap.get(idx);
        const firstCell = excelRow.getCell(1);
        firstCell.note = `This row is part of duplicate group ${groupNum}.\nRows with identical key fields are highlighted.`;
      }
    });

    ws.columns = [
      { width: 8 }, { width: 35 }, { width: 18 }, { width: 16 }, { width: 18 },
      { width: 30 }, { width: 16 }, { width: 20 }, { width: 25 }, { width: 20 },
      { width: 20 }, { width: 14 }, { width: 14 }, { width: 20 },
    ];

    ws.autoFilter = { from: 'A1', to: `N${data.length + 1}` };

    const legendWs = wb.addWorksheet('Legend');
    const legendHeaders = legendWs.addRow(['Color', 'Meaning', 'Details']);
    legendHeaders.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    });
    const legends = [
      { color: 'FFFEE2E2', label: 'Red', meaning: 'Duplicate Row', details: 'Row has identical key fields to another row. Check Group number in Issue column.' },
      { color: 'FFFFF7ED', label: 'Orange', meaning: 'Empty Row', details: 'Row has no meaningful data in any key field.' },
      { color: 'FFEFF6FF', label: 'Blue', meaning: 'Trimmed Fields', details: 'One or more fields had extra whitespace removed. Hover cells for before/after details.' },
      { color: 'FFF5F3FF', label: 'Purple', meaning: 'Name Standardized', details: 'Data collector name was unified to the most common name for this device ID.' },
      { color: 'FFF0FDF4', label: 'Green', meaning: 'No Issues', details: 'Row passed all quality checks.' },
    ];
    legends.forEach(l => {
      const row = legendWs.addRow([l.label, l.meaning, l.details]);
      row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: l.color } };
      row.getCell(1).font = { bold: true };
    });
    legendWs.columns = [{ width: 12 }, { width: 25 }, { width: 80 }];

    const summaryWs = wb.addWorksheet('Summary');
    const rptSummary = computeSummaryFromData(data, data, fileName, cleanResults);
    const addSectionHeader = (text: string) => {
      const r = summaryWs.addRow([text, '']);
      r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
      r.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      r.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
      r.getCell(2).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    };
    const addRow = (label: string, value: string | number) => summaryWs.addRow([label, value]);

    addSectionHeader('Report Information');
    addRow('Report Title', 'Data Quality & Coverage Report');
    addRow('Generated Date', format(new Date(), 'MMMM d, yyyy h:mm a'));
    addRow('File Name', fileName);
    addRow('Month Coverage', rptSummary?.monthCoverage || 'N/A');
    summaryWs.addRow([]);

    addSectionHeader('Data Quality Metrics');
    addRow('Total Rows', data.length);
    addRow('Duplicate Rows', cleanResults.duplicateGroups.reduce((sum, g) => sum + g.rows.length, 0));
    addRow('Duplicate Groups', cleanResults.duplicateGroups.length);
    addRow('Empty Rows', cleanResults.emptyRowsRemoved);
    addRow('Fields Trimmed', cleanResults.trimmedFields);
    addRow('Names Standardized', cleanResults.namesStandardized);
    const cleanRowCount = data.length - cleanResults.emptyRowsRemoved - cleanResults.duplicateGroups.reduce((sum, g) => sum + g.rows.length, 0);
    addRow('Clean Rows', cleanRowCount);
    addRow('Data Quality Score', data.length > 0 ? ((cleanRowCount / data.length) * 100).toFixed(1) + '%' : '100%');
    summaryWs.addRow([]);

    addSectionHeader('Coverage Totals');
    addRow('Total Questionnaires', rptSummary?.totalQuestionnaires || data.length);
    addRow('Unique Sites', rptSummary?.uniqueSites || 0);
    addRow('Hubs', rptSummary?.uniqueHubs || 0);
    addRow('States', rptSummary?.uniqueStates || 0);
    addRow('Localities', rptSummary?.uniqueLocalities || 0);
    addRow('Data Collectors', rptSummary?.totalCollectors || 0);
    addRow('Supervisors', rptSummary?.totalSupervisors || 0);

    if (rptSummary) {
      summaryWs.addRow([]);
      addSectionHeader('Team Roster');
      rptSummary.teamOverview.forEach(team => {
        const supRow = summaryWs.addRow([`Supervisor: ${team.supervisor}`, `${team.teamSize} DCs, ${team.totalQ} Q`]);
        supRow.getCell(1).font = { bold: true };
        team.collectors.forEach(dc => {
          addRow(`  ${dc.name}`, `Device: ${dc.deviceId} | ${dc.count} Q`);
        });
      });
      summaryWs.addRow([]);
      addSectionHeader('Hub Coverage');
      rptSummary.hubBreakdown.forEach(h => {
        addRow(h.hub, `${h.questionnaires} Q, ${h.sites} sites`);
      });
    }
    summaryWs.columns = [{ width: 35 }, { width: 40 }];

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const baseName = fileName.replace(/\.[^.]+$/, '') || 'questionnaire_data';
    a.download = `${baseName}_review.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }, [cleanResults, data, fileName]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const arrayBuffer = event.target?.result;
        const wb = XLSX.read(arrayBuffer, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawData = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

        const colMap = { ...DEFAULT_COLUMN_MAP };
        if (rawData.length > 0) {
          const headerRow = rawData[0].map((h: any) => (h || '').toString().toLowerCase().trim());
          // Detect every mapped field using keyword-priority ordering:
          // for each keyword (most-specific first), find the first column whose
          // lowercased header contains that keyword; stop at the first hit.
          // This prevents a less-specific keyword (e.g. 'activity') from matching
          // an earlier column (e.g. 'activity site') when a more-specific keyword
          // would have correctly matched a later column.
          Object.entries(HEADER_KEYWORDS).forEach(([field, keywords]) => {
            let found = -1;
            for (const kw of keywords) {
              const idx = headerRow.findIndex((h: string) => h.includes(kw));
              if (idx >= 0) { found = idx; break; }
            }
            if (found >= 0) (colMap as any)[field] = found;
          });
          // Safety: if 'activity' and 'activitySite' still resolve to the same
          // column (can happen with very short headers), scan past activitySite.
          if ((colMap as any).activity === (colMap as any).activitySite) {
            const skip = (colMap as any).activitySite as number;
            for (const kw of HEADER_KEYWORDS.activity) {
              const idx = headerRow.findIndex((h: string, i: number) => i > skip && h.includes(kw));
              if (idx >= 0) { (colMap as any).activity = idx; break; }
            }
          }
          // Debug: log detected column mapping to browser console
          console.log('[QA Upload] Detected column map:', {
            hub: `col${colMap.hub}="${headerRow[colMap.hub]}"`,
            state: `col${colMap.state}="${headerRow[colMap.state]}"`,
            locality: `col${colMap.locality}="${headerRow[colMap.locality]}"`,
            activitySite: `col${(colMap as any).activitySite}="${headerRow[(colMap as any).activitySite]}"`,
            activity: `col${(colMap as any).activity}="${headerRow[(colMap as any).activity]}"`,
            subActivity: `col${(colMap as any).subActivity}="${headerRow[(colMap as any).subActivity]}"`,
            monitoringType: `col${(colMap as any).monitoringType}="${headerRow[(colMap as any).monitoringType]}"`,
            dataCollector: `col${(colMap as any).dataCollector}="${headerRow[(colMap as any).dataCollector]}"`,
            date: `col${(colMap as any).date}="${headerRow[(colMap as any).date]}"`,
            partner: `col${(colMap as any).partner}="${headerRow[(colMap as any).partner]}"`,
          });
        }

        const rows: QuestionnaireRow[] = rawData.slice(1).map((row) => {
          const rawHub   = (row[colMap.hub]   || '').toString().trim();
          const rawState = (row[colMap.state] || '').toString().trim();
          // Validate hub: if the detected hub column contains a non-hub value
          // (e.g. a timestamp when the file has no hub column), fall back to
          // STATE_TO_HUB_NAME so February-format files are handled correctly.
          const derivedHub = (rawHub && KNOWN_HUBS_LC.has(rawHub.toLowerCase()))
            ? rawHub
            : (STATE_TO_HUB_NAME.get(rawState.toLowerCase()) || rawHub || '');
          // Handle Excel serial dates (e.g. 46032 = 2026-01-10).
          const rawDate = row[colMap.date];
          let dateStr = '';
          if (rawDate instanceof Date) {
            dateStr = rawDate.toISOString().slice(0, 10);
          } else if (typeof rawDate === 'number' && rawDate > 40000 && rawDate < 60000) {
            dateStr = new Date((rawDate - 25569) * 86400 * 1000).toISOString().slice(0, 10);
          } else {
            dateStr = (rawDate || '').toString().trim();
          }
          return {
            hub:           derivedHub,
            state:         rawState,
            locality:      (row[colMap.locality]      || '').toString().trim(),
            activitySite:  (row[colMap.activitySite]  || '').toString().trim(),
            activity:      (row[colMap.activity]      || '').toString().trim(),
            subActivity:   (row[colMap.subActivity]   || '').toString().trim(),
            monitoringType:(row[colMap.monitoringType]|| '').toString().trim(),
            dataCollector: (row[colMap.dataCollector] || '').toString().trim(),
            deviceId:      (row[colMap.deviceId]      || '').toString().trim(),
            supervisor:    (row[colMap.supervisor]    || '').toString().trim(),
            date:          dateStr,
            siteId:        (row[colMap.siteId]        || '').toString().trim(),
            partner:       (row[colMap.partner]       || '').toString().trim(),
          };
        }).filter(row => row.hub || row.state || row.dataCollector);

        setData(rows);
        setOriginalData(null);
        setCleanedData(null);
        setIsCleanedView(false);
        setCurrentSessionName('');
        setFilterHubs([]);
        setFilterStates([]);
        setFilterActivities([]);
        setFilterLocalities([]);
        setSearchQuery('');
      } catch (err) {
        console.error('Error parsing Excel file:', err);
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const filteredData = useMemo(() => {
    let result = data;
    if (filterHubs.length > 0) result = result.filter(r => filterHubs.includes(r.hub));
    if (filterStates.length > 0) result = result.filter(r => filterStates.includes(r.state));
    if (filterActivities.length > 0) result = result.filter(r => filterActivities.includes(r.activity));
    if (filterLocalities.length > 0) result = result.filter(r => filterLocalities.includes(r.locality));
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(r =>
        r.dataCollector.toLowerCase().includes(q) ||
        r.hub.toLowerCase().includes(q) ||
        r.state.toLowerCase().includes(q) ||
        r.locality.toLowerCase().includes(q) ||
        r.activitySite.toLowerCase().includes(q) ||
        r.activity.toLowerCase().includes(q) ||
        r.subActivity.toLowerCase().includes(q)
      );
    }
    return result;
  }, [data, filterHubs, filterStates, filterActivities, filterLocalities, searchQuery]);

  const uniqueHubs = useMemo(() => [...new Set(data.map(r => r.hub))].filter(Boolean).sort(), [data]);
  const uniqueStates = useMemo(() => [...new Set(data.map(r => r.state))].filter(Boolean).sort(), [data]);
  const uniqueActivities = useMemo(() => [...new Set(data.map(r => r.activity))].filter(Boolean).sort(), [data]);
  const uniqueLocalities = useMemo(() => [...new Set(data.map(r => r.locality))].filter(Boolean).sort(), [data]);

  const activeFilterCount = filterHubs.length + filterStates.length + filterActivities.length + filterLocalities.length;

  const toggleFilter = (arr: string[], setArr: (v: string[]) => void, val: string) => {
    setArr(arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val]);
  };

  const clearAllFilters = () => {
    setFilterHubs([]);
    setFilterStates([]);
    setFilterActivities([]);
    setFilterLocalities([]);
    setSearchQuery('');
  };

  const buildSummaryWithSites = useCallback((items: QuestionnaireRow[], key: keyof QuestionnaireRow): SummaryWithSites[] => {
    const map = new Map<string, { questionnaires: number; sites: Set<string>; collectors: Set<string> }>();
    items.forEach(row => {
      const val = row[key] || '(Empty)';
      if (!map.has(val)) map.set(val, { questionnaires: 0, sites: new Set(), collectors: new Set() });
      const entry = map.get(val)!;
      entry.questionnaires++;
      if (row.activitySite) entry.sites.add(row.activitySite);
      if (row.dataCollector) entry.collectors.add(row.deviceId?.trim() ? row.deviceId.trim() : row.dataCollector);
    });
    const total = items.length;
    return [...map.entries()]
      .map(([name, { questionnaires, sites, collectors }]) => ({
        name,
        questionnaires,
        sites: sites.size,
        collectors: collectors.size,
        percentage: total > 0 ? (questionnaires / total) * 100 : 0,
      }))
      .sort((a, b) => b.questionnaires - a.questionnaires);
  }, []);

  const hubSummary = useMemo(() => buildSummaryWithSites(filteredData, 'hub'), [filteredData, buildSummaryWithSites]);
  const stateSummary = useMemo(() => buildSummaryWithSites(filteredData, 'state'), [filteredData, buildSummaryWithSites]);
  const localitySummary = useMemo(() => buildSummaryWithSites(filteredData, 'locality'), [filteredData, buildSummaryWithSites]);
  const siteSummary = useMemo(() => buildSummaryWithSites(filteredData, 'activitySite'), [filteredData, buildSummaryWithSites]);

  const siteDetailsWithActivity = useMemo(() => {
    const map = new Map<string, { questionnaires: number; activities: Map<string, number>; collectors: Set<string>; state: string; locality: string }>();
    filteredData.forEach(row => {
      const site = row.activitySite || '(Empty)';
      if (!map.has(site)) map.set(site, { questionnaires: 0, activities: new Map(), collectors: new Set(), state: '', locality: '' });
      const entry = map.get(site)!;
      entry.questionnaires++;
      if (row.activity) entry.activities.set(row.activity, (entry.activities.get(row.activity) || 0) + 1);
      if (row.dataCollector) entry.collectors.add(row.deviceId?.trim() ? row.deviceId.trim() : row.dataCollector);
      if (row.state && !entry.state) entry.state = row.state;
      if (row.locality && !entry.locality) entry.locality = row.locality;
    });
    const total = filteredData.length;
    return [...map.entries()]
      .map(([name, d]) => ({
        name,
        questionnaires: d.questionnaires,
        activities: [...d.activities.entries()].map(([n, c]) => ({ name: n, count: c })).sort((a, b) => b.count - a.count),
        activityNames: [...d.activities.keys()].join(', '),
        collectors: d.collectors.size,
        state: d.state,
        locality: d.locality,
        percentage: total > 0 ? (d.questionnaires / total) * 100 : 0,
      }))
      .sort((a, b) => b.questionnaires - a.questionnaires);
  }, [filteredData]);

  const hubDrilldown = useMemo(() => {
    const hubMap = new Map<string, {
      q: number; sites: Set<string>;
      states: Map<string, {
        q: number; sites: Set<string>;
        activities: Map<string, {
          q: number; sites: Set<string>;
          localities: Map<string, { q: number; sites: Set<string> }>;
        }>;
      }>;
    }>();

    filteredData.forEach(row => {
      const hub = row.hub || '(Empty)';
      const state = row.state || '(Empty)';
      const activity = row.activity || '(Empty)';
      const locality = row.locality || '(Empty)';

      if (!hubMap.has(hub)) hubMap.set(hub, { q: 0, sites: new Set(), states: new Map() });
      const hEntry = hubMap.get(hub)!;
      hEntry.q++;
      if (row.activitySite) hEntry.sites.add(row.activitySite);

      if (!hEntry.states.has(state)) hEntry.states.set(state, { q: 0, sites: new Set(), activities: new Map() });
      const sEntry = hEntry.states.get(state)!;
      sEntry.q++;
      if (row.activitySite) sEntry.sites.add(row.activitySite);

      if (!sEntry.activities.has(activity)) sEntry.activities.set(activity, { q: 0, sites: new Set(), localities: new Map() });
      const aEntry = sEntry.activities.get(activity)!;
      aEntry.q++;
      if (row.activitySite) aEntry.sites.add(row.activitySite);

      if (!aEntry.localities.has(locality)) aEntry.localities.set(locality, { q: 0, sites: new Set() });
      const lEntry = aEntry.localities.get(locality)!;
      lEntry.q++;
      if (row.activitySite) lEntry.sites.add(row.activitySite);
    });

    const totalQ = filteredData.length;
    return [...hubMap.entries()].map(([hub, hd]) => ({
      name: hub,
      questionnaires: hd.q,
      sites: hd.sites.size,
      percentage: totalQ > 0 ? (hd.q / totalQ) * 100 : 0,
      states: [...hd.states.entries()].map(([st, sd]) => ({
        name: st,
        questionnaires: sd.q,
        sites: sd.sites.size,
        percentage: hd.q > 0 ? (sd.q / hd.q) * 100 : 0,
        activities: [...sd.activities.entries()].map(([act, ad]) => ({
          name: act,
          questionnaires: ad.q,
          sites: ad.sites.size,
          percentage: sd.q > 0 ? (ad.q / sd.q) * 100 : 0,
          localities: [...ad.localities.entries()].map(([loc, ld]) => ({
            name: loc,
            questionnaires: ld.q,
            sites: ld.sites.size,
            siteNames: [...ld.sites].sort(),
            percentage: ad.q > 0 ? (ld.q / ad.q) * 100 : 0,
          })).sort((a, b) => b.questionnaires - a.questionnaires),
        })).sort((a, b) => b.questionnaires - a.questionnaires),
      })).sort((a, b) => b.questionnaires - a.questionnaires),
    })).sort((a, b) => b.questionnaires - a.questionnaires);
  }, [filteredData]);

  const activityBreakdown = useMemo((): ActivityBreakdown[] => {
    const actMap = new Map<string, QuestionnaireRow[]>();
    filteredData.forEach(row => {
      const act = row.activity || '(Empty)';
      if (!actMap.has(act)) actMap.set(act, []);
      actMap.get(act)!.push(row);
    });
    const totalQ = filteredData.length;
    return [...actMap.entries()]
      .map(([name, rows]) => {
        const siteSet = new Set(rows.map(r => r.activitySite).filter(Boolean));
        const siteMap = new Map<string, number>();
        rows.forEach(r => {
          const s = r.activitySite || '(Empty)';
          siteMap.set(s, (siteMap.get(s) || 0) + 1);
        });
        const siteList = [...siteMap.entries()]
          .map(([sn, sc]) => ({ name: sn, count: sc, percentage: rows.length > 0 ? (sc / rows.length) * 100 : 0 }))
          .sort((a, b) => b.count - a.count);

        const hubMap = new Map<string, { count: number; sites: Set<string> }>();
        const stateMap = new Map<string, { count: number; sites: Set<string> }>();
        const locMap = new Map<string, { count: number; sites: Set<string> }>();
        const collMap = new Map<string, { count: number; deviceId: string }>();

        rows.forEach(r => {
          const h = r.hub || '(Empty)';
          if (!hubMap.has(h)) hubMap.set(h, { count: 0, sites: new Set() });
          hubMap.get(h)!.count++;
          if (r.activitySite) hubMap.get(h)!.sites.add(r.activitySite);

          const st = r.state || '(Empty)';
          if (!stateMap.has(st)) stateMap.set(st, { count: 0, sites: new Set() });
          stateMap.get(st)!.count++;
          if (r.activitySite) stateMap.get(st)!.sites.add(r.activitySite);

          const lo = r.locality || '(Empty)';
          if (!locMap.has(lo)) locMap.set(lo, { count: 0, sites: new Set() });
          locMap.get(lo)!.count++;
          if (r.activitySite) locMap.get(lo)!.sites.add(r.activitySite);

          const dc = r.dataCollector || '(Empty)';
          if (!collMap.has(dc)) collMap.set(dc, { count: 0, deviceId: '' });
          collMap.get(dc)!.count++;
          if (!collMap.get(dc)!.deviceId && r.deviceId) collMap.get(dc)!.deviceId = r.deviceId;
        });

        return {
          name,
          siteCount: siteSet.size,
          questionnaireCount: rows.length,
          percentage: totalQ > 0 ? (rows.length / totalQ) * 100 : 0,
          siteList,
          byHub: [...hubMap.entries()].map(([n, d]) => ({ name: n, count: d.count, sites: d.sites.size })).sort((a, b) => b.count - a.count),
          byState: [...stateMap.entries()].map(([n, d]) => ({ name: n, count: d.count, sites: d.sites.size })).sort((a, b) => b.count - a.count),
          byLocality: [...locMap.entries()].map(([n, d]) => ({ name: n, count: d.count, sites: d.sites.size })).sort((a, b) => b.count - a.count),
          byCollector: [...collMap.entries()].map(([n, d]) => ({ name: n, count: d.count, deviceId: d.deviceId })).sort((a, b) => b.count - a.count),
        };
      })
      .sort((a, b) => b.siteCount - a.siteCount);
  }, [filteredData]);

  const [profileLookup, setProfileLookup] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const fetchProfiles = async () => {
      try {
        const { data } = await supabase.from('profiles').select('id, full_name');
        if (data && data.length > 0) {
          const lookup = new Map<string, string>();
          data.forEach((p: any) => {
            if (p.full_name) {
              const normalized = p.full_name.trim().toLowerCase();
              if (!lookup.has(normalized)) lookup.set(normalized, p.id);
            }
          });
          setProfileLookup(lookup);
        }
      } catch (_) {}
    };
    fetchProfiles();
  }, []);

  const matchProfileId = useCallback((collectorName: string, variants?: { name: string; count: number }[]): string => {
    const norm = collectorName.trim().toLowerCase();
    if (profileLookup.has(norm)) return profileLookup.get(norm)!;
    if (variants) {
      for (const v of variants) {
        const vn = v.name.trim().toLowerCase();
        if (profileLookup.has(vn)) return profileLookup.get(vn)!;
      }
    }
    return '';
  }, [profileLookup]);

  const collectorDetails = useMemo((): CollectorDetail[] => {
    const deviceMap = new Map<string, { names: Map<string, number>; activities: Map<string, number>; localities: Map<string, number>; sites: Map<string, { count: number; locality: string; state: string }>; hubs: Set<string>; states: Set<string>; count: number }>();
    const noDeviceMap = new Map<string, { activities: Map<string, number>; localities: Map<string, number>; sites: Map<string, { count: number; locality: string; state: string }>; hubs: Set<string>; states: Set<string>; count: number }>();

    filteredData.forEach(row => {
      const name = row.dataCollector || '(Empty)';
      const devId = row.deviceId?.trim() || '';
      const siteName = row.activitySite?.trim() || '';

      if (devId) {
        if (!deviceMap.has(devId)) deviceMap.set(devId, { names: new Map(), activities: new Map(), localities: new Map(), sites: new Map(), hubs: new Set(), states: new Set(), count: 0 });
        const entry = deviceMap.get(devId)!;
        entry.count++;
        entry.names.set(name, (entry.names.get(name) || 0) + 1);
        if (row.activity) entry.activities.set(row.activity, (entry.activities.get(row.activity) || 0) + 1);
        if (row.locality) entry.localities.set(row.locality, (entry.localities.get(row.locality) || 0) + 1);
        if (siteName) {
          const existing = entry.sites.get(siteName);
          if (existing) { existing.count++; } else { entry.sites.set(siteName, { count: 1, locality: row.locality || '', state: row.state || '' }); }
        }
        if (row.hub) entry.hubs.add(row.hub);
        if (row.state) entry.states.add(row.state);
      } else {
        if (!noDeviceMap.has(name)) noDeviceMap.set(name, { activities: new Map(), localities: new Map(), sites: new Map(), hubs: new Set(), states: new Set(), count: 0 });
        const entry = noDeviceMap.get(name)!;
        entry.count++;
        if (row.activity) entry.activities.set(row.activity, (entry.activities.get(row.activity) || 0) + 1);
        if (row.locality) entry.localities.set(row.locality, (entry.localities.get(row.locality) || 0) + 1);
        if (siteName) {
          const existing = entry.sites.get(siteName);
          if (existing) { existing.count++; } else { entry.sites.set(siteName, { count: 1, locality: row.locality || '', state: row.state || '' }); }
        }
        if (row.hub) entry.hubs.add(row.hub);
        if (row.state) entry.states.add(row.state);
      }
    });

    const total = filteredData.length;
    const results: CollectorDetail[] = [];

    deviceMap.forEach((d, devId) => {
      const nameVariants = [...d.names.entries()].map(([n, c]) => ({ name: n, count: c })).sort((a, b) => b.count - a.count);
      const primaryName = nameVariants[0]?.name || '(Empty)';
      results.push({
        name: primaryName,
        deviceId: devId,
        profileId: matchProfileId(primaryName, nameVariants),
        count: d.count,
        percentage: total > 0 ? (d.count / total) * 100 : 0,
        activities: [...d.activities.entries()].map(([n, c]) => ({ name: n, count: c })).sort((a, b) => b.count - a.count),
        localities: [...d.localities.entries()].map(([n, c]) => ({ name: n, count: c })).sort((a, b) => b.count - a.count),
        sites: [...d.sites.entries()].map(([n, s]) => ({ name: n, count: s.count, locality: s.locality, state: s.state })).sort((a, b) => b.count - a.count),
        hubs: [...d.hubs],
        states: [...d.states],
        nameVariants: nameVariants.length > 1 ? nameVariants : [],
      });
    });

    noDeviceMap.forEach((d, name) => {
      results.push({
        name,
        deviceId: '',
        profileId: matchProfileId(name),
        count: d.count,
        percentage: total > 0 ? (d.count / total) * 100 : 0,
        activities: [...d.activities.entries()].map(([n, c]) => ({ name: n, count: c })).sort((a, b) => b.count - a.count),
        localities: [...d.localities.entries()].map(([n, c]) => ({ name: n, count: c })).sort((a, b) => b.count - a.count),
        sites: [...d.sites.entries()].map(([n, s]) => ({ name: n, count: s.count, locality: s.locality, state: s.state })).sort((a, b) => b.count - a.count),
        hubs: [...d.hubs],
        states: [...d.states],
        nameVariants: [],
      });
    });

    return results.sort((a, b) => b.count - a.count);
  }, [filteredData, matchProfileId]);

  const toggleExpand = (key: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const csvEnumData = useMemo(() => {
    type CsvColl = {
      name: string;          // most-frequent name seen for this deviceId (or raw name if no deviceId)
      deviceId: string;      // from the CSV — the actual unique ID column
      rawNames: Set<string>; // all name variants written by this collector
      questionnaires: number; pdmCount: number;
      sites: Set<string>; activities: Map<string, number>;
    };

    // ── Pass 1: deviceId → most-frequent name ────────────────────────────────
    // Group by deviceId first (within hub+state scope) so the canonical display
    // name is the one the collector writes most often — purely from the CSV file.
    const didNameFreq = new Map<string, Map<string, number>>(); // deviceId → name → count
    filteredData.forEach(row => {
      const did  = (row.deviceId || '').trim();
      if (!did) return;
      const name = (row.dataCollector || '').trim();
      if (!name) return;
      if (!didNameFreq.has(did)) didNameFreq.set(did, new Map());
      const freq = didNameFreq.get(did)!;
      freq.set(name, (freq.get(name) || 0) + 1);
    });
    const didToCanonical = new Map<string, string>(); // deviceId → canonical name
    didNameFreq.forEach((freq, did) => {
      let best = '', bestCount = 0;
      freq.forEach((count, name) => { if (count > bestCount) { bestCount = count; best = name; } });
      if (best) didToCanonical.set(did, best);
    });

    // ── Pass 2: build hub → state → collector groups ─────────────────────────
    const hubMap = new Map<string, Map<string, Map<string, CsvColl>>>();
    filteredData.forEach(row => {
      const hub     = row.hub || '—';
      const state   = row.state || '—';
      const rawName = (row.dataCollector || '(Unknown)').trim();
      const did     = (row.deviceId || '').trim();
      // Group key: deviceId when present (merges variants), raw name otherwise
      const groupKey = did || rawName;
      const dispName = (did && didToCanonical.get(did)) || rawName;

      if (!hubMap.has(hub)) hubMap.set(hub, new Map());
      if (!hubMap.get(hub)!.has(state)) hubMap.get(hub)!.set(state, new Map());
      const collMap = hubMap.get(hub)!.get(state)!;
      if (!collMap.has(groupKey)) {
        collMap.set(groupKey, { name: dispName, deviceId: did, rawNames: new Set(), questionnaires: 0, pdmCount: 0, sites: new Set(), activities: new Map() });
      }
      const entry = collMap.get(groupKey)!;
      entry.rawNames.add(rawName);
      entry.questionnaires++;
      if (isPdmActivity(row.monitoringType || row.activity)) entry.pdmCount++;
      if (row.activitySite) entry.sites.add(row.activitySite.trim());
      if (row.activity) entry.activities.set(row.activity, (entry.activities.get(row.activity) || 0) + 1);
    });

    return [...hubMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([hub, sm]) => {
      const states = [...sm.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([state, collMap]) => {
        const collectors = [...collMap.values()].sort((a, b) => b.questionnaires - a.questionnaires).map(c => {
          const activities = [...c.activities.entries()].map(([n, cnt]) => ({ name: n, count: cnt })).sort((a, b) => b.count - a.count);
          const pdmSites   = Math.floor(c.pdmCount / 7) + (c.questionnaires - c.pdmCount);
          return { name: c.name, deviceId: c.deviceId, rawNames: [...c.rawNames], questionnaires: c.questionnaires, sites: [...c.sites], activities, pdmSites };
        });
        const totalQ     = collectors.reduce((s, c) => s + c.questionnaires, 0);
        const totalSites = new Set(collectors.flatMap(c => c.sites)).size;
        const totalPdm   = collectors.reduce((s, c) => s + c.pdmSites, 0);
        return { state, collectors, totalQ, totalSites, totalPdm };
      });
      const hubTotalQ     = states.reduce((s, sg) => s + sg.totalQ, 0);
      const hubTotalSites = new Set(states.flatMap(sg => sg.collectors.flatMap(c => c.sites))).size;
      const hubTotalPdm   = states.reduce((s, sg) => s + sg.totalPdm, 0);
      return { hub, states, totalQ: hubTotalQ, totalSites: hubTotalSites, totalPdm: hubTotalPdm };
    });
  }, [filteredData]);

  // Rebuild account maps whenever csvEnumData changes (i.e. when a new CSV is uploaded).
  // Two-step lookup mirrors the export function logic:
  //   Step 1: profile name/email exact match  (fast but rarely hits ODK-typed names)
  //   Step 2: site bridge via mmp_site_entries → accepted_by userId → profile bank_account
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const parseAcct = (raw: any): { number: string; name: string } => {
        if (!raw) return { number: '', name: '' };
        if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { return { number: '', name: '' }; } }
        if (typeof raw !== 'object') return { number: '', name: '' };
        const number   = String(raw.accountNumber ?? raw.account_number ?? '').trim();
        const acctName = String(raw.accountName   ?? raw.account_name   ?? '').trim();
        if (number || acctName) return { number, name: acctName };
        const vals = Object.values(raw).filter(v => typeof v === 'string' || typeof v === 'number').map(v => String(v).trim()).filter(Boolean);
        return { number: vals[0] || '', name: '' };
      };

      // Step 1: all profiles with bank_account
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, username, email, bank_account')
        .not('bank_account', 'is', null);
      if (cancelled) return;

      const numMap    = new Map<string, string>();
      const nameMap   = new Map<string, string>();
      const pidToNum  = new Map<string, string>();
      const pidToName = new Map<string, string>();

      (profiles || []).forEach((p: any) => {
        const { number, name } = parseAcct(p.bank_account);
        if (!number && !name) return;
        if (number) pidToNum.set(p.id, number);
        if (name)   pidToName.set(p.id, name);
        [p.full_name, p.username, p.email].filter(Boolean).forEach((n: string) => {
          const k = n.trim().toLowerCase();
          if (number) numMap.set(k, number);
          if (name)   nameMap.set(k, name);
        });
      });

      // Step 2: site bridge
      if (csvEnumData.length > 0) {
        const allSites = new Set<string>();
        csvEnumData.forEach(hg => hg.states.forEach(sg => sg.collectors.forEach(col =>
          col.sites.forEach(s => { if (s) allSites.add(s.trim()); })
        )));
        if (allSites.size > 0) {
          const { data: mmpRows } = await supabase
            .from('mmp_site_entries')
            .select('site_name, hub_office, state, accepted_by')
            .in('site_name', [...allSites].slice(0, 400))
            .not('accepted_by', 'is', null);
          if (cancelled) return;

          const siteToUsers = new Map<string, Set<string>>();
          (mmpRows || []).forEach((e: any) => {
            const k = `${(e.site_name||'').trim().toLowerCase()}||${(e.hub_office||'').trim().toLowerCase()}||${(e.state||'').trim().toLowerCase()}`;
            if (!siteToUsers.has(k)) siteToUsers.set(k, new Set());
            siteToUsers.get(k)!.add(e.accepted_by);
          });

          csvEnumData.forEach(hg => hg.states.forEach(sg => sg.collectors.forEach(col => {
            const nameKey   = col.name.trim().toLowerCase();
            const needsNum  = !numMap.has(nameKey);
            const needsName = !nameMap.has(nameKey);
            if (!needsNum && !needsName) return;
            const userIds = new Set<string>();
            col.sites.forEach(site => {
              const k = `${site.trim().toLowerCase()}||${hg.hub.trim().toLowerCase()}||${sg.state.trim().toLowerCase()}`;
              siteToUsers.get(k)?.forEach(uid => userIds.add(uid));
            });
            for (const uid of userIds) {
              if (needsNum  && pidToNum.has(uid))  numMap.set(nameKey, pidToNum.get(uid)!);
              if (needsName && pidToName.has(uid)) nameMap.set(nameKey, pidToName.get(uid)!);
              if (numMap.has(nameKey) && nameMap.has(nameKey)) break;
            }
          })));
        }
      }

      setCsvAccountMap(numMap);
      setCsvAccountNameMap(nameMap);
    })();
    return () => { cancelled = true; };
  }, [csvEnumData]);

  const trackerData = useMemo(() => {
    const hubs = [...new Set(filteredData.map(r => r.hub))].filter(Boolean).sort();
    const activities = [...new Set(filteredData.map(r => r.monitoringType || r.activity))].filter(Boolean).sort();
    const states = [...new Set(filteredData.map(r => r.state))].filter(Boolean).sort();

    const siteSetMatrix: Record<string, Record<string, Set<string>>> = {};
    const qMatrix: Record<string, Record<string, number>> = {};
    const collMatrix: Record<string, Record<string, Set<string>>> = {};
    const stateActMatrix: Record<string, Record<string, { q: number; sites: Set<string> }>> = {};

    filteredData.forEach(row => {
      const actKey = row.monitoringType || row.activity;
      if (!actKey || !row.hub) return;
      if (!siteSetMatrix[actKey]) siteSetMatrix[actKey] = {};
      if (!siteSetMatrix[actKey][row.hub]) siteSetMatrix[actKey][row.hub] = new Set();
      if (!qMatrix[actKey]) qMatrix[actKey] = {};
      if (!qMatrix[actKey][row.hub]) qMatrix[actKey][row.hub] = 0;
      if (!collMatrix[actKey]) collMatrix[actKey] = {};
      if (!collMatrix[actKey][row.hub]) collMatrix[actKey][row.hub] = new Set();

      qMatrix[actKey][row.hub]++;
      if (row.activitySite) siteSetMatrix[actKey][row.hub].add(row.activitySite);
      if (row.dataCollector) collMatrix[actKey][row.hub].add(row.dataCollector);

      if (row.state) {
        if (!stateActMatrix[row.state]) stateActMatrix[row.state] = {};
        if (!stateActMatrix[row.state][actKey]) stateActMatrix[row.state][actKey] = { q: 0, sites: new Set() };
        stateActMatrix[row.state][actKey].q++;
        if (row.activitySite) stateActMatrix[row.state][actKey].sites.add(row.activitySite);
      }
    });

    const hubStateActMatrix: Record<string, Record<string, Record<string, { q: number; sites: Set<string>; collectors: Set<string> }>>> = {};
    const stateLocalActMatrix: Record<string, Record<string, Record<string, { q: number; sites: Set<string>; collectors: Set<string> }>>> = {};
    filteredData.forEach(row => {
      const actKey = row.monitoringType || row.activity;
      if (!actKey || !row.hub) return;
      const stateKey = row.state || '—';
      if (!hubStateActMatrix[row.hub]) hubStateActMatrix[row.hub] = {};
      if (!hubStateActMatrix[row.hub][actKey]) hubStateActMatrix[row.hub][actKey] = {};
      if (!hubStateActMatrix[row.hub][actKey][stateKey]) hubStateActMatrix[row.hub][actKey][stateKey] = { q: 0, sites: new Set(), collectors: new Set() };
      hubStateActMatrix[row.hub][actKey][stateKey].q++;
      if (row.activitySite) hubStateActMatrix[row.hub][actKey][stateKey].sites.add(row.activitySite);
      if (row.dataCollector) hubStateActMatrix[row.hub][actKey][stateKey].collectors.add(row.dataCollector);
    });
    // Build stateLocalActMatrix independently — requires activity + state; locality falls back to '—' if missing
    filteredData.forEach(row => {
      const actKey = row.monitoringType || row.activity;
      if (!actKey || !row.state) return;
      const locKey = row.locality || '—';
      if (!stateLocalActMatrix[row.state]) stateLocalActMatrix[row.state] = {};
      if (!stateLocalActMatrix[row.state][actKey]) stateLocalActMatrix[row.state][actKey] = {};
      if (!stateLocalActMatrix[row.state][actKey][locKey]) stateLocalActMatrix[row.state][actKey][locKey] = { q: 0, sites: new Set(), collectors: new Set() };
      stateLocalActMatrix[row.state][actKey][locKey].q++;
      if (row.activitySite) stateLocalActMatrix[row.state][actKey][locKey].sites.add(row.activitySite);
      if (row.dataCollector) stateLocalActMatrix[row.state][actKey][locKey].collectors.add(row.dataCollector);
    });

    const hubTrackers = hubs.map(hub => {
      // Include rows without state under '—' so grandQ matches grandSites/grandCollectors
      const hubStatesFull = [...new Set(filteredData.filter(r => r.hub === hub).map(r => r.state || '—'))].filter(Boolean).sort();
      const hubStatesDisplay = hubStatesFull.filter(s => s !== '—');
      // Only show '—' column if it contains data
      const hasBlankState = hubStatesFull.includes('—') && filteredData.some(r => r.hub === hub && !r.state);
      const hubStates = hasBlankState ? [...hubStatesDisplay, '—'] : hubStatesDisplay;

      const hubActivities = [...new Set(filteredData.filter(r => r.hub === hub).map(r => r.monitoringType || r.activity))].filter(Boolean).sort();
      const mRows = hubActivities.map(act => {
        const cells = hubStates.map(st => ({
          questionnaires: hubStateActMatrix[hub]?.[act]?.[st]?.q || 0,
          sites: hubStateActMatrix[hub]?.[act]?.[st]?.sites?.size || 0,
          collectors: hubStateActMatrix[hub]?.[act]?.[st]?.collectors?.size || 0,
        }));
        const totalQ = cells.reduce((a, c) => a + c.questionnaires, 0);
        const allSites = new Set<string>();
        const allColl = new Set<string>();
        hubStates.forEach(st => {
          (hubStateActMatrix[hub]?.[act]?.[st]?.sites || new Set<string>()).forEach(s => allSites.add(s));
          (hubStateActMatrix[hub]?.[act]?.[st]?.collectors || new Set<string>()).forEach(c => allColl.add(c));
        });
        return { activity: act, isPdm: isPdmActivity(act), cells, totalQ, totalSites: allSites.size, totalCollectors: allColl.size };
      });
      const colTotals = hubStates.map((st, si) => ({
        questionnaires: mRows.reduce((a, r) => a + r.cells[si].questionnaires, 0),
        sites: new Set(filteredData.filter(r => r.hub === hub && (r.state || '—') === st && r.activitySite).map(r => r.activitySite)).size,
        collectors: new Set(filteredData.filter(r => r.hub === hub && (r.state || '—') === st && r.dataCollector).map(r => r.dataCollector)).size,
      }));
      // Grand totals: count ALL rows for this hub (same population as grandSites/grandCollectors)
      const gQ = filteredData.filter(r => r.hub === hub).length;
      const gS = new Set(filteredData.filter(r => r.hub === hub && r.activitySite).map(r => r.activitySite)).size;
      const gC = new Set(filteredData.filter(r => r.hub === hub && r.dataCollector).map(r => r.dataCollector)).size;
      return { hub, states: hubStates, activities: hubActivities, matrix: mRows, colTotals, grandQ: gQ, grandSites: gS, grandCollectors: gC };
    }).filter(h => h.grandQ > 0);

    const stateTrackers = states.map(state => {
      // Mirror hubTrackers: include rows without locality under '—' so grandQ matches grandSites/grandCollectors
      const stLocalitiesFull = [...new Set(filteredData.filter(r => r.state === state).map(r => r.locality || '—'))].filter(Boolean).sort();
      const stLocalitiesDisplay = stLocalitiesFull.filter(l => l !== '—');
      const hasBlankLocality = filteredData.some(r => r.state === state && !r.locality);
      const stLocalities = hasBlankLocality ? [...stLocalitiesDisplay, '—'] : stLocalitiesDisplay;

      const stActivities = [...new Set(filteredData.filter(r => r.state === state).map(r => r.monitoringType || r.activity))].filter(Boolean).sort();
      const mRows = stActivities.map(act => {
        const cells = stLocalities.map(loc => ({
          questionnaires: stateLocalActMatrix[state]?.[act]?.[loc]?.q || 0,
          sites: stateLocalActMatrix[state]?.[act]?.[loc]?.sites?.size || 0,
          collectors: stateLocalActMatrix[state]?.[act]?.[loc]?.collectors?.size || 0,
        }));
        const totalQ = cells.reduce((a, c) => a + c.questionnaires, 0);
        const allSites = new Set<string>();
        const allColl = new Set<string>();
        stLocalities.forEach(loc => {
          (stateLocalActMatrix[state]?.[act]?.[loc]?.sites || new Set<string>()).forEach(s => allSites.add(s));
          (stateLocalActMatrix[state]?.[act]?.[loc]?.collectors || new Set<string>()).forEach(c => allColl.add(c));
        });
        return { activity: act, cells, totalQ, totalSites: allSites.size, totalCollectors: allColl.size };
      });
      const colTotals = stLocalities.map((loc, li) => ({
        questionnaires: mRows.reduce((a, r) => a + r.cells[li].questionnaires, 0),
        sites: new Set(filteredData.filter(r => r.state === state && (r.locality || '—') === loc && r.activitySite).map(r => r.activitySite)).size,
        collectors: new Set(filteredData.filter(r => r.state === state && (r.locality || '—') === loc && r.dataCollector).map(r => r.dataCollector)).size,
      }));
      // Grand totals: count ALL rows for this state (same population as grandSites/grandCollectors)
      const gQ = filteredData.filter(r => r.state === state).length;
      const gS = new Set(filteredData.filter(r => r.state === state && r.activitySite).map(r => r.activitySite)).size;
      const gC = new Set(filteredData.filter(r => r.state === state && r.dataCollector).map(r => r.dataCollector)).size;
      return { state, localities: stLocalities, activities: stActivities, matrix: mRows, colTotals, grandQ: gQ, grandSites: gS, grandCollectors: gC };
    }).filter(s => s.grandQ > 0);

    const matrix = activities.map(act => {
      const cells = hubs.map(hub => ({
        questionnaires: qMatrix[act]?.[hub] || 0,
        sites: siteSetMatrix[act]?.[hub]?.size || 0,
        collectors: collMatrix[act]?.[hub]?.size || 0,
      }));
      const totalQ = cells.reduce((a, c) => a + c.questionnaires, 0);
      const totalSites = new Set<string>();
      hubs.forEach(hub => {
        (siteSetMatrix[act]?.[hub] || new Set()).forEach(s => totalSites.add(s));
      });
      const totalColl = new Set<string>();
      hubs.forEach(hub => {
        (collMatrix[act]?.[hub] || new Set()).forEach(c => totalColl.add(c));
      });
      return { activity: act, isPdm: isPdmActivity(act), cells, totalQ, totalSites: totalSites.size, totalCollectors: totalColl.size };
    });

    const hubTotals = hubs.map((hub, hi) => {
      const q = matrix.reduce((a, r) => a + r.cells[hi].questionnaires, 0);
      const siteSet = new Set<string>();
      activities.forEach(act => {
        (siteSetMatrix[act]?.[hub] || new Set()).forEach(s => siteSet.add(s));
      });
      const collSet = new Set<string>();
      activities.forEach(act => {
        (collMatrix[act]?.[hub] || new Set()).forEach(c => collSet.add(c));
      });
      return { questionnaires: q, sites: siteSet.size, collectors: collSet.size };
    });

    const grandQ = matrix.reduce((a, r) => a + r.totalQ, 0);
    const grandSites = new Set<string>();
    const grandColl = new Set<string>();
    activities.forEach(act => {
      hubs.forEach(hub => {
        (siteSetMatrix[act]?.[hub] || new Set()).forEach(s => grandSites.add(s));
        (collMatrix[act]?.[hub] || new Set()).forEach(c => grandColl.add(c));
      });
    });

    const stateBreakdown = states.map(state => {
      const actData = activities.map(act => ({
        activity: act,
        questionnaires: stateActMatrix[state]?.[act]?.q || 0,
        sites: stateActMatrix[state]?.[act]?.sites?.size || 0,
      }));
      return { state, activities: actData, totalQ: actData.reduce((a, d) => a + d.questionnaires, 0) };
    }).filter(s => s.totalQ > 0);

    return { hubs, activities, matrix, hubTotals, grandQ, grandSites: grandSites.size, grandCollectors: grandColl.size, stateBreakdown, hubTrackers, stateTrackers };
  }, [filteredData]);

  const computeReportSummary = useMemo(() => {
    if (filteredData.length === 0) return null;
    return computeSummaryFromData(filteredData, data, fileName, cleanResults);
  }, [filteredData, data, cleanResults, fileName]);

  const fetchEmailProfiles = useCallback(async () => {
    setEmailProfilesLoading(true);
    try {
      let profiles: any[] = [];
      try {
        const { data, error } = await supabase.from('profiles').select('id, full_name, email, role').eq('status', 'approved');
        if (!error && data && data.length > 0) {
          profiles = data;
        }
      } catch (_) {}
      if (profiles.length === 0) {
        try {
          const { data } = await supabase.from('profiles').select('id, full_name, email, role');
          if (data && data.length > 0) {
            profiles = data;
          }
        } catch (_) {}
      }
      if (profiles.length === 0) {
        try {
          const { data } = await supabase.from('profiles').select('id, full_name, email, role').limit(500);
          if (data) profiles = data;
        } catch (_) {}
      }
      const mapped = profiles
        .filter((p: any) => p.email)
        .map((p: any) => ({ id: p.id, name: p.full_name || p.email, email: p.email, role: p.role || 'Other' }));
      setEmailUsers(mapped);
    } catch (e) {
      console.error('Failed to fetch profiles:', e);
      setEmailUsers([]);
    } finally {
      setEmailProfilesLoading(false);
    }
  }, []);

  const openSectionEmailDialog = useCallback(async (section: string, type: 'report' | 'coverage' | 'analytics_excel' | 'analytics_pdf' | 'tracker_excel' | 'tracker_all' = 'coverage') => {
    const rawMonth = computeReportSummary?.monthCoverage;
    const month = (rawMonth && rawMonth !== 'N/A')
      ? rawMonth
      : currentSessionName || fileName.replace(/\.[^.]+$/, '') || format(new Date(), 'MMMM yyyy');
    const isReport = type === 'report';
    setEmailSubject(`${section} - ${month}`);
    setEmailType(type);
    setEmailAttachReview(isReport);
    setEmailAttachCleaned(isReport);
    setEmailToUsers([]);
    setEmailToInput('');
    setEmailCcRoles([]);
    setEmailCcUsers([]);
    setEmailCcInput('');
    setEmailCcSearchOpen(false);
    setEmailHighPriority(isReport || type === 'analytics_pdf');
    setShowEmailDialog(true);
    const timeout = setTimeout(() => setEmailProfilesLoading(false), 10000);
    try {
      await fetchEmailProfiles();
    } finally {
      clearTimeout(timeout);
    }
  }, [computeReportSummary, fetchEmailProfiles]);

  const openEmailDialog = useCallback(() => openSectionEmailDialog('Questionnaire Data Report', 'report'), [openSectionEmailDialog]);
  const openCoverageEmailDialog = useCallback(() => openSectionEmailDialog('Coverage Tracker Report', 'coverage'), [openSectionEmailDialog]);
  const openAnalyticsExcelEmailDialog = useCallback(() => openSectionEmailDialog('Questionnaire Analytics (Excel)', 'analytics_excel'), [openSectionEmailDialog]);
  const openAnalyticsPdfEmailDialog = useCallback(() => openSectionEmailDialog('Questionnaire Analytics (Full PDF)', 'analytics_pdf'), [openSectionEmailDialog]);
  const openTrackerExcelEmailDialog = useCallback(() => openSectionEmailDialog('Tracker Report (Excel)', 'tracker_excel'), [openSectionEmailDialog]);
  const openAllTrackerEmailDialog = useCallback(() => {
    setTrackerAllFormat('excel');
    openSectionEmailDialog('Combined Tracker Report', 'tracker_all');
  }, [openSectionEmailDialog]);

  const getEmailCcList = useMemo(() => {
    const fromRoles = emailCcRoles.length > 0 ? emailUsers.filter(u => emailCcRoles.includes(u.role)) : [];
    const combined = [...emailCcUsers];
    fromRoles.forEach(u => {
      if (!combined.find(c => c.email === u.email)) combined.push(u);
    });
    return combined;
  }, [emailCcRoles, emailUsers, emailCcUsers]);

  const emailToFilteredUsers = useMemo(() => {
    const q = emailToInput.trim().toLowerCase();
    const filtered = !q ? emailUsers : emailUsers.filter(u =>
      u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.role.toLowerCase().includes(q)
    );
    return filtered.slice(0, 30);
  }, [emailToInput, emailUsers]);

  const emailToGroupedUsers = useMemo(() => {
    const groups: Record<string, typeof emailToFilteredUsers> = {};
    emailToFilteredUsers.forEach(u => {
      const role = u.role || 'Other';
      if (!groups[role]) groups[role] = [];
      groups[role].push(u);
    });
    return groups;
  }, [emailToFilteredUsers]);

  const emailToRecipientLabel = useMemo(() => {
    if (emailToUsers.length === 0) return '';
    const names = emailToUsers.map(u => u.name || u.email);
    if (names.length <= 2) return names.join(' & ');
    return `${names[0]}, ${names[1]} and ${names.length - 2} others`;
  }, [emailToUsers]);

  const addEmailToUser = useCallback((user: {id?: string; name: string; email: string; role?: string; isSystemUser?: boolean}) => {
    setEmailToUsers(prev => {
      if (prev.find(u => u.email === user.email)) return prev;
      return [...prev, user];
    });
    setEmailToInput('');
    setEmailToSearchOpen(false);
  }, []);

  const addEmailToManual = useCallback(() => {
    const email = emailToInput.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    addEmailToUser({ name: email, email, isSystemUser: false });
    setEmailToSearchOpen(false);
  }, [emailToInput, addEmailToUser]);

  const addEmailToGroup = useCallback((role: string) => {
    const groupUsers = emailUsers.filter(u => u.role === role);
    setEmailToUsers(prev => {
      const existing = new Set(prev.map(u => u.email));
      const newUsers = groupUsers.filter(u => !existing.has(u.email)).map(u => ({ ...u, isSystemUser: true }));
      return [...prev, ...newUsers];
    });
  }, [emailUsers]);

  const removeEmailToUser = useCallback((email: string) => {
    setEmailToUsers(prev => prev.filter(u => u.email !== email));
  }, []);

  const emailCcFilteredUsers = useMemo(() => {
    const q = emailCcInput.trim().toLowerCase();
    const filtered = !q ? emailUsers : emailUsers.filter(u =>
      u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.role.toLowerCase().includes(q)
    );
    return filtered.slice(0, 30);
  }, [emailCcInput, emailUsers]);

  const emailCcGroupedUsers = useMemo(() => {
    const groups: Record<string, typeof emailCcFilteredUsers> = {};
    emailCcFilteredUsers.forEach(u => {
      const role = u.role || 'Other';
      if (!groups[role]) groups[role] = [];
      groups[role].push(u);
    });
    return groups;
  }, [emailCcFilteredUsers]);

  const addEmailCcUser = useCallback((user: {id?: string; name: string; email: string; role?: string; isSystemUser?: boolean}) => {
    setEmailCcUsers(prev => {
      if (prev.find(u => u.email === user.email)) return prev;
      return [...prev, user];
    });
    setEmailCcInput('');
    setEmailCcSearchOpen(false);
  }, []);

  const addEmailCcManual = useCallback(() => {
    const email = emailCcInput.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    addEmailCcUser({ name: email, email, isSystemUser: false });
    setEmailCcSearchOpen(false);
  }, [emailCcInput, addEmailCcUser]);

  const addEmailCcGroup = useCallback((role: string) => {
    const groupUsers = emailUsers.filter(u => u.role === role);
    setEmailCcUsers(prev => {
      const existing = new Set(prev.map(u => u.email));
      const newUsers = groupUsers.filter(u => !existing.has(u.email)).map(u => ({ ...u, isSystemUser: true }));
      return [...prev, ...newUsers];
    });
  }, [emailUsers]);

  const removeEmailCcUser = useCallback((email: string) => {
    setEmailCcUsers(prev => prev.filter(u => u.email !== email));
  }, []);

  const buildEmailBody = useCallback((recipientName?: string, isSystemUser?: boolean, type?: 'report' | 'coverage' | 'analytics_excel' | 'analytics_pdf' | 'tracker_excel' | 'tracker_all') => {
    const s = computeReportSummary;
    const rawMonth = s?.monthCoverage;
    const month = (rawMonth && rawMonth !== 'N/A')
      ? rawMonth
      : currentSessionName || fileName.replace(/\.[^.]+$/, '') || '';
    const greeting = recipientName || 'Team';
    const reportLabels: Record<string, { en: string; ar: string }> = {
      report: { en: 'Questionnaire Data Report', ar: 'تقرير بيانات الاستبيانات' },
      coverage: { en: 'Coverage Tracker Report', ar: 'تقرير متابعة التغطية' },
      analytics_excel: { en: 'Questionnaire Analytics Report (Excel)', ar: 'تقرير تحليل الاستبيانات (إكسل)' },
      analytics_pdf: { en: 'Questionnaire Analytics Report (Full PDF with Collector Details)', ar: 'تقرير تحليل الاستبيانات الشامل (بتفاصيل جامعي البيانات)' },
      tracker_excel: { en: 'Tracker Report (Excel)', ar: 'تقرير المتابعة (إكسل)' },
      tracker_all: { en: 'Combined Tracker Report (Summary, By Hub, By State & Enumerators)', ar: 'تقرير المتابعة الشامل (الملخص، حسب الهاب، حسب الولاية وجامعو البيانات)' },
    };
    const labels = reportLabels[type || 'report'] || reportLabels.report;

    const en = [
      `Dear ${greeting},`,
      '',
      `Please find attached the ${labels.en}${month ? ` for ${month}` : ''}.`,
      'Kindly review and confirm.',
      '',
      'Best regards,',
      'PACT Command Center',
    ].join('\n');

    const ar = [
      '',
      '---',
      '',
      `عزيزي/عزيزتي ${greeting}،`,
      '',
      `يرجى الاطلاع على ${labels.ar} المرفق${month ? ` لشهر ${month}` : ''}.`,
      'يرجى المراجعة والتأكيد.',
      '',
      'مع أطيب التحيات،',
      'مركز قيادة PACT',
    ].join('\n');

    return `${en}\n${ar}`;
  }, [computeReportSummary]);

  const getEmailBody = useMemo(() => {
    return buildEmailBody(
      emailToUsers.length > 0 ? emailToRecipientLabel : undefined,
      emailToUsers.some(u => u.isSystemUser),
      emailType
    );
  }, [buildEmailBody, emailToUsers, emailToRecipientLabel, emailType]);

  const bufferToBase64 = useCallback((buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }, []);

  const generateExcelBase64 = useCallback(async (type: 'cleaned' | 'review'): Promise<string | null> => {
    if (!cleanResults) return null;
    const ExcelJS = (await import('exceljs')).default;
    try {
      if (type === 'cleaned') {
        const finalData = getCustomCleanedData();
        const reportSummary = computeSummaryFromData(finalData, data, fileName, cleanResults);
        const wb = new ExcelJS.Workbook();
        wb.creator = 'PACT Command Center';
        const hFill: any = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2041' } };
        const hFont: any = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10, name: 'Calibri' };
        const bFont: any = { size: 10, name: 'Calibri' };
        const border: any = { top: { style: 'thin', color: { argb: 'FFC8CDD7' } }, bottom: { style: 'thin', color: { argb: 'FFC8CDD7' } }, left: { style: 'thin', color: { argb: 'FFC8CDD7' } }, right: { style: 'thin', color: { argb: 'FFC8CDD7' } } };
        const altBg: any = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FC' } };

        const ws = wb.addWorksheet('Cleaned Data');
        const headers = ['Hub', 'State', 'Locality', 'Activity Site', 'Activity', 'Sub Activity', 'Data Collector', 'Device ID', 'Supervisor', 'Date', 'Site ID', 'Partner'];
        const hr = ws.addRow(headers);
        hr.eachCell(c => { c.fill = hFill; c.font = hFont; c.border = border; c.alignment = { horizontal: 'center', vertical: 'middle' }; });
        hr.height = 22;
        finalData.forEach((r, i) => {
          const row = ws.addRow([r.hub, r.state, r.locality, r.activitySite, r.activity, r.subActivity, r.dataCollector, r.deviceId, r.supervisor, r.date, r.siteId, r.partner]);
          row.eachCell(c => { c.font = bFont; c.border = border; if (i % 2 === 1) c.fill = altBg; });
        });
        ws.columns = [{ width: 18 }, { width: 16 }, { width: 18 }, { width: 30 }, { width: 16 }, { width: 20 }, { width: 25 }, { width: 20 }, { width: 20 }, { width: 14 }, { width: 14 }, { width: 20 }];

        const summaryWs = wb.addWorksheet('Summary');
        const addSection = (text: string) => {
          const r = summaryWs.addRow([text, '']);
          r.eachCell(c => { c.fill = hFill; c.font = hFont; });
        };
        const addR = (label: string, value: string | number) => {
          const r = summaryWs.addRow([label, value]);
          r.eachCell(c => { c.font = bFont; c.border = border; });
        };
        addSection('Report Information');
        addR('Report Title', 'Data Quality & Coverage Report');
        addR('Generated Date', format(new Date(), 'MMMM d, yyyy h:mm a'));
        addR('File Name', fileName);
        addR('Month Coverage', reportSummary?.monthCoverage || 'N/A');
        summaryWs.addRow([]);
        addSection('Cleaning Metrics');
        addR('Original Rows', cleanResults.originalCount);
        addR('Cleaned Rows', finalData.length);
        addR('Duplicates Removed', customDupsRemoved);
        addR('Empty Rows Removed', cleanResults.emptyRowsRemoved);
        addR('Fields Trimmed', cleanResults.trimmedFields);
        addR('Names Standardized', cleanResults.namesStandardized);
        addR('Data Quality Score', cleanResults.originalCount > 0 ? ((finalData.length / cleanResults.originalCount) * 100).toFixed(1) + '%' : '100%');
        summaryWs.addRow([]);
        addSection('Coverage Totals');
        addR('Total Questionnaires', reportSummary?.totalQuestionnaires || finalData.length);
        addR('Unique Sites', reportSummary?.uniqueSites || 0);
        addR('Hubs', reportSummary?.uniqueHubs || 0);
        addR('States', reportSummary?.uniqueStates || 0);
        addR('Localities', reportSummary?.uniqueLocalities || 0);
        addR('Data Collectors', reportSummary?.totalCollectors || 0);
        addR('Supervisors', reportSummary?.totalSupervisors || 0);
        if (reportSummary) {
          summaryWs.addRow([]);
          addSection('Team Roster');
          reportSummary.teamOverview.forEach(team => {
            const sr = summaryWs.addRow([`Supervisor: ${team.supervisor}`, `${team.teamSize} DCs, ${team.totalQ} Q`]);
            sr.getCell(1).font = { ...bFont, bold: true };
            team.collectors.forEach(dc => addR(`  ${dc.name}`, `Device: ${dc.deviceId} | ${dc.count} Q`));
          });
          summaryWs.addRow([]);
          addSection('Hub Coverage');
          reportSummary.hubBreakdown.forEach(h => addR(h.hub, `${h.questionnaires} Q, ${h.sites} sites`));
        }
        summaryWs.columns = [{ width: 35 }, { width: 40 }];

        const buf = await wb.xlsx.writeBuffer();
        return bufferToBase64(buf as ArrayBuffer);
      } else {
        const safe = (v: string | undefined | null) => (v || '').trim();
        const dupRowIndices = new Set<number>();
        const dupGroupMap = new Map<number, number>();
        cleanResults.duplicateGroups.forEach((group, gi) => { group.rows.forEach(r => { dupRowIndices.add(r.index); dupGroupMap.set(r.index, gi + 1); }); });
        const emptyRowIndices = new Set(cleanResults.emptyRows.map(r => r.index));
        const trimMap = new Map<string, { before: string; after: string }>();
        cleanResults.trimmedDetails.forEach(td => { trimMap.set(`${td.index}|${td.field}`, { before: td.before, after: td.after }); });
        const nameMap = new Map<number, { oldName: string; newName: string }>();
        cleanResults.nameChanges.forEach(nc => { nameMap.set(nc.index, { oldName: nc.oldName, newName: nc.newName }); });

        const wb = new ExcelJS.Workbook();
        wb.creator = 'PACT Command Center';
        const ws = wb.addWorksheet('Data Review');
        const headers = ['Row #', 'Issue', 'Hub', 'State', 'Locality', 'Activity Site', 'Activity', 'Sub Activity', 'Data Collector', 'Device ID', 'Supervisor', 'Date', 'Site ID', 'Partner'];
        const fieldKeys: (keyof QuestionnaireRow)[] = ['hub', 'state', 'locality', 'activitySite', 'activity', 'subActivity', 'dataCollector', 'deviceId', 'supervisor', 'date', 'siteId', 'partner'];
        const headerRow = ws.addRow(headers);
        headerRow.eachCell(cell => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.border = { bottom: { style: 'thin', color: { argb: 'FF374151' } } };
        });
        const redFill: any = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
        const orangeFill: any = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7ED' } };
        const blueFill: any = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
        const purpleFill: any = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F3FF' } };
        const greenFill: any = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDF4' } };
        const redFont: any = { color: { argb: 'FFDC2626' } };
        const orangeFont: any = { color: { argb: 'FFEA580C' } };
        const blueFont: any = { color: { argb: 'FF2563EB' } };
        const purpleFont: any = { color: { argb: 'FF9333EA' } };
        data.forEach((row, idx) => {
          const issues: string[] = [];
          let rowFill: any = null;
          let issueFont: any = {};
          const isDuplicate = dupRowIndices.has(idx);
          const isEmpty = emptyRowIndices.has(idx);
          const hasNameChange = nameMap.has(idx);
          const hasTrim = fieldKeys.some(k => trimMap.has(`${idx}|${k}`));
          if (isDuplicate) { issues.push(`DUPLICATE (Group ${dupGroupMap.get(idx)})`); rowFill = redFill; issueFont = redFont; }
          if (isEmpty) { issues.push('EMPTY ROW'); rowFill = orangeFill; issueFont = orangeFont; }
          if (hasNameChange) { const nc = nameMap.get(idx)!; issues.push(`NAME: "${nc.oldName}" → "${nc.newName}"`); if (!rowFill) { rowFill = purpleFill; issueFont = purpleFont; } }
          if (hasTrim) { issues.push(`TRIMMED: ${fieldKeys.filter(k => trimMap.has(`${idx}|${k}`)).join(', ')}`); if (!rowFill) { rowFill = blueFill; issueFont = blueFont; } }
          const values = [idx + 1, issues.join(' | ') || '', ...fieldKeys.map(k => row[k] || '')];
          const excelRow = ws.addRow(values);
          if (rowFill) excelRow.eachCell(cell => { cell.fill = rowFill!; });
          if (issues.length > 0) excelRow.getCell(2).font = { ...issueFont, bold: true, size: 10 };
          if (!issues.length) {
            excelRow.eachCell((cell, colNum) => { if (colNum > 2) cell.fill = greenFill; });
            excelRow.getCell(2).value = 'OK';
            excelRow.getCell(2).font = { color: { argb: 'FF16A34A' }, italic: true, size: 10 };
          }
          fieldKeys.forEach((key, ki) => {
            const trimKey = `${idx}|${key}`;
            if (trimMap.has(trimKey)) { const td = trimMap.get(trimKey)!; const cell = excelRow.getCell(ki + 3); cell.note = `Whitespace trimmed:\nBefore: "${td.before}"\nAfter: "${td.after}"`; cell.font = { color: { argb: 'FF2563EB' }, italic: true }; }
          });
          if (hasNameChange) { const nc = nameMap.get(idx)!; const dcCell = excelRow.getCell(fieldKeys.indexOf('dataCollector') + 3); dcCell.note = `Name standardized:\nOriginal: "${nc.oldName}"\nStandard: "${nc.newName}"`; dcCell.font = { color: { argb: 'FF9333EA' }, bold: true }; }
        });
        ws.columns = [{ width: 8 }, { width: 35 }, { width: 18 }, { width: 16 }, { width: 18 }, { width: 30 }, { width: 16 }, { width: 20 }, { width: 25 }, { width: 20 }, { width: 20 }, { width: 14 }, { width: 14 }, { width: 20 }];
        ws.autoFilter = { from: 'A1', to: `N${data.length + 1}` };

        const legendWs = wb.addWorksheet('Legend');
        const lh = legendWs.addRow(['Color', 'Meaning', 'Details']);
        lh.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } }; cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }; });
        [{ color: 'FFFEE2E2', label: 'Red', meaning: 'Duplicate Row', details: 'Row has identical key fields to another row.' },
         { color: 'FFFFF7ED', label: 'Orange', meaning: 'Empty Row', details: 'Row has no meaningful data.' },
         { color: 'FFEFF6FF', label: 'Blue', meaning: 'Trimmed Fields', details: 'Extra whitespace removed.' },
         { color: 'FFF5F3FF', label: 'Purple', meaning: 'Name Standardized', details: 'Collector name unified.' },
         { color: 'FFF0FDF4', label: 'Green', meaning: 'No Issues', details: 'Row passed all checks.' }]
        .forEach(l => { const r = legendWs.addRow([l.label, l.meaning, l.details]); r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: l.color } }; r.getCell(1).font = { bold: true }; });
        legendWs.columns = [{ width: 12 }, { width: 25 }, { width: 80 }];

        const summaryWs = wb.addWorksheet('Summary');
        const rptSummary = computeSummaryFromData(data, data, fileName, cleanResults);
        const addSec = (text: string) => { const r = summaryWs.addRow([text, '']); r.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } }; c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }; }); };
        const addSR = (label: string, value: string | number) => summaryWs.addRow([label, value]);
        addSec('Report Information');
        addSR('Report Title', 'Data Quality & Coverage Report');
        addSR('Generated Date', format(new Date(), 'MMMM d, yyyy h:mm a'));
        addSR('File Name', fileName);
        addSR('Month Coverage', rptSummary?.monthCoverage || 'N/A');
        summaryWs.addRow([]);
        addSec('Data Quality Metrics');
        addSR('Total Rows', data.length);
        addSR('Duplicate Rows', cleanResults.duplicateGroups.reduce((s, g) => s + g.rows.length, 0));
        addSR('Duplicate Groups', cleanResults.duplicateGroups.length);
        addSR('Empty Rows', cleanResults.emptyRowsRemoved);
        addSR('Fields Trimmed', cleanResults.trimmedFields);
        addSR('Names Standardized', cleanResults.namesStandardized);
        const cleanRowCount = data.length - cleanResults.emptyRowsRemoved - cleanResults.duplicateGroups.reduce((s, g) => s + g.rows.length, 0);
        addSR('Clean Rows', cleanRowCount);
        addSR('Data Quality Score', data.length > 0 ? ((cleanRowCount / data.length) * 100).toFixed(1) + '%' : '100%');
        if (rptSummary) {
          summaryWs.addRow([]);
          addSec('Coverage Totals');
          addSR('Total Questionnaires', rptSummary.totalQuestionnaires);
          addSR('Unique Sites', rptSummary.uniqueSites);
          addSR('Hubs', rptSummary.uniqueHubs);
          addSR('States', rptSummary.uniqueStates);
          addSR('Localities', rptSummary.uniqueLocalities);
          summaryWs.addRow([]);
          addSec('Hub Coverage');
          rptSummary.hubBreakdown.forEach(h => addSR(h.hub, `${h.questionnaires} Q, ${h.sites} sites`));
        }
        summaryWs.columns = [{ width: 35 }, { width: 40 }];

        const buf = await wb.xlsx.writeBuffer();
        return bufferToBase64(buf as ArrayBuffer);
      }
    } catch (e) { console.error('Failed to generate Excel:', e); return null; }
  }, [cleanResults, data, getCustomCleanedData, fileName, customDupsRemoved, bufferToBase64]);

  const generateCoverageTrackerBase64 = useCallback(async (): Promise<string | null> => {
    if (!filteredData || filteredData.length === 0) return null;
    try {
      const buffer = await buildCoverageTrackerWorkbook(filteredData, currentSessionName || undefined);
      return bufferToBase64(buffer);
    } catch (e) {
      console.error('Failed to generate coverage tracker base64:', e);
      return null;
    }
  }, [filteredData, currentSessionName, bufferToBase64]);

  const generatePdfBase64 = useCallback(async (type: 'cleaned' | 'review' | 'coverage'): Promise<string | null> => {
    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(15, 32, 65);

      if (type === 'coverage') {
        if (!filteredData || filteredData.length === 0) return null;
        const hasArabicFont = await loadArabicFont(doc);
        const label = currentSessionName?.trim() || new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });
        doc.text(`Coverage Tracker Report - ${label}`, 14, 15);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        doc.text(`Generated: ${format(new Date(), 'MMMM d, yyyy h:mm a')}`, 14, 22);

        const hubGroups = new Map<string, { state: string; collector: string; deviceId: string; activity: string }[]>();
        filteredData.forEach(row => {
          if (!row.hub) return;
          if (!hubGroups.has(row.hub)) hubGroups.set(row.hub, []);
          hubGroups.get(row.hub)!.push({ state: row.state || '', collector: row.dataCollector || '', deviceId: row.deviceId || '', activity: row.activity || '' });
        });

        let yPos = 28;
        const bodyFontName = hasArabicFont ? 'Amiri' : 'helvetica';
        hubGroups.forEach((rows, hub) => {
          if (yPos > 170) { doc.addPage(); yPos = 15; }
          doc.setFontSize(11);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(15, 32, 65);
          doc.text(hub, 14, yPos);
          yPos += 2;
          autoTable(doc, {
            startY: yPos,
            head: [['State', 'Data Collector', 'Device ID', 'Activity']],
            body: rows.map(r => [r.state, r.collector, r.deviceId, r.activity]),
            theme: 'grid',
            headStyles: { fillColor: [15, 32, 65], textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
            bodyStyles: { fontSize: 7, textColor: [20, 20, 30], font: bodyFontName },
            alternateRowStyles: { fillColor: [245, 247, 252] },
            margin: { left: 14, right: 14 },
            tableWidth: 'auto',
          });
          yPos = (doc as any).lastAutoTable.finalY + 8;
        });

        const totalQ = filteredData.length;
        const totalHubs = hubGroups.size;
        if (yPos > 170) { doc.addPage(); yPos = 15; }
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(`Summary: ${totalQ} questionnaires across ${totalHubs} hubs`, 14, yPos);
      } else if (type === 'cleaned') {
        if (!cleanResults) return null;
        const finalData = getCustomCleanedData();
        const reportSummary = computeSummaryFromData(finalData, data, fileName, cleanResults);
        doc.text('Cleaned Data Report', 14, 15);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        doc.text(`Generated: ${format(new Date(), 'MMMM d, yyyy h:mm a')} | File: ${fileName}`, 14, 22);

        autoTable(doc, {
          startY: 28,
          head: [['Metric', 'Value']],
          body: [
            ['Original Rows', String(cleanResults.originalCount)],
            ['Cleaned Rows', String(finalData.length)],
            ['Duplicates Removed', String(customDupsRemoved)],
            ['Empty Rows Removed', String(cleanResults.emptyRowsRemoved)],
            ['Data Quality Score', cleanResults.originalCount > 0 ? ((finalData.length / cleanResults.originalCount) * 100).toFixed(1) + '%' : '100%'],
            ['Total Questionnaires', String(reportSummary?.totalQuestionnaires || finalData.length)],
            ['Unique Sites', String(reportSummary?.uniqueSites || 0)],
            ['Hubs', String(reportSummary?.uniqueHubs || 0)],
            ['States', String(reportSummary?.uniqueStates || 0)],
          ],
          theme: 'grid',
          headStyles: { fillColor: [15, 32, 65], textColor: [255, 255, 255], fontSize: 9, fontStyle: 'bold' },
          bodyStyles: { fontSize: 8 },
          columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 }, 1: { cellWidth: 50 } },
          margin: { left: 14, right: 14 },
        });

        let yPos = (doc as any).lastAutoTable.finalY + 8;
        if (reportSummary && reportSummary.hubBreakdown.length > 0) {
          if (yPos > 170) { doc.addPage(); yPos = 15; }
          doc.setFontSize(11);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(15, 32, 65);
          doc.text('Coverage by Hub', 14, yPos);
          yPos += 2;
          autoTable(doc, {
            startY: yPos,
            head: [['Hub', 'Sites', 'Questionnaires']],
            body: [
              ...reportSummary.hubBreakdown.map(h => [h.hub, String(h.sites), String(h.questionnaires)]),
              ['Total', String(reportSummary.hubBreakdown.reduce((s, h) => s + h.sites, 0)), String(reportSummary.hubBreakdown.reduce((s, h) => s + h.questionnaires, 0))],
            ],
            theme: 'grid',
            headStyles: { fillColor: [15, 32, 65], textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
            bodyStyles: { fontSize: 8 },
            margin: { left: 14, right: 14 },
          });
        }

        yPos = (doc as any).lastAutoTable.finalY + 8;
        if (yPos > 160) { doc.addPage(); yPos = 15; }
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 32, 65);
        doc.text('Cleaned Data', 14, yPos);
        yPos += 2;
        const pageRows = finalData.slice(0, 500);
        autoTable(doc, {
          startY: yPos,
          head: [['Hub', 'State', 'Locality', 'Activity', 'Data Collector', 'Device ID', 'Supervisor', 'Date']],
          body: pageRows.map(r => [r.hub || '', r.state || '', r.locality || '', r.activity || '', r.dataCollector || '', r.deviceId || '', r.supervisor || '', r.date || '']),
          theme: 'grid',
          headStyles: { fillColor: [15, 32, 65], textColor: [255, 255, 255], fontSize: 7, fontStyle: 'bold' },
          bodyStyles: { fontSize: 6 },
          alternateRowStyles: { fillColor: [245, 247, 252] },
          margin: { left: 14, right: 14 },
        });
        if (finalData.length > 500) {
          const fy = (doc as any).lastAutoTable.finalY + 5;
          doc.setFontSize(8);
          doc.setFont('helvetica', 'italic');
          doc.text(`Showing first 500 of ${finalData.length} rows. Full data available in Excel attachment.`, 14, fy);
        }
      } else {
        if (!cleanResults) return null;
        doc.text('Data Review Report', 14, 15);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        doc.text(`Generated: ${format(new Date(), 'MMMM d, yyyy h:mm a')} | File: ${fileName}`, 14, 22);

        autoTable(doc, {
          startY: 28,
          head: [['Metric', 'Value']],
          body: [
            ['Total Rows', String(data.length)],
            ['Duplicate Rows', String(cleanResults.duplicateGroups.reduce((s, g) => s + g.rows.length, 0))],
            ['Duplicate Groups', String(cleanResults.duplicateGroups.length)],
            ['Empty Rows', String(cleanResults.emptyRowsRemoved)],
            ['Fields Trimmed', String(cleanResults.trimmedFields)],
            ['Names Standardized', String(cleanResults.namesStandardized)],
          ],
          theme: 'grid',
          headStyles: { fillColor: [15, 32, 65], textColor: [255, 255, 255], fontSize: 9, fontStyle: 'bold' },
          bodyStyles: { fontSize: 8 },
          columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 }, 1: { cellWidth: 50 } },
          margin: { left: 14, right: 14 },
        });

        let yPos = (doc as any).lastAutoTable.finalY + 8;
        if (yPos > 160) { doc.addPage(); yPos = 15; }
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 32, 65);
        doc.text('Legend', 14, yPos);
        yPos += 2;
        autoTable(doc, {
          startY: yPos,
          head: [['Color', 'Meaning']],
          body: [['Red', 'Duplicate Row'], ['Orange', 'Empty Row'], ['Blue', 'Trimmed Fields'], ['Purple', 'Name Standardized'], ['Green', 'No Issues']],
          theme: 'grid',
          headStyles: { fillColor: [15, 32, 65], textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
          bodyStyles: { fontSize: 8 },
          margin: { left: 14, right: 14 },
        });

        yPos = (doc as any).lastAutoTable.finalY + 8;
        if (yPos > 160) { doc.addPage(); yPos = 15; }
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 32, 65);
        doc.text('Data Review (First 300 rows)', 14, yPos);
        yPos += 2;
        const dupRowIndices = new Set<number>();
        cleanResults.duplicateGroups.forEach(g => g.rows.forEach(r => dupRowIndices.add(r.index)));
        const emptyRowIndices = new Set(cleanResults.emptyRows.map(r => r.index));
        const previewRows = data.slice(0, 300);
        autoTable(doc, {
          startY: yPos,
          head: [['#', 'Issue', 'Hub', 'State', 'Activity', 'Collector', 'Device ID']],
          body: previewRows.map((row, idx) => {
            let issue = 'OK';
            if (dupRowIndices.has(idx)) issue = 'DUPLICATE';
            else if (emptyRowIndices.has(idx)) issue = 'EMPTY';
            return [String(idx + 1), issue, row.hub || '', row.state || '', row.activity || '', row.dataCollector || '', row.deviceId || ''];
          }),
          theme: 'grid',
          headStyles: { fillColor: [15, 32, 65], textColor: [255, 255, 255], fontSize: 6, fontStyle: 'bold' },
          bodyStyles: { fontSize: 5.5 },
          alternateRowStyles: { fillColor: [245, 247, 252] },
          margin: { left: 14, right: 14 },
          didParseCell: (hookData: any) => {
            if (hookData.section === 'body' && hookData.column.index === 1) {
              const v = hookData.cell.raw;
              if (v === 'DUPLICATE') hookData.cell.styles.textColor = [220, 38, 38];
              else if (v === 'EMPTY') hookData.cell.styles.textColor = [234, 88, 12];
              else hookData.cell.styles.textColor = [22, 163, 74];
            }
          },
        });
        if (data.length > 300) {
          const fy = (doc as any).lastAutoTable.finalY + 5;
          doc.setFontSize(8);
          doc.setFont('helvetica', 'italic');
          doc.text(`Showing first 300 of ${data.length} rows. Full data available in Excel attachment.`, 14, fy);
        }
      }

      const pdfBase64 = doc.output('datauristring').split(',')[1];
      return pdfBase64;
    } catch (e) {
      console.error('Failed to generate PDF:', e);
      return null;
    }
  }, [filteredData, cleanResults, data, fileName, currentSessionName, getCustomCleanedData, customDupsRemoved]);

  const generateAnalyticsExcelBase64 = useCallback(async (): Promise<string | null> => {
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      const hFill: any = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2041' } };
      const hFont: any = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      const bFont: any = { size: 9 };
      const border: any = { top: { style: 'thin', color: { argb: 'FFD0D5DD' } }, bottom: { style: 'thin', color: { argb: 'FFD0D5DD' } }, left: { style: 'thin', color: { argb: 'FFD0D5DD' } }, right: { style: 'thin', color: { argb: 'FFD0D5DD' } } };
      const altBg: any = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FC' } };
      const totalFill: any = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EBF0' } };

      const addSheet = (name: string, headers: string[], rows: (string | number)[][]) => {
        const ws = wb.addWorksheet(name);
        const hr = ws.addRow(headers);
        hr.eachCell(c => { c.fill = hFill; c.font = hFont; c.border = border; c.alignment = { horizontal: 'center' }; });
        rows.forEach((row, ri) => {
          const dr = ws.addRow(row);
          dr.eachCell(c => { c.font = bFont; c.border = border; if (ri % 2 === 1) c.fill = altBg; });
        });
        ws.columns.forEach(col => { col.width = 20; });
        return ws;
      };

      const totalQ = filteredData.length;
      const totalSites = new Set(filteredData.map(r => r.activitySite).filter(Boolean)).size;

      addSheet('By Hub', ['#', 'Hub', 'Sites', 'Questionnaires', '%'],
        [...hubSummary.map((h, i) => [i + 1, h.name, h.sites, h.questionnaires, h.percentage.toFixed(1) + '%']),
        ['', 'Total', totalSites, totalQ, '100%']]);

      addSheet('By State', ['#', 'State', 'Sites', 'DC', 'Questionnaires', '%'],
        [...stateSummary.map((s, i) => [i + 1, s.name, s.sites, s.collectors, s.questionnaires, s.percentage.toFixed(1) + '%']),
        ['', 'Total', totalSites, '', totalQ, '100%']]);

      addSheet('By Locality', ['#', 'Locality', 'Sites', 'Questionnaires', '%'],
        [...localitySummary.map((l, i) => [i + 1, l.name, l.sites, l.questionnaires, l.percentage.toFixed(1) + '%']),
        ['', 'Total', totalSites, totalQ, '100%']]);

      addSheet('By Site', ['#', 'Site Name', 'Activity', 'State', 'Locality', 'DC', 'Questionnaires', '%'],
        siteDetailsWithActivity.map((s, i) => [i + 1, s.name, s.activityNames, s.state, s.locality, s.collectors, s.questionnaires, s.percentage.toFixed(1) + '%']));

      const actRows: (string | number)[][] = [];
      activityBreakdown.forEach(a => {
        actRows.push([a.name, String(a.siteCount), String(a.questionnaireCount), a.percentage.toFixed(1) + '%']);
      });
      actRows.push(['Total', String(totalSites), String(totalQ), '100%']);
      addSheet('By Activity', ['Activity', 'Sites', 'Questionnaires', '%'], actRows);

      addSheet('By Collector', ['#', 'UUID', 'Device ID', 'Data Collector', 'Hub', 'State', 'Sites', 'Activities', 'Questionnaires', '%'],
        [...collectorDetails.map((c, i) => [i + 1, c.profileId || '-', c.deviceId || '-', c.name, c.hubs.join(', '), c.states.join(', '),
          c.sites.length, c.activities.map((a: any) => `${a.name} (${a.count})`).join(', '), c.count, c.percentage.toFixed(1) + '%']),
        ['', '', '', 'Total', '', '', '', '', totalQ, '100%']]);

      const { hubs, matrix: tMatrix, hubTotals: tHubTotals } = trackerData;
      if (hubs.length > 0 && tMatrix.length > 0) {
        const tHeaders = ['Activity', ...hubs.flatMap(h => [`${h} Sites`, `${h} Actual`, `${h} DC`]), 'Total Sites', 'Total Actual', 'Total DC'];
        const tRows = tMatrix.map(row => {
          const r: (string | number)[] = [row.activity];
          hubs.forEach((_, hi) => { r.push(row.cells[hi].sites, row.cells[hi].questionnaires, row.cells[hi].collectors); });
          r.push(row.totalSites, row.totalQ, row.totalCollectors);
          return r;
        });
        const totalR: (string | number)[] = ['Grand Total'];
        hubs.forEach((_, hi) => { totalR.push(tHubTotals[hi].sites, tHubTotals[hi].questionnaires, tHubTotals[hi].collectors); });
        const gs = tMatrix.reduce((a, r) => a + r.totalSites, 0);
        const gq = tMatrix.reduce((a, r) => a + r.totalQ, 0);
        const gc = tMatrix.reduce((a, r) => a + r.totalCollectors, 0);
        totalR.push(gs, gq, gc);
        tRows.push(totalR);
        const ws = addSheet('Tracker', tHeaders, tRows);
        const lastRowNum = ws.rowCount;
        ws.getRow(lastRowNum).eachCell(c => { c.fill = totalFill; c.font = { ...bFont, bold: true }; c.border = border; });
      }

      const buffer = await wb.xlsx.writeBuffer();
      return bufferToBase64(buffer as ArrayBuffer);
    } catch (e) {
      console.error('Failed to generate analytics Excel base64:', e);
      return null;
    }
  }, [filteredData, hubSummary, stateSummary, localitySummary, siteSummary, siteDetailsWithActivity, activityBreakdown, collectorDetails, trackerData, bufferToBase64]);

  const generateAnalyticsPdfBase64 = useCallback(async (): Promise<string | null> => {
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      let y = await drawPdfHeader(doc, 'Questionnaire Analytics Report', 'تقرير تحليل الاستبيانات',
        `Total: ${filteredData.length} Questionnaires  |  ${new Set(filteredData.map(r => r.activitySite).filter(Boolean)).size} Sites`);
      const hasArabic = await loadArabicFont(doc);

      const totalQ = filteredData.length;
      const totalSites = new Set(filteredData.map(r => r.activitySite).filter(Boolean)).size;

      const hubRows = hubSummary.map((h, i) => [String(i + 1), h.name, String(h.sites), String(h.questionnaires), h.percentage.toFixed(1) + '%']);
      hubRows.push(['', 'Total', String(totalSites), String(totalQ), '100%']);
      y = styledAutoTable(doc, [['#', 'Hub', 'Sites', 'Questionnaires', '%']], hubRows, y - 2, { fontSize: 9, boldLastRow: true, useArabicFont: hasArabic });
      y += 4;

      if (y > 220) { doc.addPage(); addPageHeader(doc, 'By State'); y = 18; }
      doc.setFontSize(12); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
      doc.text('By State', 14, y); y += 3;
      const stateRows = stateSummary.map((s, i) => [String(i + 1), s.name, String(s.sites), String(s.collectors), String(s.questionnaires), s.percentage.toFixed(1) + '%']);
      stateRows.push(['', 'Total', String(totalSites), '', String(totalQ), '100%']);
      y = styledAutoTable(doc, [['#', 'State', 'Sites', 'DC', 'Questionnaires', '%']], stateRows, y, { fontSize: 9, boldLastRow: true, useArabicFont: hasArabic });
      y += 4;

      if (y > 220) { doc.addPage(); addPageHeader(doc, 'By Locality'); y = 18; }
      doc.setFontSize(12); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
      doc.text('By Locality', 14, y); y += 3;
      const locRows = localitySummary.map((l, i) => [String(i + 1), l.name, String(l.sites), String(l.questionnaires), l.percentage.toFixed(1) + '%']);
      locRows.push(['', 'Total', String(totalSites), String(totalQ), '100%']);
      y = styledAutoTable(doc, [['#', 'Locality', 'Sites', 'Questionnaires', '%']], locRows, y, { fontSize: 9, boldLastRow: true, useArabicFont: hasArabic });
      y += 4;

      if (y > 220) { doc.addPage(); addPageHeader(doc, 'By Activity'); y = 18; }
      doc.setFontSize(12); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
      doc.text('By Activity', 14, y); y += 3;
      const pdmSitesTotal = activityBreakdown.reduce((s, a) => s + (Math.floor(a.questionnaireCount / 7)), 0);
      const actRows = activityBreakdown.map(a => [a.name, String(a.siteCount), String(a.questionnaireCount), a.questionnaireCount ? String(Math.floor(a.questionnaireCount / 7)) : '-', a.percentage.toFixed(1) + '%']);
      actRows.push(['Total', String(totalSites), String(totalQ), pdmSitesTotal > 0 ? String(pdmSitesTotal) : '-', '100%']);
      y = styledAutoTable(doc, [['Activity', 'Sites', 'Questionnaires', 'PDM Sites', '%']], actRows, y, { fontSize: 9, boldLastRow: true, columnStyles: { 0: { cellWidth: 65 } }, useArabicFont: hasArabic });
      y += 4;

      if (y > 220) { doc.addPage(); addPageHeader(doc, 'By Data Collector'); y = 18; }
      doc.setFontSize(12); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
      doc.text('By Data Collector', 14, y); y += 3;
      const dcRows = collectorDetails.map((c, i) => [String(i + 1), c.profileId || '-', c.deviceId || '-', c.name, c.hubs.join(', '), c.states.join(', '), String(c.sites.length), c.activities.map((a: any) => a.name).join(', '), String(c.count), c.percentage.toFixed(1) + '%']);
      dcRows.push(['', '', '', 'Total', '', '', '', '', String(totalQ), '100%']);
      y = styledAutoTable(doc, [['#', 'UUID', 'Device ID', 'Collector', 'Hub', 'State', 'Sites', 'Activities', 'Q', '%']], dcRows, y, { fontSize: 6.5, boldLastRow: true, useArabicFont: hasArabic });
      y += 4;

      collectorDetails.forEach(c => {
        doc.addPage();
        addPageHeader(doc, 'Data Collector Report');
        y = 18;
        doc.setFontSize(12); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
        doc.text('Collector:', 14, y);
        if (hasArabic) { doc.setFont('Amiri', 'normal'); }
        doc.text(c.name, 42, y);
        doc.setFont('helvetica', 'normal');
        y += 5;
        doc.setFontSize(9); doc.setTextColor(90, 95, 110);
        doc.text(`UUID: ${c.profileId || '-'}  |  Device ID: ${c.deviceId || '-'}  |  Hub: ${c.hubs.join(', ')}  |  State: ${c.states.join(', ')}  |  ${c.count} Q (${c.percentage.toFixed(1)}%)`, 14, y);
        y += 6;
        if (c.nameVariants.length > 0) {
          doc.setFontSize(10); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
          doc.text(`Name Variants (${c.nameVariants.length + 1})`, 14, y); y += 3;
          const vRows = c.nameVariants.map((v: any, i: number) => [String(i + 1), v.name, String(v.count)]);
          vRows.unshift(['Primary', c.name, String(c.count - c.nameVariants.reduce((s: number, v: any) => s + v.count, 0))]);
          y = styledAutoTable(doc, [['#', 'Name', 'Count']], vRows, y, { fontSize: 8, useArabicFont: hasArabic });
          y += 4;
        }
        doc.setFontSize(10); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
        doc.text('Activities', 14, y); y += 3;
        const caRows = c.activities.map((a: any, i: number) => [String(i + 1), a.name, String(a.count)]);
        caRows.push(['', 'Total', String(c.count)]);
        y = styledAutoTable(doc, [['#', 'Activity', 'Count']], caRows, y, { fontSize: 9, boldLastRow: true, useArabicFont: hasArabic });
        y += 4;
        if (y > 240) { doc.addPage(); addPageHeader(doc, 'Data Collector Report'); y = 18; }
        doc.setFontSize(10); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
        doc.text('Localities', 14, y); y += 3;
        const clRows = c.localities.map((l: any, i: number) => [String(i + 1), l.name, String(l.count)]);
        clRows.push(['', 'Total', String(c.count)]);
        y = styledAutoTable(doc, [['#', 'Locality', 'Count']], clRows, y, { fontSize: 9, boldLastRow: true, useArabicFont: hasArabic });
        y += 4;
        if (c.sites.length > 0) {
          if (y > 240) { doc.addPage(); addPageHeader(doc, 'Data Collector Report'); y = 18; }
          doc.setFontSize(10); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
          doc.text(`Activity Sites (${c.sites.length})`, 14, y); y += 3;
          const csRows = c.sites.map((s: any, i: number) => [String(i + 1), s.name, s.locality || '-', s.state || '-', String(s.count)]);
          const csTotal = c.sites.reduce((sum: number, s: any) => sum + s.count, 0);
          csRows.push(['', 'Total', '', '', String(csTotal)]);
          y = styledAutoTable(doc, [['#', 'Site', 'Locality', 'State', 'Count']], csRows, y, { fontSize: 8, boldLastRow: true, useArabicFont: hasArabic });
        }
      });

      const { hubs: tHubs, matrix: tMatrix, hubTotals: tHubTotals, hubTrackers: tHubTrackers, stateTrackers: tStateTrackers } = trackerData;

      if (tHubs.length > 0 && tMatrix.length > 0) {
        doc.addPage(); addPageHeader(doc, 'Tracker - Activity by Hub'); y = 18;
        doc.setFontSize(13); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
        doc.text('Tracker — Activity by Hub', 14, y); y += 6;

        tHubs.forEach((hub: string, hi: number) => {
          if (y > 220) { doc.addPage(); addPageHeader(doc, 'Activity by Hub'); y = 18; }
          doc.setFontSize(11); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
          doc.text(hub, 14, y); y += 3;
          const aRows = tMatrix.filter(row => row.cells[hi].questionnaires > 0 || row.cells[hi].sites > 0).map(row => [
            row.activity, String(row.cells[hi].sites || '-'), String(row.cells[hi].questionnaires || '-'),
            row.cells[hi].questionnaires ? String(row.isPdm ? Math.floor(row.cells[hi].questionnaires / 7) : row.cells[hi].questionnaires) : '-',
            String(row.cells[hi].collectors || '-'),
          ]);
          const hubPdm = tMatrix.reduce((a: number, r: any) => a + (r.isPdm ? Math.floor(r.cells[hi].questionnaires / 7) : r.cells[hi].questionnaires), 0);
          aRows.push(['Total', String(tHubTotals[hi].sites), String(tHubTotals[hi].questionnaires), hubPdm ? String(hubPdm) : '-', String(tHubTotals[hi].collectors)]);
          y = styledAutoTable(doc, [['Activity', 'Sites', 'Actual', 'PDM Sites', 'DC']], aRows, y, { fontSize: 8, boldLastRow: true, columnStyles: { 0: { cellWidth: 55 } }, useArabicFont: hasArabic });
          y += 6;
        });
      }

      tHubTrackers.forEach(ht => {
        doc.addPage(); addPageHeader(doc, `Hub: ${ht.hub}`); y = 18;
        doc.setFontSize(12); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
        doc.text(`${ht.hub} — by State`, 14, y); y += 5;
        ht.states.forEach((st: string, si: number) => {
          if (y > 240) { doc.addPage(); addPageHeader(doc, `Hub: ${ht.hub}`); y = 18; }
          doc.setFontSize(10); doc.setTextColor(41, 98, 255); doc.setFont('helvetica', 'bold');
          doc.text(`State: ${st}`, 18, y); y += 3;
          const sRows = ht.matrix.filter(row => row.cells[si].questionnaires > 0 || row.cells[si].sites > 0).map(row => [
            row.activity, String(row.cells[si].sites || '-'), String(row.cells[si].questionnaires || '-'),
            row.cells[si].questionnaires ? String(row.isPdm ? Math.floor(row.cells[si].questionnaires / 7) : row.cells[si].questionnaires) : '-',
            String(row.cells[si].collectors || '-'),
          ]);
          const colPdm = ht.matrix.reduce((a: number, r: any) => a + (r.isPdm ? Math.floor(r.cells[si].questionnaires / 7) : r.cells[si].questionnaires), 0);
          sRows.push(['Total', String(ht.colTotals[si].sites), String(ht.colTotals[si].questionnaires), colPdm ? String(colPdm) : '-', String(ht.colTotals[si].collectors)]);
          y = styledAutoTable(doc, [['Activity', 'Sites', 'Actual', 'PDM Sites', 'DC']], sRows, y, { fontSize: 8, boldLastRow: true, columnStyles: { 0: { cellWidth: 55 } }, useArabicFont: hasArabic });
          y += 5;
        });
      });

      tStateTrackers.forEach(st => {
        doc.addPage(); addPageHeader(doc, `State: ${st.state}`); y = 18;
        doc.setFontSize(12); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
        doc.text(`${st.state} — by Locality`, 14, y); y += 5;
        st.localities.forEach((loc: string, li: number) => {
          if (y > 240) { doc.addPage(); addPageHeader(doc, `State: ${st.state}`); y = 18; }
          doc.setFontSize(10); doc.setTextColor(41, 98, 255); doc.setFont('helvetica', 'bold');
          doc.text(`Locality: ${loc}`, 18, y); y += 3;
          const lRows = st.matrix.filter(row => row.cells[li].questionnaires > 0 || row.cells[li].sites > 0).map(row => [
            row.activity, String(row.cells[li].sites || '-'), String(row.cells[li].questionnaires || '-'),
            row.cells[li].questionnaires ? String(row.isPdm ? Math.floor(row.cells[li].questionnaires / 7) : row.cells[li].questionnaires) : '-',
            String(row.cells[li].collectors || '-'),
          ]);
          const locPdm = st.matrix.reduce((a: number, r: any) => a + (r.isPdm ? Math.floor(r.cells[li].questionnaires / 7) : r.cells[li].questionnaires), 0);
          lRows.push(['Total', String(st.colTotals[li].sites), String(st.colTotals[li].questionnaires), locPdm ? String(locPdm) : '-', String(st.colTotals[li].collectors)]);
          y = styledAutoTable(doc, [['Activity', 'Sites', 'Actual', 'PDM Sites', 'DC']], lRows, y, { fontSize: 8, boldLastRow: true, columnStyles: { 0: { cellWidth: 55 } }, useArabicFont: hasArabic });
          y += 5;
        });
      });

      addAllFooters(doc);
      const pdfBase64 = doc.output('datauristring').split(',')[1];
      return pdfBase64;
    } catch (e) {
      console.error('Failed to generate analytics PDF base64:', e);
      return null;
    }
  }, [filteredData, hubSummary, stateSummary, localitySummary, activityBreakdown, collectorDetails, trackerData]);

  const generateTrackerExcelBase64 = useCallback(async (): Promise<string | null> => {
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      const hFill: any = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2041' } };
      const hFont: any = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      const bFont: any = { size: 9 };
      const border: any = { top: { style: 'thin', color: { argb: 'FFD0D5DD' } }, bottom: { style: 'thin', color: { argb: 'FFD0D5DD' } }, left: { style: 'thin', color: { argb: 'FFD0D5DD' } }, right: { style: 'thin', color: { argb: 'FFD0D5DD' } } };
      const altBg: any = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FC' } };
      const totalFill: any = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EBF0' } };

      const { hubs, matrix, hubTotals, grandQ, grandSites, grandCollectors, stateBreakdown, hubTrackers, stateTrackers } = trackerData;

      const ws1 = wb.addWorksheet('Activity x Hub');
      const h1 = ['Activity', ...hubs.flatMap(h => [`${h} Sites`, `${h} Actual`, `${h} PDM Sites`, `${h} DC`]), 'Total Sites', 'Total Actual', 'Total PDM Sites', 'Total DC'];
      const hr1 = ws1.addRow(h1);
      hr1.eachCell(c => { c.fill = hFill; c.font = hFont; c.border = border; c.alignment = { horizontal: 'center' }; });

      matrix.forEach((row, ri) => {
        const vals: (string | number)[] = [row.activity];
        hubs.forEach((_, hi) => {
          vals.push(row.cells[hi].sites, row.cells[hi].questionnaires,
            (row.isPdm ? Math.floor(row.cells[hi].questionnaires / 7) : row.cells[hi].questionnaires), row.cells[hi].collectors);
        });
        vals.push(row.totalSites, row.totalQ, (row.isPdm ? Math.floor(row.totalQ / 7) : row.totalQ), row.totalCollectors);
        const dr = ws1.addRow(vals);
        dr.eachCell(c => { c.font = bFont; c.border = border; if (ri % 2 === 1) c.fill = altBg; });
      });

      const totalVals: (string | number)[] = ['Grand Total'];
      hubs.forEach((_, hi) => {
        const pdmCol = matrix.reduce((a, r) => a + (r.isPdm ? Math.floor(r.cells[hi].questionnaires / 7) : r.cells[hi].questionnaires), 0);
        totalVals.push(hubTotals[hi].sites, hubTotals[hi].questionnaires, pdmCol || 0, hubTotals[hi].collectors);
      });
      const pdmGrand = matrix.reduce((a, r) => a + (r.isPdm ? r.cells.reduce((b: any, c: any) => b + Math.floor(c.questionnaires / 7), 0) : r.totalQ), 0);
      totalVals.push(grandSites, grandQ, pdmGrand || 0, grandCollectors);
      const tr1 = ws1.addRow(totalVals);
      tr1.eachCell(c => { c.fill = totalFill; c.font = { ...bFont, bold: true }; c.border = border; });
      ws1.columns.forEach(col => { col.width = 16; });
      if (ws1.columns[0]) ws1.columns[0].width = 28;

      const ws2 = wb.addWorksheet('Activity x State');
      const h2 = ws2.addRow(['State', 'Activity', 'Sites', 'Questionnaires', 'PDM Sites']);
      h2.eachCell(c => { c.fill = hFill; c.font = hFont; c.border = border; c.alignment = { horizontal: 'center' }; });
      let sri = 0;
      stateBreakdown.forEach(sb => {
        sb.activities.forEach(a => {
          if (a.questionnaires > 0) {
            const dr = ws2.addRow([sb.state, a.activity, a.sites, a.questionnaires, isPdmActivity(a.activity) ? Math.floor(a.questionnaires / 7) : a.questionnaires]);
            dr.eachCell(c => { c.font = bFont; c.border = border; if (sri % 2 === 1) c.fill = altBg; });
            sri++;
          }
        });
      });
      ws2.columns = [{ width: 22 }, { width: 28 }, { width: 12 }, { width: 18 }, { width: 14 }];

      hubTrackers.forEach(ht => {
        const ws = wb.addWorksheet(`Hub-${ht.hub}`.slice(0, 31));
        const hCols = ['Activity', ...ht.states.flatMap(s => [`${s} Sites`, `${s} Actual`, `${s} PDM Sites`, `${s} DC`]), 'Total Sites', 'Total Actual', 'Total PDM Sites', 'Total DC'];
        const hdr = ws.addRow(hCols);
        hdr.eachCell(c => { c.fill = hFill; c.font = hFont; c.border = border; c.alignment = { horizontal: 'center' }; });
        ht.matrix.forEach((row, ri) => {
          const vals: (string | number)[] = [row.activity];
          ht.states.forEach((_, si) => {
            vals.push(row.cells[si].sites, row.cells[si].questionnaires,
              (row.isPdm ? Math.floor(row.cells[si].questionnaires / 7) : row.cells[si].questionnaires), row.cells[si].collectors);
          });
          vals.push(row.totalSites, row.totalQ, (row.isPdm ? Math.floor(row.totalQ / 7) : row.totalQ), row.totalCollectors);
          const dr = ws.addRow(vals);
          dr.eachCell(c => { c.font = bFont; c.border = border; if (ri % 2 === 1) c.fill = altBg; });
        });
        const htTotalVals: (string | number)[] = ['Total'];
        ht.colTotals.forEach((ct, ci) => {
          const pdm = ht.matrix.reduce((a, r) => a + (r.isPdm ? Math.floor(r.cells[ci].questionnaires / 7) : r.cells[ci].questionnaires), 0);
          htTotalVals.push(ct.sites, ct.questionnaires, pdm || 0, ct.collectors);
        });
        const htPdm = ht.matrix.reduce((a, r) => a + (r.isPdm ? r.cells.reduce((b: any, c: any) => b + Math.floor(c.questionnaires / 7), 0) : r.totalQ), 0);
        htTotalVals.push(ht.grandSites, ht.grandQ, htPdm || 0, ht.grandCollectors);
        const htTr = ws.addRow(htTotalVals);
        htTr.eachCell(c => { c.fill = totalFill; c.font = { ...bFont, bold: true }; c.border = border; });
        ws.columns.forEach(col => { col.width = 16; });
        if (ws.columns[0]) ws.columns[0].width = 28;
      });

      stateTrackers.forEach(st => {
        const ws = wb.addWorksheet(`State-${st.state}`.slice(0, 31));
        const hCols = ['Activity', ...st.localities.flatMap(l => [`${l} Sites`, `${l} Actual`, `${l} PDM Sites`, `${l} DC`]), 'Total Sites', 'Total Actual', 'Total PDM Sites', 'Total DC'];
        const hdr = ws.addRow(hCols);
        hdr.eachCell(c => { c.fill = hFill; c.font = hFont; c.border = border; c.alignment = { horizontal: 'center' }; });
        st.matrix.forEach((row, ri) => {
          const vals: (string | number)[] = [row.activity];
          st.localities.forEach((_, li) => {
            vals.push(row.cells[li].sites, row.cells[li].questionnaires,
              (row.isPdm ? Math.floor(row.cells[li].questionnaires / 7) : row.cells[li].questionnaires), row.cells[li].collectors);
          });
          vals.push(row.totalSites, row.totalQ, (row.isPdm ? Math.floor(row.totalQ / 7) : row.totalQ), row.totalCollectors);
          const dr = ws.addRow(vals);
          dr.eachCell(c => { c.font = bFont; c.border = border; if (ri % 2 === 1) c.fill = altBg; });
        });
        const stTotalVals: (string | number)[] = ['Total'];
        st.colTotals.forEach((ct, ci) => {
          const pdm = st.matrix.reduce((a, r) => a + (r.isPdm ? Math.floor(r.cells[ci].questionnaires / 7) : r.cells[ci].questionnaires), 0);
          stTotalVals.push(ct.sites, ct.questionnaires, pdm || 0, ct.collectors);
        });
        const stPdm = st.matrix.reduce((a, r) => a + (r.isPdm ? r.cells.reduce((b: any, c: any) => b + Math.floor(c.questionnaires / 7), 0) : r.totalQ), 0);
        stTotalVals.push(st.grandSites, st.grandQ, stPdm || 0, st.grandCollectors);
        const stTr = ws.addRow(stTotalVals);
        stTr.eachCell(c => { c.fill = totalFill; c.font = { ...bFont, bold: true }; c.border = border; });
        ws.columns.forEach(col => { col.width = 16; });
        if (ws.columns[0]) ws.columns[0].width = 28;
      });

      const buffer = await wb.xlsx.writeBuffer();
      return bufferToBase64(buffer as ArrayBuffer);
    } catch (e) {
      console.error('Failed to generate tracker Excel base64:', e);
      return null;
    }
  }, [trackerData, bufferToBase64]);

  const generateAllTrackersExcelBase64 = useCallback(async (fmt: 'excel' | 'csv' = 'excel'): Promise<string | null> => {
    try {
      const { hubs, matrix, hubTotals, grandQ, grandSites, grandCollectors, hubTrackers, stateTrackers } = trackerData;
      const summaryName = computeReportSummary?.monthCoverage || fileName.replace(/\.[^.]+$/, '') || 'Tracker Summary';

      if (fmt === 'csv') {
        const lines: string[] = [];
        const esc = (v: any) => { const s = String(v ?? ''); return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s; };
        const row = (vals: any[]) => lines.push(vals.map(esc).join(','));

        lines.push(`=== ${summaryName} ===`);
        row(['Activity', ...hubs.flatMap(h => [`${h} Sites`, `${h} Actual`, `${h} PDM`, `${h} DC`]), 'Total Sites', 'Total Actual', 'Total PDM', 'Total DC']);
        matrix.forEach(r => {
          row([r.activity, ...r.cells.flatMap(c => [c.sites, c.questionnaires, r.isPdm ? Math.floor(c.questionnaires / 7) : c.questionnaires, c.collectors]), r.totalSites, r.totalQ, r.isPdm ? Math.floor(r.totalQ / 7) : r.totalQ, r.totalCollectors]);
        });
        const totValsC: any[] = ['Grand Total'];
        hubs.forEach((_, hi) => {
          const pdm = matrix.reduce((a, r) => a + (r.isPdm ? Math.floor(r.cells[hi].questionnaires / 7) : r.cells[hi].questionnaires), 0);
          totValsC.push(hubTotals[hi].sites, hubTotals[hi].questionnaires, pdm, hubTotals[hi].collectors);
        });
        const pdmGrandC = matrix.reduce((a, r) => a + (r.isPdm ? r.cells.reduce((b: any, c: any) => b + Math.floor(c.questionnaires / 7), 0) : r.totalQ), 0);
        totValsC.push(grandSites, grandQ, pdmGrandC, grandCollectors);
        row(totValsC);

        [...hubTrackers].sort((a, b) => a.hub.localeCompare(b.hub)).forEach(ht => {
          lines.push(''); lines.push(`=== Hub: ${ht.hub} ===`);
          row(['Activity', ...ht.states.flatMap(s => [`${s} Sites`, `${s} Actual`, `${s} PDM`, `${s} DC`]), 'Total Sites', 'Total Actual', 'Total PDM', 'Total DC']);
          ht.matrix.forEach(r => {
            row([r.activity, ...r.cells.flatMap(c => [c.sites, c.questionnaires, r.isPdm ? Math.floor(c.questionnaires / 7) : c.questionnaires, c.collectors]), r.totalSites, r.totalQ, r.isPdm ? Math.floor(r.totalQ / 7) : r.totalQ, r.totalCollectors]);
          });
        });

        [...stateTrackers].sort((a, b) => a.state.localeCompare(b.state)).forEach(st => {
          lines.push(''); lines.push(`=== State: ${st.state} ===`);
          row(['Activity', ...st.localities.flatMap(l => [`${l} Sites`, `${l} Actual`, `${l} PDM`, `${l} DC`]), 'Total Sites', 'Total Actual', 'Total PDM', 'Total DC']);
          st.matrix.forEach(r => {
            row([r.activity, ...r.cells.flatMap(c => [c.sites, c.questionnaires, r.isPdm ? Math.floor(c.questionnaires / 7) : c.questionnaires, c.collectors]), r.totalSites, r.totalQ, r.isPdm ? Math.floor(r.totalQ / 7) : r.totalQ, r.totalCollectors]);
          });
        });

        lines.push(''); lines.push('=== Enumerators ===');
        row(['Hub', 'State', 'Data Collector', 'Sites', 'Questionnaires', 'PDM Sites', 'Activities']);
        [...csvEnumData].sort((a, b) => a.hub.localeCompare(b.hub)).forEach(hg => {
          [...hg.states].sort((a, b) => a.state.localeCompare(b.state)).forEach(sg => {
            [...sg.collectors].sort((a, b) => a.name.localeCompare(b.name)).forEach(c => {
              row([hg.hub, sg.state, c.name, c.sites.length, c.questionnaires, c.pdmSites, c.activities.map(a => `${a.name}: ${a.count}`).join('; ')]);
            });
          });
        });

        const csvBlob = new Blob([lines.join('\n')], { type: 'text/csv' });
        const csvBuf = await csvBlob.arrayBuffer();
        return bufferToBase64(csvBuf);
      }

      const ExcelJSM = (await import('exceljs')).default;
      const wb = new ExcelJSM.Workbook();
      wb.creator = 'PACT Command Center'; wb.created = new Date();
      const XNAVY = 'FF0F2041', XWHITE = 'FFFFFFFF', XLIGHT = 'FFF5F7FC', XBORDER = 'FFC8CDD7';
      const hFillA: any = { type: 'pattern', pattern: 'solid', fgColor: { argb: XNAVY } };
      const hFontA: any = { bold: true, color: { argb: XWHITE }, size: 10, name: 'Calibri' };
      const bFontA: any = { size: 9, name: 'Calibri' };
      const altFillA: any = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLIGHT } };
      const totFillA: any = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      const bdrA = (): any => { const s: any = { style: 'thin', color: { argb: XBORDER } }; return { top: s, bottom: s, left: s, right: s }; };

      const ws1 = wb.addWorksheet(summaryName.replace(/[\\/*?[\]:]/g, '-').slice(0, 31));
      const s1Cols = ['Activity', ...hubs.flatMap(h => [`${h} Sites`, `${h} Actual`, `${h} PDM`, `${h} DC`]), 'Total Sites', 'Total Actual', 'Total PDM', 'Total DC'];
      const hr1 = ws1.addRow(s1Cols);
      hr1.eachCell(c => { c.fill = hFillA; c.font = hFontA; c.border = bdrA(); c.alignment = { horizontal: 'center', vertical: 'middle' }; });
      hr1.height = 22;
      matrix.forEach((r, ri) => {
        const vals: (string | number)[] = [r.activity];
        r.cells.forEach(c => { vals.push(c.sites, c.questionnaires, r.isPdm ? Math.floor(c.questionnaires / 7) : c.questionnaires, c.collectors); });
        vals.push(r.totalSites, r.totalQ, r.isPdm ? Math.floor(r.totalQ / 7) : r.totalQ, r.totalCollectors);
        const dr = ws1.addRow(vals);
        dr.eachCell(c => { c.font = bFontA; c.border = bdrA(); if (ri % 2 === 1) c.fill = altFillA; });
      });
      const s1Tot: (string | number)[] = ['Grand Total'];
      hubs.forEach((_, hi) => {
        const pdm = matrix.reduce((a, r) => a + (r.isPdm ? Math.floor(r.cells[hi].questionnaires / 7) : r.cells[hi].questionnaires), 0);
        s1Tot.push(hubTotals[hi].sites, hubTotals[hi].questionnaires, pdm, hubTotals[hi].collectors);
      });
      const pdmG = matrix.reduce((a, r) => a + (r.isPdm ? r.cells.reduce((b: any, c: any) => b + Math.floor(c.questionnaires / 7), 0) : r.totalQ), 0);
      s1Tot.push(grandSites, grandQ, pdmG, grandCollectors);
      const tr1A = ws1.addRow(s1Tot);
      tr1A.eachCell(c => { c.fill = totFillA; c.font = { ...bFontA, bold: true }; c.border = bdrA(); });
      ws1.getColumn(1).width = 30;
      for (let ci = 2; ci <= s1Cols.length; ci++) ws1.getColumn(ci).width = 14;

      [...hubTrackers].sort((a, b) => a.hub.localeCompare(b.hub)).forEach(ht => {
        const ws = wb.addWorksheet(`Hub-${ht.hub}`.replace(/[\\/*?[\]:]/g, '-').slice(0, 31));
        const hCols = ['Activity', ...ht.states.flatMap(s => [`${s} Sites`, `${s} Actual`, `${s} PDM`, `${s} DC`]), 'Total Sites', 'Total Actual', 'Total PDM', 'Total DC'];
        const hdr = ws.addRow(hCols);
        hdr.eachCell(c => { c.fill = hFillA; c.font = hFontA; c.border = bdrA(); c.alignment = { horizontal: 'center', vertical: 'middle' }; });
        hdr.height = 22;
        ht.matrix.forEach((r, ri) => {
          const vals: (string | number)[] = [r.activity];
          r.cells.forEach(c => { vals.push(c.sites, c.questionnaires, r.isPdm ? Math.floor(c.questionnaires / 7) : c.questionnaires, c.collectors); });
          vals.push(r.totalSites, r.totalQ, r.isPdm ? Math.floor(r.totalQ / 7) : r.totalQ, r.totalCollectors);
          const dr = ws.addRow(vals);
          dr.eachCell(c => { c.font = bFontA; c.border = bdrA(); if (ri % 2 === 1) c.fill = altFillA; });
        });
        const htTot: (string | number)[] = ['Total'];
        ht.colTotals.forEach((ct, ci) => {
          const pdm = ht.matrix.reduce((a, r) => a + (r.isPdm ? Math.floor(r.cells[ci].questionnaires / 7) : r.cells[ci].questionnaires), 0);
          htTot.push(ct.sites, ct.questionnaires, pdm, ct.collectors);
        });
        const htPdm = ht.matrix.reduce((a, r) => a + (r.isPdm ? r.cells.reduce((b: any, c: any) => b + Math.floor(c.questionnaires / 7), 0) : r.totalQ), 0);
        htTot.push(ht.grandSites, ht.grandQ, htPdm, ht.grandCollectors);
        const htTr = ws.addRow(htTot);
        htTr.eachCell(c => { c.fill = totFillA; c.font = { ...bFontA, bold: true }; c.border = bdrA(); });
        ws.getColumn(1).width = 28;
        for (let ci = 2; ci <= hCols.length; ci++) ws.getColumn(ci).width = 13;
      });

      [...stateTrackers].sort((a, b) => a.state.localeCompare(b.state)).forEach(st => {
        const ws = wb.addWorksheet(`State-${st.state}`.replace(/[\\/*?[\]:]/g, '-').slice(0, 31));
        const hCols = ['Activity', ...st.localities.flatMap(l => [`${l} Sites`, `${l} Actual`, `${l} PDM`, `${l} DC`]), 'Total Sites', 'Total Actual', 'Total PDM', 'Total DC'];
        const hdr = ws.addRow(hCols);
        hdr.eachCell(c => { c.fill = hFillA; c.font = hFontA; c.border = bdrA(); c.alignment = { horizontal: 'center', vertical: 'middle' }; });
        hdr.height = 22;
        st.matrix.forEach((r, ri) => {
          const vals: (string | number)[] = [r.activity];
          r.cells.forEach(c => { vals.push(c.sites, c.questionnaires, r.isPdm ? Math.floor(c.questionnaires / 7) : c.questionnaires, c.collectors); });
          vals.push(r.totalSites, r.totalQ, r.isPdm ? Math.floor(r.totalQ / 7) : r.totalQ, r.totalCollectors);
          const dr = ws.addRow(vals);
          dr.eachCell(c => { c.font = bFontA; c.border = bdrA(); if (ri % 2 === 1) c.fill = altFillA; });
        });
        const stTot: (string | number)[] = ['Total'];
        st.colTotals.forEach((ct, ci) => {
          const pdm = st.matrix.reduce((a, r) => a + (r.isPdm ? Math.floor(r.cells[ci].questionnaires / 7) : r.cells[ci].questionnaires), 0);
          stTot.push(ct.sites, ct.questionnaires, pdm, ct.collectors);
        });
        const stPdm = st.matrix.reduce((a, r) => a + (r.isPdm ? r.cells.reduce((b: any, c: any) => b + Math.floor(c.questionnaires / 7), 0) : r.totalQ), 0);
        stTot.push(st.grandSites, st.grandQ, stPdm, st.grandCollectors);
        const stTr = ws.addRow(stTot);
        stTr.eachCell(c => { c.fill = totFillA; c.font = { ...bFontA, bold: true }; c.border = bdrA(); });
        ws.getColumn(1).width = 28;
        for (let ci = 2; ci <= hCols.length; ci++) ws.getColumn(ci).width = 13;
      });

      const wsE = wb.addWorksheet('Enumerators');
      const eHdr = wsE.addRow(['Hub', 'State', 'Data Collector', 'Sites', 'Questionnaires', 'PDM Sites', 'Activities']);
      eHdr.eachCell(c => { c.fill = hFillA; c.font = hFontA; c.border = bdrA(); c.alignment = { horizontal: 'center', vertical: 'middle' }; });
      eHdr.height = 22;
      wsE.columns = [{ width: 22 }, { width: 18 }, { width: 28 }, { width: 10 }, { width: 16 }, { width: 12 }, { width: 55 }];
      let eRi = 0;
      [...csvEnumData].sort((a, b) => a.hub.localeCompare(b.hub)).forEach(hg => {
        [...hg.states].sort((a, b) => a.state.localeCompare(b.state)).forEach(sg => {
          [...sg.collectors].sort((a, b) => a.name.localeCompare(b.name)).forEach(c => {
            const dr = wsE.addRow([hg.hub, sg.state, c.name, c.sites.length, c.questionnaires, c.pdmSites, c.activities.map(a => `${a.name}: ${a.count}`).join(' | ')]);
            dr.eachCell(cell => { cell.font = bFontA; cell.border = bdrA(); if (eRi % 2 === 1) cell.fill = altFillA; });
            eRi++;
          });
        });
      });

      const buffer = await wb.xlsx.writeBuffer();
      return bufferToBase64(buffer as ArrayBuffer);
    } catch (e: any) {
      console.error('Failed to generate all trackers base64:', e);
      toast({ title: 'Attachment Error', description: `Could not generate the tracker file: ${e?.message || 'Unknown error'}`, variant: 'destructive' });
      return null;
    }
  }, [trackerData, csvEnumData, computeReportSummary, fileName, bufferToBase64, toast]);

  const sendEmailReport = useCallback(async () => {
    if (emailToUsers.length === 0) {
      toast({ title: 'Error', description: 'Please add at least one recipient', variant: 'destructive' });
      return;
    }
    setEmailSending(true);
    try {
      const ccEmails = getEmailCcList.map(u => u.email).filter(Boolean);
      const s = computeReportSummary;
      const month = s?.monthCoverage || '';
      const reportArLabels: Record<string, string> = {
        report: 'تقرير بيانات الاستبيانات',
        coverage: 'تقرير متابعة التغطية',
        analytics_excel: 'تقرير تحليل الاستبيانات (إكسل)',
        analytics_pdf: 'تقرير تحليل الاستبيانات الشامل',
        tracker_excel: 'تقرير المتابعة (إكسل)',
        tracker_all: 'تقرير المتابعة الشامل',
      };
      const reportLabelAr = reportArLabels[emailType] || reportArLabels.report;
      const titleAr = s ? `${reportLabelAr} - ${s.monthCoverage}` : emailSubject;

      const attachments: { filename: string; content: string; type: string }[] = [];
      const baseName = fileName.replace(/\.[^.]+$/, '') || 'report';

      if (emailType === 'coverage') {
        const b64 = await generateCoverageTrackerBase64();
        if (b64) attachments.push({ filename: `coverage_tracker_${baseName}.xlsx`, content: b64, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const pdf64 = await generatePdfBase64('coverage');
        if (pdf64) attachments.push({ filename: `coverage_tracker_${baseName}.pdf`, content: pdf64, type: 'application/pdf' });
      } else if (emailType === 'analytics_excel') {
        const b64 = await generateAnalyticsExcelBase64();
        if (b64) attachments.push({ filename: `questionnaire_analytics_${baseName}.xlsx`, content: b64, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      } else if (emailType === 'analytics_pdf') {
        const pdf64 = await generateAnalyticsPdfBase64();
        if (pdf64) attachments.push({ filename: `questionnaire_analytics_${baseName}.pdf`, content: pdf64, type: 'application/pdf' });
      } else if (emailType === 'tracker_excel') {
        const b64 = await generateTrackerExcelBase64();
        if (b64) attachments.push({ filename: `tracker_report_${baseName}.xlsx`, content: b64, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      } else if (emailType === 'tracker_all') {
        const ext = trackerAllFormat === 'csv' ? 'csv' : 'xlsx';
        const mime = trackerAllFormat === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        const b64 = await generateAllTrackersExcelBase64(trackerAllFormat);
        if (b64) attachments.push({ filename: `combined_tracker_${baseName}.${ext}`, content: b64, type: mime });
      } else {
        if (emailAttachCleaned && cleanResults) {
          const b64 = await generateExcelBase64('cleaned');
          if (b64) attachments.push({ filename: `${baseName}_cleaned.xlsx`, content: b64, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          const pdf64 = await generatePdfBase64('cleaned');
          if (pdf64) attachments.push({ filename: `${baseName}_cleaned.pdf`, content: pdf64, type: 'application/pdf' });
        }
        if (emailAttachReview && cleanResults) {
          const b64 = await generateExcelBase64('review');
          if (b64) attachments.push({ filename: `${baseName}_review.xlsx`, content: b64, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          const pdf64 = await generatePdfBase64('review');
          if (pdf64) attachments.push({ filename: `${baseName}_review.pdf`, content: pdf64, type: 'application/pdf' });
        }
      }

      let sentCount = 0;
      for (const recipient of emailToUsers) {
        try {
          const displayName = recipient.isSystemUser && recipient.name && recipient.name !== recipient.email
            ? recipient.name
            : recipient.name || recipient.email;
          const personalBody = buildEmailBody(displayName, !!recipient.isSystemUser, emailType);
          const personalArBody = [
            `عزيزي/عزيزتي ${displayName}،`,
            '',
            `يرجى الاطلاع على ${reportLabelAr} المرفق${month ? ` لشهر ${month}` : ''}.`,
            'يرجى المراجعة والتأكيد.',
            '',
            'مع أطيب التحيات،',
            'مركز قيادة PACT',
          ].join('\n');
          await EmailNotificationService.sendNotification(
            recipient.email,
            displayName,
            {
              title: emailSubject,
              message: personalBody,
              titleAr: titleAr,
              messageAr: personalArBody,
              type: emailHighPriority ? 'warning' : 'info',
              cc: sentCount === 0 && ccEmails.length > 0 ? ccEmails : undefined,
              attachments: attachments.length > 0 ? attachments : undefined,
            }
          );
          sentCount++;
        } catch (e: any) {
          console.error(`Failed to send to ${recipient.email}:`, e);
        }
      }

      if (sentCount > 0) {
        toast({ title: 'Email Sent', description: `Report email sent to ${sentCount} recipient${sentCount > 1 ? 's' : ''} successfully` });
      } else {
        toast({ title: 'Email Failed', description: 'Failed to send email to any recipient', variant: 'destructive' });
      }
      setShowEmailDialog(false);
      setEmailToUsers([]);
      setEmailToInput('');
      setEmailCcRoles([]);
    } catch (e: any) {
      toast({ title: 'Email Failed', description: e.message || 'Failed to send email', variant: 'destructive' });
    } finally {
      setEmailSending(false);
    }
  }, [emailToUsers, emailSubject, emailHighPriority, emailType, buildEmailBody, getEmailCcList, toast, emailAttachCleaned, emailAttachReview, cleanResults, fileName, generateExcelBase64, generateCoverageTrackerBase64, generatePdfBase64, generateAnalyticsExcelBase64, generateAnalyticsPdfBase64, generateTrackerExcelBase64, generateAllTrackersExcelBase64, trackerAllFormat, computeReportSummary]);

  const exportToExcel = useCallback(() => {
    const wb = XLSX.utils.book_new();

    const hubData = hubSummary.map((h, i) => ({ '#': i + 1, Hub: h.name, Sites: h.sites, Questionnaires: h.questionnaires, '%': h.percentage.toFixed(1) + '%' }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hubData), 'By Hub');

    const stateData = stateSummary.map((s, i) => ({ '#': i + 1, State: s.name, Sites: s.sites, DC: s.collectors, Questionnaires: s.questionnaires, '%': s.percentage.toFixed(1) + '%' }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stateData), 'By State');

    const localityData = localitySummary.map((l, i) => ({ '#': i + 1, Locality: l.name, Sites: l.sites, Questionnaires: l.questionnaires, '%': l.percentage.toFixed(1) + '%' }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(localityData), 'By Locality');

    const siteData = siteDetailsWithActivity.map((s, i) => ({ '#': i + 1, 'Site Name': s.name, Activity: s.activityNames, State: s.state, Locality: s.locality, DC: s.collectors, Questionnaires: s.questionnaires, '%': s.percentage.toFixed(1) + '%' }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(siteData), 'By Site');

    const actRows: any[] = [];
    activityBreakdown.forEach(a => {
      actRows.push({ Activity: a.name, Level: 'Activity', Detail: '', Sites: a.siteCount, Questionnaires: a.questionnaireCount, '%': a.percentage.toFixed(1) + '%' });
      a.byHub.forEach(h => actRows.push({ Activity: a.name, Level: 'Hub', Detail: h.name, Sites: h.sites, Questionnaires: h.count, '%': '' }));
      a.byState.forEach(s => actRows.push({ Activity: a.name, Level: 'State', Detail: s.name, Sites: s.sites, Questionnaires: s.count, '%': '' }));
      a.byLocality.forEach(l => actRows.push({ Activity: a.name, Level: 'Locality', Detail: l.name, Sites: l.sites, Questionnaires: l.count, '%': '' }));
      a.byCollector.forEach(c => actRows.push({ Activity: a.name, Level: 'Collector', Detail: c.name, Sites: '', Questionnaires: c.count, '%': '' }));
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(actRows), 'By Activity');

    const collRows = collectorDetails.map((c, i) => ({
      '#': i + 1,
      'UUID': c.profileId || '-',
      'Device ID': c.deviceId || '-',
      'Data Collector': c.name,
      'Name Variants': c.nameVariants.length > 0 ? c.nameVariants.map(v => `${v.name} (${v.count})`).join(', ') : '',
      Hub: c.hubs.join(', '),
      State: c.states.join(', '),
      'Sites Count': c.sites.length,
      'Sites': c.sites.map(s => `${s.name} (${s.count})`).join(', '),
      'Total Activities': c.activities.reduce((s, a) => s + a.count, 0),
      Activities: c.activities.map(a => `${a.name} (${a.count})`).join(', '),
      Localities: c.localities.map(l => `${l.name} (${l.count})`).join(', '),
      Questionnaires: c.count,
      '%': c.percentage.toFixed(1) + '%',
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(collRows), 'By Collector');

    const usedSheetNames = new Set<string>();
    collectorDetails.forEach((c, ci) => {
      const detailRows: any[] = [];
      detailRows.push({ Section: 'COLLECTOR INFO', Field: 'Name (Primary)', Value: c.name });
      detailRows.push({ Section: '', Field: 'UUID', Value: c.profileId || '-' });
      detailRows.push({ Section: '', Field: 'Device ID', Value: c.deviceId || '-' });
      if (c.nameVariants.length > 0) {
        detailRows.push({ Section: '', Field: 'Name Variants', Value: '' });
        c.nameVariants.forEach(v => detailRows.push({ Section: '', Field: `  ${v.name}`, Value: v.count }));
      }
      detailRows.push({ Section: '', Field: 'Hub(s)', Value: c.hubs.join(', ') });
      detailRows.push({ Section: '', Field: 'State(s)', Value: c.states.join(', ') });
      detailRows.push({ Section: '', Field: 'Total Questionnaires', Value: c.count });
      detailRows.push({ Section: '', Field: 'Percentage', Value: c.percentage.toFixed(1) + '%' });
      detailRows.push({ Section: '' });
      detailRows.push({ Section: 'ACTIVITIES', Field: 'Activity', Value: 'Count' });
      c.activities.forEach(a => detailRows.push({ Section: '', Field: a.name, Value: a.count }));
      detailRows.push({ Section: '', Field: 'Total', Value: c.activities.reduce((s, a) => s + a.count, 0) });
      detailRows.push({ Section: '' });
      detailRows.push({ Section: 'LOCALITIES', Field: 'Locality', Value: 'Count' });
      c.localities.forEach(l => detailRows.push({ Section: '', Field: l.name, Value: l.count }));
      if (c.sites.length > 0) {
        detailRows.push({ Section: '' });
        detailRows.push({ Section: 'ACTIVITY SITES', Field: 'Site Name', Value: 'Count' });
        c.sites.forEach(s => detailRows.push({ Section: '', Field: s.name, Value: s.count }));
        detailRows.push({ Section: '', Field: 'Total Sites', Value: c.sites.length });
      }
      let sheetName = `DC-${c.name}`.replace(/[\\/*?[\]:]/g, '').slice(0, 28);
      if (usedSheetNames.has(sheetName)) sheetName = `${sheetName.slice(0, 25)}-${ci + 1}`;
      usedSheetNames.add(sheetName);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows), sheetName.slice(0, 31));
    });

    const { hubs, activities, matrix, hubTotals, grandQ, grandSites, grandCollectors, hubTrackers, stateTrackers } = trackerData;
    const trackerRows: any[] = [];
    matrix.forEach(row => {
      const r: any = { Activity: row.activity };
      hubs.forEach((hub, hi) => {
        r[`${hub} Sites`] = row.cells[hi].sites;
        r[`${hub} Actual`] = row.cells[hi].questionnaires;
        r[`${hub} PDM Sites`] = row.isPdm ? Math.floor(row.cells[hi].questionnaires / 7) : row.cells[hi].questionnaires;
        r[`${hub} Collectors`] = row.cells[hi].collectors;
      });
      r['Total Sites'] = row.totalSites;
      r['Total Actual'] = row.totalQ;
      r['Total PDM Sites'] = row.isPdm ? Math.floor(row.totalQ / 7) : row.totalQ;
      r['Total Collectors'] = row.totalCollectors;
      trackerRows.push(r);
    });
    const totalRow: any = { Activity: 'Grand Total' };
    hubs.forEach((hub, hi) => {
      totalRow[`${hub} Sites`] = hubTotals[hi].sites;
      totalRow[`${hub} Actual`] = hubTotals[hi].questionnaires;
      const pdmSitesCol = matrix.reduce((a, r) => a + (r.isPdm ? Math.floor(r.cells[hi].questionnaires / 7) : r.cells[hi].questionnaires), 0);
      totalRow[`${hub} PDM Sites`] = pdmSitesCol || 0;
      totalRow[`${hub} Collectors`] = hubTotals[hi].collectors;
    });
    totalRow['Total Sites'] = grandSites;
    totalRow['Total Actual'] = grandQ;
    const pdmSitesGrand = matrix.reduce((a, r) => a + (r.isPdm ? r.cells.reduce((b: any, c: any) => b + Math.floor(c.questionnaires / 7), 0) : r.totalQ), 0);
    totalRow['Total PDM Sites'] = pdmSitesGrand || 0;
    totalRow['Total Collectors'] = grandCollectors;
    trackerRows.push(totalRow);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(trackerRows), 'Tracker');

    hubTrackers.forEach(ht => {
      const htRows: any[] = [];
      ht.matrix.forEach(row => {
        const r: any = { Activity: row.activity };
        ht.states.forEach((st, si) => {
          r[`${st} Sites`] = row.cells[si].sites;
          r[`${st} Actual`] = row.cells[si].questionnaires;
          r[`${st} PDM Sites`] = row.isPdm ? Math.floor(row.cells[si].questionnaires / 7) : row.cells[si].questionnaires;
          r[`${st} DC`] = row.cells[si].collectors;
        });
        r['Total Sites'] = row.totalSites; r['Total Actual'] = row.totalQ; r['Total PDM Sites'] = row.isPdm ? Math.floor(row.totalQ / 7) : row.totalQ; r['Total DC'] = row.totalCollectors;
        htRows.push(r);
      });
      const htTotal: any = { Activity: 'Total' };
      ht.colTotals.forEach((ct, ci) => {
        const pdmSitesCol = ht.matrix.reduce((a, r) => a + (r.isPdm ? Math.floor(r.cells[ci].questionnaires / 7) : r.cells[ci].questionnaires), 0);
        htTotal[`${ht.states[ci]} Sites`] = ct.sites; htTotal[`${ht.states[ci]} Actual`] = ct.questionnaires; htTotal[`${ht.states[ci]} PDM Sites`] = pdmSitesCol || 0; htTotal[`${ht.states[ci]} DC`] = ct.collectors;
      });
      const htPdmSitesGrand = ht.matrix.reduce((a, r) => a + (r.isPdm ? r.cells.reduce((b: any, c: any) => b + Math.floor(c.questionnaires / 7), 0) : r.totalQ), 0);
      htTotal['Total Sites'] = ht.grandSites; htTotal['Total Actual'] = ht.grandQ; htTotal['Total PDM Sites'] = htPdmSitesGrand || 0; htTotal['Total DC'] = ht.grandCollectors;
      htRows.push(htTotal);
      const sheetName = `Hub-${ht.hub}`.slice(0, 31);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(htRows), sheetName);
    });

    stateTrackers.forEach(st => {
      const stRows: any[] = [];
      st.matrix.forEach(row => {
        const r: any = { Activity: row.activity };
        st.localities.forEach((loc, li) => {
          r[`${loc} Sites`] = row.cells[li].sites;
          r[`${loc} Actual`] = row.cells[li].questionnaires;
          r[`${loc} PDM Sites`] = row.isPdm ? Math.floor(row.cells[li].questionnaires / 7) : row.cells[li].questionnaires;
          r[`${loc} DC`] = row.cells[li].collectors;
        });
        r['Total Sites'] = row.totalSites; r['Total Actual'] = row.totalQ; r['Total PDM Sites'] = row.isPdm ? Math.floor(row.totalQ / 7) : row.totalQ; r['Total DC'] = row.totalCollectors;
        stRows.push(r);
      });
      const stTotal: any = { Activity: 'Total' };
      st.colTotals.forEach((ct, ci) => {
        const pdmSitesCol = st.matrix.reduce((a, r) => a + (r.isPdm ? Math.floor(r.cells[ci].questionnaires / 7) : r.cells[ci].questionnaires), 0);
        stTotal[`${st.localities[ci]} Sites`] = ct.sites; stTotal[`${st.localities[ci]} Actual`] = ct.questionnaires; stTotal[`${st.localities[ci]} PDM Sites`] = pdmSitesCol; stTotal[`${st.localities[ci]} DC`] = ct.collectors;
      });
      const stPdmSitesGrand = st.matrix.reduce((a, r) => a + (r.isPdm ? r.cells.reduce((b: any, c: any) => b + Math.floor(c.questionnaires / 7), 0) : r.totalQ), 0);
      stTotal['Total Sites'] = st.grandSites; stTotal['Total Actual'] = st.grandQ; stTotal['Total PDM Sites'] = stPdmSitesGrand; stTotal['Total DC'] = st.grandCollectors;
      stRows.push(stTotal);
      const sheetName = `State-${st.state}`.slice(0, 31);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stRows), sheetName);
    });

    XLSX.writeFile(wb, 'questionnaire_analytics.xlsx');
  }, [hubSummary, stateSummary, localitySummary, siteSummary, siteDetailsWithActivity, activityBreakdown, collectorDetails, trackerData]);

  const exportToPdf = useCallback(async () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    let y = await drawPdfHeader(doc, 'Questionnaire Analytics Report', 'تقرير تحليل الاستبيانات',
      `Total: ${filteredData.length} Questionnaires  |  ${new Set(filteredData.map(r => r.activitySite).filter(Boolean)).size} Sites`);
    const hasArabic = await loadArabicFont(doc);

    const totalQ = filteredData.length;
    const totalSites = new Set(filteredData.map(r => r.activitySite).filter(Boolean)).size;

    const hubRows = hubSummary.map((h, i) => [String(i + 1), h.name, String(h.sites), String(h.questionnaires), h.percentage.toFixed(1) + '%']);
    hubRows.push(['', 'Total', String(totalSites), String(totalQ), '100%']);
    y = styledAutoTable(doc, [['#', 'Hub', 'Sites', 'Questionnaires', '%']], hubRows, y - 2, { fontSize: 9, boldLastRow: true, useArabicFont: hasArabic });
    y += 4;

    if (y > 220) { doc.addPage(); addPageHeader(doc, 'By State'); y = 18; }
    doc.setFontSize(12); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
    doc.text('By State', 14, y); y += 3;
    const stateRows = stateSummary.map((s, i) => [String(i + 1), s.name, String(s.sites), String(s.collectors), String(s.questionnaires), s.percentage.toFixed(1) + '%']);
    stateRows.push(['', 'Total', String(totalSites), '', String(totalQ), '100%']);
    y = styledAutoTable(doc, [['#', 'State', 'Sites', 'DC', 'Questionnaires', '%']], stateRows, y, { fontSize: 9, boldLastRow: true, useArabicFont: hasArabic });
    y += 4;

    if (y > 220) { doc.addPage(); addPageHeader(doc, 'By Locality'); y = 18; }
    doc.setFontSize(12); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
    doc.text('By Locality', 14, y); y += 3;
    const locRows = localitySummary.map((l, i) => [String(i + 1), l.name, String(l.sites), String(l.questionnaires), l.percentage.toFixed(1) + '%']);
    locRows.push(['', 'Total', String(totalSites), String(totalQ), '100%']);
    y = styledAutoTable(doc, [['#', 'Locality', 'Sites', 'Questionnaires', '%']], locRows, y, { fontSize: 9, boldLastRow: true, useArabicFont: hasArabic });
    y += 4;

    if (y > 220) { doc.addPage(); addPageHeader(doc, 'By Activity'); y = 18; }
    doc.setFontSize(12); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
    doc.text('By Activity', 14, y); y += 3;
    const pdmSitesTotal = activityBreakdown.reduce((s, a) => s + (Math.floor(a.questionnaireCount / 7)), 0);
    const actRows = activityBreakdown.map(a => [a.name, String(a.siteCount), String(a.questionnaireCount), a.questionnaireCount ? String(Math.floor(a.questionnaireCount / 7)) : '-', a.percentage.toFixed(1) + '%']);
    actRows.push(['Total', String(totalSites), String(totalQ), pdmSitesTotal > 0 ? String(pdmSitesTotal) : '-', '100%']);
    y = styledAutoTable(doc, [['Activity', 'Sites', 'Questionnaires', 'PDM Sites', '%']], actRows, y, { fontSize: 9, boldLastRow: true, columnStyles: { 0: { cellWidth: 65 } }, useArabicFont: hasArabic });
    y += 4;

    if (y > 220) { doc.addPage(); addPageHeader(doc, 'By Data Collector'); y = 18; }
    doc.setFontSize(12); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
    doc.text('By Data Collector', 14, y); y += 3;
    const dcRows = collectorDetails.map((c, i) => [String(i + 1), c.profileId || '-', c.deviceId || '-', c.name, c.hubs.join(', '), c.states.join(', '), String(c.sites.length), c.activities.map((a: any) => a.name).join(', '), String(c.count), c.percentage.toFixed(1) + '%']);
    dcRows.push(['', '', '', 'Total', '', '', '', '', String(totalQ), '100%']);
    y = styledAutoTable(doc, [['#', 'UUID', 'Device ID', 'Collector', 'Hub', 'State', 'Sites', 'Activities', 'Q', '%']], dcRows, y, { fontSize: 6.5, boldLastRow: true, useArabicFont: hasArabic });
    y += 4;

    collectorDetails.forEach(c => {
      doc.addPage();
      addPageHeader(doc, 'Data Collector Report');
      y = 18;
      doc.setFontSize(12); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
      doc.text('Collector:', 14, y);
      if (hasArabic) { doc.setFont('Amiri', 'normal'); }
      doc.text(c.name, 42, y);
      doc.setFont('helvetica', 'normal');
      y += 5;
      doc.setFontSize(9); doc.setTextColor(90, 95, 110);
      doc.text(`UUID: ${c.profileId || '-'}  |  Device ID: ${c.deviceId || '-'}  |  Hub: ${c.hubs.join(', ')}  |  State: ${c.states.join(', ')}  |  Sites: ${c.sites.length}  |  ${c.count} Q (${c.percentage.toFixed(1)}%)`, 14, y);
      y += 6;
      if (c.nameVariants.length > 0) {
        doc.setFontSize(10); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
        doc.text(`Name Variants (${c.nameVariants.length + 1})`, 14, y); y += 3;
        const vRows = c.nameVariants.map((v: any, i: number) => [String(i + 1), v.name, String(v.count)]);
        vRows.unshift(['Primary', c.name, String(c.count - c.nameVariants.reduce((s: number, v: any) => s + v.count, 0))]);
        y = styledAutoTable(doc, [['#', 'Name', 'Count']], vRows, y, { fontSize: 8, useArabicFont: hasArabic });
        y += 4;
      }
      doc.setFontSize(10); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
      doc.text('Activities', 14, y); y += 3;
      const caRows = c.activities.map((a: any, i: number) => [String(i + 1), a.name, String(a.count)]);
      caRows.push(['', 'Total', String(c.count)]);
      y = styledAutoTable(doc, [['#', 'Activity', 'Count']], caRows, y, { fontSize: 9, boldLastRow: true, useArabicFont: hasArabic });
      y += 4;
      if (y > 240) { doc.addPage(); addPageHeader(doc, 'Data Collector Report'); y = 18; }
      doc.setFontSize(10); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
      doc.text('Localities', 14, y); y += 3;
      const clRows = c.localities.map((l: any, i: number) => [String(i + 1), l.name, String(l.count)]);
      clRows.push(['', 'Total', String(c.count)]);
      y = styledAutoTable(doc, [['#', 'Locality', 'Count']], clRows, y, { fontSize: 9, boldLastRow: true, useArabicFont: hasArabic });
      y += 4;
      if (c.sites.length > 0) {
        if (y > 240) { doc.addPage(); addPageHeader(doc, 'Data Collector Report'); y = 18; }
        doc.setFontSize(10); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
        doc.text(`Activity Sites (${c.sites.length})`, 14, y); y += 3;
        const csRows = c.sites.map((s: any, i: number) => [String(i + 1), s.name, s.locality || '-', s.state || '-', String(s.count)]);
        const csTotal = c.sites.reduce((sum: number, s: any) => sum + s.count, 0);
        csRows.push(['', 'Total', '', '', String(csTotal)]);
        y = styledAutoTable(doc, [['#', 'Site', 'Locality', 'State', 'Count']], csRows, y, { fontSize: 8, boldLastRow: true, useArabicFont: hasArabic });
      }
    });

    const { hubs: tHubs, matrix: tMatrix, hubTotals: tHubTotals, grandQ: tGrandQ, grandSites: tGrandSites, grandCollectors: tGrandCollectors, hubTrackers: tHubTrackers, stateTrackers: tStateTrackers } = trackerData;

    if (tHubs.length > 0 && tMatrix.length > 0) {
      doc.addPage(); addPageHeader(doc, 'Tracker - Activity by Hub'); y = 18;
      doc.setFontSize(13); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
      doc.text('Tracker — Activity by Hub', 14, y); y += 6;

      tHubs.forEach((hub: string, hi: number) => {
        if (y > 220) { doc.addPage(); addPageHeader(doc, 'Activity by Hub'); y = 18; }
        doc.setFontSize(11); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
        doc.text(hub, 14, y); y += 3;
        const aRows = tMatrix.filter(row => row.cells[hi].questionnaires > 0 || row.cells[hi].sites > 0).map(row => [
          row.activity, String(row.cells[hi].sites || '-'), String(row.cells[hi].questionnaires || '-'),
          row.cells[hi].questionnaires ? String(Math.floor(row.cells[hi].questionnaires / 7)) : '-',
          String(row.cells[hi].collectors || '-'),
        ]);
        const hubPdm = tMatrix.reduce((a: number, r: any) => a + (Math.floor(r.cells[hi].questionnaires / 7)), 0);
        aRows.push(['Total', String(tHubTotals[hi].sites), String(tHubTotals[hi].questionnaires), hubPdm ? String(hubPdm) : '-', String(tHubTotals[hi].collectors)]);
        y = styledAutoTable(doc, [['Activity', 'Sites', 'Actual', 'PDM Sites', 'DC']], aRows, y, { fontSize: 8, boldLastRow: true, columnStyles: { 0: { cellWidth: 55 } }, useArabicFont: hasArabic });
        y += 6;
      });
    }

    tHubTrackers.forEach(ht => {
      doc.addPage(); addPageHeader(doc, `Hub: ${ht.hub}`); y = 18;
      doc.setFontSize(12); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
      doc.text(`${ht.hub} — by State`, 14, y); y += 5;
      ht.states.forEach((st: string, si: number) => {
        if (y > 240) { doc.addPage(); addPageHeader(doc, `Hub: ${ht.hub}`); y = 18; }
        doc.setFontSize(10); doc.setTextColor(41, 98, 255); doc.setFont('helvetica', 'bold');
        doc.text(`State: ${st}`, 18, y); y += 3;
        const sRows = ht.matrix.filter(row => row.cells[si].questionnaires > 0 || row.cells[si].sites > 0).map(row => [
          row.activity, String(row.cells[si].sites || '-'), String(row.cells[si].questionnaires || '-'),
          row.cells[si].questionnaires ? String(Math.floor(row.cells[si].questionnaires / 7)) : '-',
          String(row.cells[si].collectors || '-'),
        ]);
        const colPdm = ht.matrix.reduce((a: number, r: any) => a + (Math.floor(r.cells[si].questionnaires / 7)), 0);
        sRows.push(['Total', String(ht.colTotals[si].sites), String(ht.colTotals[si].questionnaires), colPdm ? String(colPdm) : '-', String(ht.colTotals[si].collectors)]);
        y = styledAutoTable(doc, [['Activity', 'Sites', 'Actual', 'PDM Sites', 'DC']], sRows, y, { fontSize: 8, boldLastRow: true, columnStyles: { 0: { cellWidth: 55 } }, useArabicFont: hasArabic });
        y += 5;
      });
    });

    tStateTrackers.forEach(st => {
      doc.addPage(); addPageHeader(doc, `State: ${st.state}`); y = 18;
      doc.setFontSize(12); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
      doc.text(`${st.state} — by Locality`, 14, y); y += 5;
      st.localities.forEach((loc: string, li: number) => {
        if (y > 240) { doc.addPage(); addPageHeader(doc, `State: ${st.state}`); y = 18; }
        doc.setFontSize(10); doc.setTextColor(41, 98, 255); doc.setFont('helvetica', 'bold');
        doc.text(`Locality: ${loc}`, 18, y); y += 3;
        const lRows = st.matrix.filter(row => row.cells[li].questionnaires > 0 || row.cells[li].sites > 0).map(row => [
          row.activity, String(row.cells[li].sites || '-'), String(row.cells[li].questionnaires || '-'),
          row.cells[li].questionnaires ? String(Math.floor(row.cells[li].questionnaires / 7)) : '-',
          String(row.cells[li].collectors || '-'),
        ]);
        const locPdm = st.matrix.reduce((a: number, r: any) => a + (Math.floor(r.cells[li].questionnaires / 7)), 0);
        lRows.push(['Total', String(st.colTotals[li].sites), String(st.colTotals[li].questionnaires), locPdm ? String(locPdm) : '-', String(st.colTotals[li].collectors)]);
        y = styledAutoTable(doc, [['Activity', 'Sites', 'Actual', 'PDM Sites', 'DC']], lRows, y, { fontSize: 8, boldLastRow: true, columnStyles: { 0: { cellWidth: 55 } }, useArabicFont: hasArabic });
        y += 5;
      });
    });

    addAllFooters(doc);
    doc.save('questionnaire_analytics.pdf');
  }, [filteredData, hubSummary, stateSummary, localitySummary, activityBreakdown, collectorDetails, trackerData]);

  const exportTrackerToExcel = useCallback(() => {
    const wb = XLSX.utils.book_new();
    const { hubs, activities, matrix, hubTotals, grandQ, grandSites, grandCollectors, stateBreakdown, hubTrackers, stateTrackers } = trackerData;

    const rows: any[] = [];
    matrix.forEach(row => {
      const r: any = { Activity: row.activity };
      hubs.forEach((hub, hi) => {
        r[`${hub} Sites`] = row.cells[hi].sites;
        r[`${hub} Actual`] = row.cells[hi].questionnaires;
        r[`${hub} PDM Sites`] = Math.floor(row.cells[hi].questionnaires / 7);
        r[`${hub} DC`] = row.cells[hi].collectors;
      });
      r['Total Sites'] = row.totalSites;
      r['Total Actual'] = row.totalQ;
      r['Total PDM Sites'] = Math.floor(row.totalQ / 7);
      r['Total DC'] = row.totalCollectors;
      rows.push(r);
    });
    const totalRow: any = { Activity: 'Grand Total' };
    hubs.forEach((hub, hi) => {
      totalRow[`${hub} Sites`] = hubTotals[hi].sites;
      totalRow[`${hub} Actual`] = hubTotals[hi].questionnaires;
      const pdmSitesCol = matrix.reduce((a, r) => a + (Math.floor(r.cells[hi].questionnaires / 7)), 0);
      totalRow[`${hub} PDM Sites`] = pdmSitesCol || 0;
      totalRow[`${hub} DC`] = hubTotals[hi].collectors;
    });
    totalRow['Total Sites'] = grandSites;
    totalRow['Total Actual'] = grandQ;
    const pdmSitesGrand2 = matrix.reduce((a, r) => a + r.cells.reduce((b: any, c: any) => b + Math.floor(c.questionnaires / 7), 0), 0);
    totalRow['Total PDM Sites'] = pdmSitesGrand2 || 0;
    totalRow['Total DC'] = grandCollectors;
    rows.push(totalRow);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Activity x Hub');

    const stateRows: any[] = [];
    stateBreakdown.forEach(sb => {
      sb.activities.forEach(a => {
        if (a.questionnaires > 0) {
          stateRows.push({ State: sb.state, Activity: a.activity, Sites: a.sites, Questionnaires: a.questionnaires, 'PDM Sites': Math.floor(a.questionnaires / 7) });
        }
      });
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stateRows), 'Activity x State');

    hubTrackers.forEach(ht => {
      const htRows: any[] = [];
      ht.matrix.forEach(row => {
        const r: any = { Activity: row.activity };
        ht.states.forEach((st, si) => {
          r[`${st} Sites`] = row.cells[si].sites;
          r[`${st} Actual`] = row.cells[si].questionnaires;
          r[`${st} PDM Sites`] = row.isPdm ? Math.floor(row.cells[si].questionnaires / 7) : row.cells[si].questionnaires;
          r[`${st} DC`] = row.cells[si].collectors;
        });
        r['Total Sites'] = row.totalSites; r['Total Actual'] = row.totalQ; r['Total PDM Sites'] = row.isPdm ? Math.floor(row.totalQ / 7) : row.totalQ; r['Total DC'] = row.totalCollectors;
        htRows.push(r);
      });
      const htTotal: any = { Activity: 'Total' };
      ht.colTotals.forEach((ct, ci) => {
        const pdmSitesCol = ht.matrix.reduce((a, r) => a + (r.isPdm ? Math.floor(r.cells[ci].questionnaires / 7) : r.cells[ci].questionnaires), 0);
        htTotal[`${ht.states[ci]} Sites`] = ct.sites; htTotal[`${ht.states[ci]} Actual`] = ct.questionnaires; htTotal[`${ht.states[ci]} PDM Sites`] = pdmSitesCol || 0; htTotal[`${ht.states[ci]} DC`] = ct.collectors;
      });
      const htPdmSitesGrand = ht.matrix.reduce((a, r) => a + (r.isPdm ? r.cells.reduce((b: any, c: any) => b + Math.floor(c.questionnaires / 7), 0) : r.totalQ), 0);
      htTotal['Total Sites'] = ht.grandSites; htTotal['Total Actual'] = ht.grandQ; htTotal['Total PDM Sites'] = htPdmSitesGrand || 0; htTotal['Total DC'] = ht.grandCollectors;
      htRows.push(htTotal);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(htRows), `Hub-${ht.hub}`.slice(0, 31));
    });

    stateTrackers.forEach(st => {
      const stRows: any[] = [];
      st.matrix.forEach(row => {
        const r: any = { Activity: row.activity };
        st.localities.forEach((loc, li) => {
          r[`${loc} Sites`] = row.cells[li].sites;
          r[`${loc} Actual`] = row.cells[li].questionnaires;
          r[`${loc} PDM Sites`] = row.isPdm ? Math.floor(row.cells[li].questionnaires / 7) : row.cells[li].questionnaires;
          r[`${loc} DC`] = row.cells[li].collectors;
        });
        r['Total Sites'] = row.totalSites; r['Total Actual'] = row.totalQ; r['Total PDM Sites'] = row.isPdm ? Math.floor(row.totalQ / 7) : row.totalQ; r['Total DC'] = row.totalCollectors;
        stRows.push(r);
      });
      const stTotal: any = { Activity: 'Total' };
      st.colTotals.forEach((ct, ci) => {
        const pdmSitesCol = st.matrix.reduce((a, r) => a + (r.isPdm ? Math.floor(r.cells[ci].questionnaires / 7) : r.cells[ci].questionnaires), 0);
        stTotal[`${st.localities[ci]} Sites`] = ct.sites; stTotal[`${st.localities[ci]} Actual`] = ct.questionnaires; stTotal[`${st.localities[ci]} PDM Sites`] = pdmSitesCol; stTotal[`${st.localities[ci]} DC`] = ct.collectors;
      });
      const stPdmSitesGrand = st.matrix.reduce((a, r) => a + (r.isPdm ? r.cells.reduce((b: any, c: any) => b + Math.floor(c.questionnaires / 7), 0) : r.totalQ), 0);
      stTotal['Total Sites'] = st.grandSites; stTotal['Total Actual'] = st.grandQ; stTotal['Total PDM Sites'] = stPdmSitesGrand; stTotal['Total DC'] = st.grandCollectors;
      stRows.push(stTotal);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stRows), `State-${st.state}`.slice(0, 31));
    });

    XLSX.writeFile(wb, 'tracker_report.xlsx');
  }, [trackerData]);

  const exportActivityByStateExcel = useCallback(() => {
    const wb = XLSX.utils.book_new();
    const rows: any[] = [];
    trackerData.stateBreakdown.forEach(sb => {
      sb.activities.filter(a => a.questionnaires > 0).forEach(a => {
        rows.push({ State: sb.state, Activity: a.activity, Sites: a.sites, Questionnaires: a.questionnaires, 'PDM Sites': Math.floor(a.questionnaires / 7) });
      });
      const pdmSitesTotal = sb.activities.filter(a => a.questionnaires > 0).reduce((s, a) => s + (Math.floor(a.questionnaires / 7)), 0);
      rows.push({ State: sb.state, Activity: 'Total', Sites: sb.activities.filter(a => a.questionnaires > 0).reduce((s, a) => s + a.sites, 0), Questionnaires: sb.totalQ, 'PDM Sites': pdmSitesTotal || '-' });
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Activity by State');
    XLSX.writeFile(wb, 'tracker_activity_by_state.xlsx');
  }, [trackerData]);

  const exportActivityByStatePdf = useCallback(async () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    let y = await drawPdfHeader(doc, 'Tracker - Activity by State', 'المتتبع - النشاط حسب الولاية');
    
    trackerData.stateBreakdown.forEach((sb: any) => {
      if (y > 240) { doc.addPage(); addPageHeader(doc, 'Activity by State'); y = 18; }
      doc.setFontSize(11);
      doc.setTextColor(15, 32, 65);
      doc.setFont('helvetica', 'bold');
      doc.text(`${sb.state} (${sb.totalQ} Q)`, 14, y);
      y += 2;
      const actRows = sb.activities.filter((a: any) => a.questionnaires > 0).map((a: any) => [a.activity, String(a.sites), String(a.questionnaires), String(Math.floor(a.questionnaires / 7))]);
      const pdmSitesTotal = sb.activities.filter((a: any) => a.questionnaires > 0).reduce((s: number, a: any) => s + (Math.floor(a.questionnaires / 7)), 0);
      actRows.push(['Total', String(sb.activities.filter((a: any) => a.questionnaires > 0).reduce((s: number, a: any) => s + a.sites, 0)), String(sb.totalQ), pdmSitesTotal ? String(pdmSitesTotal) : '-']);
      y = styledAutoTable(doc, [['Activity', 'Sites', 'Questionnaires', 'PDM Sites']], actRows, y, { fontSize: 9, boldLastRow: true, columnStyles: { 0: { cellWidth: 65 } } });
      y += 8;
    });
    addAllFooters(doc);
    doc.save('tracker_activity_by_state.pdf');
  }, [trackerData]);

  const exportTrackerPerHubExcel = useCallback((costPerSite = 0, exchangeRate = 0) => {
    const wb = XLSX.utils.book_new();
    trackerData.hubTrackers.forEach(ht => {
      const htRows: any[] = [];
      ht.matrix.forEach(row => {
        const r: any = { Activity: row.activity };
        ht.states.forEach((st, si) => {
          r[`${st} Sites`] = row.cells[si].sites;
          r[`${st} Actual`] = row.cells[si].questionnaires;
          r[`${st} PDM Sites`] = row.isPdm ? Math.floor(row.cells[si].questionnaires / 7) : row.cells[si].questionnaires;
          r[`${st} DC`] = row.cells[si].collectors;
        });
        r['Total Sites'] = row.totalSites; r['Total Actual'] = row.totalQ; r['Total PDM Sites'] = row.isPdm ? Math.floor(row.totalQ / 7) : row.totalQ; r['Total DC'] = row.totalCollectors;
        htRows.push(r);
      });
      const htTotal: any = { Activity: 'Total' };
      ht.colTotals.forEach((ct, ci) => {
        const pdmSitesCol = ht.matrix.reduce((a, r) => a + (r.isPdm ? Math.floor(r.cells[ci].questionnaires / 7) : r.cells[ci].questionnaires), 0);
        htTotal[`${ht.states[ci]} Sites`] = ct.sites; htTotal[`${ht.states[ci]} Actual`] = ct.questionnaires; htTotal[`${ht.states[ci]} PDM Sites`] = pdmSitesCol || 0; htTotal[`${ht.states[ci]} DC`] = ct.collectors;
      });
      const htPdmSitesGrand = ht.matrix.reduce((a, r) => a + (r.isPdm ? r.cells.reduce((b: any, c: any) => b + Math.floor(c.questionnaires / 7), 0) : r.totalQ), 0);
      htTotal['Total Sites'] = ht.grandSites; htTotal['Total Actual'] = ht.grandQ; htTotal['Total PDM Sites'] = htPdmSitesGrand || 0; htTotal['Total DC'] = ht.grandCollectors;
      htRows.push(htTotal);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(htRows), `${ht.hub}`.slice(0, 31));
    });
    if (costPerSite > 0) {
      const payRows = trackerData.hubTrackers.map((ht: any, i: number) => {
        const pdmAdj = ht.matrix.reduce((a: number, r: any) => a + (r.isPdm ? r.cells.reduce((b: number, c: any) => b + Math.floor(c.questionnaires / 7), 0) : r.totalQ), 0);
        return { '#': i + 1, 'Hub': ht.hub, 'PDM Sites': pdmAdj, 'Cost/Site (USD)': costPerSite, 'Total (USD)': pdmAdj * costPerSite, 'Rate (SDG/USD)': exchangeRate, 'Total (SDG)': pdmAdj * costPerSite * exchangeRate };
      });
      const gs = payRows.reduce((s: number, r: any) => s + r['PDM Sites'], 0);
      payRows.push({ '#': '', 'Hub': 'GRAND TOTAL', 'PDM Sites': gs, 'Cost/Site (USD)': costPerSite, 'Total (USD)': gs * costPerSite, 'Rate (SDG/USD)': exchangeRate, 'Total (SDG)': gs * costPerSite * exchangeRate });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(payRows), 'Payment');
    }
    XLSX.writeFile(wb, 'tracker_per_hub.xlsx');
  }, [trackerData]);

  const exportTrackerPerHubPdf = useCallback(async () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    let y = await drawPdfHeader(doc, 'Tracker per Hub', 'المتتبع لكل محور');
    
    trackerData.hubTrackers.forEach((ht: any) => {
      if (y > 220) { doc.addPage(); addPageHeader(doc, 'Tracker per Hub'); y = 18; }
      doc.setFontSize(13);
      doc.setTextColor(15, 32, 65);
      doc.setFont('helvetica', 'bold');
      doc.text(ht.hub, 14, y);
      doc.setFontSize(9);
      doc.setTextColor(90, 95, 110);
      doc.setFont('helvetica', 'normal');
      doc.text(`${ht.grandQ} Questionnaires  |  ${ht.grandSites} Sites  |  ${ht.grandCollectors} Collectors`, 14, y + 5);
      y += 10;

      ht.states.forEach((st: string, si: number) => {
        if (y > 240) { doc.addPage(); addPageHeader(doc, 'Tracker per Hub'); y = 18; }
        doc.setFontSize(10);
        doc.setTextColor(41, 98, 255);
        doc.setFont('helvetica', 'bold');
        doc.text(`State: ${st}`, 18, y);
        y += 3;
        const stRows = ht.matrix.filter((row: any) => row.cells[si].questionnaires > 0 || row.cells[si].sites > 0).map((row: any) => [
          row.activity,
          String(row.cells[si].sites || '-'),
          String(row.cells[si].questionnaires || '-'),
          row.cells[si].questionnaires ? String(Math.floor(row.cells[si].questionnaires / 7)) : '-',
          String(row.cells[si].collectors || '-'),
        ]);
        const colPdmSites = ht.matrix.reduce((a: number, r: any) => a + Math.floor(r.cells[si].questionnaires / 7), 0);
        stRows.push(['Total', String(ht.colTotals[si].sites), String(ht.colTotals[si].questionnaires), colPdmSites ? String(colPdmSites) : '-', String(ht.colTotals[si].collectors)]);
        y = styledAutoTable(doc, [['Activity', 'Sites', 'Actual', 'PDM Sites', 'DC']], stRows, y, { fontSize: 9, boldLastRow: true, columnStyles: { 0: { cellWidth: 65 } } });
        y += 6;
      });

      if (y > 240) { doc.addPage(); addPageHeader(doc, 'Tracker per Hub'); y = 18; }
      doc.setFontSize(10);
      doc.setTextColor(15, 32, 65);
      doc.setFont('helvetica', 'bold');
      doc.text(`${ht.hub} — Hub Total`, 14, y);
      y += 3;
      const hubTotRows = ht.matrix.map((row: any) => [
        row.activity, String(row.totalSites), String(row.totalQ),
        row.totalQ ? String(Math.floor(row.totalQ / 7)) : '-', String(row.totalCollectors),
      ]);
      const htPdmSitesGrand = ht.matrix.reduce((a: number, r: any) => a + r.cells.reduce((b: any, c: any) => b + Math.floor(c.questionnaires / 7), 0), 0);
      hubTotRows.push(['Grand Total', String(ht.grandSites), String(ht.grandQ), htPdmSitesGrand ? String(htPdmSitesGrand) : '-', String(ht.grandCollectors)]);
      y = styledAutoTable(doc, [['Activity', 'Sites', 'Actual', 'PDM Sites', 'DC']], hubTotRows, y, { fontSize: 9, boldLastRow: true, columnStyles: { 0: { cellWidth: 65 } } });
      y += 12;
    });
    addAllFooters(doc);
    doc.save('tracker_per_hub.pdf');
  }, [trackerData]);

  const exportTrackerPerStateExcel = useCallback(() => {
    const wb = XLSX.utils.book_new();
    trackerData.stateTrackers.forEach(st => {
      const stRows: any[] = [];
      st.matrix.forEach(row => {
        const r: any = { Activity: row.activity };
        st.localities.forEach((loc, li) => {
          r[`${loc} Sites`] = row.cells[li].sites;
          r[`${loc} Actual`] = row.cells[li].questionnaires;
          r[`${loc} PDM Sites`] = row.isPdm ? Math.floor(row.cells[li].questionnaires / 7) : row.cells[li].questionnaires;
          r[`${loc} DC`] = row.cells[li].collectors;
        });
        r['Total Sites'] = row.totalSites; r['Total Actual'] = row.totalQ; r['Total PDM Sites'] = row.isPdm ? Math.floor(row.totalQ / 7) : row.totalQ; r['Total DC'] = row.totalCollectors;
        stRows.push(r);
      });
      const stTotal: any = { Activity: 'Total' };
      st.colTotals.forEach((ct, ci) => {
        const pdmSitesCol = st.matrix.reduce((a, r) => a + (r.isPdm ? Math.floor(r.cells[ci].questionnaires / 7) : r.cells[ci].questionnaires), 0);
        stTotal[`${st.localities[ci]} Sites`] = ct.sites; stTotal[`${st.localities[ci]} Actual`] = ct.questionnaires; stTotal[`${st.localities[ci]} PDM Sites`] = pdmSitesCol; stTotal[`${st.localities[ci]} DC`] = ct.collectors;
      });
      const stPdmSitesGrand = st.matrix.reduce((a, r) => a + (r.isPdm ? r.cells.reduce((b: any, c: any) => b + Math.floor(c.questionnaires / 7), 0) : r.totalQ), 0);
      stTotal['Total Sites'] = st.grandSites; stTotal['Total Actual'] = st.grandQ; stTotal['Total PDM Sites'] = stPdmSitesGrand; stTotal['Total DC'] = st.grandCollectors;
      stRows.push(stTotal);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stRows), `${st.state}`.slice(0, 31));
    });
    XLSX.writeFile(wb, 'tracker_per_state.xlsx');
  }, [trackerData]);

  const exportTrackerPerStatePdf = useCallback(async () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    let y = await drawPdfHeader(doc, 'Tracker per State', 'المتتبع لكل ولاية');
    
    trackerData.stateTrackers.forEach((st: any) => {
      if (y > 220) { doc.addPage(); addPageHeader(doc, 'Tracker per State'); y = 18; }
      doc.setFontSize(13);
      doc.setTextColor(15, 32, 65);
      doc.setFont('helvetica', 'bold');
      doc.text(st.state, 14, y);
      doc.setFontSize(9);
      doc.setTextColor(90, 95, 110);
      doc.setFont('helvetica', 'normal');
      doc.text(`${st.grandQ} Questionnaires  |  ${st.grandSites} Sites  |  ${st.grandCollectors} Collectors`, 14, y + 5);
      y += 10;

      st.localities.forEach((loc: string, li: number) => {
        if (y > 240) { doc.addPage(); addPageHeader(doc, 'Tracker per State'); y = 18; }
        doc.setFontSize(10);
        doc.setTextColor(41, 98, 255);
        doc.setFont('helvetica', 'bold');
        doc.text(`Locality: ${loc}`, 18, y);
        y += 3;
        const locRows = st.matrix.filter((row: any) => row.cells[li].questionnaires > 0 || row.cells[li].sites > 0).map((row: any) => [
          row.activity,
          String(row.cells[li].sites || '-'),
          String(row.cells[li].questionnaires || '-'),
          row.cells[li].questionnaires ? String(Math.floor(row.cells[li].questionnaires / 7)) : '-',
          String(row.cells[li].collectors || '-'),
        ]);
        const colPdmSites = st.matrix.reduce((a: number, r: any) => a + Math.floor(r.cells[li].questionnaires / 7), 0);
        locRows.push(['Total', String(st.colTotals[li].sites), String(st.colTotals[li].questionnaires), colPdmSites ? String(colPdmSites) : '-', String(st.colTotals[li].collectors)]);
        y = styledAutoTable(doc, [['Activity', 'Sites', 'Actual', 'PDM Sites', 'DC']], locRows, y, { fontSize: 9, boldLastRow: true, columnStyles: { 0: { cellWidth: 65 } } });
        y += 6;
      });

      if (y > 240) { doc.addPage(); addPageHeader(doc, 'Tracker per State'); y = 18; }
      doc.setFontSize(10);
      doc.setTextColor(15, 32, 65);
      doc.setFont('helvetica', 'bold');
      doc.text(`${st.state} — State Total`, 14, y);
      y += 3;
      const stateTotRows = st.matrix.map((row: any) => [
        row.activity, String(row.totalSites), String(row.totalQ),
        row.totalQ ? String(Math.floor(row.totalQ / 7)) : '-', String(row.totalCollectors),
      ]);
      const stPdmSitesGrand = st.matrix.reduce((a: number, r: any) => a + r.cells.reduce((b: any, c: any) => b + Math.floor(c.questionnaires / 7), 0), 0);
      stateTotRows.push(['Grand Total', String(st.grandSites), String(st.grandQ), stPdmSitesGrand ? String(stPdmSitesGrand) : '-', String(st.grandCollectors)]);
      y = styledAutoTable(doc, [['Activity', 'Sites', 'Actual', 'PDM Sites', 'DC']], stateTotRows, y, { fontSize: 9, boldLastRow: true, columnStyles: { 0: { cellWidth: 65 } } });
      y += 12;
    });
    addAllFooters(doc);
    doc.save('tracker_per_state.pdf');
  }, [trackerData]);

  const exportCollectorPdf = useCallback(async (collector: CollectorDetail) => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pw = doc.internal.pageSize.width;
    const ml = 14;
    const mr = 14;

    let y = await drawPdfHeader(doc, `Data Collector Report`, 'تقرير جامع البيانات', `${collector.name} — ${collector.count} questionnaires (${collector.percentage.toFixed(1)}%)`);
    const hasArabic = await loadArabicFont(doc);

    doc.setFillColor(245, 247, 252);
    doc.setDrawColor(200, 205, 215);
    doc.roundedRect(ml, y, pw - ml - mr, 24, 2, 2, 'FD');
    y += 6;
    doc.setFontSize(10);
    doc.setTextColor(45, 45, 60);
    doc.setFont('helvetica', 'bold');
    doc.text('Collector Name:', ml + 4, y);
    if (hasArabic) {
      doc.setFont('Amiri', 'normal');
    } else {
      doc.setFont('helvetica', 'normal');
    }
    doc.text(collector.name, ml + 40, y);
    doc.setFont('helvetica', 'normal');
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.text('Device ID:', ml + 4, y);
    doc.setFont('helvetica', 'normal');
    doc.text(collector.deviceId || '-', ml + 40, y);
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.text('Hub(s):', ml + 4, y);
    doc.setFont('helvetica', 'normal');
    doc.text(collector.hubs.join(', '), ml + 40, y);
    doc.setFont('helvetica', 'bold');
    doc.text('State(s):', pw / 2, y);
    doc.setFont('helvetica', 'normal');
    doc.text(collector.states.join(', '), pw / 2 + 20, y);
    y += 10;

    if (collector.nameVariants.length > 0) {
      doc.setFontSize(11);
      doc.setTextColor(15, 32, 65);
      doc.setFont('helvetica', 'bold');
      doc.text(`Name Variants (${collector.nameVariants.length + 1})`, ml, y);
      y += 2;
      const variantRows = collector.nameVariants.map((v: any, i: number) => [String(i + 1), v.name, String(v.count)]);
      variantRows.unshift(['★', collector.name, String(collector.count - collector.nameVariants.reduce((s: number, v: any) => s + v.count, 0))]);
      y = styledAutoTable(doc, [['#', 'Name', 'Count']], variantRows, y, { fontSize: 8, useArabicFont: hasArabic });
      y += 6;
    }

    if (y > 240) { doc.addPage(); addPageHeader(doc, 'Data Collector Report'); y = 18; }
    doc.setFontSize(11);
    doc.setTextColor(15, 32, 65);
    doc.setFont('helvetica', 'bold');
    doc.text('Activities Breakdown', ml, y);
    y += 2;
    const actRows = collector.activities.map((a: any, i: number) => [String(i + 1), a.name, String(a.count)]);
    const actTotal = collector.activities.reduce((s: number, a: any) => s + a.count, 0);
    actRows.push(['', 'Total', String(actTotal)]);
    y = styledAutoTable(doc, [['#', 'Activity', 'Count']], actRows, y, { fontSize: 9, boldLastRow: true, useArabicFont: hasArabic });
    y += 6;

    if (y > 240) { doc.addPage(); addPageHeader(doc, 'Data Collector Report'); y = 18; }
    doc.setFontSize(11);
    doc.setTextColor(15, 32, 65);
    doc.setFont('helvetica', 'bold');
    doc.text('Localities Breakdown', ml, y);
    y += 2;
    const locRows = collector.localities.map((l: any, i: number) => [String(i + 1), l.name, String(l.count)]);
    y = styledAutoTable(doc, [['#', 'Locality', 'Count']], locRows, y, { fontSize: 9, useArabicFont: hasArabic });
    y += 6;

    if (collector.sites.length > 0) {
      if (y > 240) { doc.addPage(); addPageHeader(doc, 'Data Collector Report'); y = 18; }
      doc.setFontSize(11);
      doc.setTextColor(15, 32, 65);
      doc.setFont('helvetica', 'bold');
      doc.text(`Activity Sites (${collector.sites.length})`, ml, y);
      y += 2;
      const siteRows = collector.sites.map((s: any, i: number) => [String(i + 1), s.name, s.locality || '-', s.state || '-', String(s.count)]);
      const siteTotal = collector.sites.reduce((sum: number, s: any) => sum + s.count, 0);
      siteRows.push(['', 'Total', '', '', String(siteTotal)]);
      y = styledAutoTable(doc, [['#', 'Site Name', 'Locality', 'State', 'Count']], siteRows, y, { fontSize: 8, boldLastRow: true, useArabicFont: hasArabic });
    }

    addAllFooters(doc);

    const safeName = collector.name.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_').slice(0, 30);
    doc.save(`collector_${safeName}.pdf`);
  }, []);

  const toggleDrillHub = useCallback((hub: string) => {
    setDrillExpandedHubs(prev => {
      const n = new Set(prev);
      if (n.has(hub)) {
        n.delete(hub);
        setDrillExpandedStates(sp => { const ns = new Set<string>(); sp.forEach(k => { if (!k.startsWith(`${hub}::`)) ns.add(k); }); return ns; });
        setDrillExpandedActivities(ap => { const na = new Set<string>(); ap.forEach(k => { if (!k.startsWith(`${hub}::`)) na.add(k); }); return na; });
      } else {
        n.add(hub);
      }
      return n;
    });
  }, []);
  const toggleDrillState = useCallback((key: string) => {
    setDrillExpandedStates(prev => {
      const n = new Set(prev);
      if (n.has(key)) {
        n.delete(key);
        setDrillExpandedActivities(ap => { const na = new Set<string>(); ap.forEach(k => { if (!k.startsWith(`${key}::`)) na.add(k); }); return na; });
      } else {
        n.add(key);
      }
      return n;
    });
  }, []);
  const toggleDrillActivity = useCallback((key: string) => {
    setDrillExpandedActivities(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }, []);
  const toggleDrillLocality = useCallback((key: string) => {
    setDrillExpandedLocalities(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }, []);

  const exportHubDrilldownExcel = useCallback(() => {
    const wb = XLSX.utils.book_new();
    const rows: any[] = [];
    hubDrilldown.forEach(hub => {
      rows.push({ Level: 'Hub', Hub: hub.name, State: '', Activity: '', Locality: '', 'Site Name': '', Sites: hub.sites, Questionnaires: hub.questionnaires, '%': hub.percentage.toFixed(1) + '%' });
      hub.states.forEach(st => {
        rows.push({ Level: 'State', Hub: hub.name, State: st.name, Activity: '', Locality: '', 'Site Name': '', Sites: st.sites, Questionnaires: st.questionnaires, '%': st.percentage.toFixed(1) + '%' });
        st.activities.forEach(act => {
          rows.push({ Level: 'Activity', Hub: hub.name, State: st.name, Activity: act.name, Locality: '', 'Site Name': '', Sites: act.sites, Questionnaires: act.questionnaires, '%': act.percentage.toFixed(1) + '%' });
          act.localities.forEach(loc => {
            rows.push({ Level: 'Locality', Hub: hub.name, State: st.name, Activity: act.name, Locality: loc.name, 'Site Name': '', Sites: loc.sites, Questionnaires: loc.questionnaires, '%': loc.percentage.toFixed(1) + '%' });
            loc.siteNames.forEach(sn => {
              rows.push({ Level: 'Site', Hub: hub.name, State: st.name, Activity: act.name, Locality: loc.name, 'Site Name': sn, Sites: '', Questionnaires: '', '%': '' });
            });
          });
        });
      });
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Hub Drilldown');
    XLSX.writeFile(wb, 'hub_drilldown.xlsx');
  }, [hubDrilldown]);

  const exportHubDrilldownPdf = useCallback(async () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    let y = await drawPdfHeader(doc, 'Hub Distribution - Drilldown Report', 'التوزيع حسب المحور');
    
    hubDrilldown.forEach((hub: any) => {
      if (y > 220) { doc.addPage(); addPageHeader(doc, 'Hub Drilldown'); y = 18; }
      doc.setFontSize(13);
      doc.setTextColor(15, 32, 65);
      doc.setFont('helvetica', 'bold');
      doc.text(hub.name, 14, y);
      doc.setFontSize(9);
      doc.setTextColor(90, 95, 110);
      doc.setFont('helvetica', 'normal');
      doc.text(`${hub.questionnaires} Questionnaires  |  ${hub.sites} Sites  |  ${hub.percentage.toFixed(1)}%`, 14, y + 5);
      y += 10;

      hub.states.forEach((st: any) => {
        if (y > 240) { doc.addPage(); addPageHeader(doc, 'Hub Drilldown'); y = 18; }
        doc.setFontSize(10);
        doc.setTextColor(41, 98, 255);
        doc.setFont('helvetica', 'bold');
        doc.text(`State: ${st.name} — ${st.questionnaires} Q, ${st.sites} sites`, 18, y);
        y += 4;

        st.activities.forEach((act: any) => {
          if (y > 250) { doc.addPage(); addPageHeader(doc, 'Hub Drilldown'); y = 18; }
          doc.setFontSize(9);
          doc.setTextColor(16, 185, 129);
          doc.setFont('helvetica', 'bold');
          doc.text(`${act.name} — ${act.questionnaires} Q, ${act.sites} sites`, 22, y);
          y += 3;

          act.localities.forEach((loc: any) => {
            if (y > 255) { doc.addPage(); addPageHeader(doc, 'Hub Drilldown'); y = 18; }
            doc.setFontSize(8);
            doc.setTextColor(217, 119, 6);
            doc.setFont('helvetica', 'bold');
            doc.text(`${loc.name} — ${loc.questionnaires} Q, ${loc.sites} sites`, 26, y);
            y += 3;
            if (loc.siteNames && loc.siteNames.length > 0) {
              const siteRows = loc.siteNames.map((sn: string, idx: number) => [String(idx + 1), sn]);
              y = styledAutoTable(doc, [['#', 'Site Name']], siteRows, y, {
                fontSize: 8,
                margin: { left: 30, right: 14 },
                columnStyles: { 0: { cellWidth: 10, halign: 'center', fontStyle: 'normal' }, 1: { cellWidth: 120 } },
              });
              y += 3;
            }
          });
          y += 2;
        });
        y += 4;
      });
      y += 6;
    });
    addAllFooters(doc);
    doc.save('hub_drilldown.pdf');
  }, [hubDrilldown]);

  const exportMainTrackerPdf = useCallback(async () => {
    const { hubs, matrix, hubTotals, grandQ, grandSites, grandCollectors } = trackerData;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    let y = await drawPdfHeader(doc, 'Tracker - Activity by Hub', 'المتتبع - النشاط حسب المحور');

    hubs.forEach((hub: string, hi: number) => {
      if (y > 220) { doc.addPage(); addPageHeader(doc, 'Activity by Hub'); y = 18; }
      doc.setFontSize(12);
      doc.setTextColor(15, 32, 65);
      doc.setFont('helvetica', 'bold');
      doc.text(hub, 14, y);
      doc.setFontSize(9);
      doc.setTextColor(90, 95, 110);
      doc.setFont('helvetica', 'normal');
      doc.text(`${hubTotals[hi].questionnaires} Questionnaires  |  ${hubTotals[hi].sites} Sites  |  ${hubTotals[hi].collectors} Collectors`, 14, y + 5);
      y += 9;
      const actRows = matrix.filter((row: any) => row.cells[hi].questionnaires > 0 || row.cells[hi].sites > 0).map((row: any) => [
        row.activity,
        String(row.cells[hi].sites || '-'),
        String(row.cells[hi].questionnaires || '-'),
        row.cells[hi].questionnaires ? String(Math.floor(row.cells[hi].questionnaires / 7)) : '-',
        String(row.cells[hi].collectors || '-'),
      ]);
      const hubPdmSites = matrix.reduce((a: number, r: any) => a + (Math.floor(r.cells[hi].questionnaires / 7)), 0);
      actRows.push(['Total', String(hubTotals[hi].sites), String(hubTotals[hi].questionnaires), hubPdmSites ? String(hubPdmSites) : '-', String(hubTotals[hi].collectors)]);
      y = styledAutoTable(doc, [['Activity', 'Sites', 'Actual', 'PDM Sites', 'DC']], actRows, y, { fontSize: 9, boldLastRow: true, columnStyles: { 0: { cellWidth: 65 } } });
      y += 10;
    });

    if (y > 220) { doc.addPage(); addPageHeader(doc, 'Activity by Hub'); y = 18; }
    doc.setFontSize(13);
    doc.setTextColor(15, 32, 65);
    doc.setFont('helvetica', 'bold');
    doc.text('Grand Total — All Hubs', 14, y);
    y += 5;
    const grandRows = matrix.map((row: any) => [
      row.activity,
      String(row.totalSites),
      String(row.totalQ),
      row.totalQ ? String(Math.floor(row.totalQ / 7)) : '-',
      String(row.totalCollectors),
    ]);
    const pdmSitesGrandPdf = matrix.reduce((a: number, r: any) => a + r.cells.reduce((b: any, c: any) => b + Math.floor(c.questionnaires / 7), 0), 0);
    grandRows.push(['Grand Total', String(grandSites), String(grandQ), pdmSitesGrandPdf ? String(pdmSitesGrandPdf) : '-', String(grandCollectors)]);
    y = styledAutoTable(doc, [['Activity', 'Sites', 'Actual', 'PDM Sites', 'DC']], grandRows, y, { fontSize: 9, boldLastRow: true, columnStyles: { 0: { cellWidth: 65 } } });

    addAllFooters(doc);
    doc.save('tracker_activity_by_hub.pdf');
  }, [trackerData]);

  const exportMainTrackerFormattedExcel = useCallback(async () => {
    await exportFormattedTrackerExcel(trackerData, isPdmActivity, 'tracker_activity_by_hub.xlsx', filteredData);
  }, [trackerData, filteredData]);

  const exportActivityByStateFormattedExcel = useCallback(async () => {
    const sheets = trackerData.stateBreakdown.map(sb => {
      const acts = sb.activities.filter((a: any) => a.questionnaires > 0);
      const pdmSitesTotal = acts.reduce((s: number, a: any) => s + (Math.floor(a.questionnaires / 7)), 0);
      return {
        title: sb.state,
        headers: ['Activity', 'Sites', 'Questionnaires', 'PDM Sites'],
        rows: acts.map((a: any) => [a.activity, a.sites, a.questionnaires, Math.floor(a.questionnaires / 7)]),
        totalRow: ['Total', acts.reduce((s: number, a: any) => s + a.sites, 0), sb.totalQ, pdmSitesTotal || '-'],
      };
    });
    await exportFormattedExcel(sheets, 'tracker_activity_by_state.xlsx');
  }, [trackerData]);

  const exportTrackerPerHubFormattedExcel = useCallback(async (costPerSite = 0, exchangeRate = 0) => {
    const sheets = trackerData.hubTrackers.map((ht: any) => {
      const headers = ['Activity'];
      ht.states.forEach((st: string) => { headers.push(`${st} Sites`, `${st} Actual`, `${st} PDM`, `${st} DC`); });
      headers.push('Total Sites', 'Total Actual', 'Total PDM', 'Total DC');
      const rows = ht.matrix.map((row: any) => {
        const r: (string|number)[] = [row.activity];
        row.cells.forEach((c: any) => { r.push(c.sites || '-', c.questionnaires || '-', c.questionnaires ? Math.floor(c.questionnaires / 7) : '-', c.collectors || '-'); });
        r.push(row.totalSites, row.totalQ, row.totalQ ? Math.floor(row.totalQ / 7) : '-', row.totalCollectors);
        return r;
      });
      const totR: (string|number)[] = ['Total'];
      ht.colTotals.forEach((ct: any, ci: number) => {
        const pdmSitesCol = ht.matrix.reduce((a: number, r: any) => a + (Math.floor(r.cells[ci].questionnaires / 7)), 0);
        totR.push(ct.sites, ct.questionnaires, pdmSitesCol || '-', ct.collectors);
      });
      const htPdmSitesGrand = ht.matrix.reduce((a: number, r: any) => a + r.cells.reduce((b: any, c: any) => b + Math.floor(c.questionnaires / 7), 0), 0);
      totR.push(ht.grandSites, ht.grandQ, htPdmSitesGrand || '-', ht.grandCollectors);
      return { title: ht.hub, headers, rows, totalRow: totR };
    });
    const paymentRows = costPerSite > 0
      ? trackerData.hubTrackers.map((ht: any) => {
          const pdmAdj = ht.matrix.reduce((a: number, r: any) => a + (r.isPdm ? r.cells.reduce((b: number, c: any) => b + Math.floor(c.questionnaires / 7), 0) : r.totalQ), 0);
          return { label: ht.hub, sites: pdmAdj };
        })
      : [];
    await exportFormattedExcel(sheets, 'tracker_per_hub.xlsx', paymentRows, costPerSite, exchangeRate);
  }, [trackerData]);

  const exportCsvEnumTableFormattedExcel = useCallback(async (costPerSite = 0, exchangeRate = 0) => {
    if (trackerData.hubTrackers.length === 0) {
      toast({ title: 'No data to export', description: 'Load a CSV file first.', variant: 'destructive' });
      return;
    }
    try {

    // ── Live bank-account lookup from profiles ──────────────────────────────
    // Build a case-insensitive account lookup from ALL profiles with bank accounts.
    // Keys are lowercased+trimmed so col.name (from CSV) matches even when casing differs.
    // ── Helper: extract { number, name } from any bank_account shape ─────────
    const extractAcct = (raw: any): { number: string; name: string } => {
      if (!raw) return { number: '', name: '' };
      if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { return { number: '', name: '' }; } }
      if (typeof raw !== 'object') return { number: '', name: '' };
      const num = String(raw.accountNumber ?? raw.account_number ?? '').trim();
      const nam = String(raw.accountName  ?? raw.account_name  ?? '').trim();
      if (num || nam) return { number: num, name: nam };
      // Fallback: first non-empty string/number value as the number
      for (const val of Object.values(raw)) {
        if ((typeof val === 'string' || typeof val === 'number') && String(val).trim())
          return { number: String(val).trim(), name: '' };
      }
      return { number: '', name: '' };
    };

    // ── Step 1: name-based map (fast, works when names match exactly) ─────────
    const liveAccountMap     = new Map<string, string>(); // collector key → account number
    const liveAccountNameMap = new Map<string, string>(); // collector key → account name
    bankAccountByName.forEach((acct, name) => {
      if (acct) liveAccountMap.set(name.trim().toLowerCase(), acct);
    });
    const { data: profileRows } = await supabase
      .from('profiles')
      .select('id, full_name, username, email, bank_account')
      .not('bank_account', 'is', null);
    const profileIdToAcct     = new Map<string, string>();
    const profileIdToAcctName = new Map<string, string>();
    (profileRows || []).forEach((p: any) => {
      const { number: acct, name: acctName } = extractAcct(p.bank_account);
      if (!acct && !acctName) return;
      profileIdToAcct.set(p.id, acct);
      profileIdToAcctName.set(p.id, acctName);
      [p.full_name, p.username, p.email].filter(Boolean).forEach((n: string) => {
        const k = n.trim().toLowerCase();
        if (acct)     liveAccountMap.set(k, acct);
        if (acctName) liveAccountNameMap.set(k, acctName);
      });
    });

    // ── Step 2: site-based bridge (reliable even when names differ) ───────────
    // Collect every unique site name across all collectors in the CSV data.
    const allSiteNames = new Set<string>();
    csvEnumData.forEach(hg => hg.states.forEach(sg => sg.collectors.forEach(col =>
      col.sites.forEach(s => { if (s) allSiteNames.add(s.trim()); })
    )));
    if (allSiteNames.size > 0) {
      // Query mmp_site_entries for those sites → get accepted_by user IDs
      const { data: mmpRows } = await supabase
        .from('mmp_site_entries')
        .select('site_name, hub_office, state, accepted_by')
        .in('site_name', [...allSiteNames].slice(0, 400))
        .not('accepted_by', 'is', null);

      // Build: "site||hub||state" → Set<userId>
      const siteKey = (site: string, hub: string, state: string) =>
        `${site.trim().toLowerCase()}||${hub.trim().toLowerCase()}||${state.trim().toLowerCase()}`;
      const siteToUsers = new Map<string, Set<string>>();
      (mmpRows || []).forEach((e: any) => {
        const k = siteKey(e.site_name || '', e.hub_office || '', e.state || '');
        if (!siteToUsers.has(k)) siteToUsers.set(k, new Set());
        siteToUsers.get(k)!.add(e.accepted_by);
      });

      // For each collector, collect user IDs via site bridge, then resolve bank account + name
      csvEnumData.forEach(hg => hg.states.forEach(sg => sg.collectors.forEach(col => {
        const nameKey = col.name.trim().toLowerCase();
        const alreadyHasNo   = liveAccountMap.has(nameKey);
        const alreadyHasName = liveAccountNameMap.has(nameKey);
        if (alreadyHasNo && alreadyHasName) return;
        const userIds = new Set<string>();
        col.sites.forEach(site => {
          const k = siteKey(site, hg.hub, sg.state);
          siteToUsers.get(k)?.forEach(uid => userIds.add(uid));
        });
        for (const uid of userIds) {
          if (!alreadyHasNo) {
            const acct = profileIdToAcct.get(uid);
            if (acct) liveAccountMap.set(nameKey, acct);
          }
          if (!alreadyHasName) {
            const an = profileIdToAcctName.get(uid);
            if (an) liveAccountNameMap.set(nameKey, an);
          }
          if (liveAccountMap.has(nameKey) && liveAccountNameMap.has(nameKey)) break;
        }
      })));
    }

    console.log(`[CSV Enum Export] liveAccountMap: ${liveAccountMap.size}, liveAccountNameMap: ${liveAccountNameMap.size}, profiles: ${(profileRows||[]).length}`);
    console.log(`[CSV Enum Export] Sample:`, [...liveAccountMap.entries()].slice(0, 5));

    // Build: hub → activity → state → [{name, count}]
    const colLookup = new Map<string, Map<string, Map<string, { name: string; count: number }[]>>>();
    csvEnumData.forEach(hg => {
      if (!colLookup.has(hg.hub)) colLookup.set(hg.hub, new Map());
      const actMap = colLookup.get(hg.hub)!;
      hg.states.forEach(sg => {
        sg.collectors.forEach(col => {
          col.activities.forEach(act => {
            if (!actMap.has(act.name)) actMap.set(act.name, new Map());
            if (!actMap.get(act.name)!.has(sg.state)) actMap.get(act.name)!.set(sg.state, []);
            actMap.get(act.name)!.get(sg.state)!.push({ name: col.name, count: act.count });
          });
        });
      });
    });

    const XNAVY = 'FF0F2041', XWHITE = 'FFFFFFFF', XLIGHT = 'FFF5F7FC', XBORDER = 'FFC8CDD7';
    const COL_BG = 'FFFFF8F0', COL_FG = 'FF78603A';
    const ExcelJS = (await import('exceljs')).default;
    const xBorder = (): any => {
      const s: any = { style: 'thin', color: { argb: XBORDER } };
      return { top: s, bottom: s, left: s, right: s };
    };

    // Build hub-level collector lookup: hub → activity → collector → count (summed across all states)
    const hubColLookup = new Map<string, Map<string, Map<string, number>>>();
    csvEnumData.forEach(hg => {
      if (!hubColLookup.has(hg.hub)) hubColLookup.set(hg.hub, new Map());
      const actMap = hubColLookup.get(hg.hub)!;
      hg.states.forEach(sg => {
        sg.collectors.forEach(col => {
          col.activities.forEach(act => {
            if (!actMap.has(act.name)) actMap.set(act.name, new Map());
            const colMap = actMap.get(act.name)!;
            colMap.set(col.name, (colMap.get(col.name) || 0) + act.count);
          });
        });
      });
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'PACT Command Center';
    wb.created = new Date();

    // Pre-assign ALL sheet names before creating any worksheet.
    // ExcelJS uses case-insensitive comparison; we do the same here.
    const assignedNamesLower = new Set<string>(['summary', 'payment']);
    function assignUnique(base: string): string {
      const sanitized = base.replace(/[:\\/?*\[\]]/g, ' ').trim().slice(0, 31) || 'Sheet';
      let candidate = sanitized;
      let c = 2;
      while (assignedNamesLower.has(candidate.toLowerCase())) {
        const suffix = ` ${c++}`;
        candidate = sanitized.slice(0, 31 - suffix.length) + suffix;
      }
      assignedNamesLower.add(candidate.toLowerCase());
      return candidate;
    }
    // Hub sheets — pre-assigned
    const hubSheetNameMap = new Map<string, string>();
    trackerData.hubTrackers.forEach((ht: any) => { hubSheetNameMap.set(ht.hub, assignUnique(ht.hub)); });
    // Per-DC sheets — pre-assigned; key = hub||state||deviceId-or-name
    // Using deviceId (when present) ensures two collectors with the same canonical
    // name in the same hub+state never share a key and corrupt each other's sheet.
    const dcSheetNameMap = new Map<string, string>();
    csvEnumData.forEach(hg => {
      hg.states.forEach(sg => {
        sg.collectors.forEach(col => {
          const dcKey = `${hg.hub}||${sg.state}||${col.deviceId || col.name}`;
          dcSheetNameMap.set(dcKey, assignUnique(col.name));
        });
      });
    });

    // ── Summary sheet (Activity × Hub, with collector sub-rows) ──────────
    {
      const { hubs, matrix, hubTotals, grandQ, grandSites, grandCollectors } = trackerData;
      const wsSummary = wb.addWorksheet('Summary');
      const numHubs = hubs.length;
      const totalCols = 1 + numHubs * 4 + 4;
      wsSummary.getColumn(1).width = 36;
      for (let i = 2; i <= totalCols; i++) wsSummary.getColumn(i).width = 9;

      const titleRowS = wsSummary.addRow(['Tracker — Enumerators (CSV) — Summary']);
      titleRowS.getCell(1).font = { bold: true, size: 14, name: 'Calibri', color: { argb: XNAVY } };
      titleRowS.height = 24;
      wsSummary.addRow([]);

      // Header row 1 — Hub group labels (merged × 4)
      const sh1Vals: (string | null)[] = ['Activity'];
      hubs.forEach(h => { sh1Vals.push(h, null, null, null); });
      sh1Vals.push('Total', null, null, null);
      const sh1Row = wsSummary.addRow(sh1Vals);
      sh1Row.height = 22;
      let smCol = 2;
      for (let hi = 0; hi <= numHubs; hi++) {
        wsSummary.mergeCells(sh1Row.number, smCol, sh1Row.number, smCol + 3);
        smCol += 4;
      }
      sh1Row.eachCell({ includeEmpty: true }, (cell, ci) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XNAVY } };
        cell.font = { bold: true, size: 10, name: 'Calibri', color: { argb: XWHITE } };
        cell.alignment = { horizontal: ci === 1 ? 'left' : 'center', vertical: 'middle' };
        cell.border = xBorder();
      });

      // Header row 2 — Sites / Actual / PDM / DC per hub + Total
      const sh2Vals: string[] = [''];
      for (let hi = 0; hi <= numHubs; hi++) sh2Vals.push('Sites', 'Actual', 'PDM', 'DC');
      const sh2Row = wsSummary.addRow(sh2Vals);
      sh2Row.height = 18;
      sh2Row.eachCell({ includeEmpty: true }, (cell, ci) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XNAVY } };
        cell.font = { bold: true, size: 9, name: 'Calibri', color: { argb: XWHITE } };
        cell.alignment = { horizontal: ci === 1 ? 'left' : 'center', vertical: 'middle' };
        cell.border = xBorder();
      });

      // Activity rows + collector sub-rows
      matrix.forEach((mRow, ri) => {

        const actVals: (string | number)[] = [mRow.activity];
        mRow.cells.forEach(c => {
          actVals.push(c.sites || '-', c.questionnaires || '-', mRow.isPdm ? (c.questionnaires ? Math.floor(c.questionnaires / 7) : '-') : (c.questionnaires || '-'), c.collectors || '-');
        });
        actVals.push(mRow.totalSites, mRow.totalQ, mRow.isPdm ? (mRow.totalQ ? Math.floor(mRow.totalQ / 7) : '-') : (mRow.totalQ || '-'), mRow.totalCollectors);
        const actRowS = wsSummary.addRow(actVals);
        actRowS.height = 18;
        const altBg = ri % 2 === 1 ? XLIGHT : 'FFFFFFFF';
        actRowS.eachCell({ includeEmpty: true }, (cell, ci) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: altBg } };
          cell.font = { bold: true, size: 10, name: 'Calibri', color: { argb: XNAVY } };
          cell.alignment = { horizontal: ci === 1 ? 'left' : 'center', vertical: 'middle' };
          cell.border = xBorder();
        });

        // Collector sub-rows across all hubs
        const allCollNames = new Set<string>();
        hubs.forEach(h => { hubColLookup.get(h)?.get(mRow.activity)?.forEach((_, name) => allCollNames.add(name)); });
        allCollNames.forEach(collName => {
          const subVals: (string | number)[] = [`   · ${collName}`];
          hubs.forEach(h => {
            const cnt = hubColLookup.get(h)?.get(mRow.activity)?.get(collName) || 0;
            subVals.push('-', cnt || '-', mRow.isPdm ? (cnt ? Math.floor(cnt / 7) : '-') : (cnt || '-'), '');
          });
          subVals.push('', '', '', '');
          const subRowS = wsSummary.addRow(subVals);
          subRowS.height = 15;
          subRowS.eachCell({ includeEmpty: true }, (cell, ci) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COL_BG } };
            cell.font = { italic: true, size: 9, name: 'Calibri', color: { argb: COL_FG } };
            cell.alignment = { horizontal: ci === 1 ? 'left' : 'center', vertical: 'middle' };
            cell.border = xBorder();
          });
        });
      });

      // Total row
      const sTotVals: (string | number)[] = ['Total'];
      hubs.forEach((_, hi) => {
        const pdmCol = matrix.reduce((a, r) => a + (r.isPdm ? Math.floor(r.cells[hi].questionnaires / 7) : r.cells[hi].questionnaires), 0);
        sTotVals.push(hubTotals[hi].sites, hubTotals[hi].questionnaires, pdmCol || '-', hubTotals[hi].collectors);
      });
      const sPdmGrand = matrix.reduce((a, r) => a + (r.isPdm ? r.cells.reduce((b: any, c: any) => b + Math.floor(c.questionnaires / 7), 0) : r.totalQ), 0);
      sTotVals.push(grandSites, grandQ, sPdmGrand || '-', grandCollectors);
      const sTotRow = wsSummary.addRow(sTotVals);
      sTotRow.height = 20;
      sTotRow.eachCell({ includeEmpty: true }, (cell, ci) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
        cell.font = { bold: true, size: 10, name: 'Calibri', color: { argb: XNAVY } };
        cell.alignment = { horizontal: ci === 1 ? 'left' : 'center', vertical: 'middle' };
        cell.border = xBorder();
      });
    }

    for (const ht of trackerData.hubTrackers) {
      const ws = wb.addWorksheet(hubSheetNameMap.get(ht.hub)!);
      const numStates = ht.states.length;
      const totalCols = 1 + numStates * 4 + 4;
      ws.getColumn(1).width = 36;
      for (let i = 2; i <= totalCols; i++) ws.getColumn(i).width = 9;

      // Title
      const titleRow = ws.addRow([ht.hub]);
      titleRow.getCell(1).font = { bold: true, size: 14, name: 'Calibri', color: { argb: XNAVY } };
      titleRow.height = 24;
      ws.addRow(['Tracker — Enumerators (CSV)']).getCell(1).font = { italic: true, size: 9, name: 'Calibri', color: { argb: 'FF6B7280' } };
      ws.addRow([]);

      // Header row 1 — merged state group labels
      const h1Vals: (string | null)[] = ['Activity'];
      ht.states.forEach(st => { h1Vals.push(st, null, null, null); });
      h1Vals.push('Total', null, null, null);
      const h1Row = ws.addRow(h1Vals);
      h1Row.height = 22;
      let mCol = 2;
      for (let si = 0; si <= numStates; si++) {
        ws.mergeCells(h1Row.number, mCol, h1Row.number, mCol + 3);
        mCol += 4;
      }
      h1Row.eachCell({ includeEmpty: true }, (cell, ci) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XNAVY } };
        cell.font = { bold: true, size: 10, name: 'Calibri', color: { argb: XWHITE } };
        cell.alignment = { horizontal: ci === 1 ? 'left' : 'center', vertical: 'middle' };
        cell.border = xBorder();
      });

      // Header row 2 — Sites / Actual / PDM / DC per state + Total
      const h2Vals: string[] = [''];
      for (let si = 0; si <= numStates; si++) h2Vals.push('Sites', 'Actual', 'PDM', 'DC');
      const h2Row = ws.addRow(h2Vals);
      h2Row.height = 18;
      h2Row.eachCell({ includeEmpty: true }, (cell, ci) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XNAVY } };
        cell.font = { bold: true, size: 9, name: 'Calibri', color: { argb: XWHITE } };
        cell.alignment = { horizontal: ci === 1 ? 'left' : 'center', vertical: 'middle' };
        cell.border = xBorder();
      });

      // Activity rows + collector sub-rows
      ht.matrix.forEach((mRow, ri) => {

        const actVals: (string | number)[] = [mRow.activity];
        mRow.cells.forEach(c => {
          actVals.push(c.sites || '-', c.questionnaires || '-', mRow.isPdm ? (c.questionnaires ? Math.floor(c.questionnaires / 7) : '-') : (c.questionnaires || '-'), c.collectors || '-');
        });
        actVals.push(mRow.totalSites, mRow.totalQ, mRow.isPdm ? (mRow.totalQ ? Math.floor(mRow.totalQ / 7) : '-') : (mRow.totalQ || '-'), mRow.totalCollectors);
        const actRow = ws.addRow(actVals);
        actRow.height = 18;
        const altBg = ri % 2 === 1 ? XLIGHT : 'FFFFFFFF';
        actRow.eachCell({ includeEmpty: true }, (cell, ci) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: altBg } };
          cell.font = { bold: true, size: 10, name: 'Calibri', color: { argb: XNAVY } };
          cell.alignment = { horizontal: ci === 1 ? 'left' : 'center', vertical: 'middle' };
          cell.border = xBorder();
        });

        // Collector sub-rows (indented, amber-tinted)
        const actColMap = colLookup.get(ht.hub)?.get(mRow.activity);
        if (actColMap) {
          const allCols = new Set<string>();
          actColMap.forEach(list => list.forEach(c => allCols.add(c.name)));
          allCols.forEach(collName => {
            const subVals: (string | number)[] = [`   · ${collName}`];
            ht.states.forEach(st => {
              const found = actColMap.get(st)?.find(c => c.name === collName);
              subVals.push('-', found ? found.count : '-', found ? Math.floor(found.count / 7) : '-', '');
            });
            subVals.push('', '', '', '');
            const subRow = ws.addRow(subVals);
            subRow.height = 15;
            subRow.eachCell({ includeEmpty: true }, (cell, ci) => {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COL_BG } };
              cell.font = { italic: true, size: 9, name: 'Calibri', color: { argb: COL_FG } };
              cell.alignment = { horizontal: ci === 1 ? 'left' : 'center', vertical: 'middle' };
              cell.border = xBorder();
            });
          });
        }
      });

      // Total row
      const totVals: (string | number)[] = ['Total'];
      ht.colTotals.forEach((ct, ci) => {
        const pdmCol = ht.matrix.reduce((a, r) => a + (Math.floor(r.cells[ci].questionnaires / 7)), 0);
        totVals.push(ct.sites, ct.questionnaires, pdmCol || '-', ct.collectors);
      });
      const grandPdm = ht.matrix.reduce((a, r) => a + r.cells.reduce((b: any, c: any) => b + Math.floor(c.questionnaires / 7), 0), 0);
      totVals.push(ht.grandSites, ht.grandQ, grandPdm || '-', ht.grandCollectors);
      const totRow = ws.addRow(totVals);
      totRow.height = 20;
      totRow.eachCell({ includeEmpty: true }, (cell, ci) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
        cell.font = { bold: true, size: 10, name: 'Calibri', color: { argb: XNAVY } };
        cell.alignment = { horizontal: ci === 1 ? 'left' : 'center', vertical: 'middle' };
        cell.border = xBorder();
      });
    }

    if (costPerSite > 0) {
      const PNAVY = 'FF0F2041', PWHITE = 'FFFFFFFF', PBORDER = 'FFC8CDD7';
      const pBorder = (): any => { const s: any = { style: 'thin', color: { argb: PBORDER } }; return { top: s, bottom: s, left: s, right: s }; };
      const payWs = wb.addWorksheet('Payment');
      const ptitle = payWs.addRow(['Payment Calculation — Per Data Collector']);
      payWs.mergeCells(ptitle.number, 1, ptitle.number, 14);
      ptitle.font = { bold: true, size: 14, name: 'Calibri', color: { argb: PNAVY } }; ptitle.height = 28;
      payWs.addRow(['Tracker — Enumerators (CSV)']).getCell(1).font = { italic: true, size: 9, name: 'Calibri', color: { argb: 'FF6B7280' } };
      payWs.addRow(['Generated: ' + new Date().toLocaleString()]).font = { size: 9, name: 'Calibri', color: { argb: 'FF6B7280' } };
      const pparam = payWs.addRow([`Cost per Site Visit: $${costPerSite.toFixed(2)} USD`, '', '', '', '', '', `Exchange Rate: ${exchangeRate.toLocaleString()} SDG / 1 USD`]);
      pparam.font = { bold: true, size: 10, name: 'Calibri', color: { argb: PNAVY } }; pparam.height = 20;
      payWs.addRow([]);
      // Cols: 1=# 2=DC 3=DeviceID 4=AcctNo 5=AcctName 6=Hub 7=State 8=Sites 9=Cost/Site(USD) 10=Cost/Site(SDG) 11=Total(USD) 12=Rate 13=Total(SDG) 14=Notes
      const phdr = payWs.addRow(['#', 'Data Collector', 'Device ID', 'Account Number', 'Account Name', 'Hub', 'State', 'Sites Covered', 'Cost/Site (USD)', 'Cost/Site (SDG)', 'Total (USD)', 'Rate (SDG/USD)', 'Total (SDG)', 'Notes']);
      phdr.height = 22;
      phdr.eachCell((cell, ci) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PNAVY } };
        cell.font = { bold: true, color: { argb: PWHITE }, size: 10, name: 'Calibri' }; cell.border = pBorder();
        cell.alignment = { horizontal: ci > 4 ? 'center' : 'left', vertical: 'middle', wrapText: true };
      });
      // ── Deduplicate collectors globally by deviceId for the Payment sheet ──────
      // csvEnumData keeps one entry per deviceId PER hub+state (correct for detail
      // sheets). The Payment sheet needs ONE row per physical person — aggregate
      // pdmSites across all hub+state appearances so the same device never shows up
      // twice.
      type PayColl = { name: string; deviceId: string; hubs: string[]; states: string[]; sites: number };
      const payCollMap = new Map<string, PayColl>();
      csvEnumData.forEach(hg => {
        hg.states.forEach(sg => {
          sg.collectors.forEach(col => {
            const payKey = col.deviceId || col.name.trim().toLowerCase();
            if (!payCollMap.has(payKey)) {
              payCollMap.set(payKey, { name: col.name, deviceId: col.deviceId, hubs: [], states: [], sites: 0 });
            }
            const entry = payCollMap.get(payKey)!;
            if (!entry.hubs.includes(hg.hub))   entry.hubs.push(hg.hub);
            if (!entry.states.includes(sg.state)) entry.states.push(sg.state);
            entry.sites += col.pdmSites;
          });
        });
      });
      // ── Second-pass merge: no-deviceId rows → existing deviceId entry of same name ──
      // Happens when the same person has some submissions with a deviceId and some
      // without (e.g. different state combos). Both end up in payCollMap under
      // different keys; merge the nameless one into the deviceId-keyed one.
      const nameToDevKey = new Map<string, string>(); // normName → payKey that has deviceId
      payCollMap.forEach((entry, payKey) => {
        if (entry.deviceId) {
          const norm = entry.name.trim().toLowerCase();
          if (!nameToDevKey.has(norm)) nameToDevKey.set(norm, payKey);
        }
      });
      const keysToDelete: string[] = [];
      payCollMap.forEach((entry, payKey) => {
        if (!entry.deviceId) {
          const norm = entry.name.trim().toLowerCase();
          const devPayKey = nameToDevKey.get(norm);
          if (devPayKey && devPayKey !== payKey) {
            const devEntry = payCollMap.get(devPayKey)!;
            entry.hubs.forEach(h => { if (!devEntry.hubs.includes(h)) devEntry.hubs.push(h); });
            entry.states.forEach(s => { if (!devEntry.states.includes(s)) devEntry.states.push(s); });
            devEntry.sites += entry.sites;
            keysToDelete.push(payKey);
          }
        }
      });
      keysToDelete.forEach(k => payCollMap.delete(k));

      const payCollList = [...payCollMap.values()].sort((a, b) => {
        const hubCmp = a.hubs[0].localeCompare(b.hubs[0]);
        return hubCmp !== 0 ? hubCmp : a.name.localeCompare(b.name);
      });

      // Detect same-name / different-deviceId collisions (same person, multiple devices)
      // normName → array of payKeys that share that name
      const nameToPayKeys = new Map<string, string[]>();
      payCollMap.forEach((entry, payKey) => {
        const norm = entry.name.trim().toLowerCase();
        if (!nameToPayKeys.has(norm)) nameToPayKeys.set(norm, []);
        nameToPayKeys.get(norm)!.push(payKey);
      });
      // normName → total device count for that name (only names with >1 device are flagged)
      const nameDeviceCount = new Map<string, number>();
      nameToPayKeys.forEach((keys, norm) => { if (keys.length > 1) nameDeviceCount.set(norm, keys.length); });

      const PAMBER = 'FFFFF3CD'; // amber fill for flagged rows
      const PAMBERBORDER = 'FFD97706';

      // Authoritative grand total = same formula used by the Summary sheet (hub-level floor for PDM)
      const authGrandPaySites = trackerData.matrix.reduce((a: number, r: any) =>
        a + (r.isPdm ? r.cells.reduce((b: number, c: any) => b + Math.floor(c.questionnaires / 7), 0) : r.totalQ), 0);
      let pSeq = 0;
      payCollList.forEach(col => {
        pSeq++;
        const sites = col.sites;
        const totalUsd = sites * costPerSite;
        const totalSdg = totalUsd * exchangeRate;
        const key = col.name.trim().toLowerCase();
        const acctNo   = liveAccountMap.get(key)     || '—';
        const acctName = liveAccountNameMap.get(key) || '—';
        const hubCell   = col.hubs.join(', ');
        const stateCell = col.states.join(', ');
        const devCount  = nameDeviceCount.get(key);
        const noteText  = devCount ? `⚠ ${devCount} device IDs — verify before payment` : '';
        const costSdg = costPerSite * exchangeRate;
        const pdr = payWs.addRow([pSeq, col.name, col.deviceId || '—', acctNo, acctName, hubCell, stateCell, sites, costPerSite, costSdg, totalUsd, exchangeRate, totalSdg, noteText]);
        pdr.height = noteText ? 24 : 20;
        pdr.eachCell((cell, ci) => {
          cell.border = pBorder(); cell.font = { size: 10, name: 'Calibri', color: { argb: 'FF14141E' } };
          cell.alignment = { horizontal: ci > 5 ? 'center' : 'left', vertical: 'middle', wrapText: ci === 14 };
          if (noteText) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PAMBER } };
            if (ci === 14) {
              cell.font = { size: 9, name: 'Calibri', color: { argb: PAMBERBORDER }, bold: true, italic: true };
              cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
            }
          } else if (pSeq % 2 === 0) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FC' } };
          }
        });
        pdr.getCell(9).numFmt  = '#,##0.00';   // Cost/Site USD
        pdr.getCell(10).numFmt = '#,##0';       // Cost/Site SDG (whole number)
        pdr.getCell(11).numFmt = '#,##0.00';    // Total USD
        pdr.getCell(12).numFmt = '#,##0.00';    // Rate
        pdr.getCell(13).numFmt = '#,##0';       // Total SDG (whole number)
      });
      const grandPayUsd = authGrandPaySites * costPerSite;
      const grandPaySdg = grandPayUsd * exchangeRate;
      const grandCostSdg = costPerSite * exchangeRate;
      const ptot = payWs.addRow(['', 'GRAND TOTAL', '', '', '', '', '', authGrandPaySites, costPerSite, grandCostSdg, grandPayUsd, exchangeRate, grandPaySdg]);
      ptot.height = 24;
      ptot.eachCell((cell, ci) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PNAVY } };
        cell.font = { bold: true, size: 11, name: 'Calibri', color: { argb: PWHITE } };
        cell.border = pBorder(); cell.alignment = { horizontal: ci > 5 ? 'center' : 'left', vertical: 'middle' };
      });
      ptot.getCell(9).numFmt  = '#,##0.00';
      ptot.getCell(10).numFmt = '#,##0';
      ptot.getCell(11).numFmt = '#,##0.00';
      ptot.getCell(12).numFmt = '#,##0.00';
      ptot.getCell(13).numFmt = '#,##0';
      // Fixed column widths: 14 cols
      // 1=# 2=DC 3=DeviceID 4=AcctNo 5=AcctName 6=Hub 7=State 8=Sites 9=Cost/Site(USD) 10=Cost/Site(SDG) 11=TotalUSD 12=Rate 13=TotalSDG 14=Notes
      const payColWidths = [5, 30, 22, 18, 30, 16, 16, 14, 16, 16, 16, 18, 16, 32];
      payWs.columns.forEach((c, i) => { c.width = payColWidths[i] ?? 14; });
      // Wrap text on Data Collector (2), Account Name (5), and Notes (14)
      [2, 5, 14].forEach(colIdx => {
        payWs.getColumn(colIdx).eachCell({ includeEmpty: false }, cell => {
          cell.alignment = { ...(cell.alignment || {}), wrapText: true, vertical: 'middle' };
        });
      });

    }

    // ── Per Data Collector sheets (always included) ───────────────────────────
    {
      const DCNAVY = 'FF0F2041', DCWHITE = 'FFFFFFFF', DCBORDER = 'FFC8CDD7';
      const dcBorder = (): any => { const s: any = { style: 'thin', color: { argb: DCBORDER } }; return { top: s, bottom: s, left: s, right: s }; };
      csvEnumData.forEach(hg => {
        hg.states.forEach(sg => {
          sg.collectors.forEach(col => {
            const dcWs = wb.addWorksheet(dcSheetNameMap.get(`${hg.hub}||${sg.state}||${col.deviceId || col.name}`)!);

            const dcTitle = dcWs.addRow([col.name]);
            dcWs.mergeCells(dcTitle.number, 1, dcTitle.number, 8);
            dcTitle.font = { bold: true, size: 14, name: 'Calibri', color: { argb: DCNAVY } }; dcTitle.height = 28;
            dcWs.addRow(['Tracker — Enumerators (CSV)']).getCell(1).font = { italic: true, size: 9, name: 'Calibri', color: { argb: 'FF6B7280' } };
            dcWs.addRow(['Generated: ' + new Date().toLocaleString()]).font = { size: 9, name: 'Calibri', color: { argb: 'FF6B7280' } };
            const _dcKey = col.name.trim().toLowerCase();
            const dcInfo = dcWs.addRow(['Hub:', hg.hub, 'State:', sg.state, 'Device ID:', col.deviceId || '—', 'Account No:', liveAccountMap.get(_dcKey) || '—', 'Account Name:', liveAccountNameMap.get(_dcKey) || '—']);
            dcInfo.font = { bold: true, size: 10, name: 'Calibri', color: { argb: DCNAVY } }; dcInfo.height = 20;
            dcWs.addRow([]);

            const dcHdr = dcWs.addRow(['#', 'Site Name', 'Locality', 'Activity', 'Sub-Activity', 'Date']);
            dcHdr.height = 22;
            dcHdr.eachCell((cell) => {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DCNAVY } };
              cell.font = { bold: true, color: { argb: DCWHITE }, size: 10, name: 'Calibri' };
              cell.border = dcBorder(); cell.alignment = { horizontal: 'left', vertical: 'middle' };
            });

            // Match by rawNames so merged name-variants are all included in this sheet
            const dcRawSet = new Set(col.rawNames.length > 0 ? col.rawNames : [col.name]);
            const dcSites = filteredData.filter(r =>
              dcRawSet.has((r.dataCollector || '').trim()) &&
              (r.hub || '—') === hg.hub &&
              (r.state || '—') === sg.state
            );
            dcSites.forEach((r, idx) => {
              const dcRow = dcWs.addRow([idx + 1, r.activitySite || '—', r.locality || '—', r.activity || '—', r.subActivity || '—', r.date || '—']);
              dcRow.height = 18;
              dcRow.eachCell((cell) => {
                cell.border = dcBorder(); cell.font = { size: 10, name: 'Calibri', color: { argb: 'FF14141E' } };
                cell.alignment = { horizontal: 'left', vertical: 'middle' };
                if (idx % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FC' } };
              });
            });

            // ── Site-visits total row ────────────────────────────────────────────
            const dcSum = dcWs.addRow(['', `Total: ${dcSites.length} site visit${dcSites.length !== 1 ? 's' : ''}`, '', '', '', '']);
            dcWs.mergeCells(dcSum.number, 2, dcSum.number, 6);
            dcSum.height = 20;
            dcSum.eachCell((cell) => {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
              cell.font = { bold: true, size: 10, name: 'Calibri', color: { argb: DCNAVY } };
              cell.border = dcBorder(); cell.alignment = { horizontal: 'left', vertical: 'middle' };
            });

            // ── Activity breakdown ───────────────────────────────────────────────
            dcWs.addRow([]);
            const actBreakHdr = dcWs.addRow(['Activity Summary']);
            dcWs.mergeCells(actBreakHdr.number, 1, actBreakHdr.number, 6);
            actBreakHdr.height = 20;
            actBreakHdr.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
            actBreakHdr.getCell(1).font = { bold: true, size: 10, name: 'Calibri', color: { argb: DCNAVY } };
            actBreakHdr.getCell(1).border = dcBorder();

            // Count sites per activity from the raw data rows
            const actSiteCount = new Map<string, number>();
            dcSites.forEach(r => {
              const act = r.activity || '(Unknown)';
              actSiteCount.set(act, (actSiteCount.get(act) || 0) + 1);
            });
            // Activity name → col 2, count → col 3 (col 1 is narrow "#" column)
            const actBreakSubHdr = dcWs.addRow(['', 'Activity', 'Site Visits', '', '', '']);
            actBreakSubHdr.height = 18;
            actBreakSubHdr.eachCell((cell, ci) => {
              if (ci === 2 || ci === 3) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DCNAVY } };
                cell.font = { bold: true, size: 9, name: 'Calibri', color: { argb: DCWHITE } };
                cell.border = dcBorder();
                cell.alignment = { horizontal: 'left', vertical: 'middle' };
              }
            });
            let actRowIdx = 0;
            [...actSiteCount.entries()].sort((a, b) => b[1] - a[1]).forEach(([act, cnt]) => {
              const aRow = dcWs.addRow(['', act, cnt, '', '', '']);
              aRow.height = 17;
              aRow.getCell(2).border = dcBorder(); aRow.getCell(2).font = { size: 9, name: 'Calibri' };
              aRow.getCell(2).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
              aRow.getCell(3).border = dcBorder(); aRow.getCell(3).font = { bold: true, size: 9, name: 'Calibri', color: { argb: DCNAVY } };
              aRow.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
              if (actRowIdx % 2 === 1) {
                aRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FC' } };
                aRow.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FC' } };
              }
              actRowIdx++;
            });

            // ── Payment & bank details summary block ─────────────────────────────
            const dcPaySites = col.pdmSites;
            const dcTotalUsd = dcPaySites * costPerSite;
            const dcTotalSdg = dcTotalUsd * exchangeRate;
            const _dcKey2 = col.name.trim().toLowerCase();
            const dcAcctNo   = liveAccountMap.get(_dcKey2)     || '—';
            const dcAcctName = liveAccountNameMap.get(_dcKey2) || '—';

            dcWs.addRow([]);
            const payBlockHdr = dcWs.addRow(['Payment Details']);
            dcWs.mergeCells(payBlockHdr.number, 1, payBlockHdr.number, 6);
            payBlockHdr.height = 20;
            payBlockHdr.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DCNAVY } };
            payBlockHdr.getCell(1).font = { bold: true, size: 11, name: 'Calibri', color: { argb: DCWHITE } };
            payBlockHdr.getCell(1).border = dcBorder();
            payBlockHdr.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };

            // Label → col 2, value → col 3  (col 1 is the narrow "#" column)
            const addPayLine = (label: string, value: string | number, isBold = false) => {
              const r = dcWs.addRow(['', label, value, '', '', '']);
              r.height = 18;
              r.getCell(2).font = { size: 10, name: 'Calibri', color: { argb: 'FF6B7280' } };
              r.getCell(2).border = dcBorder(); r.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' };
              r.getCell(3).font = { bold: isBold, size: 10, name: 'Calibri', color: { argb: DCNAVY } };
              r.getCell(3).border = dcBorder(); r.getCell(3).alignment = { horizontal: 'left', vertical: 'middle' };
              r.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFBFC' } };
            };

            addPayLine('Account Number:', dcAcctNo);
            addPayLine('Account Name:', dcAcctName);
            addPayLine('Sites (payable):', dcPaySites);
            if (costPerSite > 0) {
              addPayLine(`Cost / Site:`, `$${costPerSite.toFixed(2)} USD`);
              if (exchangeRate > 0) {
                addPayLine(`Cost / Site (SDG):`, `${Math.round(costPerSite * exchangeRate).toLocaleString()} SDG`);
              }
              addPayLine('Total (USD):', `$${dcTotalUsd.toFixed(2)}`, true);
              if (exchangeRate > 0) {
                addPayLine(`Rate:`, `${exchangeRate.toLocaleString()} SDG / 1 USD`);
                addPayLine('Total (SDG):', `${Math.round(dcTotalSdg).toLocaleString()} SDG`, true);
              }
            }

            // Col 1 = narrow # | Col 2 = Site Name / activity label (wrap) |
            // Col 3 = Locality / value | Col 4 = Activity (wrap) | Col 5 = Sub-Activity | Col 6 = Date
            const dcColWidths = [5, 28, 20, 28, 18, 13];
            dcWs.columns.forEach((c, i) => { c.width = dcColWidths[i] ?? 12; });
            // Wrap text on both wide content columns (activity in main table + activity names in summary)
            [2, 4].forEach(colIdx => {
              dcWs.getColumn(colIdx).eachCell({ includeEmpty: false }, cell => {
                cell.alignment = { ...(cell.alignment || {}), wrapText: true, vertical: 'middle' };
              });
            });
          });
        });
      });
    }

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Tracker - Enumerators (CSV) ${format(new Date(), 'MMMM dd yyyy HH-mm')}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: 'Export failed', description: err?.message || 'Unknown error', variant: 'destructive' });
    }
  }, [trackerData, csvEnumData, bankAccountByName, filteredData, toast]);

  const exportTrackerPerStateFormattedExcel = useCallback(async () => {
    const sheets = trackerData.stateTrackers.map((st: any) => {
      const headers = ['Activity'];
      st.localities.forEach((loc: string) => { headers.push(`${loc} Sites`, `${loc} Actual`, `${loc} PDM`, `${loc} DC`); });
      headers.push('Total Sites', 'Total Actual', 'Total PDM', 'Total DC');
      const rows = st.matrix.map((row: any) => {
        const r: (string|number)[] = [row.activity];
        row.cells.forEach((c: any) => { r.push(c.sites || '-', c.questionnaires || '-', c.questionnaires ? Math.floor(c.questionnaires / 7) : '-', c.collectors || '-'); });
        r.push(row.totalSites, row.totalQ, row.totalQ ? Math.floor(row.totalQ / 7) : '-', row.totalCollectors);
        return r;
      });
      const totR: (string|number)[] = ['Total'];
      st.colTotals.forEach((ct: any, ci: number) => {
        const pdmSitesCol = st.matrix.reduce((a: number, r: any) => a + Math.floor(r.cells[ci].questionnaires / 7), 0);
        totR.push(ct.sites, ct.questionnaires, pdmSitesCol || '-', ct.collectors);
      });
      const stPdmSitesGrand = st.matrix.reduce((a: number, r: any) => a + r.cells.reduce((b: any, c: any) => b + Math.floor(c.questionnaires / 7), 0), 0);
      totR.push(st.grandSites, st.grandQ, stPdmSitesGrand || '-', st.grandCollectors);
      return { title: st.state, headers, rows, totalRow: totR };
    });
    await exportFormattedExcel(sheets, 'tracker_per_state.xlsx');
  }, [trackerData]);

  const exportHubDrilldownFormattedExcel = useCallback(async () => {
    const sheets = [{
      title: 'Hub Drilldown',
      headers: ['Level', 'Hub', 'State', 'Activity', 'Locality', 'Site Name', 'Sites', 'Questionnaires', '%'],
      rows: [] as (string|number)[][],
    }];
    hubDrilldown.forEach((hub: any) => {
      sheets[0].rows.push(['Hub', hub.name, '', '', '', '', hub.sites, hub.questionnaires, hub.percentage.toFixed(1) + '%']);
      hub.states.forEach((st: any) => {
        sheets[0].rows.push(['State', hub.name, st.name, '', '', '', st.sites, st.questionnaires, st.percentage.toFixed(1) + '%']);
        st.activities.forEach((act: any) => {
          sheets[0].rows.push(['Activity', hub.name, st.name, act.name, '', '', act.sites, act.questionnaires, act.percentage.toFixed(1) + '%']);
          act.localities.forEach((loc: any) => {
            sheets[0].rows.push(['Locality', hub.name, st.name, act.name, loc.name, '', loc.sites, loc.questionnaires, loc.percentage.toFixed(1) + '%']);
            loc.siteNames.forEach((sn: string) => {
              sheets[0].rows.push(['Site', hub.name, st.name, act.name, loc.name, sn, '', '', '']);
            });
          });
        });
      });
    });
    await exportFormattedExcel(sheets, 'hub_drilldown.xlsx');
  }, [hubDrilldown]);

  const exportReportExcel = useCallback(async () => {
    if (!computeReportSummary) return;
    const ExcelJS = (await import('exceljs')).default;
    const rpt = computeReportSummary;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'PACT Command Center';
    wb.created = new Date();

    const addSection = (ws: any, text: string) => {
      const r = ws.addRow([text, '']);
      r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2041' } };
      r.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' };
      r.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2041' } };
      r.getCell(2).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' };
      r.height = 22;
    };
    const bFont = (sz = 10, color = 'FF14141E'): any => ({ size: sz, name: 'Calibri', color: { argb: color } });
    const tBorder = (): any => {
      const s: any = { style: 'thin', color: { argb: 'FFC8CDD7' } };
      return { top: s, bottom: s, left: s, right: s };
    };
    const addPair = (ws: any, label: string, value: string | number) => {
      const r = ws.addRow([label, value]);
      r.getCell(1).font = bFont(10);
      r.getCell(2).font = bFont(10);
      r.getCell(1).border = tBorder();
      r.getCell(2).border = tBorder();
    };

    const ws1 = wb.addWorksheet('Report Summary');
    const titleRow = ws1.addRow(['Data Quality & Coverage Report']);
    titleRow.font = { bold: true, size: 14, name: 'Calibri', color: { argb: 'FF0F2041' } };
    titleRow.height = 26;
    ws1.addRow([]);

    addSection(ws1, 'Report Information');
    addPair(ws1, 'Generated Date', rpt.generatedDate);
    addPair(ws1, 'File Name', rpt.fileName);
    addPair(ws1, 'Month Coverage', rpt.monthCoverage);
    ws1.addRow([]);

    addSection(ws1, 'Coverage Summary');
    addPair(ws1, 'Total Questionnaires', rpt.totalQuestionnaires);
    addPair(ws1, 'Original Rows', rpt.originalRows);
    addPair(ws1, 'Unique Sites', rpt.uniqueSites);
    addPair(ws1, 'Hubs', rpt.uniqueHubs);
    addPair(ws1, 'States', rpt.uniqueStates);
    addPair(ws1, 'Localities', rpt.uniqueLocalities);
    addPair(ws1, 'Data Collectors', rpt.totalCollectors);
    addPair(ws1, 'Supervisors', rpt.totalSupervisors);
    ws1.addRow([]);

    if (trackerData && trackerData.matrix && trackerData.matrix.length > 0) {
      const { hubs: tH, matrix: tM, hubTotals: tHT, grandQ: tGQ, grandSites: tGS, grandCollectors: tGC } = trackerData;
      const pdmGrand = tM.reduce((a: number, r: any) => a + r.cells.reduce((b: any, c: any) => b + Math.floor(c.questionnaires / 7), 0), 0);
      const actualSitesGrand = pdmGrand;

      addSection(ws1, 'Tracker Grand Totals');
      const tHdr = ws1.addRow(['Hub', 'Sites', 'Actual', 'PDM Sites', 'DC']);
      tHdr.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10, name: 'Calibri' };
        cell.border = tBorder();
        cell.alignment = { horizontal: 'center' };
      });
      tHdr.getCell(1).alignment = { horizontal: 'left' };
      tH.forEach((hub: string, hi: number) => {
        const ht = tHT[hi];
        const hubPdm = tM.reduce((a: number, r: any) => a + (Math.floor(r.cells[hi].questionnaires / 7)), 0);
        const r = ws1.addRow([hub, ht.sites, ht.questionnaires, hubPdm || '-', ht.collectors]);
        r.eachCell((cell, ci) => {
          cell.font = bFont(10);
          cell.border = tBorder();
          cell.alignment = { horizontal: ci > 1 ? 'center' : 'left' };
        });
      });
      const gtRow = ws1.addRow(['Grand Total', tGS, tGQ, pdmGrand || '-', tGC]);
      gtRow.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
        cell.font = { bold: true, size: 10, name: 'Calibri', color: { argb: 'FF14141E' } };
        cell.border = tBorder();
        cell.alignment = { horizontal: 'center' };
      });
      gtRow.getCell(1).alignment = { horizontal: 'left' };
      const tsRow = ws1.addRow(['Total Sites (PDM/7)', actualSitesGrand, '', '', '']);
      tsRow.getCell(1).font = { bold: true, size: 11, name: 'Calibri', color: { argb: 'FF107838' } };
      tsRow.getCell(2).font = { bold: true, size: 14, name: 'Calibri', color: { argb: 'FF107838' } };
      tsRow.getCell(1).border = tBorder();
      tsRow.getCell(2).border = tBorder();
      ws1.addRow([]);
    }

    addSection(ws1, 'Hub Coverage');
    rpt.hubBreakdown.forEach(h => addPair(ws1, h.hub, `${h.questionnaires} Q, ${h.sites} sites`));
    ws1.addRow([]);

    addSection(ws1, 'Activity Coverage');
    rpt.activityBreakdown.forEach(a => addPair(ws1, a.activity, `${a.count} Q`));
    ws1.addRow([]);

    if (rpt.qualityReport) {
      addSection(ws1, 'Data Quality');
      addPair(ws1, 'Quality Score', rpt.qualityReport.qualityScore + '%');
      addPair(ws1, 'Original Rows', rpt.qualityReport.originalRows);
      addPair(ws1, 'Clean Rows', rpt.qualityReport.cleanRows);
      addPair(ws1, 'Duplicates Removed', rpt.qualityReport.duplicatesRemoved);
      addPair(ws1, 'Empty Rows Removed', rpt.qualityReport.emptyRowsRemoved);
      addPair(ws1, 'Fields Trimmed', rpt.qualityReport.trimmedFields);
      addPair(ws1, 'Names Standardized', rpt.qualityReport.namesStandardized);
      ws1.addRow([]);
    }

    addSection(ws1, 'Team Roster');
    rpt.teamOverview.forEach(team => {
      const supRow = ws1.addRow([`Supervisor: ${team.supervisor}`, `${team.teamSize} DCs, ${team.totalQ} Q`]);
      supRow.getCell(1).font = { bold: true, size: 10, name: 'Calibri', color: { argb: 'FF14141E' } };
      supRow.getCell(2).font = bFont(10);
      supRow.getCell(1).border = tBorder();
      supRow.getCell(2).border = tBorder();
      team.collectors.forEach(dc => addPair(ws1, `  ${dc.name}`, `Device: ${dc.deviceId} | ${dc.count} Q`));
    });

    ws1.columns = [{ width: 40 }, { width: 45 }];

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'report_summary.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  }, [computeReportSummary, trackerData]);

  const exportReportPdf = useCallback(async () => {
    if (!computeReportSummary) return;
    const rpt = computeReportSummary;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    let y = await drawPdfHeader(doc, 'Data Quality & Coverage Report', 'تقرير جودة البيانات والتغطية',
      `${rpt.totalQuestionnaires} Questionnaires  |  ${rpt.uniqueSites} Sites  |  ${rpt.uniqueHubs} Hubs`);
    const hasArabic = await loadArabicFont(doc);

    doc.setFontSize(10); doc.setTextColor(90, 95, 110);
    doc.text(`File: ${rpt.fileName}  |  Month: ${rpt.monthCoverage}  |  Generated: ${rpt.generatedDate}`, 14, y);
    y += 6;

    doc.setFontSize(12); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
    doc.text('Coverage Summary', 14, y); y += 3;
    const covRows = [
      ['Questionnaires', String(rpt.totalQuestionnaires)],
      ['Unique Sites', String(rpt.uniqueSites)],
      ['Hubs', String(rpt.uniqueHubs)],
      ['States', String(rpt.uniqueStates)],
      ['Localities', String(rpt.uniqueLocalities)],
      ['Data Collectors', String(rpt.totalCollectors)],
      ['Supervisors', String(rpt.totalSupervisors)],
    ];
    y = styledAutoTable(doc, [['Metric', 'Value']], covRows, y, { fontSize: 9, useArabicFont: hasArabic });
    y += 5;

    if (trackerData && trackerData.matrix && trackerData.matrix.length > 0) {
      const { hubs: tH, matrix: tM, hubTotals: tHT, grandQ: tGQ, grandSites: tGS, grandCollectors: tGC } = trackerData;
      const pdmGrand = tM.reduce((a: number, r: any) => a + r.cells.reduce((b: any, c: any) => b + Math.floor(c.questionnaires / 7), 0), 0);
      const actualSitesGrand = pdmGrand;

      if (y > 220) { doc.addPage(); addPageHeader(doc, 'Tracker Grand Totals'); y = 18; }
      doc.setFontSize(12); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
      doc.text('Tracker Grand Totals', 14, y); y += 3;
      const tRows = tH.map((hub: string, hi: number) => {
        const ht = tHT[hi];
        const hubPdm = tM.reduce((a: number, r: any) => a + (Math.floor(r.cells[hi].questionnaires / 7)), 0);
        return [hub, String(ht.sites), String(ht.questionnaires), String(hubPdm || '-'), String(ht.collectors)];
      });
      tRows.push(['Grand Total', String(tGS), String(tGQ), String(pdmGrand || '-'), String(tGC)]);
      tRows.push(['Total Sites (PDM/7)', String(actualSitesGrand), '', '', '']);
      y = styledAutoTable(doc, [['Hub', 'Sites', 'Actual', 'PDM Sites', 'DC']], tRows, y, { fontSize: 9, boldLastRow: true, useArabicFont: hasArabic });
      y += 5;
    }

    if (y > 220) { doc.addPage(); addPageHeader(doc, 'Hub Coverage'); y = 18; }
    doc.setFontSize(12); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
    doc.text('Hub Coverage', 14, y); y += 3;
    const hubRows = rpt.hubBreakdown.map(h => [h.hub, String(h.sites), String(h.questionnaires)]);
    y = styledAutoTable(doc, [['Hub', 'Sites', 'Questionnaires']], hubRows, y, { fontSize: 9, useArabicFont: hasArabic });
    y += 5;

    if (y > 220) { doc.addPage(); addPageHeader(doc, 'Activity Coverage'); y = 18; }
    doc.setFontSize(12); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
    doc.text('Activity Coverage', 14, y); y += 3;
    const actRows = rpt.activityBreakdown.map(a => [a.activity, String(a.count)]);
    y = styledAutoTable(doc, [['Activity', 'Questionnaires']], actRows, y, { fontSize: 9, useArabicFont: hasArabic });
    y += 5;

    if (rpt.qualityReport) {
      if (y > 220) { doc.addPage(); addPageHeader(doc, 'Data Quality'); y = 18; }
      doc.setFontSize(12); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
      doc.text('Data Quality Report', 14, y); y += 3;
      const qRows = [
        ['Quality Score', rpt.qualityReport.qualityScore + '%'],
        ['Original Rows', String(rpt.qualityReport.originalRows)],
        ['Clean Rows', String(rpt.qualityReport.cleanRows)],
        ['Duplicates Removed', String(rpt.qualityReport.duplicatesRemoved)],
        ['Empty Rows Removed', String(rpt.qualityReport.emptyRowsRemoved)],
        ['Fields Trimmed', String(rpt.qualityReport.trimmedFields)],
        ['Names Standardized', String(rpt.qualityReport.namesStandardized)],
      ];
      y = styledAutoTable(doc, [['Metric', 'Value']], qRows, y, { fontSize: 9, useArabicFont: hasArabic });
      y += 5;
    }

    doc.addPage(); addPageHeader(doc, 'Team Roster'); y = 18;
    doc.setFontSize(12); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
    doc.text('Team Roster', 14, y); y += 3;
    rpt.teamOverview.forEach(team => {
      if (y > 250) { doc.addPage(); addPageHeader(doc, 'Team Roster'); y = 18; }
      doc.setFontSize(10); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
      doc.text(`${team.supervisor} (${team.teamSize} DCs, ${team.totalQ} Q)`, 14, y); y += 3;
      const dcRows = team.collectors.map(dc => [dc.name, dc.deviceId || '-', String(dc.count)]);
      y = styledAutoTable(doc, [['Data Collector', 'Device ID', 'Questionnaires']], dcRows, y, { fontSize: 8, useArabicFont: hasArabic });
      y += 4;
    });

    addAllFooters(doc);
    doc.save('report_summary.pdf');
  }, [computeReportSummary, trackerData]);

  const hubDrilldownTable = (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Building2 className="h-5 w-5 text-primary" />
                By Hub
                <Badge variant="outline" className="text-xs ml-1">Click to drill down</Badge>
              </CardTitle>
              <CardDescription>{hubDrilldown.length} unique hubs found — click a hub to see states, then activities, then localities</CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="gap-1.5" data-testid="button-export-hub-drilldown">
                    <Download className="h-4 w-4" />
                    Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={exportHubDrilldownPdf}>
                    <FileDown className="h-4 w-4 mr-2" />
                    PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportHubDrilldownExcel}>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportHubDrilldownFormattedExcel}>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Formatted Excel
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openSectionEmailDialog('Hub Drilldown Report')} data-testid="button-send-hub-drilldown-email">
                <Mail className="h-4 w-4" />
                Send Email
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-hub-drilldown">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left py-2 px-3 font-medium w-8">#</th>
                  <th className="text-left py-2 px-3 font-medium">Hub</th>
                  <th className="text-right py-2 px-3 font-medium">Sites</th>
                  <th className="text-right py-2 px-3 font-medium">Questionnaires</th>
                  <th className="text-right py-2 px-3 font-medium">%</th>
                  <th className="py-2 px-3 font-medium w-32">Distribution</th>
                </tr>
              </thead>
              <tbody>
                {hubDrilldown.map((hub, hi) => {
                  const hubExpanded = drillExpandedHubs.has(hub.name);
                  return (
                    <Fragment key={hub.name}>
                      <tr
                        className="border-b hover:bg-muted/30 transition-colors cursor-pointer"
                        onClick={() => toggleDrillHub(hub.name)}
                        data-testid={`row-hub-drill-${hi}`}
                      >
                        <td className="py-2 px-3 text-muted-foreground">{hi + 1}</td>
                        <td className="py-2 px-3 font-medium">
                          <div className="flex items-center gap-2">
                            {hubExpanded ? <ChevronUp className="h-4 w-4 text-primary flex-shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
                            <Building2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            {hub.name}
                            <Badge variant="outline" className="text-[10px] px-1 py-0">{hub.states.length} states</Badge>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-right"><Badge variant="outline" className="font-mono text-blue-600">{hub.sites}</Badge></td>
                        <td className="py-2 px-3 text-right"><Badge variant="secondary" className="font-mono">{hub.questionnaires}</Badge></td>
                        <td className="py-2 px-3 text-right text-muted-foreground">{hub.percentage.toFixed(1)}%</td>
                        <td className="py-2 px-3">
                          <div className="w-full bg-muted rounded-full h-2">
                            <div className="bg-primary rounded-full h-2 transition-all" style={{ width: `${Math.min(hub.percentage, 100)}%` }} />
                          </div>
                        </td>
                      </tr>
                      {hubExpanded && hub.states.map((state, si) => {
                        const stateKey = `${hub.name}::${state.name}`;
                        const stateExpanded = drillExpandedStates.has(stateKey);
                        return (
                          <Fragment key={stateKey}>
                            <tr
                              className="border-b hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors cursor-pointer bg-blue-50/30 dark:bg-blue-950/10"
                              onClick={() => toggleDrillState(stateKey)}
                              data-testid={`row-state-drill-${hi}-${si}`}
                            >
                              <td className="py-2 px-3" />
                              <td className="py-2 px-3 font-medium pl-10">
                                <div className="flex items-center gap-2">
                                  {stateExpanded ? <ChevronUp className="h-3.5 w-3.5 text-blue-600 flex-shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
                                  <Globe className="h-3.5 w-3.5 text-blue-600 flex-shrink-0" />
                                  {state.name}
                                  <Badge variant="outline" className="text-[10px] px-1 py-0">{state.activities.length} activities</Badge>
                                </div>
                              </td>
                              <td className="py-2 px-3 text-right"><Badge variant="outline" className="font-mono text-blue-600 text-xs">{state.sites}</Badge></td>
                              <td className="py-2 px-3 text-right"><Badge variant="secondary" className="font-mono text-xs">{state.questionnaires}</Badge></td>
                              <td className="py-2 px-3 text-right text-muted-foreground text-xs">{state.percentage.toFixed(1)}%</td>
                              <td className="py-2 px-3">
                                <div className="w-full bg-muted rounded-full h-1.5">
                                  <div className="bg-blue-500 rounded-full h-1.5 transition-all" style={{ width: `${Math.min(state.percentage, 100)}%` }} />
                                </div>
                              </td>
                            </tr>
                            {stateExpanded && state.activities.map((act, ai) => {
                              const actKey = `${stateKey}::${act.name}`;
                              const actExpanded = drillExpandedActivities.has(actKey);
                              return (
                                <Fragment key={actKey}>
                                  <tr
                                    className="border-b hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 transition-colors cursor-pointer bg-emerald-50/30 dark:bg-emerald-950/10"
                                    onClick={() => toggleDrillActivity(actKey)}
                                    data-testid={`row-activity-drill-${hi}-${si}-${ai}`}
                                  >
                                    <td className="py-2 px-3" />
                                    <td className="py-2 px-3 font-medium pl-16">
                                      <div className="flex items-center gap-2">
                                        {actExpanded ? <ChevronUp className="h-3 w-3 text-emerald-600 flex-shrink-0" /> : <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
                                        <Activity className="h-3 w-3 text-emerald-600 flex-shrink-0" />
                                        <span className="text-xs">{act.name}</span>
                                        <Badge variant="outline" className="text-[10px] px-1 py-0">{act.localities.length} loc.</Badge>
                                      </div>
                                    </td>
                                    <td className="py-2 px-3 text-right"><Badge variant="outline" className="font-mono text-xs">{act.sites}</Badge></td>
                                    <td className="py-2 px-3 text-right"><Badge variant="secondary" className="font-mono text-xs">{act.questionnaires}</Badge></td>
                                    <td className="py-2 px-3 text-right text-muted-foreground text-xs">{act.percentage.toFixed(1)}%</td>
                                    <td className="py-2 px-3">
                                      <div className="w-full bg-muted rounded-full h-1">
                                        <div className="bg-emerald-500 rounded-full h-1 transition-all" style={{ width: `${Math.min(act.percentage, 100)}%` }} />
                                      </div>
                                    </td>
                                  </tr>
                                  {actExpanded && act.localities.map((loc, li) => {
                                    const locKey = `${actKey}::${loc.name}`;
                                    const locExpanded = drillExpandedLocalities.has(locKey);
                                    return (
                                      <Fragment key={locKey}>
                                        <tr
                                          className="border-b bg-amber-50/30 dark:bg-amber-950/10 cursor-pointer hover:bg-amber-100/40 dark:hover:bg-amber-950/20 transition-colors"
                                          onClick={() => toggleDrillLocality(locKey)}
                                          data-testid={`row-locality-drill-${hi}-${si}-${ai}-${li}`}
                                        >
                                          <td className="py-1.5 px-3" />
                                          <td className="py-1.5 px-3 pl-24">
                                            <div className="flex items-center gap-2 text-xs">
                                              {locExpanded ? <ChevronUp className="h-3 w-3 text-amber-600 flex-shrink-0" /> : <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
                                              <MapPin className="h-3 w-3 text-amber-600 flex-shrink-0" />
                                              {loc.name}
                                              {loc.siteNames.length > 0 && <Badge variant="outline" className="text-[10px] px-1 py-0">{loc.siteNames.length} sites</Badge>}
                                            </div>
                                          </td>
                                          <td className="py-1.5 px-3 text-right"><span className="font-mono text-xs text-muted-foreground">{loc.sites}</span></td>
                                          <td className="py-1.5 px-3 text-right"><span className="font-mono text-xs">{loc.questionnaires}</span></td>
                                          <td className="py-1.5 px-3 text-right text-muted-foreground text-xs">{loc.percentage.toFixed(1)}%</td>
                                          <td className="py-1.5 px-3">
                                            <div className="w-full bg-muted rounded-full h-1">
                                              <div className="bg-amber-500 rounded-full h-1 transition-all" style={{ width: `${Math.min(loc.percentage, 100)}%` }} />
                                            </div>
                                          </td>
                                        </tr>
                                        {locExpanded && loc.siteNames.map((siteName, sni) => (
                                          <tr
                                            key={`${locKey}::site-${sni}`}
                                            className="border-b bg-purple-50/30 dark:bg-purple-950/10"
                                            data-testid={`row-site-drill-${hi}-${si}-${ai}-${li}-${sni}`}
                                          >
                                            <td className="py-1 px-3" />
                                            <td className="py-1 px-3 pl-32" colSpan={5}>
                                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <span className="w-4 text-center text-[10px] text-purple-500">{sni + 1}.</span>
                                                {siteName}
                                              </div>
                                            </td>
                                          </tr>
                                        ))}
                                      </Fragment>
                                    );
                                  })}
                                </Fragment>
                              );
                            })}
                          </Fragment>
                        );
                      })}
                    </Fragment>
                  );
                })}
                <tr className="bg-muted/50 font-semibold">
                  <td className="py-2 px-3" colSpan={2}>Total</td>
                  <td className="py-2 px-3 text-right"><Badge variant="outline" className="font-mono text-blue-700">{hubDrilldown.reduce((a, b) => a + b.sites, 0)}</Badge></td>
                  <td className="py-2 px-3 text-right"><Badge className="font-mono">{hubDrilldown.reduce((a, b) => a + b.questionnaires, 0)}</Badge></td>
                  <td className="py-2 px-3 text-right">100%</td>
                  <td className="py-2 px-3" />
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
  );

  const SummaryTableWithSites = ({ items, label, icon: Icon, showCollectors = false }: { items: SummaryWithSites[]; label: string; icon: React.ElementType; showCollectors?: boolean }) => (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Icon className="h-5 w-5 text-primary" />
          By {label}
        </CardTitle>
        <CardDescription>{items.length} unique {label.toLowerCase()}s found</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid={`table-${label.toLowerCase()}`}>
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left py-2 px-3 font-medium">#</th>
                <th className="text-left py-2 px-3 font-medium">{label}</th>
                <th className="text-right py-2 px-3 font-medium">Sites</th>
                {showCollectors && <th className="text-right py-2 px-3 font-medium">DC</th>}
                <th className="text-right py-2 px-3 font-medium">Questionnaires</th>
                <th className="text-right py-2 px-3 font-medium">%</th>
                <th className="py-2 px-3 font-medium w-32">Distribution</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={item.name} className="border-b hover:bg-muted/30 transition-colors" data-testid={`row-${label.toLowerCase()}-${i}`}>
                  <td className="py-2 px-3 text-muted-foreground">{i + 1}</td>
                  <td className="py-2 px-3 font-medium">{item.name}</td>
                  <td className="py-2 px-3 text-right"><Badge variant="outline" className="font-mono text-blue-600">{item.sites}</Badge></td>
                  {showCollectors && <td className="py-2 px-3 text-right"><Badge variant="outline" className="font-mono text-purple-600">{item.collectors}</Badge></td>}
                  <td className="py-2 px-3 text-right"><Badge variant="secondary" className="font-mono">{item.questionnaires}</Badge></td>
                  <td className="py-2 px-3 text-right text-muted-foreground">{item.percentage.toFixed(1)}%</td>
                  <td className="py-2 px-3">
                    <div className="w-full bg-muted rounded-full h-2">
                      <div className="bg-primary rounded-full h-2 transition-all" style={{ width: `${Math.min(item.percentage, 100)}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
              <tr className="bg-muted/50 font-semibold">
                <td className="py-2 px-3" colSpan={2}>Total</td>
                <td className="py-2 px-3 text-right"><Badge variant="outline" className="font-mono text-blue-700">{items.reduce((a, b) => a + b.sites, 0)}</Badge></td>
                {showCollectors && <td className="py-2 px-3 text-right"><Badge variant="outline" className="font-mono text-purple-700">{items.reduce((a, b) => a + b.collectors, 0)}</Badge></td>}
                <td className="py-2 px-3 text-right"><Badge className="font-mono">{items.reduce((a, b) => a + b.questionnaires, 0)}</Badge></td>
                <td className="py-2 px-3 text-right">100%</td>
                <td className="py-2 px-3" />
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );

  if (!isSuperAdmin()) {
    return <AccessDenied />;
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-6 max-w-7xl">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Questionnaire Analytics</h1>
          <p className="text-muted-foreground mt-1">
            {currentSessionName ? (
              <span className="flex items-center gap-2">
                <Badge variant="outline" className="gap-1"><FolderOpen className="h-3 w-3" />{currentSessionName}</Badge>
                <span className="text-xs">({fileName})</span>
              </span>
            ) : 'Upload Excel data to analyze questionnaire submissions'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {savedSessions.length > 0 && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowLoadDialog(true)} data-testid="button-load">
              <FolderOpen className="h-4 w-4" />
              Saved ({savedSessions.length})
            </Button>
          )}
          {data.length > 0 && (
            <>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={cleanExcelData} data-testid="button-clean">
                <Sparkles className="h-4 w-4" />
                Clean
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { setSaveName(currentSessionName || fileName.replace(/\.[^.]+$/, '')); setShowSaveDialog(true); }} data-testid="button-save">
                <Save className="h-4 w-4" />
                Save
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5" data-testid="button-export">
                    <Download className="h-4 w-4" />
                    Export
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={exportToExcel} data-testid="button-export-excel">
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Export All to Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportToPdf} data-testid="button-export-pdf">
                    <FileDown className="h-4 w-4 mr-2" />
                    Export Full PDF (with Collector Details)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportTrackerToExcel} data-testid="button-export-tracker-menu">
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Export Tracker to Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportCoverageTrackerExcel(filteredData, 'coverage_tracker.xlsx', currentSessionName)} data-testid="button-export-coverage-tracker">
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Coverage Tracker (Hub/State/Collector)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5" data-testid="button-send-report">
                    <Mail className="h-4 w-4" />
                    Send Email
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={openEmailDialog} data-testid="button-send-data-report">
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Data Report (Review + Cleaned)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={openAnalyticsExcelEmailDialog} data-testid="button-send-analytics-excel">
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Export All to Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={openAnalyticsPdfEmailDialog} data-testid="button-send-analytics-pdf">
                    <FileDown className="h-4 w-4 mr-2" />
                    Export Full PDF (with Collector Details)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={openTrackerExcelEmailDialog} data-testid="button-send-tracker-excel">
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Export Tracker to Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={openCoverageEmailDialog} data-testid="button-send-coverage-report">
                    <Layers className="h-4 w-4 mr-2" />
                    Coverage Tracker (Hub/State/Collector)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="py-6">
          <div className="flex flex-col items-center gap-4">
            <div className="p-4 bg-primary/10 rounded-full">
              <Upload className="h-8 w-8 text-primary" />
            </div>
            <div className="text-center">
              <h3 className="font-semibold text-lg">Upload Excel File</h3>
              <p className="text-sm text-muted-foreground mt-1">Upload the questionnaire data Excel file (.xlsx, .xls)</p>
            </div>
            <div className="flex items-center gap-3">
              <label className="cursor-pointer">
                <Input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileUpload}
                  className="hidden"
                  data-testid="input-file-upload"
                />
                <Button asChild>
                  <span className="gap-2">
                    <FileSpreadsheet className="h-4 w-4" />
                    Choose File
                  </span>
                </Button>
              </label>
              {fileName && (
                <Badge variant="outline" className="gap-1">
                  <FileSpreadsheet className="h-3 w-3" />
                  {fileName}
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {savedSessions.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <FolderOpen className="h-5 w-5 text-primary" />
              Saved Data Files ({savedSessions.length})
            </CardTitle>
            <CardDescription>Previously uploaded and saved questionnaire data files</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="text-left py-2.5 px-4 font-medium">#</th>
                    <th className="text-left py-2.5 px-4 font-medium">Session Name</th>
                    <th className="text-left py-2.5 px-4 font-medium">File Name</th>
                    <th className="text-left py-2.5 px-4 font-medium">Month / Date Saved</th>
                    <th className="text-center py-2.5 px-4 font-medium">Rows</th>
                    <th className="text-center py-2.5 px-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {[...savedSessions].sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()).map((session, idx) => {
                    const savedDate = new Date(session.savedAt);
                    const isActive = currentSessionName === session.name;
                    return (
                      <tr
                        key={session.id}
                        className={`border-b last:border-b-0 hover:bg-muted/30 transition-colors ${isActive ? 'bg-primary/5 border-l-2 border-l-primary' : ''}`}
                        data-testid={`saved-session-row-${session.id}`}
                      >
                        <td className="py-2.5 px-4 text-muted-foreground">{idx + 1}</td>
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{session.name}</span>
                            {isActive && <Badge variant="default" className="text-[10px] px-1.5 py-0">Active</Badge>}
                          </div>
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate max-w-[200px]">{session.fileName}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="flex flex-col">
                            <span className="font-medium">{format(savedDate, 'MMMM yyyy')}</span>
                            <span className="text-xs text-muted-foreground">{format(savedDate, 'MMM d, yyyy - h:mm a')}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <Badge variant="outline">{session.rowCount.toLocaleString()}</Badge>
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="flex items-center justify-center gap-1.5">
                            <Button size="sm" variant={isActive ? "secondary" : "outline"} className="gap-1 h-7 text-xs" onClick={() => loadSession(session)} data-testid={`button-load-inline-${session.id}`}>
                              <FolderOpen className="h-3 w-3" />
                              {isActive ? 'Loaded' : 'Load'}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => deleteSession(session.id)} data-testid={`button-delete-inline-${session.id}`}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {data.length > 0 && originalData && cleanedData && (
        <div className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${isCleanedView ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800' : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'}`} data-testid="cleaned-data-banner">
          <div className="flex items-center gap-2">
            {isCleanedView ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                  Viewing cleaned data ({cleanedData.length} rows)
                </span>
                <span className="text-xs text-emerald-600 dark:text-emerald-400">
                  — Original had {originalData.length} rows
                </span>
              </>
            ) : (
              <>
                <FileSpreadsheet className="h-4 w-4 text-amber-600" />
                <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
                  Viewing raw data ({originalData.length} rows)
                </span>
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  — Cleaned version has {cleanedData.length} rows
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={() => {
                if (isCleanedView) {
                  setData(originalData);
                  setIsCleanedView(false);
                  toast({ title: 'Switched to raw data', description: `Showing all ${originalData.length} original rows.` });
                } else {
                  setData(cleanedData);
                  setIsCleanedView(true);
                  toast({ title: 'Switched to cleaned data', description: `Showing ${cleanedData.length} cleaned rows.` });
                }
              }}
              data-testid="button-toggle-data-view"
            >
              <RotateCcw className="h-3 w-3" />
              {isCleanedView ? 'Switch to Raw Data' : 'Switch to Cleaned Data'}
            </Button>
          </div>
        </div>
      )}

      {data.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            <Card className="p-3 text-center">
              <div className="text-2xl font-bold text-primary">{filteredData.length}</div>
              <div className="text-xs text-muted-foreground mt-1">Total Questionnaires</div>
            </Card>
            <Card className="p-3 text-center">
              <div className="text-2xl font-bold text-teal-600">{new Set(filteredData.map(r => r.activitySite).filter(Boolean)).size}</div>
              <div className="text-xs text-muted-foreground mt-1">Unique Sites</div>
            </Card>
            <Card className="p-3 text-center">
              <div className="text-2xl font-bold text-blue-600">{new Set(filteredData.map(r => r.hub)).size}</div>
              <div className="text-xs text-muted-foreground mt-1">Hubs</div>
            </Card>
            <Card className="p-3 text-center">
              <div className="text-2xl font-bold text-green-600">{new Set(filteredData.map(r => r.state)).size}</div>
              <div className="text-xs text-muted-foreground mt-1">States</div>
            </Card>
            <Card className="p-3 text-center">
              <div className="text-2xl font-bold text-orange-600">{new Set(filteredData.map(r => r.activity)).size}</div>
              <div className="text-xs text-muted-foreground mt-1">Activities</div>
            </Card>
            <Card className="p-3 text-center">
              <div className="text-2xl font-bold text-purple-600">{new Set(filteredData.map(r => r.dataCollector)).size}</div>
              <div className="text-xs text-muted-foreground mt-1">Data Collectors</div>
            </Card>
          </div>

          <Card className="p-4">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, hub, state, activity..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                    data-testid="input-search"
                  />
                </div>
                <Button variant={showFilterPanel ? 'default' : 'outline'} className="gap-2" onClick={() => setShowFilterPanel(!showFilterPanel)} data-testid="button-toggle-filters">
                  <Filter className="h-4 w-4" />
                  Filters
                  {activeFilterCount > 0 && <Badge variant="secondary" className="ml-1 h-5 px-1.5">{activeFilterCount}</Badge>}
                </Button>
                {(activeFilterCount > 0 || searchQuery) && (
                  <Button variant="ghost" size="sm" className="gap-1" onClick={clearAllFilters} data-testid="button-clear-filters">
                    <X className="h-4 w-4" />
                    Clear All
                  </Button>
                )}
              </div>

              {activeFilterCount > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {filterHubs.map(h => (
                    <Badge key={`fh-${h}`} variant="secondary" className="gap-1 cursor-pointer" onClick={() => toggleFilter(filterHubs, setFilterHubs, h)}>
                      Hub: {h} <X className="h-3 w-3" />
                    </Badge>
                  ))}
                  {filterStates.map(s => (
                    <Badge key={`fs-${s}`} variant="secondary" className="gap-1 cursor-pointer" onClick={() => toggleFilter(filterStates, setFilterStates, s)}>
                      State: {s} <X className="h-3 w-3" />
                    </Badge>
                  ))}
                  {filterLocalities.map(l => (
                    <Badge key={`fl-${l}`} variant="secondary" className="gap-1 cursor-pointer" onClick={() => toggleFilter(filterLocalities, setFilterLocalities, l)}>
                      Locality: {l} <X className="h-3 w-3" />
                    </Badge>
                  ))}
                  {filterActivities.map(a => (
                    <Badge key={`fa-${a}`} variant="secondary" className="gap-1 cursor-pointer" onClick={() => toggleFilter(filterActivities, setFilterActivities, a)}>
                      Activity: {a} <X className="h-3 w-3" />
                    </Badge>
                  ))}
                </div>
              )}

              {showFilterPanel && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-3 border-t">
                  <div>
                    <Label className="text-xs font-semibold text-muted-foreground mb-2 block">HUBS</Label>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {uniqueHubs.map(h => (
                        <div key={h} className="flex items-center gap-2">
                          <Checkbox checked={filterHubs.includes(h)} onCheckedChange={() => toggleFilter(filterHubs, setFilterHubs, h)} id={`hub-${h}`} data-testid={`checkbox-hub-${h}`} />
                          <label htmlFor={`hub-${h}`} className="text-sm cursor-pointer flex-1 truncate">{h}</label>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-muted-foreground mb-2 block">STATES</Label>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {uniqueStates.map(s => (
                        <div key={s} className="flex items-center gap-2">
                          <Checkbox checked={filterStates.includes(s)} onCheckedChange={() => toggleFilter(filterStates, setFilterStates, s)} id={`state-${s}`} data-testid={`checkbox-state-${s}`} />
                          <label htmlFor={`state-${s}`} className="text-sm cursor-pointer flex-1 truncate">{s}</label>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-muted-foreground mb-2 block">LOCALITIES</Label>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {uniqueLocalities.map(l => (
                        <div key={l} className="flex items-center gap-2">
                          <Checkbox checked={filterLocalities.includes(l)} onCheckedChange={() => toggleFilter(filterLocalities, setFilterLocalities, l)} id={`loc-${l}`} data-testid={`checkbox-locality-${l}`} />
                          <label htmlFor={`loc-${l}`} className="text-sm cursor-pointer flex-1 truncate">{l}</label>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-muted-foreground mb-2 block">ACTIVITIES</Label>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {uniqueActivities.map(a => (
                        <div key={a} className="flex items-center gap-2">
                          <Checkbox checked={filterActivities.includes(a)} onCheckedChange={() => toggleFilter(filterActivities, setFilterActivities, a)} id={`act-${a}`} data-testid={`checkbox-activity-${a}`} />
                          <label htmlFor={`act-${a}`} className="text-sm cursor-pointer flex-1 truncate">{a}</label>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-4 sm:grid-cols-9 w-full">
              <TabsTrigger value="overview" data-testid="tab-overview" className="gap-1">
                <BarChart3 className="h-3 w-3 hidden sm:inline" />Overview
              </TabsTrigger>
              <TabsTrigger value="hub" data-testid="tab-hub" className="gap-1">
                Hub <Badge variant="secondary" className="h-4 px-1 text-[10px] font-mono">{hubSummary.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="state" data-testid="tab-state" className="gap-1">
                State <Badge variant="secondary" className="h-4 px-1 text-[10px] font-mono">{stateSummary.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="locality" data-testid="tab-locality" className="gap-1">
                Locality <Badge variant="secondary" className="h-4 px-1 text-[10px] font-mono">{localitySummary.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="sites" data-testid="tab-sites" className="gap-1">
                Sites <Badge variant="secondary" className="h-4 px-1 text-[10px] font-mono">{siteSummary.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="activity" data-testid="tab-activity" className="gap-1">
                Activity <Badge variant="secondary" className="h-4 px-1 text-[10px] font-mono">{activityBreakdown.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="collector" data-testid="tab-collector" className="gap-1">
                Collector <Badge variant="secondary" className="h-4 px-1 text-[10px] font-mono">{collectorDetails.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="tracker" data-testid="tab-tracker" className="gap-1">
                <Layers className="h-3 w-3 hidden sm:inline" />Tracker
              </TabsTrigger>
              <TabsTrigger value="reports" data-testid="tab-reports" className="gap-1">
                <ClipboardList className="h-3 w-3 hidden sm:inline" />Reports
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4 mt-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base"><Building2 className="h-4 w-4 text-primary" /> Questionnaires by Hub</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={hubSummary.slice(0, 10).map(h => ({ name: h.name.length > 12 ? h.name.slice(0, 12) + '...' : h.name, Sites: h.sites, Questionnaires: h.questionnaires }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-25} textAnchor="end" height={60} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <RechartsTooltip contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} />
                        <Bar dataKey="Sites" fill="#2563eb" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Questionnaires" fill="#16a34a" radius={[4, 4, 0, 0]} />
                        <Legend />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base"><PieChart className="h-4 w-4 text-primary" /> Distribution by Activity</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <RechartsPie>
                        <Pie
                          data={activityBreakdown.map(a => ({ name: a.name, value: a.questionnaireCount }))}
                          cx="50%" cy="50%" outerRadius={90} innerRadius={40}
                          dataKey="value" nameKey="name" paddingAngle={2}
                          label={({ name, percent }) => `${name.length > 10 ? name.slice(0, 10) + '..' : name} ${(percent * 100).toFixed(0)}%`}
                          labelLine={{ strokeWidth: 1 }}
                        >
                          {activityBreakdown.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <RechartsTooltip contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} />
                      </RechartsPie>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base"><MapPin className="h-4 w-4 text-primary" /> Sites & Questionnaires by State</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={stateSummary.slice(0, 10).map(s => ({ name: s.name.length > 12 ? s.name.slice(0, 12) + '...' : s.name, Sites: s.sites, Questionnaires: s.questionnaires }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-25} textAnchor="end" height={60} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <RechartsTooltip contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} />
                        <Bar dataKey="Sites" fill="#0891b2" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Questionnaires" fill="#ea580c" radius={[4, 4, 0, 0]} />
                        <Legend />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4 text-primary" /> Top 10 Data Collectors</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={collectorDetails.slice(0, 10).map(c => ({ name: c.name.length > 12 ? c.name.slice(0, 12) + '...' : c.name, Questionnaires: c.count }))} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 10 }} />
                        <RechartsTooltip contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} />
                        <Bar dataKey="Questionnaires" fill="#9333ea" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Activity className="h-5 w-5 text-primary" />
                    By Activity
                  </CardTitle>
                  <CardDescription>{activityBreakdown.length} activities, {activityBreakdown.reduce((a, b) => a + b.questionnaireCount, 0)} total questionnaires</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" data-testid="table-activity-overview">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left py-2 px-3 font-medium w-8"></th>
                          <th className="text-left py-2 px-3 font-medium">Activity</th>
                          <th className="text-right py-2 px-3 font-medium">Sites</th>
                          <th className="text-right py-2 px-3 font-medium">Questionnaires</th>
                          <th className="text-right py-2 px-3 font-medium">%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activityBreakdown.map((item) => (
                          <Fragment key={item.name}>
                            <tr
                              className="border-b hover:bg-muted/30 cursor-pointer transition-colors"
                              onClick={() => toggleExpand(item.name)}
                              data-testid={`row-activity-${item.name}`}
                            >
                              <td className="py-2 px-3">
                                {expandedRows.has(item.name) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </td>
                              <td className="py-2 px-3 font-medium">{item.name}</td>
                              <td className="py-2 px-3 text-right"><Badge variant="outline" className="font-mono text-blue-600">{item.siteCount}</Badge></td>
                              <td className="py-2 px-3 text-right"><Badge variant="secondary" className="font-mono">{item.questionnaireCount}</Badge></td>
                              <td className="py-2 px-3 text-right text-muted-foreground">{item.percentage.toFixed(1)}%</td>
                            </tr>
                            {expandedRows.has(item.name) && item.siteList.map(site => (
                              <tr key={`${item.name}-${site.name}`} className="border-b bg-muted/20">
                                <td className="py-1.5 px-3" />
                                <td className="py-1.5 px-3 pl-8 text-muted-foreground flex items-center gap-2">
                                  <MapPin className="h-3 w-3" />
                                  {site.name}
                                </td>
                                <td className="py-1.5 px-3" />
                                <td className="py-1.5 px-3 text-right"><Badge variant="outline" className="font-mono text-xs">{site.count}</Badge></td>
                                <td className="py-1.5 px-3 text-right text-xs text-muted-foreground">{site.percentage.toFixed(1)}%</td>
                              </tr>
                            ))}
                          </Fragment>
                        ))}
                        <tr className="bg-muted/50 font-semibold">
                          <td className="py-2 px-3" />
                          <td className="py-2 px-3">Total</td>
                          <td className="py-2 px-3 text-right"><Badge variant="outline" className="font-mono text-blue-700">{activityBreakdown.reduce((a, b) => a + b.siteCount, 0)}</Badge></td>
                          <td className="py-2 px-3 text-right"><Badge className="font-mono">{activityBreakdown.reduce((a, b) => a + b.questionnaireCount, 0)}</Badge></td>
                          <td className="py-2 px-3 text-right">100%</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="hub" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="h-4 w-4 text-primary" /> Hub Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={hubSummary.map(h => ({ name: h.name.length > 14 ? h.name.slice(0, 14) + '..' : h.name, Sites: h.sites, Questionnaires: h.questionnaires }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={65} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <RechartsTooltip contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} />
                        <Bar dataKey="Sites" fill="#2563eb" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Questionnaires" fill="#16a34a" radius={[4, 4, 0, 0]} />
                        <Legend />
                      </BarChart>
                    </ResponsiveContainer>
                    <ResponsiveContainer width="100%" height={260}>
                      <RechartsPie>
                        <Pie data={hubSummary.map(h => ({ name: h.name, value: h.questionnaires }))} cx="50%" cy="50%" outerRadius={90} innerRadius={35} dataKey="value" paddingAngle={2}>
                          {hubSummary.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                        </Pie>
                        <RechartsTooltip contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} />
                        <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: 11 }} />
                      </RechartsPie>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
              {hubDrilldownTable}
            </TabsContent>

            <TabsContent value="state" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="h-4 w-4 text-primary" /> State Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <ResponsiveContainer width="100%" height={Math.max(200, stateSummary.length * 28)}>
                      <BarChart data={stateSummary.map(s => ({ name: s.name.length > 14 ? s.name.slice(0, 14) + '..' : s.name, Sites: s.sites, Questionnaires: s.questionnaires }))} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 10 }} />
                        <RechartsTooltip contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} />
                        <Bar dataKey="Sites" fill="#0891b2" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="Questionnaires" fill="#ea580c" radius={[0, 4, 4, 0]} />
                        <Legend />
                      </BarChart>
                    </ResponsiveContainer>
                    <ResponsiveContainer width="100%" height={260}>
                      <RechartsPie>
                        <Pie data={stateSummary.map(s => ({ name: s.name, value: s.questionnaires }))} cx="50%" cy="50%" outerRadius={90} innerRadius={35} dataKey="value" paddingAngle={2}>
                          {stateSummary.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                        </Pie>
                        <RechartsTooltip contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} />
                        <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: 11 }} />
                      </RechartsPie>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
              <SummaryTableWithSites items={stateSummary} label="State" icon={MapPin} showCollectors />
            </TabsContent>

            <TabsContent value="locality" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="h-4 w-4 text-primary" /> Top 15 Localities</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={localitySummary.slice(0, 15).map(l => ({ name: l.name.length > 14 ? l.name.slice(0, 14) + '..' : l.name, Sites: l.sites, Questionnaires: l.questionnaires }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" height={70} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <RechartsTooltip contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} />
                      <Bar dataKey="Sites" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Questionnaires" fill="#0d9488" radius={[4, 4, 0, 0]} />
                      <Legend />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <SummaryTableWithSites items={localitySummary} label="Locality" icon={MapPin} />
            </TabsContent>

            <TabsContent value="sites" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="h-4 w-4 text-primary" /> Top 15 Sites by Questionnaires</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={siteSummary.slice(0, 15).map(s => ({ name: s.name.length > 14 ? s.name.slice(0, 14) + '..' : s.name, Questionnaires: s.questionnaires }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" height={70} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <RechartsTooltip contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} />
                      <Bar dataKey="Questionnaires" fill="#dc2626" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <MapPin className="h-5 w-5 text-primary" />
                    By Site
                  </CardTitle>
                  <CardDescription>{siteDetailsWithActivity.length} unique sites found</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" data-testid="table-site-activity">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left py-2 px-3 font-medium">#</th>
                          <th className="text-left py-2 px-3 font-medium">Site</th>
                          <th className="text-left py-2 px-3 font-medium">Activity</th>
                          <th className="text-left py-2 px-3 font-medium">State</th>
                          <th className="text-left py-2 px-3 font-medium">Locality</th>
                          <th className="text-right py-2 px-3 font-medium">DC</th>
                          <th className="text-right py-2 px-3 font-medium">Questionnaires</th>
                          <th className="text-right py-2 px-3 font-medium">%</th>
                          <th className="py-2 px-3 font-medium w-28">Distribution</th>
                        </tr>
                      </thead>
                      <tbody>
                        {siteDetailsWithActivity.map((item, i) => (
                          <tr key={item.name} className="border-b hover:bg-muted/30 transition-colors" data-testid={`row-site-activity-${i}`}>
                            <td className="py-2 px-3 text-muted-foreground">{i + 1}</td>
                            <td className="py-2 px-3 font-medium">{item.name}</td>
                            <td className="py-2 px-3">
                              <div className="flex flex-wrap gap-1">
                                {item.activities.map(a => (
                                  <Badge key={a.name} variant="outline" className="text-[10px] px-1.5 py-0">{a.name} ({a.count})</Badge>
                                ))}
                              </div>
                            </td>
                            <td className="py-2 px-3 text-muted-foreground text-xs">{item.state || '-'}</td>
                            <td className="py-2 px-3 text-muted-foreground text-xs">{item.locality || '-'}</td>
                            <td className="py-2 px-3 text-right"><Badge variant="outline" className="font-mono text-purple-600">{item.collectors}</Badge></td>
                            <td className="py-2 px-3 text-right"><Badge variant="secondary" className="font-mono">{item.questionnaires}</Badge></td>
                            <td className="py-2 px-3 text-right text-muted-foreground">{item.percentage.toFixed(1)}%</td>
                            <td className="py-2 px-3">
                              <div className="w-full bg-muted rounded-full h-2">
                                <div className="bg-primary rounded-full h-2 transition-all" style={{ width: `${Math.min(item.percentage, 100)}%` }} />
                              </div>
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-muted/50 font-semibold">
                          <td className="py-2 px-3" colSpan={5}>Total</td>
                          <td className="py-2 px-3 text-right"><Badge variant="outline" className="font-mono text-purple-700">{siteDetailsWithActivity.reduce((a, b) => a + b.collectors, 0)}</Badge></td>
                          <td className="py-2 px-3 text-right"><Badge className="font-mono">{siteDetailsWithActivity.reduce((a, b) => a + b.questionnaires, 0)}</Badge></td>
                          <td className="py-2 px-3 text-right">100%</td>
                          <td className="py-2 px-3" />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="activity" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="h-4 w-4 text-primary" /> Activity Comparison</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={activityBreakdown.map(a => ({ name: a.name.length > 14 ? a.name.slice(0, 14) + '..' : a.name, Sites: a.siteCount, Questionnaires: a.questionnaireCount, Collectors: a.byCollector.length }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={65} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <RechartsTooltip contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} />
                      <Bar dataKey="Sites" fill="#2563eb" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Questionnaires" fill="#16a34a" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Collectors" fill="#9333ea" radius={[4, 4, 0, 0]} />
                      <Legend />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Activity className="h-5 w-5 text-primary" />
                    By Activity &mdash; Full Breakdown
                  </CardTitle>
                  <CardDescription>{activityBreakdown.length} activities, {activityBreakdown.reduce((a, b) => a + b.siteCount, 0)} total sites, {activityBreakdown.reduce((a, b) => a + b.questionnaireCount, 0)} questionnaires</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {activityBreakdown.map((item) => (
                      <div key={item.name} className="border rounded-lg">
                        <button
                          type="button"
                          className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors text-left"
                          onClick={() => toggleExpand(`act-detail-${item.name}`)}
                          data-testid={`button-activity-expand-${item.name}`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Activity className="h-4 w-4 text-primary flex-shrink-0" />
                            <span className="font-medium truncate">{item.name}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Badge variant="outline" className="text-blue-600 font-mono">{item.siteCount} sites</Badge>
                            <Badge variant="secondary" className="font-mono">{item.questionnaireCount} Q</Badge>
                            <span className="text-xs text-muted-foreground">{item.percentage.toFixed(1)}%</span>
                            {expandedRows.has(`act-detail-${item.name}`) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </div>
                        </button>
                        {expandedRows.has(`act-detail-${item.name}`) && (
                          <div className="border-t px-3 pb-3 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                              <div>
                                <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1"><Building2 className="h-3 w-3" /> BY HUB</h4>
                                <table className="w-full text-sm">
                                  <thead><tr className="border-b"><th className="text-left py-1 px-2 text-xs font-medium">Hub</th><th className="text-right py-1 px-2 text-xs font-medium">Sites</th><th className="text-right py-1 px-2 text-xs font-medium">Q</th></tr></thead>
                                  <tbody>
                                    {item.byHub.map(h => (
                                      <tr key={h.name} className="border-b last:border-0">
                                        <td className="py-1 px-2 text-sm">{h.name}</td>
                                        <td className="py-1 px-2 text-right text-xs text-blue-600">{h.sites}</td>
                                        <td className="py-1 px-2 text-right"><Badge variant="outline" className="font-mono text-xs">{h.count}</Badge></td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              <div>
                                <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1"><Globe className="h-3 w-3" /> BY STATE</h4>
                                <table className="w-full text-sm">
                                  <thead><tr className="border-b"><th className="text-left py-1 px-2 text-xs font-medium">State</th><th className="text-right py-1 px-2 text-xs font-medium">Sites</th><th className="text-right py-1 px-2 text-xs font-medium">Q</th></tr></thead>
                                  <tbody>
                                    {item.byState.map(s => (
                                      <tr key={s.name} className="border-b last:border-0">
                                        <td className="py-1 px-2 text-sm">{s.name}</td>
                                        <td className="py-1 px-2 text-right text-xs text-blue-600">{s.sites}</td>
                                        <td className="py-1 px-2 text-right"><Badge variant="outline" className="font-mono text-xs">{s.count}</Badge></td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1"><MapPin className="h-3 w-3" /> BY LOCALITY</h4>
                                <table className="w-full text-sm">
                                  <thead><tr className="border-b"><th className="text-left py-1 px-2 text-xs font-medium">Locality</th><th className="text-right py-1 px-2 text-xs font-medium">Sites</th><th className="text-right py-1 px-2 text-xs font-medium">Q</th></tr></thead>
                                  <tbody>
                                    {item.byLocality.map(l => (
                                      <tr key={l.name} className="border-b last:border-0">
                                        <td className="py-1 px-2 text-sm">{l.name}</td>
                                        <td className="py-1 px-2 text-right text-xs text-blue-600">{l.sites}</td>
                                        <td className="py-1 px-2 text-right"><Badge variant="outline" className="font-mono text-xs">{l.count}</Badge></td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              <div>
                                <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1"><Users className="h-3 w-3" /> BY DATA COLLECTOR</h4>
                                <table className="w-full text-sm">
                                  <thead><tr className="border-b"><th className="text-left py-1 px-2 text-xs font-medium">Collector</th><th className="text-right py-1 px-2 text-xs font-medium">Q</th></tr></thead>
                                  <tbody>
                                    {item.byCollector.map(c => (
                                      <tr key={c.name} className="border-b last:border-0">
                                        <td className="py-1 px-2 text-sm">
                                          <span>{c.name}</span>
                                          {c.deviceId && <span className="ml-1 text-xs text-muted-foreground font-mono">({c.deviceId})</span>}
                                        </td>
                                        <td className="py-1 px-2 text-right"><Badge variant="outline" className="font-mono text-xs">{c.count}</Badge></td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                            <div>
                              <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1"><MapPin className="h-3 w-3" /> SITES ({item.siteList.length})</h4>
                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1">
                                {item.siteList.map(site => (
                                  <div key={site.name} className="flex items-center justify-between text-xs px-2 py-1 bg-muted/30 rounded">
                                    <span className="truncate">{site.name}</span>
                                    <Badge variant="outline" className="ml-1 font-mono text-xs flex-shrink-0">{site.count}</Badge>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="collector" className="space-y-4 mt-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="h-4 w-4 text-primary" /> Top 15 Data Collectors</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={Math.min(400, Math.max(200, Math.min(collectorDetails.length, 15) * 26))}>
                    <BarChart data={collectorDetails.slice(0, 15).map(c => ({ name: c.name.length > 16 ? c.name.slice(0, 16) + '..' : c.name, Questionnaires: c.count }))} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 10 }} />
                      <RechartsTooltip contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} />
                      <Bar dataKey="Questionnaires" fill="#9333ea" radius={[0, 4, 4, 0]}>
                        {collectorDetails.slice(0, 15).map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Users className="h-5 w-5 text-primary" />
                    By Data Collector
                  </CardTitle>
                  <CardDescription>{collectorDetails.length} unique data collectors, {collectorDetails.reduce((a, b) => a + b.count, 0)} total questionnaires</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {collectorDetails.map((item, i) => {
                      const expandKey = `coll-${item.deviceId || item.name}`;
                      return (
                      <div key={item.deviceId || item.name} className="border rounded-lg">
                        <button
                          type="button"
                          className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors text-left"
                          onClick={() => toggleExpand(expandKey)}
                          data-testid={`button-collector-expand-${i}`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-xs text-muted-foreground w-5 text-right flex-shrink-0">{i + 1}</span>
                            <div className="min-w-0">
                              <span className="font-medium block truncate">{item.name}</span>
                              <div className="flex items-center gap-2 flex-wrap">
                                {item.deviceId && <span className="text-xs text-muted-foreground font-mono">{item.deviceId}</span>}
                                {item.profileId && <Badge variant="outline" className="text-[10px] px-1 py-0 text-green-600 border-green-300 font-mono">UUID: {item.profileId.slice(0, 8)}...</Badge>}
                                {!item.profileId && <Badge variant="outline" className="text-[10px] px-1 py-0 text-red-500 border-red-200">No UUID Match</Badge>}
                                {item.nameVariants.length > 0 && (
                                  <Badge variant="outline" className="text-[10px] px-1 py-0 text-amber-600 border-amber-300">{item.nameVariants.length} name variants</Badge>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                            <Badge variant="outline" className="text-xs">{item.sites.length} sites</Badge>
                            <Badge variant="outline" className="text-xs">{item.activities.length} activities</Badge>
                            <Badge variant="outline" className="text-xs">{item.localities.length} localities</Badge>
                            <Badge variant="secondary" className="font-mono">{item.count}</Badge>
                            <span className="text-xs text-muted-foreground">{item.percentage.toFixed(1)}%</span>
                            {expandedRows.has(expandKey) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </div>
                        </button>
                        {expandedRows.has(expandKey) && (
                          <div className="border-t px-3 pb-3 space-y-3 mt-0">
                            {item.nameVariants.length > 0 && (
                              <div className="mt-3 p-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md">
                                <h4 className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1.5 flex items-center gap-1">
                                  <Users className="h-3 w-3" /> NAME VARIANTS (same device)
                                </h4>
                                <div className="space-y-0.5">
                                  {item.nameVariants.map((v, vi) => (
                                    <div key={vi} className="flex items-center justify-between text-sm px-2 py-0.5">
                                      <span className={`truncate ${vi === 0 ? 'font-medium text-amber-800 dark:text-amber-300' : 'text-muted-foreground'}`}>
                                        {vi === 0 ? '★ ' : ''}{v.name}
                                      </span>
                                      <Badge variant="outline" className="font-mono text-xs ml-1">{v.count}</Badge>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            <div className="mt-3 p-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md">
                              <h4 className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-1 flex items-center gap-1">
                                <Lock className="h-3 w-3" /> PROFILE UUID
                              </h4>
                              {item.profileId ? (
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-mono text-blue-800 dark:text-blue-300 select-all">{item.profileId}</span>
                                  <Badge variant="outline" className="text-[10px] text-green-600 border-green-300">Matched</Badge>
                                </div>
                              ) : (
                                <span className="text-sm text-red-500">No matching profile found — name may differ from system records</span>
                              )}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                              <div>
                                <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                                  <Activity className="h-3 w-3" /> ACTIVITIES
                                  <Badge variant="secondary" className="text-[10px] px-1 py-0 ml-1">{item.activities.reduce((s, a) => s + a.count, 0)} total</Badge>
                                </h4>
                                <div className="space-y-1">
                                  {item.activities.map(a => (
                                    <div key={a.name} className="flex items-center justify-between text-sm px-2 py-1 bg-muted/30 rounded">
                                      <span className="truncate">{a.name}</span>
                                      <Badge variant="outline" className="font-mono text-xs ml-1">{a.count}</Badge>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1"><MapPin className="h-3 w-3" /> LOCALITIES</h4>
                                <div className="space-y-1">
                                  {item.localities.map(l => (
                                    <div key={l.name} className="flex items-center justify-between text-sm px-2 py-1 bg-muted/30 rounded">
                                      <span className="truncate">{l.name}</span>
                                      <Badge variant="outline" className="font-mono text-xs ml-1">{l.count}</Badge>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                            {item.sites.length > 0 && (
                              <div className="mt-3">
                                <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                                  <MapPin className="h-3 w-3" /> ACTIVITY SITES
                                  <Badge variant="secondary" className="text-[10px] px-1 py-0 ml-1">{item.sites.length} sites</Badge>
                                  <Badge variant="secondary" className="text-[10px] px-1 py-0 ml-1">{item.sites.reduce((s, st) => s + st.count, 0)} questionnaires</Badge>
                                </h4>
                                <div className="border rounded-md overflow-hidden">
                                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 px-2 py-1.5 bg-muted/50 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                                    <span>Site Name</span>
                                    <span>Locality</span>
                                    <span>State</span>
                                    <span className="text-right">Count</span>
                                  </div>
                                  <div className="max-h-48 overflow-y-auto">
                                    {item.sites.map((s, si) => (
                                      <div key={si} className={`grid grid-cols-[1fr_auto_auto_auto] gap-x-3 px-2 py-1 text-sm ${si % 2 === 0 ? 'bg-muted/10' : ''}`}>
                                        <span className="truncate">{s.name}</span>
                                        <span className="text-xs text-muted-foreground truncate max-w-[120px]">{s.locality || '-'}</span>
                                        <span className="text-xs text-muted-foreground truncate max-w-[100px]">{s.state || '-'}</span>
                                        <Badge variant="outline" className="font-mono text-xs ml-1 justify-self-end">{s.count}</Badge>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              {item.hubs.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1"><Building2 className="h-3 w-3" /> HUBS</h4>
                                  <div className="flex flex-wrap gap-1">
                                    {item.hubs.map(h => <Badge key={h} variant="outline" className="text-xs">{h}</Badge>)}
                                  </div>
                                </div>
                              )}
                              {item.states.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1"><Globe className="h-3 w-3" /> STATES</h4>
                                  <div className="flex flex-wrap gap-1">
                                    {item.states.map(s => <Badge key={s} variant="outline" className="text-xs">{s}</Badge>)}
                                  </div>
                                </div>
                              )}
                            </div>
                            <div className="flex justify-end pt-1">
                              <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => exportCollectorPdf(item)} data-testid={`button-export-collector-pdf-${i}`}>
                                <FileDown className="h-3 w-3" />
                                Export PDF
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="tracker" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Layers className="h-5 w-5 text-primary" />
                        Tracker - Activity by Hub
                      </CardTitle>
                      <CardDescription>Cross-tab: Activities (rows) x Hubs (columns) with Sites, Questionnaires & Collectors</CardDescription>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="outline" className="gap-1.5" data-testid="button-export-tracker">
                            <Download className="h-4 w-4" />
                            Export Tracker - Activity by Hub
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={exportMainTrackerPdf}>
                            <FileDown className="h-4 w-4 mr-2" />
                            PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={exportTrackerToExcel}>
                            <FileSpreadsheet className="h-4 w-4 mr-2" />
                            Excel
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={exportMainTrackerFormattedExcel}>
                            <FileSpreadsheet className="h-4 w-4 mr-2" />
                            Formatted Excel
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openSectionEmailDialog('Activity by Hub Tracker')} data-testid="button-send-tracker-email">
                        <Mail className="h-4 w-4" />
                        Send Email
                      </Button>
                      <Button size="sm" variant="default" className="gap-1.5" onClick={openAllTrackerEmailDialog} data-testid="button-send-all-tracker-email">
                        <Send className="h-4 w-4" />
                        Send Combined Report
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse" data-testid="table-tracker">
                      <thead>
                        <tr className="bg-muted/50">
                          <th className="text-left py-2 px-3 font-medium border min-w-[200px] sticky left-0 bg-muted/50 z-10">Activity</th>
                          {trackerData.hubs.map(hub => (
                            <th key={hub} className="text-center py-2 px-3 font-medium border min-w-[180px]" colSpan={4}>{hub}</th>
                          ))}
                          <th className="text-center py-2 px-3 font-medium border min-w-[180px] bg-primary/10" colSpan={4}>Grand Total</th>
                        </tr>
                        <tr className="bg-muted/30">
                          <th className="text-left py-1 px-3 text-xs font-medium border sticky left-0 bg-muted/30 z-10"></th>
                          {trackerData.hubs.map(hub => (
                            <Fragment key={hub}>
                              <th className="text-center py-1 px-2 text-xs font-medium border text-blue-600">Sites</th>
                              <th className="text-center py-1 px-2 text-xs font-medium border text-green-600">Actual</th>
                              <th className="text-center py-1 px-2 text-xs font-medium border text-amber-600">PDM Sites</th>
                              <th className="text-center py-1 px-2 text-xs font-medium border text-purple-600">DC</th>
                            </Fragment>
                          ))}
                          <th className="text-center py-1 px-2 text-xs font-medium border text-blue-600 bg-primary/5">Sites</th>
                          <th className="text-center py-1 px-2 text-xs font-medium border text-green-600 bg-primary/5">Actual</th>
                          <th className="text-center py-1 px-2 text-xs font-medium border text-amber-600 bg-primary/5">PDM Sites</th>
                          <th className="text-center py-1 px-2 text-xs font-medium border text-purple-600 bg-primary/5">DC</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trackerData.matrix.map((row, i) => (
                          <tr key={row.activity} className={i % 2 === 0 ? 'bg-white dark:bg-background' : 'bg-muted/20'}>
                            <td className={`py-2 px-3 font-medium border sticky left-0 z-10 ${i % 2 === 0 ? 'bg-white dark:bg-background' : 'bg-muted/20'}`}>{row.activity}</td>
                            {row.cells.map((cell, ci) => (
                              <Fragment key={trackerData.hubs[ci]}>
                                <td className="text-center py-2 px-2 border text-blue-600 font-mono text-xs">{cell.sites || '-'}</td>
                                <td className="text-center py-2 px-2 border text-green-600 font-mono text-xs">{cell.questionnaires || '-'}</td>
                                <td className="text-center py-2 px-2 border text-amber-600 font-mono text-xs">{row.isPdm ? (cell.questionnaires ? Math.floor(cell.questionnaires / 7) : '-') : (cell.questionnaires || '-')}</td>
                                <td className="text-center py-2 px-2 border text-purple-600 font-mono text-xs">{cell.collectors || '-'}</td>
                              </Fragment>
                            ))}
                            <td className="text-center py-2 px-2 border font-mono text-xs text-blue-700 font-semibold bg-primary/5">{row.totalSites}</td>
                            <td className="text-center py-2 px-2 border font-mono text-xs text-green-700 font-semibold bg-primary/5">{row.totalQ}</td>
                            <td className="text-center py-2 px-2 border font-mono text-xs text-amber-700 font-semibold bg-primary/5">{row.isPdm ? (row.totalQ ? Math.floor(row.totalQ / 7) : '-') : (row.totalQ || '-')}</td>
                            <td className="text-center py-2 px-2 border font-mono text-xs text-purple-700 font-semibold bg-primary/5">{row.totalCollectors}</td>
                          </tr>
                        ))}
                        <tr className="bg-muted/50 font-semibold">
                          <td className="py-2 px-3 border sticky left-0 bg-muted/50 z-10">Grand Total</td>
                          {trackerData.hubTotals.map((ht, hi) => (
                            <Fragment key={trackerData.hubs[hi]}>
                              <td className="text-center py-2 px-2 border text-blue-700 font-mono text-xs">{ht.sites}</td>
                              <td className="text-center py-2 px-2 border text-green-700 font-mono text-xs">{ht.questionnaires}</td>
                              <td className="text-center py-2 px-2 border text-amber-700 font-mono text-xs">{trackerData.matrix.reduce((a, r) => a + (r.isPdm ? Math.floor(r.cells[hi].questionnaires / 7) : r.cells[hi].questionnaires), 0) || '-'}</td>
                              <td className="text-center py-2 px-2 border text-purple-700 font-mono text-xs">{ht.collectors}</td>
                            </Fragment>
                          ))}
                          <td className="text-center py-2 px-2 border text-blue-700 font-mono text-xs bg-primary/10">{trackerData.grandSites}</td>
                          <td className="text-center py-2 px-2 border text-green-700 font-mono text-xs bg-primary/10">{trackerData.grandQ}</td>
                          <td className="text-center py-2 px-2 border text-amber-700 font-mono text-xs bg-primary/10">{trackerData.matrix.reduce((a, r) => a + (r.isPdm ? r.cells.reduce((b: any, c: any) => b + Math.floor(c.questionnaires / 7), 0) : r.totalQ), 0) || '-'}</td>
                          <td className="text-center py-2 px-2 border text-purple-700 font-mono text-xs bg-primary/10">{trackerData.grandCollectors}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {trackerData.hubTrackers.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <Building2 className="h-5 w-5 text-primary" />
                          Tracker per Hub
                        </CardTitle>
                        <CardDescription>Each hub: Activity (rows) x State (columns) with Sites, Questionnaires & Collectors</CardDescription>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="outline" className="gap-1.5" data-testid="button-export-hub-tracker">
                              <Download className="h-4 w-4" />
                              Export Tracker per Hub
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={exportTrackerPerHubPdf}>
                              <FileDown className="h-4 w-4 mr-2" />
                              PDF
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={e => e.preventDefault()}
                              onClick={() => { setPaymentExportType('perHubExcel'); setPaymentDialogOpen(true); }}
                            >
                              <FileSpreadsheet className="h-4 w-4 mr-2" />
                              Excel
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={e => e.preventDefault()}
                              onClick={() => { setPaymentExportType('perHubFormatted'); setPaymentDialogOpen(true); }}
                            >
                              <FileSpreadsheet className="h-4 w-4 mr-2" />
                              Formatted Excel
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <Button size="sm" variant="outline" className="gap-1.5" onClick={openCoverageEmailDialog} data-testid="button-send-coverage-email">
                          <Mail className="h-4 w-4" />
                          Send Email
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {trackerData.hubTrackers.map(ht => (
                      <div key={ht.hub} className="border rounded-lg">
                        <button
                          type="button"
                          className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors text-left"
                          onClick={() => toggleExpand(`hub-tracker-${ht.hub}`)}
                          data-testid={`button-hub-tracker-${ht.hub}`}
                        >
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-blue-600" />
                            <span className="font-semibold">{ht.hub}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge variant="outline" className="font-mono text-blue-600">{ht.grandSites} Sites</Badge>
                            <Badge variant="secondary" className="font-mono">{ht.grandQ} Q</Badge>
                            <Badge variant="outline" className="font-mono text-purple-600">{ht.grandCollectors} DC</Badge>
                            {expandedRows.has(`hub-tracker-${ht.hub}`) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </div>
                        </button>
                        {expandedRows.has(`hub-tracker-${ht.hub}`) && (
                          <div className="border-t overflow-x-auto">
                            <table className="w-full text-sm border-collapse" data-testid={`table-hub-tracker-${ht.hub}`}>
                              <thead>
                                <tr className="bg-muted/50">
                                  <th className="text-left py-2 px-3 font-medium border min-w-[180px] sticky left-0 bg-muted/50 z-10">Activity</th>
                                  {ht.states.map(st => (
                                    <th key={st} className="text-center py-2 px-3 font-medium border min-w-[160px]" colSpan={4}>{st}</th>
                                  ))}
                                  <th className="text-center py-2 px-3 font-medium border min-w-[160px] bg-primary/10" colSpan={4}>Total</th>
                                </tr>
                                <tr className="bg-muted/30">
                                  <th className="border sticky left-0 bg-muted/30 z-10"></th>
                                  {ht.states.map(st => (
                                    <Fragment key={st}>
                                      <th className="text-center py-1 px-1.5 text-xs font-medium border text-blue-600">Sites</th>
                                      <th className="text-center py-1 px-1.5 text-xs font-medium border text-green-600">Actual</th>
                                      <th className="text-center py-1 px-1.5 text-xs font-medium border text-amber-600">PDM</th>
                                      <th className="text-center py-1 px-1.5 text-xs font-medium border text-purple-600">DC</th>
                                    </Fragment>
                                  ))}
                                  <th className="text-center py-1 px-1.5 text-xs font-medium border text-blue-600 bg-primary/5">Sites</th>
                                  <th className="text-center py-1 px-1.5 text-xs font-medium border text-green-600 bg-primary/5">Actual</th>
                                  <th className="text-center py-1 px-1.5 text-xs font-medium border text-amber-600 bg-primary/5">PDM</th>
                                  <th className="text-center py-1 px-1.5 text-xs font-medium border text-purple-600 bg-primary/5">DC</th>
                                </tr>
                              </thead>
                              <tbody>
                                {ht.matrix.map((row, i) => (
                                  <tr key={row.activity} className={i % 2 === 0 ? 'bg-white dark:bg-background' : 'bg-muted/20'}>
                                    <td className={`py-1.5 px-3 font-medium border sticky left-0 z-10 text-sm ${i % 2 === 0 ? 'bg-white dark:bg-background' : 'bg-muted/20'}`}>{row.activity}</td>
                                    {row.cells.map((cell, ci) => (
                                      <Fragment key={ht.states[ci]}>
                                        <td className="text-center py-1.5 px-1.5 border text-blue-600 font-mono text-xs">{cell.sites || '-'}</td>
                                        <td className="text-center py-1.5 px-1.5 border text-green-600 font-mono text-xs">{cell.questionnaires || '-'}</td>
                                        <td className="text-center py-1.5 px-1.5 border text-amber-600 font-mono text-xs">{row.isPdm ? (cell.questionnaires ? Math.floor(cell.questionnaires / 7) : '-') : (cell.questionnaires || '-')}</td>
                                        <td className="text-center py-1.5 px-1.5 border text-purple-600 font-mono text-xs">{cell.collectors || '-'}</td>
                                      </Fragment>
                                    ))}
                                    <td className="text-center py-1.5 px-1.5 border font-mono text-xs text-blue-700 font-semibold bg-primary/5">{row.totalSites}</td>
                                    <td className="text-center py-1.5 px-1.5 border font-mono text-xs text-green-700 font-semibold bg-primary/5">{row.totalQ}</td>
                                    <td className="text-center py-1.5 px-1.5 border font-mono text-xs text-amber-700 font-semibold bg-primary/5">{row.isPdm ? (row.totalQ ? Math.floor(row.totalQ / 7) : '-') : (row.totalQ || '-')}</td>
                                    <td className="text-center py-1.5 px-1.5 border font-mono text-xs text-purple-700 font-semibold bg-primary/5">{row.totalCollectors}</td>
                                  </tr>
                                ))}
                                <tr className="bg-muted/50 font-semibold">
                                  <td className="py-2 px-3 border sticky left-0 bg-muted/50 z-10">Total</td>
                                  {ht.colTotals.map((ct, ci) => (
                                    <Fragment key={ht.states[ci]}>
                                      <td className="text-center py-2 px-1.5 border text-blue-700 font-mono text-xs">{ct.sites}</td>
                                      <td className="text-center py-2 px-1.5 border text-green-700 font-mono text-xs">{ct.questionnaires}</td>
                                      <td className="text-center py-2 px-1.5 border text-amber-700 font-mono text-xs">{(() => { const total = ht.matrix.reduce((a, r) => a + (r.isPdm ? Math.floor(r.cells[ci].questionnaires / 7) : r.cells[ci].questionnaires), 0); return total || '-'; })()}</td>
                                      <td className="text-center py-2 px-1.5 border text-purple-700 font-mono text-xs">{ct.collectors}</td>
                                    </Fragment>
                                  ))}
                                  <td className="text-center py-2 px-1.5 border text-blue-700 font-mono text-xs bg-primary/10">{ht.grandSites}</td>
                                  <td className="text-center py-2 px-1.5 border text-green-700 font-mono text-xs bg-primary/10">{ht.grandQ}</td>
                                  <td className="text-center py-2 px-1.5 border text-amber-700 font-mono text-xs bg-primary/10">{(() => { const total = ht.matrix.reduce((a, r) => a + (r.isPdm ? r.cells.reduce((b: any, c: any) => b + Math.floor(c.questionnaires / 7), 0) : r.totalQ), 0); return total || '-'; })()}</td>
                                  <td className="text-center py-2 px-1.5 border text-purple-700 font-mono text-xs bg-primary/10">{ht.grandCollectors}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {trackerData.stateTrackers.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <MapPin className="h-5 w-5 text-primary" />
                          Tracker per State
                        </CardTitle>
                        <CardDescription>Each state: Activity (rows) x Locality (columns) with Sites, Questionnaires & Collectors</CardDescription>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="outline" className="gap-1.5" data-testid="button-export-state-tracker">
                              <Download className="h-4 w-4" />
                              Export Tracker per State
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={exportTrackerPerStatePdf}>
                              <FileDown className="h-4 w-4 mr-2" />
                              PDF
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={exportTrackerPerStateExcel}>
                              <FileSpreadsheet className="h-4 w-4 mr-2" />
                              Excel
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={exportTrackerPerStateFormattedExcel}>
                              <FileSpreadsheet className="h-4 w-4 mr-2" />
                              Formatted Excel
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openSectionEmailDialog('Tracker per State')} data-testid="button-send-state-tracker-email">
                          <Mail className="h-4 w-4" />
                          Send Email
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {trackerData.stateTrackers.map(st => (
                      <div key={st.state} className="border rounded-lg">
                        <button
                          type="button"
                          className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors text-left"
                          onClick={() => toggleExpand(`state-tracker-${st.state}`)}
                          data-testid={`button-state-tracker-${st.state}`}
                        >
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-orange-600" />
                            <span className="font-semibold">{st.state}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge variant="outline" className="font-mono text-blue-600">{st.grandSites} Sites</Badge>
                            <Badge variant="secondary" className="font-mono">{st.grandQ} Q</Badge>
                            <Badge variant="outline" className="font-mono text-purple-600">{st.grandCollectors} DC</Badge>
                            {expandedRows.has(`state-tracker-${st.state}`) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </div>
                        </button>
                        {expandedRows.has(`state-tracker-${st.state}`) && (
                          <div className="border-t overflow-x-auto">
                            <table className="w-full text-sm border-collapse" data-testid={`table-state-tracker-${st.state}`}>
                              <thead>
                                <tr className="bg-muted/50">
                                  <th className="text-left py-2 px-3 font-medium border min-w-[180px] sticky left-0 bg-muted/50 z-10">Activity</th>
                                  {st.localities.map(loc => (
                                    <th key={loc} className="text-center py-2 px-3 font-medium border min-w-[160px]" colSpan={4}>{loc}</th>
                                  ))}
                                  <th className="text-center py-2 px-3 font-medium border min-w-[160px] bg-primary/10" colSpan={4}>Total</th>
                                </tr>
                                <tr className="bg-muted/30">
                                  <th className="border sticky left-0 bg-muted/30 z-10"></th>
                                  {st.localities.map(loc => (
                                    <Fragment key={loc}>
                                      <th className="text-center py-1 px-1.5 text-xs font-medium border text-blue-600">Sites</th>
                                      <th className="text-center py-1 px-1.5 text-xs font-medium border text-green-600">Actual</th>
                                      <th className="text-center py-1 px-1.5 text-xs font-medium border text-amber-600">PDM</th>
                                      <th className="text-center py-1 px-1.5 text-xs font-medium border text-purple-600">DC</th>
                                    </Fragment>
                                  ))}
                                  <th className="text-center py-1 px-1.5 text-xs font-medium border text-blue-600 bg-primary/5">Sites</th>
                                  <th className="text-center py-1 px-1.5 text-xs font-medium border text-green-600 bg-primary/5">Actual</th>
                                  <th className="text-center py-1 px-1.5 text-xs font-medium border text-amber-600 bg-primary/5">PDM</th>
                                  <th className="text-center py-1 px-1.5 text-xs font-medium border text-purple-600 bg-primary/5">DC</th>
                                </tr>
                              </thead>
                              <tbody>
                                {st.matrix.map((row, i) => (
                                  <tr key={row.activity} className={i % 2 === 0 ? 'bg-white dark:bg-background' : 'bg-muted/20'}>
                                    <td className={`py-1.5 px-3 font-medium border sticky left-0 z-10 text-sm ${i % 2 === 0 ? 'bg-white dark:bg-background' : 'bg-muted/20'}`}>{row.activity}</td>
                                    {row.cells.map((cell, ci) => (
                                      <Fragment key={st.localities[ci]}>
                                        <td className="text-center py-1.5 px-1.5 border text-blue-600 font-mono text-xs">{cell.sites || '-'}</td>
                                        <td className="text-center py-1.5 px-1.5 border text-green-600 font-mono text-xs">{cell.questionnaires || '-'}</td>
                                        <td className="text-center py-1.5 px-1.5 border text-amber-600 font-mono text-xs">{cell.questionnaires ? Math.floor(cell.questionnaires / 7) : '-'}</td>
                                        <td className="text-center py-1.5 px-1.5 border text-purple-600 font-mono text-xs">{cell.collectors || '-'}</td>
                                      </Fragment>
                                    ))}
                                    <td className="text-center py-1.5 px-1.5 border font-mono text-xs text-blue-700 font-semibold bg-primary/5">{row.totalSites}</td>
                                    <td className="text-center py-1.5 px-1.5 border font-mono text-xs text-green-700 font-semibold bg-primary/5">{row.totalQ}</td>
                                    <td className="text-center py-1.5 px-1.5 border font-mono text-xs text-amber-700 font-semibold bg-primary/5">{row.totalQ ? Math.floor(row.totalQ / 7) : '-'}</td>
                                    <td className="text-center py-1.5 px-1.5 border font-mono text-xs text-purple-700 font-semibold bg-primary/5">{row.totalCollectors}</td>
                                  </tr>
                                ))}
                                <tr className="bg-muted/50 font-semibold">
                                  <td className="py-2 px-3 border sticky left-0 bg-muted/50 z-10">Total</td>
                                  {st.colTotals.map((ct, ci) => (
                                    <Fragment key={st.localities[ci]}>
                                      <td className="text-center py-2 px-1.5 border text-blue-700 font-mono text-xs">{ct.sites}</td>
                                      <td className="text-center py-2 px-1.5 border text-green-700 font-mono text-xs">{ct.questionnaires}</td>
                                      <td className="text-center py-2 px-1.5 border text-amber-700 font-mono text-xs">{(() => { const total = st.matrix.reduce((a, r) => a + Math.floor(r.cells[ci].questionnaires / 7), 0); return total || '-'; })()}</td>
                                      <td className="text-center py-2 px-1.5 border text-purple-700 font-mono text-xs">{ct.collectors}</td>
                                    </Fragment>
                                  ))}
                                  <td className="text-center py-2 px-1.5 border text-blue-700 font-mono text-xs bg-primary/10">{st.grandSites}</td>
                                  <td className="text-center py-2 px-1.5 border text-green-700 font-mono text-xs bg-primary/10">{st.grandQ}</td>
                                  <td className="text-center py-2 px-1.5 border text-amber-700 font-mono text-xs bg-primary/10">{(() => { const total = st.matrix.reduce((a, r) => a + r.cells.reduce((b: any, c: any) => b + Math.floor(c.questionnaires / 7), 0), 0); return total || '-'; })()}</td>
                                  <td className="text-center py-2 px-1.5 border text-purple-700 font-mono text-xs bg-primary/10">{st.grandCollectors}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {trackerData.stateBreakdown.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <Globe className="h-5 w-5 text-primary" />
                          Tracker - Activity by State
                        </CardTitle>
                        <CardDescription>Activity breakdown per state</CardDescription>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="outline" className="gap-1.5" data-testid="button-export-act-state">
                              <Download className="h-4 w-4" />
                              Export Tracker - Activity by State
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={exportActivityByStatePdf}>
                              <FileDown className="h-4 w-4 mr-2" />
                              PDF
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={exportActivityByStateExcel}>
                              <FileSpreadsheet className="h-4 w-4 mr-2" />
                              Excel
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={exportActivityByStateFormattedExcel}>
                              <FileSpreadsheet className="h-4 w-4 mr-2" />
                              Formatted Excel
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openSectionEmailDialog('Activity by State Tracker')} data-testid="button-send-act-state-email">
                          <Mail className="h-4 w-4" />
                          Send Email
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {trackerData.stateBreakdown.map(sb => (
                        <div key={sb.state} className="border rounded-lg">
                          <button
                            type="button"
                            className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors text-left"
                            onClick={() => toggleExpand(`tracker-state-${sb.state}`)}
                            data-testid={`button-tracker-state-${sb.state}`}
                          >
                            <div className="flex items-center gap-2">
                              <MapPin className="h-4 w-4 text-primary" />
                              <span className="font-medium">{sb.state}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="font-mono">{sb.totalQ} Q</Badge>
                              {expandedRows.has(`tracker-state-${sb.state}`) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </div>
                          </button>
                          {expandedRows.has(`tracker-state-${sb.state}`) && (
                            <div className="border-t px-3 pb-3">
                              <table className="w-full text-sm mt-2">
                                <thead>
                                  <tr className="border-b">
                                    <th className="text-left py-1.5 px-2 font-medium text-xs">Activity</th>
                                    <th className="text-right py-1.5 px-2 font-medium text-xs">Sites</th>
                                    <th className="text-right py-1.5 px-2 font-medium text-xs">Questionnaires</th>
                                    <th className="text-right py-1.5 px-2 font-medium text-xs text-amber-600">PDM Sites</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {sb.activities.filter(a => a.questionnaires > 0).map(a => (
                                    <tr key={a.activity} className="border-b">
                                      <td className="py-1.5 px-2">{a.activity}</td>
                                      <td className="py-1.5 px-2 text-right text-blue-600 text-xs">{a.sites}</td>
                                      <td className="py-1.5 px-2 text-right"><Badge variant="outline" className="font-mono text-xs">{a.questionnaires}</Badge></td>
                                      <td className="py-1.5 px-2 text-right text-amber-600 font-mono text-xs">{Math.floor(a.questionnaires / 7)}</td>
                                    </tr>
                                  ))}
                                  <tr className="bg-muted/50 font-semibold">
                                    <td className="py-1.5 px-2">Total</td>
                                    <td className="py-1.5 px-2 text-right text-blue-700 text-xs">{sb.activities.filter(a => a.questionnaires > 0).reduce((s, a) => s + a.sites, 0)}</td>
                                    <td className="py-1.5 px-2 text-right"><Badge className="font-mono text-xs">{sb.totalQ}</Badge></td>
                                    <td className="py-1.5 px-2 text-right text-amber-700 font-mono text-xs">{(() => { const total = sb.activities.filter(a => a.questionnaires > 0).reduce((s, a) => s + (Math.floor(a.questionnaires / 7)), 0); return total || '-'; })()}</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* ── Tracker — Enumerators (CSV) ──────────────────────── */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Users className="h-5 w-5 text-primary" />
                        Tracker — Enumerators (CSV)
                      </CardTitle>
                      <CardDescription>Hub → State → Data collector breakdown from uploaded questionnaire data</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {csvEnumView === 'table' && trackerData.hubTrackers.length > 0 && (
                        <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={() => { setPaymentExportType('csvEnum'); setPaymentDialogOpen(true); }} data-testid="button-export-csv-enum-table">
                          <FileSpreadsheet className="h-4 w-4" />
                          Export Tracker — Enumerators (CSV)
                        </Button>
                      )}
                      <div className="flex items-center gap-1 rounded-md border p-0.5 bg-muted/40">
                        <Button size="sm" variant={csvEnumView === 'hierarchy' ? 'default' : 'ghost'} className="h-7 px-2.5 text-xs gap-1.5" onClick={() => setCsvEnumView('hierarchy')}>
                          <Users className="h-3.5 w-3.5" />
                          Hierarchy
                        </Button>
                        <Button size="sm" variant={csvEnumView === 'table' ? 'default' : 'ghost'} className="h-7 px-2.5 text-xs gap-1.5" onClick={() => setCsvEnumView('table')}>
                          <Table2 className="h-3.5 w-3.5" />
                          Table
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {filteredData.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground text-sm">
                      <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
                      No questionnaire data uploaded yet.
                    </div>
                  ) : csvEnumView === 'table' ? (
                    /* ── Table view (like Tracker per Hub) ── */
                    trackerData.hubTrackers.length === 0 ? (
                      <div className="text-center py-10 text-muted-foreground text-sm">No data available.</div>
                    ) : (
                      <div className="space-y-3">
                        {trackerData.hubTrackers.map(ht => (
                          <div key={ht.hub} className="border rounded-lg">
                            <button type="button" className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors text-left" onClick={() => toggleExpand(`csv-tbl-hub-${ht.hub}`)}>
                              <div className="flex items-center gap-2">
                                <Building2 className="h-4 w-4 text-blue-600" />
                                <span className="font-semibold">{ht.hub}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <Badge variant="outline" className="font-mono text-blue-600">{ht.grandSites} Sites</Badge>
                                <Badge variant="secondary" className="font-mono">{ht.grandQ} Q</Badge>
                                {(() => { const p = ht.matrix.reduce((a, r) => a + r.cells.reduce((b: any, c: any) => b + Math.floor(c.questionnaires / 7), 0), 0); return p > 0 ? <Badge variant="outline" className="font-mono text-amber-600">{p} PDM</Badge> : null; })()}
                                <Badge variant="outline" className="font-mono text-purple-600">{ht.grandCollectors} DC</Badge>
                                {expandedRows.has(`csv-tbl-hub-${ht.hub}`) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </div>
                            </button>
                            {expandedRows.has(`csv-tbl-hub-${ht.hub}`) && (
                              <div className="border-t overflow-x-auto">
                                <table className="w-full text-sm border-collapse">
                                  <thead>
                                    <tr className="bg-muted/50">
                                      <th className="text-left py-2 px-3 font-medium border min-w-[180px] sticky left-0 bg-muted/50 z-10">Activity</th>
                                      {ht.states.map(st => (
                                        <th key={st} className="text-center py-2 px-3 font-medium border min-w-[160px]" colSpan={4}>{st}</th>
                                      ))}
                                      <th className="text-center py-2 px-3 font-medium border min-w-[160px] bg-primary/10" colSpan={4}>Total</th>
                                    </tr>
                                    <tr className="bg-muted/30">
                                      <th className="border sticky left-0 bg-muted/30 z-10"></th>
                                      {ht.states.map(st => (
                                        <Fragment key={st}>
                                          <th className="text-center py-1 px-1.5 text-xs font-medium border text-blue-600">Sites</th>
                                          <th className="text-center py-1 px-1.5 text-xs font-medium border text-green-600">Actual</th>
                                          <th className="text-center py-1 px-1.5 text-xs font-medium border text-amber-600">PDM</th>
                                          <th className="text-center py-1 px-1.5 text-xs font-medium border text-purple-600">DC</th>
                                        </Fragment>
                                      ))}
                                      <th className="text-center py-1 px-1.5 text-xs font-medium border text-blue-600 bg-primary/5">Sites</th>
                                      <th className="text-center py-1 px-1.5 text-xs font-medium border text-green-600 bg-primary/5">Actual</th>
                                      <th className="text-center py-1 px-1.5 text-xs font-medium border text-amber-600 bg-primary/5">PDM</th>
                                      <th className="text-center py-1 px-1.5 text-xs font-medium border text-purple-600 bg-primary/5">DC</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {ht.matrix.map((row, i) => (
                                      <tr key={row.activity} className={i % 2 === 0 ? 'bg-white dark:bg-background' : 'bg-muted/20'}>
                                        <td className={`py-1.5 px-3 font-medium border sticky left-0 z-10 text-sm ${i % 2 === 0 ? 'bg-white dark:bg-background' : 'bg-muted/20'}`}>{row.activity}</td>
                                        {row.cells.map((cell, ci) => (
                                          <Fragment key={ht.states[ci]}>
                                            <td className="text-center py-1.5 px-1.5 border text-blue-600 font-mono text-xs">{cell.sites || '-'}</td>
                                            <td className="text-center py-1.5 px-1.5 border text-green-600 font-mono text-xs">{cell.questionnaires || '-'}</td>
                                            <td className="text-center py-1.5 px-1.5 border text-amber-600 font-mono text-xs">{cell.questionnaires ? Math.floor(cell.questionnaires / 7) : '-'}</td>
                                            <td className="text-center py-1.5 px-1.5 border text-purple-600 font-mono text-xs">{cell.collectors || '-'}</td>
                                          </Fragment>
                                        ))}
                                        <td className="text-center py-1.5 px-1.5 border font-mono text-xs text-blue-700 font-semibold bg-primary/5">{row.totalSites}</td>
                                        <td className="text-center py-1.5 px-1.5 border font-mono text-xs text-green-700 font-semibold bg-primary/5">{row.totalQ}</td>
                                        <td className="text-center py-1.5 px-1.5 border font-mono text-xs text-amber-700 font-semibold bg-primary/5">{row.totalQ ? Math.floor(row.totalQ / 7) : '-'}</td>
                                        <td className="text-center py-1.5 px-1.5 border font-mono text-xs text-purple-700 font-semibold bg-primary/5">{row.totalCollectors}</td>
                                      </tr>
                                    ))}
                                    <tr className="bg-muted/50 font-semibold">
                                      <td className="py-2 px-3 border sticky left-0 bg-muted/50 z-10">Total</td>
                                      {ht.colTotals.map((ct, ci) => (
                                        <Fragment key={ht.states[ci]}>
                                          <td className="text-center py-2 px-1.5 border text-blue-700 font-mono text-xs">{ct.sites}</td>
                                          <td className="text-center py-2 px-1.5 border text-green-700 font-mono text-xs">{ct.questionnaires}</td>
                                          <td className="text-center py-2 px-1.5 border text-amber-700 font-mono text-xs">{(() => { const t = ht.matrix.reduce((a, r) => a + Math.floor(r.cells[ci].questionnaires / 7), 0); return t || '-'; })()}</td>
                                          <td className="text-center py-2 px-1.5 border text-purple-700 font-mono text-xs">{ct.collectors}</td>
                                        </Fragment>
                                      ))}
                                      <td className="text-center py-2 px-1.5 border text-blue-700 font-mono text-xs bg-primary/10">{ht.grandSites}</td>
                                      <td className="text-center py-2 px-1.5 border text-green-700 font-mono text-xs bg-primary/10">{ht.grandQ}</td>
                                      <td className="text-center py-2 px-1.5 border text-amber-700 font-mono text-xs bg-primary/10">{(() => { const t = ht.matrix.reduce((a, r) => a + r.cells.reduce((b: any, c: any) => b + Math.floor(c.questionnaires / 7), 0), 0); return t || '-'; })()}</td>
                                      <td className="text-center py-2 px-1.5 border text-purple-700 font-mono text-xs bg-primary/10">{ht.grandCollectors}</td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )
                  ) : (
                    /* ── Hierarchy view (with PDM) ── */
                    csvEnumData.length === 0 ? (
                      <div className="text-center py-10 text-muted-foreground text-sm">No data available.</div>
                    ) : (() => {
                      const grandQ     = csvEnumData.reduce((s, h) => s + h.totalQ, 0);
                      const grandSites = csvEnumData.reduce((s, h) => s + h.totalSites, 0);
                      const grandPdm   = csvEnumData.reduce((s, h) => s + h.totalPdm, 0);
                      return (
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center gap-3 pb-1">
                            <Badge variant="secondary" className="font-mono">{csvEnumData.length} Hub{csvEnumData.length !== 1 ? 's' : ''}</Badge>
                            <Badge variant="outline" className="font-mono text-blue-600">{grandQ} Questionnaires</Badge>
                            <Badge variant="outline" className="font-mono text-green-600">{grandSites} Unique Sites</Badge>
                            {grandPdm > 0 && <Badge variant="outline" className="font-mono text-amber-600">{grandPdm} PDM Sites</Badge>}
                          </div>
                          {csvEnumData.map(hg => {
                            const hubKey  = `csv-ehub-${hg.hub}`;
                            const hubOpen = expandedRows.has(hubKey);
                            return (
                              <div key={hg.hub} className="border rounded-lg">
                                <button type="button" className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors text-left" onClick={() => toggleExpand(hubKey)}>
                                  <div className="flex items-center gap-2">
                                    <Building2 className="h-4 w-4 text-blue-600 shrink-0" />
                                    <span className="font-semibold">{hg.hub}</span>
                                    <Badge variant="outline" className="text-xs text-muted-foreground">{hg.states.length} State{hg.states.length !== 1 ? 's' : ''}</Badge>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0 ml-2">
                                    <Badge variant="outline" className="font-mono text-blue-600 text-xs">{hg.totalQ} Q</Badge>
                                    <Badge variant="secondary" className="font-mono text-xs">{hg.totalSites} Sites</Badge>
                                    {hg.totalPdm > 0 && <Badge variant="outline" className="font-mono text-amber-600 text-xs">{hg.totalPdm} PDM</Badge>}
                                    {hubOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                  </div>
                                </button>
                                {hubOpen && (
                                  <div className="border-t divide-y">
                                    {hg.states.map(sg => {
                                      const stateKey  = `csv-estate-${hg.hub}-${sg.state}`;
                                      const stateOpen = expandedRows.has(stateKey);
                                      return (
                                        <div key={sg.state}>
                                          <button type="button" className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/20 transition-colors text-left bg-muted/10" onClick={() => toggleExpand(stateKey)}>
                                            <div className="flex items-center gap-2">
                                              <MapPin className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                                              <span className="font-medium text-sm">{sg.state}</span>
                                              <span className="text-xs text-muted-foreground">{sg.collectors.length} collector{sg.collectors.length !== 1 ? 's' : ''}</span>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0 ml-2">
                                              <Badge variant="outline" className="font-mono text-blue-600 text-xs">{sg.totalQ} Q</Badge>
                                              <Badge variant="secondary" className="font-mono text-xs">{sg.totalSites} Sites</Badge>
                                              {sg.totalPdm > 0 && <Badge variant="outline" className="font-mono text-amber-600 text-xs">{sg.totalPdm} PDM</Badge>}
                                              {stateOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                            </div>
                                          </button>
                                          {stateOpen && (
                                            <div className="pl-6 pr-3 pb-2 space-y-1.5 pt-1.5 bg-muted/5">
                                              {sg.collectors.map((col, ci) => {
                                                const colKey  = `csv-ecol-${hg.hub}-${sg.state}-${col.name}-${ci}`;
                                                const colOpen = expandedRows.has(colKey);
                                                return (
                                                  <div key={colKey} className="border rounded-md bg-background">
                                                    <button type="button" className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/20 transition-colors text-left" onClick={() => toggleExpand(colKey)}>
                                                      <div className="flex items-center gap-2 min-w-0">
                                                        <Users className="h-3.5 w-3.5 text-primary shrink-0" />
                                                        <span className="text-sm font-medium truncate">{col.name}</span>
                                                        {(() => {
                                                          const k       = col.name.trim().toLowerCase();
                                                          const acctNo  = csvAccountMap.get(k);
                                                          const acctNm  = csvAccountNameMap.get(k);
                                                          if (acctNo || acctNm) {
                                                            return (
                                                              <span className="inline-flex items-center gap-1.5 shrink-0" title={`Account No: ${acctNo || '—'}  |  Account Name: ${acctNm || '—'}`}>
                                                                {acctNo && (
                                                                  <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
                                                                    <Banknote className="h-2.5 w-2.5" />{acctNo}
                                                                  </span>
                                                                )}
                                                                {acctNm && (
                                                                  <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">
                                                                    {acctNm}
                                                                  </span>
                                                                )}
                                                              </span>
                                                            );
                                                          }
                                                          return (
                                                            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800 shrink-0" title="No bank account registered">No Account</span>
                                                          );
                                                        })()}
                                                      </div>
                                                      <div className="flex items-center gap-2 shrink-0 ml-2">
                                                        <Badge variant="outline" className="font-mono text-blue-600 text-xs">{col.questionnaires} Q</Badge>
                                                        <Badge variant="secondary" className="font-mono text-xs">{col.sites.length} Sites</Badge>
                                                        {col.pdmSites > 0 && <Badge variant="outline" className="font-mono text-amber-600 text-xs">{col.pdmSites} PDM</Badge>}
                                                        {colOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                                      </div>
                                                    </button>
                                                    {colOpen && (
                                                      <div className="border-t">
                                                        <div className="flex flex-wrap gap-3 px-3 py-2 text-xs border-b bg-muted/10">
                                                          <span className="text-blue-600"><strong>{col.questionnaires}</strong> Questionnaires</span>
                                                          <span className="text-muted-foreground">{col.sites.length} Unique Sites</span>
                                                          {col.pdmSites > 0 && <span className="text-amber-600"><strong>{col.pdmSites}</strong> PDM Sites</span>}
                                                          {col.activities.length > 0 && (
                                                            <span className="text-muted-foreground">{col.activities.map(a => `${a.name} (${a.count}, PDM: ${Math.floor(a.count / 7)})`).join(' · ')}</span>
                                                          )}
                                                        </div>
                                                        {col.sites.length > 0 && (
                                                          <div className="overflow-x-auto">
                                                            <table className="w-full text-xs">
                                                              <thead>
                                                                <tr className="bg-muted/30 border-b">
                                                                  <th className="text-left py-1.5 px-2 font-medium">Site Name</th>
                                                                </tr>
                                                              </thead>
                                                              <tbody>
                                                                {col.sites.map((site, si) => (
                                                                  <tr key={si} className={si % 2 === 0 ? 'bg-background' : 'bg-muted/10'}>
                                                                    <td className="py-1.5 px-2">{site}</td>
                                                                  </tr>
                                                                ))}
                                                              </tbody>
                                                            </table>
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
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()
                  )}
                </CardContent>
              </Card>

              {/* ── Tracker — Enumerators (DB) ────────────────────────── */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Users className="h-5 w-5 text-primary" />
                        Tracker — Enumerators
                      </CardTitle>
                      <CardDescription>Hub → State → Data collector breakdown from live MMP site entries</CardDescription>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => { setEnumTrackerFetched(false); fetchEnumTrackerData(); }}
                        disabled={enumTrackerLoading}
                        data-testid="button-enum-refresh-tracker"
                      >
                        <RotateCcw className={`h-4 w-4 ${enumTrackerLoading ? 'animate-spin' : ''}`} />
                        Refresh
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="outline" className="gap-1.5" disabled={enumTrackerRows.length === 0} data-testid="button-enum-export-tracker">
                            <Download className="h-4 w-4" />
                            Export
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={e => e.preventDefault()}
                            onClick={() => {
                              const filtered = enumTrackerRows.filter(r => {
                                if (enumHubFilter !== 'all' && r.hub !== enumHubFilter) return false;
                                if (enumStateFilter !== 'all' && r.state !== enumStateFilter) return false;
                                if (enumSearch && !r.collectorName.toLowerCase().includes(enumSearch.toLowerCase())) return false;
                                if (enumStatusFilter === 'wfp_confirmed' && r.wfpConfirmed === 0) return false;
                                if (enumStatusFilter === 'submitted'     && r.submitted    === 0) return false;
                                if (enumStatusFilter === 'pending'       && r.pending      === 0) return false;
                                if (enumStatusFilter === 'rejected'      && r.rejected     === 0) return false;
                                return true;
                              });
                              setPaymentPendingRows(filtered);
                              setPaymentExportType('standard');
                              setPaymentDialogOpen(true);
                            }}
                          >
                            <FileSpreadsheet className="h-4 w-4 mr-2" />
                            Excel
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={e => e.preventDefault()}
                            onClick={() => {
                              const filtered = enumTrackerRows.filter(r => {
                                if (enumHubFilter !== 'all' && r.hub !== enumHubFilter) return false;
                                if (enumStateFilter !== 'all' && r.state !== enumStateFilter) return false;
                                if (enumSearch && !r.collectorName.toLowerCase().includes(enumSearch.toLowerCase())) return false;
                                if (enumStatusFilter === 'wfp_confirmed' && r.wfpConfirmed === 0) return false;
                                if (enumStatusFilter === 'submitted'     && r.submitted    === 0) return false;
                                if (enumStatusFilter === 'pending'       && r.pending      === 0) return false;
                                if (enumStatusFilter === 'rejected'      && r.rejected     === 0) return false;
                                return true;
                              });
                              setPaymentPendingRows(filtered);
                              setPaymentExportType('formatted');
                              setPaymentDialogOpen(true);
                            }}
                          >
                            <FileSpreadsheet className="h-4 w-4 mr-2" />
                            Formatted Excel
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Filter row */}
                  <div className="flex flex-wrap gap-2 mb-4 items-center">
                    <div className="relative flex-1 min-w-[160px] max-w-[260px]">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <input
                        className="pl-8 pr-3 py-1.5 text-sm border rounded-md w-full bg-background"
                        placeholder="Search collector…"
                        value={enumSearch}
                        onChange={e => setEnumSearch(e.target.value)}
                        data-testid="input-enum-search-tracker"
                      />
                    </div>
                    <select
                      className="text-sm border rounded-md px-2 py-1.5 bg-background"
                      value={enumHubFilter}
                      onChange={e => setEnumHubFilter(e.target.value)}
                      data-testid="select-enum-hub-tracker"
                    >
                      {['all', ...enumHubGroups.map(g => g.hub)].map(h => (
                        <option key={h} value={h}>{h === 'all' ? 'All Hubs' : h}</option>
                      ))}
                    </select>
                    <select
                      className="text-sm border rounded-md px-2 py-1.5 bg-background"
                      value={enumStateFilter}
                      onChange={e => setEnumStateFilter(e.target.value)}
                      data-testid="select-enum-state-tracker"
                    >
                      {['all', ...[...new Set(enumHubGroups.flatMap(g => g.states.map(s => s.state)))].sort()].map(s => (
                        <option key={s} value={s}>{s === 'all' ? 'All States' : s}</option>
                      ))}
                    </select>
                    {enumMmpOptions.length > 0 && (
                      <select
                        className="text-sm border rounded-md px-2 py-1.5 bg-background"
                        value={enumMmpFilter}
                        onChange={e => setEnumMmpFilter(e.target.value)}
                        data-testid="select-enum-mmp-tracker"
                      >
                        <option value="all">All MMPs</option>
                        {enumMmpOptions.map(([id, name]) => (
                          <option key={id} value={id}>{name}</option>
                        ))}
                      </select>
                    )}
                    <select
                      className="text-sm border rounded-md px-2 py-1.5 bg-background"
                      value={enumStatusFilter}
                      onChange={e => setEnumStatusFilter(e.target.value)}
                      data-testid="select-enum-status-tracker"
                    >
                      <option value="all">All Statuses</option>
                      <option value="wfp_confirmed">WFP Confirmed</option>
                      <option value="submitted">Submitted</option>
                      <option value="pending">Pending</option>
                      <option value="rejected">Rejected</option>
                    </select>
                    {(enumHubFilter !== 'all' || enumStateFilter !== 'all' || enumMmpFilter !== 'all' || enumStatusFilter !== 'all' || enumSearch) && (
                      <Button size="sm" variant="ghost" className="gap-1" onClick={() => { setEnumHubFilter('all'); setEnumStateFilter('all'); setEnumMmpFilter('all'); setEnumStatusFilter('all'); setEnumSearch(''); }}>
                        <X className="h-3.5 w-3.5" />Clear
                      </Button>
                    )}
                  </div>

                  {enumTrackerLoading ? (
                    <div className="flex flex-col items-center gap-3 py-10 text-muted-foreground text-sm">
                      <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
                      Loading enumerator data from MMP site entries…
                    </div>
                  ) : !enumTrackerFetched ? (
                    <div className="text-center py-10 text-muted-foreground text-sm">
                      <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
                      Click <strong>Refresh</strong> to load enumerator data.
                    </div>
                  ) : (() => {
                    // Apply hub / state / search filters to the hierarchy
                    const visibleHubs = enumHubGroups
                      .filter(hg => enumHubFilter === 'all' || hg.hub === enumHubFilter)
                      .map(hg => {
                        const states = hg.states
                          .filter(sg => enumStateFilter === 'all' || sg.state === enumStateFilter)
                          .map(sg => {
                            const collectors = sg.collectors
                              .map(c => {
                                if (enumMmpFilter === 'all') return c;
                                const filteredSites = c.sites.filter(s => s.mmpFileId === enumMmpFilter);
                                if (filteredSites.length === 0) return null;
                                const wfpC = filteredSites.filter(s => s.status.toLowerCase() === 'wfp_confirmed').length;
                                const subC = filteredSites.filter(s => s.status.toLowerCase() === 'submitted').length;
                                const rejC = filteredSites.filter(s => s.status.toLowerCase() === 'rejected').length;
                                const penC = filteredSites.length - wfpC - subC - rejC;
                                return { ...c, sites: filteredSites, total: filteredSites.length, covered: wfpC + subC, wfpConfirmed: wfpC, submitted: subC, rejected: rejC, pending: penC };
                              })
                              .filter((c): c is EnumTrackerEntry => c !== null)
                              .filter(c => {
                                if (enumSearch && !c.collectorName.toLowerCase().includes(enumSearch.toLowerCase())) return false;
                                if (enumStatusFilter === 'wfp_confirmed' && c.wfpConfirmed === 0) return false;
                                if (enumStatusFilter === 'submitted'     && c.submitted    === 0) return false;
                                if (enumStatusFilter === 'pending'       && c.pending      === 0) return false;
                                if (enumStatusFilter === 'rejected'      && c.rejected     === 0) return false;
                                return true;
                              });
                            const totalSites   = collectors.reduce((s, c) => s + c.total,   0);
                            const totalCovered = collectors.reduce((s, c) => s + c.covered, 0);
                            return { ...sg, collectors, totalSites, totalCovered };
                          })
                          .filter(sg => sg.collectors.length > 0);
                        const totalSites   = states.reduce((s, sg) => s + sg.totalSites,   0);
                        const totalCovered = states.reduce((s, sg) => s + sg.totalCovered, 0);
                        return { ...hg, states, totalSites, totalCovered };
                      })
                      .filter(hg => hg.states.length > 0);

                    if (visibleHubs.length === 0) return (
                      <div className="text-center py-10 text-muted-foreground text-sm">
                        <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
                        {enumHubGroups.length === 0
                          ? 'No MMP site entries with assigned data collectors found.'
                          : 'No enumerators match the selected filters.'}
                      </div>
                    );

                    const grandSites   = visibleHubs.reduce((s, h) => s + h.totalSites,   0);
                    const grandCovered = visibleHubs.reduce((s, h) => s + h.totalCovered, 0);
                    const grandPct     = grandSites > 0 ? Math.round((grandCovered / grandSites) * 100) : 0;

                    return (
                      <div className="space-y-3">
                        {/* Grand summary */}
                        <div className="flex flex-wrap items-center gap-3 pb-1">
                          <Badge variant="secondary" className="font-mono">{visibleHubs.length} Hub{visibleHubs.length !== 1 ? 's' : ''}</Badge>
                          <Badge variant="outline" className="font-mono text-blue-600">{grandSites} Total Sites</Badge>
                          <Badge variant="outline" className="font-mono text-green-600">{grandCovered} Covered</Badge>
                          <Badge variant="outline" className={`font-mono ${grandPct >= 80 ? 'text-green-600' : grandPct >= 50 ? 'text-amber-600' : 'text-red-500'}`}>
                            {grandPct}% Coverage
                          </Badge>
                        </div>

                        {/* Hub level */}
                        {visibleHubs.map(hg => {
                          const hubKey    = `enum-hub-${hg.hub}`;
                          const hubOpen   = expandedRows.has(hubKey);
                          const hubPct    = hg.totalSites > 0 ? Math.round((hg.totalCovered / hg.totalSites) * 100) : 0;
                          return (
                            <div key={hg.hub} className="border rounded-lg" data-testid={`row-enum-hub-${hg.hub}`}>
                              {/* Hub header */}
                              <button
                                type="button"
                                className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors text-left"
                                onClick={() => toggleExpand(hubKey)}
                              >
                                <div className="flex items-center gap-2">
                                  <Building2 className="h-4 w-4 text-blue-600 shrink-0" />
                                  <span className="font-semibold">{hg.hub}</span>
                                  <Badge variant="outline" className="text-xs text-muted-foreground">{hg.states.length} State{hg.states.length !== 1 ? 's' : ''}</Badge>
                                </div>
                                <div className="flex items-center gap-2 shrink-0 ml-2">
                                  <Badge variant="outline" className="font-mono text-blue-600 text-xs">{hg.totalSites} Sites</Badge>
                                  <Badge variant="secondary" className="font-mono text-xs">{hg.totalCovered} Covered</Badge>
                                  <span className={`text-xs font-bold hidden sm:inline ${hubPct >= 80 ? 'text-green-600' : hubPct >= 50 ? 'text-amber-600' : 'text-red-500'}`}>{hubPct}%</span>
                                  {hubOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </div>
                              </button>

                              {/* State level */}
                              {hubOpen && (
                                <div className="border-t divide-y">
                                  {hg.states.map(sg => {
                                    const stateKey  = `enum-state-${hg.hub}-${sg.state}`;
                                    const stateOpen = expandedRows.has(stateKey);
                                    const statePct  = sg.totalSites > 0 ? Math.round((sg.totalCovered / sg.totalSites) * 100) : 0;
                                    return (
                                      <div key={sg.state}>
                                        {/* State header */}
                                        <button
                                          type="button"
                                          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/20 transition-colors text-left bg-muted/10"
                                          onClick={() => toggleExpand(stateKey)}
                                          data-testid={`row-enum-state-${hg.hub}-${sg.state}`}
                                        >
                                          <div className="flex items-center gap-2">
                                            <MapPin className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                                            <span className="font-medium text-sm">{sg.state}</span>
                                            <span className="text-xs text-muted-foreground">{sg.collectors.length} collector{sg.collectors.length !== 1 ? 's' : ''}</span>
                                          </div>
                                          <div className="flex items-center gap-2 shrink-0 ml-2">
                                            <Badge variant="outline" className="font-mono text-blue-600 text-xs">{sg.totalSites} Sites</Badge>
                                            <Badge variant="secondary" className="font-mono text-xs">{sg.totalCovered} Covered</Badge>
                                            <span className={`text-xs font-bold hidden sm:inline ${statePct >= 80 ? 'text-green-600' : statePct >= 50 ? 'text-amber-600' : 'text-red-500'}`}>{statePct}%</span>
                                            {stateOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                          </div>
                                        </button>

                                        {/* Collector level */}
                                        {stateOpen && (
                                          <div className="pl-6 pr-3 pb-2 space-y-1.5 pt-1.5 bg-muted/5">
                                            {sg.collectors.map(col => {
                                              const colKey  = `tracker-enum-${hg.hub}-${sg.state}-${col.collectorId}`;
                                              const colOpen = expandedRows.has(colKey);
                                              const colPct  = col.total > 0 ? Math.round((col.covered / col.total) * 100) : 0;
                                              return (
                                                <div key={colKey} className="border rounded-md bg-background" data-testid={`row-enum-col-${col.collectorId}`}>
                                                  <button
                                                    type="button"
                                                    className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/20 transition-colors text-left"
                                                    onClick={() => toggleExpand(colKey)}
                                                  >
                                                    <div className="flex items-center gap-2 min-w-0">
                                                      <Users className="h-3.5 w-3.5 text-primary shrink-0" />
                                                      <span className="text-sm font-medium truncate">{col.collectorName}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0 ml-2">
                                                      <Badge variant="outline" className="font-mono text-blue-600 text-xs">{col.total} Sites</Badge>
                                                      <Badge variant="secondary" className="font-mono text-xs">{col.covered} Covered</Badge>
                                                      <span className={`text-xs font-bold hidden sm:inline ${colPct >= 80 ? 'text-green-600' : colPct >= 50 ? 'text-amber-600' : 'text-red-500'}`}>{colPct}%</span>
                                                      {colOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                                    </div>
                                                  </button>

                                                  {/* Site detail table */}
                                                  {colOpen && (
                                                    <div className="border-t">
                                                      <div className="flex flex-wrap gap-3 px-3 py-2 text-xs border-b bg-muted/10">
                                                        <span className="text-emerald-600"><strong>{col.wfpConfirmed}</strong> WFP Confirmed</span>
                                                        <span className="text-blue-600"><strong>{col.submitted}</strong> Submitted</span>
                                                        <span className="text-amber-600"><strong>{col.pending}</strong> Pending</span>
                                                        <span className="text-red-500"><strong>{col.rejected}</strong> Rejected</span>
                                                        <span className="text-muted-foreground">{col.total} Total Sites</span>
                                                        <span className={`font-bold ${col.total > 0 && (col.covered / col.total) * 100 >= 80 ? 'text-green-600' : col.total > 0 && (col.covered / col.total) * 100 >= 50 ? 'text-amber-600' : 'text-red-500'}`}>{col.total > 0 ? Math.round((col.covered / col.total) * 100) : 0}% Coverage</span>
                                                      </div>
                                                      <div className="overflow-x-auto">
                                                        <table className="w-full text-xs">
                                                          <thead>
                                                            <tr className="bg-muted/30 border-b">
                                                              <th className="text-left py-1.5 px-2 font-medium">Site Name</th>
                                                              <th className="text-left py-1.5 px-2 font-medium">Locality</th>
                                                              <th className="text-center py-1.5 px-2 font-medium">Status</th>
                                                              <th className="text-center py-1.5 px-2 font-medium">Date</th>
                                                            </tr>
                                                          </thead>
                                                          <tbody>
                                                            {col.sites.map((s, si) => (
                                                              <tr key={si} className={`border-b last:border-0 ${si % 2 === 1 ? 'bg-muted/10' : ''}`}>
                                                                <td className="py-1.5 px-2 font-medium">{s.siteName || '—'}</td>
                                                                <td className="py-1.5 px-2 text-muted-foreground">{s.locality || '—'}</td>
                                                                <td className="py-1.5 px-2 text-center">
                                                                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                                                                    s.status === 'wfp_confirmed' ? 'border-emerald-300 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30' :
                                                                    s.status === 'submitted'     ? 'border-blue-300 text-blue-700 bg-blue-50 dark:bg-blue-950/30' :
                                                                    s.status === 'rejected'      ? 'border-red-300 text-red-700 bg-red-50 dark:bg-red-950/30' :
                                                                    'border-amber-300 text-amber-700 bg-amber-50 dark:bg-amber-950/30'
                                                                  }`}>{s.status.replace(/_/g, ' ')}</Badge>
                                                                </td>
                                                                <td className="py-1.5 px-2 text-center text-muted-foreground">{s.date || '—'}</td>
                                                              </tr>
                                                            ))}
                                                          </tbody>
                                                        </table>
                                                      </div>
                                                    </div>
                                                  )}
                                                </div>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>

            </TabsContent>

            <TabsContent value="reports" className="mt-4 space-y-4" data-testid="reports-tab-content">
              {computeReportSummary && (
                <>
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div>
                          <CardTitle className="flex items-center gap-2 text-lg" data-testid="text-report-title">
                            <FileText className="h-5 w-5 text-primary" />
                            Data Quality & Coverage Report
                          </CardTitle>
                          <CardDescription>
                            <span className="flex flex-wrap items-center gap-2 mt-1">
                              <Badge variant="outline" className="gap-1" data-testid="text-report-month">
                                <Clock className="h-3 w-3" />
                                {computeReportSummary.monthCoverage}
                              </Badge>
                              <Badge variant="secondary" className="gap-1" data-testid="text-report-file">
                                <FileSpreadsheet className="h-3 w-3" />
                                {computeReportSummary.fileName}
                              </Badge>
                              <span className="text-xs text-muted-foreground">Generated: {computeReportSummary.generatedDate}</span>
                            </span>
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="sm" variant="outline" className="gap-1.5" data-testid="button-export-report">
                                <Download className="h-4 w-4" />
                                Export
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={exportReportExcel} data-testid="button-export-report-excel">
                                <FileSpreadsheet className="h-4 w-4 mr-2" />
                                Excel
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={exportReportPdf} data-testid="button-export-report-pdf">
                                <FileDown className="h-4 w-4 mr-2" />
                                PDF
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openSectionEmailDialog('Summary Report')} data-testid="button-send-report-tab-email">
                            <Mail className="h-4 w-4" />
                            Send Email
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Globe className="h-4 w-4 text-primary" />
                        Coverage Summary
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                        <div className="text-center p-3 bg-muted/30 rounded-lg">
                          <div className="text-xl font-bold text-primary" data-testid="text-report-total-q">{computeReportSummary.totalQuestionnaires}</div>
                          <div className="text-xs text-muted-foreground">Questionnaires{cleanResults ? ' (Cleaned)' : ''}</div>
                          {cleanResults && (
                            <div className="text-[10px] text-muted-foreground mt-0.5">Original: {computeReportSummary.originalRows}</div>
                          )}
                        </div>
                        <div className="text-center p-3 bg-muted/30 rounded-lg">
                          <div className="text-xl font-bold text-teal-600" data-testid="text-report-sites">{computeReportSummary.uniqueSites}</div>
                          <div className="text-xs text-muted-foreground">Unique Sites</div>
                        </div>
                        <div className="text-center p-3 bg-muted/30 rounded-lg">
                          <div className="text-xl font-bold text-blue-600">{computeReportSummary.uniqueHubs}</div>
                          <div className="text-xs text-muted-foreground">Hubs</div>
                        </div>
                        <div className="text-center p-3 bg-muted/30 rounded-lg">
                          <div className="text-xl font-bold text-green-600">{computeReportSummary.uniqueStates}</div>
                          <div className="text-xs text-muted-foreground">States</div>
                        </div>
                        <div className="text-center p-3 bg-muted/30 rounded-lg">
                          <div className="text-xl font-bold text-orange-600">{computeReportSummary.uniqueLocalities}</div>
                          <div className="text-xs text-muted-foreground">Localities</div>
                        </div>
                      </div>

                      {trackerData && trackerData.matrix && trackerData.matrix.length > 0 && (() => {
                        const { hubs: tHubs, matrix: tMatrix, hubTotals: tHubTotals, grandQ: tGrandQ, grandSites: tGrandSites, grandCollectors: tGrandCollectors } = trackerData;
                        const pdmSitesGrand = tMatrix.reduce((a: number, r: any) => a + r.cells.reduce((b: any, c: any) => b + Math.floor(c.questionnaires / 7), 0), 0);
                        const actualSitesGrand = pdmSitesGrand;
                        return (
                          <div>
                            <h4 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                              <BarChart3 className="h-3.5 w-3.5" /> Tracker Grand Totals
                            </h4>
                            <div className="border rounded-lg overflow-hidden">
                              <table className="w-full text-sm" data-testid="table-report-tracker-totals">
                                <thead>
                                  <tr className="bg-muted/40 border-b">
                                    <th className="text-left py-2 px-3 font-medium text-xs">Hub</th>
                                    <th className="text-center py-2 px-3 font-medium text-xs">Sites</th>
                                    <th className="text-center py-2 px-3 font-medium text-xs">Actual</th>
                                    <th className="text-center py-2 px-3 font-medium text-xs">PDM Sites</th>
                                    <th className="text-center py-2 px-3 font-medium text-xs">DC</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {tHubs.map((hub: string, hi: number) => {
                                    const ht = tHubTotals[hi];
                                    const hubPdmSites = tMatrix.reduce((a: number, r: any) => a + (Math.floor(r.cells[hi].questionnaires / 7)), 0);
                                    return (
                                      <tr key={hub} className="border-b last:border-b-0 hover:bg-muted/20">
                                        <td className="py-1.5 px-3 font-medium">{hub}</td>
                                        <td className="py-1.5 px-3 text-center font-mono text-blue-600">{ht.sites}</td>
                                        <td className="py-1.5 px-3 text-center font-mono text-green-600">{ht.questionnaires}</td>
                                        <td className="py-1.5 px-3 text-center font-mono text-amber-600">{hubPdmSites || '-'}</td>
                                        <td className="py-1.5 px-3 text-center font-mono text-purple-600">{ht.collectors}</td>
                                      </tr>
                                    );
                                  })}
                                  <tr className="bg-primary/10 dark:bg-primary/20 font-bold border-t-2 border-primary/30">
                                    <td className="py-2 px-3 font-bold text-primary">Grand Total</td>
                                    <td className="py-2 px-3 text-center font-mono font-bold text-blue-600" data-testid="text-tracker-grand-sites">{tGrandSites}</td>
                                    <td className="py-2 px-3 text-center font-mono font-bold text-green-600" data-testid="text-tracker-grand-actual">{tGrandQ}</td>
                                    <td className="py-2 px-3 text-center font-mono font-bold text-amber-600" data-testid="text-tracker-grand-pdm-sites">{pdmSitesGrand || '-'}</td>
                                    <td className="py-2 px-3 text-center font-mono font-bold text-purple-600" data-testid="text-tracker-grand-dc">{tGrandCollectors}</td>
                                  </tr>
                                  <tr className="bg-emerald-100 dark:bg-emerald-950/40 border-t-2 border-emerald-400">
                                    <td className="py-2.5 px-3 font-bold text-emerald-800 dark:text-emerald-300">Total Sites (PDM/7)</td>
                                    <td colSpan={4} className="py-2.5 px-3 text-center">
                                      <span className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-300" data-testid="text-tracker-total-sites-pdm7">{actualSitesGrand}</span>
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })()}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <h4 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                            <Building2 className="h-3.5 w-3.5" /> Coverage by Hub
                          </h4>
                          <div className="border rounded-lg overflow-hidden">
                            <table className="w-full text-sm" data-testid="table-report-hub-coverage">
                              <thead>
                                <tr className="bg-muted/40 border-b">
                                  <th className="text-left py-2 px-3 font-medium text-xs">Hub</th>
                                  <th className="text-center py-2 px-3 font-medium text-xs">Sites</th>
                                  <th className="text-center py-2 px-3 font-medium text-xs">Questionnaires</th>
                                </tr>
                              </thead>
                              <tbody>
                                {computeReportSummary.hubBreakdown.map(h => (
                                  <tr key={h.hub} className="border-b hover:bg-muted/20">
                                    <td className="py-1.5 px-3 font-medium">{h.hub}</td>
                                    <td className="py-1.5 px-3 text-center font-mono text-blue-600">{h.sites}</td>
                                    <td className="py-1.5 px-3 text-center font-mono">{h.questionnaires}</td>
                                  </tr>
                                ))}
                                <tr className="bg-primary/10 font-semibold">
                                  <td className="py-1.5 px-3">Total</td>
                                  <td className="py-1.5 px-3 text-center font-mono text-blue-700">{computeReportSummary.hubBreakdown.reduce((s, h) => s + h.sites, 0)}</td>
                                  <td className="py-1.5 px-3 text-center font-mono">{computeReportSummary.hubBreakdown.reduce((s, h) => s + h.questionnaires, 0)}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                            <Activity className="h-3.5 w-3.5" /> Coverage by Activity
                          </h4>
                          <div className="border rounded-lg overflow-hidden">
                            <table className="w-full text-sm" data-testid="table-report-activity-coverage">
                              <thead>
                                <tr className="bg-muted/40 border-b">
                                  <th className="text-left py-2 px-3 font-medium text-xs">Activity</th>
                                  <th className="text-center py-2 px-3 font-medium text-xs">Questionnaires</th>
                                </tr>
                              </thead>
                              <tbody>
                                {computeReportSummary.activityBreakdown.map(a => (
                                  <tr key={a.activity} className="border-b hover:bg-muted/20">
                                    <td className="py-1.5 px-3 font-medium">{a.activity}</td>
                                    <td className="py-1.5 px-3 text-center font-mono">{a.count}</td>
                                  </tr>
                                ))}
                                <tr className="bg-primary/10 font-semibold">
                                  <td className="py-1.5 px-3">Total</td>
                                  <td className="py-1.5 px-3 text-center font-mono">{computeReportSummary.activityBreakdown.reduce((s, a) => s + a.count, 0)}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {computeReportSummary.qualityReport && (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base">
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                          Data Quality Report
                        </CardTitle>
                        <CardDescription>
                          Quality Score: <span className="font-bold text-primary" data-testid="text-quality-score">{computeReportSummary.qualityReport.qualityScore}%</span>
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="text-center p-3 bg-red-50 dark:bg-red-950/20 rounded-lg">
                            <div className="text-xl font-bold text-red-600">{computeReportSummary.qualityReport.duplicatesRemoved}</div>
                            <div className="text-xs text-muted-foreground">Duplicates Removed</div>
                          </div>
                          <div className="text-center p-3 bg-orange-50 dark:bg-orange-950/20 rounded-lg">
                            <div className="text-xl font-bold text-orange-600">{computeReportSummary.qualityReport.emptyRowsRemoved}</div>
                            <div className="text-xs text-muted-foreground">Empty Rows Removed</div>
                          </div>
                          <div className="text-center p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                            <div className="text-xl font-bold text-blue-600">{computeReportSummary.qualityReport.trimmedFields}</div>
                            <div className="text-xs text-muted-foreground">Fields Trimmed</div>
                          </div>
                          <div className="text-center p-3 bg-purple-50 dark:bg-purple-950/20 rounded-lg">
                            <div className="text-xl font-bold text-purple-600">{computeReportSummary.qualityReport.namesStandardized}</div>
                            <div className="text-xs text-muted-foreground">Names Standardized</div>
                          </div>
                        </div>

                        <div className="p-3 bg-muted/30 rounded-lg border-l-4 border-l-amber-500">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                            <p className="text-sm text-muted-foreground">
                              Data collectors should ensure consistent naming, avoid duplicate entries, and fill all required fields.
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {computeReportSummary.qualityReport && (
                    <Card>
                      <CardHeader className="pb-3">
                        <button
                          type="button"
                          className="w-full flex items-center justify-between text-left"
                          onClick={() => setReportIssuesExpanded(!reportIssuesExpanded)}
                          data-testid="button-toggle-report-issues"
                        >
                          <CardTitle className="flex items-center gap-2 text-base">
                            <FileSearch className="h-4 w-4 text-primary" />
                            Detailed Issues
                          </CardTitle>
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className="font-mono text-xs">
                              {computeReportSummary.qualityReport.duplicateGroups.length} dup groups
                            </Badge>
                            <Badge variant="outline" className="font-mono text-xs">
                              {computeReportSummary.qualityReport.nameChanges.length} name changes
                            </Badge>
                            {reportIssuesExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </div>
                        </button>
                      </CardHeader>
                      {reportIssuesExpanded && (
                        <CardContent className="space-y-4">
                          {computeReportSummary.qualityReport.duplicateGroups.length > 0 && (
                            <div>
                              <h4 className="text-sm font-semibold text-muted-foreground mb-2">Duplicate Groups</h4>
                              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                                {computeReportSummary.qualityReport.duplicateGroups.map((group, gi) => (
                                  <div key={gi} className="border rounded-lg p-2.5 text-sm">
                                    <div className="flex items-center gap-2 mb-1">
                                      <Badge variant="destructive" className="text-[10px] px-1.5">Group {gi + 1}</Badge>
                                      <span className="text-xs text-muted-foreground">{group.rows.length} rows</span>
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      Rows: {group.rows.map(r => r.index + 1).join(', ')}
                                    </div>
                                    <div className="text-xs mt-1">
                                      Key: <span className="font-mono text-muted-foreground">{group.key}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {computeReportSummary.qualityReport.nameChanges.length > 0 && (
                            <div>
                              <h4 className="text-sm font-semibold text-muted-foreground mb-2">Name Standardization Changes</h4>
                              <div className="border rounded-lg overflow-hidden max-h-[300px] overflow-y-auto">
                                <table className="w-full text-sm" data-testid="table-report-name-changes">
                                  <thead>
                                    <tr className="bg-muted/40 border-b sticky top-0">
                                      <th className="text-left py-2 px-3 font-medium text-xs">Row</th>
                                      <th className="text-left py-2 px-3 font-medium text-xs">Device ID</th>
                                      <th className="text-left py-2 px-3 font-medium text-xs">Old Name</th>
                                      <th className="text-left py-2 px-3 font-medium text-xs">New Name</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {computeReportSummary.qualityReport.nameChanges.slice(0, 100).map((nc, i) => (
                                      <tr key={i} className="border-b last:border-b-0">
                                        <td className="py-1.5 px-3 font-mono text-xs">{nc.index + 1}</td>
                                        <td className="py-1.5 px-3 font-mono text-xs text-muted-foreground">{nc.deviceId}</td>
                                        <td className="py-1.5 px-3 text-red-600 line-through">{nc.oldName}</td>
                                        <td className="py-1.5 px-3 text-green-600">{nc.newName}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              {computeReportSummary.qualityReport.nameChanges.length > 100 && (
                                <p className="text-xs text-muted-foreground mt-1">Showing first 100 of {computeReportSummary.qualityReport.nameChanges.length} changes</p>
                              )}
                            </div>
                          )}

                          <div className="p-3 bg-muted/30 rounded-lg">
                            <h4 className="text-sm font-semibold mb-2">Recommendations</h4>
                            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                              <li>Use standardized naming conventions for data collectors across all devices</li>
                              <li>Verify entries before submission to reduce duplicate records</li>
                              <li>Ensure all required fields are completed before saving questionnaires</li>
                              <li>Coordinate with supervisors to maintain consistent site naming</li>
                            </ul>
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  )}

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Users className="h-4 w-4 text-primary" />
                        Team Overview
                      </CardTitle>
                      <CardDescription>
                        {computeReportSummary.totalCollectors} Data Collectors across {computeReportSummary.totalSupervisors} Supervisors
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {computeReportSummary.teamOverview.map(team => (
                          <div key={team.supervisor} className="border rounded-lg">
                            <div className="flex items-center justify-between gap-2 p-3 bg-muted/30">
                              <div className="flex items-center gap-2">
                                <Users className="h-4 w-4 text-muted-foreground" />
                                <span className="font-semibold text-sm">{team.supervisor}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="font-mono text-xs">{team.teamSize} DCs</Badge>
                                <Badge variant="secondary" className="font-mono text-xs">{team.totalQ} Q</Badge>
                              </div>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm" data-testid={`table-team-${team.supervisor}`}>
                                <thead>
                                  <tr className="border-b bg-muted/10">
                                    <th className="text-left py-2 px-3 font-medium text-xs text-muted-foreground">Data Collector</th>
                                    <th className="text-left py-2 px-3 font-medium text-xs text-muted-foreground">Device ID</th>
                                    <th className="text-center py-2 px-3 font-medium text-xs text-muted-foreground">Questionnaires</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {team.collectors.map(dc => (
                                    <tr key={dc.name} className="border-b last:border-b-0 hover:bg-muted/20">
                                      <td className="py-1.5 px-3">{dc.name}</td>
                                      <td className="py-1.5 px-3 font-mono text-xs text-muted-foreground">{dc.deviceId}</td>
                                      <td className="py-1.5 px-3 text-center font-mono">{dc.count}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
              {!computeReportSummary && (
                <Card className="p-8 text-center">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">Upload data to generate the report</p>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}

      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Save className="h-5 w-5" /> Save Session</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="session-name">Session Name</Label>
              <Input
                id="session-name"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="e.g., November 2025 Tracker"
                className="mt-1"
                data-testid="input-session-name"
                onKeyDown={(e) => { if (e.key === 'Enter') saveSession(); }}
              />
            </div>
            <p className="text-xs text-muted-foreground">File: {fileName} | {data.length} rows</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>Cancel</Button>
            <Button onClick={saveSession} disabled={!saveName.trim()} data-testid="button-confirm-save">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showLoadDialog} onOpenChange={setShowLoadDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FolderOpen className="h-5 w-5" /> Saved Sessions</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
            {savedSessions.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No saved sessions yet</p>
            ) : (
              [...savedSessions].sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()).map(session => (
                <div key={session.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30 transition-colors" data-testid={`session-${session.id}`}>
                  <button type="button" className="flex-1 min-w-0 cursor-pointer text-left" onClick={() => loadSession(session)} data-testid={`button-session-select-${session.id}`}>
                    <div className="font-medium truncate">{session.name}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                      <Clock className="h-3 w-3" />
                      {format(new Date(session.savedAt), 'MMM d, yyyy h:mm a')}
                      <span className="text-muted-foreground/60">|</span>
                      <span>{session.rowCount} rows</span>
                      <span className="text-muted-foreground/60">|</span>
                      <span className="truncate">{session.fileName}</span>
                    </div>
                  </button>
                  <div className="flex items-center gap-2 ml-2">
                    <Button size="sm" variant="outline" onClick={() => loadSession(session)} data-testid={`button-load-${session.id}`}>Load</Button>
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => deleteSession(session.id)} data-testid={`button-delete-${session.id}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showCleanDialog} onOpenChange={setShowCleanDialog}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl md:max-w-3xl lg:max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10">
                <Sparkles className="h-4.5 w-4.5 text-primary" />
              </div>
              Data Cleaning Results
            </DialogTitle>
          </DialogHeader>
          {cleanResults && (() => {
            const totalIssues = customDupsRemoved + cleanResults.emptyRowsRemoved + cleanResults.trimmedFields + cleanResults.namesStandardized;
            const rowsRemoved = cleanResults.originalCount - customCleanedCount;
            const reductionPct = cleanResults.originalCount > 0 ? Math.round((rowsRemoved / cleanResults.originalCount) * 100) : 0;
            const hasChanges = totalIssues > 0;

            const sections = [
              { id: 'duplicates', icon: Trash2, iconColor: 'text-red-500 dark:text-red-400', bgColor: 'bg-red-50 dark:bg-red-950/30', borderColor: 'border-red-200 dark:border-red-900/50', label: 'Duplicate rows removed', sublabel: 'Rows with identical key fields', count: customDupsRemoved, badgeVariant: 'destructive' as const },
              { id: 'empty', icon: X, iconColor: 'text-orange-500 dark:text-orange-400', bgColor: 'bg-orange-50 dark:bg-orange-950/30', borderColor: 'border-orange-200 dark:border-orange-900/50', label: 'Empty rows removed', sublabel: 'Rows with no meaningful data', count: cleanResults.emptyRowsRemoved, badgeVariant: 'default' as const },
              { id: 'trimmed', icon: CheckCircle2, iconColor: 'text-blue-500 dark:text-blue-400', bgColor: 'bg-blue-50 dark:bg-blue-950/30', borderColor: 'border-blue-200 dark:border-blue-900/50', label: 'Fields trimmed', sublabel: 'Extra whitespace cleaned up', count: cleanResults.trimmedFields, badgeVariant: 'default' as const },
              { id: 'names', icon: Users, iconColor: 'text-purple-500 dark:text-purple-400', bgColor: 'bg-purple-50 dark:bg-purple-950/30', borderColor: 'border-purple-200 dark:border-purple-900/50', label: 'Collector names standardized', sublabel: 'Unified by device ID', count: cleanResults.namesStandardized, badgeVariant: 'default' as const },
            ];

            return (
              <div className="space-y-4 py-1 flex-1 overflow-y-auto pr-1 min-h-0">
                <div className="relative rounded-xl border bg-gradient-to-br from-muted/30 to-muted/60 p-4">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-3xl font-bold tracking-tight">{cleanResults.originalCount.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Original Rows</p>
                    </div>
                    <div className="flex flex-col items-center justify-center">
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      {hasChanges && <Badge variant="secondary" className="mt-1 text-[10px]">-{reductionPct}%</Badge>}
                    </div>
                    <div>
                      <p className="text-3xl font-bold tracking-tight text-green-600 dark:text-green-400">{customCleanedCount.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Cleaned Rows</p>
                    </div>
                  </div>
                  {hasChanges && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                        <span>Data reduction</span>
                        <span className="font-medium">{rowsRemoved.toLocaleString()} rows removed</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-500 transition-all duration-700" style={{ width: `${100 - reductionPct}%` }} />
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">Cleaning Operations</h4>
                  <div className="space-y-1.5">
                    {sections.map((item) => {
                      const ItemIcon = item.icon;
                      const isActive = item.count > 0;
                      const isExpanded = cleanExpandedSection === item.id;
                      return (
                        <div key={item.id}>
                          <button
                            type="button"
                            onClick={() => isActive && setCleanExpandedSection(isExpanded ? null : item.id)}
                            className={`w-full flex items-center gap-3 p-2.5 rounded-lg border transition-colors text-left ${
                              isActive ? `${item.bgColor} ${item.borderColor} cursor-pointer` : 'border-transparent bg-muted/30 cursor-default'
                            }`}
                            data-testid={`button-expand-${item.id}`}
                          >
                            <div className={`flex items-center justify-center h-8 w-8 rounded-md shrink-0 ${isActive ? item.bgColor : 'bg-muted'}`}>
                              <ItemIcon className={`h-4 w-4 ${isActive ? item.iconColor : 'text-muted-foreground/50'}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-medium ${!isActive ? 'text-muted-foreground' : ''}`}>{item.label}</p>
                              <p className="text-[11px] text-muted-foreground">{item.sublabel}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {isActive ? (
                                <Badge variant={item.badgeVariant}>{item.count.toLocaleString()}</Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground/50 font-medium px-2">0</span>
                              )}
                              {isActive && (
                                isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                              )}
                            </div>
                          </button>

                          {isExpanded && item.id === 'duplicates' && cleanResults.duplicateGroups.length > 0 && (
                            <div className="mt-1.5 ml-2 border-l-2 border-red-200 dark:border-red-900/50 pl-3 space-y-2 py-2 max-h-64 overflow-y-auto">
                              <p className="text-[11px] text-muted-foreground px-1">Select which rows to keep from each duplicate group. Unchecked rows will be removed.</p>
                              {cleanResults.duplicateGroups.slice(0, 50).map((group, gi) => {
                                const keptSet = duplicateKeepMap.get(gi) || new Set([0]);
                                return (
                                  <div key={gi} className="bg-muted/40 rounded-md p-2 space-y-1">
                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                      <Badge variant="outline" className="text-[10px]">Group {gi + 1}</Badge>
                                      <span className="text-[11px] text-muted-foreground">{group.rows.length} identical rows</span>
                                      <span className="text-[10px] text-muted-foreground ml-auto">Keeping {keptSet.size} of {group.rows.length}</span>
                                    </div>
                                    <div className="text-[11px] text-muted-foreground mb-1.5 px-1">
                                      <span className="font-medium">{group.rows[0]?.row.dataCollector || 'N/A'}</span>
                                      {group.rows[0]?.row.activitySite && <> | {group.rows[0].row.activitySite}</>}
                                      {group.rows[0]?.row.date && <> | {group.rows[0].row.date}</>}
                                    </div>
                                    {group.rows.map((r, ri) => {
                                      const isKept = keptSet.has(ri);
                                      return (
                                        <label
                                          key={ri}
                                          className={`flex items-center gap-2 text-[11px] px-1 py-1 rounded cursor-pointer transition-colors ${isKept ? 'bg-green-50 dark:bg-green-950/30' : 'bg-red-50/50 dark:bg-red-950/20'}`}
                                          data-testid={`label-dup-${gi}-${ri}`}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={isKept}
                                            onChange={() => {
                                              setDuplicateKeepMap(prev => {
                                                const next = new Map(prev);
                                                const currentSet = new Set(next.get(gi) || [0]);
                                                if (currentSet.has(ri)) {
                                                  if (currentSet.size > 1) currentSet.delete(ri);
                                                } else {
                                                  currentSet.add(ri);
                                                }
                                                next.set(gi, currentSet);
                                                return next;
                                              });
                                            }}
                                            className="h-3 w-3 rounded border-muted-foreground/40 shrink-0"
                                            data-testid={`checkbox-dup-${gi}-${ri}`}
                                          />
                                          <span className={isKept ? 'font-medium' : 'text-muted-foreground'}>
                                            Row {r.index + 1}
                                          </span>
                                          <span className="text-muted-foreground truncate">
                                            {r.row.hub && `${r.row.hub}`}{r.row.state && ` / ${r.row.state}`}{r.row.locality && ` / ${r.row.locality}`}
                                          </span>
                                          <span className="ml-auto text-[10px] shrink-0">
                                            {isKept ? <Badge variant="outline" className="text-[9px] h-4">Kept</Badge> : <Badge variant="secondary" className="text-[9px] h-4">Removed</Badge>}
                                          </span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                );
                              })}
                              {cleanResults.duplicateGroups.length > 50 && (
                                <p className="text-[11px] text-muted-foreground text-center py-1">
                                  Showing 50 of {cleanResults.duplicateGroups.length} duplicate groups
                                </p>
                              )}
                            </div>
                          )}

                          {isExpanded && item.id === 'empty' && cleanResults.emptyRows.length > 0 && (
                            <div className="mt-1.5 ml-2 border-l-2 border-orange-200 dark:border-orange-900/50 pl-3 space-y-1 py-2 max-h-48 overflow-y-auto">
                              {cleanResults.emptyRows.slice(0, 30).map((er, ei) => (
                                <div key={ei} className="flex items-center gap-2 text-[11px] bg-muted/40 rounded px-2 py-1">
                                  <X className="h-3 w-3 text-orange-400 shrink-0" />
                                  <span>Row {er.index + 1}</span>
                                  <span className="text-muted-foreground">- All key fields are empty</span>
                                </div>
                              ))}
                              {cleanResults.emptyRows.length > 30 && (
                                <p className="text-[11px] text-muted-foreground text-center py-1">
                                  Showing 30 of {cleanResults.emptyRows.length} empty rows
                                </p>
                              )}
                            </div>
                          )}

                          {isExpanded && item.id === 'trimmed' && cleanResults.trimmedDetails.length > 0 && (
                            <div className="mt-1.5 ml-2 border-l-2 border-blue-200 dark:border-blue-900/50 pl-3 space-y-1 py-2 max-h-48 overflow-y-auto">
                              {cleanResults.trimmedDetails.slice(0, 30).map((td, ti) => (
                                <div key={ti} className="text-[11px] bg-muted/40 rounded px-2 py-1.5">
                                  <div className="flex items-center gap-2">
                                    <CheckCircle2 className="h-3 w-3 text-blue-400 shrink-0" />
                                    <span>Row {td.index + 1}</span>
                                    <Badge variant="outline" className="text-[9px] h-4">{td.field}</Badge>
                                  </div>
                                  <div className="mt-1 flex gap-2 items-start pl-5">
                                    <span className="text-red-500 dark:text-red-400 line-through truncate max-w-[45%]">&ldquo;{td.before}&rdquo;</span>
                                    <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                                    <span className="text-green-600 dark:text-green-400 truncate max-w-[45%]">&ldquo;{td.after}&rdquo;</span>
                                  </div>
                                </div>
                              ))}
                              {cleanResults.trimmedDetails.length > 30 && (
                                <p className="text-[11px] text-muted-foreground text-center py-1">
                                  Showing 30 of {cleanResults.trimmedDetails.length} trimmed fields
                                </p>
                              )}
                            </div>
                          )}

                          {isExpanded && item.id === 'names' && cleanResults.nameChanges.length > 0 && (
                            <div className="mt-1.5 ml-2 border-l-2 border-purple-200 dark:border-purple-900/50 pl-3 space-y-1 py-2 max-h-48 overflow-y-auto">
                              {cleanResults.nameChanges.slice(0, 30).map((nc, ni) => (
                                <div key={ni} className="text-[11px] bg-muted/40 rounded px-2 py-1.5">
                                  <div className="flex items-center gap-2">
                                    <Users className="h-3 w-3 text-purple-400 shrink-0" />
                                    <span>Row {nc.index + 1}</span>
                                    <Badge variant="outline" className="text-[9px] h-4 truncate max-w-[120px]">{nc.deviceId}</Badge>
                                  </div>
                                  <div className="mt-1 flex gap-2 items-center pl-5">
                                    <span className="text-red-500 dark:text-red-400 line-through truncate max-w-[40%]">{nc.oldName}</span>
                                    <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                                    <span className="text-green-600 dark:text-green-400 truncate max-w-[40%]">{nc.newName}</span>
                                  </div>
                                </div>
                              ))}
                              {cleanResults.nameChanges.length > 30 && (
                                <p className="text-[11px] text-muted-foreground text-center py-1">
                                  Showing 30 of {cleanResults.nameChanges.length} name changes
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {!hasChanges && (
                  <div className="flex items-center gap-3 p-4 rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30">
                    <div className="flex items-center justify-center h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/50 shrink-0">
                      <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-green-800 dark:text-green-300">Your data is already clean</p>
                      <p className="text-xs text-green-700/70 dark:text-green-400/60 mt-0.5">No duplicates, empty rows, or inconsistencies were found.</p>
                    </div>
                  </div>
                )}

                {hasChanges && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50/80 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50">
                    <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <p className="text-xs text-amber-800 dark:text-amber-300">
                      Found <strong>{totalIssues.toLocaleString()}</strong> issues across {cleanResults.originalCount.toLocaleString()} rows. Click any category above to inspect details.
                    </p>
                  </div>
                )}
              </div>
            );
          })()}
          <DialogFooter className="shrink-0 flex flex-row items-center gap-2 pt-2 border-t">
            <Button variant="outline" onClick={() => setShowCleanDialog(false)} data-testid="button-clean-cancel">Close</Button>
            {cleanResults && (cleanResults.duplicatesRemoved > 0 || cleanResults.emptyRowsRemoved > 0 || cleanResults.trimmedFields > 0 || cleanResults.namesStandardized > 0) && (
              <div className="flex gap-2 flex-1 justify-end">
                <Button variant="outline" className="gap-1.5" onClick={downloadReviewExcel} data-testid="button-download-review">
                  <FileSearch className="h-4 w-4" />
                  <span className="hidden sm:inline">Download</span> Review
                </Button>
                <Button variant="outline" className="gap-1.5" onClick={downloadCleanedExcel} data-testid="button-download-cleaned">
                  <Download className="h-4 w-4" />
                  <span className="hidden sm:inline">Download</span> Cleaned
                </Button>
                <Button className="gap-1.5" onClick={applyCleanedData} data-testid="button-apply-cleaned">
                  <CheckCircle2 className="h-4 w-4" />
                  Apply
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              <Mail className="h-5 w-5" />
              Send Email
              {emailHighPriority && <Badge variant="destructive" className="text-xs gap-1"><AlertTriangle className="h-3 w-3" />High Priority</Badge>}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="mb-2 block">To</Label>
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2 mb-2">
                  {emailProfilesLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-1">
                      <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      Loading users...
                    </div>
                  ) : emailUsers.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-1">No users found. You can type email addresses manually below.</div>
                  ) : (
                    ['FOM', 'Admin', 'Supervisor', 'Super Admin'].map(role => {
                      const count = emailUsers.filter(u => u.role === role).length;
                      const allAdded = count > 0 && emailUsers.filter(u => u.role === role).every(u => emailToUsers.some(eu => eu.email === u.email));
                      return (
                        <Button key={role} size="sm" variant={allAdded ? 'default' : 'outline'} className="gap-1.5 text-xs" onClick={() => addEmailToGroup(role)} disabled={count === 0 || allAdded} data-testid={`button-add-group-${role.toLowerCase().replace(/\s+/g, '-')}`}>
                          <UserPlus className="h-3 w-3" />
                          {role} {count > 0 ? `(${count})` : '(0)'}
                          {allAdded && <CheckCircle2 className="h-3 w-3" />}
                        </Button>
                      );
                    })
                  )}
                </div>

                <div className="relative">
                  <div className="flex gap-2">
                    <Input
                      value={emailToInput}
                      onChange={(e) => { setEmailToInput(e.target.value); setEmailToSearchOpen(true); }}
                      onFocus={() => setEmailToSearchOpen(true)}
                      onBlur={() => setTimeout(() => setEmailToSearchOpen(false), 200)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEmailToManual(); } }}
                      placeholder="Search users or type email..."
                      className="flex-1"
                      data-testid="input-email-to"
                    />
                  </div>
                  {emailToSearchOpen && (emailToFilteredUsers.length > 0 || (emailToInput.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailToInput.trim()))) && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-md max-h-[280px] overflow-y-auto">
                      {Object.entries(emailToGroupedUsers).map(([role, users]) => (
                        <div key={role}>
                          <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50 sticky top-0">{role} ({users.length})</div>
                          {users.map(u => {
                            const isAdded = emailToUsers.some(eu => eu.email === u.email);
                            return (
                              <button
                                key={u.id}
                                type="button"
                                className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex items-center justify-between gap-2 ${isAdded ? 'opacity-50' : ''}`}
                                onMouseDown={(e) => { e.preventDefault(); if (!isAdded) addEmailToUser({ ...u, isSystemUser: true }); }}
                                disabled={isAdded}
                                data-testid={`button-select-user-${u.id}`}
                              >
                                <div className="min-w-0">
                                  <div className="font-medium truncate">{u.name}</div>
                                  <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                                </div>
                                {isAdded && <Badge variant="secondary" className="text-xs shrink-0">Added</Badge>}
                              </button>
                            );
                          })}
                        </div>
                      ))}
                      {emailToInput.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailToInput.trim()) && (
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 border-t flex items-center gap-2 text-primary"
                          onMouseDown={(e) => { e.preventDefault(); addEmailToManual(); }}
                          data-testid="button-add-manual-email"
                        >
                          <Plus className="h-3 w-3" />
                          Add "{emailToInput.trim()}" as external recipient
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {emailToUsers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {emailToUsers.map(u => (
                      <Badge key={u.email} variant={u.isSystemUser ? 'default' : 'secondary'} className="text-xs gap-1 pr-1" data-testid={`badge-to-${u.email}`}>
                        {u.name !== u.email ? u.name : u.email}
                        {u.role && <span className="opacity-70">({u.role})</span>}
                        <button type="button" className="ml-0.5 hover:text-destructive" onClick={() => removeEmailToUser(u.email)} data-testid={`button-remove-to-${u.email}`}>
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                    {emailToUsers.length > 1 && (
                      <Button size="sm" variant="ghost" className="h-6 text-xs text-muted-foreground" onClick={() => setEmailToUsers([])} data-testid="button-clear-all-to">
                        Clear all
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="email-subject">Subject</Label>
              <Input
                id="email-subject"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                className="mt-1"
                data-testid="input-email-subject"
              />
            </div>

            <div>
              <Label className="mb-2 block">CC</Label>
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2 mb-2">
                  {emailProfilesLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-1">
                      <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      Loading users...
                    </div>
                  ) : emailUsers.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-1">No users found. You can type email addresses manually below.</div>
                  ) : (
                    ['FOM', 'Admin', 'Supervisor', 'Super Admin'].map(role => {
                      const count = emailUsers.filter(u => u.role === role).length;
                      const allAdded = count > 0 && emailUsers.filter(u => u.role === role).every(u => emailCcUsers.some(cu => cu.email === u.email));
                      return (
                        <Button key={role} size="sm" variant={allAdded ? 'default' : 'outline'} className="gap-1.5 text-xs" onClick={() => addEmailCcGroup(role)} disabled={count === 0 || allAdded} data-testid={`button-cc-group-${role.toLowerCase().replace(/\s+/g, '-')}`}>
                          <UserPlus className="h-3 w-3" />
                          {role} {count > 0 ? `(${count})` : '(0)'}
                          {allAdded && <CheckCircle2 className="h-3 w-3" />}
                        </Button>
                      );
                    })
                  )}
                </div>

                <div className="relative">
                  <div className="flex gap-2">
                    <Input
                      value={emailCcInput}
                      onChange={(e) => { setEmailCcInput(e.target.value); setEmailCcSearchOpen(true); }}
                      onFocus={() => setEmailCcSearchOpen(true)}
                      onBlur={() => setTimeout(() => setEmailCcSearchOpen(false), 200)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEmailCcManual(); } }}
                      placeholder="Search users or type email for CC..."
                      className="flex-1"
                      data-testid="input-email-cc"
                    />
                  </div>
                  {emailCcSearchOpen && (emailCcFilteredUsers.length > 0 || (emailCcInput.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailCcInput.trim()))) && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-md max-h-[200px] overflow-y-auto">
                      {Object.entries(emailCcGroupedUsers).map(([role, users]) => (
                        <div key={role}>
                          <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50 sticky top-0">{role} ({users.length})</div>
                          {users.map(u => {
                            const isAdded = emailCcUsers.some(cu => cu.email === u.email);
                            return (
                              <button
                                key={u.id}
                                type="button"
                                className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex items-center justify-between gap-2 ${isAdded ? 'opacity-50' : ''}`}
                                onMouseDown={(e) => { e.preventDefault(); if (!isAdded) addEmailCcUser({ ...u, isSystemUser: true }); }}
                                disabled={isAdded}
                                data-testid={`button-cc-select-user-${u.id}`}
                              >
                                <div className="min-w-0">
                                  <div className="font-medium truncate">{u.name}</div>
                                  <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                                </div>
                                {isAdded && <Badge variant="secondary" className="text-xs shrink-0">Added</Badge>}
                              </button>
                            );
                          })}
                        </div>
                      ))}
                      {emailCcInput.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailCcInput.trim()) && (
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 border-t flex items-center gap-2 text-primary"
                          onMouseDown={(e) => { e.preventDefault(); addEmailCcManual(); }}
                          data-testid="button-add-manual-cc-email"
                        >
                          <Plus className="h-3 w-3" />
                          Add "{emailCcInput.trim()}" as external CC
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {emailCcUsers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {emailCcUsers.map(u => (
                      <Badge key={u.email} variant={u.isSystemUser ? 'default' : 'secondary'} className="text-xs gap-1 pr-1" data-testid={`badge-cc-${u.email}`}>
                        {u.name !== u.email ? u.name : u.email}
                        {u.role && <span className="opacity-70">({u.role})</span>}
                        <button type="button" className="ml-0.5 hover:text-destructive" onClick={() => removeEmailCcUser(u.email)} data-testid={`button-remove-cc-${u.email}`}>
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                    {emailCcUsers.length > 1 && (
                      <Button size="sm" variant="ghost" className="h-6 text-xs text-muted-foreground" onClick={() => setEmailCcUsers([])} data-testid="button-clear-all-cc">
                        Clear all
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              {emailType === 'report' ? (
                <div className="flex items-center gap-2">
                  <Label className="mb-0">Attachments:</Label>
                  <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <Checkbox checked={emailAttachReview} onCheckedChange={(checked) => setEmailAttachReview(!!checked)} data-testid="checkbox-attach-review" />
                    Review File
                  </label>
                  <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <Checkbox checked={emailAttachCleaned} onCheckedChange={(checked) => setEmailAttachCleaned(!!checked)} data-testid="checkbox-attach-cleaned" />
                    Cleaned File
                  </label>
                  <div className="flex items-center gap-1 ml-2 text-xs text-muted-foreground">
                    <FileSpreadsheet className="h-3 w-3" />Excel + <FileText className="h-3 w-3" />PDF
                  </div>
                </div>
              ) : emailType === 'analytics_excel' ? (
                <div className="flex items-center gap-2">
                  <Label className="mb-0">Attachments:</Label>
                  <Badge variant="secondary" className="text-xs gap-1"><FileSpreadsheet className="h-3 w-3" />Analytics Excel (All Tabs)</Badge>
                </div>
              ) : emailType === 'analytics_pdf' ? (
                <div className="flex items-center gap-2">
                  <Label className="mb-0">Attachments:</Label>
                  <Badge variant="secondary" className="text-xs gap-1"><FileText className="h-3 w-3" />Full PDF (with Collector Details)</Badge>
                </div>
              ) : emailType === 'tracker_excel' ? (
                <div className="flex items-center gap-2">
                  <Label className="mb-0">Attachments:</Label>
                  <Badge variant="secondary" className="text-xs gap-1"><FileSpreadsheet className="h-3 w-3" />Tracker Excel (All Sheets)</Badge>
                </div>
              ) : emailType === 'tracker_all' ? (
                <div className="flex flex-wrap items-center gap-3">
                  <Label className="mb-0">Format:</Label>
                  <div className="flex items-center gap-1 rounded-md border p-0.5 bg-muted/40">
                    <button
                      type="button"
                      onClick={() => setTrackerAllFormat('excel')}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${trackerAllFormat === 'excel' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                      data-testid="button-tracker-all-format-excel"
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5" />
                      Excel
                    </button>
                    <button
                      type="button"
                      onClick={() => setTrackerAllFormat('csv')}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${trackerAllFormat === 'csv' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                      data-testid="button-tracker-all-format-csv"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      CSV
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {trackerAllFormat === 'excel' ? (
                      <>
                        <Badge variant="secondary" className="text-xs gap-1"><FileSpreadsheet className="h-3 w-3" />Summary sheet</Badge>
                        <Badge variant="secondary" className="text-xs gap-1"><FileSpreadsheet className="h-3 w-3" />Per-Hub sheets</Badge>
                        <Badge variant="secondary" className="text-xs gap-1"><FileSpreadsheet className="h-3 w-3" />Per-State sheets</Badge>
                        <Badge variant="secondary" className="text-xs gap-1"><FileSpreadsheet className="h-3 w-3" />Enumerators sheet</Badge>
                      </>
                    ) : (
                      <Badge variant="secondary" className="text-xs gap-1"><FileText className="h-3 w-3" />Combined CSV (all sections)</Badge>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Label className="mb-0">Attachments:</Label>
                  <Badge variant="secondary" className="text-xs gap-1"><FileSpreadsheet className="h-3 w-3" />Coverage Tracker Excel</Badge>
                  <Badge variant="secondary" className="text-xs gap-1"><FileText className="h-3 w-3" />Coverage Tracker PDF</Badge>
                </div>
              )}
              <div className="flex items-center gap-2 ml-auto">
                <Label htmlFor="email-priority" className="mb-0 text-sm flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  High Priority
                </Label>
                <Switch id="email-priority" checked={emailHighPriority} onCheckedChange={setEmailHighPriority} data-testid="switch-email-priority" />
              </div>
            </div>

            <div>
              <Label className="mb-2 block">Email Preview</Label>
              <Card className="p-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {emailHighPriority && <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />}
                    <div className="text-sm font-semibold" data-testid="text-email-preview-subject">{emailSubject}</div>
                    {emailHighPriority && <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">High Priority</Badge>}
                  </div>
                  {emailToUsers.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      To: {emailToUsers.map(u => u.name !== u.email ? `${u.name} <${u.email}>` : u.email).join(', ')}
                    </div>
                  )}
                  {getEmailCcList.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      CC: {getEmailCcList.map(u => `${u.name} <${u.email}>`).join(', ')}
                    </div>
                  )}
                  <div className="border-t pt-2">
                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed max-h-[200px] overflow-y-auto" data-testid="text-email-preview-body">
                      {getEmailBody}
                    </pre>
                  </div>
                </div>
              </Card>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEmailDialog(false)} data-testid="button-email-cancel">
              Cancel
            </Button>
            <Button onClick={sendEmailReport} disabled={emailSending || emailToUsers.length === 0} className="gap-1.5" data-testid="button-email-send">
              {emailSending ? (
                <>
                  <span className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full inline-block" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Send {emailToUsers.length > 1 ? `to ${emailToUsers.length} recipients` : 'Email'}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Payment Parameters Dialog ─────────────────────────── */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="max-w-[480px] w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <Banknote className="h-4 w-4 text-primary shrink-0" />
              Payment Parameters
            </DialogTitle>
            <p className="text-xs text-muted-foreground">Set the rates before exporting</p>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Cost per site — border-joined addon group */}
            <div className="space-y-1.5">
              <Label htmlFor="pay-cost" className="text-sm font-medium">Cost per Site Visit</Label>
              <div className="flex rounded-md border border-input overflow-hidden focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-0">
                <span className="flex items-center px-3 bg-muted text-sm font-semibold text-muted-foreground border-r border-input select-none shrink-0">$</span>
                <input
                  id="pay-cost"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={paymentCostPerSite}
                  onChange={e => setPaymentCostPerSite(e.target.value)}
                  className="flex-1 min-w-0 px-3 py-2 text-sm bg-background text-foreground outline-none"
                  data-testid="input-payment-cost-usd"
                />
                <span className="flex items-center px-3 bg-muted text-xs font-medium text-muted-foreground border-l border-input select-none shrink-0">USD</span>
              </div>
            </div>

            {/* Exchange rate — border-joined addon group */}
            <div className="space-y-1.5">
              <Label htmlFor="pay-rate" className="text-sm font-medium">Exchange Rate</Label>
              <div className="flex rounded-md border border-input overflow-hidden focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-0">
                <input
                  id="pay-rate"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="e.g. 4100"
                  value={paymentExchangeRate}
                  onChange={e => setPaymentExchangeRate(e.target.value)}
                  className="flex-1 min-w-0 px-3 py-2 text-sm bg-background text-foreground outline-none"
                  data-testid="input-payment-exchange-rate"
                />
                <span className="flex items-center px-3 bg-muted text-xs font-medium text-muted-foreground border-l border-input select-none shrink-0 whitespace-nowrap">SDG / 1 USD</span>
              </div>
            </div>

            {/* Live preview */}
            {Number(paymentCostPerSite) > 0 && Number(paymentExchangeRate) > 0 && (
              <div className="rounded-lg border bg-primary/5 dark:bg-primary/10 p-3 space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">Live Preview</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md bg-background border px-3 py-2">
                    <p className="text-[10px] text-muted-foreground mb-0.5">Per site (USD)</p>
                    <p className="text-sm font-bold text-foreground">${Number(paymentCostPerSite).toFixed(2)}</p>
                  </div>
                  <div className="rounded-md bg-background border px-3 py-2">
                    <p className="text-[10px] text-muted-foreground mb-0.5">Per site (SDG)</p>
                    <p className="text-sm font-bold text-foreground">
                      {Math.round(Number(paymentCostPerSite) * Number(paymentExchangeRate)).toLocaleString()}
                    </p>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground text-center">
                  1 USD = {Number(paymentExchangeRate).toLocaleString()} SDG
                </p>
              </div>
            )}
          </div>

          {/* Footer — plain div so layout is fully controlled (DialogFooter forces sm:flex-row) */}
          <div className="flex flex-col gap-2 pt-2">
            {paymentExportType === 'csvEnum' && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => { setPaymentDialogOpen(false); exportCsvEnumTableFormattedExcel(0, 0); }}
                data-testid="button-payment-export-no-payment"
              >
                Export without Payment Sheet
              </Button>
            )}
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setPaymentDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                className="flex-[2]"
                disabled={!paymentCostPerSite || !paymentExchangeRate || Number(paymentCostPerSite) <= 0 || Number(paymentExchangeRate) <= 0}
                onClick={() => {
                  const cost = parseFloat(paymentCostPerSite) || 0;
                  const rate = parseFloat(paymentExchangeRate) || 0;
                  setPaymentDialogOpen(false);
                  if (paymentExportType === 'standard') {
                    exportEnumeratorTrackerExcel(paymentPendingRows, `Enumerator_Tracker_${format(new Date(), 'yyyy-MM-dd')}.xlsx`, cost, rate);
                  } else if (paymentExportType === 'formatted') {
                    exportEnumeratorTrackerFormattedExcel(paymentPendingRows, `Enumerator_Tracker_Formatted_${format(new Date(), 'yyyy-MM-dd')}.xlsx`, cost, rate);
                  } else if (paymentExportType === 'csvEnum') {
                    exportCsvEnumTableFormattedExcel(cost, rate);
                  } else if (paymentExportType === 'perHubExcel') {
                    exportTrackerPerHubExcel(cost, rate);
                  } else if (paymentExportType === 'perHubFormatted') {
                    exportTrackerPerHubFormattedExcel(cost, rate);
                  }
                }}
                data-testid="button-payment-export-confirm"
              >
                Export with Payment
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default QuestionnaireAnalytics;
