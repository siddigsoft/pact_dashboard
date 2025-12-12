import React, { useState, useEffect } from "react";
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
    if (path === '/dashboard') return 'Dashboard';
    if (path === '/field-team') return 'Field Map';
    if (path === '/site-visits') return 'Site Visits';
    if (path === '/mmp') return 'MMP Files';
    if (path === '/users') return 'Team Members';
    if (path.startsWith('/projects')) return 'Projects';
    if (path === '/archive') return 'Archives';
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

  return (
    <TooltipProvider>
      <UpdateDialog />
      <NotificationInitializer />
      <SidebarProvider>
        <div className={`min-h-screen flex w-full ${isTransitioning ? 'transition-all duration-300 ease-in-out' : ''}`}>
          {!isMobile && !isTablet && <AppSidebar />}
          <SidebarInset className={`${isMobile ? 'bg-gray-50 dark:bg-gray-900' : ''} relative z-0 flex flex-col min-w-0 overflow-x-hidden min-h-0`}>
            {isMobile ? (
              <MobileAppHeader
                toggleSidebar={toggleSidebar}
                title={getPageTitle()}
                showNotification={true}
              />
            ) : isTablet ? (
              <TabletNavigation />
            ) : (
              <Navbar />
            )}
            {/* Global Refresh Bar - Available on all pages */}
            <GlobalRefreshBar />
            <div className={`flex-1 flex flex-col ${isMobile ? 'px-1 pb-12 pt-0.5' : 'p-1 md:p-1.5 lg:p-2'} ${isMobile ? 'bg-gray-50 dark:bg-gray-900 overflow-hidden' : 'bg-slate-50/70 dark:bg-gray-900/70 scroll-container overflow-y-auto'} relative z-0 min-w-0 min-h-0`}>
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
