const ROLE_DISPLAY_MAP: Record<string, string> = {
  admin: 'Admin',
  ict: 'ICT',
  fom: 'Field Operation Manager (FOM)',
  financialAdmin: 'FinancialAdmin',
  supervisor: 'Supervisor',
  coordinator: 'Coordinator',
  dataCollector: 'DataCollector',
  reviewer: 'Reviewer',
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
import { 
  BarChart, 
  Activity, 
  Shield, 
  Zap, 
  CheckCircle2,
  TrendingUp
} from 'lucide-react';
import FloatingMessenger from '@/components/communication/FloatingMessenger';
import { useAppContext } from '@/context/AppContext';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import PactLogo from '@/assets/logo.png';
import LocationPermissionPrompt from '@/components/location/LocationPermissionPrompt';
import { useLiveDashboard } from '@/hooks/useLiveDashboard';
import { ConnectionStatus } from '@/components/dashboard/ConnectionStatus';
import { RefreshButton } from '@/components/dashboard/RefreshButton';

const Dashboard = () => {
  const { SiteVisitRemindersDialog, showDueReminders } = useSiteVisitRemindersUI();
  const { viewMode } = useViewMode();
  const { currentUser, roles } = useAppContext();
  
  const { isConnected, channels } = useLiveDashboard();

  useEffect(() => {
    showDueReminders();
  }, [showDueReminders]);

  const systemFeatures = [
    { 
      icon: Activity, 
      label: "Live Updates", 
      value: `${channels} Active`,
      color: "text-blue-500 dark:text-blue-400"
    },
    { 
      icon: Shield, 
      label: "Protected", 
      value: "Encrypted",
      color: "text-orange-500 dark:text-orange-400"
    },
    { 
      icon: Zap, 
      label: "Real-time", 
      value: "Connected",
      color: "text-green-500 dark:text-green-400"
    },
    { 
      icon: TrendingUp, 
      label: "Performance", 
      value: "Optimal",
      color: "text-purple-500 dark:text-purple-400"
    }
  ];

  return (
    <TooltipProvider>
      <div className="relative min-h-screen overflow-hidden bg-background">
        {/* Animated Background Layer */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-orange-500/5 to-purple-500/5 dark:from-blue-600/10 dark:via-orange-600/10 dark:to-purple-600/10" />
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-500/20 dark:bg-blue-600/20 rounded-full blur-3xl animate-blob" />
          <div className="absolute top-40 -right-40 w-96 h-96 bg-orange-500/20 dark:bg-orange-600/20 rounded-full blur-3xl animate-blob animation-delay-2000" />
          <div className="absolute -bottom-40 left-1/2 w-96 h-96 bg-purple-500/20 dark:bg-purple-600/20 rounded-full blur-3xl animate-blob animation-delay-4000" />
        </div>

        {/* Main Content */}
        <div className="relative z-10 container mx-auto p-4 md:p-6 lg:p-8 space-y-8">
          {/* Enhanced Header */}
          <header className="space-y-6">
            {/* Title Row with Actions */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-2">
                <h1 
                  className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight"
                  data-testid="heading-dashboard-title"
                >
                  <span className="bg-gradient-to-r from-blue-600 via-orange-600 to-purple-600 dark:from-blue-400 dark:via-orange-400 dark:to-purple-400 bg-clip-text text-transparent">
                    Command Dashboard
                  </span>
                </h1>
                <p 
                  className="text-base md:text-lg text-muted-foreground"
                  data-testid="text-dashboard-description"
                >
                  Real-time field operations oversight and analytics
                </p>
              </div>
              
              <div className="flex items-center gap-3">
                <ConnectionStatus isConnected={isConnected} channelCount={channels} />
                <RefreshButton />
              </div>
            </div>

            {/* User Profile Card */}
            {currentUser && (
              <Card className="border-2" data-testid="card-user-profile">
                <CardContent className="p-6">
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                    {/* User Info */}
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 border">
                        <img
                          src={PactLogo}
                          alt="PACT Logo"
                          className="h-12 w-12 object-contain"
                          data-testid="img-dashboard-logo"
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-muted-foreground">
                            Welcome back,
                          </p>
                          <Badge 
                            variant="secondary" 
                            className="gap-1"
                            data-testid="badge-user-status"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            Active
                          </Badge>
                        </div>
                        <h3 
                          className="text-xl md:text-2xl font-bold"
                          data-testid="text-user-name"
                        >
                          {currentUser.fullName || currentUser.email}
                        </h3>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {(roles && roles.length > 0 ? roles : [currentUser?.role]).map((role, idx) => (
                            <Badge
                              key={idx}
                              variant="default"
                              className="gap-1 bg-orange-500 text-white"
                              data-testid={`badge-role-${idx}`}
                            >
                              <Shield className="w-3 h-3" />
                              {ROLE_DISPLAY_MAP[role] || role}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* System Features Grid */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      {systemFeatures.map((feature, index) => {
                        const Icon = feature.icon;
                        return (
                          <div 
                            key={index}
                            className="flex flex-col items-center gap-2 p-3 rounded-md border bg-muted/30 hover-elevate"
                            data-testid={`feature-${feature.label.toLowerCase().replace(/\s+/g, '-')}`}
                          >
                            <Icon className={`w-5 h-5 ${feature.color}`} />
                            <div className="text-center">
                              <p className="text-xs font-semibold">{feature.value}</p>
                              <p className="text-xs text-muted-foreground">{feature.label}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </header>

          {/* Key Metrics Section */}
          <section className="space-y-4">
            <SectionHeader
              title="Key Metrics"
              icon={<BarChart className="h-6 w-6 text-primary" />}
              description="Real-time operational performance overview"
            />
            <Card className="border-2" data-testid="card-metrics">
              <CardContent className="p-6">
                <DashboardStatsOverview />
              </CardContent>
            </Card>
          </section>

          {/* Main Dashboard Content */}
          <section data-testid="section-main-content">
            {viewMode === 'mobile' ? <DashboardMobileView /> : <DashboardDesktopView />}
          </section>
        </div>

        {/* Floating components */}
        {SiteVisitRemindersDialog}
        <LocationPermissionPrompt />
        <FloatingMessenger />
      </div>
    </TooltipProvider>
  );
};

export default Dashboard;
