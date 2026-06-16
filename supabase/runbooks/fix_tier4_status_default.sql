-- FIX: Bogus tier4_status='pending' set by 20260607_add_tier4_approval.sql
--
-- Problem:
--   The migration added tier4_status with DEFAULT 'pending', which stamped
--   every existing row — including Supervisor, FOM, and CD submissions —
--   with tier4_status='pending'. The hasFourTiers() check uses
--   `oc.tier4_status != null` as a fallback, so Supervisor submissions were
--   mistakenly classified as 4-tier (Coordinator flow), routing T1 approval
--   to Hub Supervisor instead of FOM. FOM therefore never saw approve buttons.
--
-- Fix:
--   Set tier4_status = NULL for every non-coordinator submission that has
--   NOT actually progressed to Tier 4 (i.e. T3 was never approved).
--   Coordinator submissions that are genuinely in the T4 stage are preserved.
--
-- Safe to run multiple times (idempotent WHERE clause).

UPDATE operational_cost_submissions
SET tier4_status = NULL
WHERE tier4_status = 'pending'
  AND (tier3_status IS NULL OR tier3_status != 'approved')
  AND (
        submitter_role ILIKE '%supervisor%'
     OR submitter_role ILIKE '%fom%'
     OR submitter_role ILIKE '%field operation manager%'
     OR submitter_role ILIKE '%country director%'
     OR submitter_role ILIKE '%countrydirector%'
     OR submitter_role ILIKE '%country_director%'
     OR submitter_role ILIKE '%admin%'
  );

-- Verify: should return 0 rows for the fixed role types
SELECT submitter_role, COUNT(*) AS bad_rows
FROM operational_cost_submissions
WHERE tier4_status = 'pending'
  AND (tier3_status IS NULL OR tier3_status != 'approved')
  AND submitter_role NOT ILIKE '%coordinator%'
GROUP BY submitter_role
ORDER BY bad_rows DESC;
