import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bell, AlertCircle, Clock, Filter } from 'lucide-react';

interface NotificationFilterProps {
  activeFilter: string;
  onFilterChange: (value: string) => void;
  counts: {
    all: number;
    unread: number;
    today: number;
  };
}

export const NotificationFilter: React.FC<NotificationFilterProps> = ({
  activeFilter,
  onFilterChange,
  counts,
}) => {
  return (
    <div className="px-3 py-2 bg-muted/30">
      <Tabs value={activeFilter} onValueChange={onFilterChange} className="w-full">
        <TabsList className="grid grid-cols-3 h-9 bg-background/50">
          <TabsTrigger 
            value="all" 
            className="flex items-center gap-1.5 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            data-testid="filter-all"
          >
            <Bell className="h-3.5 w-3.5" />
            <span>All</span>
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-medium">
              {counts.all}
            </span>
          </TabsTrigger>
          <TabsTrigger 
            value="unread" 
            className="flex items-center gap-1.5 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            data-testid="filter-unread"
          >
            <AlertCircle className="h-3.5 w-3.5" />
            <span>Unread</span>
            {counts.unread > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-300 text-[10px] font-medium">
                {counts.unread}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger 
            value="today" 
            className="flex items-center gap-1.5 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            data-testid="filter-today"
          >
            <Clock className="h-3.5 w-3.5" />
            <span>Today</span>
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-medium">
              {counts.today}
            </span>
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
};
