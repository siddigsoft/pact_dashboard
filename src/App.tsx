import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ThemeProvider } from 'next-themes';

// Import AppProviders
import { AppProviders } from './context/AppContext';

// Pages
import Index from './pages/Index';
import Auth from './pages/Auth';
import Register from './pages/Register';
import RegistrationSuccess from './pages/RegistrationSuccess';
import ForgotPassword from './pages/ForgotPassword';
import Dashboard from './pages/Dashboard';
import MMP from './pages/MMP';
import MMPUpload from './pages/MMPUpload';
import MMPDetail from './pages/MMPDetail';
import MMPDetailView from './pages/MMPDetailView';
import MMPVerification from './pages/MMPVerification';
import MMPDetailedVerification from './pages/MMPDetailedVerification';
import MMPVerificationPage from './pages/MMPVerificationPage';
import MMPPermitMessagePage from './pages/mmp/MMPPermitMessagePage';
import EditMMP from './pages/EditMMP';
import NotFound from './pages/NotFound';
import ReviewAssignCoordinators from './pages/ReviewAssignCoordinators';
import SitesForVerification from './pages/coordinator/SitesForVerification';
import CoordinatorSites from './pages/coordinator/CoordinatorSites';
import Calls from './pages/Calls';
import Chat from './pages/Chat';
import FieldTeam from './pages/FieldTeam';
import Finance from './pages/Finance';
import Reports from './pages/Reports';
import Projects from './pages/Projects';
import CreateProject from './pages/CreateProject';
import CreateProjectActivity from './pages/CreateProjectActivity';
import ProjectActivityDetail from './pages/ProjectActivityDetail';
import ProjectDetail from './pages/ProjectDetail';
import EditProject from './pages/EditProject';
import ProjectTeamManagement from './pages/ProjectTeamManagement';
import Settings from './pages/Settings';
import SiteVisits from './pages/SiteVisits';
import SiteVisitDetail from './pages/SiteVisitDetail';
import EditSiteVisit from './pages/EditSiteVisit';
import CreateSiteVisit from './pages/CreateSiteVisit';
import CreateSiteVisitMMP from './pages/CreateSiteVisitMMP';
import CreateSiteVisitMMPDetail from './pages/CreateSiteVisitMMPDetail';
import CreateSiteVisitUrgent from './pages/CreateSiteVisitUrgent';
import AdvancedMap from './pages/AdvancedMap';
import DataVisibility from './pages/DataVisibility';
import Users from './pages/Users';
import UserDetail from './pages/UserDetail';
import AuditCompliance from './pages/AuditCompliance';
import Archive from './pages/Archive';
import Calendar from './pages/Calendar';
import RoleManagement from './pages/RoleManagement';
import MonitoringPlanPage from './pages/MonitoringPlanPage';
import FieldOperationManagerPage from './pages/FieldOperationManager';
import GlobalSearchPage from './pages/GlobalSearchPage';
import WalletPage from './pages/Wallet';
import AdminWallets from './pages/AdminWallets';
import AdminWalletDetail from './pages/AdminWalletDetail';

// Components
import MainLayout from './components/MainLayout';
import { Toaster } from './components/ui/toaster';
import { Toaster as SonnerToaster } from './components/ui/sonner';
import { useAppContext } from './context/AppContext';
import ErrorBoundary from './components/ErrorBoundary';
import { debugDatabase } from './utils/debug-db';

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
    !['/auth', '/login', '/register', '/registration-success', '/forgot-password'].includes(location.pathname)
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

      {/* Protected routes */}
  <Route element={<AuthGuard><MainLayout /></AuthGuard>}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/mmp" element={<MMP />} />
        <Route path="/mmp/upload" element={<MMPUpload />} />
        <Route path="/mmp/:id" element={<MMPDetail />} />
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
        <Route path="/settings" element={<Settings />} />
        <Route path="/wallet" element={<WalletPage />} />
        <Route path="/admin/wallets" element={<AdminWallets />} />
        <Route path="/admin/wallets/:userId" element={<AdminWalletDetail />} />
        <Route path="/site-visits" element={<SiteVisits />} />
        <Route path="/site-visits/create" element={<CreateSiteVisit />} />
        <Route path="/site-visits/create/mmp" element={<CreateSiteVisitMMP />} />
        <Route path="/site-visits/create/mmp/:id" element={<CreateSiteVisitMMPDetail />} />
        <Route path="/site-visits/create/urgent" element={<CreateSiteVisitUrgent />} />
        <Route path="/site-visits/:id" element={<SiteVisitDetail />} />
        <Route path="/site-visits/:id/edit" element={<EditSiteVisit />} />
        <Route path="/users" element={<Users />} />
        <Route path="/users/:id" element={<UserDetail />} />
        <Route path="/map" element={<AdvancedMap />} />
        <Route path="/advanced-map" element={<Navigate to="/map" replace />} />
        <Route path="/audit-compliance" element={<AuditCompliance />} />
        <Route path="/archive" element={<Archive />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/role-management" element={<RoleManagement />} />
  <Route path="/monitoring-plan" element={<MonitoringPlanPage />} />
  <Route path="/field-operation-manager" element={<FieldOperationManagerPage />} />
  <Route path="/search" element={<GlobalSearchPage />} />
  {/* Coordinator: Sites for Verification */}
  <Route path="/coordinator/sites-for-verification" element={<SitesForVerification />} />
  <Route path="/coordinator/sites" element={<CoordinatorSites />} />
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
          <Router>
            <AppProviders>
                <AppRoutes />
                <Toaster />
                <SonnerToaster />
            </AppProviders>
          </Router>
        </ErrorBoundary>
      )}
    </ThemeProvider>
  );
}

export default App;
