import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { GradientStatCard } from '@/components/ui/gradient-stat-card';
import { 
  ClipboardList, 
  Calendar, 
  DollarSign, 
  MapPin, 
  Activity,
  CheckCircle2,
  Clock,
  AlertCircle,
  TrendingUp,
  Users,
  Zap,
  Target,
  BarChart3,
  ExternalLink,
  FileText
} from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import SiteVisitsOverview from '../SiteVisitsOverview';
import UpcomingSiteVisitsCard from '../UpcomingSiteVisitsCard';
import { SiteVisitCostSummary } from '../SiteVisitCostSummary';
import { DashboardCalendar } from '../DashboardCalendar';
import { ZoneMmpAnalyticsTab } from '../shared/ZoneMmpAnalyticsTab';
import { useSiteVisitContext } from '@/context/siteVisit/SiteVisitContext';
import { useUser } from '@/context/user/UserContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { fetchHubs } from '@/services/mmpActions';
import { isAfter, addDays } from 'date-fns';
import { getStateName, sudanStates } from '@/data/sudanStates';
import { useMMP } from '@/context/mmp/MMPContext';
import { useUserProjects } from '@/hooks/useUserProjects';
import { supabase } from '@/integrations/supabase/client';
import { useZoneMmpAnalytics } from '@/hooks/use-zone-mmp-analytics';
import { useDashboardMmpFilter } from '@/context/dashboard/DashboardMmpFilterContext';

type MetricCardType = 'total' | 'completed' | 'assigned' | 'pending' | 'overdue' | 'performance' | null;

interface Filters {
  hub: string;
  state: string;
  locality: string;
  coordinator: string;
  enumerator: string;
  status: string;
}

