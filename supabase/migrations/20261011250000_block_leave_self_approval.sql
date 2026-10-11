-- Requesters may only submit (pending) and cancel their own leave; nobody but a super admin
-- can decide their own request, whether by direct update or via decide_leave_request.
create or replace function public.guard_leave_self_approval()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or public.current_user_is_super_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.user_id = v_uid and (
         coalesce(new.status, 'pending') <> 'pending'
      or new.reviewed_by is not null
      or new.reviewed_at is not null
    ) then
      raise exception 'Leave requests must be submitted as pending';
    end if;
    return new;
  end if;

  if old.user_id = v_uid then
    if new.status is distinct from old.status
       and not (old.status = 'pending' and new.status = 'cancelled') then
      raise exception 'You cannot change the status of your own leave request';
    end if;

    if current_user = 'authenticated' and (
         new.user_id             is distinct from old.user_id
      or new.reviewed_by         is distinct from old.reviewed_by
      or new.reviewed_at         is distinct from old.reviewed_at
      or new.reviewer_notes      is distinct from old.reviewer_notes
      or new.approver_chain      is distinct from old.approver_chain
      or new.current_approver_id is distinct from old.current_approver_id
      or new.current_tier        is distinct from old.current_tier
      or new.approval_history    is distinct from old.approval_history
    ) then
      raise exception 'You cannot change approval details on your own leave request';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_leave_self_approval on public.leave_requests;
create trigger trg_guard_leave_self_approval
  before insert or update on public.leave_requests
  for each row execute function public.guard_leave_self_approval();

-- Leave balances: everyone reads their own; only leave/hr editors change them.
drop policy if exists leave_entitlements_access on public.leave_entitlements;

create policy leave_entitlements_read on public.leave_entitlements
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.current_user_has_resource_permission('leave', 'read'))
    or (select public.current_user_has_resource_permission('hr', 'read'))
  );

create policy leave_entitlements_write on public.leave_entitlements
  for all to authenticated
  using (
    (select public.current_user_has_resource_permission('leave', 'update'))
    or (select public.current_user_has_resource_permission('hr', 'update'))
  )
  with check (
    (select public.current_user_has_resource_permission('leave', 'update'))
    or (select public.current_user_has_resource_permission('hr', 'update'))
  );

revoke all on public.leave_entitlements from anon;
