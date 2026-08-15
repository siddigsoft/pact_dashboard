-- =============================================================================
-- Migration: Incentive Bonus System — Database Foundation
-- Date: 2026-08-15
-- Run in: Supabase Studio → SQL Editor
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE / ON CONFLICT DO NOTHING
--
-- Creates three tables:
--   1. incentive_configs        — bonus percentages, role toggles, hub overrides
--   2. mmp_incentive_snapshots  — one row per MMP, lifecycle status, locked config
--   3. mmp_incentive_payments   — one row per person per MMP, amounts, payment info
--
-- RLS:
--   Admin / SuperAdmin          — full CRUD on all three tables
--   Coordinator / Supervisor    — SELECT own rows on mmp_incentive_payments
--   FinancialAdmin              — SELECT all payments + restricted UPDATE
--                                 (payment_method, payroll_period, paid_by,
--                                  paid_at, status only — enforced by trigger)
-- =============================================================================


-- =============================================================================
-- 1. INCENTIVE_CONFIGS
--    Global defaults (hub_id IS NULL) + per-hub overrides (hub_id IS NOT NULL)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.incentive_configs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- NULL = global default; non-null = per-hub override
  hub_id                text REFERENCES public.hubs(id) ON DELETE CASCADE,

  -- Field staff role this row configures
  role                  text NOT NULL,
    -- coordinator | supervisor | datacollector | fom | teamleader

  -- Toggle: whether this role receives bonus payments in this hub (or globally)
  is_active             boolean NOT NULL DEFAULT false,

  -- Percentage of total DC enumerator_fee pool paid as bonus (e.g. 10.00 = 10%)
  bonus_pct             numeric(5,2) NOT NULL DEFAULT 0,

  -- How to split the pool when multiple people share the same state/hub
  split_method          text NOT NULL DEFAULT 'proportional'
                          CHECK (split_method IN ('proportional', 'equal')),

  -- Minimum WFP-confirmed coverage % required before calculation unlocks
  coverage_threshold_pct numeric(5,2) NOT NULL DEFAULT 70,

  -- What site entries count toward the fee pool
  what_counts           text NOT NULL DEFAULT 'wfp_confirmed'
                          CHECK (what_counts IN ('wfp_confirmed', 'submitted')),

  created_by            uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  -- One global row per role (hub_id NULL); one override per hub+role pair
  UNIQUE NULLS NOT DISTINCT (hub_id, role)
);

CREATE INDEX IF NOT EXISTS idx_incentive_configs_hub    ON public.incentive_configs(hub_id);
CREATE INDEX IF NOT EXISTS idx_incentive_configs_role   ON public.incentive_configs(role);
CREATE INDEX IF NOT EXISTS idx_incentive_configs_active ON public.incentive_configs(is_active);

CREATE OR REPLACE FUNCTION public.update_incentive_configs_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_incentive_configs_updated_at ON public.incentive_configs;
CREATE TRIGGER trg_incentive_configs_updated_at
  BEFORE UPDATE ON public.incentive_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_incentive_configs_updated_at();

-- Default global rows (one per role, hub_id = NULL)
INSERT INTO public.incentive_configs
  (hub_id, role, is_active, bonus_pct, split_method, coverage_threshold_pct, what_counts)
VALUES
  (NULL, 'coordinator',   true,  10.00, 'proportional', 70, 'wfp_confirmed'),
  (NULL, 'supervisor',    true,   7.00, 'equal',         70, 'wfp_confirmed'),
  (NULL, 'datacollector', false,  0.00, 'proportional',  70, 'wfp_confirmed'),
  (NULL, 'fom',           false,  5.00, 'equal',         70, 'wfp_confirmed'),
  (NULL, 'teamleader',    false,  0.00, 'proportional',  70, 'wfp_confirmed')
ON CONFLICT (hub_id, role) DO NOTHING;


