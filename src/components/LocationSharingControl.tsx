
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useUser } from '@/context/user/UserContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { useToast } from '@/hooks/use-toast';
import FloatingToggle from './common/FloatingToggle';
import { supabase } from '@/integrations/supabase/client';

const LOCATION_UPDATE_INTERVAL = 30000; // 30 seconds

const LocationSharingControl = () => {
  const { currentUser, updateUserLocation, updateUserAvailability, toggleLocationSharing } = useUser();
  const { effectiveRole } = useAuthorization();
  const [isSharing, setIsSharing] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  
  const watchIdRef = useRef<number | null>(null);
  const intervalIdRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    if (currentUser) {
      const userIsSharing = currentUser.location?.isSharing === true || 
                            currentUser.availability === 'online';
      setIsSharing(userIsSharing);
    }
    return () => {
      isMountedRef.current = false;
    };
  }, [currentUser?.id]);

  const checkLocationPermission = useCallback(async (): Promise<boolean> => {
    try {
      if (!navigator.geolocation) {
        setError('Geolocation is not supported by your browser');
        return false;
      }
      return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          () => resolve(true),
          (err) => {
            if (err.code === err.PERMISSION_DENIED) setError('Location permission denied');
            resolve(false);
          },
          { enableHighAccuracy: true, timeout: 5000 }
        );
      });
    } catch (err) {
      console.error('[LocationSharing] Permission check error:', err);
      return false;
    }
  }, []);

  const getCurrentPosition = useCallback(async (): Promise<{ lat: number; lng: number; accuracy: number } | null> => {
    try {
      return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            resolve({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              accuracy: position.coords.accuracy,
            });
          },
          (err) => {
            console.error('[LocationSharing] Get position error:', err);
            reject(err);
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
      });
    } catch (err) {
      console.error('[LocationSharing] Get current position error:', err);
      return null;
    }
  }, []);

  const startLocationTracking = useCallback(async () => {
    console.log('[LocationSharing] Starting location tracking...');
    setError(null);
    
    const position = await getCurrentPosition();
    if (position && isMountedRef.current) {
      await updateUserLocation(position.lat, position.lng, position.accuracy);
    }
    
    try {
      watchIdRef.current = navigator.geolocation.watchPosition(
        async (pos) => {
          if (isMountedRef.current) {
            await updateUserLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
          }
        },
        (err) => console.error('[LocationSharing] Web watch error:', err),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    } catch (err) {
      console.error('[LocationSharing] Web watch setup error:', err);
    }
    
    intervalIdRef.current = setInterval(async () => {
      if (isMountedRef.current) {
        const pos = await getCurrentPosition();
        if (pos) await updateUserLocation(pos.lat, pos.lng, pos.accuracy);
      }
    }, LOCATION_UPDATE_INTERVAL);
  }, [getCurrentPosition, updateUserLocation]);

  const stopLocationTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (intervalIdRef.current) {
      clearInterval(intervalIdRef.current);
      intervalIdRef.current = null;
    }
  }, []);

  // Toggle handler
  const handleToggleSharing = async () => {
    if (isLoading) return;
    
    setIsLoading(true);
    setError(null);
    
    const newSharingState = !isSharing;
    
    try {
      if (newSharingState) {
        // User wants to enable sharing
        const hasPermission = await checkLocationPermission();
        if (!hasPermission) {
          toast({
            title: "Location Permission Required",
            description: "Please enable location access in your device settings to share your location.",
            variant: "destructive",
          });
          setIsLoading(false);
          return;
        }
        
        // Start tracking first to get location
        await startLocationTracking();
        
        // Update database and local state
        await toggleLocationSharing(true);
        await updateUserAvailability('online');
        
        // Update Supabase directly as well to ensure persistence
        if (currentUser) {
          await supabase
            .from('profiles')
            .update({ 
              availability: 'online',
              location_sharing: true 
            })
            .eq('id', currentUser.id);
        }
        
        setIsSharing(true);
        toast({
          title: 'Location Sharing Enabled',
          description: 'Your location is now visible to your team and you will receive site visit assignments.',
          variant: 'success',
        });
      } else {
        // User wants to disable sharing
        stopLocationTracking();
        
        // Update database and local state
        await toggleLocationSharing(false);
        await updateUserAvailability('offline');
        
        // Update Supabase directly
        if (currentUser) {
          await supabase
            .from('profiles')
            .update({ 
              availability: 'offline',
              location_sharing: false 
            })
            .eq('id', currentUser.id);
        }
        
        setIsSharing(false);
        toast({
          title: 'Location Sharing Disabled',
          description: 'You are now offline. You will not receive new site visit assignments.',
        });
      }
    } catch (err) {
      console.error('[LocationSharing] Toggle error:', err);
      const message = err instanceof Error ? err.message : 'Failed to update location sharing';
      setError(message);
      toast({
        title: "Failed to update",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopLocationTracking();
    };
  }, [stopLocationTracking]);

  // Resume tracking if user is already sharing
  useEffect(() => {
    if (isSharing && currentUser && !watchIdRef.current) {
      // User is marked as sharing but we're not tracking - resume
      startLocationTracking().catch(console.error);
    }
  }, [isSharing, currentUser, startLocationTracking]);

  // Only show for field team roles
  if (!currentUser || !['dataCollector', 'datacollector', 'coordinator', 'supervisor'].includes((effectiveRole ?? '').toLowerCase())) {
    return null;
  }

  return (
    <FloatingToggle
      isEnabled={isSharing}
      onToggle={handleToggleSharing}
      label={isSharing ? "Sharing Location" : "Share Location"}
      className={`${isLoading ? 'opacity-50 cursor-not-allowed' : ''} ${
        isSharing ? 'border-green-500' : 'border-gray-200'
      } ${error ? 'border-red-500' : ''}`}
      data-testid="toggle-location-sharing"
    />
  );
};

export default LocationSharingControl;
