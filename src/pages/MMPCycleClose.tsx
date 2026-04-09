import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppContext } from '@/context/AppContext';
import { useMMP } from '@/context/mmp/MMPContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { NotificationTriggerService } from '@/services/NotificationTriggerService';
import { EmailNotificationService } from '@/services/email-notification.service';
import { logMMPAudit } from '@/services/mmpAudit.service';
import { checkAndSendCycleReminders } from '@/services/cycleReminderService';
import { useCycleCloseReadiness } from '@/hooks/useCycleCloseReadiness';
import { CloseReadinessChecklist } from '@/components/close/CloseReadinessChecklist';
import { ReconciliationSummary } from '@/components/close/ReconciliationSummary';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Progress } from '@/components/ui/progress';
import {
  AlertTriangle, CheckCircle2, Clock, XCircle, MapPin,
  ArrowRight, FileText, BarChart3, Filter, Download,
  ChevronDown, ChevronUp, Search, RefreshCw, FileSpreadsheet,
  Bell, TrendingUp, TrendingDown, Minus, Star, Shield, ShieldAlert,
  Activity, Target, Layers, SortAsc, SortDesc,
  BookOpen, RotateCcw, HelpCircle
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';
import { CycleMMPCard } from '@/components/cycle/CycleMMPCard';
import { CycleCoveragePredictor } from '@/components/cycle/CycleCoveragePredictor';
import { CycleReportsTab } from '@/components/cycle/CycleReportsTab';
import { CycleComparisonTab } from '@/components/cycle/CycleComparisonTab';
import { CycleScorecardTab } from '@/components/cycle/CycleScorecardTab';

const NOT_COVERED_REASONS = [
  { value: 'not_distributed', label: 'Not Distributed', labelAr: 'لم يتم التوزيع' },
  { value: 'cp_not_confirmed', label: 'CP Not Confirmed / Switched Off', labelAr: 'لم يتم تأكيد CP / مغلق' },
  { value: 'security_concerns', label: 'Security Concerns', labelAr: 'مخاوف أمنية' },
  { value: 'access_denied', label: 'Access Denied / Area Inaccessible', labelAr: 'الوصول مرفوض / المنطقة غير متاحة' },
  { value: 'staff_unavailable', label: 'Staff Unavailable', labelAr: 'الموظفون غير متاحين' },
  { value: 'weather_disaster', label: 'Weather / Natural Disaster', labelAr: 'الطقس / كارثة طبيعية' },
  { value: 'budget_constraints', label: 'Budget Constraints', labelAr: 'قيود الميزانية' },
  { value: 'time_constraints', label: 'Time Constraints', labelAr: 'قيود الوقت' },
  { value: 'duplicate_site', label: 'Duplicate Site', labelAr: 'موقع مكرر' },
  { value: 'other', label: 'Other (specify)', labelAr: 'أخرى (حدد)' },
] as const;

type NotCoveredReason = typeof NOT_COVERED_REASONS[number]['value'];

interface UncoveredSite {
  id: string;
  site_name: string;
  site_code: string;
  state: string;
  locality: string;
  status: string;
  mmp_id: string;
  mmp_name?: string;
  hub?: string;
  not_covered_reason: NotCoveredReason | null;
  not_covered_reason_other: string | null;
  not_covered_at: string | null;
  not_covered_by: string | null;
}

interface CycleStats {
  totalSites: number;
  completedSites: number;
  uncoveredSites: number;
  reasonedSites: number;
  pendingReasonSites: number;
  coverageRate: number;
}

interface ClosedCycleRecord {
  id: string;
  name: string;
  month: number | null;
  year: number | null;
  region: string | null;
  cycle_status: string;
  cycle_closed_at: string | null;
  totalSites: number;
  completedSites: number;
  uncoveredSites: number;
  reasonBreakdown?: Record<string, number>;
}

type CloseScope = 'full' | 'hub' | 'state' | 'activity';

interface CycleCloseRecord {
  id: string;
  scope: CloseScope;
  scopeValue: string;
  closedAt: string;
  closedBy: string;
  closedByName: string;
  siteCount: number;
  status: 'closing' | 'pending_approval' | 'closed';
}

interface MmpScopeOptions {
  hubs: string[];
  states: string[];
  activities: string[];
}

interface FollowUpRecord {
  id: string;
  siteId: string;
  siteName: string;
  reason: string;
  suggestedAction: string;
  createdAt: string;
  mmpName?: string;
}

const fetchAdminFomSuperAdminRecipients = async () => {
  const { data: recipients } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, hub_id')
    .in('role', ['admin', 'Admin', 'super_admin', 'Super Admin', 'superAdmin', 'SuperAdmin', 'fom', 'Field Operation Manager (FOM)'])
    .eq('status', 'approved');

  return (recipients || []).filter((r: any) => r.email);
};

const getSuperAdminEmails = async (): Promise<string[]> => {
  const { data: admins } = await supabase
    .from('profiles')
    .select('email')
    .in('role', ['super_admin', 'Super Admin', 'superAdmin', 'SuperAdmin'])
    .eq('status', 'approved');
  return (admins || []).filter((a: any) => a.email).map((a: any) => a.email);
};

const HIGH_PRIORITY_REASONS = ['security_concerns', 'access_denied', 'staff_unavailable'];

const FOLLOW_UP_ACTIONS: Record<string, string> = {
  security_concerns: 'Coordinate with security team and local authorities before next cycle visit',
  access_denied: 'Engage community leaders and obtain required access permits for next cycle',
  staff_unavailable: 'Pre-assign backup staff and confirm availability before next cycle starts',
};

const MMPCycleClose = () => {
  const { currentUser } = useAppContext();
  const { mmpFiles, refreshMMPFiles } = useMMP();
  const { hasAnyRole } = useAuthorization();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [uncoveredSites, setUncoveredSites] = useState<UncoveredSite[]>([]);
  const [selectedSites, setSelectedSites] = useState<Set<string>>(new Set());
  const [bulkReason, setBulkReason] = useState<NotCoveredReason | ''>('');
  const [bulkOtherText, setBulkOtherText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterHub, setFilterHub] = useState<string>('all');
  const [filterReason, setFilterReason] = useState<string>('all');
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'active');
  
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);
  const [closedCycles, setClosedCycles] = useState<ClosedCycleRecord[]>([]);
  const [expandedCycle, setExpandedCycle] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [closingCycle, setClosingCycle] = useState(false);
  const [finalizingCycle, setFinalizingCycle] = useState(false);
  const [selectedMmpId, setSelectedMmpId] = useState<string>('all');
  const [siteVisitCounts, setSiteVisitCounts] = useState<Record<string, { total: number; completed: number; pending: number; assigned: number; dispatched: number }>>({});
  const followUps = useMemo<FollowUpRecord[]>(() => {
    return uncoveredSites
      .filter(s => s.not_covered_reason && HIGH_PRIORITY_REASONS.includes(s.not_covered_reason))
      .map(s => ({
        id: s.id,
        siteId: s.id,
        siteName: s.site_name,
        reason: s.not_covered_reason!,
        suggestedAction: FOLLOW_UP_ACTIONS[s.not_covered_reason!] || 'Review and address before next cycle',
        createdAt: s.not_covered_at || new Date().toISOString(),
        mmpName: s.mmp_name,
      }));
  }, [uncoveredSites]);
  const [comparisonCycle1, setComparisonCycle1] = useState<string>('');
  const [comparisonCycle2, setComparisonCycle2] = useState<string>('');
  const [checklistMmpId, setChecklistMmpId] = useState<string | null>(null);
  const cycleReadiness = useCycleCloseReadiness(checklistMmpId);
  const [reconciliationAcknowledged, setReconciliationAcknowledged] = useState(false);

  // Reset reconciliation acknowledgment whenever the operator switches to a different cycle
  useEffect(() => {
    setReconciliationAcknowledged(false);
  }, [checklistMmpId]);
  const [financeOverrideDialog, setFinanceOverrideDialog] = useState<{
    mmpId: string;
    issues: string[];
    action: 'finalize' | 'approve';
  } | null>(null);
  const [financeOverrideJustification, setFinanceOverrideJustification] = useState('');
  const [pendingScopedClose, setPendingScopedClose] = useState<{ scope: CloseScope; scopeValue: string } | null>(null);
  const [qualityData, setQualityData] = useState<{ hub: string; avgScore: number; count: number }[]>([]);
  const [activeHubFilter, setActiveHubFilter] = useState<string>('all');
  const [activeSort, setActiveSort] = useState<'name' | 'coverage' | 'status'>('status');
  const [activeSortDir, setActiveSortDir] = useState<'asc' | 'desc'>('desc');
  const [archiveSearch, setArchiveSearch] = useState('');
  const [guideOpen, setGuideOpen] = useState(false);
  const [mmpScopeOptions, setMmpScopeOptions] = useState<Record<string, MmpScopeOptions>>({});

  const isAdmin = hasAnyRole(['admin', 'Admin', 'super_admin', 'Super Admin']);
  const isSuperAdmin = hasAnyRole(['super_admin', 'Super Admin']);
  const isSupervisor = hasAnyRole(['Supervisor', 'supervisor']);
  const isFOM = hasAnyRole(['fom', 'Field Operation Manager (FOM)']);
  const canManageCycle = isAdmin;
  const canAssignReasons = isAdmin || isSupervisor || isFOM;

  const [userHubName, setUserHubName] = useState<string>('');

  useEffect(() => {
    if (isSupervisor && currentUser?.hubId) {
      const hubIds = [currentUser.hubId];
      if ((currentUser as any)?.secondaryHubId) {
        hubIds.push((currentUser as any).secondaryHubId);
      }

      supabase.from('hubs').select('name').in('id', hubIds)
        .then(({ data }) => {
          if (data && data.length > 0) {
            const names = data.map((h: any) => h.name).filter(Boolean);
            const displayName = names.join(' & ');
            setUserHubName(displayName);
            setFilterHub(displayName);
          }
        });
    }
  }, [isSupervisor, currentUser?.hubId, (currentUser as any)?.secondaryHubId]);

  const activeMmps = useMemo(() => {
    return (mmpFiles || []).filter(m => {
      const cycleStatus = (m as any).cycle_status || 'active';
      return cycleStatus === 'active' || cycleStatus === 'closing' || cycleStatus === 'pending_approval';
    });
  }, [mmpFiles]);

  const closingMmps = useMemo(() => {
    return (mmpFiles || []).filter(m => (m as any).cycle_status === 'closing');
  }, [mmpFiles]);

  const fetchUncoveredSites = useCallback(async () => {
    setLoading(true);
    try {
      const mmpIds = closingMmps.length > 0
        ? closingMmps.map(m => m.id)
        : activeMmps.map(m => m.id);

      if (mmpIds.length === 0) {
        setUncoveredSites([]);
        setLoading(false);
        return;
      }

      let query = supabase
        .from('site_visits')
        .select('id, site_name, site_code, state, locality, status, mmp_id, not_covered_flag, not_covered_reason, not_covered_reason_other, not_covered_at, not_covered_by')
        .in('mmp_id', mmpIds);

      if (closingMmps.length > 0) {
        query = query.eq('not_covered_flag', true);
      } else {
        query = query.in('status', ['pending', 'assigned', 'dispatched', 'accepted']);
      }

      const { data, error } = await query;

      if (error) throw error;

      const sites: UncoveredSite[] = (data || []).map(s => {
        const mmp = mmpFiles?.find(m => m.id === s.mmp_id);
        return {
          id: s.id,
          site_name: s.site_name,
          site_code: s.site_code || '',
          state: s.state || '',
          locality: s.locality || '',
          status: s.status,
          mmp_id: s.mmp_id || '',
          mmp_name: mmp?.name || 'Unknown MMP',
          hub: mmp?.hub || mmp?.region || '',
          not_covered_reason: s.not_covered_reason as NotCoveredReason | null,
          not_covered_reason_other: s.not_covered_reason_other,
          not_covered_at: s.not_covered_at,
          not_covered_by: s.not_covered_by,
        };
      });

      setUncoveredSites(sites);
    } catch (err) {
      console.error('Error fetching uncovered sites:', err);
      toast({ title: 'Error', description: 'Failed to load uncovered sites', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [closingMmps, activeMmps, mmpFiles, toast]);

  const fetchClosedCycles = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('mmp_files')
        .select('id, name, month, hub, cycle_status, cycle_closed_at')
        .eq('cycle_status', 'closed')
        .order('cycle_closed_at', { ascending: false });

      if (error) throw error;

      const records: ClosedCycleRecord[] = (data || []).map(m => ({
        id: m.id,
        name: m.name,
        month: m.month,
        year: null,
        region: (m as any).hub || 'Unknown',
        cycle_status: m.cycle_status || 'closed',
        cycle_closed_at: m.cycle_closed_at,
        totalSites: 0,
        completedSites: 0,
        uncoveredSites: 0,
        reasonBreakdown: {},
      }));

      if (records.length > 0) {
        const cycleIds = records.map(r => r.id);
        const { data: siteStats } = await supabase
          .from('site_visits')
          .select('mmp_id, status, not_covered_flag, not_covered_reason')
          .in('mmp_id', cycleIds);

        if (siteStats) {
          records.forEach(r => {
            const cycleSites = siteStats.filter(s => s.mmp_id === r.id);
            r.totalSites = cycleSites.length;
            r.uncoveredSites = cycleSites.filter(s => s.not_covered_flag).length;
            r.completedSites = cycleSites.filter(s => s.status === 'completed').length;
            r.reasonBreakdown = {};
            cycleSites.filter(s => s.not_covered_flag && s.not_covered_reason).forEach(s => {
              r.reasonBreakdown![s.not_covered_reason!] = (r.reasonBreakdown![s.not_covered_reason!] || 0) + 1;
            });
          });
        }
      }

      setClosedCycles(records);
    } catch (err) {
      console.error('Error fetching closed cycles:', err);
    }
  }, []);

  const fetchMmpScopeOptions = useCallback(async (mmpId: string): Promise<MmpScopeOptions> => {
    try {
      const { data: entries } = await supabase
        .from('mmp_site_entries')
        .select('hub_office, state, main_activity, activity_at_site')
        .eq('mmp_file_id', mmpId);

      const hubs = new Set<string>();
      const states = new Set<string>();
      const activities = new Set<string>();

      (entries || []).forEach((e: any) => {
        if (e.hub_office) hubs.add(e.hub_office);
        if (e.state) states.add(e.state);
        if (e.main_activity) activities.add(e.main_activity);
        if (e.activity_at_site) activities.add(e.activity_at_site);
      });

      const mmp = mmpFiles?.find(m => m.id === mmpId);
      if (mmp?.hub) hubs.add(mmp.hub);
      if (mmp?.region) hubs.add(mmp.region);

      const options: MmpScopeOptions = {
        hubs: Array.from(hubs).filter(Boolean).sort(),
        states: Array.from(states).filter(Boolean).sort(),
        activities: Array.from(activities).filter(Boolean).sort(),
      };

      setMmpScopeOptions(prev => ({ ...prev, [mmpId]: options }));
      return options;
    } catch (err) {
      console.error('Error fetching scope options:', err);
      return { hubs: [], states: [], activities: [] };
    }
  }, [mmpFiles]);

  const handleScopedClose = async (mmpId: string, scope: CloseScope, scopeValue: string) => {
    if (!canManageCycle) return;

    if (scope === 'full') {
      handleStartClosingCycle(mmpId);
      return;
    }

    setPendingScopedClose({ scope, scopeValue });
    setChecklistMmpId(mmpId);
    return;
  };

  const executeScopedClose = async (mmpId: string, scope: CloseScope, scopeValue: string) => {
    if (!canManageCycle) return;
    setClosingCycle(true);
    try {
      const mmp = mmpFiles?.find(m => m.id === mmpId);
      const mmpName = mmp?.name || 'MMP';

      let siteEntryIds: string[] = [];

      if (scope === 'hub') {
        const { data: entries } = await supabase
          .from('mmp_site_entries')
          .select('id')
          .eq('mmp_file_id', mmpId)
          .eq('hub_office', scopeValue);
        siteEntryIds = (entries || []).map((e: any) => e.id);
      } else if (scope === 'state') {
        const { data: entries } = await supabase
          .from('mmp_site_entries')
          .select('id')
          .eq('mmp_file_id', mmpId)
          .eq('state', scopeValue);
        siteEntryIds = (entries || []).map((e: any) => e.id);
      } else if (scope === 'activity') {
        let activityName = scopeValue;
        let subFilterField: string | null = null;
        let subFilterValue: string | null = null;
        if (scopeValue.includes('||')) {
          const parts = scopeValue.split('||');
          activityName = parts[0];
          const subParts = parts[1]?.split(':');
          if (subParts && subParts.length === 2) {
            subFilterField = subParts[0] === 'state' ? 'state' : 'hub_office';
            subFilterValue = subParts[1];
          }
        }
        let query = supabase
          .from('mmp_site_entries')
          .select('id')
          .eq('mmp_file_id', mmpId)
          .or(`main_activity.eq.${activityName},activity_at_site.eq.${activityName}`);
        if (subFilterField && subFilterValue) {
          query = query.eq(subFilterField, subFilterValue);
        }
        const { data: entries } = await query;
        siteEntryIds = (entries || []).map((e: any) => e.id);
      }

      if (siteEntryIds.length === 0) {
        toast({ title: 'No Sites Found', description: `No site entries match the selected ${scope}.`, variant: 'destructive' });
        setClosingCycle(false);
        return;
      }

      const { data: matchedVisits } = await supabase
        .from('site_visits')
        .select('id')
        .eq('mmp_id', mmpId)
        .in('mmp_site_entry_id', siteEntryIds)
        .in('status', ['pending', 'assigned', 'dispatched', 'accepted']);

      const visitIds = (matchedVisits || []).map((v: any) => v.id);

      if (visitIds.length > 0) {
        const { error: svError } = await supabase
          .from('site_visits')
          .update({ not_covered_flag: true } as any)
          .in('id', visitIds);
        if (svError) throw svError;
      }

      const newRecord: CycleCloseRecord = {
        id: crypto.randomUUID(),
        scope,
        scopeValue,
        closedAt: new Date().toISOString(),
        closedBy: currentUser?.id || '',
        closedByName: currentUser?.fullName || '',
        siteCount: visitIds.length,
        status: 'closing',
      };

      const existingRecords: CycleCloseRecord[] = (mmp as any)?.cycle_close_records || [];
      const updatedRecords = [...existingRecords, newRecord];

      const currentStatus = (mmp as any)?.cycle_status || 'active';
      const updateData: any = {
        cycle_close_records: updatedRecords,
      };
      if (currentStatus === 'active') {
        updateData.cycle_status = 'closing';
        updateData.cycle_closing_started_at = new Date().toISOString();
        updateData.cycle_closing_started_by = currentUser?.id;
        updateData.cycle_close_deadline = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
      }

      const { error } = await supabase
        .from('mmp_files')
        .update(updateData)
        .eq('id', mmpId);

      if (error) throw error;

      const scopeLabels: Record<CloseScope, string> = { full: 'Full MMP', hub: 'Hub', state: 'State', activity: 'Activity' };

      await logMMPAudit({
        mmpId,
        mmpName,
        action: 'status_change',
        performedBy: currentUser?.id || '',
        performedByName: currentUser?.fullName,
        previousStatus: currentStatus,
        newStatus: 'closing',
        affectedSites: visitIds.length,
        metadata: {
          cycleAction: 'scoped_close',
          closeScope: scope,
          closeScopeValue: scopeValue,
          closeScopeLabel: scopeLabels[scope],
        },
      });

      let displayValue = scopeValue;
      if (scope === 'activity' && scopeValue.includes('||')) {
        const parts = scopeValue.split('||');
        const subParts = parts[1]?.split(':');
        displayValue = `${parts[0]} (${subParts?.[0] === 'state' ? 'State' : 'Hub'}: ${subParts?.[1]})`;
      }
      toast({
        title: `${scopeLabels[scope]} Close Started`,
        description: `Closing ${displayValue}: ${visitIds.length} site visits flagged as not covered.`,
      });
      await refreshMMPFiles();
      await fetchUncoveredSites();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to start scoped close', variant: 'destructive' });
    } finally {
      setClosingCycle(false);
    }
  };

  useEffect(() => {
    fetchUncoveredSites();
    fetchClosedCycles();
  }, [fetchUncoveredSites, fetchClosedCycles]);

  useEffect(() => {
    activeMmps.forEach(mmp => {
      if (!mmpScopeOptions[mmp.id]) {
        fetchMmpScopeOptions(mmp.id);
      }
    });
  }, [activeMmps, fetchMmpScopeOptions, mmpScopeOptions]);

  useEffect(() => {
    const fetchSiteVisitCounts = async () => {
      const mmpIds = (mmpFiles || []).filter(m => {
        const cs = (m as any).cycle_status || 'active';
        return cs === 'active' || cs === 'closing' || cs === 'pending_approval';
      }).map(m => m.id);
      if (mmpIds.length === 0) return;
      try {
        const { data } = await supabase
          .from('site_visits')
          .select('mmp_id, status')
          .in('mmp_id', mmpIds);
        if (data) {
          const counts: Record<string, { total: number; completed: number; pending: number; assigned: number; dispatched: number }> = {};
          data.forEach(sv => {
            const mid = sv.mmp_id;
            if (!mid) return;
            if (!counts[mid]) counts[mid] = { total: 0, completed: 0, pending: 0, assigned: 0, dispatched: 0 };
            counts[mid].total++;
            if (sv.status === 'completed') counts[mid].completed++;
            else if (sv.status === 'pending') counts[mid].pending++;
            else if (sv.status === 'assigned') counts[mid].assigned++;
            else if (sv.status === 'dispatched') counts[mid].dispatched++;
          });
          setSiteVisitCounts(counts);
        }
      } catch (err) {
        console.error('Error fetching site visit counts:', err);
      }
    };
    fetchSiteVisitCounts();
  }, [mmpFiles]);

  useEffect(() => {
    if (isAdmin) {
      checkAndSendCycleReminders().catch(console.error);
    }
  }, [isAdmin]);

  useEffect(() => {
    const fetchQualityData = async () => {
      try {
        const { data } = await supabase
          .from('site_visits')
          .select('mmp_id, additional_data');
        if (data && data.length > 0) {
          const hubScores: Record<string, { total: number; count: number }> = {};
          data.forEach((s: any) => {
            const qualityScore = Number(s?.additional_data?.quality_score);
            if (!Number.isFinite(qualityScore)) return;
            const mmp = mmpFiles?.find(m => m.id === s.mmp_id);
            const hub = mmp?.hub || mmp?.region || 'Unknown';
            if (!hubScores[hub]) hubScores[hub] = { total: 0, count: 0 };
            hubScores[hub].total += qualityScore;
            hubScores[hub].count++;
          });
          setQualityData(Object.entries(hubScores).map(([hub, d]) => ({
            hub,
            avgScore: Math.round((d.total / d.count) * 10) / 10,
            count: d.count,
          })));
        }
      } catch (err) {
        console.error('Error fetching quality data:', err);
      }
    };
    fetchQualityData();
  }, [mmpFiles]);

  const cycleStats = useMemo((): CycleStats => {
    const totalSites = uncoveredSites.length;
    const reasonedSites = uncoveredSites.filter(s => s.not_covered_reason).length;
    const pendingReasonSites = totalSites - reasonedSites;
    const completedSiteCount = 0;
    return {
      totalSites,
      completedSites: completedSiteCount,
      uncoveredSites: totalSites,
      reasonedSites,
      pendingReasonSites,
      coverageRate: totalSites > 0 ? Math.round((reasonedSites / totalSites) * 100) : 100,
    };
  }, [uncoveredSites]);

  const hubs = useMemo(() => {
    const hubSet = new Set(uncoveredSites.map(s => s.hub).filter(Boolean));
    return Array.from(hubSet).sort();
  }, [uncoveredSites]);

  const filteredSites = useMemo(() => {
    return uncoveredSites.filter(site => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!site.site_name.toLowerCase().includes(q) &&
            !site.site_code.toLowerCase().includes(q) &&
            !site.state.toLowerCase().includes(q) &&
            !site.locality.toLowerCase().includes(q)) {
          return false;
        }
      }
      if (filterHub !== 'all') {
        const filterHubs = filterHub.split(' & ');
        if (!filterHubs.includes(site.hub || '')) return false;
      }
      if (filterReason === 'pending' && site.not_covered_reason) return false;
      if (filterReason === 'assigned' && !site.not_covered_reason) return false;
      if (filterReason !== 'all' && filterReason !== 'pending' && filterReason !== 'assigned' && site.not_covered_reason !== filterReason) return false;
      if (selectedMmpId !== 'all' && site.mmp_id !== selectedMmpId) return false;
      return true;
    });
  }, [uncoveredSites, searchQuery, filterHub, filterReason, selectedMmpId]);

  const handleStartClosingCycle = async (mmpId: string) => {
    if (!canManageCycle) return;
    setClosingCycle(true);
    try {
      const { data: affectedVisits } = await supabase
        .from('site_visits')
        .select('id')
        .eq('mmp_id', mmpId)
        .in('status', ['pending', 'assigned', 'dispatched', 'accepted']);

      const affectedCount = affectedVisits?.length || 0;

      const fullCloseRecord: CycleCloseRecord = {
        id: crypto.randomUUID(),
        scope: 'full',
        scopeValue: 'Full MMP',
        closedAt: new Date().toISOString(),
        closedBy: currentUser?.id || '',
        closedByName: currentUser?.fullName || '',
        siteCount: affectedCount,
        status: 'closing',
      };

      const mmpData = mmpFiles?.find(m => m.id === mmpId);
      const existingRecords: CycleCloseRecord[] = (mmpData as any)?.cycle_close_records || [];

      const { error } = await supabase
        .from('mmp_files')
        .update({
          cycle_status: 'closing',
          cycle_closing_started_at: new Date().toISOString(),
          cycle_closing_started_by: currentUser?.id,
          cycle_close_deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
          cycle_close_records: [...existingRecords, fullCloseRecord],
        } as any)
        .eq('id', mmpId);

      if (error) throw error;

      const { error: svError } = await supabase
        .from('site_visits')
        .update({ not_covered_flag: true } as any)
        .eq('mmp_id', mmpId)
        .in('status', ['pending', 'assigned', 'dispatched', 'accepted']);

      if (svError) throw svError;

      const mmp = mmpFiles?.find(m => m.id === mmpId);
      const mmpName = mmp?.name || 'MMP';
      const mmpHub = mmp?.hub || mmp?.region || '';

      let supervisorQuery = supabase
        .from('profiles')
        .select('id, full_name, hub_id')
        .in('role', ['Supervisor', 'supervisor'])
        .eq('status', 'approved');

      if (mmpHub) {
        const { data: hubData } = await supabase
          .from('hubs')
          .select('id')
          .ilike('name', `%${mmpHub}%`)
          .limit(1);

        if (hubData && hubData.length > 0) {
          supervisorQuery = supervisorQuery.eq('hub_id', hubData[0].id);
        }
      }

      const { data: supervisors } = await supervisorQuery;

      if (supervisors && supervisors.length > 0) {
        await Promise.allSettled(
          supervisors.map(sup =>
            NotificationTriggerService.send({
              userId: sup.id,
              title: `Cycle Closing: Reasons Required`,
              message: `MMP "${mmpName}" is being closed. Please provide reasons for uncovered sites in your hub.`,
              titleAr: `إغلاق الدورة: الأسباب مطلوبة`,
              messageAr: `يتم إغلاق MMP "${mmpName}". يرجى تقديم أسباب للمواقع غير المغطاة في مركزك.`,
              type: 'warning',
              category: 'assignments',
              priority: 'high',
              link: '/mmp/cycle-close?tab=uncovered',
              relatedEntityId: mmpId,
              relatedEntityType: 'mmpFile',
            })
          )
        );
      }

      let fomQuery = supabase
        .from('profiles')
        .select('id, full_name, hub_id')
        .in('role', ['fom', 'Field Operation Manager (FOM)'])
        .eq('status', 'approved');

      if (mmpHub) {
        const { data: hubDataFom } = await supabase
          .from('hubs')
          .select('id')
          .ilike('name', `%${mmpHub}%`)
          .limit(1);

        if (hubDataFom && hubDataFom.length > 0) {
          fomQuery = fomQuery.eq('hub_id', hubDataFom[0].id);
        }
      }

      const { data: foms } = await fomQuery;

      if (foms && foms.length > 0) {
        await Promise.allSettled(
          foms.map(fom =>
            NotificationTriggerService.send({
              userId: fom.id,
              title: `Cycle Closing: Reasons Required`,
              message: `MMP "${mmpName}" is being closed. Please ensure your supervisors provide reasons for uncovered sites.`,
              titleAr: `إغلاق الدورة: الأسباب مطلوبة`,
              messageAr: `يتم إغلاق MMP "${mmpName}". يرجى التأكد من أن المشرفين يقدمون أسباباً للمواقع غير المغطاة.`,
              type: 'warning',
              category: 'assignments',
              priority: 'high',
              link: '/mmp/cycle-close?tab=uncovered',
              relatedEntityId: mmpId,
              relatedEntityType: 'mmpFile',
            })
          )
        );
      }

      const uncoveredCount = uncoveredSites.filter(s => s.mmp_id === mmpId).length;
      await logMMPAudit({
        mmpId,
        mmpName,
        action: 'status_change',
        performedBy: currentUser?.id || '',
        performedByName: currentUser?.fullName,
        previousStatus: 'active',
        newStatus: 'closing',
        affectedSites: uncoveredCount,
        metadata: { cycleAction: 'start_close' },
      });

      toast({ title: 'Cycle Closing Started', description: 'Uncovered sites have been flagged. Supervisors and FOMs have been notified to provide reasons.' });
      await refreshMMPFiles();
      await fetchUncoveredSites();
    } catch (err: any) {
      console.error('Error starting cycle close:', err);
      toast({ title: 'Error', description: err.message || 'Failed to start cycle close', variant: 'destructive' });
    } finally {
      setClosingCycle(false);
    }
  };

  const handleAssignReason = async (siteId: string, reason: NotCoveredReason, otherText?: string) => {
    if (!canAssignReasons) return;
    setSaving(true);
    try {
      const updateData: any = {
        not_covered_reason: reason,
        not_covered_reason_other: reason === 'other' ? otherText : null,
        not_covered_at: new Date().toISOString(),
        not_covered_by: currentUser?.id,
      };

      const { error } = await supabase
        .from('site_visits')
        .update(updateData)
        .eq('id', siteId);

      if (error) throw error;

      setUncoveredSites(prev => prev.map(s =>
        s.id === siteId
          ? { ...s, not_covered_reason: reason, not_covered_reason_other: reason === 'other' ? otherText || null : null, not_covered_at: updateData.not_covered_at, not_covered_by: updateData.not_covered_by }
          : s
      ));

      const site = uncoveredSites.find(s => s.id === siteId);
      if (site) {
        await logMMPAudit({
          mmpId: site.mmp_id,
          mmpName: site.mmp_name || 'MMP',
          action: 'status_change',
          performedBy: currentUser?.id || '',
          performedByName: currentUser?.fullName,
          reason: reason,
          metadata: { cycleAction: 'assign_reason', siteId, siteName: site.site_name, reason },
        });

        const reasonLabel = NOT_COVERED_REASONS.find(nr => nr.value === reason)?.label || reason;
        const mmpObj = mmpFiles?.find(m => m.id === site.mmp_id);
        const mmpName = mmpObj?.name || site.mmp_name || 'MMP';
        const mmpHub = mmpObj?.hub || mmpObj?.region || '';
        const assignedByName = currentUser?.fullName || 'System';

        const totalMmpUncovered = uncoveredSites.filter(s => s.mmp_id === site.mmp_id).length;
        const totalMmpReasoned = uncoveredSites.filter(s => s.mmp_id === site.mmp_id && (s.id === siteId || s.not_covered_reason)).length;
        const progressPct = totalMmpUncovered > 0 ? Math.round((totalMmpReasoned / totalMmpUncovered) * 100) : 100;

        try {
          const recipients = await fetchAdminFomSuperAdminRecipients();
          const superAdminCc = await getSuperAdminEmails();

          await Promise.allSettled(
            recipients.map(async (r: any) => {
              const recipientCc = r.role?.includes('super_admin') || r.role?.includes('Super') || r.role?.includes('superAdmin')
                ? [] : superAdminCc.filter(e => e !== r.email);

              await EmailNotificationService.sendNotification(
                r.email,
                r.full_name || 'Team',
                {
                  title: `Cycle Close: Reason Assigned for Uncovered Site`,
                  message: `A reason has been assigned for an uncovered site during the cycle close process for MMP "${mmpName}".`,
                  titleAr: `إغلاق الدورة: تم تعيين سبب لموقع غير مغطى`,
                  messageAr: `تم تعيين سبب لموقع غير مغطى أثناء عملية إغلاق الدورة لـ MMP "${mmpName}".`,
                  type: 'warning',
                  actionUrl: '/mmp/cycle-close?tab=uncovered',
                  actionLabel: 'View Uncovered Sites | عرض المواقع غير المغطاة',
                  details: [
                    { label: 'MMP / خطة الرصد', value: mmpName },
                    { label: 'Hub / المحور', value: mmpHub || 'N/A' },
                    { label: 'Site / الموقع', value: site.site_name },
                    { label: 'Site Code / رمز الموقع', value: site.site_code || 'N/A' },
                    { label: 'State / الولاية', value: site.state || 'N/A' },
                    { label: 'Locality / المحلية', value: site.locality || 'N/A' },
                    { label: 'Reason / السبب', value: reasonLabel },
                    ...(reason === 'other' && otherText ? [{ label: 'Details / التفاصيل', value: otherText }] : []),
                    { label: 'Assigned By / تم التعيين بواسطة', value: assignedByName },
                    { label: 'Date / التاريخ', value: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) },
                    { label: 'Progress / التقدم', value: `${totalMmpReasoned}/${totalMmpUncovered} sites (${progressPct}%)` },
                  ],
                  cc: recipientCc,
                }
              );
            })
          );
        } catch (emailErr) {
          console.error('Error sending cycle close reason email:', emailErr);
        }
      }

      toast({ title: 'Reason Assigned', description: 'The reason has been saved.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to assign reason', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleBulkAssignReason = async () => {
    if (!canAssignReasons || !bulkReason || selectedSites.size === 0) return;
    setSaving(true);
    try {
      const siteIds = Array.from(selectedSites);
      const updateData: any = {
        not_covered_reason: bulkReason,
        not_covered_reason_other: bulkReason === 'other' ? bulkOtherText : null,
        not_covered_at: new Date().toISOString(),
        not_covered_by: currentUser?.id,
      };

      const { error } = await supabase
        .from('site_visits')
        .update(updateData)
        .in('id', siteIds);

      if (error) throw error;

      setUncoveredSites(prev => prev.map(s =>
        siteIds.includes(s.id)
          ? { ...s, not_covered_reason: bulkReason as NotCoveredReason, not_covered_reason_other: bulkReason === 'other' ? bulkOtherText || null : null, not_covered_at: updateData.not_covered_at, not_covered_by: updateData.not_covered_by }
          : s
      ));

      setSelectedSites(new Set());
      setBulkReason('');
      setBulkOtherText('');

      await logMMPAudit({
        mmpId: 'bulk',
        mmpName: 'Bulk Assignment',
        action: 'bulk_operation',
        performedBy: currentUser?.id || '',
        performedByName: currentUser?.fullName,
        affectedSites: siteIds.length,
        metadata: { cycleAction: 'bulk_assign_reason', reason: bulkReason, siteCount: siteIds.length },
      });

      const reasonLabel = NOT_COVERED_REASONS.find(nr => nr.value === bulkReason)?.label || bulkReason;
      const assignedByName = currentUser?.fullName || 'System';
      const affectedSiteNames = uncoveredSites.filter(s => siteIds.includes(s.id)).map(s => s.site_name).slice(0, 5);
      const affectedMmpIds = [...new Set(uncoveredSites.filter(s => siteIds.includes(s.id)).map(s => s.mmp_id))];
      const affectedMmpNames = affectedMmpIds.map(id => mmpFiles?.find(m => m.id === id)?.name || 'MMP').join(', ');

      try {
        const recipients = await fetchAdminFomSuperAdminRecipients();
        const superAdminCc = await getSuperAdminEmails();

        await Promise.allSettled(
          recipients.map(async (r: any) => {
            const recipientCc = r.role?.includes('super_admin') || r.role?.includes('Super') || r.role?.includes('superAdmin')
              ? [] : superAdminCc.filter(e => e !== r.email);

            await EmailNotificationService.sendNotification(
              r.email,
              r.full_name || 'Team',
              {
                title: `Cycle Close: Bulk Reason Assignment (${siteIds.length} Sites)`,
                message: `Reasons have been bulk-assigned for ${siteIds.length} uncovered sites during the cycle close process.`,
                titleAr: `إغلاق الدورة: تعيين أسباب جماعي (${siteIds.length} موقع)`,
                messageAr: `تم تعيين أسباب بشكل جماعي لـ ${siteIds.length} موقع غير مغطى أثناء عملية إغلاق الدورة.`,
                type: 'warning',
                actionUrl: '/mmp/cycle-close?tab=uncovered',
                actionLabel: 'View Uncovered Sites | عرض المواقع غير المغطاة',
                details: [
                  { label: 'MMP(s) / خطط الرصد', value: affectedMmpNames },
                  { label: 'Sites Affected / المواقع المتأثرة', value: `${siteIds.length} sites` },
                  { label: 'Sample Sites / نماذج مواقع', value: affectedSiteNames.join(', ') + (siteIds.length > 5 ? ` +${siteIds.length - 5} more` : '') },
                  { label: 'Reason / السبب', value: reasonLabel },
                  ...(bulkReason === 'other' && bulkOtherText ? [{ label: 'Details / التفاصيل', value: bulkOtherText }] : []),
                  { label: 'Assigned By / تم التعيين بواسطة', value: assignedByName },
                  { label: 'Date / التاريخ', value: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) },
                ],
                cc: recipientCc,
              }
            );
          })
        );
      } catch (emailErr) {
        console.error('Error sending bulk assign reason email:', emailErr);
      }

      toast({ title: 'Bulk Assign Complete', description: `Reason assigned to ${siteIds.length} sites.` });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to bulk assign', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const checkFinanceReadinessForClose = async (mmpId: string): Promise<{ ok: boolean; issues: string[] }> => {
    let advancesRes, withdrawalsRes, costSubsRes;
    try {
      const mmpMeta = await supabase
        .from('mmp_files')
        .select('month, year')
        .eq('id', mmpId)
        .single();
      const month = mmpMeta.data?.month ?? null;
      const year = mmpMeta.data?.year ?? null;

      let costSubsQuery = supabase
        .from('operational_cost_submissions')
        .select('id, tier1_status, tier2_status, expense_date')
        .or('tier1_status.eq.pending,tier2_status.eq.pending');

      if (year !== null && month !== null) {
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        costSubsQuery = costSubsQuery.gte('expense_date', startDate).lte('expense_date', endDate);
      }

      [advancesRes, withdrawalsRes, costSubsRes] = await Promise.all([
        supabase.from('down_payment_requests').select('id, status, metadata').eq('mmp_id', mmpId),
        supabase.from('withdrawal_requests').select('id, status').eq('mmp_id', mmpId),
        costSubsQuery,
      ]);
    } catch {
      toast({
        title: 'Finance Gate — Close Blocked',
        description: 'Unable to verify finance readiness. Please retry or contact support.',
        variant: 'destructive',
      });
      return { ok: false, issues: ['Finance readiness check failed — cannot proceed'] };
    }

    // Only block on cost submissions error (required table).
    // advances/withdrawals tables are optional — gracefully treat errors as empty
    // to match server RPC behavior which also handles missing tables gracefully.
    if (costSubsRes.error) {
      toast({
        title: 'Finance Gate — Close Blocked',
        description: 'Unable to verify cost submission readiness. Please retry or contact support.',
        variant: 'destructive',
      });
      return { ok: false, issues: ['Finance readiness check failed — cannot proceed'] };
    }

    // advances: treat query error as empty (optional table, server RPC handles gracefully)
    const advances = (!advancesRes.error && advancesRes.data || []) as Array<{ id: string; status: string; metadata: Record<string, unknown> | null }>;
    const unreconciledAdvances = advances.filter(a => {
      const isTerminal = a.status === 'approved' || a.status === 'paid';
      const meta = a.metadata ?? {};
      return isTerminal && meta['reconciled'] !== true && !meta['reconciled_at'];
    }).length;

    // withdrawals: treat query error as empty (optional table, server RPC handles gracefully)
    const pendingWithdrawals = ((!withdrawalsRes.error && withdrawalsRes.data || []) as Array<{ id: string; status: string }>).filter(
      w => !['approved', 'rejected', 'completed', 'paid'].includes(w.status ?? ''),
    ).length;

    const pendingCostSubs = (costSubsRes.data || []).length;

    const issues: string[] = [];
    if (unreconciledAdvances > 0) issues.push(`${unreconciledAdvances} unreconciled transport advance(s)`);
    if (pendingWithdrawals > 0) issues.push(`${pendingWithdrawals} pending withdrawal request(s)`);
    if (pendingCostSubs > 0) issues.push(`${pendingCostSubs} pending cost submission(s) (tier 1 or tier 2 pending)`);

    return { ok: issues.length === 0, issues };
  };

  const handleFinalizeCycleClose = async (mmpId: string) => {
    if (!canManageCycle) return;
    const unreasoned = uncoveredSites.filter(s => s.mmp_id === mmpId && !s.not_covered_reason);
    if (unreasoned.length > 0) {
      toast({ title: 'Cannot Close', description: `${unreasoned.length} sites still need a reason. All uncovered sites must have reasons before closing.`, variant: 'destructive' });
      return;
    }

    const { ok: financeOk, issues: financeIssues } = await checkFinanceReadinessForClose(mmpId);
    if (!financeOk) {
      if (isSuperAdmin) {
        setFinanceOverrideJustification('');
        setFinanceOverrideDialog({ mmpId, issues: financeIssues, action: 'finalize' });
        return;
      }
      return;
    }

    setFinalizingCycle(true);
    try {
      const { error } = await supabase
        .from('mmp_files')
        .update({
          cycle_status: 'pending_approval',
        } as any)
        .eq('id', mmpId);

      if (error) throw error;

      const mmp = mmpFiles?.find(m => m.id === mmpId);
      await logMMPAudit({
        mmpId,
        mmpName: mmp?.name || 'MMP',
        action: 'status_change',
        performedBy: currentUser?.id || '',
        performedByName: currentUser?.fullName,
        previousStatus: 'closing',
        newStatus: 'pending_approval',
        affectedSites: uncoveredSites.filter(s => s.mmp_id === mmpId).length,
        metadata: { cycleAction: 'submit_for_approval' },
      });

      toast({ title: 'Submitted for Approval', description: 'The cycle has been submitted for FOM/Director approval.' });
      await refreshMMPFiles();
      await fetchUncoveredSites();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to submit for approval', variant: 'destructive' });
    } finally {
      setFinalizingCycle(false);
    }
  };

  const handleApproveCycle = async (mmpId: string, skipFinanceCheck = false, overrideJustification?: string) => {
    if (!skipFinanceCheck) {
      const { ok: financeOk, issues: financeIssues } = await checkFinanceReadinessForClose(mmpId);
      if (!financeOk) {
        if (isSuperAdmin) {
          setFinanceOverrideJustification('');
          setFinanceOverrideDialog({ mmpId, issues: financeIssues, action: 'approve' });
          return;
        }
        return;
      }
    }

    try {
      const mmpData = mmpFiles?.find(m => m.id === mmpId);
      const existingRecords: CycleCloseRecord[] = (mmpData as any)?.cycle_close_records || [];
      const updatedRecords = existingRecords.map(r => ({
        ...r,
        status: 'closed' as const,
      }));

      const now = new Date().toISOString();
      const mmpSnap = mmpFiles?.find(m => m.id === mmpId);
      const snapshotRecord = {
        id: `snapshot-${now}`,
        scope: 'full',
        status: 'closed' as const,
        closedAt: now,
        closedBy: currentUser?.id,
        closedByName: currentUser?.fullName,
        hubOrRegion: mmpSnap?.hub || mmpSnap?.region || null,
        month: mmpSnap?.month ?? null,
        name: mmpSnap?.name ?? null,
      };
      const finalRecords = [
        ...updatedRecords,
        snapshotRecord,
      ];

      const { error } = await supabase.rpc('cycle_approve_close', {
        p_mmp_id: mmpId,
        p_close_records: JSON.parse(JSON.stringify(finalRecords)),
        p_super_admin_override: skipFinanceCheck && !!overrideJustification,
        p_override_justification: overrideJustification || null,
      });

      if (error) throw error;

      await supabase
        .from('site_visits')
        .update({ status: 'cancelled' })
        .eq('mmp_id', mmpId)
        .eq('not_covered_flag', true)
        .in('status', ['pending', 'assigned', 'dispatched', 'accepted']);

      const mmp = mmpFiles?.find(m => m.id === mmpId);
      await logMMPAudit({
        mmpId,
        mmpName: mmp?.name || 'MMP',
        action: 'status_change',
        performedBy: currentUser?.id || '',
        performedByName: currentUser?.fullName,
        previousStatus: 'pending_approval',
        newStatus: 'closed',
        metadata: { cycleAction: 'approve_close' },
      });

      toast({ title: 'Cycle Approved & Closed', description: 'The MMP cycle has been approved and closed.' });
      await refreshMMPFiles();
      await fetchClosedCycles();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to approve cycle', variant: 'destructive' });
    }
  };

  const handleRejectCycle = async (mmpId: string, note: string) => {
    try {
      const { error } = await supabase
        .from('mmp_files')
        .update({
          cycle_status: 'closing',
          cycle_approval_note: note,
        } as any)
        .eq('id', mmpId);

      if (error) throw error;

      const mmp = mmpFiles?.find(m => m.id === mmpId);
      await logMMPAudit({
        mmpId,
        mmpName: mmp?.name || 'MMP',
        action: 'status_change',
        performedBy: currentUser?.id || '',
        performedByName: currentUser?.fullName,
        previousStatus: 'pending_approval',
        newStatus: 'closing',
        metadata: { cycleAction: 'reject_close', rejectionNote: note },
      });

      toast({ title: 'Cycle Rejected', description: 'Cycle has been returned to closing status.' });
      await refreshMMPFiles();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to reject cycle', variant: 'destructive' });
    }
  };

  const handleFinanceOverrideConfirm = async () => {
    if (!financeOverrideDialog) return;
    const { mmpId, action, issues } = financeOverrideDialog;
    const justification = financeOverrideJustification.trim();
    if (!justification) {
      toast({ title: 'Justification Required', description: 'Provide a written justification before overriding.', variant: 'destructive' });
      return;
    }

    const mmp = mmpFiles?.find(m => m.id === mmpId);
    const auditId = await logMMPAudit({
      mmpId,
      mmpName: mmp?.name || 'MMP',
      action: 'bypass',
      performedBy: currentUser?.id || '',
      performedByName: currentUser?.fullName,
      metadata: {
        overrideAction: action === 'finalize' ? 'finalize_close' : 'approve_close',
        justification,
        pendingIssues: issues,
      },
    });

    if (!auditId) {
      toast({ title: 'Override Blocked', description: 'Failed to record override justification. Action blocked.', variant: 'destructive' });
      return;
    }

    setFinanceOverrideDialog(null);
    setFinanceOverrideJustification('');

    if (action === 'finalize') {
      setFinalizingCycle(true);
      try {
        const { error } = await supabase
          .from('mmp_files')
          .update({ cycle_status: 'pending_approval' } as any)
          .eq('id', mmpId);
        if (error) throw error;
        await logMMPAudit({
          mmpId,
          mmpName: mmp?.name || 'MMP',
          action: 'status_change',
          performedBy: currentUser?.id || '',
          performedByName: currentUser?.fullName,
          previousStatus: 'closing',
          newStatus: 'pending_approval',
          metadata: { cycleAction: 'submit_for_approval', superAdminOverride: true },
        });
        toast({ title: 'Submitted for Approval (Override)', description: 'Finance gate bypassed by Super Admin and recorded to audit log.' });
        await refreshMMPFiles();
        await fetchUncoveredSites();
      } catch (err: any) {
        toast({ title: 'Error', description: err.message || 'Failed to submit for approval', variant: 'destructive' });
      } finally {
        setFinalizingCycle(false);
      }
    } else {
      await handleApproveCycle(mmpId, true, justification);
    }
  };

  const handleCycleCloseOverride = async (mmpId: string, justification: string) => {
    const auditId = await logMMPAudit({
      mmpId,
      mmpName: mmpFiles?.find(m => m.id === mmpId)?.name || 'MMP',
      action: 'status_change',
      performedBy: currentUser?.id || '',
      performedByName: currentUser?.fullName,
      metadata: {
        cycleAction: 'superadmin_finance_gate_override',
        justification,
        overriddenAt: new Date().toISOString(),
      },
    });
    if (!auditId) {
      toast({
        title: 'Override Blocked',
        description: 'Could not record justification in the audit trail. Override aborted to preserve compliance.',
        variant: 'destructive',
      });
      return;
    }
    toast({ title: 'Override Recorded', description: 'Justification logged. Proceeding to close the cycle.' });
    const pending = pendingScopedClose;
    setPendingScopedClose(null);
    if (pending) {
      executeScopedClose(mmpId, pending.scope, pending.scopeValue);
    } else {
      handleStartClosingCycle(mmpId);
    }
  };

  const handleScheduleReminders = async () => {
    try {
      const result = await checkAndSendCycleReminders();
      toast({
        title: 'Reminders Processed',
        description: `Sent ${result.sent} reminders across ${result.cycles} overdue cycles.`,
      });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to send reminders', variant: 'destructive' });
    }
  };

  const toggleSiteSelection = (siteId: string) => {
    setSelectedSites(prev => {
      const next = new Set(prev);
      if (next.has(siteId)) next.delete(siteId);
      else next.add(siteId);
      return next;
    });
  };

  const toggleAllFiltered = () => {
    const filteredIds = filteredSites.map(s => s.id);
    const allSelected = filteredIds.every(id => selectedSites.has(id));
    if (allSelected) {
      setSelectedSites(prev => {
        const next = new Set(prev);
        filteredIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelectedSites(prev => {
        const next = new Set(prev);
        filteredIds.forEach(id => next.add(id));
        return next;
      });
    }
  };

  const getReasonLabel = (reason: string | null) => {
    if (!reason) return 'Pending';
    const r = NOT_COVERED_REASONS.find(nr => nr.value === reason);
    return r?.label || reason;
  };

  const getReasonLabelAr = (reason: string | null) => {
    if (!reason) return 'معلق';
    const r = NOT_COVERED_REASONS.find(nr => nr.value === reason);
    return r?.labelAr || '';
  };

  const getReasonBadgeVariant = (reason: string | null): 'default' | 'secondary' | 'destructive' | 'outline' => {
    if (!reason) return 'destructive';
    return 'secondary';
  };

  const exportCoverageReport = (mmpId?: string) => {
    const sites = mmpId ? uncoveredSites.filter(s => s.mmp_id === mmpId) : uncoveredSites;
    const csv = [
      ['Site Name', 'Site Code', 'State', 'Locality', 'Hub', 'Status', 'Reason', 'Other Details', 'Flagged At'].join(','),
      ...sites.map(s => [
        `"${s.site_name}"`,
        s.site_code,
        s.state,
        s.locality,
        s.hub || '',
        s.status,
        getReasonLabel(s.not_covered_reason),
        s.not_covered_reason_other || '',
        s.not_covered_at || '',
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `coverage-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSendReminders = async (mmpId: string) => {
    try {
      const mmp = mmpFiles?.find(m => m.id === mmpId);
      const mmpName = mmp?.name || 'MMP';
      const mmpHub = mmp?.hub || mmp?.region || '';

      const mmpUncoveredCount = uncoveredSites.filter(s => s.mmp_id === mmpId).length;
      const mmpReasonedCount = uncoveredSites.filter(s => s.mmp_id === mmpId && s.not_covered_reason).length;
      const mmpPendingCount = mmpUncoveredCount - mmpReasonedCount;
      const progressPct = mmpUncoveredCount > 0 ? Math.round((mmpReasonedCount / mmpUncoveredCount) * 100) : 100;
      const deadlineStr = (mmp as any)?.cycle_close_deadline ? new Date((mmp as any).cycle_close_deadline).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A';

      let recipientQuery = supabase
        .from('profiles')
        .select('id, full_name, email, hub_id, role')
        .in('role', ['Supervisor', 'supervisor', 'fom', 'Field Operation Manager (FOM)', 'super_admin', 'Super Admin', 'superAdmin', 'SuperAdmin'])
        .eq('status', 'approved');

      if (mmpHub) {
        const { data: hubData } = await supabase
          .from('hubs')
          .select('id')
          .ilike('name', `%${mmpHub}%`)
          .limit(1);
        if (hubData && hubData.length > 0) {
          const hubId = hubData[0].id;
          const { data: hubRecipients } = await supabase
            .from('profiles')
            .select('id, full_name, email, hub_id, role')
            .in('role', ['Supervisor', 'supervisor', 'fom', 'Field Operation Manager (FOM)'])
            .eq('hub_id', hubId)
            .eq('status', 'approved');

          const { data: superAdmins } = await supabase
            .from('profiles')
            .select('id, full_name, email, hub_id, role')
            .in('role', ['super_admin', 'Super Admin', 'superAdmin', 'SuperAdmin'])
            .eq('status', 'approved');

          const combined = [...(hubRecipients || []), ...(superAdmins || [])];
          const uniqueById = combined.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);

          const superAdminCc = await getSuperAdminEmails();

          if (uniqueById.length > 0) {
            await Promise.allSettled(
              uniqueById.map(async (r: any) => {
                const isSuperAdminRole = r.role?.includes('super_admin') || r.role?.includes('Super') || r.role?.includes('superAdmin');

                await NotificationTriggerService.send({
                  userId: r.id,
                  title: `OVERDUE: Cycle Close Reasons Required`,
                  message: `MMP "${mmpName}" cycle close is overdue. ${mmpPendingCount} sites still need reasons. Please submit immediately.`,
                  titleAr: `متأخر: أسباب إغلاق الدورة مطلوبة`,
                  messageAr: `إغلاق دورة MMP "${mmpName}" متأخر. ${mmpPendingCount} مواقع لا تزال بحاجة إلى أسباب. يرجى التقديم فوراً.`,
                  type: 'error',
                  category: 'assignments',
                  priority: 'urgent',
                  link: '/mmp/cycle-close?tab=uncovered',
                  relatedEntityId: mmpId,
                  relatedEntityType: 'mmpFile',
                });

                if (r.email) {
                  const recipientCc = isSuperAdminRole ? [] : superAdminCc.filter(e => e !== r.email);

                  await EmailNotificationService.sendNotification(
                    r.email,
                    r.full_name || 'Team',
                    {
                      title: `OVERDUE: Cycle Close Reasons Required`,
                      message: `MMP "${mmpName}" cycle close is overdue. ${mmpPendingCount} uncovered sites still require reasons to be submitted.`,
                      titleAr: `متأخر: أسباب إغلاق الدورة مطلوبة`,
                      messageAr: `إغلاق دورة MMP "${mmpName}" متأخر. ${mmpPendingCount} موقع غير مغطى لا يزال يحتاج إلى تقديم أسباب.`,
                      type: 'error',
                      actionUrl: '/mmp/cycle-close?tab=uncovered',
                      actionLabel: 'Review & Submit Reasons | مراجعة وتقديم الأسباب',
                      details: [
                        { label: 'MMP / خطة الرصد', value: mmpName },
                        { label: 'Hub / المحور', value: mmpHub || 'N/A' },
                        { label: 'Deadline / الموعد النهائي', value: deadlineStr },
                        { label: 'Total Uncovered / إجمالي غير المغطى', value: `${mmpUncoveredCount} sites` },
                        { label: 'Reasons Submitted / الأسباب المقدمة', value: `${mmpReasonedCount} (${progressPct}%)` },
                        { label: 'Still Pending / لا يزال معلقاً', value: `${mmpPendingCount} sites` },
                      ],
                      cc: recipientCc,
                    }
                  );
                }
              })
            );
          }

          toast({ title: 'Reminders Sent', description: `Reminders sent to ${uniqueById.length} supervisors, FOMs, and super admins.` });
          return;
        }
      }

      const { data: recipients } = await recipientQuery;
      const superAdminCc = await getSuperAdminEmails();

      if (recipients && recipients.length > 0) {
        await Promise.allSettled(
          recipients.map(async (r: any) => {
            const isSuperAdminRole = r.role?.includes('super_admin') || r.role?.includes('Super') || r.role?.includes('superAdmin');

            await NotificationTriggerService.send({
              userId: r.id,
              title: `OVERDUE: Cycle Close Reasons Required`,
              message: `MMP "${mmpName}" cycle close is overdue. ${mmpPendingCount} sites still need reasons. Please submit immediately.`,
              titleAr: `متأخر: أسباب إغلاق الدورة مطلوبة`,
              messageAr: `إغلاق دورة MMP "${mmpName}" متأخر. ${mmpPendingCount} مواقع لا تزال بحاجة إلى أسباب. يرجى التقديم فوراً.`,
              type: 'error',
              category: 'assignments',
              priority: 'urgent',
              link: '/mmp/cycle-close?tab=uncovered',
              relatedEntityId: mmpId,
              relatedEntityType: 'mmpFile',
            });

            if (r.email) {
              const recipientCc = isSuperAdminRole ? [] : superAdminCc.filter(e => e !== r.email);
              await EmailNotificationService.sendNotification(
                r.email,
                r.full_name || 'Team',
                {
                  title: `OVERDUE: Cycle Close Reasons Required`,
                  message: `MMP "${mmpName}" cycle close is overdue. ${mmpPendingCount} uncovered sites still require reasons to be submitted.`,
                  titleAr: `متأخر: أسباب إغلاق الدورة مطلوبة`,
                  messageAr: `إغلاق دورة MMP "${mmpName}" متأخر. ${mmpPendingCount} موقع غير مغطى لا يزال يحتاج إلى تقديم أسباب.`,
                  type: 'error',
                  actionUrl: '/mmp/cycle-close?tab=uncovered',
                  actionLabel: 'Review & Submit Reasons | مراجعة وتقديم الأسباب',
                  details: [
                    { label: 'MMP / خطة الرصد', value: mmpName },
                    { label: 'Hub / المحور', value: mmpHub || 'N/A' },
                    { label: 'Deadline / الموعد النهائي', value: deadlineStr },
                    { label: 'Total Uncovered / إجمالي غير المغطى', value: `${mmpUncoveredCount} sites` },
                    { label: 'Reasons Submitted / الأسباب المقدمة', value: `${mmpReasonedCount} (${progressPct}%)` },
                    { label: 'Still Pending / لا يزال معلقاً', value: `${mmpPendingCount} sites` },
                  ],
                  cc: recipientCc,
                }
              );
            }
          })
        );
      }

      toast({ title: 'Reminders Sent', description: `Reminders sent to ${recipients?.length || 0} supervisors, FOMs, and super admins.` });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to send reminders', variant: 'destructive' });
    }
  };

  const exportCoverageReportExcel = async (mmpId?: string) => {
    const XLSX = await import('xlsx');
    const sites = mmpId ? uncoveredSites.filter(s => s.mmp_id === mmpId) : uncoveredSites;
    const wsData = sites.map(s => ({
      'Site Name': s.site_name,
      'Site Code': s.site_code,
      'State': s.state,
      'Locality': s.locality,
      'Hub': s.hub || '',
      'Status': s.status,
      'Reason': getReasonLabel(s.not_covered_reason),
      'Other Details': s.not_covered_reason_other || '',
      'Flagged At': s.not_covered_at || '',
    }));
    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Uncovered Sites');
    XLSX.writeFile(wb, `coverage-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const reasonBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    uncoveredSites.forEach(s => {
      const key = s.not_covered_reason || 'pending';
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [uncoveredSites]);

  const hubBreakdown = useMemo(() => {
    const counts: Record<string, { total: number; reasoned: number; pending: number }> = {};
    uncoveredSites.forEach(s => {
      const hub = s.hub || 'Unknown';
      if (!counts[hub]) counts[hub] = { total: 0, reasoned: 0, pending: 0 };
      counts[hub].total++;
      if (s.not_covered_reason) counts[hub].reasoned++;
      else counts[hub].pending++;
    });
    return counts;
  }, [uncoveredSites]);

  const overallSummary = useMemo(() => {
    const totalMmps = activeMmps.length;
    const closingCount = activeMmps.filter(m => (m as any).cycle_status === 'closing').length;
    const pendingApprovalCount = activeMmps.filter(m => (m as any).cycle_status === 'pending_approval').length;
    const activeCount = totalMmps - closingCount - pendingApprovalCount;
    let totalSites = 0;
    let completedSites = 0;
    Object.values(siteVisitCounts).forEach(c => {
      totalSites += c.total;
      completedSites += c.completed;
    });
    const overallCoverage = totalSites > 0 ? Math.round((completedSites / totalSites) * 100) : 0;
    const totalUncovered = uncoveredSites.length;
    const totalReasoned = uncoveredSites.filter(s => s.not_covered_reason).length;
    const reasonCompletion = totalUncovered > 0 ? Math.round((totalReasoned / totalUncovered) * 100) : 100;
    const overdueCount = activeMmps.filter(m => {
      const deadline = (m as any).cycle_close_deadline;
      return (m as any).cycle_status === 'closing' && deadline && new Date(deadline) < new Date();
    }).length;
    return { totalMmps, activeCount, closingCount, pendingApprovalCount, totalSites, completedSites, overallCoverage, totalUncovered, totalReasoned, reasonCompletion, overdueCount };
  }, [activeMmps, siteVisitCounts, uncoveredSites]);

  const activeHubs = useMemo(() => {
    const hubSet = new Set(activeMmps.map(m => m.hub || m.region || '').filter(Boolean));
    return Array.from(hubSet).sort();
  }, [activeMmps]);

  const filteredActiveMmps = useMemo(() => {
    let mmps = [...activeMmps];
    if (activeHubFilter !== 'all') {
      mmps = mmps.filter(m => (m.hub || m.region || '') === activeHubFilter);
    }
    mmps.sort((a, b) => {
      let cmp = 0;
      if (activeSort === 'name') {
        cmp = (a.name || '').localeCompare(b.name || '');
      } else if (activeSort === 'coverage') {
        const aCov = siteVisitCounts[a.id] ? (siteVisitCounts[a.id].completed / (siteVisitCounts[a.id].total || 1)) : 0;
        const bCov = siteVisitCounts[b.id] ? (siteVisitCounts[b.id].completed / (siteVisitCounts[b.id].total || 1)) : 0;
        cmp = aCov - bCov;
      } else {
        const statusOrder: Record<string, number> = { closing: 0, pending_approval: 1, active: 2 };
        const aOrder = statusOrder[(a as any).cycle_status || 'active'] ?? 2;
        const bOrder = statusOrder[(b as any).cycle_status || 'active'] ?? 2;
        cmp = aOrder - bOrder;
      }
      return activeSortDir === 'desc' ? -cmp : cmp;
    });
    return mmps;
  }, [activeMmps, activeHubFilter, activeSort, activeSortDir, siteVisitCounts]);

  const hubProgressData = useMemo(() => {
    const hubMap: Record<string, { total: number; completed: number; uncovered: number; reasoned: number; mmpCount: number }> = {};
    activeMmps.forEach(m => {
      const hub = m.hub || m.region || 'Unknown';
      if (!hubMap[hub]) hubMap[hub] = { total: 0, completed: 0, uncovered: 0, reasoned: 0, mmpCount: 0 };
      hubMap[hub].mmpCount++;
      const counts = siteVisitCounts[m.id];
      if (counts) {
        hubMap[hub].total += counts.total;
        hubMap[hub].completed += counts.completed;
      }
    });
    uncoveredSites.forEach(s => {
      const hub = s.hub || 'Unknown';
      if (!hubMap[hub]) hubMap[hub] = { total: 0, completed: 0, uncovered: 0, reasoned: 0, mmpCount: 0 };
      hubMap[hub].uncovered++;
      if (s.not_covered_reason) hubMap[hub].reasoned++;
    });
    return Object.entries(hubMap)
      .map(([hub, d]) => ({ hub, ...d, coverage: d.total > 0 ? Math.round((d.completed / d.total) * 100) : 0 }))
      .sort((a, b) => a.coverage - b.coverage);
  }, [activeMmps, siteVisitCounts, uncoveredSites]);

  const filteredClosedCycles = useMemo(() => {
    if (!archiveSearch.trim()) return closedCycles;
    const q = archiveSearch.toLowerCase();
    return closedCycles.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.region || '').toLowerCase().includes(q)
    );
  }, [closedCycles, archiveSearch]);

  const uncoveredMmpOptions = useMemo(() => {
    const mmpIds = new Set(uncoveredSites.map(s => s.mmp_id));
    return activeMmps.filter(m => mmpIds.has(m.id));
  }, [uncoveredSites, activeMmps]);

  if (!canManageCycle && !canAssignReasons) {
    return (
      <div className="max-w-xl mx-auto mt-20 p-8 bg-card rounded-xl shadow text-center" data-testid="access-denied">
        <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
        <p className="text-muted-foreground">You do not have permission to view this page.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl" data-testid="mmp-cycle-close-page">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-blue-600 text-white shrink-0">
            <RotateCcw className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold" data-testid="text-page-title">MMP Cycle Close</h1>
              {(isAdmin || isFOM) && <Badge variant="outline"><Shield className="h-3 w-3 mr-1" /> {isAdmin ? 'Admin' : 'FOM'} View</Badge>}
            </div>
            <p className="text-muted-foreground text-sm mt-0.5">
              Manage MMP cycle lifecycle, track coverage gaps, and close monitoring periods
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => { fetchUncoveredSites(); fetchClosedCycles(); }} data-testid="button-refresh">
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportCoverageReport()} data-testid="button-export">
            <Download className="h-4 w-4 mr-1" /> Export Report
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportCoverageReportExcel()} data-testid="button-export-excel">
            <FileSpreadsheet className="h-4 w-4 mr-1" /> Export Excel
          </Button>
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={() => navigate('/reconciliation-dashboard')} data-testid="button-goto-reconciliation">
              <BarChart3 className="h-4 w-4 mr-1" /> Reconciliation
            </Button>
          )}
        </div>
      </div>

      <PageInfoBanner
        title="MMP Cycle Close - Coverage Management"
        description="This page manages the full lifecycle of Monthly Monitoring Plan (MMP) cycles. When a monitoring period ends, you use this page to: (1) Review which sites were visited and which were not, (2) Assign reasons for uncovered sites (security, access, budget, etc.), (3) Start the cycle closing process, (4) Get approval from FOM/Country Director, and (5) Finalize and archive the cycle with full coverage reports. The page also shows trend analysis, performance scorecards, and historical comparisons across closed cycles."
        descriptionAr="تدير هذه الصفحة دورة حياة خطط المراقبة الشهرية (MMP) بالكامل. عند انتهاء فترة المراقبة، تستخدم هذه الصفحة لـ: (١) مراجعة المواقع التي تمت زيارتها والتي لم تتم زيارتها، (٢) تعيين أسباب عدم تغطية المواقع (أمنية، وصول، ميزانية، إلخ)، (٣) بدء عملية إغلاق الدورة، (٤) الحصول على موافقة مدير العمليات الميدانية / المدير القطري، و(٥) إنهاء وأرشفة الدورة مع تقارير التغطية الكاملة. تعرض الصفحة أيضاً تحليل الاتجاهات وبطاقات أداء ومقارنات تاريخية عبر الدورات المغلقة."
        workflowSteps={[
          { step: 1, role: 'Admin', action: 'Starts Cycle Close', description: 'Admin initiates the closing process for an MMP. The system auto-flags all sites that were not visited during this monitoring period.' },
          { step: 2, role: 'Supervisor', action: 'Assigns reasons for uncovered sites', description: 'Supervisors review each uncovered site and assign a reason (security, access denied, budget, time constraints, etc.). Bulk assignment is available.' },
          { step: 3, role: 'Admin', action: 'Reviews and finalizes', description: 'Admin reviews all reason assignments, checks the coverage report, and submits the cycle for approval.' },
          { step: 4, role: 'FOM', action: 'Approves cycle close', description: 'Field Operations Manager reviews the final report and approves or rejects the cycle close. Comments can be added.' },
          { step: 5, role: 'System', action: 'Archives the cycle', description: 'Once approved, the cycle is archived with full statistics, reason breakdowns, and performance data for historical analysis.' },
        ]}
        workflowStepsAr={[
          { step: 1, role: 'المدير', action: 'يبدأ إغلاق الدورة', description: 'يبدأ المدير عملية الإغلاق لخطة المراقبة. يقوم النظام تلقائياً بتحديد جميع المواقع التي لم تتم زيارتها خلال فترة المراقبة.' },
          { step: 2, role: 'المشرف', action: 'يعين أسباب المواقع غير المغطاة', description: 'يراجع المشرفون كل موقع غير مغطى ويعينون سبباً (أمني، وصول مرفوض، ميزانية، قيود وقت، إلخ). التعيين الجماعي متاح.' },
          { step: 3, role: 'المدير', action: 'يراجع ويُنهي', description: 'يراجع المدير جميع تعيينات الأسباب، ويتحقق من تقرير التغطية، ويقدم الدورة للموافقة.' },
          { step: 4, role: 'المشرف والمدير', action: 'يوافق على إغلاق الدورة', description: 'يراجع مدير العمليات الميدانية التقرير النهائي ويوافق أو يرفض إغلاق الدورة. يمكن إضافة تعليقات.' },
          { step: 5, role: 'النظام', action: 'يؤرشف الدورة', description: 'بمجرد الموافقة، تتم أرشفة الدورة مع الإحصائيات الكاملة وتفاصيل الأسباب وبيانات الأداء للتحليل التاريخي.' },
        ]}
      />

      <Collapsible open={guideOpen} onOpenChange={setGuideOpen}>
        <div className="rounded-md border border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/30 mb-4" data-testid="operational-guide">
          <CollapsibleTrigger asChild>
            <button
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-green-100/50 dark:hover:bg-green-900/30 rounded-md transition-colors"
              data-testid="button-toggle-guide"
            >
              <BookOpen className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
              <span className="text-sm font-medium text-green-700 dark:text-green-300 flex-1">
                MMP Cycle Close Operational Guide / دليل إغلاق دورة خطة المراقبة الشهرية
              </span>
              <ChevronDown className={`h-3.5 w-3.5 text-green-600 dark:text-green-400 transition-transform duration-200 ${guideOpen ? '' : '-rotate-90'}`} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-4 pb-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2" data-testid="guide-tabs-section">
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-green-700 dark:text-green-400">Understanding Each Tab</h4>
                  <div className="space-y-1.5 text-sm text-muted-foreground">
                    <div className="flex items-start gap-2">
                      <Badge variant="secondary">Active Cycles</Badge>
                      <span>View all current MMPs with their coverage status, site visit counts, and start the closing process.</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Badge variant="secondary">Uncovered Sites</Badge>
                      <span>List of all sites not visited during the cycle. Assign reasons individually or in bulk.</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Badge variant="secondary">Reports</Badge>
                      <span>Coverage statistics, reason breakdowns by hub, follow-up actions for high-priority gaps, and quality scores.</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Badge variant="secondary">Comparison</Badge>
                      <span>Compare two closed cycles side-by-side to spot coverage trends and recurring issues.</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Badge variant="secondary">Scorecard</Badge>
                      <span>Performance metrics per hub showing coverage trends, gap patterns, and improvement areas.</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Badge variant="secondary">Closed Cycles</Badge>
                      <span>Archive of past cycles with full statistics, reason breakdowns, trend analysis, and export options.</span>
                    </div>
                  </div>
                </div>
                <div className="space-y-2" dir="rtl">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-green-700 dark:text-green-400">فهم كل تبويب</h4>
                  <div className="space-y-1.5 text-sm text-muted-foreground">
                    <div className="flex items-start gap-2 flex-row-reverse text-right">
                      <Badge variant="secondary">الدورات النشطة</Badge>
                      <span>عرض جميع خطط المراقبة الحالية مع حالة التغطية وعدد زيارات المواقع وبدء عملية الإغلاق.</span>
                    </div>
                    <div className="flex items-start gap-2 flex-row-reverse text-right">
                      <Badge variant="secondary">المواقع غير المغطاة</Badge>
                      <span>قائمة بجميع المواقع التي لم تتم زيارتها. تعيين الأسباب فردياً أو بالجملة.</span>
                    </div>
                    <div className="flex items-start gap-2 flex-row-reverse text-right">
                      <Badge variant="secondary">التقارير</Badge>
                      <span>إحصائيات التغطية وتفاصيل الأسباب حسب المحور والإجراءات المتابعة ودرجات الجودة.</span>
                    </div>
                    <div className="flex items-start gap-2 flex-row-reverse text-right">
                      <Badge variant="secondary">المقارنة</Badge>
                      <span>مقارنة دورتين مغلقتين جنباً إلى جنب لرصد اتجاهات التغطية والمشاكل المتكررة.</span>
                    </div>
                    <div className="flex items-start gap-2 flex-row-reverse text-right">
                      <Badge variant="secondary">بطاقة الأداء</Badge>
                      <span>مقاييس الأداء لكل محور تعرض اتجاهات التغطية وأنماط الفجوات ومجالات التحسين.</span>
                    </div>
                    <div className="flex items-start gap-2 flex-row-reverse text-right">
                      <Badge variant="secondary">الدورات المغلقة</Badge>
                      <span>أرشيف الدورات السابقة مع إحصائيات كاملة وتحليل الاتجاهات وخيارات التصدير.</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      {overallSummary.totalMmps > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6" data-testid="summary-dashboard">
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex items-center justify-center h-7 w-7 rounded-md bg-blue-500/10 shrink-0">
                  <Layers className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider leading-tight">Active MMPs</div>
              </div>
              <div className="text-2xl font-bold" data-testid="text-total-mmps">{overallSummary.totalMmps}</div>
              <div className="flex gap-1 mt-1.5 flex-wrap">
                {overallSummary.activeCount > 0 && <Badge variant="secondary" data-testid="badge-active-count">{overallSummary.activeCount} Active</Badge>}
                {overallSummary.closingCount > 0 && <Badge variant="destructive" data-testid="badge-closing-count">{overallSummary.closingCount} Closing</Badge>}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex items-center justify-center h-7 w-7 rounded-md bg-emerald-500/10 shrink-0">
                  <Target className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider leading-tight">Coverage</div>
              </div>
              <div className="text-2xl font-bold" data-testid="text-overall-coverage">{overallSummary.overallCoverage}%</div>
              <Progress value={overallSummary.overallCoverage} className="h-1 mt-1.5" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex items-center justify-center h-7 w-7 rounded-md bg-green-500/10 shrink-0">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                </div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider leading-tight">Completed</div>
              </div>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400" data-testid="text-completed-total">{overallSummary.completedSites}</div>
              <div className="text-xs text-muted-foreground mt-0.5">of {overallSummary.totalSites} sites</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex items-center justify-center h-7 w-7 rounded-md bg-red-500/10 shrink-0">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                </div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider leading-tight">Uncovered</div>
              </div>
              <div className="text-2xl font-bold text-red-600 dark:text-red-400" data-testid="text-uncovered-total">{overallSummary.totalUncovered}</div>
              {overallSummary.totalUncovered > 0 && (
                <div className="text-xs text-muted-foreground mt-0.5">{overallSummary.totalReasoned} reasoned</div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex items-center justify-center h-7 w-7 rounded-md bg-amber-500/10 shrink-0">
                  <Activity className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider leading-tight">Reasons</div>
              </div>
              <div className="text-2xl font-bold" data-testid="text-reason-completion">{overallSummary.reasonCompletion}%</div>
              {overallSummary.totalUncovered > 0 && (
                <Progress value={overallSummary.reasonCompletion} className="h-1 mt-1.5" />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              {overallSummary.overdueCount > 0 ? (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex items-center justify-center h-7 w-7 rounded-md bg-destructive/10 shrink-0">
                      <Clock className="h-3.5 w-3.5 text-destructive" />
                    </div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider leading-tight">Overdue</div>
                  </div>
                  <div className="text-2xl font-bold text-destructive" data-testid="text-overdue-count">{overallSummary.overdueCount}</div>
                </>
              ) : overallSummary.pendingApprovalCount > 0 ? (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex items-center justify-center h-7 w-7 rounded-md bg-purple-500/10 shrink-0">
                      <Shield className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider leading-tight">Approval</div>
                  </div>
                  <div className="text-2xl font-bold text-purple-600 dark:text-purple-400" data-testid="text-pending-approval">{overallSummary.pendingApprovalCount}</div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex items-center justify-center h-7 w-7 rounded-md bg-green-500/10 shrink-0">
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                    </div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider leading-tight">Overdue</div>
                  </div>
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400" data-testid="text-on-track">0</div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList data-testid="tabs-cycle-close" className="flex-wrap gap-1 h-auto p-1">
          <TabsTrigger value="active" data-testid="tab-active" className="gap-1.5 px-3 py-2">
            <Activity className="h-3.5 w-3.5" />
            <span>Active Cycles</span>
            <span dir="rtl" className="text-[10px] font-normal text-muted-foreground hidden sm:inline">الدورات النشطة</span>
          </TabsTrigger>
          <TabsTrigger value="uncovered" data-testid="tab-uncovered" className="gap-1.5 px-3 py-2">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>Uncovered Sites</span>
            {cycleStats.uncoveredSites > 0 && <Badge variant="destructive" className="ml-0.5 text-[10px] px-1.5 py-0">{cycleStats.uncoveredSites}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="reports" data-testid="tab-reports" className="gap-1.5 px-3 py-2">
            <BarChart3 className="h-3.5 w-3.5" />
            <span>Reports</span>
            <span dir="rtl" className="text-[10px] font-normal text-muted-foreground hidden sm:inline">التقارير</span>
          </TabsTrigger>
          <TabsTrigger value="comparison" data-testid="tab-comparison" className="gap-1.5 px-3 py-2">
            <Layers className="h-3.5 w-3.5" />
            <span>Comparison</span>
            <span dir="rtl" className="text-[10px] font-normal text-muted-foreground hidden sm:inline">المقارنة</span>
          </TabsTrigger>
          <TabsTrigger value="scorecard" data-testid="tab-scorecard" className="gap-1.5 px-3 py-2">
            <Star className="h-3.5 w-3.5" />
            <span>Scorecard</span>
            <span dir="rtl" className="text-[10px] font-normal text-muted-foreground hidden sm:inline">بطاقة الاداء</span>
          </TabsTrigger>
          <TabsTrigger value="archive" data-testid="tab-archive" className="gap-1.5 px-3 py-2">
            <BookOpen className="h-3.5 w-3.5" />
            <span>Closed Cycles</span>
            {closedCycles.length > 0 && <Badge variant="secondary" className="ml-0.5 text-[10px] px-1.5 py-0">{closedCycles.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4">
          {activeMmps.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <div className="flex items-center justify-center h-16 w-16 mx-auto bg-muted rounded-full mb-4">
                  <FileText className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium">No Active MMP Cycles</h3>
                <p className="text-muted-foreground mt-1 text-sm max-w-md mx-auto">
                  All MMP cycles have been closed or there are no approved MMPs available for cycle management.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card data-testid="active-filters">
                <CardContent className="p-3">
                  <div className="flex flex-col sm:flex-row gap-3 items-center">
                    <div className="flex items-center gap-2 flex-wrap flex-1">
                      <Select value={activeHubFilter} onValueChange={setActiveHubFilter}>
                        <SelectTrigger className="w-[180px]" data-testid="select-active-hub-filter">
                          <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                          <SelectValue placeholder="All Hubs" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Hubs</SelectItem>
                          {activeHubs.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select value={activeSort} onValueChange={v => setActiveSort(v as any)}>
                        <SelectTrigger className="w-[160px]" data-testid="select-active-sort">
                          <SelectValue placeholder="Sort by..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="status">Sort by Status</SelectItem>
                          <SelectItem value="name">Sort by Name</SelectItem>
                          <SelectItem value="coverage">Sort by Coverage</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setActiveSortDir(d => d === 'asc' ? 'desc' : 'asc')}
                        data-testid="button-sort-direction"
                      >
                        {activeSortDir === 'asc' ? <SortAsc className="h-4 w-4" /> : <SortDesc className="h-4 w-4" />}
                      </Button>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {canManageCycle && (
                        <Button variant="outline" size="sm" onClick={handleScheduleReminders} data-testid="button-schedule-reminders">
                          <Bell className="h-3.5 w-3.5 mr-1.5" /> Reminders
                        </Button>
                      )}
                      <Badge variant="secondary" data-testid="badge-showing-count">
                        {filteredActiveMmps.length} of {activeMmps.length} MMPs
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {checklistMmpId && (
                <div className="space-y-3" data-testid="section-cycle-close-checklist">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                      Pre-Close Checklist — {mmpFiles?.find(m => m.id === checklistMmpId)?.name || 'MMP'}
                    </h3>
                    <Button variant="ghost" size="sm" onClick={() => { setChecklistMmpId(null); setPendingScopedClose(null); setReconciliationAcknowledged(false); }} data-testid="button-dismiss-checklist">
                      Dismiss
                    </Button>
                  </div>
                  <CloseReadinessChecklist
                    title="Cycle Close Readiness"
                    items={cycleReadiness.items}
                    score={cycleReadiness.score}
                    allPassed={cycleReadiness.allPassed}
                    loading={cycleReadiness.loading}
                    isSuperAdmin={isSuperAdmin}
                    onOverride={(justification) => handleCycleCloseOverride(checklistMmpId, justification)}
                    overrideLabel="Override & Start Closing"
                  />
                  <ReconciliationSummary
                    mmpId={checklistMmpId ?? undefined}
                    mmpContextLabel={mmpFiles?.find(m => m.id === checklistMmpId)?.name}
                  />
                  {cycleReadiness.allPassed && !cycleReadiness.loading && (
                    <div className="space-y-3 pt-1">
                      <label className="flex items-start gap-3 cursor-pointer select-none rounded-lg border border-blue-300/60 bg-blue-50/40 dark:bg-blue-950/20 p-3" data-testid="label-reconciliation-ack">
                        <input
                          type="checkbox"
                          checked={reconciliationAcknowledged}
                          onChange={e => setReconciliationAcknowledged(e.target.checked)}
                          className="mt-0.5 h-4 w-4 accent-blue-600 shrink-0"
                          data-testid="checkbox-reconciliation-ack"
                        />
                        <span className="text-sm text-blue-900 dark:text-blue-200 font-medium">
                          I have reviewed the reconciliation summary above and confirm that all financial obligations for this cycle are accounted for.
                        </span>
                      </label>
                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => { setChecklistMmpId(null); setPendingScopedClose(null); setReconciliationAcknowledged(false); }}
                          data-testid="button-cancel-close-gate"
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => {
                            const mmpId = checklistMmpId!;
                            const pending = pendingScopedClose;
                            setChecklistMmpId(null);
                            setPendingScopedClose(null);
                            setReconciliationAcknowledged(false);
                            if (pending) {
                              executeScopedClose(mmpId, pending.scope, pending.scopeValue);
                            } else {
                              handleStartClosingCycle(mmpId);
                            }
                          }}
                          disabled={closingCycle || !reconciliationAcknowledged}
                          data-testid="button-proceed-close-cycle"
                        >
                          {pendingScopedClose ? `Proceed to Close (${pendingScopedClose.scope})` : 'Proceed to Close Cycle'}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                {filteredActiveMmps.map(mmp => {
                  const cycleStatus = (mmp as any).cycle_status || 'active';
                  const mmpUncovered = uncoveredSites.filter(s => s.mmp_id === mmp.id);

                  return (
                    <CycleMMPCard
                      key={mmp.id}
                      mmp={mmp}
                      uncoveredSites={mmpUncovered}
                      cycleStatus={cycleStatus}
                      canManageCycle={canManageCycle}
                      isFOM={isFOM}
                      isAdmin={isAdmin}
                      closingCycle={closingCycle}
                      finalizingCycle={finalizingCycle}
                      siteVisitCounts={siteVisitCounts[mmp.id]}
                      scopeOptions={mmpScopeOptions[mmp.id]}
                      handleStartClosingCycle={(mmpId) => {
                        if (cycleStatus === 'active' && canManageCycle) {
                          setChecklistMmpId(mmpId);
                        } else {
                          handleStartClosingCycle(mmpId);
                        }
                      }}
                      handleScopedClose={handleScopedClose}
                      handleFinalizeCycleClose={handleFinalizeCycleClose}
                      handleApproveCycle={handleApproveCycle}
                      handleRejectCycle={handleRejectCycle}
                      handleSendReminders={handleSendReminders}
                      setSelectedMmpId={setSelectedMmpId}
                      setActiveTab={setActiveTab}
                      getReasonLabel={getReasonLabel}
                    />
                  );
                })}
              </div>
            </>
          )}

          {hubProgressData.length > 1 && (
            <Card data-testid="card-hub-progress">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="h-4 w-4" /> Hub Coverage Progress
                </CardTitle>
                <CardDescription>Coverage breakdown by hub across all active MMPs</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {hubProgressData.map(h => (
                    <div key={h.hub} className="space-y-1" data-testid={`hub-progress-${h.hub}`}>
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-medium truncate">{h.hub}</span>
                          <Badge variant="outline" className="shrink-0">{h.mmpCount} MMPs</Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                          <span>{h.completed}/{h.total} sites</span>
                          <span className="font-semibold text-foreground">{h.coverage}%</span>
                        </div>
                      </div>
                      <Progress value={h.coverage} className="h-1.5" />
                      {h.uncovered > 0 && (
                        <div className="flex gap-3 text-xs text-muted-foreground pl-1">
                          <span>{h.uncovered} uncovered</span>
                          <span>{h.reasoned} reasoned</span>
                          <span>{h.uncovered - h.reasoned} pending</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <CycleCoveragePredictor activeMmps={activeMmps} siteVisitCounts={siteVisitCounts} />
        </TabsContent>

        <TabsContent value="uncovered" className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end flex-wrap">
            <div className="flex-1 relative min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by site name, code, state..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-sites"
              />
            </div>
            <Select value={selectedMmpId} onValueChange={setSelectedMmpId}>
              <SelectTrigger className="w-[200px]" data-testid="select-filter-mmp">
                <SelectValue placeholder="All MMPs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All MMPs</SelectItem>
                {uncoveredMmpOptions.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterHub} onValueChange={setFilterHub}>
              <SelectTrigger className="w-[180px]" data-testid="select-filter-hub">
                <SelectValue placeholder="All Hubs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Hubs</SelectItem>
                {hubs.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterReason} onValueChange={setFilterReason}>
              <SelectTrigger className="w-[180px]" data-testid="select-filter-reason">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending Reason</SelectItem>
                <SelectItem value="assigned">Reason Assigned</SelectItem>
                {NOT_COVERED_REASONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label} <span dir="rtl" className="text-muted-foreground/70 text-xs ml-1">{r.labelAr}</span></SelectItem>)}
              </SelectContent>
            </Select>
            {canAssignReasons && filterHub !== 'all' && (
              <Button size="sm" variant="outline" onClick={() => {
                const hubSites = filteredSites.filter(s => !s.not_covered_reason).map(s => s.id);
                setSelectedSites(new Set(hubSites));
              }} data-testid="button-select-hub-pending">
                Select All Pending in {filterHub}
              </Button>
            )}
          </div>

          {filteredSites.length !== uncoveredSites.length && (
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground px-1">
              <span data-testid="text-filter-count">Showing {filteredSites.length} of {uncoveredSites.length} uncovered sites</span>
              <Button variant="ghost" size="sm" onClick={() => { setSelectedMmpId('all'); setFilterHub('all'); setFilterReason('all'); setSearchQuery(''); }} data-testid="button-clear-filters">
                Clear Filters
              </Button>
            </div>
          )}

          {canAssignReasons && selectedSites.size > 0 && (
            <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800" data-testid="card-bulk-assign">
              <CardContent className="py-3">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                    {selectedSites.size} site(s) selected
                  </span>
                  <Select value={bulkReason} onValueChange={v => setBulkReason(v as NotCoveredReason)}>
                    <SelectTrigger className="w-[250px]" data-testid="select-bulk-reason">
                      <SelectValue placeholder="Select reason..." />
                    </SelectTrigger>
                    <SelectContent>
                      {NOT_COVERED_REASONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label} <span dir="rtl" className="text-muted-foreground/70 text-xs ml-1">{r.labelAr}</span></SelectItem>)}
                    </SelectContent>
                  </Select>
                  {bulkReason === 'other' && (
                    <Textarea
                      placeholder="Specify reason..."
                      value={bulkOtherText}
                      onChange={e => setBulkOtherText(e.target.value)}
                      className="w-[250px] h-8 min-h-[32px]"
                      data-testid="input-bulk-other-reason"
                    />
                  )}
                  <Button
                    size="sm"
                    onClick={handleBulkAssignReason}
                    disabled={!bulkReason || saving || (bulkReason === 'other' && !bulkOtherText.trim())}
                    data-testid="button-bulk-assign"
                  >
                    Assign to All
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {loading ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">Loading uncovered sites...</CardContent>
            </Card>
          ) : filteredSites.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-4" />
                <h3 className="text-lg font-medium">
                  {uncoveredSites.length === 0 ? 'No Uncovered Sites' : 'No matching sites'}
                </h3>
                <p className="text-muted-foreground text-sm mt-1">
                  {uncoveredSites.length === 0 ? 'All sites have been covered or no cycle is in closing phase.' : 'Try adjusting your filters.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center px-3 py-2 bg-muted rounded-t-lg text-xs font-medium text-muted-foreground">
                <div className="w-8">
                  <Checkbox
                    checked={filteredSites.length > 0 && filteredSites.every(s => selectedSites.has(s.id))}
                    onCheckedChange={toggleAllFiltered}
                    data-testid="checkbox-select-all"
                  />
                </div>
                <div className="flex-1 grid grid-cols-6 gap-2">
                  <span className="col-span-2">Site</span>
                  <span>State</span>
                  <span>Hub</span>
                  <span>Status</span>
                  <span>Reason</span>
                </div>
              </div>
              {filteredSites.map(site => (
                <SiteRow
                  key={site.id}
                  site={site}
                  selected={selectedSites.has(site.id)}
                  onToggle={() => toggleSiteSelection(site.id)}
                  onAssignReason={handleAssignReason}
                  canAssign={canAssignReasons}
                  saving={saving}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <CycleReportsTab
            reasonBreakdown={reasonBreakdown}
            hubBreakdown={hubBreakdown}
            cycleStats={cycleStats}
            followUps={followUps}
            qualityData={qualityData}
            uncoveredSitesCount={uncoveredSites.length}
            getReasonLabel={getReasonLabel}
          />
        </TabsContent>

        <TabsContent value="comparison" className="space-y-4">
          <CycleComparisonTab
            closedCycles={closedCycles}
            comparisonCycle1={comparisonCycle1}
            comparisonCycle2={comparisonCycle2}
            setComparisonCycle1={setComparisonCycle1}
            setComparisonCycle2={setComparisonCycle2}
            getReasonLabel={getReasonLabel}
          />
        </TabsContent>

        <TabsContent value="scorecard" className="space-y-4">
          <CycleScorecardTab
            closedCycles={closedCycles}
            getReasonLabel={getReasonLabel}
          />
        </TabsContent>

        <TabsContent value="archive" className="space-y-4">
          {closedCycles.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No Closed Cycles</h3>
                <p className="text-muted-foreground text-sm mt-1">Closed MMP cycles will appear here for historical review.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {closedCycles.length > 3 && (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search closed cycles by name or region..."
                    value={archiveSearch}
                    onChange={e => setArchiveSearch(e.target.value)}
                    className="pl-9 max-w-sm"
                    data-testid="input-search-archive"
                  />
                </div>
              )}
              <div className="space-y-3">
                {filteredClosedCycles.map(cycle => {
                  const coverageRate = cycle.totalSites > 0 ? Math.round((cycle.completedSites / cycle.totalSites) * 100) : 0;
                  return (
                    <Card key={cycle.id} data-testid={`card-closed-cycle-${cycle.id}`}>
                      <CardHeader className="pb-2 cursor-pointer hover-elevate" onClick={() => setExpandedCycle(expandedCycle === cycle.id ? null : cycle.id)}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <CardTitle className="text-base" data-testid={`text-closed-name-${cycle.id}`}>{cycle.name}</CardTitle>
                            <CardDescription className="text-xs">
                              {cycle.region || 'No region'} &middot; {cycle.month ? `Month ${cycle.month}` : ''} {cycle.year || ''} &middot;
                              Closed: {cycle.cycle_closed_at ? new Date(cycle.cycle_closed_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A'}
                            </CardDescription>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge variant={coverageRate >= 80 ? 'secondary' : 'destructive'} className="text-xs" data-testid={`badge-coverage-${cycle.id}`}>
                              {coverageRate}% covered
                            </Badge>
                            <Badge variant="outline">Closed</Badge>
                            {expandedCycle === cycle.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </div>
                        </div>
                      </CardHeader>
                      {expandedCycle === cycle.id && (
                        <CardContent className="pt-0 space-y-3">
                          <div className="grid grid-cols-4 gap-3 text-center text-sm">
                            <div className="bg-muted rounded-lg p-3">
                              <div className="text-lg font-bold" data-testid={`text-archive-total-${cycle.id}`}>{cycle.totalSites}</div>
                              <div className="text-xs text-muted-foreground">Total Sites</div>
                            </div>
                            <div className="bg-green-50 dark:bg-green-950 rounded-lg p-3">
                              <div className="text-lg font-bold text-green-600 dark:text-green-400" data-testid={`text-archive-completed-${cycle.id}`}>{cycle.completedSites}</div>
                              <div className="text-xs text-muted-foreground">Completed</div>
                            </div>
                            <div className="bg-red-50 dark:bg-red-950 rounded-lg p-3">
                              <div className="text-lg font-bold text-red-600 dark:text-red-400" data-testid={`text-archive-uncovered-${cycle.id}`}>{cycle.uncoveredSites}</div>
                              <div className="text-xs text-muted-foreground">Uncovered</div>
                            </div>
                            <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-3">
                              <div className="text-lg font-bold text-blue-600 dark:text-blue-400" data-testid={`text-archive-coverage-${cycle.id}`}>{coverageRate}%</div>
                              <div className="text-xs text-muted-foreground">Coverage</div>
                            </div>
                          </div>
                          {cycle.reasonBreakdown && Object.keys(cycle.reasonBreakdown).length > 0 && (
                            <div className="space-y-1.5">
                              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Reason Breakdown</h4>
                              {Object.entries(cycle.reasonBreakdown).sort((a,b) => b[1]-a[1]).map(([reason, count]) => (
                                <div key={reason} className="flex items-center justify-between gap-2 text-sm">
                                  <span className="text-muted-foreground">{getReasonLabel(reason)} <span dir="rtl" className="text-muted-foreground/70 text-xs">{getReasonLabelAr(reason)}</span></span>
                                  <Badge variant="outline" className="text-xs">{count}</Badge>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => exportCoverageReport(cycle.id)} data-testid={`button-export-csv-${cycle.id}`}>
                              <Download className="h-3 w-3 mr-1" /> CSV
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => exportCoverageReportExcel(cycle.id)} data-testid={`button-export-xlsx-${cycle.id}`}>
                              <FileSpreadsheet className="h-3 w-3 mr-1" /> Excel
                            </Button>
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  );
                })}
              </div>
            </>
          )}

          {closedCycles.length > 1 && (
            <Card data-testid="card-trend-analysis">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" /> Trend Analysis Across Cycles
                </CardTitle>
                <CardDescription>Recurring patterns in uncovered site reasons</CardDescription>
              </CardHeader>
              <CardContent>
                {(() => {
                  const aggregated: Record<string, number> = {};
                  closedCycles.forEach(c => {
                    if (c.reasonBreakdown) {
                      Object.entries(c.reasonBreakdown).forEach(([reason, count]) => {
                        aggregated[reason] = (aggregated[reason] || 0) + count;
                      });
                    }
                  });
                  const total = Object.values(aggregated).reduce((a, b) => a + b, 0);
                  if (total === 0) return <p className="text-muted-foreground text-sm text-center py-4">No trend data available</p>;
                  return (
                    <div className="space-y-2">
                      {Object.entries(aggregated).sort((a, b) => b[1] - a[1]).map(([reason, count]) => (
                        <div key={reason} className="space-y-1">
                          <div className="flex items-center justify-between gap-2 text-sm">
                            <span>{getReasonLabel(reason)} <span dir="rtl" className="text-muted-foreground/70 text-xs">{getReasonLabelAr(reason)}</span></span>
                            <span className="text-xs text-muted-foreground">{count} ({Math.round((count / total) * 100)}%)</span>
                          </div>
                          <div className="w-full bg-muted rounded-full h-2">
                            <div
                              className="h-2 rounded-full bg-indigo-500"
                              style={{ width: `${(count / total) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                      <p className="text-xs text-muted-foreground mt-3">Aggregated across {closedCycles.length} closed cycles</p>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {financeOverrideDialog && (
        <AlertDialog open onOpenChange={open => { if (!open) setFinanceOverrideDialog(null); }}>
          <AlertDialogContent data-testid="dialog-finance-override">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <ShieldAlert className="h-5 w-5" />
                Super Admin Finance Gate Override
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3">
                  <p className="text-sm">
                    The following finance obligations are still pending. As Super Admin you may override, but this action will be permanently logged to the audit trail.
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-md p-3 border border-amber-500/20">
                    {financeOverrideDialog.issues.map((issue, i) => (
                      <li key={i}>{issue}</li>
                    ))}
                  </ul>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground" htmlFor="finance-override-justification">
                      Override Justification <span className="text-red-500">*</span>
                    </label>
                    <Textarea
                      id="finance-override-justification"
                      value={financeOverrideJustification}
                      onChange={e => setFinanceOverrideJustification(e.target.value)}
                      placeholder="Provide a written justification for overriding the finance gate..."
                      className="text-sm min-h-[80px]"
                      data-testid="textarea-finance-override-justification"
                    />
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setFinanceOverrideDialog(null)} data-testid="button-cancel-finance-override">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleFinanceOverrideConfirm}
                disabled={!financeOverrideJustification.trim()}
                className="bg-amber-600 hover:bg-amber-700 text-white"
                data-testid="button-confirm-finance-override"
              >
                Override & Proceed
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
};

interface SiteRowProps {
  site: UncoveredSite;
  selected: boolean;
  onToggle: () => void;
  onAssignReason: (siteId: string, reason: NotCoveredReason, otherText?: string) => void;
  canAssign: boolean;
  saving: boolean;
}

const SiteRow = ({ site, selected, onToggle, onAssignReason, canAssign, saving }: SiteRowProps) => {
  const [localReason, setLocalReason] = useState<NotCoveredReason | ''>(site.not_covered_reason || '');
  const [localOther, setLocalOther] = useState(site.not_covered_reason_other || '');
  const [expanded, setExpanded] = useState(false);

  const handleSaveReason = () => {
    if (!localReason) return;
    onAssignReason(site.id, localReason as NotCoveredReason, localReason === 'other' ? localOther : undefined);
  };

  return (
    <div className={`border rounded-lg px-3 py-2 ${selected ? 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800' : 'bg-card'}`} data-testid={`row-site-${site.id}`}>
      <div className="flex items-center">
        <div className="w-8">
          <Checkbox checked={selected} onCheckedChange={onToggle} data-testid={`checkbox-site-${site.id}`} />
        </div>
        <div className="flex-1 grid grid-cols-6 gap-2 items-center text-sm cursor-pointer" onClick={() => setExpanded(!expanded)}>
          <div className="col-span-2">
            <div className="font-medium truncate">{site.site_name}</div>
            <div className="text-xs text-muted-foreground">{site.site_code}</div>
          </div>
          <div className="text-muted-foreground truncate">{site.state}</div>
          <div className="text-muted-foreground truncate">{site.hub || '—'}</div>
          <div>
            <Badge variant="outline">{site.status}</Badge>
          </div>
          <div>
            <Badge variant={getReasonBadgeVariant(site.not_covered_reason)} data-testid={`badge-reason-${site.id}`}>
              {site.not_covered_reason ? (<>{getReasonLabel(site.not_covered_reason)} <span dir="rtl" className="text-muted-foreground/70 text-[10px]">{getReasonLabelAr(site.not_covered_reason)}</span></>) : 'No Reason'}
            </Badge>
          </div>
        </div>
        <div className="w-6">
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {expanded && canAssign && (
        <div className="mt-3 pt-3 border-t pl-8">
          <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-end">
            <div className="space-y-1 flex-1">
              <label className="text-xs text-muted-foreground">Reason for Not Covered</label>
              <Select value={localReason} onValueChange={v => setLocalReason(v as NotCoveredReason)}>
                <SelectTrigger className="w-full" data-testid={`select-reason-${site.id}`}>
                  <SelectValue placeholder="Select reason..." />
                </SelectTrigger>
                <SelectContent>
                  {NOT_COVERED_REASONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label} <span dir="rtl" className="text-muted-foreground/70 text-xs ml-1">{r.labelAr}</span></SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {localReason === 'other' && (
              <div className="space-y-1 flex-1">
                <label className="text-xs text-muted-foreground">Details</label>
                <Textarea
                  value={localOther}
                  onChange={e => setLocalOther(e.target.value)}
                  placeholder="Specify reason..."
                  className="min-h-[32px] h-8"
                  data-testid={`input-other-reason-${site.id}`}
                />
              </div>
            )}
            <Button
              size="sm"
              onClick={handleSaveReason}
              disabled={!localReason || saving || (localReason === 'other' && !localOther.trim())}
              data-testid={`button-save-reason-${site.id}`}
            >
              Save
            </Button>
          </div>
          {site.not_covered_at && (
            <p className="text-xs text-muted-foreground mt-2">
              Last updated: {new Date(site.not_covered_at).toLocaleString()}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

function getReasonBadgeVariant(reason: string | null): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (!reason) return 'destructive';
  return 'secondary';
}

function getReasonLabel(reason: string | null) {
  if (!reason) return 'Pending';
  const r = NOT_COVERED_REASONS.find(nr => nr.value === reason);
  return r?.label || reason;
}

function getReasonLabelAr(reason: string | null) {
  if (!reason) return 'معلق';
  const r = NOT_COVERED_REASONS.find(nr => nr.value === reason);
  return r?.labelAr || '';
}

export default MMPCycleClose;
