// Map backend/system role values to professional display names
const ROLE_DISPLAY_MAP: Record<string, string> = {
  admin: 'Admin',
  ict: 'ICT',
  fom: 'Field Operation Manager (FOM)',
  financialAdmin: 'FinancialAdmin',
  supervisor: 'Supervisor',
  coordinator: 'Coordinator',
  dataCollector: 'DataCollector',
  reviewer: 'Reviewer',
  // Also include new values for safety
  Admin: 'Admin',
  ICT: 'ICT',
  'Field Operation Manager (FOM)': 'Field Operation Manager (FOM)',
  FinancialAdmin: 'FinancialAdmin',
  Supervisor: 'Supervisor',
  Coordinator: 'Coordinator',
  DataCollector: 'DataCollector',
  Reviewer: 'Reviewer',
};
import React, { useEffect } from 'react';
import { useSiteVisitRemindersUI } from '@/hooks/use-site-visit-reminders-ui';
import { DashboardDesktopView } from '@/components/dashboard/DashboardDesktopView';
import { DashboardMobileView } from '@/components/dashboard/DashboardMobileView';
import { DashboardStatsOverview } from '@/components/dashboard/DashboardStatsOverview';
import { useViewMode } from '@/context/ViewModeContext';
import { SectionHeader } from '@/components/dashboard/SectionHeader';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BarChart } from 'lucide-react';
import FloatingMessenger from '@/components/communication/FloatingMessenger';
import { useAppContext } from '@/context/AppContext';
import { Badge } from '@/components/ui/badge';
import PactLogo from '@/assets/logo.png'; // PNG logo
import LocationPermissionPrompt from '@/components/location/LocationPermissionPrompt';

const Dashboard = () => {
  const { SiteVisitRemindersDialog, showDueReminders } = useSiteVisitRemindersUI();
  const { viewMode } = useViewMode();
  const { currentUser, roles } = useAppContext();

  useEffect(() => {
    showDueReminders();
  }, [showDueReminders]);

  const renderRoles = () => {
    const userRoles = roles && roles.length > 0 ? roles : [currentUser?.role];
    return userRoles.map((role, idx) => (
      <Badge
        key={idx}
        variant={role === 'Admin' ? 'default' : 'outline'}
        className={`px-4 py-1 rounded-full text-sm font-medium transition-all duration-200
          ${
            role === 'Admin'
              ? 'bg-orange-500 text-white hover:bg-orange-600'
              : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
      >
        {role}
      </Badge>
    ));
  };

  return (
    <TooltipProvider>
      <div className="container mx-auto p-6 md:p-8 space-y-12 bg-gradient-to-br from-slate-50 via-blue-50 to-blue-100 dark:from-gray-900 dark:via-gray-950 dark:to-gray-900 min-h-screen">
        {/* Header */}
        <header className="space-y-3">
          <h1 className="text-3xl md:text-5xl font-extrabold text-gray-900 dark:text-white tracking-tight">
            Dashboard
          </h1>
          <p className="text-gray-600 dark:text-gray-300 text-base md:text-lg">
            Welcome to your{' '}
            <span className="font-semibold text-blue-600 dark:text-blue-400">
              PACT Field Operations Platform
            </span>
          </p>

          {/* User Roles Card */}
          {currentUser && (
            <div className="mt-4 p-5 bg-gradient-to-r from-blue-50 to-blue-100 dark:from-gray-800 dark:to-gray-900 rounded-2xl flex flex-col sm:flex-row sm:items-center gap-4 shadow-lg border border-gray-200 dark:border-gray-700 transition-all duration-300 hover:shadow-xl">
              <div className="flex items-center gap-3 text-sm md:text-base font-medium text-gray-900 dark:text-gray-100">
                <img
                  src={PactLogo}
                  alt="PACT Logo"
                  className="h-7 w-7 object-contain"
                />
                <span>Account Type:</span>
                {/* Solid orange oval for each role */}
                <div className="flex flex-wrap gap-2">
                  {(roles && roles.length > 0 ? roles : [currentUser?.role]).map((role, idx) => (
                    <span
                      key={idx}
                      className="px-4 py-1 rounded-full bg-orange-500 text-white font-semibold border border-orange-600"
                    >
                      {ROLE_DISPLAY_MAP[role] || role}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </header>

        {/* Key Metrics Section */}
        <section className="space-y-5">
          <SectionHeader
            title="Key Metrics"
            icon={<BarChart className="h-6 w-6 text-blue-600 dark:text-blue-400" />}
            description="A quick glance at your operational performance"
          />
          <div className="mt-4 p-6 rounded-3xl bg-white dark:bg-gray-900 shadow-lg transition-all duration-300 hover:shadow-2xl">
            <DashboardStatsOverview />
            {/* Optionally, add a workflow summary for the current role */}
            {/* <WorkflowStatusSummary role={roles?.[0]} /> */}
          </div>
        </section>
        <section className="mt-8">
          {viewMode === 'mobile' ? <DashboardMobileView /> : <DashboardDesktopView />}
        </section>

        {/* Floating components */}
        {SiteVisitRemindersDialog}
        <LocationPermissionPrompt />
        {/* <FloatingMessenger /> */}
      </div>
    </TooltipProvider>
  );
};

export default Dashboard;
