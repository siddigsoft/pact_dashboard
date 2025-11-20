
import React from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bell, AlertCircle, CheckCircle2, Clock } from 'lucide-react';

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
    <Tabs value={activeFilter} onValueChange={onFilterChange} className="w-full">
      <TabsList className="grid grid-cols-3">
        <TabsTrigger value="all" className="flex items-center gap-1.5">
          <Bell className="h-3.5 w-3.5" />
          <span className="text-xs">All ({counts.all})</span>
        </TabsTrigger>
        <TabsTrigger value="unread" className="flex items-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5" />
          <span className="text-xs">Unread ({counts.unread})</span>
        </TabsTrigger>
        <TabsTrigger value="today" className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          <span className="text-xs">Today ({counts.today})</span>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
};
