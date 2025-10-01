import React, { createContext, useContext } from 'react';
import { UserProvider, useUser } from './user/UserContext';
import { MMPProvider, useMMP } from './mmp/MMPContext';
import { NotificationProvider, useNotifications } from './notifications/NotificationContext';
import { SiteVisitProvider, useSiteVisitContext } from './siteVisit/SiteVisitContext';
import { WalletProvider, useWallet } from './wallet/WalletContext';
import { AppRole } from '@/types/roles';
import { ProjectProvider } from './project/ProjectContext';
import { ChatProvider } from './chat/ChatContext';
import { CommunicationProvider } from './communications/CommunicationContext';
import { ViewModeProvider } from './ViewModeContext';
import { ArchiveProvider } from './archive/ArchiveContext';
import { SettingsProvider } from './settings/SettingsContext';

interface CompositeContextType {
  currentUser: ReturnType<typeof useUser>['currentUser'];
  users: ReturnType<typeof useUser>['users'];
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
  
  transactions: ReturnType<typeof useWallet>['transactions'];
  withdrawFunds: ReturnType<typeof useWallet>['withdrawFunds'];
  addTransaction: ReturnType<typeof useWallet>['addTransaction'];
  
  notifications: ReturnType<typeof useNotifications>['notifications'];
  addNotification: ReturnType<typeof useNotifications>['addNotification'];
  markNotificationAsRead: ReturnType<typeof useNotifications>['markNotificationAsRead'];
  getUnreadNotificationsCount: ReturnType<typeof useNotifications>['getUnreadNotificationsCount'];
  
  hasPermission: (action: string) => boolean;
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
  const walletContext = useWallet();
  const notificationContext = useNotifications();
  
  const hasPermission = (action: string): boolean => {
    if (!userContext.currentUser) return false;
    
    const permissionsByRole: Record<string, string[]> = {
      admin: [
        'manage_users', 'approve_users', 'upload_mmp', 'approve_mmp', 'verify_permits',
        'assign_site_visits', 'view_all_site_visits', 'view_finances', 'manage_finances',
        'view_analytics', 'manage_settings',
      ],
      ict: [
        'manage_users', 'upload_mmp', 'approve_mmp', 'verify_permits', 'assign_site_visits',
        'view_all_site_visits', 'view_finances', 'manage_finances', 'view_analytics', 'manage_settings',
      ],
      fom: [
        'upload_mmp', 'approve_mmp', 'verify_permits', 'assign_site_visits',
        'view_all_site_visits', 'view_finances', 'view_budget', 'view_analytics',
      ],
      financialAdmin: [
        'view_all_site_visits', 'view_finances', 'manage_finances', 'view_budget',
        'manage_budget', 'view_analytics', 'approve_payments', 'process_withdrawals',
      ],
      supervisor: [
        'verify_permits', 'view_all_site_visits', 'rate_site_visits', 'view_analytics',
      ],
      coordinator: [
        'view_assigned_site_visits', 'complete_site_visits', 'view_limited_analytics',
      ],
      dataCollector: [
        'view_assigned_site_visits', 'complete_site_visits',
      ],
      datacollector: [
        'view_assigned_site_visits', 'complete_site_visits',
      ],
      reviewer: [
        'view_assigned_site_visits',
      ]
    };
    
    const userRole = userContext.currentUser.role;
    const permissions = permissionsByRole[userRole] || [];
    return permissions.includes(action);
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
    ...walletContext,
    ...notificationContext,
    hasPermission,
    calculateDistanceFee,
    roles: userContext.roles,
    hasRole: userContext.hasRole,
    addRole: userContext.addRole,
    removeRole: userContext.removeRole,
    updateMMP: mmpContext.updateMMP,
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
          <SiteVisitProvider>
            <MMPProvider>
              <ProjectProvider>
                <WalletProvider>
                  <SettingsProvider>
                    <ArchiveProvider>
                      <CompositeContextProvider>
                        <ChatProvider>
                          <CommunicationProvider>
                            {children}
                          </CommunicationProvider>
                        </ChatProvider>
                      </CompositeContextProvider>
                    </ArchiveProvider>
                  </SettingsProvider>
                </WalletProvider>
              </ProjectProvider>
            </MMPProvider>
          </SiteVisitProvider>
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
