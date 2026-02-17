import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppContext } from '@/context/AppContext';
import { useMMP } from '@/context/mmp/MMPContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { NotificationTriggerService } from '@/services/NotificationTriggerService';
import { logMMPAudit } from '@/services/mmpAudit.service';
import { checkAndSendCycleReminders } from '@/services/cycleReminderService';
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
  Bell, TrendingUp, TrendingDown, Minus, Star, Shield,
  Activity, Target, Layers, SortAsc, SortDesc
} from 'lucide-react';
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

interface FollowUpRecord {
  id: string;
  siteId: string;
  siteName: string;
  reason: string;
  suggestedAction: string;
  createdAt: string;
  mmpName?: string;
}

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
  const [qualityData, setQualityData] = useState<{ hub: string; avgScore: number; count: number }[]>([]);
  const [activeHubFilter, setActiveHubFilter] = useState<string>('all');
  const [activeSort, setActiveSort] = useState<'name' | 'coverage' | 'status'>('status');
  const [activeSortDir, setActiveSortDir] = useState<'asc' | 'desc'>('desc');
  const [archiveSearch, setArchiveSearch] = useState('');

  const isAdmin = hasAnyRole(['admin', 'Admin', 'super_admin', 'Super Admin']);
  const isSupervisor = hasAnyRole(['Supervisor', 'supervisor']);
  const isFOM = hasAnyRole(['fom', 'Field Operation Manager (FOM)']);
  const canManageCycle = isAdmin;
  const canAssignReasons = isAdmin || isSupervisor || isFOM;

  const [userHubName, setUserHubName] = useState<string>('');

  useEffect(() => {
    if (isSupervisor && currentUser?.hubId) {
      supabase.from('hubs').select('name').eq('id', currentUser.hubId).single()
        .then(({ data }) => {
          if (data?.name) {
            setUserHubName(data.name);
            setFilterHub(data.name);
          }
        });
    }
  }, [isSupervisor, currentUser?.hubId]);

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
        .select('id, name, month, year, region, cycle_status, cycle_closed_at')
        .eq('cycle_status', 'closed')
        .order('cycle_closed_at', { ascending: false });

      if (error) throw error;

      const records: ClosedCycleRecord[] = (data || []).map(m => ({
        id: m.id,
        name: m.name,
        month: m.month,
        year: m.year,
        region: m.region,
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

  useEffect(() => {
    fetchUncoveredSites();
    fetchClosedCycles();
  }, [fetchUncoveredSites, fetchClosedCycles]);

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
          .select('mmp_id, quality_score')
          .not('quality_score', 'is', null);
        if (data && data.length > 0) {
          const hubScores: Record<string, { total: number; count: number }> = {};
          data.forEach((s: any) => {
            const mmp = mmpFiles?.find(m => m.id === s.mmp_id);
            const hub = mmp?.hub || mmp?.region || 'Unknown';
            if (!hubScores[hub]) hubScores[hub] = { total: 0, count: 0 };
            hubScores[hub].total += s.quality_score;
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
      if (filterHub !== 'all' && site.hub !== filterHub) return false;
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
      const { error } = await supabase
        .from('mmp_files')
        .update({
          cycle_status: 'closing',
          cycle_closing_started_at: new Date().toISOString(),
          cycle_closing_started_by: currentUser?.id,
          cycle_close_deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
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

      toast({ title: 'Bulk Assign Complete', description: `Reason assigned to ${siteIds.length} sites.` });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to bulk assign', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleFinalizeCycleClose = async (mmpId: string) => {
    if (!canManageCycle) return;
    const unreasoned = uncoveredSites.filter(s => s.mmp_id === mmpId && !s.not_covered_reason);
    if (unreasoned.length > 0) {
      toast({ title: 'Cannot Close', description: `${unreasoned.length} sites still need a reason. All uncovered sites must have reasons before closing.`, variant: 'destructive' });
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

  const handleApproveCycle = async (mmpId: string) => {
    try {
      const { error } = await supabase
        .from('mmp_files')
        .update({
          cycle_status: 'closed',
          cycle_closed_at: new Date().toISOString(),
          cycle_closed_by: currentUser?.id,
          cycle_approved_by: currentUser?.id,
        } as any)
        .eq('id', mmpId);

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

      let recipientQuery = supabase
        .from('profiles')
        .select('id, full_name, hub_id, role')
        .in('role', ['Supervisor', 'supervisor', 'fom', 'Field Operation Manager (FOM)'])
        .eq('status', 'approved');

      if (mmpHub) {
        const { data: hubData } = await supabase
          .from('hubs')
          .select('id')
          .ilike('name', `%${mmpHub}%`)
          .limit(1);
        if (hubData && hubData.length > 0) {
          recipientQuery = recipientQuery.eq('hub_id', hubData[0].id);
        }
      }

      const { data: recipients } = await recipientQuery;

      if (recipients && recipients.length > 0) {
        await Promise.allSettled(
          recipients.map(r =>
            NotificationTriggerService.send({
              userId: r.id,
              title: `OVERDUE: Cycle Close Reasons Required`,
              message: `MMP "${mmpName}" cycle close is overdue. Please submit remaining reasons for uncovered sites immediately.`,
              titleAr: `متأخر: أسباب إغلاق الدورة مطلوبة`,
              messageAr: `إغلاق دورة MMP "${mmpName}" متأخر. يرجى تقديم الأسباب المتبقية للمواقع غير المغطاة فوراً.`,
              type: 'error',
              category: 'assignments',
              priority: 'urgent',
              link: '/mmp/cycle-close?tab=uncovered',
              relatedEntityId: mmpId,
              relatedEntityType: 'mmpFile',
            })
          )
        );
      }

      toast({ title: 'Reminders Sent', description: `Reminders sent to ${recipients?.length || 0} supervisors and FOMs.` });
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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">MMP Cycle Close</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage MMP cycle lifecycle and track coverage gaps
          </p>
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
        </div>
      </div>

      {overallSummary.totalMmps > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6" data-testid="summary-dashboard">
          <Card>
            <CardContent className="p-3 text-center">
              <Layers className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
              <div className="text-xl font-bold" data-testid="text-total-mmps">{overallSummary.totalMmps}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Active MMPs</div>
              <div className="flex justify-center gap-1 mt-1 flex-wrap">
                {overallSummary.activeCount > 0 && <Badge variant="secondary" data-testid="badge-active-count">{overallSummary.activeCount} Active</Badge>}
                {overallSummary.closingCount > 0 && <Badge variant="destructive" data-testid="badge-closing-count">{overallSummary.closingCount} Closing</Badge>}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <Target className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
              <div className="text-xl font-bold" data-testid="text-overall-coverage">{overallSummary.overallCoverage}%</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Site Coverage</div>
              <Progress value={overallSummary.overallCoverage} className="h-1 mt-1.5" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <CheckCircle2 className="h-4 w-4 mx-auto text-green-500 mb-1" />
              <div className="text-xl font-bold text-green-600 dark:text-green-400" data-testid="text-completed-total">{overallSummary.completedSites}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Completed</div>
              <div className="text-xs text-muted-foreground mt-1">of {overallSummary.totalSites} sites</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <AlertTriangle className="h-4 w-4 mx-auto text-red-500 mb-1" />
              <div className="text-xl font-bold text-red-600 dark:text-red-400" data-testid="text-uncovered-total">{overallSummary.totalUncovered}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Uncovered</div>
              {overallSummary.totalUncovered > 0 && (
                <div className="text-xs text-muted-foreground mt-1">{overallSummary.totalReasoned} reasoned</div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <Activity className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
              <div className="text-xl font-bold" data-testid="text-reason-completion">{overallSummary.reasonCompletion}%</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Reasons Done</div>
              {overallSummary.totalUncovered > 0 && (
                <Progress value={overallSummary.reasonCompletion} className="h-1 mt-1.5" />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              {overallSummary.overdueCount > 0 ? (
                <>
                  <Clock className="h-4 w-4 mx-auto text-destructive mb-1" />
                  <div className="text-xl font-bold text-destructive" data-testid="text-overdue-count">{overallSummary.overdueCount}</div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider">Overdue</div>
                </>
              ) : overallSummary.pendingApprovalCount > 0 ? (
                <>
                  <Shield className="h-4 w-4 mx-auto text-purple-500 mb-1" />
                  <div className="text-xl font-bold text-purple-600 dark:text-purple-400" data-testid="text-pending-approval">{overallSummary.pendingApprovalCount}</div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider">Awaiting Approval</div>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mx-auto text-green-500 mb-1" />
                  <div className="text-xl font-bold text-green-600 dark:text-green-400" data-testid="text-on-track">0</div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider">Overdue</div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList data-testid="tabs-cycle-close" className="flex-wrap">
          <TabsTrigger value="active" data-testid="tab-active">Active Cycles</TabsTrigger>
          <TabsTrigger value="uncovered" data-testid="tab-uncovered">Uncovered Sites ({cycleStats.uncoveredSites})</TabsTrigger>
          <TabsTrigger value="reports" data-testid="tab-reports">Reports</TabsTrigger>
          <TabsTrigger value="comparison" data-testid="tab-comparison">Comparison</TabsTrigger>
          <TabsTrigger value="scorecard" data-testid="tab-scorecard">Scorecard</TabsTrigger>
          <TabsTrigger value="archive" data-testid="tab-archive">Closed Cycles ({closedCycles.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4">
          {activeMmps.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No Active MMP Cycles</h3>
                <p className="text-muted-foreground mt-1 text-sm">All MMP cycles have been closed or there are no approved MMPs.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row gap-3 items-end" data-testid="active-filters">
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
                <div className="text-xs text-muted-foreground ml-auto">
                  Showing {filteredActiveMmps.length} of {activeMmps.length} MMPs
                </div>
              </div>

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
                      handleStartClosingCycle={handleStartClosingCycle}
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

          {canManageCycle && (
            <div className="flex gap-2 mt-4">
              <Button variant="outline" size="sm" onClick={handleScheduleReminders} data-testid="button-schedule-reminders">
                <Bell className="h-4 w-4 mr-1" /> Schedule Reminders
              </Button>
            </div>
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
                {NOT_COVERED_REASONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
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
                      {NOT_COVERED_REASONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
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
                                  <span className="text-muted-foreground">{getReasonLabel(reason)}</span>
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
                            <span>{getReasonLabel(reason)}</span>
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
    <div className={`border rounded-lg px-3 py-2 ${selected ? 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800' : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700'}`} data-testid={`row-site-${site.id}`}>
      <div className="flex items-center">
        <div className="w-8">
          <Checkbox checked={selected} onCheckedChange={onToggle} data-testid={`checkbox-site-${site.id}`} />
        </div>
        <div className="flex-1 grid grid-cols-6 gap-2 items-center text-sm cursor-pointer" onClick={() => setExpanded(!expanded)}>
          <div className="col-span-2">
            <div className="font-medium text-gray-900 dark:text-white truncate">{site.site_name}</div>
            <div className="text-xs text-gray-500">{site.site_code}</div>
          </div>
          <div className="text-gray-600 dark:text-gray-400 truncate">{site.state}</div>
          <div className="text-gray-600 dark:text-gray-400 truncate">{site.hub || '—'}</div>
          <div>
            <Badge variant="outline" className="text-xs">{site.status}</Badge>
          </div>
          <div>
            <Badge variant={getReasonBadgeVariant(site.not_covered_reason)} className="text-xs" data-testid={`badge-reason-${site.id}`}>
              {site.not_covered_reason ? getReasonLabel(site.not_covered_reason) : 'No Reason'}
            </Badge>
          </div>
        </div>
        <div className="w-6">
          {expanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </div>
      </div>

      {expanded && canAssign && (
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 pl-8">
          <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-end">
            <div className="space-y-1 flex-1">
              <label className="text-xs text-gray-500">Reason for Not Covered</label>
              <Select value={localReason} onValueChange={v => setLocalReason(v as NotCoveredReason)}>
                <SelectTrigger className="w-full" data-testid={`select-reason-${site.id}`}>
                  <SelectValue placeholder="Select reason..." />
                </SelectTrigger>
                <SelectContent>
                  {NOT_COVERED_REASONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {localReason === 'other' && (
              <div className="space-y-1 flex-1">
                <label className="text-xs text-gray-500">Details</label>
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
            <p className="text-xs text-gray-400 mt-2">
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

export default MMPCycleClose;
