import React, { useCallback } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import AppSidebar from "@/components/AppSidebar";
import Navbar from "@/components/Navbar";
import { useAppContext } from "@/context/AppContext";
import { ViewAsBanner } from "@/components/ViewAsBanner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UpdateDialog } from "@/components/UpdateDialog";
import { OnlineOfflineToggle } from "@/components/common/OnlineOfflineToggle";
import { NotificationInitializer } from "@/components/NotificationInitializer";
import { useLiveDashboard } from "@/hooks/useLiveDashboard";
import { RealtimeBanner } from "@/components/realtime";
import { queryClient } from "@/lib/queryClient";
import { useDailyCoordinatorDigest } from "@/hooks/use-daily-coordinator-digest";
import { NavBadgeCountsProvider } from "@/context/NavBadgeCountsContext";
import { PageLoader } from "@/components/ui/page-loader";
import { TourButton, HUB_SLUGS } from "@/components/onboarding/TourButton";
import { resolveSlug } from "@/lib/page-roles";

interface MainLayoutContentProps {
  children?: React.ReactNode;
}

const MainLayoutContent: React.FC<MainLayoutContentProps> = ({ children }) => {
  const { currentUser, authReady } = useAppContext();
  useLiveDashboard();
  useDailyCoordinatorDigest();
  const navigate = useNavigate();
  const location = useLocation();
  const isSuperAdminHub = location.pathname.startsWith('/super-admin-hub');
  const currentSlug = resolveSlug(`${location.pathname}${location.search}${location.hash}`)
    ?? resolveSlug(location.pathname);

  const handleGlobalRefresh = useCallback(async () => {
    await queryClient.invalidateQueries();
  }, []);

  React.useEffect(() => {
    if (authReady && !currentUser) {
      navigate("/auth");
    }
  }, [currentUser, authReady, navigate]);

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-gray-900">
        <PageLoader />
      </div>
    );
  }

  if (!currentUser) return null;

  return (
    <TooltipProvider>
      <UpdateDialog />
      <NotificationInitializer />
      <NavBadgeCountsProvider>
        <SidebarProvider>
          <div className="min-h-screen max-h-screen flex w-full bg-[#f3f5f8] dark:bg-gray-950">
            <div className="print:hidden contents">
              <AppSidebar />
            </div>
            <SidebarInset className="relative flex flex-col min-w-0 h-screen max-h-screen bg-transparent">
              <div className="print:hidden">
                <ViewAsBanner />
                <RealtimeBanner
                  onRefresh={handleGlobalRefresh}
                  dismissible={true}
                  showOnlyWhenDisconnected={true}
                />
                <Navbar />
              </div>
              <div className={`global-scrollable flex-1 flex flex-col relative min-w-0 min-h-0 bg-transparent ${isSuperAdminHub ? '' : 'px-1.5 py-1.5 sm:px-2 sm:py-2 lg:px-3 lg:py-2.5'}`}>
                <div className={isSuperAdminHub
                  ? 'flex-1 min-h-0 w-full bg-white dark:bg-gray-900'
                  : 'w-full rounded-xl border border-slate-200/70 bg-white shadow-[0_2px_12px_rgba(15,23,42,0.04)] dark:border-gray-800 dark:bg-gray-900'}>
                  {children || <Outlet />}
                </div>
              </div>
              <OnlineOfflineToggle variant="floating" />

              {/* Floating tour button — shown on non-hub pages (hub pages render TourButton in their own header) */}
              {!HUB_SLUGS.has(currentSlug ?? '') && (
                <TourButton variant="floating" />
              )}
            </SidebarInset>
          </div>
        </SidebarProvider>
      </NavBadgeCountsProvider>
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
