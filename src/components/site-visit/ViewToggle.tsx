
import React from 'react';
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Grid, MapPin, Calendar } from 'lucide-react';

interface ViewToggleProps {
  view: 'grid' | 'map' | 'calendar';
  onViewChange: (view: 'grid' | 'map' | 'calendar') => void;
}

const ViewToggle: React.FC<ViewToggleProps> = ({ view, onViewChange }) => {
  return (
    <ToggleGroup type="single" value={view} onValueChange={(v) => onViewChange(v as 'grid' | 'map' | 'calendar')}>
      <ToggleGroupItem value="grid" aria-label="Grid view">
        <Grid className="h-4 w-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="map" aria-label="Map view">
        <MapPin className="h-4 w-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="calendar" aria-label="Calendar view">
        <Calendar className="h-4 w-4" />
      </ToggleGroupItem>
    </ToggleGroup>
  );
};

export default ViewToggle;
