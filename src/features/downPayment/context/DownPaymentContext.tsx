import React, { createContext, useContext, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useUser } from '../user/UserContext';
import { useToast } from '@/shared/hooks/use-toast';
import { useRealtimeTable } from '@/shared/hooks/useRealtimeResource';
import { ensureValidSession } from '@/lib/session-health';
import { withTimeout } from '@/utils/promise-with-timeout';
import {
  useDownPaymentRequestsQuery,
  downPaymentQueryKeys,
  type UserForDownPayment,
} from './downPaymentQueries';
import {
  insertDownPaymentRequest as dbInsertDownPaymentRequest,
  updateDownPaymentRequest as dbUpdateDownPaymentRequest,
  updateDownPaymentRequestSimple as dbUpdateDownPaymentRequestSimple,
  deleteDownPaymentRequestRow as dbDeleteDownPaymentRequestRow,
  bulkUpdateDownPaymentRequests as dbBulkUpdateDownPaymentRequests,
  fetchHubSupervisors as dbFetchHubSupervisors,
  fetchUserFcmTokens as dbFetchUserFcmTokens,
  fetchStakeholderProfiles as dbFetchStakeholderProfiles,
  fetchOrCreateWallet as dbFetchOrCreateWallet,
  insertWalletTransaction as dbInsertWalletTransaction,
  updateMmpSiteEntry as dbUpdateMmpSiteEntry,
  fetchMmpSiteEntryAdditionalData as dbFetchMmpSiteEntryAdditionalData,
  fetchCancelledDownPaymentRequests as dbFetchCancelledDownPaymentRequests,
} from '@/features/downPayment/repository/downPaymentRepository';
import {
  DownPaymentRequest,
  CreateDownPaymentRequest,
  ApproveDownPaymentRequest,
  RejectDownPaymentRequest,
  ProcessPayment,
  DownPaymentStatus,
  ApprovalAuditEntry,
  BulkApprovalRequest,
  ApprovalType,
} from '@/types/down-payment';
import { NotificationTriggerService } from '@/services/NotificationTriggerService';
import { EmailNotificationService } from '@/services/email-notification.service';

interface RevertToPendingData {
  requestId: string;
  revertedBy: string;
  revertedByName?: string;
  reason?: string;
  targetStatus: 'pending_supervisor' | 'pending_admin' | 'approved';
}

interface EditDownPaymentData {
  requestId: string;
  editedBy: string;
  editedByName?: string;
  editedByRole?: string;
  reason: string;
  changes: {
    requestedAmount?: number;
    approvedAmount?: number;
    justification?: string;
    siteName?: string;
    hubName?: string;
  };
}

interface DownPaymentContextType {
  requests: DownPaymentRequest[];
  loading: boolean;
  refreshRequests: () => Promise<void>;
  createRequest: (request: CreateDownPaymentRequest) => Promise<boolean>;
  supervisorApprove: (data: ApproveDownPaymentRequest) => Promise<boolean>;
  supervisorReject: (data: RejectDownPaymentRequest) => Promise<boolean>;
  adminApprove: (data: ApproveDownPaymentRequest) => Promise<boolean>;
  adminReject: (data: RejectDownPaymentRequest) => Promise<boolean>;
  processPayment: (data: ProcessPayment) => Promise<boolean>;
  cancelRequest: (requestId: string) => Promise<boolean>;
  deleteRequest: (requestId: string) => Promise<boolean>;
  bulkApprove: (data: BulkApprovalRequest) => Promise<{ success: number; failed: number }>;
  addAuditEntry: (requestId: string, entry: Omit<ApprovalAuditEntry, 'id' | 'timestamp'>) => Promise<boolean>;
  revertToPending: (data: RevertToPendingData) => Promise<boolean>;
  confirmReceipt: (data: { requestId: string; userId: string; userName: string; signatureId: string; signatureHash: string; signatureMethod: string; signedAt: string }) => Promise<boolean>;
  reportNotReceived: (requestId: string, userId: string, userName: string) => Promise<boolean>;
  resendPaymentNotification: (requestId: string) => Promise<boolean>;
  editRequest: (data: EditDownPaymentData) => Promise<boolean>;
}

const DownPaymentContext = createContext<DownPaymentContextType | undefined>(undefined);

export function useDownPayment() {
  const context = useContext(DownPaymentContext);
  if (!context) {
    throw new Error('useDownPayment must be used within DownPaymentProvider');
  }
  return context;
}

