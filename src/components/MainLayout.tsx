import React, { useState, useEffect } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import AppSidebar from "@/components/AppSidebar";
import Navbar from "@/components/Navbar";
import MobileNavigation from "@/components/MobileNavigation";
import MobileAppHeader from "@/components/MobileAppHeader";
import { useAppContext } from "@/context/AppContext";
import { useViewMode } from "@/context/ViewModeContext";
import ViewModeToggle from "@/components/ViewModeToggle";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
  const { theme, setTheme } = useTheme();
  
  const getPageTitle = () => {
    const path = location.pathname;
    if (path === '/dashboard') return 'Dashboard';
    if (path === '/field-team') return 'Field Map';
    if (path === '/site-visits') return 'Site Visits';
    if (path === '/mmp') return 'MMP Files';
    if (path === '/users') return 'Team Members';
    if (path === '/wallet') return 'Wallet';
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

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  if (!isAuthorized) {
    return null;
  }

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const isHomeRoute = location.pathname === '/dashboard';

  return (
    <TooltipProvider>
      <SidebarProvider>
        <div className="min-h-screen flex w-full overflow-x-hidden">
          {!isMobile && <AppSidebar />}
          <div className={`flex-1 flex flex-col ${isMobile ? 'bg-gray-50 dark:bg-gray-900' : ''} relative z-0`}>
            {isMobile ? (
              <MobileAppHeader 
                toggleSidebar={toggleSidebar} 
                title={getPageTitle()}
                showNotification={!isHomeRoute}
              />
            ) : (
              <Navbar />
            )}
            <main className={`flex-1 ${isMobile ? 'px-3 pb-24 pt-2' : 'p-4 md:p-6 lg:p-8'} ${isMobile ? 'bg-gray-50 dark:bg-gray-900' : 'bg-slate-50/70 dark:bg-gray-900/70'} overflow-y-auto overflow-x-hidden relative z-0`}>
              {children || <Outlet />}
            </main>
            {isMobile && <MobileNavigation />}
          </div>
          <div className="fixed bottom-4 right-4 flex gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-full bg-white dark:bg-gray-800"
                  onClick={toggleTheme}
                >
                  {theme === 'dark' ? (
                    <Sun className="h-5 w-5" />
                  ) : (
                    <Moon className="h-5 w-5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Toggle {theme === 'dark' ? 'light' : 'dark'} mode</p>
              </TooltipContent>
            </Tooltip>
            <ViewModeToggle />
          </div>
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
