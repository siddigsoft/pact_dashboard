import React, { useEffect, useState, useMemo } from 'react';
import { useSiteVisitRemindersUI } from '@/hooks/use-site-visit-reminders-ui';
import { useAppContext } from '@/context/AppContext';
import FloatingMessenger from '@/components/communication/FloatingMessenger';
import LocationPermissionPrompt from '@/components/location/LocationPermissionPrompt';
import { DashboardCommandBar } from '@/components/dashboard/DashboardCommandBar';
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
    if (!roles || roles.length === 0) return 'operations';

    const normalizedRoles = roles.map(normalizeRole);

    // Admin sees performance/analytics by default
    if (normalizedRoles.includes('admin')) return 'performance';
    
    // Finance sees performance (cost tracking)
    if (normalizedRoles.includes('financialadmin')) return 'performance';
    
    // ICT sees compliance/fraud detection
    if (normalizedRoles.includes('ict')) return 'compliance';
    
    // Field managers see operations (match both "fom" and "fieldoperationmanagerfom")
    if (normalizedRoles.some(r => r.includes('fom') || r === 'supervisor')) return 'operations';
    
    // Coordinators see team coordination
    if (normalizedRoles.includes('coordinator')) return 'team';
    
    // Reviewers see compliance
    if (normalizedRoles.includes('reviewer')) return 'compliance';

    // Default to operations for everyone else
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
      {/* Command Bar - Always Visible */}
      <DashboardCommandBar />

      {/* Zone-based Layout */}
      <DashboardZoneLayout 
        activeZone={activeZone} 
        onZoneChange={setActiveZone}
      >
        {renderZoneContent()}
      </DashboardZoneLayout>

      {/* Floating components */}
      {SiteVisitRemindersDialog}
      <LocationPermissionPrompt />
      <FloatingMessenger />
    </div>
  );
};

export default Dashboard;
