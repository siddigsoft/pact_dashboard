-- T03 — Atomic co_assignees update.
-- The previous flow read the row, modified the JSON in JS, and wrote it back,
-- which lost concurrent edits (e.g. two managers adding co-assignees at once).
-- This RPC sets the column inside a single statement so RLS is enforced and
-- the write is atomic.
create or replace function public.update_task_co_assignees(
  p_task_id uuid,
  p_co_assignees jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task personal_tasks%rowtype;
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'not authenticated';
  end if;

  select * into v_task from personal_tasks where id = p_task_id;
  if not found then
    raise exception 'task % not found', p_task_id;
  end if;

  -- Authorization: owner, primary assignee, current co-assignee, or admin/superadmin role.
  if not (
    v_task.user_id = v_caller
    or v_task.assigned_to = v_caller
    or exists (
      select 1
      from jsonb_array_elements(coalesce(v_task.co_assignees, '[]'::jsonb)) as c
      where (c->>'id')::uuid = v_caller
    )
    or exists (
      select 1 from profiles
      where id = v_caller
        and (lower(coalesce(role, '')) in ('admin','superadmin','super_admin'))
    )
  ) then
    raise exception 'not authorized to modify co-assignees on task %', p_task_id;
  end if;

  update personal_tasks
     set co_assignees = coalesce(p_co_assignees, '[]'::jsonb),
         updated_at   = now()
   where id = p_task_id;

  return (select co_assignees from personal_tasks where id = p_task_id);
end;
$$;

grant execute on function public.update_task_co_assignees(uuid, jsonb) to authenticated;
