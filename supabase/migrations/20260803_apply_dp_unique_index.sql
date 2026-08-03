-- ============================================================
-- STEP 3: Apply partial unique index on mmp_site_entry_id
--
-- PURPOSE: Permanently prevent new duplicate active advance
--   requests for the same MMP site entry at the database level.
--
-- PREREQUISITE: Run the STEP 2 verification query first and
--   confirm it returns 0 rows before applying this migration.
--
--   SELECT
--     COALESCE(
--       mmp_site_entry_id::text,
--       LOWER(TRIM(COALESCE(site_name,''))) || '::' || COALESCE(hub_id::text, 'no-hub')
--     )                  AS site_key,
--     site_name,
--     COUNT(*)           AS still_duplicate
--   FROM down_payment_requests
--   WHERE status NOT IN ('cancelled', 'rejected', 'deleted')
--   GROUP BY 1, 2
--   HAVING COUNT(*) > 1;
--
-- If any rows remain, resolve them via the banner in the
-- Down Payment Approval page before running this file.
-- See: supabase/migrations/RUNBOOK_apply_unique_index.md
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_dp_requests_active_entry
  ON down_payment_requests (mmp_site_entry_id)
  WHERE mmp_site_entry_id IS NOT NULL
    AND status NOT IN ('cancelled', 'rejected', 'deleted');


-- ============================================================
-- VERIFICATION: Confirm both indexes and the trigger are live.
-- Expected: 2 rows for the index query, 2 rows for trigger.
-- ============================================================
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'down_payment_requests'
  AND indexname IN ('uq_dp_requests_active_entry', 'uq_dp_requests_active_name_hub');

SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_table = 'down_payment_requests'
  AND trigger_name = 'trg_dp_request_uniqueness';
