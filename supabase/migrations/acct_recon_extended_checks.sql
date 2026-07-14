-- ─────────────────────────────────────────────────────────────────────────────
-- acct_recon_extended_checks.sql
-- Extends acct_recon_subledger_check with three additional sub-ledger checks:
--   4. Operational Cost Submissions (Expense payable vs approved submissions)
--   5. Project Budget Encumbrance (GL encumbrance vs project_budgets.spent_budget_cents)
--   6. Donor Grants Receivable (GL 1300 grants receivable vs acct_grants.award_amount)
--
-- Apply manually:  supabase db push  OR  copy-paste into Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.acct_recon_subledger_check(
  p_check_date date default current_date
) returns table (
  check_name      text,
  gl_balance      numeric(20,2),
  subledger_total numeric(20,2),
  variance        numeric(20,2),
  passed          boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payroll_gl        numeric(20,2);
  v_payroll_src       numeric(20,2);
  v_wallet_gl         numeric(20,2);
  v_wallet_src        numeric(20,2);
  v_advances_gl       numeric(20,2);
  v_advances_src      numeric(20,2);
  -- new checks
  v_opcosts_gl        numeric(20,2);
  v_opcosts_src       numeric(20,2);
  v_proj_budget_gl    numeric(20,2);
  v_proj_budget_src   numeric(20,2);
  v_grants_gl         numeric(20,2);
  v_grants_src        numeric(20,2);
begin

  -- ── 1. Payroll Payable: GL 2200 vs net salary outstanding in approved runs ──
  select coalesce(sum(
    case when jl.debit_credit='CR' then jl.functional_amount
         else -jl.functional_amount end
  ), 0)
  into v_payroll_gl
  from public.acct_journal_lines jl
  join public.acct_accounts a on a.id = jl.account_id
  join public.acct_journal_entries je on je.id = jl.entry_id
  where a.code = '2200'
    and je.status = 'posted'
    and je.posting_date <= p_check_date;

  select coalesce(sum(pri.net_salary), 0)
  into v_payroll_src
  from public.payroll_runs pr
  join public.payroll_run_items pri on pri.run_id = pr.id
  where pr.status = 'approved'
    and pr.approved_at::date <= p_check_date;

  return query select
    'Payroll Payable (2200 GL vs approved run net)'::text,
    v_payroll_gl,
    v_payroll_src,
    v_payroll_gl - v_payroll_src,
    abs(v_payroll_gl - v_payroll_src) <= 1;

  -- ── 2. Staff Wallet Payable: GL 2600 vs pending withdrawal requests ─────────
  select coalesce(sum(
    case when jl.debit_credit='CR' then jl.functional_amount
         else -jl.functional_amount end
  ), 0)
  into v_wallet_gl
  from public.acct_journal_lines jl
  join public.acct_accounts a on a.id = jl.account_id
  join public.acct_journal_entries je on je.id = jl.entry_id
  where a.code = '2600'
    and je.status = 'posted'
    and je.posting_date <= p_check_date;

  select coalesce(sum(wr.amount), 0)
  into v_wallet_src
  from public.withdrawal_requests wr
  where wr.status = 'pending'
    and wr.created_at::date <= p_check_date;

  return query select
    'Staff Wallet Payable (2600 GL vs pending withdrawals)'::text,
    v_wallet_gl,
    v_wallet_src,
    v_wallet_gl - v_wallet_src,
    abs(v_wallet_gl - v_wallet_src) <= 1;

  -- ── 3. Staff Advances: GL 1500+1510 vs disbursed salary advances ────────────
  select coalesce(sum(
    case when jl.debit_credit='DR' then jl.functional_amount
         else -jl.functional_amount end
  ), 0)
  into v_advances_gl
  from public.acct_journal_lines jl
  join public.acct_accounts a on a.id = jl.account_id
  join public.acct_journal_entries je on je.id = jl.entry_id
  where a.code in ('1500','1510')
    and je.status = 'posted'
    and je.posting_date <= p_check_date;

  select coalesce(sum(sa.amount - sa.total_repaid), 0)
  into v_advances_src
  from public.salary_advances sa
  where sa.status in ('disbursed','repaying')
    and sa.disbursed_at::date <= p_check_date;

  return query select
    'Staff Advances (1500+1510 GL vs disbursed advances outstanding)'::text,
    v_advances_gl,
    v_advances_src,
    v_advances_gl - v_advances_src,
    abs(v_advances_gl - v_advances_src) <= 1;

  -- ── 4. Operational Cost Submissions: GL Expense vs approved/paid submissions ─
  -- GL side: net posted debits to account codes starting with 5 (Expenses)
  select coalesce(sum(
    case when jl.debit_credit='DR' then jl.functional_amount
         else -jl.functional_amount end
  ), 0)
  into v_opcosts_gl
  from public.acct_journal_lines jl
  join public.acct_accounts a on a.id = jl.account_id
  join public.acct_journal_entries je on je.id = jl.entry_id
  where a.code like '5%'
    and je.status = 'posted'
    and je.posting_date <= p_check_date
    and je.source_type = 'operational_cost_submissions';

  -- Source: total amount_cents across all fully approved/paid/reconciled submissions
  begin
    select coalesce(sum(ocs.amount_cents), 0) / 100.0
    into v_opcosts_src
    from public.operational_cost_submissions ocs
    where ocs.status in ('approved','paid','reconciled')
      and coalesce(ocs.tier2_approved_at, ocs.tier1_approved_at)::date <= p_check_date;
  exception when undefined_table then
    v_opcosts_src := 0;
  end;

  return query select
    'Operational Costs (GL 5xxx vs approved cost submissions)'::text,
    v_opcosts_gl,
    v_opcosts_src,
    v_opcosts_gl - v_opcosts_src,
    abs(v_opcosts_gl - v_opcosts_src) <= 100;  -- ±100 SDG tolerance for rounding

  -- ── 5. Project Budget Encumbrance: GL 2400 vs project_budgets spent ──────────
  select coalesce(sum(
    case when jl.debit_credit='CR' then jl.functional_amount
         else -jl.functional_amount end
  ), 0)
  into v_proj_budget_gl
  from public.acct_journal_lines jl
  join public.acct_accounts a on a.id = jl.account_id
  join public.acct_journal_entries je on je.id = jl.entry_id
  where a.code = '2400'
    and je.status = 'posted'
    and je.posting_date <= p_check_date;

  begin
    select coalesce(sum(pb.spent_budget_cents), 0) / 100.0
    into v_proj_budget_src
    from public.project_budgets pb
    where pb.created_at::date <= p_check_date;
  exception when undefined_table then
    v_proj_budget_src := 0;
  end;

  return query select
    'Project Encumbrance (2400 GL vs project_budgets.spent_budget_cents)'::text,
    v_proj_budget_gl,
    v_proj_budget_src,
    v_proj_budget_gl - v_proj_budget_src,
    abs(v_proj_budget_gl - v_proj_budget_src) <= 100;

  -- ── 6. Donor Grants Receivable: GL 1300 vs acct_grants.award_amount ──────────
  select coalesce(sum(
    case when jl.debit_credit='DR' then jl.functional_amount
         else -jl.functional_amount end
  ), 0)
  into v_grants_gl
  from public.acct_journal_lines jl
  join public.acct_accounts a on a.id = jl.account_id
  join public.acct_journal_entries je on je.id = jl.entry_id
  where a.code = '1300'
    and je.status = 'posted'
    and je.posting_date <= p_check_date;

  begin
    select coalesce(sum(g.award_amount), 0)
    into v_grants_src
    from public.acct_grants g
    where g.status not in ('closed','cancelled')
      and g.start_date <= p_check_date;
  exception when undefined_table then
    v_grants_src := 0;
  end;

  return query select
    'Donor Grants Receivable (1300 GL vs active acct_grants.award_amount)'::text,
    v_grants_gl,
    v_grants_src,
    v_grants_gl - v_grants_src,
    abs(v_grants_gl - v_grants_src) <= 1;

end $$;

comment on function public.acct_recon_subledger_check(date) is
  'Sub-ledger reconciliation: 6 checks covering Payroll (2200), Staff Wallet (2600), '
  'Salary Advances (1500+1510), Operational Cost Submissions (5xxx), '
  'Project Encumbrance (2400), and Donor Grants Receivable (1300). '
  'All tolerances ≤1 SDG except cost submissions/project encumbrance (≤100 SDG for rounding). '
  'Run: SELECT * FROM public.acct_recon_subledger_check();';

grant execute on function public.acct_recon_subledger_check(date) to authenticated;
grant execute on function public.acct_recon_subledger_check(date) to service_role;
