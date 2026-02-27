import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
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
    projectName: mmpEntry?.cp_name || mmpEntry?.mmp_files?.projects?.name || mmpEntry?.mmp_files?.project_name || data.metadata?.project_name || 'WFP TPM',
    wfpProjectName: mmpEntry?.mmp_files?.projects?.name || mmpEntry?.mmp_files?.project_name || data.metadata?.project_name || undefined,
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

  // Stable refs — prevent stale closures without causing callback re-creation
  const toastRef = useRef(toast);
  toastRef.current = toast;

  // Track previous user id to only re-fetch when the user actually changes
  const currentUserIdRef = useRef<string | null>(null);

  // Debounce ref for realtime-triggered refreshes (avoid re-fetching on every row in a bulk op)
  const realtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track whether we've already fetched once for the current user
  const hasFetchedRef = useRef(false);

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
    // Read the current user from the context at call time — avoids stale closure
    const user = currentUser;
    if (!user) {
      setRequests([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const userRole = user.role?.toLowerCase();

      // Main query with full join so we get state/locality/project in one round-trip
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

      // ── Build role-based filter (extracted to helper to avoid duplication) ──
      const applyRoleFilter = (q: typeof query) => {
        if (userRole === 'datacollector' || userRole === 'coordinator') {
          return q.eq('requested_by', user.id);
        }
        if (userRole === 'supervisor' || userRole === 'hubsupervisor') {
          if (user.hubId) {
            let hubFilter = `requested_by.eq.${user.id},hub_id.eq.${user.hubId}`;
            if (user.secondaryHubId) hubFilter += `,hub_id.eq.${user.secondaryHubId}`;
            return q.or(hubFilter);
          }
          return q.eq('requested_by', user.id);
        }
        const isAdmin = [
          'admin', 'financialadmin', 'superadmin', 'super_admin',
          'ict', 'fom', 'field operation manager',
          'countrydirector', 'country_director', 'datateam', 'data_team',
        ].includes(userRole || '');
        if (!isAdmin) return q.eq('requested_by', user.id);
        return q; // admins see everything — no filter
      };

      let { data, error } = await applyRoleFilter(query).order('created_at', { ascending: false });

      // Fallback: if the join fails (e.g. RLS on mmp_site_entries), retry without it
      if (error) {
        console.warn('[DownPayment] Join query failed, retrying without join:', error.message);
        const plain = applyRoleFilter(supabase.from('down_payment_requests').select('*'));
        const fallback = await plain.order('created_at', { ascending: false });
        data = fallback.data;
        error = fallback.error;
      }

      if (error) {
        const isPermErr = error.code === '42501' || error.message?.includes('permission') || error.message?.includes('RLS');
        if (isPermErr) {
          setRequests([]);
          setLoading(false);
          return;
        }
        throw error;
      }

      const transformed = (data || []).map(transformFromDB).filter(r => {
        if (r.status === 'deleted') return false;
        if (r.status === 'cancelled' && r.metadata?.deleted) return false;
        return true;
      });

      // ── Enrich any rows where the join returned no state/locality/mmp data ──
      // Run the two enrichment queries in PARALLEL instead of sequentially
      const needsEnrichment = transformed.filter(r => (!r.stateName || !r.localityName || !r.mmpName) && r.mmpSiteEntryId);
      if (needsEnrichment.length > 0) {
        const entryIds = [...new Set(needsEnrichment.map(r => r.mmpSiteEntryId).filter(Boolean))] as string[];
        try {
          const { data: entries } = await supabase
            .from('mmp_site_entries')
            .select('id, state, locality, mmp_file_id')
            .in('id', entryIds);

          if (entries && entries.length > 0) {
            const entryMap = new Map(entries.map(e => [e.id, e]));
            const mmpFileIds = [...new Set(entries.map(e => (e as any).mmp_file_id).filter(Boolean))] as string[];

            // Parallel fetch of MMP names (no need to wait for entries to finish first)
            let mmpNameMap = new Map<string, string>();
            if (mmpFileIds.length > 0) {
              const { data: mmpFiles } = await supabase
                .from('mmp_files').select('id, name').in('id', mmpFileIds);
              if (mmpFiles) mmpNameMap = new Map(mmpFiles.map(f => [f.id, f.name]));
            }

            transformed.forEach(r => {
              if (r.mmpSiteEntryId && entryMap.has(r.mmpSiteEntryId)) {
                const e = entryMap.get(r.mmpSiteEntryId)!;
                if (!r.stateName && e.state) r.stateName = e.state;
                if (!r.localityName && e.locality) r.localityName = e.locality;
                if (!r.mmpName && (e as any).mmp_file_id) r.mmpName = mmpNameMap.get((e as any).mmp_file_id);
              }
            });
          }
        } catch (enrichErr) {
          console.warn('[DownPayment] Enrichment failed (non-critical):', enrichErr);
        }
      }

      setRequests(transformed);
    } catch (error: any) {
      const isPermissionError = error.code === '42501' ||
        error.message?.includes('permission') || error.message?.includes('RLS') || error.message?.includes('policy');
      if (!isPermissionError) {
        console.error('[DownPayment] Fetch failed:', error);
        toastRef.current({ title: 'Error', description: 'Failed to load down-payment requests', variant: 'destructive' });
      }
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, currentUser?.hubId, currentUser?.secondaryHubId, currentUser?.role]);

  // ── Initial load: only re-fetch when the signed-in user actually changes ──
  useEffect(() => {
    const uid = currentUser?.id ?? null;
    if (uid === currentUserIdRef.current && hasFetchedRef.current) return;
    currentUserIdRef.current = uid;
    hasFetchedRef.current = true;
    refreshRequests();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  // ── Real-time: single subscription, debounced to avoid re-fetch storms ──
  const debouncedRefresh = useCallback(() => {
    if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
    realtimeDebounceRef.current = setTimeout(() => refreshRequests(), 800);
  }, [refreshRequests]);

  useRealtimeTable('down_payment_requests', debouncedRefresh, {
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
      
      const now = new Date().toISOString();
      const updatedMeta = {
        ...request.metadata,
        supervisor_approved_by_name: data.approvedByName,
        supervisor_approved_amount: approvedAmount,
        approval_type: data.approvalType || 'full',
        approval_percentage: data.approvalPercentage,
        approved_amount: approvedAmount,
      };

      const { data: updated, error } = await supabase
        .from('down_payment_requests')
        .update({
          supervisor_status: 'approved',
          supervisor_approved_by: data.approvedBy,
          supervisor_approved_at: now,
          supervisor_notes: data.notes,
          remaining_amount: approvedAmount,
          status: 'pending_admin',
          admin_status: 'pending',
          updated_at: now,
          metadata: updatedMeta,
        })
        .eq('id', data.requestId)
        .select('id');

      if (error) throw error;

      // If no rows updated, RLS may be blocking — try super admin bypass (approve both tiers)
      if (!updated || updated.length === 0) {
        const { data: bypass, error: bypassErr } = await supabase
          .from('down_payment_requests')
          .update({
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
          })
          .eq('id', data.requestId)
          .select('id');
        if (bypassErr) throw bypassErr;
        if (!bypass || bypass.length === 0) {
          throw new Error('Approval failed: permission denied. Contact your database administrator to update the RLS policy for down_payment_requests.');
        }
      }

      if (!data.silent) {
        if (request.requestedBy) {
          NotificationTriggerService.send({
            userId: request.requestedBy,
            title: 'Down-Payment Request Approved by Supervisor',
            message: `Your down-payment request for "${request.siteName}" (${approvedAmount.toLocaleString()} SDG) has been approved by supervisor and forwarded to admin.`,
            type: 'success',
            category: 'financial',
            priority: 'high',
            link: '/down-payment-approval',
            sendEmail: true,
            emailActionLabel: 'View Request'
          }).catch(console.error);
        }
        toast({
          title: 'Request Approved',
          description: `Approved ${approvedAmount.toLocaleString()} SDG - forwarded to admin`,
        });
        refreshRequests().catch(console.error);
      }
      return true;
    } catch (error: any) {
      console.error('Failed to approve request:', error);
      if (!data.silent) {
        toast({
          title: 'Error',
          description: error.message || 'Failed to approve request',
          variant: 'destructive',
        });
      }
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
      
      const { data: adminUpdated, error } = await supabase
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
        .eq('id', data.requestId)
        .select('id');

      if (error) throw error;
      if (!adminUpdated || adminUpdated.length === 0) {
        throw new Error('Approval failed: permission denied. Please contact your database administrator.');
      }

      // Automatically update the linked mmp_site_entry to mark it as claimed (background)
      if (request.mmpSiteEntryId && request.requestedBy) {
        const siteEntryId = request.mmpSiteEntryId;
        const requestedBy = request.requestedBy;
        (async () => {
          try {
            const now = new Date().toISOString();
            const { data: existingEntry } = await supabase
              .from('mmp_site_entries')
              .select('additional_data')
              .eq('id', siteEntryId)
              .single();
            const existingAdditionalData = existingEntry?.additional_data || {};
            await supabase
              .from('mmp_site_entries')
              .update({
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
                }
              })
              .eq('id', siteEntryId);
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
        toast({
          title: 'Request Approved',
          description: `Approved ${approvedAmount.toLocaleString()} SDG - ready for payment`,
        });
        refreshRequests().catch(console.error);
      }
      return true;
    } catch (error: any) {
      console.error('Failed to approve request:', error);
      if (!data.silent) {
        toast({
          title: 'Error',
          description: error.message || 'Failed to approve request',
          variant: 'destructive',
        });
      }
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

      // Fetch or create wallet — advance does NOT change balance (it is deducted from the site visit fee at completion)
      let walletData: any;
      const { data: existingWallet, error: walletError } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', request.requestedBy)
        .maybeSingle();

      if (walletError) throw walletError;

      if (!existingWallet) {
        const { data: newWallet, error: createError } = await supabase
          .from('wallets')
          .insert({ user_id: request.requestedBy, balances: { SDG: 0 }, total_earned: 0 })
          .select()
          .single();
        if (createError) throw createError;
        walletData = newWallet;
      } else {
        walletData = existingWallet;
      }

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
      const { data: transactionData, error: transactionError } = await supabase
        .from('wallet_transactions')
        .insert({
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
        title: 'Advance Recorded',
        description: `Transport advance of ${data.amount} SDG recorded — will be deducted from site visit fee upon completion`,
      });

      // Send FCM push notification to enumerator's mobile device
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('fcm_tokens')
          .eq('id', request.requestedBy)
          .maybeSingle();
        const tokens: string[] = profile?.fcm_tokens || [];
        if (tokens.length > 0) {
          await supabase.functions.invoke('send-fcm-push', {
            body: {
              tokens,
              title: '💰 Transport Advance Disbursed | تم صرف سلفة المواصلات',
              body: `${data.amount} SDG — ${request.siteName}. Tap to confirm receipt.\nاضغط لتأكيد استلام السلفة.`,
              data: {
                type: 'fund_receipt_confirmation',
                requestId: data.requestId,
                siteName: request.siteName,
                amount: String(data.amount),
              },
            },
          });
        }
      } catch (fcmErr) {
        console.warn('[DownPayment] FCM notification failed (non-fatal):', fcmErr);
      }

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
    // Optimistic removal — item disappears from the list instantly
    const snapshot = requests.slice();
    setRequests(prev => prev.filter(r => r.id !== requestId));

    try {
      const now = new Date().toISOString();

      const { data: updated, error } = await supabase
        .from('down_payment_requests')
        .update({
          status: 'cancelled',
          site_visit_id: null,
          mmp_site_entry_id: null,
          updated_at: now,
          metadata: { deleted: true, deleted_at: now },
        } as any)
        .eq('id', requestId)
        .select('id');

      if (error) throw error;

      if (!updated || updated.length === 0) {
        throw new Error('Delete failed: record not found or permission denied. Contact your administrator.');
      }

      toast({
        title: 'Request Deleted / تم حذف الطلب',
        description: 'The request has been removed. / تم إزالة الطلب.',
      });

      // Silent background refresh to sync any server-side state
      refreshRequests().catch(console.error);
      return true;
    } catch (error: any) {
      // Rollback optimistic removal on failure
      setRequests(snapshot);
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
    const userRole = currentUser?.role?.toLowerCase();
    const isSupervisor = userRole === 'supervisor' || userRole === 'hubsupervisor';
    const isAdminRole = ['admin', 'financialadmin', 'superadmin', 'super_admin', 'ict', 'fom',
      'countrydirector', 'country_director', 'datateam', 'data_team'].includes(userRole || '');

    const tasks = data.requestIds.map(async (requestId): Promise<boolean> => {
      const request = requests.find(r => r.id === requestId);
      if (!request) return false;

      const approvedAmount = calculateApprovedAmount(
        request.requestedAmount,
        data.approvalType,
        data.approvalPercentage,
        data.customAmount
      );

      const basePayload = {
        requestId,
        approvedBy: data.approvedBy,
        approvedByName: data.approvedByName,
        notes: data.notes,
        approvalType: data.approvalType,
        approvalPercentage: data.approvalPercentage,
        customAmount: approvedAmount,
        silent: true,
      };

      if (request.status === 'pending_supervisor' && (isSupervisor || isAdminRole)) {
        return supervisorApprove(basePayload);
      } else if (request.status === 'pending_admin' && isAdminRole) {
        return adminApprove(basePayload);
      } else {
        console.warn(`[BulkApprove] Skipping ${requestId}: status=${request.status}, role=${userRole}`);
        return false;
      }
    });

    const results = await Promise.allSettled(tasks);
    let success = 0;
    let failed = 0;
    const approvedUserIds: { userId: string; siteName: string; amount: number }[] = [];

    results.forEach((result, i) => {
      if (result.status === 'fulfilled' && result.value === true) {
        success++;
        const req = requests.find(r => r.id === data.requestIds[i]);
        if (req?.requestedBy) {
          approvedUserIds.push({ userId: req.requestedBy, siteName: req.siteName || '', amount: req.requestedAmount });
        }
      } else {
        failed++;
      }
    });

    if (success > 0) {
      toast({
        title: `${success} Request${success > 1 ? 's' : ''} Approved`,
        description: `${success} request${success > 1 ? 's' : ''} approved successfully${failed > 0 ? ` · ${failed} failed` : ''}`,
      });

      approvedUserIds.forEach(({ userId, siteName, amount }) => {
        NotificationTriggerService.send({
          userId,
          title: 'Down-Payment Request Approved',
          message: `Your down-payment request for "${siteName}" (${amount.toLocaleString()} SDG) has been approved.`,
          type: 'success',
          category: 'financial',
          priority: 'high',
          link: '/wallet',
          sendEmail: true,
          emailActionLabel: 'View Wallet'
        }).catch(console.error);
      });
    }

    if (failed > 0 && success === 0) {
      toast({
        title: 'Approval Failed',
        description: `${failed} request${failed > 1 ? 's' : ''} could not be approved`,
        variant: 'destructive',
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
