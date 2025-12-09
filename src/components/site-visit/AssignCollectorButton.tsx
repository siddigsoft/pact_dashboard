import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { UserPlus, Bell, Clock } from 'lucide-react';
import { SiteVisit } from '@/types';
import { useSiteVisitContext } from '@/context/siteVisit/SiteVisitContext';
import { useUser } from '@/context/user/UserContext';
import SmartCollectorSelector from './SmartCollectorSelector';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useNotifications } from '@/context/notifications/NotificationContext';
import { NotificationTriggerService } from '@/services/NotificationTriggerService';

interface AssignCollectorButtonProps {
  siteVisit: SiteVisit;
  onSuccess?: () => void;
}

const AssignCollectorButton: React.FC<AssignCollectorButtonProps> = ({ siteVisit, onSuccess }) => {
  const [showSelector, setShowSelector] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [showNotification, setShowNotification] = useState(false);
  const { assignSiteVisit, siteVisits } = useSiteVisitContext();
  const { users, refreshUsers } = useUser();
  const { toast } = useToast();
  const { addNotification } = useNotifications();

  useEffect(() => {
    let timer: number;
    
    if (selectedUserId && countdown > 0) {
      timer = window.setTimeout(() => {
        setCountdown(prev => prev - 1);
      }, 1000);
      
      if (countdown === 1) {
        handleAssignmentTimeout();
      }
    }
    
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [selectedUserId, countdown]);

  const handleOpenSelector = () => {
    // Ensure we have the latest users before showing the selector
    try { refreshUsers(); } catch {}
    setShowSelector(true);
    setSelectedUserId(null);
    setCountdown(0);
    setShowNotification(false);
  };

  const handleCloseSelector = () => {
    setShowSelector(false);
    setSelectedUserId(null);
    setCountdown(0);
    setShowNotification(false);
  };

  const handleSelect = async (userId: string) => {
    setSelectedUserId(userId);

    // Persist immediately to DB
    const success = await assignSiteVisit(siteVisit.id, userId);

    if (success) {
      // Notify the assignee about the assignment (sends email for high priority)
      NotificationTriggerService.siteAssigned(userId, siteVisit.siteName, siteVisit.id);
      
      // Also add to local notification context for immediate UI update
      addNotification({
        userId,
        title: "Assigned to Site Visit",
        message: `You have been assigned to the site visit at ${siteVisit.siteName}.`,
        type: "info",
        link: `/site-visits/${siteVisit.id}`,
        relatedEntityId: siteVisit.id,
        relatedEntityType: "siteVisit",
      });

      // Reset and close selector
      setShowNotification(false);
      setCountdown(0);
      setShowSelector(false);

      if (onSuccess) onSuccess();
    }
  };

  const handleAssignmentTimeout = () => {
    setSelectedUserId(null);
    setCountdown(0);
    setShowNotification(false);
    
    toast({
      title: "Assignment timed out",
      description: "The collector did not accept in time. Please select another collector.",
      variant: "destructive",
    });
  };

  const handleAssign = async () => {
    if (!selectedUserId) return;
    
    const success = await assignSiteVisit(siteVisit.id, selectedUserId);
    
    if (success) {
      const collector = users.find(u => u.id === selectedUserId);
      
      toast({
        title: "Site visit assigned",
        description: `The site visit has been assigned to ${collector?.name || 'the collector'}.`,
      });
      
      setShowNotification(false);
      setSelectedUserId(null);
      setCountdown(0);
      
      if (onSuccess) {
        onSuccess();
      }
      
      // Close the selector after a brief delay to show the success message
      setTimeout(() => {
        setShowSelector(false);
      }, 1500);
    }
  };

  // Simulate acceptance by collector
  const simulateAcceptance = () => {
    handleAssign();
  };

  return (
    <>
      <Button 
        onClick={handleOpenSelector} 
        className="gap-2"
      >
        <UserPlus className="h-4 w-4" />
        Smart Assign
      </Button>

      {showNotification && selectedUserId && (
        <Alert className="mt-4 bg-blue-50 border-blue-200">
          <Bell className="h-4 w-4 text-blue-500" />
          <AlertTitle className="text-blue-700">Assignment in progress</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>
              Waiting for collector to accept...
              <div className="flex items-center mt-1">
                <Clock className="h-4 w-4 text-blue-500 mr-1" />
                <span className="text-blue-700">{countdown}s remaining</span>
              </div>
            </span>
            
            <Button 
              size="sm" 
              variant="outline" 
              className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
              onClick={simulateAcceptance}
            >
              Simulate Acceptance
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <SmartCollectorSelector
        isOpen={showSelector}
        onClose={handleCloseSelector}
        siteVisit={siteVisit}
        users={users}
        allSiteVisits={siteVisits}
        onAssign={handleSelect}
      />
    </>
  );
};

export default AssignCollectorButton;
