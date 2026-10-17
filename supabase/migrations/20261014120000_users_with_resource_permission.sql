-- Notification audiences resolved from permissions instead of role names.
-- Active super admins bypass permission checks, so they are always included as recipients.

create or replace function public.users_with_resource_permission(p_resource text, p_actions text[])
returns table (user_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles me
    where me.id = auth.uid() and coalesce(me.status, 'approved') = 'approved'
  ) then
    return;
  end if;

  return query
  select p.id
  from public.profiles p
  where coalesce(p.status, 'approved') = 'approved'
    and coalesce(p.is_active, true)
    and (
      public.is_super_admin(p.id)
      or exists (
        select 1 from unnest(p_actions) a(action)
        where public.user_holds_resource_permission(p.id, p_resource, a.action)
      )
    );
end;
$$;

revoke execute on function public.users_with_resource_permission(text, text[]) from public, anon;
grant execute on function public.users_with_resource_permission(text, text[]) to authenticated, service_role;

create or replace function public.cost_submission_level_approvers(p_level text)
returns table (approver_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_levels constant text[] := array['hub', 'field_ops', 'country', 'final'];
  v_position int := array_position(v_levels, p_level);
begin
  if v_position is null then
    return;
  end if;
  if not (
    public.current_user_has_resource_permission('cost_submissions', 'approve')
    or public.current_user_has_resource_permission('cost_submissions', 'approve_hub')
    or public.current_user_has_resource_permission('cost_submissions', 'approve_field_ops')
    or public.current_user_has_resource_permission('cost_submissions', 'approve_country')
    or public.current_user_has_resource_permission('cost_submissions', 'approve_final')
  ) then
    return;
  end if;

  return query
  with holders as (
    select p.id
    from public.profiles p
    where coalesce(p.status, 'approved') = 'approved'
      and coalesce(p.is_active, true)
      and public.user_holds_resource_permission(p.id, 'cost_submissions', 'approve_' || p_level)
  ),
  dedicated as (
    select h.id
    from holders h
    where not exists (
      select 1 from unnest(v_levels[v_position + 1:]) later(level)
      where public.user_holds_resource_permission(h.id, 'cost_submissions', 'approve_' || later.level)
    )
  ),
  recipients as (
    select d.id from dedicated d
    union all
    select h.id from holders h where not exists (select 1 from dedicated)
    union
    select p.id
    from public.profiles p
    where p_level = 'final'
      and coalesce(p.status, 'approved') = 'approved'
      and coalesce(p.is_active, true)
      and public.is_super_admin(p.id)
  )
  select r.id from recipients r;
end;
$$;
