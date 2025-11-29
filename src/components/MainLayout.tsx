import React, { useState, useEffect } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import AppSidebar from "@/components/AppSidebar";
import Navbar from "@/components/Navbar";
import MobileAppHeader from "@/components/MobileAppHeader";
import { useAppContext } from "@/context/AppContext";
import { useViewMode } from "@/context/ViewModeContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UpdateDialog } from "@/components/UpdateDialog";
import { OnlineOfflineToggle } from "@/components/common/OnlineOfflineToggle";
import { NotificationInitializer } from "@/components/NotificationInitializer";

interface MainLayoutContentProps {
  children?: React.ReactNode;
}

const MainLayoutContent: React.FC<MainLayoutContentProps> = ({ children }) => {
  // Get app context - now this will be available since we've fixed the provider order
  const { currentUser } = useAppContext();
  const navigate = useNavigate();
  const location = useLocation();
  const [isAuthorized, setIsAuthorized] = useState<boolean>(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { viewMode } = useViewMode();
  const isMobile = viewMode === 'mobile';
  
  const getPageTitle = () => {
    const path = location.pathname;
    if (path === '/dashboard') return 'Dashboard';
    if (path === '/field-team') return 'Field Map';
    if (path === '/site-visits') return 'Site Visits';
    if (path === '/mmp') return 'MMP Files';
    if (path === '/users') return 'Team Members';
    if (path.startsWith('/projects')) return 'Projects';
    if (path === '/archive') return 'Archives';
    return 'PACT Platform';
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
        <div className="min-h-screen flex w-full">
          {!isMobile && <AppSidebar />}
          <SidebarInset className={`${isMobile ? 'bg-gray-50 dark:bg-gray-900' : ''} relative z-0 flex flex-col min-w-0 overflow-x-hidden`}>
            {isMobile ? (
              <MobileAppHeader 
                toggleSidebar={toggleSidebar} 
                title={getPageTitle()}
                showNotification={true}
              />
            ) : (
              <Navbar />
            )}
            <div className={`flex-1 ${isMobile ? 'px-3 pt-safe' : 'p-4 md:p-6 lg:p-8'} ${isMobile ? 'bg-gray-50 dark:bg-gray-900 scroll-container' : 'bg-slate-50/70 dark:bg-gray-900/70'} overflow-y-auto relative z-0 min-w-0`}>
              {children || <Outlet />}
            </div>
            {isMobile && null}
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
