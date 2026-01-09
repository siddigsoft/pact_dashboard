import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Clock, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { format, parseISO, differenceInHours, differenceInMinutes, differenceInSeconds } from 'date-fns';

interface ConfirmationDeadlineCountdownProps {
  confirmationDeadline?: string;
  confirmationStatus?: 'pending' | 'confirmed' | 'auto_released';
  confirmedAt?: string;
  compact?: boolean;
}

export function ConfirmationDeadlineCountdown({
  confirmationDeadline,
  confirmationStatus = 'pending',
  confirmedAt,
  compact = false
}: ConfirmationDeadlineCountdownProps) {
  const [now, setNow] = useState(new Date());
  
  useEffect(() => {
    if (confirmationStatus !== 'pending' || !confirmationDeadline) return;
    
    const interval = setInterval(() => {
      setNow(new Date());
    }, 60000);
    
    return () => clearInterval(interval);
  }, [confirmationStatus, confirmationDeadline]);
  
  if (confirmationStatus === 'confirmed') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            <CheckCircle className="h-3 w-3 mr-1" />
            {compact ? 'Confirmed' : 'Attendance Confirmed'}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          {confirmedAt ? `Confirmed on ${format(parseISO(confirmedAt), 'PPP p')}` : 'Visit confirmed'}
        </TooltipContent>
      </Tooltip>
    );
  }
  
  if (confirmationStatus === 'auto_released') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
            <XCircle className="h-3 w-3 mr-1" />
            {compact ? 'Released' : 'Auto-Released'}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          Site was released due to no confirmation before deadline
        </TooltipContent>
      </Tooltip>
    );
  }
  
  if (!confirmationDeadline) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        <Clock className="h-3 w-3 mr-1" />
        {compact ? 'Pending' : 'Awaiting Confirmation'}
      </Badge>
    );
  }
  
  const deadline = parseISO(confirmationDeadline);
  const hoursRemaining = differenceInHours(deadline, now);
  const minutesRemaining = differenceInMinutes(deadline, now) % 60;
  
  const isOverdue = hoursRemaining < 0 || (hoursRemaining === 0 && minutesRemaining < 0);
  const isUrgent = !isOverdue && hoursRemaining < 12;
  const isWarning = !isOverdue && !isUrgent && hoursRemaining < 24;
  
  const getTimeDisplay = () => {
    if (isOverdue) {
      const overdueHours = Math.abs(hoursRemaining);
      const overdueMinutes = Math.abs(minutesRemaining);
      return compact 
        ? `${overdueHours}h overdue` 
        : `${overdueHours}h ${overdueMinutes}m overdue`;
    }
    
    if (hoursRemaining > 48) {
      const days = Math.floor(hoursRemaining / 24);
      return compact ? `${days}d left` : `${days} days remaining`;
    }
    
    return compact 
      ? `${hoursRemaining}h left` 
      : `${hoursRemaining}h ${minutesRemaining}m remaining`;
  };
  
  const getBadgeStyle = () => {
    if (isOverdue) {
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    }
    if (isUrgent) {
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
    }
    if (isWarning) {
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
    }
    return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
  };
  
  const getIcon = () => {
    if (isOverdue) return <AlertTriangle className="h-3 w-3 mr-1" />;
    if (isUrgent) return <Clock className="h-3 w-3 mr-1 animate-pulse" />;
    return <Clock className="h-3 w-3 mr-1" />;
  };
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge className={getBadgeStyle()} data-testid="badge-confirmation-countdown">
          {getIcon()}
          {getTimeDisplay()}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <div className="space-y-1 text-sm">
          <p><strong>Confirmation Deadline:</strong></p>
          <p>{format(deadline, 'PPP p')}</p>
          {isOverdue && (
            <p className="text-red-500">Past deadline - may be auto-released</p>
          )}
          {isUrgent && !isOverdue && (
            <p className="text-amber-500">Confirm soon to avoid auto-release</p>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export default ConfirmationDeadlineCountdown;
