import React, { createContext, useContext, useMemo, useCallback } from 'react';
import { UserProvider, useUser } from './user/UserContext';
import { MMPProvider, useMMP } from './mmp/MMPContext';
import { NotificationProvider, useNotifications } from './notifications/NotificationContext';
import { SiteVisitProvider, useSiteVisitContext } from './siteVisit/SiteVisitContext';
import { AppRole, ResourceType, ActionType } from '@/types/roles';
import { ProjectProvider } from './project/ProjectContext';
import { ChatProvider } from './chat/ChatContextSupabase';
import { CommunicationProvider } from './communications/CommunicationContext';
import { CallProvider } from './communications/CallContext';
import { NavigationProvider } from './NavigationContext';
import { ViewModeProvider } from './ViewModeContext';
import { ArchiveProvider } from './archive/ArchiveContext';
import { SettingsProvider } from './settings/SettingsContext';
import { RoleManagementProvider, useRoleManagement } from './role-management/RoleManagementContext';
import { WalletProvider } from './wallet/WalletContext';
import { BudgetProvider } from './budget/BudgetContext';
import { ClassificationProvider } from './classification/ClassificationContext';
import { CostSubmissionProvider } from './costApproval/CostSubmissionContext';
import { DownPaymentProvider } from './downPayment/DownPaymentContext';
import { SuperAdminProvider } from './superAdmin/SuperAdminContext';
import { ActiveVisitProvider } from './ActiveVisitContext';
import BrowserNotificationListener from '@/components/BrowserNotificationListener';
import GlobalCallOverlay from '@/components/communication/GlobalCallOverlay';

interface CompositeContextType {
  currentUser: ReturnType<typeof useUser>['currentUser'];
  authReady: boolean;
  users: ReturnType<typeof useUser>['users'];
  refreshUsers: ReturnType<typeof useUser>['refreshUsers'];
  hydrateCurrentUser: ReturnType<typeof useUser>['hydrateCurrentUser'];
  login: ReturnType<typeof useUser>['login'];
  logout: ReturnType<typeof useUser>['logout'];
  registerUser: ReturnType<typeof useUser>['registerUser'];
  approveUser: ReturnType<typeof useUser>['approveUser'];
  rejectUser: ReturnType<typeof useUser>['rejectUser'];
  updateUser: ReturnType<typeof useUser>['updateUser'];
  updateUserLocation: ReturnType<typeof useUser>['updateUserLocation'];
  emailVerificationPending: ReturnType<typeof useUser>['emailVerificationPending'];
  verificationEmail: ReturnType<typeof useUser>['verificationEmail'];
  resendVerificationEmail: ReturnType<typeof useUser>['resendVerificationEmail'];
  clearEmailVerificationNotice: ReturnType<typeof useUser>['clearEmailVerificationNotice'];
  
  mmpFiles: ReturnType<typeof useMMP>['mmpFiles'];
  uploadMMP: ReturnType<typeof useMMP>['uploadMMP'];
  approveMMP: ReturnType<typeof useMMP>['approveMMP'];
  rejectMMP: ReturnType<typeof useMMP>['rejectMMP'];
  updateMMPVersion: ReturnType<typeof useMMP>['updateMMPVersion'];
  archiveMMP: ReturnType<typeof useMMP>['archiveMMP'];
  deleteMMP: ReturnType<typeof useMMP>['deleteMMP'];
  deleteMMPFile: ReturnType<typeof useMMP>['deleteMMPFile'];
  restoreMMP: ReturnType<typeof useMMP>['restoreMMP'];
  resetMMP: ReturnType<typeof useMMP>['resetMMP'];
  getMmpById: ReturnType<typeof useMMP>['getMmpById'];
  updateMMP: ReturnType<typeof useMMP>['updateMMP'];
  
  siteVisits: ReturnType<typeof useSiteVisitContext>['siteVisits'];
  verifySitePermit: ReturnType<typeof useSiteVisitContext>['verifySitePermit'];
  assignSiteVisit: ReturnType<typeof useSiteVisitContext>['assignSiteVisit'];
  startSiteVisit: ReturnType<typeof useSiteVisitContext>['startSiteVisit'];
  completeSiteVisit: ReturnType<typeof useSiteVisitContext>['completeSiteVisit'];
  rateSiteVisit: ReturnType<typeof useSiteVisitContext>['rateSiteVisit'];
  
  
  notifications: ReturnType<typeof useNotifications>['notifications'];
  addNotification: ReturnType<typeof useNotifications>['addNotification'];
  markNotificationAsRead: ReturnType<typeof useNotifications>['markNotificationAsRead'];
  getUnreadNotificationsCount: ReturnType<typeof useNotifications>['getUnreadNotificationsCount'];
  
