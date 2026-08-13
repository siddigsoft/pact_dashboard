-- Migration: campaign_id FK + audit columns + backfill + RLS for advance_requests
-- Idempotent — safe to run multiple times.

-- ── 1. New columns ────────────────────────────────────────────────────────────

-- campaign_id: authoritative FK to one specific adhoc_campaigns row.
-- Backfilled below for unambiguous legacy rows; left NULL for ambiguous ones.
ALTER TABLE advance_requests
  ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES adhoc_campaigns(id) ON DELETE SET NULL;

-- Audit columns written by the Finance Hub when approving / rejecting / paying
ALTER TABLE advance_requests
  ADD COLUMN IF NOT EXISTS approved_by    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at    timestamptz,
  ADD COLUMN IF NOT EXISTS approval_notes text,
  ADD COLUMN IF NOT EXISTS paid_by        uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS paid_at        timestamptz;

-- ── 2. Backfill ───────────────────────────────────────────────────────────────
-- For each advance_request that still has no campaign_id, set it from adhoc_campaigns
-- if and only if that project maps to exactly one non-deleted campaign.
-- Rows where a project has multiple campaigns are left NULL (shown in Finance Hub
-- as "Unattributed" with a warning so finance staff can resolve manually).

UPDATE advance_requests ar
SET    campaign_id = sub.id
FROM  (
  SELECT ac.id, ac.project_id
  FROM   adhoc_campaigns ac
  WHERE  ac.deleted_at IS NULL
  AND    ac.project_id IS NOT NULL
  GROUP  BY ac.project_id, ac.id
  HAVING COUNT(*) OVER (PARTITION BY ac.project_id) = 1
) sub
WHERE  ar.campaign_id IS NULL
AND    ar.project_id  IS NOT NULL
AND    ar.project_id  = sub.project_id;

-- ── 3. Indexes ────────────────────────────────────────────────────────────────

-- Fast lookup for Finance Hub panel query (attributed rows)
CREATE INDEX IF NOT EXISTS idx_advance_requests_campaign_id
  ON advance_requests (campaign_id)
  WHERE campaign_id IS NOT NULL;

-- Fast lookup for unattributed legacy rows (Finance Hub second section)
CREATE INDEX IF NOT EXISTS idx_advance_requests_project_legacy
  ON advance_requests (project_id)
  WHERE campaign_id IS NULL AND project_id IS NOT NULL;

-- ── 4. Row-Level Security ─────────────────────────────────────────────────────

ALTER TABLE advance_requests ENABLE ROW LEVEL SECURITY;

-- 4a. Any authenticated user may read every row (Finance Hub, campaign tabs, reports)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'advance_requests' AND policyname = 'advance_requests_select_authenticated'
  ) THEN
    EXECUTE $$
      CREATE POLICY advance_requests_select_authenticated
        ON advance_requests FOR SELECT TO authenticated
        USING (true)
    $$;
  END IF;
END $$;

-- 4b. Any authenticated user may insert a new advance request
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'advance_requests' AND policyname = 'advance_requests_insert_authenticated'
  ) THEN
    EXECUTE $$
      CREATE POLICY advance_requests_insert_authenticated
        ON advance_requests FOR INSERT TO authenticated
        WITH CHECK (true)
    $$;
  END IF;
END $$;

-- 4c. Only Finance / Admin / Super Admin roles may UPDATE rows (approve/reject/pay).
--     Role is checked via the caller's profile row.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'advance_requests' AND policyname = 'advance_requests_update_finance_admin'
  ) THEN
    EXECUTE $$
      CREATE POLICY advance_requests_update_finance_admin
        ON advance_requests FOR UPDATE TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role IN (
              'admin', 'Admin', 'super_admin', 'SuperAdmin',
              'fom', 'Field Operation Manager (FOM)',
              'financialAdmin', 'financial_admin',
              'countryDirector', 'country_director'
            )
          )
        )
        WITH CHECK (true)
    $$;
  END IF;
END $$;
