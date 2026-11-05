-- Down payment requests: replace the open UPDATE policy. Field-level rules
-- (approve / pay / Kassala tier-1) stay in guard_finance_resource_transition.

drop policy if exists down_payment_requests_update_authenticated on public.down_payment_requests;
revoke insert, update, delete on public.down_payment_requests from anon;

create policy down_payment_requests_update_perm on public.down_payment_requests
  for update to authenticated
  using (
    requested_by = (select auth.uid())
    or (select public.current_user_has_resource_permission('down_payments', 'update'))
    or (select public.current_user_has_resource_permission('down_payments', 'approve'))
    or (select public.current_user_has_resource_permission('down_payments', 'mark_paid'))
    or (select public.current_user_has_resource_permission('down_payments', 'override'))
    or (select public.current_user_has_resource_permission('mmp', 'update'))
    or (select public.current_user_has_resource_permission('mmp', 'delete'))
  )
  with check (
    requested_by = (select auth.uid())
    or (select public.current_user_has_resource_permission('down_payments', 'update'))
    or (select public.current_user_has_resource_permission('down_payments', 'approve'))
    or (select public.current_user_has_resource_permission('down_payments', 'mark_paid'))
    or (select public.current_user_has_resource_permission('down_payments', 'override'))
    or (select public.current_user_has_resource_permission('mmp', 'update'))
    or (select public.current_user_has_resource_permission('mmp', 'delete'))
  );

-- MMP site entries: inserts need mmp:create; deletes need mmp:delete or mmp:update.
drop policy if exists mmp_site_entries_insert_combined on public.mmp_site_entries;
drop policy if exists mmp_site_entries_delete_combined on public.mmp_site_entries;
revoke insert, update, delete on public.mmp_site_entries from anon;

create policy mmp_site_entries_insert_perm on public.mmp_site_entries
  for insert to authenticated
  with check ((select public.current_user_has_resource_permission('mmp', 'create')));

create policy mmp_site_entries_delete_perm on public.mmp_site_entries
  for delete to authenticated
  using (
    (select public.current_user_has_resource_permission('mmp', 'delete'))
    or (select public.current_user_has_resource_permission('mmp', 'update'))
  );

-- Data collectors should not upload MMPs or create site entries.
delete from public.permissions p
using public.roles r
where p.role_id = r.id and r.name = 'dataCollector' and p.resource = 'mmp' and p.action = 'create';
