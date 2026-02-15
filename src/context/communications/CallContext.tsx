import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { User } from '@/types';
import { useUser } from '@/context/user/UserContext';
import { useToast } from '@/hooks/use-toast';
import webRTCService, { CallEventHandler } from '@/services/WebRTCService';
import { NotificationTriggerService } from '@/services/NotificationTriggerService';
import { CallLogService } from '@/services/call-log.service';

// Helper function to request microphone permission before starting a call
async function requestMicrophonePermission(): Promise<{ granted: boolean; error?: string }> {
  try {
    // First check if mediaDevices is available
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return { granted: false, error: 'Audio is not supported in this browser' };
    }

    // Try to get microphone access
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // Stop all tracks immediately - we just needed to verify permission
    stream.getTracks().forEach(track => track.stop());
    
    return { granted: true };
  } catch (error: any) {
    console.error('[Call] Microphone permission error:', error);
    
    // Provide specific error messages based on error type
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      return { 
        granted: false, 
        error: 'Microphone access was denied. Please enable microphone permission in your device settings.' 
      };
    } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      return { 
        granted: false, 
        error: 'No microphone found. Please connect a microphone and try again.' 
      };
    } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
      return { 
        granted: false, 
        error: 'Microphone is in use by another application. Please close other apps and try again.' 
      };
    } else if (error.name === 'OverconstrainedError') {
      return { 
        granted: false, 
        error: 'Could not access microphone. Please try again.' 
      };
    } else if (error.name === 'SecurityError') {
      return { 
        granted: false, 
        error: 'Microphone access is blocked due to security settings.' 
      };
    }
    
    return { 
      granted: false, 
      error: 'Could not access microphone. Please check your permissions.' 
    };
  }
}

export type CallStatus = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'connected' | 'ended';

export interface CallParticipant {
  id: string;
  name: string;
  avatar?: string;
}

interface CallState {
  status: CallStatus;
  participant: CallParticipant | null;
  duration: number;
  isMuted: boolean;
  startTime: number | null;
}

interface CallContextType {
  callState: CallState;
  initiateCall: (user: User) => Promise<void>;
  acceptCall: () => void;
  rejectCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleVideo: () => Promise<void>;
  isVideoEnabled: boolean;
  isCallActive: boolean;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

export const CallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useUser();
  const { toast } = useToast();
  const [callState, setCallState] = useState<CallState>({
    status: 'idle',
    participant: null,
    duration: 0,
    isMuted: false,
    startTime: null,
  });
  const durationInterval = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const incomingCallerId = useRef<string | null>(null);
  const callStateRef = useRef(callState);
  callStateRef.current = callState;
  const activeCallLogId = useRef<string | null>(null);
  const callStartTime = useRef<string | null>(null);
  
