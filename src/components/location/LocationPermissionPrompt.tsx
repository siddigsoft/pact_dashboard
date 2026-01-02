import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/context/user/UserContext';

// LocalStorage keys
const DISMISS_KEY = 'PACT__location_prompt_dismissed_until';
const DISMISS_MS = 24 * 60 * 60 * 1000; // 24 hours

const hasValidCoords = (u?: { location?: { latitude?: number; longitude?: number } }) =>
  !!(u?.location?.latitude && u?.location?.longitude);

const LocationPermissionPrompt: React.FC = () => {
  const { currentUser, updateUserLocation } = useUser();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Only prompt when authenticated user exists
    if (!currentUser) {
      setOpen(false);
      return;
    }

    // If we already have coordinates and location sharing is enabled, do not prompt
    if (hasValidCoords(currentUser) && currentUser.location?.isSharing) {
      setOpen(false);
      return;
    }

    // Check if user dismissed recently - read directly from localStorage to get latest value
    let dismissedUntil = 0;
    try {
      const raw = localStorage.getItem(DISMISS_KEY);
      dismissedUntil = raw ? parseInt(raw, 10) : 0;
    } catch {}
    
    const now = Date.now();
    if (dismissedUntil && now < dismissedUntil) {
      setOpen(false);
      return;
    }

    setOpen(true);
  }, [currentUser]);

  const handleAllow = async () => {
    if (!('geolocation' in navigator)) {
      toast({
        title: 'Geolocation unavailable',
        description: 'Your browser does not support geolocation.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        try {
          const ok = await updateUserLocation(latitude, longitude, accuracy);
          if (ok) {
            // Mark as enabled in localStorage to prevent immediate re-prompting
            // This helps prevent the dialog from reopening before state updates
            try {
              localStorage.setItem(DISMISS_KEY, (Date.now() + DISMISS_MS).toString());
            } catch {}
            
            toast({
              title: 'Location saved',
              description: `Location saved with accuracy: ±${accuracy.toFixed(1)}m`,
            });
            setOpen(false);
          } else {
            toast({
              title: 'Failed to save location',
              description: 'We could not save your location. Please try again later.',
              variant: 'destructive',
            });
          }
        } catch (e) {
          console.error('updateUserLocation error:', e);
          toast({
            title: 'Failed to save location',
            description: 'We could not save your location. Please try again later.',
            variant: 'destructive',
          });
        } finally {
          setLoading(false);
        }
      },
      (error) => {
        console.error('Geolocation error:', error);
        let title = 'Location error';
        let description = 'We could not get your location. Please try again.';

        if (error.code === error.PERMISSION_DENIED) {
          title = 'Permission required';
          description = 'Please allow location access to appear on the team map and receive nearby assignments.';
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          title = 'Location unavailable';
          description = 'Your device could not determine your location. Please check that location services are enabled.';
        } else if (error.code === error.TIMEOUT) {
          title = 'Location timeout';
          description = 'We could not get your location before the request timed out. Try again or move to an area with better reception.';
        }

        toast({
          title,
          description,
          variant: 'destructive',
        });
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  };

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, (Date.now() + DISMISS_MS).toString());
    } catch {}
    setOpen(false);
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    // If user manually closes the dialog (clicking outside, ESC, etc.), respect the dismissal
    if (!newOpen && open) {
      handleDismiss();
    }
  };

  // Render nothing if we decided not to show
  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share your location</DialogTitle>
          <DialogDescription>
            Enable location sharing so supervisors can assign you nearby site visits and your team can see your live position on the map. You can change this later in Settings → Location.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={handleDismiss} disabled={loading}>
            Not now
          </Button>
          <Button onClick={handleAllow} disabled={loading}>
            {loading ? 'Saving...' : 'Allow location'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LocationPermissionPrompt;
