-- Close the "any authenticated user can do anything" policies on pre-funding
-- tables. Org-wide access stays with finance roles and explicit pre_funding:read
-- grants; fund holders keep access to their own fund's rows.

drop policy if exists pfa_finance_all on public.pre_fund_allocations;
drop policy if exists pfr_finance_all on public.pre_fund_reconciliations;
drop policy if exists pft_finance_all on public.pre_fund_transactions;
drop policy if exists pfs_finance_all on public.pre_fund_settings;

create policy pf_alloc_holder_all on public.pre_fund_allocations
  for all to authenticated
  using (pre_fund_request_id in (select id from public.pre_fund_requests where holder_user_id = (select auth.uid())))
  with check (pre_fund_request_id in (select id from public.pre_fund_requests where holder_user_id = (select auth.uid())));

create policy pf_recon_holder_select on public.pre_fund_reconciliations
  for select to authenticated
  using (pre_fund_request_id in (select id from public.pre_fund_requests where holder_user_id = (select auth.uid())));

create policy pf_recon_holder_update on public.pre_fund_reconciliations
  for update to authenticated
  using (pre_fund_request_id in (select id from public.pre_fund_requests where holder_user_id = (select auth.uid())))
  with check (pre_fund_request_id in (select id from public.pre_fund_requests where holder_user_id = (select auth.uid())));

create policy pf_txn_holder_select on public.pre_fund_transactions
  for select to authenticated
  using (pre_fund_request_id in (select id from public.pre_fund_requests where holder_user_id = (select auth.uid())));

create policy pf_txn_holder_update on public.pre_fund_transactions
  for update to authenticated
  using (pre_fund_request_id in (select id from public.pre_fund_requests where holder_user_id = (select auth.uid())))
  with check (pre_fund_request_id in (select id from public.pre_fund_requests where holder_user_id = (select auth.uid())));

create policy pf_settings_read on public.pre_fund_settings
  for select to authenticated using (true);

-- Vote visibility used user-editable JWT user_metadata for the finance check.
drop policy if exists pf_step_votes_read on public.pre_fund_step_approvals;
create policy pf_step_votes_read on public.pre_fund_step_approvals
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and lower(p.role) = any (array['super_admin','superadmin','admin','financialadmin','financial_admin'])
    )
    or exists (
      select 1 from public.pre_fund_approval_steps s
      join public.pre_fund_requests r on r.id = s.pre_fund_request_id
      where s.id = pre_fund_step_approvals.step_id and r.created_by = (select auth.uid())
    )
    or exists (
      select 1 from public.pre_fund_approval_steps s
      where s.id = pre_fund_step_approvals.step_id
        and (s.assigned_user_id = (select auth.uid()) or s.assigned_user_ids @> array[(select auth.uid())])
    )
  );

-- Evaluate permission checks once per statement instead of once per row.
do $$
declare
  t text;
  a text;
  pol_name text;
begin
  foreach t in array array['pre_fund_requests','pre_fund_transactions'] loop
    foreach a in array array['select','insert','update','delete'] loop
      execute format('drop policy if exists canonical_capability_%s on public.%I', a, t);
    end loop;
    execute format($p$create policy canonical_capability_select on public.%I as restrictive for select to authenticated
      using ((select public.current_user_has_resource_permission('pre_funding','read')))$p$, t);
    execute format($p$create policy canonical_capability_insert on public.%I as restrictive for insert to authenticated
      with check ((select public.current_user_has_resource_permission('pre_funding', %L)))$p$,
      t, case when t = 'pre_fund_transactions' then 'update' else 'create' end);
    execute format($p$create policy canonical_capability_update on public.%I as restrictive for update to authenticated
      using ((select public.current_user_has_resource_permission('pre_funding','update')))
      with check ((select public.current_user_has_resource_permission('pre_funding','update')))$p$, t);
    execute format($p$create policy canonical_capability_delete on public.%I as restrictive for delete to authenticated
      using ((select public.current_user_has_resource_permission('pre_funding','delete')))$p$, t);
  end loop;

  foreach t in array array['pre_fund_requests','pre_fund_transactions','pre_fund_allocations','pre_fund_reconciliations','pre_fund_approval_steps'] loop
    foreach a in array array['read','create','update','delete'] loop
      execute format('drop policy if exists access_override_%s_ceiling on public.%I', a, t);
    end loop;
    execute format($p$create policy access_override_read_ceiling on public.%I as restrictive for select to authenticated
      using ((select public.resource_override_allows('pre_funding','read')))$p$, t);
    execute format($p$create policy access_override_create_ceiling on public.%I as restrictive for insert to authenticated
      with check ((select public.resource_override_allows('pre_funding','create')))$p$, t);
    execute format($p$create policy access_override_update_ceiling on public.%I as restrictive for update to authenticated
      using ((select public.resource_override_allows('pre_funding','update')))
      with check ((select public.resource_override_allows('pre_funding','update')))$p$, t);
    execute format($p$create policy access_override_delete_ceiling on public.%I as restrictive for delete to authenticated
      using ((select public.resource_override_allows('pre_funding','delete')))$p$, t);

    pol_name := format('Explicit pre_funding read grants org-wide %s', replace(replace(t, 'pre_fund_', ''), '_', ' '));
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = pol_name) then
      execute format('drop policy %I on public.%I', pol_name, t);
      execute format($p$create policy %I on public.%I for select to authenticated
        using ((select public.user_has_explicit_resource_grant((select auth.uid()), 'pre_funding', array['read'])))$p$, pol_name, t);
    end if;
  end loop;
end $$;
