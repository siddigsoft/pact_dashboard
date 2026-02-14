import { Bell, AlertCircle, Clock, DollarSign, CheckCircle2, ClipboardList, Settings, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NotificationFilterProps {
  activeFilter: string;
  onFilterChange: (value: string) => void;
  counts: {
    all: number;
    unread: number;
    today: number;
  };
  categoryCounts?: {
    financial: number;
    approvals: number;
    assignments: number;
    system: number;
    wallet: number;
  };
}

const filterItems = [
  { value: 'all', label: 'All', icon: Bell },
  { value: 'unread', label: 'Unread', icon: AlertCircle },
  { value: 'today', label: 'Today', icon: Clock },
  { value: 'financial', label: 'Financial', icon: DollarSign },
  { value: 'approvals', label: 'Approvals', icon: CheckCircle2 },
  { value: 'assignments', label: 'Assignments', icon: ClipboardList },
  { value: 'system', label: 'System', icon: Settings },
  { value: 'wallet', label: 'Wallet', icon: Wallet },
] as const;

export const NotificationFilter: React.FC<NotificationFilterProps> = ({
  activeFilter,
  onFilterChange,
  counts,
  categoryCounts,
}) => {
  const getCount = (value: string): number | undefined => {
    switch (value) {
      case 'all': return counts.all;
      case 'unread': return counts.unread;
      case 'today': return counts.today;
      case 'financial': return categoryCounts?.financial;
      case 'approvals': return categoryCounts?.approvals;
      case 'assignments': return categoryCounts?.assignments;
      case 'system': return categoryCounts?.system;
      case 'wallet': return categoryCounts?.wallet;
      default: return undefined;
    }
  };

  return (
    <div className="px-3 py-2 bg-muted/30">
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-0.5" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {filterItems.map((item) => {
          const Icon = item.icon;
          const count = getCount(item.value);
          const isActive = activeFilter === item.value;
          const isUnread = item.value === 'unread';

          return (
            <button
              key={item.value}
              onClick={() => onFilterChange(item.value)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "bg-background/50 text-muted-foreground hover-elevate"
              )}
              data-testid={`filter-${item.value}`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{item.label}</span>
              {count !== undefined && (isUnread ? count > 0 : true) && (
                <span
                  className={cn(
                    "ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium",
                    isActive
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : isUnread && count > 0
                        ? "bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-300"
                        : "bg-muted text-muted-foreground"
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
