/**
 * Dashboard Command Bar
 * Quick actions and realtime status indicator
 */

import { useState } from 'react';
import { ConnectionStatus } from './ConnectionStatus';
import { useLiveDashboard } from '@/hooks/useLiveDashboard';
import { useGlobalPresence } from '@/context/presence/GlobalPresenceContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, MessageCircle, Phone, AlertTriangle } from 'lucide-react';
import { OnlineUsersPanel } from './OnlineUsersPanel';
import { EmergencySOS } from '@/components/mobile/EmergencySOS';

interface DashboardCommandBarProps {
  onQuickAction?: (action: string) => void;
}

export const DashboardCommandBar: React.FC<DashboardCommandBarProps> = ({ onQuickAction }) => {
  const { isConnected, channels, totalEvents, lastUpdate, forceRefresh } = useLiveDashboard();
  const { onlineUserIds } = useGlobalPresence();
  const [showOnlinePanel, setShowOnlinePanel] = useState(false);
  const [showSOS, setShowSOS] = useState(false);

  const onlineCount = onlineUserIds.length;

  return (
    <>
      <div className="bg-card border-b border-border/50">
        <div className="px-4 py-2">
          <div className="flex items-center justify-between gap-2">
            {/* Left side - Online users counter */}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowOnlinePanel(true)}
                className="gap-2"
                data-testid="button-online-users"
              >
                <div className="relative">
                  <Users className="h-4 w-4" />
                  {onlineCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  )}
                </div>
                <span className="text-sm font-medium">{onlineCount}</span>
                <Badge variant="secondary" className="text-xs px-1.5 py-0">
                  Online
                </Badge>
              </Button>
            </div>

            {/* Right side - Quick actions */}
            <div className="flex items-center gap-1">
              {/* SOS Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowSOS(true)}
                className="text-destructive"
                data-testid="button-quick-sos"
                title="Emergency SOS"
              >
                <AlertTriangle className="h-4 w-4" />
              </Button>

              {/* Quick Message Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowOnlinePanel(true)}
                data-testid="button-quick-message"
                title="Send Message"
              >
                <MessageCircle className="h-4 w-4" />
              </Button>

              {/* Quick Call Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowOnlinePanel(true)}
                data-testid="button-quick-call"
                title="Make a Call"
              >
                <Phone className="h-4 w-4" />
              </Button>

              {/* Connection Status with integrated refresh */}
              <ConnectionStatus 
                isConnected={isConnected}
                channelCount={channels}
                lastUpdate={lastUpdate}
                totalEvents={totalEvents}
                onRefresh={forceRefresh}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Online Users Panel */}
      <OnlineUsersPanel 
        isOpen={showOnlinePanel} 
        onClose={() => setShowOnlinePanel(false)} 
      />

      {/* Emergency SOS */}
      <EmergencySOS 
        isVisible={showSOS} 
        onClose={() => setShowSOS(false)} 
      />
    </>
  );
};
