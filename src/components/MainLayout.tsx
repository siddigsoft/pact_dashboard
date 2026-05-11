import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import AppSidebar from "@/components/AppSidebarIconFirst";
import Navbar from "@/components/Navbar";
import MobileAppHeader from "@/components/MobileAppHeader";
import TabletNavigation from '@/components/TabletNavigation';
import { useAppContext } from "@/context/AppContext";
import { useViewMode } from "@/context/ViewModeContext";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { UpdateDialog } from "@/components/UpdateDialog";
import { OnlineOfflineToggle } from "@/components/common/OnlineOfflineToggle";
import { GlobalRefreshBar } from "@/components/GlobalRefreshBar";
import { NotificationInitializer } from "@/components/NotificationInitializer";
import { MobileBottomNav } from "@/components/mobile/MobileBottomNav";
import { useLiveDashboard } from "@/hooks/useLiveDashboard";
import { RealtimeBanner } from "@/components/realtime";
import { queryClient } from "@/lib/queryClient";
import { useDailyCoordinatorDigest } from "@/hooks/use-daily-coordinator-digest";
import { NavBadgeCountsProvider } from "@/context/NavBadgeCountsContext";
import { normalizeRole } from "@/utils/roleMapping";
import { PAGE_DEFS } from "@/pages/PageAccessControl";
import { PageAccessModal } from "@/components/access/PageAccessModal";
import { Shield } from "lucide-react";

interface MainLayoutContentProps {
  children?: React.ReactNode;
}

// Map current pathname to a PAGE_DEFS slug
function pathToSlug(pathname: string): string | null {
  // Exact match first
  const exact = PAGE_DEFS.find(p => p.path === pathname || p.path.split('?')[0] === pathname);
  if (exact) return exact.slug;
  // Prefix match (e.g. /crm/partners → crm)
  const prefix = PAGE_DEFS
    .filter(p => pathname.startsWith(p.path.split('?')[0]))
    .sort((a, b) => b.path.length - a.path.length)[0];
  return prefix?.slug ?? null;
}

const MainLayoutContent: React.FC<MainLayoutContentProps> = ({ children }) => {
  const { currentUser, authReady } = useAppContext();
  useLiveDashboard();
  useDailyCoordinatorDigest();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { viewMode, isTransitioning } = useViewMode();
  const isMobile = viewMode === 'mobile';
  const isTablet = viewMode === 'tablet';
  const [accessModalOpen, setAccessModalOpen] = useState(false);

  const isSuperAdmin = normalizeRole(currentUser?.role ?? '') === 'superAdmin';
  const currentSlug = pathToSlug(location.pathname);
  const currentPageDef = currentSlug ? PAGE_DEFS.find(p => p.slug === currentSlug) : null;

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
    if (authReady && !currentUser) {
      navigate("/auth");
    }
  }, [currentUser, authReady, navigate]);

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-gray-900">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) return null;

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);
  const handleGlobalRefresh = useCallback(async () => {
    await queryClient.invalidateQueries();
  }, []);

  return (
    <TooltipProvider>
      <UpdateDialog />
      <NotificationInitializer />
      <NavBadgeCountsProvider>
      <SidebarProvider>
        <div className={`min-h-screen max-h-screen flex w-full bg-[#f3f5f8] dark:bg-gray-950 ${isTransitioning ? 'transition-all duration-300 ease-in-out' : ''}`}>
          {!isMobile && !isTablet && <AppSidebar />}
          <SidebarInset className={`${isMobile ? 'bg-gray-50 dark:bg-gray-900' : 'bg-transparent'} relative z-0 flex flex-col min-w-0 h-screen max-h-screen`}>
            <RealtimeBanner 
              onRefresh={handleGlobalRefresh}
              dismissible={true}
              showOnlyWhenDisconnected={true}
            />
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
            {isMobile && <GlobalRefreshBar />}
            <div className={`global-scrollable flex-1 flex flex-col relative z-0 min-w-0 min-h-0 ${isMobile ? 'px-1 pb-12 pt-0.5 bg-gray-50 dark:bg-gray-900' : 'bg-transparent px-3 py-3 lg:px-5 lg:py-4'}`}>
              <div className="w-full rounded-2xl border border-slate-200/70 bg-white shadow-[0_2px_16px_rgba(15,23,42,0.04)] dark:border-gray-800 dark:bg-gray-900">
                {children || <Outlet />}
              </div>
            </div>
            {isMobile && <MobileBottomNav />}
            <OnlineOfflineToggle variant="floating" />

            {/* ── Floating "Manage Access" button — Super Admin only ─────── */}
            {isSuperAdmin && currentPageDef && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setAccessModalOpen(true)}
                      data-testid="btn-page-access-float"
                      className="fixed bottom-20 right-4 z-50 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#0F2041] text-white text-xs font-semibold shadow-lg hover:bg-[#1D3461] transition-colors"
                    >
                      <Shield className="h-3.5 w-3.5" />
                      Manage Access
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="text-xs">
                    Control who can access: <strong>{currentPageDef.label}</strong>
                  </TooltipContent>
                </Tooltip>

                <PageAccessModal
                  open={accessModalOpen}
                  onClose={() => setAccessModalOpen(false)}
                  pageSlug={currentSlug!}
                />
              </>
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
