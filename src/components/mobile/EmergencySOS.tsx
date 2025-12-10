import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Phone, X, MapPin, Loader2, Send, Shield, Users, User, ChevronDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/context/user/UserContext';
import { triggerHaptic } from '@/lib/haptics';
import { ScrollArea } from '@/components/ui/scroll-area';

interface EmergencySOSProps {
  isVisible: boolean;
  onClose: () => void;
}

interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  role: string;
}

type RecipientMode = 'supervisors' | 'specific';

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
  const [allContacts, setAllContacts] = useState<EmergencyContact[]>([]);
  const [recipientMode, setRecipientMode] = useState<RecipientMode>('supervisors');
  const [selectedPerson, setSelectedPerson] = useState<EmergencyContact | null>(null);
  const [showPersonPicker, setShowPersonPicker] = useState(false);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
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
      // Load all contacts for specific person selection
      loadAllContacts();
    }

    return () => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, [isVisible]);

  const loadEmergencyContacts = async () => {
    try {
      // Load ALL supervisors, hub managers, and admins - no limit
      const { data: supervisors } = await supabase
        .from('profiles')
        .select('id, full_name, phone, role')
        .in('role', ['supervisor', 'hub_manager', 'admin'])
        .order('full_name');

      if (supervisors) {
        setEmergencyContacts(
          supervisors.map(s => ({
            id: s.id,
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

  const loadAllContacts = async () => {
    setIsLoadingContacts(true);
    try {
      const { data: contacts } = await supabase
        .from('profiles')
        .select('id, full_name, phone, role')
        .neq('id', currentUser?.id || '')
        .order('full_name');

      if (contacts) {
        setAllContacts(
          contacts.map(c => ({
            id: c.id,
            name: c.full_name || 'Unknown',
            phone: c.phone || '',
            role: c.role || '',
          }))
        );
      }
    } catch (error) {
      console.error('[SOS] Failed to load all contacts:', error);
    } finally {
      setIsLoadingContacts(false);
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
      const targetRecipients = recipientMode === 'supervisors' 
        ? emergencyContacts 
        : selectedPerson 
          ? [selectedPerson] 
          : [];

      // Error handling: ensure we have recipients
      if (targetRecipients.length === 0) {
        console.error('[SOS] No recipients available to send alert');
        triggerHaptic('error');
        // Show alert to user - can't send without recipients
        alert(recipientMode === 'supervisors' 
          ? 'No supervisors available. Please try again or select a specific person.' 
          : 'Please select a person to send the alert to.');
        setIsSending(false);
        return;
      }

      // Create emergency alert notifications for each recipient
      const notifications = targetRecipients.map(recipient => ({
        user_id: recipient.id,
        type: 'warning' as const,
        title: 'EMERGENCY SOS ALERT',
        message: `Emergency alert from ${currentUser?.fullName || 'Field Worker'}. Location: ${currentLocation ? `${currentLocation.lat.toFixed(6)}, ${currentLocation.lng.toFixed(6)}` : 'Unknown'}`,
        related_entity_type: 'user',
        related_entity_id: currentUser?.id,
        is_read: false,
      }));

      const { error } = await supabase.from('notifications').insert(notifications);
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
          recipient_mode: recipientMode,
          recipient_ids: targetRecipients.map(r => r.id),
        },
      });

      setSent(true);
      triggerHaptic('success');
    } catch (error) {
      console.error('[SOS] Failed to send alert:', error);
      triggerHaptic('error');
      alert('Failed to send emergency alert. Please try again or call directly.');
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
    setRecipientMode('supervisors');
    setSelectedPerson(null);
    setShowPersonPicker(false);
    onClose();
  };

  const handleSelectPerson = (person: EmergencyContact) => {
    setSelectedPerson(person);
    setShowPersonPicker(false);
    triggerHaptic('light');
  };

  const getRecipientDescription = () => {
    if (recipientMode === 'supervisors') {
      const count = emergencyContacts.length;
      if (count === 0) {
        return 'No supervisors available to notify';
      }
      return `This will notify ${count} supervisor${count !== 1 ? 's' : ''} with your location`;
    }
    if (selectedPerson) {
      return `This will notify ${selectedPerson.name} with your location`;
    }
    return 'Select a person to notify';
  };

  const canSend = (recipientMode === 'supervisors' && emergencyContacts.length > 0) || selectedPerson !== null;

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
            className="w-full max-w-sm bg-white dark:bg-black rounded-3xl overflow-hidden max-h-[90vh] flex flex-col"
          >
            {/* Header */}
            <div className="bg-destructive text-white p-4 flex items-center justify-between shrink-0">
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

            <div className="p-6 space-y-6 overflow-y-auto flex-1">
              {!isActivated ? (
                <>
                  {/* Recipient Selection */}
                  <div className="space-y-3">
                    <p className="text-xs font-medium text-black/50 dark:text-white/50 uppercase tracking-wide">
                      Send alert to
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant={recipientMode === 'supervisors' ? 'default' : 'outline'}
                        className={cn(
                          "flex-1 h-11 rounded-full gap-2",
                          recipientMode === 'supervisors' 
                            ? "bg-black dark:bg-white text-white dark:text-black" 
                            : "border-black/20 dark:border-white/20"
                        )}
                        onClick={() => {
                          setRecipientMode('supervisors');
                          setSelectedPerson(null);
                          triggerHaptic('light');
                        }}
                        data-testid="button-recipient-supervisors"
                      >
                        <Users className="h-4 w-4" />
                        All Supervisors
                      </Button>
                      <Button
                        variant={recipientMode === 'specific' ? 'default' : 'outline'}
                        className={cn(
                          "flex-1 h-11 rounded-full gap-2",
                          recipientMode === 'specific' 
                            ? "bg-black dark:bg-white text-white dark:text-black" 
                            : "border-black/20 dark:border-white/20"
                        )}
                        onClick={() => {
                          setRecipientMode('specific');
                          triggerHaptic('light');
                        }}
                        data-testid="button-recipient-specific"
                      >
                        <User className="h-4 w-4" />
                        Specific Person
                      </Button>
                    </div>

                    {/* Person Picker */}
                    {recipientMode === 'specific' && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-2"
                      >
                        <Button
                          variant="outline"
                          className="w-full h-12 rounded-full border-black/20 dark:border-white/20 justify-between"
                          onClick={() => setShowPersonPicker(!showPersonPicker)}
                          data-testid="button-select-person"
                        >
                          <span className={cn(
                            "flex items-center gap-2",
                            !selectedPerson && "text-black/40 dark:text-white/40"
                          )}>
                            <User className="h-4 w-4" />
                            {selectedPerson ? selectedPerson.name : 'Select a person'}
                          </span>
                          <ChevronDown className={cn(
                            "h-4 w-4 transition-transform",
                            showPersonPicker && "rotate-180"
                          )} />
                        </Button>

                        <AnimatePresence>
                          {showPersonPicker && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              className="overflow-hidden"
                            >
                              <ScrollArea className="h-48 rounded-2xl border border-black/10 dark:border-white/10">
                                {isLoadingContacts ? (
                                  <div className="flex items-center justify-center h-full py-8">
                                    <Loader2 className="h-5 w-5 animate-spin text-black/40 dark:text-white/40" />
                                  </div>
                                ) : allContacts.length === 0 ? (
                                  <div className="flex items-center justify-center h-full py-8 text-sm text-black/40 dark:text-white/40">
                                    No contacts available
                                  </div>
                                ) : (
                                  <div className="p-2 space-y-1">
                                    {allContacts.map((contact) => (
                                      <button
                                        key={contact.id}
                                        onClick={() => handleSelectPerson(contact)}
                                        className={cn(
                                          "w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors",
                                          selectedPerson?.id === contact.id
                                            ? "bg-black/10 dark:bg-white/10"
                                            : "hover:bg-black/5 dark:hover:bg-white/5"
                                        )}
                                        data-testid={`contact-${contact.id}`}
                                      >
                                        <div className="w-8 h-8 rounded-full bg-black/10 dark:bg-white/10 flex items-center justify-center shrink-0">
                                          <User className="h-4 w-4 text-black/60 dark:text-white/60" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="font-medium text-sm text-black dark:text-white truncate">
                                            {contact.name}
                                          </div>
                                          <div className="text-xs text-black/40 dark:text-white/40 capitalize truncate">
                                            {contact.role.replace(/_/g, ' ')}
                                          </div>
                                        </div>
                                        {selectedPerson?.id === contact.id && (
                                          <Check className="h-4 w-4 text-black dark:text-white shrink-0" />
                                        )}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </ScrollArea>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    )}
                  </div>

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
                          isHolding && "ring-4 ring-destructive/30",
                          !canSend && "opacity-50 cursor-not-allowed"
                        )}
                        onTouchStart={canSend ? handleHoldStart : undefined}
                        onTouchEnd={canSend ? handleHoldEnd : undefined}
                        onMouseDown={canSend ? handleHoldStart : undefined}
                        onMouseUp={canSend ? handleHoldEnd : undefined}
                        onMouseLeave={canSend ? handleHoldEnd : undefined}
                        disabled={!canSend}
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
                    {recipientMode === 'supervisors' 
                      ? 'Your emergency alert has been sent to supervisors with your current location.'
                      : `Your emergency alert has been sent to ${selectedPerson?.name} with your current location.`
                    }
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
                      {getRecipientDescription()}
                    </p>
                  </div>

                  <Button
                    className="w-full h-14 rounded-full bg-destructive hover:bg-destructive/90 text-white font-bold text-lg"
                    onClick={handleSendSOS}
                    disabled={isSending || !canSend}
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

                  {/* Emergency Contacts - only show for supervisor mode, limit display to 3 */}
                  {recipientMode === 'supervisors' && emergencyContacts.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-black/40 dark:text-white/40 text-center">
                        Or call directly:
                      </p>
                      {emergencyContacts.slice(0, 3).map((contact, index) => (
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
                      {emergencyContacts.length > 3 && (
                        <p className="text-xs text-black/30 dark:text-white/30 text-center">
                          +{emergencyContacts.length - 3} more supervisors will be notified
                        </p>
                      )}
                    </div>
                  )}

                  {/* Call selected person directly */}
                  {recipientMode === 'specific' && selectedPerson && selectedPerson.phone && (
                    <div className="space-y-2">
                      <p className="text-xs text-black/40 dark:text-white/40 text-center">
                        Or call directly:
                      </p>
                      <Button
                        variant="outline"
                        className="w-full h-12 rounded-full border-black/20 dark:border-white/20 justify-start gap-3"
                        onClick={() => handleCallEmergency(selectedPerson.phone)}
                        data-testid="button-call-selected"
                        aria-label={`Call ${selectedPerson.name}`}
                      >
                        <Phone className="h-4 w-4" />
                        <div className="flex-1 text-left">
                          <div className="font-medium text-sm">{selectedPerson.name}</div>
                          <div className="text-xs text-black/40 dark:text-white/40 capitalize">
                            {selectedPerson.role.replace(/_/g, ' ')}
                          </div>
                        </div>
                      </Button>
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
