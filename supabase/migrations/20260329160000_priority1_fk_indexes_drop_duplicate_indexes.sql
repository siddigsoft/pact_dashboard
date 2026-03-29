-- Priority 1 performance: drop duplicate btree indexes (Supabase linter duplicate_index),
-- then add covering indexes for foreign keys (unindexed_foreign_keys).

-- -----------------------------------------------------------------------------
-- Duplicate indexes — keep one canonical name per identical definition
-- -----------------------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_budget_alerts_project;
DROP INDEX IF EXISTS public.idx_budget_transactions_project_budget;
DROP INDEX IF EXISTS public.idx_payout_requested_at;
-- Keep permissions_role_id_resource_action_key (backs UNIQUE constraint); drop duplicate btree index only.
DROP INDEX IF EXISTS public.permissions_unique_role_resource_action;
DROP INDEX IF EXISTS public.idx_cost_submissions_status;
DROP INDEX IF EXISTS public.idx_wallet_trans_created;
DROP INDEX IF EXISTS public.idx_wallet_trans_user;
DROP INDEX IF EXISTS public.wallets_total_withdrawn_idx1;

-- -----------------------------------------------------------------------------
-- Foreign key covering indexes (single-column FKs from pg_constraint / advisor)
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_action_status_overrides_set_by
  ON public.action_status_overrides (set_by);

CREATE INDEX IF NOT EXISTS idx_approval_requests_reviewed_by
  ON public.approval_requests (reviewed_by);

CREATE INDEX IF NOT EXISTS idx_bank_transaction_scans_scanned_by
  ON public.bank_transaction_scans (scanned_by);

CREATE INDEX IF NOT EXISTS idx_budget_alerts_acknowledged_by
  ON public.budget_alerts (acknowledged_by);

CREATE INDEX IF NOT EXISTS idx_budget_transactions_approved_by
  ON public.budget_transactions (approved_by);

CREATE INDEX IF NOT EXISTS idx_budget_transactions_created_by
  ON public.budget_transactions (created_by);

CREATE INDEX IF NOT EXISTS idx_budget_transactions_wallet_transaction_id
  ON public.budget_transactions (wallet_transaction_id);

CREATE INDEX IF NOT EXISTS idx_call_notes_user_id
  ON public.call_notes (user_id);

CREATE INDEX IF NOT EXISTS idx_chat_message_reads_user_id
  ON public.chat_message_reads (user_id);

CREATE INDEX IF NOT EXISTS idx_classification_fee_structures_created_by
  ON public.classification_fee_structures (created_by);

CREATE INDEX IF NOT EXISTS idx_classification_fee_structures_updated_by
  ON public.classification_fee_structures (updated_by);

CREATE INDEX IF NOT EXISTS idx_coordinator_locality_permits_verified_by
  ON public.coordinator_locality_permits (verified_by);

CREATE INDEX IF NOT EXISTS idx_dashboard_query_log_queried_by
  ON public.dashboard_query_log (queried_by);

CREATE INDEX IF NOT EXISTS idx_dashboard_settings_user_id
  ON public.dashboard_settings (user_id);

CREATE INDEX IF NOT EXISTS idx_data_visibility_settings_user_id
  ON public.data_visibility_settings (user_id);

CREATE INDEX IF NOT EXISTS idx_deletion_audit_log_restored_by
  ON public.deletion_audit_log (restored_by);

CREATE INDEX IF NOT EXISTS idx_down_payment_requests_supervisor_approved_by
  ON public.down_payment_requests (supervisor_approved_by);

CREATE INDEX IF NOT EXISTS idx_feedback_resolved_by
  ON public.feedback (resolved_by);

CREATE INDEX IF NOT EXISTS idx_incident_reports_reported_by
  ON public.incident_reports (reported_by);

CREATE INDEX IF NOT EXISTS idx_mmp_budgets_allocated_by
  ON public.mmp_budgets (allocated_by);

CREATE INDEX IF NOT EXISTS idx_mmp_budgets_parent_budget_id
  ON public.mmp_budgets (parent_budget_id);

CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_cost_acknowledged_by
  ON public.mmp_site_entries (cost_acknowledged_by);

CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_visit_started_by
  ON public.mmp_site_entries (visit_started_by);

CREATE INDEX IF NOT EXISTS idx_operational_cost_submissions_mmp_file_id
  ON public.operational_cost_submissions (mmp_file_id);

CREATE INDEX IF NOT EXISTS idx_operational_cost_submissions_paid_by
  ON public.operational_cost_submissions (paid_by);

CREATE INDEX IF NOT EXISTS idx_operational_cost_submissions_tier1_approved_by
  ON public.operational_cost_submissions (tier1_approved_by);

CREATE INDEX IF NOT EXISTS idx_operational_cost_submissions_tier2_approved_by
  ON public.operational_cost_submissions (tier2_approved_by);

CREATE INDEX IF NOT EXISTS idx_operational_cost_submissions_tier3_approved_by
  ON public.operational_cost_submissions (tier3_approved_by);

CREATE INDEX IF NOT EXISTS idx_payout_requests_decided_by
  ON public.payout_requests (decided_by);

CREATE INDEX IF NOT EXISTS idx_payout_requests_supervisor_id
  ON public.payout_requests (supervisor_id);

CREATE INDEX IF NOT EXISTS idx_payout_requests_wallet_id
  ON public.payout_requests (wallet_id);

CREATE INDEX IF NOT EXISTS idx_project_budgets_approved_by
  ON public.project_budgets (approved_by);

CREATE INDEX IF NOT EXISTS idx_project_budgets_created_by
  ON public.project_budgets (created_by);

CREATE INDEX IF NOT EXISTS idx_project_budgets_updated_by
  ON public.project_budgets (updated_by);

CREATE INDEX IF NOT EXISTS idx_project_scopes_project_id
  ON public.project_scopes (project_id);

CREATE INDEX IF NOT EXISTS idx_roles_created_by
  ON public.roles (created_by);

CREATE INDEX IF NOT EXISTS idx_safety_checklists_completed_by
  ON public.safety_checklists (completed_by);

CREATE INDEX IF NOT EXISTS idx_safety_checklists_site_visit_id
  ON public.safety_checklists (site_visit_id);

CREATE INDEX IF NOT EXISTS idx_site_locations_user_id
  ON public.site_locations (user_id);

CREATE INDEX IF NOT EXISTS idx_site_visit_cost_submissions_wallet_transaction_id
  ON public.site_visit_cost_submissions (wallet_transaction_id);

CREATE INDEX IF NOT EXISTS idx_site_visit_costs_adjusted_by
  ON public.site_visit_costs (adjusted_by);

CREATE INDEX IF NOT EXISTS idx_site_visit_costs_assigned_by
  ON public.site_visit_costs (assigned_by);

CREATE INDEX IF NOT EXISTS idx_site_visit_costs_calculated_by
  ON public.site_visit_costs (calculated_by);

CREATE INDEX IF NOT EXISTS idx_super_admins_appointed_by
  ON public.super_admins (appointed_by);

CREATE INDEX IF NOT EXISTS idx_super_admins_deactivated_by
  ON public.super_admins (deactivated_by);

CREATE INDEX IF NOT EXISTS idx_support_contacts_created_by
  ON public.support_contacts (created_by);

CREATE INDEX IF NOT EXISTS idx_task_budget_transactions_task_budget_id
  ON public.task_budget_transactions (task_budget_id);

CREATE INDEX IF NOT EXISTS idx_team_members_project_id
  ON public.team_members (project_id);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_sender_id
  ON public.ticket_messages (sender_id);

CREATE INDEX IF NOT EXISTS idx_user_classifications_assigned_by
  ON public.user_classifications (assigned_by);

CREATE INDEX IF NOT EXISTS idx_visit_status_updated_by
  ON public.visit_status (updated_by);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_created_by
  ON public.wallet_transactions (created_by);

CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_admin_processed_by
  ON public.withdrawal_requests (admin_processed_by);

CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_supervisor_id
  ON public.withdrawal_requests (supervisor_id);
