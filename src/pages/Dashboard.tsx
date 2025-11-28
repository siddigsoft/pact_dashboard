import { useEffect, useState, useMemo } from 'react';
import { useSiteVisitRemindersUI } from '@/hooks/use-site-visit-reminders-ui';
import { useAppContext } from '@/context/AppContext';
import { useSettings } from '@/context/settings/SettingsContext';
import LocationPermissionPrompt from '@/components/location/LocationPermissionPrompt';
import { DashboardZoneLayout, DashboardZone } from '@/components/dashboard/DashboardZoneLayout';
import { OperationsZone } from '@/components/dashboard/zones/OperationsZone';
import { TeamZone } from '@/components/dashboard/zones/TeamZone';
import { PlanningZone } from '@/components/dashboard/zones/PlanningZone';
import { ComplianceZone } from '@/components/dashboard/zones/ComplianceZone';
import { PerformanceZone } from '@/components/dashboard/zones/PerformanceZone';
import { FOMZone } from '@/components/dashboard/zones/FOMZone';
import { DataCollectorZone } from '@/components/dashboard/zones/DataCollectorZone';
import { FinancialZone } from '@/components/dashboard/zones/FinancialZone';
import { ICTZone } from '@/components/dashboard/zones/ICTZone';
import { DashboardZone as DashboardZoneType } from '@/types/user-preferences';

const normalizeRole = (role: string): string => {
  return role.toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[()]/g, '');
};

const Dashboard = () => {
  const { SiteVisitRemindersDialog, showDueReminders } = useSiteVisitRemindersUI();
  const { roles, currentUser } = useAppContext();
  const { dashboardPreferences, getDefaultZoneForRole } = useSettings();

  const defaultZone = useMemo((): DashboardZone => {
    const isDataCollector = roles?.some(r => normalizeRole(r).includes('datacollector'));
    if (isDataCollector) return 'data-collector';

    if (dashboardPreferences?.defaultZone) {
      const rawPref = dashboardPreferences.defaultZone as unknown as DashboardZoneType;
      const normalizedPref = (rawPref === 'dataCollector' ? 'data-collector' : rawPref) as DashboardZone;
      if (['operations', 'fom', 'data-collector', 'team', 'planning', 'compliance', 'performance', 'financial', 'ict'].includes(normalizedPref)) {
        return normalizedPref;
      }
    }

    const isAdmin = roles?.some(r => normalizeRole(r) === 'admin');
    if (isAdmin) return 'operations';
    
    const isFOM = roles?.some(r => {
      const normalized = normalizeRole(r);
      return normalized.includes('fom') || normalized.includes('fieldoperationmanager');
    });
    if (isFOM) return 'fom';

    const isSupervisor = roles?.some(r => normalizeRole(r).includes('supervisor'));
    if (isSupervisor) return 'team';

    const isCoordinator = roles?.some(r => normalizeRole(r).includes('coordinator'));
    if (isCoordinator) return 'planning';

    const isFinancialAdmin = roles?.some(r => normalizeRole(r).includes('financialadmin'));
    if (isFinancialAdmin) return 'performance';

    const isICT = roles?.some(r => normalizeRole(r) === 'ict');
    if (isICT) return 'operations';
    
    return 'operations';
  }, [roles, dashboardPreferences?.defaultZone]);

  const [activeZone, setActiveZone] = useState<DashboardZone>(defaultZone);
  
  useEffect(() => {
    setActiveZone(defaultZone);
  }, [defaultZone]);

  useEffect(() => {
    showDueReminders();
  }, [showDueReminders]);

  const renderZoneContent = () => {
    switch (activeZone) {
      case 'fom':
        return <FOMZone />;
      case 'data-collector':
        return <DataCollectorZone />;
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
      case 'financial':
        return <FinancialZone />;
      case 'ict':
        return <ICTZone />;
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
