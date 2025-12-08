
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, SiteVisit } from '@/types';
import { useAppContext } from '@/context/AppContext';
import webRTCService, { CallEventHandler } from '@/services/WebRTCService';

export type CallType = 'incoming' | 'outgoing' | 'connected';
export type CallStatus = 'idle' | 'incoming' | 'outgoing' | 'connected' | 'ended';

export interface CallRecipient {
  id: string;
  name: string;
  avatar?: string;
}

interface CallState {
  status: CallStatus;
  recipient?: CallRecipient;
  duration: number;
  caller?: User;
  callId?: string;
  remoteStream?: MediaStream;
  localStream?: MediaStream;
}

interface CommunicationContextProps {
  toggleChatPanel: () => void;
  toggleNotificationsPanel: () => void;
  isChatPanelOpen: boolean;
  isNotificationsPanelOpen: boolean;
  closePanels: () => void;
  callState: CallState;
  startCall: (recipientId: string, recipientName: string, recipientAvatar?: string) => void;
  acceptCall: () => void;
  endCall: () => void;
  rejectCall: () => void;
  initiateCall: (user: User) => void;
  openChatForEntity: (entityId: string, entityType: 'siteVisit' | 'mmpFile' | 'transaction' | 'chat') => void;
  createChatForSiteVisit: (siteVisitId: string) => void;
  activeAssignment: SiteVisit | null;
  handleAcceptAssignment: () => Promise<void>;
  handleDeclineAssignment: () => void;
  isWebRTCInitialized: boolean;
}

const CommunicationContext = createContext<CommunicationContextProps | undefined>(undefined);

