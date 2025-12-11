
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useUser } from '@/context/user/UserContext';
import { useToast } from '@/hooks/use-toast';
import FloatingToggle from './common/FloatingToggle';
import { supabase } from '@/integrations/supabase/client';
import { Capacitor } from '@capacitor/core';
import { Geolocation, Position } from '@capacitor/geolocation';

const LOCATION_UPDATE_INTERVAL = 30000; // 30 seconds

const LocationSharingControl = () => {
  const { currentUser, updateUserLocation, updateUserAvailability, toggleLocationSharing } = useUser();
  const [isSharing, setIsSharing] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  
  const watchIdRef = useRef<string | null>(null);
  const intervalIdRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  // Initialize sharing state from current user
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

  // Function to check location permissions
  const checkLocationPermission = useCallback(async (): Promise<boolean> => {
    try {
      if (Capacitor.isNativePlatform()) {
        const permission = await Geolocation.checkPermissions();
        if (permission.location !== 'granted') {
          const request = await Geolocation.requestPermissions();
          return request.location === 'granted';
        }
        return true;
      } else {
        // Web browser - check if geolocation is available
        if (!navigator.geolocation) {
          setError('Geolocation is not supported by your browser');
          return false;
        }
        
        // Try to get permission by requesting position
        return new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            () => resolve(true),
            (err) => {
              if (err.code === err.PERMISSION_DENIED) {
                setError('Location permission denied');
              }
              resolve(false);
            },
            { enableHighAccuracy: true, timeout: 5000 }
          );
        });
      }
    } catch (err) {
      console.error('[LocationSharing] Permission check error:', err);
      return false;
    }
  }, []);

  // Function to get current position
  const getCurrentPosition = useCallback(async (): Promise<{ lat: number; lng: number; accuracy: number } | null> => {
    try {
      if (Capacitor.isNativePlatform()) {
        const position = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        });
        return {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        };
      } else {
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
      }
    } catch (err) {
      console.error('[LocationSharing] Get current position error:', err);
      return null;
    }
  }, []);

  // Start location tracking
  const startLocationTracking = useCallback(async () => {
    console.log('[LocationSharing] Starting location tracking...');
    setError(null);
    
    // Get initial position
    const position = await getCurrentPosition();
    if (position && isMountedRef.current) {
      console.log('[LocationSharing] Initial position:', position);
      await updateUserLocation(position.lat, position.lng, position.accuracy);
    }
    
    // Set up watch for native platforms
    if (Capacitor.isNativePlatform()) {
      try {
        const id = await Geolocation.watchPosition(
          { enableHighAccuracy: true },
          async (pos, err) => {
            if (err) {
              console.error('[LocationSharing] Watch error:', err);
              return;
            }
            if (pos && isMountedRef.current) {
              console.log('[LocationSharing] Position update:', pos.coords);
              await updateUserLocation(
                pos.coords.latitude, 
                pos.coords.longitude, 
                pos.coords.accuracy
              );
            }
          }
        );
        watchIdRef.current = id;
      } catch (err) {
        console.error('[LocationSharing] Watch setup error:', err);
      }
    } else {
      // Web browser - use watchPosition
      try {
        const id = navigator.geolocation.watchPosition(
          async (pos) => {
            if (isMountedRef.current) {
              console.log('[LocationSharing] Web position update:', pos.coords);
              await updateUserLocation(
                pos.coords.latitude,
                pos.coords.longitude,
                pos.coords.accuracy
              );
            }
          },
          (err) => console.error('[LocationSharing] Web watch error:', err),
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
        watchIdRef.current = String(id);
      } catch (err) {
        console.error('[LocationSharing] Web watch setup error:', err);
      }
    }
    
    // Also set up interval for periodic updates
    intervalIdRef.current = setInterval(async () => {
      if (isMountedRef.current) {
        const pos = await getCurrentPosition();
        if (pos) {
          await updateUserLocation(pos.lat, pos.lng, pos.accuracy);
        }
      }
    }, LOCATION_UPDATE_INTERVAL);
  }, [getCurrentPosition, updateUserLocation]);

  // Stop location tracking
  const stopLocationTracking = useCallback(() => {
    console.log('[LocationSharing] Stopping location tracking...');
    
    if (watchIdRef.current) {
      if (Capacitor.isNativePlatform()) {
        Geolocation.clearWatch({ id: watchIdRef.current });
      } else {
        navigator.geolocation.clearWatch(Number(watchIdRef.current));
      }
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
  if (!currentUser || !['dataCollector', 'datacollector', 'coordinator', 'supervisor'].includes(currentUser.role?.toLowerCase() || '')) {
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
