-- Project ↔ GL account links: readable by any signed-in user, editable by accounting or project editors.
drop policy if exists auth_write_project_account_links on public.project_account_links;

create policy project_account_links_write on public.project_account_links
  for all to authenticated
  using (
    (select public.current_user_has_resource_permission('accounting', 'create'))
    or (select public.current_user_has_resource_permission('accounting', 'update'))
    or (select public.current_user_has_resource_permission('projects', 'update'))
  )
  with check (
    (select public.current_user_has_resource_permission('accounting', 'create'))
    or (select public.current_user_has_resource_permission('accounting', 'update'))
    or (select public.current_user_has_resource_permission('projects', 'update'))
  );

revoke all on public.project_account_links from anon;
