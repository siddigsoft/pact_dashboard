-- Make INSERT policy for operational_cost_submissions deterministic.
-- Avoid relying on can_submit_operational_costs() runtime context edge-cases.

drop policy if exists "Authorized roles can create operational cost submissions"
on public.operational_cost_submissions;

create policy "Authorized roles can create operational cost submissions"
on public.operational_cost_submissions
for insert
to public
with check (
  auth.uid() = submitted_by
  and exists (
    select 1
    from public.profiles p
    where p.id = submitted_by
      and coalesce(p.status, 'approved') = 'approved'
      and p.role in (
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
      )
  )
);
