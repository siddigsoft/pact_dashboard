-- Migration: advance_requests table + campaign_id FK + audit columns + backfill + RLS
-- Idempotent — safe to run multiple times on any environment.

-- ── 0. Create the table if it doesn't exist yet ───────────────────────────────
-- Environments that already have the table skip this; the ALTER TABLE blocks
-- below add missing columns with IF NOT EXISTS so they are safe either way.

CREATE TABLE IF NOT EXISTS public.advance_requests (
  id                uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- attribution
  project_id        uuid          REFERENCES public.projects(id)  ON DELETE SET NULL,
  campaign_id       uuid          REFERENCES public.adhoc_campaigns(id) ON DELETE SET NULL,

  -- request details
  site_name         text,
  requested_amount  numeric       NOT NULL DEFAULT 0,
  total_paid_amount numeric,
  description       text,
  expense_category  text,

  -- lifecycle
  status            text          NOT NULL DEFAULT 'pending',
  -- CHECK (status IN ('pending','approved','rejected','paid'))

  -- approval / payment audit
  approved_by       uuid          REFERENCES public.profiles(id)  ON DELETE SET NULL,
  approved_at       timestamptz,
  approval_notes    text,
  paid_by           uuid          REFERENCES public.profiles(id)  ON DELETE SET NULL,
  paid_at           timestamptz,

  -- timestamps
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz
);

-- ── 1. New columns (no-ops when table was just created) ───────────────────────

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
  -- Only backfill rows where the project maps to exactly ONE campaign.
  -- Projects with multiple campaigns are left NULL (Finance Hub shows them
  -- as "Unattributed" so finance staff can resolve manually).
  SELECT ac.id, ac.project_id
  FROM   adhoc_campaigns ac
  WHERE  ac.deleted_at IS NULL
  AND    ac.project_id IS NOT NULL
  AND    ac.project_id IN (
    SELECT project_id
    FROM   adhoc_campaigns
    WHERE  deleted_at IS NULL
    AND    project_id IS NOT NULL
    GROUP  BY project_id
    HAVING COUNT(*) = 1
  )
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
DO $outer$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'advance_requests' AND policyname = 'advance_requests_select_authenticated'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY advance_requests_select_authenticated
        ON advance_requests FOR SELECT TO authenticated
        USING (true)
    $pol$;
  END IF;
END $outer$;

-- 4b. Any authenticated user may insert a new advance request
DO $outer$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'advance_requests' AND policyname = 'advance_requests_insert_authenticated'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY advance_requests_insert_authenticated
        ON advance_requests FOR INSERT TO authenticated
        WITH CHECK (true)
    $pol$;
  END IF;
END $outer$;

-- 4c. Only Finance / Admin / Super Admin roles may UPDATE rows (approve/reject/pay).
--     Role is checked via the caller's profile row.
DO $outer$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'advance_requests' AND policyname = 'advance_requests_update_finance_admin'
  ) THEN
    EXECUTE $pol$
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
    $pol$;
  END IF;
END $outer$;
