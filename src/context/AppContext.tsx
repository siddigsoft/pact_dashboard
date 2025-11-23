import React, { createContext, useContext } from 'react';
import { UserProvider, useUser } from './user/UserContext';
import { MMPProvider, useMMP } from './mmp/MMPContext';
import { NotificationProvider, useNotifications } from './notifications/NotificationContext';
import { SiteVisitProvider, useSiteVisitContext } from './siteVisit/SiteVisitContext';
import { AppRole, ResourceType, ActionType } from '@/types/roles';
import { ProjectProvider } from './project/ProjectContext';
import { ChatProvider } from './chat/ChatContextSupabase';
import { CommunicationProvider } from './communications/CommunicationContext';
import { ViewModeProvider } from './ViewModeContext';
import { ArchiveProvider } from './archive/ArchiveContext';
import { SettingsProvider } from './settings/SettingsContext';
import { RoleManagementProvider, useRoleManagement } from './role-management/RoleManagementContext';
import { WalletProvider } from './wallet/WalletContext';
import { BudgetProvider } from './budget/BudgetContext';
import { ClassificationProvider } from './classification/ClassificationContext';



interface CompositeContextType {
  currentUser: ReturnType<typeof useUser>['currentUser'];
  authReady: boolean;
  users: ReturnType<typeof useUser>['users'];
  refreshUsers: ReturnType<typeof useUser>['refreshUsers'];
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
  
  // Legacy hasPermission(action: string) removed: use useAuthorization() or hasGranularPermission() instead.

  const hasGranularPermission = (resource: ResourceType, action: ActionType): boolean => {
    if (!userContext.currentUser) return false;
    return roleManagement.hasPermission(userContext.currentUser.id, resource, action);
  };
  
  const calculateDistanceFee = (latitude: number, longitude: number): number => {
    const baseLatitude = 15.5007;
    const baseLongitude = 32.5599;
    
    const latDiff = Math.abs(latitude - baseLatitude);
    const lngDiff = Math.abs(longitude - baseLongitude);
    const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
    
    return Math.round(distance * 50);
  };
  
  const contextValue: CompositeContextType = {
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
  };
  
  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
};

export const AppProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <ViewModeProvider>
      <NotificationProvider>
        <UserProvider>
          <ClassificationProvider>
            <SiteVisitProvider>
              <MMPProvider>
                <ProjectProvider>
                  <SettingsProvider>
                    <ArchiveProvider>
                      <RoleManagementProvider>
                        <CompositeContextProvider>
                          <WalletProvider>
                            <BudgetProvider>
                              <ChatProvider>
                                <CommunicationProvider>
                                  {children}
                                </CommunicationProvider>
                              </ChatProvider>
                            </BudgetProvider>
                          </WalletProvider>
                        </CompositeContextProvider>
                      </RoleManagementProvider>
                    </ArchiveProvider>
                  </SettingsProvider>
                </ProjectProvider>
              </MMPProvider>
            </SiteVisitProvider>
          </ClassificationProvider>
        </UserProvider>
      </NotificationProvider>
    </ViewModeProvider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};
