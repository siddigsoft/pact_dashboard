-- Two-tier advance approval for Village Campaign advance_requests
-- Adds tier1 / tier2 columns, backfills existing rows, hardens RLS, and creates
-- four SECURITY DEFINER RPCs (tier1-approve, tier2-approve, reject, mark-paid).
--
-- Authorization model
-- ───────────────────
-- Tier 1 (FOM, Supervisor, Admin, SuperAdmin, CountryDirector, FinancialAdmin)
--   → approves pending advances into "under review" state
-- Tier 2 (Admin, SuperAdmin, CountryDirector, FinancialAdmin)
--   → gives final approval before payment
-- Mark Paid (Admin, SuperAdmin, CountryDirector, FinancialAdmin)
--   → requires both tiers approved
--
-- The existing advance_requests_update_finance_admin policy granted unrestricted
-- direct UPDATE on every column.  This migration replaces it with NO direct-UPDATE
-- policy so that all state mutations go through the SECURITY DEFINER RPCs below.
-- Direct REST PATCH/PUT calls will be denied by RLS for all users.
--
-- Idempotent: IF NOT EXISTS / OR REPLACE guards throughout.

-- ── 1. New columns ────────────────────────────────────────────────────────────

ALTER TABLE advance_requests
  ADD COLUMN IF NOT EXISTS tier1_status      text  NOT NULL DEFAULT 'pending'
    CHECK (tier1_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS tier1_approved_by uuid  REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tier1_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS tier1_notes       text,
  ADD COLUMN IF NOT EXISTS tier2_status      text  NOT NULL DEFAULT 'pending'
    CHECK (tier2_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS tier2_approved_by uuid  REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tier2_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS tier2_notes       text,
  ADD COLUMN IF NOT EXISTS rejection_reason  text;

-- ── 2. Backfill ───────────────────────────────────────────────────────────────

-- Existing 'approved'/'paid' rows pre-date the two-tier flow → treat as fully approved.
UPDATE advance_requests
SET    tier1_status = 'approved',
       tier2_status = 'approved'
WHERE  status IN ('approved', 'paid')
  AND  tier1_status = 'pending'
  AND  tier2_status = 'pending';

-- 'rejected' rows — tier1 is a safe default (rejection_reason carries detail).
UPDATE advance_requests
SET    tier1_status = 'rejected'
WHERE  status = 'rejected'
  AND  tier1_status = 'pending';

-- ── 3. Harden RLS — remove broad UPDATE policy & restrict INSERT ─────────────

DO $outer$ BEGIN
  -- Drop the pre-existing broad policy (allowed FOM/Admin to bypass tiers via REST)
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'advance_requests'
    AND   policyname = 'advance_requests_update_finance_admin'
  ) THEN
    EXECUTE 'DROP POLICY advance_requests_update_finance_admin ON advance_requests';
  END IF;

  -- Drop any supervisor policy from earlier migration drafts
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'advance_requests'
    AND   policyname = 'advance_requests_update_supervisor'
  ) THEN
    EXECUTE 'DROP POLICY advance_requests_update_supervisor ON advance_requests';
  END IF;

  -- Drop the unrestricted insert policy that allowed fabricated approval state
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'advance_requests'
    AND   policyname = 'advance_requests_insert_authenticated'
  ) THEN
    EXECUTE 'DROP POLICY advance_requests_insert_authenticated ON advance_requests';
  END IF;
END $outer$;

-- Replacement INSERT policy: callers may only create genuinely pending requests.
-- All approval/payment audit fields must be NULL and status/tier states must be 'pending'.
-- This closes the bypass where a caller could INSERT a row already marked approved/paid.
CREATE POLICY advance_requests_insert_pending
  ON advance_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    status        = 'pending'
    AND tier1_status      = 'pending'
    AND tier2_status      = 'pending'
    AND tier1_approved_by IS NULL
    AND tier1_approved_at IS NULL
    AND tier2_approved_by IS NULL
    AND tier2_approved_at IS NULL
    AND total_paid_amount IS NULL
    AND paid_by           IS NULL
    AND paid_at           IS NULL
    AND rejection_reason  IS NULL
  );

-- No replacement UPDATE policy is added.
-- All advance_requests UPDATE operations MUST go through the SECURITY DEFINER RPCs below.

-- ── Canonical role sets ───────────────────────────────────────────────────────
-- Tier-1 actors: FOM, Supervisor variants, Admin, SuperAdmin, CountryDirector, FinancialAdmin
-- Tier-2 actors: Admin, SuperAdmin, CountryDirector, FinancialAdmin (no FOM/Supervisor)
-- Payment actors: same as Tier-2 actors

