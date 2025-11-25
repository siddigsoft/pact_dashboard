import React, { useEffect, useState, useMemo } from 'react';
import { useSiteVisitRemindersUI } from '@/hooks/use-site-visit-reminders-ui';
import { useAppContext } from '@/context/AppContext';
import LocationPermissionPrompt from '@/components/location/LocationPermissionPrompt';
import { DashboardZoneLayout, DashboardZone } from '@/components/dashboard/DashboardZoneLayout';
import { OperationsZone } from '@/components/dashboard/zones/OperationsZone';
import { TeamZone } from '@/components/dashboard/zones/TeamZone';
import { PlanningZone } from '@/components/dashboard/zones/PlanningZone';
import { ComplianceZone } from '@/components/dashboard/zones/ComplianceZone';
import { PerformanceZone } from '@/components/dashboard/zones/PerformanceZone';

// Helper to normalize roles for matching
const normalizeRole = (role: string): string => {
  return role.toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[()]/g, '');
};

const Dashboard = () => {
  const { SiteVisitRemindersDialog, showDueReminders } = useSiteVisitRemindersUI();
  const { roles } = useAppContext();

  // Determine default zone based on user role
  const defaultZone = useMemo((): DashboardZone => {
    // All users default to Operations zone as the primary command center
    return 'operations';
  }, [roles]);

  const [activeZone, setActiveZone] = useState<DashboardZone>(defaultZone);

  useEffect(() => {
    showDueReminders();
  }, [showDueReminders]);

  const renderZoneContent = () => {
    switch (activeZone) {
      case 'operations':
        return <OperationsZone />;
      case 'team':
        return <TeamZone />;
      case 'planning':
        return <PlanningZone />;
      case 'compliance':
        return <ComplianceZone />;
      case 'performance':
        return <PerformanceZone />;
      default:
        return <OperationsZone />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Zone-based Layout with Sticky Header */}
      <DashboardZoneLayout 
        activeZone={activeZone} 
        onZoneChange={setActiveZone}
      >
        {renderZoneContent()}
      </DashboardZoneLayout>

      {/* Floating components */}
      {SiteVisitRemindersDialog}
      <LocationPermissionPrompt />
    </div>
  );
};

export default Dashboard;
