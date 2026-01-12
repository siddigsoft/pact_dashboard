import { supabase } from '@/integrations/supabase/client';
import { v4 as uuidv4 } from 'uuid';

export type ActivityType = 
  | 'button_click'
  | 'navigation'
  | 'form_submit'
  | 'form_input'
  | 'page_view'
  | 'modal_open'
  | 'modal_close'
  | 'tab_switch'
  | 'filter_change'
  | 'search'
  | 'file_upload'
  | 'file_download'
  | 'api_call'
  | 'login'
  | 'logout'
  | 'data_create'
  | 'data_update'
  | 'data_delete'
  | 'data_view'
  | 'approval'
  | 'rejection'
  | 'assignment'
  | 'status_change'
  | 'export'
  | 'import'
  | 'print'
  | 'share'
  | 'copy'
  | 'setting_change'
  | 'toggle'
  | 'selection'
  | 'scroll'
  | 'hover'
  | 'focus'
  | 'error'
  | 'success'
  | 'warning'
  | 'custom';

export type ActivityCategory = 
  | 'interaction'
  | 'navigation'
  | 'data'
  | 'authentication'
  | 'communication'
  | 'system'
  | 'workflow';

export interface ActivityEntry {
  id: string;
  userId: string;
  userName: string;
  userEmail?: string;
  userRole: string;
  activityType: ActivityType;
  category: ActivityCategory;
  component: string;
  action: string;
  description: string;
  path: string;
  timestamp: string;
  metadata?: Record<string, any>;
  elementId?: string;
  elementText?: string;
  previousValue?: any;
  newValue?: any;
  duration?: number;
  success: boolean;
  errorMessage?: string;
  sessionId: string;
  deviceInfo?: {
    userAgent?: string;
    screenWidth?: number;
    screenHeight?: number;
    isMobile?: boolean;
  };
}

export interface TrackActivityInput {
  activityType: ActivityType;
  category?: ActivityCategory;
  component: string;
  action: string;
  description?: string;
  elementId?: string;
  elementText?: string;
  previousValue?: any;
  newValue?: any;
  metadata?: Record<string, any>;
  success?: boolean;
  errorMessage?: string;
  duration?: number;
}

const STORAGE_KEY = 'pact_activity_logs';
const SESSION_KEY = 'pact_session_id';
const MAX_LOCAL_LOGS = 1000;
const BATCH_SIZE = 50;
const SYNC_INTERVAL = 30000;

class ActivityTrackingService {
  private activities: ActivityEntry[] = [];
  private pendingSync: ActivityEntry[] = [];
  private sessionId: string;
  private currentUser: { id: string; name: string; email?: string; role: string } | null = null;
  private syncTimer: NodeJS.Timeout | null = null;
  private isOnline: boolean = navigator.onLine;

  constructor() {
    this.sessionId = this.getOrCreateSessionId();
    this.loadFromStorage();
    this.setupEventListeners();
    this.startSyncTimer();
  }

