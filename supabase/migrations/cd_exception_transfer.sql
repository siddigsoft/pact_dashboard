-- CD Exception Transfer
-- Allows SuperAdmin to flag a cost submission as an "exception" that routes
-- to the Country Director for a separate approve/reject decision.
--
-- Apply with: psql $DATABASE_URL -f supabase/migrations/cd_exception_transfer.sql

ALTER TABLE operational_cost_submissions
  ADD COLUMN IF NOT EXISTS transferred_to_cd        boolean     DEFAULT false,
  ADD COLUMN IF NOT EXISTS transferred_by            uuid        REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS transferred_at            timestamptz,
  ADD COLUMN IF NOT EXISTS transfer_note             text,
  ADD COLUMN IF NOT EXISTS cd_exception_status       text        CHECK (cd_exception_status IN ('pending','approved','rejected')),
  ADD COLUMN IF NOT EXISTS cd_exception_note         text,
  ADD COLUMN IF NOT EXISTS cd_exception_reviewed_by  uuid        REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS cd_exception_reviewed_at  timestamptz;

-- Index so CD's "pending exception" filter is fast
CREATE INDEX IF NOT EXISTS idx_ocs_cd_exception
  ON operational_cost_submissions (transferred_to_cd, cd_exception_status)
  WHERE transferred_to_cd = true;
