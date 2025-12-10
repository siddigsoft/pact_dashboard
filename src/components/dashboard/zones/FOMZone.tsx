import React, { useState, useMemo, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { GradientStatCard } from '@/components/ui/gradient-stat-card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  FileCheck, 
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
  Filter,
  X,
  FileText,
  Shield,
  Briefcase,
  Plus
} from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';
import { useSiteVisitContext } from '@/context/siteVisit/SiteVisitContext';
import { useNavigate } from 'react-router-dom';
import SiteVisitsOverview from '../SiteVisitsOverview';
import UpcomingSiteVisitsCard from '../UpcomingSiteVisitsCard';
import { SiteVisitCostSummary } from '../SiteVisitCostSummary';
import { DashboardCalendar } from '../DashboardCalendar';
import { useUserProjects } from '@/hooks/useUserProjects';

interface MMPFile {
  id: string;
  name?: string | null;
  mmp_id?: string | null;
  status?: string | null;
  workflow?: any;
  uploaded_at?: string | null;
  project?: { name?: string | null; project_code?: string | null } | null;
  project_name?: string | null;
  hub?: string | null;
  month?: string | null;
  permits?: any;
}

interface Filters {
  hub: string;
  state: string;
  locality: string;
  status: string;
  project: string;
}

export const FOMZone: React.FC = () => {
  const { currentUser } = useAppContext();
  const { siteVisits } = useSiteVisitContext();
  const navigate = useNavigate();
  const { userProjectIds, isAdminOrSuperUser } = useUserProjects();
  const [activeTab, setActiveTab] = useState('overview');
  const [filters, setFilters] = useState<Filters>({
    hub: '',
    state: '',
    locality: '',
    status: '',
    project: ''
  });

  // MMPs forwarded to this FOM
  const [forwardedMMPs, setForwardedMMPs] = useState<MMPFile[]>([]);
  const [forwardedLoading, setForwardedLoading] = useState(false);

  // All MMPs for approval queue
  const [allMMPs, setAllMMPs] = useState<MMPFile[]>([]);
  const [allMMPsLoading, setAllMMPsLoading] = useState(false);

  // Financial data
  const [financialData, setFinancialData] = useState<any>(null);
  const [financialLoading, setFinancialLoading] = useState(false);

  // Load MMPs forwarded to this FOM
  const loadForwarded = async () => {
    if (!currentUser?.id) {
      setForwardedMMPs([]);
      return;
    }
    setForwardedLoading(true);
    try {
      const { data, error } = await supabase
        .from('mmp_files')
        .select(`
          id, name, mmp_id, status, workflow, uploaded_at, hub, month,
          project:projects(name, project_code),
          permits
        `)
        .contains('workflow', { forwardedToFomIds: [currentUser.id] })
        .order('created_at', { ascending: false });
      
      if (error) {
        // Log error but don't show to user - RLS may block this query for some users
        if (error.code !== 'PGRST116' && error.code !== '42501') {
          console.warn('Failed to load forwarded MMPs:', error.code, error.message);
        }
        // Fallback query without join
        const { data: fbData, error: fbError } = await supabase
          .from('mmp_files')
          .select('*')
          .contains('workflow', { forwardedToFomIds: [currentUser.id] })
          .order('created_at', { ascending: false });
        if (fbError) {
          // Silently fail - user may not have access to this data
          setForwardedMMPs([]);
        } else {
          setForwardedMMPs((fbData || []) as MMPFile[]);
        }
      } else {
        setForwardedMMPs((data || []) as MMPFile[]);
      }
    } catch (err) {
      // Silently fail - don't log RLS errors to console
      setForwardedMMPs([]);
    } finally {
      setForwardedLoading(false);
    }
  };

  useEffect(() => {
    loadForwarded();
    // Fallback polling every 60s in case realtime disconnects
    const interval = setInterval(loadForwarded, 60000);
    return () => clearInterval(interval);
  }, [currentUser?.id]);

  // Load all MMPs for approval queue (pending approval) - filtered by user's project membership
  const loadAllMMPs = async () => {
    // Early return if no user or non-admin with no project assignments
    if (!currentUser?.id) {
      setAllMMPs([]);
      return;
    }
    if (!isAdminOrSuperUser && userProjectIds.length === 0) {
      setAllMMPs([]);
      return;
    }
    
    setAllMMPsLoading(true);
    try {
      let query = supabase
        .from('mmp_files')
        .select(`
          id, name, mmp_id, status, workflow, uploaded_at, hub, month, project_name, project_id,
          project:projects(name, project_code)
        `)
        .in('status', ['pending', 'submitted'])
        .order('created_at', { ascending: false })
        .limit(50);
      
      // Apply project filter for non-admin users
      if (!isAdminOrSuperUser && userProjectIds.length > 0) {
        query = query.in('project_id', userProjectIds);
      }
      
      const { data, error } = await query;
      
      if (error) {
        console.error('Failed to load MMPs:', error);
        setAllMMPs([]);
      } else {
        // Additional client-side filtering for non-admin users
        let filtered = data || [];
        if (!isAdminOrSuperUser && userProjectIds.length > 0) {
          filtered = filtered.filter((mmp: any) => 
            mmp.project_id && userProjectIds.includes(mmp.project_id)
          );
        }
        setAllMMPs(filtered as MMPFile[]);
      }
    } catch (err) {
      console.error('Error loading MMPs:', err);
      setAllMMPs([]);
    } finally {
      setAllMMPsLoading(false);
    }
  };

  useEffect(() => {
    loadAllMMPs();
    // Fallback polling every 120s in case realtime disconnects
    const interval = setInterval(loadAllMMPs, 120000);
    return () => clearInterval(interval);
  }, [isAdminOrSuperUser, userProjectIds]);

  // Real-time subscription for automatic updates without page refresh
  useEffect(() => {
    if (!currentUser?.id) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    
    const debouncedReload = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        loadForwarded();
        loadAllMMPs();
        debounceTimer = null;
      }, 1000); // 1s debounce to avoid double-fetch storms
    };

    const channel = supabase
      .channel('fom_dashboard_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mmp_files' },
        debouncedReload
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mmp_site_entries' },
        debouncedReload
      )
      .subscribe();

    return () => {
      try { supabase.removeChannel(channel); } catch {}
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [currentUser?.id, isAdminOrSuperUser, userProjectIds]);

  // Load financial overview
  useEffect(() => {
    let cancelled = false;
    const loadFinancial = async () => {
      setFinancialLoading(true);
      try {
        // Get site visit costs summary
        const { data: visitsData } = await supabase
          .from('site_visits')
          .select('cost, status')
          .limit(1000);
        
        // Get MMP-related financial data
        const { data: mmpData } = await supabase
          .from('mmp_site_entries')
          .select('cost')
          .limit(1000);

        if (!cancelled) {
          const totalVisitsCost = (visitsData || []).reduce((sum, v) => sum + (Number(v.cost) || 0), 0);
          const totalMMPCost = (mmpData || []).reduce((sum, m) => sum + (Number(m.cost) || 0), 0);
          const completedVisits = (visitsData || []).filter(v => v.status === 'completed').length;
          
          setFinancialData({
            totalVisitsCost,
            totalMMPCost,
            completedVisits,
            totalVisits: visitsData?.length || 0
          });
        }
      } catch (err) {
        console.error('Error loading financial data:', err);
        if (!cancelled) setFinancialData(null);
      } finally {
        if (!cancelled) setFinancialLoading(false);
      }
    };
    loadFinancial();
    const interval = setInterval(loadFinancial, 300000); // Refresh every 5 minutes
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // Calculate metrics
  const awaitingPermitsCount = forwardedMMPs.filter(mmp => {
    const workflow = mmp.workflow as any;
    return workflow?.currentStage === 'awaitingPermits' || 
           (!mmp.permits || !(mmp.permits as any).federal);
  }).length;

  const permitsAttachedCount = forwardedMMPs.filter(mmp => {
    return mmp.permits && (mmp.permits as any).federal;
  }).length;

  const pendingApprovalCount = allMMPs.filter(mmp => 
    mmp.status === 'pending' || mmp.status === 'submitted'
  ).length;

  const approvedCount = allMMPs.filter(mmp => mmp.status === 'approved').length;



  
  // Site visit metrics
  const totalVisits = siteVisits.length;
  const completedVisits = siteVisits.filter(v => v.status === 'completed').length;
  const pendingVisits = siteVisits.filter(v => v.status === 'pending' || v.status === 'permitVerified').length;
  const assignedVisits = siteVisits.filter(v => v.status === 'assigned' || v.status === 'inProgress').length;
  const completionRate = totalVisits > 0 ? Math.round((completedVisits / totalVisits) * 100) : 0;

  // Permit attachment rate
  const permitAttachmentRate = forwardedMMPs.length > 0 
    ? Math.round((permitsAttachedCount / forwardedMMPs.length) * 100) 
    : 0;

  // Get filtered MMPs
  const getFilteredMMPs = (mmps: MMPFile[]) => {
    return mmps.filter(mmp => {
      if (filters.hub && mmp.hub !== filters.hub) return false;
      if (filters.status && mmp.status !== filters.status) return false;
      if (filters.project) {
        const projectName = mmp.project?.name || mmp.project_name || '';
        if (!projectName.toLowerCase().includes(filters.project.toLowerCase())) return false;
      }
      return true;
    });
  };

  const filteredForwardedMMPs = useMemo(() => getFilteredMMPs(forwardedMMPs), [forwardedMMPs, filters]);
  const filteredPendingMMPs = useMemo(() => getFilteredMMPs(allMMPs.filter(m => m.status === 'pending' || m.status === 'submitted')), [allMMPs, filters]);

  // Extract unique values for filters
  const hubs = useMemo(() => [...new Set([...forwardedMMPs, ...allMMPs].map(m => m.hub).filter(Boolean))], [forwardedMMPs, allMMPs]);
  const projects = useMemo(() => {
    const projs = new Set<string>();
    [...forwardedMMPs, ...allMMPs].forEach(m => {
      const name = m.project?.name || m.project_name;
      if (name) projs.add(name);
    });
    return Array.from(projs);
  }, [forwardedMMPs, allMMPs]);

  const clearAllFilters = () => {
    setFilters({
      hub: '',
      state: '',
      locality: '',
      status: '',
      project: ''
    });
  };

  const activeFilterCount = Object.values(filters).filter(v => v !== '').length;

  // Check if permit is attached
  const hasPermit = (mmp: MMPFile) => {
    return mmp.permits && (mmp.permits as any).federal;
  };

  // Get days since forwarded
  const getDaysSinceForwarded = (mmp: MMPFile) => {
    const workflow = mmp.workflow as any;
    if (!workflow?.forwardedAt) return null;
    const forwarded = new Date(workflow.forwardedAt);
    const now = new Date();
    const diff = Math.floor((now.getTime() - forwarded.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  return (
    <div className="min-h-screen bg-background p-3 sm:p-4 md:p-6 lg:p-8 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center flex-shrink-0">
            <Shield className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold truncate">Field Operations Manager</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Permits, approvals, and field operations oversight
            </p>
          </div>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <GradientStatCard
          title="Awaiting Permits"
          value={awaitingPermitsCount}
          subtitle="MMPs needing permits"
          icon={FileCheck}
          color="orange"
          onClick={() => navigate('/mmp')}
        />

        <GradientStatCard
          title="Permits Attached"
          value={permitsAttachedCount}
          subtitle={`${permitAttachmentRate}% completion`}
          icon={CheckCircle2}
          color="green"
          onClick={() => navigate('/mmp')}
        />

        <GradientStatCard
          title="Pending Approval"
          value={pendingApprovalCount}
          subtitle="MMPs in queue"
          icon={Clock}
          color="blue"
          onClick={() => navigate('/mmp')}
        />

        <GradientStatCard
          title="Approved MMPs"
          value={approvedCount}
          subtitle="This period"
          icon={Target}
          color="green"
          onClick={() => navigate('/mmp')}
        />

        <GradientStatCard
          title="Site Visits"
          value={totalVisits}
          subtitle={`${completionRate}% completed`}
          icon={MapPin}
          color="cyan"
          onClick={() => navigate('/site-visits')}
        />

        <GradientStatCard
          title="Performance"
          value={`${permitAttachmentRate}%`}
          subtitle="Permit attachment rate"
          icon={TrendingUp}
          color="purple"
          onClick={() => navigate('/dashboard')}
        />
      </div>

      {/* Main Content Tabs */}
      <Card className="border-border/50 bg-gradient-to-r from-muted/30 via-background to-muted/30">
        <CardContent className="p-2 sm:p-3">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3 sm:grid-cols-5 h-auto p-0.5 bg-transparent border border-border/30 gap-1 mx-auto">
              <TabsTrigger 
                value="overview" 
                className="gap-1 px-2 py-2 sm:py-1.5 data-[state=active]:bg-primary/10 data-[state=active]:border-primary/20 data-[state=active]:shadow-sm border border-transparent min-h-[44px] sm:min-h-[40px]"
              >
                <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <FileText className="h-3 w-3 sm:h-2.5 sm:w-2.5 text-primary" />
                </div>
                <span className="text-[10px] sm:text-[9px] font-semibold uppercase tracking-wide text-center">Overview</span>
              </TabsTrigger>
              <TabsTrigger 
                value="permits" 
                className="gap-1 px-2 py-2 sm:py-1.5 data-[state=active]:bg-orange-500/10 data-[state=active]:border-orange-500/20 data-[state=active]:shadow-sm border border-transparent min-h-[44px] sm:min-h-[40px]"
              >
                <div className="w-5 h-5 rounded bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                  <Shield className="h-3 w-3 sm:h-2.5 sm:w-2.5 text-orange-600 dark:text-orange-400" />
                </div>
                <span className="text-[10px] sm:text-[9px] font-semibold uppercase tracking-wide text-center">Permits</span>
              </TabsTrigger>
              <TabsTrigger 
                value="approvals" 
                className="gap-1 px-2 py-2 sm:py-1.5 data-[state=active]:bg-blue-500/10 data-[state=active]:border-blue-500/20 data-[state=active]:shadow-sm border border-transparent min-h-[44px] sm:min-h-[40px]"
              >
                <div className="w-5 h-5 rounded bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="h-3 w-3 sm:h-2.5 sm:w-2.5 text-blue-600 dark:text-blue-400" />
                </div>
                <span className="text-[10px] sm:text-[9px] font-semibold uppercase tracking-wide text-center">Approvals</span>
              </TabsTrigger>
              <TabsTrigger 
                value="site-visits" 
                className="gap-1 px-2 py-2 sm:py-1.5 data-[state=active]:bg-green-500/10 data-[state=active]:border-green-500/20 data-[state=active]:shadow-sm border border-transparent min-h-[44px] sm:min-h-[40px]"
              >
                <div className="w-5 h-5 rounded bg-green-500/10 flex items-center justify-center flex-shrink-0">
                  <MapPin className="h-3 w-3 sm:h-2.5 sm:w-2.5 text-green-600 dark:text-green-400" />
                </div>
                <span className="text-[10px] sm:text-[9px] font-semibold uppercase tracking-wide text-center">Visits</span>
              </TabsTrigger>
              <TabsTrigger 
                value="finance" 
                className="gap-1 px-2 py-2 sm:py-1.5 data-[state=active]:bg-amber-500/10 data-[state=active]:border-amber-500/20 data-[state=active]:shadow-sm border border-transparent min-h-[44px] sm:min-h-[40px]"
              >
                <div className="w-5 h-5 rounded bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                  <DollarSign className="h-3 w-3 sm:h-2.5 sm:w-2.5 text-amber-600 dark:text-amber-400" />
                </div>
                <span className="text-[10px] sm:text-[9px] font-semibold uppercase tracking-wide text-center">Finance</span>
              </TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="mt-3 space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Forwarded MMPs Card */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FileCheck className="h-5 w-5 text-orange-600" />
                      MMPs Forwarded to You
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {forwardedLoading ? (
                      <div className="text-sm text-muted-foreground py-4">Loading...</div>
                    ) : forwardedMMPs.length === 0 ? (
                      <div className="text-sm text-muted-foreground py-4">
                        No MMPs forwarded to you yet.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {forwardedMMPs.slice(0, 5).map((mmp) => {
                          const hasPermitAttached = hasPermit(mmp);
                          const daysSince = getDaysSinceForwarded(mmp);
                          const workflow = mmp.workflow as any;
                          return (
                            <div 
                              key={mmp.id} 
                              className="flex items-center justify-between p-2 border rounded hover:bg-muted/50 cursor-pointer"
                              onClick={() => navigate(`/mmp/${mmp.id}${!hasPermitAttached ? '/verification' : ''}`)}
                            >
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm">
                                    {mmp.name || mmp.mmp_id || mmp.id}
                                  </span>
                                  {hasPermitAttached ? (
                                    <Badge variant="default" className="text-xs">Permit Attached</Badge>
                                  ) : (
                                    <Badge variant="destructive" className="text-xs">Awaiting Permit</Badge>
                                  )}
                                </div>
                                <div className="text-xs text-muted-foreground mt-1">
                                  {mmp.project?.name || mmp.project_name || 'No project'}
                                  {daysSince !== null && (
                                    <span className="ml-2">
                                      • {daysSince} day{daysSince !== 1 ? 's' : ''} ago
                                    </span>
                                  )}
                                </div>
                              </div>
                              <Button size="sm" variant="ghost" className="h-7 px-2">
                                <ExternalLink className="h-3 w-3" />
                              </Button>
                            </div>
                          );
                        })}
                        {forwardedMMPs.length > 5 && (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="w-full"
                            onClick={() => setActiveTab('permits')}
                          >
                            View All ({forwardedMMPs.length})
                          </Button>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Pending Approvals Card */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Clock className="h-5 w-5 text-blue-600" />
                      Pending Approvals
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {allMMPsLoading ? (
                      <div className="text-sm text-muted-foreground py-4">Loading...</div>
                    ) : filteredPendingMMPs.length === 0 ? (
                      <div className="text-sm text-muted-foreground py-4">
                        No MMPs pending approval.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {filteredPendingMMPs.slice(0, 5).map((mmp) => (
                          <div 
                            key={mmp.id} 
                            className="flex items-center justify-between p-2 border rounded hover:bg-muted/50 cursor-pointer"
                            onClick={() => navigate(`/mmp/${mmp.id}`)}
                          >
                            <div className="flex-1">
                              <div className="font-medium text-sm">
                                {mmp.name || mmp.mmp_id || mmp.id}
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {mmp.project?.name || mmp.project_name || 'No project'}
                                {mmp.uploaded_at && (
                                  <span className="ml-2">
                                    • {format(new Date(mmp.uploaded_at), 'MMM dd, yyyy')}
                                  </span>
                                )}
                              </div>
                            </div>
                            <Button size="sm" variant="ghost" className="h-7 px-2">
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                        {filteredPendingMMPs.length > 5 && (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="w-full"
                            onClick={() => setActiveTab('approvals')}
                          >
                            View All ({filteredPendingMMPs.length})
                          </Button>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Permit Attachment Progress</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Completed</span>
                        <span className="font-medium">{permitsAttachedCount} / {forwardedMMPs.length}</span>
                      </div>
                      <Progress value={permitAttachmentRate} className="h-2" />
                      <div className="text-xs text-muted-foreground">
                        {permitAttachmentRate}% completion rate
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Site Visit Status</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>Completed</span>
                        <span className="font-medium">{completedVisits}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>In Progress</span>
                        <span className="font-medium">{assignedVisits}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Pending</span>
                        <span className="font-medium">{pendingVisits}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Financial Overview</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {financialLoading ? (
                      <div className="text-xs text-muted-foreground">Loading...</div>
                    ) : financialData ? (
                      <div className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span>Site Visits Cost</span>
                          <span className="font-medium">
                            ${financialData.totalVisitsCost.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>MMP Costs</span>
                          <span className="font-medium">
                            ${financialData.totalMMPCost.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">No data available</div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Permits Tab */}
            <TabsContent value="permits" className="mt-3">
              <Card>
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <CardTitle className="text-lg">MMPs Awaiting Permits</CardTitle>
                    {activeFilterCount > 0 && (
                      <Button variant="ghost" size="sm" onClick={clearAllFilters} className="gap-2 min-h-[44px] px-4">
                        <X className="h-4 w-4" />
                        Clear Filters ({activeFilterCount})
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Filters */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                    <Select
                      value={filters.hub}
                      onValueChange={(value) => setFilters(prev => ({ ...prev, hub: value === 'all' ? '' : value }))}
                    >
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="Hub" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Hubs</SelectItem>
                        {hubs.map((hub) => (
                          <SelectItem key={hub} value={hub}>{hub}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      value={filters.status}
                      onValueChange={(value) => setFilters(prev => ({ ...prev, status: value === 'all' ? '' : value }))}
                    >
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="submitted">Submitted</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {forwardedLoading ? (
                    <div className="text-sm text-muted-foreground py-8 text-center">Loading...</div>
                  ) : filteredForwardedMMPs.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-8 text-center">
                      No MMPs found.
                    </div>
                  ) : (
                    <>
                      {/* Mobile Card View */}
                      <div className="block md:hidden space-y-3">
                        {filteredForwardedMMPs.map((mmp) => {
                          const hasPermitAttached = hasPermit(mmp);
                          const daysSince = getDaysSinceForwarded(mmp);
                          const workflow = mmp.workflow as any;
                          const forwardedAt = workflow?.forwardedAt 
                            ? format(new Date(workflow.forwardedAt), 'MMM dd, yyyy')
                            : '-';
                          
                          return (
                            <Card key={mmp.id} className="p-4">
                              <div className="space-y-3">
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <h4 className="font-medium text-sm">
                                      {mmp.name || mmp.mmp_id || mmp.id}
                                    </h4>
                                    <p className="text-xs text-muted-foreground mt-1">
                                      {mmp.project?.name || mmp.project_name || '-'}
                                    </p>
                                  </div>
                                  {hasPermitAttached ? (
                                    <Badge variant="default" className="text-xs">Attached</Badge>
                                  ) : (
                                    <Badge variant="destructive" className="text-xs">Awaiting</Badge>
                                  )}
                                </div>
                                
                                <div className="grid grid-cols-2 gap-3 text-xs">
                                  <div>
                                    <span className="text-muted-foreground">Hub:</span>
                                    <div className="font-medium">{mmp.hub || '-'}</div>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Forwarded:</span>
                                    <div className="font-medium">{forwardedAt}</div>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Days Since:</span>
                                    <div className="font-medium">
                                      {daysSince !== null ? (
                                        <Badge variant={daysSince > 7 ? 'destructive' : 'secondary'} className="text-xs">
                                          {daysSince} day{daysSince !== 1 ? 's' : ''}
                                        </Badge>
                                      ) : (
                                        '-'
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="w-full min-h-[44px]"
                                  onClick={() => navigate(`/mmp/${mmp.id}${!hasPermitAttached ? '/verification' : ''}`)}
                                >
                                  {hasPermitAttached ? 'View MMP' : 'Attach Permit'}
                                </Button>
                              </div>
                            </Card>
                          );
                        })}
                      </div>

                      {/* Desktop Table View */}
                      <div className="hidden md:block border rounded-md">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>MMP Name</TableHead>
                              <TableHead>Project</TableHead>
                              <TableHead>Hub</TableHead>
                              <TableHead>Forwarded</TableHead>
                              <TableHead>Days Since</TableHead>
                              <TableHead>Permit Status</TableHead>
                              <TableHead className="text-right">Action</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredForwardedMMPs.map((mmp) => {
                              const hasPermitAttached = hasPermit(mmp);
                              const daysSince = getDaysSinceForwarded(mmp);
                              const workflow = mmp.workflow as any;
                              const forwardedAt = workflow?.forwardedAt 
                                ? format(new Date(workflow.forwardedAt), 'MMM dd, yyyy')
                                : '-';
                              
                              return (
                                <TableRow key={mmp.id} className="hover:bg-muted/50">
                                  <TableCell className="font-medium">
                                    {mmp.name || mmp.mmp_id || mmp.id}
                                  </TableCell>
                                  <TableCell>
                                    {mmp.project?.name || mmp.project_name || '-'}
                                  </TableCell>
                                  <TableCell>{mmp.hub || '-'}</TableCell>
                                  <TableCell className="text-xs">{forwardedAt}</TableCell>
                                  <TableCell>
                                    {daysSince !== null ? (
                                      <Badge variant={daysSince > 7 ? 'destructive' : 'secondary'}>
                                        {daysSince} day{daysSince !== 1 ? 's' : ''}
                                      </Badge>
                                    ) : (
                                      '-'
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {hasPermitAttached ? (
                                      <Badge variant="default">Attached</Badge>
                                    ) : (
                                      <Badge variant="destructive">Awaiting</Badge>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 px-2"
                                      onClick={() => navigate(`/mmp/${mmp.id}${!hasPermitAttached ? '/verification' : ''}`)}
                                    >
                                      {hasPermitAttached ? 'View' : 'Attach Permit'}
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Approvals Tab */}
            <TabsContent value="approvals" className="mt-3">
              <Card>
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <CardTitle className="text-lg">MMP Approval Queue</CardTitle>
                    {activeFilterCount > 0 && (
                      <Button variant="ghost" size="sm" onClick={clearAllFilters} className="gap-2 min-h-[44px] px-4">
                        <X className="h-4 w-4" />
                        Clear Filters ({activeFilterCount})
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Filters */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                    <Select
                      value={filters.hub}
                      onValueChange={(value) => setFilters(prev => ({ ...prev, hub: value === 'all' ? '' : value }))}
                    >
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="Hub" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Hubs</SelectItem>
                        {hubs.map((hub) => (
                          <SelectItem key={hub} value={hub}>{hub}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      value={filters.status}
                      onValueChange={(value) => setFilters(prev => ({ ...prev, status: value === 'all' ? '' : value }))}
                    >
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="submitted">Submitted</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {allMMPsLoading ? (
                    <div className="text-sm text-muted-foreground py-8 text-center">Loading...</div>
                  ) : filteredPendingMMPs.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-8 text-center">
                      No MMPs pending approval.
                    </div>
                  ) : (
                    <>
                      {/* Mobile Card View */}
                      <div className="block md:hidden space-y-3">
                        {filteredPendingMMPs.map((mmp) => (
                          <Card key={mmp.id} className="p-4">
                            <div className="space-y-3">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <h4 className="font-medium text-sm">
                                    {mmp.name || mmp.mmp_id || mmp.id}
                                  </h4>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {mmp.project?.name || mmp.project_name || '-'}
                                  </p>
                                </div>
                                <Badge variant={mmp.status === 'approved' ? 'default' : 'secondary'} className="text-xs">
                                  {mmp.status || 'pending'}
                                </Badge>
                              </div>
                              
                              <div className="grid grid-cols-2 gap-3 text-xs">
                                <div>
                                  <span className="text-muted-foreground">Hub:</span>
                                  <div className="font-medium">{mmp.hub || '-'}</div>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Uploaded:</span>
                                  <div className="font-medium">
                                    {mmp.uploaded_at 
                                      ? format(new Date(mmp.uploaded_at), 'MMM dd, yyyy')
                                      : '-'}
                                  </div>
                                </div>
                              </div>

                              <Button
                                size="sm"
                                variant="outline"
                                className="w-full min-h-[44px]"
                                onClick={() => navigate(`/mmp/${mmp.id}`)}
                              >
                                Review MMP
                              </Button>
                            </div>
                          </Card>
                        ))}
                      </div>

                      {/* Desktop Table View */}
                      <div className="hidden md:block border rounded-md">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>MMP Name</TableHead>
                              <TableHead>Project</TableHead>
                              <TableHead>Hub</TableHead>
                              <TableHead>Uploaded</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="text-right">Action</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredPendingMMPs.map((mmp) => (
                              <TableRow key={mmp.id} className="hover:bg-muted/50">
                                <TableCell className="font-medium">
                                  {mmp.name || mmp.mmp_id || mmp.id}
                                </TableCell>
                                <TableCell>
                                  {mmp.project?.name || mmp.project_name || '-'}
                                </TableCell>
                                <TableCell>{mmp.hub || '-'}</TableCell>
                                <TableCell>
                                  {mmp.uploaded_at 
                                    ? format(new Date(mmp.uploaded_at), 'MMM dd, yyyy')
                                    : '-'}
                                </TableCell>
                                <TableCell>
                                  <Badge variant={mmp.status === 'approved' ? 'default' : 'secondary'}>
                                    {mmp.status || 'pending'}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2"
                                    onClick={() => navigate(`/mmp/${mmp.id}`)}
                                  >
                                    Review
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Site Visits Tab */}
            <TabsContent value="site-visits" className="mt-3 space-y-3">
              <SiteVisitsOverview />
            </TabsContent>

            {/* Finance Tab */}
            <TabsContent value="finance" className="mt-3">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Financial Overview</CardTitle>
                </CardHeader>
                <CardContent>
                  {financialLoading ? (
                    <div className="text-sm text-muted-foreground py-8 text-center">Loading financial data...</div>
                  ) : financialData ? (
                    <div className="space-y-6">
                      {/* Financial Metrics Cards */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <Card>
                          <CardHeader className="pb-3">
                            <CardTitle className="text-base font-medium flex items-center gap-2">
                              <DollarSign className="h-4 w-4 text-green-600" />
                              Site Visit Costs
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="text-2xl font-bold text-green-600">
                              ${financialData.totalVisitsCost.toLocaleString()}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {financialData.completedVisits} completed visits
                            </div>
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader className="pb-3">
                            <CardTitle className="text-base font-medium flex items-center gap-2">
                              <FileText className="h-4 w-4 text-blue-600" />
                              MMP Costs
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="text-2xl font-bold text-blue-600">
                              ${financialData.totalMMPCost.toLocaleString()}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              From site entries
                            </div>
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader className="pb-3">
                            <CardTitle className="text-base font-medium flex items-center gap-2">
                              <Activity className="h-4 w-4 text-purple-600" />
                              Total Operations
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="text-2xl font-bold text-purple-600">
                              {financialData.totalVisits}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              Site visits tracked
                            </div>
                          </CardContent>
                        </Card>
                      </div>

                      {/* Cost Summary Component */}
                      <SiteVisitCostSummary />
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground py-8 text-center">
                      No financial data available.
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

