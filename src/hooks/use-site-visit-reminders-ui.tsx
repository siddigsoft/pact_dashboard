
import React from 'react';
import { useSiteVisitReminders } from './use-site-visit-reminders';
import SiteVisitReminders from '@/components/SiteVisitReminders';

export const useSiteVisitRemindersUI = () => {
  const { 
    showDueReminders, 
    dueSoonVisits, 
    overdueVisits, 
    showRemindersModal, 
    setShowRemindersModal 
  } = useSiteVisitReminders();
  
  const SiteVisitRemindersDialog = showRemindersModal ? (
    <SiteVisitReminders 
      dueSoon={dueSoonVisits}
      overdue={overdueVisits}
      onClose={() => setShowRemindersModal(false)}
    />
  ) : null;
  
  return {
    SiteVisitRemindersDialog,
    showDueReminders,
    dueSoonVisits,
    overdueVisits,
    showRemindersModal,
    setShowRemindersModal
  };
};
