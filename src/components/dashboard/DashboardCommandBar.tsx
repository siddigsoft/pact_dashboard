import React from 'react';
import { Button } from '@/components/ui/button';
import { 
  Plus, 
  Upload, 
  Calendar,
  Users,
  RefreshCw
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ConnectionStatus } from './ConnectionStatus';
import { useLiveDashboard } from '@/hooks/useLiveDashboard';

interface DashboardCommandBarProps {
  onQuickAction?: (action: string) => void;
}

export const DashboardCommandBar: React.FC<DashboardCommandBarProps> = ({ onQuickAction }) => {
  const navigate = useNavigate();
  const { isConnected } = useLiveDashboard();

  const quickActions = [
    { 
      icon: Plus, 
      label: 'New Visit', 
      action: () => navigate('/site-visits/new'),
      gradient: 'from-blue-500/10 to-cyan-500/10',
      iconColor: 'text-blue-600 dark:text-blue-400',
      border: 'border-blue-500/20'
    },
    { 
      icon: Upload, 
      label: 'Upload MMP', 
      action: () => navigate('/mmp/upload'),
      gradient: 'from-purple-500/10 to-indigo-500/10',
      iconColor: 'text-purple-600 dark:text-purple-400',
      border: 'border-purple-500/20'
    },
    { 
      icon: Calendar, 
      label: 'Calendar', 
      action: () => navigate('/calendar'),
      gradient: 'from-green-500/10 to-emerald-500/10',
      iconColor: 'text-green-600 dark:text-green-400',
      border: 'border-green-500/20'
    },
    { 
      icon: Users, 
      label: 'Team', 
      action: () => navigate('/field-team'),
      gradient: 'from-orange-500/10 to-amber-500/10',
      iconColor: 'text-orange-600 dark:text-orange-400',
      border: 'border-orange-500/20'
    }
  ];

  return (
    <div className="bg-card border-b border-border/50">
      <div className="px-4 py-2">
        <div className="flex items-center justify-between gap-3">
          {/* Left: Quick Action Buttons */}
          <div className="flex items-center gap-2">
            {quickActions.map((action, idx) => (
              <Button
                key={idx}
                variant="outline"
                size="sm"
                onClick={action.action}
                data-testid={`button-quick-${action.label.toLowerCase().replace(' ', '-')}`}
                className={`gap-2 relative overflow-hidden bg-gradient-to-r ${action.gradient} ${action.border} hover-elevate active-elevate-2 transition-all duration-200`}
              >
                <action.icon className={`h-4 w-4 ${action.iconColor}`} />
                <span className="hidden sm:inline font-medium">{action.label}</span>
              </Button>
            ))}
          </div>
          
          {/* Right: System Status */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.location.reload()}
              data-testid="button-refresh"
              className="gap-2"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Refresh</span>
            </Button>
            <ConnectionStatus isConnected={isConnected} />
          </div>
        </div>
      </div>
    </div>
  );
};
