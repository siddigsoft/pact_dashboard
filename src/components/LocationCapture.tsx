import React, { useState, useEffect } from 'react';
import { useUser } from '@/context/user/UserContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const LocationCapture = () => {
  const { currentUser, updateUserLocation } = useUser();
  const [isCapturing, setIsCapturing] = useState(false);
  const [hasLocation, setHasLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (currentUser?.location?.latitude && currentUser?.location?.longitude) {
      setHasLocation(true);
    }
  }, [currentUser]);

  const captureLocation = async () => {
    setIsCapturing(true);
    setLocationError(null);

    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser');
      setIsCapturing(false);
      toast({
        title: 'Location not supported',
        description: 'Your browser does not support geolocation',
        variant: 'destructive',
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        
        try {
          const success = await updateUserLocation(latitude, longitude, accuracy);
          
          if (success) {
            setHasLocation(true);
            toast({
              title: 'Location captured',
              description: `Location saved with accuracy: ±${accuracy.toFixed(1)} meters`,
              variant: 'default',
            });
          } else {
            throw new Error('Failed to update location');
          }
        } catch (error) {
          console.error('Error updating location:', error);
          setLocationError('Failed to save location');
          toast({
            title: 'Location update failed',
            description: 'There was a problem saving your location',
            variant: 'destructive',
          });
        } finally {
          setIsCapturing(false);
        }
      },
      (error) => {
        console.error('Geolocation error:', error);
        let errorMessage = 'Unable to retrieve your location';
        
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'Location permission denied. Please enable location access in your browser settings.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Location information is unavailable';
            break;
          case error.TIMEOUT:
            errorMessage = 'Location request timed out';
            break;
        }
        
        setLocationError(errorMessage);
        setIsCapturing(false);
        toast({
          title: 'Location capture failed',
          description: errorMessage,
          variant: 'destructive',
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  };

  if (!currentUser) {
    return null;
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Location Sharing
        </CardTitle>
        <CardDescription>
          Share your location to appear on the team map and receive nearby site visit assignments
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Current Status:</span>
            {hasLocation ? (
              <Badge variant="default" className="bg-green-500">
                <CheckCircle className="h-3 w-3 mr-1" />
                Location Enabled
              </Badge>
            ) : (
              <Badge variant="secondary">
                <AlertCircle className="h-3 w-3 mr-1" />
                Location Not Set
              </Badge>
            )}
          </div>
        </div>

        {currentUser.location?.latitude && currentUser.location?.longitude && (
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground mb-1">Your Location:</p>
            <p className="font-mono text-sm">
              Lat: {currentUser.location.latitude.toFixed(6)}, 
              Lng: {currentUser.location.longitude.toFixed(6)}
            </p>
            {currentUser.location.accuracy !== undefined && (
              <p className="font-mono text-sm mt-1">
                <span className={`${currentUser.location.accuracy <= 10 ? 'text-green-600' : currentUser.location.accuracy <= 30 ? 'text-yellow-600' : 'text-orange-600'}`}>
                  Accuracy: ±{currentUser.location.accuracy.toFixed(1)} meters
                </span>
              </p>
            )}
            {currentUser.location.lastUpdated && (
              <p className="text-xs text-muted-foreground mt-1">
                Last updated: {new Date(currentUser.location.lastUpdated).toLocaleString()}
              </p>
            )}
          </div>
        )}

        {locationError && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <p className="text-sm text-destructive">{locationError}</p>
          </div>
        )}

        <Button 
          onClick={captureLocation} 
          disabled={isCapturing}
          className="w-full"
        >
          {isCapturing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Capturing Location...
            </>
          ) : (
            <>
              <MapPin className="mr-2 h-4 w-4" />
              {hasLocation ? 'Update Location' : 'Enable Location Sharing'}
            </>
          )}
        </Button>

        <p className="text-xs text-muted-foreground">
          Your location will be visible to supervisors and coordinators for assignment purposes.
          You can update your location at any time.
        </p>
      </CardContent>
    </Card>
  );
};

export default LocationCapture;
