import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MapPin, 
  Camera, 
  FileText, 
  DollarSign, 
  Check, 
  Clock, 
  AlertCircle,
  ChevronDown,
  ChevronUp,
  User,
  Edit,
  Trash2,
  MoreVertical
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';
import { format, formatDistanceToNow, isToday, isYesterday } from 'date-fns';

type TimelineItemType = 'location' | 'photo' | 'document' | 'payment' | 'status' | 'note' | 'edit' | 'user';

interface TimelineItem {
  id: string;
  type: TimelineItemType;
  title: string;
  description?: string;
  timestamp: Date;
  user?: {
    name: string;
    avatar?: string;
  };
  metadata?: Record<string, any>;
  status?: 'pending' | 'completed' | 'failed';
}

interface MobileTimelineProps {
  items: TimelineItem[];
  onItemPress?: (item: TimelineItem) => void;
  onLoadMore?: () => void;
  isLoading?: boolean;
  showDate?: boolean;
  showConnector?: boolean;
  className?: string;
}

export function MobileTimeline({
  items,
  onItemPress,
  onLoadMore,
  isLoading = false,
  showDate = true,
  showConnector = true,
  className,
}: MobileTimelineProps) {
  const groupedItems = groupItemsByDate(items);

  return (
    <div className={cn("relative", className)} data-testid="mobile-timeline">
      {Object.entries(groupedItems).map(([date, dateItems], groupIndex) => (
        <div key={date} className="relative">
          {showDate && (
            <div className="sticky top-0 z-10 py-2 bg-background/95 backdrop-blur-sm">
              <span className="text-xs font-semibold text-black/40 dark:text-white/40 uppercase tracking-wider">
                {date}
              </span>
            </div>
          )}

          <div className="relative">
            {showConnector && (
              <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-black/10 dark:bg-white/10" />
            )}

            {dateItems.map((item, index) => (
              <TimelineItemComponent
                key={item.id}
                item={item}
                isFirst={index === 0}
                isLast={index === dateItems.length - 1}
                showConnector={showConnector}
                onPress={() => {
                  hapticPresets.buttonPress();
                  onItemPress?.(item);
                }}
              />
            ))}
          </div>
        </div>
      ))}

      {onLoadMore && (
        <div className="flex justify-center py-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              hapticPresets.buttonPress();
              onLoadMore();
            }}
            disabled={isLoading}
            className="rounded-full"
            data-testid="button-load-more"
          >
            {isLoading ? 'Loading...' : 'Load More'}
          </Button>
        </div>
      )}
    </div>
  );
}

interface TimelineItemComponentProps {
  item: TimelineItem;
  isFirst: boolean;
  isLast: boolean;
  showConnector: boolean;
  onPress?: () => void;
}

