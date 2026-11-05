-- Views without security_invoker run with the owner's rights and bypass RLS on their
-- base tables; all of these were also selectable by anon.

do $$
declare
  v text;
begin
  foreach v in array array[
    'acct_gl_bridge_coverage', 'current_user_classifications', 'dashboard_actions', 'fd_case_summary',
    'fd_form_review_summary', 'pre_fund_source_payment_history_v', 'training_records_v',
    'user_accessible_countries', 'v_acct_gl_bridge_summary', 'v_acct_phase5_coverage',
    'v_acct_phase6_coverage', 'v_acct_phase7_coverage', 'v_acct_phase8_coverage',
    'v_not_covered_recovery_needed', 'v_target_mmp_pre_allocations', 'vw_account_balances'
  ] loop
    execute format('revoke all on public.%I from anon', v);
  end loop;

  -- Views over tables that are now permission-locked must honour the caller's RLS.
  foreach v in array array[
    'acct_gl_bridge_coverage', 'v_acct_gl_bridge_summary', 'v_acct_phase5_coverage',
    'v_acct_phase6_coverage', 'v_acct_phase7_coverage', 'v_acct_phase8_coverage',
    'vw_account_balances', 'pre_fund_source_payment_history_v', 'current_user_classifications'
  ] loop
    execute format('alter view public.%I set (security_invoker = true)', v);
  end loop;
end $$;

revoke all on public.user_classifications from anon;
