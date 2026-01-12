import { createContext, useContext, useEffect, useCallback, ReactNode, useState } from 'react';
import { useUser } from '@/context/user/UserContext';
import { useLocation } from 'react-router-dom';
import activityTracker, { 
  ActivityEntry, 
  ActivityType, 
  ActivityCategory,
  TrackActivityInput 
} from '@/services/activity-tracking.service';

interface ActivityTrackingContextType {
  track: (input: TrackActivityInput) => string;
  trackButtonClick: (component: string, buttonId: string, buttonText?: string, metadata?: Record<string, any>) => string;
  trackNavigation: (from: string, to: string, component?: string) => string;
  trackPageView: (pageName: string, path: string) => string;
  trackFormSubmit: (formName: string, success: boolean, data?: Record<string, any>, errorMessage?: string) => string;
  trackFormInput: (formName: string, fieldName: string, previousValue?: any, newValue?: any) => string;
  trackModalOpen: (modalName: string, component: string) => string;
  trackModalClose: (modalName: string, component: string) => string;
  trackTabSwitch: (tabName: string, component: string, previousTab?: string) => string;
  trackFilterChange: (filterName: string, component: string, previousValue?: any, newValue?: any) => string;
  trackSearch: (query: string, component: string, resultsCount?: number) => string;
  trackFileUpload: (fileName: string, component: string, fileType?: string, fileSize?: number, success?: boolean) => string;
  trackFileDownload: (fileName: string, component: string) => string;
  trackDataOperation: (operation: 'create' | 'update' | 'delete' | 'view', entityType: string, entityId: string, component: string, metadata?: Record<string, any>) => string;
  trackWorkflowAction: (action: 'approval' | 'rejection' | 'assignment' | 'status_change', entityType: string, entityId: string, component: string, metadata?: Record<string, any>) => string;
  trackToggle: (toggleName: string, component: string, previousValue: boolean, newValue: boolean) => string;
  trackSelection: (selectionType: string, component: string, selectedItems: any[], previousSelection?: any[]) => string;
  trackError: (errorMessage: string, component: string, errorCode?: string, metadata?: Record<string, any>) => string;
  trackApiCall: (endpoint: string, method: string, component: string, success: boolean, duration?: number, errorMessage?: string) => string;
  trackSettingChange: (settingName: string, component: string, previousValue?: any, newValue?: any) => string;
  trackExport: (exportType: string, component: string, format?: string, recordCount?: number) => string;
  getActivities: (filter?: {
    userId?: string;
    activityType?: ActivityType;
    category?: ActivityCategory;
    component?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }) => ActivityEntry[];
  getActivityStats: () => {
    totalActivities: number;
    byType: Record<string, number>;
    byCategory: Record<string, number>;
    byUser: Record<string, number>;
    successRate: number;
  };
  syncToDatabase: () => Promise<void>;
}

const ActivityTrackingContext = createContext<ActivityTrackingContextType | undefined>(undefined);

