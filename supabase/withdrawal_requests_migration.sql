-- Withdrawal Requests table
-- Enables the "All withdrawal requests processed" gate on the MMP Cycle Close checklist.
-- Apply this in the Supabase SQL editor (Dashboard → SQL Editor → New query).

CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mmp_id      UUID NOT NULL REFERENCES mmp_files(id) ON DELETE CASCADE,
  requested_by UUID REFERENCES auth.users(id),
  amount      NUMERIC(12, 2),
  currency    TEXT DEFAULT 'USD',
  reason      TEXT,
  status      TEXT NOT NULL DEFAULT 'pending',
  -- status values: pending | approved | rejected | completed | paid
  notes       TEXT,
  processed_by UUID REFERENCES auth.users(id),
  processed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Index for the readiness check query
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_mmp_id
  ON withdrawal_requests(mmp_id);

-- Row Level Security
ALTER TABLE withdrawal_requests ENABLE ROW LEVEL SECURITY;

-- Admins and finance roles can see all withdrawal requests
CREATE POLICY "Admins can manage withdrawal requests"
  ON withdrawal_requests
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN (
          'admin', 'super_admin', 'superadmin',
          'financialadmin', 'financial_admin',
          'fom', 'field_operation_manager',
          'countrydirector', 'country_director'
        )
    )
  );

-- Users can view their own withdrawal requests
CREATE POLICY "Users can view own withdrawal requests"
  ON withdrawal_requests
  FOR SELECT
  TO authenticated
  USING (requested_by = auth.uid());

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_withdrawal_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER withdrawal_requests_updated_at
  BEFORE UPDATE ON withdrawal_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_withdrawal_requests_updated_at();

-- ── Instructions ──────────────────────────────────────────────────────────────
-- 1. Open your Supabase project dashboard
-- 2. Go to SQL Editor → New query
-- 3. Paste the entire contents of this file
-- 4. Click "Run"
-- After running, the "All withdrawal requests processed" gate on the MMP Cycle
-- Close checklist will become active (green check when no pending requests exist).
