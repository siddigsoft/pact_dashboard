
import React, { createContext, useContext, useState } from 'react';
import { User, SiteVisit } from '@/types';

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
}

const CommunicationContext = createContext<CommunicationContextProps | undefined>(undefined);

export const CommunicationProvider: React.FC<{ children: React.ReactNode }> = ({ 
  children 
}) => {
  const [isChatPanelOpen, setIsChatPanelOpen] = useState(false);
  const [isNotificationsPanelOpen, setIsNotificationsPanelOpen] = useState(false);
  const [callState, setCallState] = useState<CallState>({
    status: 'idle',
    duration: 0
  });
  const [activeAssignment, setActiveAssignment] = useState<SiteVisit | null>(null);
  
  // We'll use chat and notification functions safely with optional chaining
  let chatContext;
  let notificationContext;
  
  try {
    // These will be defined when used in the correct hierarchy
    // Don't import or use here to avoid circular dependencies
    console.log('Chat or notification context will be accessed when needed');
  } catch (error) {
    // Will be defined when used in the correct hierarchy
    console.log('Chat or notification context not available yet');
  }

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

  const startCall = (recipientId: string, recipientName: string, recipientAvatar?: string) => {
    setCallState({
      status: 'outgoing' as CallStatus,
      recipient: {
        id: recipientId,
        name: recipientName,
        avatar: recipientAvatar
      },
      duration: 0
    });
  };

  const initiateCall = (user: User) => {
    startCall(user.id, user.name, user.avatar);
  };

  const acceptCall = () => {
    setCallState(prev => ({
      ...prev,
      status: 'connected' as CallStatus
    }));
  };

  const endCall = () => {
    setCallState({
      status: 'idle',
      duration: 0
    });
  };

  const rejectCall = () => {
    setCallState({
      status: 'idle',
      duration: 0
    });
  };
  
  const openChatForEntity = (entityId: string, entityType: 'siteVisit' | 'mmpFile' | 'transaction' | 'chat') => {
    console.log(`Opening chat for ${entityType} with ID ${entityId}`);
    // Implementation will be added when proper chat context is available
  };
  
  const createChatForSiteVisit = (siteVisitId: string) => {
    console.log(`Creating chat for site visit with ID ${siteVisitId}`);
    // Implementation will be added when proper chat context is available
  };

  const handleAcceptAssignment = async (): Promise<void> => {
    console.log('Accepting assignment:', activeAssignment?.id);
    // Implementation will be added
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
        handleDeclineAssignment
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
