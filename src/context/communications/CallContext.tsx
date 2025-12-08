import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { User } from '@/types';
import { useUser } from '@/context/user/UserContext';
import { useToast } from '@/hooks/use-toast';
import webRTCService, { CallEventHandler } from '@/services/WebRTCService';

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

  const playRemoteAudio = useCallback((stream: MediaStream) => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    audioRef.current.srcObject = stream;
    audioRef.current.play().catch(console.error);
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
    setCallState({
      status: 'idle',
      participant: null,
      duration: 0,
      isMuted: false,
      startTime: null,
    });
    setIsVideoEnabled(false);
    incomingCallerId.current = null;
    if (audioRef.current) {
      audioRef.current.srcObject = null;
    }
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
      },
      onCallAccepted: () => {
        setCallState(prev => ({ ...prev, status: 'connecting' }));
        toast({
          title: 'Call Accepted',
          description: 'Connecting...',
        });
      },
      onCallRejected: () => {
        toast({
          title: 'Call Declined',
          description: 'The user declined your call',
          variant: 'destructive',
        });
        resetCallState();
      },
      onCallEnded: () => {
        toast({
          title: 'Call Ended',
          description: callState.duration > 0 
            ? `Duration: ${Math.floor(callState.duration / 60)}:${(callState.duration % 60).toString().padStart(2, '0')}`
            : 'Call has ended',
        });
        resetCallState();
      },
      onCallBusy: () => {
        toast({
          title: 'User Busy',
          description: 'The user is on another call',
          variant: 'destructive',
        });
        resetCallState();
      },
      onRemoteStream: (stream) => {
        playRemoteAudio(stream);
        setCallState(prev => ({ ...prev, status: 'connected' }));
        startDurationTimer();
        toast({
          title: 'Connected',
          description: `Now speaking with ${callState.participant?.name}`,
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
        description: 'Could not start the call. Please check your microphone permissions.',
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

    webRTCService.rejectCall(incomingCallerId.current);
    resetCallState();
  }, [callState.status, resetCallState]);

  const endCall = useCallback(() => {
    webRTCService.endCall();
    resetCallState();
  }, [resetCallState]);

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
