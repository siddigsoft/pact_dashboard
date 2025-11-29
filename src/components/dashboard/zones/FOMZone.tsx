import React, { useState, useMemo, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { GradientStatCard } from '@/components/ui/gradient-stat-card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
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
  useEffect(() => {
    let cancelled = false;
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
            id, name, mmp_id, status, workflow, uploaded_at, hub, month, project_name,
            project:projects(name, project_code),
            permits
          `)
          .contains('workflow', { forwardedToFomIds: [currentUser.id] })
          .order('created_at', { ascending: false });
        
        if (!cancelled) {
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
        }
      } catch (err) {
        // Silently fail - don't log RLS errors to console
        if (!cancelled) setForwardedMMPs([]);
      } finally {
        if (!cancelled) setForwardedLoading(false);
      }
    };
    loadForwarded();
    const interval = setInterval(loadForwarded, 60000); // Refresh every minute
    return () => { cancelled = true; clearInterval(interval); };
  }, [currentUser?.id]);

  // Load all MMPs for approval queue (pending approval)
  useEffect(() => {
    let cancelled = false;
    const loadAllMMPs = async () => {
      setAllMMPsLoading(true);
      try {
        const { data, error } = await supabase
          .from('mmp_files')
          .select(`
            id, name, mmp_id, status, workflow, uploaded_at, hub, month, project_name,
            project:projects(name, project_code)
          `)
          .in('status', ['pending', 'submitted'])
          .order('created_at', { ascending: false })
          .limit(50);
        
        if (!cancelled) {
          if (error) {
            console.error('Failed to load MMPs:', error);
            setAllMMPs([]);
          } else {
            setAllMMPs((data || []) as MMPFile[]);
          }
        }
      } catch (err) {
        console.error('Error loading MMPs:', err);
        if (!cancelled) setAllMMPs([]);
      } finally {
        if (!cancelled) setAllMMPsLoading(false);
      }
    };
    loadAllMMPs();
    const interval = setInterval(loadAllMMPs, 120000); // Refresh every 2 minutes
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

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
    <div className="p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center">
            <Shield className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Field Operations Manager</h1>
            <p className="text-sm text-muted-foreground">
              Permits, approvals, and field operations oversight
            </p>
          </div>
        </div>
     
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <GradientStatCard
          title="Awaiting Permits"
          value={awaitingPermitsCount}
          subtitle="MMPs needing permits"
          icon={FileCheck}
          color="orange"
          onClick={() => setSelectedCard('awaiting-permits')}
        />

        <GradientStatCard
          title="Permits Attached"
          value={permitsAttachedCount}
          subtitle={`${permitAttachmentRate}% completion`}
          icon={CheckCircle2}
          color="green"
          onClick={() => setSelectedCard('permits-attached')}
        />

        <GradientStatCard
          title="Pending Approval"
          value={pendingApprovalCount}
          subtitle="MMPs in queue"
          icon={Clock}
          color="blue"
          onClick={() => setSelectedCard('pending-approval')}
        />

        <GradientStatCard
          title="Approved MMPs"
          value={approvedCount}
          subtitle="This period"
          icon={Target}
          color="green"
          onClick={() => setSelectedCard('approved')}
        />

        <GradientStatCard
          title="Site Visits"
          value={totalVisits}
          subtitle={`${completionRate}% completed`}
          icon={MapPin}
          color="cyan"
          onClick={() => setSelectedCard('site-visits')}
        />

        <GradientStatCard
          title="Performance"
          value={`${permitAttachmentRate}%`}
          subtitle="Permit attachment rate"
          icon={TrendingUp}
          color="purple"
          onClick={() => setSelectedCard('performance')}
        />
      </div>

      {/* Main Content Tabs */}
      <Card className="border-border/50 bg-gradient-to-r from-muted/30 via-background to-muted/30">
        <CardContent className="p-2">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-5 h-auto p-0.5 bg-transparent border border-border/30">
              <TabsTrigger 
                value="overview" 
                className="gap-1 px-2 py-1.5 data-[state=active]:bg-primary/10 data-[state=active]:border-primary/20 data-[state=active]:shadow-sm border border-transparent"
              >
                <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center">
                  <FileText className="h-3 w-3 text-primary" />
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wide">Overview</span>
              </TabsTrigger>
              <TabsTrigger 
                value="permits" 
                className="gap-1 px-2 py-1.5 data-[state=active]:bg-orange-500/10 data-[state=active]:border-orange-500/20 data-[state=active]:shadow-sm border border-transparent"
              >
                <div className="w-5 h-5 rounded bg-orange-500/10 flex items-center justify-center">
                  <Shield className="h-3 w-3 text-orange-600 dark:text-orange-400" />
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wide">Permits</span>
              </TabsTrigger>
              <TabsTrigger 
                value="approvals" 
                className="gap-1 px-2 py-1.5 data-[state=active]:bg-blue-500/10 data-[state=active]:border-blue-500/20 data-[state=active]:shadow-sm border border-transparent"
              >
                <div className="w-5 h-5 rounded bg-blue-500/10 flex items-center justify-center">
                  <CheckCircle2 className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wide">Approvals</span>
              </TabsTrigger>
              <TabsTrigger 
                value="site-visits" 
                className="gap-1 px-2 py-1.5 data-[state=active]:bg-green-500/10 data-[state=active]:border-green-500/20 data-[state=active]:shadow-sm border border-transparent"
              >
                <div className="w-5 h-5 rounded bg-green-500/10 flex items-center justify-center">
                  <MapPin className="h-3 w-3 text-green-600 dark:text-green-400" />
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wide">Visits</span>
              </TabsTrigger>
              <TabsTrigger 
                value="finance" 
                className="gap-1 px-2 py-1.5 data-[state=active]:bg-amber-500/10 data-[state=active]:border-amber-500/20 data-[state=active]:shadow-sm border border-transparent"
              >
                <div className="w-5 h-5 rounded bg-amber-500/10 flex items-center justify-center">
                  <DollarSign className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wide">Finance</span>
              </TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="mt-3 space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
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
              <div className="grid md:grid-cols-3 gap-4">
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
                  <div className="flex items-center justify-between">
                    <CardTitle>MMPs Awaiting Permits</CardTitle>
                    {activeFilterCount > 0 && (
                      <Button variant="ghost" size="sm" onClick={clearAllFilters} className="gap-2">
                        <X className="h-4 w-4" />
                        Clear Filters ({activeFilterCount})
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Filters */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                    <Select
                      value={filters.hub}
                      onValueChange={(value) => setFilters(prev => ({ ...prev, hub: value === 'all' ? '' : value }))}
                    >
                      <SelectTrigger className="h-8 text-xs">
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
                      <SelectTrigger className="h-8 text-xs">
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
                    <div className="border rounded-md">
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
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Approvals Tab */}
            <TabsContent value="approvals" className="mt-3">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>MMP Approval Queue</CardTitle>
                    {activeFilterCount > 0 && (
                      <Button variant="ghost" size="sm" onClick={clearAllFilters} className="gap-2">
                        <X className="h-4 w-4" />
                        Clear Filters ({activeFilterCount})
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Filters */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                    <Select
                      value={filters.hub}
                      onValueChange={(value) => setFilters(prev => ({ ...prev, hub: value === 'all' ? '' : value }))}
                    >
                      <SelectTrigger className="h-8 text-xs">
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
                      <SelectTrigger className="h-8 text-xs">
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
                    <div className="border rounded-md">
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
                  <CardTitle>Financial Overview</CardTitle>
                </CardHeader>
                <CardContent>
                  {financialLoading ? (
                    <div className="text-sm text-muted-foreground py-8 text-center">Loading financial data...</div>
                  ) : financialData ? (
                    <div className="space-y-6">
                      <div className="grid md:grid-cols-3 gap-4">
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">Site Visit Costs</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="text-2xl font-bold">
                              ${financialData.totalVisitsCost.toLocaleString()}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {financialData.completedVisits} completed visits
                            </div>
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">MMP Costs</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="text-2xl font-bold">
                              ${financialData.totalMMPCost.toLocaleString()}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              From site entries
                            </div>
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">Total Operations</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="text-2xl font-bold">
                              {financialData.totalVisits}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              Site visits tracked
                            </div>
                          </CardContent>
                        </Card>
                      </div>

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

