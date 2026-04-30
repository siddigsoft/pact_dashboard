import React, { useState, useEffect, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ThemeProvider } from 'next-themes';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { isSupabaseConfigured } from './integrations/supabase/client';
import { ConfigurationError } from './components/ConfigurationError';
import { isMobileApp } from './utils/platformDetection';
import { SessionGuard } from './components/SessionGuard';

// Import AppProviders
import { AppProviders } from './context/AppContext';
import { NavigationProvider } from './context/NavigationContext';

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
const CallAnalytics = lazy(() => import('./pages/CallAnalytics'));
const Chat = lazy(() => import('./pages/Chat'));
const FieldTeam = lazy(() => import('./pages/FieldTeam'));
const Finance = lazy(() => import('./pages/Finance'));
const Reports = lazy(() => import('./pages/Reports'));
const Projects = lazy(() => import('./pages/Projects'));
const ProjectAnalytics = lazy(() => import('./pages/ProjectAnalytics'));
const PortfolioDashboard = lazy(() => import('./pages/PortfolioDashboard'));
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
const GlobalSearchPage = lazy(() => import('./pages/GlobalSearchPage'));
const WalletPage = lazy(() => import('./pages/Wallet'));
const PayrollPage = lazy(() => import('./pages/Payroll'));
const HRHub = lazy(() => import('./pages/HRHub'));
const AdminWallets = lazy(() => import('./pages/AdminWallets'));
const AdminWalletDetail = lazy(() => import('./pages/AdminWalletDetail'));
const WithdrawalApproval = lazy(() => import('./pages/WithdrawalApproval'));
const FinanceApproval = lazy(() => import('./pages/FinanceApproval'));
const DownPaymentApproval = lazy(() => import('./pages/DownPaymentApproval'));
const AdvanceRequestsReport = lazy(() => import('./pages/AdvanceRequestsReport'));
const SupervisorApprovals = lazy(() => import('./pages/SupervisorApprovals'));
const WalletReports = lazy(() => import('./pages/WalletReports'));
const BudgetPage = lazy(() => import('./pages/Budget'));
const Classifications = lazy(() => import('./pages/Classifications'));
const ClassificationFeeManagement = lazy(() => import('./pages/ClassificationFeeManagement'));
const RetainerManagement = lazy(() => import('./pages/RetainerManagement'));
const CostSubmission = lazy(() => import('./pages/CostSubmission'));
const CostSubmissionReports = lazy(() => import('./pages/CostSubmissionReports'));
const MobileCostSubmission = lazy(() => import('./pages/MobileCostSubmission'));
const DemoDataCollector = lazy(() => import('./pages/DemoDataCollector'));
const FinancialOperations = lazy(() => import('./pages/FinancialOperations'));
const SuperAdminManagement = lazy(() => import('./components/superAdmin/SuperAdminManagementPage').then(module => ({ default: module.SuperAdminManagementPage })));
const SuperAdminDataManagement = lazy(() => import('./components/superAdmin/SuperAdminDataManagement').then(module => ({ default: module.SuperAdminDataManagement })));
const HubOperations = lazy(() => import('./pages/HubOperations'));
const HubManagement = lazy(() => import('./pages/HubManagement'));
const TrackerPreparationPlan = lazy(() => import('./pages/TrackerPreparationPlan'));
const NotificationsPage = lazy(() => import('./pages/Notifications'));
const Documentation = lazy(() => import('./pages/Documentation'));
const MobileDocumentation = lazy(() => import('./pages/MobileDocumentation'));
const PublicDocumentation = lazy(() => import('./pages/PublicDocumentation'));
const SignaturesPage = lazy(() => import('./pages/Signatures'));
const DocumentsPage = lazy(() => import('./pages/Documents'));
const ApprovalDashboard = lazy(() => import('./pages/ApprovalDashboard'));
const MonitoringDashboard = lazy(() => import('./pages/MonitoringDashboard'));
const AuditLogs = lazy(() => import('./pages/AuditLogs'));
const LoginAnalytics = lazy(() => import('./pages/LoginAnalytics'));
const EmailTracking = lazy(() => import('./pages/EmailTracking'));
const EmailManagement = lazy(() => import('./pages/EmailManagement'));
const AdminBroadcast = lazy(() => import('./pages/AdminBroadcast'));
const AdminWhatsApp = lazy(() => import('./pages/AdminWhatsApp'));
const AdminCycleHealth = lazy(() => import('./pages/AdminCycleHealth'));
const StaffDirectory = lazy(() => import('./pages/StaffDirectory'));
const Employees = lazy(() => import('./pages/Employees'));
const Departments = lazy(() => import('./pages/Departments'));
const TaskAdmin = lazy(() => import('./pages/TaskAdmin'));
const AdminProjectFlowStages = lazy(() => import('./pages/AdminProjectFlowStages'));
const TransactionScanner = lazy(() => import('./pages/TransactionScanner'));
const PermissionsManagement = lazy(() => import('./pages/PermissionsManagement'));
const RolePerspectiveViewer = lazy(() => import('./pages/RolePerspectiveViewer'));
const CostPredictions = lazy(() => import('./pages/CostPredictions'));
const ExchangeRates = lazy(() => import('./pages/ExchangeRates'));
const SupportContacts = lazy(() => import('./pages/SupportContacts'));
const MobileSupportTickets = lazy(() => import('./pages/MobileSupportTickets'));
const MobileHelpArticles = lazy(() => import('./pages/MobileHelpArticles'));
const MobileSignatureAdmin = lazy(() => import('./pages/MobileSignatureAdmin'));
const MobileCallScheduling = lazy(() => import('./pages/MobileCallScheduling'));
const MobileDocumentSync = lazy(() => import('./pages/MobileDocumentSync'));
const ReconciliationDashboard = lazy(() => import('./pages/ReconciliationDashboard'));
const QuestionnaireAnalytics = lazy(() => import('./pages/QuestionnaireAnalytics'));
const DCTPDMDashboard = lazy(() => import('./pages/DCTPDMDashboard'));
const DCTPDMPublicPage = lazy(() => import('./pages/DCTPDMPublicPage'));
const NotificationPreferences = lazy(() => import('./pages/NotificationPreferences'));
const NotificationHistory = lazy(() => import('./pages/NotificationHistory'));
const NotificationAnalytics = lazy(() => import('./pages/NotificationAnalytics'));
const MMPCycleClose = lazy(() => import('./pages/MMPCycleClose'));
const DataExportCenter = lazy(() => import('./pages/DataExportCenter'));
const SafetyHub = lazy(() => import('./pages/SafetyHub'));
const IncidentReports = lazy(() => import('./pages/IncidentReports'));
const EquipmentPage = lazy(() => import('./pages/Equipment'));
const MonitoringForm = lazy(() => import('./pages/MonitoringForm'));
const CRMPartners = lazy(() => import('./pages/CRMPartners'));
const CRMDashboard = lazy(() => import('./pages/CRMDashboard'));
const CRMContacts = lazy(() => import('./pages/CRMContacts'));
const CRMEngagements = lazy(() => import('./pages/CRMEngagements'));
const CRMOpportunities = lazy(() => import('./pages/CRMOpportunities'));
const SurveysPage = lazy(() => import('./pages/SurveysPage'));
const SurveyDetail = lazy(() => import('./pages/SurveyDetail'));
const SurveyFill = lazy(() => import('./pages/SurveyFill'));
const Helpline = lazy(() => import('./pages/Helpline'));
const MyTasksPage = lazy(() => import('./pages/MyTasksV2'));
const TaskDetail = lazy(() => import('./pages/TaskDetail'));
const TeamTaskMonitor = lazy(() => import('./pages/TeamTaskMonitor'));
const LeaveRequests = lazy(() => import('./pages/LeaveRequests'));
const WorkspaceHub = lazy(() => import('./pages/WorkspaceHub'));
const PageAccessControl = lazy(() => import('./pages/PageAccessControl'));
const FieldOperationManager = lazy(() => import('./pages/FieldOperationManager'));
const MMPManagementPage = lazy(() => import('./pages/MMPManagementPage'));
const FileViewer = lazy(() => import('./pages/FileViewer'));
const ApprovalsHub = lazy(() => import('./pages/ApprovalsHub'));
const IntegrationsSettings = lazy(() => import('./pages/IntegrationsSettings'));
const ChangelogPage = lazy(() => import('./pages/Changelog'));
const SubscriptionsPage = lazy(() => import('./pages/Subscriptions'));
const SalaryRetainerReport = lazy(() => import('./pages/SalaryRetainerReport'));
const MonthEndFinancialSummary = lazy(() => import('./pages/MonthEndFinancialSummary'));
const MyTeam = lazy(() => import('./pages/MyTeam'));
const PerformanceReviews = lazy(() => import('./pages/PerformanceReviews'));
const SalaryIncrements = lazy(() => import('./pages/SalaryIncrements'));
const PositionsPage = lazy(() => import('./pages/Positions'));
const TrainingCertificationsPage = lazy(() => import('./pages/TrainingCertifications'));
const HierarchyAuditLogPage = lazy(() => import('./pages/HierarchyAuditLog'));
const AccountingCOA = lazy(() => import('./pages/AccountingCOA'));
const AccountingJournals = lazy(() => import('./pages/AccountingJournals'));
const AccountingTrialBalance = lazy(() => import('./pages/AccountingTrialBalance'));
const AccountingGeneralLedger = lazy(() => import('./pages/AccountingGeneralLedger'));
const AccountingFinancialStatements = lazy(() => import('./pages/AccountingFinancialStatements'));
const AccountingBankRecon = lazy(() => import('./pages/AccountingBankRecon'));
const AccountingFiscalYears = lazy(() => import('./pages/AccountingFiscalYears'));
const AccountingFunds = lazy(() => import('./pages/AccountingFunds'));
const AccountingSettings = lazy(() => import('./pages/AccountingSettings'));
const AccountingBudgetVsActual = lazy(() => import('./pages/AccountingBudgetVsActual'));
const AccountingVendors = lazy(() => import('./pages/AccountingVendors'));
const AccountingFinanceDashboard = lazy(() => import('./pages/AccountingFinanceDashboard'));
const AccountingPurchaseOrders = lazy(() => import('./pages/AccountingPurchaseOrders'));
const AccountingAPAging = lazy(() => import('./pages/AccountingAPAging'));
const AccountingCashFlow = lazy(() => import('./pages/AccountingCashFlow'));
const AccountingFixedAssets = lazy(() => import('./pages/AccountingFixedAssets'));
const AccountingGLBridge   = lazy(() => import('./pages/AccountingGLBridge'));
const FinanceAuditTrail = lazy(() => import('./pages/FinanceAuditTrail'));
// HR audit gaps H2-H5: self-service pages
const MyAdvances = lazy(() => import('./pages/MyAdvances'));
const MyExpenses = lazy(() => import('./pages/MyExpenses'));
const Attendance = lazy(() => import('./pages/Attendance'));
const Offboarding = lazy(() => import('./pages/Offboarding'));

