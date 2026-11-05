-- Retainer pay on user_classifications is visible to the user, payroll readers and
-- classification managers only. Classification level/scope stay readable to everyone
-- (fee calculation and dispatch depend on them).

create or replace function public.current_user_can_see_retainers()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_has_resource_permission('payroll', 'read')
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role = any (array['admin', 'ict', 'financialAdmin', 'super_admin', 'superadmin', 'superAdmin'])
      );
$$;

revoke all on function public.current_user_can_see_retainers() from public, anon;
grant execute on function public.current_user_can_see_retainers() to authenticated;

-- Owner-rights view: reads the retainer columns that authenticated cannot select directly.
create or replace view public.user_classification_retainers as
  select uc.*
  from public.user_classifications uc
  where uc.user_id = auth.uid() or (select public.current_user_can_see_retainers());

revoke all on public.user_classification_retainers from anon;
grant select on public.user_classification_retainers to authenticated;
