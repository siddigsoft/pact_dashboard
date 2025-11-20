import React from 'react';
import { Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface SessionIndicatorProps {
  timeLeft: number; // seconds
  extendSession: () => void;
  formatTimeLeft: (seconds: number) => string;
  small?: boolean;
}

const SessionIndicator: React.FC<SessionIndicatorProps> = ({ timeLeft, extendSession, formatTimeLeft, small }) => {
  // If no session props provided, don't render anything (prevents creating a second timer)
  if (typeof timeLeft !== 'number' || !extendSession || !formatTimeLeft) return null;

  const getVariant = (seconds: number) => {
    if (seconds > 90) return 'secondary' as const;
    if (seconds > 60) return 'outline' as const;
    return 'destructive' as const;
  };

  const label = small ? formatTimeLeft(timeLeft) : `Session: ${formatTimeLeft(timeLeft)}`;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={getVariant(timeLeft)}
            size={small ? 'icon' as any : 'sm' as any}
            onClick={extendSession}
            className="gap-2"
            aria-label="Session time remaining. Click to extend."
          >
            <Clock className="h-4 w-4" />
            {!small && <span className="font-mono text-xs">{label}</span>}
            {small && <span className="sr-only">{label}</span>}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="space-y-1">
            <p className="font-medium">Session active</p>
            <p className="text-xs">Time remaining: {formatTimeLeft(timeLeft)} — click to extend</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default SessionIndicator;
