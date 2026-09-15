/**
 * Supabase integration for cost submission system
 * Handles all database queries and transformations
 */

import { supabase } from '@/integrations/supabase/client';
import {
  SiteVisitCostSubmission,
  CostApprovalHistory,
  PendingCostApproval,
  UserCostSubmissionSummary,
  MmpCostSubmissionSummary,
  CreateCostSubmissionRequest,
  UpdateCostSubmissionRequest,
  ReviewCostSubmissionRequest
} from '@/types/cost-submission';
import {
  mapDBCostSubmissionToFrontend,
  mapDBHistoryToFrontend,
  mapDBPendingApprovalToFrontend,
  mapDBUserSummaryToFrontend,
  mapDBMMPSummaryToFrontend
} from './adapter';

/**
 * Fetch all cost submissions
 */
export const fetchCostSubmissions = async (): Promise<SiteVisitCostSubmission[]> => {
  const { data, error } = await supabase
    .from('site_visit_cost_submissions')
    .select('*')
    .order('submitted_at', { ascending: false });

  if (error) {
    console.error('Error fetching cost submissions:', error);
    throw error;
  }

  return (data || []).map(mapDBCostSubmissionToFrontend);
};

/**
 * Fetch cost submission by ID
 */
export const fetchCostSubmissionById = async (id: string): Promise<SiteVisitCostSubmission> => {
  const { data, error } = await supabase
    .from('site_visit_cost_submissions')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching cost submission:', error);
    throw error;
  }

  return mapDBCostSubmissionToFrontend(data);
};

/**
 * Fetch cost submissions for a specific user
 */
export const fetchUserCostSubmissions = async (userId: string): Promise<SiteVisitCostSubmission[]> => {
  const { data, error } = await supabase
    .from('site_visit_cost_submissions')
    .select('*')
    .eq('submitted_by', userId)
    .order('submitted_at', { ascending: false });

  if (error) {
    console.error('Error fetching user cost submissions:', error);
    throw error;
  }

  return (data || []).map(mapDBCostSubmissionToFrontend);
};

/**
 * Fetch cost submissions for a specific site visit
 */
export const fetchSiteEntryCostSubmission = async (
  siteEntryId: string
): Promise<SiteVisitCostSubmission | null> => {
  const { data, error } = await supabase
    .from('site_visit_cost_submissions')
    .select('*')
    .eq('site_visit_id', siteEntryId)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error fetching site visit cost submission:', error);
    throw error;
  }

  return data ? mapDBCostSubmissionToFrontend(data) : null;
};

/**
 * Fetch pending cost approvals (admin/finance view)
 */
export const fetchPendingApprovals = async (): Promise<PendingCostApproval[]> => {
  const { data, error } = await supabase
    .from('pending_cost_approvals')
    .select('*')
    .order('submitted_at', { ascending: true });

  if (error) {
    console.error('Error fetching pending approvals:', error);
    throw error;
  }

  return (data || []).map(mapDBPendingApprovalToFrontend);
};

/**
 * Fetch cost submission history
 */
export const fetchSubmissionHistory = async (
  submissionId: string
): Promise<CostApprovalHistory[]> => {
  const { data, error } = await supabase
    .from('cost_approval_history')
    .select('*')
    .eq('submission_id', submissionId)
    .order('changed_at', { ascending: false });

  if (error) {
    console.error('Error fetching submission history:', error);
    throw error;
  }

  return (data || []).map(mapDBHistoryToFrontend);
};

/**
 * Fetch user cost submission summary
 */
export const fetchUserSummary = async (userId: string): Promise<UserCostSubmissionSummary> => {
  const { data, error } = await supabase
    .from('user_cost_submission_summary')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) {
    console.error('Error fetching user summary:', error);
    // Return empty summary if not found
    return {
      userId,
      totalSubmissions: 0,
      pendingCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      paidCount: 0,
      totalApprovedCents: 0,
      totalPaidCents: 0,
      avgApprovedCents: 0
    };
  }

  return mapDBUserSummaryToFrontend(data);
};

/**
 * Fetch MMP cost submission summary
 */
export const fetchMMPSummary = async (mmpFileId: string): Promise<MmpCostSubmissionSummary> => {
  const { data, error } = await supabase
    .from('mmp_cost_submission_summary')
    .select('*')
    .eq('mmp_file_id', mmpFileId)
    .single();

  if (error) {
    console.error('Error fetching MMP summary:', error);
    // Return empty summary if not found
    return {
      mmpFileId,
      totalSubmissions: 0,
      pendingSubmissions: 0,
      totalApprovedCostCents: 0,
      totalPaidCents: 0,
      totalTransportCents: 0,
      totalAccommodationCents: 0,
      totalMealsCents: 0,
      avgCostPerSiteCents: 0
    };
  }

  return mapDBMMPSummaryToFrontend(data);
};

/**
 * Create a new cost submission
 */
