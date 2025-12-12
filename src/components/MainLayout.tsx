import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import AppSidebar from "@/components/AppSidebar";
import Navbar from "@/components/Navbar";
import MobileAppHeader from "@/components/MobileAppHeader";
import TabletNavigation from '@/components/TabletNavigation';
import { useAppContext } from "@/context/AppContext";
import { useViewMode } from "@/context/ViewModeContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UpdateDialog } from "@/components/UpdateDialog";
import { OnlineOfflineToggle } from "@/components/common/OnlineOfflineToggle";
import { GlobalRefreshBar } from "@/components/GlobalRefreshBar";
import { NotificationInitializer } from "@/components/NotificationInitializer";
import { MobileBottomNav } from "@/components/mobile/MobileBottomNav";
import { useLiveDashboard } from "@/hooks/useLiveDashboard";
import { RealtimeBanner } from "@/components/realtime";
import { queryClient } from "@/lib/queryClient";

interface MainLayoutContentProps {
  children?: React.ReactNode;
}

const MainLayoutContent: React.FC<MainLayoutContentProps> = ({ children }) => {
  const { currentUser } = useAppContext();
  const navigate = useNavigate();
  const location = useLocation();
  const [isAuthorized, setIsAuthorized] = useState<boolean>(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { viewMode, isTransitioning } = useViewMode();
  const isMobile = viewMode === 'mobile';
  const isTablet = viewMode === 'tablet';
  
  const getPageTitle = () => {
    const path = location.pathname;
    
    // Exact matches
    const exactMatches: { [key: string]: string } = {
      '/dashboard': 'Dashboard',
      '/field-team': 'Field Map',
      '/site-visits': 'Site Visits',
      '/mmp': 'MMP Files',
      '/users': 'Team Members',
      '/archive': 'Archives',
      '/calls': 'Calls',
      '/chat': 'Chat',
      '/finance': 'Finance',
      '/reports': 'Reports',
      '/settings': 'Settings',
      '/advanced-map': 'Advanced Map',
      '/data-visibility': 'Data Visibility',
      '/audit-compliance': 'Audit & Compliance',
      '/calendar': 'Calendar',
      '/role-management': 'Role Management',
      '/monitoring-plan': 'Monitoring Plan',
      '/field-operation-manager': 'Field Operations',
      '/global-search': 'Search Results',
      '/admin/wallets': 'Admin Wallets',
      '/admin/approvals/withdrawal': 'Withdrawal Approvals',
      '/admin/approvals/finance': 'Finance Approvals',
      '/admin/approvals/down-payment': 'Down-payment Approvals',
      '/supervisor/approvals': 'Supervisor Approvals',
      '/reports/wallet': 'Wallet Reports',
      '/budget': 'Budget',
      '/classifications': 'Classifications',
      '/classifications/fees': 'Fee Management',
      '/cost-submission': 'Cost Submission',
      '/demo/data-collector': 'Demo',
      '/financial-operations': 'Financial Operations',
      '/super-admin': 'Super Admin',
      '/hub-operations': 'Hub Operations',
      '/tracker-preparation-plan': 'Tracker Plan',
      '/documentation': 'Documentation',
      '/signatures': 'Signatures',
      '/documents': 'Documents',
      '/mmp/upload': 'Upload MMP',
      '/mmp/verification': 'MMP Verification',
      '/mmp/verification-page': 'MMP Verification',
      '/review-assign-coordinators': 'Assign Coordinators',
      '/coordinator-dashboard': 'Coordinator Dashboard',
      '/coordinator/sites-for-verification': 'Sites For Verification',
      '/coordinator/sites': 'Coordinator Sites',
      '/projects/create': 'Create Project',
      '/site-visits/create': 'Create Site Visit',
      '/site-visits/create/mmp': 'Create MMP Site Visit',
      '/site-visits/create/urgent': 'Create Urgent Site Visit',
    };

    if (exactMatches[path]) {
      return exactMatches[path];
    }

    // Dynamic matches
    if (path.startsWith('/projects/')) return 'Projects';
    if (path.startsWith('/mmp/')) return 'MMP Details';
    if (path.startsWith('/users/')) return 'User Details';
    if (path.startsWith('/site-visits/')) return 'Site Visit Details';
    if (path.startsWith('/admin/wallets/')) return 'Wallet Details';

    return 'PACT Command Center';
  };

  useEffect(() => {
    if (!currentUser) {
      navigate("/auth");
    } else {
      setIsAuthorized(true);
    }
  }, [currentUser, navigate]);

  if (!isAuthorized) {
    return null;
  }

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const isHomeRoute = location.pathname === '/dashboard';
  const isNotificationsPage = location.pathname === '/notifications';
  const isWalletPage = location.pathname === '/wallet';
  const isChatPage = location.pathname === '/chat';
  const isCallsPage = location.pathname === '/calls';
  const isDashboardPage = location.pathname === '/dashboard';
  const isSettingsPage = location.pathname === '/settings';
  const isSiteVisitsPage = location.pathname === '/site-visits' || location.pathname.startsWith('/site-visits/');
  const isFieldTeamPage = location.pathname === '/field-team';
  const isCalendarPage = location.pathname === '/calendar';
  const isSignaturesPage = location.pathname === '/signatures';
  const isCostSubmissionPage = location.pathname === '/cost-submission';
  
  // Pages with custom headers (hide MobileAppHeader)
  const pagesWithCustomHeaders = isNotificationsPage || isWalletPage || isChatPage || isCallsPage;
  
  // Pages that should not show the refresh bar
  const pagesWithoutRefreshBar = isNotificationsPage || isWalletPage || isChatPage || isCallsPage || isDashboardPage || isSettingsPage || isSiteVisitsPage || isFieldTeamPage || isCalendarPage || isSignaturesPage || isCostSubmissionPage;

  const handleGlobalRefresh = useCallback(async () => {
    await queryClient.invalidateQueries();
  }, []);

  return (
    <TooltipProvider>
      <UpdateDialog />
      <NotificationInitializer />
      <SidebarProvider>
        <div className={`min-h-screen flex w-full ${isTransitioning ? 'transition-all duration-300 ease-in-out' : ''}`}>
          {!isMobile && !isTablet && <AppSidebar />}
          <SidebarInset className={`${isMobile ? 'bg-gray-50 dark:bg-gray-900' : ''} relative z-0 flex flex-col min-w-0 overflow-x-hidden min-h-0`}>
            {/* Realtime Connection Banner - Shows when offline/reconnecting */}
            <RealtimeBanner 
              onRefresh={handleGlobalRefresh}
              dismissible={true}
              showOnlyWhenDisconnected={true}
            />
            {isMobile ? (
              !pagesWithCustomHeaders && (
                <MobileAppHeader
                  toggleSidebar={toggleSidebar}
                  title={getPageTitle()}
                  showNotification={true}
                />
              )
            ) : isTablet ? (
              <TabletNavigation />
            ) : (
              <Navbar />
            )}
            {/* Global Refresh Bar - Hidden on specific mobile pages */}
            {!(isMobile && pagesWithoutRefreshBar) && <GlobalRefreshBar />}
            <div className={`flex-1 flex flex-col ${isMobile ? (pagesWithCustomHeaders ? 'px-0 pb-12 pt-0' : (pagesWithoutRefreshBar ? 'px-1 pb-12 pt-16' : 'px-1 pb-12 pt-10')) : 'p-1 md:p-1.5 lg:p-2'} ${isMobile ? 'bg-gray-50 dark:bg-gray-900 overflow-y-auto overflow-x-hidden' : 'bg-slate-50/70 dark:bg-gray-900/70 scroll-container overflow-y-auto'} relative z-0 min-w-0 min-h-0`}>
              {children || <Outlet />}
            </div>
            {isMobile && <MobileBottomNav />}
            <OnlineOfflineToggle variant="floating" />
          </SidebarInset>
        </div>
      </SidebarProvider>
    </TooltipProvider>
  );
};

interface MainLayoutProps {
  children?: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => (
  <MainLayoutContent>{children}</MainLayoutContent>
);

export default MainLayout;