  hasGranularPermission: (resource: ResourceType, action: ActionType) => boolean;
  calculateDistanceFee: (latitude: number, longitude: number) => number;
  roles: AppRole[];
  hasRole: (role: AppRole) => boolean;
  addRole: (userId: string, role: AppRole) => Promise<boolean>;
  removeRole: (userId: string, role: AppRole) => Promise<boolean>;
}

const AppContext = createContext<CompositeContextType | undefined>(undefined);

const CompositeContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const userContext = useUser();
  const mmpContext = useMMP();
  const siteVisitContext = useSiteVisitContext();
  const notificationContext = useNotifications();
  const roleManagement = useRoleManagement();
  
  // Memoized utility functions to prevent recreation on each render
  const hasGranularPermission = useCallback((resource: ResourceType, action: ActionType): boolean => {
    if (!userContext.currentUser) return false;
    return roleManagement.hasPermission(userContext.currentUser.id, resource, action);
  }, [userContext.currentUser, roleManagement]);
  
  const calculateDistanceFee = useCallback((latitude: number, longitude: number): number => {
    const baseLatitude = 15.5007;
    const baseLongitude = 32.5599;
    
    const latDiff = Math.abs(latitude - baseLatitude);
    const lngDiff = Math.abs(longitude - baseLongitude);
    const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
    
    return Math.round(distance * 50);
  }, []);
  
  // Memoized context value to prevent unnecessary re-renders
  const contextValue = useMemo<CompositeContextType>(() => ({
    ...userContext,
    ...mmpContext,
    ...siteVisitContext,
    ...notificationContext,
    hasGranularPermission,
    calculateDistanceFee,
    roles: userContext.roles,
    hasRole: userContext.hasRole,
    addRole: userContext.addRole,
    removeRole: userContext.removeRole,
    updateMMP: mmpContext.updateMMP,
    deleteMMPFile: mmpContext.deleteMMPFile,
    emailVerificationPending: userContext.emailVerificationPending,
    verificationEmail: userContext.verificationEmail,
    resendVerificationEmail: userContext.resendVerificationEmail,
    clearEmailVerificationNotice: userContext.clearEmailVerificationNotice,
  }), [
    userContext,
    mmpContext,
    siteVisitContext,
    notificationContext,
    hasGranularPermission,
    calculateDistanceFee,
  ]);
  
  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
};

export const AppProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <NavigationProvider>
      <ViewModeProvider>
        <NotificationProvider>
          <UserProvider>
            <ClassificationProvider>
              <WalletProvider>
                <SiteVisitProvider>
                  <MMPProvider>
                    <ProjectProvider>
                      <SettingsProvider>
                        <ArchiveProvider>
                          <RoleManagementProvider>
                            <CompositeContextProvider>
                              <BudgetProvider>
                                <CostSubmissionProvider>
                                  <DownPaymentProvider>
                                    <SuperAdminProvider>
                                      <ActiveVisitProvider>
                                        <ChatProvider>
                                          <CallProvider>
                                            <CommunicationProvider>
                                              <BrowserNotificationListener />
                                              <GlobalCallOverlay />
                                              {children}
                                            </CommunicationProvider>
                                          </CallProvider>
                                        </ChatProvider>
                                      </ActiveVisitProvider>
                                    </SuperAdminProvider>
                                  </DownPaymentProvider>
                                </CostSubmissionProvider>
                              </BudgetProvider>
                            </CompositeContextProvider>
                          </RoleManagementProvider>
                        </ArchiveProvider>
                      </SettingsProvider>
                    </ProjectProvider>
                  </MMPProvider>
                </SiteVisitProvider>
              </WalletProvider>
            </ClassificationProvider>
          </UserProvider>
        </NotificationProvider>
      </ViewModeProvider>
    </NavigationProvider>
  );
};export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within AppProviders');
  }
  return context;
};
