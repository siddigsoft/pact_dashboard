-- ============================================================
-- DOWN PAYMENT DUPLICATE PREVENTION — COMPLETE FIX
-- Run each STEP in order in Supabase SQL Editor.
-- STEP 0 is read-only (safe to run anytime).
-- Steps 1–5 make changes — run 1→2→3→4→5 in sequence.
-- ============================================================


-- ============================================================
-- STEP 0: AUDIT — see all existing duplicates (READ-ONLY)
-- Review this output before doing anything else.
-- ============================================================
SELECT
  COALESCE(
    mmp_site_entry_id::text,
    'NO-ENTRY:' || LOWER(TRIM(COALESCE(site_name,''))) || '::' || COALESCE(hub_id::text, 'no-hub')
  )                                                             AS site_key,
  site_name,
  mmp_name,
  hub_name,
  COUNT(*)                                                      AS duplicate_count,
  ARRAY_AGG(id            ORDER BY created_at)                  AS request_ids,
  ARRAY_AGG(status        ORDER BY created_at)                  AS statuses,
  ARRAY_AGG(requested_amount ORDER BY created_at)               AS amounts_sdg,
  ARRAY_AGG(created_at::date ORDER BY created_at)               AS created_dates
FROM down_payment_requests
WHERE status NOT IN ('cancelled', 'rejected', 'deleted')
GROUP BY 1, 2, 3, 4
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;


-- ============================================================
-- STEP 1: CLEANUP — cancel duplicate rows, keep the best one
--
-- Priority order (which row survives):
--   1. fully_paid       — already paid, must keep
--   2. partially_paid   — partially paid, must keep
--   3. approved         — fully approved, keep
--   4. pending_admin    — halfway through approval, keep
--   5. pending_supervisor — earliest stage, keep if no better sibling
--   Most recent row wins within the same status tier.
--
-- Safety: rows that are partially_paid or fully_paid are NEVER
-- auto-cancelled even if they are "extra" rows — human review needed.
-- ============================================================
WITH ranked AS (

  -- Group A: rows with a precise mmp_site_entry_id
  SELECT
    id,
    status,
    ROW_NUMBER() OVER (
      PARTITION BY mmp_site_entry_id
      ORDER BY
        CASE status
          WHEN 'fully_paid'         THEN 1
          WHEN 'partially_paid'     THEN 2
          WHEN 'approved'           THEN 3
          WHEN 'pending_admin'      THEN 4
          WHEN 'pending_supervisor' THEN 5
          ELSE 6
        END,
        created_at DESC
    ) AS rn
  FROM down_payment_requests
  WHERE mmp_site_entry_id IS NOT NULL
    AND status NOT IN ('cancelled', 'rejected', 'deleted')

  UNION ALL

  -- Group B: legacy rows without mmp_site_entry_id (keyed by site_name + hub_id)
  SELECT
    id,
    status,
    ROW_NUMBER() OVER (
      PARTITION BY LOWER(TRIM(COALESCE(site_name,''))), hub_id
      ORDER BY
        CASE status
          WHEN 'fully_paid'         THEN 1
          WHEN 'partially_paid'     THEN 2
          WHEN 'approved'           THEN 3
          WHEN 'pending_admin'      THEN 4
          WHEN 'pending_supervisor' THEN 5
          ELSE 6
        END,
        created_at DESC
    ) AS rn
  FROM down_payment_requests
  WHERE mmp_site_entry_id IS NULL
    AND status NOT IN ('cancelled', 'rejected', 'deleted')
)
UPDATE down_payment_requests dp
SET
  status     = 'cancelled',
  updated_at = NOW(),
  metadata   = jsonb_set(
    COALESCE(metadata, '{}'),
    '{auto_cancelled_reason}',
    '"Auto-cancelled: duplicate advance request for the same site — the best-status/most-recent row was kept."',
    true
  )
FROM ranked r
WHERE dp.id = r.id
  AND r.rn > 1
  AND dp.status NOT IN ('partially_paid', 'fully_paid');   -- never auto-cancel paid rows


