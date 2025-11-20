
import React, { useState, useEffect } from 'react';
import { useUser } from '@/context/user/UserContext';
import { useToast } from '@/hooks/use-toast';
import FloatingToggle from './common/FloatingToggle';
import { supabase } from '@/integrations/supabase/client';

const LocationSharingControl = () => {
  const { currentUser, updateUserLocation, updateUserAvailability, toggleLocationSharing } = useUser();
  const [isOnline, setIsOnline] = useState<boolean>(currentUser?.availability === 'online');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (currentUser) {
      setIsOnline(currentUser.availability === 'online');
    }
  }, [currentUser]);

  const handleToggleAvailability = async () => {
    setIsLoading(true);
    const newStatus = isOnline ? 'offline' : 'online';
    
    try {
      if (currentUser) {
        // Update the user's availability in Supabase
        const { data, error } = await supabase
          .from('profiles')
          .update({ availability: newStatus })
          .eq('id', currentUser.id);
          
        if (error) {
          throw error;
        }
        
        // Call the local context update function as well
        const success = await updateUserAvailability(newStatus);
        
        if (success) {
          setIsOnline(!isOnline);
          toast({
            title: newStatus === 'online' ? 'You are now online' : 'You are now offline',
            description: newStatus === 'online' 
              ? 'You will now receive site visit assignments' 
              : 'You will not receive any new assignments',
            variant: newStatus === 'online' ? 'success' : 'default',
          });
        }
      }
    } catch (error) {
      console.error("Error updating availability:", error);
      toast({
        title: "Failed to update availability",
        description: "There was a problem updating your status. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!currentUser || !['dataCollector', 'datacollector', 'coordinator'].includes(currentUser.role.toLowerCase())) {
    return null;
  }

  return (
    <FloatingToggle
      isEnabled={isOnline}
      onToggle={handleToggleAvailability}
      label={isOnline ? "Online" : "Offline"}
      className={`${isLoading ? 'opacity-50 cursor-not-allowed' : ''} ${
        isOnline ? 'border-green-500' : 'border-gray-200'
      }`}
    />
  );
};

export default LocationSharingControl;
