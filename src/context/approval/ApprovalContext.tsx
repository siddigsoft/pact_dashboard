import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/context/user/UserContext';
import { useSuperAdmin } from '@/context/superAdmin/SuperAdminContext';
import { 
  ApprovalRequest, 
  CreateApprovalRequest, 
  ApprovalStatus,
  ApprovalRequestType,
  APPROVAL_REQUEST_TYPE_LABELS 
} from '@/types/approval-request';
import { v4 as uuidv4 } from 'uuid';
import { NotificationTriggerService } from '@/services/NotificationTriggerService';

interface ApprovalContextType {
  pendingRequests: ApprovalRequest[];
  allRequests: ApprovalRequest[];
  loading: boolean;
  createApprovalRequest: (request: CreateApprovalRequest) => Promise<{ success: boolean; requestId?: string; error?: string }>;
  reviewRequest: (requestId: string, action: 'approve' | 'reject', notes?: string) => Promise<{ success: boolean; error?: string }>;
  cancelRequest: (requestId: string) => Promise<{ success: boolean; error?: string }>;
  getRequestById: (requestId: string) => ApprovalRequest | undefined;
  getRequestsForResource: (resourceType: string, resourceId: string) => ApprovalRequest[];
  hasPendingRequest: (resourceType: string, resourceId: string) => boolean;
  canBypassApproval: () => boolean;
  refreshRequests: () => Promise<void>;
  getPendingCount: () => number;
}

const ApprovalContext = createContext<ApprovalContextType | undefined>(undefined);

const STORAGE_KEY = 'pact_approval_requests';

