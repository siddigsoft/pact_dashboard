
import React, { createContext, useContext, useState } from 'react';
import { User, SiteVisit } from '@/types';
import { useCall } from './CallContext';

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
  toggleVideo: () => Promise<void>;
  isVideoEnabled: boolean;
  toggleMute: () => void;
  isMuted: boolean;
}

const CommunicationContext = createContext<CommunicationContextProps | undefined>(undefined);

export const CommunicationProvider: React.FC<{ children: React.ReactNode }> = ({ 
  children 
}) => {
  const callContext = useCall();
  const [isChatPanelOpen, setIsChatPanelOpen] = useState(false);
  const [isNotificationsPanelOpen, setIsNotificationsPanelOpen] = useState(false);
  const [activeAssignment, setActiveAssignment] = useState<SiteVisit | null>(null);

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

  const callState: CallState = {
    status: callContext.callState.status === 'connecting' ? 'connected' : callContext.callState.status,
    recipient: callContext.callState.participant ? {
      id: callContext.callState.participant.id,
      name: callContext.callState.participant.name,
      avatar: callContext.callState.participant.avatar
    } : undefined,
    duration: callContext.callState.duration
  };

  const startCall = async (recipientId: string, recipientName: string, recipientAvatar?: string) => {
    await callContext.initiateCall({
      id: recipientId,
      name: recipientName,
      avatar: recipientAvatar,
      role: '',
      status: 'active'
    } as User);
  };

  const initiateCall = (user: User) => {
    callContext.initiateCall(user);
  };

  const acceptCall = () => {
    callContext.acceptCall();
  };

  const endCall = () => {
    callContext.endCall();
  };

  const rejectCall = () => {
    callContext.rejectCall();
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
        isWebRTCInitialized: callContext.isCallActive || true,
        toggleVideo: callContext.toggleVideo,
        isVideoEnabled: callContext.isVideoEnabled,
        toggleMute: callContext.toggleMute,
        isMuted: callContext.callState.isMuted
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
