import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '../user/UserContext';
import { useToast } from '@/hooks/use-toast';
import {
  DownPaymentRequest,
  CreateDownPaymentRequest,
  ApproveDownPaymentRequest,
  RejectDownPaymentRequest,
  ProcessPayment,
  DownPaymentStatus,
} from '@/types/down-payment';

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
  return {
    id: data.id,
    siteVisitId: data.site_visit_id,
    mmpSiteEntryId: data.mmp_site_entry_id,
    siteName: data.site_name,
    requestedBy: data.requested_by,
    requestedAt: data.requested_at,
    requesterRole: data.requester_role,
    hubId: data.hub_id,
    hubName: data.hub_name,
    totalTransportationBudget: parseFloat(data.total_transportation_budget),
    requestedAmount: parseFloat(data.requested_amount),
    paymentType: data.payment_type,
    installmentPlan: data.installment_plan || [],
    paidInstallments: data.paid_installments || [],
    justification: data.justification,
    supportingDocuments: data.supporting_documents || [],
    supervisorId: data.supervisor_id,
    supervisorStatus: data.supervisor_status,
    supervisorApprovedBy: data.supervisor_approved_by,
    supervisorApprovedAt: data.supervisor_approved_at,
    supervisorNotes: data.supervisor_notes,
    supervisorRejectionReason: data.supervisor_rejection_reason,
    adminStatus: data.admin_status,
    adminProcessedBy: data.admin_processed_by,
    adminProcessedAt: data.admin_processed_at,
    adminNotes: data.admin_notes,
    adminRejectionReason: data.admin_rejection_reason,
    status: data.status,
    totalPaidAmount: parseFloat(data.total_paid_amount || 0),
    remainingAmount: parseFloat(data.remaining_amount || 0),
    walletTransactionIds: data.wallet_transaction_ids || [],
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

      let query = supabase.from('down_payment_requests').select('*');

      if (userRole === 'datacollector' || userRole === 'coordinator') {
        // Data collectors and coordinators only see their own requests
        query = query.eq('requested_by', currentUser.id);
      } else if (userRole === 'supervisor' || userRole === 'hubsupervisor') {
        /**
         * HUB-BASED SUPERVISION: Hub supervisors manage MULTIPLE states within their hub.
         * Examples: Kosti Hub = 7 states, Kassala Hub = 5 states
         * Supervisors see their own requests + all requests from their hub
         * Hub supervisors need hub_id assigned (NOT state_id) to see all team requests
         */
        if (currentUser.hubId) {
          query = query.or(`requested_by.eq.${currentUser.id},hub_id.eq.${currentUser.hubId}`);
        } else {
          // If supervisor doesn't have hubId, try matching by hub name or just show own requests
          console.warn('[DownPayment] Supervisor has no hubId set - showing only own requests');
          query = query.eq('requested_by', currentUser.id);
        }
      } else if (userRole === 'admin' || userRole === 'financialadmin') {
        // Admins see all requests - no filter applied
        console.log('[DownPayment] Admin user - fetching all requests');
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      
      console.log('[DownPayment] Fetched requests:', data?.length || 0);
      setRequests((data || []).map(transformFromDB));
    } catch (error: any) {
      console.error('Failed to fetch down-payment requests:', error);
      toast({
        title: 'Error',
        description: 'Failed to load down-payment requests',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [currentUser, toast]);

  useEffect(() => {
    refreshRequests();
  }, [refreshRequests]);

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
      const { error } = await supabase
        .from('down_payment_requests')
        .update({
          supervisor_status: 'approved',
          supervisor_approved_by: data.approvedBy,
          supervisor_approved_at: new Date().toISOString(),
          supervisor_notes: data.notes,
          status: 'pending_admin',
          admin_status: 'pending',
          updated_at: new Date().toISOString(),
        })
        .eq('id', data.requestId);

      if (error) throw error;

      toast({
        title: 'Request Approved',
        description: 'Down-payment request forwarded to admin for processing',
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
      const { error } = await supabase
        .from('down_payment_requests')
        .update({
          admin_status: 'approved',
          admin_processed_by: data.approvedBy,
          admin_processed_at: new Date().toISOString(),
          admin_notes: data.notes,
          status: 'approved',
          updated_at: new Date().toISOString(),
        })
        .eq('id', data.requestId);

      if (error) throw error;

      toast({
        title: 'Request Approved',
        description: 'Down-payment request approved. Ready for payment processing.',
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

      const { data: transactionData, error: transactionError } = await supabase
        .from('wallet_transactions')
        .insert({
          wallet_id: walletData.id,
          user_id: request.requestedBy,
          type: 'down_payment',
          amount: data.amount,
          currency: 'SDG',
          description: `Down-payment for ${request.siteName}${data.notes ? ': ' + data.notes : ''}`,
          balance_before: currentBalance,
          balance_after: newBalance,
          created_by: data.processedBy,
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
  };

  return <DownPaymentContext.Provider value={value}>{children}</DownPaymentContext.Provider>;
}
