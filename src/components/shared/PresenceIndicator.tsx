import { Users } from 'lucide-react';
import { useGlobalPresence } from '@/context/presence/GlobalPresenceContext';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface PresenceIndicatorProps {
  className?: string;
  variant?: 'badge' | 'compact';
}

export function PresenceIndicator({ className = '', variant = 'badge' }: PresenceIndicatorProps) {
  const { isConnected, onlineUserIds } = useGlobalPresence();
  
  const onlineCount = onlineUserIds.length;
  
  if (!isConnected) {
    return null;
  }
  
  if (variant === 'compact') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div 
            className={`flex items-center gap-1 text-xs ${className}`}
            data-testid="presence-indicator-compact"
          >
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-white/80">{onlineCount}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{onlineCount} {onlineCount === 1 ? 'user' : 'users'} online</p>
        </TooltipContent>
      </Tooltip>
    );
  }
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge 
          variant="secondary" 
          className={`flex items-center gap-1 bg-green-500/20 text-green-400 border-green-500/30 ${className}`}
          data-testid="presence-indicator-badge"
        >
          <Users className="h-3 w-3" />
          <span>{onlineCount}</span>
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p>{onlineCount} {onlineCount === 1 ? 'user' : 'users'} online</p>
      </TooltipContent>
    </Tooltip>
  );
}

export default PresenceIndicator;
