
import React from 'react';
import { useNotifications } from '@/context/notifications/NotificationContext';
import { useCommunication } from '@/context/communications/CommunicationContext';
import AssignmentAlertPopup from '@/components/communication/AssignmentAlertPopup';
import { useToast } from '@/hooks/toast';
import { useNavigate } from 'react-router-dom';

const PersistentCommunication = () => {
  const { activeAssignment, handleAcceptAssignment, handleDeclineAssignment, openChatForEntity } = useCommunication();
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleAccept = async () => {
    try {
      await handleAcceptAssignment();
      toast({
        title: "Assignment Accepted",
        description: "You'll be redirected to the site visit details.",
        variant: "success",
      });
      if (activeAssignment) {
        navigate(`/site-visits/${activeAssignment.id}`);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to accept assignment",
        variant: "destructive",
      });
    }
  };

  const handleOpenChat = () => {
    if (activeAssignment) {
      openChatForEntity(activeAssignment.id, 'siteVisit');
      navigate('/chat');
    }
  };

  const handleCall = () => {
    navigate('/calls');
  };

  if (!activeAssignment) return null;

  return (
    <AssignmentAlertPopup 
      siteVisit={activeAssignment}
      onAccept={handleAccept}
      onDecline={handleDeclineAssignment}
      onOpenChat={handleOpenChat}
      onCall={handleCall}
      timeLimit={300}
    />
  );
};

export default PersistentCommunication;