-- ============================================================
-- STEP 2: VERIFY — this must return 0 rows before continuing
-- If you see rows here, there are paid duplicates that need
-- manual review. Contact finance before proceeding.
-- ============================================================
SELECT
  COALESCE(
    mmp_site_entry_id::text,
    LOWER(TRIM(COALESCE(site_name,''))) || '::' || COALESCE(hub_id::text, 'no-hub')
  )                  AS site_key,
  site_name,
  COUNT(*)           AS still_duplicate
FROM down_payment_requests
WHERE status NOT IN ('cancelled', 'rejected', 'deleted')
GROUP BY 1, 2
HAVING COUNT(*) > 1;


-- ============================================================
-- STEP 3: UNIQUE INDEX (A) — prevent future duplicates for rows
-- that have an mmp_site_entry_id.
-- The DB will reject any INSERT/UPDATE that would create a second
-- active request for the same site entry.
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_dp_requests_active_entry
  ON down_payment_requests (mmp_site_entry_id)
  WHERE mmp_site_entry_id IS NOT NULL
    AND status NOT IN ('cancelled', 'rejected', 'deleted');


-- ============================================================
-- STEP 4: UNIQUE INDEX (B) — prevent future duplicates for legacy
-- rows that have no mmp_site_entry_id (old data / fallback path).
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_dp_requests_active_name_hub
  ON down_payment_requests (LOWER(TRIM(COALESCE(site_name,''))), hub_id)
  WHERE mmp_site_entry_id IS NULL
    AND hub_id IS NOT NULL
    AND status NOT IN ('cancelled', 'rejected', 'deleted');


-- ============================================================
-- STEP 5: DB TRIGGER — strongest guard, enforced at DB level
-- even if the app code is bypassed (e.g. direct SQL insert,
-- API call that skips the React app, etc.).
-- The trigger fires on every INSERT and on every status UPDATE.
-- ============================================================

-- 5a. The trigger function
CREATE OR REPLACE FUNCTION enforce_dp_request_uniqueness()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Rows moving to cancelled/rejected/deleted are always OK
  IF NEW.status IN ('cancelled', 'rejected', 'deleted') THEN
    RETURN NEW;
  END IF;

  -- Path A: check by mmp_site_entry_id (exact site entry match)
  IF NEW.mmp_site_entry_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM down_payment_requests
      WHERE mmp_site_entry_id = NEW.mmp_site_entry_id
        AND id <> NEW.id
        AND status NOT IN ('cancelled', 'rejected', 'deleted')
    ) THEN
      RAISE EXCEPTION
        'DUPLICATE_DP_REQUEST: An active advance request already exists for MMP site entry %. '
        'Cancel or resolve the existing request before creating a new one.',
        NEW.mmp_site_entry_id
        USING ERRCODE = 'unique_violation';
    END IF;

  -- Path B: fallback check by site_name + hub_id (for legacy rows without entry id)
  ELSIF NEW.site_name IS NOT NULL AND NEW.hub_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM down_payment_requests
      WHERE LOWER(TRIM(COALESCE(site_name,''))) = LOWER(TRIM(NEW.site_name))
        AND hub_id = NEW.hub_id
        AND mmp_site_entry_id IS NULL
        AND id <> NEW.id
        AND status NOT IN ('cancelled', 'rejected', 'deleted')
    ) THEN
      RAISE EXCEPTION
        'DUPLICATE_DP_REQUEST: An active advance request already exists for site "%" in hub %. '
        'Cancel or resolve the existing request before creating a new one.',
        NEW.site_name, NEW.hub_id
        USING ERRCODE = 'unique_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 5b. Attach the trigger (replace any old version)
DROP TRIGGER IF EXISTS trg_dp_request_uniqueness ON down_payment_requests;

CREATE TRIGGER trg_dp_request_uniqueness
  BEFORE INSERT OR UPDATE OF status
  ON down_payment_requests
  FOR EACH ROW
  EXECUTE FUNCTION enforce_dp_request_uniqueness();


-- ============================================================
-- FINAL CHECK: confirm indexes and trigger are in place
-- ============================================================
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'down_payment_requests'
  AND indexname IN ('uq_dp_requests_active_entry', 'uq_dp_requests_active_name_hub');

SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_table = 'down_payment_requests'
  AND trigger_name = 'trg_dp_request_uniqueness';
