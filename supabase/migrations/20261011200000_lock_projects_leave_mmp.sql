-- projects: reads stay scoped by projects_select; writes follow projects permissions
-- (project managers can still update their own project).
drop policy if exists projects_all_auth on public.projects;
drop policy if exists projects_insert on public.projects;
drop policy if exists projects_update on public.projects;
drop policy if exists projects_delete on public.projects;

create policy projects_insert on public.projects
  for insert to authenticated
  with check ((select public.current_user_has_resource_permission('projects', 'create')));

create policy projects_update on public.projects
  for update to authenticated
  using (
    (select public.current_user_has_resource_permission('projects', 'update'))
    or (team ->> 'projectManagerId') = (select auth.uid())::text
    or (team ->> 'projectManager') = (select auth.uid())::text
  )
  with check (
    (select public.current_user_has_resource_permission('projects', 'update'))
    or (team ->> 'projectManagerId') = (select auth.uid())::text
    or (team ->> 'projectManager') = (select auth.uid())::text
  );

create policy projects_delete on public.projects
  for delete to authenticated
  using ((select public.current_user_has_resource_permission('projects', 'delete')));

-- leave_requests: own requests, the approvers on the request, and leave/hr permission holders.
drop policy if exists allow_auth_all_leave on public.leave_requests;

create policy leave_read on public.leave_requests
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or current_approver_id = (select auth.uid())
    or position((select auth.uid())::text in coalesce(approver_chain::text, '')) > 0
    or (select public.current_user_has_resource_permission('leave', 'read'))
    or (select public.current_user_has_resource_permission('hr', 'read'))
  );

create policy leave_insert on public.leave_requests
  for insert to authenticated
  with check (user_id = (select auth.uid()) or (select public.current_user_has_resource_permission('leave', 'create')));

create policy leave_update on public.leave_requests
  for update to authenticated
  using (
    user_id = (select auth.uid())
    or current_approver_id = (select auth.uid())
    or (select public.current_user_has_resource_permission('leave', 'update'))
    or (select public.current_user_has_resource_permission('leave', 'approve'))
  )
  with check (
    user_id = (select auth.uid())
    or position((select auth.uid())::text in coalesce(approver_chain::text, '')) > 0
    or (select public.current_user_has_resource_permission('leave', 'update'))
    or (select public.current_user_has_resource_permission('leave', 'approve'))
  );

create policy leave_delete on public.leave_requests
  for delete to authenticated
  using ((select public.current_user_has_resource_permission('leave', 'delete')));

-- mmp_files: stop anonymous reads; logged-in reads remain hub-scoped by the restrictive policy.
drop policy if exists "Allow read for all" on public.mmp_files;
drop policy if exists mmp_files_all_auth on public.mmp_files;
create policy mmp_files_all_auth on public.mmp_files
  for all to authenticated using (true) with check (true);
revoke all on public.mmp_files from anon;
