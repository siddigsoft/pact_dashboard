-- employee_salary_config had RLS disabled and full grants to anon.
-- Own row is always readable; org-wide read and all writes follow payroll permissions.

revoke all on public.employee_salary_config from anon;
alter table public.employee_salary_config enable row level security;

create policy salary_config_read on public.employee_salary_config
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.current_user_has_resource_permission('payroll', 'read')));

create policy salary_config_insert on public.employee_salary_config
  for insert to authenticated
  with check ((select public.current_user_has_resource_permission('payroll', 'create')));

create policy salary_config_update on public.employee_salary_config
  for update to authenticated
  using ((select public.current_user_has_resource_permission('payroll', 'update')))
  with check ((select public.current_user_has_resource_permission('payroll', 'update')));

create policy salary_config_delete on public.employee_salary_config
  for delete to authenticated
  using ((select public.current_user_has_resource_permission('payroll', 'delete')));

-- salary_increments: the open policy made the scoped ones meaningless.
drop policy if exists salary_increments_all on public.salary_increments;

create policy salary_inc_payroll_read on public.salary_increments
  for select to authenticated
  using ((select public.current_user_has_resource_permission('payroll', 'read')));

create policy salary_inc_payroll_write on public.salary_increments
  for all to authenticated
  using ((select public.current_user_has_resource_permission('payroll', 'update')))
  with check ((select public.current_user_has_resource_permission('payroll', 'update')));
