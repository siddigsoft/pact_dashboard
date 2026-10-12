alter table public.permissions drop constraint if exists permissions_action_check;
alter table public.permissions add constraint permissions_action_check check (
  action = any (array[
    'create', 'read', 'update', 'delete', 'approve', 'assign', 'archive', 'restore',
    'override', 'export', 'submit', 'full_report', 'state_report', 'hub_report',
    'mark_paid', 'use_for_payment', 'assign_cost', 'settings'
  ]::text[])
);

insert into public.permissions (role_id, resource, action)
select r.id, 'projects', 'settings'
from public.roles r
where r.name = 'admin'
on conflict (role_id, resource, action) do nothing;

drop policy if exists pfso_admin_write on public.project_flow_stage_overrides;
revoke insert, update, delete, truncate, references, trigger on public.project_flow_stage_overrides from anon;

create policy pfso_insert on public.project_flow_stage_overrides
  for insert to authenticated
  with check ((select public.current_user_has_resource_permission('projects', 'settings')));

create policy pfso_update on public.project_flow_stage_overrides
  for update to authenticated
  using ((select public.current_user_has_resource_permission('projects', 'settings')))
  with check ((select public.current_user_has_resource_permission('projects', 'settings')));

create policy pfso_delete on public.project_flow_stage_overrides
  for delete to authenticated
  using ((select public.current_user_has_resource_permission('projects', 'settings')));
