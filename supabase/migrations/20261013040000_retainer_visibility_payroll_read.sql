-- Retainer amounts are visible to anyone holding payroll:read (super admin passes
-- automatically); grant it per role in Role Management instead of hardcoding names.

create or replace function public.current_user_can_see_retainers()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.current_user_has_resource_permission('payroll', 'read');
$$;
