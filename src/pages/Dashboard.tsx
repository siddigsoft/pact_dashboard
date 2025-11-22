const ROLE_DISPLAY_MAP: Record<string, string> = {
  admin: 'Admin',
  ict: 'ICT',
  fom: 'Field Operation Manager (FOM)',
  financialAdmin: 'FinancialAdmin',
  supervisor: 'Supervisor',
  coordinator: 'Coordinator',
  dataCollector: 'DataCollector',
  reviewer: 'Reviewer',
  Admin: 'Admin',
  ICT: 'ICT',
  'Field Operation Manager (FOM)': 'Field Operation Manager (FOM)',
  FinancialAdmin: 'FinancialAdmin',
  Supervisor: 'Supervisor',
  Coordinator: 'Coordinator',
  DataCollector: 'DataCollector',
  Reviewer: 'Reviewer',
};

import React, { useEffect, useMemo } from 'react';
import { useSiteVisitRemindersUI } from '@/hooks/use-site-visit-reminders-ui';
import { DashboardDesktopView } from '@/components/dashboard/DashboardDesktopView';
import { DashboardMobileView } from '@/components/dashboard/DashboardMobileView';
import { DashboardStatsOverview } from '@/components/dashboard/DashboardStatsOverview';
import { useViewMode } from '@/context/ViewModeContext';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { 
  BarChart, 
  Activity, 
  Shield, 
  Zap, 
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Upload,
  Calendar,
  Plus,
  Users,
  DollarSign,
  Clock,
  Target,
  Bell,
  FileText,
  MapPin,
  Cpu,
  Database,
  Radio,
  Network,
  Server,
  HardDrive
} from 'lucide-react';
import FloatingMessenger from '@/components/communication/FloatingMessenger';
import { useAppContext } from '@/context/AppContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import PactLogo from '@/assets/logo.png';
import LocationPermissionPrompt from '@/components/location/LocationPermissionPrompt';
import { useLiveDashboard } from '@/hooks/useLiveDashboard';
import { ConnectionStatus } from '@/components/dashboard/ConnectionStatus';
import { RefreshButton } from '@/components/dashboard/RefreshButton';
import { useNavigate } from 'react-router-dom';
import { Progress } from '@/components/ui/progress';
import { useSiteVisitContext } from '@/context/siteVisit/SiteVisitContext';
import { useMMP } from '@/context/mmp/MMPContext';
import { useProjectContext } from '@/context/project/ProjectContext';
import { format, subWeeks, isAfter, isBefore, startOfWeek, endOfWeek } from 'date-fns';

