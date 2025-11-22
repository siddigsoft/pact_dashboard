import React from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { ConnectionStatus } from './ConnectionStatus';
import { useLiveDashboard } from '@/hooks/useLiveDashboard';

interface DashboardCommandBarProps {
  onQuickAction?: (action: string) => void;
}

export const DashboardCommandBar: React.FC<DashboardCommandBarProps> = ({ onQuickAction }) => {
  const { isConnected } = useLiveDashboard();

  return (
    <div className="bg-card border-b border-border/50">
      <div className="px-4 py-2">
        <div className="flex items-center justify-end gap-2">
          {/* System Status */}
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
  );
};