export const CommunicationProvider: React.FC<{ children: React.ReactNode }> = ({ 
  children 
}) => {
  const { currentUser } = useAppContext();
  const [isChatPanelOpen, setIsChatPanelOpen] = useState(false);
  const [isNotificationsPanelOpen, setIsNotificationsPanelOpen] = useState(false);
  const [callState, setCallState] = useState<CallState>({
    status: 'idle',
    duration: 0
  });
  const [activeAssignment, setActiveAssignment] = useState<SiteVisit | null>(null);
  const [isWebRTCInitialized, setIsWebRTCInitialized] = useState(false);
  const [incomingCallerId, setIncomingCallerId] = useState<string | null>(null);

  const handleIncomingCall = useCallback((callerId: string, callerName: string, callerAvatar?: string, callId?: string) => {
    console.log('[Communication] Incoming call from:', callerName, 'callId:', callId);
    setIncomingCallerId(callerId);
    setCallState({
      status: 'incoming',
      recipient: {
        id: callerId,
        name: callerName,
        avatar: callerAvatar
      },
      duration: 0,
      callId
    });
  }, []);

  const handleCallAccepted = useCallback(() => {
    console.log('[Communication] Call accepted');
    setCallState(prev => ({
      ...prev,
      status: 'connected'
    }));
  }, []);

  const handleCallRejected = useCallback(() => {
    console.log('[Communication] Call rejected');
    setCallState({
      status: 'idle',
      duration: 0
    });
    setIncomingCallerId(null);
  }, []);

  const handleCallEnded = useCallback(() => {
    console.log('[Communication] Call ended');
    setCallState({
      status: 'idle',
      duration: 0
    });
    setIncomingCallerId(null);
  }, []);

  const handleCallBusy = useCallback(() => {
    console.log('[Communication] User is busy');
    setCallState({
      status: 'idle',
      duration: 0
    });
  }, []);

  const handleRemoteStream = useCallback((stream: MediaStream) => {
    console.log('[Communication] Remote stream received');
    setCallState(prev => ({
      ...prev,
      remoteStream: stream
    }));
    
    const audio = new Audio();
    audio.srcObject = stream;
    audio.autoplay = true;
    audio.play().catch(e => console.error('[Communication] Error playing audio:', e));
  }, []);

  const handleConnectionStateChange = useCallback((state: RTCPeerConnectionState) => {
    console.log('[Communication] Connection state:', state);
    if (state === 'connected') {
      setCallState(prev => ({
        ...prev,
        status: 'connected'
      }));
    } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
      setCallState({
        status: 'idle',
        duration: 0
      });
      setIncomingCallerId(null);
    }
  }, []);

  useEffect(() => {
    if (!currentUser?.id) return;

    const eventHandlers: CallEventHandler = {
      onIncomingCall: handleIncomingCall,
      onCallAccepted: handleCallAccepted,
      onCallRejected: handleCallRejected,
      onCallEnded: handleCallEnded,
      onCallBusy: handleCallBusy,
      onRemoteStream: handleRemoteStream,
      onConnectionStateChange: handleConnectionStateChange
    };

    const userName = currentUser.name || currentUser.fullName || currentUser.email || 'User';
    
    webRTCService.initialize(
      currentUser.id,
      userName,
      currentUser.avatar,
      eventHandlers
    ).then(() => {
      console.log('[Communication] WebRTC service initialized for user:', currentUser.id);
      setIsWebRTCInitialized(true);
    }).catch(error => {
      console.error('[Communication] Failed to initialize WebRTC:', error);
    });

    return () => {
      webRTCService.destroy();
      setIsWebRTCInitialized(false);
    };
  }, [currentUser?.id, currentUser?.name, currentUser?.fullName, currentUser?.email, currentUser?.avatar,
      handleIncomingCall, handleCallAccepted, handleCallRejected, handleCallEnded, 
      handleCallBusy, handleRemoteStream, handleConnectionStateChange]);

  const toggleChatPanel = () => {
    setIsChatPanelOpen(prev => !prev);
    if (!isChatPanelOpen) {
      setIsNotificationsPanelOpen(false);
    }
  };

  const toggleNotificationsPanel = () => {
    setIsNotificationsPanelOpen(prev => !prev);
    if (!isNotificationsPanelOpen) {
      setIsChatPanelOpen(false);
    }
  };

  const closePanels = () => {
    setIsChatPanelOpen(false);
    setIsNotificationsPanelOpen(false);
  };

  const startCall = async (recipientId: string, recipientName: string, recipientAvatar?: string) => {
    if (!isWebRTCInitialized) {
      console.error('[Communication] WebRTC not initialized');
      return;
    }

    setCallState({
      status: 'outgoing',
      recipient: {
        id: recipientId,
        name: recipientName,
        avatar: recipientAvatar
      },
      duration: 0
    });

    const success = await webRTCService.initiateCall(recipientId);
    if (!success) {
      console.error('[Communication] Failed to initiate call');
      setCallState({
        status: 'idle',
        duration: 0
      });
    }
  };

  const initiateCall = (user: User) => {
    const userName = user.fullName || user.name || user.username || user.email || 'Unknown';
    startCall(user.id, userName, user.avatar);
  };

  const acceptCall = async () => {
    if (!incomingCallerId) {
      console.error('[Communication] No incoming call to accept');
      return;
    }

    await webRTCService.acceptCall(incomingCallerId);
    setCallState(prev => ({
      ...prev,
      status: 'connected'
    }));
  };

  const endCall = async () => {
    await webRTCService.endCall();
    setCallState({
      status: 'idle',
      duration: 0
    });
    setIncomingCallerId(null);
  };

  const rejectCall = async () => {
    if (incomingCallerId) {
      await webRTCService.rejectCall(incomingCallerId);
    }
    setCallState({
      status: 'idle',
      duration: 0
    });
    setIncomingCallerId(null);
  };
  
  const openChatForEntity = (entityId: string, entityType: 'siteVisit' | 'mmpFile' | 'transaction' | 'chat') => {
    console.log(`Opening chat for ${entityType} with ID ${entityId}`);
  };
  
  const createChatForSiteVisit = (siteVisitId: string) => {
    console.log(`Creating chat for site visit with ID ${siteVisitId}`);
  };

  const handleAcceptAssignment = async (): Promise<void> => {
    console.log('Accepting assignment:', activeAssignment?.id);
    return Promise.resolve();
  };

  const handleDeclineAssignment = () => {
    console.log('Declining assignment:', activeAssignment?.id);
    setActiveAssignment(null);
  };

  return (
    <CommunicationContext.Provider
      value={{
        toggleChatPanel,
        toggleNotificationsPanel,
        isChatPanelOpen,
        isNotificationsPanelOpen,
        closePanels,
        callState,
        startCall,
        acceptCall,
        endCall,
        rejectCall,
        initiateCall,
        openChatForEntity,
        createChatForSiteVisit,
        activeAssignment,
        handleAcceptAssignment,
        handleDeclineAssignment,
        isWebRTCInitialized
      }}
    >
      {children}
    </CommunicationContext.Provider>
  );
};

export const useCommunication = () => {
  const context = useContext(CommunicationContext);
  if (context === undefined) {
    throw new Error('useCommunication must be used within a CommunicationProvider');
  }
  return context;
};