-- =============================================================================
-- 2. MMP_INCENTIVE_SNAPSHOTS
--    One row per MMP. Stores the lifecycle status and, at pre-approval time,
--    a frozen JSON copy of the incentive_configs rows used for calculation.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.mmp_incentive_snapshots (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- FK to mmp_files.id (uuid PK). CASCADE so orphan lifecycles cannot exist.
  mmp_id                  uuid NOT NULL REFERENCES public.mmp_files(id) ON DELETE CASCADE,

  -- Lifecycle: calculating → pre_approved → approved → paid
  status                  text NOT NULL DEFAULT 'calculating'
                            CHECK (status IN ('calculating','pre_approved','approved','paid')),

  -- Running totals (updated live while calculating, frozen at pre-approval)
  total_dc_fee_pool_cents bigint NOT NULL DEFAULT 0,
  total_bonus_cents       bigint NOT NULL DEFAULT 0,

  -- Frozen copy of incentive_configs rows at pre-approval time.
  -- Stored so future config changes do not alter already-approved amounts.
  config_snapshot         jsonb,

  -- Pre-approval audit
  pre_approved_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  pre_approved_at         timestamptz,

  -- Auto-set when cycle closes
  approved_at             timestamptz,
  locked_at               timestamptz,

  -- When admin intentionally closes MMP without processing incentives
  skipped                 boolean NOT NULL DEFAULT false,
  skipped_reason          text,

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  UNIQUE (mmp_id)   -- exactly one snapshot per MMP
);

CREATE INDEX IF NOT EXISTS idx_mmp_incentive_snapshots_mmp_id ON public.mmp_incentive_snapshots(mmp_id);
CREATE INDEX IF NOT EXISTS idx_mmp_incentive_snapshots_status ON public.mmp_incentive_snapshots(status);

CREATE OR REPLACE FUNCTION public.update_mmp_incentive_snapshots_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_mmp_incentive_snapshots_updated_at ON public.mmp_incentive_snapshots;
CREATE TRIGGER trg_mmp_incentive_snapshots_updated_at
  BEFORE UPDATE ON public.mmp_incentive_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.update_mmp_incentive_snapshots_updated_at();


-- =============================================================================
-- 3. MMP_INCENTIVE_PAYMENTS
--    One row per person per MMP (and per hub when supervisor covers multiple hubs).
--    Column-level write protection for finance is enforced via the
--    restrict_incentive_payment_finance_columns trigger below.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.mmp_incentive_payments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  snapshot_id         uuid NOT NULL
                        REFERENCES public.mmp_incentive_snapshots(id) ON DELETE CASCADE,

  -- Denormalized for query convenience (avoids joining through snapshot)
  mmp_id              uuid NOT NULL REFERENCES public.mmp_files(id) ON DELETE CASCADE,

  -- The person receiving the bonus
  user_id             uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Their role at the time of pre-approval (snapshotted — not live)
  role                text NOT NULL,   -- coordinator | supervisor | fom | ...

  -- Geographic scope used for this payment row
  state_id            text,            -- populated for coordinators
  hub_id              text,            -- populated for supervisors
  hub_name            text,            -- human-readable hub name

  -- Calculation inputs (all from mmp_site_entries.enumerator_fee)
  dc_count            integer NOT NULL DEFAULT 0,
  dc_fee_pool_cents   bigint  NOT NULL DEFAULT 0,

  -- Calculation output
  bonus_pct           numeric(5,2) NOT NULL DEFAULT 0,
  bonus_amount_cents  bigint NOT NULL DEFAULT 0,
  currency            text NOT NULL DEFAULT 'SDG',

  -- Exclusion (admin can exclude a specific person before pre-approval)
  excluded            boolean NOT NULL DEFAULT false,
  exclusion_note      text,

  -- Payment details — these are the ONLY columns finance may update
  payment_method      text CHECK (payment_method IN ('wallet', 'payroll')),
  payroll_period      text,   -- e.g. "October 2026"
  paid_by             uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  paid_at             timestamptz,

  -- Row lifecycle
  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'paid')),

  -- Idempotency: used as the key when calling credit_retainer_wallet RPC
  -- or when inserting a payroll_run_items row to prevent double-payment.
  -- Auto-populated by trigger after insert.
  idempotency_key     text UNIQUE,   -- format: mmp_incentive_payment:<id>

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mmp_incentive_payments_snapshot ON public.mmp_incentive_payments(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_mmp_incentive_payments_mmp     ON public.mmp_incentive_payments(mmp_id);
CREATE INDEX IF NOT EXISTS idx_mmp_incentive_payments_user    ON public.mmp_incentive_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_mmp_incentive_payments_status  ON public.mmp_incentive_payments(status);
CREATE INDEX IF NOT EXISTS idx_mmp_incentive_payments_idkey   ON public.mmp_incentive_payments(idempotency_key);

-- Auto-populate idempotency_key from the row id after insert
CREATE OR REPLACE FUNCTION public.set_incentive_payment_idempotency_key()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.idempotency_key IS NULL THEN
    NEW.idempotency_key := 'mmp_incentive_payment:' || NEW.id::text;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_mmp_incentive_payment_idkey ON public.mmp_incentive_payments;
CREATE TRIGGER trg_mmp_incentive_payment_idkey
  BEFORE INSERT ON public.mmp_incentive_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_incentive_payment_idempotency_key();

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_mmp_incentive_payments_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_mmp_incentive_payments_updated_at ON public.mmp_incentive_payments;
CREATE TRIGGER trg_mmp_incentive_payments_updated_at
  BEFORE UPDATE ON public.mmp_incentive_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_mmp_incentive_payments_updated_at();

-- =============================================================================
-- COLUMN-LEVEL PROTECTION FOR FINANCE UPDATES
--
-- RLS grants finance the right to UPDATE rows. This trigger enforces WHICH
-- columns they may change. Finance may only modify:
--   payment_method, payroll_period, paid_by, paid_at, status
-- All other columns are reset to their OLD values for non-admin callers.
-- Admins and SuperAdmins bypass this restriction.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.restrict_incentive_payment_finance_columns()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_caller_role text;
BEGIN
  -- Identify the calling user's role
  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = auth.uid();

  -- Admins / SuperAdmins may update any column — pass through unchanged
  IF v_caller_role IN ('superAdmin', 'admin') THEN
    RETURN NEW;
  END IF;

  -- For all other roles (including financialAdmin), enforce column restrictions:
  -- reset every non-payment column back to its old value so only the
  -- payment fields (payment_method, payroll_period, paid_by, paid_at, status)
  -- can be changed via a direct UPDATE statement.
  NEW.snapshot_id        := OLD.snapshot_id;
  NEW.mmp_id             := OLD.mmp_id;
  NEW.user_id            := OLD.user_id;
  NEW.role               := OLD.role;
  NEW.state_id           := OLD.state_id;
  NEW.hub_id             := OLD.hub_id;
  NEW.hub_name           := OLD.hub_name;
  NEW.dc_count           := OLD.dc_count;
  NEW.dc_fee_pool_cents  := OLD.dc_fee_pool_cents;
  NEW.bonus_pct          := OLD.bonus_pct;
  NEW.bonus_amount_cents := OLD.bonus_amount_cents;
  NEW.currency           := OLD.currency;
  NEW.excluded           := OLD.excluded;
  NEW.exclusion_note     := OLD.exclusion_note;
  NEW.idempotency_key    := OLD.idempotency_key;
  NEW.created_at         := OLD.created_at;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_restrict_incentive_payment_cols ON public.mmp_incentive_payments;
CREATE TRIGGER trg_restrict_incentive_payment_cols
  BEFORE UPDATE ON public.mmp_incentive_payments
  FOR EACH ROW EXECUTE FUNCTION public.restrict_incentive_payment_finance_columns();


-- =============================================================================
-- 4. ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.incentive_configs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mmp_incentive_snapshots   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mmp_incentive_payments    ENABLE ROW LEVEL SECURITY;

-- Helper: true when calling user is admin or superAdmin
CREATE OR REPLACE FUNCTION public.incentive_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('superAdmin', 'admin')
  );
