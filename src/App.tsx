import React, { useState, useEffect, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ThemeProvider } from 'next-themes';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { isSupabaseConfigured } from './integrations/supabase/client';
import { ConfigurationError } from './shared/components/common/ConfigurationError';
import { isMobileApp } from './utils/platformDetection';
import { SessionGuard } from './shared/components/common/SessionGuard';

// Import AppProviders
import { AppProviders } from './shared/context/AppContext';
import { NavigationProvider } from './shared/context/NavigationContext';

// Lazy-loaded pages for better code splitting
const Index = lazy(() => import('./features/dashboard/Index'));
const Auth = lazy(() => import('./features/auth/Auth'));
const Register = lazy(() => import('./features/auth/Register'));
const RegistrationSuccess = lazy(() => import('./features/auth/RegistrationSuccess'));
const ForgotPassword = lazy(() => import('./features/auth/ForgotPassword'));
const ResetPassword = lazy(() => import('./features/auth/ResetPassword'));
const Dashboard = lazy(() => import('./features/dashboard/Dashboard'));
const MMP = lazy(() => import('./features/mmp/MMP'));
const MMPUpload = lazy(() => import('./features/mmp/MMPUpload'));
const MMPDetailView = lazy(() => import('./features/mmp/MMPDetailView'));
const MMPVerification = lazy(() => import('./features/mmp/MMPVerification'));
const MMPDetailedVerification = lazy(() => import('./features/mmp/MMPDetailedVerification'));
const MMPVerificationPage = lazy(() => import('./features/mmp/MMPVerificationPage'));
const MMPPermitMessagePage = lazy(() => import('./features/mmp/MMPPermitMessagePage'));
const EditMMP = lazy(() => import('./features/mmp/EditMMP'));
const NotFound = lazy(() => import('./app/NotFound'));
const ReviewAssignCoordinators = lazy(() => import('./features/coordinator/ReviewAssignCoordinators'));
const CoordinatorDashboard = lazy(() => import('./features/coordinator/CoordinatorDashboard'));
const SitesForVerification = lazy(() => import('./features/coordinator/SitesForVerification'));
const CoordinatorSites = lazy(() => import('./features/coordinator/CoordinatorSitesImpl'));
const Calls = lazy(() => import('./features/calls/Calls'));
const CallAnalytics = lazy(() => import('./features/calls/CallAnalytics'));
const Chat = lazy(() => import('./features/chat/Chat'));
const FieldTeam = lazy(() => import('./features/user/FieldTeam'));
const Finance = lazy(() => import('./features/finance/Finance'));
const Reports = lazy(() => import('./features/reports/Reports'));
const Projects = lazy(() => import('./features/project/Projects'));
const CreateProject = lazy(() => import('./features/project/CreateProject'));
const CreateProjectActivity = lazy(() => import('./features/project/CreateProjectActivity'));
const ProjectActivityDetail = lazy(() => import('./features/project/ProjectActivityDetail'));
const ProjectDetail = lazy(() => import('./features/project/ProjectDetail'));
const EditProject = lazy(() => import('./features/project/EditProject'));
const ProjectTeamManagement = lazy(() => import('./features/project/ProjectTeamManagement'));
const Settings = lazy(() => import('./features/settings/Settings'));
const SiteVisits = lazy(() => import('./features/siteVisit/SiteVisits'));
const SiteVisitDetail = lazy(() => import('./features/siteVisit/SiteVisitDetail'));
const EditSiteVisit = lazy(() => import('./features/siteVisit/EditSiteVisit'));
const CreateSiteVisit = lazy(() => import('./features/siteVisit/CreateSiteVisit'));
const CreateSiteVisitMMP = lazy(() => import('./features/siteVisit/CreateSiteVisitMMP'));
const CreateSiteVisitMMPDetail = lazy(() => import('./features/siteVisit/CreateSiteVisitMMPDetail'));
const CreateSiteVisitUrgent = lazy(() => import('./features/siteVisit/CreateSiteVisitUrgent'));
const AdvancedMap = lazy(() => import('./features/location/AdvancedMap'));
const DataVisibility = lazy(() => import('./features/admin/DataVisibility'));
const Users = lazy(() => import('./features/user/Users'));
const UserDetail = lazy(() => import('./features/user/UserDetail'));
const AuditCompliance = lazy(() => import('./features/audit/AuditCompliance'));
const Archive = lazy(() => import('./features/archive/Archive'));
const Calendar = lazy(() => import('./features/calendar/Calendar'));
const RoleManagement = lazy(() => import('./features/roleManagement/RoleManagement'));
const MonitoringPlanPage = lazy(() => import('./features/siteVisit/MonitoringPlanPage'));
const GlobalSearchPage = lazy(() => import('./shared/pages/GlobalSearchPage'));
const WalletPage = lazy(() => import('./features/wallet/Wallet'));
const AdminWallets = lazy(() => import('./features/wallet/AdminWallets'));
const AdminWalletDetail = lazy(() => import('./features/wallet/AdminWalletDetail'));
const WithdrawalApproval = lazy(() => import('./features/wallet/WithdrawalApproval'));
const FinanceApproval = lazy(() => import('./features/finance/FinanceApproval'));
const DownPaymentApproval = lazy(() => import('./features/downPayment/DownPaymentApproval'));
const AdvanceRequestsReport = lazy(() => import('./features/reports/AdvanceRequestsReport'));
const SupervisorApprovals = lazy(() => import('./features/approval/SupervisorApprovals'));
const WalletReports = lazy(() => import('./features/wallet/WalletReports'));
const BudgetPage = lazy(() => import('./features/budget/Budget'));
const Classifications = lazy(() => import('./features/classification/Classifications'));
const ClassificationFeeManagement = lazy(() => import('./features/classification/ClassificationFeeManagement'));
const RetainerManagement = lazy(() => import('./features/finance/RetainerManagement'));
const CostSubmission = lazy(() => import('./features/costApproval/CostSubmission'));
const CostSubmissionReports = lazy(() => import('./features/costApproval/CostSubmissionReports'));
const MobileCostSubmission = lazy(() => import('./features/costApproval/MobileCostSubmission'));
const DemoDataCollector = lazy(() => import('./features/admin/DemoDataCollector'));
const FinancialOperations = lazy(() => import('./features/finance/FinancialOperations'));
const SuperAdminManagement = lazy(() => import('./components/superAdmin/SuperAdminManagementPage').then(module => ({ default: module.SuperAdminManagementPage })));
const SuperAdminDataManagement = lazy(() => import('./components/superAdmin/SuperAdminDataManagement').then(module => ({ default: module.SuperAdminDataManagement })));
const HubOperations = lazy(() => import('./features/admin/HubOperations'));
const HubManagement = lazy(() => import('./features/admin/HubManagement'));
const TrackerPreparationPlan = lazy(() => import('./features/siteVisit/TrackerPreparationPlan'));
const NotificationsPage = lazy(() => import('./features/notifications/Notifications'));
const Documentation = lazy(() => import('./features/documents/Documentation'));
const MobileDocumentation = lazy(() => import('./features/documents/MobileDocumentation'));
const PublicDocumentation = lazy(() => import('./features/documents/PublicDocumentation'));
const SignaturesPage = lazy(() => import('./features/documents/Signatures'));
const DocumentsPage = lazy(() => import('./features/documents/DocumentsImpl'));
const ApprovalDashboard = lazy(() => import('./features/approval/ApprovalDashboard'));
const AuditLogs = lazy(() => import('./features/audit/AuditLogs'));
const EmailTracking = lazy(() => import('./features/admin/EmailTracking'));
const EmailManagement = lazy(() => import('./features/admin/EmailManagement'));
const AdminBroadcast = lazy(() => import('./features/admin/AdminBroadcast'));
const StaffDirectory = lazy(() => import('./features/documents/StaffDirectory'));
const TransactionScanner = lazy(() => import('./features/wallet/TransactionScanner'));
const PermissionsManagement = lazy(() => import('./features/roleManagement/PermissionsManagement'));
const RolePerspectiveViewer = lazy(() => import('./features/roleManagement/RolePerspectiveViewer'));
const CostPredictions = lazy(() => import('./features/costApproval/CostPredictions'));
const ExchangeRates = lazy(() => import('./features/finance/ExchangeRates'));
const SupportContacts = lazy(() => import('./features/admin/SupportContacts'));
const MobileSupportTickets = lazy(() => import('./features/admin/MobileSupportTickets'));
const MobileHelpArticles = lazy(() => import('./features/admin/MobileHelpArticles'));
const MobileSignatureAdmin = lazy(() => import('./features/admin/MobileSignatureAdmin'));
const MobileCallScheduling = lazy(() => import('./features/calls/MobileCallScheduling'));
const MobileDocumentSync = lazy(() => import('./features/documents/MobileDocumentSync'));
const ReconciliationDashboard = lazy(() => import('./features/finance/ReconciliationDashboard'));
const QuestionnaireAnalytics = lazy(() => import('./features/analytics/QuestionnaireAnalytics'));
const NotificationPreferences = lazy(() => import('./features/notifications/NotificationPreferences'));
const NotificationHistory = lazy(() => import('./features/notifications/NotificationHistory'));
const NotificationAnalytics = lazy(() => import('./features/notifications/NotificationAnalytics'));
const MMPCycleClose = lazy(() => import('./features/mmp/MMPCycleClose'));
const DataExportCenter = lazy(() => import('./features/documents/DataExportCenter'));
const SafetyHub = lazy(() => import('./features/admin/SafetyHub'));
const IncidentReports = lazy(() => import('./features/admin/IncidentReports'));
const EquipmentPage = lazy(() => import('./features/admin/Equipment'));
const MonitoringForm = lazy(() => import('./features/siteVisit/MonitoringForm'));
const Helpline = lazy(() => import('./features/admin/Helpline'));