  private getOrCreateSessionId(): string {
    let sessionId = sessionStorage.getItem(SESSION_KEY);
    if (!sessionId) {
      sessionId = uuidv4();
      sessionStorage.setItem(SESSION_KEY, sessionId);
    }
    return sessionId;
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.activities = JSON.parse(stored);
      }
    } catch (error) {
      console.error('[ActivityTracking] Error loading from storage:', error);
      this.activities = [];
    }
  }

  private saveToStorage(): void {
    try {
      const toStore = this.activities.slice(-MAX_LOCAL_LOGS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
    } catch (error) {
      console.error('[ActivityTracking] Error saving to storage:', error);
    }
  }

  private setupEventListeners(): void {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.syncToDatabase();
    });
    window.addEventListener('offline', () => {
      this.isOnline = false;
    });
  }

  private startSyncTimer(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }
    this.syncTimer = setInterval(() => {
      if (this.isOnline && this.pendingSync.length > 0) {
        this.syncToDatabase();
      }
    }, SYNC_INTERVAL);
  }

  public setCurrentUser(user: { id: string; name: string; email?: string; role: string } | null): void {
    this.currentUser = user;
    if (user) {
      this.track({
        activityType: 'login',
        category: 'authentication',
        component: 'AuthSystem',
        action: 'user_session_start',
        description: `User ${user.name} started session`,
      });
    }
  }

  public clearCurrentUser(): void {
    if (this.currentUser) {
      this.track({
        activityType: 'logout',
        category: 'authentication',
        component: 'AuthSystem',
        action: 'user_session_end',
        description: `User ${this.currentUser.name} ended session`,
      });
    }
    this.currentUser = null;
  }

  private getCategoryFromType(type: ActivityType): ActivityCategory {
    switch (type) {
      case 'button_click':
      case 'toggle':
      case 'selection':
      case 'scroll':
      case 'hover':
      case 'focus':
        return 'interaction';
      case 'navigation':
      case 'page_view':
      case 'tab_switch':
        return 'navigation';
      case 'form_submit':
      case 'form_input':
      case 'data_create':
      case 'data_update':
      case 'data_delete':
      case 'data_view':
      case 'file_upload':
      case 'file_download':
      case 'export':
      case 'import':
        return 'data';
      case 'login':
      case 'logout':
        return 'authentication';
      case 'share':
      case 'copy':
      case 'print':
        return 'communication';
      case 'approval':
      case 'rejection':
      case 'assignment':
      case 'status_change':
        return 'workflow';
      default:
        return 'system';
    }
  }

  private sanitizeString(str: string, maxLen: number = 50): string {
    let result = str.replace(/[?&][^?&\s]*=[^?&\s]*/g, '');
    result = result.replace(/[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}/g, '[ID]');
    result = result.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]');
    result = result.replace(/\b\d{10,}\b/g, '[NUM]');
    result = result.replace(/Bearer\s+[^\s]+/gi, 'Bearer [TOKEN]');
    result = result.replace(/token=[^\s&]+/gi, 'token=[REDACTED]');
    result = result.replace(/key=[^\s&]+/gi, 'key=[REDACTED]');
    return result.substring(0, maxLen);
  }

  private sanitizeValue(value: any): any {
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      if (value.length > 50) return undefined;
      return this.sanitizeString(value, 50);
    }
    return undefined;
  }

  private sanitizeMetadata(metadata?: Record<string, any>): Record<string, any> | undefined {
    if (!metadata) return undefined;
    
    const allowedKeys = [
      'entityType', 'entityId', 'resultsCount', 'recordCount',
      'format', 'exportType', 'fileType', 'fileSize', 'method',
      'duration', 'status', 'count', 'total'
    ];
    
    const sanitized: Record<string, any> = {};
    let hasValidKeys = false;
    
    for (const key of allowedKeys) {
      if (key in metadata) {
        const value = this.sanitizeValue(metadata[key]);
        if (value !== undefined) {
          sanitized[key] = value;
          hasValidKeys = true;
        }
      }
    }
    
    return hasValidKeys ? sanitized : undefined;
  }

  public track(input: TrackActivityInput): string {
    if (!this.currentUser) {
      console.warn('[ActivityTracking] No user set, skipping activity tracking');
      return '';
    }

    const sanitizedPath = typeof window !== 'undefined' 
      ? this.sanitizeString(window.location.pathname.split('?')[0], 100) 
      : '';

    const activity: ActivityEntry = {
      id: uuidv4(),
      userId: this.currentUser.id,
      userName: this.currentUser.name,
      userEmail: this.currentUser.email,
      userRole: this.currentUser.role,
      activityType: input.activityType,
      category: input.category || this.getCategoryFromType(input.activityType),
      component: this.sanitizeString(input.component, 50),
      action: this.sanitizeString(input.action, 50),
      description: this.sanitizeString(input.description || `${input.action} in ${input.component}`, 100),
      path: sanitizedPath,
      timestamp: new Date().toISOString(),
      metadata: this.sanitizeMetadata(input.metadata),
      elementId: input.elementId ? this.sanitizeString(input.elementId, 50) : undefined,
      elementText: input.elementText ? this.sanitizeString(input.elementText, 30) : undefined,
      previousValue: this.sanitizeValue(input.previousValue),
      newValue: this.sanitizeValue(input.newValue),
      success: input.success !== false,
      errorMessage: input.errorMessage ? this.sanitizeString(input.errorMessage, 100) : undefined,
      sessionId: this.sessionId,
      deviceInfo: this.getDeviceInfo(),
    };

    this.activities.push(activity);
    this.pendingSync.push(activity);
    this.saveToStorage();

    if (this.pendingSync.length >= BATCH_SIZE && this.isOnline) {
      this.syncToDatabase();
    }

    console.debug('[ActivityTracking]', activity.activityType, activity.action, activity.component);
    return activity.id;
  }

  public trackButtonClick(component: string, buttonId: string, buttonText?: string, _metadata?: Record<string, any>): string {
    return this.track({
      activityType: 'button_click',
      component,
      action: `clicked_${buttonId}`,
      description: `Clicked ${buttonText || buttonId} button`,
      elementId: buttonId,
      elementText: buttonText,
    });
  }

  public trackNavigation(_from: string, _to: string, component?: string): string {
    return this.track({
      activityType: 'navigation',
      component: component || 'Router',
      action: 'navigate',
      description: 'Navigated to new page',
    });
  }

  public trackPageView(pageName: string, _path: string): string {
    return this.track({
      activityType: 'page_view',
      component: pageName,
      action: 'view_page',
      description: 'Viewed page',
    });
  }

  public trackFormSubmit(formName: string, success: boolean, _data?: Record<string, any>, errorMessage?: string): string {
    return this.track({
      activityType: 'form_submit',
      component: formName,
      action: 'submit_form',
      description: `Submitted ${formName} form`,
      success,
      errorMessage,
    });
  }

  public trackFormInput(formName: string, fieldName: string, _previousValue?: any, _newValue?: any): string {
    return this.track({
      activityType: 'form_input',
      component: formName,
      action: `input_${fieldName}`,
      description: `Changed ${fieldName} in ${formName}`,
      elementId: fieldName,
    });
  }

  public trackModalOpen(_modalName: string, component: string): string {
    return this.track({
      activityType: 'modal_open',
      component,
      action: 'open_modal',
      description: 'Opened modal',
    });
  }

  public trackModalClose(_modalName: string, component: string): string {
    return this.track({
      activityType: 'modal_close',
      component,
      action: 'close_modal',
      description: 'Closed modal',
    });
  }

  public trackTabSwitch(_tabName: string, component: string, _previousTab?: string): string {
    return this.track({
      activityType: 'tab_switch',
      component,
      action: 'switch_tab',
      description: 'Switched tab',
    });
  }

  public trackFilterChange(filterName: string, component: string, _previousValue?: any, _newValue?: any): string {
    return this.track({
      activityType: 'filter_change',
      component,
      action: `filter_${filterName}`,
      description: `Changed ${filterName} filter`,
    });
  }

  public trackSearch(_query: string, component: string, resultsCount?: number): string {
    return this.track({
      activityType: 'search',
      component,
      action: 'search',
      description: `Performed search`,
      metadata: resultsCount !== undefined ? { resultsCount } : undefined,
    });
  }

  public trackFileUpload(_fileName: string, component: string, fileType?: string, fileSize?: number, success?: boolean): string {
    return this.track({
      activityType: 'file_upload',
      component,
      action: 'upload_file',
      description: 'Uploaded file',
      success,
      metadata: { fileType, fileSize },
    });
  }

  public trackFileDownload(_fileName: string, component: string): string {
    return this.track({
      activityType: 'file_download',
      component,
      action: 'download_file',
      description: 'Downloaded file',
    });
  }

  public trackDataOperation(operation: 'create' | 'update' | 'delete' | 'view', entityType: string, _entityId: string, component: string, _metadata?: Record<string, any>): string {
    const activityType = `data_${operation}` as ActivityType;
    return this.track({
      activityType,
      category: 'data',
      component,
      action: `${operation}_record`,
      description: `${operation.charAt(0).toUpperCase() + operation.slice(1)} operation`,
      metadata: { entityType },
    });
  }

  public trackWorkflowAction(action: 'approval' | 'rejection' | 'assignment' | 'status_change', entityType: string, _entityId: string, component: string, _metadata?: Record<string, any>): string {
    return this.track({
      activityType: action,
      category: 'workflow',
      component,
      action: `workflow_${action}`,
      description: 'Workflow action',
      metadata: { entityType },
    });
  }

  public trackToggle(_toggleName: string, component: string, _previousValue: boolean, newValue: boolean): string {
    return this.track({
      activityType: 'toggle',
      component,
      action: 'toggle',
      description: `Toggled ${newValue ? 'on' : 'off'}`,
    });
  }

  public trackSelection(selectionType: string, component: string, selectedItems: any[], _previousSelection?: any[]): string {
    return this.track({
      activityType: 'selection',
      component,
      action: `select_${selectionType}`,
      description: `Selected ${selectedItems.length} ${selectionType}`,
      metadata: { count: selectedItems.length },
    });
  }

  public trackError(errorMessage: string, component: string, errorCode?: string, _metadata?: Record<string, any>): string {
    return this.track({
      activityType: 'error',
      category: 'system',
      component,
      action: 'error_occurred',
      description: 'An error occurred',
      success: false,
      errorMessage: errorMessage.substring(0, 100),
      metadata: errorCode ? { status: errorCode } : undefined,
    });
  }

  public trackApiCall(_endpoint: string, method: string, component: string, success: boolean, duration?: number, errorMessage?: string): string {
    return this.track({
      activityType: 'api_call',
      category: 'system',
      component,
      action: `api_${method.toLowerCase()}`,
      description: 'API request',
      success,
      errorMessage,
      duration,
      metadata: { method, duration },
    });
  }

  public trackSettingChange(settingName: string, component: string, _previousValue?: any, _newValue?: any): string {
    return this.track({
      activityType: 'setting_change',
      category: 'system',
      component,
      action: `change_setting`,
      description: 'Changed setting',
    });
  }

  public trackExport(_exportType: string, component: string, format?: string, recordCount?: number): string {
    return this.track({
      activityType: 'export',
      component,
      action: 'export',
      description: 'Exported data',
      metadata: { format, recordCount },
    });
  }

  private getDeviceInfo(): ActivityEntry['deviceInfo'] {
    if (typeof window === 'undefined') return undefined;
    return {
      userAgent: navigator.userAgent,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      isMobile: /iPhone|iPad|iPod|Android/i.test(navigator.userAgent),
    };
  }

  public async syncToDatabase(): Promise<void> {
    if (!this.isOnline || this.pendingSync.length === 0) {
      return;
    }

    const toSync = [...this.pendingSync];
    this.pendingSync = [];

    try {
      const dbRecords = toSync.map(activity => ({
        id: activity.id,
        user_id: activity.userId,
        user_name: activity.userName,
        user_email: activity.userEmail,
        user_role: activity.userRole,
        activity_type: activity.activityType,
        category: activity.category,
        component: activity.component,
        action: activity.action,
        description: activity.description,
        path: activity.path,
        timestamp: activity.timestamp,
        metadata: activity.metadata,
        element_id: activity.elementId,
        element_text: activity.elementText,
        previous_value: activity.previousValue,
        new_value: activity.newValue,
        duration: activity.duration,
        success: activity.success,
        error_message: activity.errorMessage,
        session_id: activity.sessionId,
        device_info: activity.deviceInfo,
      }));

      const { error } = await supabase
        .from('user_activity_logs')
        .insert(dbRecords);

      if (error) {
        console.error('[ActivityTracking] Error syncing to database:', error);
        this.pendingSync.push(...toSync);
      } else {
        console.debug('[ActivityTracking] Synced', toSync.length, 'activities to database');
      }
    } catch (error) {
      console.error('[ActivityTracking] Sync error:', error);
      this.pendingSync.push(...toSync);
    }
  }

  public getActivities(filter?: {
    userId?: string;
    activityType?: ActivityType;
    category?: ActivityCategory;
    component?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): ActivityEntry[] {
    let result = [...this.activities];

    if (filter?.userId) {
      result = result.filter(a => a.userId === filter.userId);
    }
    if (filter?.activityType) {
      result = result.filter(a => a.activityType === filter.activityType);
    }
    if (filter?.category) {
      result = result.filter(a => a.category === filter.category);
    }
    if (filter?.component) {
      result = result.filter(a => a.component.toLowerCase().includes(filter.component!.toLowerCase()));
    }
    if (filter?.startDate) {
      result = result.filter(a => new Date(a.timestamp) >= filter.startDate!);
    }
    if (filter?.endDate) {
      result = result.filter(a => new Date(a.timestamp) <= filter.endDate!);
    }

    result.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (filter?.limit) {
      result = result.slice(0, filter.limit);
    }

    return result;
  }

  public getActivityStats(): {
    totalActivities: number;
    byType: Record<string, number>;
    byCategory: Record<string, number>;
    byUser: Record<string, number>;
    successRate: number;
  } {
    const byType: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    const byUser: Record<string, number> = {};
    let successCount = 0;

    for (const activity of this.activities) {
      byType[activity.activityType] = (byType[activity.activityType] || 0) + 1;
      byCategory[activity.category] = (byCategory[activity.category] || 0) + 1;
      byUser[activity.userId] = (byUser[activity.userId] || 0) + 1;
      if (activity.success) successCount++;
    }

    return {
      totalActivities: this.activities.length,
      byType,
      byCategory,
      byUser,
      successRate: this.activities.length > 0 ? (successCount / this.activities.length) * 100 : 100,
    };
  }

  public clearActivities(): void {
    this.activities = [];
    this.pendingSync = [];
    localStorage.removeItem(STORAGE_KEY);
  }
}

export const activityTracker = new ActivityTrackingService();
export default activityTracker;