$$;

-- Helper: true when calling user is financialAdmin, admin, or superAdmin
CREATE OR REPLACE FUNCTION public.incentive_is_finance_or_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('superAdmin', 'admin', 'financialAdmin')
  );
$$;

-- ── incentive_configs policies ─────────────────────────────────────────────

DROP POLICY IF EXISTS "incentive_configs_select_all"   ON public.incentive_configs;
DROP POLICY IF EXISTS "incentive_configs_insert_admin" ON public.incentive_configs;
DROP POLICY IF EXISTS "incentive_configs_update_admin" ON public.incentive_configs;
DROP POLICY IF EXISTS "incentive_configs_delete_admin" ON public.incentive_configs;

-- All authenticated users may read configs (needed for coverage threshold display)
CREATE POLICY "incentive_configs_select_all"
  ON public.incentive_configs FOR SELECT USING (true);

CREATE POLICY "incentive_configs_insert_admin"
  ON public.incentive_configs FOR INSERT
  WITH CHECK (public.incentive_is_admin());

CREATE POLICY "incentive_configs_update_admin"
  ON public.incentive_configs FOR UPDATE
  USING (public.incentive_is_admin())
  WITH CHECK (public.incentive_is_admin());

CREATE POLICY "incentive_configs_delete_admin"
  ON public.incentive_configs FOR DELETE
  USING (public.incentive_is_admin());

-- ── mmp_incentive_snapshots policies ──────────────────────────────────────

