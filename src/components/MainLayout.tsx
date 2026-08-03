import React, { useState, useCallback } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import AppSidebar from "@/components/AppSidebar";
import Navbar from "@/components/Navbar";
import { useAppContext } from "@/context/AppContext";
import { ViewAsBanner } from "@/components/ViewAsBanner";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { UpdateDialog } from "@/components/UpdateDialog";
import { OnlineOfflineToggle } from "@/components/common/OnlineOfflineToggle";
import { NotificationInitializer } from "@/components/NotificationInitializer";
import { useLiveDashboard } from "@/hooks/useLiveDashboard";
import { RealtimeBanner } from "@/components/realtime";
import { queryClient } from "@/lib/queryClient";
import { useDailyCoordinatorDigest } from "@/hooks/use-daily-coordinator-digest";
import { NavBadgeCountsProvider } from "@/context/NavBadgeCountsContext";
import { normalizeRole } from "@/utils/roleMapping";
import { PAGE_DEFS } from "@/pages/PageAccessControl";
import { PageAccessModal } from "@/components/access/PageAccessModal";
import { PageAccessDenied } from "@/components/access/PageAccessDenied";
import { usePageAccessGuard } from "@/hooks/usePageAccessGuard";
import { Shield } from "lucide-react";

// Map current pathname to a PAGE_DEFS slug
function pathToSlug(pathname: string): string | null {
  const exact = PAGE_DEFS.find(p => p.path === pathname || p.path.split('?')[0] === pathname);
  if (exact) return exact.slug;
  const prefix = PAGE_DEFS
    .filter(p => pathname.startsWith(p.path.split('?')[0]))
    .sort((a, b) => b.path.length - a.path.length)[0];
  return prefix?.slug ?? null;
}

interface MainLayoutContentProps {
  children?: React.ReactNode;
}

const MainLayoutContent: React.FC<MainLayoutContentProps> = ({ children }) => {
  const { currentUser, authReady } = useAppContext();
  useLiveDashboard();
  useDailyCoordinatorDigest();
  const navigate = useNavigate();
  const location = useLocation();
  const [accessModalOpen, setAccessModalOpen] = useState(false);

  const isSuperAdmin = normalizeRole(currentUser?.role ?? '') === 'superAdmin';
  const currentSlug = pathToSlug(location.pathname);
  const currentPageDef = currentSlug ? PAGE_DEFS.find(p => p.slug === currentSlug) : null;

  const { isBlocked: pageIsBlocked, isChecking: pageIsChecking, pageLabel } = usePageAccessGuard();
  // Safety: never leave the content pane spinning if access check hangs
  const [accessCheckTimedOut, setAccessCheckTimedOut] = useState(false);
  React.useEffect(() => {
    if (!pageIsChecking) {
      setAccessCheckTimedOut(false);
      return;
    }
    const t = setTimeout(() => setAccessCheckTimedOut(true), 8000);
    return () => clearTimeout(t);
  }, [pageIsChecking, location.pathname]);
  const showAccessSpinner = pageIsChecking && !accessCheckTimedOut;

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
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
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
            <AppSidebar />
            <SidebarInset className="relative flex flex-col min-w-0 h-screen max-h-screen bg-transparent">
              <ViewAsBanner />
              <RealtimeBanner
                onRefresh={handleGlobalRefresh}
                dismissible={true}
                showOnlyWhenDisconnected={true}
              />
              <Navbar />
              <div className="global-scrollable flex-1 flex flex-col relative min-w-0 min-h-0 bg-transparent px-1.5 py-1.5 sm:px-2 sm:py-2 lg:px-3 lg:py-2.5">
                <div className="w-full rounded-xl border border-slate-200/70 bg-white shadow-[0_2px_12px_rgba(15,23,42,0.04)] dark:border-gray-800 dark:bg-gray-900">
                  {showAccessSpinner ? (
                    <div className="flex items-center justify-center min-h-[60vh]">
                      <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : pageIsBlocked && !accessCheckTimedOut ? (
                    <PageAccessDenied pageLabel={pageLabel} reason="blocked" />
                  ) : (
                    children || <Outlet />
                  )}
                </div>
              </div>
              <OnlineOfflineToggle variant="floating" />

              {isSuperAdmin && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => {
                          if (currentPageDef) {
                            setAccessModalOpen(true);
                          } else {
                            navigate('/page-access');
                          }
                        }}
                        data-testid="btn-page-access-float"
                        className="fixed bottom-20 right-4 z-50 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#0F2041] text-white text-xs font-semibold shadow-lg hover:bg-[#1D3461] transition-colors"
                      >
                        <Shield className="h-3.5 w-3.5" />
                        Manage Access
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="text-xs">
                      {currentPageDef
                        ? <>Control who can access: <strong>{currentPageDef.label}</strong></>
                        : 'Open Page Access Control'}
                    </TooltipContent>
                  </Tooltip>

                  {currentPageDef && (
                    <PageAccessModal
                      open={accessModalOpen}
                      onClose={() => setAccessModalOpen(false)}
                      pageSlug={currentSlug!}
                    />
                  )}
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
