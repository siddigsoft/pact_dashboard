
import { useState, useEffect } from 'react';
import { useSiteVisitContext } from '@/context/siteVisit/SiteVisitContext';
import { useAppContext } from '@/context/AppContext';
import { useNotificationManager } from '@/hooks/use-notification-manager';
import { format, parseISO } from 'date-fns';
import { isVisitDueSoon } from '@/context/siteVisit/utils';

export const useAssignmentTracker = () => {
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const { siteVisits } = useSiteVisitContext();
  const { currentUser } = useAppContext();
  const { sendNotification } = useNotificationManager();
  
  useEffect(() => {
    if (!currentUser) return;
    
    // We don't want to spam notifications, so check once every 12 hours max
    const now = new Date();
    if (lastChecked && (now.getTime() - lastChecked.getTime() < 12 * 60 * 60 * 1000)) {
      return;
    }
    
    // Check for upcoming assignments
    const upcomingVisits = siteVisits.filter(visit => 
      visit.assignedTo === currentUser.id && 
      visit.status === 'assigned' &&
      isVisitDueSoon(visit)
    );
    
    // Send notifications for upcoming assignments
    upcomingVisits.forEach(visit => {
      const visitDate = parseISO(visit.dueDate);
      const formattedDate = format(visitDate, 'MMM dd, yyyy');
      
      sendNotification({
        title: `Upcoming Site Visit Reminder`,
        message: `You have a site visit scheduled at ${visit.siteName} on ${formattedDate}`,
        type: 'info',
        userId: currentUser.id,
        entityId: visit.id,
        entityType: 'siteVisit'
      });
    });
    
    setLastChecked(now);
  }, [currentUser, siteVisits, sendNotification, lastChecked]);
  
  return {
    lastChecked
  };
};
