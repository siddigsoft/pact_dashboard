-- These tables had RLS disabled with full grants to anon (the public browser key).

do $$
declare
  t text;
begin
  foreach t in array array[
    'edge_rate_limits', 'fd_forms', 'mmp_incentive_settlements', 'page_access_overrides',
    'payroll_advances', 'payroll_department_budgets', 'payroll_run_items',
    'pre_fund_balance_cache_snapshots', 'pre_fund_event_audit', 'project_documents', 'project_flow_log'
  ] loop
    execute format('revoke all on public.%I from anon', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- edge_rate_limits: service role only (edge functions); no policies.

-- page_access_overrides feeds the access manifest; writes go through toggle_user_tab_access().
create policy pao_read on public.page_access_overrides
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.current_user_is_super_admin()));

create policy payroll_run_items_read on public.payroll_run_items
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.current_user_has_resource_permission('payroll', 'read')));
create policy payroll_advances_read on public.payroll_advances
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.current_user_has_resource_permission('payroll', 'read')));
create policy payroll_dept_budgets_read on public.payroll_department_budgets
  for select to authenticated
  using ((select public.current_user_has_resource_permission('payroll', 'read')));

do $$
declare
  t text;
begin
  foreach t in array array['payroll_run_items', 'payroll_advances', 'payroll_department_budgets'] loop
    execute format($p$create policy payroll_insert on public.%I for insert to authenticated
      with check ((select public.current_user_has_resource_permission('payroll', 'create')))$p$, t);
    execute format($p$create policy payroll_update on public.%I for update to authenticated
      using ((select public.current_user_has_resource_permission('payroll', 'update')))
      with check ((select public.current_user_has_resource_permission('payroll', 'update')))$p$, t);
    execute format($p$create policy payroll_delete on public.%I for delete to authenticated
      using ((select public.current_user_has_resource_permission('payroll', 'delete')))$p$, t);
  end loop;
end $$;

-- Written only by SECURITY DEFINER functions (pay_mmp_incentive / reverse_mmp_incentive).
create policy mmp_incentive_settlements_read on public.mmp_incentive_settlements
  for select to authenticated
  using ((select public.current_user_has_resource_permission('finances', 'read'))
      or (select public.current_user_has_resource_permission('payroll', 'read')));

create policy pf_cache_snapshots_read on public.pre_fund_balance_cache_snapshots
  for select to authenticated
  using ((select public.current_user_has_resource_permission('pre_funding', 'read')));

-- Populated by the SECURITY INVOKER trigger pre_fund_audit_event_change().
create policy pf_event_audit_read on public.pre_fund_event_audit
  for select to authenticated
  using ((select public.current_user_has_resource_permission('pre_funding', 'read')));
create policy pf_event_audit_insert on public.pre_fund_event_audit
  for insert to authenticated with check (true);

-- Project-scoped access for these comes with the projects lockdown.
create policy project_documents_auth on public.project_documents
  for all to authenticated using (true) with check (true);
create policy project_flow_log_auth on public.project_flow_log
  for all to authenticated using (true) with check (true);
create policy fd_forms_auth on public.fd_forms
  for all to authenticated using (true) with check (true);
