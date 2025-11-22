import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Plus, 
  Upload, 
  Calendar, 
  Users,
  Activity,
  TrendingUp,
  TrendingDown,
  AlertCircle
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

  const activeProjects = projects?.filter(p => p.status === 'active').length || 0;
  const approvedMMPs = mmpFiles?.filter(m => m.status === 'approved').length || 0;
  const completedVisits = siteVisits?.filter(v => v.status === 'completed').length || 0;
  const pendingVisits = siteVisits?.filter(v => v.status === 'pending' || v.status === 'assigned').length || 0;

  const quickActions = [
    { 
      icon: Plus, 
      label: 'New Visit', 
      action: () => navigate('/site-visits/new'),
      permission: true
    },
    { 
      icon: Upload, 
      label: 'Upload MMP', 
      action: () => navigate('/mmp/upload'),
      permission: true
    },
    { 
      icon: Calendar, 
      label: 'Schedule', 
      action: () => navigate('/calendar'),
      permission: true
    },
    { 
      icon: Users, 
      label: 'Team', 
      action: () => navigate('/field-team'),
      permission: true
    }
  ];

  return (
    <Card className="border-b rounded-none shadow-lg bg-gradient-to-r from-primary/5 via-blue-500/5 to-purple-500/5 dark:from-primary/10 dark:via-blue-600/10 dark:to-purple-600/10 backdrop-blur-sm">
      <CardContent className="p-3 lg:p-4">
        <div className="flex flex-col gap-3">
          {/* Top: Quick Actions as Cards */}
          <div className="flex flex-wrap gap-2 items-stretch">
            {quickActions.filter(a => a.permission).map((action, idx) => (
              <Card
                key={idx}
                className="group hover-elevate cursor-pointer border-border/50 hover:border-primary/50 transition-all flex-1 min-w-[140px] max-w-[200px]"
                onClick={action.action}
                data-testid={`card-quick-${action.label.toLowerCase().replace(' ', '-')}`}
              >
                <CardContent className="p-3 flex items-center gap-2.5">
                  <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/10 dark:bg-primary/20 border border-primary/20 group-hover:bg-primary/20 transition-all">
                    <action.icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="text-xs font-semibold text-foreground truncate">{action.label}</span>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Quick Action</span>
                  </div>
                </CardContent>
              </Card>
            ))}
            
            <div className="flex items-center gap-2 ml-auto">
              <ConnectionStatus isConnected={isConnected} />
              <RefreshButton />
            </div>
          </div>
          
          {/* Bottom: KPI Metrics & Status */}
          <div className="flex flex-col lg:flex-row gap-2 items-start lg:items-center justify-between">
            {/* Left: Status Bar Label */}
            <div className="hidden lg:block">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Dashboard:</span>
            </div>

          {/* Center: KPI Metrics - Compact Tech Style */}
          <div className="flex flex-wrap gap-1.5 lg:gap-2 items-center flex-1 lg:justify-center">
            <div className="group relative" data-testid="kpi-projects">
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary/10 dark:bg-primary/20 border border-primary/20 hover-elevate transition-all">
                <div className="flex flex-col">
                  <span className="text-lg lg:text-xl font-bold text-primary tabular-nums leading-tight">{activeProjects}</span>
                  <span className="text-[9px] lg:text-[10px] text-muted-foreground uppercase tracking-wide">Projects</span>
                </div>
              </div>
            </div>

            <div className="group relative" data-testid="kpi-mmps">
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-green-500/10 dark:bg-green-500/20 border border-green-500/20 hover-elevate transition-all">
                <div className="flex flex-col">
                  <span className="text-lg lg:text-xl font-bold text-green-600 dark:text-green-400 tabular-nums leading-tight">{approvedMMPs}</span>
                  <span className="text-[9px] lg:text-[10px] text-muted-foreground uppercase tracking-wide">MMPs</span>
                </div>
              </div>
            </div>

            <div className="group relative" data-testid="kpi-completed">
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-blue-500/10 dark:bg-blue-500/20 border border-blue-500/20 hover-elevate transition-all">
                <div className="flex flex-col">
                  <span className="text-lg lg:text-xl font-bold text-blue-600 dark:text-blue-400 tabular-nums leading-tight">{completedVisits}</span>
                  <span className="text-[9px] lg:text-[10px] text-muted-foreground uppercase tracking-wide">Done</span>
                </div>
              </div>
            </div>

            <div className="group relative" data-testid="kpi-pending">
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-orange-500/10 dark:bg-orange-500/20 border border-orange-500/20 hover-elevate transition-all">
                <div className="flex flex-col">
                  <span className="text-lg lg:text-xl font-bold text-orange-600 dark:text-orange-400 tabular-nums leading-tight">{pendingVisits}</span>
                  <span className="text-[9px] lg:text-[10px] text-muted-foreground uppercase tracking-wide">Pending</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right: MoDa Countdown */}
          <div className="hidden xl:flex items-center">
            <EnhancedMoDaCountdown />
          </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
