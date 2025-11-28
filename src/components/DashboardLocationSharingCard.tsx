
import React, { useEffect, useState } from 'react';
import LocationSharingControl from './LocationSharingControl';
import { useAppContext } from '@/context/AppContext';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { MapPin, Navigation } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface LocationData {
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  lastUpdated?: string;
  isSharing?: boolean;
}

const DashboardLocationSharingCard = () => {
  const { currentUser } = useAppContext();
  const [locationEnabled, setLocationEnabled] = useState<boolean>(false);
  const [locationData, setLocationData] = useState<LocationData | null>(null);
  
  useEffect(() => {
    const fetchLocationSharingStatus = async () => {
      if (!currentUser) return;
      
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('location_sharing, location')
          .eq('id', currentUser.id)
          .single();
        
        if (error) throw error;
        setLocationEnabled(data.location_sharing || false);
        
        if (data.location) {
          const loc = typeof data.location === 'string' ? JSON.parse(data.location) : data.location;
          setLocationData(loc);
        }
      } catch (error) {
        console.error("Error fetching location sharing status:", error);
      }
    };
    
    fetchLocationSharingStatus();
  }, [currentUser]);
  
  const isDataCollector = currentUser && 
    ['dataCollector', 'datacollector', 'coordinator'].includes((currentUser.role || '').toLowerCase());
  
  if (!isDataCollector) {
    return null;
  }

  const getAccuracyColor = (accuracy: number) => {
    if (accuracy <= 10) return 'text-green-600';
    if (accuracy <= 30) return 'text-yellow-600';
    return 'text-orange-600';
  };

  const getAccuracyLabel = (accuracy: number) => {
    if (accuracy <= 10) return 'Excellent';
    if (accuracy <= 30) return 'Good';
    if (accuracy <= 100) return 'Fair';
    return 'Poor';
  };
  
  return (
    <div className="col-span-12 md:col-span-4 lg:col-span-3">
      <Card className="h-full hover-scale">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Location Sharing</CardTitle>
          <MapPin className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="space-y-3">
          <LocationSharingControl />
          
          {locationEnabled && locationData?.latitude && locationData?.longitude && (
            <div className="p-2 bg-muted rounded-md space-y-1">
              <div className="flex items-center gap-2 text-xs">
                <Navigation className="h-3 w-3 text-muted-foreground" />
                <span className="text-muted-foreground">Current Status:</span>
              </div>
              {locationData.accuracy !== undefined && (
                <p className={`text-sm font-medium ${getAccuracyColor(locationData.accuracy)}`}>
                  Accuracy: ±{locationData.accuracy.toFixed(1)}m ({getAccuracyLabel(locationData.accuracy)})
                </p>
              )}
              {locationData.lastUpdated && (
                <p className="text-xs text-muted-foreground">
                  Updated: {new Date(locationData.lastUpdated).toLocaleString()}
                </p>
              )}
            </div>
          )}
          
          <p className="text-xs text-muted-foreground">
            {locationEnabled 
              ? "Your location is being shared with supervisors" 
              : "Enable location sharing to receive nearby assignments"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default DashboardLocationSharingCard;
