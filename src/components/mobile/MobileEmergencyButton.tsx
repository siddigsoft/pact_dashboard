import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  AlertTriangle,
  Phone,
  MapPin,
  X,
  Shield,
  User,
  Navigation,
  Send
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';

interface EmergencyContact {
  id: string;
  name: string;
  role: string;
  phone?: string;
  avatar?: string;
}

interface MobileEmergencyButtonProps {
  contacts: EmergencyContact[];
  onEmergency: (contact: EmergencyContact, location?: GeolocationPosition) => void;
  onShareLocation: (location: GeolocationPosition) => void;
  holdDuration?: number;
  className?: string;
}

export function MobileEmergencyButton({
  contacts,
  onEmergency,
  onShareLocation,
  holdDuration = 2000,
  className,
}: MobileEmergencyButtonProps) {
  const [isHolding, setIsHolding] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const [showPanel, setShowPanel] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<GeolocationPosition | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);

  const holdStartRef = useRef<number>(0);
  const animationRef = useRef<number | null>(null);
  const holdTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (holdTimeoutRef.current) clearTimeout(holdTimeoutRef.current);
    };
  }, []);

  const getCurrentLocation = useCallback(async () => {
    setIsLoadingLocation(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        });
      });
      setCurrentLocation(position);
      return position;
    } catch (error) {
      console.error('Failed to get location:', error);
      return null;
    } finally {
      setIsLoadingLocation(false);
    }
  }, []);

  const handleHoldStart = useCallback(() => {
    setIsHolding(true);
    holdStartRef.current = Date.now();
    hapticPresets.warning();

    const updateProgress = () => {
      const elapsed = Date.now() - holdStartRef.current;
      const progress = Math.min(elapsed / holdDuration, 1);
      setHoldProgress(progress);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(updateProgress);
      }
    };
    animationRef.current = requestAnimationFrame(updateProgress);

    holdTimeoutRef.current = setTimeout(async () => {
      hapticPresets.error();
      setShowPanel(true);
      await getCurrentLocation();
    }, holdDuration);
  }, [holdDuration, getCurrentLocation]);

  const handleHoldEnd = useCallback(() => {
    setIsHolding(false);
    setHoldProgress(0);
    
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
    }
  }, []);

  const handleEmergencyCall = useCallback((contact: EmergencyContact) => {
    hapticPresets.error();
    onEmergency(contact, currentLocation || undefined);
    setShowPanel(false);
  }, [currentLocation, onEmergency]);

  const handleShareLocation = useCallback(() => {
    if (currentLocation) {
      hapticPresets.success();
      onShareLocation(currentLocation);
    }
  }, [currentLocation, onShareLocation]);

  return (
    <>
      <motion.button
        onTouchStart={handleHoldStart}
        onTouchEnd={handleHoldEnd}
        onTouchCancel={handleHoldEnd}
        onMouseDown={handleHoldStart}
        onMouseUp={handleHoldEnd}
        onMouseLeave={handleHoldEnd}
        className={cn(
          "relative w-14 h-14 rounded-full shadow-lg flex items-center justify-center",
          "bg-destructive",
          className
        )}
        data-testid="button-emergency"
        aria-label="Hold for emergency"
      >
        <svg 
          className="absolute inset-0 w-full h-full -rotate-90"
          viewBox="0 0 100 100"
        >
          <circle
            cx="50"
            cy="50"
            r="46"
            fill="none"
            stroke="rgba(255,255,255,0.3)"
            strokeWidth="8"
          />
          <motion.circle
            cx="50"
            cy="50"
            r="46"
            fill="none"
            stroke="white"
            strokeWidth="8"
            strokeDasharray={`${holdProgress * 289} 289`}
            strokeLinecap="round"
          />
        </svg>

        <AlertTriangle className="w-6 h-6 text-white relative z-10" />

        {isHolding && (
          <motion.div
            className="absolute inset-0 rounded-full border-4 border-white"
            animate={{ scale: [1, 1.2], opacity: [0.5, 0] }}
            transition={{ repeat: Infinity, duration: 0.5 }}
          />
        )}
      </motion.button>

      <AnimatePresence>
        {showPanel && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 z-50"
              onClick={() => setShowPanel(false)}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-neutral-900 rounded-t-3xl overflow-hidden"
              data-testid="emergency-panel"
            >
              <div className="bg-destructive p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Shield className="w-6 h-6 text-white" />
                    <div>
                      <h2 className="text-lg font-bold text-white">Emergency Mode</h2>
                      <p className="text-sm text-white/80">Choose action below</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowPanel(false)}
                    className="rounded-full text-white min-w-[44px] min-h-[44px]"
                    data-testid="button-close-emergency"
                    aria-label="Close emergency panel"
                  >
                    <X className="w-5 h-5" />
                  </Button>
                </div>
              </div>

              <div className="p-4 space-y-4">
                <div className="p-4 bg-black/5 dark:bg-white/5 rounded-xl">
                  <div className="flex items-center gap-3 mb-3">
                    <MapPin className="w-5 h-5 text-black dark:text-white" />
                    <div>
                      <p className="text-sm font-medium text-black dark:text-white">Your Location</p>
                      {isLoadingLocation ? (
                        <p className="text-xs text-black/60 dark:text-white/60">Getting location...</p>
                      ) : currentLocation ? (
                        <p className="text-xs text-black/60 dark:text-white/60">
                          {currentLocation.coords.latitude.toFixed(6)}, {currentLocation.coords.longitude.toFixed(6)}
                        </p>
                      ) : (
                        <p className="text-xs text-destructive">Location unavailable</p>
                      )}
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    onClick={handleShareLocation}
                    disabled={!currentLocation}
                    className="w-full rounded-full"
                    data-testid="button-share-emergency-location"
                  >
                    <Send className="w-4 h-4 mr-2" />
                    Share Location with Team
                  </Button>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-black/60 dark:text-white/60 uppercase tracking-wider mb-3">
                    Emergency Contacts
                  </h3>
                  <div className="space-y-2">
                    {contacts.map((contact) => (
                      <button
                        key={contact.id}
                        onClick={() => handleEmergencyCall(contact)}
                        className="w-full flex items-center gap-3 p-4 min-h-[56px] bg-black/5 dark:bg-white/5 rounded-xl active:bg-black/10 dark:active:bg-white/10"
                        data-testid={`emergency-contact-${contact.id}`}
                        aria-label={`Call ${contact.name} - ${contact.role}`}
                      >
                        <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
                          {contact.avatar ? (
                            <img src={contact.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                          ) : (
                            <User className="w-6 h-6 text-destructive" />
                          )}
                        </div>
                        <div className="flex-1 text-left">
                          <p className="text-base font-medium text-black dark:text-white">
                            {contact.name}
                          </p>
                          <p className="text-sm text-black/60 dark:text-white/60">
                            {contact.role}
                          </p>
                        </div>
                        <div className="w-12 h-12 rounded-full bg-destructive flex items-center justify-center">
                          <Phone className="w-5 h-5 text-white" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <p className="text-xs text-center text-black/40 dark:text-white/40">
                  Your location will be shared automatically when calling
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

interface EmergencyFabProps {
  contacts: EmergencyContact[];
  onEmergency: (contact: EmergencyContact, location?: GeolocationPosition) => void;
  onShareLocation: (location: GeolocationPosition) => void;
  position?: 'left' | 'right';
  className?: string;
}

export function EmergencyFab({
  contacts,
  onEmergency,
  onShareLocation,
  position = 'right',
  className,
}: EmergencyFabProps) {
  return (
    <div
      className={cn(
        "fixed bottom-40 z-40",
        position === 'left' ? "left-4" : "right-4",
        className
      )}
    >
      <MobileEmergencyButton
        contacts={contacts}
        onEmergency={onEmergency}
        onShareLocation={onShareLocation}
      />
    </div>
  );
}

export type { EmergencyContact };