export function ActivityTrackingProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useUser();
  const location = useLocation();
  const [lastPath, setLastPath] = useState<string>('');

  useEffect(() => {
    if (currentUser) {
      activityTracker.setCurrentUser({
        id: currentUser.id,
        name: currentUser.fullName || currentUser.email,
        email: currentUser.email,
        role: currentUser.role,
      });
    } else {
      activityTracker.clearCurrentUser();
    }
  }, [currentUser]);

  useEffect(() => {
    if (location.pathname !== lastPath && currentUser) {
      const pageName = location.pathname.split('/').filter(Boolean).pop() || 'home';
      activityTracker.trackPageView(pageName, location.pathname);
      if (lastPath) {
        activityTracker.trackNavigation(lastPath, location.pathname);
      }
      setLastPath(location.pathname);
    }
  }, [location.pathname, lastPath, currentUser]);

  const track = useCallback((input: TrackActivityInput) => {
    return activityTracker.track(input);
  }, []);

  const trackButtonClick = useCallback((component: string, buttonId: string, buttonText?: string, metadata?: Record<string, any>) => {
    return activityTracker.trackButtonClick(component, buttonId, buttonText, metadata);
  }, []);

  const trackNavigation = useCallback((from: string, to: string, component?: string) => {
    return activityTracker.trackNavigation(from, to, component);
  }, []);

  const trackPageView = useCallback((pageName: string, path: string) => {
    return activityTracker.trackPageView(pageName, path);
  }, []);

  const trackFormSubmit = useCallback((formName: string, success: boolean, data?: Record<string, any>, errorMessage?: string) => {
    return activityTracker.trackFormSubmit(formName, success, data, errorMessage);
  }, []);

  const trackFormInput = useCallback((formName: string, fieldName: string, previousValue?: any, newValue?: any) => {
    return activityTracker.trackFormInput(formName, fieldName, previousValue, newValue);
  }, []);

  const trackModalOpen = useCallback((modalName: string, component: string) => {
    return activityTracker.trackModalOpen(modalName, component);
  }, []);

  const trackModalClose = useCallback((modalName: string, component: string) => {
    return activityTracker.trackModalClose(modalName, component);
  }, []);

  const trackTabSwitch = useCallback((tabName: string, component: string, previousTab?: string) => {
    return activityTracker.trackTabSwitch(tabName, component, previousTab);
  }, []);

  const trackFilterChange = useCallback((filterName: string, component: string, previousValue?: any, newValue?: any) => {
    return activityTracker.trackFilterChange(filterName, component, previousValue, newValue);
  }, []);

  const trackSearch = useCallback((query: string, component: string, resultsCount?: number) => {
    return activityTracker.trackSearch(query, component, resultsCount);
  }, []);

  const trackFileUpload = useCallback((fileName: string, component: string, fileType?: string, fileSize?: number, success?: boolean) => {
    return activityTracker.trackFileUpload(fileName, component, fileType, fileSize, success);
  }, []);

  const trackFileDownload = useCallback((fileName: string, component: string) => {
    return activityTracker.trackFileDownload(fileName, component);
  }, []);

  const trackDataOperation = useCallback((operation: 'create' | 'update' | 'delete' | 'view', entityType: string, entityId: string, component: string, metadata?: Record<string, any>) => {
    return activityTracker.trackDataOperation(operation, entityType, entityId, component, metadata);
  }, []);

  const trackWorkflowAction = useCallback((action: 'approval' | 'rejection' | 'assignment' | 'status_change', entityType: string, entityId: string, component: string, metadata?: Record<string, any>) => {
    return activityTracker.trackWorkflowAction(action, entityType, entityId, component, metadata);
  }, []);

  const trackToggle = useCallback((toggleName: string, component: string, previousValue: boolean, newValue: boolean) => {
    return activityTracker.trackToggle(toggleName, component, previousValue, newValue);
  }, []);

  const trackSelection = useCallback((selectionType: string, component: string, selectedItems: any[], previousSelection?: any[]) => {
    return activityTracker.trackSelection(selectionType, component, selectedItems, previousSelection);
  }, []);

  const trackError = useCallback((errorMessage: string, component: string, errorCode?: string, metadata?: Record<string, any>) => {
    return activityTracker.trackError(errorMessage, component, errorCode, metadata);
  }, []);

  const trackApiCall = useCallback((endpoint: string, method: string, component: string, success: boolean, duration?: number, errorMessage?: string) => {
    return activityTracker.trackApiCall(endpoint, method, component, success, duration, errorMessage);
  }, []);

  const trackSettingChange = useCallback((settingName: string, component: string, previousValue?: any, newValue?: any) => {
    return activityTracker.trackSettingChange(settingName, component, previousValue, newValue);
  }, []);

  const trackExport = useCallback((exportType: string, component: string, format?: string, recordCount?: number) => {
    return activityTracker.trackExport(exportType, component, format, recordCount);
  }, []);

  const getActivities = useCallback((filter?: Parameters<typeof activityTracker.getActivities>[0]) => {
    return activityTracker.getActivities(filter);
  }, []);

  const getActivityStats = useCallback(() => {
    return activityTracker.getActivityStats();
  }, []);

  const syncToDatabase = useCallback(async () => {
    await activityTracker.syncToDatabase();
  }, []);

  return (
    <ActivityTrackingContext.Provider
      value={{
        track,
        trackButtonClick,
        trackNavigation,
        trackPageView,
        trackFormSubmit,
        trackFormInput,
        trackModalOpen,
        trackModalClose,
        trackTabSwitch,
        trackFilterChange,
        trackSearch,
        trackFileUpload,
        trackFileDownload,
        trackDataOperation,
        trackWorkflowAction,
        trackToggle,
        trackSelection,
        trackError,
        trackApiCall,
        trackSettingChange,
        trackExport,
        getActivities,
        getActivityStats,
        syncToDatabase,
      }}
    >
      {children}
    </ActivityTrackingContext.Provider>
  );
}

export function useActivityTracking() {
  const context = useContext(ActivityTrackingContext);
  if (context === undefined) {
    throw new Error('useActivityTracking must be used within an ActivityTrackingProvider');
  }
  return context;
}

export function useTrackButton(component: string) {
  const { trackButtonClick } = useActivityTracking();
  
  return useCallback((buttonId: string, buttonText?: string, metadata?: Record<string, any>) => {
    return trackButtonClick(component, buttonId, buttonText, metadata);
  }, [component, trackButtonClick]);
}

export function useTrackForm(formName: string) {
  const { trackFormSubmit, trackFormInput } = useActivityTracking();
  
  return {
    trackSubmit: useCallback((success: boolean, data?: Record<string, any>, errorMessage?: string) => {
      return trackFormSubmit(formName, success, data, errorMessage);
    }, [formName, trackFormSubmit]),
    trackInput: useCallback((fieldName: string, previousValue?: any, newValue?: any) => {
      return trackFormInput(formName, fieldName, previousValue, newValue);
    }, [formName, trackFormInput]),
  };
}

export function useTrackModal(modalName: string, component: string) {
  const { trackModalOpen, trackModalClose } = useActivityTracking();
  
  return {
    trackOpen: useCallback(() => {
      return trackModalOpen(modalName, component);
    }, [modalName, component, trackModalOpen]),
    trackClose: useCallback(() => {
      return trackModalClose(modalName, component);
    }, [modalName, component, trackModalClose]),
  };
}
