-- Senders can't read recipients' user_settings rows (RLS is own-row only), so the
-- preference check runs here and returns only a yes/no answer.
create or replace function public.should_notify_user(
  p_user_id uuid,
  p_category text,
  p_priority text default 'normal'
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  prefs jsonb;
  quiet jsonb;
  tz text;
  local_hour int;
  start_hour int;
  end_hour int;
begin
  if p_priority = 'urgent' then
    return true;
  end if;

  select us.settings -> 'notificationPreferences'
    into prefs
  from public.user_settings us
  where us.user_id = p_user_id
  order by us.last_updated desc nulls last
  limit 1;

  if prefs is null then
    return true;
  end if;

  if prefs ->> 'enabled' = 'false' then
    return false;
  end if;

  if prefs -> 'categories' ->> p_category = 'false' then
    return false;
  end if;

  quiet := prefs -> 'quietHours';
  if quiet ->> 'enabled' = 'true' then
    tz := coalesce(nullif(quiet ->> 'timeZone', ''), 'Africa/Khartoum');
    begin
      local_hour := extract(hour from now() at time zone tz)::int;
    exception when others then
      local_hour := extract(hour from now() at time zone 'Africa/Khartoum')::int;
    end;
    start_hour := coalesce((quiet ->> 'startHour')::int, 22);
    end_hour   := coalesce((quiet ->> 'endHour')::int, 7);

    if (start_hour <= end_hour and local_hour >= start_hour and local_hour < end_hour)
       or (start_hour > end_hour and (local_hour >= start_hour or local_hour < end_hour)) then
      return false;
    end if;
  end if;

  return true;
end;
$$;

revoke all on function public.should_notify_user(uuid, text, text) from public, anon;
grant execute on function public.should_notify_user(uuid, text, text) to authenticated, service_role;
