import React, { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  TrendingUp, 
  TrendingDown,
  Plus, 
  Upload, 
  Calendar, 
  Users,
  Activity
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ConnectionStatus } from './ConnectionStatus';
import { RefreshButton } from './RefreshButton';
import { useLiveDashboard } from '@/hooks/useLiveDashboard';
import { useSiteVisitContext } from '@/context/siteVisit/SiteVisitContext';
import { useMMP } from '@/context/mmp/MMPContext';
import { useProjectContext } from '@/context/project/ProjectContext';
import { format, subWeeks, startOfWeek, endOfWeek, isAfter, isBefore } from 'date-fns';

export const ExecutiveCommandStrip: React.FC = () => {
  const navigate = useNavigate();
  const { isConnected } = useLiveDashboard();
  const { siteVisits } = useSiteVisitContext();
  const { mmpFiles } = useMMP();
  const { projects } = useProjectContext();

  // Memoized KPI Calculations
  const kpis = useMemo(() => {
    const activeProjects = projects?.filter(p => p.status === 'active').length || 0;
    const approvedMMPs = mmpFiles?.filter(m => m.status === 'approved').length || 0;
    const completedVisits = siteVisits?.filter(v => v.status === 'completed').length || 0;
    const pendingVisits = siteVisits?.filter(v => v.status === 'pending' || v.status === 'assigned').length || 0;

    return { activeProjects, approvedMMPs, completedVisits, pendingVisits };
  }, [projects, mmpFiles, siteVisits]);

  // Memoized Trend Calculations
  const visitsTrend = useMemo(() => {
    const now = new Date();
    const thisWeekStart = startOfWeek(now);
    const thisWeekEnd = endOfWeek(now);
    const lastWeekStart = startOfWeek(subWeeks(now, 1));
    const lastWeekEnd = endOfWeek(subWeeks(now, 1));

    const thisWeekVisits = siteVisits?.filter(v => {
      const date = v.createdAt ? new Date(v.createdAt) : null;
      return date && isAfter(date, thisWeekStart) && isBefore(date, thisWeekEnd);
    }).length || 0;

    const lastWeekVisits = siteVisits?.filter(v => {
      const date = v.createdAt ? new Date(v.createdAt) : null;
      return date && isAfter(date, lastWeekStart) && isBefore(date, lastWeekEnd);
    }).length || 0;

    return thisWeekVisits - lastWeekVisits;
  }, [siteVisits]);

  const quickActions = [
    { icon: Plus, label: 'New Visit', action: () => navigate('/site-visits/new') },
    { icon: Upload, label: 'Upload MMP', action: () => navigate('/mmp/upload') },
    { icon: Calendar, label: 'Schedule', action: () => navigate('/calendar') },
    { icon: Users, label: 'Team', action: () => navigate('/field-team') }
  ];

  return (
    <Card className="sticky top-0 z-40 border-b rounded-none shadow-md bg-gradient-to-r from-background via-muted/20 to-background">
      <div className="p-4">
        {/* Top Row: KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          {/* Active Projects */}
          <div className="flex flex-col p-3 rounded-lg border bg-card hover-elevate transition-all">
            <span className="text-xs text-muted-foreground mb-1">Active Projects</span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-primary">{kpis.activeProjects}</span>
            </div>
          </div>

          {/* Approved MMPs */}
          <div className="flex flex-col p-3 rounded-lg border bg-card hover-elevate transition-all">
            <span className="text-xs text-muted-foreground mb-1">Approved MMPs</span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-green-600 dark:text-green-400">{kpis.approvedMMPs}</span>
            </div>
          </div>

          {/* Completed Visits */}
          <div className="flex flex-col p-3 rounded-lg border bg-card hover-elevate transition-all">
            <span className="text-xs text-muted-foreground mb-1">Completed Visits</span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-blue-600 dark:text-blue-400">{kpis.completedVisits}</span>
              {visitsTrend !== 0 && (
                <div className="flex items-center gap-1">
                  {visitsTrend > 0 ? (
                    <TrendingUp className="h-4 w-4 text-green-600" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-red-600" />
                  )}
                  <span className={`text-sm ${visitsTrend > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {Math.abs(visitsTrend)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Pending Visits */}
          <div className="flex flex-col p-3 rounded-lg border bg-card hover-elevate transition-all">
            <span className="text-xs text-muted-foreground mb-1">Pending Visits</span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-orange-600 dark:text-orange-400">{kpis.pendingVisits}</span>
              {kpis.pendingVisits > 0 && (
                <Badge variant="outline" className="text-xs">
                  {kpis.pendingVisits > 5 ? 'High' : 'Normal'}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Row: Status & Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ConnectionStatus isConnected={isConnected} />
            <RefreshButton />
            <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
              <Activity className="h-4 w-4" />
              <span>Last sync: {format(new Date(), 'HH:mm')}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {quickActions.map((action, idx) => (
              <Button
                key={idx}
                size="sm"
                variant="outline"
                onClick={action.action}
                className="gap-2"
                data-testid={`button-quick-${action.label.toLowerCase().replace(' ', '-')}`}
              >
                <action.icon className="h-4 w-4" />
                <span className="hidden sm:inline">{action.label}</span>
              </Button>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
};
