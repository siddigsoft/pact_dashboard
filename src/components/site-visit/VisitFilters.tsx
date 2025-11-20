
import React from 'react';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon, X } from 'lucide-react';
import { format } from 'date-fns';

interface VisitFiltersProps {
  activeFilters: {
    status: string;
    date?: Date;
    priority?: string;
  };
  onRemoveFilter: (filterType: string) => void;
  onDateSelect: (date: Date | undefined) => void;
}

const VisitFilters: React.FC<VisitFiltersProps> = ({
  activeFilters,
  onRemoveFilter,
  onDateSelect,
}) => {
  const getStatusLabel = (status: string) => {
    switch (status) {
      case "pending": return "Pending Visits";
      case "inProgress": return "In Progress";
      case "completed": return "Completed";
      case "assigned": return "Assigned";
      case "permitVerified": return "Permit Verified";
      case "canceled": return "Canceled";
      default: return "All Statuses";
    }
  };

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {activeFilters.status !== 'all' && (
        <Badge 
          variant="secondary"
          className="px-3 py-1 flex items-center gap-1"
        >
          {getStatusLabel(activeFilters.status)}
          <X 
            className="h-3 w-3 cursor-pointer" 
            onClick={() => onRemoveFilter('status')}
          />
        </Badge>
      )}
      
      {activeFilters.priority && (
        <Badge 
          variant="secondary"
          className="px-3 py-1 flex items-center gap-1"
        >
          {`Priority: ${activeFilters.priority}`}
          <X 
            className="h-3 w-3 cursor-pointer" 
            onClick={() => onRemoveFilter('priority')}
          />
        </Badge>
      )}

      <Popover>
        <PopoverTrigger asChild>
          <Button 
            variant="outline" 
            className="h-8 px-2 lg:px-3"
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {activeFilters.date ? format(activeFilters.date, 'PPP') : 'Pick date'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={activeFilters.date}
            onSelect={onDateSelect}
            initialFocus
          />
        </PopoverContent>
      </Popover>

      {activeFilters.date && (
        <Badge 
          variant="secondary"
          className="px-3 py-1 flex items-center gap-1"
        >
          {format(activeFilters.date, 'PPP')}
          <X 
            className="h-3 w-3 cursor-pointer" 
            onClick={() => onRemoveFilter('date')}
          />
        </Badge>
      )}
    </div>
  );
};

export default VisitFilters;
