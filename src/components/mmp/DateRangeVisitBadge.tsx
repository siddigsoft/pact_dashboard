import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Calendar, CalendarRange, Clock } from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';

interface DateRangeVisitBadgeProps {
  visitDate?: string;
  visitDateFrom?: string;
  visitDateTo?: string;
  activityType?: 'single_day' | 'multi_day' | 'dm_gfa';
  mainActivity?: string;
  showDuration?: boolean;
  className?: string;
}

export function DateRangeVisitBadge({
  visitDate,
  visitDateFrom,
  visitDateTo,
  activityType,
  mainActivity,
  showDuration = true,
  className
}: DateRangeVisitBadgeProps) {
  const hasDateRange = visitDateFrom && visitDateTo;
  const effectiveStartDate = visitDateFrom || visitDate;
  const effectiveEndDate = visitDateTo;
  
  if (!effectiveStartDate) {
    return (
      <Badge variant="outline" className={className}>
        <Calendar className="h-3 w-3 mr-1" />
        No date set
      </Badge>
    );
  }

  const startDate = parseISO(effectiveStartDate);
  const endDate = effectiveEndDate ? parseISO(effectiveEndDate) : null;
  
  const duration = endDate ? differenceInDays(endDate, startDate) + 1 : 1;
  const isDMGFA = activityType === 'dm_gfa' || mainActivity?.toLowerCase().includes('gfa') || mainActivity?.toLowerCase().includes('dm');

  if (!hasDateRange) {
    return (
      <Badge variant="outline" className={className}>
        <Calendar className="h-3 w-3 mr-1" />
        {format(startDate, 'MMM d, yyyy')}
      </Badge>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge 
          variant={isDMGFA ? 'default' : 'secondary'} 
          className={className}
        >
          <CalendarRange className="h-3 w-3 mr-1" />
          {format(startDate, 'MMM d')} - {format(endDate!, 'MMM d')}
          {showDuration && (
            <span className="ml-1 opacity-75">({duration}d)</span>
          )}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <div className="space-y-1 text-sm">
          <p className="font-medium">
            {isDMGFA ? 'DM/GFA Activity Period' : 'Multi-Day Visit'}
          </p>
          <p>Start: {format(startDate, 'PPP')}</p>
          <p>End: {format(endDate!, 'PPP')}</p>
          <p>Duration: {duration} day{duration !== 1 ? 's' : ''}</p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export function VisitDateDisplay({
  visitDate,
  visitDateFrom,
  visitDateTo,
  activityType,
  mainActivity,
  compact = false
}: DateRangeVisitBadgeProps & { compact?: boolean }) {
  const hasDateRange = visitDateFrom && visitDateTo;
  const effectiveStartDate = visitDateFrom || visitDate;
  
  if (!effectiveStartDate) {
    return <span className="text-muted-foreground">Not scheduled</span>;
  }

  const startDate = parseISO(effectiveStartDate);
  const endDate = visitDateTo ? parseISO(visitDateTo) : null;
  const isDMGFA = activityType === 'dm_gfa' || mainActivity?.toLowerCase().includes('gfa') || mainActivity?.toLowerCase().includes('dm');

  if (compact) {
    if (!hasDateRange) {
      return <span>{format(startDate, 'MMM d')}</span>;
    }
    return (
      <span className="flex items-center gap-1">
        <CalendarRange className="h-3 w-3" />
        {format(startDate, 'MMM d')} - {format(endDate!, 'd')}
      </span>
    );
  }

  if (!hasDateRange) {
    return (
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <span>{format(startDate, 'PPPP')}</span>
      </div>
    );
  }

  const duration = differenceInDays(endDate!, startDate) + 1;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <CalendarRange className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">
          {format(startDate, 'MMM d')} - {format(endDate!, 'MMM d, yyyy')}
        </span>
        {isDMGFA && (
          <Badge variant="outline" className="text-xs">DM/GFA</Badge>
        )}
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Clock className="h-3 w-3" />
        <span>{duration} day{duration !== 1 ? 's' : ''}</span>
      </div>
    </div>
  );
}

export default DateRangeVisitBadge;
