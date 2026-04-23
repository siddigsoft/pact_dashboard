-- T30 — Tighten notification_delivery_logs visibility to administrators
-- (in addition to the per-user 'select_own' policy from 20260420).
-- Org-wide aggregates (delivery rates, channel breakdowns, etc.) are shown
-- on the NotificationAnalytics page; without this policy a clever client
-- could query other users' rows directly. The page itself now guards on
-- admin role too, so this is defence-in-depth.

create or replace function public.is_app_admin(p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = p_uid
      and lower(coalesce(role, '')) in ('admin','superadmin','super_admin')
  );
$$;

grant execute on function public.is_app_admin(uuid) to authenticated;

-- Admin-only org-wide read access. Coexists with the existing
-- delivery_logs_select_own policy (RLS uses OR across permissive policies).
drop policy if exists delivery_logs_select_admin on notification_delivery_logs;
create policy delivery_logs_select_admin
  on notification_delivery_logs
  for select
  to authenticated
  using (public.is_app_admin());
