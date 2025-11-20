import { useMemo, useState, useEffect, useRef } from "react";
import { useAppContext } from "@/context/AppContext";
import { SiteVisit } from "@/types";
import { useToast } from "./toast";
import { addDays, format, isPast, isWithinInterval, parseISO, isValid } from "date-fns";
import { useNotificationManager } from "./use-notification-manager";

export const useSiteVisitReminders = () => {
  const { siteVisits, currentUser } = useAppContext();
  const { toast } = useToast();
  const { sendNotification } = useNotificationManager();
  const [showRemindersModal, setShowRemindersModal] = useState(false);
  const remindersShown = useRef(false);
  const dueSoonNotificationsShown = useRef<Set<string>>(new Set());
  
  const toValidDate = (value: any): Date | null => {
    if (!value) return null;
    if (value instanceof Date) return isValid(value) ? value : null;
    if (typeof value === 'string') {
      try {
        const d = parseISO(value);
        if (isValid(d)) return d;
      } catch {}
      const d2 = new Date(value);
      return isValid(d2) ? d2 : null;
    }
    const d3 = new Date(value);
    return isValid(d3) ? d3 : null;
  };
  
  const userSiteVisits = useMemo(() => {
    if (!currentUser || !siteVisits) return [];
    
    // Get site visits assigned to the current user
    return siteVisits.filter(visit => 
      visit.assignedTo === currentUser.id && 
      ["assigned", "permitVerified", "inProgress"].includes(visit.status)
    );
  }, [siteVisits, currentUser]);

  const dueSoonVisits = useMemo(() => {
    if (!userSiteVisits.length) return [];
    
    const now = new Date();
    const threeDaysLater = addDays(now, 3);
    
    return userSiteVisits.filter(visit => {
      const dueDate = toValidDate((visit as any).dueDate);
      if (!dueDate) return false;
      return isWithinInterval(dueDate, { start: now, end: threeDaysLater });
    });
  }, [userSiteVisits]);
  
  const overdueVisits = useMemo(() => {
    if (!userSiteVisits.length) return [];
    
    const now = new Date();
    
    return userSiteVisits.filter(visit => {
      const dueDate = toValidDate((visit as any).dueDate);
      if (!dueDate) return false;
      return isPast(dueDate);
    });
  }, [userSiteVisits]);
  
  // Check daily for upcoming visit reminders
  useEffect(() => {
    if (!currentUser) return;
    
    const checkDailyReminders = () => {
      const now = new Date();
      // Check at 8 AM
      if (now.getHours() === 8 && now.getMinutes() === 0) {
        showDueReminders();
      }
    };
    
    const intervalId = setInterval(checkDailyReminders, 60000); // Check every minute
    
    return () => clearInterval(intervalId);
  }, [currentUser, dueSoonVisits, overdueVisits]);
  
  // Send reminders for scheduled site visits (3 days before)
  useEffect(() => {
    if (!currentUser || !dueSoonVisits.length) return;
    
    dueSoonVisits.forEach(visit => {
      // Skip if notification for this visit was already shown
      if (dueSoonNotificationsShown.current.has(visit.id)) return;
      
      const dueDate = toValidDate((visit as any).dueDate);
      if (!dueDate) return;
      const daysUntilDue = Math.ceil((dueDate.getTime() - new Date().getTime()) / (1000 * 3600 * 24));
      
      if (daysUntilDue === 3) {
        sendNotification({
          title: `Site Visit in 3 Days`,
          message: `You have a scheduled site visit at ${visit.siteName} on ${format(dueDate, 'MMM dd')}`,
          type: "info",
          userId: currentUser.id,
          entityId: visit.id,
          entityType: "siteVisit",
          showToast: true
        });
        
        // Mark this visit as notified
        dueSoonNotificationsShown.current.add(visit.id);
      }
    });
  }, [dueSoonVisits, currentUser, sendNotification]);
  
  const showDueReminders = () => {
    // Skip if no reminders to show or user not logged in or reminders already shown
    if ((!dueSoonVisits.length && !overdueVisits.length) || !currentUser || remindersShown.current) {
      return;
    }
    
    // Set flag to prevent showing reminders again in this session
    remindersShown.current = true;
    
    // Show reminder modal if there are due or overdue visits
    if (dueSoonVisits.length > 0 || overdueVisits.length > 0) {
      setShowRemindersModal(true);
    }
    
    // Show notifications for upcoming site visits (due within 3 days)
    if (dueSoonVisits.length > 0) {
      toast({
        title: `${dueSoonVisits.length} site visit${dueSoonVisits.length > 1 ? 's' : ''} due soon`,
        description: `You have site visits that are due within the next 3 days`,
        variant: "warning",
        duration: 5000,
      });
    }
    
    // Show notifications for overdue site visits
    if (overdueVisits.length > 0) {
      toast({
        title: `${overdueVisits.length} overdue site visit${overdueVisits.length > 1 ? 's' : ''}`,
        description: `You have site visits that are past their due date`,
        variant: "destructive",
        duration: 5000,
      });
    }
  };

  return { 
    showDueReminders, 
    dueSoonVisits, 
    overdueVisits, 
    showRemindersModal, 
    setShowRemindersModal
  };
};
