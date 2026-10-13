-- Training & certifications get their own permission resource (training:*).
-- Staff keep full control of their own records; training:* covers everyone else's.

alter table public.permissions drop constraint if exists permissions_resource_check;
alter table public.permissions add constraint permissions_resource_check check (
  resource = any (array[
    'users', 'roles', 'permissions', 'settings', 'system', 'super_admins', 'audit_logs',
    'projects', 'portfolio', 'analytics', 'mmp', 'site_visits', 'hub_operations',
    'coverage_map', 'safety', 'incidents', 'equipment', 'finances', 'cost_submissions',
    'wallets', 'down_payments', 'pre_funding', 'accounting', 'fixed_assets', 'procurement',
    'transactions', 'signatures', 'reports', 'crm', 'surveys', 'tasks', 'notifications',
    'calendar', 'hr', 'hr_analytics', 'payroll', 'benefits', 'leave', 'pulse_surveys',
    'succession', 'integrations', 'broadcast', 'whatsapp', 'incentives',
    'performance_reviews', 'training'
  ]::text[])
);

insert into public.permissions (role_id, resource, action)
select r.id, 'training', a.action
from public.roles r
cross join (values ('read'), ('create'), ('update'), ('delete')) a(action)
where r.name = 'admin'
on conflict (role_id, resource, action) do nothing;

revoke all on public.staff_certifications from anon;

drop policy if exists cert_admin_delete on public.staff_certifications;
drop policy if exists cert_admin_update on public.staff_certifications;
drop policy if exists cert_own_insert   on public.staff_certifications;
drop policy if exists cert_own_select   on public.staff_certifications;
drop policy if exists certs_access      on public.staff_certifications;

create policy staff_certifications_read on public.staff_certifications
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.current_user_has_resource_permission('training', 'read'))
  );

create policy staff_certifications_insert on public.staff_certifications
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    or (select public.current_user_has_resource_permission('training', 'create'))
  );

create policy staff_certifications_update on public.staff_certifications
  for update to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.current_user_has_resource_permission('training', 'update'))
  )
  with check (
    user_id = (select auth.uid())
    or (select public.current_user_has_resource_permission('training', 'update'))
  );

create policy staff_certifications_delete on public.staff_certifications
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.current_user_has_resource_permission('training', 'delete'))
  );
