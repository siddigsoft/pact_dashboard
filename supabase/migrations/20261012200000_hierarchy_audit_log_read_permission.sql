-- hierarchy_audit_log: replace the role-name read rule with audit_logs:read.
-- Rows are written only by log_hierarchy_change() (security definer).

drop policy if exists hier_audit_admin_read on public.hierarchy_audit_log;

revoke all on public.hierarchy_audit_log from anon;
revoke truncate, references, trigger on public.hierarchy_audit_log from authenticated;

create policy hierarchy_audit_log_read on public.hierarchy_audit_log
  for select to authenticated
  using ((select public.current_user_has_resource_permission('audit_logs', 'read')));
