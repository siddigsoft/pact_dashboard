import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { User } from '@/types';
import { useNotificationManager } from '@/hooks/use-notification-manager';
import { useUser } from '@/context/user/UserContext';

export type CallStatus = 'idle' | 'outgoing' | 'incoming' | 'active' | 'ended';

interface CallState {
  status: CallStatus;
  recipient: User | null;
  caller: User | null;
  startTime: number | null;
  duration: number;
}

export const useCallManager = () => {
  const [callState, setCallState] = useState<CallState>({
    status: 'idle',
    recipient: null,
    caller: null,
    startTime: null,
    duration: 0,
  });
  const [intervalId, setIntervalId] = useState<number | null>(null);
  const { toast } = useToast();
  const { sendNotification } = useNotificationManager();
  const { currentUser, users } = useUser();

  useEffect(() => {
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [intervalId]);

  useEffect(() => {
    if (callState.status === 'active' && callState.startTime) {
      const id = window.setInterval(() => {
        const now = Date.now();
        const elapsed = Math.floor((now - callState.startTime!) / 1000);
        
        setCallState(prev => ({
          ...prev,
          duration: elapsed
        }));
      }, 1000);
      
      setIntervalId(id);
      
      return () => {
        clearInterval(id);
      };
    }
  }, [callState.status, callState.startTime]);

  const initiateCall = (recipient: User) => {
    if (callState.status !== 'idle') {
      toast({
        title: "Cannot start call",
        description: "You are already in a call. Please end it first.",
        variant: "destructive",
      });
      return;
    }
    
    setCallState({
      status: 'outgoing',
      recipient,
      caller: null,
      startTime: null,
      duration: 0,
    });
    
    setTimeout(() => {
      if (Math.random() > 0.2) {
        toast({
          title: "Call connected",
          description: `Connected with ${recipient.name}`,
        });
        
        setCallState(prev => ({
          ...prev,
          status: 'active',
          startTime: Date.now(),
        }));
      } else {
        toast({
          title: "Call failed",
          description: `${recipient.name} is not available right now`,
          variant: "destructive",
        });
        
        setCallState({
          status: 'ended',
          recipient: null,
          caller: null,
          startTime: null,
          duration: 0,
        });
      }
    }, 2000);
  };

  const receiveCall = (caller: User) => {
    if (callState.status !== 'idle') {
      return false;
    }
    
    setCallState({
      status: 'incoming',
      recipient: null,
      caller,
      startTime: null,
      duration: 0,
    });
    
    if (currentUser) {
      sendNotification({
        title: "Incoming Call",
        message: `${caller.name} is calling you`,
        type: 'info',
        userId: currentUser.id,
      });
    }
    
    return true;
  };

  const acceptCall = () => {
    if (callState.status !== 'incoming' || !callState.caller) {
      return;
    }
    
    toast({
      title: "Call accepted",
      description: `Connected with ${callState.caller.name}`,
    });
    
    setCallState(prev => ({
      ...prev,
      status: 'active',
      startTime: Date.now(),
    }));
  };

  const endCall = () => {
    if (callState.status === 'idle') return;
    
    const otherParty = callState.recipient || callState.caller;
    
    toast({
      title: "Call ended",
      description: otherParty ? `Call with ${otherParty.name} has ended` : "Call has ended",
    });
    
    if (currentUser && otherParty && callState.status === 'active') {
      console.log("Call logged:", {
        from: currentUser.name,
        to: otherParty.name,
        duration: callState.duration,
        timestamp: new Date().toISOString(),
      });
    }
    
    setCallState({
      status: 'ended',
      recipient: callState.recipient,
      caller: callState.caller,
      startTime: null,
      duration: callState.duration,
    });
    
    setTimeout(() => {
      setCallState({
        status: 'idle',
        recipient: null,
        caller: null,
        startTime: null,
        duration: 0,
      });
    }, 3000);
    
    if (intervalId) {
      clearInterval(intervalId);
      setIntervalId(null);
    }
  };

  const rejectCall = () => {
    if (callState.status !== 'incoming') return;
    
    const caller = callState.caller;
    
    toast({
      title: "Call rejected",
      description: caller ? `Declined call from ${caller.name}` : "Call declined",
    });
    
    setCallState({
      status: 'ended',
      recipient: null,
      caller: callState.caller,
      startTime: null,
      duration: 0,
    });
    
    setTimeout(() => {
      setCallState({
        status: 'idle',
        recipient: null,
        caller: null,
        startTime: null,
        duration: 0,
      });
    }, 3000);
  };

  const simulateIncomingCall = (delay: number = 5000) => {
    setTimeout(() => {
      if (callState.status === 'idle' && users.length > 0 && currentUser) {
        const availableUsers = users.filter(user => user.id !== currentUser.id);
        if (availableUsers.length) {
          const randomUser = availableUsers[Math.floor(Math.random() * availableUsers.length)];
          receiveCall(randomUser);
        }
      }
    }, delay);
  };

  return {
    callState,
    initiateCall,
    receiveCall,
    acceptCall,
    endCall,
    rejectCall,
    simulateIncomingCall
  };
};
