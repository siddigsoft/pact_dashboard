-- ─────────────────────────────────────────────────────────────────────────────
-- Fix remaining bare REFERENCES profiles(id) constraints that have no
-- ON DELETE rule (Postgres default = NO ACTION, blocks user deletion).
--
-- Strategy:
--   Authorship / audit columns  → ON DELETE SET NULL
--   Ownership (user IS the row) → ON DELETE CASCADE
--
-- Safe to re-run: DROP CONSTRAINT IF EXISTS guards every drop.
-- Run in Supabase Dashboard → SQL Editor → New Query → Run.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── recall_events ────────────────────────────────────────────────────────────
ALTER TABLE recall_events
  DROP CONSTRAINT IF EXISTS recall_events_initiated_by_fkey;
ALTER TABLE recall_events
  ADD CONSTRAINT recall_events_initiated_by_fkey
  FOREIGN KEY (initiated_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE recall_events
  DROP CONSTRAINT IF EXISTS recall_events_approved_by_fkey;
ALTER TABLE recall_events
  ADD CONSTRAINT recall_events_approved_by_fkey
  FOREIGN KEY (approved_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- ── recall_approvals ─────────────────────────────────────────────────────────
ALTER TABLE recall_approvals
  DROP CONSTRAINT IF EXISTS recall_approvals_approver_id_fkey;
ALTER TABLE recall_approvals
  ADD CONSTRAINT recall_approvals_approver_id_fkey
  FOREIGN KEY (approver_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- ── recovery_records ─────────────────────────────────────────────────────────
ALTER TABLE recovery_records
  DROP CONSTRAINT IF EXISTS recovery_records_data_collector_id_fkey;
ALTER TABLE recovery_records
  ADD CONSTRAINT recovery_records_data_collector_id_fkey
  FOREIGN KEY (data_collector_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE recovery_records
  DROP CONSTRAINT IF EXISTS recovery_records_processed_by_fkey;
ALTER TABLE recovery_records
  ADD CONSTRAINT recovery_records_processed_by_fkey
  FOREIGN KEY (processed_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- ── user_classifications ─────────────────────────────────────────────────────
ALTER TABLE user_classifications
  DROP CONSTRAINT IF EXISTS user_classifications_assigned_by_fkey;
ALTER TABLE user_classifications
  ADD CONSTRAINT user_classifications_assigned_by_fkey
  FOREIGN KEY (assigned_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- ── classification_fee_structures ────────────────────────────────────────────
ALTER TABLE classification_fee_structures
  DROP CONSTRAINT IF EXISTS classification_fee_structures_created_by_fkey;
ALTER TABLE classification_fee_structures
  ADD CONSTRAINT classification_fee_structures_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE classification_fee_structures
  DROP CONSTRAINT IF EXISTS classification_fee_structures_updated_by_fkey;
ALTER TABLE classification_fee_structures
  ADD CONSTRAINT classification_fee_structures_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- ── site_visit_costs ─────────────────────────────────────────────────────────
ALTER TABLE site_visit_costs
  DROP CONSTRAINT IF EXISTS site_visit_costs_calculated_by_fkey;
ALTER TABLE site_visit_costs
  ADD CONSTRAINT site_visit_costs_calculated_by_fkey
  FOREIGN KEY (calculated_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- ── down_payment_requests ────────────────────────────────────────────────────
ALTER TABLE down_payment_requests
  DROP CONSTRAINT IF EXISTS down_payment_requests_requested_by_fkey;
ALTER TABLE down_payment_requests
  ADD CONSTRAINT down_payment_requests_requested_by_fkey
  FOREIGN KEY (requested_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE down_payment_requests
  DROP CONSTRAINT IF EXISTS down_payment_requests_supervisor_id_fkey;
ALTER TABLE down_payment_requests
  ADD CONSTRAINT down_payment_requests_supervisor_id_fkey
  FOREIGN KEY (supervisor_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE down_payment_requests
  DROP CONSTRAINT IF EXISTS down_payment_requests_supervisor_approved_by_fkey;
ALTER TABLE down_payment_requests
  ADD CONSTRAINT down_payment_requests_supervisor_approved_by_fkey
  FOREIGN KEY (supervisor_approved_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE down_payment_requests
  DROP CONSTRAINT IF EXISTS down_payment_requests_admin_processed_by_fkey;
ALTER TABLE down_payment_requests
  ADD CONSTRAINT down_payment_requests_admin_processed_by_fkey
  FOREIGN KEY (admin_processed_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- ── cost_adjustment_audit ────────────────────────────────────────────────────
ALTER TABLE cost_adjustment_audit
  DROP CONSTRAINT IF EXISTS cost_adjustment_audit_adjusted_by_fkey;
ALTER TABLE cost_adjustment_audit
  ADD CONSTRAINT cost_adjustment_audit_adjusted_by_fkey
  FOREIGN KEY (adjusted_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- ── super_admins ─────────────────────────────────────────────────────────────
-- user_id is an ownership column: super_admin record is meaningless without the profile.
ALTER TABLE super_admins
  DROP CONSTRAINT IF EXISTS super_admins_user_id_fkey;
ALTER TABLE super_admins
  ADD CONSTRAINT super_admins_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- appointed_by / deactivated_by are audit columns.
ALTER TABLE super_admins
  DROP CONSTRAINT IF EXISTS super_admins_appointed_by_fkey;
ALTER TABLE super_admins
  ADD CONSTRAINT super_admins_appointed_by_fkey
  FOREIGN KEY (appointed_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE super_admins
  DROP CONSTRAINT IF EXISTS super_admins_deactivated_by_fkey;
ALTER TABLE super_admins
  ADD CONSTRAINT super_admins_deactivated_by_fkey
  FOREIGN KEY (deactivated_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- ── deletion_audit_log ───────────────────────────────────────────────────────
ALTER TABLE deletion_audit_log
  DROP CONSTRAINT IF EXISTS deletion_audit_log_deleted_by_fkey;
ALTER TABLE deletion_audit_log
  ADD CONSTRAINT deletion_audit_log_deleted_by_fkey
  FOREIGN KEY (deleted_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE deletion_audit_log
  DROP CONSTRAINT IF EXISTS deletion_audit_log_restored_by_fkey;
ALTER TABLE deletion_audit_log
  ADD CONSTRAINT deletion_audit_log_restored_by_fkey
  FOREIGN KEY (restored_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- ── mmp_site_entries ─────────────────────────────────────────────────────────
ALTER TABLE mmp_site_entries
  DROP CONSTRAINT IF EXISTS mmp_site_entries_claimed_by_fkey;
ALTER TABLE mmp_site_entries
  ADD CONSTRAINT mmp_site_entries_claimed_by_fkey
  FOREIGN KEY (claimed_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- ── operational_cost_submissions ─────────────────────────────────────────────
ALTER TABLE operational_cost_submissions
  DROP CONSTRAINT IF EXISTS operational_cost_submissions_tier1_approved_by_fkey;
ALTER TABLE operational_cost_submissions
  ADD CONSTRAINT operational_cost_submissions_tier1_approved_by_fkey
  FOREIGN KEY (tier1_approved_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE operational_cost_submissions
  DROP CONSTRAINT IF EXISTS operational_cost_submissions_tier2_approved_by_fkey;
ALTER TABLE operational_cost_submissions
  ADD CONSTRAINT operational_cost_submissions_tier2_approved_by_fkey
  FOREIGN KEY (tier2_approved_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE operational_cost_submissions
  DROP CONSTRAINT IF EXISTS operational_cost_submissions_tier3_approved_by_fkey;
ALTER TABLE operational_cost_submissions
  ADD CONSTRAINT operational_cost_submissions_tier3_approved_by_fkey
  FOREIGN KEY (tier3_approved_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE operational_cost_submissions
  DROP CONSTRAINT IF EXISTS operational_cost_submissions_tier4_approved_by_fkey;
ALTER TABLE operational_cost_submissions
  ADD CONSTRAINT operational_cost_submissions_tier4_approved_by_fkey
  FOREIGN KEY (tier4_approved_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- ── timesheets ───────────────────────────────────────────────────────────────
ALTER TABLE timesheets
  DROP CONSTRAINT IF EXISTS timesheets_approved_by_fkey;
ALTER TABLE timesheets
  ADD CONSTRAINT timesheets_approved_by_fkey
  FOREIGN KEY (approved_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- ── payroll_settings ─────────────────────────────────────────────────────────
ALTER TABLE payroll_settings
  DROP CONSTRAINT IF EXISTS payroll_settings_updated_by_fkey;
ALTER TABLE payroll_settings
  ADD CONSTRAINT payroll_settings_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- ── page_role_configs ────────────────────────────────────────────────────────
ALTER TABLE page_role_configs
  DROP CONSTRAINT IF EXISTS page_role_configs_updated_by_fkey;
ALTER TABLE page_role_configs
  ADD CONSTRAINT page_role_configs_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL;
