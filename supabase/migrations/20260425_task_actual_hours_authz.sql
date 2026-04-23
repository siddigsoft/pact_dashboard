-- Server-side authorization for actual-hours edits and owner confirmation.
-- Architect review flagged that with the existing personal_tasks RLS (which
-- allows owner/primary/co-assignees to UPDATE the row), the UI gating alone
-- is bypassable: any participant could call .update() and stamp
-- actual_hours_confirmed_at/by themselves. This migration:
--
--   1. Adds two SECURITY DEFINER RPCs as the only sanctioned write paths:
--        - set_task_actual_hours(task_id, target_user_id, hours)
--             • caller must be the target_user_id OR an admin
--             • atomically patches either the primary's top-level actual_hours
--               or the matching entry inside co_assignees jsonb (no
--               read-modify-write — fixes race noted by reviewer)
--             • always clears the corresponding actual_hours_confirmed_at/by
--               so the owner must re-approve any new value
--        - confirm_task_actual_hours(task_id, target_user_id)
--             • caller must be the task owner (user_id) OR an admin
--             • stamps confirmed_at = now() and confirmed_by = caller for
--               either the primary's top-level columns or the matching
--               co-assignee jsonb entry
--   2. Adds a BEFORE UPDATE trigger that hard-rejects any direct write to
--      actual_hours_confirmed_at / actual_hours_confirmed_by from anyone
--      who is not the owner or an admin, and any direct write to
--      personal_tasks.actual_hours from anyone who is not the primary
--      assignee or an admin. The RPCs above run as SECURITY DEFINER and
--      bypass the trigger by setting a per-transaction flag.

-- ── 1. Per-transaction bypass flag used by trusted RPCs ───────────────────
-- (We use a custom GUC. Triggers check it; only our SECURITY DEFINER RPCs
--  set it. Regular client UPDATEs cannot reach the protected fields.)

-- ── 2. Authz trigger ─────────────────────────────────────────────────────
create or replace function public._enforce_actual_hours_authz()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller     uuid := auth.uid();
  v_is_admin   boolean;
  v_is_owner   boolean := (new.user_id = v_caller);
  v_is_primary boolean := (new.assigned_to = v_caller);
  v_bypass     text;
