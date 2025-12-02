import React, { useEffect, useMemo, useState } from 'react';
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

  const dismissedUntil = useMemo(() => {
    try {
      const raw = localStorage.getItem(DISMISS_KEY);
      return raw ? parseInt(raw, 10) : 0;
    } catch {
      return 0;
    }
  }, []);

  useEffect(() => {
    // Only prompt when authenticated user exists
    if (!currentUser) return;

    // If we already have coordinates, do not prompt
    if (hasValidCoords(currentUser)) return;

    // If user dismissed recently, respect cooldown
    const now = Date.now();
    if (dismissedUntil && now < dismissedUntil) return;

    setOpen(true);
  }, [currentUser, dismissedUntil]);

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
        toast({
          title: 'Permission required',
          description: 'Please allow location access to appear on the team map and receive nearby assignments.',
          variant: 'destructive',
        });
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, (Date.now() + DISMISS_MS).toString());
    } catch {}
    setOpen(false);
  };

  // Render nothing if we decided not to show
  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