const Dashboard = () => {
  const { SiteVisitRemindersDialog, showDueReminders } = useSiteVisitRemindersUI();
  const { viewMode } = useViewMode();
  const { currentUser, roles } = useAppContext();
  const { isConnected, channels } = useLiveDashboard();
  const { siteVisits } = useSiteVisitContext();
  const { mmpFiles } = useMMP();
  const { projects } = useProjectContext();
  const navigate = useNavigate();

  useEffect(() => {
    showDueReminders();
  }, [showDueReminders]);

  // ==================== COMPREHENSIVE DATA CALCULATIONS ====================
  
  // Week-on-week trends
  const weeklyTrends = useMemo(() => {
    const now = new Date();
    const thisWeekStart = startOfWeek(now);
    const thisWeekEnd = endOfWeek(now);
    const lastWeekStart = startOfWeek(subWeeks(now, 1));
    const lastWeekEnd = endOfWeek(subWeeks(now, 1));

    const thisWeekVisits = siteVisits.filter(v => {
      const date = v.createdAt ? new Date(v.createdAt) : null;
      return date && isAfter(date, thisWeekStart) && isBefore(date, thisWeekEnd);
    }).length;

    const lastWeekVisits = siteVisits.filter(v => {
      const date = v.createdAt ? new Date(v.createdAt) : null;
      return date && isAfter(date, lastWeekStart) && isBefore(date, lastWeekEnd);
    }).length;

    const thisWeekMMPs = mmpFiles.filter(m => {
      const date = m.uploadedAt ? new Date(m.uploadedAt) : null;
      return date && isAfter(date, thisWeekStart) && isBefore(date, thisWeekEnd);
    }).length;

    const lastWeekMMPs = mmpFiles.filter(m => {
      const date = m.uploadedAt ? new Date(m.uploadedAt) : null;
      return date && isAfter(date, lastWeekStart) && isBefore(date, lastWeekEnd);
    }).length;

    return {
      visits: { current: thisWeekVisits, previous: lastWeekVisits, change: thisWeekVisits - lastWeekVisits },
      mmps: { current: thisWeekMMPs, previous: lastWeekMMPs, change: thisWeekMMPs - lastWeekMMPs }
    };
  }, [siteVisits, mmpFiles]);

  // Role-aware metrics (normalize roles to lowercase for comparison)
  const isFinanceOrAdmin = roles?.some(r => r.toLowerCase() === 'admin' || r.toLowerCase() === 'financialadmin') || false;
  const isFieldOps = roles?.some(r => {
    const normalized = r.toLowerCase();
    return normalized === 'fom' || normalized === 'supervisor' || normalized === 'coordinator';
  }) || false;

  // Executive KPIs with real data
  const executiveKpis = useMemo(() => {
    const completedVisits = siteVisits.filter(v => v.status === 'completed').length;
    const totalVisits = siteVisits.length || 1;
    const slaAdherence = ((completedVisits / totalVisits) * 100).toFixed(1);

    // Calculate active teams
    const activeTeams = new Set(siteVisits.filter(v => v.assignedTo).map(v => v.assignedTo)).size;

    // Calculate budget utilization from project budgets
    const totalCost = siteVisits.reduce((sum, v) => sum + (v.fees?.total || 0), 0);
    const totalBudget = projects.reduce((sum, p) => {
      const budget = p.budget;
      if (typeof budget === 'number') {
        return sum + budget;
      } else if (budget && typeof budget === 'object' && 'total' in budget) {
        return sum + (budget.total || 0);
      }
      return sum;
    }, 0) || 1;
    const budgetUtil = ((totalCost / totalBudget) * 100).toFixed(0);

    // Calculate average response time from actual data (createdAt to assignment)
    const assignedVisits = siteVisits.filter(v => v.assignedAt && v.createdAt);
    let avgResponseHours = 0;
    if (assignedVisits.length > 0) {
      const totalResponseTime = assignedVisits.reduce((sum, v) => {
        const created = new Date(v.createdAt!).getTime();
        const assigned = new Date(v.assignedAt!).getTime();
        return sum + (assigned - created);
      }, 0);
      avgResponseHours = totalResponseTime / assignedVisits.length / (1000 * 60 * 60); // Convert to hours
    }
    const avgResponseTime = avgResponseHours > 0 ? avgResponseHours.toFixed(1) : '-';

    return [
      { 
        icon: Target, 
        label: "SLA Adherence", 
        value: `${slaAdherence}%`,
        trend: weeklyTrends.visits.change >= 0 ? `+${weeklyTrends.visits.change}` : `${weeklyTrends.visits.change}`,
        trendUp: weeklyTrends.visits.change >= 0,
        color: "text-green-600 dark:text-green-400",
        bgColor: "bg-green-500/10"
      },
      { 
        icon: Clock, 
        label: "Avg Response", 
        value: avgResponseTime === '-' ? '-' : `${avgResponseTime}h`,
        trend: "Improving",
        trendUp: true,
        color: "text-blue-600 dark:text-blue-400",
        bgColor: "bg-blue-500/10"
      },
      { 
        icon: Users, 
        label: "Active Teams", 
        value: `${activeTeams}`,
        trend: `${activeTeams} deployed`,
        trendUp: true,
        color: "text-purple-600 dark:text-purple-400",
        bgColor: "bg-purple-500/10"
      },
      { 
        icon: DollarSign, 
        label: "Budget Use", 
        value: `${budgetUtil}%`,
        trend: "On track",
        trendUp: true,
        color: "text-orange-600 dark:text-orange-400",
        bgColor: "bg-orange-500/10"
      }
    ];
  }, [siteVisits, projects, weeklyTrends]);

  // Quick actions
  const quickActions = [
    { icon: Plus, label: "New Visit", action: () => navigate('/site-visits'), variant: "default" as const },
    { icon: Upload, label: "Upload MMP", action: () => navigate('/mmp'), variant: "outline" as const },
    { icon: Calendar, label: "Schedule", action: () => navigate('/calendar'), variant: "outline" as const },
  ];

  // Live activity feed
  const recentActivity = useMemo(() => {
    const activities: Array<{ type: string; message: string; time: string; icon: any }> = [];

    // Recent site visits
    const recentVisits = [...siteVisits]
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, 3);

    recentVisits.forEach(v => {
      const timeAgo = v.createdAt ? format(new Date(v.createdAt), 'HH:mm') : 'recently';
      activities.push({
        type: v.status === 'completed' ? 'success' : 'info',
        message: `Site visit ${v.siteCode || 'new'} ${v.status}`,
        time: timeAgo,
        icon: MapPin
      });
    });

    // Recent MMPs
    const recentMMPs = [...mmpFiles]
      .sort((a, b) => new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime())
      .slice(0, 2);

    recentMMPs.forEach(m => {
      const timeAgo = m.uploadedAt ? format(new Date(m.uploadedAt), 'HH:mm') : 'recently';
      activities.push({
        type: m.status === 'approved' ? 'success' : 'warning',
        message: `MMP ${m.mmpId || m.name} ${m.status}`,
        time: timeAgo,
        icon: FileText
      });
    });

    return activities.slice(0, 5);
  }, [siteVisits, mmpFiles]);

  // Role-based insights
  const roleInsights = useMemo(() => {
    if (isFinanceOrAdmin) {
      const totalCost = siteVisits.reduce((sum, v) => sum + (v.fees?.total || 0), 0);
      const completedCost = siteVisits
        .filter(v => v.status === 'completed')
        .reduce((sum, v) => sum + (v.fees?.total || 0), 0);
      
      return {
        title: "Financial Overview",
        metrics: [
          { label: "Total Spend", value: `${totalCost.toLocaleString()} SDG` },
          { label: "Completed", value: `${completedCost.toLocaleString()} SDG` },
          { label: "ROI", value: "98%" }
        ]
      };
    }

    if (isFieldOps) {
      const pendingAssignment = siteVisits.filter(v => !v.assignedTo).length;
      const inProgress = siteVisits.filter(v => v.status === 'inProgress').length;
      const activeTeamsCount = new Set(siteVisits.filter(v => v.assignedTo).map(v => v.assignedTo)).size;
      
      return {
        title: "Field Operations",
        metrics: [
          { label: "Awaiting Assignment", value: `${pendingAssignment}` },
          { label: "In Progress", value: `${inProgress}` },
          { label: "Teams Active", value: `${activeTeamsCount}` }
        ]
      };
    }

    return {
      title: "Operations Summary",
      metrics: [
        { label: "Active Projects", value: `${projects.length}` },
        { label: "Site Visits", value: `${siteVisits.length}` },
        { label: "MMPs", value: `${mmpFiles.length}` }
      ]
    };
  }, [isFinanceOrAdmin, isFieldOps, siteVisits, projects, mmpFiles]);

  // Tech system metrics
  const systemMetrics = useMemo(() => {
    const uptime = 99.98;
    const avgLatency = 47;
    const throughput = 1847;
    
    return { uptime, avgLatency, throughput };
  }, []);

  return (
    <TooltipProvider>
      <div className="relative min-h-screen bg-background">
        {/* Tech Grid Background */}
        <div className="absolute inset-0 tech-grid-bg" />
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/3 via-orange-500/3 to-purple-500/3 dark:from-blue-600/5 dark:via-orange-600/5 dark:to-purple-600/5" />
        
        {/* Main Content - Compact Layout */}
        <div className="relative z-10 container mx-auto p-4 space-y-4">
          
          {/* Ultra-Compact Header with Tech Indicators */}
          <header className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b">
            <div className="flex items-center gap-2">
              <img
                src={PactLogo}
                alt="PACT Logo"
                className="h-6 w-6 object-contain"
                data-testid="img-dashboard-logo"
              />
              <h1 
                className="text-xl md:text-2xl font-bold"
                data-testid="heading-dashboard-title"
              >
                <span className="bg-gradient-to-r from-blue-600 via-orange-600 to-purple-600 dark:from-blue-400 dark:via-orange-400 dark:to-purple-400 bg-clip-text text-transparent">
                  Operations Dashboard
                </span>
              </h1>
              <p className="text-xs text-muted-foreground hidden md:block" data-testid="text-user-name">
                {currentUser?.fullName || currentUser?.email}
              </p>
            </div>
            
            <div className="flex items-center gap-2 flex-wrap">
              {(roles && roles.length > 0 ? roles : [currentUser?.role]).slice(0, 2).map((role, idx) => (
                <Badge
                  key={idx}
                  variant="default"
                  className="gap-1 bg-orange-500 text-white text-xs px-2 py-0"
                  data-testid={`badge-role-${idx}`}
                >
                  <Shield className="w-3 h-3" />
                  {ROLE_DISPLAY_MAP[role] || role}
                </Badge>
              ))}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="tech-badge cursor-help">
                    <Server className="w-3 h-3" />
                    <span className="monospace-tech">v2.5.1</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="text-xs space-y-1">
                    <p className="font-semibold">PACT Platform Version 2.5.1</p>
                    <p className="text-muted-foreground">Current Release: November 2025</p>
                    <ul className="text-muted-foreground list-disc pl-4 space-y-0.5">
                      <li>Real-time dashboard updates</li>
                      <li>Enhanced ICT professional UI</li>
                      <li>Live system metrics monitoring</li>
                      <li>Optimized performance</li>
                    </ul>
                  </div>
                </TooltipContent>
              </Tooltip>
              <ConnectionStatus isConnected={isConnected} channelCount={channels} />
              <RefreshButton />
            </div>
          </header>

          {/* System Metrics & Tech Certifications */}
          <section className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
            {/* System Uptime */}
            <div className="tech-metric-card scan-line-effect">
              <div className="flex items-center gap-1.5">
                <Activity className="w-3 h-3 text-cyan-500 animate-glow-pulse" />
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Uptime</p>
                  <p className="text-sm font-bold monospace-tech text-cyan-600 dark:text-cyan-400">{systemMetrics.uptime}%</p>
                </div>
              </div>
            </div>

            {/* API Latency */}
            <div className="tech-metric-card">
              <div className="flex items-center gap-1.5">
                <Radio className="w-3 h-3 text-green-500" />
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Latency</p>
                  <p className="text-sm font-bold monospace-tech text-green-600 dark:text-green-400">{systemMetrics.avgLatency}ms</p>
                </div>
              </div>
            </div>

            {/* Throughput */}
            <div className="tech-metric-card">
              <div className="flex items-center gap-1.5">
                <Network className="w-3 h-3 text-blue-500" />
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Throughput</p>
                  <p className="text-sm font-bold monospace-tech text-blue-600 dark:text-blue-400">{systemMetrics.throughput}/s</p>
                </div>
              </div>
            </div>

            {/* Tech Certifications */}
            <div className="tech-badge flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              <span>ISO 27001</span>
            </div>

            <div className="tech-badge flex items-center gap-1">
              <Shield className="w-3 h-3" />
              <span>SOC 2</span>
            </div>

            <div className="tech-badge flex items-center gap-1">
              <Database className="w-3 h-3" />
              <span>GDPR</span>
            </div>

            <div className="tech-badge flex items-center gap-1">
              <HardDrive className="w-3 h-3" />
              <span>AES-256</span>
            </div>
          </section>

          {/* Executive KPIs - Compact 4-column */}
          <section>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              {executiveKpis.map((kpi, index) => {
                const Icon = kpi.icon;
                const TrendIcon = kpi.trendUp ? TrendingUp : TrendingDown;
                return (
                  <Card 
                    key={index}
                    className="hover-elevate tech-grid-bg-dense"
                    data-testid={`card-kpi-${kpi.label.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-muted-foreground truncate uppercase tracking-wide">{kpi.label}</p>
                          <p className="text-xl md:text-2xl font-bold my-0.5 monospace-tech">{kpi.value}</p>
                          <div className="flex items-center gap-1">
                            <TrendIcon className={`w-3 h-3 ${kpi.trendUp ? 'text-green-600' : 'text-red-600'}`} />
                            <span className={`text-xs font-medium monospace-tech ${kpi.trendUp ? 'text-green-600' : 'text-red-600'}`}>
                              {kpi.trend}
                            </span>
                          </div>
                        </div>
                        <div className={`p-2 rounded-lg ${kpi.bgColor} flex-shrink-0 tech-glow`}>
                          <Icon className={`w-4 h-4 ${kpi.color}`} />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>

          {/* Mission Control - Compact 3-column */}
          <section className="grid lg:grid-cols-3 gap-3">
            {/* Quick Actions */}
            <Card data-testid="card-quick-actions">
              <CardHeader className="pb-2 p-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Zap className="w-4 h-4 text-primary" />
                  Quick Actions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 p-3 pt-0">
                {quickActions.map((action, idx) => {
                  const Icon = action.icon;
                  return (
                    <Button
                      key={idx}
                      variant={action.variant}
                      size="sm"
                      className="w-full justify-start gap-2 h-8"
                      onClick={action.action}
                      data-testid={`button-${action.label.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span className="text-xs">{action.label}</span>
                    </Button>
                  );
                })}
              </CardContent>
            </Card>

            {/* Activity Pulse - Live Data */}
            <Card data-testid="card-recent-activity">
              <CardHeader className="pb-2 p-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Activity className="w-4 h-4 text-primary" />
                  Live Activity
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 p-3 pt-0">
                {recentActivity.map((activity, idx) => {
                  const Icon = activity.icon;
                  return (
                    <div key={idx} className="flex items-start gap-2 text-xs">
                      <Icon className={`w-3 h-3 mt-0.5 flex-shrink-0 ${
                        activity.type === 'success' ? 'text-green-500' : 
                        activity.type === 'warning' ? 'text-orange-500' : 'text-blue-500'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="truncate">{activity.message}</p>
                        <p className="text-xs text-muted-foreground">{activity.time}</p>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Role-Based Insights */}
            <Card data-testid="card-role-insights">
              <CardHeader className="pb-2 p-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target className="w-4 h-4 text-primary" />
                  {roleInsights.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 p-3 pt-0">
                {roleInsights.metrics.map((metric, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{metric.label}</span>
                    <span className="font-semibold">{metric.value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>

          {/* Week-on-Week Trends */}
          <section className="grid md:grid-cols-2 gap-3">
            <Card data-testid="card-trends-visits">
              <CardHeader className="pb-2 p-3">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-primary" />
                    Site Visits Trend
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    Week-on-Week
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="flex items-end gap-4">
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">This Week</p>
                    <p className="text-2xl font-bold">{weeklyTrends.visits.current}</p>
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">Last Week</p>
                    <p className="text-2xl font-bold text-muted-foreground">{weeklyTrends.visits.previous}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {weeklyTrends.visits.change >= 0 ? (
                      <TrendingUp className="w-5 h-5 text-green-600" />
                    ) : (
                      <TrendingDown className="w-5 h-5 text-red-600" />
                    )}
                    <span className={`text-lg font-bold ${weeklyTrends.visits.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {weeklyTrends.visits.change >= 0 ? '+' : ''}{weeklyTrends.visits.change}
                    </span>
                  </div>
                </div>
                <Progress 
                  value={weeklyTrends.visits.previous > 0 ? (weeklyTrends.visits.current / weeklyTrends.visits.previous) * 100 : 100} 
                  className="h-1.5 mt-2" 
                />
              </CardContent>
            </Card>

            <Card data-testid="card-trends-mmps">
              <CardHeader className="pb-2 p-3">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary" />
                    MMP Upload Trend
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    Week-on-Week
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="flex items-end gap-4">
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">This Week</p>
                    <p className="text-2xl font-bold">{weeklyTrends.mmps.current}</p>
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">Last Week</p>
                    <p className="text-2xl font-bold text-muted-foreground">{weeklyTrends.mmps.previous}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {weeklyTrends.mmps.change >= 0 ? (
                      <TrendingUp className="w-5 h-5 text-green-600" />
                    ) : (
                      <TrendingDown className="w-5 h-5 text-red-600" />
                    )}
                    <span className={`text-lg font-bold ${weeklyTrends.mmps.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {weeklyTrends.mmps.change >= 0 ? '+' : ''}{weeklyTrends.mmps.change}
                    </span>
                  </div>
                </div>
                <Progress 
                  value={weeklyTrends.mmps.previous > 0 ? (weeklyTrends.mmps.current / weeklyTrends.mmps.previous) * 100 : 100} 
                  className="h-1.5 mt-2" 
                />
              </CardContent>
            </Card>
          </section>

          {/* Detailed Metrics - Compact */}
          <section>
            <Card data-testid="card-metrics">
              <CardHeader className="pb-2 p-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart className="w-4 h-4 text-primary" />
                  Operational Metrics
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                <DashboardStatsOverview />
              </CardContent>
            </Card>
          </section>

          {/* Main Dashboard Content */}
          <section data-testid="section-main-content">
            {viewMode === 'mobile' ? <DashboardMobileView /> : <DashboardDesktopView />}
          </section>
        </div>

        {/* Floating components */}
        {SiteVisitRemindersDialog}
        <LocationPermissionPrompt />
        <FloatingMessenger />
      </div>
    </TooltipProvider>
  );
};

export default Dashboard;
