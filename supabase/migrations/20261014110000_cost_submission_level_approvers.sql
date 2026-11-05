-- Who should be notified when a cost submission reaches an approval level,
-- resolved from approve_<level> permissions instead of role names.

create or replace function public.user_holds_resource_permission(p_user uuid, p_resource text, p_action text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_override boolean;
begin
  select o.is_granted into v_override
  from public.user_permission_overrides o
  where o.user_id = p_user
    and o.resource = p_resource
    and o.action = p_action
    and (o.expires_at is null or o.expires_at > now());
  if found then
    return v_override;
  end if;

  return exists (
    select 1 from public.get_user_permissions(p_user) p
    where p.resource = p_resource and p.action = p_action
  );
end;
$$;

revoke execute on function public.user_holds_resource_permission(uuid, text, text) from public, anon, authenticated;
grant execute on function public.user_holds_resource_permission(uuid, text, text) to service_role;

-- Returns holders of approve_<level> who hold no later level (they are notified when it is their turn).
-- Falls back to every holder when nobody is dedicated to that level.
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
  )
  select d.id from dedicated d
  union all
  select h.id from holders h where not exists (select 1 from dedicated);
end;
$$;

revoke execute on function public.cost_submission_level_approvers(text) from public, anon;
grant execute on function public.cost_submission_level_approvers(text) to authenticated, service_role;