// Components (keep these eagerly loaded as they're used immediately)
import MainLayout from './shared/components/layout/MainLayout';
import { Toaster } from './components/ui/toaster';
import { Toaster as SonnerToaster } from './components/ui/sonner';
import { Toaster as HotToaster } from 'react-hot-toast';
import { useAppContext } from './shared/context/AppContext';
import { NotificationTriggerService } from './services/NotificationTriggerService';
import { NotificationProvider } from './features/notifications/context/NotificationContext';
import { NotificationStack } from './features/notifications/components/NotificationStack';
import { GlobalBroadcastAlert } from './shared/components/common/GlobalBroadcastAlert';
import { useNotifications } from './features/notifications/context/NotificationContext';
import ErrorBoundary from './shared/components/common/ErrorBoundary';
import { useFCM } from './platform/mobile/hooks/useFCM';
import { MobilePermissionGuard } from './platform/mobile/components/MobilePermissionGuard';
import { LiveDashboardProvider } from './features/dashboard/context/LiveDashboardContext';
import SessionManager from './shared/components/layout/SessionManager';
import { ActivityTrackingProvider } from './features/admin/context/ActivityTrackingContext';
import EmailPreviewPage from './features/admin/EmailPreviewPage';


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

// Auto-reminds users without a bank account once per session
const BankAccountReminderInit = () => {
  const { currentUser } = useAppContext();

  useEffect(() => {
    if (!currentUser?.id) return;
    const hasBankAccount = !!(currentUser as any)?.bankAccount?.accountNumber;
    if (hasBankAccount) return;
    const sessionKey = `bank_account_reminder_sent_${currentUser.id}`;
    if (sessionStorage.getItem(sessionKey)) return;

    sessionStorage.setItem(sessionKey, '1');
    NotificationTriggerService.send({
      userId: currentUser.id,
      title: 'Action Required: Add Your Bank Account',
      titleAr: 'إجراء مطلوب: أضف بيانات حسابك البنكي',
      message: 'Your bank account details are missing. Please add them in Settings → Profile to be able to request transportation advances and withdrawals.',
      messageAr: 'بيانات حسابك البنكي مفقودة. يرجى إضافتها في الإعدادات ← الملف الشخصي لتتمكن من طلب سلف النقل والمكافآت.',
      type: 'warning',
      category: 'account',
      priority: 'high',
      link: '/settings?tab=profile',
    }).catch(() => {});
  }, [currentUser?.id]);

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
    !['/', '/auth', '/login', '/register', '/registration-success', '/forgot-password', '/reset-password', '/documentation', '/mobile-documentation', '/email-preview'].includes(location.pathname) &&
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
      <Route path="/email-preview" element={<EmailPreviewPage />} />

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
        <Route path="/mmp/cycle-close" element={<MMPCycleClose />} />
        <Route path="/data-export-center" element={<DataExportCenter />} />
        <Route path="/calls" element={<Calls />} />
        <Route path="/call-analytics" element={<CallAnalytics />} />
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
        <Route path="/mobile-documentation" element={<MobileDocumentation />} />
        <Route path="/public-documentation" element={<PublicDocumentation />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/notification-preferences" element={<NotificationPreferences />} />
        <Route path="/notification-history" element={<NotificationHistory />} />
        <Route path="/notification-analytics" element={<NotificationAnalytics />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/wallet" element={<WalletPage />} />
        <Route path="/admin/wallets" element={<AdminWallets />} />
        <Route path="/admin/wallets/:userId" element={<AdminWalletDetail />} />
        <Route path="/withdrawal-approval" element={<WithdrawalApproval />} />
        <Route path="/finance-approval" element={<FinanceApproval />} />
        <Route path="/down-payment-approval" element={<DownPaymentApproval />} />
        <Route path="/advance-requests-report" element={<AdvanceRequestsReport />} />
        <Route path="/cost-predictions" element={<CostPredictions />} />
        <Route path="/exchange-rates" element={<ExchangeRates />} />
        <Route path="/supervisor-approvals" element={<SupervisorApprovals />} />
        <Route path="/cost-approval" element={<SupervisorApprovals />} />
        <Route path="/wallet-reports" element={<WalletReports />} />
        <Route path="/budget" element={<BudgetPage />} />
        <Route path="/cost-submission" element={<CostSubmission />} />
        <Route path="/cost-submission/reports" element={<CostSubmissionReports />} />
        <Route path="/questionnaire-analytics" element={<QuestionnaireAnalytics />} />
        <Route path="/mobile-cost-submission" element={<MobileCostSubmission />} />
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
        <Route path="/retainer-management" element={<RetainerManagement />} />
        <Route path="/map" element={<AdvancedMap />} />
        <Route path="/advanced-map" element={<Navigate to="/map" replace />} />
        <Route path="/audit-compliance" element={<AuditCompliance />} />
        <Route path="/archive" element={<Archive />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/role-management" element={<RoleManagement />} />
        <Route path="/super-admin-management" element={<SuperAdminManagement />} />
        <Route path="/super-admin-data" element={<SuperAdminDataManagement />} />
  <Route path="/monitoring-plan" element={<MonitoringPlanPage />} />
  <Route path="/search" element={<GlobalSearchPage />} />
  {/* Coordinator: Sites for Verification */}
  <Route path="/coordinator/sites-for-verification" element={<SitesForVerification />} />
  <Route path="/coordinator/sites" element={<CoordinatorSites />} />
  {/* Supervisor: dedicated My Site Management page — same component as CoordinatorSites */}
  <Route path="/supervisor/sites" element={<CoordinatorSites />} />
  <Route path="/coordinator-dashboard" element={<CoordinatorDashboard />} />
  <Route path="/hub-operations" element={<HubOperations />} />
  <Route path="/hub-management" element={<HubManagement />} />
        <Route path="/tracker-preparation-plan" element={<TrackerPreparationPlan />} />
        <Route path="/signatures" element={<SignaturesPage />} />
        <Route path="/approval-dashboard" element={<ApprovalDashboard />} />
        <Route path="/audit-logs" element={<AuditLogs />} />
        <Route path="/email-tracking" element={<EmailTracking />} />
        <Route path="/email-management" element={<EmailManagement />} />
        <Route path="/admin/broadcast" element={<AdminBroadcast />} />
        <Route path="/admin/staff-profiles" element={<StaffDirectory />} />
        <Route path="/admin/transaction-scanner" element={<TransactionScanner />} />
        <Route path="/permissions-management" element={<PermissionsManagement />} />
        <Route path="/role-perspective" element={<RolePerspectiveViewer />} />
        <Route path="/support-contacts" element={<SupportContacts />} />
        <Route path="/mobile-support-tickets" element={<MobileSupportTickets />} />
        <Route path="/mobile-help-articles" element={<MobileHelpArticles />} />
        <Route path="/mobile-signatures" element={<MobileSignatureAdmin />} />
        <Route path="/mobile-call-scheduling" element={<MobileCallScheduling />} />
        <Route path="/mobile-document-sync" element={<MobileDocumentSync />} />
        <Route path="/reconciliation-dashboard" element={<ReconciliationDashboard />} />
        <Route path="/safety-hub" element={<SafetyHub />} />
        <Route path="/incident-reports" element={<IncidentReports />} />
        <Route path="/equipment" element={<EquipmentPage />} />
        <Route path="/monitoring-form" element={<MonitoringForm />} />
        <Route path="/helpline" element={<Helpline />} />
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
              <NavigationProvider>
                <AppProviders>
                  <NotificationProvider>
                    <ActivityTrackingProvider>
                      <Suspense fallback={<PageLoader />}>
                        <LiveDashboardProvider>
                        <FCMInitializer />
                        <BankAccountReminderInit />
                        <SessionGuard>
                        <SessionManager>
                          <AuthGuard>
                            <MobilePermissionGuard>
                              <AppRoutes />
                            </MobilePermissionGuard>
                          </AuthGuard>
                        </SessionManager>
                        </SessionGuard>
                        </LiveDashboardProvider>
                      </Suspense>
                      <AppNotifications />
                    </ActivityTrackingProvider>
                    <GlobalBroadcastAlert />
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
                  </NotificationProvider>
                </AppProviders>
              </NavigationProvider>
            </Router>
          </QueryClientProvider>
        </ErrorBoundary>
      )}
    </ThemeProvider>
  );
}

export default App;