// Components (keep these eagerly loaded as they're used immediately)
import MainLayout from './components/MainLayout';
import { Toaster } from './components/ui/toaster';
import { Toaster as SonnerToaster } from './components/ui/sonner';
import { Toaster as HotToaster } from 'react-hot-toast';
import { useAppContext } from './context/AppContext';
import { NotificationTriggerService } from './services/NotificationTriggerService';
import { NotificationProvider } from './context/NotificationContext';
import { NotificationStack } from './components/NotificationStack';
import { GlobalBroadcastAlert } from './components/GlobalBroadcastAlert';
import { useNotifications } from './context/NotificationContext';
import ErrorBoundary from './components/ErrorBoundary';
import { useFCM } from './hooks/useFCM';
import { useAuthorization } from './hooks/use-authorization';
import { MobilePermissionGuard } from './components/mobile/MobilePermissionGuard';
import { LiveDashboardProvider } from './context/realtime/LiveDashboardContext';
import SessionManager from './components/layout/SessionManager';
import { ActivityTrackingProvider } from './context/activity/ActivityTrackingContext';
import EmailPreviewPage from './pages/EmailPreviewPage';


// Loading component for Suspense fallback
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="text-sm text-muted-foreground animate-pulse">Loading...</div>
  </div>
);

// Per-page error boundary so a single page crash doesn't take down the whole app
const PageCrashFallback = () => (
  <div className="min-h-[60vh] flex items-center justify-center p-8">
    <div className="bg-card border rounded-lg p-6 text-center max-w-md w-full shadow-sm">
      <h2 className="text-lg font-semibold text-destructive mb-2">Page failed to load</h2>
      <p className="text-muted-foreground text-sm mb-4">
        Something went wrong on this page. Try refreshing, or navigate to another section.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors text-sm"
      >
        Refresh Page
      </button>
    </div>
  </div>
);

