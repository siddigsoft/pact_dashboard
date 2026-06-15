-- ============================================================
-- DIAGNOSTIC: Stuck FOM Cost Submissions awaiting Tier 1
-- Run in Supabase SQL Editor (read-only, no changes)
-- ============================================================

SELECT
  ocs.id,
  ocs.request_title,
  ocs.expense_category,
  ocs.amount_cents::numeric / 100        AS amount,
  ocs.currency,
  ocs.submitter_role,
  ocs.tier1_status,
  ocs.tier2_status,
  ocs.status,
  ocs.created_at,
  p.full_name                            AS submitted_by_name,
  p.email                                AS submitted_by_email,
  p.role                                 AS submitted_by_current_role
FROM operational_cost_submissions ocs
LEFT JOIN profiles p ON p.id = ocs.submitted_by
WHERE
  -- FOM role variants
  (
    LOWER(ocs.submitter_role) = 'fom'
    OR LOWER(ocs.submitter_role) LIKE '%field operation manager%'
    OR LOWER(ocs.submitter_role) LIKE '%fieldoperationmanager%'
  )
  AND ocs.tier1_status = 'pending'       -- still waiting at Tier 1
  AND ocs.status NOT IN ('rejected', 'reconciled', 'paid')
ORDER BY ocs.created_at DESC;

-- ---- Summary count ----
SELECT COUNT(*) AS stuck_fom_submissions
FROM operational_cost_submissions
WHERE
  (
    LOWER(submitter_role) = 'fom'
    OR LOWER(submitter_role) LIKE '%field operation manager%'
  )
  AND tier1_status = 'pending'
  AND status NOT IN ('rejected', 'reconciled', 'paid');
