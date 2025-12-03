import React from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { ConnectionStatus } from './ConnectionStatus';
import { useLiveDashboard } from '@/hooks/useLiveDashboard';
import { useProjectContext } from '@/context/project/ProjectContext';
import { useMMP } from '@/context/mmp/MMPContext';
import { queryClient } from '@/lib/queryClient';
import { useSiteVisitContext } from '@/context/siteVisit/SiteVisitContext';

interface DashboardCommandBarProps {
  onQuickAction?: (action: string) => void;
}

export const DashboardCommandBar: React.FC<DashboardCommandBarProps> = ({ onQuickAction }) => {
  const { isConnected } = useLiveDashboard();
  const { fetchProjects } = useProjectContext();
  const { refreshMMPFiles } = useMMP();
  const { refreshSiteVisits } = useSiteVisitContext();

  const handleRefresh = async () => {
    // Refresh contexts
    await Promise.allSettled([
      fetchProjects(),
      refreshMMPFiles(),
      refreshSiteVisits?.(),
    ]);
    // Invalidate critical React Query caches
    await Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: ['cost-submissions'] }),
      queryClient.invalidateQueries({ queryKey: ['cost-approvals'] }),
      queryClient.invalidateQueries({ queryKey: ['wallet'] }),
      queryClient.invalidateQueries({ queryKey: ['walletTransactions'] }),
      queryClient.invalidateQueries({ queryKey: ['notifications'] }),
    ]);
  };

  return (
    <div className="bg-card border-b border-border/50">
      <div className="px-4 py-2">
        <div className="flex items-center justify-end gap-2">
          {/* System Status */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
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
