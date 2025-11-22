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
    },
    { 
      icon: Upload, 
      label: 'Upload MMP', 
      action: () => navigate('/mmp/upload'),
    },
    { 
      icon: Calendar, 
      label: 'Calendar', 
      action: () => navigate('/calendar'),
    },
    { 
      icon: Users, 
      label: 'Team', 
      action: () => navigate('/field-team'),
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
                className="gap-2"
              >
                <action.icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{action.label}</span>
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
