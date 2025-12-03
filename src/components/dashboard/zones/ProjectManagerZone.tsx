import { useState, useMemo, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { GradientStatCard } from '@/components/ui/gradient-stat-card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
  Briefcase,
  DollarSign, 
  Calendar, 
  Users,
  CheckCircle2,
  Clock,
  AlertTriangle,
  TrendingUp,
  Target,
  BarChart3,
  ExternalLink,
  FolderKanban,
  MapPin,
  Activity,
  FileText,
  Shield,
  ArrowRight,
  RefreshCw,
  AlertCircle,
  Timer,
  Wallet,
  ClipboardCheck,
  CheckSquare,
  XCircle
} from 'lucide-react';
import { format, differenceInDays, isAfter, isBefore, addDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';
import { useSiteVisitContext } from '@/context/siteVisit/SiteVisitContext';
import { useUserProjects } from '@/hooks/useUserProjects';
import { useMMP } from '@/context/mmp/MMPContext';
import { useBudget } from '@/context/budget/BudgetContext';
import { useNavigate, useLocation } from 'react-router-dom';

interface ProjectData {
  id: string;
  name: string;
  project_code?: string;
  status?: string;
  start_date?: string;
  end_date?: string;
  budget?: any;
  team?: any;
  activities?: any[];
  created_at?: string;
}

interface PendingApproval {
  id: string;
  type: 'budget' | 'cost' | 'mmp' | 'deadline' | 'withdrawal';
  title: string;
  description: string;
  amount?: number;
  projectId?: string;
  projectName?: string;
  requestedBy?: string;
  requestedAt: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'approved' | 'rejected';
}

interface DeadlineItem {
  id: string;
  title: string;
  dueDate: string;
  projectName: string;
  type: 'activity' | 'milestone' | 'deliverable';
  status: 'upcoming' | 'due_soon' | 'overdue' | 'completed';
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-SD', {
    style: 'currency',
    currency: 'SDG',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export const ProjectManagerZone: React.FC = () => {
  const { currentUser, hasGranularPermission } = useAppContext();
  const { siteVisits } = useSiteVisitContext();
  const { mmpFiles } = useMMP();
  const { userProjects, userProjectIds, isAdminOrSuperUser } = useUserProjects();
  const { projectBudgets, stats: budgetStats } = useBudget();
  const navigate = useNavigate();
  const location = useLocation();
  
  const getInitialTab = () => {
    const params = new URLSearchParams(location.search);
    const tabParam = params.get('tab');
    if (tabParam && ['overview', 'approvals', 'budget', 'deadlines', 'team', 'reports'].includes(tabParam)) {
      return tabParam;
    }
    return 'overview';
  };
  
  const [activeTab, setActiveTab] = useState(getInitialTab);
  
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tabParam = params.get('tab');
    if (tabParam && ['overview', 'approvals', 'budget', 'deadlines', 'team', 'reports'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [location.search]);
  
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedApproval, setSelectedApproval] = useState<PendingApproval | null>(null);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [approving, setApproving] = useState(false);
  const [selectedProject, setSelectedProject] = useState<string>('all');

  useEffect(() => {
    let cancelled = false;
    const loadProjects = async () => {
      setLoading(true);
      try {
        let query = supabase
          .from('projects')
          .select('*')
          .order('created_at', { ascending: false });

        if (!isAdminOrSuperUser && userProjectIds.length > 0) {
          query = query.in('id', userProjectIds);
        }

        const { data, error } = await query;
        if (!cancelled && !error) {
          setProjects((data || []) as ProjectData[]);
        }
      } catch (err) {
        console.error('Error loading projects:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadProjects();
    return () => { cancelled = true; };
  }, [userProjectIds, isAdminOrSuperUser]);

  useEffect(() => {
    const loadPendingApprovals = async () => {
      const approvals: PendingApproval[] = [];

      try {
        const { data: costData } = await supabase
          .from('cost_submissions')
          .select('*, profiles:submitted_by(full_name)')
          .eq('status', 'pending')
          .limit(20);

        if (costData) {
          costData.forEach((cost: any) => {
            approvals.push({
              id: cost.id,
              type: 'cost',
              title: `Cost Submission - ${cost.description || 'No description'}`,
              description: `Amount: ${formatCurrency(cost.amount || 0)}`,
              amount: cost.amount,
              projectId: cost.project_id,
              requestedBy: cost.profiles?.full_name || 'Unknown',
              requestedAt: cost.created_at,
              priority: cost.amount > 10000 ? 'high' : 'medium',
              status: 'pending'
            });
          });
        }

        const { data: withdrawalData } = await supabase
          .from('withdrawal_requests')
          .select('*, profiles:user_id(full_name)')
          .eq('status', 'pending')
          .limit(20);

        if (withdrawalData) {
          withdrawalData.forEach((withdrawal: any) => {
            approvals.push({
              id: withdrawal.id,
              type: 'withdrawal',
              title: `Withdrawal Request`,
              description: `Amount: ${formatCurrency(withdrawal.amount || 0)}`,
              amount: withdrawal.amount,
              requestedBy: withdrawal.profiles?.full_name || 'Unknown',
              requestedAt: withdrawal.created_at,
              priority: withdrawal.amount > 5000 ? 'high' : 'medium',
              status: 'pending'
            });
          });
        }

        const pendingMMPs = mmpFiles?.filter(m => m.status === 'pending' || m.status === 'submitted') || [];
        pendingMMPs.forEach(mmp => {
          approvals.push({
            id: mmp.id,
            type: 'mmp',
            title: `MMP Approval - ${mmp.name || mmp.mmpId || 'Unnamed'}`,
            description: `Project: ${mmp.projectName || 'Not assigned'}`,
            projectId: mmp.projectId,
            projectName: mmp.projectName,
            requestedAt: mmp.createdAt || new Date().toISOString(),
            priority: 'medium',
            status: 'pending'
          });
        });

        approvals.sort((a, b) => {
          const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        });

        setPendingApprovals(approvals);
      } catch (err) {
        console.error('Error loading pending approvals:', err);
      }
    };

    loadPendingApprovals();
    const interval = setInterval(loadPendingApprovals, 60000);
    return () => clearInterval(interval);
  }, [mmpFiles]);

  const projectStats = useMemo(() => {
    const total = projects.length;
    const active = projects.filter(p => p.status === 'active').length;
    const completed = projects.filter(p => p.status === 'completed').length;
    const onHold = projects.filter(p => p.status === 'onHold').length;
    const draft = projects.filter(p => p.status === 'draft').length;
    return { total, active, completed, onHold, draft };
  }, [projects]);

  const filteredSiteVisits = useMemo(() => {
    if (selectedProject === 'all') return siteVisits;
    const projectMmpIds = new Set(
      mmpFiles?.filter(m => m.projectId === selectedProject).map(m => m.id) || []
    );
    return siteVisits.filter(v => v.mmpDetails?.mmpId && projectMmpIds.has(v.mmpDetails.mmpId));
  }, [siteVisits, mmpFiles, selectedProject]);

  const siteVisitStats = useMemo(() => {
    const total = filteredSiteVisits.length;
    const completed = filteredSiteVisits.filter(v => v.status === 'completed').length;
    const pending = filteredSiteVisits.filter(v => v.status === 'pending' || v.status === 'permitVerified').length;
    const inProgress = filteredSiteVisits.filter(v => v.status === 'assigned' || v.status === 'inProgress').length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, pending, inProgress, completionRate };
  }, [filteredSiteVisits]);

  const budgetOverview = useMemo(() => {
    const filtered = selectedProject === 'all' 
      ? projectBudgets 
      : projectBudgets.filter(b => b.projectId === selectedProject);
    
    const totalBudget = filtered.reduce((sum, b) => sum + (b.totalBudgetCents || 0), 0) / 100;
    const totalSpent = filtered.reduce((sum, b) => sum + (b.spentBudgetCents || 0), 0) / 100;
    const remaining = totalBudget - totalSpent;
    const utilizationRate = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;

    return { totalBudget, totalSpent, remaining, utilizationRate, count: filtered.length };
  }, [projectBudgets, selectedProject]);

  const deadlines = useMemo((): DeadlineItem[] => {
    const items: DeadlineItem[] = [];
    const now = new Date();

    projects.forEach(project => {
      if (project.end_date) {
        const endDate = new Date(project.end_date);
        const daysUntil = differenceInDays(endDate, now);
        let status: DeadlineItem['status'] = 'upcoming';
        if (daysUntil < 0) status = 'overdue';
        else if (daysUntil <= 7) status = 'due_soon';
        else if (project.status === 'completed') status = 'completed';

        items.push({
          id: project.id,
          title: `Project End: ${project.name}`,
          dueDate: project.end_date,
          projectName: project.name,
          type: 'milestone',
          status
        });
      }

      if (Array.isArray(project.activities)) {
        project.activities.forEach((activity: any) => {
          if (activity.endDate) {
            const endDate = new Date(activity.endDate);
            const daysUntil = differenceInDays(endDate, now);
            let status: DeadlineItem['status'] = 'upcoming';
            if (daysUntil < 0) status = 'overdue';
            else if (daysUntil <= 7) status = 'due_soon';
            else if (activity.status === 'completed') status = 'completed';

            items.push({
              id: activity.id,
              title: activity.name,
              dueDate: activity.endDate,
              projectName: project.name,
              type: 'activity',
              status
            });
          }
        });
      }
    });

    items.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    return items;
  }, [projects]);

  const overdueCount = deadlines.filter(d => d.status === 'overdue').length;
  const dueSoonCount = deadlines.filter(d => d.status === 'due_soon').length;

  const handleApprove = async (approval: PendingApproval) => {
    setApproving(true);
    try {
      if (approval.type === 'cost') {
        await supabase
          .from('cost_submissions')
          .update({ status: 'approved', approved_by: currentUser?.id, approved_at: new Date().toISOString() })
          .eq('id', approval.id);
      } else if (approval.type === 'withdrawal') {
        await supabase
          .from('withdrawal_requests')
          .update({ status: 'approved', approved_by: currentUser?.id, approved_at: new Date().toISOString() })
          .eq('id', approval.id);
      } else if (approval.type === 'mmp') {
        await supabase
          .from('mmp_files')
          .update({ status: 'approved' })
          .eq('id', approval.id);
      }

      setPendingApprovals(prev => prev.filter(a => a.id !== approval.id));
      setApprovalDialogOpen(false);
    } catch (err) {
      console.error('Error approving:', err);
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async (approval: PendingApproval) => {
    setApproving(true);
    try {
      if (approval.type === 'cost') {
        await supabase
          .from('cost_submissions')
          .update({ status: 'rejected', approved_by: currentUser?.id, approved_at: new Date().toISOString() })
          .eq('id', approval.id);
      } else if (approval.type === 'withdrawal') {
        await supabase
          .from('withdrawal_requests')
          .update({ status: 'rejected', approved_by: currentUser?.id, approved_at: new Date().toISOString() })
          .eq('id', approval.id);
      } else if (approval.type === 'mmp') {
        await supabase
          .from('mmp_files')
          .update({ status: 'rejected' })
          .eq('id', approval.id);
      }

      setPendingApprovals(prev => prev.filter(a => a.id !== approval.id));
      setApprovalDialogOpen(false);
    } catch (err) {
      console.error('Error rejecting:', err);
    } finally {
      setApproving(false);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-yellow-500';
      default: return 'bg-green-500';
    }
  };

  const getStatusBadge = (status: DeadlineItem['status']) => {
    switch (status) {
      case 'overdue':
        return <Badge variant="destructive">Overdue</Badge>;
      case 'due_soon':
        return <Badge className="bg-orange-500">Due Soon</Badge>;
      case 'completed':
        return <Badge variant="secondary">Completed</Badge>;
      default:
        return <Badge variant="outline">Upcoming</Badge>;
    }
  };

  const canApprove = hasGranularPermission('finances', 'approve') || 
                     hasGranularPermission('projects', 'approve');

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-700 flex items-center justify-center">
            <Briefcase className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Project Manager Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Full project oversight, budget approval, and deadline management
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedProject} onValueChange={setSelectedProject}>
            <SelectTrigger className="w-[200px]" data-testid="select-project-filter">
              <SelectValue placeholder="Filter by project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {projects.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => navigate('/projects')} data-testid="button-view-projects">
            <FolderKanban className="w-4 h-4 mr-2" />
            Projects
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <GradientStatCard
          title="Active Projects"
          value={projectStats.active}
          subtitle={`${projectStats.total} total projects`}
          icon={FolderKanban}
          color="blue"
          onClick={() => navigate('/projects')}
          data-testid="card-stat-active-projects"
        />
        <GradientStatCard
          title="Pending Approvals"
          value={pendingApprovals.length}
          subtitle={pendingApprovals.filter(a => a.priority === 'critical' || a.priority === 'high').length + ' high priority'}
          icon={ClipboardCheck}
          color="orange"
          onClick={() => setActiveTab('approvals')}
          data-testid="card-stat-pending-approvals"
        />
        <GradientStatCard
          title="Budget Utilization"
          value={`${budgetOverview.utilizationRate}%`}
          subtitle={formatCurrency(budgetOverview.remaining) + ' remaining'}
          icon={DollarSign}
          color="green"
          onClick={() => setActiveTab('budget')}
          data-testid="card-stat-budget"
        />
        <GradientStatCard
          title="Site Visits"
          value={siteVisitStats.total}
          subtitle={`${siteVisitStats.completionRate}% completed`}
          icon={MapPin}
          color="cyan"
          onClick={() => navigate('/site-visits')}
          data-testid="card-stat-site-visits"
        />
        <GradientStatCard
          title="Deadlines"
          value={dueSoonCount + overdueCount}
          subtitle={overdueCount > 0 ? `${overdueCount} overdue` : 'On track'}
          icon={Calendar}
          color={overdueCount > 0 ? 'red' : 'purple'}
          onClick={() => setActiveTab('deadlines')}
          data-testid="card-stat-deadlines"
        />
        <GradientStatCard
          title="Team Members"
          value={projects.reduce((sum, p) => sum + ((p.team?.teamComposition?.length || 0) + (p.team?.members?.length || 0)), 0)}
          subtitle="Across all projects"
          icon={Users}
          color="indigo"
          onClick={() => setActiveTab('team')}
          data-testid="card-stat-team"
        />
      </div>

      <Card className="border-border/50 bg-gradient-to-r from-muted/30 via-background to-muted/30">
        <CardContent className="p-2">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-6 h-auto p-0.5 bg-transparent border border-border/30">
              <TabsTrigger 
                value="overview" 
                className="gap-1 px-2 py-1.5 data-[state=active]:bg-primary/10 data-[state=active]:border-primary/20 data-[state=active]:shadow-sm border border-transparent"
                data-testid="tab-overview"
              >
                <BarChart3 className="h-3 w-3" />
                <span className="text-[10px] font-semibold uppercase tracking-wide hidden sm:inline">Overview</span>
              </TabsTrigger>
              <TabsTrigger 
                value="approvals" 
                className="gap-1 px-2 py-1.5 data-[state=active]:bg-orange-500/10 data-[state=active]:border-orange-500/20 data-[state=active]:shadow-sm border border-transparent"
                data-testid="tab-approvals"
              >
                <ClipboardCheck className="h-3 w-3" />
                <span className="text-[10px] font-semibold uppercase tracking-wide hidden sm:inline">Approvals</span>
                {pendingApprovals.length > 0 && (
                  <Badge variant="destructive" className="ml-1 h-4 px-1 text-[10px]">{pendingApprovals.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger 
                value="budget" 
                className="gap-1 px-2 py-1.5 data-[state=active]:bg-green-500/10 data-[state=active]:border-green-500/20 data-[state=active]:shadow-sm border border-transparent"
                data-testid="tab-budget"
              >
                <DollarSign className="h-3 w-3" />
                <span className="text-[10px] font-semibold uppercase tracking-wide hidden sm:inline">Budget</span>
              </TabsTrigger>
              <TabsTrigger 
                value="deadlines" 
                className="gap-1 px-2 py-1.5 data-[state=active]:bg-purple-500/10 data-[state=active]:border-purple-500/20 data-[state=active]:shadow-sm border border-transparent"
                data-testid="tab-deadlines"
              >
                <Calendar className="h-3 w-3" />
                <span className="text-[10px] font-semibold uppercase tracking-wide hidden sm:inline">Deadlines</span>
                {overdueCount > 0 && (
                  <Badge variant="destructive" className="ml-1 h-4 px-1 text-[10px]">{overdueCount}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger 
                value="team" 
                className="gap-1 px-2 py-1.5 data-[state=active]:bg-blue-500/10 data-[state=active]:border-blue-500/20 data-[state=active]:shadow-sm border border-transparent"
                data-testid="tab-team"
              >
                <Users className="h-3 w-3" />
                <span className="text-[10px] font-semibold uppercase tracking-wide hidden sm:inline">Team</span>
              </TabsTrigger>
              <TabsTrigger 
                value="reports" 
                className="gap-1 px-2 py-1.5 data-[state=active]:bg-cyan-500/10 data-[state=active]:border-cyan-500/20 data-[state=active]:shadow-sm border border-transparent"
                data-testid="tab-reports"
              >
                <FileText className="h-3 w-3" />
                <span className="text-[10px] font-semibold uppercase tracking-wide hidden sm:inline">Reports</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-3 space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FolderKanban className="h-5 w-5 text-blue-600" />
                      Project Status
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {loading ? (
                      <div className="flex items-center justify-center py-8">
                        <RefreshCw className="w-5 h-5 animate-spin" />
                      </div>
                    ) : projects.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        No projects found
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {projects.slice(0, 5).map(project => {
                          const progress = project.status === 'completed' ? 100 :
                            project.status === 'active' ? 50 :
                            project.status === 'draft' ? 0 : 25;
                          
                          return (
                            <div 
                              key={project.id}
                              className="p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                              onClick={() => navigate(`/projects/${project.id}`)}
                              data-testid={`card-project-${project.id}`}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <div>
                                  <span className="font-medium">{project.name}</span>
                                  {project.project_code && (
                                    <Badge variant="outline" className="ml-2 text-xs">{project.project_code}</Badge>
                                  )}
                                </div>
                                <Badge variant={project.status === 'active' ? 'default' : 'secondary'}>
                                  {project.status || 'draft'}
                                </Badge>
                              </div>
                              <Progress value={progress} className="h-1.5" />
                              <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                                <span>
                                  {project.start_date && format(new Date(project.start_date), 'MMM d, yyyy')}
                                  {project.end_date && ` - ${format(new Date(project.end_date), 'MMM d, yyyy')}`}
                                </span>
                                <ExternalLink className="h-3 w-3" />
                              </div>
                            </div>
                          );
                        })}
                        {projects.length > 5 && (
                          <Button variant="outline" className="w-full" onClick={() => navigate('/projects')}>
                            View All Projects ({projects.length})
                          </Button>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-orange-600" />
                      Urgent Items
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {overdueCount > 0 && (
                      <div 
                        className="p-3 border border-red-500/30 rounded-lg bg-red-500/5 cursor-pointer hover:bg-red-500/10"
                        onClick={() => setActiveTab('deadlines')}
                      >
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-red-500" />
                          <span className="font-medium text-red-700 dark:text-red-400">{overdueCount} Overdue Deadlines</span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          Activities or milestones past their due date
                        </p>
                      </div>
                    )}
                    {pendingApprovals.filter(a => a.priority === 'critical' || a.priority === 'high').length > 0 && (
                      <div 
                        className="p-3 border border-orange-500/30 rounded-lg bg-orange-500/5 cursor-pointer hover:bg-orange-500/10"
                        onClick={() => setActiveTab('approvals')}
                      >
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-orange-500" />
                          <span className="font-medium text-orange-700 dark:text-orange-400">
                            {pendingApprovals.filter(a => a.priority === 'critical' || a.priority === 'high').length} High Priority Approvals
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          Requests requiring immediate attention
                        </p>
                      </div>
                    )}
                    {budgetOverview.utilizationRate > 80 && (
                      <div 
                        className="p-3 border border-yellow-500/30 rounded-lg bg-yellow-500/5 cursor-pointer hover:bg-yellow-500/10"
                        onClick={() => setActiveTab('budget')}
                      >
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-yellow-500" />
                          <span className="font-medium text-yellow-700 dark:text-yellow-400">Budget Alert</span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          Budget utilization at {budgetOverview.utilizationRate}%
                        </p>
                      </div>
                    )}
                    {overdueCount === 0 && pendingApprovals.filter(a => a.priority === 'critical' || a.priority === 'high').length === 0 && budgetOverview.utilizationRate <= 80 && (
                      <div className="p-4 text-center text-muted-foreground">
                        <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                        <p>All caught up! No urgent items.</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Activity className="h-5 w-5 text-purple-600" />
                    Quick Statistics
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-4 border rounded-lg text-center">
                      <div className="text-2xl font-bold text-blue-600">{projectStats.active}</div>
                      <div className="text-sm text-muted-foreground">Active Projects</div>
                    </div>
                    <div className="p-4 border rounded-lg text-center">
                      <div className="text-2xl font-bold text-green-600">{siteVisitStats.completed}</div>
                      <div className="text-sm text-muted-foreground">Completed Visits</div>
                    </div>
                    <div className="p-4 border rounded-lg text-center">
                      <div className="text-2xl font-bold text-purple-600">{formatCurrency(budgetOverview.totalSpent)}</div>
                      <div className="text-sm text-muted-foreground">Total Spent</div>
                    </div>
                    <div className="p-4 border rounded-lg text-center">
                      <div className="text-2xl font-bold text-orange-600">{pendingApprovals.length}</div>
                      <div className="text-sm text-muted-foreground">Pending Approvals</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="approvals" className="mt-3 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <ClipboardCheck className="h-5 w-5 text-orange-600" />
                      Pending Approvals
                    </div>
                    <Badge variant="outline">{pendingApprovals.length} items</Badge>
                  </CardTitle>
                  <CardDescription>
                    Review and approve budget requests, cost submissions, and MMP submissions
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {pendingApprovals.length === 0 ? (
                    <div className="text-center py-12">
                      <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-4" />
                      <h3 className="text-lg font-semibold mb-2">All Caught Up!</h3>
                      <p className="text-muted-foreground">No pending approvals at this time.</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Priority</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Requested By</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pendingApprovals.map(approval => (
                          <TableRow key={approval.id} data-testid={`row-approval-${approval.id}`}>
                            <TableCell>
                              <div className={`w-2 h-2 rounded-full ${getPriorityColor(approval.priority)}`} />
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="capitalize">{approval.type}</Badge>
                            </TableCell>
                            <TableCell>
                              <div>
                                <div className="font-medium">{approval.title}</div>
                                <div className="text-sm text-muted-foreground">{approval.description}</div>
                              </div>
                            </TableCell>
                            <TableCell>{approval.requestedBy || 'N/A'}</TableCell>
                            <TableCell>{format(new Date(approval.requestedAt), 'MMM d, yyyy')}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => {
                                    setSelectedApproval(approval);
                                    setApprovalDialogOpen(true);
                                  }}
                                  data-testid={`button-review-${approval.id}`}
                                >
                                  Review
                                </Button>
                                {canApprove && (
                                  <>
                                    <Button 
                                      size="sm"
                                      onClick={() => handleApprove(approval)}
                                      disabled={approving}
                                      data-testid={`button-approve-${approval.id}`}
                                    >
                                      <CheckSquare className="h-3 w-3 mr-1" />
                                      Approve
                                    </Button>
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="budget" className="mt-3 space-y-4">
              <div className="grid md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Total Budget</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatCurrency(budgetOverview.totalBudget)}</div>
                    <p className="text-xs text-muted-foreground">Across {budgetOverview.count} budgets</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Total Spent</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatCurrency(budgetOverview.totalSpent)}</div>
                    <p className="text-xs text-muted-foreground">{budgetOverview.utilizationRate}% utilized</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Remaining</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">{formatCurrency(budgetOverview.remaining)}</div>
                    <p className="text-xs text-muted-foreground">Available for allocation</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Pending Costs</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-orange-600">
                      {pendingApprovals.filter(a => a.type === 'cost').length}
                    </div>
                    <p className="text-xs text-muted-foreground">Awaiting your approval</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-green-600" />
                    Budget Breakdown by Project
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {projectBudgets.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No budget data available. Create project budgets to track spending.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {projectBudgets.slice(0, 5).map(budget => {
                        const utilization = budget.totalBudgetCents > 0 
                          ? (budget.spentBudgetCents / budget.totalBudgetCents) * 100 
                          : 0;
                        
                        return (
                          <div key={budget.id} className="p-4 border rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium">FY {budget.fiscalYear}</span>
                              <Badge variant={budget.status === 'active' ? 'default' : 'secondary'}>
                                {budget.status}
                              </Badge>
                            </div>
                            <Progress value={utilization} className="h-2 mb-2" />
                            <div className="flex items-center justify-between text-sm text-muted-foreground">
                              <span>Spent: {formatCurrency(budget.spentBudgetCents / 100)}</span>
                              <span>Total: {formatCurrency(budget.totalBudgetCents / 100)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <Button 
                    variant="outline" 
                    className="w-full mt-4"
                    onClick={() => navigate('/budget')}
                  >
                    View Full Budget Management
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="deadlines" className="mt-3 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-5 w-5 text-purple-600" />
                      Upcoming Deadlines
                    </div>
                    <div className="flex items-center gap-2">
                      {overdueCount > 0 && (
                        <Badge variant="destructive">{overdueCount} overdue</Badge>
                      )}
                      {dueSoonCount > 0 && (
                        <Badge className="bg-orange-500">{dueSoonCount} due soon</Badge>
                      )}
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {deadlines.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No deadlines tracked. Add activities with due dates to your projects.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Status</TableHead>
                          <TableHead>Item</TableHead>
                          <TableHead>Project</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Due Date</TableHead>
                          <TableHead>Days</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {deadlines.slice(0, 15).map(deadline => {
                          const daysUntil = differenceInDays(new Date(deadline.dueDate), new Date());
                          return (
                            <TableRow key={deadline.id} data-testid={`row-deadline-${deadline.id}`}>
                              <TableCell>{getStatusBadge(deadline.status)}</TableCell>
                              <TableCell className="font-medium">{deadline.title}</TableCell>
                              <TableCell>{deadline.projectName}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="capitalize">{deadline.type}</Badge>
                              </TableCell>
                              <TableCell>{format(new Date(deadline.dueDate), 'MMM d, yyyy')}</TableCell>
                              <TableCell>
                                <span className={daysUntil < 0 ? 'text-red-500 font-medium' : daysUntil <= 7 ? 'text-orange-500' : ''}>
                                  {daysUntil < 0 ? `${Math.abs(daysUntil)}d overdue` : `${daysUntil}d`}
                                </span>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="team" className="mt-3 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-blue-600" />
                    Team Overview
                  </CardTitle>
                  <CardDescription>
                    View and manage team members across all your projects
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {projects.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No projects found. Create a project to add team members.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {projects.filter(p => p.team).map(project => (
                        <div key={project.id} className="p-4 border rounded-lg">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <FolderKanban className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{project.name}</span>
                            </div>
                            <Badge variant="outline">
                              {(project.team?.teamComposition?.length || 0) + (project.team?.members?.length || 0)} members
                            </Badge>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {project.team?.teamComposition?.slice(0, 5).map((member: any, idx: number) => (
                              <Badge key={idx} variant="secondary" className="text-xs">
                                {member.name || 'Team Member'} - {member.role}
                              </Badge>
                            ))}
                            {(project.team?.teamComposition?.length || 0) > 5 && (
                              <Badge variant="outline" className="text-xs">
                                +{project.team.teamComposition.length - 5} more
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <Button 
                    variant="outline" 
                    className="w-full mt-4"
                    onClick={() => navigate('/users')}
                  >
                    View All Team Members
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="reports" className="mt-3 space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <Card className="cursor-pointer hover:bg-muted/50" onClick={() => navigate('/reports')}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-cyan-600" />
                      Project Reports
                    </CardTitle>
                    <CardDescription>
                      Generate detailed project progress and status reports
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button variant="outline" className="w-full">
                      View Reports <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>

                <Card className="cursor-pointer hover:bg-muted/50" onClick={() => navigate('/budget')}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <DollarSign className="h-5 w-5 text-green-600" />
                      Financial Reports
                    </CardTitle>
                    <CardDescription>
                      Budget utilization and expense tracking reports
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button variant="outline" className="w-full">
                      View Financial Reports <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>

                <Card className="cursor-pointer hover:bg-muted/50" onClick={() => navigate('/site-visits')}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MapPin className="h-5 w-5 text-blue-600" />
                      Site Visit Reports
                    </CardTitle>
                    <CardDescription>
                      Field activity and site visit completion reports
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button variant="outline" className="w-full">
                      View Site Reports <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>

                <Card className="cursor-pointer hover:bg-muted/50" onClick={() => navigate('/data-visibility')}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5 text-purple-600" />
                      Analytics Dashboard
                    </CardTitle>
                    <CardDescription>
                      Comprehensive data analytics and insights
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button variant="outline" className="w-full">
                      View Analytics <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={approvalDialogOpen} onOpenChange={setApprovalDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review Approval Request</DialogTitle>
            <DialogDescription>
              Review the details below and approve or reject this request.
            </DialogDescription>
          </DialogHeader>
          {selectedApproval && (
            <div className="space-y-4">
              <div className="p-4 border rounded-lg bg-muted/50">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-2 h-2 rounded-full ${getPriorityColor(selectedApproval.priority)}`} />
                  <Badge variant="outline" className="capitalize">{selectedApproval.type}</Badge>
                  <Badge variant="secondary" className="capitalize">{selectedApproval.priority} priority</Badge>
                </div>
                <h4 className="font-medium">{selectedApproval.title}</h4>
                <p className="text-sm text-muted-foreground mt-1">{selectedApproval.description}</p>
                {selectedApproval.requestedBy && (
                  <p className="text-sm mt-2">
                    <span className="text-muted-foreground">Requested by:</span> {selectedApproval.requestedBy}
                  </p>
                )}
                <p className="text-sm">
                  <span className="text-muted-foreground">Date:</span> {format(new Date(selectedApproval.requestedAt), 'MMM d, yyyy HH:mm')}
                </p>
              </div>
            </div>
          )}
          <DialogFooter className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => setApprovalDialogOpen(false)}
              data-testid="button-cancel-approval"
            >
              Cancel
            </Button>
            {canApprove && selectedApproval && (
              <>
                <Button 
                  variant="destructive"
                  onClick={() => handleReject(selectedApproval)}
                  disabled={approving}
                  data-testid="button-reject-dialog"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Reject
                </Button>
                <Button 
                  onClick={() => handleApprove(selectedApproval)}
                  disabled={approving}
                  data-testid="button-approve-dialog"
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Approve
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