DROP POLICY IF EXISTS "snapshots_select_finance"  ON public.mmp_incentive_snapshots;
DROP POLICY IF EXISTS "snapshots_insert_admin"    ON public.mmp_incentive_snapshots;
DROP POLICY IF EXISTS "snapshots_update_admin"    ON public.mmp_incentive_snapshots;
DROP POLICY IF EXISTS "snapshots_delete_admin"    ON public.mmp_incentive_snapshots;

-- Finance and admin may read snapshots
CREATE POLICY "snapshots_select_finance"
  ON public.mmp_incentive_snapshots FOR SELECT
  USING (public.incentive_is_finance_or_admin());

-- Only admin may insert/update/delete snapshot rows
CREATE POLICY "snapshots_insert_admin"
  ON public.mmp_incentive_snapshots FOR INSERT
  WITH CHECK (public.incentive_is_admin());

CREATE POLICY "snapshots_update_admin"
  ON public.mmp_incentive_snapshots FOR UPDATE
  USING (public.incentive_is_admin())
  WITH CHECK (public.incentive_is_admin());

CREATE POLICY "snapshots_delete_admin"
  ON public.mmp_incentive_snapshots FOR DELETE
  USING (public.incentive_is_admin());

-- ── mmp_incentive_payments policies ───────────────────────────────────────

DROP POLICY IF EXISTS "payments_select_own_or_finance"  ON public.mmp_incentive_payments;
DROP POLICY IF EXISTS "payments_insert_admin"           ON public.mmp_incentive_payments;
DROP POLICY IF EXISTS "payments_update_finance"         ON public.mmp_incentive_payments;
DROP POLICY IF EXISTS "payments_delete_admin"           ON public.mmp_incentive_payments;

-- Coordinator/Supervisor see their own rows; finance/admin see all
CREATE POLICY "payments_select_own_or_finance"
  ON public.mmp_incentive_payments FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.incentive_is_finance_or_admin()
  );

-- Only admin may insert new payment rows
CREATE POLICY "payments_insert_admin"
  ON public.mmp_incentive_payments FOR INSERT
  WITH CHECK (public.incentive_is_admin());

-- Finance may UPDATE rows — column restrictions enforced by trigger above.
-- The trigger resets all non-payment columns to OLD for non-admin callers,
-- so finance can only effectively change: payment_method, payroll_period,
-- paid_by, paid_at, status.
CREATE POLICY "payments_update_finance"
  ON public.mmp_incentive_payments FOR UPDATE
  USING (public.incentive_is_finance_or_admin())
  WITH CHECK (public.incentive_is_finance_or_admin());

CREATE POLICY "payments_delete_admin"
  ON public.mmp_incentive_payments FOR DELETE
  USING (public.incentive_is_admin());


-- =============================================================================
-- 5. COMMENTS
-- =============================================================================

COMMENT ON TABLE public.incentive_configs IS
  'Configures incentive bonus rules per role. hub_id NULL = global default; '
  'non-null = per-hub override. All three incentive tables form the foundation '
  'for the MMP incentive bonus system.';

COMMENT ON TABLE public.mmp_incentive_snapshots IS
  'One row per MMP (enforced by UNIQUE + FK with ON DELETE CASCADE). '
  'Tracks the incentive lifecycle: calculating → pre_approved → approved → paid. '
  'config_snapshot is a frozen JSONB copy of incentive_configs at pre-approval '
  'time so subsequent config changes do not alter already-approved amounts.';

COMMENT ON TABLE public.mmp_incentive_payments IS
  'One row per person per MMP (supervisors with multiple hubs get one row per hub). '
  'idempotency_key (auto-set by trigger) prevents double-payment when calling '
  'credit_retainer_wallet RPC or inserting payroll_run_items. '
  'Column-level write protection for financialAdmin is enforced by the '
  'restrict_incentive_payment_finance_columns trigger — finance may only change '
  'payment_method, payroll_period, paid_by, paid_at, and status.';

COMMENT ON FUNCTION public.restrict_incentive_payment_finance_columns IS
  'Enforces column-level write protection on mmp_incentive_payments. '
  'Non-admin callers (including financialAdmin) can only modify payment fields. '
  'Calculation fields, recipient linkage, and idempotency_key are reset to OLD.';

-- =============================================================================
-- MIGRATION COMPLETE
-- Tables: incentive_configs, mmp_incentive_snapshots, mmp_incentive_payments
-- Seed:   global configs for coordinator (10%), supervisor (7%),
--         datacollector/fom/teamleader (inactive, 0%)
-- =============================================================================
