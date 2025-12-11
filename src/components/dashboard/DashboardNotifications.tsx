
import React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import EnhancedAssignmentNotification from '@/components/site-visit/EnhancedAssignmentNotification';
import CallInterface from '@/components/communication/CallInterface';
import SiteVisitReminders from '@/components/SiteVisitReminders';
import { SiteVisit } from '@/types';
import { User } from '@/types';

interface DashboardNotificationsProps {
  currentAssignment: SiteVisit | null;
  currentUser: User;
  isCallActive: boolean;
  callState: any;
  showRemindersModal: boolean;
  dueSoonVisits: SiteVisit[];
  overdueVisits: SiteVisit[];
  onAcceptAssignment: () => void;
  onDeclineAssignment: () => void;
  onCloseReminders: () => void;
  acceptCall: () => void;
  rejectCall: () => void;
  endCall: () => void;
}

export const DashboardNotifications: React.FC<DashboardNotificationsProps> = ({
  currentAssignment,
  currentUser,
  isCallActive,
  callState,
  showRemindersModal,
  dueSoonVisits,
  overdueVisits,
  onAcceptAssignment,
  onDeclineAssignment,
  onCloseReminders,
  acceptCall,
  rejectCall,
  endCall,
}) => {
  return (
    <>
      {currentAssignment && (
        <EnhancedAssignmentNotification
          siteVisit={currentAssignment}
          user={currentUser}
          timeout={300}
          onAccept={onAcceptAssignment}
          onDecline={onDeclineAssignment}
          onTimeout={onDeclineAssignment}
        />
      )}

      {isCallActive && (callState.recipient || callState.caller) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <CallInterface
            recipient={callState.recipient || callState.caller!}
            callType={callState.status}
            duration={callState.duration}
            onAccept={acceptCall}
            onDecline={rejectCall}
            onEnd={endCall}
          />
        </div>
      )}

      <Dialog open={showRemindersModal} onOpenChange={onCloseReminders}>
        <DialogContent className="max-w-md p-0">
          <SiteVisitReminders
            dueSoon={dueSoonVisits}
            overdue={overdueVisits}
            onClose={onCloseReminders}
          />
        </DialogContent>
      </Dialog>
    </>
  );
};
