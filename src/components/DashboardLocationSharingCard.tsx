
import React, { useEffect, useState } from 'react';
import LocationSharingControl from './LocationSharingControl';
import { useAppContext } from '@/context/AppContext';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { MapPin } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const DashboardLocationSharingCard = () => {
  const { currentUser } = useAppContext();
  const [locationEnabled, setLocationEnabled] = useState<boolean>(false);
  
  // Fetch the current user's location sharing status from Supabase
  useEffect(() => {
    const fetchLocationSharingStatus = async () => {
      if (!currentUser) return;
      
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('location_sharing')
          .eq('id', currentUser.id)
          .single();
        
        if (error) throw error;
        setLocationEnabled(data.location_sharing || false);
      } catch (error) {
        console.error("Error fetching location sharing status:", error);
      }
    };
    
    fetchLocationSharingStatus();
  }, [currentUser]);
  
  // Add debugging
  console.log("DashboardLocationSharingCard - currentUser:", currentUser);
  
  // Add more detailed role checking
  const isDataCollector = currentUser && 
    ['dataCollector', 'datacollector', 'coordinator'].includes((currentUser.role || '').toLowerCase());
  
  console.log("DashboardLocationSharingCard - isDataCollector:", isDataCollector);
  
  if (!isDataCollector) {
    return null;
  }
  
  return (
    <div className="col-span-12 md:col-span-4 lg:col-span-3">
      <Card className="h-full hover-scale">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Location Sharing</CardTitle>
          <MapPin className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <LocationSharingControl />
          <p className="text-xs text-muted-foreground mt-2">
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
