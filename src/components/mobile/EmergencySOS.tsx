import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Phone, X, MapPin, Loader2, Send, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/context/user/UserContext';
import { triggerHaptic } from '@/lib/haptics';

interface EmergencySOSProps {
  isVisible: boolean;
  onClose: () => void;
}

interface EmergencyContact {
  name: string;
  phone: string;
  role: string;
}

const HOLD_DURATION = 3000; // 3 seconds to activate

export function EmergencySOS({ isVisible, onClose }: EmergencySOSProps) {
  const { currentUser } = useUser();
  const [isHolding, setIsHolding] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const [isActivated, setIsActivated] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>([]);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isVisible) {
      // Get current location
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCurrentLocation({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          });
        },
        (err) => console.error('[SOS] Location error:', err),
        { enableHighAccuracy: true, timeout: 10000 }
      );

      // Load emergency contacts (supervisors)
      loadEmergencyContacts();
    }

    return () => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, [isVisible]);

  const loadEmergencyContacts = async () => {
    try {
      const { data: supervisors } = await supabase
        .from('profiles')
        .select('full_name, phone, role')
        .in('role', ['supervisor', 'hub_manager', 'admin'])
        .limit(3);

      if (supervisors) {
        setEmergencyContacts(
          supervisors.map(s => ({
            name: s.full_name || 'Supervisor',
            phone: s.phone || '',
            role: s.role,
          }))
        );
      }
    } catch (error) {
      console.error('[SOS] Failed to load contacts:', error);
    }
  };

  const handleHoldStart = useCallback(() => {
    setIsHolding(true);
    setHoldProgress(0);
    triggerHaptic('medium');

    const startTime = Date.now();
    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min((elapsed / HOLD_DURATION) * 100, 100);
      setHoldProgress(progress);

      if (progress >= 100) {
        clearInterval(progressIntervalRef.current!);
        triggerHaptic('warning');
        setIsActivated(true);
      }
    }, 50);

    holdTimerRef.current = setTimeout(() => {
      setIsActivated(true);
      triggerHaptic('warning');
    }, HOLD_DURATION);
  }, []);

  const handleHoldEnd = useCallback(() => {
    if (!isActivated) {
      setIsHolding(false);
      setHoldProgress(0);
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    }
  }, [isActivated]);

  const handleSendSOS = async () => {
    setIsSending(true);
    triggerHaptic('heavy');

    try {
      // Create emergency alert in database
      // Note: Using 'warning' type as per database constraint (info, success, warning, error)
      const { error } = await supabase.from('notifications').insert({
        user_id: currentUser?.id,
        type: 'warning',
        title: 'EMERGENCY SOS ALERT',
        message: `Emergency alert from ${currentUser?.fullName || 'Field Worker'}. Location: ${currentLocation ? `${currentLocation.lat.toFixed(6)}, ${currentLocation.lng.toFixed(6)}` : 'Unknown'}`,
        related_entity_type: 'user',
        related_entity_id: currentUser?.id,
        is_read: false,
      });

      if (error) throw error;

      // Broadcast to realtime channel
      const channel = supabase.channel('emergency-alerts');
      await channel.send({
        type: 'broadcast',
        event: 'sos_alert',
        payload: {
          user_id: currentUser?.id,
          user_name: currentUser?.fullName,
          location: currentLocation,
          timestamp: new Date().toISOString(),
        },
      });

      setSent(true);
      triggerHaptic('success');
    } catch (error) {
      console.error('[SOS] Failed to send alert:', error);
      triggerHaptic('error');
    } finally {
      setIsSending(false);
    }
  };

  const handleCallEmergency = (phone: string) => {
    if (phone) {
      window.location.href = `tel:${phone}`;
    }
  };

  const handleClose = () => {
    setIsHolding(false);
    setHoldProgress(0);
    setIsActivated(false);
    setSent(false);
    onClose();
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="w-full max-w-sm bg-white dark:bg-black rounded-3xl overflow-hidden"
          >
            {/* Header */}
            <div className="bg-destructive text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                <span className="font-bold text-lg">Emergency SOS</span>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="text-white hover:bg-white/20 rounded-full"
                onClick={handleClose}
                data-testid="button-close-sos"
                aria-label="Close emergency screen"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="p-6 space-y-6">
              {!isActivated ? (
                <>
                  {/* Hold to Activate */}
                  <div className="text-center space-y-4">
                    <p className="text-sm text-black/60 dark:text-white/60">
                      Hold the button for 3 seconds to activate emergency alert
                    </p>

                    <div className="relative inline-flex">
                      <motion.button
                        className={cn(
                          "relative w-32 h-32 rounded-full flex items-center justify-center",
                          "bg-destructive text-white font-bold text-lg",
                          "shadow-lg active:scale-95 transition-transform",
                          isHolding && "ring-4 ring-destructive/30"
                        )}
                        onTouchStart={handleHoldStart}
                        onTouchEnd={handleHoldEnd}
                        onMouseDown={handleHoldStart}
                        onMouseUp={handleHoldEnd}
                        onMouseLeave={handleHoldEnd}
                        data-testid="button-sos-hold"
                        aria-label="Hold for 3 seconds to send emergency alert"
                      >
                        {/* Progress ring */}
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
                            strokeWidth="4"
                          />
                          <circle
                            cx="50"
                            cy="50"
                            r="46"
                            fill="none"
                            stroke="white"
                            strokeWidth="4"
                            strokeDasharray={`${holdProgress * 2.89} 289`}
                            strokeLinecap="round"
                          />
                        </svg>
                        <div className="relative z-10 flex flex-col items-center">
                          <AlertTriangle className="h-8 w-8 mb-1" />
                          <span>SOS</span>
                        </div>
                      </motion.button>
                    </div>
                  </div>

                  {/* Current Location */}
                  {currentLocation && (
                    <div className="flex items-center gap-2 p-3 bg-black/5 dark:bg-white/5 rounded-full">
                      <MapPin className="h-4 w-4 text-black/60 dark:text-white/60" />
                      <span className="text-sm text-black/80 dark:text-white/80">
                        {currentLocation.lat.toFixed(4)}, {currentLocation.lng.toFixed(4)}
                      </span>
                      {currentLocation.accuracy && (
                        <span className="text-xs text-black/40 dark:text-white/40">
                          ({Math.round(currentLocation.accuracy)}m)
                        </span>
                      )}
                    </div>
                  )}
                </>
              ) : sent ? (
                /* Alert Sent */
                <div className="text-center space-y-4 py-6">
                  <div className="w-20 h-20 mx-auto bg-green-500 rounded-full flex items-center justify-center">
                    <Send className="h-10 w-10 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-black dark:text-white">Alert Sent</h3>
                  <p className="text-sm text-black/60 dark:text-white/60">
                    Your emergency alert has been sent to supervisors with your current location.
                  </p>
                  <Button
                    className="w-full h-12 rounded-full bg-black dark:bg-white text-white dark:text-black font-semibold"
                    onClick={handleClose}
                    data-testid="button-sos-done"
                    aria-label="Close and return"
                  >
                    Done
                  </Button>
                </div>
              ) : (
                /* Confirm Send */
                <div className="space-y-4">
                  <div className="text-center">
                    <div className="w-16 h-16 mx-auto bg-destructive rounded-full flex items-center justify-center mb-4">
                      <AlertTriangle className="h-8 w-8 text-white animate-pulse" />
                    </div>
                    <h3 className="text-xl font-bold text-black dark:text-white">Send Emergency Alert?</h3>
                    <p className="text-sm text-black/60 dark:text-white/60 mt-2">
                      This will notify all supervisors with your location
                    </p>
                  </div>

                  <Button
                    className="w-full h-14 rounded-full bg-destructive hover:bg-destructive/90 text-white font-bold text-lg"
                    onClick={handleSendSOS}
                    disabled={isSending}
                    data-testid="button-sos-confirm"
                    aria-label="Confirm and send emergency alert"
                  >
                    {isSending ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin mr-2" />
                        Sending...
                      </>
                    ) : (
                      'Send SOS Alert'
                    )}
                  </Button>

                  {/* Emergency Contacts */}
                  {emergencyContacts.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-black/40 dark:text-white/40 text-center">
                        Or call directly:
                      </p>
                      {emergencyContacts.map((contact, index) => (
                        <Button
                          key={index}
                          variant="outline"
                          className="w-full h-12 rounded-full border-black/20 dark:border-white/20 justify-start gap-3"
                          onClick={() => handleCallEmergency(contact.phone)}
                          disabled={!contact.phone}
                          data-testid={`button-call-emergency-${index}`}
                          aria-label={`Call ${contact.name}`}
                        >
                          <Phone className="h-4 w-4" />
                          <div className="flex-1 text-left">
                            <div className="font-medium text-sm">{contact.name}</div>
                            <div className="text-xs text-black/40 dark:text-white/40 capitalize">
                              {contact.role.replace('_', ' ')}
                            </div>
                          </div>
                        </Button>
                      ))}
                    </div>
                  )}

                  <Button
                    variant="ghost"
                    className="w-full h-10 rounded-full text-black/60 dark:text-white/60"
                    onClick={handleClose}
                    data-testid="button-sos-cancel"
                    aria-label="Cancel emergency alert"
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function EmergencySOSTrigger({ onClick }: { onClick: () => void }) {
  return (
    <Button
      size="icon"
      variant="ghost"
      className="h-10 w-10 rounded-full bg-destructive/10 text-destructive hover:bg-destructive/20"
      onClick={() => {
        triggerHaptic('medium');
        onClick();
      }}
      data-testid="button-sos-trigger"
      aria-label="Open emergency SOS"
    >
      <AlertTriangle className="h-5 w-5" />
    </Button>
  );
}
