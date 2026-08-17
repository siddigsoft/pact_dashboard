-- =============================================================================
-- Recon Check: Field Advances + Operational Cost Posting Gaps
-- Date: 2026-08-21
--
-- Extends acct_recon_subledger_check with two new bridge-specific checks.
-- Rebased on the 6-digit COA version from acct_coa_standardize_6digit.sql
-- (checks 1-6 are identical to that migration; only checks 7 and 8 are new).
--
-- New checks (CURRENT-STATE only — see note below):
--   7. Field Advance Payments — bridge posted vs total paid (DR 151000)
--      GL side  : SUM(DR lines) on posted entries WHERE source_type='down_payment_requests'
--      Src side : SUM(total_paid_amount) WHERE status IN ('partially_paid','fully_paid')
--      Tolerance: ±1 SDG
--
--   8. Operational Cost Payments — bridge posted vs paid submissions (DR 5xxxxx)
--      GL side  : SUM(DR lines) on posted entries WHERE source_type='operational_cost_submissions'
--      Src side : SUM(COALESCE(paid_amount_cents, amount_cents))/100
--                 WHERE status='paid'
--      Tolerance: ±100 SDG (cent-rounding allowance)
--
-- Why current-state (no p_check_date filter) for checks 7 and 8?
--   Field advance payments are cumulative on the source record: total_paid_amount
--   grows with each installment but updated_at reflects only the latest update,
--   making historical reconstruction by date unreliable (a record updated on
--   day 10 carries its full cumulative total even when checked for day 5).
--   Operational costs have a similar mismatch: the bridge posts using expense_date
--   while the source records have paid_at/updated_at, so filtering by p_check_date
--   produces false variances for backdated expenses. These two checks are therefore
--   always current-state gap detectors, clearly labelled in check_name.
--   Checks 1–6 are unchanged and continue to honour p_check_date normally.
--
-- Why source_type rather than event_type for GL filter?
--   Event type names changed in migration 20260820_installment_gl_posting.sql
--   (down_payment_fully_paid → installment_payment / installment_retroactive).
--   source_type is stable across any future event renames.
--
-- Amount logic for check 8:
--   The bridge posts COALESCE(paid_amount_cents, amount_cents)/100. The source
--   query mirrors this exactly so settled amounts that differ from the original
--   request do not produce false variances.
--
-- Safe to re-run: CREATE OR REPLACE FUNCTION.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.acct_recon_subledger_check(
  p_check_date date DEFAULT current_date
) RETURNS TABLE (
  check_name       text,
  gl_balance       numeric(20,2),
  subledger_total  numeric(20,2),
  variance         numeric(20,2),
  passed           boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payroll_gl      numeric(20,2); v_payroll_src      numeric(20,2);
  v_wallet_gl       numeric(20,2); v_wallet_src       numeric(20,2);
  v_advances_gl     numeric(20,2); v_advances_src     numeric(20,2);
  v_opcosts_gl      numeric(20,2); v_opcosts_src      numeric(20,2);
  v_proj_budget_gl  numeric(20,2); v_proj_budget_src  numeric(20,2);
  v_grants_gl       numeric(20,2); v_grants_src       numeric(20,2);
  -- new in this migration (current-state; ignore p_check_date)
  v_dp_bridge_gl    numeric(20,2); v_dp_bridge_src    numeric(20,2);
  v_ocs_bridge_gl   numeric(20,2); v_ocs_bridge_src   numeric(20,2);
BEGIN

  -- ── 1. Payroll Payable: GL 220001 vs net salary outstanding ─────────────────
  SELECT coalesce(sum(CASE WHEN jl.debit_credit='CR' THEN jl.functional_amount
                           ELSE -jl.functional_amount END), 0)
    INTO v_payroll_gl
    FROM public.acct_journal_lines jl
    JOIN public.acct_accounts a      ON a.id = jl.account_id
    JOIN public.acct_journal_entries je ON je.id = jl.entry_id
   WHERE a.code = '220001' AND je.status = 'posted' AND je.posting_date <= p_check_date;

  SELECT coalesce(sum(pri.net_salary), 0) INTO v_payroll_src
    FROM public.payroll_runs pr
    JOIN public.payroll_run_items pri ON pri.run_id = pr.id
   WHERE pr.status = 'approved' AND pr.approved_at::date <= p_check_date;

  RETURN QUERY SELECT 'Payroll Payable (220001 GL vs approved run net)'::text,
    v_payroll_gl, v_payroll_src, v_payroll_gl - v_payroll_src,
    abs(v_payroll_gl - v_payroll_src) <= 1;

  -- ── 2. Staff Wallet Payable: GL 260000 vs pending withdrawal requests ────────
  SELECT coalesce(sum(CASE WHEN jl.debit_credit='CR' THEN jl.functional_amount
                           ELSE -jl.functional_amount END), 0)
    INTO v_wallet_gl
    FROM public.acct_journal_lines jl
    JOIN public.acct_accounts a      ON a.id = jl.account_id
    JOIN public.acct_journal_entries je ON je.id = jl.entry_id
   WHERE a.code = '260000' AND je.status = 'posted' AND je.posting_date <= p_check_date;

  SELECT coalesce(sum(wr.amount), 0) INTO v_wallet_src
    FROM public.withdrawal_requests wr
   WHERE wr.status = 'pending' AND wr.created_at::date <= p_check_date;

  RETURN QUERY SELECT 'Staff Wallet Payable (260000 GL vs pending withdrawals)'::text,
    v_wallet_gl, v_wallet_src, v_wallet_gl - v_wallet_src,
    abs(v_wallet_gl - v_wallet_src) <= 1;

  -- ── 3. Staff Advances: GL 150000+151000 vs disbursed salary advances ─────────
  SELECT coalesce(sum(CASE WHEN jl.debit_credit='DR' THEN jl.functional_amount
                           ELSE -jl.functional_amount END), 0)
    INTO v_advances_gl
    FROM public.acct_journal_lines jl
    JOIN public.acct_accounts a      ON a.id = jl.account_id
    JOIN public.acct_journal_entries je ON je.id = jl.entry_id
   WHERE a.code IN ('150000','151000') AND je.status = 'posted'
     AND je.posting_date <= p_check_date;

  SELECT coalesce(sum(sa.amount - sa.total_repaid), 0) INTO v_advances_src
    FROM public.salary_advances sa
   WHERE sa.status IN ('disbursed','repaying') AND sa.disbursed_at::date <= p_check_date;

  RETURN QUERY SELECT 'Staff Advances (150000+151000 GL vs disbursed advances outstanding)'::text,
    v_advances_gl, v_advances_src, v_advances_gl - v_advances_src,
    abs(v_advances_gl - v_advances_src) <= 1;

  -- ── 4. Operational Costs: GL 5xxxxx vs approved submissions ─────────────────
  SELECT coalesce(sum(CASE WHEN jl.debit_credit='DR' THEN jl.functional_amount
                           ELSE -jl.functional_amount END), 0)
    INTO v_opcosts_gl
    FROM public.acct_journal_lines jl
    JOIN public.acct_accounts a      ON a.id = jl.account_id
    JOIN public.acct_journal_entries je ON je.id = jl.entry_id
   WHERE a.code LIKE '5%' AND je.status = 'posted' AND je.posting_date <= p_check_date
     AND je.source_type = 'operational_cost_submissions';

  BEGIN
    SELECT coalesce(sum(ocs.amount_cents), 0) / 100.0 INTO v_opcosts_src
      FROM public.operational_cost_submissions ocs
     WHERE ocs.status IN ('approved','paid','reconciled')
       AND coalesce(ocs.tier2_approved_at, ocs.tier1_approved_at)::date <= p_check_date;
  EXCEPTION WHEN undefined_table THEN v_opcosts_src := 0;
  END;

  RETURN QUERY SELECT 'Operational Costs (GL 5xxxxx vs approved cost submissions)'::text,
    v_opcosts_gl, v_opcosts_src, v_opcosts_gl - v_opcosts_src,
    abs(v_opcosts_gl - v_opcosts_src) <= 100;

  -- ── 5. Project Encumbrance: GL 240000 vs project_budgets.spent_budget_cents ──
  SELECT coalesce(sum(CASE WHEN jl.debit_credit='CR' THEN jl.functional_amount
                           ELSE -jl.functional_amount END), 0)
    INTO v_proj_budget_gl
    FROM public.acct_journal_lines jl
    JOIN public.acct_accounts a      ON a.id = jl.account_id
    JOIN public.acct_journal_entries je ON je.id = jl.entry_id
   WHERE a.code = '240000' AND je.status = 'posted' AND je.posting_date <= p_check_date;

  BEGIN
    SELECT coalesce(sum(pb.spent_budget_cents), 0) / 100.0 INTO v_proj_budget_src
      FROM public.project_budgets pb WHERE pb.created_at::date <= p_check_date;
  EXCEPTION WHEN undefined_table THEN v_proj_budget_src := 0;
  END;

  RETURN QUERY SELECT 'Project Encumbrance (240000 GL vs project_budgets.spent_budget_cents)'::text,
    v_proj_budget_gl, v_proj_budget_src, v_proj_budget_gl - v_proj_budget_src,
    abs(v_proj_budget_gl - v_proj_budget_src) <= 100;

  -- ── 6. Donor Grants Receivable: GL 130000 vs acct_grants.award_amount ────────
  SELECT coalesce(sum(CASE WHEN jl.debit_credit='DR' THEN jl.functional_amount
                           ELSE -jl.functional_amount END), 0)
    INTO v_grants_gl
    FROM public.acct_journal_lines jl
    JOIN public.acct_accounts a      ON a.id = jl.account_id
    JOIN public.acct_journal_entries je ON je.id = jl.entry_id
   WHERE a.code = '130000' AND je.status = 'posted' AND je.posting_date <= p_check_date;

  BEGIN
    SELECT coalesce(sum(g.award_amount), 0) INTO v_grants_src
      FROM public.acct_grants g
     WHERE g.status NOT IN ('closed','cancelled') AND g.start_date <= p_check_date;
  EXCEPTION WHEN undefined_table THEN v_grants_src := 0;
  END;

  RETURN QUERY SELECT 'Donor Grants Receivable (130000 GL vs active acct_grants.award_amount)'::text,
    v_grants_gl, v_grants_src, v_grants_gl - v_grants_src,
    abs(v_grants_gl - v_grants_src) <= 1;

  -- ── 7. Field Advance Payments — bridge posted vs total paid (current state) ───
  -- CURRENT-STATE ONLY: p_check_date is intentionally not applied here.
  -- total_paid_amount is a running cumulative total updated in place on each
  -- installment; filtering source by updated_at::date produces false mismatches
  -- for past dates (the record carries its full cumulative total, while the GL
  -- may have only partial postings up to that date).
  -- Both sides are therefore compared as of "right now" to give Finance a reliable
  -- gap indicator regardless of the check-date picker.
  SELECT coalesce(sum(jl.functional_amount), 0)
    INTO v_dp_bridge_gl
    FROM public.acct_journal_lines jl
    JOIN public.acct_journal_entries je ON je.id = jl.entry_id
   WHERE je.source_type  = 'down_payment_requests'
     AND je.status       = 'posted'
     AND jl.debit_credit = 'DR';

  BEGIN
    SELECT coalesce(sum(dpr.total_paid_amount), 0)
      INTO v_dp_bridge_src
      FROM public.down_payment_requests dpr
     WHERE dpr.status IN ('partially_paid', 'fully_paid')
       AND coalesce(dpr.total_paid_amount, 0) > 0;
  EXCEPTION WHEN undefined_table THEN v_dp_bridge_src := 0;
  END;

  RETURN QUERY SELECT
    'Field Advance Payments — bridge posted vs total paid, current state (DR 151000)'::text,
    v_dp_bridge_gl, v_dp_bridge_src,
    v_dp_bridge_gl - v_dp_bridge_src,
    abs(v_dp_bridge_gl - v_dp_bridge_src) <= 1;

  -- ── 8. Operational Cost Payments — bridge posted vs paid (current state) ──────
  -- CURRENT-STATE ONLY: p_check_date is intentionally not applied here.
  -- The bridge posts using expense_date for the journal posting_date, while the
  -- source record has paid_at/updated_at; applying p_check_date to one but not
  -- the other creates false variances for backdated expenses.
  -- Amount: mirrors bridge logic exactly — COALESCE(paid_amount_cents, amount_cents)/100
  -- so submissions where the settled amount differs from the request do not cause
  -- false variances (distinct from check 4 which uses amount_cents and covers
  -- all approved/reconciled statuses).
  SELECT coalesce(sum(jl.functional_amount), 0)
    INTO v_ocs_bridge_gl
    FROM public.acct_journal_lines jl
    JOIN public.acct_journal_entries je ON je.id = jl.entry_id
   WHERE je.source_type  = 'operational_cost_submissions'
     AND je.status       = 'posted'
     AND jl.debit_credit = 'DR';

  BEGIN
    SELECT coalesce(sum(coalesce(ocs.paid_amount_cents, ocs.amount_cents)), 0) / 100.0
      INTO v_ocs_bridge_src
      FROM public.operational_cost_submissions ocs
     WHERE ocs.status = 'paid';
  EXCEPTION WHEN undefined_table THEN v_ocs_bridge_src := 0;
  END;

  RETURN QUERY SELECT
    'Operational Cost Payments — bridge posted vs paid, current state (DR 5xxxxx)'::text,
    v_ocs_bridge_gl, v_ocs_bridge_src,
    v_ocs_bridge_gl - v_ocs_bridge_src,
    abs(v_ocs_bridge_gl - v_ocs_bridge_src) <= 100;

END;
$$;

COMMENT ON FUNCTION public.acct_recon_subledger_check(date) IS
  'Sub-ledger reconciliation: 8 checks. '
  'Checks 1-6 honour p_check_date: '
  '1. Payroll Payable (220001) ±1 SDG. '
  '2. Staff Wallet (260000) ±1 SDG. '
  '3. Salary Advances (150000+151000) ±1 SDG. '
  '4. Operational Costs GL 5xxxxx vs approved/paid ±100 SDG. '
  '5. Project Encumbrance (240000) ±100 SDG. '
  '6. Donor Grants (130000) ±1 SDG. '
  'Checks 7-8 are always current-state (p_check_date ignored — '
  'source data cannot be reliably reconstructed for a past date): '
  '7. Field Advance Payments bridge posted vs total paid ±1 SDG. '
  '8. Operational Cost Payments bridge posted vs paid ±100 SDG. '
  'Run: SELECT * FROM public.acct_recon_subledger_check();';

GRANT EXECUTE ON FUNCTION public.acct_recon_subledger_check(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.acct_recon_subledger_check(date) TO service_role;
