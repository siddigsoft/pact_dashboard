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
const EnumeratorFeesReport = lazy(() => import('./pages/EnumeratorFeesReport'));
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
const SystemDiagrams = lazy(() => import('./pages/SystemDiagrams'));
const HubOperations = lazy(() => import('./pages/HubOperations'));
const HubManagement = lazy(() => import('./pages/HubManagement'));
const TrackerPreparationPlan = lazy(() => import('./pages/TrackerPreparationPlan'));
const NotificationsPage = lazy(() => import('./pages/Notifications'));
const Documentation = lazy(() => import('./pages/Documentation'));
const MobileDocumentation = lazy(() => import('./pages/MobileDocumentation'));
const PublicDocumentation = lazy(() => import('./pages/PublicDocumentation'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
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
const AccountingHub = lazy(() => import('./pages/AccountingHub'));
const PreFundingHub = lazy(() => import('./pages/PreFundingHub'));
const FinanceHub = lazy(() => import('./pages/FinanceHub'));
const FieldOpsHub = lazy(() => import('./pages/FieldOpsHub'));
const AnalyticsHub = lazy(() => import('./pages/AnalyticsHub'));
const AdminHub = lazy(() => import('./pages/AdminHub'));
const SuperAdminHub = lazy(() => import('./pages/SuperAdminHub'));
const CRMHub = lazy(() => import('./pages/CRMHub'));
const FieldDataHub = lazy(() => import('./pages/FieldDataHub'));
const FieldDataFormDetail = lazy(() => import('./pages/FieldDataFormDetail'));
const FieldDataStudyDetail = lazy(() => import('./pages/FieldDataStudyDetail'));
const ProgrammeHub = lazy(() => import('./pages/ProgrammeHub'));
const CommunicationHub = lazy(() => import('./pages/CommunicationHub'));
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
const AccountingPurchaseRequisitions = lazy(() => import('./pages/AccountingPurchaseRequisitions'));
const AccountingGRN        = lazy(() => import('./pages/AccountingGRN'));
const AccountingAPInvoices = lazy(() => import('./pages/AccountingAPInvoices'));
const AccountingChequeRegister = lazy(() => import('./pages/AccountingChequeRegister'));
const AccountingPeriodClose = lazy(() => import('./pages/AccountingPeriodClose'));
const CoverageMap = lazy(() => import('./pages/CoverageMap'));
const ExecutiveDashboard = lazy(() => import('./pages/ExecutiveDashboard'));
const AccountingTaxManagement = lazy(() => import('./pages/AccountingTaxManagement'));
const AccountingMultiCurrency = lazy(() => import('./pages/AccountingMultiCurrency'));
const AccountingBudgetEncumbrance = lazy(() => import('./pages/AccountingBudgetEncumbrance'));
const AccountingDonorReports = lazy(() => import('./pages/AccountingDonorReports'));
const AccountingSOD = lazy(() => import('./pages/AccountingSOD'));
const AccountingCashFlowForecast = lazy(() => import('./pages/AccountingCashFlowForecast'));
const AccountingGrants = lazy(() => import('./pages/AccountingGrants'));
const AccountingCostAllocation = lazy(() => import('./pages/AccountingCostAllocation'));
const AccountingDepreciationRun = lazy(() => import('./pages/AccountingDepreciationRun'));
const AccountingConsolidation = lazy(() => import('./pages/AccountingConsolidation'));
const AccountingBudgetPlanning = lazy(() => import('./pages/AccountingBudgetPlanning'));
const AccountingSearch = lazy(() => import('./pages/AccountingSearch'));
const AccountingGLAudit = lazy(() => import('./pages/AccountingGLAudit'));
const AccountingAMLCompliance = lazy(() => import('./pages/AccountingAMLCompliance'));
const AccountingIntercompany = lazy(() => import('./pages/AccountingIntercompany'));
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
import StaffOnboarding from './pages/StaffOnboarding';


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

const FinanceAdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { hasAnyRole } = useAuthorization();
  if (!hasAnyRole(['super_admin', 'admin', 'financialAdmin'])) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
};

// Pre-Funding: Finance and Admin roles only.
// Approvers from other roles participate via the Approvals Hub, not this full module.
const PreFundingRoute = ({ children }: { children: React.ReactNode }) => {
  const { hasAnyRole } = useAuthorization();
  // Finance/Admin → all tabs; Coordinator/Supervisor/FOM → overview+approvals+allocations;
  // Field staff (data_collector, dataTeam, employee) → overview+allocations.
  // Tab-level restrictions are enforced inside PreFundingHub itself.
  const allowed = hasAnyRole([
    'super_admin', 'admin', 'financialAdmin',
    'coordinator', 'supervisor', 'fom',
    'data_collector', 'dataTeam', 'employee',
  ]);
  if (!allowed) return <Navigate to="/dashboard" replace />;
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
    !['/', '/auth', '/login', '/register', '/registration-success', '/forgot-password', '/reset-password', '/documentation', '/mobile-documentation', '/email-preview', '/pdm-report', '/staff-onboarding', '/privacy-policy'].includes(location.pathname) &&
    !location.pathname.startsWith('/demo/') &&
    !location.pathname.startsWith('/view/') &&
    !(location.pathname.startsWith('/surveys/') && location.pathname.endsWith('/fill')) &&
    !location.pathname.startsWith('/s/')
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
      <Route path="/staff-onboarding" element={<Navigate to="/hr?tab=onboarding" replace />} />
      <Route path="/pdm-report" element={<DCTPDMPublicPage />} />
      <Route path="/privacy-policy" element={<PrivacyPolicy />} />
      <Route path="/view/:fileId" element={<FileViewer />} />
      <Route path="/surveys/:id/fill" element={<SurveyFill />} />
      <Route path="/s/:id" element={<SurveyFill />} />

      {/* Protected routes */}
  <Route element={<AuthGuard><MainLayout /></AuthGuard>}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/mmp" element={<MMP />} />
        <Route path="/mmp/upload" element={<MMPUpload />} />
        <Route path="/mmp/cycle-close" element={<MMPCycleClose />} />
        <Route path="/mmp/:id" element={<MMPDetailView />} />
        <Route path="/mmp/:id/view" element={<MMPDetailView />} />
        <Route path="/mmp/:id/edit" element={<EditMMP />} />
        <Route path="/mmp/edit/:id" element={<EditMMP />} />
        <Route path="/mmp/verify/:id" element={<MMPVerification />} />
        <Route path="/mmp/:id/detailed-verification" element={<MMPDetailedVerification />} />
        <Route path="/mmp/:id/verification" element={<MMPVerificationPage />} />
        <Route path="/mmp/:id/permit-message" element={<MMPPermitMessagePage />} />
        <Route path="/mmp/:id/review-assign-coordinators" element={<ReviewAssignCoordinators />} />
        {/* ── Analytics Hub ── */}
        <Route path="/analytics" element={<AnalyticsHub />} />
        <Route path="/data-export-center" element={<Navigate to="/analytics?tab=data-export-center" replace />} />
        <Route path="/calls" element={<Navigate to="/communication-hub?tab=calls" replace />} />
        <Route path="/communication-hub" element={<CommunicationHub />} />
        <Route path="/call-analytics" element={<CallAnalytics />} />
        <Route path="/field-team" element={<Navigate to="/field-ops?tab=field-team" replace />} />
        <Route path="/finance" element={<Finance />} />
        <Route path="/financial-operations" element={<Navigate to="/finance-hub?tab=financial-ops" replace />} />
        <Route path="/data-visibility" element={<Navigate to="/analytics?tab=data-visibility" replace />} />
        <Route path="/chat" element={<Navigate to="/communication-hub?tab=chat" replace />} />
        <Route path="/my-tasks" element={<PageWrapper><MyTasksPage /></PageWrapper>} />
        <Route path="/tasks/:id" element={<PageWrapper><TaskDetail /></PageWrapper>} />
        <Route path="/team-tasks" element={<PageWrapper><TeamTaskMonitor /></PageWrapper>} />
        <Route path="/projects" element={<PageWrapper><Projects /></PageWrapper>} />
        <Route path="/programme-hub" element={<ProgrammeHub />} />
        <Route path="/projects/analytics" element={<Navigate to="/programme-hub?tab=analytics" replace />} />
        <Route path="/portfolio" element={<Navigate to="/programme-hub?tab=portfolio" replace />} />
        <Route path="/projects/create" element={<PageWrapper><CreateProject /></PageWrapper>} />
        <Route path="/projects/:id" element={<PageWrapper><ProjectDetail /></PageWrapper>} />
        <Route path="/projects/:id/edit" element={<PageWrapper><EditProject /></PageWrapper>} />
        <Route path="/projects/:id/activities/create" element={<CreateProjectActivity />} />
        <Route path="/projects/:id/activities/:activityId" element={<ProjectActivityDetail />} />
        <Route path="/projects/:id/team" element={<ProjectTeamManagement />} />
        <Route path="/reports" element={<Navigate to="/analytics?tab=reports" replace />} />
        <Route path="/documentation" element={<Documentation />} />
        <Route path="/changelog" element={<PageWrapper><ChangelogPage /></PageWrapper>} />
        <Route path="/mobile-documentation" element={<MobileDocumentation />} />
        <Route path="/public-documentation" element={<PublicDocumentation />} />
        <Route path="/documents" element={<Navigate to="/analytics?tab=documents" replace />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/notification-preferences" element={<NotificationPreferences />} />
        <Route path="/notification-history" element={<NotificationHistory />} />
        <Route path="/notification-analytics" element={<NotificationAnalytics />} />
        <Route path="/settings" element={<Navigate to="/admin-hub?tab=settings" replace />} />
        <Route path="/wallet" element={<WalletPage />} />
        <Route path="/payroll" element={<Navigate to="/hr?tab=payroll" replace />} />
        <Route path="/hr" element={<HRHub />} />
        <Route path="/hr/payroll" element={<Navigate to="/hr?tab=payroll" replace />} />
        <Route path="/hr/retainer" element={<Navigate to="/hr?tab=retainer" replace />} />
        <Route path="/hr/leave" element={<Navigate to="/hr?tab=leave-requests" replace />} />
        <Route path="/hr/performance" element={<Navigate to="/hr?tab=performance" replace />} />
        <Route path="/hr/eosb" element={<Navigate to="/hr?tab=eosb" replace />} />
        <Route path="/hr/salary-advances" element={<Navigate to="/hr?tab=salary-advances" replace />} />
        <Route path="/leave" element={<Navigate to="/hr?tab=leave-requests" replace />} />
        <Route path="/finance-hub" element={<FinanceHub />} />
        <Route path="/admin/wallets" element={<Navigate to="/finance-hub?tab=admin-wallets" replace />} />
        <Route path="/admin/wallets/:userId" element={<AdminWalletDetail />} />
        <Route path="/withdrawal-approval" element={<WithdrawalApproval />} />
        <Route path="/finance-approval" element={<FinanceApproval />} />
        <Route path="/down-payment-approval" element={<DownPaymentApproval />} />
        <Route path="/advance-requests-report" element={<Navigate to="/finance-hub?tab=advance-report" replace />} />
        <Route path="/enumerator-fees-report" element={<EnumeratorFeesReport />} />
        <Route path="/down-payment-advance-report" element={<Navigate to="/finance-hub?tab=advance-report" replace />} />
        <Route path="/cost-predictions" element={<Navigate to="/finance-hub?tab=cost-predictions" replace />} />
        <Route path="/exchange-rates" element={<Navigate to="/finance-hub?tab=exchange-rates" replace />} />
        <Route path="/supervisor-approvals" element={<SupervisorApprovals />} />
        <Route path="/cost-approval" element={<SupervisorApprovals />} />
        <Route path="/wallet-reports" element={<Navigate to="/finance-hub?tab=wallet-reports" replace />} />
        <Route path="/budget" element={<Navigate to="/finance-hub?tab=budget" replace />} />
        <Route path="/cost-submission" element={<CostSubmission />} />
        <Route path="/cost-submission/reports" element={<CostSubmissionReports />} />
        <Route path="/questionnaire-analytics" element={<Navigate to="/analytics?tab=questionnaire-analytics" replace />} />
        <Route path="/dct-pdm" element={<Navigate to="/analytics?tab=dct-pdm" replace />} />
        <Route path="/mobile-cost-submission" element={<MobileCostSubmission />} />
        {/* ── Field Ops Hub ── */}
        <Route path="/field-ops" element={<FieldOpsHub />} />
        <Route path="/site-visits" element={<SiteVisits />} />
        <Route path="/site-visits/create" element={<CreateSiteVisit />} />
        <Route path="/site-visits/create/mmp" element={<CreateSiteVisitMMP />} />
        <Route path="/site-visits/create/mmp/:id" element={<CreateSiteVisitMMPDetail />} />
        <Route path="/site-visits/create/urgent" element={<CreateSiteVisitUrgent />} />
        <Route path="/site-visits/:id" element={<SiteVisitDetail />} />
        <Route path="/site-visits/:id/edit" element={<EditSiteVisit />} />
        {/* ── Admin Hub ── */}
        <Route path="/admin-hub" element={<AdminHub />} />
        <Route path="/users" element={<Navigate to="/admin-hub?tab=users" replace />} />
        <Route path="/users/:id" element={<UserDetail />} />
        <Route path="/classifications" element={<Navigate to="/admin-hub?tab=classifications" replace />} />
        <Route path="/classification-fees" element={<Navigate to="/admin-hub?tab=classification-fees" replace />} />
        <Route path="/retainer-management" element={<Navigate to="/hr?tab=retainer" replace />} />
        <Route path="/map" element={<Navigate to="/field-ops?tab=map" replace />} />
        <Route path="/advanced-map" element={<Navigate to="/field-ops?tab=map" replace />} />
        <Route path="/audit-compliance" element={<Navigate to="/admin-hub?tab=audit-compliance" replace />} />
        <Route path="/archive" element={<Navigate to="/analytics?tab=archive" replace />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/role-management" element={<Navigate to="/admin-hub?tab=role-management" replace />} />
        <Route path="/page-access" element={<Navigate to="/admin-hub?tab=page-access" replace />} />
        {/* ── Super Admin Hub ── */}
        <Route path="/super-admin-hub" element={<SuperAdminHub />} />
        <Route path="/super-admin-management" element={<Navigate to="/super-admin-hub?tab=super-admin" replace />} />
        <Route path="/super-admin-data" element={<Navigate to="/super-admin-hub?tab=data-management" replace />} />
  <Route path="/monitoring-plan" element={<MonitoringPlanPage />} />
  <Route path="/search" element={<GlobalSearchPage />} />
  {/* Coordinator: Sites for Verification */}
  <Route path="/coordinator/sites-for-verification" element={<SitesForVerification />} />
  <Route path="/coordinator/sites" element={<CoordinatorSites />} />
  {/* Supervisor: dedicated My Site Management page — same component as CoordinatorSites */}
  <Route path="/supervisor/sites" element={<CoordinatorSites />} />
  <Route path="/coordinator-dashboard" element={<CoordinatorDashboard />} />
  <Route path="/hub-operations" element={<Navigate to="/programme-hub?tab=hub-ops" replace />} />
  <Route path="/hub-management" element={<Navigate to="/admin-hub?tab=hub-management" replace />} />
        <Route path="/tracker-preparation-plan" element={<Navigate to="/programme-hub?tab=tracker-prep" replace />} />
        <Route path="/signatures" element={<Navigate to="/communication-hub?tab=signatures" replace />} />
        <Route path="/approvals" element={<ApprovalsHub />} />
        <Route path="/approval-dashboard" element={<Navigate to="/super-admin-hub?tab=approval-dashboard" replace />} />
        <Route path="/admin/monitoring" element={<Navigate to="/super-admin-hub?tab=system-monitoring" replace />} />
        <Route path="/audit-logs" element={<Navigate to="/super-admin-hub?tab=audit-logs" replace />} />
        <Route path="/login-analytics" element={<LoginAnalytics />} />
        <Route path="/email-tracking" element={<Navigate to="/super-admin-hub?tab=email-tracking" replace />} />
        <Route path="/email-management" element={<Navigate to="/super-admin-hub?tab=email-management" replace />} />
        <Route path="/admin/broadcast" element={<Navigate to="/communication-hub?tab=broadcast" replace />} />
        <Route path="/admin/whatsapp" element={<Navigate to="/communication-hub?tab=whatsapp" replace />} />
        <Route path="/admin/cycle-health" element={<Navigate to="/super-admin-hub?tab=cycle-health" replace />} />
        <Route path="/admin/staff-profiles" element={<StaffDirectory />} />
        <Route path="/employees" element={<Employees />} />
        <Route path="/departments" element={<Navigate to="/admin-hub?tab=departments" replace />} />
        <Route path="/task-admin" element={<Navigate to="/admin-hub?tab=task-admin" replace />} />
        <Route path="/admin/project-flow-stages" element={<Navigate to="/admin-hub?tab=project-flow-stages" replace />} />
        <Route path="/admin/transaction-scanner" element={<Navigate to="/super-admin-hub?tab=transaction-scanner" replace />} />
        <Route path="/permissions-management" element={<Navigate to="/super-admin-hub?tab=permissions" replace />} />
        <Route path="/role-perspective" element={<RolePerspectiveViewer />} />
        <Route path="/support-contacts" element={<SupportContacts />} />
        <Route path="/mobile-support-tickets" element={<MobileSupportTickets />} />
        <Route path="/mobile-help-articles" element={<Navigate to="/super-admin-hub?tab=mobile-help-articles" replace />} />
        <Route path="/mobile-signatures" element={<Navigate to="/super-admin-hub?tab=mobile-signatures" replace />} />
        <Route path="/mobile-call-scheduling" element={<Navigate to="/super-admin-hub?tab=mobile-call-scheduling" replace />} />
        <Route path="/mobile-document-sync" element={<Navigate to="/super-admin-hub?tab=mobile-document-sync" replace />} />
        <Route path="/reconciliation-dashboard" element={<Navigate to="/finance-hub?tab=reconciliation" replace />} />
        <Route path="/safety-hub" element={<Navigate to="/field-ops?tab=safety-hub" replace />} />
        <Route path="/incident-reports" element={<Navigate to="/field-ops?tab=incident-reports" replace />} />
        <Route path="/equipment" element={<Navigate to="/field-ops?tab=equipment" replace />} />
        <Route path="/monitoring-form" element={<Navigate to="/field-ops?tab=monitoring-form" replace />} />
        <Route path="/coverage-map" element={<Navigate to="/field-ops?tab=coverage-map" replace />} />
        <Route path="/field-operation-manager" element={<Navigate to="/field-ops?tab=field-operation-manager" replace />} />
        <Route path="/helpline" element={<Helpline />} />
        <Route path="/crm" element={<CRMHub />} />
        <Route path="/crm/partners" element={<Navigate to="/crm?tab=partners" replace />} />
        <Route path="/crm/contacts" element={<Navigate to="/crm?tab=contacts" replace />} />
        <Route path="/crm/engagements" element={<Navigate to="/crm?tab=engagements" replace />} />
        <Route path="/crm/opportunities" element={<Navigate to="/crm?tab=pipeline" replace />} />
        <Route path="/field-data" element={<PageWrapper><FieldDataHub /></PageWrapper>} />
        <Route path="/field-data/studies/:id" element={<PageWrapper><FieldDataStudyDetail /></PageWrapper>} />
        <Route path="/field-data/datasets" element={<Navigate to="/field-data" replace />} />
        <Route path="/field-data/sampling" element={<Navigate to="/field-data" replace />} />
        <Route path="/field-data/studies" element={<Navigate to="/field-data" replace />} />
        <Route path="/field-data/quality" element={<Navigate to="/field-data" replace />} />
        <Route path="/field-data/monitoring" element={<Navigate to="/field-data" replace />} />
        <Route path="/field-data/cases" element={<Navigate to="/field-data" replace />} />
        <Route path="/field-data/workflow" element={<Navigate to="/field-data" replace />} />
        <Route path="/field-data/exports" element={<Navigate to="/field-data" replace />} />
        <Route path="/field-data/languages" element={<Navigate to="/field-data" replace />} />
        <Route path="/field-data/collaboration" element={<Navigate to="/field-data" replace />} />
        <Route path="/field-data/backup" element={<Navigate to="/field-data" replace />} />
        <Route path="/field-data/api" element={<Navigate to="/field-data" replace />} />
        <Route path="/field-data/notifications" element={<Navigate to="/field-data" replace />} />
        <Route path="/field-data/:id" element={<PageWrapper><FieldDataFormDetail /></PageWrapper>} />
        <Route path="/surveys" element={<PageWrapper><SurveysPage /></PageWrapper>} />
        <Route path="/surveys/:id" element={<PageWrapper><SurveyDetail /></PageWrapper>} />
        <Route path="/workspace" element={<WorkspaceHub />} />
        <Route path="/field-operation-manager" element={<FieldOperationManager />} />
        <Route path="/mmp-management" element={<MMPManagementPage />} />
        <Route path="/integrations" element={<IntegrationsSettings />} />
        <Route path="/subscriptions" element={<Navigate to="/finance-hub?tab=subscriptions" replace />} />
        <Route path="/salary-retainer-report" element={<Navigate to="/finance-hub?tab=salary-retainer" replace />} />
        <Route path="/month-end-summary" element={<Navigate to="/finance-hub?tab=month-end" replace />} />
        <Route path="/my-team" element={<PageWrapper><MyTeam /></PageWrapper>} />
        <Route path="/performance-reviews" element={<Navigate to="/hr?tab=performance" replace />} />
        <Route path="/salary-increments" element={<Navigate to="/hr?tab=salary-increments" replace />} />
        <Route path="/positions" element={<Navigate to="/hr?tab=positions" replace />} />
        <Route path="/training-certifications" element={<Navigate to="/hr?tab=training" replace />} />
        <Route path="/hierarchy-audit" element={<PageWrapper><HierarchyAuditLogPage /></PageWrapper>} />
        <Route path="/system-diagrams" element={<SuperAdminRoute><SystemDiagrams /></SuperAdminRoute>} />
        <Route path="/accounting" element={<SuperAdminRoute><AccountingHub /></SuperAdminRoute>} />
        <Route path="/pre-funding" element={<PreFundingRoute><PageWrapper><PreFundingHub /></PageWrapper></PreFundingRoute>} />
        <Route path="/pre-funding/overview" element={<Navigate to="/pre-funding?tab=overview" replace />} />
        <Route path="/pre-funding/registry" element={<Navigate to="/pre-funding?tab=registry" replace />} />
        <Route path="/pre-funding/approvals" element={<Navigate to="/pre-funding?tab=approvals" replace />} />
        <Route path="/pre-funding/reconciliation" element={<Navigate to="/pre-funding?tab=reconciliation" replace />} />
        <Route path="/pre-funding/settings" element={<Navigate to="/pre-funding?tab=settings" replace />} />
        <Route path="/pre-funding/report" element={<Navigate to="/pre-funding?tab=report" replace />} />
        <Route path="/accounting/coa" element={<Navigate to="/accounting?tab=coa" replace />} />
        <Route path="/accounting/journals" element={<Navigate to="/accounting?tab=journals" replace />} />
        <Route path="/accounting/trial-balance" element={<Navigate to="/accounting?tab=trial-balance" replace />} />
        <Route path="/accounting/ledger" element={<Navigate to="/accounting?tab=ledger" replace />} />
        <Route path="/accounting/reports" element={<Navigate to="/accounting?tab=reports" replace />} />
        <Route path="/accounting/bank-recon" element={<Navigate to="/accounting?tab=bank-recon" replace />} />
        <Route path="/accounting/fiscal-years" element={<Navigate to="/accounting?tab=fiscal-years" replace />} />
        <Route path="/accounting/funds" element={<Navigate to="/accounting?tab=funds" replace />} />
        <Route path="/accounting/settings" element={<Navigate to="/accounting?tab=settings" replace />} />
        <Route path="/accounting/budget-variance" element={<Navigate to="/accounting?tab=budget-variance" replace />} />
        <Route path="/accounting/vendors" element={<Navigate to="/accounting?tab=vendors" replace />} />
        <Route path="/accounting/finance-dashboard" element={<Navigate to="/accounting?tab=finance-dashboard" replace />} />
        <Route path="/accounting/purchase-orders" element={<Navigate to="/accounting?tab=purchase-orders" replace />} />
        <Route path="/accounting/ap-aging" element={<Navigate to="/accounting?tab=ap-aging" replace />} />
        <Route path="/accounting/cash-flow" element={<Navigate to="/accounting?tab=cash-flow" replace />} />
        <Route path="/accounting/fixed-assets" element={<Navigate to="/accounting?tab=fixed-assets" replace />} />
        <Route path="/accounting/gl-bridge" element={<Navigate to="/accounting?tab=gl-bridge" replace />} />
        <Route path="/accounting/purchase-requisitions" element={<Navigate to="/accounting?tab=purchase-requisitions" replace />} />
        <Route path="/accounting/grn" element={<Navigate to="/accounting?tab=grn" replace />} />
        <Route path="/accounting/ap-invoices" element={<Navigate to="/accounting?tab=ap-invoices" replace />} />
        <Route path="/accounting/cheque-register" element={<Navigate to="/accounting?tab=cheque-register" replace />} />
        <Route path="/accounting/period-close" element={<Navigate to="/accounting?tab=period-close" replace />} />
        <Route path="/coverage-map" element={<PageWrapper><CoverageMap /></PageWrapper>} />
        <Route path="/executive" element={<SuperAdminRoute><PageWrapper><ExecutiveDashboard /></PageWrapper></SuperAdminRoute>} />
        <Route path="/accounting/tax" element={<Navigate to="/accounting?tab=tax" replace />} />
        <Route path="/accounting/multi-currency" element={<Navigate to="/accounting?tab=multi-currency" replace />} />
        <Route path="/accounting/budget-encumbrance" element={<Navigate to="/accounting?tab=budget-encumbrance" replace />} />
        <Route path="/accounting/donor-reports" element={<Navigate to="/accounting?tab=donor-reports" replace />} />
        <Route path="/accounting/sod" element={<Navigate to="/accounting?tab=sod" replace />} />
        <Route path="/accounting/cash-flow-forecast" element={<Navigate to="/accounting?tab=cash-flow-forecast" replace />} />
        <Route path="/accounting/grants" element={<Navigate to="/accounting?tab=grants" replace />} />
        <Route path="/accounting/cost-allocation" element={<Navigate to="/accounting?tab=cost-allocation" replace />} />
        <Route path="/accounting/depreciation-run" element={<Navigate to="/accounting?tab=depreciation-run" replace />} />
        <Route path="/accounting/consolidation" element={<Navigate to="/accounting?tab=consolidation" replace />} />
        <Route path="/accounting/budget-planning" element={<Navigate to="/accounting?tab=budget-planning" replace />} />
        <Route path="/accounting/search" element={<Navigate to="/accounting?tab=search" replace />} />
        <Route path="/accounting/gl-audit" element={<Navigate to="/accounting?tab=gl-audit" replace />} />
        <Route path="/accounting/aml" element={<Navigate to="/accounting?tab=aml" replace />} />
        <Route path="/accounting/intercompany" element={<Navigate to="/accounting?tab=intercompany" replace />} />
        <Route path="/finance/audit-trail" element={<Navigate to="/accounting?tab=finance-audit-trail" replace />} />
        {/* HR audit gaps H2-H5 */}
        <Route path="/my-advances" element={<PageWrapper><MyAdvances /></PageWrapper>} />
        <Route path="/my-expenses" element={<PageWrapper><MyExpenses /></PageWrapper>} />
        <Route path="/attendance" element={<Navigate to="/hr?tab=attendance" replace />} />
        <Route path="/offboarding" element={<Navigate to="/hr?tab=offboarding" replace />} />
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
