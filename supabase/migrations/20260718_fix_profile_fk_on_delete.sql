-- ─────────────────────────────────────────────────────────────────────────────
-- Fix FK constraints on profiles(id) that are missing ON DELETE SET NULL
--
-- Problem: Deleting a profile row throws FK constraint violations because
-- several tables reference profiles(id) without any ON DELETE rule, so
-- Postgres blocks the delete outright.
--
-- Strategy: Change each bare REFERENCES profiles(id) to
--   REFERENCES profiles(id) ON DELETE SET NULL
-- This preserves audit/notification history (the row stays, the author column
-- becomes NULL) instead of silently wiping records.
--
-- Safe to re-run: DROP CONSTRAINT IF EXISTS guards every drop.
-- Apply in Supabase SQL Editor → New Query → Run.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. notifications.triggered_by ────────────────────────────────────────────
ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_triggered_by_fkey;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_triggered_by_fkey
  FOREIGN KEY (triggered_by) REFERENCES profiles(id) ON DELETE SET NULL;


-- ── 2. hr_policies.created_by ─────────────────────────────────────────────────
ALTER TABLE hr_policies
  DROP CONSTRAINT IF EXISTS hr_policies_created_by_fkey;

ALTER TABLE hr_policies
  ADD CONSTRAINT hr_policies_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;


-- ── 3. hr_assets.created_by ───────────────────────────────────────────────────
ALTER TABLE hr_assets
  DROP CONSTRAINT IF EXISTS hr_assets_created_by_fkey;

ALTER TABLE hr_assets
  ADD CONSTRAINT hr_assets_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;


-- ── 4. hr_asset_assignments.assigned_by ──────────────────────────────────────
ALTER TABLE hr_asset_assignments
  DROP CONSTRAINT IF EXISTS hr_asset_assignments_assigned_by_fkey;

ALTER TABLE hr_asset_assignments
  ADD CONSTRAINT hr_asset_assignments_assigned_by_fkey
  FOREIGN KEY (assigned_by) REFERENCES profiles(id) ON DELETE SET NULL;


-- ── 5. hr_employee_documents.uploaded_by (complete_setup migration) ───────────
--    Both hr_employee_profile_tables.sql and hr_employee_profile_complete_setup.sql
--    define this column without ON DELETE. The constraint name Postgres assigns by
--    default is hr_employee_documents_uploaded_by_fkey.
ALTER TABLE hr_employee_documents
  DROP CONSTRAINT IF EXISTS hr_employee_documents_uploaded_by_fkey;

ALTER TABLE hr_employee_documents
  ADD CONSTRAINT hr_employee_documents_uploaded_by_fkey
  FOREIGN KEY (uploaded_by) REFERENCES profiles(id) ON DELETE SET NULL;


-- ── 6. Discovery: any other bare REFERENCES profiles(id) columns ───────────────
--    Run this SELECT after applying the above to confirm no bare FKs remain:
--
--    SELECT tc.table_name, kcu.column_name, rc.delete_rule
--    FROM information_schema.table_constraints tc
--    JOIN information_schema.key_column_usage kcu
--      ON kcu.constraint_name = tc.constraint_name
--    JOIN information_schema.referential_constraints rc
--      ON rc.constraint_name = tc.constraint_name
--    JOIN information_schema.key_column_usage ccu
--      ON ccu.constraint_name = rc.unique_constraint_name
--    WHERE tc.constraint_type = 'FOREIGN KEY'
--      AND ccu.table_name = 'profiles'
--      AND ccu.column_name = 'id'
--      AND rc.delete_rule = 'NO ACTION'
--    ORDER BY tc.table_name, kcu.column_name;
--
--    Any row returned is a candidate for ON DELETE SET NULL (if it is an audit/
--    authorship column) or ON DELETE CASCADE (if the child row is meaningless
--    without the profile).  Tables whose FK column is the primary subject of the
--    row (e.g. hr_employee_personal.profile_id) already use ON DELETE CASCADE
--    and are correct as-is.
-- ─────────────────────────────────────────────────────────────────────────────
