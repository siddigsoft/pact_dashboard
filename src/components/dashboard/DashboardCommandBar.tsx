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
    <Card className="border-b rounded-none shadow-sm bg-gradient-to-r from-background via-muted/30 to-background">
      <CardContent className="p-4">
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
          {/* Left: KPI Metrics */}
          <div className="flex flex-wrap gap-3 lg:gap-6 items-center flex-1">
            <div className="flex items-center gap-2" data-testid="kpi-projects">
              <div className="flex flex-col">
                <span className="text-2xl font-bold text-primary">{activeProjects}</span>
                <span className="text-xs text-muted-foreground">Projects</span>
              </div>
            </div>

            <div className="h-8 w-px bg-border hidden lg:block" />

            <div className="flex items-center gap-2" data-testid="kpi-mmps">
              <div className="flex flex-col">
                <span className="text-2xl font-bold text-green-600 dark:text-green-400">{approvedMMPs}</span>
                <span className="text-xs text-muted-foreground">MMPs</span>
              </div>
            </div>

            <div className="h-8 w-px bg-border hidden lg:block" />

            <div className="flex items-center gap-2" data-testid="kpi-completed">
              <div className="flex flex-col">
                <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">{completedVisits}</span>
                <span className="text-xs text-muted-foreground">Completed</span>
              </div>
            </div>

            <div className="h-8 w-px bg-border hidden lg:block" />

            <div className="flex items-center gap-2" data-testid="kpi-pending">
              <div className="flex flex-col">
                <span className="text-2xl font-bold text-orange-600 dark:text-orange-400">{pendingVisits}</span>
                <span className="text-xs text-muted-foreground">Pending</span>
              </div>
            </div>
          </div>

          {/* Center: MoDa Countdown */}
          <div className="hidden xl:block">
            <EnhancedMoDaCountdown />
          </div>

          {/* Right: Status & Actions */}
          <div className="flex flex-wrap gap-2 items-center">
            <ConnectionStatus isConnected={isConnected} />
            <RefreshButton />
            
            <div className="h-8 w-px bg-border hidden lg:block mx-1" />
            
            {quickActions.filter(a => a.permission).map((action, idx) => (
              <Button
                key={idx}
                size="sm"
                variant="outline"
                onClick={action.action}
                className="gap-2"
                data-testid={`button-quick-${action.label.toLowerCase().replace(' ', '-')}`}
              >
                <action.icon className="h-4 w-4" />
                <span className="hidden lg:inline">{action.label}</span>
              </Button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
