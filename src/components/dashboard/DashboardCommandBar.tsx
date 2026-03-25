/**
 * Dashboard Command Bar
 * Quick actions and realtime status indicator
 */

import { useState } from 'react';
import { ConnectionStatus } from './ConnectionStatus';
import { useLiveDashboard } from '@/features/dashboard/hooks/useLiveDashboard';
import { useGlobalPresence } from '@/features/notifications/context/GlobalPresenceContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, MessageCircle, Phone, AlertTriangle } from 'lucide-react';
import { OnlineUsersPanel } from './OnlineUsersPanel';
import { EmergencySOS } from '@/platform/mobile/components/EmergencySOS';

interface DashboardCommandBarProps {
  onQuickAction?: (action: string) => void;
}

export const DashboardCommandBar: React.FC<DashboardCommandBarProps> = ({ onQuickAction }) => {
  const { isConnected, channels, totalEvents, lastUpdate } = useLiveDashboard();
  const { onlineUserIds } = useGlobalPresence();
  const [showOnlinePanel, setShowOnlinePanel] = useState(false);
  const [showSOS, setShowSOS] = useState(false);

  const onlineCount = onlineUserIds.length;

  return (
    <>
      <div className="bg-white dark:bg-gray-950 border-b border-gray-100 dark:border-gray-800">
        <div className="px-5 py-2.5 flex items-center justify-between gap-3">
          {/* Online count */}
          <button
            onClick={() => setShowOnlinePanel(true)}
            className="flex items-center gap-2 px-2.5 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            data-testid="button-online-users"
          >
            <div className="relative">
              <Users className="h-3.5 w-3.5 text-gray-500" />
              {onlineCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-green-500 rounded-full" />
              )}
            </div>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{onlineCount}</span>
            <span className="text-xs text-gray-400">online</span>
          </button>

          {/* Right: SOS + connection status */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSOS(true)}
              className="h-7 px-2 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 gap-1 text-xs"
              data-testid="button-quick-sos"
              title="Emergency SOS"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">SOS</span>
            </Button>
            <ConnectionStatus
              isConnected={isConnected}
              channelCount={channels}
              lastUpdate={lastUpdate}
              totalEvents={totalEvents}
            />
          </div>
        </div>
      </div>

      <OnlineUsersPanel isOpen={showOnlinePanel} onClose={() => setShowOnlinePanel(false)} />
      <EmergencySOS isVisible={showSOS} onClose={() => setShowSOS(false)} />
    </>
  );
};
