drop policy if exists mmp_site_entries_update_combined on public.mmp_site_entries;
revoke update on public.mmp_site_entries from anon;

create policy mmp_site_entries_update_perm on public.mmp_site_entries
  for update to authenticated
  using (
    (select public.current_user_has_resource_permission('mmp', 'update'))
    or (select public.current_user_has_resource_permission('mmp', 'approve'))
    or (select public.current_user_has_resource_permission('mmp', 'assign'))
    or accepted_by = (select auth.uid())::text
    or claimed_by = (select auth.uid())
    or visit_started_by = (select auth.uid())
    or exists (select 1 from public.adhoc_teams t
               where t.id::text = additional_data->>'team_id'
                 and t.team_lead_id = (select auth.uid()))
  )
  with check (
    (select public.current_user_has_resource_permission('mmp', 'update'))
    or (select public.current_user_has_resource_permission('mmp', 'approve'))
    or (select public.current_user_has_resource_permission('mmp', 'assign'))
    or accepted_by = (select auth.uid())::text
    or claimed_by = (select auth.uid())
    or visit_started_by = (select auth.uid())
    or exists (select 1 from public.adhoc_teams t
               where t.id::text = additional_data->>'team_id'
                 and t.team_lead_id = (select auth.uid()))
  );
