import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Activity, WifiOff } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface ConnectionStatusProps {
  isConnected: boolean;
  channelCount?: number;
}

export const ConnectionStatus = ({ isConnected, channelCount = 0 }: ConnectionStatusProps) => {
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  useEffect(() => {
    if (isConnected) {
      setLastUpdate(new Date());
    }
  }, [isConnected]);

  useEffect(() => {
    const heartbeatInterval = setInterval(() => {
      if (isConnected) {
        setLastUpdate(new Date());
      }
    }, 30000);

    return () => clearInterval(heartbeatInterval);
  }, [isConnected]);

  return (
    <div className="flex items-center gap-2">
      <Badge 
        variant={isConnected ? 'default' : 'destructive'}
        className="flex items-center gap-2 px-3 py-1"
        data-testid="badge-connection-status"
      >
        {isConnected ? (
          <>
            <Activity className="h-3 w-3 animate-pulse" />
            <span>Live</span>
          </>
        ) : (
          <>
            <WifiOff className="h-3 w-3" />
            <span>Disconnected</span>
          </>
        )}
      </Badge>
      
      {isConnected && (
        <span className="text-xs text-muted-foreground hidden sm:inline" data-testid="text-last-update">
          Updated {formatDistanceToNow(lastUpdate, { addSuffix: true })}
        </span>
      )}
    </div>
  );
};