export const OperationsZone: React.FC = () => {
  const { siteVisits: allSiteVisits } = useSiteVisitContext();
  const { users, currentUser } = useUser();
  const { hasAnyRole } = useAuthorization();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [supervisorHubName, setSupervisorHubName] = useState<string | null>(null);
  const { userProjectIds, isAdminOrSuperUser } = useUserProjects();
  const { mmpFiles: contextMmpFiles, loading: contextLoading } = useMMP();

  const mmpAnalytics = useZoneMmpAnalytics();
  const { filterSiteVisitsByMmp, isFiltering: isMmpFiltering } = useDashboardMmpFilter();

  // Check if user is a supervisor (not admin/ict)
  const isSupervisor = useMemo(() => {
    if (!currentUser) return false;
    const role = (currentUser.role || '').toLowerCase();
    const isAdmin = hasAnyRole(['admin', 'ict', 'super_admin', 'superadmin', 'fom', 'finance', 'financialadmin']);
    return (hasAnyRole(['supervisor', 'Supervisor', 'hubsupervisor']) || role === 'supervisor' || role === 'hubsupervisor') && !isAdmin;
  }, [currentUser, hasAnyRole]);

  // Check if user is a coordinator (not admin/ict/supervisor)
  const isCoordinator = useMemo(() => {
    if (!currentUser) return false;
    const role = (currentUser.role || '').toLowerCase();
    const isAdmin = hasAnyRole(['admin', 'ict', 'super_admin', 'superadmin', 'fom', 'finance', 'financialadmin']);
    const isSupervisorRole = hasAnyRole(['supervisor', 'Supervisor', 'hubsupervisor']) || role === 'supervisor' || role === 'hubsupervisor';
    return (hasAnyRole(['coordinator', 'Coordinator']) || role === 'coordinator') && !isAdmin && !isSupervisorRole;
  }, [currentUser, hasAnyRole]);

  // State for coordinator's state name
  const [coordinatorStateName, setCoordinatorStateName] = useState<string | null>(null);
  
  // State for directly loaded dispatched sites (for coordinators/data collectors)
  const [dispatchedSitesFromDB, setDispatchedSitesFromDB] = useState<any[]>([]);
  const [closingCycles, setClosingCycles] = useState<{ id: string; name: string; deadline: string | null; uncovered: number; reasoned: number }[]>([]);
  const [cycleSummary, setCycleSummary] = useState<{ active: number; closing: number; pending_approval: number; closed: number }>({ active: 0, closing: 0, pending_approval: 0, closed: 0 });

  useEffect(() => {
    const isAdminUser = hasAnyRole(['admin', 'Admin', 'super_admin', 'Super Admin', 'ict']);
    if (!isAdminUser) return;
    const fetchCycleData = async () => {
      const { data: allMmps } = await supabase
        .from('mmp_files')
        .select('id, name, cycle_status, cycle_close_deadline');
      if (!allMmps) { setClosingCycles([]); return; }

      const counts = { active: 0, closing: 0, pending_approval: 0, closed: 0 };
      allMmps.forEach(m => {
        const cs = (m as any).cycle_status || 'active';
        if (cs === 'closing') counts.closing++;
        else if (cs === 'pending_approval') counts.pending_approval++;
        else if (cs === 'closed') counts.closed++;
        else counts.active++;
      });
      setCycleSummary(counts);

      const closingMmps = allMmps.filter(m => (m as any).cycle_status === 'closing');
      if (closingMmps.length === 0) { setClosingCycles([]); return; }
      const mmpIds = closingMmps.map(m => m.id);
      const { data: sites } = await supabase
        .from('site_visits')
        .select('mmp_id, not_covered_reason')
        .in('mmp_id', mmpIds)
        .eq('not_covered_flag', true);
      setClosingCycles(closingMmps.map(m => {
        const mSites = (sites || []).filter(s => s.mmp_id === m.id);
        return { id: m.id, name: m.name, deadline: (m as any).cycle_close_deadline, uncovered: mSites.length, reasoned: mSites.filter(s => s.not_covered_reason).length };
      }));
    };
    fetchCycleData();
  }, [hasAnyRole]);

  // Fetch supervisor's hub name (supports primary and secondary hubs)
  useEffect(() => {
    if (!isSupervisor || !currentUser?.hubId) {
      setSupervisorHubName(null);
      return;
    }
    const fetchHubName = async () => {
      try {
        const hubs = await fetchHubs();
        const primaryHub = hubs.find(h => h.id === currentUser.hubId);
        const secondaryHub = (currentUser as any)?.secondaryHubId 
          ? hubs.find(h => h.id === (currentUser as any).secondaryHubId)
          : null;
        
        if (primaryHub) {
          const hubName = secondaryHub 
            ? `${primaryHub.name} & ${secondaryHub.name}`
            : primaryHub.name;
          setSupervisorHubName(hubName);
          console.log(`📊 OperationsZone: Supervisor hub loaded: ${hubName}`);
        }
      } catch (error) {
        console.error('Error fetching hub name:', error);
      }
    };
    fetchHubName();
  }, [isSupervisor, currentUser?.hubId, (currentUser as any)?.secondaryHubId]);

  // Get coordinator's state name from local data
  useEffect(() => {
    if (!isCoordinator || !currentUser?.stateId) {
      setCoordinatorStateName(null);
      return;
    }
    const stateName = getStateName(currentUser.stateId);
    setCoordinatorStateName(stateName);
    console.log(`📊 OperationsZone: Coordinator state loaded: ${stateName} (id: ${currentUser.stateId})`);
  }, [isCoordinator, currentUser?.stateId]);

  // Direct load of dispatched sites for coordinators from database
  // This ensures consistent counts with the MMP page
  useEffect(() => {
    const loadDispatchedSites = async () => {
      if (!isCoordinator || !currentUser?.id) {
        setDispatchedSitesFromDB([]);
        return;
      }
      
      try {
        // Determine state name using multiple approaches
        let stateName = sudanStates.find(s => s.id === currentUser.stateId)?.name;
        if (!stateName) {
          const stateByName = sudanStates.find(s => 
            s.name.toLowerCase() === (currentUser.stateId || '').toLowerCase()
          );
          if (stateByName) stateName = stateByName.name;
        }
        if (!stateName && currentUser.stateId) {
          stateName = currentUser.stateId;
        }
        
        if (!stateName) {
          console.log('[OperationsZone] No state for coordinator, skipping direct load');
          return;
        }
        
        console.log(`[OperationsZone] Loading dispatched sites for state: ${stateName}`);
        
        const { data: sites, error } = await supabase
          .from('mmp_site_entries')
          .select('*')
          .ilike('status', 'Dispatched')
          .is('accepted_by', null)
          .ilike('state', `%${stateName}%`)
          .limit(500);
        
        if (error) {
          console.error('[OperationsZone] Error loading dispatched sites:', error);
          return;
        }
        
        console.log(`📊 [OperationsZone] Loaded ${sites?.length || 0} dispatched sites from DB`);
        
        if (sites && sites.length > 0) {
          // Transform to site visit format for metrics
          const transformed = sites.map(entry => ({
            id: entry.id,
            siteName: entry.site_name,
            siteCode: entry.site_code,
            status: 'dispatched', // Keep as dispatched for counting
            state: entry.state,
            locality: entry.locality,
            hub: entry.hub_office,
            dueDate: entry.visit_date || new Date().toISOString(),
          }));
          setDispatchedSitesFromDB(transformed);
        }
      } catch (error) {
        console.error('[OperationsZone] Failed to load dispatched sites:', error);
      }
    };
    
    loadDispatchedSites();
  }, [isCoordinator, currentUser?.id, currentUser?.stateId]);

  const roleFilteredSiteVisits = useMemo(() => {
    console.log(`📊 OperationsZone: isSupervisor=${isSupervisor}, isCoordinator=${isCoordinator}, allSiteVisits=${allSiteVisits.length}`);
    console.log(`📊 OperationsZone: supervisorHubName=${supervisorHubName}, coordinatorStateName=${coordinatorStateName}`);
    
    // Supervisor: filter by hub (supports primary and secondary hubs)
    if (isSupervisor) {
      if (!supervisorHubName) {
        console.warn('⚠️ OperationsZone: Supervisor has no hub assigned - showing no sites');
        return [];
      }
      
      // Extract hub names and create lower-case versions for comparison
      const hubNames = supervisorHubName.split(' & ').map(h => h.toLowerCase().trim());
      const filtered = allSiteVisits.filter(visit => {
        const visitHub = (visit.hub || '').toLowerCase().trim();
        if (!visitHub) return false;
        // Check if visit hub matches any of the supervisor's hubs
        return hubNames.some(hubName => 
          visitHub === hubName || 
          visitHub.includes(hubName) ||
          (visitHub.length > 0 && hubName.includes(visitHub))
        );
      });
      
      console.log(`📊 OperationsZone: Filtered to ${filtered.length} sites for hubs "${supervisorHubName}"`);
      return filtered;
    }
    
    // Coordinator: show all site visits relevant to this coordinator
    if (isCoordinator) {
      if (!currentUser?.id) {
        console.log(`📊 OperationsZone: Coordinator - no user, showing no sites`);
        return [];
      }
      
      const seenIds = new Set<string>();
      const allSites: any[] = [];
      
      // 1. Include site visits from the main context that are assigned to this coordinator
      allSiteVisits.forEach(visit => {
        if (seenIds.has(visit.id)) return;
        const isAssigned = visit.assignedTo === currentUser.id;
        const isForwarded = (visit as any).forwardedToUserId === currentUser.id;
        const isAccepted = (visit as any).acceptedBy === currentUser.id;
        if (isAssigned || isForwarded || isAccepted) {
          seenIds.add(visit.id);
          allSites.push(visit);
        }
      });
      console.log(`📊 OperationsZone: Added ${allSites.length} assigned/accepted site visits from context`);
      
      // 2. Add dispatched sites in the coordinator's state (available to claim)
      if (dispatchedSitesFromDB.length > 0) {
        dispatchedSitesFromDB.forEach(site => {
          if (!seenIds.has(site.id)) {
            seenIds.add(site.id);
            allSites.push(site);
          }
        });
        console.log(`📊 OperationsZone: Added dispatched sites from DB (total now: ${allSites.length})`);
      }
      
      // 3. Also collect site entries from MMP context forwarded/assigned to this coordinator
      if (contextMmpFiles && !contextLoading) {
        contextMmpFiles.forEach((mmp: any) => {
          if (!mmp.siteEntries || !Array.isArray(mmp.siteEntries)) return;
          
          mmp.siteEntries.forEach((entry: any) => {
            const isForwardedToMe = entry.forwardedToUserId === currentUser.id;
            const isAssignedToMe = (entry.additionalData?.assigned_to || entry.additional_data?.assigned_to) === currentUser.id;
            const isAcceptedByMe = entry.accepted_by === currentUser.id;
            if (!isForwardedToMe && !isAssignedToMe && !isAcceptedByMe) return;
            if (seenIds.has(entry.id)) return;
            
            seenIds.add(entry.id);
            allSites.push({
              id: entry.id,
              siteName: entry.siteName || entry.site_name,
              siteCode: entry.siteCode || entry.site_code,
              status: entry.status,
              state: entry.state,
              locality: entry.locality,
              activity: entry.siteActivity || entry.activity_at_site || entry.mainActivity,
              mainActivity: entry.mainActivity || entry.main_activity,
              visitDate: entry.visitDate,
              assignedAt: entry.additionalData?.assigned_at || entry.additional_data?.assigned_at,
              comments: entry.comments,
              mmpFileId: mmp.id,
              hub: entry.hubOffice || entry.hub_office,
              cpName: entry.cpName || entry.cp_name,
              monitoringBy: entry.monitoringBy || entry.monitoring_by,
              surveyTool: entry.surveyTool || entry.survey_tool,
              useMarketDiversion: entry.useMarketDiversion ?? entry.use_market_diversion ?? false,
              useWarehouseMonitoring: entry.useWarehouseMonitoring ?? entry.use_warehouse_monitoring ?? false,
              verifiedAt: entry.verified_at,
              verifiedBy: entry.verified_by,
              verificationNotes: entry.verification_notes,
              additionalData: entry.additionalData || entry.additional_data || {},
              dueDate: entry.dueDate || new Date().toISOString(),
            });
          });
        });
      }
      
      console.log(`📊 OperationsZone: Coordinator total sites: ${allSites.length}`);
      return allSites;
    }
    
    // Admin/other roles: show all
    return allSiteVisits;
  }, [allSiteVisits, isSupervisor, supervisorHubName, isCoordinator, coordinatorStateName, currentUser?.id, currentUser?.stateId, contextMmpFiles, contextLoading, userProjectIds, isAdminOrSuperUser, dispatchedSitesFromDB]);

  const siteVisits = useMemo(() => {
    return filterSiteVisitsByMmp(roleFilteredSiteVisits);
  }, [roleFilteredSiteVisits, filterSiteVisitsByMmp]);

  const upcomingVisits = siteVisits
    .filter(v => {
      const dueDate = new Date(v.dueDate);
      const today = new Date();
      const twoWeeksFromNow = addDays(today, 14);
      return isAfter(dueDate, today) && isAfter(twoWeeksFromNow, dueDate);
    })
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 5);

  // Calculate metrics - account for all possible status values including coordinator-specific ones
  const totalVisits = siteVisits.length;
  const completedVisits = siteVisits.filter(v => {
    const s = (v.status || '').toLowerCase();
    return s === 'completed';
  }).length;
  const pendingVisits = siteVisits.filter(v => {
    const s = (v.status || '').toLowerCase();
    return s === 'pending' || s === 'permitverified' || s === 'verified' || s === 'dispatched';
  }).length;
  const assignedVisits = siteVisits.filter(v => {
    const s = (v.status || '').toLowerCase();
    return s === 'assigned' || s === 'inprogress' || s === 'in progress' || s === 'accepted';
  }).length;
  const overdueVisits = siteVisits.filter(v => {
    const dueDate = new Date(v.dueDate);
    const today = new Date();
    const s = (v.status || '').toLowerCase();
    return dueDate < today && s !== 'completed';
  }).length;
  const completionRate = totalVisits > 0 ? Math.round((completedVisits / totalVisits) * 100) : 0;

  // Handle card clicks - navigate to site visits page with appropriate filters
  const handleCardClick = (cardType: MetricCardType) => {
    switch (cardType) {
      case 'total':
        navigate('/site-visits');
        break;
      case 'completed':
        navigate('/site-visits?status=completed');
        break;
      case 'assigned':
        navigate('/site-visits?status=assigned');
        break;
      case 'pending':
        navigate('/site-visits?status=scheduled');
        break;
      case 'overdue':
        navigate('/site-visits?status=overdue');
        break;
      case 'performance':
        navigate('/site-visits?status=completed');
        break;
      default:
        navigate('/site-visits');
    }
  };

  return (
    <div className="p-3 sm:p-4 md:p-6 lg:p-8 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center flex-shrink-0">
            <ClipboardList className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold truncate">Operations Center</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Field operations command and control
            </p>
          </div>
        </div>
        {/* Show filter context for supervisors and coordinators */}
        <div className="flex flex-col sm:flex-row gap-2">
          {isSupervisor && supervisorHubName && (
            <Badge variant="secondary" className="flex items-center gap-2 px-3 py-1.5 text-xs sm:text-sm bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 self-start">
              <MapPin className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
              <span className="truncate">Hub: {supervisorHubName}</span>
            </Badge>
          )}
          {isCoordinator && (
            <Badge variant="secondary" className="flex items-center gap-2 px-3 py-1.5 text-xs sm:text-sm bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 self-start">
              <MapPin className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
              <span className="truncate">{coordinatorStateName ? `State: ${coordinatorStateName}` : 'All States'}</span>
            </Badge>
          )}
        </div>
      </div>

      {/* Users Management Style Gradient Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <GradientStatCard
          title="Total Operations"
          value={totalVisits}
          subtitle="All site visits"
          icon={Activity}
          color="blue"
          onClick={() => handleCardClick('total')}
          data-testid="card-metric-total"
        />

        <GradientStatCard
          title="Completed Visits"
          value={completedVisits}
          subtitle={`${completionRate}% completion rate`}
          icon={CheckCircle2}
          color="green"
          onClick={() => handleCardClick('completed')}
          data-testid="card-metric-completed"
        />

        <GradientStatCard
          title="Active Operations"
          value={assignedVisits}
          subtitle="In progress now"
          icon={Users}
          color="cyan"
          onClick={() => handleCardClick('assigned')}
          data-testid="card-metric-assigned"
        />

        <GradientStatCard
          title="Pending Queue"
          value={pendingVisits}
          subtitle="Awaiting assignment"
          icon={Clock}
          color="orange"
          onClick={() => handleCardClick('pending')}
          data-testid="card-metric-pending"
        />

        <GradientStatCard
          title="Overdue Alerts"
          value={overdueVisits}
          subtitle={overdueVisits > 0 ? "Requires attention" : "All on schedule"}
          icon={AlertCircle}
          color="orange"
          onClick={() => handleCardClick('overdue')}
          data-testid="card-metric-overdue"
        />

        <GradientStatCard
          title="Performance Score"
          value={`${completionRate}%`}
          subtitle={completionRate >= 75 ? "Excellent efficiency" : "Room for improvement"}
          icon={BarChart3}
          color="purple"
          onClick={() => handleCardClick('performance')}
          data-testid="card-metric-performance"
        />
      </div>

      {(cycleSummary.active > 0 || cycleSummary.closing > 0 || cycleSummary.pending_approval > 0 || cycleSummary.closed > 0) && (
        <Card data-testid="card-cycle-summary">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-sm flex items-center gap-2">
                <Target className="h-4 w-4" /> MMP Cycle Status
              </CardTitle>
              <Button size="sm" variant="outline" className="text-xs" onClick={() => navigate('/mmp/cycle-close')} data-testid="button-view-all-cycles">
                <ExternalLink className="h-3 w-3 mr-1" /> Manage Cycles
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-4 gap-3">
              <div className="text-center p-2 rounded-lg bg-green-50 dark:bg-green-950" data-testid="stat-cycle-active">
                <div className="text-lg font-bold text-green-600 dark:text-green-400">{cycleSummary.active}</div>
                <div className="text-[11px] text-gray-500">Active</div>
              </div>
              <div className="text-center p-2 rounded-lg bg-amber-50 dark:bg-amber-950" data-testid="stat-cycle-closing">
                <div className="text-lg font-bold text-amber-600 dark:text-amber-400">{cycleSummary.closing}</div>
                <div className="text-[11px] text-gray-500">Closing</div>
              </div>
              <div className="text-center p-2 rounded-lg bg-purple-50 dark:bg-purple-950" data-testid="stat-cycle-pending">
                <div className="text-lg font-bold text-purple-600 dark:text-purple-400">{cycleSummary.pending_approval}</div>
                <div className="text-[11px] text-gray-500">Pending</div>
              </div>
              <div className="text-center p-2 rounded-lg bg-blue-50 dark:bg-blue-950" data-testid="stat-cycle-closed">
                <div className="text-lg font-bold text-blue-600 dark:text-blue-400">{cycleSummary.closed}</div>
                <div className="text-[11px] text-gray-500">Closed</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {closingCycles.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/30" data-testid="card-closing-cycles">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <AlertCircle className="h-4 w-4" /> Cycle Close In Progress
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-3">
              {closingCycles.map(cycle => {
                const progress = cycle.uncovered > 0 ? Math.round((cycle.reasoned / cycle.uncovered) * 100) : 100;
                const isOverdue = cycle.deadline && new Date(cycle.deadline) < new Date();
                return (
                  <div key={cycle.id} className="flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{cycle.name}</span>
                        {isOverdue && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">OVERDUE</Badge>}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Progress value={progress} className="h-1.5 flex-1" />
                        <span className="text-xs text-gray-500 whitespace-nowrap">{cycle.reasoned}/{cycle.uncovered}</span>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" className="text-xs" onClick={() => navigate('/mmp/cycle-close')} data-testid={`button-view-cycle-${cycle.id}`}>
                      <ExternalLink className="h-3 w-3 mr-1" /> View
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* IT-Style Tab Navigation */}
      <Card className="border-border/50 bg-gradient-to-r from-muted/30 via-background to-muted/30">
        <CardContent className="p-2 sm:p-3">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-5 h-auto p-0.5 bg-transparent border border-border/30 gap-1">
              <TabsTrigger 
                value="overview" 
                className="flex flex-col sm:flex-row gap-1 px-2 py-2 sm:py-1.5 data-[state=active]:bg-primary/10 data-[state=active]:border-primary/20 data-[state=active]:shadow-sm border border-transparent min-h-[60px] sm:min-h-[40px]"
                data-testid="tab-overview"
              >
                <div className="w-5 h-5 sm:w-4 sm:h-4 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <ClipboardList className="h-3 w-3 sm:h-2.5 sm:w-2.5 text-primary" />
                </div>
                <span className="text-[10px] sm:text-[9px] font-semibold uppercase tracking-wide text-center">Overview</span>
              </TabsTrigger>
              <TabsTrigger 
                value="mmps" 
                className="flex flex-col sm:flex-row gap-1 px-2 py-2 sm:py-1.5 data-[state=active]:bg-blue-500/10 data-[state=active]:border-blue-500/20 data-[state=active]:shadow-sm border border-transparent min-h-[60px] sm:min-h-[40px]"
                data-testid="tab-mmps"
              >
                <div className="w-5 h-5 sm:w-4 sm:h-4 rounded bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                  <FileText className="h-3 w-3 sm:h-2.5 sm:w-2.5 text-blue-600 dark:text-blue-400" />
                </div>
                <span className="text-[10px] sm:text-[9px] font-semibold uppercase tracking-wide text-center">MMPs</span>
              </TabsTrigger>
              <TabsTrigger 
                value="upcoming" 
                className="flex flex-col sm:flex-row gap-1 px-2 py-2 sm:py-1.5 data-[state=active]:bg-blue-500/10 data-[state=active]:border-blue-500/20 data-[state=active]:shadow-sm border border-transparent min-h-[60px] sm:min-h-[40px]"
                data-testid="tab-upcoming"
              >
                <div className="w-5 h-5 sm:w-4 sm:h-4 rounded bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                  <Calendar className="h-3 w-3 sm:h-2.5 sm:w-2.5 text-blue-600 dark:text-blue-400" />
                </div>
                <span className="text-[10px] sm:text-[9px] font-semibold uppercase tracking-wide text-center">Upcoming</span>
              </TabsTrigger>
              <TabsTrigger 
                value="calendar" 
                className="flex flex-col sm:flex-row gap-1 px-2 py-2 sm:py-1.5 data-[state=active]:bg-green-500/10 data-[state=active]:border-green-500/20 data-[state=active]:shadow-sm border border-transparent min-h-[60px] sm:min-h-[40px]"
                data-testid="tab-calendar"
              >
                <div className="w-5 h-5 sm:w-4 sm:h-4 rounded bg-green-500/10 flex items-center justify-center flex-shrink-0">
                  <MapPin className="h-3 w-3 sm:h-2.5 sm:w-2.5 text-green-600 dark:text-green-400" />
                </div>
                <span className="text-[10px] sm:text-[9px] font-semibold uppercase tracking-wide text-center">Calendar</span>
              </TabsTrigger>
              <TabsTrigger 
                value="costs" 
                className="flex flex-col sm:flex-row gap-1 px-2 py-2 sm:py-1.5 data-[state=active]:bg-orange-500/10 data-[state=active]:border-orange-500/20 data-[state=active]:shadow-sm border border-transparent min-h-[60px] sm:min-h-[40px]"
                data-testid="tab-costs"
              >
                <div className="w-5 h-5 sm:w-4 sm:h-4 rounded bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                  <DollarSign className="h-3 w-3 sm:h-2.5 sm:w-2.5 text-orange-600 dark:text-orange-400" />
                </div>
                <span className="text-[10px] sm:text-[9px] font-semibold uppercase tracking-wide text-center">Costs</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-3 space-y-3">
              <SiteVisitsOverview siteVisits={siteVisits} />
            </TabsContent>

            <TabsContent value="mmps" className="mt-3">
              <ZoneMmpAnalyticsTab
                filters={mmpAnalytics.filters}
                onFilterChange={mmpAnalytics.setFilters}
                filteredMmpFiles={mmpAnalytics.filteredMmpFiles}
                filteredSiteVisits={mmpAnalytics.filteredSiteVisits}
                mmpStats={mmpAnalytics.mmpStats}
                uniqueHubs={mmpAnalytics.uniqueHubs}
                uniqueRegions={mmpAnalytics.uniqueRegions}
                selectedMmpId={mmpAnalytics.selectedMmpId}
                onSelectMmp={mmpAnalytics.setSelectedMmpId}
                selectedMmp={mmpAnalytics.selectedMmp}
                canAccessVersioning={mmpAnalytics.canAccessVersioning}
                zoneColor="blue"
              />
            </TabsContent>

            <TabsContent value="upcoming" className="mt-3">
              <UpcomingSiteVisitsCard siteVisits={upcomingVisits} />
            </TabsContent>

            <TabsContent value="calendar" className="mt-3">
              <DashboardCalendar siteVisits={siteVisits} />
            </TabsContent>

            <TabsContent value="costs" className="mt-3">
              <SiteVisitCostSummary siteVisits={siteVisits} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};
