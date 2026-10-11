-- mmp_files writes follow mmp permissions; reads stay hub-scoped via the restrictive policy.
drop policy if exists mmp_files_all_auth on public.mmp_files;
drop policy if exists mf_update_editors on public.mmp_files;

create policy mmp_files_read on public.mmp_files
  for select to authenticated using (true);

create policy mmp_files_insert on public.mmp_files
  for insert to authenticated
  with check ((select public.current_user_has_resource_permission('mmp', 'create')));

create policy mmp_files_update on public.mmp_files
  for update to authenticated
  using ((select public.current_user_has_resource_permission('mmp', 'update'))
      or (select public.current_user_has_resource_permission('mmp', 'approve')))
  with check ((select public.current_user_has_resource_permission('mmp', 'update'))
      or (select public.current_user_has_resource_permission('mmp', 'approve')));

create policy mmp_files_delete on public.mmp_files
  for delete to authenticated
  using ((select public.current_user_has_resource_permission('mmp', 'delete')));

-- Coordinators create ad-hoc MMPs and upload permits / forward sites.
insert into public.permissions (role_id, resource, action)
select r.id, 'mmp', a
from public.roles r
cross join unnest(array['create', 'update']) a
where r.name = 'coordinator'
  and not exists (
    select 1 from public.permissions x where x.role_id = r.id and x.resource = 'mmp' and x.action = a
  );
