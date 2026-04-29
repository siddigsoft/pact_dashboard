-- Withdrawal Requests — MMP Cycle Close gate
-- Enables the "All withdrawal requests processed" gate on the MMP Cycle Close checklist.
-- Apply this in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Safe to re-run: all statements are idempotent.

-- ── Option A: table does not exist yet — create it fresh ─────────────────────
CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mmp_id       UUID REFERENCES public.mmp_files(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  wallet_id    UUID REFERENCES public.wallets(id) ON DELETE CASCADE,
  requested_by UUID REFERENCES auth.users(id),
  amount       NUMERIC(12, 2),
  currency     TEXT DEFAULT 'SDG',
  reason       TEXT,
  request_reason TEXT,
  status       TEXT NOT NULL DEFAULT 'pending',
  -- status values: pending | approved | rejected | completed | paid | cancelled
  notes        TEXT,
  supervisor_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  supervisor_notes TEXT,
  processed_by UUID REFERENCES auth.users(id),
  processed_at TIMESTAMPTZ,
  approved_at  TIMESTAMPTZ,
  rejected_at  TIMESTAMPTZ,
  payment_method  TEXT,
  payment_details JSONB,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── Option B: table already exists — add mmp_id if missing ───────────────────
ALTER TABLE public.withdrawal_requests
  ADD COLUMN IF NOT EXISTS mmp_id uuid REFERENCES public.mmp_files(id) ON DELETE CASCADE;

-- Also ensure user_id and wallet_id columns exist (added by create_wallet_tables.sql)
ALTER TABLE public.withdrawal_requests
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.withdrawal_requests
  ADD COLUMN IF NOT EXISTS wallet_id uuid REFERENCES public.wallets(id) ON DELETE CASCADE;

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_mmp_id
  ON public.withdrawal_requests(mmp_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_user_id
  ON public.withdrawal_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status
  ON public.withdrawal_requests(status);

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;

-- Drop old policies to avoid conflicts, then recreate
DROP POLICY IF EXISTS "Admins can manage withdrawal requests" ON public.withdrawal_requests;
DROP POLICY IF EXISTS "Users can view own withdrawal requests" ON public.withdrawal_requests;

CREATE POLICY "Admins can manage withdrawal requests"
  ON public.withdrawal_requests
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN (
          'admin', 'super_admin', 'superadmin',
          'financialadmin', 'financial_admin',
          'fom', 'field_operation_manager',
          'countrydirector', 'country_director'
        )
    )
  );

CREATE POLICY "Users can view own withdrawal requests"
  ON public.withdrawal_requests
  FOR SELECT
  TO authenticated
  USING (requested_by = auth.uid() OR user_id = auth.uid());

-- ── Updated-at trigger ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_withdrawal_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS withdrawal_requests_updated_at ON public.withdrawal_requests;
CREATE TRIGGER withdrawal_requests_updated_at
  BEFORE UPDATE ON public.withdrawal_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_withdrawal_requests_updated_at();

-- ── Instructions ──────────────────────────────────────────────────────────────
-- 1. Open your Supabase project dashboard
-- 2. Go to SQL Editor → New query
-- 3. Paste the entire contents of this file
-- 4. Click "Run"
-- After running, the "All withdrawal requests processed" gate on the MMP Cycle
-- Close checklist will become active (green check when no pending requests exist).
