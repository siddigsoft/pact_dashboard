import React, { useEffect } from 'react';
import { useSiteVisitRemindersUI } from '@/hooks/use-site-visit-reminders-ui';
import FloatingMessenger from '@/components/communication/FloatingMessenger';
import LocationPermissionPrompt from '@/components/location/LocationPermissionPrompt';
import { ExecutiveCommandStrip } from '@/components/dashboard/ExecutiveCommandStrip';
import { DashboardWidgetGrid } from '@/components/dashboard/DashboardWidgetGrid';

const Dashboard = () => {
  const { SiteVisitRemindersDialog, showDueReminders } = useSiteVisitRemindersUI();

  useEffect(() => {
    showDueReminders();
  }, [showDueReminders]);

  return (
    <div className="min-h-screen bg-background">
      {/* Executive Command Strip - Always Visible */}
      <ExecutiveCommandStrip />

      {/* Widget Grid - Collapsible Sections */}
      <DashboardWidgetGrid />

      {/* Floating components */}
      {SiteVisitRemindersDialog}
      <LocationPermissionPrompt />
      <FloatingMessenger />
    </div>
  );
};

export default Dashboard;
