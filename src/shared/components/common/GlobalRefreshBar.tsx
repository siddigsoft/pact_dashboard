import React from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

interface GlobalRefreshBarProps {
  onQuickAction?: (action: string) => void;
}

export const GlobalRefreshBar: React.FC<GlobalRefreshBarProps> = ({ onQuickAction }) => {
  return (
    <div className="border-b border-border/50 bg-transparent">
      <div className="px-4 py-1">
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.location.reload()}
            data-testid="button-refresh"
            className="gap-2 h-7"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Refresh</span>
          </Button>
        </div>
      </div>
    </div>
  );
};