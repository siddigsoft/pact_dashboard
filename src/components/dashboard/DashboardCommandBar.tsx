import React from 'react';
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
        <div className="flex items-center justify-end">
          <ConnectionStatus isConnected={isConnected} />
        </div>
      </div>
    </div>
  );
};
