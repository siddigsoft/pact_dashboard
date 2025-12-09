import React, { useState, useEffect, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ThemeProvider } from 'next-themes';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { isSupabaseConfigured } from './integrations/supabase/client';
import { ConfigurationError } from './components/ConfigurationError';
import { isMobileApp } from './utils/platformDetection';

// Import AppProviders
import { AppProviders } from './context/AppContext';

// Lazy-loaded pages for better code splitting
const Index = lazy(() => import('./pages/Index'));
const Auth = lazy(() => import('./pages/Auth'));
const Register = lazy(() => import('./pages/Register'));
const RegistrationSuccess = lazy(() => import('./pages/RegistrationSuccess'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const MMP = lazy(() => import('./pages/MMP'));
const MMPUpload = lazy(() => import('./pages/MMPUpload'));
const MMPDetailView = lazy(() => import('./pages/MMPDetailView'));
const MMPVerification = lazy(() => import('./pages/MMPVerification'));
const MMPDetailedVerification = lazy(() => import('./pages/MMPDetailedVerification'));
const MMPVerificationPage = lazy(() => import('./pages/MMPVerificationPage'));
const MMPPermitMessagePage = lazy(() => import('./pages/mmp/MMPPermitMessagePage'));
const EditMMP = lazy(() => import('./pages/EditMMP'));
const NotFound = lazy(() => import('./pages/NotFound'));
const ReviewAssignCoordinators = lazy(() => import('./pages/ReviewAssignCoordinators'));
const CoordinatorDashboard = lazy(() => import('./pages/coordinator/CoordinatorDashboard'));
const SitesForVerification = lazy(() => import('./pages/coordinator/SitesForVerification'));
const CoordinatorSites = lazy(() => import('./pages/coordinator/CoordinatorSites'));
const Calls = lazy(() => import('./pages/Calls'));
const Chat = lazy(() => import('./pages/Chat'));
const FieldTeam = lazy(() => import('./pages/FieldTeam'));
const Finance = lazy(() => import('./pages/Finance'));
const Reports = lazy(() => import('./pages/Reports'));
const Projects = lazy(() => import('./pages/Projects'));
const CreateProject = lazy(() => import('./pages/CreateProject'));
const CreateProjectActivity = lazy(() => import('./pages/CreateProjectActivity'));
const ProjectActivityDetail = lazy(() => import('./pages/ProjectActivityDetail'));
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'));
const EditProject = lazy(() => import('./pages/EditProject'));
const ProjectTeamManagement = lazy(() => import('./pages/ProjectTeamManagement'));
const Settings = lazy(() => import('./pages/Settings'));
const SiteVisits = lazy(() => import('./pages/SiteVisits'));
const SiteVisitDetail = lazy(() => import('./pages/SiteVisitDetail'));
const EditSiteVisit = lazy(() => import('./pages/EditSiteVisit'));
const CreateSiteVisit = lazy(() => import('./pages/CreateSiteVisit'));
const CreateSiteVisitMMP = lazy(() => import('./pages/CreateSiteVisitMMP'));
const CreateSiteVisitMMPDetail = lazy(() => import('./pages/CreateSiteVisitMMPDetail'));
const CreateSiteVisitUrgent = lazy(() => import('./pages/CreateSiteVisitUrgent'));
const AdvancedMap = lazy(() => import('./pages/AdvancedMap'));
const DataVisibility = lazy(() => import('./pages/DataVisibility'));
const Users = lazy(() => import('./pages/Users'));
const UserDetail = lazy(() => import('./pages/UserDetail'));
const AuditCompliance = lazy(() => import('./pages/AuditCompliance'));
const Archive = lazy(() => import('./pages/Archive'));
const Calendar = lazy(() => import('./pages/Calendar'));
const RoleManagement = lazy(() => import('./pages/RoleManagement'));
const MonitoringPlanPage = lazy(() => import('./pages/MonitoringPlanPage'));
const FieldOperationManagerPage = lazy(() => import('./pages/FieldOperationManager'));
const GlobalSearchPage = lazy(() => import('./pages/GlobalSearchPage'));
const WalletPage = lazy(() => import('./pages/Wallet'));
const AdminWallets = lazy(() => import('./pages/AdminWallets'));
const AdminWalletDetail = lazy(() => import('./pages/AdminWalletDetail'));
const WithdrawalApproval = lazy(() => import('./pages/WithdrawalApproval'));
const FinanceApproval = lazy(() => import('./pages/FinanceApproval'));
const DownPaymentApproval = lazy(() => import('./pages/DownPaymentApproval'));
const SupervisorApprovals = lazy(() => import('./pages/SupervisorApprovals'));
const WalletReports = lazy(() => import('./pages/WalletReports'));
const BudgetPage = lazy(() => import('./pages/Budget'));
const Classifications = lazy(() => import('./pages/Classifications'));
const ClassificationFeeManagement = lazy(() => import('./pages/ClassificationFeeManagement'));
const CostSubmission = lazy(() => import('./pages/CostSubmission'));
const DemoDataCollector = lazy(() => import('./pages/DemoDataCollector'));
const FinancialOperations = lazy(() => import('./pages/FinancialOperations'));
const SuperAdminManagement = lazy(() => import('./components/superAdmin/SuperAdminManagementPage').then(module => ({ default: module.SuperAdminManagementPage })));
const SuperAdminDataManagement = lazy(() => import('./components/superAdmin/SuperAdminDataManagement').then(module => ({ default: module.SuperAdminDataManagement })));
const HubOperations = lazy(() => import('./pages/HubOperations'));
const TrackerPreparationPlan = lazy(() => import('./pages/TrackerPreparationPlan'));
const NotificationsPage = lazy(() => import('./pages/Notifications'));
const Documentation = lazy(() => import('./pages/Documentation'));
const PublicDocumentation = lazy(() => import('./pages/PublicDocumentation'));
const SignaturesPage = lazy(() => import('./pages/Signatures'));
const DocumentsPage = lazy(() => import('./pages/Documents'));
const ApprovalDashboard = lazy(() => import('./pages/ApprovalDashboard'));
const AuditLogs = lazy(() => import('./pages/AuditLogs'));

// Components (keep these eagerly loaded as they're used immediately)
import MainLayout from './components/MainLayout';
import { Toaster } from './components/ui/toaster';
import { Toaster as SonnerToaster } from './components/ui/sonner';
import { Toaster as HotToaster } from 'react-hot-toast';
import { useAppContext } from './context/AppContext';
import { NotificationProvider } from './context/NotificationContext';
import { NotificationStack } from './components/NotificationStack';
import { useNotifications } from './context/NotificationContext';
import ErrorBoundary from './components/ErrorBoundary';
import { debugDatabase } from './utils/debug-db';
import { useFCM } from './hooks/useFCM';
import { MobilePermissionGuard } from './components/mobile/MobilePermissionGuard';

// Loading component for Suspense fallback
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="text-sm text-muted-foreground animate-pulse">Loading...</div>
  </div>
);

// Notification display component
const AppNotifications = () => {
  const { notifications, remove } = useNotifications();
  
  return <NotificationStack notifications={notifications} onRemove={remove} displayType="top" />;
};

// FCM initialization component - must be inside AppProviders context
const FCMInitializer = () => {
  useFCM();
  return null;
};

// Redirect for old MMP view paths
const MmpViewRedirect = () => {
  const location = useLocation();
  const mmpId = location.pathname.split('/').pop();
  return <Navigate to={`/mmp/${mmpId}/view`} replace />;
};

// Redirect /projects/:id/team/add -> /projects/:id/team
const TeamAddRedirect = () => {
  const location = useLocation();
  const segments = location.pathname.split('/');
  const projectsIndex = segments.indexOf('projects');
  const id = projectsIndex >= 0 ? segments[projectsIndex + 1] : '';
  return <Navigate to={`/projects/${id}/team`} replace />;
};

// Auth guard for protected routes
const AuthGuard = ({ children }) => {
  const location = useLocation();
  const { currentUser, authReady } = useAppContext();

  // Wait for initial auth hydration to complete before deciding
  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (
    !currentUser &&
    !['/', '/auth', '/login', '/register', '/registration-success', '/forgot-password', '/reset-password', '/documentation'].includes(location.pathname) &&
    !location.pathname.startsWith('/demo/')
  ) {
    return <Navigate to="/auth" replace />;
  }

  return children;
};

// Main application routes
const AppRoutes = () => {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<Index />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/login" element={<Navigate to="/auth" replace />} />
      <Route path="/register" element={<Register />} />
      <Route path="/registration-success" element={<RegistrationSuccess />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/demo/data-collector" element={<DemoDataCollector />} />

      {/* Protected routes */}
  <Route element={<AuthGuard><MainLayout /></AuthGuard>}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/mmp" element={<MMP />} />
        <Route path="/mmp/upload" element={<MMPUpload />} />
        <Route path="/mmp/:id" element={<MMPDetailView />} />
        <Route path="/mmp/:id/view" element={<MMPDetailView />} />
        <Route path="/mmp/:id/edit" element={<EditMMP />} />
        <Route path="/mmp/edit/:id" element={<EditMMP />} />
        <Route path="/mmp/verify/:id" element={<MMPVerification />} />
        <Route path="/mmp/:id/detailed-verification" element={<MMPDetailedVerification />} />
        <Route path="/mmp/:id/verification" element={<MMPVerificationPage />} />
        <Route path="/mmp/:id/permit-message" element={<MMPPermitMessagePage />} />
        <Route path="/mmp/:id/review-assign-coordinators" element={<ReviewAssignCoordinators />} />
        <Route path="/calls" element={<Calls />} />
        <Route path="/field-team" element={<FieldTeam />} />
        <Route path="/finance" element={<Finance />} />
        <Route path="/financial-operations" element={<FinancialOperations />} />
        <Route path="/data-visibility" element={<DataVisibility />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/create" element={<CreateProject />} />
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route path="/projects/:id/edit" element={<EditProject />} />
        <Route path="/projects/:id/activities/create" element={<CreateProjectActivity />} />
        <Route path="/projects/:id/activities/:activityId" element={<ProjectActivityDetail />} />
        <Route path="/projects/:id/team" element={<ProjectTeamManagement />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/documentation" element={<Documentation />} />
        <Route path="/public-documentation" element={<PublicDocumentation />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/wallet" element={<WalletPage />} />
        <Route path="/admin/wallets" element={<AdminWallets />} />
        <Route path="/admin/wallets/:userId" element={<AdminWalletDetail />} />
        <Route path="/withdrawal-approval" element={<WithdrawalApproval />} />
        <Route path="/finance-approval" element={<FinanceApproval />} />
        <Route path="/down-payment-approval" element={<DownPaymentApproval />} />
        <Route path="/supervisor-approvals" element={<SupervisorApprovals />} />
        <Route path="/wallet-reports" element={<WalletReports />} />
        <Route path="/budget" element={<BudgetPage />} />
        <Route path="/cost-submission" element={<CostSubmission />} />
        <Route path="/site-visits" element={<SiteVisits />} />
        <Route path="/site-visits/create" element={<CreateSiteVisit />} />
        <Route path="/site-visits/create/mmp" element={<CreateSiteVisitMMP />} />
        <Route path="/site-visits/create/mmp/:id" element={<CreateSiteVisitMMPDetail />} />
        <Route path="/site-visits/create/urgent" element={<CreateSiteVisitUrgent />} />
        <Route path="/site-visits/:id" element={<SiteVisitDetail />} />
        <Route path="/site-visits/:id/edit" element={<EditSiteVisit />} />
        <Route path="/users" element={<Users />} />
        <Route path="/users/:id" element={<UserDetail />} />
        <Route path="/classifications" element={<Classifications />} />
        <Route path="/classification-fees" element={<ClassificationFeeManagement />} />
        <Route path="/map" element={<AdvancedMap />} />
        <Route path="/advanced-map" element={<Navigate to="/map" replace />} />
        <Route path="/audit-compliance" element={<AuditCompliance />} />
        <Route path="/archive" element={<Archive />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/role-management" element={<RoleManagement />} />
        <Route path="/super-admin-management" element={<SuperAdminManagement />} />
        <Route path="/super-admin-data" element={<SuperAdminDataManagement />} />
  <Route path="/monitoring-plan" element={<MonitoringPlanPage />} />
  <Route path="/field-operation-manager" element={<FieldOperationManagerPage />} />
  <Route path="/search" element={<GlobalSearchPage />} />
  {/* Coordinator: Sites for Verification */}
  <Route path="/coordinator/sites-for-verification" element={<SitesForVerification />} />
  <Route path="/coordinator/sites" element={<CoordinatorSites />} />
  <Route path="/coordinator-dashboard" element={<CoordinatorDashboard />} />
  <Route path="/hub-operations" element={<HubOperations />} />
        <Route path="/tracker-preparation-plan" element={<TrackerPreparationPlan />} />
        <Route path="/signatures" element={<SignaturesPage />} />
        <Route path="/approval-dashboard" element={<ApprovalDashboard />} />
        <Route path="/audit-logs" element={<AuditLogs />} />
      </Route>

      {/* Redirects */}
      <Route path="/mmp/view/:id" element={<MmpViewRedirect />} />
      <Route path="/projects/:id/team/add" element={<TeamAddRedirect />} />

      {/* Catch-all route */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

function App() {
  const [isMounted, setIsMounted] = useState(false);

  // Ensure component mounts before rendering to avoid hydration issues
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Ensure first-time users start in light mode
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    if (!savedTheme) {
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.add("light");
      localStorage.setItem("theme", "light");
    }
  }, []);

  // Add debug function to window for testing
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).debugDatabase = debugDatabase;
    }
  }, []);

  // Set platform attribute for mobile-specific styling
  useEffect(() => {
    const platform = isMobileApp() ? 'mobile' : 'web';
    document.body.setAttribute('data-platform', platform);
    
    // Also add class for CSS support queries
    if (platform === 'mobile') {
      document.body.classList.add('mobile-app');
    }
  }, []);

  // If Supabase is not configured, show the configuration error screen
  // This prevents the app from crashing and gives a clear error message
  if (!isSupabaseConfigured) {
    return (
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        enableSystem={false}
        disableTransitionOnChange
      >
        <ConfigurationError
          title="Backend Not Configured"
          description="The database connection is not set up."
          details="The Supabase environment variables were not included in the build. Please rebuild the APK with proper environment configuration."
        />
      </ThemeProvider>
    );
  }

  return (
    <NotificationProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        enableSystem={false}
        disableTransitionOnChange
      >
        {isMounted && (
          <ErrorBoundary
            fallback={
              <div className="min-h-screen flex items-center justify-center">
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg max-w-md">
                  <h2 className="text-2xl font-bold text-red-600 mb-4">Something went wrong</h2>
                  <p className="mb-4">The application encountered an unexpected error. Please refresh the page to try again.</p>
                  <button
                    onClick={() => window.location.reload()}
                    className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/90"
                  >
                    Refresh Page
                  </button>
                </div>
              </div>
            }
          >
            <QueryClientProvider client={queryClient}>
              <Router>
                <AppProviders>
                  <FCMInitializer />
                  <Suspense fallback={<PageLoader />}>
                    <AuthGuard>
                      <MobilePermissionGuard>
                        <AppRoutes />
                      </MobilePermissionGuard>
                    </AuthGuard>
                </Suspense>
                <AppNotifications />
                <Toaster />
                <SonnerToaster />
                <HotToaster
                  position="bottom-center"
                  toastOptions={{
                    style: {
                      background: '#fff',
                      border: '1px solid #e5e7eb',
                      padding: '12px',
                      color: '#111',
                    },
                  }}
                />
              </AppProviders>
            </Router>
          </QueryClientProvider>
        </ErrorBoundary>
      )}
      </ThemeProvider>
    </NotificationProvider>
  );
}

export default App;
