-- ============================================================
-- RESTORE: Blue Nile MMP accidentally reclaimed from coordinator
-- MMP ID   : 1e1909b4-1d70-4b90-898a-97c496d2c888
-- Coord ID : ee667ad1-dee7-4901-a53b-20cfbb7b35d6
-- Reclaimed: 2026-03-30 09:59:14 UTC  by ELSIDDIG IBRAHIM
-- Entries  : 136 site entries reset (Pending/Completed/Accepted/
--             Approved and Costed/costed → all set to "verified")
-- ============================================================

BEGIN;

-- Step 1: Restore forwarded_to_user_id and each entry's ORIGINAL status
-- using the previous_state snapshot recorded in audit_logs at reclaim time.
UPDATE mmp_site_entries mse
SET
  forwarded_to_user_id = 'ee667ad1-dee7-4901-a53b-20cfbb7b35d6'::uuid,
  status               = al.prev_status
FROM (
  SELECT DISTINCT ON (entity_id)
    entity_id::uuid          AS entry_id,
    previous_state->>'status' AS prev_status
  FROM audit_logs
  WHERE action        = 'reclaim_from_coordinator'
    AND metadata->>'mmpId' = '1e1909b4-1d70-4b90-898a-97c496d2c888'
  ORDER BY entity_id, created_at DESC
) al
WHERE mse.id           = al.entry_id
  AND mse.mmp_file_id  = '1e1909b4-1d70-4b90-898a-97c496d2c888';

-- Step 2: Restore MMP file status back to forwarded_to_coordinator
UPDATE mmp_files
SET status = 'forwarded_to_coordinator'
WHERE id = '1e1909b4-1d70-4b90-898a-97c496d2c888';

-- ── Verification query (run after COMMIT to confirm) ──────────
-- SELECT
--   COUNT(*)                                          AS total_entries,
--   COUNT(forwarded_to_user_id)                       AS restored_with_coordinator,
--   COUNT(*) FILTER (WHERE status = 'Pending')        AS pending,
--   COUNT(*) FILTER (WHERE status = 'Completed')      AS completed,
--   COUNT(*) FILTER (WHERE status = 'Accepted')       AS accepted,
--   COUNT(*) FILTER (WHERE status = 'Approved and Costed') AS approved_costed
-- FROM mmp_site_entries
-- WHERE mmp_file_id = '1e1909b4-1d70-4b90-898a-97c496d2c888'
--   AND forwarded_to_user_id = 'ee667ad1-dee7-4901-a53b-20cfbb7b35d6';

COMMIT;