export function ApprovalProvider({ children }: { children: ReactNode }) {
  const { currentUser, users } = useUser();
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  
  let isSuperAdminUser = false;
  try {
    const superAdminContext = useSuperAdmin();
    isSuperAdminUser = superAdminContext?.isSuperAdmin ?? false;
  } catch {
    isSuperAdminUser = false;
  }

  const canBypassApproval = useCallback(() => {
    if (!currentUser) return false;
    if (isSuperAdminUser) return true;
    const roles = [currentUser.role, ...(Array.isArray(currentUser.roles) ? currentUser.roles : [])];
    return roles.some(r => r === 'SuperAdmin' || r === 'super_admin');
  }, [currentUser, isSuperAdminUser]);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const parsed = stored ? JSON.parse(stored) as ApprovalRequest[] : [];
      setRequests(parsed ?? []);
    } catch (error) {
      console.error('[Approval] Error loading requests:', error);
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const saveRequests = useCallback((newRequests: ApprovalRequest[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newRequests));
      setRequests(newRequests);
    } catch (error) {
      console.error('[Approval] Error saving requests:', error);
    }
  }, []);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const notifySuperAdmins = useCallback(async (request: ApprovalRequest) => {
    try {
      const { data: superAdmins } = await supabase
        .from('super_admins')
        .select('user_id')
        .eq('is_active', true);
      
      if (superAdmins && superAdmins.length > 0) {
        for (const sa of superAdmins) {
          // Send notification with email for high priority approval requests
          await NotificationTriggerService.approvalRequired(
            sa.user_id,
            APPROVAL_REQUEST_TYPE_LABELS[request.type],
            request.resourceName || request.resourceId,
            '/approval-dashboard'
          );
        }
        console.log('[Approval] Notified', superAdmins.length, 'super admins with email');
      }
    } catch (error) {
      console.error('[Approval] Error notifying super admins:', error);
    }
  }, []);

  const createApprovalRequest = useCallback(async (input: CreateApprovalRequest): Promise<{ success: boolean; requestId?: string; error?: string }> => {
    if (!currentUser) {
      return { success: false, error: 'Not authenticated' };
    }

    if (canBypassApproval()) {
      return { success: true, requestId: 'bypassed' };
    }

    const existingPending = requests.find(
      r => r.resourceType === input.resourceType && 
           r.resourceId === input.resourceId && 
           r.status === 'pending'
    );
    
    if (existingPending) {
      return { success: false, error: 'A pending approval request already exists for this item' };
    }

    const newRequest: ApprovalRequest = {
      id: uuidv4(),
      type: input.type,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      resourceName: input.resourceName,
      resourceDetails: input.resourceDetails,
      requestedBy: currentUser.id,
      requestedByName: currentUser.name,
      requestedAt: new Date().toISOString(),
      status: 'pending',
      reason: input.reason,
      notificationSent: false,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };

    const updatedRequests = [...requests, newRequest];
    saveRequests(updatedRequests);

    await notifySuperAdmins(newRequest);
    
    const finalRequests = updatedRequests.map(r => 
      r.id === newRequest.id ? { ...r, notificationSent: true } : r
    );
    saveRequests(finalRequests);

    return { success: true, requestId: newRequest.id };
  }, [currentUser, requests, saveRequests, notifySuperAdmins, canBypassApproval]);

  const reviewRequest = useCallback(async (
    requestId: string, 
    action: 'approve' | 'reject', 
    notes?: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser) {
      return { success: false, error: 'Not authenticated' };
    }

    if (!canBypassApproval()) {
      return { success: false, error: 'Only Super Admins can review approval requests' };
    }

    const request = requests.find(r => r.id === requestId);
    if (!request) {
      return { success: false, error: 'Request not found' };
    }

    if (request.status !== 'pending') {
      return { success: false, error: 'Request is no longer pending' };
    }

    const updatedRequest: ApprovalRequest = {
      ...request,
      status: action === 'approve' ? 'approved' : 'rejected',
      reviewedBy: currentUser.id,
      reviewedByName: currentUser.name,
      reviewedAt: new Date().toISOString(),
      reviewNotes: notes,
    };

    const updatedRequests = requests.map(r => 
      r.id === requestId ? updatedRequest : r
    );
    saveRequests(updatedRequests);

    // Send notification with email to requester about approval decision
    try {
      await NotificationTriggerService.send({
        userId: request.requestedBy,
        title: action === 'approve' ? 'Request Approved' : 'Request Rejected',
        message: `Your request to ${APPROVAL_REQUEST_TYPE_LABELS[request.type]} has been ${action}ed by ${currentUser.name}${notes ? `: ${notes}` : ''}`,
        type: action === 'approve' ? 'success' : 'error',
        category: 'approvals',
        priority: 'high',
        link: '/approval-dashboard',
        sendEmail: true,
        emailActionLabel: 'View Details'
      });
    } catch (error) {
      console.error('[Approval] Error notifying requester:', error);
    }

    return { success: true };
  }, [currentUser, requests, saveRequests, canBypassApproval]);

  const cancelRequest = useCallback(async (requestId: string): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser) {
      return { success: false, error: 'Not authenticated' };
    }

    const request = requests.find(r => r.id === requestId);
    if (!request) {
      return { success: false, error: 'Request not found' };
    }

    if (request.requestedBy !== currentUser.id && !canBypassApproval()) {
      return { success: false, error: 'You can only cancel your own requests' };
    }

    if (request.status !== 'pending') {
      return { success: false, error: 'Request is no longer pending' };
    }

    const updatedRequests = requests.map(r => 
      r.id === requestId ? { ...r, status: 'cancelled' as ApprovalStatus } : r
    );
    saveRequests(updatedRequests);

    return { success: true };
  }, [currentUser, requests, saveRequests, canBypassApproval]);

  const getRequestById = useCallback((requestId: string) => {
    return requests.find(r => r.id === requestId);
  }, [requests]);

  const getRequestsForResource = useCallback((resourceType: string, resourceId: string) => {
    return requests.filter(r => r.resourceType === resourceType && r.resourceId === resourceId);
  }, [requests]);

  const hasPendingRequest = useCallback((resourceType: string, resourceId: string) => {
    return requests.some(
      r => r.resourceType === resourceType && 
           r.resourceId === resourceId && 
           r.status === 'pending'
    );
  }, [requests]);

  const refreshRequests = useCallback(async () => {
    await loadRequests();
  }, [loadRequests]);

  const getPendingCount = useCallback(() => {
    return requests.filter(r => r.status === 'pending').length;
  }, [requests]);

  const pendingRequests = requests.filter(r => r.status === 'pending');

  const value: ApprovalContextType = {
    pendingRequests,
    allRequests: requests,
    loading,
    createApprovalRequest,
    reviewRequest,
    cancelRequest,
    getRequestById,
    getRequestsForResource,
    hasPendingRequest,
    canBypassApproval,
    refreshRequests,
    getPendingCount,
  };

  return (
    <ApprovalContext.Provider value={value}>
      {children}
    </ApprovalContext.Provider>
  );
}

export function useApproval() {
  const context = useContext(ApprovalContext);
  if (context === undefined) {
    throw new Error('useApproval must be used within an ApprovalProvider');
  }
  return context;
}

export function useApprovalOptional() {
  return useContext(ApprovalContext);
}