begin
  -- Trusted RPCs set this flag for the duration of their statement.
  begin
    v_bypass := current_setting('pact.actual_hours_rpc', true);
  exception when others then
    v_bypass := null;
  end;
  if v_bypass = 'on' then
    return new;
  end if;

  v_is_admin := exists (
    select 1 from profiles
    where id = v_caller
      and lower(coalesce(role, '')) in ('admin','superadmin','super_admin')
  );

  -- Confirmation columns: owner or admin only.
  if (new.actual_hours_confirmed_at is distinct from old.actual_hours_confirmed_at
      or new.actual_hours_confirmed_by is distinct from old.actual_hours_confirmed_by)
     and not (v_is_owner or v_is_admin) then
    raise exception 'Only the task owner or an admin can confirm actual hours';
  end if;

  -- Primary actual_hours: primary assignee or admin only.
  if new.actual_hours is distinct from old.actual_hours
     and not (v_is_primary or v_is_admin) then
    raise exception 'Only the primary assignee or an admin can edit primary actual hours';
  end if;

  -- Auto-invalidate confirmation if actual_hours changed without explicit re-confirm.
  if new.actual_hours is distinct from old.actual_hours
     and old.actual_hours_confirmed_at is not null
     and new.actual_hours_confirmed_at is not distinct from old.actual_hours_confirmed_at then
    new.actual_hours_confirmed_at := null;
    new.actual_hours_confirmed_by := null;
  end if;

  -- ── Co-assignees JSONB: validate per-element diffs ─────────────────────
  -- Without this, a participant could bypass the owner-confirm rule by
  -- issuing a direct .update({ co_assignees: ... }) that stamps the
  -- confirmation fields inside their own jsonb entry, or could clobber
  -- another co-assignee's reported actual_hours.
  if new.co_assignees is distinct from old.co_assignees then
    declare
      v_uid          uuid;
      v_old_entry    jsonb;
      v_new_entry    jsonb;
      v_old_actual   text;
      v_new_actual   text;
      v_old_conf_at  text;
      v_new_conf_at  text;
      v_old_conf_by  text;
      v_new_conf_by  text;
      v_rebuilt      jsonb;
      v_changed      boolean := false;
    begin
      v_rebuilt := coalesce(new.co_assignees, '[]'::jsonb);

      for v_uid in (
        select distinct (c->>'id')::uuid
          from jsonb_array_elements(coalesce(old.co_assignees, '[]'::jsonb)) as c
         where (c->>'id') is not null
        union
        select distinct (c->>'id')::uuid
          from jsonb_array_elements(coalesce(new.co_assignees, '[]'::jsonb)) as c
         where (c->>'id') is not null
      ) loop
        v_old_entry := (
          select c
            from jsonb_array_elements(coalesce(old.co_assignees, '[]'::jsonb)) as c
           where (c->>'id')::uuid = v_uid
           limit 1
        );
        v_new_entry := (
          select c
            from jsonb_array_elements(coalesce(new.co_assignees, '[]'::jsonb)) as c
           where (c->>'id')::uuid = v_uid
           limit 1
        );

        -- Pure add / remove of a co-assignee is a membership change, not a
        -- field edit. Authorization for add/remove is enforced separately
        -- (see update_task_co_assignees RPC + RLS). Skip per-field checks.
        if v_old_entry is null or v_new_entry is null then
          continue;
        end if;

        v_old_actual  := coalesce(v_old_entry->>'actual_hours', '');
        v_new_actual  := coalesce(v_new_entry->>'actual_hours', '');
        v_old_conf_at := coalesce(v_old_entry->>'actual_hours_confirmed_at', '');
        v_new_conf_at := coalesce(v_new_entry->>'actual_hours_confirmed_at', '');
        v_old_conf_by := coalesce(v_old_entry->>'actual_hours_confirmed_by', '');
        v_new_conf_by := coalesce(v_new_entry->>'actual_hours_confirmed_by', '');

        -- Confirmation fields: owner or admin only.
        if (v_old_conf_at is distinct from v_new_conf_at
            or v_old_conf_by is distinct from v_new_conf_by)
           and not (v_is_owner or v_is_admin) then
          raise exception 'Only the task owner or an admin can confirm co-assignee hours';
        end if;

        -- actual_hours: only the co-assignee themself or an admin.
        if v_old_actual is distinct from v_new_actual
           and not (v_uid = v_caller or v_is_admin) then
          raise exception 'Only this co-assignee or an admin can edit their actual hours';
        end if;

        -- Auto-invalidate confirmation if actual_hours changed but confirmation
        -- fields were left untouched.
        if v_old_actual is distinct from v_new_actual
           and v_old_conf_at <> ''
           and v_old_conf_at is not distinct from v_new_conf_at then
          v_new_entry := (v_new_entry
                          - 'actual_hours_confirmed_at'
                          - 'actual_hours_confirmed_by');
          -- Patch the rebuilt array.
          v_rebuilt := (
            select coalesce(jsonb_agg(
              case when (c->>'id')::uuid = v_uid then v_new_entry else c end
            ), '[]'::jsonb)
            from jsonb_array_elements(v_rebuilt) as c
          );
          v_changed := true;
        end if;
      end loop;

      if v_changed then
        new.co_assignees := v_rebuilt;
      end if;
    end;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_personal_tasks_actual_hours_authz on public.personal_tasks;
create trigger trg_personal_tasks_actual_hours_authz
before update on public.personal_tasks
for each row execute function public._enforce_actual_hours_authz();

