-- Hierarchy change audit log. Captures every change to a profile's
-- reports_to or department_id so HR can answer "when did X move?" and
-- "who changed Y's manager?".

create table if not exists public.hierarchy_audit_log (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null,
  field           text not null check (field in ('reports_to','department_id')),
  old_value       uuid,
  new_value       uuid,
  changed_by      uuid,
  reason          text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_hier_audit_profile on public.hierarchy_audit_log(profile_id);
create index if not exists idx_hier_audit_created on public.hierarchy_audit_log(created_at desc);

create or replace function public.log_hierarchy_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.reports_to is distinct from old.reports_to then
    insert into hierarchy_audit_log (profile_id, field, old_value, new_value, changed_by)
    values (new.id, 'reports_to', old.reports_to, new.reports_to, auth.uid());
  end if;
  if new.department_id is distinct from old.department_id then
    insert into hierarchy_audit_log (profile_id, field, old_value, new_value, changed_by)
    values (new.id, 'department_id', old.department_id, new.department_id, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_log_hierarchy on public.profiles;
create trigger trg_profiles_log_hierarchy
after update of reports_to, department_id on public.profiles
for each row execute function public.log_hierarchy_change();

alter table public.hierarchy_audit_log enable row level security;

-- Only HR/admin can read the audit log.
drop policy if exists "hier_audit_admin_read" on public.hierarchy_audit_log;
create policy "hier_audit_admin_read" on public.hierarchy_audit_log
  for select using (
    exists (select 1 from profiles
             where id = auth.uid()
               and lower(coalesce(role,'')) in ('admin','super_admin','superadmin','hr'))
  );

-- Inserts only via the trigger (no direct writes).
revoke insert, update, delete on public.hierarchy_audit_log from authenticated;