-- ── 4. RPC: Tier 1 approval ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION approve_campaign_advance_tier1(
  p_advance_id uuid,
  p_notes      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role    text;
  v_status  text;
  v_t1      text;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = v_user_id;
  IF v_role IS NULL OR v_role NOT IN (
    'fom', 'Field Operation Manager (FOM)', 'fieldOpManager',
    'supervisor', 'Supervisor', 'hubSupervisor', 'HubSupervisor', 'hubsupervisor', 'hub_supervisor',
    'admin', 'Admin', 'super_admin', 'SuperAdmin', 'Super Admin',
    'countryDirector', 'CountryDirector', 'country_director', 'Country Director',
    'financialAdmin', 'financial_admin', 'FinancialAdmin'
  ) THEN
    RAISE EXCEPTION 'permission denied: Tier 1 approval requires FOM, Supervisor, Admin, Super Admin, Country Director, or Financial Admin role'
      USING ERRCODE = '42501';
  END IF;

  SELECT status, tier1_status INTO v_status, v_t1
  FROM advance_requests WHERE id = p_advance_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'advance request % not found', p_advance_id USING ERRCODE = 'P0002';
  END IF;

  IF v_t1 <> 'pending' THEN
    RAISE EXCEPTION 'cannot Tier 1 approve: tier1_status is already % (expected pending)', v_t1;
  END IF;

  IF v_status IN ('rejected', 'paid') THEN
    RAISE EXCEPTION 'cannot approve: advance is already %', v_status;
  END IF;

  UPDATE advance_requests
  SET    tier1_status      = 'approved',
         tier1_approved_by = v_user_id,
         tier1_approved_at = now(),
         tier1_notes       = NULLIF(trim(COALESCE(p_notes, '')), ''),
         status            = 'under_review',
         updated_at        = now()
  WHERE  id = p_advance_id;

  RETURN jsonb_build_object('action', 'tier1_approved');
END;
$$;

GRANT EXECUTE ON FUNCTION approve_campaign_advance_tier1(uuid, text) TO authenticated;

-- ── 5. RPC: Tier 2 approval ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION approve_campaign_advance_tier2(
  p_advance_id uuid,
  p_notes      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role    text;
  v_status  text;
  v_t1      text;
  v_t2      text;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = v_user_id;
  IF v_role IS NULL OR v_role NOT IN (
    'admin', 'Admin', 'super_admin', 'SuperAdmin', 'Super Admin',
    'countryDirector', 'CountryDirector', 'country_director', 'Country Director',
    'financialAdmin', 'financial_admin', 'FinancialAdmin'
  ) THEN
    RAISE EXCEPTION 'permission denied: Tier 2 approval requires Admin, Super Admin, Country Director, or Financial Admin role'
      USING ERRCODE = '42501';
  END IF;

  SELECT status, tier1_status, tier2_status INTO v_status, v_t1, v_t2
  FROM advance_requests WHERE id = p_advance_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'advance request % not found', p_advance_id USING ERRCODE = 'P0002';
  END IF;

  IF v_t1 <> 'approved' THEN
    RAISE EXCEPTION 'cannot approve Tier 2: Tier 1 must be approved first (tier1_status is %)', v_t1;
  END IF;

  IF v_t2 <> 'pending' THEN
    RAISE EXCEPTION 'cannot Tier 2 approve: tier2_status is already % (expected pending)', v_t2;
  END IF;

  IF v_status IN ('rejected', 'paid') THEN
    RAISE EXCEPTION 'cannot approve: advance is already %', v_status;
  END IF;

  -- Enforce independent review: Tier 2 approver must differ from Tier 1 approver.
  -- This prevents a single actor from approving both tiers and bypassing the chain.
  IF (SELECT tier1_approved_by FROM advance_requests WHERE id = p_advance_id) = v_user_id THEN
    RAISE EXCEPTION 'permission denied: the same user cannot approve both Tier 1 and Tier 2'
      USING ERRCODE = '42501';
  END IF;

  UPDATE advance_requests
  SET    tier2_status      = 'approved',
         tier2_approved_by = v_user_id,
         tier2_approved_at = now(),
         tier2_notes       = NULLIF(trim(COALESCE(p_notes, '')), ''),
         status            = 'approved',
         updated_at        = now()
  WHERE  id = p_advance_id;

  RETURN jsonb_build_object('action', 'tier2_approved');
END;
$$;

GRANT EXECUTE ON FUNCTION approve_campaign_advance_tier2(uuid, text) TO authenticated;

-- ── 6. RPC: Reject ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION reject_campaign_advance(
  p_advance_id uuid,
  p_tier       int,
  p_reason     text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role    text;
  v_status  text;
  v_t1      text;
  v_t2      text;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = v_user_id;

  IF p_tier = 1 THEN
    IF v_role IS NULL OR v_role NOT IN (
      'fom', 'Field Operation Manager (FOM)', 'fieldOpManager',
      'supervisor', 'Supervisor', 'hubSupervisor', 'HubSupervisor', 'hubsupervisor', 'hub_supervisor',
      'admin', 'Admin', 'super_admin', 'SuperAdmin', 'Super Admin',
      'countryDirector', 'CountryDirector', 'country_director', 'Country Director',
      'financialAdmin', 'financial_admin', 'FinancialAdmin'
    ) THEN
      RAISE EXCEPTION 'permission denied: Tier 1 rejection requires FOM, Supervisor, Admin, or senior finance role'
        USING ERRCODE = '42501';
    END IF;
  ELSIF p_tier = 2 THEN
    IF v_role IS NULL OR v_role NOT IN (
      'admin', 'Admin', 'super_admin', 'SuperAdmin', 'Super Admin',
      'countryDirector', 'CountryDirector', 'country_director', 'Country Director',
      'financialAdmin', 'financial_admin', 'FinancialAdmin'
    ) THEN
      RAISE EXCEPTION 'permission denied: Tier 2 rejection requires Admin, Super Admin, Country Director, or Financial Admin role'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'p_tier must be 1 or 2';
  END IF;

  SELECT status, tier1_status, tier2_status INTO v_status, v_t1, v_t2
  FROM advance_requests WHERE id = p_advance_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'advance request % not found', p_advance_id USING ERRCODE = 'P0002';
  END IF;

  IF v_status = 'paid' THEN
    RAISE EXCEPTION 'cannot reject a paid advance';
  END IF;

  IF v_status = 'rejected' THEN
    RAISE EXCEPTION 'advance is already rejected';
  END IF;

  IF p_tier = 1 THEN
    -- Tier 1 rejection valid only while tier1 is still pending
    IF v_t1 <> 'pending' THEN
      RAISE EXCEPTION 'cannot reject at Tier 1: tier1_status is % (expected pending)', v_t1;
    END IF;

    UPDATE advance_requests
    SET    tier1_status     = 'rejected',
           tier1_notes      = p_reason,
           rejection_reason = p_reason,
           status           = 'rejected',
           updated_at       = now()
    WHERE  id = p_advance_id;

  ELSE
    -- Tier 2 rejection valid only when tier1 approved and tier2 still pending
    IF v_t1 <> 'approved' THEN
      RAISE EXCEPTION 'cannot reject at Tier 2: Tier 1 must be approved first (tier1_status is %)', v_t1;
    END IF;
    IF v_t2 <> 'pending' THEN
      RAISE EXCEPTION 'cannot reject at Tier 2: tier2_status is % (expected pending)', v_t2;
    END IF;

    UPDATE advance_requests
    SET    tier2_status     = 'rejected',
           tier2_notes      = p_reason,
           rejection_reason = p_reason,
           status           = 'rejected',
           updated_at       = now()
    WHERE  id = p_advance_id;
  END IF;

  RETURN jsonb_build_object('action', 'rejected', 'tier', p_tier);
END;
$$;

GRANT EXECUTE ON FUNCTION reject_campaign_advance(uuid, int, text) TO authenticated;

-- ── 7. RPC: Mark paid ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION mark_campaign_advance_paid(
  p_advance_id   uuid,
  p_paid_amount  numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid    := auth.uid();
  v_role    text;
  v_status  text;
  v_t1      text;
  v_t2      text;
  v_amount  numeric;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = v_user_id;
  IF v_role IS NULL OR v_role NOT IN (
    'admin', 'Admin', 'super_admin', 'SuperAdmin', 'Super Admin',
    'countryDirector', 'CountryDirector', 'country_director', 'Country Director',
    'financialAdmin', 'financial_admin', 'FinancialAdmin'
  ) THEN
    RAISE EXCEPTION 'permission denied: Mark Paid requires Admin, Super Admin, Country Director, or Financial Admin role'
      USING ERRCODE = '42501';
  END IF;

  SELECT status, tier1_status, tier2_status, requested_amount
    INTO v_status, v_t1, v_t2, v_amount
  FROM advance_requests WHERE id = p_advance_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'advance request % not found', p_advance_id USING ERRCODE = 'P0002';
  END IF;

  IF v_status = 'paid' THEN
    RETURN jsonb_build_object('action', 'already_paid');
  END IF;

  IF v_t1 <> 'approved' OR v_t2 <> 'approved' THEN
    RAISE EXCEPTION 'cannot mark paid: both tier approvals required (tier1=%, tier2=%)', v_t1, v_t2;
  END IF;

  IF v_status <> 'approved' THEN
    RAISE EXCEPTION 'cannot mark paid: expected status=approved, got %', v_status;
  END IF;

  UPDATE advance_requests
  SET    status            = 'paid',
         paid_by           = v_user_id,
         paid_at           = now(),
         total_paid_amount = COALESCE(p_paid_amount, v_amount),
         updated_at        = now()
  WHERE  id = p_advance_id;

  RETURN jsonb_build_object('action', 'paid', 'amount', COALESCE(p_paid_amount, v_amount));
END;
$$;

GRANT EXECUTE ON FUNCTION mark_campaign_advance_paid(uuid, numeric) TO authenticated;
