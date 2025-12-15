import { useEffect, useState, useMemo, lazy, Suspense } from 'react';
import { useSiteVisitRemindersUI } from '@/hooks/use-site-visit-reminders-ui';
import { useAppContext } from '@/context/AppContext';
import { useSettings } from '@/context/settings/SettingsContext';
import LocationPermissionPrompt from '@/components/location/LocationPermissionPrompt';
import { DataFreshnessBadge } from '@/components/realtime';
import { DashboardZoneLayout, DashboardZone } from '@/components/dashboard/DashboardZoneLayout';
import { DashboardZone as DashboardZoneType } from '@/types/user-preferences';
import { Loader2 } from 'lucide-react';

const OperationsZone = lazy(() => import('@/components/dashboard/zones/OperationsZone').then(m => ({ default: m.OperationsZone })));
const TeamZone = lazy(() => import('@/components/dashboard/zones/TeamZone').then(m => ({ default: m.TeamZone })));
const PlanningZone = lazy(() => import('@/components/dashboard/zones/PlanningZone').then(m => ({ default: m.PlanningZone })));
const ComplianceZone = lazy(() => import('@/components/dashboard/zones/ComplianceZone').then(m => ({ default: m.ComplianceZone })));
const PerformanceZone = lazy(() => import('@/components/dashboard/zones/PerformanceZone').then(m => ({ default: m.PerformanceZone })));
const FOMZone = lazy(() => import('@/components/dashboard/zones/FOMZone').then(m => ({ default: m.FOMZone })));
const DataCollectorZone = lazy(() => import('@/components/dashboard/zones/DataCollectorZone').then(m => ({ default: m.DataCollectorZone })));
const FinancialZone = lazy(() => import('@/components/dashboard/zones/FinancialZone').then(m => ({ default: m.FinancialZone })));
const ICTZone = lazy(() => import('@/components/dashboard/zones/ICTZone').then(m => ({ default: m.ICTZone })));
const ProjectManagerZone = lazy(() => import('@/components/dashboard/zones/ProjectManagerZone').then(m => ({ default: m.ProjectManagerZone })));

const ZoneLoadingFallback = () => (
  <div className="flex items-center justify-center min-h-[400px]">
    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
  </div>
);

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
    const normalizedCurrentRole = currentUser?.role ? normalizeRole(currentUser.role) : undefined;
    const isDataCollector = (roles?.some(r => normalizeRole(r).includes('datacollector')))
      || (!!normalizedCurrentRole && normalizedCurrentRole.includes('datacollector'));
    if (isDataCollector) return 'data-collector';

    const isFOM = (roles?.some(r => {
      const normalized = normalizeRole(r);
      return normalized.includes('fom') || normalized.includes('fieldoperationmanager');
    })) || (!!normalizedCurrentRole && (normalizedCurrentRole.includes('fom') || normalizedCurrentRole.includes('fieldoperationmanager')));
    if (isFOM) return 'fom';

    if (dashboardPreferences?.defaultZone) {
      const rawPref = dashboardPreferences.defaultZone as unknown as DashboardZoneType;
      const normalizedPref = (rawPref === 'dataCollector' ? 'data-collector' : rawPref === 'projectManager' ? 'project-manager' : rawPref) as DashboardZone;
      if (['operations', 'fom', 'data-collector', 'team', 'planning', 'compliance', 'performance', 'financial', 'ict', 'project-manager'].includes(normalizedPref)) {
        return normalizedPref;
      }
    }

    const isAdmin = roles?.some(r => normalizeRole(r) === 'admin');
    if (isAdmin) return 'operations';

    const isSupervisor = roles?.some(r => normalizeRole(r).includes('supervisor'));
    if (isSupervisor) return 'team';

    const isCoordinator = roles?.some(r => normalizeRole(r).includes('coordinator'));
    if (isCoordinator) return 'planning';

    const isFinancialAdmin = roles?.some(r => normalizeRole(r).includes('financialadmin'));
    if (isFinancialAdmin) return 'performance';

    const isProjectManager = roles?.some(r => normalizeRole(r).includes('projectmanager'));
    if (isProjectManager) return 'project-manager';

    const isICT = roles?.some(r => normalizeRole(r) === 'ict');
    if (isICT) return 'operations';
    
    return 'operations';
  }, [roles, dashboardPreferences?.defaultZone, currentUser?.role]);

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
      case 'project-manager':
        return <ProjectManagerZone />;
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
        <Suspense fallback={<ZoneLoadingFallback />}>
          {renderZoneContent()}
        </Suspense>
      </DashboardZoneLayout>

      {/* Floating components */}
      {SiteVisitRemindersDialog}
      <LocationPermissionPrompt />
      
      {/* Data freshness indicator */}
      <div className="fixed bottom-4 right-4 z-40">
        <DataFreshnessBadge variant="compact" />
      </div>
    </div>
  );
};

export default Dashboard;