export function DownPaymentProvider({ children }: { children: React.ReactNode }) {
  const { currentUser } = useUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Stable refs — prevent stale closures without causing callback re-creation
  const toastRef = useRef(toast);
  toastRef.current = toast;

  // User shape for query (role-based filtering)
  const userForQuery: UserForDownPayment | null = currentUser
    ? { id: currentUser.id, hubId: currentUser.hubId, secondaryHubId: currentUser.secondaryHubId, role: currentUser.role }
    : null;

  const requestsQuery = useDownPaymentRequestsQuery(userForQuery);
  const requests = requestsQuery.data ?? [];
  const loading = requestsQuery.isLoading;

  // Show toast on fetch error
  useEffect(() => {
    if (requestsQuery.isError && requestsQuery.error) {
      const err = requestsQuery.error as Error;
      const isPermissionError = err?.message?.includes('permission') || err?.message?.includes('RLS') || err?.message?.includes('policy');
      if (!isPermissionError) {
        toastRef.current({ title: 'Error', description: err?.message || 'Failed to load down-payment requests', variant: 'destructive' });
      }
    }
  }, [requestsQuery.isError, requestsQuery.error]);

  const refreshRequests = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: downPaymentQueryKeys.all });
  }, [queryClient]);

  // Debounce ref for realtime-triggered invalidations (avoid re-fetch storms)
  const realtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanupDeletedRequests = useCallback(async () => {
    try {
      const allCancelled = await dbFetchCancelledDownPaymentRequests();

      if (allCancelled.length > 0) {
        const now = new Date().toISOString();
        for (const req of allCancelled) {
          if (req.site_visit_id || req.mmp_site_entry_id) {
            await dbUpdateDownPaymentRequestSimple(req.id, {
              site_visit_id: null,
              mmp_site_entry_id: null,
              updated_at: now,
              metadata: { ...(req.metadata || {}), deleted: true, deleted_at: now, cleanup: true },
            });
          }

          const { deleted } = await dbDeleteDownPaymentRequestRow(req.id);
          if (!deleted) {
            console.log(`[DownPayment] Could not hard-delete ${req.id} (RLS may block)`);
          } else {
            console.log(`[DownPayment] Hard-deleted cancelled request ${req.id}`);
          }
        }
        console.log(`[DownPayment] Cleanup processed ${allCancelled.length} cancelled requests`);
      }
    } catch (e) {
      console.error('[DownPayment] Cleanup error:', e);
    }
  }, []);

  // Real-time: debounced invalidation to avoid re-fetch storms
  const debouncedRefresh = useCallback(() => {
    if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
    realtimeDebounceRef.current = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: downPaymentQueryKeys.all });
    }, 800);
  }, [queryClient]);

  useRealtimeTable('down_payment_requests', debouncedRefresh, {
    enabled: !!currentUser,
  });

  const MUTATION_TIMEOUT_MS = 15000;

  const createRequest = async (request: CreateDownPaymentRequest): Promise<boolean> => {
    const session = await ensureValidSession();
    if (!session.success) {
      toastRef.current({
        title: 'Session may have expired',
        description: session.error || 'Please refresh and try again.',
        variant: 'destructive',
      });
      return false;
    }
    try {
      return await withTimeout(
        (async () => {
      if (request.requestedAmount <= 0) {
        toastRef.current({
          title: 'Invalid Amount',
          description: 'Requested amount must be greater than zero',
          variant: 'destructive',
        });
        return false;
      }

      if (request.requestedAmount > request.totalTransportationBudget) {
        toastRef.current({
          title: 'Amount Exceeds Budget',
          description: `Requested amount (${request.requestedAmount.toLocaleString()} SDG) cannot exceed transportation budget (${request.totalTransportationBudget.toLocaleString()} SDG)`,
          variant: 'destructive',
        });
        return false;
      }

      let hubId = request.hubId;
      const hubName = request.hubName;
      
      if (!hubId && hubName) {
        const hubNameLower = hubName.toLowerCase();
        if (hubNameLower.includes('dongola')) {
          hubId = 'dongola-hub';
        } else if (hubNameLower.includes('kassala')) {
          hubId = 'kassala-hub';
        } else if (hubNameLower.includes('kosti')) {
          hubId = 'kosti-hub';
        } else if (hubNameLower.includes('forchana')) {
          hubId = 'forchana-hub';
        } else if (hubNameLower.includes('khartoum') || hubNameLower.includes('country')) {
          hubId = 'country-office';
        }
        console.log('[DownPayment] Derived hubId from hubName:', { hubName, hubId });
      }
      
      if (!hubId && currentUser?.hubId) {
        hubId = currentUser.hubId;
        console.log('[DownPayment] Using currentUser hubId:', hubId);
      }

      await dbInsertDownPaymentRequest({
        site_visit_id: request.siteVisitId,
        mmp_site_entry_id: request.mmpSiteEntryId,
        site_name: request.siteName,
        requested_by: request.requestedBy,
        requester_role: request.requesterRole,
        hub_id: hubId,
        hub_name: hubName,
        total_transportation_budget: request.totalTransportationBudget,
        requested_amount: request.requestedAmount,
        payment_type: request.paymentType,
        installment_plan: request.installmentPlan || [],
        justification: request.justification,
        supporting_documents: request.supportingDocuments || [],
        status: 'pending_supervisor',
        supervisor_status: 'pending',
        metadata: {
          requested_by_name: currentUser?.fullName || currentUser?.email || '',
          ...(request.stateName ? { state_name: request.stateName } : {}),
          ...(request.localityName ? { locality_name: request.localityName } : {}),
        },
      });

      // Notify hub supervisors that a new down-payment request needs their approval
      try {
        if (hubId) {
          const supervisorIds = await dbFetchHubSupervisors(hubId);
          if (supervisorIds.length > 0) {
            await NotificationTriggerService.downPaymentRequested(
              supervisorIds,
              currentUser?.fullName || currentUser?.email || 'A team member',
              request.requestedAmount,
              'SDG',
              request.justification || request.siteName || 'site visit'
            );
          }
        }
      } catch (notifErr) {
        console.warn('[DownPayment] Supervisor notification failed (non-fatal):', notifErr);
      }

      toastRef.current({
        title: 'Request Submitted',
        description: 'Your down-payment request has been submitted for approval',
      });

      await refreshRequests();
      return true;
        })(),
        MUTATION_TIMEOUT_MS,
        'Request timed out. Please try again or refresh the page.'
      );
    } catch (error: any) {
      console.error('Failed to create down-payment request:', error);
      toastRef.current({
        title: 'Error',
        description: error?.message || 'Failed to submit request',
        variant: 'destructive',
      });
      return false;
    }
  };

  const supervisorApprove = async (data: ApproveDownPaymentRequest): Promise<boolean> => {
    const session = await ensureValidSession();
    if (!session.success) {
      toastRef.current({
        title: 'Session may have expired',
        description: session.error || 'Please refresh and try again.',
        variant: 'destructive',
      });
      return false;
    }
    try {
      return await withTimeout(
        (async () => {
          const request = requests.find(r => r.id === data.requestId);
          if (!request) throw new Error('Request not found');
      
      const approvedAmount = data.customAmount !== undefined 
        ? data.customAmount 
        : request.requestedAmount;
      
      const now = new Date().toISOString();
      const updatedMeta = {
        ...request.metadata,
        supervisor_approved_by_name: data.approvedByName,
        supervisor_approved_amount: approvedAmount,
        approval_type: data.approvalType || 'full',
        approval_percentage: data.approvalPercentage,
        approved_amount: approvedAmount,
      };

      const { rowCount } = await dbUpdateDownPaymentRequest(data.requestId, {
        supervisor_status: 'approved',
        supervisor_approved_by: data.approvedBy,
        supervisor_approved_at: now,
        supervisor_notes: data.notes,
        remaining_amount: approvedAmount,
        status: 'pending_admin',
        admin_status: 'pending',
        updated_at: now,
        metadata: updatedMeta,
      });

      // If no rows updated, RLS may be blocking — try super admin bypass (approve both tiers)
      let bypassFired = false;
      if (rowCount === 0) {
        const { rowCount: bypassRowCount } = await dbUpdateDownPaymentRequest(data.requestId, {
          supervisor_status: 'approved',
          supervisor_approved_by: data.approvedBy,
          supervisor_approved_at: now,
          supervisor_notes: data.notes,
          admin_status: 'approved',
          admin_processed_by: data.approvedBy,
          admin_processed_at: now,
          remaining_amount: approvedAmount,
          status: 'approved',
          updated_at: now,
          metadata: {
            ...updatedMeta,
            admin_processed_by_name: data.approvedByName,
            admin_approved_amount: approvedAmount,
            super_admin_bypass: true,
          },
        });
        if (bypassRowCount === 0) {
          throw new Error('Approval failed: permission denied. Contact your database administrator to update the RLS policy for down_payment_requests.');
        }
        bypassFired = true;
      }

      if (!data.silent) {
        if (request.requestedBy) {
          NotificationTriggerService.send({
            userId: request.requestedBy,
            title: bypassFired ? 'Down-Payment Request Fully Approved' : 'Down-Payment Request Approved by Supervisor',
            message: bypassFired
              ? `Your down-payment request for "${request.siteName}" (${approvedAmount.toLocaleString()} SDG) has been fully approved and is ready for payment processing.`
              : `Your down-payment request for "${request.siteName}" (${approvedAmount.toLocaleString()} SDG) has been approved by supervisor and forwarded to admin.`,
            type: 'success',
            category: 'financial',
            priority: 'high',
            link: bypassFired ? '/wallet' : '/down-payment-approval',
            sendEmail: true,
            emailActionLabel: bypassFired ? 'View Wallet' : 'View Request'
          }).catch(console.error);
        }
        EmailNotificationService.sendAdvanceApprovalToFOM(
          data.approvedByName || 'Supervisor',
          bypassFired ? 'admin' : 'supervisor',
          request.requestedByName || 'Field Staff',
          request.siteName || 'Unknown Site',
          approvedAmount,
          'SDG',
          bypassFired ? 'admin' : 'supervisor'
        ).catch(console.error);
        toast({
          title: bypassFired ? 'Request Fully Approved' : 'Request Approved',
          description: bypassFired
            ? `Approved ${approvedAmount.toLocaleString()} SDG - ready for payment processing`
            : `Approved ${approvedAmount.toLocaleString()} SDG - forwarded to admin`,
        });
        refreshRequests().catch(console.error);
      }
      return true;
        })(),
        MUTATION_TIMEOUT_MS,
        'Request timed out. Please try again or refresh the page.'
      );
    } catch (error: any) {
      console.error('Failed to approve request:', error);
      if (!data.silent) {
        toastRef.current({
          title: 'Error',
          description: error.message || 'Failed to approve request',
          variant: 'destructive',
        });
      }
      return false;
    }
  };

  const supervisorReject = async (data: RejectDownPaymentRequest): Promise<boolean> => {
    const session = await ensureValidSession();
    if (!session.success) {
      toastRef.current({
        title: 'Session may have expired',
        description: session.error || 'Please refresh and try again.',
        variant: 'destructive',
      });
      return false;
    }
    try {
      return await withTimeout(
        (async () => {
          const request = requests.find(r => r.id === data.requestId);
      
      await dbUpdateDownPaymentRequestSimple(data.requestId, {
        supervisor_status: 'rejected',
        supervisor_approved_by: data.rejectedBy,
        supervisor_approved_at: new Date().toISOString(),
        supervisor_rejection_reason: data.rejectionReason,
        status: 'rejected',
        updated_at: new Date().toISOString(),
      });

      // Send email notification to requester
      if (request?.requestedBy) {
        await NotificationTriggerService.send({
          userId: request.requestedBy,
          title: 'Down-Payment Request Rejected',
          message: `Your down-payment request for "${request.siteName}" (${request.requestedAmount.toLocaleString()} SDG) has been rejected by supervisor. Reason: ${data.rejectionReason || 'Not specified'}`,
          type: 'error',
          category: 'financial',
          priority: 'high',
          link: '/down-payment-approval',
          sendEmail: true,
          emailActionLabel: 'View Details'
        });
      }

      toastRef.current({
        title: 'Request Rejected',
        description: 'Down-payment request has been rejected',
        variant: 'destructive',
      });

      await refreshRequests();
      return true;
        })(),
        MUTATION_TIMEOUT_MS,
        'Request timed out. Please try again or refresh the page.'
      );
    } catch (error: any) {
      console.error('Failed to reject request:', error);
      toastRef.current({
        title: 'Error',
        description: error.message || 'Failed to reject request',
        variant: 'destructive',
      });
      return false;
    }
  };

  const adminApprove = async (data: ApproveDownPaymentRequest): Promise<boolean> => {
    const session = await ensureValidSession();
    if (!session.success) {
      toastRef.current({
        title: 'Session may have expired',
        description: session.error || 'Please refresh and try again.',
        variant: 'destructive',
      });
      return false;
    }
    try {
      return await withTimeout(
        (async () => {
          const request = requests.find(r => r.id === data.requestId);
      if (!request) throw new Error('Request not found');
      
      const approvedAmount = data.customAmount !== undefined 
        ? data.customAmount 
        : (request.approvedAmount || request.requestedAmount);

      const isPendingSupervisor = request.status === 'pending_supervisor';
      const now = new Date().toISOString();
      const adminUpdatePayload: Record<string, any> = {
        admin_status: 'approved',
        admin_processed_by: data.approvedBy,
        admin_processed_at: now,
        admin_notes: data.notes,
        remaining_amount: approvedAmount - request.totalPaidAmount,
        status: 'approved',
        updated_at: now,
        metadata: {
          ...request.metadata,
          admin_processed_by_name: data.approvedByName,
          admin_approved_amount: approvedAmount,
          approved_amount: approvedAmount,
          ...(isPendingSupervisor ? { super_admin_bypass: true } : {}),
        },
      };
      if (isPendingSupervisor) {
        adminUpdatePayload.supervisor_status = 'approved';
        adminUpdatePayload.supervisor_approved_by = data.approvedBy;
        adminUpdatePayload.supervisor_approved_at = now;
        adminUpdatePayload.supervisor_notes = data.notes;
      }

      const { rowCount: adminRowCount } = await dbUpdateDownPaymentRequest(data.requestId, adminUpdatePayload);

      if (adminRowCount === 0) {
        throw new Error('Approval failed: permission denied. Please contact your database administrator.');
      }

      // Automatically update the linked mmp_site_entry to mark it as claimed (background)
      if (request.mmpSiteEntryId && request.requestedBy) {
        const siteEntryId = request.mmpSiteEntryId;
        const requestedBy = request.requestedBy;
        (async () => {
          try {
            const now = new Date().toISOString();
            const existingAdditionalData = await dbFetchMmpSiteEntryAdditionalData(siteEntryId);
            await dbUpdateMmpSiteEntry(siteEntryId, {
              status: 'accepted',
              accepted_by: requestedBy,
              accepted_at: now,
              updated_at: now,
              additional_data: {
                ...existingAdditionalData,
                claimed_by: data.approvedByName || request.requestedByName,
                claimed_at: now,
                claim_source: 'advance_request',
                down_payment_request_id: data.requestId,
              },
            });
          } catch (siteUpdateError) {
            console.error('Failed to update linked site entry after advance approval:', siteUpdateError);
          }
        })();
      }

      if (!data.silent) {
        if (request.requestedBy) {
          NotificationTriggerService.send({
            userId: request.requestedBy,
            title: 'Down-Payment Request Fully Approved',
            message: `Your down-payment request for "${request.siteName}" (${approvedAmount.toLocaleString()} SDG) has been approved and is ready for payment processing.`,
            type: 'success',
            category: 'financial',
            priority: 'high',
            link: '/wallet',
            sendEmail: true,
            emailActionLabel: 'View Wallet'
          }).catch(console.error);
        }
        EmailNotificationService.sendAdvanceApprovalToFOM(
          data.approvedByName || 'Admin',
          'admin',
          request.requestedByName || 'Field Staff',
          request.siteName || 'Unknown Site',
          approvedAmount,
          'SDG',
          'admin'
        ).catch(console.error);
        toastRef.current({
          title: 'Request Approved',
          description: `Approved ${approvedAmount.toLocaleString()} SDG - ready for payment`,
        });
        refreshRequests().catch(console.error);
      }
      return true;
        })(),
        MUTATION_TIMEOUT_MS,
        'Request timed out. Please try again or refresh the page.'
      );
    } catch (error: any) {
      console.error('Failed to approve request:', error);
      if (!data.silent) {
        toastRef.current({
          title: 'Error',
          description: error.message || 'Failed to approve request',
          variant: 'destructive',
        });
      }
      return false;
    }
  };

  const adminReject = async (data: RejectDownPaymentRequest): Promise<boolean> => {
    const session = await ensureValidSession();
    if (!session.success) {
      toastRef.current({
        title: 'Session may have expired',
        description: session.error || 'Please refresh and try again.',
        variant: 'destructive',
      });
      return false;
    }
    try {
      return await withTimeout(
        (async () => {
          const request = requests.find(r => r.id === data.requestId);
      
      await dbUpdateDownPaymentRequestSimple(data.requestId, {
        admin_status: 'rejected',
        admin_processed_by: data.rejectedBy,
        admin_processed_at: new Date().toISOString(),
        admin_rejection_reason: data.rejectionReason,
        status: 'rejected',
        updated_at: new Date().toISOString(),
      });

      // Send email notification to requester
      if (request?.requestedBy) {
        await NotificationTriggerService.send({
          userId: request.requestedBy,
          title: 'Down-Payment Request Rejected by Admin',
          message: `Your down-payment request for "${request.siteName}" (${request.requestedAmount.toLocaleString()} SDG) has been rejected by admin. Reason: ${data.rejectionReason || 'Not specified'}`,
          type: 'error',
          category: 'financial',
          priority: 'high',
          link: '/down-payment-approval',
          sendEmail: true,
          emailActionLabel: 'View Details'
        });
      }

      toastRef.current({
        title: 'Request Rejected',
        description: 'Down-payment request has been rejected',
        variant: 'destructive',
      });

      await refreshRequests();
      return true;
        })(),
        MUTATION_TIMEOUT_MS,
        'Request timed out. Please try again or refresh the page.'
      );
    } catch (error: any) {
      console.error('Failed to reject request:', error);
      toastRef.current({
        title: 'Error',
        description: error.message || 'Failed to reject request',
        variant: 'destructive',
      });
      return false;
    }
  };

  const processPayment = async (data: ProcessPayment): Promise<boolean> => {
    const session = await ensureValidSession();
    if (!session.success) {
      toastRef.current({
        title: 'Session may have expired',
        description: session.error || 'Please refresh and try again.',
        variant: 'destructive',
      });
      return false;
    }
    try {
      return await withTimeout(
        (async () => {
          const request = requests.find(r => r.id === data.requestId);
      if (!request) throw new Error('Request not found');

      // Fetch or create wallet — advance does NOT change balance (it is deducted from the site visit fee at completion)
      const walletData = await dbFetchOrCreateWallet(request.requestedBy);

      // Balance is unchanged — advance is a pre-payment deducted from the site visit fee
      const currentBalance = Number(walletData.balances?.['SDG'] ?? 0);

      const advanceMetadata: Record<string, any> = {
        type: 'transportation_advance',
        down_payment_request_id: data.requestId,
        site_name: request.siteName,
        state: request.stateName,
        locality: request.localityName,
        project: request.projectName,
        activity_type: request.activityType,
        hub: request.hubName,
        requested_amount: request.requestedAmount,
        approved_amount: request.approvedAmount,
        advance_from_total: true,
      };
      if (request.mmpSiteEntryId) advanceMetadata.mmp_site_entry_id = request.mmpSiteEntryId;

      const projectLabel = request.projectName || 'WFP TPM';
      const transactionData = await dbInsertWalletTransaction({
        wallet_id: walletData.id,
        user_id: request.requestedBy,
        type: 'down_payment',
        amount: data.amount,
        amount_cents: Math.round(data.amount * 100),
        currency: 'SDG',
        description: `Transport advance (deducted from site fee): ${request.siteName}${request.stateName ? ' - ' + request.stateName : ''} | Project: ${projectLabel}${data.notes ? ' | ' + data.notes : ''}`,
        balance_before: currentBalance,
        balance_after: currentBalance,
        created_by: data.processedBy,
        metadata: advanceMetadata,
      });

      const newPaidAmount = request.totalPaidAmount + data.amount;
      const effectiveApprovedAmount = request.approvedAmount || request.requestedAmount;
      const newRemainingAmount = effectiveApprovedAmount - newPaidAmount;
      const transactionIds = [...request.walletTransactionIds, transactionData.id];

      let newStatus: DownPaymentStatus = 'partially_paid';
      if (newRemainingAmount <= 0) {
        newStatus = 'fully_paid';
      }

      let updatedInstallmentPlan = request.installmentPlan;
      if (data.installmentIndex !== undefined && request.paymentType === 'installments') {
        updatedInstallmentPlan = request.installmentPlan.map((inst, idx) =>
          idx === data.installmentIndex
            ? { ...inst, paid: true, paid_at: new Date().toISOString(), transaction_id: transactionData.id }
            : inst
        );
      }

      const processedAt = new Date().toISOString();

      await dbUpdateDownPaymentRequestSimple(data.requestId, {
        total_paid_amount: newPaidAmount,
        remaining_amount: newRemainingAmount,
        status: newStatus,
        wallet_transaction_ids: transactionIds,
        installment_plan: updatedInstallmentPlan,
        updated_at: processedAt,
        ...(data.receiptUrl ? {
          payment_proof_url: data.receiptUrl,
          payment_proof_uploaded_at: processedAt,
          ...(data.notes?.trim() ? { payment_proof_notes: data.notes.trim() } : {}),
        } : {}),
      } as Record<string, unknown>);

      toastRef.current({
        title: 'Advance Recorded',
        description: data.receiptUrl
          ? `Transport advance of ${data.amount} SDG recorded with payment receipt`
          : `Transport advance of ${data.amount} SDG recorded`,
      });

      // Send FCM push notification to enumerator's mobile device
      try {
        const tokens = await dbFetchUserFcmTokens(request.requestedBy);
        if (tokens.length > 0) {
          await supabase.functions.invoke('send-fcm-push', {
            body: {
              tokens,
              title: '💰 تم صرف السلفة — يرجى التأكيد | Advance Disbursed — Action Required',
              body: `${data.amount.toLocaleString()} SDG — ${request.siteName}\nهل استلمت المبلغ؟ اضغط لتأكيد الاستلام أو الإبلاغ عن عدم الاستلام.\nDid you receive the funds? Tap to ACKNOWLEDGE or report NOT YET RECEIVED.`,
              data: {
                type: 'advance_payment_action',
                requestId: data.requestId,
                siteName: request.siteName,
                amount: String(data.amount),
                has_receipt: data.receiptUrl ? 'true' : 'false',
                receipt_url: data.receiptUrl || '',
                action_acknowledge: 'confirm_received',
                action_not_received: 'report_not_received',
                navigate_to: 'wallet_advances',
              },
            },
          });
        }
      } catch (fcmErr) {
        console.warn('[DownPayment] FCM notification failed (non-fatal):', fcmErr);
      }

      await refreshRequests();
      return true;
        })(),
        MUTATION_TIMEOUT_MS,
        'Request timed out. Please try again or refresh the page.'
      );
    } catch (error: any) {
      console.error('Failed to process payment:', error);
      toastRef.current({
        title: 'Error',
        description: error.message || 'Failed to process payment',
        variant: 'destructive',
      });
      return false;
    }
  };

  const cancelRequest = async (requestId: string): Promise<boolean> => {
    try {
      await dbUpdateDownPaymentRequestSimple(requestId, {
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      });

      toast({
        title: 'Request Cancelled',
        description: 'Down-payment request has been cancelled',
      });

      await refreshRequests();
      return true;
    } catch (error: any) {
      console.error('Failed to cancel request:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to cancel request',
        variant: 'destructive',
      });
      return false;
    }
  };

  const deleteRequest = async (requestId: string): Promise<boolean> => {
    try {
      const now = new Date().toISOString();

      const { rowCount } = await dbUpdateDownPaymentRequest(requestId, {
        status: 'cancelled',
        site_visit_id: null,
        mmp_site_entry_id: null,
        updated_at: now,
        metadata: { deleted: true, deleted_at: now },
      } as Record<string, unknown>);

      if (rowCount === 0) {
        throw new Error('Delete failed: record not found or permission denied. Contact your administrator.');
      }

      toast({
        title: 'Request Deleted / تم حذف الطلب',
        description: 'The request has been removed. / تم إزالة الطلب.',
      });

      await refreshRequests();
      return true;
    } catch (error: any) {
      console.error('Failed to delete request:', error);
      toast({
        title: 'Delete Failed / فشل الحذف',
        description: error.message || 'Failed to delete request. Please try again.',
        variant: 'destructive',
      });
      return false;
    }
  };

  const calculateApprovedAmount = (
    requestedAmount: number,
    approvalType: ApprovalType,
    approvalPercentage?: number,
    customAmount?: number
  ): number => {
    switch (approvalType) {
      case 'full':
        return requestedAmount;
      case 'half':
        return requestedAmount / 2;
      case 'percentage':
        return requestedAmount * ((approvalPercentage || 100) / 100);
      case 'custom':
        return customAmount || requestedAmount;
      default:
        return requestedAmount;
    }
  };

  const addAuditEntry = async (
    requestId: string,
    entry: Omit<ApprovalAuditEntry, 'id' | 'timestamp'>
  ): Promise<boolean> => {
    try {
      const request = requests.find(r => r.id === requestId);
      if (!request) return false;

      const newEntry: ApprovalAuditEntry = {
        ...entry,
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      };

      const updatedAuditLog = [...(request.auditLog || []), newEntry];

      await dbUpdateDownPaymentRequestSimple(requestId, {
        metadata: { ...request.metadata, audit_log: updatedAuditLog },
        updated_at: new Date().toISOString(),
      });
      return true;
    } catch (error: any) {
      console.error('Failed to add audit entry:', error);
      return false;
    }
  };

  const bulkApprove = async (
    data: BulkApprovalRequest
  ): Promise<{ success: number; failed: number }> => {
    const session = await ensureValidSession();
    if (!session.success) {
      toastRef.current({
        title: 'Session may have expired',
        description: session.error || 'Please refresh and try again.',
        variant: 'destructive',
      });
      return { success: 0, failed: data.requestIds.length };
    }
    try {
      return await withTimeout(
        (async () => {
    const userRole = currentUser?.role?.toLowerCase();
    const isSupervisor = userRole === 'supervisor' || userRole === 'hubsupervisor';
    const isAdminRole = ['admin', 'financialadmin', 'superadmin', 'super_admin', 'ict', 'fom',
      'countrydirector', 'country_director', 'datateam', 'data_team'].includes(userRole || '');
    const now = new Date().toISOString();

    // Separate eligible requests into buckets
    const supervisorRows: Record<string, any>[] = [];
    const adminRows: Record<string, any>[] = [];
    const fullyApprovedUserIds: { userId: string; siteName: string; amount: number }[] = [];
    const pendingAdminUserIds: { userId: string; siteName: string; amount: number }[] = [];

    for (const requestId of data.requestIds) {
      const request = requests.find(r => r.id === requestId);
      if (!request) continue;

      const approvedAmount = calculateApprovedAmount(
        request.requestedAmount,
        data.approvalType,
        data.approvalPercentage,
        data.customAmount
      );

      if (request.status === 'pending_supervisor' && (isSupervisor || isAdminRole)) {
        // Super-admins go straight to fully approved (bypass two-tier)
        if (isAdminRole) {
          supervisorRows.push({
            id: requestId,
            supervisor_status: 'approved',
            supervisor_approved_by: data.approvedBy,
            supervisor_approved_at: now,
            supervisor_notes: data.notes || null,
            admin_status: 'approved',
            admin_processed_by: data.approvedBy,
            admin_processed_at: now,
            admin_notes: data.notes || null,
            remaining_amount: approvedAmount,
            status: 'approved',
            updated_at: now,
            metadata: {
              ...request.metadata,
              supervisor_approved_by_name: data.approvedByName,
              supervisor_approved_amount: approvedAmount,
              admin_processed_by_name: data.approvedByName,
              admin_approved_amount: approvedAmount,
              approved_amount: approvedAmount,
              approval_type: data.approvalType || 'full',
              approval_percentage: data.approvalPercentage,
              super_admin_bypass: true,
            },
          });
        } else {
          supervisorRows.push({
            id: requestId,
            supervisor_status: 'approved',
            supervisor_approved_by: data.approvedBy,
            supervisor_approved_at: now,
            supervisor_notes: data.notes || null,
            admin_status: 'pending',
            remaining_amount: approvedAmount,
            status: 'pending_admin',
            updated_at: now,
            metadata: {
              ...request.metadata,
              supervisor_approved_by_name: data.approvedByName,
              supervisor_approved_amount: approvedAmount,
              approved_amount: approvedAmount,
              approval_type: data.approvalType || 'full',
              approval_percentage: data.approvalPercentage,
            },
          });
        }
        if (request.requestedBy) {
          if (isAdminRole) {
            fullyApprovedUserIds.push({ userId: request.requestedBy, siteName: request.siteName || '', amount: approvedAmount });
          } else {
            pendingAdminUserIds.push({ userId: request.requestedBy, siteName: request.siteName || '', amount: approvedAmount });
          }
        }
      } else if (request.status === 'pending_admin' && isAdminRole) {
        adminRows.push({
          id: requestId,
          admin_status: 'approved',
          admin_processed_by: data.approvedBy,
          admin_processed_at: now,
          admin_notes: data.notes || null,
          remaining_amount: approvedAmount - request.totalPaidAmount,
          status: 'approved',
          updated_at: now,
          metadata: {
            ...request.metadata,
            admin_processed_by_name: data.approvedByName,
            admin_approved_amount: approvedAmount,
            approved_amount: approvedAmount,
          },
        });
        if (request.requestedBy) {
          fullyApprovedUserIds.push({ userId: request.requestedBy, siteName: request.siteName || '', amount: approvedAmount });
        }
      } else {
        console.warn(`[BulkApprove] Skipping ${requestId}: status=${request.status}, role=${userRole}`);
      }
    }

    let success = 0;
    let failed = 0;
    const failureReasons: string[] = [];

    // Use individual updates (not upsert) — upsert requires INSERT permission
    // which RLS may not grant; update only needs UPDATE permission
    const allRows = [...supervisorRows, ...adminRows];

    if (allRows.length === 0) {
      toastRef.current({
        title: 'No Eligible Requests / لا توجد طلبات مؤهلة',
        description: `None of the selected requests match your role's approval tier. Check your tier selection (Tier 1 / Tier 2).`,
        variant: 'destructive',
      });
      await refreshRequests();
      return { success: 0, failed: data.requestIds.length };
    }

    const results = await dbBulkUpdateDownPaymentRequests(allRows);

    for (const { id, error, rowCount } of results) {
      if (error) {
        console.error('[BulkApprove] update failed for', id, ':', error.message, error.details, error.hint);
        failureReasons.push(error.message || 'Unknown error');
        failed += 1;
      } else if (rowCount === 0) {
        console.warn('[BulkApprove] 0 rows updated for', id, '— likely RLS or request already changed');
        failureReasons.push(`Request ${id.substring(0, 8).toUpperCase()}: no rows updated (permission or status mismatch)`);
        failed += 1;
      } else {
        success += 1;
      }
    }

    if (success > 0) {
      toastRef.current({
        title: `${success} Request${success > 1 ? 's' : ''} Approved / تمت الموافقة`,
        description: `${success} approved successfully${failed > 0 ? ` · ${failed} failed` : ''}`,
      });
      // Fire consolidated notifications — one notification per requester, not one per request
      const fullyApprovedByUser = fullyApprovedUserIds.reduce<Record<string, Array<{ siteName: string; amount: number }>>>(
        (acc, { userId, siteName, amount }) => {
          if (!acc[userId]) acc[userId] = [];
          acc[userId].push({ siteName, amount });
          return acc;
        }, {}
      );
      Object.entries(fullyApprovedByUser).forEach(([userId, items]) => {
        const isSingle = items.length === 1;
        const totalAmount = items.reduce((s, i) => s + i.amount, 0);
        const siteList = items.map(i => `• ${i.siteName} — ${i.amount.toLocaleString()} SDG`).join('\n');
        NotificationTriggerService.send({
          userId,
          title: isSingle
            ? 'Transport Advance Approved / تمت الموافقة على السلفة'
            : `${items.length} Transport Advances Approved / تمت الموافقة على ${items.length} سلف`,
          message: isSingle
            ? `Your transport advance for "${items[0].siteName}" (${items[0].amount.toLocaleString()} SDG) has been fully approved and is ready for payment processing.`
            : `${items.length} of your transport advance requests have been approved.\n\nTotal: ${totalAmount.toLocaleString()} SDG\n\n${siteList}\n\nAll requests are ready for payment processing.`,
          type: 'success',
          category: 'financial',
          priority: 'high',
          link: '/wallet',
          sendEmail: true,
          emailActionLabel: 'View Wallet',
        }).catch(console.error);
      });

      const pendingAdminByUser = pendingAdminUserIds.reduce<Record<string, Array<{ siteName: string; amount: number }>>>(
        (acc, { userId, siteName, amount }) => {
          if (!acc[userId]) acc[userId] = [];
          acc[userId].push({ siteName, amount });
          return acc;
        }, {}
      );
      Object.entries(pendingAdminByUser).forEach(([userId, items]) => {
        const isSingle = items.length === 1;
        const totalAmount = items.reduce((s, i) => s + i.amount, 0);
        const siteList = items.map(i => `• ${i.siteName} — ${i.amount.toLocaleString()} SDG`).join('\n');
        NotificationTriggerService.send({
          userId,
          title: isSingle
            ? 'Advance Approved by Supervisor / وافق المشرف على السلفة'
            : `${items.length} Advances Approved by Supervisor / وافق المشرف على ${items.length} سلف`,
          message: isSingle
            ? `Your transport advance for "${items[0].siteName}" (${items[0].amount.toLocaleString()} SDG) has been approved by your supervisor and forwarded to admin for final approval.`
            : `${items.length} of your transport advance requests have been approved by your supervisor.\n\nTotal: ${totalAmount.toLocaleString()} SDG\n\n${siteList}\n\nAll are pending final admin approval.`,
          type: 'success',
          category: 'financial',
          priority: 'high',
          link: '/down-payment-approval',
          sendEmail: true,
          emailActionLabel: 'View Requests',
        }).catch(console.error);
      });

      // Notify supervisors, FOM, and coordinators for affected hubs/states
      if (data.notifyStakeholders && success > 0) {
        (async () => {
          try {
            const approvedRequestObjs = data.requestIds
              .map(id => requests.find(r => r.id === id))
              .filter(Boolean) as typeof requests;
            const affectedHubIds = [...new Set(approvedRequestObjs.map(r => r.hubId).filter(Boolean))];
            const affectedHubNames = [...new Set(approvedRequestObjs.map(r => r.hubName).filter(Boolean))];
            const affectedStateNames = [...new Set(approvedRequestObjs.map(r => r.stateName).filter(Boolean))];
            const totalApprovedCount = success;
            const totalApprovedAmount = approvedRequestObjs.reduce((sum, r) => {
              const amt = calculateApprovedAmount(r.requestedAmount, data.approvalType, data.approvalPercentage, data.customAmount);
              return sum + amt;
            }, 0);
            const collectorLabel = data.collectorName ? `for ${data.collectorName}` : '';
            const hubLabel = affectedHubNames.join(', ') || affectedHubIds.join(', ');
            const stateLabel = affectedStateNames.join(', ');
            const summaryMsg = `${totalApprovedCount} transport advance request${totalApprovedCount > 1 ? 's' : ''} ${collectorLabel} have been bulk-approved (SDG ${totalApprovedAmount.toLocaleString()}) — Hub: ${hubLabel}${stateLabel ? ', State: ' + stateLabel : ''}.`;

            // Fetch stakeholders: supervisors + hub supervisors for affected hubs, plus all FOMs and coordinators
            const stakeholders = await dbFetchStakeholderProfiles();
            if (!stakeholders || stakeholders.length === 0) return;

            const notifyIds = new Set<string>();
            // Exclude the approver themselves and the data collectors
            const collectorIds = new Set(approvedRequestObjs.map(r => r.requestedBy).filter(Boolean));
            const skipIds = new Set([data.approvedBy, ...collectorIds]);

            for (const s of stakeholders) {
              if (!s.id || skipIds.has(s.id)) continue;
              const role = (s.role || '').toLowerCase();
              // FOMs and country directors → always notify (they oversee everything)
              if (['fom', 'countrydirector', 'country_director'].includes(role)) {
                notifyIds.add(s.id);
              }
              // Coordinators and supervisors → notify only if linked to an affected hub
              if (['coordinator', 'supervisor', 'hubsupervisor'].includes(role)) {
                if (!s.hub_id || affectedHubIds.includes(s.hub_id)) {
                  notifyIds.add(s.id);
                }
              }
            }

            notifyIds.forEach(uid => {
              NotificationTriggerService.send({
                userId: uid,
                title: `Bulk Advance Approval — ${totalApprovedCount} Requests / موافقة جماعية على السلف`,
                message: summaryMsg,
                type: 'info',
                category: 'financial',
                priority: 'normal',
                link: '/down-payment-approval',
                sendEmail: true,
                emailActionLabel: 'View Approvals',
              }).catch(console.error);
            });
          } catch (e) {
            console.error('[BulkApprove] stakeholder notification error:', e);
          }
        })();
      }
    }

    if (failed > 0 && success === 0) {
      const reason = failureReasons[0] || 'Permission denied or status mismatch';
      toastRef.current({
        title: 'Approval Failed / فشل الموافقة',
        description: `${failed} request${failed > 1 ? 's' : ''} could not be approved. ${reason}`,
        variant: 'destructive',
      });
    } else if (failed > 0) {
      toastRef.current({
        title: 'Partial Failure / فشل جزئي',
        description: `${failed} of ${allRows.length} request${failed > 1 ? 's' : ''} failed: ${failureReasons[0] || 'Permission or status mismatch'}`,
        variant: 'destructive',
      });
    }

    await refreshRequests();
    return { success, failed };
        })(),
        MUTATION_TIMEOUT_MS,
        'Request timed out. Please try again or refresh the page.'
      );
    } catch (error: any) {
      console.error('Failed bulk approve:', error);
      toastRef.current({
        title: 'Error',
        description: error.message || 'Bulk approval failed',
        variant: 'destructive',
      });
      return { success: 0, failed: data.requestIds.length };
    }
  };

  const revertToPending = async (data: RevertToPendingData): Promise<boolean> => {
    const session = await ensureValidSession();
    if (!session.success) {
      toastRef.current({
        title: 'Session may have expired',
        description: session.error || 'Please refresh and try again.',
        variant: 'destructive',
      });
      return false;
    }
    try {
      return await withTimeout(
        (async () => {
      const request = requests.find(r => r.id === data.requestId);
      if (!request) {
        toastRef.current({
          title: 'Error',
          description: 'Request not found',
          variant: 'destructive',
        });
        return false;
      }

      // Build update data based on target status
      let updateData: Record<string, any> = {
        status: data.targetStatus,
        updated_at: new Date().toISOString(),
      };

      const auditEntry: ApprovalAuditEntry = {
        id: crypto.randomUUID(),
        action: 'restored',
        performedBy: data.revertedBy,
        performedByName: data.revertedByName,
        performedByRole: 'admin',
        timestamp: new Date().toISOString(),
        previousValue: request.status,
        newValue: data.targetStatus,
        notes: data.reason || `Reverted to ${data.targetStatus === 'pending_supervisor' ? 'Pending Supervisor' : 'Pending Admin'}`,
      };
      const updatedAuditLog = [...(request.auditLog || []), auditEntry];
      const updatedMetadata: Record<string, any> = { ...request.metadata, audit_log: updatedAuditLog };

      // Detect if request was in a paid state — need to also reset payment fields
      const wasPaid = ['partially_paid', 'fully_paid'].includes(request.status);

      if (data.targetStatus === 'pending_supervisor') {
        updatedMetadata.supervisor_approved_amount = null;
        updatedMetadata.admin_approved_amount = null;
        updatedMetadata.approved_amount = null;
        updatedMetadata.approval_type = null;
        updatedMetadata.approval_percentage = null;
        if (wasPaid) {
          // Also clear payment reconciliation metadata when rolling back from a paid state
          updatedMetadata.advance_reconciled_at = null;
          updatedMetadata.payment_processed_at = null;
          updatedMetadata.receipt_confirmation = null;
        }
        updateData = {
          ...updateData,
          supervisor_status: 'pending',
          supervisor_approved_by: null,
          supervisor_approved_at: null,
          supervisor_notes: null,
          supervisor_rejection_reason: null,
          admin_status: 'pending',
          admin_processed_by: null,
          admin_processed_at: null,
          admin_notes: null,
          admin_rejection_reason: null,
          ...(wasPaid ? { total_paid_amount: 0 } : {}),
          metadata: updatedMetadata,
        };
      } else if (data.targetStatus === 'pending_admin') {
        updatedMetadata.admin_approved_amount = null;
        if (wasPaid) {
          updatedMetadata.advance_reconciled_at = null;
          updatedMetadata.payment_processed_at = null;
          updatedMetadata.receipt_confirmation = null;
        }
        updateData = {
          ...updateData,
          admin_status: 'pending',
          admin_processed_by: null,
          admin_processed_at: null,
          admin_notes: null,
          admin_rejection_reason: null,
          ...(wasPaid ? { total_paid_amount: 0 } : {}),
          metadata: updatedMetadata,
        };
      } else if (data.targetStatus === 'approved') {
        updatedMetadata.advance_reconciled_at = null;
        updatedMetadata.payment_processed_at = null;
        updatedMetadata.receipt_confirmation = null;
        updateData = {
          ...updateData,
          total_paid_amount: 0,
          remaining_amount: request.approvedAmount || request.requestedAmount,
          metadata: updatedMetadata,
        };
      }

      // Race the DB update against a 15-second timeout so the UI never hangs indefinitely
      const updatePromise = dbUpdateDownPaymentRequestSimple(data.requestId, updateData);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out — please try again')), 15000)
      );

      await Promise.race([updatePromise, timeoutPromise]);

      const targetLabel =
        data.targetStatus === 'pending_supervisor' ? 'Pending Supervisor Approval' :
        data.targetStatus === 'pending_admin'       ? 'Pending Admin Approval' :
                                                      'Approved (Ready for Payment)';

      toastRef.current({
        title: 'Status Reverted / تم الإرجاع',
        description: `Request has been reverted to ${targetLabel}`,
      });

      await refreshRequests();
      return true;
        })(),
        MUTATION_TIMEOUT_MS,
        'Request timed out. Please try again or refresh the page.'
      );
    } catch (error: any) {
      console.error('Failed to revert request:', error);
      toastRef.current({
        title: 'Error',
        description: error.message || 'Failed to revert request status',
        variant: 'destructive',
      });
      return false;
    }
  };

  const confirmReceipt = async (data: { requestId: string; userId: string; userName: string; signatureId: string; signatureHash: string; signatureMethod: string; signedAt: string }): Promise<boolean> => {
    try {
      const request = requests.find(r => r.id === data.requestId);
      if (!request) throw new Error('Request not found');

      if (request.requestedBy !== data.userId) {
        throw new Error('Only the person who requested the advance can confirm receipt');
      }

      if (request.status !== 'partially_paid' && request.status !== 'fully_paid') {
        throw new Error('Can only confirm receipt for paid advances');
      }

      if ((request.metadata as any)?.receipt_confirmation?.confirmed) {
        throw new Error('Receipt has already been confirmed');
      }

      const existingMetadata = request.metadata || {};
      const receiptConfirmation = {
        confirmed: true,
        confirmedBy: data.userId,
        confirmedByName: data.userName,
        confirmedAt: data.signedAt,
        signatureId: data.signatureId,
        signatureHash: data.signatureHash,
        signatureMethod: data.signatureMethod,
      };

      await dbUpdateDownPaymentRequestSimple(data.requestId, {
        metadata: {
          ...existingMetadata,
          receipt_confirmation: receiptConfirmation,
        },
        updated_at: new Date().toISOString(),
      });

      await addAuditEntry(data.requestId, {
        action: 'receipt_confirmed',
        performedBy: data.userId,
        performedByName: data.userName,
        notes: `Funds receipt confirmed via ${data.signatureMethod} signature`,
      });

      toast({
        title: 'Receipt Confirmed / تم تأكيد الاستلام',
        description: 'You have confirmed receiving the advance funds. / لقد أكدت استلام أموال السلفة.',
      });

      await refreshRequests();
      return true;
    } catch (error: any) {
      console.error('Failed to confirm receipt:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to confirm receipt',
        variant: 'destructive',
      });
      return false;
    }
  };

  const reportNotReceived = async (requestId: string, userId: string, userName: string): Promise<boolean> => {
    try {
      const request = requests.find(r => r.id === requestId);
      if (!request) throw new Error('Request not found');
      const existingMetadata = (request.metadata as any) || {};
      await dbUpdateDownPaymentRequestSimple(requestId, {
        metadata: {
          ...existingMetadata,
          receipt_confirmation: {
            confirmed: false,
            denied: true,
            deniedAt: new Date().toISOString(),
            deniedBy: userId,
            deniedByName: userName,
          },
        },
        updated_at: new Date().toISOString(),
      });
      await addAuditEntry(requestId, {
        action: 'receipt_not_received',
        performedBy: userId,
        performedByName: userName,
        notes: 'Requester reported funds not yet received',
      });
      toast({
        title: 'Reported: Not Yet Received / تم الإبلاغ: لم يُستلم بعد',
        description: 'Recorded that the requester has not received the funds. / تم تسجيل عدم استلام الأموال.',
      });
      await refreshRequests();
      return true;
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to report', variant: 'destructive' });
      return false;
    }
  };

  const resendPaymentNotification = async (requestId: string): Promise<boolean> => {
    try {
      const request = requests.find(r => r.id === requestId);
      if (!request) throw new Error('Request not found');
      const existingMetadata = (request.metadata as any) || {};
      await dbUpdateDownPaymentRequestSimple(requestId, {
        metadata: { ...existingMetadata, receipt_confirmation: null },
        updated_at: new Date().toISOString(),
      });
      try {
        const tokens = await dbFetchUserFcmTokens(request.requestedBy);
        if (tokens.length > 0) {
          await supabase.functions.invoke('send-fcm-push', {
            body: {
              tokens,
              title: '💰 إعادة إرسال — تأكيد استلام السلفة | Resent — Please Confirm Receipt',
              body: `${(request.approvedAmount || request.requestedAmount).toLocaleString()} SDG — ${request.siteName}\nهل استلمت المبلغ؟ اضغط لتأكيد الاستلام.\nDid you receive the funds? Tap to confirm receipt.`,
              data: {
                type: 'advance_payment_action',
                requestId: request.id,
                siteName: request.siteName,
                amount: String(request.approvedAmount || request.requestedAmount),
                has_receipt: existingMetadata?.paymentProofUrl ? 'true' : 'false',
                receipt_url: existingMetadata?.paymentProofUrl || '',
                action_acknowledge: 'confirm_received',
                action_not_received: 'report_not_received',
                navigate_to: 'wallet_advances',
              },
            },
          });
        }
      } catch (fcmErr) {
        console.warn('[DownPayment] FCM resend failed (non-fatal):', fcmErr);
      }
      await addAuditEntry(requestId, {
        action: 'notification_resent',
        performedBy: 'system',
        performedByName: 'Admin',
        notes: 'Payment confirmation notification resent to requester',
      });
      toast({
        title: 'Notification Resent / تم إعادة الإرسال',
        description: 'A new confirmation request has been sent to the requester. / تم إرسال طلب تأكيد جديد لمقدم الطلب.',
      });
      await refreshRequests();
      return true;
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to resend notification', variant: 'destructive' });
      return false;
    }
  };

  const editRequest = async (data: EditDownPaymentData): Promise<boolean> => {
    const session = await ensureValidSession();
    if (!session.success) {
      toastRef.current({
        title: 'Session may have expired',
        description: session.error || 'Please refresh and try again.',
        variant: 'destructive',
      });
      return false;
    }
    try {
      return await withTimeout(
        (async () => {
          const request = requests.find(r => r.id === data.requestId);
      if (!request) throw new Error('Request not found');

      const previousValues: Record<string, any> = {};
      const newValues: Record<string, any> = {};
      const dbUpdate: Record<string, any> = { updated_at: new Date().toISOString() };

      if (data.changes.requestedAmount !== undefined && data.changes.requestedAmount !== request.requestedAmount) {
        if (data.changes.requestedAmount <= 0) throw new Error('Requested amount must be greater than zero');
        if (data.changes.requestedAmount < request.totalPaidAmount) throw new Error('Requested amount cannot be less than already paid amount');
        previousValues.requestedAmount = request.requestedAmount;
        newValues.requestedAmount = data.changes.requestedAmount;
        dbUpdate.requested_amount = data.changes.requestedAmount;
      }
      if (data.changes.approvedAmount !== undefined && data.changes.approvedAmount !== request.approvedAmount) {
        const finalRequestedAmt = data.changes.requestedAmount ?? request.requestedAmount;
        if (data.changes.approvedAmount <= 0) throw new Error('Approved amount must be greater than zero');
        if (data.changes.approvedAmount > finalRequestedAmt) throw new Error('Approved amount cannot exceed requested amount');
        if (data.changes.approvedAmount < request.totalPaidAmount) throw new Error('Approved amount cannot be less than already paid amount');
        previousValues.approvedAmount = request.approvedAmount;
        newValues.approvedAmount = data.changes.approvedAmount;
      }
      if (data.changes.justification !== undefined && data.changes.justification !== request.justification) {
        previousValues.justification = request.justification;
        newValues.justification = data.changes.justification;
        dbUpdate.justification = data.changes.justification;
      }
      if (data.changes.siteName !== undefined && data.changes.siteName !== request.siteName) {
        previousValues.siteName = request.siteName;
        newValues.siteName = data.changes.siteName;
        dbUpdate.site_name = data.changes.siteName;
      }
      if (data.changes.hubName !== undefined && data.changes.hubName !== request.hubName) {
        previousValues.hubName = request.hubName;
        newValues.hubName = data.changes.hubName;
        dbUpdate.hub_name = data.changes.hubName;
      }

      if (Object.keys(newValues).length === 0) {
        toast({ title: 'No Changes', description: 'No fields were modified.' });
        return false;
      }

      const auditEntry: ApprovalAuditEntry = {
        id: crypto.randomUUID(),
        action: 'request_edited',
        performedBy: data.editedBy,
        performedByName: data.editedByName,
        performedByRole: data.editedByRole,
        timestamp: new Date().toISOString(),
        previousValue: previousValues,
        newValue: newValues,
        notes: data.reason,
      };

      const finalApprovedAmt = data.changes.approvedAmount ?? request.approvedAmount ?? request.requestedAmount;
      if (newValues.requestedAmount !== undefined || newValues.approvedAmount !== undefined) {
        dbUpdate.remaining_amount = Math.max(0, finalApprovedAmt - request.totalPaidAmount);
      }

      const updatedAuditLog = [...(request.auditLog || []), auditEntry];
      const updatedMetadata = {
        ...request.metadata,
        audit_log: updatedAuditLog,
        ...(data.changes.approvedAmount !== undefined ? { approved_amount: data.changes.approvedAmount } : {}),
        last_edited_by: data.editedByName || data.editedBy,
        last_edited_at: new Date().toISOString(),
        last_edit_reason: data.reason,
      };

      dbUpdate.metadata = updatedMetadata;

      await dbUpdateDownPaymentRequestSimple(data.requestId, dbUpdate);

      toastRef.current({
        title: 'Request Updated / تم تحديث الطلب',
        description: `${Object.keys(newValues).length} field(s) updated with audit trail. / تم تحديث ${Object.keys(newValues).length} حقل(حقول) مع سجل التدقيق.`,
      });

      await refreshRequests();
      return true;
        })(),
        MUTATION_TIMEOUT_MS,
        'Request timed out. Please try again or refresh the page.'
      );
    } catch (error: any) {
      console.error('Failed to edit request:', error);
      toastRef.current({
        title: 'Error',
        description: error.message || 'Failed to edit request',
        variant: 'destructive',
      });
      return false;
    }
  };

  const value: DownPaymentContextType = {
    requests,
    loading,
    refreshRequests,
    createRequest,
    supervisorApprove,
    supervisorReject,
    adminApprove,
    adminReject,
    processPayment,
    cancelRequest,
    deleteRequest,
    bulkApprove,
    addAuditEntry,
    revertToPending,
    confirmReceipt,
    reportNotReceived,
    resendPaymentNotification,
    editRequest,
  };

  return <DownPaymentContext.Provider value={value}>{children}</DownPaymentContext.Provider>;
}
