-- ============================================================================
-- Timesheet entries INSERT policy hardening
-- ============================================================================
-- Follow-up to 20260409_timesheet_module.sql which is already APPLIED to pactdb.
--
-- Issue (architect High, 2026-04-26):
--   The original timesheet_entries_insert policy only checks parent ownership
--   (`t.user_id = auth.uid()`). It does NOT check parent status, so an
--   employee can keep adding new entries to a timesheet that has already been
--   submitted, approved, or even rejected — silently changing payable hours
--   AFTER approval and AFTER payroll has read them. This is an approval
--   bypass / payroll-integrity issue.
--
-- Fix:
--   Drop the old policy and recreate it with the same status guard the
--   UPDATE/DELETE policies already enforce (`t.status IN ('draft','revision')`).
--   Manager (admin/supervisor/fom over a direct report) and finance roles
--   keep their existing override paths, mirroring the UPDATE policy so that
--   privileged corrections are still possible when needed.
--
-- This patch is purely a policy swap — no schema changes, no data motion.
-- Idempotent: DROP IF EXISTS + CREATE.
-- ============================================================================

DROP POLICY IF EXISTS "timesheet_entries_insert" ON timesheet_entries;

CREATE POLICY "timesheet_entries_insert" ON timesheet_entries
  FOR INSERT WITH CHECK (
    -- Self-service: only into your OWN timesheet AND only while it's open
    EXISTS (
      SELECT 1 FROM timesheets t
      WHERE t.id = timesheet_id
        AND t.user_id = auth.uid()
        AND t.status IN ('draft', 'revision')
    )
    -- Manager override: admin/supervisor/fom inserting into a direct report's
    -- timesheet. Mirrors the UPDATE policy so a manager can still patch a
    -- subordinate's week regardless of status.
    OR (
      EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
          AND p.role IN ('admin','Admin','supervisor','Supervisor','fom','FOM')
      )
      AND EXISTS (
        SELECT 1 FROM timesheets t
        JOIN profiles dr ON dr.id = t.user_id
        WHERE t.id = timesheet_id AND dr.reports_to = auth.uid()
      )
    )
    -- Finance / super_admin override: full access to any week, any status.
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin','SuperAdmin','finance','Finance','financialAdmin','FinancialAdmin')
    )
  );

-- ─── Verify ──────────────────────────────────────────────────────────────────
-- Run this immediately after applying to confirm the new policy is in place:
--   SELECT polname, pg_get_expr(polqual, polrelid) AS using_expr,
--          pg_get_expr(polwithcheck, polrelid) AS check_expr
--   FROM pg_policy WHERE polrelid = 'public.timesheet_entries'::regclass
--   ORDER BY polname;
-- The check_expr for `timesheet_entries_insert` should now mention
-- `t.status IN ('draft', 'revision')`.
