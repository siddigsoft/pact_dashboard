
import React from 'react';
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { hubs, sudanStates } from "@/data/sudanStates";
import { MapPin } from "lucide-react";

interface LocationSelectionProps {
  selectedHub: string;
  setSelectedHub: (value: string) => void;
  selectedState: string;
  setSelectedState: (value: string) => void;
  selectedLocality?: string;
  setSelectedLocality?: (value: string) => void;
  availableStates: string[];
  localities: { id: string; name: string; }[];
  showStateSelection?: boolean;
  localityRequired?: boolean;
}

const LocationSelection = ({
  selectedHub,
  setSelectedHub,
  selectedState,
  setSelectedState,
  selectedLocality,
  setSelectedLocality,
  availableStates,
  localities,
  showStateSelection = true,
  localityRequired = false
}: LocationSelectionProps) => {
  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
        <MapPin className="h-5 w-5" />
        {showStateSelection ? 'Location Details' : 'Hub Assignment'}
      </h3>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Hub Office<span className="text-red-500 ml-1">*</span></Label>
          <Select value={selectedHub} onValueChange={setSelectedHub}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select hub office" />
            </SelectTrigger>
            <SelectContent>
              {hubs.map((hub) => (
                <SelectItem key={hub.id} value={hub.id}>
                  {hub.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedHub && !showStateSelection && (
          <div className="mt-4 p-3 bg-muted rounded-md">
            <p className="text-sm font-medium">States under this hub:</p>
            <ul className="mt-2 space-y-1">
              {hubs.find(h => h.id === selectedHub)?.states.map(stateId => (
                <li key={stateId} className="text-sm text-muted-foreground">
                  • {sudanStates.find(s => s.id === stateId)?.name}
                </li>
              ))}
            </ul>
          </div>
        )}

        {showStateSelection && selectedHub && (
          <div className="space-y-2">
            <Label>State<span className="text-red-500 ml-1">*</span></Label>
            <Select value={selectedState} onValueChange={setSelectedState}>
              <SelectTrigger>
                <SelectValue placeholder="Select state" />
              </SelectTrigger>
              <SelectContent>
                {availableStates.map((stateId) => {
                  const state = sudanStates.find(s => s.id === stateId);
                  return state ? (
                    <SelectItem key={state.id} value={state.id}>
                      {state.name}
                    </SelectItem>
                  ) : null;
                })}
              </SelectContent>
            </Select>
          </div>
        )}

        {showStateSelection && selectedState && localities.length > 0 && (
          <div className="space-y-2">
            <Label>
              Locality
              {localityRequired && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Select 
              value={selectedLocality || ''} 
              onValueChange={(value) => setSelectedLocality?.(value)}
            >
              <SelectTrigger>
                <SelectValue placeholder={localityRequired ? "Select locality" : "Select locality (Optional)"} />
              </SelectTrigger>
              <SelectContent>
                {localities.map((locality) => (
                  <SelectItem key={locality.id} value={locality.id}>
                    {locality.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {localityRequired && (
              <p className="text-xs text-muted-foreground">
                Required for site matching and claiming
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default LocationSelection;