-- ── 3. set_task_actual_hours RPC ─────────────────────────────────────────
create or replace function public.set_task_actual_hours(
  p_task_id        uuid,
  p_target_user_id uuid,
  p_hours          numeric
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task     personal_tasks%rowtype;
  v_caller   uuid := auth.uid();
  v_is_admin boolean;
  v_is_co    boolean;
  v_new_co   jsonb;
begin
  if v_caller is null then
    raise exception 'not authenticated';
  end if;

  select * into v_task from personal_tasks where id = p_task_id for update;
  if not found then
    raise exception 'task % not found', p_task_id;
  end if;

  v_is_admin := exists (
    select 1 from profiles
    where id = v_caller
      and lower(coalesce(role, '')) in ('admin','superadmin','super_admin')
  );

  -- Caller must be the target person, or an admin acting on their behalf.
  if not (v_caller = p_target_user_id or v_is_admin) then
    raise exception 'not authorized to edit hours for another user';
  end if;

  -- Validate hours.
  if p_hours is not null and (p_hours < 0 or p_hours > 9999) then
    raise exception 'hours out of range';
  end if;

  perform set_config('pact.actual_hours_rpc', 'on', true);

  if p_target_user_id = v_task.assigned_to then
    -- Primary assignee path.
    update personal_tasks
       set actual_hours              = p_hours,
           actual_hours_confirmed_at = null,
           actual_hours_confirmed_by = null,
           updated_at                = now()
     where id = p_task_id;
  else
    -- Co-assignee path. Patch only the matching entry inside the jsonb array.
    v_is_co := exists (
      select 1
      from jsonb_array_elements(coalesce(v_task.co_assignees, '[]'::jsonb)) as c
      where (c->>'id')::uuid = p_target_user_id
    );
    if not v_is_co then
      raise exception 'user % is not a participant of task %', p_target_user_id, p_task_id;
    end if;

    select coalesce(jsonb_agg(
      case
        when (c->>'id')::uuid = p_target_user_id then
          (c
            - 'actual_hours_confirmed_at'
            - 'actual_hours_confirmed_by')
            || jsonb_build_object('actual_hours', to_jsonb(p_hours))
        else c
      end
    ), '[]'::jsonb)
    into v_new_co
    from jsonb_array_elements(coalesce(v_task.co_assignees, '[]'::jsonb)) as c;

    update personal_tasks
       set co_assignees = v_new_co,
           updated_at   = now()
     where id = p_task_id;
  end if;

  perform set_config('pact.actual_hours_rpc', 'off', true);
end;
$$;

grant execute on function public.set_task_actual_hours(uuid, uuid, numeric) to authenticated;

-- ── 4. confirm_task_actual_hours RPC ─────────────────────────────────────
create or replace function public.confirm_task_actual_hours(
  p_task_id        uuid,
  p_target_user_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task     personal_tasks%rowtype;
  v_caller   uuid := auth.uid();
  v_is_admin boolean;
  v_now      timestamptz := now();
  v_new_co   jsonb;
begin
  if v_caller is null then
    raise exception 'not authenticated';
  end if;

  select * into v_task from personal_tasks where id = p_task_id for update;
  if not found then
    raise exception 'task % not found', p_task_id;
  end if;

  v_is_admin := exists (
    select 1 from profiles
    where id = v_caller
      and lower(coalesce(role, '')) in ('admin','superadmin','super_admin')
  );

  -- Owner or admin only may confirm.
  if not (v_caller = v_task.user_id or v_is_admin) then
    raise exception 'only the task owner or an admin can confirm hours';
  end if;

  perform set_config('pact.actual_hours_rpc', 'on', true);

  if p_target_user_id = v_task.assigned_to then
    -- Refuse to confirm an empty value.
    if v_task.actual_hours is null or v_task.actual_hours <= 0 then
      raise exception 'cannot confirm: primary actual_hours is not set';
    end if;
    update personal_tasks
       set actual_hours_confirmed_at = v_now,
           actual_hours_confirmed_by = v_caller,
           updated_at                = now()
     where id = p_task_id;
  else
    -- Co-assignee: patch only the matching entry.
    if not exists (
      select 1
      from jsonb_array_elements(coalesce(v_task.co_assignees, '[]'::jsonb)) as c
      where (c->>'id')::uuid = p_target_user_id
        and (c->>'actual_hours') is not null
        and (c->>'actual_hours')::numeric > 0
    ) then
      raise exception 'cannot confirm: target has no reported actual_hours';
    end if;

    select coalesce(jsonb_agg(
      case
        when (c->>'id')::uuid = p_target_user_id then
          c || jsonb_build_object(
            'actual_hours_confirmed_at', to_jsonb(v_now),
            'actual_hours_confirmed_by', to_jsonb(v_caller)
          )
        else c
      end
    ), '[]'::jsonb)
    into v_new_co
    from jsonb_array_elements(coalesce(v_task.co_assignees, '[]'::jsonb)) as c;

    update personal_tasks
       set co_assignees = v_new_co,
           updated_at   = now()
     where id = p_task_id;
  end if;

  perform set_config('pact.actual_hours_rpc', 'off', true);
end;
$$;

grant execute on function public.confirm_task_actual_hours(uuid, uuid) to authenticated;
