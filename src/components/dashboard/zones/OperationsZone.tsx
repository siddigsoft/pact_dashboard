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
  ExternalLink
} from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import SiteVisitsOverview from '../SiteVisitsOverview';
import UpcomingSiteVisitsCard from '../UpcomingSiteVisitsCard';
import { SiteVisitCostSummary } from '../SiteVisitCostSummary';
import { DashboardCalendar } from '../DashboardCalendar';
import { useSiteVisitContext } from '@/context/siteVisit/SiteVisitContext';
import { useUser } from '@/context/user/UserContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { supabase } from '@/integrations/supabase/client';
import { isAfter, addDays } from 'date-fns';
import { getStateName } from '@/data/sudanStates';

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

  // Fetch supervisor's hub name
  useEffect(() => {
    if (!isSupervisor || !currentUser?.hubId) {
      setSupervisorHubName(null);
      return;
    }
    const fetchHubName = async () => {
      const { data } = await supabase
        .from('hubs')
        .select('name')
        .eq('id', currentUser.hubId)
        .maybeSingle();
      if (data) {
        setSupervisorHubName(data.name);
        console.log(`📊 OperationsZone: Supervisor hub loaded: ${data.name}`);
      }
    };
    fetchHubName();
  }, [isSupervisor, currentUser?.hubId]);

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

  // Apply supervisor hub filtering or coordinator state filtering to site visits
  const siteVisits = useMemo(() => {
    console.log(`📊 OperationsZone: isSupervisor=${isSupervisor}, isCoordinator=${isCoordinator}, allSiteVisits=${allSiteVisits.length}`);
    console.log(`📊 OperationsZone: supervisorHubName=${supervisorHubName}, coordinatorStateName=${coordinatorStateName}`);
    
    // Supervisor: filter by hub
    if (isSupervisor) {
      if (!supervisorHubName) {
        console.warn('⚠️ OperationsZone: Supervisor has no hub assigned - showing no sites');
        return [];
      }
      
      const hubName = supervisorHubName.toLowerCase().trim();
      const filtered = allSiteVisits.filter(visit => {
        const visitHub = (visit.hub || '').toLowerCase().trim();
        if (!visitHub) return false;
        return visitHub === hubName || 
               visitHub.includes(hubName) ||
               (visitHub.length > 0 && hubName.includes(visitHub));
      });
      
      console.log(`📊 OperationsZone: Filtered to ${filtered.length} sites for hub "${supervisorHubName}"`);
      return filtered;
    }
    
    // Coordinator: filter by state (if assigned, otherwise show all)
    if (isCoordinator) {
      // If coordinator has a state assigned, filter by it
      if (coordinatorStateName && currentUser?.stateId) {
        const stateName = coordinatorStateName.toLowerCase().trim();
        const stateId = currentUser.stateId.toLowerCase().trim();
        
        const filtered = allSiteVisits.filter(visit => {
          const visitState = (visit.state || '').toLowerCase().trim();
          if (!visitState) return false;
          // Match by state name OR state ID
          return visitState === stateName || 
                 visitState === stateId ||
                 visitState.includes(stateName) ||
                 visitState.includes(stateId) ||
                 (visitState.length > 0 && (stateName.includes(visitState) || stateId.includes(visitState)));
        });
        
        console.log(`📊 OperationsZone: Coordinator filtered to ${filtered.length} sites for state "${coordinatorStateName}" (id: ${stateId})`);
        return filtered;
      }
      
      // Coordinator without state assignment - show all sites
      console.log(`📊 OperationsZone: Coordinator has no state assigned - showing all ${allSiteVisits.length} sites`);
      return allSiteVisits;
    }
    
    // Admin/other roles: show all
    return allSiteVisits;
  }, [allSiteVisits, isSupervisor, supervisorHubName, isCoordinator, coordinatorStateName, currentUser?.stateId]);

  const upcomingVisits = siteVisits
    .filter(v => {
      const dueDate = new Date(v.dueDate);
      const today = new Date();
      const twoWeeksFromNow = addDays(today, 14);
      return isAfter(dueDate, today) && isAfter(twoWeeksFromNow, dueDate);
    })
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 5);

  // Calculate metrics
  const totalVisits = siteVisits.length;
  const completedVisits = siteVisits.filter(v => v.status === 'completed').length;
  const pendingVisits = siteVisits.filter(v => v.status === 'pending' || v.status === 'permitVerified').length;
  const assignedVisits = siteVisits.filter(v => v.status === 'assigned' || v.status === 'inProgress').length;
  const overdueVisits = siteVisits.filter(v => {
    const dueDate = new Date(v.dueDate);
    const today = new Date();
    return dueDate < today && v.status !== 'completed';
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

      {/* IT-Style Tab Navigation */}
      <Card className="border-border/50 bg-gradient-to-r from-muted/30 via-background to-muted/30">
        <CardContent className="p-2 sm:p-3">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4 h-auto p-0.5 bg-transparent border border-border/30 gap-1">
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
