import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Phone,
  PhoneOff,
  PhoneIncoming,
  PhoneOutgoing,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Video,
  VideoOff,
  Maximize2,
  Minimize2,
  User,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';

type CallState = 'idle' | 'incoming' | 'outgoing' | 'connected' | 'ended';

interface CallParticipant {
  id: string;
  name: string;
  avatar?: string;
  role?: string;
}

interface MobileCallOverlayProps {
  isActive: boolean;
  callState: CallState;
  participant: CallParticipant;
  onAccept?: () => void;
  onDecline?: () => void;
  onEnd: () => void;
  onMuteToggle?: (muted: boolean) => void;
  onSpeakerToggle?: (speaker: boolean) => void;
  onVideoToggle?: (video: boolean) => void;
  showVideo?: boolean;
  className?: string;
}

export function MobileCallOverlay({
  isActive,
  callState,
  participant,
  onAccept,
  onDecline,
  onEnd,
  onMuteToggle,
  onSpeakerToggle,
  onVideoToggle,
  showVideo = false,
  className,
}: MobileCallOverlayProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(false);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (callState === 'connected') {
      interval = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } else if (callState === 'idle' || callState === 'ended') {
      setDuration(0);
    }
    return () => clearInterval(interval);
  }, [callState]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleMuteToggle = useCallback(() => {
    hapticPresets.toggle();
    setIsMuted(!isMuted);
    onMuteToggle?.(!isMuted);
  }, [isMuted, onMuteToggle]);

  const handleSpeakerToggle = useCallback(() => {
    hapticPresets.toggle();
    setIsSpeaker(!isSpeaker);
    onSpeakerToggle?.(!isSpeaker);
  }, [isSpeaker, onSpeakerToggle]);

  const handleVideoToggle = useCallback(() => {
    hapticPresets.toggle();
    setIsVideoOn(!isVideoOn);
    onVideoToggle?.(!isVideoOn);
  }, [isVideoOn, onVideoToggle]);

  const handleAccept = useCallback(() => {
    hapticPresets.success();
    onAccept?.();
  }, [onAccept]);

  const handleDecline = useCallback(() => {
    hapticPresets.warning();
    onDecline?.();
  }, [onDecline]);

  const handleEnd = useCallback(() => {
    hapticPresets.warning();
    onEnd();
  }, [onEnd]);

  if (!isActive) return null;

  if (isMinimized) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 100 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 100 }}
        className={cn(
          "fixed bottom-20 left-4 right-4 z-50",
          "bg-black dark:bg-white rounded-2xl p-3 shadow-xl",
          className
        )}
        data-testid="call-overlay-minimized"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/10 dark:bg-black/10 flex items-center justify-center flex-shrink-0">
            {participant.avatar ? (
              <img src={participant.avatar} alt="" className="w-full h-full rounded-full object-cover" />
            ) : (
              <User className="w-5 h-5 text-white dark:text-black" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white dark:text-black truncate">
              {participant.name}
            </p>
            <p className="text-xs text-white/60 dark:text-black/60">
              {callState === 'connected' ? formatDuration(duration) : 
               callState === 'outgoing' ? 'Calling...' : 
               callState === 'incoming' ? 'Incoming call' : 'Call ended'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                hapticPresets.buttonPress();
                setIsMinimized(false);
              }}
              className="rounded-full text-white dark:text-black min-w-[44px] min-h-[44px]"
              data-testid="button-maximize-call"
              aria-label="Maximize call"
            >
              <Maximize2 className="w-4 h-4" />
            </Button>

            <Button
              variant="destructive"
              size="icon"
              onClick={handleEnd}
              className="rounded-full min-w-[44px] min-h-[44px]"
              data-testid="button-end-call-minimized"
              aria-label="End call"
            >
              <PhoneOff className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className={cn(
          "fixed inset-0 z-50 bg-black",
          className
        )}
        data-testid="call-overlay-fullscreen"
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between p-4 safe-area-inset-top">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                hapticPresets.buttonPress();
                setIsMinimized(true);
              }}
              className="rounded-full text-white min-w-[44px] min-h-[44px]"
              data-testid="button-minimize-call"
              aria-label="Minimize call"
            >
              <Minimize2 className="w-5 h-5" />
            </Button>

            <div className="flex items-center gap-2">
              {callState === 'connected' && (
                <span className="text-sm font-medium text-white">
                  {formatDuration(duration)}
                </span>
              )}
            </div>

            <div className="w-9" />
          </div>

          <div className="flex-1 flex flex-col items-center justify-center px-8">
            <motion.div
              animate={callState === 'incoming' ? { scale: [1, 1.1, 1] } : {}}
              transition={{ repeat: Infinity, duration: 1.5 }}
              className="relative mb-8"
            >
              <div className="w-32 h-32 rounded-full bg-white/10 flex items-center justify-center">
                {participant.avatar ? (
                  <img 
                    src={participant.avatar} 
                    alt="" 
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  <User className="w-16 h-16 text-white/60" />
                )}
              </div>

              {callState === 'incoming' && (
                <motion.div
                  className="absolute inset-0 rounded-full border-2 border-white/30"
                  animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                />
              )}
            </motion.div>

            <h2 className="text-2xl font-semibold text-white mb-1">
              {participant.name}
            </h2>

            {participant.role && (
              <p className="text-sm text-white/60 mb-4">
                {participant.role}
              </p>
            )}

            <p className="text-lg text-white/80">
              {callState === 'incoming' && (
                <span className="flex items-center gap-2">
                  <PhoneIncoming className="w-5 h-5 animate-pulse" />
                  Incoming call...
                </span>
              )}
              {callState === 'outgoing' && (
                <span className="flex items-center gap-2">
                  <PhoneOutgoing className="w-5 h-5 animate-pulse" />
                  Calling...
                </span>
              )}
              {callState === 'connected' && 'Connected'}
              {callState === 'ended' && 'Call ended'}
            </p>
          </div>

          <div className="p-8 safe-area-inset-bottom">
            {callState === 'incoming' ? (
              <div className="flex items-center justify-center gap-8">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  onClick={handleDecline}
                  className="w-16 h-16 rounded-full bg-destructive flex items-center justify-center"
                  data-testid="button-decline-call"
                  aria-label="Decline call"
                >
                  <PhoneOff className="w-7 h-7 text-white" />
                </motion.button>

                <motion.button
                  whileTap={{ scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  onClick={handleAccept}
                  className="w-16 h-16 rounded-full bg-white flex items-center justify-center"
                  data-testid="button-accept-call"
                  aria-label="Accept call"
                >
                  <Phone className="w-7 h-7 text-black" />
                </motion.button>
              </div>
            ) : callState === 'connected' ? (
              <div className="space-y-6">
                <div className="flex items-center justify-center gap-6">
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    onClick={handleMuteToggle}
                    className={cn(
                      "w-14 h-14 rounded-full flex items-center justify-center",
                      isMuted ? "bg-white text-black" : "bg-white/10 text-white"
                    )}
                    data-testid="button-toggle-mute"
                    aria-label={isMuted ? "Unmute" : "Mute"}
                  >
                    {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                  </motion.button>

                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    onClick={handleSpeakerToggle}
                    className={cn(
                      "w-14 h-14 rounded-full flex items-center justify-center",
                      isSpeaker ? "bg-white text-black" : "bg-white/10 text-white"
                    )}
                    data-testid="button-toggle-speaker"
                    aria-label={isSpeaker ? "Turn off speaker" : "Turn on speaker"}
                  >
                    {isSpeaker ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
                  </motion.button>

                  {showVideo && (
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                      onClick={handleVideoToggle}
                      className={cn(
                        "w-14 h-14 rounded-full flex items-center justify-center",
                        isVideoOn ? "bg-white text-black" : "bg-white/10 text-white"
                      )}
                      data-testid="button-toggle-video"
                      aria-label={isVideoOn ? "Turn off video" : "Turn on video"}
                    >
                      {isVideoOn ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
                    </motion.button>
                  )}
                </div>

                <div className="flex justify-center">
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    onClick={handleEnd}
                    className="w-16 h-16 rounded-full bg-destructive flex items-center justify-center"
                    data-testid="button-end-call"
                    aria-label="End call"
                  >
                    <PhoneOff className="w-7 h-7 text-white" />
                  </motion.button>
                </div>
              </div>
            ) : (
              <div className="flex justify-center">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  onClick={handleEnd}
                  className="w-16 h-16 rounded-full bg-destructive flex items-center justify-center"
                  data-testid="button-end-call"
                  aria-label="End call"
                >
                  <PhoneOff className="w-7 h-7 text-white" />
                </motion.button>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

interface CallNotificationProps {
  participant: CallParticipant;
  onAccept: () => void;
  onDecline: () => void;
  className?: string;
}

export function CallNotification({
  participant,
  onAccept,
  onDecline,
  className,
}: CallNotificationProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -100 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -100 }}
      className={cn(
        "fixed top-4 left-4 right-4 z-50 safe-area-inset-top",
        "bg-black dark:bg-white rounded-2xl p-4 shadow-xl",
        className
      )}
      data-testid="call-notification"
    >
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-white/10 dark:bg-black/10 flex items-center justify-center flex-shrink-0">
          {participant.avatar ? (
            <img src={participant.avatar} alt="" className="w-full h-full rounded-full object-cover" />
          ) : (
            <User className="w-6 h-6 text-white dark:text-black" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-base font-medium text-white dark:text-black truncate">
            {participant.name}
          </p>
          <p className="text-sm text-white/60 dark:text-black/60 flex items-center gap-1">
            <PhoneIncoming className="w-4 h-4 animate-pulse" />
            Incoming call
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="destructive"
            size="icon"
            onClick={() => {
              hapticPresets.warning();
              onDecline();
            }}
            className="rounded-full"
            data-testid="button-decline-notification"
            aria-label="Decline call"
          >
            <X className="w-5 h-5" />
          </Button>

          <Button
            size="icon"
            onClick={() => {
              hapticPresets.success();
              onAccept();
            }}
            className="rounded-full bg-white dark:bg-black text-black dark:text-white"
            data-testid="button-accept-notification"
            aria-label="Accept call"
          >
            <Phone className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

export type { CallState, CallParticipant };
