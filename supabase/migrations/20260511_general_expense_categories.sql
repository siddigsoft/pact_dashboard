-- =============================================================================
-- General Expense Categories — run ONCE
-- 1. Expands expense_category constraint to cover general staff expenses
-- 2. Adds payment_method + is_general_expense columns
-- 3. Inserts new GL accounts for new categories
-- 4. Updates acct_bridge_ops_cost_account() with full category → GL mapping
-- =============================================================================

-- -----------------------------------------------------------------------------
-- PART A: New columns on operational_cost_submissions
-- -----------------------------------------------------------------------------
ALTER TABLE public.operational_cost_submissions
  ADD COLUMN IF NOT EXISTS is_general_expense boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_method     text
    CHECK (payment_method IS NULL OR payment_method IN (
      'own_cash', 'company_card', 'bank_transfer', 'petty_cash'
    ));

COMMENT ON COLUMN public.operational_cost_submissions.is_general_expense IS
  'TRUE for general staff expenses (meals, travel, supplies…). FALSE for MMP/field-ops costs.';
COMMENT ON COLUMN public.operational_cost_submissions.payment_method IS
  'How the expense was paid: own_cash (reimbursable), company_card, bank_transfer, petty_cash.';

-- -----------------------------------------------------------------------------
-- PART B: Expand the expense_category constraint
-- -----------------------------------------------------------------------------
ALTER TABLE public.operational_cost_submissions
  DROP CONSTRAINT IF EXISTS operational_cost_submissions_expense_category_check;

ALTER TABLE public.operational_cost_submissions
  ADD CONSTRAINT operational_cost_submissions_expense_category_check
  CHECK (expense_category IN (
    -- ── existing field-ops categories (unchanged) ──
    'permits',
    'incentives',
    'communications',
    'training',
    'general_transport',
    'equipment',
    'printing',
    'meetings',
    'other',
    -- ── new general staff expense categories ──
    'meals',               -- DR 5310  Per Diem & Subsistence
    'accommodation',       -- DR 5310  Per Diem & Subsistence
    'fuel',               -- DR 5700  Programme Vehicle & Fuel
    'airfare',             -- DR 5700  Programme Vehicle & Fuel
    'taxi',               -- DR 5700  Programme Vehicle & Fuel
    'supplies',            -- DR 5200  Programme Supplies
    'office_supplies',     -- DR 5200  Programme Supplies
    'professional_development', -- DR 5320  Training & Workshops
    'medical'              -- DR 6150  Staff Medical & Health (new account)
  ));

-- -----------------------------------------------------------------------------
-- PART C: New GL account — 6150 Staff Medical & Health
-- -----------------------------------------------------------------------------
INSERT INTO public.acct_accounts
  (code, name_en, name_ar, account_type, subtype, parent_id, is_postable, country_id)
VALUES
  ('6150',
   'Staff Medical & Health',
   'الرعاية الطبية والصحية للموظفين',
   'expense', 'mng_expense',
   (SELECT id FROM public.acct_accounts WHERE code = '6000' AND country_id IS NULL LIMIT 1),
   true, null)
-- Targets acct_accounts_code_global_uq partial index (code WHERE country_id IS NULL).
-- The old UNIQUE(code) was dropped in 20260511_acct_country_coa_partitioning.sql.
ON CONFLICT (code) WHERE country_id IS NULL DO NOTHING;

-- -----------------------------------------------------------------------------
-- PART D: Update acct_bridge_ops_cost_account() — full category → GL mapping
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.acct_bridge_ops_cost_account(p_category text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE p_category
    -- ── field-ops categories (original) ────────────────────────────────────
    WHEN 'incentives'              THEN '5070'  -- Data Collector Incentives
    WHEN 'communications'          THEN '5800'  -- Programme Communications
    WHEN 'training'                THEN '5320'  -- Training & Workshops
    WHEN 'general_transport'       THEN '5700'  -- Programme Vehicle & Fuel
    WHEN 'equipment'               THEN '5200'  -- Programme Supplies
    WHEN 'printing'                THEN '5200'  -- Programme Supplies
    WHEN 'meetings'                THEN '5320'  -- Training & Workshops
    WHEN 'permits'                 THEN '6310'  -- Legal Fees
    -- ── new general staff expense categories ───────────────────────────────
    WHEN 'meals'                   THEN '5310'  -- Per Diem & Subsistence
    WHEN 'accommodation'           THEN '5310'  -- Per Diem & Subsistence
    WHEN 'fuel'                    THEN '5700'  -- Programme Vehicle & Fuel
    WHEN 'airfare'                 THEN '5700'  -- Programme Vehicle & Fuel
    WHEN 'taxi'                    THEN '5700'  -- Programme Vehicle & Fuel
    WHEN 'supplies'                THEN '5200'  -- Programme Supplies
    WHEN 'office_supplies'         THEN '5200'  -- Programme Supplies
    WHEN 'professional_development' THEN '5320' -- Training & Workshops
    WHEN 'medical'                 THEN '6150'  -- Staff Medical & Health
    -- ── catch-all ──────────────────────────────────────────────────────────
    ELSE                                '5050'  -- Operational Field Costs
  END;
$$;

COMMENT ON FUNCTION public.acct_bridge_ops_cost_account(text) IS
  'Maps operational_cost_submissions.expense_category to a GL account code. '
  'Called by acct_trig_ops_cost_submissions() on status → paid. '
  'Updated by 20260511_general_expense_categories.sql to cover general staff expense types.';

-- -----------------------------------------------------------------------------
-- PART E: Feature flag for general expenses (inherits existing ops cost bridge)
-- No new flag needed — acct.bridge.operational_cost_submissions covers both.
-- This comment is here for documentation purposes only.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- PART F: Smoke-test queries (run after applying to verify)
-- -----------------------------------------------------------------------------
-- SELECT public.acct_bridge_ops_cost_account('meals');           -- expect 5310
-- SELECT public.acct_bridge_ops_cost_account('airfare');         -- expect 5700
-- SELECT public.acct_bridge_ops_cost_account('medical');         -- expect 6150
-- SELECT public.acct_bridge_ops_cost_account('professional_development'); -- expect 5320
-- SELECT public.acct_bridge_ops_cost_account('other');           -- expect 5050
-- SELECT code, name_en FROM public.acct_accounts WHERE code = '6150'; -- expect 1 row
-- SELECT COUNT(*) FROM public.operational_cost_submissions WHERE is_general_expense = true; -- expect 0
