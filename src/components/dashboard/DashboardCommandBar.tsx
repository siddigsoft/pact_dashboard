import React, { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { 
  Plus, 
  Upload, 
  Calendar,
  Activity,
  TrendingUp,
  TrendingDown,
  Minus
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ConnectionStatus } from './ConnectionStatus';
import { RefreshButton } from './RefreshButton';
import { EnhancedMoDaCountdown } from './EnhancedMoDaCountdown';
import { useLiveDashboard } from '@/hooks/useLiveDashboard';
import { useAppContext } from '@/context/AppContext';
import { useSiteVisitContext } from '@/context/siteVisit/SiteVisitContext';
import { useMMP } from '@/context/mmp/MMPContext';
import { useProjectContext } from '@/context/project/ProjectContext';
import { startOfMonth, endOfMonth } from 'date-fns';

interface DashboardCommandBarProps {
  onQuickAction?: (action: string) => void;
}

export const DashboardCommandBar: React.FC<DashboardCommandBarProps> = ({ onQuickAction }) => {
  const navigate = useNavigate();
  const { roles } = useAppContext();
  const { siteVisits } = useSiteVisitContext();
  const { mmpFiles } = useMMP();
  const { projects } = useProjectContext();
  const { isConnected } = useLiveDashboard();

  // Current month metrics
  const currentMonthStart = startOfMonth(new Date());
  const currentMonthEnd = endOfMonth(new Date());

  // Calculate metrics with trends
  const metrics = useMemo(() => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    // Site Visits - last 30 days vs previous 30 days
    const visitsLast30 = siteVisits?.filter(v => {
      const created = new Date(v.createdAt || v.dueDate);
      return created >= thirtyDaysAgo;
    }).length || 0;
    
    const visitsPrevious30 = siteVisits?.filter(v => {
      const created = new Date(v.createdAt || v.dueDate);
      return created >= sixtyDaysAgo && created < thirtyDaysAgo;
    }).length || 0;
    
    const visitsTrend = visitsPrevious30 > 0 
      ? ((visitsLast30 - visitsPrevious30) / visitsPrevious30) * 100 
      : visitsLast30 > 0 ? 100 : 0;

    // Completed Visits
    const completedVisits = siteVisits?.filter(v => v.status === 'completed').length || 0;
    const totalVisits = siteVisits?.length || 0;
    const completionRate = totalVisits > 0 ? (completedVisits / totalVisits) * 100 : 0;

    // MMPs - current month
    const mmpsThisMonth = mmpFiles?.filter(m => {
      const uploaded = new Date(m.uploadedAt || m.createdAt);
      return uploaded >= currentMonthStart && uploaded <= currentMonthEnd;
    }).length || 0;

    const approvedMMPs = mmpFiles?.filter(m => m.status === 'approved').length || 0;

    // Projects
    const activeProjects = projects?.filter(p => p.status === 'active').length || 0;

    // Pending/Overdue
    const pendingVisits = siteVisits?.filter(v => 
      v.status === 'pending' || v.status === 'assigned'
    ).length || 0;
    
    const overdueVisits = siteVisits?.filter(v => {
      if (v.status === 'completed') return false;
      if (!v.dueDate) return false;
      return new Date(v.dueDate) < now;
    }).length || 0;

    return {
      siteVisits: { count: visitsLast30, trend: visitsTrend },
      completed: { count: completedVisits, rate: completionRate },
      mmps: { count: mmpsThisMonth, approved: approvedMMPs },
      projects: { count: activeProjects },
      pending: { count: pendingVisits, overdue: overdueVisits }
    };
  }, [siteVisits, mmpFiles, projects, currentMonthStart, currentMonthEnd]);

  const quickActions = [
    { 
      icon: Plus, 
      label: 'New Visit', 
      action: () => navigate('/site-visits/new'),
      metric: metrics.siteVisits.count,
      metricLabel: '30d',
      trend: metrics.siteVisits.trend,
      color: 'blue'
    },
    { 
      icon: Upload, 
      label: 'Upload MMP', 
      action: () => navigate('/mmp/upload'),
      metric: metrics.mmps.count,
      metricLabel: 'month',
      subMetric: `${metrics.mmps.approved} approved`,
      color: 'green'
    },
    { 
      icon: Calendar, 
      label: 'Schedule', 
      action: () => navigate('/calendar'),
      metric: metrics.pending.count,
      metricLabel: 'pending',
      alert: metrics.pending.overdue,
      color: 'orange'
    },
    { 
      icon: Activity, 
      label: 'Completed', 
      action: () => navigate('/site-visits?status=completed'),
      metric: metrics.completed.count,
      metricLabel: 'done',
      trend: metrics.completed.rate,
      trendLabel: `${metrics.completed.rate.toFixed(0)}% rate`,
      color: 'indigo'
    }
  ];

  const getTrendIcon = (trend: number) => {
    if (trend > 0) return <TrendingUp className="h-3 w-3" />;
    if (trend < 0) return <TrendingDown className="h-3 w-3" />;
    return <Minus className="h-3 w-3" />;
  };

  const getTrendColor = (trend: number) => {
    if (trend > 0) return 'text-green-600 dark:text-green-400';
    if (trend < 0) return 'text-red-600 dark:text-red-400';
    return 'text-muted-foreground';
  };

  const getColorClasses = (color: string) => {
    const colors = {
      blue: 'bg-blue-500/10 dark:bg-blue-500/20 border-blue-500/20 hover:border-blue-500/30',
      green: 'bg-green-500/10 dark:bg-green-500/20 border-green-500/20 hover:border-green-500/30',
      orange: 'bg-orange-500/10 dark:bg-orange-500/20 border-orange-500/20 hover:border-orange-500/30',
      indigo: 'bg-indigo-500/10 dark:bg-indigo-500/20 border-indigo-500/20 hover:border-indigo-500/30',
    };
    return colors[color as keyof typeof colors] || colors.blue;
  };

  const getIconColor = (color: string) => {
    const colors = {
      blue: 'text-blue-600 dark:text-blue-400',
      green: 'text-green-600 dark:text-green-400',
      orange: 'text-orange-600 dark:text-orange-400',
      indigo: 'text-indigo-600 dark:text-indigo-400',
    };
    return colors[color as keyof typeof colors] || colors.blue;
  };

  return (
    <div className="bg-gradient-to-r from-primary/5 via-blue-500/5 to-purple-500/5 dark:from-primary/10 dark:via-blue-600/10 dark:to-purple-600/10 backdrop-blur-sm">
      <div className="px-3 py-2">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Compact Quick Actions with Analytics */}
          <div className="flex items-center gap-1.5 flex-1 flex-wrap">
            {quickActions.map((action, idx) => (
              <button
                key={idx}
                onClick={action.action}
                data-testid={`card-quick-${action.label.toLowerCase().replace(' ', '-')}`}
                className={`group relative hover-elevate cursor-pointer border rounded-md transition-all flex-shrink-0 ${getColorClasses(action.color)}`}
              >
                <div className="px-2.5 py-1.5 flex items-center gap-2">
                  {/* Icon */}
                  <div className={`flex-shrink-0 ${getIconColor(action.color)}`}>
                    <action.icon className="h-3.5 w-3.5" />
                  </div>
                  
                  {/* Content */}
                  <div className="flex flex-col items-start min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-foreground whitespace-nowrap">
                        {action.label}
                      </span>
                      {action.alert > 0 && (
                        <Badge variant="destructive" className="h-4 text-[9px] px-1">
                          {action.alert}
                        </Badge>
                      )}
                    </div>
                    
                    {/* Metrics Row */}
                    <div className="flex items-center gap-1.5 text-[10px]">
                      <span className={`font-bold tabular-nums ${getIconColor(action.color)}`}>
                        {action.metric}
                      </span>
                      <span className="text-muted-foreground">
                        {action.metricLabel}
                      </span>
                      
                      {action.trend !== undefined && (
                        <div className={`flex items-center gap-0.5 ${getTrendColor(action.trend)}`}>
                          {getTrendIcon(action.trend)}
                          <span className="font-semibold tabular-nums">
                            {action.trendLabel || `${Math.abs(action.trend).toFixed(0)}%`}
                          </span>
                        </div>
                      )}
                      
                      {action.subMetric && (
                        <span className="text-muted-foreground">
                          • {action.subMetric}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
          
          {/* Right: Status Icons & MoDa */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <ConnectionStatus isConnected={isConnected} />
            <RefreshButton />
            <div className="hidden lg:block">
              <EnhancedMoDaCountdown />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
