-- ============================================================================
-- PRE-FUND USER ALLOCATIONS
-- Links specific users to a pre-fund with an allocated budget.
-- Only allocated users can have payments auto-linked to a fund.
-- ============================================================================

CREATE TABLE IF NOT EXISTS pre_fund_allocations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pre_fund_request_id UUID NOT NULL REFERENCES pre_fund_requests(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  allocated_amount  NUMERIC(15,2) NOT NULL CHECK (allocated_amount > 0),
  spent_amount      NUMERIC(15,2) NOT NULL DEFAULT 0,
  currency          TEXT NOT NULL DEFAULT 'USD',
  notes             TEXT,
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pre_fund_request_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_pf_alloc_fund ON pre_fund_allocations(pre_fund_request_id);
CREATE INDEX IF NOT EXISTS idx_pf_alloc_user ON pre_fund_allocations(user_id);

ALTER TABLE pre_fund_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pf_alloc_admin_all"   ON pre_fund_allocations;
DROP POLICY IF EXISTS "pf_alloc_self_select" ON pre_fund_allocations;

-- Finance/admin: full access
CREATE POLICY "pf_alloc_admin_all" ON pre_fund_allocations FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
      AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin','financial_admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
      AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin','financial_admin'))
  );

-- Users: can see their own allocation
CREATE POLICY "pf_alloc_self_select" ON pre_fund_allocations FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Function to deduct from a user's allocation when a payment is linked.
-- SECURITY DEFINER so it can bypass RLS, but ONLY finance/admin roles may call it.
CREATE OR REPLACE FUNCTION deduct_pf_allocation(
  p_fund_id   UUID,
  p_user_id   UUID,
  p_amount    NUMERIC
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_rows INT;
BEGIN
  -- ── Role guard ──────────────────────────────────────────────────────────────
  SELECT LOWER(role) INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role IS NULL OR v_role NOT IN (
    'super_admin','superadmin','admin','financialadmin','financial_admin'
  ) THEN
    RAISE EXCEPTION 'deduct_pf_allocation: caller does not have finance/admin role (uid=%)', auth.uid();
  END IF;

  -- ── Deduct ──────────────────────────────────────────────────────────────────
  UPDATE pre_fund_allocations
  SET spent_amount = spent_amount + p_amount,
      updated_at   = now()
  WHERE pre_fund_request_id = p_fund_id
    AND user_id = p_user_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'deduct_pf_allocation: no allocation row found for fund=% user=% — deduction skipped',
      p_fund_id, p_user_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION deduct_pf_allocation(UUID, UUID, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION deduct_pf_allocation(UUID, UUID, NUMERIC) TO authenticated;

NOTIFY pgrst, 'reload schema';