function TimelineItemComponent({
  item,
  isFirst,
  isLast,
  showConnector,
  onPress,
}: TimelineItemComponentProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getIcon = () => {
    const iconClass = "h-4 w-4";
    switch (item.type) {
      case 'location':
        return <MapPin className={iconClass} />;
      case 'photo':
        return <Camera className={iconClass} />;
      case 'document':
        return <FileText className={iconClass} />;
      case 'payment':
        return <DollarSign className={iconClass} />;
      case 'status':
        return item.status === 'completed' ? <Check className={iconClass} /> : <Clock className={iconClass} />;
      case 'note':
        return <Edit className={iconClass} />;
      case 'user':
        return <User className={iconClass} />;
      default:
        return <AlertCircle className={iconClass} />;
    }
  };

  const getIconBg = () => {
    switch (item.status) {
      case 'completed':
        return 'bg-black dark:bg-white text-white dark:text-black';
      case 'failed':
        return 'bg-destructive text-white';
      case 'pending':
        return 'bg-black/20 dark:bg-white/20 text-black dark:text-white';
      default:
        return 'bg-black/10 dark:bg-white/10 text-black dark:text-white';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className={cn(
        "relative flex gap-4 py-3",
        !isLast && "pb-4"
      )}
      data-testid={`timeline-item-${item.id}`}
    >
      <div className={cn(
        "relative z-10 w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
        getIconBg()
      )}>
        {getIcon()}
      </div>

      <div className="flex-1 min-w-0">
        <button
          className="w-full text-left touch-manipulation"
          onClick={onPress}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-black dark:text-white">
                {item.title}
              </p>
              {item.description && (
                <p className="text-sm text-black/60 dark:text-white/60 mt-0.5 line-clamp-2">
                  {item.description}
                </p>
              )}
            </div>

            <span className="text-xs text-black/40 dark:text-white/40 flex-shrink-0">
              {format(item.timestamp, 'HH:mm')}
            </span>
          </div>

          {item.user && (
            <div className="flex items-center gap-2 mt-2">
              <div className="w-5 h-5 rounded-full bg-black/10 dark:bg-white/10 flex items-center justify-center overflow-hidden">
                {item.user.avatar ? (
                  <img src={item.user.avatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[10px] font-medium">{item.user.name.charAt(0)}</span>
                )}
              </div>
              <span className="text-xs text-black/60 dark:text-white/60">
                {item.user.name}
              </span>
            </div>
          )}

          {item.metadata && Object.keys(item.metadata).length > 0 && (
            <div className="mt-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  hapticPresets.selection();
                  setIsExpanded(!isExpanded);
                }}
                className="flex items-center gap-1 text-xs text-black/40 dark:text-white/40"
                data-testid="button-expand-metadata"
              >
                {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {isExpanded ? 'Hide details' : 'Show details'}
              </button>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-2 p-2 rounded-lg bg-black/5 dark:bg-white/5">
                      {Object.entries(item.metadata).map(([key, value]) => (
                        <div key={key} className="flex justify-between text-xs py-0.5">
                          <span className="text-black/40 dark:text-white/40 capitalize">
                            {key.replace(/_/g, ' ')}
                          </span>
                          <span className="text-black dark:text-white font-medium">
                            {String(value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </button>
      </div>
    </motion.div>
  );
}

function groupItemsByDate(items: TimelineItem[]): Record<string, TimelineItem[]> {
  const groups: Record<string, TimelineItem[]> = {};

  items.forEach(item => {
    let dateKey: string;
    
    if (isToday(item.timestamp)) {
      dateKey = 'Today';
    } else if (isYesterday(item.timestamp)) {
      dateKey = 'Yesterday';
    } else {
      dateKey = format(item.timestamp, 'MMMM d, yyyy');
    }

    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(item);
  });

  return groups;
}

interface ActivityFeedProps {
  activities: TimelineItem[];
  emptyMessage?: string;
  className?: string;
}

export function ActivityFeed({
  activities,
  emptyMessage = 'No activity yet',
  className,
}: ActivityFeedProps) {
  if (activities.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center py-12 text-center", className)}>
        <Clock className="h-12 w-12 text-black/20 dark:text-white/20 mb-4" />
        <p className="text-sm text-black/60 dark:text-white/60">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)} data-testid="activity-feed">
      {activities.map((activity) => (
        <ActivityItem key={activity.id} activity={activity} />
      ))}
    </div>
  );
}

interface ActivityItemProps {
  activity: TimelineItem;
}

function ActivityItem({ activity }: ActivityItemProps) {
  return (
    <div 
      className="flex items-start gap-3 p-3 rounded-xl bg-black/5 dark:bg-white/5"
      data-testid={`activity-item-${activity.id}`}
    >
      <div className="w-8 h-8 rounded-full bg-black/10 dark:bg-white/10 flex items-center justify-center flex-shrink-0">
        {activity.user?.avatar ? (
          <img src={activity.user.avatar} alt="" className="w-full h-full rounded-full object-cover" />
        ) : (
          <User className="h-4 w-4 text-black/60 dark:text-white/60" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm text-black dark:text-white">
          <span className="font-medium">{activity.user?.name || 'Someone'}</span>
          {' '}{activity.title}
        </p>
        {activity.description && (
          <p className="text-xs text-black/60 dark:text-white/60 mt-0.5">
            {activity.description}
          </p>
        )}
        <span className="text-xs text-black/40 dark:text-white/40 mt-1 block">
          {formatDistanceToNow(activity.timestamp, { addSuffix: true })}
        </span>
      </div>
    </div>
  );
}

interface VisitTimelineProps {
  visitId: string;
  events: TimelineItem[];
  currentStatus?: string;
  className?: string;
}

export function VisitTimeline({
  visitId,
  events,
  currentStatus,
  className,
}: VisitTimelineProps) {
  const stages = [
    { key: 'assigned', label: 'Assigned' },
    { key: 'started', label: 'Started' },
    { key: 'in_progress', label: 'In Progress' },
    { key: 'completed', label: 'Completed' },
  ];

  const currentStageIndex = stages.findIndex(s => s.key === currentStatus);

  return (
    <div className={cn("", className)} data-testid="visit-timeline">
      <div className="flex items-center justify-between mb-6">
        {stages.map((stage, index) => (
          <div key={stage.key} className="flex flex-col items-center">
            <div className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold",
              index <= currentStageIndex
                ? "bg-black dark:bg-white text-white dark:text-black"
                : "bg-black/10 dark:bg-white/10 text-black/40 dark:text-white/40"
            )}>
              {index < currentStageIndex ? (
                <Check className="h-4 w-4" />
              ) : (
                index + 1
              )}
            </div>
            <span className={cn(
              "text-[10px] mt-1",
              index <= currentStageIndex
                ? "text-black dark:text-white font-medium"
                : "text-black/40 dark:text-white/40"
            )}>
              {stage.label}
            </span>
            {index < stages.length - 1 && (
              <div className={cn(
                "absolute h-0.5 w-full top-4 left-1/2",
                index < currentStageIndex
                  ? "bg-black dark:bg-white"
                  : "bg-black/10 dark:bg-white/10"
              )} />
            )}
          </div>
        ))}
      </div>

      <MobileTimeline items={events} showDate={false} />
    </div>
  );
}