const PageWrapper = ({ children }: { children: React.ReactNode }) => (
  <ErrorBoundary>
    {children}
  </ErrorBoundary>
);

const SuperAdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { isSuperAdmin } = useAuthorization();
  if (!isSuperAdmin()) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
};

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
    !['/', '/auth', '/login', '/register', '/registration-success', '/forgot-password', '/reset-password', '/documentation', '/mobile-documentation', '/email-preview', '/pdm-report'].includes(location.pathname) &&
    !location.pathname.startsWith('/demo/') &&
    !location.pathname.startsWith('/view/')
  ) {
    const target = `${location.pathname}${location.search}${location.hash}`;
    const redirectTo = `/auth?redirect=${encodeURIComponent(target)}`;
    return <Navigate to={redirectTo} replace />;
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
      <Route path="/pdm-report" element={<DCTPDMPublicPage />} />
      <Route path="/view/:fileId" element={<FileViewer />} />

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
        <Route path="/my-tasks" element={<PageWrapper><MyTasksPage /></PageWrapper>} />
        <Route path="/tasks/:id" element={<PageWrapper><TaskDetail /></PageWrapper>} />
        <Route path="/team-tasks" element={<PageWrapper><TeamTaskMonitor /></PageWrapper>} />
        <Route path="/projects" element={<PageWrapper><Projects /></PageWrapper>} />
        <Route path="/projects/analytics" element={<PageWrapper><ProjectAnalytics /></PageWrapper>} />
        <Route path="/portfolio" element={<PageWrapper><PortfolioDashboard /></PageWrapper>} />
        <Route path="/projects/create" element={<PageWrapper><CreateProject /></PageWrapper>} />
        <Route path="/projects/:id" element={<PageWrapper><ProjectDetail /></PageWrapper>} />
        <Route path="/projects/:id/edit" element={<PageWrapper><EditProject /></PageWrapper>} />
        <Route path="/projects/:id/activities/create" element={<CreateProjectActivity />} />
        <Route path="/projects/:id/activities/:activityId" element={<ProjectActivityDetail />} />
        <Route path="/projects/:id/team" element={<ProjectTeamManagement />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/documentation" element={<Documentation />} />
        <Route path="/changelog" element={<PageWrapper><ChangelogPage /></PageWrapper>} />
        <Route path="/mobile-documentation" element={<MobileDocumentation />} />
        <Route path="/public-documentation" element={<PublicDocumentation />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/notification-preferences" element={<NotificationPreferences />} />
        <Route path="/notification-history" element={<NotificationHistory />} />
        <Route path="/notification-analytics" element={<NotificationAnalytics />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/wallet" element={<WalletPage />} />
        <Route path="/payroll" element={<PayrollPage />} />
        <Route path="/hr" element={<HRHub />} />
        <Route path="/leave" element={<LeaveRequests />} />
        <Route path="/admin/wallets" element={<AdminWallets />} />
        <Route path="/admin/wallets/:userId" element={<AdminWalletDetail />} />
        <Route path="/withdrawal-approval" element={<WithdrawalApproval />} />
        <Route path="/finance-approval" element={<FinanceApproval />} />
        <Route path="/down-payment-approval" element={<DownPaymentApproval />} />
        <Route path="/advance-requests-report" element={<AdvanceRequestsReport />} />
        <Route path="/down-payment-advance-report" element={<Navigate to="/advance-requests-report" replace />} />
        <Route path="/cost-predictions" element={<CostPredictions />} />
        <Route path="/exchange-rates" element={<ExchangeRates />} />
        <Route path="/supervisor-approvals" element={<SupervisorApprovals />} />
        <Route path="/cost-approval" element={<SupervisorApprovals />} />
        <Route path="/wallet-reports" element={<WalletReports />} />
        <Route path="/budget" element={<BudgetPage />} />
        <Route path="/cost-submission" element={<CostSubmission />} />
        <Route path="/cost-submission/reports" element={<CostSubmissionReports />} />
        <Route path="/questionnaire-analytics" element={<QuestionnaireAnalytics />} />
        <Route path="/dct-pdm" element={<DCTPDMDashboard />} />
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
        <Route path="/page-access" element={<PageAccessControl />} />
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
        <Route path="/approvals" element={<ApprovalsHub />} />
        <Route path="/approval-dashboard" element={<ApprovalDashboard />} />
        <Route path="/admin/monitoring" element={<MonitoringDashboard />} />
        <Route path="/audit-logs" element={<AuditLogs />} />
        <Route path="/login-analytics" element={<LoginAnalytics />} />
        <Route path="/email-tracking" element={<EmailTracking />} />
        <Route path="/email-management" element={<EmailManagement />} />
        <Route path="/admin/broadcast" element={<AdminBroadcast />} />
        <Route path="/admin/whatsapp" element={<AdminWhatsApp />} />
        <Route path="/admin/cycle-health" element={<AdminCycleHealth />} />
        <Route path="/admin/staff-profiles" element={<StaffDirectory />} />
        <Route path="/employees" element={<Employees />} />
        <Route path="/departments" element={<Departments />} />
        <Route path="/task-admin" element={<TaskAdmin />} />
        <Route path="/admin/project-flow-stages" element={<AdminProjectFlowStages />} />
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
        <Route path="/crm" element={<CRMDashboard />} />
        <Route path="/crm/partners" element={<CRMPartners />} />
        <Route path="/crm/contacts" element={<CRMContacts />} />
        <Route path="/crm/engagements" element={<CRMEngagements />} />
        <Route path="/crm/opportunities" element={<CRMOpportunities />} />
        <Route path="/surveys" element={<PageWrapper><SurveysPage /></PageWrapper>} />
        <Route path="/surveys/:id" element={<PageWrapper><SurveyDetail /></PageWrapper>} />
        <Route path="/surveys/:id/fill" element={<SurveyFill />} />
        <Route path="/workspace" element={<WorkspaceHub />} />
        <Route path="/field-operation-manager" element={<FieldOperationManager />} />
        <Route path="/mmp-management" element={<MMPManagementPage />} />
        <Route path="/integrations" element={<IntegrationsSettings />} />
        <Route path="/subscriptions" element={<PageWrapper><SubscriptionsPage /></PageWrapper>} />
        <Route path="/salary-retainer-report" element={<PageWrapper><SalaryRetainerReport /></PageWrapper>} />
        <Route path="/month-end-summary" element={<PageWrapper><MonthEndFinancialSummary /></PageWrapper>} />
        <Route path="/my-team" element={<PageWrapper><MyTeam /></PageWrapper>} />
        <Route path="/performance-reviews" element={<PageWrapper><PerformanceReviews /></PageWrapper>} />
        <Route path="/salary-increments" element={<PageWrapper><SalaryIncrements /></PageWrapper>} />
        <Route path="/positions" element={<PageWrapper><PositionsPage /></PageWrapper>} />
        <Route path="/training-certifications" element={<PageWrapper><TrainingCertificationsPage /></PageWrapper>} />
        <Route path="/hierarchy-audit" element={<PageWrapper><HierarchyAuditLogPage /></PageWrapper>} />
        <Route path="/accounting/coa" element={<SuperAdminRoute><PageWrapper><AccountingCOA /></PageWrapper></SuperAdminRoute>} />
        <Route path="/accounting/journals" element={<SuperAdminRoute><PageWrapper><AccountingJournals /></PageWrapper></SuperAdminRoute>} />
        <Route path="/accounting/trial-balance" element={<SuperAdminRoute><PageWrapper><AccountingTrialBalance /></PageWrapper></SuperAdminRoute>} />
        <Route path="/accounting/ledger" element={<SuperAdminRoute><PageWrapper><AccountingGeneralLedger /></PageWrapper></SuperAdminRoute>} />
        <Route path="/accounting/reports" element={<SuperAdminRoute><PageWrapper><AccountingFinancialStatements /></PageWrapper></SuperAdminRoute>} />
        <Route path="/accounting/bank-recon" element={<SuperAdminRoute><PageWrapper><AccountingBankRecon /></PageWrapper></SuperAdminRoute>} />
        <Route path="/accounting/fiscal-years" element={<SuperAdminRoute><PageWrapper><AccountingFiscalYears /></PageWrapper></SuperAdminRoute>} />
        <Route path="/accounting/funds" element={<SuperAdminRoute><PageWrapper><AccountingFunds /></PageWrapper></SuperAdminRoute>} />
        <Route path="/accounting/settings" element={<SuperAdminRoute><PageWrapper><AccountingSettings /></PageWrapper></SuperAdminRoute>} />
        <Route path="/accounting/budget-variance" element={<SuperAdminRoute><PageWrapper><AccountingBudgetVsActual /></PageWrapper></SuperAdminRoute>} />
        <Route path="/accounting/vendors" element={<SuperAdminRoute><PageWrapper><AccountingVendors /></PageWrapper></SuperAdminRoute>} />
        <Route path="/accounting/finance-dashboard" element={<SuperAdminRoute><PageWrapper><AccountingFinanceDashboard /></PageWrapper></SuperAdminRoute>} />
        <Route path="/accounting/purchase-orders" element={<SuperAdminRoute><PageWrapper><AccountingPurchaseOrders /></PageWrapper></SuperAdminRoute>} />
        <Route path="/accounting/ap-aging" element={<SuperAdminRoute><PageWrapper><AccountingAPAging /></PageWrapper></SuperAdminRoute>} />
        <Route path="/accounting/cash-flow" element={<SuperAdminRoute><PageWrapper><AccountingCashFlow /></PageWrapper></SuperAdminRoute>} />
        <Route path="/accounting/fixed-assets" element={<SuperAdminRoute><PageWrapper><AccountingFixedAssets /></PageWrapper></SuperAdminRoute>} />
        <Route path="/accounting/gl-bridge" element={<SuperAdminRoute><PageWrapper><AccountingGLBridge /></PageWrapper></SuperAdminRoute>} />
        <Route path="/finance/audit-trail" element={<SuperAdminRoute><PageWrapper><FinanceAuditTrail /></PageWrapper></SuperAdminRoute>} />
        {/* HR audit gaps H2-H5 */}
        <Route path="/my-advances" element={<PageWrapper><MyAdvances /></PageWrapper>} />
        <Route path="/my-expenses" element={<PageWrapper><MyExpenses /></PageWrapper>} />
        <Route path="/attendance" element={<PageWrapper><Attendance /></PageWrapper>} />
        <Route path="/offboarding" element={<PageWrapper><Offboarding /></PageWrapper>} />
      </Route>

      {/* Redirects */}
      <Route path="/mmp/view/:id" element={<MmpViewRedirect />} />
      <Route path="/projects/:id/team/add" element={<TeamAddRedirect />} />
      <Route path="/daily-work" element={<Navigate to="/my-tasks" replace />} />

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

  // ── Public PDM Report — bypass ALL session/auth/mobile guards ──────────────
  // This route has its own login gate (DCTPDMPublicPage) and must NEVER be
  // intercepted by SessionGuard, AuthGuard, MobilePermissionGuard, or any
  // notification/broadcast overlay.
  if (window.location.pathname === '/pdm-report') {
    // Auto-reload once if a stale chunk was the cause (common after Vercel deploys).
    // Uses a session flag so we don't loop endlessly on genuine errors.
    const PDMFallback = () => {
      useEffect(() => {
        const key = 'pdm_eb_reloaded';
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, '1');
          window.location.reload();
        }
      }, []);
      return (
        <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0F2041,#1D3461)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', padding: '32px', borderRadius: '12px', textAlign: 'center', maxWidth: '360px', boxShadow: '0 25px 50px rgba(0,0,0,0.4)' }}>
            <p style={{ color: '#DC2626', fontWeight: '700', marginBottom: '12px', fontSize: '15px' }}>Failed to load the report.</p>
            <p style={{ color: '#6B7280', fontSize: '12px', marginBottom: '16px' }}>This may be a temporary issue. Click Refresh to try again.</p>
            <button
              onClick={() => { sessionStorage.removeItem('pdm_eb_reloaded'); window.location.reload(); }}
              style={{ padding: '10px 20px', background: '#1D3461', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}
            >
              Refresh
            </button>
          </div>
        </div>
      );
    };
    return (
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
        <ErrorBoundary fallback={<PDMFallback />}>
          <QueryClientProvider client={queryClient}>
            <Router>
              <Suspense fallback={
                <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0F2041,#1D3461)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ color: '#fff', fontSize: '14px', opacity: 0.8 }}>Loading report…</div>
                </div>
              }>
                <Routes>
                  <Route path="/pdm-report" element={<DCTPDMPublicPage />} />
                </Routes>
              </Suspense>
            </Router>
          </QueryClientProvider>
        </ErrorBoundary>
      </ThemeProvider>
    );
  }

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
        <ErrorBoundary>
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
