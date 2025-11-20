
import React from 'react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin } from 'lucide-react';

interface TeamMapFiltersProps {
  selectedFilter: 'all' | 'online' | 'busy' | 'offline';
  setSelectedFilter: (filter: 'all' | 'online' | 'busy' | 'offline') => void;
  showSiteStatus?: boolean;
}

const TeamMapFilters: React.FC<TeamMapFiltersProps> = ({
  selectedFilter,
  setSelectedFilter,
  showSiteStatus = true
}) => {
  return (
    <div className="p-2 bg-muted/20 border-b flex flex-col md:flex-row justify-between gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button 
          size="sm" 
          variant={selectedFilter === 'all' ? 'default' : 'outline'} 
          onClick={() => setSelectedFilter('all')}
        >
          All Staff
        </Button>
        <Button 
          size="sm" 
          variant={selectedFilter === 'online' ? 'default' : 'outline'} 
          onClick={() => setSelectedFilter('online')}
          className="text-green-600"
        >
          <span className="h-2 w-2 rounded-full bg-green-500 mr-1"></span>
          Available
        </Button>
        <Button 
          size="sm" 
          variant={selectedFilter === 'busy' ? 'default' : 'outline'} 
          onClick={() => setSelectedFilter('busy')}
          className="text-amber-600"
        >
          <span className="h-2 w-2 rounded-full bg-amber-500 mr-1"></span>
          Busy
        </Button>
        <Button 
          size="sm" 
          variant={selectedFilter === 'offline' ? 'default' : 'outline'} 
          onClick={() => setSelectedFilter('offline')}
          className="text-gray-600"
        >
          <span className="h-2 w-2 rounded-full bg-gray-500 mr-1"></span>
          Offline
        </Button>
      </div>
      
      {showSiteStatus && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 text-xs">
            <MapPin className="h-3 w-3 text-primary" />
            <span>Sites:</span>
          </div>
          <Badge variant="outline" className="text-green-600 bg-green-50">
            <span className="h-2 w-2 rounded-full bg-green-500 mr-1"></span>
            Completed
          </Badge>
          <Badge variant="outline" className="text-indigo-600 bg-indigo-50">
            <span className="h-2 w-2 rounded-full bg-indigo-500 mr-1"></span>
            In Progress
          </Badge>
          <Badge variant="outline" className="text-amber-600 bg-amber-50">
            <span className="h-2 w-2 rounded-full bg-amber-500 mr-1"></span>
            Assigned
          </Badge>
          <Badge variant="outline" className="text-red-600 bg-red-50">
            <span className="h-2 w-2 rounded-full bg-red-500 mr-1"></span>
            Pending
          </Badge>
        </div>
      )}
    </div>
  );
};

export default TeamMapFilters;
