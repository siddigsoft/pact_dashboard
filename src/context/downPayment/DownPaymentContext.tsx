import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '../user/UserContext';
import { useToast } from '@/hooks/use-toast';
import { useRealtimeTable } from '@/hooks/useRealtimeResource';
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

function transformFromDB(data: any): DownPaymentRequest {
  // Extract state and project from joined mmp_site_entries if available
  const mmpEntry = data.mmp_site_entries;
  
  // For state, try multiple sources in order of preference:
  // 1. MMP site entry state
  // 2. Metadata state_name  
  // Do NOT fall back to hub_name - hubs and states are separate geographic levels
  const stateName = mmpEntry?.state || 
                    data.metadata?.state_name || 
                    undefined;
  
  return {
    id: data.id,
    siteVisitId: data.site_visit_id,
    mmpSiteEntryId: data.mmp_site_entry_id,
    siteName: data.site_name,
    mmpName: mmpEntry?.mmp_files?.name || data.metadata?.mmp_name || undefined,
    stateName,
    localityName: mmpEntry?.locality || data.metadata?.locality_name || undefined,
    projectName: mmpEntry?.cp_name || mmpEntry?.mmp_files?.projects?.name || mmpEntry?.mmp_files?.project_name || data.metadata?.project_name || 'PACT',
    activityType: mmpEntry?.activity_type || data.metadata?.activity_type || undefined,
    requestedBy: data.requested_by,
    requestedByName: data.metadata?.requested_by_name || undefined,
    requestedAt: data.requested_at,
    requesterRole: data.requester_role,
    hubId: data.hub_id,
    hubName: data.hub_name,
    totalTransportationBudget: parseFloat(data.total_transportation_budget),
    requestedAmount: parseFloat(data.requested_amount),
    approvedAmount: data.metadata?.approved_amount ? parseFloat(data.metadata.approved_amount) : undefined,
    approvalType: data.metadata?.approval_type,
    approvalPercentage: data.metadata?.approval_percentage,
    paymentType: data.payment_type,
    installmentPlan: data.installment_plan || [],
    paidInstallments: data.paid_installments || [],
    justification: data.justification,
    supportingDocuments: data.supporting_documents || [],
    supervisorId: data.supervisor_id,
    supervisorStatus: data.supervisor_status,
    supervisorApprovedBy: data.supervisor_approved_by,
    supervisorApprovedByName: data.metadata?.supervisor_approved_by_name || undefined,
    supervisorApprovedAt: data.supervisor_approved_at,
    supervisorNotes: data.supervisor_notes,
    supervisorRejectionReason: data.supervisor_rejection_reason,
    supervisorApprovedAmount: data.metadata?.supervisor_approved_amount ? parseFloat(data.metadata.supervisor_approved_amount) : undefined,
    adminStatus: data.admin_status,
    adminProcessedBy: data.admin_processed_by,
    adminProcessedByName: data.metadata?.admin_processed_by_name || undefined,
    adminProcessedAt: data.admin_processed_at,
    adminNotes: data.admin_notes,
    adminRejectionReason: data.admin_rejection_reason,
    adminApprovedAmount: data.metadata?.admin_approved_amount ? parseFloat(data.metadata.admin_approved_amount) : undefined,
    status: data.status,
    totalPaidAmount: parseFloat(data.total_paid_amount || 0),
    remainingAmount: parseFloat(data.remaining_amount || 0),
    walletTransactionIds: data.wallet_transaction_ids || [],
    auditLog: data.metadata?.audit_log || [],
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    metadata: data.metadata || {},
  };
}

