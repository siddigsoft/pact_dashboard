import type { RecallTier, RecoveryMethod, RecoveryStatus, RecallScopeType } from './recall';

export interface RecallEvent {
  id: string;
  mmp_id: string;
  recall_event_id: string;
  tier: RecallTier;
  scope_type: RecallScopeType;
  scope_filters?: Record<string, any>;
  affected_site_ids?: string[];
  reason?: string;
  is_force_recall: boolean;
  status: 'pending' | 'approved' | 'rejected' | 'completed' | 'cancelled';
  affected_site_count: number;
  affected_collector_count: number;
  financial_amount: number;
  recovery_method?: RecoveryMethod;
  initiated_by: string;
  initiated_by_name?: string;
  initiated_at: string;
  approved_by?: string;
  approved_by_name?: string;
  approved_at?: string;
  completed_at?: string;
  notes?: string;
  previous_state?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface RecallEventInsert {
  mmp_id: string;
  recall_event_id: string;
  tier: RecallTier;
  scope_type: RecallScopeType;
  scope_filters?: Record<string, any>;
  affected_site_ids?: string[];
  reason?: string;
  is_force_recall?: boolean;
  status?: 'pending' | 'approved' | 'rejected' | 'completed' | 'cancelled';
  affected_site_count?: number;
  affected_collector_count?: number;
  financial_amount?: number;
  recovery_method?: RecoveryMethod;
  initiated_by: string;
  initiated_by_name?: string;
  notes?: string;
  previous_state?: Record<string, any>;
}

export interface RecallApproval {
  id: string;
  recall_event_id: string;
  approver_id: string;
  approver_name?: string;
  approver_role?: string;
  action: 'approve' | 'reject';
  notes?: string;
  acted_at: string;
  sla_deadline?: string;
  sla_status?: 'on_time' | 'approaching' | 'overdue';
  created_at: string;
}

export interface RecallApprovalInsert {
  recall_event_id: string;
  approver_id: string;
  approver_name?: string;
  approver_role?: string;
  action: 'approve' | 'reject';
  notes?: string;
  sla_deadline?: string;
  sla_status?: 'on_time' | 'approaching' | 'overdue';
}

export interface RecoveryRecord {
  id: string;
  recall_event_id?: string;
  mmp_id: string;
  site_entry_id: string;
  data_collector_id?: string;
  data_collector_name?: string;
  original_amount: number;
  recovered_amount: number;
  pending_amount: number;
  currency: string;
  recovery_method?: RecoveryMethod;
  status: RecoveryStatus;
  wallet_transaction_id?: string;
  receipt_reference?: string;
  evidence_url?: string;
  notes?: string;
  processed_by?: string;
  processed_by_name?: string;
  processed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface RecoveryRecordInsert {
  recall_event_id?: string;
  mmp_id: string;
  site_entry_id: string;
  data_collector_id?: string;
  data_collector_name?: string;
  original_amount: number;
  recovered_amount?: number;
  pending_amount?: number;
  currency?: string;
  recovery_method?: RecoveryMethod;
  status?: RecoveryStatus;
  wallet_transaction_id?: string;
  receipt_reference?: string;
  evidence_url?: string;
  notes?: string;
}

export interface RecoveryRecordUpdate {
  recovered_amount?: number;
  pending_amount?: number;
  recovery_method?: RecoveryMethod;
  status?: RecoveryStatus;
  wallet_transaction_id?: string;
  receipt_reference?: string;
  evidence_url?: string;
  notes?: string;
  processed_by?: string;
  processed_by_name?: string;
  processed_at?: string;
}

export type { RecallTier, RecoveryMethod, RecoveryStatus, RecallScopeType };
