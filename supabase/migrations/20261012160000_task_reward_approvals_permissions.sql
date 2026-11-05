-- task_reward_approvals: replace the role-name rule ('SuperAdmin'/'Admin', which
-- never matched the stored role values) and the owner-can-do-anything rule with
-- tasks:* permissions. Assignees keep read access to their own rows only.

drop policy if exists reward_approvals_access on public.task_reward_approvals;

revoke all on public.task_reward_approvals from anon;

create policy task_reward_approvals_read on public.task_reward_approvals
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.current_user_has_resource_permission('tasks', 'approve'))
  );

create policy task_reward_approvals_insert on public.task_reward_approvals
  for insert to authenticated
  with check ((select public.current_user_has_resource_permission('tasks', 'approve')));

create policy task_reward_approvals_update on public.task_reward_approvals
  for update to authenticated
  using ((select public.current_user_has_resource_permission('tasks', 'approve')))
  with check ((select public.current_user_has_resource_permission('tasks', 'approve')));

create policy task_reward_approvals_delete on public.task_reward_approvals
  for delete to authenticated
  using ((select public.current_user_has_resource_permission('tasks', 'delete')));