export const createCostSubmission = async (
  request: CreateCostSubmissionRequest,
  _userId: string
): Promise<SiteVisitCostSubmission> => {
  const dbData = {
    site_visit_id: request.siteVisitId,
    mmp_file_id: request.mmpFileId,
    project_id: request.projectId,
    transportation_cost_cents: request.transportationCostCents,
    accommodation_cost_cents: request.accommodationCostCents,
    meal_allowance_cents: request.mealAllowanceCents,
    other_costs_cents: request.otherCostsCents,
    currency: request.currency || 'SDG',
    transportation_details: request.transportationDetails,
    accommodation_details: request.accommodationDetails,
    meal_details: request.mealDetails,
    other_details: request.otherCostsDetails,
    submission_notes: request.submissionNotes,
    supporting_documents: request.supportingDocuments || [], // Store full JSONB objects
  };

  const { data, error } = await (supabase as any)
    .rpc('mutate_site_visit_cost_submission', {
      p_action: 'create',
      p_submission_id: null,
      p_payload: dbData,
    })
    .single();

  if (error) {
    console.error('Error creating cost submission:', error);
    throw error;
  }

  return mapDBCostSubmissionToFrontend(data);
};

/**
 * Update a cost submission (only if pending)
 */
export const updateCostSubmission = async (
  id: string,
  request: UpdateCostSubmissionRequest
): Promise<SiteVisitCostSubmission> => {
  const dbData: Record<string, unknown> = {};

  if (request.transportationCostCents !== undefined) {
    dbData.transportation_cost_cents = request.transportationCostCents;
  }
  if (request.accommodationCostCents !== undefined) {
    dbData.accommodation_cost_cents = request.accommodationCostCents;
  }
  if (request.mealAllowanceCents !== undefined) {
    dbData.meal_allowance_cents = request.mealAllowanceCents;
  }
  if (request.otherCostsCents !== undefined) {
    dbData.other_costs_cents = request.otherCostsCents;
  }
  if (request.transportationDetails !== undefined) {
    dbData.transportation_details = request.transportationDetails;
  }
  if (request.accommodationDetails !== undefined) {
    dbData.accommodation_details = request.accommodationDetails;
  }
  if (request.mealDetails !== undefined) {
    dbData.meal_details = request.mealDetails;
  }
  if (request.otherCostsDetails !== undefined) {
    dbData.other_details = request.otherCostsDetails;
  }
  if (request.submissionNotes !== undefined) {
    dbData.submission_notes = request.submissionNotes;
  }
  if (request.supportingDocuments !== undefined) {
    dbData.supporting_documents = request.supportingDocuments;
  }

  const { data, error } = await (supabase as any)
    .rpc('mutate_site_visit_cost_submission', {
      p_action: 'update',
      p_submission_id: id,
      p_payload: dbData,
    })
    .single();

  if (error) {
    console.error('Error updating cost submission:', error);
    throw error;
  }

  return mapDBCostSubmissionToFrontend(data);
};

/**
 * Review a cost submission (approve/reject)
 * Now includes signature tracking for audit trail
 */
export const reviewCostSubmission = async (
  request: ReviewCostSubmissionRequest & { signatureId?: string }
): Promise<SiteVisitCostSubmission> => {
  const { data, error } = await (supabase as any).rpc('transition_site_visit_cost_submission', {
    p_submission_id: request.submissionId,
    p_action: request.action,
    p_reviewer_notes: request.reviewerNotes ?? null,
    p_approval_notes: request.approvalNotes ?? null,
    p_adjusted_amount_cents: request.adjustedAmountCents ?? null,
    p_payment_notes: request.paymentNotes ?? null,
    p_wallet_transaction_id: null,
    p_signature_id: request.signatureId ?? null
  }).single();

  if (error) {
    console.error('Error reviewing cost submission:', error);
    throw error;
  }

  return mapDBCostSubmissionToFrontend(data);
};

/**
 * Mark cost submission as paid
 * Now includes signature tracking for payment audit trail
 */
export const markCostSubmissionPaid = async (
  submissionId: string,
  walletTransactionId: string,
  paidAmountCents?: number,
  paymentSignatureId?: string
): Promise<SiteVisitCostSubmission> => {
  const { data, error } = await (supabase as any).rpc('transition_site_visit_cost_submission', {
    p_submission_id: submissionId,
    p_action: 'mark_paid',
    p_reviewer_notes: null,
    p_approval_notes: null,
    p_adjusted_amount_cents: paidAmountCents ?? null,
    p_payment_notes: null,
    p_wallet_transaction_id: walletTransactionId,
    p_signature_id: paymentSignatureId ?? null
  }).single();

  if (error) {
    console.error('Error marking cost submission paid:', error);
    throw error;
  }

  return mapDBCostSubmissionToFrontend(data);
};

/**
 * Cancel a cost submission
 */
export const cancelCostSubmission = async (
  id: string,
  _userId: string
): Promise<SiteVisitCostSubmission> => {
  const { data, error } = await (supabase as any)
    .rpc('mutate_site_visit_cost_submission', {
      p_action: 'cancel',
      p_submission_id: id,
      p_payload: {},
    })
    .single();

  if (error) {
    console.error('Error cancelling cost submission:', error);
    throw error;
  }

  return mapDBCostSubmissionToFrontend(data);
};

/**
 * Delete a cost submission
 */
export const deleteCostSubmission = async (
  id: string,
  _userId: string
): Promise<void> => {
  const { error } = await (supabase as any)
    .rpc('delete_site_visit_cost_submission', { p_submission_id: id });

  if (error) {
    console.error('Error deleting cost submission:', error);
    throw error;
  }
};
