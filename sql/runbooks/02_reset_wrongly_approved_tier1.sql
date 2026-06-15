-- ============================================================
-- OPTIONAL: Reset Tier 1 on FOM submissions approved by a Supervisor
-- Only use this when a supervisor incorrectly approved Tier 1
-- of an FOM submission BEFORE the code fix was deployed.
--
-- ⚠️  Review each submission_id before running.
-- ⚠️  Run the diagnostic first (01_diagnose_stuck_fom.sql).
-- ============================================================

-- First, review what will be reset (DRY RUN — no changes)
SELECT
  ocs.id,
  ocs.request_title,
  ocs.tier1_status,
  ocs.tier1_approved_by,
  ocs.tier1_approved_at,
  ocs.tier1_notes,
  p.full_name  AS approved_by_name,
  p.role       AS approver_role
FROM operational_cost_submissions ocs
LEFT JOIN profiles p ON p.id = ocs.tier1_approved_by
WHERE
  (
    LOWER(ocs.submitter_role) = 'fom'
    OR LOWER(ocs.submitter_role) LIKE '%field operation manager%'
  )
  AND ocs.tier1_status = 'approved'
  -- Approved by someone who is NOT a Country Director or Admin
  AND p.role NOT IN (
    'countryDirector', 'CountryDirector', 'country_director',
    'Admin', 'admin', 'SuperAdmin', 'super_admin', 'superAdmin'
  )
ORDER BY ocs.tier1_approved_at DESC;


-- ============================================================
-- ACTUAL RESET (uncomment and edit the WHERE clause to target
-- specific submission IDs after reviewing the dry run above)
-- ============================================================

/*
UPDATE operational_cost_submissions
SET
  tier1_status       = 'pending',
  tier1_approved_by  = NULL,
  tier1_approved_at  = NULL,
  tier1_notes        = NULL,
  status             = 'pending',
  updated_at         = NOW()
WHERE
  id IN (
    -- Paste specific IDs from the dry-run above, e.g.:
    -- 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    -- 'yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy'
  )
  -- Safety guard: only reset FOM submissions
  AND (
    LOWER(submitter_role) = 'fom'
    OR LOWER(submitter_role) LIKE '%field operation manager%'
  );
*/
