
import React from 'react';
import { Search, Star, MapPin, Clock, Filter, Info, Building } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { hubs, sudanStates } from '@/data/sudanStates';

interface CollectorFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  maxDistance: number;
  onMaxDistanceChange: (value: number) => void;
  minRating: number;
  onMinRatingChange: (value: number) => void;
  availability: string;
  onAvailabilityChange: (value: string) => void;
  onResetFilters: () => void;
  hubFilter?: string;
  onHubFilterChange?: (hubId: string) => void;
  stateFilter?: string;
  onStateFilterChange?: (stateId: string) => void;
}

const CollectorFilters: React.FC<CollectorFiltersProps> = ({
  searchTerm,
  onSearchChange,
  maxDistance,
  onMaxDistanceChange,
  minRating,
  onMinRatingChange,
  availability,
  onAvailabilityChange,
  onResetFilters,
  hubFilter = "all",
  onHubFilterChange,
  stateFilter = "all",
  onStateFilterChange,
}) => {
  // Find available states based on selected hub
  const availableStates = React.useMemo(() => {
    if (hubFilter && hubFilter !== "all") {
      const selectedHub = hubs.find(h => h.id === hubFilter);
      if (selectedHub) {
        return sudanStates.filter(state => selectedHub.states.includes(state.id));
      }
    }
    return sudanStates;
  }, [hubFilter]);

  // Reset state filter when hub changes
  React.useEffect(() => {
    if (hubFilter !== "all" && stateFilter !== "all") {
      const selectedHub = hubs.find(h => h.id === hubFilter);
      if (selectedHub && !selectedHub.states.includes(stateFilter)) {
        // State not in this hub, reset state filter
        if (onStateFilterChange) {
          onStateFilterChange("all");
        }
      }
    }
  }, [hubFilter, stateFilter, onStateFilterChange]);

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
      <div className="relative flex items-center space-x-2">
        <div className="flex-grow relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search collectors by name or phone..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8"
          />
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="outline" 
                size="icon" 
                onClick={onResetFilters}
                title="Reset Filters"
              >
                <Filter className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Reset all filters to default</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Max Distance
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Maximum distance from site location</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </label>
            <Badge variant="secondary" className="text-xs">
              {maxDistance}km
            </Badge>
          </div>
          <Slider
            value={[maxDistance]}
            onValueChange={(value) => onMaxDistanceChange(value[0])}
            max={500}
            step={10}
            className="cursor-pointer"
          />
        </div>
        
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium flex items-center gap-2">
              <Star className="h-4 w-4" />
              Min Rating
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Minimum performance rating</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </label>
            <Badge variant="secondary" className="text-xs">
              {minRating.toFixed(1)}
            </Badge>
          </div>
          <Slider
            value={[minRating]}
            onValueChange={(value) => onMinRatingChange(value[0])}
            max={5}
            step={0.5}
            className="cursor-pointer"
          />
        </div>
        
        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Availability
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-3.5 w-3.5 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Filter collectors by their current status</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </label>
          <Select value={availability} onValueChange={onAvailabilityChange}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="online">Online</SelectItem>
              <SelectItem value="busy">Busy</SelectItem>
              <SelectItem value="offline">Offline</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        {onHubFilterChange && (
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <Building className="h-4 w-4" />
              Hub Office
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Filter by hub office location</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </label>
            <Select value={hubFilter} onValueChange={onHubFilterChange}>
              <SelectTrigger>
                <SelectValue placeholder="All Hub Offices" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Hub Offices</SelectItem>
                {hubs.map((hub) => (
                  <SelectItem key={hub.id} value={hub.id}>{hub.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        
        {onStateFilterChange && (
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              State
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Filter by state location</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </label>
            <Select 
              value={stateFilter} 
              onValueChange={onStateFilterChange}
              disabled={hubFilter === "all"}
            >
              <SelectTrigger>
                <SelectValue placeholder="All States" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All States</SelectItem>
                {availableStates.map((state) => (
                  <SelectItem key={state.id} value={state.id}>
                    {state.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </div>
  );
};

export default CollectorFilters;
