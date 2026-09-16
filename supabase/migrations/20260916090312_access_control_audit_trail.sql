-- One immutable, restricted audit stream for all access-control configuration
-- changes. We intentionally do not reuse public.audit_logs because its current
-- read policy is broad enough to expose permission state to ordinary users.

create table if not exists public.access_control_audit_events (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  event_type text not null check (event_type in ('insert', 'update', 'delete')),
  entity_id text not null,
  target text not null,
  actor_id uuid,
  actor_name text not null,
  actor_role text,
  before_state jsonb,
  after_state jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.access_control_audit_events enable row level security;
revoke all on table public.access_control_audit_events from anon, authenticated;
grant select on table public.access_control_audit_events to authenticated;

drop policy if exists access_control_audit_events_read on public.access_control_audit_events;
create policy access_control_audit_events_read
on public.access_control_audit_events
for select
to authenticated
using (
  public.is_super_admin((select auth.uid()))
  or public.user_has_permission((select auth.uid()), 'roles', 'update')
  or public.user_has_permission((select auth.uid()), 'roles', 'create')
  or public.user_has_permission((select auth.uid()), 'roles', 'delete')
);

create or replace function public.log_access_control_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_actor_id uuid := (select auth.uid());
  v_actor_name text := 'System';
  v_actor_role text;
  v_entity_id text;
  v_target text;
begin
  if tg_op = 'DELETE' then
    v_before := to_jsonb(old);
    v_after := null;
  elsif tg_op = 'INSERT' then
    v_before := null;
    v_after := to_jsonb(new);
  else
    v_before := to_jsonb(old);
    v_after := to_jsonb(new);
  end if;

  if (select auth.uid()) is not null then
    select coalesce(p.full_name, p.email, 'Unknown user'), p.role
      into v_actor_name, v_actor_role
      from public.profiles p
      where p.id = (select auth.uid());
  end if;

  v_entity_id := coalesce(
    v_after ->> 'id',
    v_before ->> 'id',
    v_after ->> 'page_slug',
    v_before ->> 'page_slug',
    v_after ->> 'name',
    v_before ->> 'name',
    'unknown'
  );
  v_target := coalesce(
    v_after ->> 'user_id',
    v_before ->> 'user_id',
    v_after ->> 'role_id',
    v_before ->> 'role_id',
    v_after ->> 'role',
    v_before ->> 'role',
    'global'
  );

  insert into public.access_control_audit_events (
    table_name, event_type, entity_id, target,
    actor_id, actor_name, actor_role, before_state, after_state, metadata
  ) values (
    tg_table_name, lower(tg_op), v_entity_id, v_target,
    v_actor_id, coalesce(v_actor_name, 'Unknown user'), v_actor_role, v_before, v_after,
    jsonb_build_object('schema', tg_table_schema, 'target', v_target)
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.log_access_control_change() from public;

drop trigger if exists access_control_audit_page_overrides on public.page_access_overrides;
create trigger access_control_audit_page_overrides
after insert or update or delete on public.page_access_overrides
for each row execute function public.log_access_control_change();

drop trigger if exists access_control_audit_action_overrides on public.user_permission_overrides;
create trigger access_control_audit_action_overrides
after insert or update or delete on public.user_permission_overrides
for each row execute function public.log_access_control_change();

drop trigger if exists access_control_audit_role_assignments on public.canonical_user_role_assignments;
create trigger access_control_audit_role_assignments
after insert or update or delete on public.canonical_user_role_assignments
for each row execute function public.log_access_control_change();

drop trigger if exists access_control_audit_page_role_configs on public.page_role_configs;
create trigger access_control_audit_page_role_configs
after insert or update or delete on public.page_role_configs
for each row execute function public.log_access_control_change();

drop trigger if exists access_control_audit_column_visibility on public.column_visibility_config;
create trigger access_control_audit_column_visibility
after insert or update or delete on public.column_visibility_config
for each row execute function public.log_access_control_change();

drop trigger if exists access_control_audit_data_scope on public.data_scope_config;
create trigger access_control_audit_data_scope
after insert or update or delete on public.data_scope_config
for each row execute function public.log_access_control_change();
