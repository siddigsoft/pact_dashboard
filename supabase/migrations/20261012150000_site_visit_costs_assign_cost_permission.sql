alter table public.permissions drop constraint if exists permissions_action_check;
alter table public.permissions add constraint permissions_action_check check (
  action = any (array[
    'create', 'read', 'update', 'delete', 'approve', 'assign', 'archive', 'restore',
    'override', 'export', 'submit', 'full_report', 'state_report', 'hub_report',
    'mark_paid', 'use_for_payment', 'assign_cost'
  ]::text[])
);

insert into public.permissions (role_id, resource, action)
select r.id, 'site_visits', 'assign_cost'
from public.roles r
where r.name in ('admin', 'ict')
on conflict (role_id, resource, action) do nothing;

drop policy if exists site_visit_costs_roles_manage_all on public.site_visit_costs;
drop policy if exists "Users can view site visit costs" on public.site_visit_costs;
revoke all on public.site_visit_costs from anon;

create policy site_visit_costs_read on public.site_visit_costs
  for select to authenticated
  using ((select public.current_user_has_resource_permission('site_visits', 'read'))
      or (select public.current_user_has_resource_permission('cost_submissions', 'read')));

create policy site_visit_costs_insert on public.site_visit_costs
  for insert to authenticated
  with check ((select public.current_user_has_resource_permission('site_visits', 'assign_cost')));

create policy site_visit_costs_update on public.site_visit_costs
  for update to authenticated
  using ((select public.current_user_has_resource_permission('site_visits', 'assign_cost')))
  with check ((select public.current_user_has_resource_permission('site_visits', 'assign_cost')));

create policy site_visit_costs_delete on public.site_visit_costs
  for delete to authenticated
  using ((select public.current_user_has_resource_permission('site_visits', 'assign_cost')));