export function DownPaymentProvider({ children }: { children: React.ReactNode }) {
  const { currentUser } = useUser();
  const { toast } = useToast();
  const [requests, setRequests] = useState<DownPaymentRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const cleanupDeletedRequests = useCallback(async () => {
    try {
      const { data: allCancelled } = await supabase
        .from('down_payment_requests')
        .select('id, metadata, site_visit_id, mmp_site_entry_id')
        .eq('status', 'cancelled');

      if (allCancelled && allCancelled.length > 0) {
        const now = new Date().toISOString();
        for (const req of allCancelled) {
          if (req.site_visit_id || req.mmp_site_entry_id) {
            await supabase
              .from('down_payment_requests')
              .update({
                site_visit_id: null,
                mmp_site_entry_id: null,
                updated_at: now,
                metadata: { ...(req.metadata || {}), deleted: true, deleted_at: now, cleanup: true },
              } as any)
              .eq('id', req.id);
          }

          const { error: deleteError } = await supabase
            .from('down_payment_requests')
            .delete()
            .eq('id', req.id)
            .eq('status', 'cancelled');
          if (deleteError) {
            console.log(`[DownPayment] Could not hard-delete ${req.id} (RLS may block): ${deleteError.message}`);
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

  const refreshRequests = useCallback(async () => {
    if (!currentUser) {
      setRequests([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const userRole = currentUser.role?.toLowerCase();
      
      // Debug logging for troubleshooting
      console.log('[DownPayment] Fetching requests for user:', {
        userId: currentUser.id,
        role: userRole,
        hubId: currentUser.hubId
      });

      // Note: The join with mmp_site_entries may fail if RLS blocks access
      // We'll try with the join first, then fallback to without if it fails
      // Also join hub_states to get state from hub if not available from mmp_site_entries
      let query = supabase.from('down_payment_requests').select(`
        *,
        mmp_site_entries (
          state,
          locality,
          cp_name,
          activity_type,
          mmp_files (
            name,
            project_name,
            projects (
              name
            )
          )
        )
      `);

      if (userRole === 'datacollector' || userRole === 'coordinator') {
        // Data collectors and coordinators only see their own requests
        query = query.eq('requested_by', currentUser.id);
      } else if (userRole === 'supervisor' || userRole === 'hubsupervisor') {
        /**
         * HUB-BASED SUPERVISION: Hub supervisors manage MULTIPLE states within their hub.
         * Examples: Kosti Hub = 7 states, Kassala Hub = 5 states
         * Supervisors see their own requests + all requests from their hub(s)
         * Hub supervisors need hub_id assigned (NOT state_id) to see all team requests
         * SECONDARY HUB: Supervisors with secondary_hub_id also see requests from that hub
         */
        if (currentUser.hubId) {
          // Build OR filter for primary hub and optionally secondary hub
          let hubFilter = `requested_by.eq.${currentUser.id},hub_id.eq.${currentUser.hubId}`;
          if (currentUser.secondaryHubId) {
            hubFilter += `,hub_id.eq.${currentUser.secondaryHubId}`;
            console.log('[DownPayment] Supervisor has secondary hub:', currentUser.secondaryHubId);
          }
          query = query.or(hubFilter);
        } else {
          // If supervisor doesn't have hubId, try matching by hub name or just show own requests
          console.warn('[DownPayment] Supervisor has no hubId set - showing only own requests');
          query = query.eq('requested_by', currentUser.id);
        }
      } else if (
        userRole === 'admin' || 
        userRole === 'financialadmin' || 
        userRole === 'superadmin' || 
        userRole === 'super_admin' ||
        userRole === 'ict' ||
        userRole === 'fom' ||
        userRole === 'field operation manager' ||
        userRole === 'countrydirector' ||
        userRole === 'country_director' ||
        userRole === 'datateam' ||
        userRole === 'data_team'
      ) {
        // Admins, super admins, FOM, ICT, and management roles see all requests - no filter applied
        console.log('[DownPayment] Admin/Management user - fetching all requests');
      } else {
        // Fallback: other roles see only their own requests
        console.log('[DownPayment] Other role - showing only own requests:', userRole);
        query = query.eq('requested_by', currentUser.id);
      }

      let { data, error } = await query.order('created_at', { ascending: false });

      // If the join with mmp_site_entries fails, try without the join
      if (error) {
        console.warn('[DownPayment] Query with join failed, trying without join:', error.message);
        
        // Rebuild query without the join
        let fallbackQuery = supabase.from('down_payment_requests').select('*');
        
        // Re-apply the same filters
        if (userRole === 'datacollector' || userRole === 'coordinator') {
          fallbackQuery = fallbackQuery.eq('requested_by', currentUser.id);
        } else if (userRole === 'supervisor' || userRole === 'hubsupervisor') {
          if (currentUser.hubId) {
            let hubFilter = `requested_by.eq.${currentUser.id},hub_id.eq.${currentUser.hubId}`;
            if (currentUser.secondaryHubId) {
              hubFilter += `,hub_id.eq.${currentUser.secondaryHubId}`;
            }
            fallbackQuery = fallbackQuery.or(hubFilter);
          } else {
            fallbackQuery = fallbackQuery.eq('requested_by', currentUser.id);
          }
        } else if (!(
          userRole === 'admin' || userRole === 'financialadmin' || 
          userRole === 'superadmin' || userRole === 'super_admin' ||
          userRole === 'ict' || userRole === 'fom' || 
          userRole === 'field operation manager' ||
          userRole === 'countrydirector' || userRole === 'country_director' ||
          userRole === 'datateam' || userRole === 'data_team'
        )) {
          fallbackQuery = fallbackQuery.eq('requested_by', currentUser.id);
        }
        
        const fallbackResult = await fallbackQuery.order('created_at', { ascending: false });
        data = fallbackResult.data;
        error = fallbackResult.error;
      }

      if (error) {
        // Suppress RLS permission errors - just log them
        if (error.code === '42501' || error.message?.includes('permission') || error.message?.includes('RLS')) {
          console.log('[DownPayment] No permission to fetch requests (expected for some roles)');
          setRequests([]);
          setLoading(false);
          return;
        }
        throw error;
      }
      
      console.log('[DownPayment] Fetched requests:', data?.length || 0);
      const transformed = (data || []).map(transformFromDB).filter(r => {
        if (r.status === 'deleted') return false;
        if (r.status === 'cancelled' && r.metadata?.deleted) return false;
        return true;
      });
      
      const needsEnrichment = transformed.filter(r => (!r.stateName || !r.localityName) && r.mmpSiteEntryId);
      if (needsEnrichment.length > 0) {
        const entryIds = [...new Set(needsEnrichment.map(r => r.mmpSiteEntryId).filter(Boolean))];
        try {
          const { data: entries } = await supabase
            .from('mmp_site_entries')
            .select('id, state, locality')
            .in('id', entryIds as string[]);
          
          if (entries && entries.length > 0) {
            const entryMap = new Map(entries.map(e => [e.id, e]));
            transformed.forEach(r => {
              if (r.mmpSiteEntryId && entryMap.has(r.mmpSiteEntryId)) {
                const entry = entryMap.get(r.mmpSiteEntryId)!;
                if (!r.stateName && entry.state) r.stateName = entry.state;
                if (!r.localityName && entry.locality) r.localityName = entry.locality;
              }
            });
            console.log('[DownPayment] Enriched state/locality for', entries.length, 'entries');
          }
        } catch (enrichErr) {
          console.warn('[DownPayment] State/locality enrichment failed:', enrichErr);
        }
      }
      
      setRequests(transformed);
    } catch (error: any) {
      // Only log and show error for unexpected errors, not permission issues
      const isPermissionError = error.code === '42501' || 
        error.message?.includes('permission') || 
        error.message?.includes('RLS') ||
        error.message?.includes('policy');
      
      if (!isPermissionError) {
        console.error('Failed to fetch down-payment requests:', error);
        toast({
          title: 'Error',
          description: 'Failed to load down-payment requests',
          variant: 'destructive',
        });
      } else {
        console.log('[DownPayment] Permission denied (expected for some roles)');
      }
    } finally {
      setLoading(false);
    }
  }, [currentUser, toast]);

  useEffect(() => {
    cleanupDeletedRequests();
    refreshRequests();

    // Set up real-time subscription for down payment requests
    const downPaymentChannel = supabase
      .channel('down-payment-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'down_payment_requests'
        },
        (payload) => {
          console.log('Down payment requests change detected:', payload);
          refreshRequests();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Down payment requests real-time subscription active');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Down payment requests real-time subscription error - Check if replication is enabled in Supabase');
        } else if (status === 'TIMED_OUT') {
          console.warn('⏱️ Down payment requests real-time subscription timed out');
        } else {
          console.log('Down payment requests subscription status:', status);
        }
      });

    // Cleanup subscription on unmount
    return () => {
      supabase.removeChannel(downPaymentChannel);
    };
  }, [refreshRequests]);

  useRealtimeTable('down_payment_requests', refreshRequests, {
    enabled: !!currentUser,
  });

  const createRequest = async (request: CreateDownPaymentRequest): Promise<boolean> => {
    try {
      if (request.requestedAmount <= 0) {
        toast({
          title: 'Invalid Amount',
          description: 'Requested amount must be greater than zero',
          variant: 'destructive',
        });
        return false;
      }

      if (request.requestedAmount > request.totalTransportationBudget) {
        toast({
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

      const { error } = await supabase.from('down_payment_requests').insert({
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

      if (error) throw error;

      toast({
        title: 'Request Submitted',
        description: 'Your down-payment request has been submitted for approval',
      });

      await refreshRequests();
      return true;
    } catch (error: any) {
      console.error('Failed to create down-payment request:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to submit request',
        variant: 'destructive',
      });
      return false;
    }
  };

  const supervisorApprove = async (data: ApproveDownPaymentRequest): Promise<boolean> => {
    try {
      const request = requests.find(r => r.id === data.requestId);
      if (!request) throw new Error('Request not found');
      
      const approvedAmount = data.customAmount !== undefined 
        ? data.customAmount 
        : request.requestedAmount;
      
      const { error } = await supabase
        .from('down_payment_requests')
        .update({
          supervisor_status: 'approved',
          supervisor_approved_by: data.approvedBy,
          supervisor_approved_at: new Date().toISOString(),
          supervisor_notes: data.notes,
          remaining_amount: approvedAmount,
          status: 'pending_admin',
          admin_status: 'pending',
          updated_at: new Date().toISOString(),
          metadata: {
            ...request.metadata,
            supervisor_approved_by_name: data.approvedByName,
            supervisor_approved_amount: approvedAmount,
            approval_type: data.approvalType || 'full',
            approval_percentage: data.approvalPercentage,
            approved_amount: approvedAmount,
          },
        })
        .eq('id', data.requestId);

      if (error) throw error;

      if (request.requestedBy) {
        await NotificationTriggerService.send({
          userId: request.requestedBy,
          title: 'Down-Payment Request Approved by Supervisor',
          message: `Your down-payment request for "${request.siteName}" (${approvedAmount.toLocaleString()} SDG) has been approved by supervisor and forwarded to admin.`,
          type: 'success',
          category: 'financial',
          priority: 'high',
          link: '/down-payment-approval',
          sendEmail: true,
          emailActionLabel: 'View Request'
        });
      }

      toast({
        title: 'Request Approved',
        description: `Approved ${approvedAmount.toLocaleString()} SDG - forwarded to admin`,
      });

      await refreshRequests();
      return true;
    } catch (error: any) {
      console.error('Failed to approve request:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to approve request',
        variant: 'destructive',
      });
      return false;
    }
  };

  const supervisorReject = async (data: RejectDownPaymentRequest): Promise<boolean> => {
    try {
      const request = requests.find(r => r.id === data.requestId);
      
      const { error } = await supabase
        .from('down_payment_requests')
        .update({
          supervisor_status: 'rejected',
          supervisor_approved_by: data.rejectedBy,
          supervisor_approved_at: new Date().toISOString(),
          supervisor_rejection_reason: data.rejectionReason,
          status: 'rejected',
          updated_at: new Date().toISOString(),
        })
        .eq('id', data.requestId);

      if (error) throw error;

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

      toast({
        title: 'Request Rejected',
        description: 'Down-payment request has been rejected',
        variant: 'destructive',
      });

      await refreshRequests();
      return true;
    } catch (error: any) {
      console.error('Failed to reject request:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to reject request',
        variant: 'destructive',
      });
      return false;
    }
  };

  const adminApprove = async (data: ApproveDownPaymentRequest): Promise<boolean> => {
    try {
      const request = requests.find(r => r.id === data.requestId);
      if (!request) throw new Error('Request not found');
      
      const approvedAmount = data.customAmount !== undefined 
        ? data.customAmount 
        : (request.approvedAmount || request.requestedAmount);
      
      const { error } = await supabase
        .from('down_payment_requests')
        .update({
          admin_status: 'approved',
          admin_processed_by: data.approvedBy,
          admin_processed_at: new Date().toISOString(),
          admin_notes: data.notes,
          remaining_amount: approvedAmount - request.totalPaidAmount,
          status: 'approved',
          updated_at: new Date().toISOString(),
          metadata: {
            ...request.metadata,
            admin_processed_by_name: data.approvedByName,
            admin_approved_amount: approvedAmount,
            approved_amount: approvedAmount,
          },
        })
        .eq('id', data.requestId);

      if (error) throw error;

      // Automatically update the linked mmp_site_entry to mark it as claimed
      if (request.mmpSiteEntryId && request.requestedBy) {
        const now = new Date().toISOString();
        try {
          const { data: existingEntry } = await supabase
            .from('mmp_site_entries')
            .select('additional_data')
            .eq('id', request.mmpSiteEntryId)
            .single();
          
          const existingAdditionalData = existingEntry?.additional_data || {};
          
          await supabase
            .from('mmp_site_entries')
            .update({
              status: 'accepted',
              accepted_by: request.requestedBy,
              accepted_at: now,
              updated_at: now,
              additional_data: {
                ...existingAdditionalData,
                claimed_by: data.approvedByName || request.requestedByName,
                claimed_at: now,
                claim_source: 'advance_request',
                down_payment_request_id: data.requestId,
              }
            })
            .eq('id', request.mmpSiteEntryId);
        } catch (siteUpdateError) {
          console.error('Failed to update linked site entry after advance approval:', siteUpdateError);
        }
      }

      if (request.requestedBy) {
        await NotificationTriggerService.send({
          userId: request.requestedBy,
          title: 'Down-Payment Request Fully Approved',
          message: `Your down-payment request for "${request.siteName}" (${approvedAmount.toLocaleString()} SDG) has been approved and is ready for payment processing.`,
          type: 'success',
          category: 'financial',
          priority: 'high',
          link: '/wallet',
          sendEmail: true,
          emailActionLabel: 'View Wallet'
        });
      }

      toast({
        title: 'Request Approved',
        description: `Approved ${approvedAmount.toLocaleString()} SDG - ready for payment`,
      });

      await refreshRequests();
      return true;
    } catch (error: any) {
      console.error('Failed to approve request:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to approve request',
        variant: 'destructive',
      });
      return false;
    }
  };

  const adminReject = async (data: RejectDownPaymentRequest): Promise<boolean> => {
    try {
      const request = requests.find(r => r.id === data.requestId);
      
      const { error } = await supabase
        .from('down_payment_requests')
        .update({
          admin_status: 'rejected',
          admin_processed_by: data.rejectedBy,
          admin_processed_at: new Date().toISOString(),
          admin_rejection_reason: data.rejectionReason,
          status: 'rejected',
          updated_at: new Date().toISOString(),
        })
        .eq('id', data.requestId);

      if (error) throw error;

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

      toast({
        title: 'Request Rejected',
        description: 'Down-payment request has been rejected',
        variant: 'destructive',
      });

      await refreshRequests();
      return true;
    } catch (error: any) {
      console.error('Failed to reject request:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to reject request',
        variant: 'destructive',
      });
      return false;
    }
  };

  const processPayment = async (data: ProcessPayment): Promise<boolean> => {
    try {
      const request = requests.find(r => r.id === data.requestId);
      if (!request) throw new Error('Request not found');

      const { data: walletData, error: walletError } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', request.requestedBy)
        .single();

      if (walletError) throw walletError;

      const currentBalance = walletData.balances['SDG'] || 0;
      const newBalance = currentBalance + data.amount;

      const { error: walletUpdateError } = await supabase
        .from('wallets')
        .update({
          balances: { ...walletData.balances, SDG: newBalance },
          total_earned: parseFloat(walletData.total_earned || 0) + data.amount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', walletData.id);

      if (walletUpdateError) throw walletUpdateError;

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
      };
      if (request.mmpSiteEntryId) advanceMetadata.mmp_site_entry_id = request.mmpSiteEntryId;

      const { data: transactionData, error: transactionError } = await supabase
        .from('wallet_transactions')
        .insert({
          wallet_id: walletData.id,
          user_id: request.requestedBy,
          type: 'down_payment',
          amount: data.amount,
          currency: 'SDG',
          description: `Transport advance: ${request.siteName}${request.stateName ? ' - ' + request.stateName : ''}${request.projectName ? ' | Project: ' + request.projectName : ''}${data.notes ? ' | ' + data.notes : ''}`,
          balance_before: currentBalance,
          balance_after: newBalance,
          created_by: data.processedBy,
          metadata: advanceMetadata,
        })
        .select()
        .single();

      if (transactionError) throw transactionError;

      const newPaidAmount = request.totalPaidAmount + data.amount;
      const newRemainingAmount = request.requestedAmount - newPaidAmount;
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

      const { error: requestUpdateError } = await supabase
        .from('down_payment_requests')
        .update({
          total_paid_amount: newPaidAmount,
          remaining_amount: newRemainingAmount,
          status: newStatus,
          wallet_transaction_ids: transactionIds,
          installment_plan: updatedInstallmentPlan,
          updated_at: new Date().toISOString(),
        })
        .eq('id', data.requestId);

      if (requestUpdateError) throw requestUpdateError;

      toast({
        title: 'Payment Processed',
        description: `Payment of ${data.amount} SDG credited to wallet`,
      });

      await refreshRequests();
      return true;
    } catch (error: any) {
      console.error('Failed to process payment:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to process payment',
        variant: 'destructive',
      });
      return false;
    }
  };

  const cancelRequest = async (requestId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('down_payment_requests')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (error) throw error;

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
      const { data: existing } = await supabase
        .from('down_payment_requests')
        .select('metadata')
        .eq('id', requestId)
        .single();
      const existingMeta = existing?.metadata || {};
      const { error } = await supabase
        .from('down_payment_requests')
        .update({
          status: 'cancelled',
          site_visit_id: null,
          mmp_site_entry_id: null,
          updated_at: now,
          metadata: { ...existingMeta, deleted: true, deleted_at: now },
        } as any)
        .eq('id', requestId);

      if (error) throw error;

      toast({
        title: 'Request Deleted / تم حذف الطلب',
        description: 'The request has been removed. A new request can be submitted if needed. / تم إزالة الطلب. يمكن تقديم طلب جديد إذا لزم الأمر.',
      });

      await refreshRequests();
      return true;
    } catch (error: any) {
      console.error('Failed to delete request:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete request',
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

      const { error } = await supabase
        .from('down_payment_requests')
        .update({
          metadata: { ...request.metadata, audit_log: updatedAuditLog },
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (error) throw error;
      return true;
    } catch (error: any) {
      console.error('Failed to add audit entry:', error);
      return false;
    }
  };

  const bulkApprove = async (
    data: BulkApprovalRequest
  ): Promise<{ success: number; failed: number }> => {
    let success = 0;
    let failed = 0;

    for (const requestId of data.requestIds) {
      const request = requests.find(r => r.id === requestId);
      if (!request) {
        failed++;
        continue;
      }

      const approvedAmount = calculateApprovedAmount(
        request.requestedAmount,
        data.approvalType,
        data.approvalPercentage,
        data.customAmount
      );

      try {
        const userRole = currentUser?.role?.toLowerCase();
        const isSupervisor = userRole === 'supervisor' || userRole === 'hubsupervisor';

        if (isSupervisor && request.status === 'pending_supervisor') {
          const result = await supervisorApprove({
            requestId,
            approvedBy: data.approvedBy,
            approvedByName: data.approvedByName,
            notes: data.notes,
            approvalType: data.approvalType,
            approvalPercentage: data.approvalPercentage,
            customAmount: approvedAmount,
          });
          if (result) success++;
          else failed++;
        } else if (!isSupervisor && request.status === 'pending_admin') {
          const result = await adminApprove({
            requestId,
            approvedBy: data.approvedBy,
            approvedByName: data.approvedByName,
            notes: data.notes,
            approvalType: data.approvalType,
            approvalPercentage: data.approvalPercentage,
            customAmount: approvedAmount,
          });
          if (result) success++;
          else failed++;
        } else {
          failed++;
        }
      } catch (error) {
        console.error('Bulk approve error for request:', requestId, error);
        failed++;
      }
    }

    if (success > 0) {
      toast({
        title: 'Bulk Approval Complete',
        description: `${success} request(s) approved successfully${failed > 0 ? `, ${failed} failed` : ''}`,
      });
    }

    await refreshRequests();
    return { success, failed };
  };

  const revertToPending = async (data: RevertToPendingData): Promise<boolean> => {
    try {
      const request = requests.find(r => r.id === data.requestId);
      if (!request) {
        toast({
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

      if (data.targetStatus === 'pending_supervisor') {
        updatedMetadata.supervisor_approved_amount = null;
        updatedMetadata.admin_approved_amount = null;
        updatedMetadata.approved_amount = null;
        updatedMetadata.approval_type = null;
        updatedMetadata.approval_percentage = null;
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
          metadata: updatedMetadata,
        };
      } else if (data.targetStatus === 'pending_admin') {
        updatedMetadata.admin_approved_amount = null;
        updateData = {
          ...updateData,
          admin_status: 'pending',
          admin_processed_by: null,
          admin_processed_at: null,
          admin_notes: null,
          admin_rejection_reason: null,
          metadata: updatedMetadata,
        };
      } else if (data.targetStatus === 'approved') {
        updateData = {
          ...updateData,
          total_paid_amount: 0,
          metadata: updatedMetadata,
        };
      }

      const { error } = await supabase
        .from('down_payment_requests')
        .update(updateData)
        .eq('id', data.requestId);

      if (error) throw error;

      toast({
        title: 'Status Reverted',
        description: `Request has been reverted to ${data.targetStatus === 'pending_supervisor' ? 'Pending Supervisor Approval' : 'Pending Admin Approval'}`,
      });

      await refreshRequests();
      return true;
    } catch (error: any) {
      console.error('Failed to revert request:', error);
      toast({
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

      const { error: updateError } = await supabase
        .from('down_payment_requests')
        .update({
          metadata: {
            ...existingMetadata,
            receipt_confirmation: receiptConfirmation,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', data.requestId);

      if (updateError) throw updateError;

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

  const editRequest = async (data: EditDownPaymentData): Promise<boolean> => {
    try {
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

      const { error } = await supabase
        .from('down_payment_requests')
        .update(dbUpdate)
        .eq('id', data.requestId);

      if (error) throw error;

      toast({
        title: 'Request Updated / تم تحديث الطلب',
        description: `${Object.keys(newValues).length} field(s) updated with audit trail. / تم تحديث ${Object.keys(newValues).length} حقل(حقول) مع سجل التدقيق.`,
      });

      await refreshRequests();
      return true;
    } catch (error: any) {
      console.error('Failed to edit request:', error);
      toast({
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
    editRequest,
  };

  return <DownPaymentContext.Provider value={value}>{children}</DownPaymentContext.Provider>;
}
