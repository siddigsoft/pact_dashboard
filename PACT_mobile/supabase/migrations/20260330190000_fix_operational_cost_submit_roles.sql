-- Fix RLS insert denial on operational_cost_submissions for field users.
-- Policy uses can_submit_operational_costs(), which previously omitted
-- common field roles like dataCollector/datacollector/enumerator.

create or replace function public.can_submit_operational_costs()
returns boolean
language plpgsql
stable
security definer
as $function$
declare
  user_role text;
begin
  select role into user_role from public.profiles where id = auth.uid();
  return user_role in (
    'Field Operation Manager (FOM)', 'fom', 'fieldOpManager',
    'Coordinator', 'coordinator',
    'CountryDirector', 'countryDirector', 'Country Director',
    'admin', 'Admin', 'administrator',
    'SuperAdmin', 'superAdmin', 'super_admin', 'Super Admin',
    'hubSupervisor', 'supervisor',
    'FinancialAdmin', 'finance_admin',
    'ICT', 'ict',
    'dataCollector', 'datacollector', 'Data Collector',
    'enumerator', 'Enumerator',
    'dataTeam'
  );
end;
$function$;