  const playRemoteAudio = useCallback((stream: MediaStream) => {
    console.log('[Call] playRemoteAudio called, tracks:', stream.getTracks().map(t => `${t.kind}:${t.readyState}:enabled=${t.enabled}`));
    
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.srcObject = null;
      audioRef.current.remove();
      audioRef.current = null;
    }
    
    const audio = document.createElement('audio');
    audio.autoplay = true;
    (audio as any).playsInline = true;
    audio.setAttribute('playsinline', 'true');
    audio.style.display = 'none';
    document.body.appendChild(audio);
    audioRef.current = audio;
    
    audio.srcObject = stream;
    audio.volume = 1.0;
    
    const playPromise = audio.play();
    if (playPromise) {
      playPromise.then(() => {
        console.log('[Call] Audio playback started successfully');
      }).catch((err) => {
        console.error('[Call] Audio play failed:', err);
        setTimeout(() => {
          audio.play().then(() => {
            console.log('[Call] Audio retry succeeded');
          }).catch((err2) => {
            console.error('[Call] Audio retry also failed:', err2);
          });
        }, 500);
      });
    }

    stream.onaddtrack = (event) => {
      console.log('[Call] New track added to remote stream:', event.track.kind);
    };
  }, []);

  const stopDurationTimer = useCallback(() => {
    if (durationInterval.current) {
      clearInterval(durationInterval.current);
      durationInterval.current = null;
    }
  }, []);

  const startDurationTimer = useCallback(() => {
    stopDurationTimer();
    const startTime = Date.now();
    setCallState(prev => ({ ...prev, startTime }));
    
    durationInterval.current = setInterval(() => {
      setCallState(prev => ({
        ...prev,
        duration: Math.floor((Date.now() - startTime) / 1000),
      }));
    }, 1000);
  }, [stopDurationTimer]);

  const resetCallState = useCallback(() => {
    stopDurationTimer();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.srcObject = null;
      audioRef.current.remove();
      audioRef.current = null;
    }
    setCallState({
      status: 'idle',
      participant: null,
      duration: 0,
      isMuted: false,
      startTime: null,
    });
    setIsVideoEnabled(false);
    incomingCallerId.current = null;
  }, [stopDurationTimer]);

  useEffect(() => {
    if (!currentUser) return;

    const handlers: CallEventHandler = {
      onIncomingCall: (callerId, callerName, callerAvatar) => {
        incomingCallerId.current = callerId;
        setCallState({
          status: 'incoming',
          participant: { id: callerId, name: callerName, avatar: callerAvatar },
          duration: 0,
          isMuted: false,
          startTime: null,
        });
        toast({
          title: 'Incoming Call',
          description: `${callerName} is calling you`,
        });
        // Also save incoming call notification to database for persistence
        if (currentUser) {
          void NotificationTriggerService.incomingCall(currentUser.id, callerName, callerId)
            .catch(err => console.error('Failed to send incoming call notification:', err));
        }
      },
      onCallAccepted: () => {
        setCallState(prev => ({ ...prev, status: 'connecting' }));
        callStartTime.current = new Date().toISOString();
        toast({
          title: 'Call Accepted',
          description: 'Connecting...',
        });
      },
      onCallRejected: () => {
        const participant = callStateRef.current.participant;
        if (currentUser && participant) {
          void CallLogService.logCall({
            callerId: currentUser.id,
            calleeId: participant.id,
            direction: 'outgoing',
            status: 'rejected',
          });
        }
        toast({
          title: 'Call Declined',
          description: 'The user declined your call',
          variant: 'destructive',
        });
        activeCallLogId.current = null;
        callStartTime.current = null;
        resetCallState();
      },
      onCallEnded: () => {
        const currentDuration = callStateRef.current.duration;
        const participant = callStateRef.current.participant;
        const currentStatus = callStateRef.current.status;
        if (currentUser && participant) {
          const wasConnected = currentDuration > 0 || currentStatus === 'connected';
          const wasIncomingBeforeAnswer = currentStatus === 'incoming';
          const wasOutgoing = currentStatus === 'outgoing';
          
          let logDirection: 'outgoing' | 'incoming' = 'outgoing';
          let logCallerId = currentUser.id;
          let logCalleeId = participant.id;
          let logStatus: 'completed' | 'missed' | 'no_answer' = 'completed';

          if (wasIncomingBeforeAnswer) {
            logDirection = 'incoming';
            logCallerId = participant.id;
            logCalleeId = currentUser.id;
            logStatus = 'missed';
          } else if (wasOutgoing) {
            logStatus = 'no_answer';
          } else if (wasConnected) {
            logStatus = 'completed';
          }

          void CallLogService.logCall({
            callerId: logCallerId,
            calleeId: logCalleeId,
            direction: logDirection,
            status: logStatus,
            duration: currentDuration,
            startedAt: callStartTime.current || undefined,
          });
        }
        toast({
          title: 'Call Ended',
          description: currentDuration > 0 
            ? `Duration: ${Math.floor(currentDuration / 60)}:${(currentDuration % 60).toString().padStart(2, '0')}`
            : 'Call has ended',
        });
        activeCallLogId.current = null;
        callStartTime.current = null;
        resetCallState();
      },
      onCallBusy: () => {
        const participant = callStateRef.current.participant;
        if (currentUser && participant) {
          void CallLogService.logCall({
            callerId: currentUser.id,
            calleeId: participant.id,
            direction: 'outgoing',
            status: 'no_answer',
          });
        }
        toast({
          title: 'User Busy',
          description: 'The user is on another call',
          variant: 'destructive',
        });
        activeCallLogId.current = null;
        callStartTime.current = null;
        resetCallState();
      },
      onRemoteStream: (stream) => {
        playRemoteAudio(stream);
        setCallState(prev => ({ ...prev, status: 'connected' }));
        startDurationTimer();
        const participantName = callStateRef.current.participant?.name || 'participant';
        toast({
          title: 'Connected',
          description: `Now speaking with ${participantName}`,
          variant: 'success',
        });
      },
      onConnectionStateChange: (state) => {
        console.log('[Call] Connection state:', state);
        if (state === 'connected') {
          setCallState(prev => ({ ...prev, status: 'connected' }));
        }
      },
    };

    webRTCService.initialize(
      currentUser.id,
      currentUser.name || currentUser.fullName || 'User',
      currentUser.avatar,
      handlers
    );

    return () => {
      webRTCService.destroy();
      stopDurationTimer();
    };
  }, [currentUser?.id]);

  const initiateCall = useCallback(async (user: User) => {
    if (callState.status !== 'idle') {
      toast({
        title: 'Cannot Start Call',
        description: 'You are already in a call',
        variant: 'destructive',
      });
      return;
    }

    // First check microphone permission before attempting the call
    toast({
      title: 'Preparing Call',
      description: 'Checking microphone access...',
    });

    const micPermission = await requestMicrophonePermission();
    if (!micPermission.granted) {
      toast({
        title: 'Microphone Required',
        description: micPermission.error || 'Please enable microphone access to make calls.',
        variant: 'destructive',
      });
      return;
    }

    setCallState({
      status: 'outgoing',
      participant: { id: user.id, name: user.name || user.fullName || 'User', avatar: user.avatar },
      duration: 0,
      isMuted: false,
      startTime: null,
    });

    const success = await webRTCService.initiateCall(user.id);
    if (!success) {
      toast({
        title: 'Call Failed',
        description: 'Could not connect the call. The other user may be offline or unavailable.',
        variant: 'destructive',
      });
      resetCallState();
    } else {
      toast({
        title: 'Calling...',
        description: `Calling ${user.name || user.fullName}`,
      });
    }
  }, [callState.status, toast, resetCallState]);

  const acceptCall = useCallback(() => {
    if (callState.status !== 'incoming' || !incomingCallerId.current) return;

    setCallState(prev => ({ ...prev, status: 'connecting' }));
    webRTCService.acceptCall(incomingCallerId.current);
  }, [callState.status]);

  const rejectCall = useCallback(() => {
    if (callState.status !== 'incoming' || !incomingCallerId.current) return;

    const callerId = incomingCallerId.current;
    const callerName = callState.participant?.name || 'Unknown';
    
    webRTCService.rejectCall(callerId);
    
    if (currentUser) {
      void CallLogService.logCall({
        callerId: callerId,
        calleeId: currentUser.id,
        direction: 'incoming',
        status: 'rejected',
      });
    }
    
    if (currentUser) {
      NotificationTriggerService.missedCall(
        callerId,
        currentUser.name || currentUser.fullName || 'User',
        currentUser.id
      );
    }
    
    resetCallState();
  }, [callState.status, callState.participant, currentUser, resetCallState]);

  const endCall = useCallback(() => {
    // Send call ended notification to the other participant
    if (callState.participant && currentUser && callState.duration > 0) {
      NotificationTriggerService.callEnded(
        callState.participant.id,
        currentUser.name || currentUser.fullName || 'User',
        callState.duration
      );
    }
    
    webRTCService.endCall();
    resetCallState();
  }, [callState.participant, callState.duration, currentUser, resetCallState]);

  const toggleMute = useCallback(() => {
    const isMuted = webRTCService.toggleMute();
    setCallState(prev => ({ ...prev, isMuted }));
  }, []);

  const [isVideoEnabled, setIsVideoEnabled] = useState(false);

  const toggleVideo = useCallback(async () => {
    const videoOn = await webRTCService.toggleVideo();
    setIsVideoEnabled(videoOn);
  }, []);

  const isCallActive = callState.status !== 'idle' && callState.status !== 'ended';

  return (
    <CallContext.Provider
      value={{
        callState,
        initiateCall,
        acceptCall,
        rejectCall,
        endCall,
        toggleMute,
        toggleVideo,
        isVideoEnabled,
        isCallActive,
      }}
    >
      {children}
    </CallContext.Provider>
  );
};

export const useCall = () => {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error('useCall must be used within a CallProvider');
  }
  return context;
};
