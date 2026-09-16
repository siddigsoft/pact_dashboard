-- Permission membership is keyed by active canonical role IDs. A revoked or
-- empty role permission set must not be recreated from profiles.role.
create or replace function public.get_user_permissions(user_uuid uuid)
returns table(resource varchar, action varchar, conditions jsonb)
language sql stable security definer set search_path = ''
as $$
  select distinct p.resource::varchar, p.action::varchar, p.conditions
  from public.canonical_user_role_assignments a
  join public.roles r on r.id = a.role_id and r.is_active = true
  join public.permissions p on p.role_id = r.id
  where a.user_id = user_uuid;
$$;
revoke all on function public.get_user_permissions(uuid) from public, anon;
grant execute on function public.get_user_permissions(uuid) to authenticated, service_role;

-- The resource predicate grants a capability, never a row scope. RLS and the
-- existing transactional RPCs must still check ownership, hub, state and funds.
create or replace function public.current_user_has_resource_permission(
  p_resource text, p_action text
) returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  override_value boolean;
begin
  if auth.role() = 'service_role' then return true; end if;
  if caller is null or nullif(btrim(p_resource), '') is null
     or nullif(btrim(p_action), '') is null then return false; end if;
  if public.is_super_admin(caller) then return true; end if;
  select o.is_granted into override_value
  from public.user_permission_overrides o
  where o.user_id = caller and o.resource = p_resource and o.action = p_action
    and (o.expires_at is null or o.expires_at > now());
  if found then return override_value; end if;
  return exists (
    select 1 from public.get_user_permissions(caller) p
    where p.resource = p_resource and p.action = p_action
  );
end;
$$;
revoke all on function public.current_user_has_resource_permission(text,text) from public, anon;
grant execute on function public.current_user_has_resource_permission(text,text) to authenticated, service_role;

create or replace function public.assert_resource_permission(p_resource text, p_action text)
returns void language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.current_user_has_resource_permission(p_resource, p_action) then
    raise exception 'Access denied for %.%', p_resource, p_action using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.assert_resource_permission(text,text) from public, anon;
grant execute on function public.assert_resource_permission(text,text) to authenticated, service_role;

create or replace function public.assert_report_export_permission(
  p_resource text, p_action text default 'export'
) returns void language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_action is distinct from 'export' then
    raise exception 'Only export may be asserted here' using errcode = '42501';
  end if;
  perform public.assert_resource_permission(p_resource, p_action);
end;
$$;
revoke all on function public.assert_report_export_permission(text,text) from public, anon;
grant execute on function public.assert_report_export_permission(text,text) to authenticated, service_role;

-- Existing Pre-Fund RPCs all call these guards before transactional work.
-- Keep their row locks, state validation and accounting logic unchanged.
create or replace function public._assert_finance_role()
returns void language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_resource_permission('pre_funding', 'update');
end;
$$;
create or replace function public._assert_pre_fund_correction_role()
returns void language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_resource_permission('pre_funding', 'update');
  -- Corrections move immutable accounting entries and require accounting rights.
  perform public.assert_resource_permission('accounting', 'update');
end;
$$;
revoke all on function public._assert_finance_role() from public, anon;
revoke all on function public._assert_pre_fund_correction_role() from public, anon;
grant execute on function public._assert_finance_role() to authenticated, service_role;
grant execute on function public._assert_pre_fund_correction_role() to authenticated, service_role;

create or replace function public.can_execute_cost_submission_action(p_action text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select p_action = 'approve'
    and public.current_user_has_resource_permission('cost_submissions', p_action);
$$;
create or replace function public.can_mark_site_visit_cost_paid()
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.current_user_has_resource_permission('cost_submissions', 'approve')
    and public.current_user_has_resource_permission('wallets', 'update');
$$;
revoke all on function public.can_execute_cost_submission_action(text) from public, anon;
revoke all on function public.can_mark_site_visit_cost_paid() from public, anon;

comment on function public.current_user_has_resource_permission(text,text) is
  'Capability predicate: authenticated identity, protected Super Admin bypass, active user exception, active canonical role permission. Does not grant row ownership or workflow authority.';
