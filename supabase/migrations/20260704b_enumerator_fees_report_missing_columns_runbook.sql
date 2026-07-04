-- RUNBOOK: Missing columns needed by the Enumerator Fees Report page
--
-- Why you're seeing this: the Enumerator Fees Report page just started
-- showing "Failed to load fees / Bad Request". That happens because the
-- database is missing several columns that earlier migration files already
-- described but were never actually run against this database.
--
-- This file combines those 3 pending migrations into ONE script so you only
-- have to run it once. It is 100% safe to run — every statement uses
-- "IF NOT EXISTS", so it will not touch or duplicate anything that already
-- exists, and it does not delete or modify any existing data.
--
-- HOW TO RUN:
-- 1. Open your Supabase project dashboard → SQL Editor.
-- 2. Paste the entire contents of this file and click "Run".
-- 3. Refresh the Enumerator Fees Report page in PACT — the error should be gone.
--
-- (The 3 original source migrations, kept for reference / history:
--   20250126_add_forwarded_tracking_to_site_entries.sql
--   20251125_add_cost_acknowledged_to_mmp_site_entries.sql
--   20260704_enumerator_fee_payment_tracking.sql)

-- ── Part 1: "Forwarded to" tracking (who a site was assigned to) ───────────
ALTER TABLE public.mmp_site_entries
  ADD COLUMN IF NOT EXISTS forwarded_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS forwarded_to_user_id uuid,
  ADD COLUMN IF NOT EXISTS forwarded_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_forwarded_by_user_id
  ON public.mmp_site_entries(forwarded_by_user_id);
CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_forwarded_to_user_id
  ON public.mmp_site_entries(forwarded_to_user_id);
CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_forwarded_at
  ON public.mmp_site_entries(forwarded_at);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'mmp_site_entries_forwarded_by_user_id_fkey'
  ) THEN
    ALTER TABLE public.mmp_site_entries
      ADD CONSTRAINT mmp_site_entries_forwarded_by_user_id_fkey
      FOREIGN KEY (forwarded_by_user_id)
      REFERENCES public.profiles(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'mmp_site_entries_forwarded_to_user_id_fkey'
  ) THEN
    ALTER TABLE public.mmp_site_entries
      ADD CONSTRAINT mmp_site_entries_forwarded_to_user_id_fkey
      FOREIGN KEY (forwarded_to_user_id)
      REFERENCES public.profiles(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Best-effort backfill from legacy text/JSON fields so existing records get
-- a real assignee where one can be confidently matched.
UPDATE public.mmp_site_entries mse
SET forwarded_by_user_id = (
  SELECT p.id
  FROM public.profiles p
  WHERE mse.dispatched_by IS NOT NULL
    AND (
      mse.dispatched_by::text = p.id::text
      OR LOWER(TRIM(mse.dispatched_by)) = LOWER(TRIM(p.email))
      OR LOWER(TRIM(mse.dispatched_by)) = LOWER(TRIM(p.username))
      OR LOWER(TRIM(mse.dispatched_by)) = LOWER(TRIM(p.full_name))
    )
  LIMIT 1
)
WHERE mse.dispatched_by IS NOT NULL
  AND mse.forwarded_by_user_id IS NULL;

UPDATE public.mmp_site_entries
SET forwarded_at = dispatched_at
WHERE dispatched_at IS NOT NULL
  AND forwarded_at IS NULL;

UPDATE public.mmp_site_entries mse
SET forwarded_to_user_id = (
  SELECT p.id
  FROM public.profiles p
  WHERE mse.additional_data->>'assigned_to' IS NOT NULL
    AND (
      mse.additional_data->>'assigned_to' = p.id::text
      OR LOWER(TRIM(mse.additional_data->>'assigned_to')) = LOWER(TRIM(p.email))
      OR LOWER(TRIM(mse.additional_data->>'assigned_to')) = LOWER(TRIM(p.username))
      OR LOWER(TRIM(mse.additional_data->>'assigned_to')) = LOWER(TRIM(p.full_name))
    )
  LIMIT 1
)
WHERE mse.additional_data->>'assigned_to' IS NOT NULL
  AND mse.forwarded_to_user_id IS NULL;

COMMENT ON COLUMN public.mmp_site_entries.forwarded_by_user_id IS
'Foreign key to profiles.id - The user who forwarded this site entry to a coordinator.';
COMMENT ON COLUMN public.mmp_site_entries.forwarded_to_user_id IS
'Foreign key to profiles.id - The coordinator user this site entry was forwarded to.';
COMMENT ON COLUMN public.mmp_site_entries.forwarded_at IS
'Timestamp when the site entry was forwarded to a coordinator. NULL means not yet forwarded.';

-- ── Part 2: Cost acknowledgement tracking ───────────────────────────────────
ALTER TABLE public.mmp_site_entries
  ADD COLUMN IF NOT EXISTS cost_acknowledged boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS cost_acknowledged_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS cost_acknowledged_by uuid REFERENCES public.profiles(id);

CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_cost_acknowledged
  ON public.mmp_site_entries (cost_acknowledged)
  WHERE cost_acknowledged = true;

COMMENT ON COLUMN public.mmp_site_entries.cost_acknowledged IS 'Indicates if the cost has been acknowledged by the relevant party';
COMMENT ON COLUMN public.mmp_site_entries.cost_acknowledged_at IS 'Timestamp when the cost was acknowledged';
COMMENT ON COLUMN public.mmp_site_entries.cost_acknowledged_by IS 'User who acknowledged the cost';

CREATE OR REPLACE FUNCTION public.handle_mmp_site_entries_cost_acknowledged()
RETURNS trigger AS $$
BEGIN
    IF NEW.cost_acknowledged IS DISTINCT FROM OLD.cost_acknowledged THEN
        NEW.updated_at = now();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_mmp_site_entries_cost_acknowledged ON public.mmp_site_entries;
CREATE TRIGGER on_mmp_site_entries_cost_acknowledged
BEFORE UPDATE OF cost_acknowledged ON public.mmp_site_entries
FOR EACH ROW
EXECUTE FUNCTION public.handle_mmp_site_entries_cost_acknowledged();

-- ── Part 3: Enumerator fee payment ledger (standalone, outside Wallet) ─────
ALTER TABLE public.mmp_site_entries
  ADD COLUMN IF NOT EXISTS fee_paid_status   text        NOT NULL DEFAULT 'unpaid'
    CHECK (fee_paid_status IN ('unpaid', 'paid')),
  ADD COLUMN IF NOT EXISTS fee_paid_amount   numeric,
  ADD COLUMN IF NOT EXISTS fee_paid_at       timestamptz,
  ADD COLUMN IF NOT EXISTS fee_paid_by       uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS fee_payment_method text,
  ADD COLUMN IF NOT EXISTS fee_payment_notes  text;

CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_fee_paid_status
  ON public.mmp_site_entries(fee_paid_status);

COMMENT ON COLUMN public.mmp_site_entries.fee_paid_status IS
  'Manual finance ledger for enumerator fee payments made outside the Wallet/Withdrawal flow (e.g. site visit completed outside the app). Independent of cost_acknowledged and site visit status.';
COMMENT ON COLUMN public.mmp_site_entries.fee_paid_by IS
  'auth.users id of the finance/admin user who marked this fee as paid.';

-- Done. Re-open the Enumerator Fees Report page — it should now load data.
