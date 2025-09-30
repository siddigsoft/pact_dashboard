import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ThemeProvider } from 'next-themes';

// Import our new AppProviders
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
import EditMMP from './pages/EditMMP';
import NotFound from './pages/NotFound';
import Calls from './pages/Calls';
import Chat from './pages/Chat';
import FieldTeam from './pages/FieldTeam';
import Finance from './pages/Finance';
import Reports from './pages/Reports';
import Projects from './pages/Projects';
import CreateProject from './pages/CreateProject';
import CreateProjectActivity from './pages/CreateProjectActivity';
import ProjectDetail from './pages/ProjectDetail';
import EditProject from './pages/EditProject';
import ProjectTeamManagement from './pages/ProjectTeamManagement';
import Settings from './pages/Settings';
import SiteVisits from './pages/SiteVisits';
import SiteVisitDetail from './pages/SiteVisitDetail';
import CreateSiteVisit from './pages/CreateSiteVisit';
import CreateSiteVisitMMP from './pages/CreateSiteVisitMMP';
import CreateSiteVisitMMPDetail from './pages/CreateSiteVisitMMPDetail';
import CreateSiteVisitUrgent from './pages/CreateSiteVisitUrgent';
import AdvancedMap from './pages/AdvancedMap';
import DataVisibility from './pages/DataVisibility';
import Users from './pages/Users';
import UserDetail from './pages/UserDetail';
import Wallet from './pages/Wallet';
import AuditCompliance from './pages/AuditCompliance';
import Archive from './pages/Archive';
import Calendar from './pages/Calendar';

// Components
import MainLayout from './components/MainLayout';
import { Toaster } from './components/ui/toaster';
import { Toaster as SonnerToaster } from './components/ui/sonner';
import { useAppContext } from './context/AppContext';
import ErrorBoundary from './components/ErrorBoundary';

// Custom redirect component to handle dynamic path parameters
const MmpViewRedirect = () => {
  const location = useLocation();
  const mmpId = location.pathname.split('/').pop();
  return <Navigate to={`/mmp/${mmpId}/view`} replace />;
};

// Auth guard component to check if user is logged in
const AuthGuard = ({ children }) => {
  const location = useLocation();
  const { currentUser } = useAppContext();
  
  // Don't redirect if already on auth-related pages
  if (!currentUser && 
      !['/auth', '/login', '/register', '/registration-success', '/forgot-password'].includes(location.pathname)) {
    return <Navigate to="/auth" replace />;
  }
  
  return children;
};

// Main routes component - separated to ensure context is available
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
        <Route path="/projects/:id/team" element={<ProjectTeamManagement />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/site-visits" element={<SiteVisits />} />
        <Route path="/site-visits/create" element={<CreateSiteVisit />} />
        <Route path="/site-visits/create/mmp" element={<CreateSiteVisitMMP />} />
        <Route path="/site-visits/create/mmp/:id" element={<CreateSiteVisitMMPDetail />} />
        <Route path="/site-visits/create/urgent" element={<CreateSiteVisitUrgent />} />
        <Route path="/site-visits/:id" element={<SiteVisitDetail />} />
        <Route path="/users" element={<Users />} />
        <Route path="/users/:id" element={<UserDetail />} />
        <Route path="/map" element={<AdvancedMap />} />
        <Route path="/advanced-map" element={<Navigate to="/map" replace />} />
        <Route path="/wallet" element={<Wallet />} />
        <Route path="/audit-compliance" element={<AuditCompliance />} />
        <Route path="/archive" element={<Archive />} />
        <Route path="/calendar" element={<Calendar />} />
      </Route>
      
      {/* Redirects */}
      <Route path="/mmp/view/:id" element={<MmpViewRedirect />} />
      
      {/* Catch-all route */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

function App() {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
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
